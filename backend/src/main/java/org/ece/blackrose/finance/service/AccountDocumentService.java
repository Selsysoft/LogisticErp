package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.AccountDocumentTax;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTaxRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentTaxRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentTaxResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentTypeResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Borç/Alacak Ekle belgesi (12.1 §3.4). Deftere yansıyan belgenin cari hareketini {@link
 * LedgerService} yazar (kaynak {@code ACCOUNT_DOCUMENT}); iptal ters kayıttır, düzeltme iptal +
 * yeni belgedir. Kapsam, pasif cari ve cari–şirket kimlik kuralı servis içindedir (create ve revise
 * aynı yoldan geçer). Denetim olayları kart geçmişine değil {@code ACCOUNT_DOCUMENT:<id>} hedefine
 * yazılır.
 */
@Service
public class AccountDocumentService {

  /** Defter kaynağı. */
  public static final String SOURCE = LedgerService.SOURCE_ACCOUNT_DOCUMENT;

  private static final String TARGET = "ACCOUNT_DOCUMENT:";
  private static final String IDEMPOTENCY_INDEX = "account_document_idempotency_uq";
  private static final String REVISE_REASON = "Revize";

  /** Belge ve taban sorgusu süzgeçleri; boş değer "tümü". */
  public record AccountDocumentQuery(
      AccountDocumentSide side,
      String documentType,
      Boolean reflected,
      AccountDocumentStatus status,
      LocalDate from,
      LocalDate to,
      UUID companyId,
      List<UUID> branchIds) {}

  private final AccountDocumentRepository documents;
  private final AccountDocumentTypeRepository types;
  private final AccountDocumentTaxRepository taxes;
  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final LedgerService ledger;
  private final AccountAccess access;
  private final CompanyIdentityRule identityRule;
  private final CompanyResolver companies;
  private final BranchScopeService scope;
  private final AuditService audit;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public AccountDocumentService(
      AccountDocumentRepository documents,
      AccountDocumentTypeRepository types,
      AccountDocumentTaxRepository taxes,
      AccountRepository accounts,
      AccountTransactionRepository transactions,
      LedgerService ledger,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      CompanyResolver companies,
      BranchScopeService scope,
      AuditService audit,
      TenantClock clock) {
    this.documents = documents;
    this.types = types;
    this.taxes = taxes;
    this.accounts = accounts;
    this.transactions = transactions;
    this.ledger = ledger;
    this.access = access;
    this.identityRule = identityRule;
    this.companies = companies;
    this.scope = scope;
    this.audit = audit;
    this.clock = clock;
  }

  /** Aktif belge türleri; seçilemeyenler (Kur Farkı) de döner, ön yüz göstermez. */
  @Transactional(readOnly = true)
  public List<AccountDocumentTypeResponse> types(AccountDocumentSide side) {
    return types.findAllByActiveTrueOrderBySideAscSortOrderAsc().stream()
        .filter(type -> side == null || type.getSide() == side)
        .map(
            type ->
                new AccountDocumentTypeResponse(
                    type.getSide(),
                    type.getCode(),
                    type.getName(),
                    type.getAudience(),
                    type.isInvoiceSection(),
                    type.isPenalty(),
                    type.isDefault(),
                    type.isSelectable(),
                    type.getSortOrder()))
        .toList();
  }

  /**
   * Yeni belge. Aynı {@code Idempotency-Key} aynı cari ve yönle tekrar gelirse ilk belge döner;
   * başka cari/yön için 422 {@code IDEMPOTENCY_KEY_REUSED}.
   */
  @Transactional
  public AccountDocumentResponse create(
      UUID accountId, AccountDocumentRequest request, String idempotencyKey) {
    if (idempotencyKey != null) {
      Optional<AccountDocument> existing = documents.findByIdempotencyKey(idempotencyKey);
      if (existing.isPresent()) {
        AccountDocument document = existing.get();
        requireAccess(document);
        if (!document.getAccountId().equals(accountId) || document.getSide() != request.side()) {
          throw keyReused();
        }
        return toResponse(document);
      }
    }
    return toResponse(insert(accountId, request, idempotencyKey, null));
  }

