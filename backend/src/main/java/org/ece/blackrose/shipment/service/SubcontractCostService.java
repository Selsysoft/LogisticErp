package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.CompanyIdentityRule;
import org.ece.blackrose.finance.service.ExchangeRateService;
import org.ece.blackrose.finance.service.LedgerService;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TransportMode;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TripCostStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.SubcontractQueryRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.SubcontractRow;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.ReverseCostRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveSubcontractCostRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractCarrierDetailResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractCarrierRowResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractCostRowResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractCurrencyAmountResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractLedgerRefResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SubcontractSummaryResponse;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sevk Nakliye Masrafları (12.7 §3.3, §3.4): taşeron etabının gideri ZTO ekranından kaydedilince
 * hemen cariye yazılır (Y6). Yazılmış satır değişmez: düzeltme ters kayıt + yeni satır, silme ters
 * kayıttır; yazılmamış (OPEN) satır silinir. Cari hareketini yalnız {@link LedgerService} yazar;
 * kaynak {@code TRIP_COST}/{@code trip_cost.id}. Kilit sırası: sefer → gider → cari hareketi.
 */
@Service
public class SubcontractCostService {

  static final String SOURCE = "TRIP_COST";
  static final int DEFAULT_DAYS = 150;
  static final int MAX_DAYS = 365;

  private final ShipmentService shipments;
  private final ShipmentLegRepository legs;
  private final TripCostRepository costs;
  private final SubcontractQueryRepository queries;
  private final AccountRepository accounts;
  private final AccountDocumentTypeRepository documentTypes;
  private final CompanyResolver companies;
  private final CompanyIdentityRule identityRule;
  private final BranchScopeService scope;
  private final ExchangeRateService rates;
  private final LedgerService ledger;
  private final AuditService audit;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public SubcontractCostService(
      ShipmentService shipments,
      ShipmentLegRepository legs,
      TripCostRepository costs,
      SubcontractQueryRepository queries,
      AccountRepository accounts,
      AccountDocumentTypeRepository documentTypes,
      CompanyResolver companies,
      CompanyIdentityRule identityRule,
      BranchScopeService scope,
      ExchangeRateService rates,
      LedgerService ledger,
      AuditService audit,
      TenantClock clock) {
    this.shipments = shipments;
    this.legs = legs;
    this.costs = costs;
    this.queries = queries;
    this.accounts = accounts;
    this.documentTypes = documentTypes;
    this.companies = companies;
    this.identityRule = identityRule;
    this.scope = scope;
    this.rates = rates;
    this.ledger = ledger;
    this.audit = audit;
    this.clock = clock;
  }

  // --- yazım

