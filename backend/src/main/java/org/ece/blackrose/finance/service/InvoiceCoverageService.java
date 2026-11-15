package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InvoiceCoverageRow;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceGapResponse;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Eksik fatura (12.2 §3.7, K-12.2-4): cari × şirket × para birimi × taraf için deftere yazılan
 * tutar ile fatura toplamının farkı. Fatura toplamı carinin kendi defter satırlarından taban
 * kaynağa bağlanarak bulunur (taşınan faturalı hareket yeni cariye düşer) ve defter tutarını
 * kullanır (tevkifatlı belgede net ödenecek); deftere yansıtılmayan fatura belgeleri net ödenecek
 * tutarlarıyla eklenir. Açılış bakiyesi ({@code OPENING}) hesaba girmez, açılış faturası fatura
 * sayılır.
 */
@Service
public class InvoiceCoverageService {

  /** ZTO toleransı ({@code transactionsLogic.invoiceGap}): fark 1 birimi aşmalıdır. */
  static final BigDecimal TOLERANCE = BigDecimal.ONE;

  /** Cari listesi eksik fatura satırı sınırı. */
  static final int LIST_LIMIT = 5000;

  /** Tek carinin satır sınırı (şirket × para birimi × taraf; pratikte birkaç satır). */
  private static final int ACCOUNT_LIMIT = 10_000;

  private final AccountTransactionRepository transactions;
  private final BranchScopeService scope;
  private final AccountAccess access;

  public InvoiceCoverageService(
      AccountTransactionRepository transactions, BranchScopeService scope, AccountAccess access) {
    this.transactions = transactions;
    this.scope = scope;
    this.access = access;
  }

  /**
   * Tek cari: şirket başına satırlar ve {@code companyId = null} konsolide satırı (verilen süzgeç
   * içinde); yalnız defter ya da fatura toplamı sıfırdan farklı olanlar. Cari görünürlüğü çağıranın
   * sorumluluğundadır.
   */
  @Transactional(readOnly = true)
  public List<AccountInvoiceGapResponse> coverage(
      UUID accountId, BranchFilter filter, LocalDate asOf) {
    return withConsolidated(
        transactions.invoiceCoverage(
            List.of(accountId), filter, true, null, false, asOf, true, ACCOUNT_LIMIT));
  }

  /**
   * Ödeme/tahsilat önizlemesi: ödemenin şirketi ve para birimi, verilen taraf; yalnız eksik ({@code
   * missing > 1}) satır. Kullanıcının kapsamıyla hesaplanır.
   */
  @Transactional(readOnly = true)
  public List<AccountInvoiceGapResponse> missingFor(
      UUID accountId, UUID companyId, String currency, InvoiceSide side) {
    return coverage(accountId, scope.filter(companyId, null), null).stream()
        .filter(
            gap ->
                companyId.equals(gap.companyId())
                    && gap.side() == side
                    && gap.currency().equals(currency)
                    && isMissing(gap))
        .toList();
  }

  /**
   * Cari listesi (§4.6 {@code GET /accounts/invoice-gaps}): görünür tüm cariler için yalnız {@code
   * missing > 1} satırları; şirket verilmezse konsolide satırlar. En çok {@value #LIST_LIMIT}
   * satır, fazlası 422 {@code RESULT_TOO_LARGE}. İzinsiz kullanıcıda personel carileri satır
   * üretmez.
   */
  @Transactional(readOnly = true)
  public List<AccountInvoiceGapResponse> listGaps(UUID companyId, InvoiceSide side) {
    BranchFilter filter = scope.filter(companyId, null);
    List<InvoiceCoverageRow> rows =
        transactions.invoiceCoverage(
            null,
            filter,
            companyId != null,
            side,
            true,
            null,
            access.employeeVisible(),
            LIST_LIMIT + 1);
    if (rows.size() > LIST_LIMIT) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "RESULT_TOO_LARGE",
          "Sonuç çok büyük; şirket ya da taraf seçerek daraltın.");
    }
    return rows.stream().map(InvoiceCoverageService::toResponse).toList();
  }

  /** Konsolide satırlardan tarafın fatura toplamları (yalnız sıfırdan farklı olanlar). */
  static List<CurrencyAmountResponse> invoiceTotals(
      List<AccountInvoiceGapResponse> rows, InvoiceSide side) {
    return rows.stream()
        .filter(
            row ->
                row.companyId() == null && row.side() == side && row.invoiceTotal().signum() != 0)
        .map(row -> new CurrencyAmountResponse(row.currency(), row.invoiceTotal()))
        .toList();
  }

  /**
   * Şirket başına satırlara konsolide ({@code companyId = null}) satırı ekler; defter ve fatura
   * toplamı ikisi de sıfır olan satırlar atılır. Sıra: cari, para birimi, taraf; konsolide önce.
   */
  static List<AccountInvoiceGapResponse> withConsolidated(List<InvoiceCoverageRow> rows) {
    Map<List<Object>, List<AccountInvoiceGapResponse>> byKey = new LinkedHashMap<>();
    for (InvoiceCoverageRow row : rows) {
      byKey
          .computeIfAbsent(
              Arrays.asList(row.getAccountId(), row.getCurrency(), row.getSide()),
              key -> new ArrayList<>())
          .add(toResponse(row));
    }
    List<AccountInvoiceGapResponse> result = new ArrayList<>();
    byKey.forEach(
        (key, lines) -> {
          BigDecimal ledger = BigDecimal.ZERO;
          BigDecimal invoice = BigDecimal.ZERO;
          for (AccountInvoiceGapResponse line : lines) {
            ledger = ledger.add(line.ledgerTotal());
            invoice = invoice.add(line.invoiceTotal());
          }
          AccountInvoiceGapResponse first = lines.get(0);
          result.add(gap(first.accountId(), first.side(), null, first.currency(), ledger, invoice));
          result.addAll(lines);
        });
    return result.stream()
        .filter(row -> row.ledgerTotal().signum() != 0 || row.invoiceTotal().signum() != 0)
        .toList();
  }

  /** Eksik fatura ({@code missing > 1}); {@code missing < −1} fatura fazlasıdır (uyarı değil). */
  static boolean isMissing(AccountInvoiceGapResponse gap) {
    return gap.missing().compareTo(TOLERANCE) > 0;
  }

  static AccountInvoiceGapResponse gap(
      UUID accountId,
      InvoiceSide side,
      UUID companyId,
      String currency,
      BigDecimal ledgerTotal,
      BigDecimal invoiceTotal) {
    return new AccountInvoiceGapResponse(
        accountId,
        side,
        companyId,
        currency,
        ledgerTotal,
        invoiceTotal,
        ledgerTotal.subtract(invoiceTotal));
  }

  private static AccountInvoiceGapResponse toResponse(InvoiceCoverageRow row) {
    return gap(
        row.getAccountId(),
        InvoiceSide.valueOf(row.getSide()),
        row.getCompanyId(),
        row.getCurrency(),
        row.getLedgerTotal(),
        row.getInvoiceTotal());
  }
}
