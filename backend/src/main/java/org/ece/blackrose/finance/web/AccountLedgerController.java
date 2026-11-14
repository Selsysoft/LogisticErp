package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.BalanceGroupBy;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.TransactionKind;
import org.ece.blackrose.finance.service.AccountDocumentService;
import org.ece.blackrose.finance.service.AccountDocumentService.AccountDocumentQuery;
import org.ece.blackrose.finance.service.AccountService;
import org.ece.blackrose.finance.service.AccountTransactionQueryService;
import org.ece.blackrose.finance.service.AccountTransactionQueryService.AccountTransactionQuery;
import org.ece.blackrose.finance.service.AccountTransactionVoidService;
import org.ece.blackrose.finance.web.AccountDtos.AccountBalanceBreakdownResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentCancelRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentTypeResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionDetailResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionPageResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionVoidRequest;
import org.ece.blackrose.finance.web.AccountDtos.TransactionSourceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AccountTransactionResponse;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Faz 12.1 cari defter uçları (12.1 §4.3–§4.5): Borç/Alacak belgesi, çapraz hareket listesi,
 * hareket detayı/kaynağı, ZTO "Sil" yönlendiricisi, kırılımlı bakiye ve cari faturaları. Ekstre
 * {@link FinanceController}'dadır.
 */
@RestController
@RequestMapping("/api/v1/finance")
public class AccountLedgerController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String POST = "hasAuthority('FINANCE_PAYMENT_CREATE')";
  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

  private final AccountDocumentService documents;
  private final AccountTransactionQueryService queries;
  private final AccountTransactionVoidService voids;
  private final AccountService accounts;
  private final FinanceMapper mapper;

  public AccountLedgerController(
      AccountDocumentService documents,
      AccountTransactionQueryService queries,
      AccountTransactionVoidService voids,
      AccountService accounts,
      FinanceMapper mapper) {
    this.documents = documents;
    this.queries = queries;
    this.voids = voids;
    this.accounts = accounts;
    this.mapper = mapper;
  }

  // --- Belge türleri ve Borç/Alacak belgesi

  @GetMapping("/account-document-types")
  @PreAuthorize(VIEW)
  List<AccountDocumentTypeResponse> documentTypes(
      @RequestParam(required = false) AccountDocumentSide side) {
    return documents.types(side);
  }

  /** Aynı {@code Idempotency-Key} ile tekrar her durumda 201 ve aynı belge. */
  @PostMapping("/accounts/{id}/documents")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  AccountDocumentResponse createDocument(
      @PathVariable UUID id,
      @Valid @RequestBody AccountDocumentRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return documents.create(id, request, blankToNull(idempotencyKey));
  }

  @GetMapping("/accounts/{id}/documents")
  @PreAuthorize(VIEW)
  PageResponse<AccountDocumentResponse> listDocuments(
      @PathVariable UUID id,
      @RequestParam(required = false) AccountDocumentSide side,
      @RequestParam(required = false) String documentType,
      @RequestParam(required = false) Boolean reflected,
      @RequestParam(required = false) AccountDocumentStatus status,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      Pageable pageable) {
    return documents.list(
        id,
        new AccountDocumentQuery(
            side, documentType, reflected, status, from, to, companyId, branchIds),
        pageable);
  }

  @GetMapping("/account-documents/{id}")
  @PreAuthorize(VIEW)
  AccountDocumentResponse getDocument(@PathVariable UUID id) {
    return documents.get(id);
  }

  @PostMapping("/account-documents/{id}/cancel")
  @PreAuthorize(POST)
  AccountDocumentResponse cancelDocument(
      @PathVariable UUID id, @Valid @RequestBody AccountDocumentCancelRequest request) {
    return documents.cancel(id, request.date(), request.reason());
  }

  /** Revize = iptal + yeni belge; aynı anahtarla tekrar aynı yeni belgeyi döner. */
  @PostMapping("/account-documents/{id}/revise")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  AccountDocumentResponse reviseDocument(
      @PathVariable UUID id,
      @Valid @RequestBody AccountDocumentRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return documents.revise(id, request, blankToNull(idempotencyKey));
  }

  // --- Cari hareketleri

  /**
   * Çapraz liste (cari yokken {@code from}/{@code to} zorunlu, ≤ 366 gün) ya da tek cari listesi
   * (sınırsız). Sayfa boyutu en çok 500; arama ve sıralama istemcidedir.
   */
  @GetMapping("/account-transactions")
  @PreAuthorize(VIEW)
  AccountTransactionPageResponse listTransactions(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) List<AccountType> accountTypes,
      @RequestParam(required = false) List<String> subGroups,
      @RequestParam(required = false) List<TransactionKind> kinds,
      @RequestParam(defaultValue = "false") boolean facets,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "100") int size) {
    return queries.search(
        new AccountTransactionQuery(
            from,
            to,
            accountId,
            currency,
            companyId,
            branchIds,
            accountTypes,
            subGroups,
            kinds,
            facets),
        page,
        size);
  }

  @GetMapping("/accounts/transactions/{id}")
  @PreAuthorize(VIEW)
  AccountTransactionDetailResponse getTransaction(@PathVariable UUID id) {
    return queries.get(id);
  }

  @GetMapping("/accounts/transactions/{id}/source")
  @PreAuthorize(VIEW)
  TransactionSourceResponse transactionSource(@PathVariable UUID id) {
    return queries.source(id);
  }

  /** ZTO "Sil": hareket kaynağı üzerinden iptal edilir; oluşan ters kayıt döner. */
  @PostMapping("/accounts/transactions/{id}/void")
  @PreAuthorize(POST)
  AccountTransactionResponse voidTransaction(
      @PathVariable UUID id, @Valid @RequestBody AccountTransactionVoidRequest request) {
    return mapper.toResponse(voids.voidTransaction(id, request.date(), request.description()));
  }

  // --- Bakiye ve faturalar

  @GetMapping("/accounts/{id}/balances")
  @PreAuthorize(VIEW)
  AccountBalanceBreakdownResponse balances(
      @PathVariable UUID id,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) BalanceGroupBy groupBy,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
      @RequestParam(required = false) UUID rolloverId) {
    return accounts.breakdown(id, companyId, branchIds, groupBy, asOf, rolloverId);
  }

  @GetMapping("/accounts/{id}/invoices")
  @PreAuthorize(VIEW)
  List<AccountInvoiceRowResponse> invoices(
      @PathVariable UUID id,
      @RequestParam InvoiceDirection direction,
      @RequestParam(required = false) String documentType,
      @RequestParam(required = false) Boolean reflected,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId) {
    return accounts.invoices(id, direction, documentType, reflected, from, to, companyId);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
