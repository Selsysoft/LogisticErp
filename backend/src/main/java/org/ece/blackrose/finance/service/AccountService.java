package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.TaxNumbers;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.Account.AccountProfile;
import org.ece.blackrose.finance.domain.AccountCompanyLimit;
import org.ece.blackrose.finance.domain.AccountGroup;
import org.ece.blackrose.finance.domain.AccountRollover;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingType;
import org.ece.blackrose.finance.domain.FinanceTypes.BalanceGroupBy;
import org.ece.blackrose.finance.domain.FinanceTypes.DateBasis;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountCompanyLimitRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountGroupRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountRolloverRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountInvoiceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CurrencyAmountRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.KindBalanceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PlanSummaryRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.StatementRow;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.AccountDtos.AccountBalanceBreakdownResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountCompanyLimitResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountGroupResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountHistoryResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceGapResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountLimitRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountPlanSummaryResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountProfileRequest;
import org.ece.blackrose.finance.web.AccountDtos.BalanceBreakdownRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.ece.blackrose.finance.web.AccountDtos.ProfileBankAccountRequest;
import org.ece.blackrose.finance.web.AccountDtos.SaveBankAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.AccountResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AgingResponse;
import org.ece.blackrose.finance.web.FinanceDtos.BalanceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ManualAccountTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.StatementLine;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.repository.IdentityRepositories.AuditLogRepository;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.security.PersonalDataProtector.TaxIdentity;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cari kartı (12.1 §3.2): liste, detay, ZTO profili, kod üretimi, aktiflik, limitler, değişiklik
 * geçmişi; elle hareket ve ekstre. Personel carisi görünürlüğü, pasif cari ve kart yazım kapsamı
 * {@link AccountAccess}'tedir.
 */
@Service
public class AccountService {

  /** Kart listesi süzgeçleri; boş liste "hepsi" demektir. */
  public record AccountListQuery(
      String search,
      UUID companyId,
      List<AccountType> types,
      List<String> subGroups,
      Boolean active,
      List<UUID> branchIds,
      BalanceGroupBy balanceGroupBy,
      boolean includePlanSummary) {}

  /**
   * Ekstre süzgeçleri (12.1 §3.6). {@code currency} boşsa tüm para birimleri; {@code dateBasis}
   * boşsa işlem tarihi.
   */
  public record StatementQuery(
      String currency,
      LocalDate from,
      LocalDate to,
      UUID companyId,
      List<UUID> branchIds,
      DateBasis dateBasis) {}

  /** Ekstre sayfa boyutu üst sınırı. */
  public static final int STATEMENT_PAGE_MAX = 2000;

  /** Cari fatura listesi satır sınırı (sayfasız). */
  static final int INVOICE_LIMIT = 1000;

  private static final LocalDate MIN_DATE = LocalDate.of(1, 1, 1);
  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

  /** ZTO: Malzeme/İlaç tedarikçisi karşılığı gruplarda vergi numarası zorunlu (CA:3859). */
  private static final Set<String> TAX_REQUIRED_GROUPS = Set.of("YEDEK_PARCA_SERVIS", "AKARYAKIT");

  static final int CODE_ATTEMPTS = 1000;
  private static final int AUDIT_DETAILS_MAX = 900;
  private static final String TARGET = "ACCOUNT:";

  /** Denetimde değişen alan adları (değerler yazılmaz — KVKK). */
  private static final List<Map.Entry<String, Function<Account, Object>>> TRACKED =
      List.of(
          Map.entry("code", Account::getCode),
          Map.entry("name", Account::getName),
          Map.entry("type", Account::getType),
          Map.entry("subGroup", Account::getSubGroup),
          Map.entry(
              "taxNumber", a -> a.getTaxNumber() != null ? a.getTaxNumber() : a.getTaxNumberHash()),
          Map.entry("branchId", Account::getBranchId),
          Map.entry("companyId", Account::getCompanyId),
          Map.entry("defaultCurrency", Account::getDefaultCurrency),
          Map.entry("taxOffice", Account::getTaxOffice),
          Map.entry("companyType", Account::getCompanyType),
          Map.entry("phone", Account::getPhone),
          Map.entry("email", Account::getEmail),
          Map.entry("website", Account::getWebsite),
          Map.entry("contactName", Account::getContactName),
          Map.entry("contactTitle", Account::getContactTitle),
          Map.entry("contactMobile", Account::getContactMobile),
          Map.entry("city", Account::getCity),
          Map.entry("district", Account::getDistrict),
          Map.entry("country", Account::getCountry),
          Map.entry("postalCode", Account::getPostalCode),
          Map.entry("paymentTerms", Account::getPaymentTerms),
          Map.entry("notes", Account::getNotes));

  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final AccountGroupRepository groups;
  private final AccountCompanyLimitRepository limits;
  private final AccountRolloverRepository rollovers;
  private final PaymentPlanRepository plans;
  private final LedgerService ledger;
  private final OpeningInvoiceImportService openingInvoices;
  private final BranchScopeService scope;
  private final AccountAccess access;
  private final CompanyIdentityRule identityRule;
  private final CompanyResolver companies;
  private final AccountBankAccountService bankAccounts;
  private final PersonalDataProtector protector;
  private final AuditService audit;
  private final AuditLogRepository auditLogs;
  private final TenantClock clock;
  private final InvoiceCoverageService invoiceCoverage;

