package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingBasis;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingType;
import org.ece.blackrose.finance.service.FinanceReportService;
import org.ece.blackrose.finance.service.FxDifferenceService;
import org.ece.blackrose.finance.service.FxDifferenceService.FxReportQuery;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AgingResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.AccountMethodTotalResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.AccountPerformanceRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.CashFlowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.CurrencyPositionRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxCutState;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceReportResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceRequest;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerAccountsResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerSummaryResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Faz 12.8 finans raporu uçları (12.8_TASARIM §3.1, §4.2): okuma {@code /finance/reports/*}
 * (FINANCE_VIEW; LIMITED kullanıcıya kendi kapsamında açık, OK-12.8-17), kur farkı kesimi {@code
 * /finance/fx-differences} (FINANCE_PAYMENT_CREATE). Kapsam tamamen servistedir; kontrolcü yalnız
 * bağlar. {@code /reports/daily} {@link FinanceController}'dadır; yaşlandırma v2 ({@code
 * /reports/aging}, geriye uyumlu) buradadır.
 */
@RestController
@RequestMapping("/api/v1/finance")
@Validated
public class FinanceReportController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String POST = "hasAuthority('FINANCE_PAYMENT_CREATE')";
  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

  private final FxDifferenceService fxDifferences;
  private final FinanceReportService reports;

  public FinanceReportController(FxDifferenceService fxDifferences, FinanceReportService reports) {
    this.fxDifferences = fxDifferences;
    this.reports = reports;
  }

  // --- raporlar (12.8 §3.4)

  /**
   * Yaşlandırma v2 (geriye uyumlu): {@code basis} varsayılan TRANSACTION; {@code
   * excludeIntercompany} yalnız konsolidede (companyId boş) uygulanır.
   */
  @GetMapping("/reports/aging")
  @PreAuthorize(VIEW)
  List<AgingResponse> aging(
      @RequestParam AgingType type,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(defaultValue = "true") boolean excludeIntercompany,
      @RequestParam(defaultValue = "TRANSACTION") AgingBasis basis,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) List<String> subGroups,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.aging(
        type, asOf, companyId, excludeIntercompany, basis, accountId, subGroups, branchIds);
  }

  /** FinanceReport genel bakış ({@code to} boşsa bugün; kapanış bakiyesi). */
  @GetMapping("/reports/ledger-summary")
  @PreAuthorize(VIEW)
  LedgerSummaryResponse ledgerSummary(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.ledgerSummary(from, to, currency, companyId, branchIds);
  }

  /** FinanceReport liste kipi (cari × şirket × para birimi). */
  @GetMapping("/reports/ledger-accounts")
  @PreAuthorize(VIEW)
  LedgerAccountsResponse ledgerAccounts(
      @RequestParam String reportType,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.ledgerAccounts(reportType, from, to, currency, accountId, companyId, branchIds);
  }

  /** Cari ekstre ödeme/tahsilat yöntem kırılımı. */
  @GetMapping("/reports/account-methods")
  @PreAuthorize(VIEW)
  List<AccountMethodTotalResponse> accountMethods(
      @RequestParam UUID accountId,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.accountMethods(accountId, from, to, companyId, branchIds);
  }

  /** Finansal bilanço ({@code asOf} boşsa bugün). */
  @GetMapping("/reports/balance-sheet")
  @PreAuthorize(VIEW)
  BalanceSheetResponse balanceSheet(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.balanceSheet(asOf, companyId, branchIds);
  }

  /** Hızlı Bakiye Özeti (hazine). */
  @GetMapping("/reports/treasury")
  @PreAuthorize(VIEW)
  TreasuryResponse treasury(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.treasury(companyId, branchIds);
  }

  /** Haftalık nakit akışı ({@code weeks} 1–26; {@code currency} boşsa TL karşılığı). */
  @GetMapping("/reports/cash-flow")
  @PreAuthorize(VIEW)
  CashFlowResponse cashFlow(
      @RequestParam(defaultValue = "8") int weeks,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.cashFlow(weeks, currency, companyId, branchIds);
  }

  /** Cari bazlı ödeme performansı (dönem en çok 5 yıl). */
  @GetMapping("/reports/account-performance")
  @PreAuthorize(VIEW)
  List<AccountPerformanceRowResponse> accountPerformance(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) List<String> subGroups,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return reports.accountPerformance(from, to, accountId, subGroups, companyId, branchIds);
  }

  /** Döviz pozisyonu (LIMITED'e kendi kapsamında açık; {@code byCompany} şirket kırılımı). */
  @GetMapping("/reports/currency-position")
  @PreAuthorize(VIEW)
  List<CurrencyPositionRowResponse> currencyPosition(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(defaultValue = "false") boolean byCompany) {
    return reports.currencyPosition(companyId, branchIds, byCompany);
  }

  // --- kur farkı (12.8 §3.2)

  /**
   * Kur farkı raporu. {@code withRates = false} (ZTO açılışı) kur alanlarını boş döner; {@code
   * valuationDate} boşsa bugün. Sayfa 0–100000, boyut ≥ 1 (2000 üstü kırpılır; aksi 400 {@code
   * PAGE_INVALID}).
   */
  @GetMapping("/reports/fx-differences")
  @PreAuthorize(VIEW)
  FxDifferenceReportResponse fxDifferences(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "ALL") FxCutState cutState,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate valuationDate,
      @RequestParam(defaultValue = "false") boolean withRates,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "2000") int size) {
    return fxDifferences.report(
        new FxReportQuery(
            companyId,
            branchIds,
            accountId,
            currency,
            from,
            to,
            cutState,
            valuationDate,
            withRates),
        page,
        size);
  }

  /**
   * Kullanıcı onaylı kur farkı kesimi (Y8). Aynı {@code Idempotency-Key} ve aynı kaynakla tekrar
   * 201 ve aynı belge.
   */
  @PostMapping("/fx-differences")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  AccountDocumentResponse cutFxDifference(
      @Valid @RequestBody FxDifferenceRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return fxDifferences.cut(request, blankToNull(idempotencyKey));
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
