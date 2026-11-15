package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementWarningCode;
import org.ece.blackrose.finance.domain.FinanceTypes.WarningSeverity;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.KindBalanceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.web.FinanceDtos.CompanyOutstandingResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementWarningResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Şirket dağılımı uyarısı (12.2 §3.6, K-12.2-3, MX7 §1 kural tarafı). Ödeme, carinin ödeyen
 * şirketteki bakiyesini (şirketin cariye borcu) aşıyorsa onay ister ({@code CONFIRM}); tahsilatta
 * aynı hesap yalnız bilgidir ({@code INFO}). Karar konsolide, tüm iş yerlerinin gerçek bakiyesiyle
 * verilir; yanıtta gösterilen tutarlar kullanıcının kapsamındaki iş yerlerinden hesaplanır, kapsam
 * dışı kısım yalnız bayrakla bildirilir (SEC-12.2-02).
 */
@Service
public class SettlementWarningService {

  /** Uyarı eşiği: aşım en az bir kuruş olmalıdır. */
  static final BigDecimal THRESHOLD = new BigDecimal("0.01");

  private static final String GROUP_BY_COMPANY = "COMPANY";

  private final AccountTransactionRepository transactions;
  private final BranchScopeService scope;
  private final SettlementRepository settlements;

  public SettlementWarningService(
      AccountTransactionRepository transactions,
      BranchScopeService scope,
      SettlementRepository settlements) {
    this.transactions = transactions;
    this.scope = scope;
    this.settlements = settlements;
  }

  /** Şirket başına, tek para birimindeki borç/alacak toplamı. */
  record CompanyBalance(BigDecimal debit, BigDecimal credit) {}

  /**
   * Uyarılar (en çok bir). Cari yoksa (doğrudan gider) boş liste. {@code companyId} ödemenin
   * şirketidir (iş yerinden).
   */
  public List<SettlementWarningResponse> check(
      SettlementType type, SettlementRequest request, UUID companyId) {
    return check(type, request, companyId, null);
  }

  /**
   * Düzeltme önizlemesi (12.2a §3.4): {@code excluded} aynı cariye aynı para biriminde POSTED
   * ödemeyse ve cari satırı taşınmamışsa (Rev 1 F-2), şirket bakiyesinde eski ödeme geri alınmış
   * gibi borcu {@code excluded.amount} kadar azaltılır; kapsam dışı iş yerindeki kayıt yalnız karar
   * bakiyesinde düşülür.
   */
  public List<SettlementWarningResponse> check(
      SettlementType type, SettlementRequest request, UUID companyId, Settlement excluded) {
    if (request.accountId() == null) {
      return List.of();
    }
    String currency = request.money().currency();
    Map<UUID, CompanyBalance> full =
        balances(request.accountId(), currency, BranchFilter.all(null));
    boolean limited = scope.limited();
    Map<UUID, CompanyBalance> shown =
        limited ? balances(request.accountId(), currency, scope.filter(null, null)) : full;
    if (excludes(excluded, request)) {
      BigDecimal amount = excluded.getMoney().amount();
      full = withoutPayment(full, excluded.getCompanyId(), amount);
      if (!limited) {
        shown = full;
      } else if (scope.allowedOrNull().contains(excluded.getBranchId())) {
        shown = withoutPayment(shown, excluded.getCompanyId(), amount);
      }
    }
    return evaluate(type, companyId, request.money(), full, shown).map(List::of).orElse(List.of());
  }

  private boolean excludes(Settlement excluded, SettlementRequest request) {
    return excluded != null
        && excluded.getType() == SettlementType.PAYMENT
        && excluded.getStatus() == SettlementStatus.POSTED
        && excluded.getAccountId() != null
        && excluded.getAccountId().equals(request.accountId())
        && excluded.getMoney().currency().equals(request.money().currency())
        && !settlements.isTransferred(excluded.getId());
  }

  /** Şirketin borç (DEBIT) toplamından ödeme tutarını düşer; kopya döner. */
  static Map<UUID, CompanyBalance> withoutPayment(
      Map<UUID, CompanyBalance> balances, UUID companyId, BigDecimal amount) {
    Map<UUID, CompanyBalance> copy = new HashMap<>(balances);
    CompanyBalance current =
        copy.getOrDefault(companyId, new CompanyBalance(BigDecimal.ZERO, BigDecimal.ZERO));
    copy.put(companyId, new CompanyBalance(current.debit().subtract(amount), current.credit()));
    return copy;
  }

  private Map<UUID, CompanyBalance> balances(UUID accountId, String currency, BranchFilter filter) {
    Map<UUID, CompanyBalance> result = new HashMap<>();
    for (KindBalanceRow row :
        transactions.kindBalances(List.of(accountId), GROUP_BY_COMPANY, null, null, filter)) {
      if (currency.equals(row.getCurrency()) && row.getCompanyId() != null) {
        result.merge(
            row.getCompanyId(),
            new CompanyBalance(row.getDebit(), row.getCredit()),
            (a, b) -> new CompanyBalance(a.debit().add(b.debit()), a.credit().add(b.credit())));
      }
    }
    return result;
  }