  @SuppressWarnings("java:S107")
  public AccountService(
      AccountRepository accounts,
      AccountTransactionRepository transactions,
      AccountGroupRepository groups,
      AccountCompanyLimitRepository limits,
      AccountRolloverRepository rollovers,
      PaymentPlanRepository plans,
      LedgerService ledger,
      OpeningInvoiceImportService openingInvoices,
      BranchScopeService scope,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      CompanyResolver companies,
      AccountBankAccountService bankAccounts,
      PersonalDataProtector protector,
      AuditService audit,
      AuditLogRepository auditLogs,
      TenantClock clock,
      InvoiceCoverageService invoiceCoverage) {
    this.invoiceCoverage = invoiceCoverage;
    this.accounts = accounts;
    this.transactions = transactions;
    this.groups = groups;
    this.limits = limits;
    this.rollovers = rollovers;
    this.plans = plans;
    this.ledger = ledger;
    this.openingInvoices = openingInvoices;
    this.scope = scope;
    this.access = access;
    this.identityRule = identityRule;
    this.companies = companies;
    this.bankAccounts = bankAccounts;
    this.protector = protector;
    this.audit = audit;
    this.auditLogs = auditLogs;
    this.clock = clock;
  }

  /**
   * Kart listesi ortaktır (şirket/iş yerine göre süzülmez, Y1); bakiyeler kullanıcının kapsamına ve
   * istenen şirket/iş yerlerine göre, sayfa başına tek sorguyla.
   */
  @Transactional(readOnly = true)
  public PageResponse<AccountResponse> list(AccountListQuery query, Pageable pageable) {
    String term = query.search() == null ? "" : query.search().trim().toLowerCase(Locale.ROOT);
    Page<Account> page =
        accounts.searchFiltered(
            term,
            query.types(),
            query.subGroups(),
            query.active(),
            access.employeeVisible(),
            pageable);
    BranchFilter filter = scope.filter(query.companyId(), query.branchIds());
    List<UUID> ids = page.getContent().stream().map(Account::getId).toList();
    Map<UUID, List<BalanceResponse>> balances =
        balancesOf(ids, groupByOrDefault(query.balanceGroupBy()), filter);
    Map<UUID, AccountPlanSummaryResponse> summaries =
        query.includePlanSummary() ? planSummaries(ids, filter) : Map.of();
    Map<String, String> groupNames = groupNames();
    return PageResponse.from(
        page,
        account ->
            toResponse(
                account,
                balances.getOrDefault(account.getId(), List.of()),
                query.includePlanSummary()
                    ? summaries.getOrDefault(account.getId(), emptySummary())
                    : null,
                groupNames,
                false));
  }

  @Transactional(readOnly = true)
  public AccountResponse get(UUID id, UUID companyId, List<UUID> branchIds) {
    Account account = access.readable(id);
    return detail(account, scope.filter(companyId, branchIds));
  }

  /** Hesap grupları; personel grupları izinsiz kullanıcıya gösterilmez. */
  @Transactional(readOnly = true)
  public List<AccountGroupResponse> groups() {
    boolean employees = access.employeeVisible();
    return groups.findAllByOrderBySortOrder().stream()
        .filter(group -> employees || group.getAccountType() != AccountType.EMPLOYEE)
        .map(
            group ->
                new AccountGroupResponse(
                    group.getCode(),
                    group.getAccountType(),
                    group.getName(),
                    group.getReportType(),
                    group.getCodePrefix(),
                    group.getSortOrder(),
                    group.isTypeDefault(),
                    group.isSelectable(),
                    group.isActive()))
        .toList();
  }

  /**
   * Yeni kart (MUI ve ZTO formu). Kod boşsa hesap grubunun sayacından üretilir; vergi numarası
   * denetimi yalnız ZTO formunda ({@code subGroup} dolu); banka hesapları aynı işlemde.
   */
  @Transactional
  public AccountResponse create(SaveAccountRequest request) {
    Account.requireNotReserved(request.type());
    AccountGroup group = resolveGroup(request.type(), request.subGroup(), null);
    access.requireCanOpen(request.type());
    String code = blankToNull(request.code());
    if (code != null && accounts.findByCode(code).isPresent()) {
      throw codeTaken();
    }
    TaxIdentity tax =
        taxIdentity(null, request.taxNumber(), request.subGroup() != null, group.getCode());
    if (request.companyId() != null) {
      scope.requireCompanyVisible(request.companyId());
    }
    if (code == null) {
      code = issueCode(groups.findForUpdate(group.getCode()).orElseThrow(this::groupInvalid));
    }
    Account account =
        new Account(
            new AccountProfile(
                code,
                request.name().trim(),
                request.type(),
                group.getCode(),
                request.branchId(),
                request.companyId(),
                request.defaultCurrency(),
                blankToNull(request.taxOffice()),
                request.companyType(),
                blankToNull(request.phone()),
                blankToNull(request.email()),
                blankToNull(request.website()),
                blankToNull(request.contactName()),
                blankToNull(request.contactTitle()),
                blankToNull(request.contactMobile()),
                protector.encrypt(blankToNull(request.address())),
                blankToNull(request.city()),
                blankToNull(request.district()),
                blankToNull(request.country()),
                blankToNull(request.postalCode()),
                blankToNull(request.paymentTerms()),
                blankToNull(request.notes())),
            request.creditLimit(),
            request.riskLimit());
    account.applyTaxIdentity(tax);
    accounts.save(account);
    if (request.bankAccounts() != null) {
      for (SaveBankAccountRequest row : request.bankAccounts()) {
        bankAccounts.createFor(account, row);
      }
    }
    audit.record(AuditEvent.ACCOUNT_CREATED, TARGET + account.getId(), account.getCode());
    return detail(account, scope.filter(null, null));
  }

