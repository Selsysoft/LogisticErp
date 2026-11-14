package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountingType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.service.FundQueryService;
import org.ece.blackrose.finance.service.FundQueryService.FundTransactionSearch;
import org.ece.blackrose.finance.service.FundService;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FundDtos.FundActiveRequest;
import org.ece.blackrose.finance.web.FundDtos.FundActivityReportResponse;
import org.ece.blackrose.finance.web.FundDtos.FundCanDeleteResponse;
import org.ece.blackrose.finance.web.FundDtos.FundDetailResponse;
import org.ece.blackrose.finance.web.FundDtos.FundSparklineResponse;
import org.ece.blackrose.finance.web.FundDtos.FundSummaryRowResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionDetailResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionPageResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionRowResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Banka/kasa sorguları, aktiflik ve hareket merkezi (12.2_TASARIM §4.1–§4.2). Hesap CRUD'u, liste,
 * manuel hareket ve ekstre {@link FinanceController}'da kalır.
 */
@RestController
@RequestMapping("/api/v1/finance/funds")
public class FundController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final FundQueryService queries;
  private final FundService funds;

  public FundController(FundQueryService queries, FundService funds) {
    this.queries = queries;
    this.funds = funds;
  }

  /** Şirket × tür × hesap türü × para birimi özeti (ZTO kartları, şirket bazlı toplamlar). */
  @GetMapping("/summary")
  @PreAuthorize(VIEW)
  List<FundSummaryRowResponse> summary(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) FundKind kind,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate asOf) {
    return queries.summary(companyId, kind, asOf);
  }

  /** En çok 200 hesap (400 {@code TOO_MANY_IDS}); kapsam dışı kimlik atlanır. */
  @GetMapping("/sparklines")
  @PreAuthorize(VIEW)
  List<FundSparklineResponse> sparklines(@RequestParam(required = false) List<UUID> ids) {
    return queries.sparklines(ids);
  }

  /**
   * Çok hesaplı hareket araması. {@code size} 1–500 (400 {@code PAGE_SIZE_INVALID}); {@code from}
   * yalnız tek {@code fundId} ile boş olabilir (o zaman {@code size} ≤ 50), aralık ≤ 366 gün.
   * {@code sort} yalnız {@code transactionDate,desc} (varsayılan) ya da {@code asc}.
   */
  @GetMapping("/transactions")
  @PreAuthorize(VIEW)
  FundTransactionPageResponse transactions(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) FundKind kind,
      @RequestParam(name = "fundId", required = false) List<UUID> fundIds,
      @RequestParam(name = "branchId", required = false) List<UUID> branchIds,
      @RequestParam(required = false) FundAccountType accountType,
      @RequestParam(required = false) FundDirection direction,
      @RequestParam(name = "accountingType", required = false)
          List<FundAccountingType> accountingTypes,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "false") boolean summary,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size,
      @RequestParam(defaultValue = "transactionDate,desc") String sort) {
    return queries.transactions(
        new FundTransactionSearch(
            companyId,
            kind,
            fundIds,
            branchIds,
            accountType,
            direction,
            accountingTypes,
            currency,
            from,
            to,
            q,
            summary,
            ascending(sort)),
        page,
        size);
  }

  /** Aynı süzgeçle sayfasız liste (CSV); en çok 10.000 satır (422 {@code RESULT_TOO_LARGE}). */
  @GetMapping("/transactions/export")
  @PreAuthorize(VIEW)
  List<FundTransactionRowResponse> exportTransactions(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) FundKind kind,
      @RequestParam(name = "fundId", required = false) List<UUID> fundIds,
      @RequestParam(name = "branchId", required = false) List<UUID> branchIds,
      @RequestParam(required = false) FundAccountType accountType,
      @RequestParam(required = false) FundDirection direction,
      @RequestParam(name = "accountingType", required = false)
          List<FundAccountingType> accountingTypes,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "transactionDate,desc") String sort) {
    return queries.export(
        new FundTransactionSearch(
            companyId,
            kind,
            fundIds,
            branchIds,
            accountType,
            direction,
            accountingTypes,
            currency,
            from,
            to,
            q,
            false,
            ascending(sort)));
  }

  @GetMapping("/transactions/{id}")
  @PreAuthorize(VIEW)
  FundTransactionDetailResponse transaction(@PathVariable UUID id) {
    return queries.transaction(id);
  }

  /** Tekil hesap; hesap no yalnız {@code FINANCE_MANAGE} yetkisinde düz. */
  @GetMapping("/{id}")
  @PreAuthorize(VIEW)
  FundDetailResponse get(
      @PathVariable UUID id,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate asOf) {
    return queries.get(id, asOf);
  }

  @GetMapping("/{id}/can-delete")
  @PreAuthorize(VIEW)
  FundCanDeleteResponse canDelete(@PathVariable UUID id) {
    return queries.canDelete(id);
  }

  @PatchMapping("/{id}/active")
  @PreAuthorize(MANAGE)
  FundResponse setActive(@PathVariable UUID id, @Valid @RequestBody FundActiveRequest request) {
    return funds.setActive(id, request.active());
  }

  /** FIFO faaliyet raporu; aralık ≤ 366 gün, hareket ≤ 10.000. */
  @GetMapping("/{id}/activity-report")
  @PreAuthorize(VIEW)
  FundActivityReportResponse activity(
      @PathVariable UUID id,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return queries.activity(id, from, to);
  }

  private static boolean ascending(String sort) {
    return sort != null && sort.trim().toLowerCase(java.util.Locale.ROOT).endsWith(",asc");
  }
}