  /**
   * Saf karar. {@code full}: tüm iş yerlerinin şirket bakiyeleri (karar); {@code shown}:
   * kullanıcının kapsamındaki şirket bakiyeleri (gösterilen tutarlar; ALL kullanıcıda {@code full}
   * ile aynı).
   */
  static Optional<SettlementWarningResponse> evaluate(
      SettlementType type,
      UUID companyId,
      Money money,
      Map<UUID, CompanyBalance> full,
      Map<UUID, CompanyBalance> shown) {
    BigDecimal amount = money.amount();
    BigDecimal actual = outstanding(type, full.get(companyId));
    if (amount.subtract(actual).compareTo(THRESHOLD) < 0) {
      return Optional.empty();
    }
    BigDecimal displayed = outstanding(type, shown.get(companyId));
    List<CompanyOutstandingResponse> others = new ArrayList<>();
    Map<UUID, BigDecimal> seen = new HashMap<>();
    shown.forEach(
        (company, balance) -> {
          BigDecimal value = outstanding(type, balance);
          if (!company.equals(companyId) && value.signum() > 0) {
            others.add(new CompanyOutstandingResponse(company, value));
            seen.put(company, value);
          }
        });
    others.sort(Comparator.comparing(other -> other.companyId().toString()));
    boolean hidden =
        full.entrySet().stream()
            .filter(entry -> !entry.getKey().equals(companyId))
            .anyMatch(
                entry ->
                    outstanding(type, entry.getValue())
                            .compareTo(seen.getOrDefault(entry.getKey(), BigDecimal.ZERO))
                        > 0);
    return Optional.of(
        new SettlementWarningResponse(
            SettlementWarningCode.COMPANY_ALLOCATION_EXCEEDED,
            type == SettlementType.PAYMENT ? WarningSeverity.CONFIRM : WarningSeverity.INFO,
            money.currency(),
            companyId,
            displayed,
            amount,
            amount.subtract(displayed).max(BigDecimal.ZERO),
            List.copyOf(others),
            actual.compareTo(displayed) != 0,
            hidden));
  }

  /**
   * Ödemede şirketin cariye borcu {@code max(0, alacak − borç)} (CREDIT = bizim borcumuz);
   * tahsilatta carinin şirkete borcu {@code max(0, borç − alacak)}.
   */
  static BigDecimal outstanding(SettlementType type, CompanyBalance balance) {
    if (balance == null) {
      return BigDecimal.ZERO;
    }
    BigDecimal net =
        type == SettlementType.PAYMENT
            ? balance.credit().subtract(balance.debit())
            : balance.debit().subtract(balance.credit());
    return net.max(BigDecimal.ZERO);
  }

  /** Onay gerektiren ilk uyarı. */
  static Optional<SettlementWarningResponse> confirmation(
      List<SettlementWarningResponse> warnings) {
    return warnings.stream()
        .filter(warning -> warning.severity() == WarningSeverity.CONFIRM)
        .findFirst();
  }

  /**
   * 409 {@code CONFIRMATION_REQUIRED}; {@code details} yalnız kullanıcının kapsamındaki tutarları
   * taşır (gizli tutar yok, SEC-12.2-02).
   */
  static BusinessException confirmationRequired(SettlementWarningResponse warning) {
    String message =
        "Bu ödeme, carinin seçilen şirketteki borcunu aşıyor; onaylayarak devam edebilirsiniz.";
    if (warning.partialScope()) {
      message += " Yetkili olmadığınız iş yerlerindeki bakiye nedeniyle onay gerekiyor.";
    }
    return new BusinessException(
        HttpStatus.CONFLICT, "CONFIRMATION_REQUIRED", message, details(warning));
  }

  static List<String> details(SettlementWarningResponse warning) {
    List<String> details = new ArrayList<>();
    details.add("warning=" + warning.code());
    details.add("currency=" + warning.currency());
    details.add("companyId=" + warning.companyId());
    details.add("companyOutstanding=" + plain(warning.companyOutstanding()));
    details.add("amount=" + plain(warning.amount()));
    details.add("excess=" + plain(warning.excess()));
    warning
        .others()
        .forEach(
            other -> details.add("other." + other.companyId() + "=" + plain(other.outstanding())));
    details.add("partialScope=" + warning.partialScope());
    details.add("otherHiddenExists=" + warning.otherHiddenExists());
    return details;
  }

  /** Denetim ayrıntısı (yalnız gösterilen tutarlar). */
  static String auditDetails(SettlementWarningResponse warning) {
    return "currency="
        + warning.currency()
        + ";companyOutstanding="
        + plain(warning.companyOutstanding())
        + ";amount="
        + plain(warning.amount());
  }

  static String plain(BigDecimal value) {
    return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
  }
}