  /**
   * Eski MUI düzenlemesi: yalnız ad, tür, vergi no ve iş yeri; profil alanlarına dokunmaz. Tür
   * değişim kuralı ve kart yazım kapsamı ZTO formuyla aynıdır.
   */
  @Transactional
  public AccountResponse update(UUID id, SaveAccountRequest request) {
    Account account = access.writable(id);
    scope.requireForUpdate(request.branchId(), account.getBranchId());
    account.requireNotIntercompany();
    Account.requireNotReserved(request.type());
    access.requireTypeChange(account, request.type());
    TaxIdentity tax = taxIdentity(account, request.taxNumber(), false, null);
    List<Object> before = snapshot(account);
    account.update(request.name(), request.type(), tax.plain(), request.branchId());
    account.applyTaxIdentity(tax);
    audit.record(AuditEvent.ACCOUNT_UPDATED, TARGET + id, changedFields(before, account, false));
    return detail(account, scope.filter(null, null));
  }

  /** ZTO düzenleme formu (PUT /accounts/{id}/profile). */
  @Transactional
  public AccountResponse updateProfile(UUID id, AccountProfileRequest request) {
    access.writable(id);
    Account account = accounts.findForUpdate(id).orElseThrow(AccountAccess::notFound);
    account.requireNotIntercompany();
    scope.requireForUpdate(request.branchId(), account.getBranchId());
    if (!request.code().equals(account.getCode())
        && accounts.findByCode(request.code()).isPresent()) {
      throw codeTaken();
    }
    Account.requireNotReserved(request.type());
    access.requireTypeChange(account, request.type());
    AccountGroup group = resolveGroup(request.type(), request.subGroup(), account.getSubGroup());
    UUID oldCompanyId = account.getCompanyId();
    if (!Objects.equals(request.companyId(), oldCompanyId)) {
      // SEC-12.1-02: kapsam dışı şirkete bağlı kart çözülemez ya da başka şirkete taşınamaz.
      if (oldCompanyId != null) {
        scope.requireCompanyVisible(oldCompanyId);
      }
      if (request.companyId() != null) {
        scope.requireCompanyVisible(request.companyId());
        if (accounts.hasOtherCompanyRecords(id, request.companyId())) {
          throw new BusinessException(
              HttpStatus.CONFLICT,
              "ACCOUNT_COMPANY_LOCKED",
              "Carinin başka şirkette hareketi var; şirkete bağlanamaz.");
        }
      }
    }
    TaxIdentity tax = taxIdentity(account, request.taxNumber(), true, group.getCode());
    if (request.bankAccounts() != null) {
      for (ProfileBankAccountRequest row : request.bankAccounts()) {
        if (row.id() == null) {
          bankAccounts.createFor(account, row.toSave());
        } else {
          bankAccounts.updateFor(account, row.id(), row.toSave());
        }
      }
    }
    if (request.deactivatedBankAccountIds() != null) {
      for (UUID bankAccountId : request.deactivatedBankAccountIds()) {
        bankAccounts.deactivateFor(account, bankAccountId);
      }
    }
    String address = blankToNull(request.address());
    boolean addressChanged = !Objects.equals(protector.decrypt(account.getAddressEnc()), address);
    List<Object> before = snapshot(account);
    account.updateProfile(
        new AccountProfile(
            request.code().trim(),
            request.name().trim(),
            request.type(),
            group.getCode(),
            request.branchId(),
            request.companyId(),
            request.defaultCurrency(),
            blankToNull(request.taxOffice()),
            request.companyType(),
            blankToNull(request.phone()),
            blankToNull(request.email()),
            blankToNull(request.website()),
            blankToNull(request.contactName()),
            blankToNull(request.contactTitle()),
            blankToNull(request.contactMobile()),
            addressChanged ? protector.encrypt(address) : account.getAddressEnc(),
            blankToNull(request.city()),
            blankToNull(request.district()),
            blankToNull(request.country()),
            blankToNull(request.postalCode()),
            blankToNull(request.paymentTerms()),
            blankToNull(request.notes())));
    account.applyTaxIdentity(tax);
    audit.record(
        AuditEvent.ACCOUNT_UPDATED, TARGET + id, changedFields(before, account, addressChanged));
    return detail(account, scope.filter(null, null));
  }

