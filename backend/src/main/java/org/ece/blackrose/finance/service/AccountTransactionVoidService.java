package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.LedgerDetailRow;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * ZTO "Sil" yönlendiricisi (12.1 §3.8): hareket silinmez, kaynağına göre kendi modülünün iptali
 * çağrılır ve oluşan ters kayıt döner. Sefer, depo, araç ve çek kayıtları kendi modülünden iptal
 * edilir (409 + kaynak rotası); şirketler arası virmanın bacakları transfer merkezinden (12.2).
 */
@Service
public class AccountTransactionVoidService {

  private static final String DEFAULT_PREFIX = "ZTO ekranından silindi: ";

  private final AccountTransactionRepository transactions;
  private final AccountTransactionQueryService queries;
  private final AccountDocumentService documents;
  private final SettlementService settlements;
  private final AccountService accounts;
  private final PurchaseInvoiceService invoices;
  private final IntercompanyTransferRepository intercompanyTransfers;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public AccountTransactionVoidService(
      AccountTransactionRepository transactions,
      AccountTransactionQueryService queries,
      AccountDocumentService documents,
      SettlementService settlements,
      AccountService accounts,
      PurchaseInvoiceService invoices,
      IntercompanyTransferRepository intercompanyTransfers,
      TenantClock clock) {
    this.transactions = transactions;
    this.queries = queries;
    this.documents = documents;
    this.settlements = settlements;
    this.accounts = accounts;
    this.invoices = invoices;
    this.intercompanyTransfers = intercompanyTransfers;
    this.clock = clock;
  }

  /**
   * Hareketi kaynağı üzerinden iptal eder ve ters kaydı döner. Tarih boşsa bugün (ödeme/tahsilatta
   * {@code max(bugün, kayıt tarihi)}); açıklama boşsa "ZTO ekranından silindi: {tür}"; açıklama 500
   * karakteri aşmaz.
   */
  @Transactional
  public AccountTransaction voidTransaction(UUID id, LocalDate date, String description) {
    LedgerDetailRow row = queries.visibleRow(id);
    LocalDate effective = date == null ? clock.today() : date;
    String text =
        LedgerDescriptions.fit(
            description == null || description.isBlank()
                ? DEFAULT_PREFIX + kindLabel(row.getKind())
                : description.trim());
    if (LedgerService.SOURCE_REVERSAL.equals(row.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ALREADY_REVERSAL", "Ters hareket yeniden ters çevrilemez.");
    }
    if (Boolean.TRUE.equals(row.getReversed())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSACTION_ALREADY_REVERSED", "Bu hareket zaten iptal edilmiş.");
    }
    UUID sourceId = row.getSourceId();
    switch (row.getSourceType()) {
      case AccountDocumentService.SOURCE -> documents.cancel(sourceId, effective, text);
      case "SETTLEMENT" -> {
        // Şirketler arası virmanın bacağı yalnız virmandan iptal edilir (12.2 §3.9).
        intercompanyTransfers
            .findBySettlement(sourceId)
            .ifPresent(
                link -> {
                  throw new BusinessException(
                      HttpStatus.CONFLICT,
                      "TRANSACTION_SOURCE_MANAGED",
                      "Bu kayıt kendi modülünden iptal edilir.",
                      List.of(
                          "route="
                              + FundTransferService.route(link.getCode(), link.getTransferDate())));
                });
        // Tarihsiz silme ileri tarihli kayıtta iptal tarihi kuralına takılmasın (12.2a §3.5):
        // varsayılan max(bugün, kayıt tarihi); settlement'ın cari satırı kayıt tarihindedir.
        settlements.reverse(sourceId, date == null ? settlementDefault(row) : date, text);
      }
      case LedgerService.SOURCE_MANUAL, "OPENING", "OPENING_INVOICE" ->
          accounts.reverseManual(id, effective, text);
      case "PURCHASE_INVOICE" -> invoices.cancel(sourceId, effective);
      case "ACCOUNT_TRANSFER_OUT", "ACCOUNT_TRANSFER_IN" ->
          throw new BusinessException(
              HttpStatus.CONFLICT,
              "TRANSACTION_IS_TRANSFER",
              "Cari taşıma kaydı Geçmiş Taşımalar'dan geri alınır.");
      default -> {
        String route = AccountTransactionQueryService.sourceOf(row).route();
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "TRANSACTION_SOURCE_MANAGED",
            "Bu kayıt kendi modülünden iptal edilir.",
            route == null ? List.of() : List.of("route=" + route));
      }
    }
    return transactions
        .findBySourceTypeAndSourceId(LedgerService.SOURCE_REVERSAL, id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.CONFLICT,
                    "TRANSACTION_NOT_REVERSED",
                    "Hareket kaynağından iptal edilemedi."));
  }

  private LocalDate settlementDefault(LedgerDetailRow row) {
    LocalDate today = clock.today();
    LocalDate recorded = row.getTransactionDate();
    return recorded != null && recorded.isAfter(today) ? recorded : today;
  }

  static String kindLabel(String kind) {
    return switch (kind) {
      case "DEBT" -> "Borç";
      case "PAYMENT" -> "Ödeme";
      case "RECEIVABLE" -> "Alacak";
      case "COLLECTION" -> "Tahsilat";
      default -> kind;
    };
  }
}
