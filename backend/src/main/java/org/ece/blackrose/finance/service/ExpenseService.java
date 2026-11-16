package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.files.StoredFileRepository;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.Expense;
import org.ece.blackrose.finance.domain.Expense.ExpenseAmounts;
import org.ece.blackrose.finance.domain.Expense.ExpenseContext;
import org.ece.blackrose.finance.domain.Expense.ExpenseDocument;
import org.ece.blackrose.finance.domain.Expense.ExpensePayment;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseLine;
import org.ece.blackrose.finance.domain.ExpenseLine.ExpenseLineAmounts;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseContextType;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseDepartment;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpensePaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseHeaderRow;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseLineRepository;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseListRow;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseOptionRow;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseQueryRepository;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseRepository;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseSupplierRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseCalcAmounts;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseCalcResult;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseLineInput;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseAllTimeResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseCalendarDayResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseCalendarEntryResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseCalendarResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseContextOptionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseCurrencyTotalResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemSummaryResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseLineResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseListItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseMonthlyResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ReverseExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ReviseExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseLineRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tek masraf modeli (ZTO ProductionExpenses; 12.7 §3.2). Cari masraf tedarikçiye {@code
 * LedgerService} ile ALACAK ({@code EXPENSE}), Nakit/Banka masraf {@code SettlementService} ile
 * doğrudan gider ödemesi ({@code EXPENSE:{id}}) yazar; yeni defter yazarı yoktur. Kayıt değişmez:
 * iptal ters kayıt + {@code REVERSED}, düzeltme tek işlemde ters kayıt + yeni kayıttır. Nakit/Banka
 * masraf, ters kayıt ve düzeltme {@code FINANCE_PAYMENT_CREATE} ister (403 {@code
 * PAYMENT_PERMISSION_REQUIRED}).
 */
@Service
public class ExpenseService {