  /** Pasif cariye kullanıcı girişli yeni işlem girilemez; hareketli cari de pasifleşebilir. */
  @Transactional
  public AccountResponse setActive(UUID id, boolean active) {
    access.writable(id);
    Account account = accounts.findForUpdate(id).orElseThrow(AccountAccess::notFound);
    boolean changed = account.isActive() != active;
    if (active) {
      account.activate();
    } else {
      account.deactivate();
    }
    if (changed) {
      audit.record(
          active ? AuditEvent.ACCOUNT_ACTIVATED : AuditEvent.ACCOUNT_DEACTIVATED,
          TARGET + id,
          account.getCode());
    }
    return detail(account, scope.filter(null, null));
  }

  /**
   * Kart (konsolide) ya da şirket limiti; yalnız gösterim/uyarı, işlem engellemez. Şirket satırı
   * ikisi de boş olsa silinmez, boş yazılır.
   */
  @Transactional
  public AccountResponse setLimits(UUID id, AccountLimitRequest request) {
    access.writable(id);
    Account account = accounts.findForUpdate(id).orElseThrow(AccountAccess::notFound);
    if (request.companyId() == null) {
      account.setLimits(request.creditLimit(), request.riskLimit());
    } else {
      scope.requireCompanyVisible(request.companyId());
      AccountCompanyLimit limit =
          limits
              .findByAccountIdAndCompanyId(id, request.companyId())
              .orElseGet(() -> new AccountCompanyLimit(id, request.companyId(), null, null));
      limit.update(request.creditLimit(), request.riskLimit());
      limits.save(limit);
    }
    audit.record(
        AuditEvent.ACCOUNT_LIMITS_CHANGED,
        TARGET + id,
        request.companyId() == null ? "card" : "company " + request.companyId());
    return detail(account, scope.filter(null, null));
  }

  /**
   * Kart değişiklik geçmişi, yeniden eskiye. Yalnız kart olayları bu hedefe yazılır; para belgesi
   * ve taşıma olayları kendi hedeflerindedir (kapsam dışı belge bilgisi sızmaz).
   */
  @Transactional(readOnly = true)
  public PageResponse<AccountHistoryResponse> history(UUID id, Pageable pageable) {
    access.readable(id);
    return PageResponse.from(
        auditLogs.findAllByTargetOrderByCreatedAtDesc(TARGET + id, pageable),
        log ->
            new AccountHistoryResponse(
                log.getCreatedAt(), log.getActorEmail(), log.getEventType(), log.getDetails()));
  }

