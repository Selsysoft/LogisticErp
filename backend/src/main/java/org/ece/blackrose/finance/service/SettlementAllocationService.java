package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.domain.SettlementAllocation;
import org.ece.blackrose.finance.repository.FinanceRepositories.AllocatedTotalRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.AllocationTargetRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementAllocationRepository;
import org.ece.blackrose.finance.web.FinanceDtos.AllocationRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Ödeme/tahsilatın açık fatura kalemleriyle bilgi amaçlı eşleştirmesi (12.2a §3.3, 04 §6.2-Y5).
 * Defteri, yaşlandırmayı ve eksik fatura hesabını değiştirmez; satırlar değişmez, geçerlilik
 * sorguda türetilir (S-3). Doğrulama hedefleri danışma kilidiyle kimlik sırasıyla kilitler; çağıran
 * cari ve fon kilitlerini daha önce almıştır (§3.11: cari → fon → settlement → hedef).
 */
@Service
public class SettlementAllocationService {

  /** Settlement hariç tutulmadığında sorguya giden yer tutucu (hiçbir kayda eşit değil). */
  static final UUID NO_SETTLEMENT = new UUID(0, 0);

  private final SettlementAllocationRepository allocations;
  private final BranchScopeService scope;

  public SettlementAllocationService(
      SettlementAllocationRepository allocations, BranchScopeService scope) {
    this.allocations = allocations;
    this.scope = scope;
  }

  /** Hedefin ham alanları ({@link AllocationTargetRow}'un saf kopyası). */
  record Target(
      AllocationTargetType type,
      UUID id,
      UUID accountId,
      UUID companyId,
      UUID branchId,
      String currency,
      InvoiceSide side,
      boolean open,
      boolean invoiceType,
      boolean reflected,
      BigDecimal ledgerAmount,
      BigDecimal netPayable,
      BigDecimal amount) {

    static Target of(AllocationTargetRow row) {
      return new Target(
          AllocationTargetType.valueOf(row.getTargetType()),
          row.getId(),
          row.getAccountId(),
          row.getCompanyId(),
          row.getBranchId(),
          row.getCurrency(),
          InvoiceSide.valueOf(row.getSide()),
          Boolean.TRUE.equals(row.getOpen()),
          Boolean.TRUE.equals(row.getInvoiceType()),
          Boolean.TRUE.equals(row.getReflected()),
          row.getLedgerAmount(),
          row.getNetPayable(),
          row.getAmount());
    }
  }

  /** Hedef ret nedeni ({@code details.reason}). */
  enum Reason {
    NOT_FOUND,
    CLOSED,
    SIDE,
    ACCOUNT,
    COMPANY,
    CURRENCY
  }