  public static final String SOURCE = "EXPENSE";
  static final String FILE_OWNER = "EXPENSE";
  static final String IDEMPOTENCY_INDEX = "expense_idempotency_uq";
  private static final int MAX_LINES = 100;
  private static final int CALENDAR_LIMIT = 5000;
  private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);
  private static final String SEPARATOR = String.valueOf((char) 31);

  /** Liste süzgeci (12.7 §3.2.6). */
  public record ExpenseSearch(
      UUID expenseItemId,
      String currency,
      LocalDate from,
      LocalDate to,
      UUID companyId,
      List<UUID> branchIds) {}

  private final ExpenseRepository expenses;
  private final ExpenseLineRepository lines;
  private final ExpenseQueryRepository queries;
  private final ExpenseItemRepository items;
  private final AccountRepository accounts;
  private final FundAccountRepository funds;
  private final SettlementRepository settlementRepository;
  private final AccountDocumentTypeRepository documentTypes;
  private final StoredFileRepository storedFiles;
  private final LedgerService ledger;
  private final SettlementService settlements;
  private final ExchangeRateService rates;
  private final CompanyResolver companies;
  private final BranchScopeService scope;
  private final CompanyIdentityRule identityRule;
  private final AuditService audit;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public ExpenseService(
      ExpenseRepository expenses,
      ExpenseLineRepository lines,
      ExpenseQueryRepository queries,
      ExpenseItemRepository items,
      AccountRepository accounts,
      FundAccountRepository funds,
      SettlementRepository settlementRepository,
      AccountDocumentTypeRepository documentTypes,
      StoredFileRepository storedFiles,
      LedgerService ledger,
      SettlementService settlements,
      ExchangeRateService rates,
      CompanyResolver companies,
      BranchScopeService scope,
      CompanyIdentityRule identityRule,
      AuditService audit,
      TenantClock clock) {
    this.expenses = expenses;
    this.lines = lines;
    this.queries = queries;
    this.items = items;
    this.accounts = accounts;
    this.funds = funds;
    this.settlementRepository = settlementRepository;
    this.documentTypes = documentTypes;
    this.storedFiles = storedFiles;
    this.ledger = ledger;
    this.settlements = settlements;
    this.rates = rates;
    this.companies = companies;
    this.scope = scope;
    this.identityRule = identityRule;
    this.audit = audit;
    this.clock = clock;
  }

  // --- yazım

  /**
   * Yeni masraf (12.7 §3.2.1). Aynı {@code Idempotency-Key} ile ikinci istek ilk kaydı döner.
   * Eşzamanlı aynı anahtarlı iki istekten ikincisi 409 {@code IDEMPOTENCY_IN_PROGRESS} alır; uç bir
   * kez yeniden dener.
   */
  @Transactional
  public ExpenseDetailResponse create(SaveExpenseRequest request, String key, boolean canPay) {
    requirePaymentPermission(request.paymentMethod(), canPay);
    if (key != null) {
      Optional<Expense> existing = expenses.findByIdempotencyKey(key);
      if (existing.isPresent()) {
        scope.requireVisible(existing.get().getBranchId());
        return detail(existing.get());
      }
    }
    return detail(insert(request, key, null, null));
  }

  /**
   * İptal (12.7 §3.2.2): Cari masrafta cari ters kaydı, Nakit/Banka masrafta kaynak yönetimli
   * settlement iptali; kayıt {@code REVERSED} olur. Zaten iptal edilmişse mevcut durum döner.
   */
  @Transactional
  public ExpenseDetailResponse reverse(UUID id, ReverseExpenseRequest request, boolean canPay) {
    Expense expense = lock(id);
    requirePaymentPermission(expense.getPaymentMethod(), canPay);
    if (expense.isReversed()) {
      return detail(expense);
    }
    if (request.date().isBefore(expense.getInvoiceDate())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "REVERSE_DATE_INVALID",
          "İptal tarihi fatura tarihinden önce olamaz.");
    }
    String reason = request.reason().trim();
    reverseLocked(expense, request.date(), reason);
    audit.record(
        AuditEvent.EXPENSE_REVERSED, target(id), "date=" + request.date() + ",reason=" + reason);
    return detail(expense);
  }

  /**
   * Düzeltme (12.7 §3.2.2, Rev 1 F5): önce anahtar denetlenir (aynı anahtar → aynı yeni kayıt;
   * başka kaydın anahtarı 409 {@code IDEMPOTENCY_KEY_REUSED}); sonra eski kayıt {@code max(bugün,
   * fatura tarihi)} tarihiyle ters çevrilir ve yeni kayıt yazılır. Belgeler istenirse yeni kayda
   * taşınır.
   */
  @Transactional
  public ExpenseDetailResponse revise(
      UUID id, ReviseExpenseRequest request, String key, boolean canPay) {
    if (key != null) {
      Optional<Expense> existing = expenses.findByIdempotencyKey(key);
      if (existing.isPresent()) {
        scope.requireVisible(existing.get().getBranchId());
        if (!id.equals(existing.get().getReplacesExpenseId())) {
          throw new BusinessException(
              HttpStatus.CONFLICT,
              "IDEMPOTENCY_KEY_REUSED",
              "Bu istek anahtarı başka bir kayıt için kullanıldı.");
        }
        return detail(existing.get());
      }
    }
    Expense old = lock(id);
    requirePaymentPermission(old.getPaymentMethod(), canPay);
    requirePaymentPermission(request.expense().paymentMethod(), canPay);
    if (old.isReversed()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "EXPENSE_ALREADY_REVERSED", "Masraf zaten iptal edilmiş.");
    }
    LocalDate today = clock.today();
    LocalDate date = old.getInvoiceDate().isAfter(today) ? old.getInvoiceDate() : today;
    reverseLocked(old, date, "Düzeltme: " + request.reason().trim());
    Expense created = insert(request.expense(), key, id, old.getExpenseItemId());
    if (!request.removeDocument()) {
      storedFiles.reassignOwner(FILE_OWNER, id, created.getId());
    }
    audit.record(AuditEvent.EXPENSE_REVISED, target(created.getId()), "replaces=" + id);
    return detail(created);
  }

  /** Kilit + kapsam; yoksa 404 {@code EXPENSE_NOT_FOUND}. */
  private Expense lock(UUID id) {
    Expense expense = expenses.lockById(id).orElseThrow(ExpenseService::notFound);
    scope.requireVisible(expense.getBranchId());
    return expense;
  }

  private void reverseLocked(Expense expense, LocalDate date, String reason) {
    if (expense.getPaymentMethod() == ExpensePaymentMethod.ACCOUNT) {
      ledger.reverseSource(
          SOURCE, expense.getId(), date, LedgerDescriptions.fit("İptal: " + reason));
    } else {
      settlements.reverseManaged(expense.getSettlementId(), date, reason);
    }
    expense.reverse(date, reason);
  }

  /**
   * Doğrulanmış masrafın kaydı ve defter etkisi (12.7 §3.2.1 adım 2–11). Pasif kalem yalnız yeni
   * masrafta seçilemez (§3.1): düzeltmede eski kaydın kalemi ({@code keepItemId}) pasif olsa da
   * kabul edilir; başka bir pasif kaleme geçiş 422 kalır (R-12.7-2).
   */
  private Expense insert(SaveExpenseRequest r, String key, UUID replaces, UUID keepItemId) {
    UUID companyId = companies.companyOf(r.branchId());
    ExpenseItem item = items.findById(r.expenseItemId()).orElseThrow(ExpenseService::itemNotFound);
    if (!item.isActive() && !item.getId().equals(keepItemId)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "EXPENSE_ITEM_INACTIVE",
          "Pasif masraf kalemiyle masraf girilemez.");
    }
    ExpenseContext context = context(r, companyId);
    requireDocumentType(r.documentType());
    if (r.lines() == null || r.lines().isEmpty() || r.lines().size() > MAX_LINES) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "EXPENSE_LINES_REQUIRED",
          "Masrafta 1 ile " + MAX_LINES + " arası satır olmalıdır.");
    }
    ExpenseCalcResult calc =
        ExpenseCalculator.calculate(r.lines().stream().map(ExpenseService::input).toList());
    Account supplier = requirePayment(r, companyId);
    ExpenseCalcAmounts t = calc.totals();
    Money total = new Money(t.totalAmount(), r.currency());
    ExchangeRateService.Conversion conv = rates.convert(total, r.invoiceDate(), r.exchangeRate());
    Expense expense =
        new Expense(
            companyId,
            r.branchId(),
            item.getId(),
            context,
            new ExpensePayment(r.paymentMethod(), supplier == null ? null : supplier.getId()),
            new ExpenseDocument(
                blankToNull(r.invoiceNumber()),
                r.invoiceDate(),
                r.dueDate(),
                r.documentType(),
                r.department(),
                blankToNull(r.description())),
            new ExpenseAmounts(
                r.currency(),
                conv.rate(),
                conv.rateDate(),
                t.subTotal(),
                t.discountAmount(),
                t.netAmount(),
                t.vatAmount(),
                t.withholdingAmount(),
                t.otherTaxAmount(),
                t.totalAmount(),
                conv.tlAmount()),
            replaces,
            key);
    saveFlush(expense);
    for (int i = 0; i < r.lines().size(); i++) {
      SaveExpenseLineRequest line = r.lines().get(i);
      ExpenseCalcAmounts a = calc.lines().get(i);
      lines.save(
          new ExpenseLine(
              expense.getId(),
              i + 1,
              blankToNull(line.description()),
              line.quantity(),
              blankToNull(line.unit()),
              line.unitPrice(),
              new ExpenseLineAmounts(
                  a.subTotal(),
                  orZero(line.discountRate()),
                  a.discountAmount(),
                  a.netAmount(),
                  line.vatRate(),
                  a.vatAmount(),
                  a.withholdingAmount(),
                  a.otherTaxAmount(),
                  a.totalAmount())));
    }
    // Satırlar defter/settlement yazımından önce yazılır.
    lines.flush();
    String description = describe(item, expense);
    if (r.paymentMethod() == ExpensePaymentMethod.ACCOUNT) {
      ledger.post(
          new Posting(
              supplier.getId(),
              r.branchId(),
              Direction.CREDIT,
              total,
              r.invoiceDate(),
              description,
              SOURCE,
              expense.getId(),
              conv.rate()));
    } else {
      Settlement settlement =
          settlements.create(
              SettlementType.PAYMENT,
              new SettlementRequest(
                  r.paymentMethod() == ExpensePaymentMethod.CASH
                      ? SettlementMethod.CASH
                      : SettlementMethod.BANK,
                  null,
                  r.branchId(),
                  r.fundAccountId(),
                  item.getId(),
                  null,
                  null,
                  total,
                  r.invoiceDate(),
                  description,
                  conv.rate()),
              SOURCE + ":" + expense.getId(),
              null);
      // Settlement yolu kalıcılık bağlamını temizleyebilir: masraf yeniden okunup bağlanır.
      expense = expenses.findAnyById(expense.getId()).orElseThrow();
      expense.linkSettlement(settlement.getId());
      expenses.flush();
    }
    audit.record(
        AuditEvent.EXPENSE_CREATED,
        target(expense.getId()),
        "method=" + r.paymentMethod() + ",total=" + t.totalAmount() + r.currency());
    return expense;
  }

  /**
   * Eşzamanlı aynı anahtar: ikinci istek 409 {@code IDEMPOTENCY_IN_PROGRESS} (uç yeniden dener).
   */
  private void saveFlush(Expense expense) {
    try {
      expenses.saveAndFlush(expense);
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

  private static String describe(ExpenseItem item, Expense expense) {
    String text = item.getName() + " masrafı";
    if (expense.getInvoiceNumber() != null) {
      text += " - " + expense.getInvoiceNumber();
    }
    return LedgerDescriptions.fit(text);
  }

  private static ExpenseLineInput input(SaveExpenseLineRequest line) {
    return new ExpenseLineInput(
        line.quantity(),
        line.unitPrice(),
        line.discountRate(),
        line.vatRate(),
        line.withholdingAmount(),
        line.otherTaxAmount());
  }

  /** Bağlam: türe karşılık gelen tek kimlik; kaydın şubesi doluysa şirketi aynı olmalı. */
  private ExpenseContext context(SaveExpenseRequest r, UUID companyId) {
    ExpenseContextType type = r.contextType();
    UUID[] ids = {r.vehicleId(), r.shipmentId(), r.warehouseId(), r.driverId()};
    long filled = Arrays.stream(ids).filter(java.util.Objects::nonNull).count();
    UUID wanted =
        switch (type) {
          case GENERAL -> null;
          case VEHICLE -> r.vehicleId();
          case SHIPMENT -> r.shipmentId();
          case WAREHOUSE -> r.warehouseId();
          case DRIVER -> r.driverId();
        };
    if (type == ExpenseContextType.GENERAL ? filled != 0 : wanted == null || filled != 1) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "EXPENSE_CONTEXT_INVALID",
          "Masraf bağlamı yalnız seçilen türün kaydını içermelidir.");
    }
    if (type == ExpenseContextType.GENERAL) {
      return ExpenseContext.general();
    }
    Optional<ExpenseOptionRow> row =
        switch (type) {
          case VEHICLE -> queries.vehicle(wanted);
          case SHIPMENT -> queries.shipment(wanted);
          case WAREHOUSE -> queries.warehouse(wanted);
          default -> queries.driver(wanted);
        };
    UUID contextBranch =
        row.orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND,
                        "EXPENSE_CONTEXT_NOT_FOUND",
                        "Masraf bağlamındaki kayıt bulunamadı."))
            .getBranchId();
    if (contextBranch != null && !companyId.equals(companies.companyOf(contextBranch))) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_MISMATCH", "Bağlam kaydı başka şirkete ait.");
    }
    return new ExpenseContext(type, r.vehicleId(), r.shipmentId(), r.warehouseId(), r.driverId());
  }

  /** Belge türü: PAYABLE, seçilebilir, etkin ve ceza dışı (OK-12.7-11). */
  private void requireDocumentType(String code) {
    boolean valid =
        documentTypes
            .findById(new AccountDocumentType.Key(AccountDocumentSide.PAYABLE, code))
            .filter(t -> t.isSelectable() && t.isActive() && !t.isPenalty())
            .isPresent();
    if (!valid) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DOCUMENT_TYPE_INVALID", "Belge türü geçersiz.");
    }
  }

  /** Ödeme şekli kuralları; Cari'de tedarikçi carisini döner. */
  private Account requirePayment(SaveExpenseRequest r, UUID companyId) {
    if (r.paymentMethod() == ExpensePaymentMethod.ACCOUNT) {
      if (r.supplierAccountId() == null) {
        throw badRequest("EXPENSE_SUPPLIER_REQUIRED", "Cari masrafta tedarikçi seçilmelidir.");
      }
      if (r.fundAccountId() != null) {
        throw badRequest("EXPENSE_FUND_NOT_ALLOWED", "Cari masrafta kasa/banka seçilemez.");
      }
      Account account =
          accounts
              .findById(r.supplierAccountId())
              .filter(Account::isActive)
              .orElseThrow(
                  () ->
                      new BusinessException(
                          HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
      if (account.getType() == AccountType.EMPLOYEE) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "EXPENSE_SUPPLIER_INVALID",
            "Personel carisine masraf yazılamaz.");
      }
      identityRule.require(account, companyId);
      return account;
    }
    if (r.fundAccountId() == null) {
      throw badRequest("EXPENSE_FUND_REQUIRED", "Nakit/Banka masrafta kasa/banka seçilmelidir.");
    }
    if (r.supplierAccountId() != null) {
      throw badRequest("EXPENSE_SUPPLIER_NOT_ALLOWED", "Nakit/Banka masrafta tedarikçi seçilemez.");
    }
    funds
        .findById(r.fundAccountId())
        .filter(fund -> !companyId.equals(fund.getCompanyId()))
        .ifPresent(
            fund -> {
              throw new BusinessException(
                  HttpStatus.UNPROCESSABLE_ENTITY,
                  "COMPANY_MISMATCH",
                  "Kasa/banka hesabı seçilen iş yerinin şirketine ait değil.");
            });
    return null;
  }

  private static void requirePaymentPermission(ExpensePaymentMethod method, boolean canPay) {
    if (method != ExpensePaymentMethod.ACCOUNT && !canPay) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN,
          "PAYMENT_PERMISSION_REQUIRED",
          "Nakit/Banka masraf için ödeme yetkisi gerekir.");
    }
  }

  // --- okuma

  /** Tek masraf (iptal edilmiş dahil); kapsam dışı 403. */
  @Transactional(readOnly = true)
  public ExpenseDetailResponse get(UUID id) {
    Expense expense = expenses.findAnyById(id).orElseThrow(ExpenseService::notFound);
    scope.requireVisible(expense.getBranchId());
    return detail(expense);
  }

  @Transactional(readOnly = true)
  public PageResponse<ExpenseListItemResponse> list(ExpenseSearch s, int page, int size) {
    BranchFilter f = scope.filter(s.companyId(), s.branchIds());
    LocalDate from = s.from() == null ? MIN_DATE : s.from();
    LocalDate to = s.to() == null ? MAX_DATE : s.to();
    boolean allItems = s.expenseItemId() == null;
    UUID itemId = allItems ? BranchFilter.NONE : s.expenseItemId();
    String currency = s.currency() == null ? "" : s.currency().trim().toUpperCase();
    List<ExpenseListItemResponse> content =
        queries
            .rows(
                f.companyId() == null,
                companyOrNone(f),
                f.allBranches(),
                f.branchIds(),
                from,
                to,
                allItems,
                itemId,
                currency,
                size,
                (long) page * size)
            .stream()
            .map(ExpenseService::toItem)
            .toList();
    long total =
        queries.count(
            f.companyId() == null,
            companyOrNone(f),
            f.allBranches(),
            f.branchIds(),
            from,
            to,
            allItems,
            itemId,
            currency);
    int pages = (int) ((total + size - 1) / size);
    return new PageResponse<>(content, page, size, total, pages);
  }

  /** Kalem özeti (ZTO IndexExpenses): para birimi kırılımlı toplam ve son tedarikçi. */
  @Transactional(readOnly = true)
  public List<ExpenseItemSummaryResponse> summary(
      LocalDate from, LocalDate to, UUID companyId, List<UUID> branchIds) {
    BranchFilter f = scope.filter(companyId, branchIds);
    LocalDate start = from == null ? MIN_DATE : from;
    LocalDate end = to == null ? MAX_DATE : to;
    boolean all = f.companyId() == null;
    UUID company = companyOrNone(f);
    Map<UUID, List<ExpenseCurrencyTotalResponse>> totals = new HashMap<>();
    queries
        .itemCurrencyTotals(all, company, f.allBranches(), f.branchIds(), start, end)
        .forEach(
            row ->
                totals
                    .computeIfAbsent(row.getExpenseItemId(), k -> new ArrayList<>())
                    .add(
                        new ExpenseCurrencyTotalResponse(
                            row.getCurrency(), row.getCount(), row.getTotalAmount())));
    Map<UUID, ExpenseSupplierRow> suppliers =
        queries.lastSuppliers(all, company, f.allBranches(), f.branchIds(), start, end).stream()
            .collect(Collectors.toMap(ExpenseSupplierRow::getExpenseItemId, Function.identity()));
    return queries.itemSummary(all, company, f.allBranches(), f.branchIds(), start, end).stream()
        .map(
            row -> {
              ExpenseSupplierRow supplier = suppliers.get(row.getExpenseItemId());
              return new ExpenseItemSummaryResponse(
                  row.getExpenseItemId(),
                  row.getExpenseItemName(),
                  row.getExpenseItemCode(),
                  row.getExpenseTypeName(),
                  supplier == null ? null : supplier.getAccountId(),
                  supplier == null ? null : supplier.getName(),
                  supplier == null ? null : supplier.getTaxNumberMasked(),
                  supplier == null ? null : supplier.getPhone(),
                  supplier == null ? null : supplier.getCity(),
                  splitNames(row.getBranchNames()),
                  row.getInvoiceCount(),
                  totals.getOrDefault(row.getExpenseItemId(), List.of()),
                  row.getLastInvoiceDate());
            })
        .toList();
  }

  /** Ayın masrafları gün bazında ve tüm zamanların para birimi toplamları (ZTO takvim). */
  @Transactional(readOnly = true)
  public ExpenseCalendarResponse calendar(
      int year, int month, UUID companyId, List<UUID> branchIds) {
    if (month < 1 || month > 12 || year < 1900 || year > 9999) {
      throw badRequest("DATE_INVALID", "Geçersiz yıl/ay.");
    }
    BranchFilter f = scope.filter(companyId, branchIds);
    YearMonth ym = YearMonth.of(year, month);
    boolean all = f.companyId() == null;
    UUID company = companyOrNone(f);
    Map<LocalDate, List<ExpenseCalendarEntryResponse>> byDay = new LinkedHashMap<>();
    List<ExpenseListRow> rows =
        new ArrayList<>(
            queries.rows(
                all,
                company,
                f.allBranches(),
                f.branchIds(),
                ym.atDay(1),
                ym.atEndOfMonth(),
                true,
                BranchFilter.NONE,
                "",
                CALENDAR_LIMIT,
                0));
    rows.sort(
        (a, b) -> {
          int c = a.getInvoiceDate().compareTo(b.getInvoiceDate());
          return c != 0 ? c : a.getCreatedAt().compareTo(b.getCreatedAt());
        });
    for (ExpenseListRow row : rows) {
      byDay
          .computeIfAbsent(row.getInvoiceDate(), d -> new ArrayList<>())
          .add(
              new ExpenseCalendarEntryResponse(
                  row.getId(),
                  row.getExpenseItemId(),
                  row.getExpenseItemName(),
                  row.getExpenseTypeName(),
                  row.getInvoiceNumber(),
                  ExpenseContextType.valueOf(row.getContextType()),
                  row.getContextLabel(),
                  row.getSupplierName(),
                  ExpenseDepartment.valueOf(row.getDepartment()),
                  row.getInvoiceDate(),
                  row.getCurrency(),
                  row.getTotalAmount()));
    }
    List<ExpenseCalendarDayResponse> days =
        byDay.entrySet().stream()
            .map(e -> new ExpenseCalendarDayResponse(e.getKey(), List.copyOf(e.getValue())))
            .toList();
    List<ExpenseAllTimeResponse> allTime =
        queries
            .currencyTotals(all, company, f.allBranches(), f.branchIds(), MIN_DATE, MAX_DATE)
            .stream()
            .map(
                row ->
                    new ExpenseAllTimeResponse(
                        row.getCurrency(),
                        row.getCount(),
                        row.getNetAmount(),
                        row.getVatAmount(),
                        row.getDiscountAmount(),
                        row.getTotalAmount()))
            .toList();
    return new ExpenseCalendarResponse(year, month, days, allTime);
  }

  /** Son {@code months} ay (bu ay dahil) × masraf türü TL toplamı. */
  @Transactional(readOnly = true)
  public List<ExpenseMonthlyResponse> monthly(int months, UUID companyId, List<UUID> branchIds) {
    if (months < 1 || months > 24) {
      throw badRequest("MONTHS_INVALID", "Ay sayısı 1 ile 24 arasında olmalıdır.");
    }
    BranchFilter f = scope.filter(companyId, branchIds);
    LocalDate today = clock.today();
    LocalDate start = YearMonth.from(today).minusMonths(months - 1L).atDay(1);
    return queries
        .monthly(
            f.companyId() == null,
            companyOrNone(f),
            f.allBranches(),
            f.branchIds(),
            start,
            YearMonth.from(today).atEndOfMonth())
        .stream()
        .map(
            row ->
                new ExpenseMonthlyResponse(
                    row.getMonth(),
                    row.getExpenseTypeId(),
                    row.getExpenseTypeName(),
                    row.getTlAmount()))
        .toList();
  }

  /**
   * Bağlam seçenekleri (en çok 20). {@code branchId} verilirse görünür olmalı ve seçenekler o iş
   * yerinin şirketindeki ya da şubesiz kayıtlarla sınırlanır.
   */
  @Transactional(readOnly = true)
  public List<ExpenseContextOptionResponse> contextOptions(
      ExpenseContextType type, String q, UUID branchId) {
    boolean all = branchId == null;
    UUID company = BranchFilter.NONE;
    if (!all) {
      scope.requireVisible(branchId);
      company = companies.companyOf(branchId);
    }
    String pattern = FundQueryService.likePattern(q);
    List<ExpenseOptionRow> rows =
        switch (type) {
          case VEHICLE -> queries.vehicleOptions(pattern, all, company);
          case SHIPMENT ->
              queries.shipmentOptions(
                  pattern, clock.startOf(clock.today().minus(365, ChronoUnit.DAYS)), all, company);
          case WAREHOUSE -> queries.warehouseOptions(pattern, all, company);
          case DRIVER -> queries.driverOptions(pattern, all, company);
          case GENERAL ->
              throw badRequest("EXPENSE_CONTEXT_INVALID", "Genel masrafın bağlam seçeneği yoktur.");
        };
    return rows.stream()
        .map(
            row -> new ExpenseContextOptionResponse(row.getId(), row.getLabel(), row.getBranchId()))
        .toList();
  }

  // --- eşleme

  private ExpenseDetailResponse detail(Expense e) {
    Optional<ExpenseHeaderRow> header = queries.header(e.getId());
    ExpenseHeaderRow h = header.orElse(null);
    FundAccount fund =
        e.getSettlementId() == null
            ? null
            : settlementRepository
                .findById(e.getSettlementId())
                .flatMap(st -> funds.findById(st.getFundAccountId()))
                .orElse(null);
    List<ExpenseLineResponse> lineResponses =
        lines.findByExpenseIdOrderByLineNo(e.getId()).stream()
            .map(
                l ->
                    new ExpenseLineResponse(
                        l.getId(),
                        l.getLineNo(),
                        l.getDescription(),
                        l.getQuantity(),
                        l.getUnit(),
                        l.getUnitPrice(),
                        l.getSubTotal(),
                        l.getDiscountRate(),
                        l.getDiscountAmount(),
                        l.getNetAmount(),
                        l.getVatRate(),
                        l.getVatAmount(),
                        l.getWithholdingAmount(),
                        l.getOtherTaxAmount(),
                        l.getTotalAmount()))
            .toList();
    return new ExpenseDetailResponse(
        e.getId(),
        e.getCompanyId(),
        e.getBranchId(),
        h == null ? null : h.getBranchName(),
        e.getExpenseItemId(),
        h == null ? null : h.getExpenseItemName(),
        h == null ? null : h.getExpenseTypeName(),
        e.getContextType(),
        e.getVehicleId(),
        e.getShipmentId(),
        e.getWarehouseId(),
        e.getDriverId(),
        h == null ? null : h.getContextLabel(),
        e.getPaymentMethod(),
        e.getSupplierAccountId(),
        h == null ? null : h.getSupplierName(),
        fund == null ? null : fund.getId(),
        fund == null ? null : fund.getName(),
        e.getSettlementId(),
        e.getInvoiceNumber(),
        e.getInvoiceDate(),
        e.getDueDate(),
        e.getDocumentType(),
        e.getDepartment(),
        e.getDescription(),
        e.getCurrency(),
        e.getExchangeRate(),
        e.getSubTotal(),
        e.getDiscountAmount(),
        e.getNetAmount(),
        e.getVatAmount(),
        e.getWithholdingAmount(),
        e.getOtherTaxAmount(),
        e.getTotalAmount(),
        e.getTlAmount(),
        e.getStatus() == null ? ExpenseStatus.POSTED : e.getStatus(),
        e.getReplacesExpenseId(),
        e.getReversedOn(),
        e.getReverseReason(),
        lineResponses,
        e.getCreatedAt(),
        e.getCreatedBy());
  }

  private static ExpenseListItemResponse toItem(ExpenseListRow row) {
    return new ExpenseListItemResponse(
        row.getId(),
        row.getInvoiceNumber(),
        row.getDescription(),
        row.getExpenseItemId(),
        row.getExpenseItemName(),
        row.getExpenseTypeName(),
        ExpenseDepartment.valueOf(row.getDepartment()),
        row.getCompanyId(),
        row.getBranchId(),
        row.getBranchName(),
        ExpenseContextType.valueOf(row.getContextType()),
        row.getContextLabel(),
        ExpensePaymentMethod.valueOf(row.getPaymentMethod()),
        row.getSupplierName(),
        row.getCurrency(),
        row.getTotalAmount(),
        row.getTlAmount(),
        row.getInvoiceDate(),
        row.getDueDate(),
        row.getDocumentType(),
        Boolean.TRUE.equals(row.getHasDocument()),
        row.getCreatedAt());
  }

  private static List<String> splitNames(String joined) {
    return joined == null || joined.isEmpty() ? List.of() : List.of(joined.split(SEPARATOR));
  }

  private static UUID companyOrNone(BranchFilter f) {
    return f.companyId() == null ? BranchFilter.NONE : f.companyId();
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static String target(UUID id) {
    return "EXPENSE:" + id;
  }

  private static BusinessException badRequest(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }

  private static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "EXPENSE_NOT_FOUND", "Masraf bulunamadı.");
  }

  private static BusinessException itemNotFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "EXPENSE_ITEM_NOT_FOUND", "Masraf kalemi bulunamadı.");
  }
}