  /** İptal: ters kayıt (yansıyan belgede), belge silinmez. İptal edilmiş belgeye 409. */
  @Transactional
  public AccountDocumentResponse cancel(UUID id, LocalDate date, String reason) {
    AccountDocument document = lockVisible(id);
    cancelLocked(document, date == null ? clock.today() : date, reason);
    return toResponse(document);
  }

  /**
   * Düzeltme = iptal + yeni belge, tek işlemde. Önce istek anahtarı (ikinci tıklama aynı yeni
   * belgeyi alır), sonra eski belgenin kilidi; kilitten sonra anahtar yeniden okunur (eşzamanlı
   * aynı anahtarlı ikinci istek ilkinin belgesini görür). Cari eski belgeninkidir; yön değişmez.
   */
  @Transactional
  public AccountDocumentResponse revise(
      UUID id, AccountDocumentRequest request, String idempotencyKey) {
    Optional<AccountDocument> replay = revisionFor(id, idempotencyKey);
    if (replay.isPresent()) {
      return toResponse(replay.get());
    }
    AccountDocument previous = lockVisible(id);
    replay = revisionFor(id, idempotencyKey);
    if (replay.isPresent()) {
      return toResponse(replay.get());
    }
    if (previous.getSide() != request.side()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "DOCUMENT_SIDE_LOCKED", "Belgenin yönü değiştirilemez.");
    }
    // Kilit sırası taşımayla aynı: önce kart, sonra hareket satırları (ters kayıt) — kilitlenme
    // yok.
    access.lockShared(previous.getAccountId());
    cancelLocked(previous, clock.today(), REVISE_REASON);
    AccountDocument revised =
        insert(previous.getAccountId(), request, idempotencyKey, previous.getId());
    audit.record(AuditEvent.ACCOUNT_DOCUMENT_REVISED, TARGET + id, "revisedBy " + revised.getId());
    return toResponse(revised);
  }

  @Transactional(readOnly = true)
  public PageResponse<AccountDocumentResponse> list(
      UUID accountId, AccountDocumentQuery query, Pageable pageable) {
    Account account = access.readable(accountId);
    BranchFilter filter = scope.filter(query.companyId(), query.branchIds());
    Map<String, String> names = typeNames();
    return PageResponse.from(
        documents.search(
            accountId,
            query.side(),
            blankToNull(query.documentType()),
            query.reflected(),
            query.status(),
            query.from(),
            query.to(),
            filter,
            pageable),
        document -> toResponse(document, account, names));
  }

  @Transactional(readOnly = true)
  public AccountDocumentResponse get(UUID id) {
    AccountDocument document = documents.findById(id).orElseThrow(AccountDocumentService::notFound);
    requireAccess(document);
    return toResponse(document);
  }

  /** Hareket detayında belge (cari ve kapsam çağıranda denetlenmiştir). Silinmiş belge için boş. */
  @Transactional(readOnly = true)
  public Optional<AccountDocumentResponse> find(UUID id) {
    return documents.findById(id).map(this::toResponse);
  }

  // --- yazım

  private AccountDocument insert(
      UUID accountId, AccountDocumentRequest request, String idempotencyKey, UUID revisedFrom) {
    // Kart FOR SHARE: şirket bağlamasıyla yarışta kimlik kuralı son durumu görür (SEC-12.1-04).
    Account account = access.usableLocked(accountId);
    scope.requireNew(request.branchId());
    UUID companyId = companies.companyOf(request.branchId());
    // Yansıtılmayan belge de grup carisine ya da başka şirkete bağlı karta açılamaz (F10).
    identityRule.require(account, companyId);
    AccountDocumentType type = requireType(request, account.getType());
    BigDecimal gross = request.amount();
    if (gross == null || gross.signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    // Fatura dışı tür her zaman deftere yansır (ZTO); vergi bölümü yok sayılır.
    boolean reflect = !type.isInvoiceSection() || !Boolean.FALSE.equals(request.reflectToLedger());
    BigDecimal ledgerAmount =
        type.isInvoiceSection() ? computeTax(null, gross, request.tax()).getNetPayable() : gross;
    if (reflect && ledgerAmount.signum() <= 0) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "AMOUNT_INVALID", "Net tutar sıfırdan büyük olmalıdır.");
    }
    String description = blankToNull(request.description());
    String documentNo = request.documentNo().trim();
    AccountDocument document =
        new AccountDocument(
            accountId,
            request.branchId(),
            companyId,
            request.side(),
            type.getCode(),
            documentNo,
            request.documentDate(),
            request.dueDate(),
            new Money(gross, request.currency()),
            request.exchangeRate(),
            request.paymentMethod(),
            description,
            reflect,
            reflect ? ledgerAmount : null,
            idempotencyKey);
    if (revisedFrom != null) {
      document.markRevisionOf(revisedFrom);
    }
    save(document);
    if (type.isInvoiceSection()) {
      taxes.save(computeTax(document.getId(), gross, request.tax()));
    }
    if (reflect) {
      ledger.post(
          new Posting(
              accountId,
              request.branchId(),
              document.ledgerDirection(),
              new Money(ledgerAmount, request.currency()),
              request.documentDate(),
              LedgerDescriptions.fit(
                  description != null ? description : type.getName() + " " + documentNo),
              SOURCE,
              document.getId(),
              request.exchangeRate()));
    }
    audit.record(
        AuditEvent.ACCOUNT_DOCUMENT_CREATED,
        TARGET + document.getId(),
        accountId + " " + request.side() + " " + type.getCode() + " " + documentNo);
    return document;
  }

  /** Eşzamanlı aynı anahtarlı iki oluşturmadan ikincisi 409 {@code IDEMPOTENCY_IN_PROGRESS}. */
  private void save(AccountDocument document) {
    try {
      documents.saveAndFlush(document);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(IDEMPOTENCY_INDEX)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "IDEMPOTENCY_IN_PROGRESS",
            "İstek işleniyor; lütfen tekrar deneyin.");
      }
      throw ex;
    }
  }

  private void cancelLocked(AccountDocument document, LocalDate date, String reason) {
    String cleanReason = blankToNull(reason);
    document.cancel(date, cleanReason);
    if (document.isReflectToLedger()) {
      ledger.reverseSource(
          SOURCE,
          document.getId(),
          date,
          LedgerDescriptions.fit(
              "Belge iptali: "
                  + typeName(document)
                  + " "
                  + document.getDocumentNo()
                  + (cleanReason == null ? "" : " — " + cleanReason)));
    }
    audit.record(
        AuditEvent.ACCOUNT_DOCUMENT_CANCELLED,
        TARGET + document.getId(),
        document.getAccountId()
            + " "
            + document.getDocumentType()
            + " "
            + document.getDocumentNo());
  }

  private AccountDocumentType requireType(AccountDocumentRequest request, AccountType accountType) {
    return types
        .findById(new AccountDocumentType.Key(request.side(), request.documentType()))
        .filter(AccountDocumentType::isActive)
        .filter(AccountDocumentType::isSelectable)
        .filter(type -> type.allowedFor(accountType))
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "DOCUMENT_TYPE_INVALID",
                    "Belge türü bu cari ve işlem için geçerli değil."));
  }

  private static AccountDocumentTax computeTax(
      UUID documentId, BigDecimal gross, AccountDocumentTaxRequest tax) {
    return tax == null
        ? AccountDocumentTax.compute(documentId, gross, null, null, null, null)
        : AccountDocumentTax.compute(
            documentId,
            gross,
            tax.discountRate(),
            tax.vatRate(),
            tax.withholdingAmount(),
            tax.otherTaxesAmount());
  }

  // --- erişim

  /** Kilitli belge: cari okunabilir (personel carisi izinsize 404) ve iş yeri kapsamda. */
  private AccountDocument lockVisible(UUID id) {
    AccountDocument document =
        documents.findForUpdate(id).orElseThrow(AccountDocumentService::notFound);
    requireAccess(document);
    return document;
  }

  /** Belgenin carisi okunabilir olmalı (yoksa 404 belge yok) ve iş yeri kapsamda (403). */
  private void requireAccess(AccountDocument document) {
    Account account =
        accounts.findById(document.getAccountId()).orElseThrow(AccountDocumentService::notFound);
    if (account.getType() == AccountType.EMPLOYEE && !access.employeeVisible()) {
      throw notFound();
    }
    scope.requireVisible(document.getBranchId());
  }

  /** Bu anahtarla bu belgenin revizesi yapılmış mı; anahtar başka kayda aitse 422. */
  private Optional<AccountDocument> revisionFor(UUID id, String idempotencyKey) {
    if (idempotencyKey == null) {
      return Optional.empty();
    }
    Optional<AccountDocument> existing = documents.findByIdempotencyKey(idempotencyKey);
    if (existing.isEmpty()) {
      return Optional.empty();
    }
    requireAccess(existing.get());
    if (!id.equals(existing.get().getRevisedFromId())) {
      throw keyReused();
    }
    return existing;
  }

  // --- yanıt

  private AccountDocumentResponse toResponse(AccountDocument document) {
    Account account = accounts.findById(document.getAccountId()).orElse(null);
    return toResponse(document, account, typeNames());
  }

  private AccountDocumentResponse toResponse(
      AccountDocument document, Account account, Map<String, String> names) {
    AccountDocumentTaxResponse tax =
        taxes
            .findById(document.getId())
            .map(
                t ->
                    new AccountDocumentTaxResponse(
                        t.getGrossAmount(),
                        t.getDiscountRate(),
                        t.getDiscountAmount(),
                        t.getNetExclVat(),
                        t.getVatRate(),
                        t.getVatAmount(),
                        t.getTotalInclVat(),
                        t.getWithholdingAmount(),
                        t.getOtherTaxesAmount(),
                        t.getNetPayable()))
            .orElse(null);
    UUID transactionId =
        transactions
            .findBySourceTypeAndSourceId(SOURCE, document.getId())
            .map(AccountTransaction::getId)
            .orElse(null);
    UUID revisedById =
        documents
            .findFirstByRevisedFromId(document.getId())
            .map(AccountDocument::getId)
            .orElse(null);
    return new AccountDocumentResponse(
        document.getId(),
        document.getAccountId(),
        account == null ? null : account.getCode(),
        account == null ? null : account.getName(),
        document.getBranchId(),
        document.getCompanyId(),
        document.getSide(),
        document.getDocumentType(),
        names.getOrDefault(
            key(document.getSide(), document.getDocumentType()), document.getDocumentType()),
        document.getDocumentNo(),
        document.getDocumentDate(),
        document.getDueDate(),
        document.getAmount(),
        document.getCurrency(),
        document.getExchangeRate(),
        document.getPaymentMethod(),
        document.getDescription(),
        document.isReflectToLedger(),
        document.getLedgerAmount(),
        document.getStatus(),
        document.getCancelDate(),
        document.getCancelReason(),
        document.getRevisedFromId(),
        revisedById,
        transactionId,
        tax,
        document.getCreatedBy(),
        document.getCreatedAt(),
        document.getUpdatedBy(),
        document.getUpdatedAt());
  }

  private String typeName(AccountDocument document) {
    return types
        .findById(new AccountDocumentType.Key(document.getSide(), document.getDocumentType()))
        .map(AccountDocumentType::getName)
        .orElse(document.getDocumentType());
  }

  private Map<String, String> typeNames() {
    return types.findAll().stream()
        .collect(
            Collectors.toMap(
                type -> key(type.getSide(), type.getCode()),
                AccountDocumentType::getName,
                (a, b) -> a,
                HashMap::new));
  }

  private static String key(AccountDocumentSide side, String code) {
    return side + ":" + code;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static BusinessException keyReused() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "IDEMPOTENCY_KEY_REUSED",
        "Bu istek anahtarı başka bir kayıt için kullanılmış.");
  }

  static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "DOCUMENT_NOT_FOUND", "Belge bulunamadı.");
  }
}