  @Transactional
  public void delete(UUID id) {
    Account account = access.writable(id);
    if (transactions.existsByAccountId(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_HAS_TRANSACTIONS", "Hareketi olan cari silinemez.");
    }
    account.markDeleted();
  }

  /** Kullanıcı girişli elle hareket: pasif cari 422, cari–şirket kimlik kuralı. */
  @Transactional
  public AccountTransaction postManual(UUID accountId, ManualAccountTransactionRequest request) {
    Account account = access.usableLocked(accountId);
    identityRule.require(account, companies.companyOf(request.branchId()));
    return ledger.post(
        new Posting(
            accountId,
            request.branchId(),
            request.direction(),
            request.money(),
            request.date(),
            request.description(),
            LedgerService.SOURCE_MANUAL,
            UUID.randomUUID(),
            request.exchangeRate()));
  }

  /** Belgeden gelen hareket yalnız kendi belgesi üzerinden ters çevrilir. */
  @Transactional
  public AccountTransaction reverseManual(UUID transactionId, LocalDate date, String description) {
    AccountTransaction original =
        transactions
            .findById(transactionId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı."));
    // SEC-12.1-06: personel carisinin hareketi izinsiz kullanıcıya yokmuş gibi (void ile aynı 404).
    if (!access.employeeVisible()
        && accounts
            .findById(original.getAccountId())
            .map(a -> a.getType() == AccountType.EMPLOYEE)
            .orElse(false)) {
      throw new BusinessException(
          HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı.");
    }
    scope.requireVisible(original.getBranchId());
    // Açılış faturası geri alınınca bağlı ödeme planı da iptal olur.
    if (OpeningInvoiceImportService.SOURCE.equals(original.getSourceType())) {
      return openingInvoices.reverse(original, date, description);
    }
    // Açılış bakiyesinin belgesi yoktur; yanlış yüklenen açılış ekstreden düzeltilir.
    if (!LedgerService.SOURCE_MANUAL.equals(original.getSourceType())
        && !OpeningBalanceImportService.SOURCE_OPENING.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_NOT_MANUAL",
          "Belgeye bağlı hareket, belgesinden iptal edilmelidir.");
    }
    return ledger.reverse(original, date, description);
  }

  /**
   * Ekstre v2 (12.1 §3.6): {@code currency} boşsa çok para birimli; yürüyen bakiye ve dönem başı
   * para birimi başına. {@code currency} verilince ve işlem tarihi tabanında satırlar ve sıra eski
   * ekstreyle aynıdır (yeni alanlar eklenir).
   */
  @Transactional(readOnly = true)
  public StatementResponse statement(UUID accountId, StatementQuery query, int page, int size) {
    access.readable(accountId);
    BranchFilter filter = scope.filter(query.companyId(), query.branchIds());
    String currency = query.currency() == null ? "" : query.currency().trim();
    boolean documentBasis = query.dateBasis() == DateBasis.DOCUMENT;
    boolean allCompanies = filter.companyId() == null;
    UUID companyId = allCompanies ? BranchFilter.NONE : filter.companyId();
    List<CurrencyAmountRow> openingRows =
        transactions.statementOpenings(
            accountId,
            currency,
            query.from(),
            documentBasis,
            allCompanies,
            companyId,
            filter.allBranches(),
            filter.branchIds());
    Map<String, BigDecimal> openings =
        openingRows.stream()
            .collect(
                Collectors.toMap(CurrencyAmountRow::getCurrency, CurrencyAmountRow::getAmount));
    int pageSize = Math.max(1, Math.min(size, STATEMENT_PAGE_MAX));
    int pageNumber = Math.max(0, page);
    List<StatementRow> rows =
        transactions.statementRows(
            accountId,
            currency,
            query.from(),
            query.to(),
            documentBasis,
            allCompanies,
            companyId,
            filter.allBranches(),
            filter.branchIds(),
            pageSize,
            (long) pageNumber * pageSize);
    long total =
        transactions.statementCount(
            accountId,
            currency,
            query.from(),
            query.to(),
            documentBasis,
            allCompanies,
            companyId,
            filter.allBranches(),
            filter.branchIds());
    List<StatementLine> lines =
        rows.stream()
            .map(
                row ->
                    new StatementLine(
                        row.getId(),
                        documentBasis && row.getDocumentDate() != null
                            ? row.getDocumentDate()
                            : row.getTransactionDate(),
                        row.getDirection(),
                        row.getAmount(),
                        row.getExchangeRate(),
                        row.getTlAmount(),
                        row.getDescription(),
                        row.getSourceType(),
                        openings
                            .getOrDefault(row.getCurrency(), BigDecimal.ZERO)
                            .add(row.getRunningBalance()),
                        row.getCurrency(),
                        row.getCompanyId(),
                        row.getBranchId(),
                        row.getSourceId(),
                        row.getKind(),
                        row.getSign(),
                        Boolean.TRUE.equals(row.getReversal()),
                        Boolean.TRUE.equals(row.getReversed()),
                        row.getTransferRole(),
                        row.getDocumentNo(),
                        row.getDocumentType(),
                        row.getDocumentDate(),
                        row.getDueDate(),
                        row.getPaymentMethod(),
                        row.getCreatedBy(),
                        AccountTransactionQueryService.instant(row.getCreatedAt())))
            .toList();
    return new StatementResponse(
        currency.isEmpty() ? null : currency,
        currency.isEmpty() ? null : openings.getOrDefault(currency, BigDecimal.ZERO),
        openingRows.stream()
            .map(row -> new CurrencyAmountResponse(row.getCurrency(), row.getAmount()))
            .toList(),
        lines,
        pageNumber,
        pageSize,
        total,
        (int) ((total + pageSize - 1) / pageSize));
  }

  /**
   * Kırılımlı bakiye (12.1 §3.6): para birimi, şirket ya da iş yeri kırılımı; sezon seçiliyse devir
   * öncesi/sonrası bölmesi ve toplamı. Fatura toplamları ve eksik fatura satırları defter
   * tabanlıdır (12.2 §3.7); alış tarafı ("Resmi Fatura") müşteri dışı carilerde.
   */
  @Transactional(readOnly = true)
  public AccountBalanceBreakdownResponse breakdown(
      UUID id,
      UUID companyId,
      List<UUID> branchIds,
      BalanceGroupBy groupBy,
      LocalDate asOf,
      UUID rolloverId) {
    Account account = access.readable(id);
    LocalDate splitDate = null;
    if (rolloverId != null) {
      splitDate =
          rollovers
              .findById(rolloverId)
              .filter(rollover -> rollover.getAccountId().equals(id) && !rollover.isDeleted())
              .map(AccountRollover::getRolloverDate)
              .orElseThrow(
                  () ->
                      new BusinessException(
                          HttpStatus.NOT_FOUND,
                          "ROLLOVER_NOT_FOUND",
                          "Kayıt bulunamadı veya zaten silinmiş."));
    }
    BalanceGroupBy grouping = groupByOrDefault(groupBy);
    BranchFilter filter = scope.filter(companyId, branchIds);
    List<BalanceBreakdownRowResponse> rows = new ArrayList<>();
    List<KindBalanceRow> segments =
        transactions.kindBalances(List.of(id), grouping.name(), splitDate, asOf, filter);
    if (splitDate != null) {
      rows.addAll(totals(segments));
    }
    segments.forEach(row -> rows.add(breakdownRow(row.getSegment(), row)));
    List<AccountInvoiceGapResponse> coverage = invoiceCoverage.coverage(id, filter, asOf);
    List<CurrencyAmountResponse> payable =
        account.getType() == AccountType.CUSTOMER
            ? List.of()
            : InvoiceCoverageService.invoiceTotals(coverage, InvoiceSide.PAYABLE);
    return new AccountBalanceBreakdownResponse(
        grouping,
        splitDate,
        rows,
        payable,
        InvoiceCoverageService.invoiceTotals(coverage, InvoiceSide.RECEIVABLE),
        coverage);
  }

  /**
   * Cari fatura listesi (12.1 §3.9), sayfasız; en çok {@value #INVOICE_LIMIT} satır, fazlası 422
   * {@code RESULT_TOO_LARGE}. Navlun/depo faturasının ISSUED durumu OPEN olarak döner.
   */
  @Transactional(readOnly = true)
  public List<AccountInvoiceRowResponse> invoices(
      UUID id,
      InvoiceDirection direction,
      String documentType,
      Boolean reflected,
      LocalDate from,
      LocalDate to,
      UUID companyId) {
    access.readable(id);
    BranchFilter filter = scope.filter(companyId, null);
    List<AccountInvoiceRow> rows =
        transactions.invoiceRows(
            id,
            direction == InvoiceDirection.PURCHASE,
            documentType == null ? "" : documentType.trim(),
            reflected == null,
            Boolean.TRUE.equals(reflected),
            from == null ? MIN_DATE : from,
            to == null ? MAX_DATE : to,
            filter.companyId() == null,
            filter.companyId() == null ? BranchFilter.NONE : filter.companyId(),
            filter.allBranches(),
            filter.branchIds(),
            INVOICE_LIMIT + 1);
    if (rows.size() > INVOICE_LIMIT) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "RESULT_TOO_LARGE", "Tarih aralığını daraltın.");
    }
    return rows.stream()
        .map(
            row ->
                new AccountInvoiceRowResponse(
                    row.getKind(),
                    row.getId(),
                    row.getNumber(),
                    row.getDocumentType(),
                    row.getDocumentTypeName(),
                    row.getInvoiceDate(),
                    row.getDueDate(),
                    row.getNetAmount(),
                    row.getVatAmount(),
                    row.getWithholdingAmount(),
                    row.getTotalAmount(),
                    row.getCurrency(),
                    Boolean.TRUE.equals(row.getReflected()),
                    row.getStatus(),
                    row.getCompanyId(),
                    row.getBranchId()))
        .toList();
  }