  /** Kaydet + cariye işle (§3.3.1). Aynı değerlerle tekrar çağrı bir şey yazmaz. */
  @Transactional
  public SubcontractCostRowResponse save(
      UUID shipmentId, UUID legId, SaveSubcontractCostRequest r) {
    Shipment shipment = shipments.lock(shipmentId);
    if (shipment.getStatus() == ShipmentStatus.CANCELLED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "SHIPMENT_CANCELLED", "İptal edilmiş sefere gider girilemez.");
    }
    ShipmentLeg leg =
        legs.findById(legId)
            .filter(l -> l.getShipmentId().equals(shipmentId))
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "LEG_NOT_FOUND", "Etap bulunamadı."));
    UUID carrier = leg.getCarrierAccountId();
    if (carrier == null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "LEG_NOT_SUBCONTRACTED", "Etap taşerona verilmemiş.");
    }
    Account account =
        accounts
            .findById(carrier)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
    identityRule.require(account, companies.companyOf(shipment.getBranchId()));
    validate(r);

    List<TripCost> active = costs.findByLegIdAndKindOrderByCreatedAt(legId, CostKind.SUBCONTRACTOR);
    if (active.size() > 1) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "COST_DUPLICATE",
          "Bu etapta birden çok taşeron gideri var; sefer ekranından düzeltin.");
    }
    TripCost existing = active.isEmpty() ? null : active.get(0);
    if (existing != null && !carrier.equals(existing.getAccountId())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CARRIER_MISMATCH", "Gider etabın taşeronuna ait değil.");
    }
    String description =
        hasText(r.description())
            ? r.description().strip()
            : existing != null
                ? existing.getDescription()
                : "Etap " + leg.getSequenceNo() + " taşeron";

    TripCost target;
    if (existing != null && existing.getStatus() == TripCostStatus.POSTED) {
      if (existing.sameSubcontract(
          r.money(),
          r.vatAmount(),
          r.withholdingAmount(),
          r.deductionAmount(),
          r.documentNo(),
          r.documentType(),
          r.costDate(),
          r.exchangeRate(),
          description)) {
        changeTransportMode(leg, r.transportMode());
        legs.flush();
        return row(existing.getLegId(), existing.getId());
      }
      requireNoOpenPlan(existing.getId());
      ledger.reverseSource(
          SOURCE, existing.getId(), r.costDate(), "Düzeltme: " + shipment.getNumber());
      target = newCost(shipment, leg, r, description);
      existing.reverse(r.costDate(), "Düzeltme", target.getId());
      audit.record(
          AuditEvent.TRIP_COST_REVERSED,
          SOURCE + ":" + existing.getId(),
          "replacedBy=" + target.getId());
    } else if (existing != null) {
      var conversion = rates.convert(r.money(), r.costDate(), r.exchangeRate());
      existing.updateSubcontract(
          r.money(),
          conversion.tlAmount(),
          r.vatAmount(),
          r.withholdingAmount(),
          r.deductionAmount(),
          blankToNull(r.documentNo()),
          blankToNull(r.documentType()),
          r.costDate(),
          r.exchangeRate() != null ? r.exchangeRate() : conversion.rate(),
          description);
      target = existing;
    } else {
      target = newCost(shipment, leg, r, description);
    }
    post(shipment, target);
    changeTransportMode(leg, r.transportMode());
    costs.flush();
    return row(target.getLegId(), target.getId());
  }

  /** Yazılmış taşeron giderini ters çevirir (§3.3.2); ters çevrilmişse bir şey yapmaz. */
  @Transactional
  public void reverse(UUID costId, ReverseCostRequest request) {
    TripCost cost = lockCost(costId);
    if (cost.getStatus() == TripCostStatus.REVERSED) {
      return;
    }
    if (cost.isDeleted()) {
      throw costNotFound();
    }
    if (cost.getStatus() == TripCostStatus.OPEN) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "COST_NOT_POSTED",
          "Cariye işlenmemiş gider ters çevrilmez; silinir.");
    }
    requireNoOpenPlan(cost.getId());
    ledger.reverseSource(SOURCE, cost.getId(), request.date(), "İptal: " + request.reason());
    cost.reverse(request.date(), request.reason(), null);
    audit.record(AuditEvent.TRIP_COST_REVERSED, SOURCE + ":" + cost.getId(), "reversed");
  }

  /** Cariye işlenmemiş (OPEN) taşeron giderini siler (§3.3.2a); defter etkisi yoktur. */
  @Transactional
  public void remove(UUID costId) {
    TripCost cost = lockCost(costId);
    if (cost.getStatus() == TripCostStatus.REVERSED || cost.isDeleted()) {
      return;
    }
    if (cost.isPosted() || cost.getPostedAt() != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COST_POSTED", "Cariye işlenmiş gider silinemez; ters kayıt yapın.");
    }
    cost.markDeleted();
    audit.record(AuditEvent.TRIP_COST_REVERSED, SOURCE + ":" + cost.getId(), "deleted-open");
  }

  // --- okuma

  /** STI: taşeron firma özeti (§3.4). */
  @Transactional(readOnly = true)
  public SubcontractSummaryResponse summary(
      Integer days, UUID companyId, Collection<UUID> branchIds) {
    List<SubcontractRow> rows = rows(days, companyId, branchIds, null);
    Map<UUID, List<SubcontractRow>> byCarrier = new LinkedHashMap<>();
    rows.stream()
        .sorted(
            (a, b) -> {
              int byName =
                  String.CASE_INSENSITIVE_ORDER.compare(a.getCarrierName(), b.getCarrierName());
              return byName != 0
                  ? byName
                  : a.getCarrierAccountId().compareTo(b.getCarrierAccountId());
            })
        .forEach(
            row ->
                byCarrier
                    .computeIfAbsent(row.getCarrierAccountId(), k -> new ArrayList<>())
                    .add(row));
    List<SubcontractCarrierRowResponse> carriers = new ArrayList<>();
    for (List<SubcontractRow> group : byCarrier.values()) {
      SubcontractRow first = group.get(0);
      Set<String> companyNames = new TreeSet<>();
      group.stream()
          .map(SubcontractRow::getCompanyName)
          .filter(SubcontractCostService::hasText)
          .forEach(companyNames::add);
      carriers.add(
          new SubcontractCarrierRowResponse(
              first.getCarrierAccountId(),
              first.getCarrierName(),
              first.getCarrierCode(),
              companyNames.isEmpty() ? null : String.join(", ", companyNames),
              first.getCarrierPhone(),
              first.getCarrierCity(),
              first.getCarrierDistrict(),
              legCount(group),
              totals(group, SubcontractRow::getAmount),
              totals(group, SubcontractCostService::payable)));
    }
    return new SubcontractSummaryResponse(
        carriers, carriers.size(), legCount(rows), totals(rows, SubcontractRow::getAmount));
  }

  /** CSD: bir taşeronun etapları ve giderleri (§3.4). */
  @Transactional(readOnly = true)
  public SubcontractCarrierDetailResponse detail(
      UUID carrierAccountId, Integer days, UUID companyId, Collection<UUID> branchIds) {
    Account account =
        accounts
            .findById(carrierAccountId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
    List<SubcontractRow> rows = rows(days, companyId, branchIds, carrierAccountId);
    return new SubcontractCarrierDetailResponse(
        account.getId(),
        account.getName(),
        account.getCode(),
        rows.stream().map(this::toResponse).toList(),
        totals(rows, SubcontractRow::getAmount),
        totals(rows, SubcontractCostService::payable));
  }

  // --- yardımcılar

  private List<SubcontractRow> rows(
      Integer days, UUID companyId, Collection<UUID> branchIds, UUID carrierId) {
    int window = days == null ? DEFAULT_DAYS : days;
    if (window < 1 || window > MAX_DAYS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DAYS_INVALID", "Gün sayısı 1 ile 365 arasında olmalıdır.");
    }
    BranchFilter filter = scope.filter(companyId, branchIds);
    Instant since = clock.startOf(clock.today().minusDays(window));
    return queries.rows(since, filter, carrierId, null);
  }

  /** Kaydedilen satırın yanıtı (kapsam süzgeci yok: sefer zaten kilitlenip denetlendi). */
  private SubcontractCostRowResponse row(UUID legId, UUID costId) {
    return queries.rows(Instant.EPOCH, BranchFilter.all(null), null, legId).stream()
        .filter(row -> costId.equals(row.getCostId()))
        .findFirst()
        .map(this::toResponse)
        .orElseThrow(SubcontractCostService::costNotFound);
  }

  private SubcontractCostRowResponse toResponse(SubcontractRow row) {
    boolean hasCost = row.getCostId() != null;
    return new SubcontractCostRowResponse(
        row.getShipmentId(),
        row.getShipmentNumber(),
        row.getLegId(),
        row.getLegSequenceNo(),
        ShipmentStatus.valueOf(row.getShipmentStatus()),
        row.getCustomerName(),
        row.getCargoDescription(),
        row.getFreightInvoiceNumber(),
        null,
        null,
        null,
        row.getBranchId(),
        row.getBranchName(),
        row.getPlannedStart() == null ? null : clock.dateOf(row.getPlannedStart()),
        row.getTransportMode() == null
            ? TransportMode.ROAD
            : TransportMode.valueOf(row.getTransportMode()),
        row.getCarrierAccountId(),
        row.getCarrierName(),
        row.getCostId(),
        hasCost ? TripCostStatus.valueOf(row.getCostStatus()) : null,
        hasCost ? new Money(row.getAmount(), row.getCurrency()) : null,
        hasCost ? row.getVatAmount() : null,
        hasCost ? row.getWithholdingAmount() : null,
        hasCost ? row.getDeductionAmount() : null,
        hasCost ? row.getAmount().add(row.getVatAmount()) : null,
        hasCost ? payable(row) : null,
        hasCost ? BigDecimal.ZERO : null,
        row.getDocumentNo(),
        row.getDocumentType(),
        row.getCostDate(),
        row.getExchangeRate(),
        row.getDescription(),
        row.getPostedAt(),
        row.getTransactionId() == null
            ? null
            : new SubcontractLedgerRefResponse(
                row.getTransactionId(), row.getTransactionDate(), row.getTransactionDescription()));
  }

  private static BigDecimal payable(SubcontractRow row) {
    return row.getAmount() == null
        ? null
        : row.getAmount()
            .add(row.getVatAmount())
            .subtract(row.getWithholdingAmount())
            .subtract(row.getDeductionAmount());
  }

  private static long legCount(List<SubcontractRow> rows) {
    Set<UUID> ids = new LinkedHashSet<>();
    rows.forEach(row -> ids.add(row.getLegId()));
    return ids.size();
  }

  /** Para birimi başına toplam (maliyetsiz satırlar sayılmaz), para birimi sırasıyla. */
  private static List<SubcontractCurrencyAmountResponse> totals(
      List<SubcontractRow> rows, Function<SubcontractRow, BigDecimal> value) {
    Map<String, BigDecimal> sums = new TreeMap<>();
    for (SubcontractRow row : rows) {
      if (row.getCostId() != null) {
        sums.merge(row.getCurrency(), value.apply(row), BigDecimal::add);
      }
    }
    return sums.entrySet().stream()
        .map(e -> new SubcontractCurrencyAmountResponse(e.getKey(), e.getValue()))
        .toList();
  }

  private TripCost newCost(
      Shipment shipment, ShipmentLeg leg, SaveSubcontractCostRequest r, String description) {
    var conversion = rates.convert(r.money(), r.costDate(), r.exchangeRate());
    TripCost cost =
        new TripCost(
            shipment.getId(),
            leg.getId(),
            CostKind.SUBCONTRACTOR,
            leg.getCarrierAccountId(),
            null,
            r.money(),
            conversion.tlAmount(),
            description);
    cost.updateSubcontract(
        r.money(),
        conversion.tlAmount(),
        r.vatAmount(),
        r.withholdingAmount(),
        r.deductionAmount(),
        blankToNull(r.documentNo()),
        blankToNull(r.documentType()),
        r.costDate(),
        r.exchangeRate() != null ? r.exchangeRate() : conversion.rate(),
        description);
    return costs.saveAndFlush(cost);
  }

  /** Ödenecek tutarı cariye alacak olarak yazar ve satırı POSTED yapar. */
  private void post(Shipment shipment, TripCost cost) {
    Money payable = new Money(cost.payable(), cost.getMoney().currency());
    String description =
        shipment.getNumber()
            + " taşeron nakliye"
            + (cost.getDocumentNo() != null ? " " + cost.getDocumentNo() : "");
    ledger.post(
        new Posting(
            cost.getAccountId(),
            shipment.getBranchId(),
            Direction.CREDIT,
            payable,
            cost.getCostDate(),
            description,
            SOURCE,
            cost.getId(),
            cost.getExchangeRate()));
    cost.markPosted(Instant.now());
    audit.record(
        AuditEvent.TRIP_COST_POSTED,
        SOURCE + ":" + cost.getId(),
        "payable=" + payable.amount().toPlainString() + payable.currency());
  }

  private void validate(SaveSubcontractCostRequest r) {
    if (r.money() == null || r.money().amount().signum() <= 0) {
      throw amountInvalid();
    }
    BigDecimal vat = orZero(r.vatAmount());
    BigDecimal withholding = orZero(r.withholdingAmount());
    BigDecimal deduction = orZero(r.deductionAmount());
    if (vat.signum() < 0 || withholding.signum() < 0 || deduction.signum() < 0) {
      throw amountInvalid();
    }
    if (withholding.compareTo(vat) > 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "WITHHOLDING_EXCEEDS_VAT", "Tevkifat KDV'yi aşamaz.");
    }
    if (r.money().amount().add(vat).subtract(withholding).subtract(deduction).signum() <= 0) {
      throw amountInvalid();
    }
    if (r.costDate() == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "COST_DATE_REQUIRED", "Belge tarihi zorunludur.");
    }
    if (hasText(r.documentType())) {
      boolean valid =
          documentTypes
              .findById(
                  new AccountDocumentType.Key(
                      AccountDocumentSide.PAYABLE, r.documentType().strip()))
              .filter(t -> t.isSelectable() && t.isActive() && !t.isPenalty())
              .isPresent();
      if (!valid) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "DOCUMENT_TYPE_INVALID", "Belge türü geçersiz.");
      }
    }
  }

  private void requireNoOpenPlan(UUID costId) {
    if (queries.existsOpenPlanForTripCost(costId)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "COST_PLAN_OPEN",
          "Bu gidere bağlı açık ödeme planı var; önce planı iptal edin.");
    }
  }

  /** Önce sefer, sonra gider kilitlenir; gider sefer kilidinden sonra yeniden okunur. */
  private TripCost lockCost(UUID costId) {
    UUID shipmentId =
        queries.shipmentIdOf(costId).orElseThrow(SubcontractCostService::costNotFound);
    shipments.lock(shipmentId);
    TripCost cost = costs.lockById(costId).orElseThrow(SubcontractCostService::costNotFound);
    if (cost.getKind() != CostKind.SUBCONTRACTOR) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "COST_NOT_REVERSIBLE",
          "Yalnız taşeron gideri bu ekrandan iptal edilir.");
    }
    return cost;
  }

  private static void changeTransportMode(ShipmentLeg leg, TransportMode mode) {
    if (mode != null) {
      leg.changeTransportMode(mode);
    }
  }

  private static BusinessException costNotFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "COST_NOT_FOUND", "Gider bulunamadı.");
  }

  private static BusinessException amountInvalid() {
    return new BusinessException(
        HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }

  private static String blankToNull(String value) {
    return hasText(value) ? value.strip() : null;
  }
}