  /**
   * Kayıttan önce doğrulama (§3.3 adım 1–7). {@code excludedSettlementId}: düzeltmede eski kayıt
   * (eşleşmeleri serbest sayılır); yoksa {@code null}.
   */
  public void validate(
      SettlementType type, SettlementRequest request, UUID companyId, UUID excludedSettlementId) {
    List<AllocationRequest> lines = request.allocations();
    if (lines == null || lines.isEmpty()) {
      return;
    }
    if (request.accountId() == null) {
      // §3.12 kataloğu ve §6.2 test planı 422 der (§3.3 adım 2'deki "400" yazım hatası).
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "ALLOCATION_TARGET_INVALID",
          "Gider ödemesi faturayla eşleştirilemez.");
    }
    Set<String> seen = new HashSet<>();
    for (AllocationRequest line : lines) {
      if (!seen.add(line.targetType() + ":" + line.targetId())) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST,
            "ALLOCATION_DUPLICATE_TARGET",
            "Aynı fatura birden fazla eşleştirilemez.",
            List.of("targetId=" + line.targetId()));
      }
    }
    List<UUID> ids = lockOrder(lines.stream().map(AllocationRequest::targetId).toList());
    ids.forEach(id -> allocations.lockTarget(id.toString()));

    Map<String, Target> targets = new HashMap<>();
    for (AllocationTargetRow row : allocations.targets(ids)) {
      Target target = Target.of(row);
      targets.put(target.type() + ":" + target.id(), target);
    }
    Map<UUID, BigDecimal> allocated = new HashMap<>();
    for (AllocatedTotalRow row :
        allocations.allocatedTotals(
            ids, excludedSettlementId == null ? NO_SETTLEMENT : excludedSettlementId)) {
      allocated.merge(row.getTargetId(), row.getAllocated(), BigDecimal::add);
    }

    Money money = request.money();
    BigDecimal sum = BigDecimal.ZERO;
    for (AllocationRequest line : lines) {
      Target target = targets.get(line.targetType() + ":" + line.targetId());
      if (target != null) {
        scope.requireVisible(target.branchId());
      }
      Optional<Reason> reason =
          rejection(type, target, request.accountId(), companyId, money.currency());
      if (reason.isPresent()) {
        throw targetInvalid(line.targetId(), reason.get());
      }
      sum = sum.add(line.amount());
    }
    if (sum.compareTo(money.amount()) > 0) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "ALLOCATION_EXCEEDS_SETTLEMENT",
          type == SettlementType.PAYMENT
              ? "Toplam tahsis tutarı ödeme tutarını aşıyor."
              : "Toplam tahsis tutarı tahsilat tutarını aşıyor.",
          List.of("max=" + plain(money.amount())));
    }
    for (AllocationRequest line : lines) {
      Target target = targets.get(line.targetType() + ":" + line.targetId());
      BigDecimal remaining =
          remaining(total(target), allocated.getOrDefault(target.id(), BigDecimal.ZERO));
      if (line.amount().compareTo(remaining) > 0) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "ALLOCATION_EXCEEDS_REMAINING",
            "Faturanın kalan tutarı aşıldı.",
            List.of("targetId=" + line.targetId(), "remaining=" + plain(remaining)));
      }
    }
  }

  /**
   * Doğrulanmış eşleşmeleri yeni kayda yazar (settlement ile aynı işlem). Para birimi kaydınkidir.
   */
  public void save(Settlement settlement, List<AllocationRequest> lines) {
    if (lines == null || lines.isEmpty()) {
      return;
    }
    List<SettlementAllocation> rows = new ArrayList<>();
    for (AllocationRequest line : lines) {
      rows.add(
          SettlementAllocation.of(
              settlement.getId(),
              settlement.getCompanyId(),
              line.targetType(),
              line.targetId(),
              new Money(line.amount(), settlement.getMoney().currency())));
    }
    allocations.saveAll(rows);
  }

  // --- saf kurallar (SettlementAllocationRulesTest)

  /** Ödeme borç (PAYABLE) belgelerine, tahsilat alacak (RECEIVABLE) belgelerine eşleşir. */
  static InvoiceSide requiredSide(SettlementType type) {
    return type == SettlementType.PAYMENT ? InvoiceSide.PAYABLE : InvoiceSide.RECEIVABLE;
  }

  /** Hedef türü settlement türüyle eşleşebilir mi (§3.3 tür × taraf tablosu). */
  static boolean accepts(SettlementType type, AllocationTargetType target) {
    return switch (target) {
      case PURCHASE_INVOICE -> type == SettlementType.PAYMENT;
      case FREIGHT_INVOICE, WAREHOUSE_INVOICE -> type == SettlementType.COLLECTION;
      case OPENING_INVOICE, ACCOUNT_DOCUMENT -> true;
    };
  }

  /** Ret nedeni; hedef geçerliyse boş. Sıra: yok → tür/taraf → kapalı → cari → şirket → para. */
  static Optional<Reason> rejection(
      SettlementType type, Target target, UUID accountId, UUID companyId, String currency) {
    if (target == null || !target.invoiceType()) {
      return Optional.of(Reason.NOT_FOUND);
    }
    if (!accepts(type, target.type()) || target.side() != requiredSide(type)) {
      return Optional.of(Reason.SIDE);
    }
    if (!target.open()) {
      return Optional.of(Reason.CLOSED);
    }
    if (!target.accountId().equals(accountId)) {
      return Optional.of(Reason.ACCOUNT);
    }
    if (!target.companyId().equals(companyId)) {
      return Optional.of(Reason.COMPANY);
    }
    if (!target.currency().equals(currency)) {
      return Optional.of(Reason.CURRENCY);
    }
    return Optional.empty();
  }

  /**
   * Eşleşebilir toplam: faturalarda toplam tutar; cari belgesinde deftere yansıyorsa defter tutarı,
   * değilse vergi bölümünün ödenecek tutarı ya da belge tutarı.
   */
  static BigDecimal total(Target target) {
    if (target.reflected()) {
      return target.ledgerAmount();
    }
    return target.netPayable() != null ? target.netPayable() : target.amount();
  }

  /** {@code max(0, toplam − eşleşen)}. */
  static BigDecimal remaining(BigDecimal total, BigDecimal allocated) {
    return total.subtract(allocated).max(BigDecimal.ZERO);
  }

  /** Danışma kilitlerinin sırası: tekil kimlikler artan sırada (kilitlenme döngüsü olmasın). */
  static List<UUID> lockOrder(Collection<UUID> ids) {
    return ids.stream().distinct().sorted().toList();
  }

  static String plain(BigDecimal value) {
    return value.stripTrailingZeros().toPlainString();
  }

  private static BusinessException targetInvalid(UUID targetId, Reason reason) {
    String message =
        switch (reason) {
          case NOT_FOUND -> "Eşleştirilecek fatura bulunamadı.";
          case CLOSED -> "Bu fatura için tahsis edilebilecek tutar kalmadı.";
          case SIDE -> "Bu belge bu işlem türüyle eşleştirilemez.";
          case ACCOUNT -> "Fatura seçilen cariye ait değil.";
          case COMPANY -> "Fatura kaydın şirketine ait değil.";
          case CURRENCY -> "Bu faturanın para birimi seçilen işlemin para birimi ile aynı değil.";
        };
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "ALLOCATION_TARGET_INVALID",
        message,
        List.of("targetId=" + targetId, "reason=" + reason));
  }
}