  /** Sezon bölmesinde BEFORE + AFTER toplamı (segment ALL), aynı kırılım anahtarıyla. */
  private static List<BalanceBreakdownRowResponse> totals(List<KindBalanceRow> segments) {
    Map<List<Object>, List<KindBalanceRow>> byKey = new LinkedHashMap<>();
    for (KindBalanceRow row : segments) {
      byKey
          .computeIfAbsent(
              Arrays.asList(row.getCurrency(), row.getCompanyId(), row.getBranchId()),
              key -> new ArrayList<>())
          .add(row);
    }
    List<BalanceBreakdownRowResponse> result = new ArrayList<>();
    byKey.forEach(
        (key, group) -> {
          BigDecimal debit = sum(group, KindBalanceRow::getDebit);
          BigDecimal credit = sum(group, KindBalanceRow::getCredit);
          result.add(
              new BalanceBreakdownRowResponse(
                  "ALL",
                  (String) key.get(0),
                  (UUID) key.get(1),
                  (UUID) key.get(2),
                  debit,
                  credit,
                  debit.subtract(credit),
                  sum(group, KindBalanceRow::getTlBalance),
                  sum(group, KindBalanceRow::getDebt),
                  sum(group, KindBalanceRow::getPayment),
                  sum(group, KindBalanceRow::getReceivable),
                  sum(group, KindBalanceRow::getCollection)));
        });
    return result;
  }

  private static BigDecimal sum(
      List<KindBalanceRow> rows, Function<KindBalanceRow, BigDecimal> value) {
    return rows.stream().map(value).reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private static BalanceBreakdownRowResponse breakdownRow(String segment, KindBalanceRow row) {
    return new BalanceBreakdownRowResponse(
        segment,
        row.getCurrency(),
        row.getCompanyId(),
        row.getBranchId(),
        row.getDebit(),
        row.getCredit(),
        row.getDebit().subtract(row.getCredit()),
        row.getTlBalance(),
        row.getDebt(),
        row.getPayment(),
        row.getReceivable(),
        row.getCollection());
  }

  /**
   * Açık bakiyeyi vadesiz eskitme: karşı yöndeki hareketler en eski açık kalemleri kapatır, kalan
   * kalemler işlem tarihine göre dilimlere ayrılır. Eşleştirme şirket kırılımlıdır (konsolidede
   * de); grup şirketi carileri konsolidede {@code excludeIntercompany} ile dışlanır, şirket
   * seçiliyken her zaman görünür.
   */
  @Transactional(readOnly = true)
  public List<AgingResponse> aging(
      AgingType type, LocalDate asOf, UUID companyId, boolean excludeIntercompany) {
    String openDirection = type == AgingType.RECEIVABLE ? "DEBIT" : "CREDIT";
    Collection<String> types =
        type == AgingType.RECEIVABLE
            ? List.of(AccountType.CUSTOMER.name(), AccountType.INTERCOMPANY.name())
            : List.of(
                AccountType.SUPPLIER.name(),
                AccountType.CARRIER.name(),
                AccountType.INTERCOMPANY.name());
    boolean exclude = companyId == null && excludeIntercompany;

    return transactions.agingRows(asOf, openDirection, types, filter(companyId), exclude).stream()
        .map(
            row ->
                new AgingResponse(
                    row.getAccountId(),
                    row.getAccountName(),
                    row.getCurrency(),
                    row.getCurrent(),
                    row.getDays31To60(),
                    row.getDays61To90(),
                    row.getOver90(),
                    row.getCurrent()
                        .add(row.getDays31To60())
                        .add(row.getDays61To90())
                        .add(row.getOver90())))
        .toList();
  }

  /**
   * Grubun sıradaki kodu; elle açılmış aynı kod varsa atlanır. Çağıran grup satırını kilitlemiştir
   * (aynı gruptaki eşzamanlı kayıtlar sıraya girer). 1000 denemede boş kod yoksa 409.
   */
  String issueCode(AccountGroup group) {
    for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      String candidate = group.issueNextCode();
      if (accounts.findByCode(candidate).isEmpty()) {
        return candidate;
      }
    }
    throw new BusinessException(
        HttpStatus.CONFLICT,
        "ACCOUNT_CODE_EXHAUSTED",
        "Otomatik cari kodu üretilemedi; kodu elle girin.");
  }

  // --- yardımcılar

  /**
   * Hesap grubu türle uyumlu olmalı; seçilemeyen/pasif grup yalnız kartın mevcut grubuysa kabul
   * edilir. Boşsa türün varsayılanı.
   */
  private AccountGroup resolveGroup(AccountType type, String subGroup, String current) {
    String code = subGroup == null ? type.defaultSubGroup() : subGroup;
    return groups
        .findById(code)
        .filter(group -> group.getAccountType() == type)
        .filter(
            group ->
                subGroup == null
                    || subGroup.equals(current)
                    || (group.isSelectable() && group.isActive()))
        .orElseThrow(this::groupInvalid);
  }

  /**
   * Vergi kimliği yazımı (§2.4): saklı maske geri gelirse değer değişmez; ZTO formunda VKN/TCKN
   * kontrol hanesi ve zorunlu gruplar denetlenir; TCKN şifreli + hash + maskeli saklanır.
   */
  private TaxIdentity taxIdentity(Account existing, String raw, boolean validate, String subGroup) {
    String value = blankToNull(raw);
    if (existing != null
        && value != null
        && existing.getTaxNumberMasked() != null
        && value.equals(existing.getTaxNumberMasked())) {
      return new TaxIdentity(
          null,
          existing.getTaxNumberEnc(),
          existing.getTaxNumberHash(),
          existing.getTaxNumberMasked());
    }
    if (validate) {
      if (value == null && TAX_REQUIRED_GROUPS.contains(subGroup)) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "TAX_NUMBER_REQUIRED",
            "TC/Vergi No alanı boş geçilemez. Lütfen TC/Vergi No bilgisini giriniz.");
      }
      if (value != null) {
        TaxNumbers.validate(TaxNumbers.typeOf(value), value);
      }
    }
    return protector.taxIdentity(value);
  }

  private AccountResponse detail(Account account, BranchFilter filter) {
    // SEC-12.1-05: LIMITED kullanıcı yalnız görünür şirketlerin limitlerini görür.
    Set<UUID> visibleCompanies = scope.limited() ? Set.copyOf(scope.visibleCompanyIds()) : null;
    List<AccountCompanyLimitResponse> companyLimits =
        limits.findAllByAccountId(account.getId()).stream()
            .filter(
                limit ->
                    visibleCompanies == null || visibleCompanies.contains(limit.getCompanyId()))
            .map(
                limit ->
                    new AccountCompanyLimitResponse(
                        limit.getCompanyId(), limit.getCreditLimit(), limit.getRiskLimit()))
            .toList();
    return toResponse(
        account,
        balancesOf(List.of(account.getId()), BalanceGroupBy.CURRENCY, filter)
            .getOrDefault(account.getId(), List.of()),
        null,
        groupNames(),
        true,
        companyLimits);
  }

  private AccountResponse toResponse(
      Account account,
      List<BalanceResponse> balances,
      AccountPlanSummaryResponse summary,
      Map<String, String> groupNames,
      boolean detail) {
    return toResponse(account, balances, summary, groupNames, detail, null);
  }

  /**
   * Açık adres detayda herkese (K-12.2-5), listede yok (veri en aza indirme); açık TCKN yalnız
   * detayda ve yalnız FINANCE_MANAGE sahibine, aksi maskeli.
   */
  private AccountResponse toResponse(
      Account account,
      List<BalanceResponse> balances,
      AccountPlanSummaryResponse summary,
      Map<String, String> groupNames,
      boolean detail,
      List<AccountCompanyLimitResponse> companyLimits) {
    boolean manage = detail && AccountAccess.hasAuthority(Permission.FINANCE_MANAGE.name());
    String taxNumber = account.getTaxNumber();
    boolean masked = false;
    if (taxNumber == null && account.getTaxNumberEnc() != null) {
      if (manage) {
        taxNumber = protector.decrypt(account.getTaxNumberEnc());
      } else {
        taxNumber = account.getTaxNumberMasked();
        masked = true;
      }
    }
    return new AccountResponse(
        account.getId(),
        account.getCode(),
        account.getName(),
        account.getType(),
        taxNumber,
        masked,
        account.getBranchId(),
        account.getCompanyId(),
        account.getRepresentsCompanyId(),
        balances,
        account.getSubGroup(),
        groupNames.getOrDefault(account.getSubGroup(), account.getSubGroup()),
        account.isActive(),
        account.getDefaultCurrency(),
        account.getCreditLimit(),
        account.getRiskLimit(),
        companyLimits,
        account.getTaxOffice(),
        account.getCompanyType(),
        account.getPhone(),
        account.getEmail(),
        account.getWebsite(),
        account.getContactName(),
        account.getContactTitle(),
        account.getContactMobile(),
        detail ? protector.decrypt(account.getAddressEnc()) : null,
        account.getCity(),
        account.getDistrict(),
        account.getCountry(),
        account.getPostalCode(),
        account.getPaymentTerms(),
        account.getNotes(),
        summary,
        account.getCreatedBy(),
        account.getCreatedAt(),
        account.getUpdatedBy(),
        account.getUpdatedAt(),
        account.getUpdateCount());
  }

  private Map<UUID, List<BalanceResponse>> balancesOf(
      Collection<UUID> ids, BalanceGroupBy groupBy, BranchFilter filter) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return transactions.kindBalances(ids, groupBy.name(), null, null, filter).stream()
        .collect(
            Collectors.groupingBy(
                KindBalanceRow::getAccountId,
                Collectors.mapping(AccountService::toBalance, Collectors.toList())));
  }

  static BalanceResponse toBalance(KindBalanceRow row) {
    return new BalanceResponse(
        row.getCurrency(),
        row.getDebit(),
        row.getCredit(),
        row.getDebit().subtract(row.getCredit()),
        row.getTlBalance(),
        row.getCompanyId(),
        row.getBranchId(),
        row.getDebt(),
        row.getPayment(),
        row.getReceivable(),
        row.getCollection());
  }

  private Map<UUID, AccountPlanSummaryResponse> planSummaries(
      Collection<UUID> ids, BranchFilter filter) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return plans.planSummaries(ids, clock.today(), filter).stream()
        .collect(Collectors.groupingBy(PlanSummaryRow::getAccountId))
        .entrySet()
        .stream()
        .collect(Collectors.toMap(Map.Entry::getKey, entry -> summaryOf(entry.getValue())));
  }

  private static AccountPlanSummaryResponse summaryOf(List<PlanSummaryRow> rows) {
    return new AccountPlanSummaryResponse(
        rows.stream()
            .map(PlanSummaryRow::getNextDueDate)
            .filter(Objects::nonNull)
            .min(Comparator.naturalOrder())
            .orElse(null),
        rows.stream().mapToLong(PlanSummaryRow::getOverdueCount).sum(),
        rows.stream().mapToLong(PlanSummaryRow::getDueTodayCount).sum(),
        rows.stream().mapToLong(PlanSummaryRow::getDraftCount).sum(),
        rows.stream().mapToLong(PlanSummaryRow::getPendingCount).sum(),
        rows.stream().mapToLong(PlanSummaryRow::getApprovedCount).sum(),
        rows.stream()
            .map(row -> new CurrencyAmountResponse(row.getCurrency(), row.getPlanned()))
            .toList());
  }

  private static AccountPlanSummaryResponse emptySummary() {
    return new AccountPlanSummaryResponse(null, 0, 0, 0, 0, 0, List.of());
  }

  private Map<String, String> groupNames() {
    return groups.findAll().stream()
        .collect(Collectors.toMap(AccountGroup::getCode, AccountGroup::getName));
  }

  private static BalanceGroupBy groupByOrDefault(BalanceGroupBy groupBy) {
    return groupBy == null ? BalanceGroupBy.CURRENCY : groupBy;
  }

  /** Şirket süzgeci (boş = konsolide) ve kullanıcının iş yeri kapsamı. */
  private BranchFilter filter(UUID companyId) {
    return scope.filter(companyId, null);
  }

  private static List<Object> snapshot(Account account) {
    List<Object> values = new ArrayList<>(TRACKED.size());
    TRACKED.forEach(entry -> values.add(entry.getValue().apply(account)));
    return values;
  }

  private static String changedFields(List<Object> before, Account after, boolean address) {
    List<String> names = new ArrayList<>();
    for (int i = 0; i < TRACKED.size(); i++) {
      if (!Objects.equals(before.get(i), TRACKED.get(i).getValue().apply(after))) {
        names.add(TRACKED.get(i).getKey());
      }
    }
    if (address) {
      names.add("address");
    }
    String joined = String.join(",", names);
    return joined.length() > AUDIT_DETAILS_MAX ? joined.substring(0, AUDIT_DETAILS_MAX) : joined;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private BusinessException groupInvalid() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "ACCOUNT_GROUP_INVALID",
        "Hesap grubu cari türüyle uyumlu değil.");
  }

  private static BusinessException codeTaken() {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "ACCOUNT_CODE_TAKEN",
        "Bu hesap kodu başka bir kayıt tarafından kullanılıyor.");
  }
}
