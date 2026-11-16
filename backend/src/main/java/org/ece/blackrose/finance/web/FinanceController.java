package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.BalanceGroupBy;
import org.ece.blackrose.finance.domain.FinanceTypes.DailyReportSort;
import org.ece.blackrose.finance.domain.FinanceTypes.DateBasis;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseContextType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.HeatmapPeriod;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.repository.FinanceRepositories.CurrencyRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseTypeRepository;
import org.ece.blackrose.finance.service.AccountService;
import org.ece.blackrose.finance.service.AccountService.AccountListQuery;
import org.ece.blackrose.finance.service.AccountService.StatementQuery;
import org.ece.blackrose.finance.service.ExpenseItemService;
import org.ece.blackrose.finance.service.ExpenseService;
import org.ece.blackrose.finance.service.ExpenseService.ExpenseSearch;
import org.ece.blackrose.finance.service.FundQueryService;
import org.ece.blackrose.finance.service.FundQueryService.FundSearch;
import org.ece.blackrose.finance.service.FundService;
import org.ece.blackrose.finance.service.InstrumentQueryService;
import org.ece.blackrose.finance.service.InstrumentQueryService.InstrumentSearch;
import org.ece.blackrose.finance.service.InstrumentService;
import org.ece.blackrose.finance.service.PaymentPlanService;
import org.ece.blackrose.finance.service.PaymentPlanService.PlanSearch;
import org.ece.blackrose.finance.service.PurchaseInvoiceService;
import org.ece.blackrose.finance.service.RateRefresher;
import org.ece.blackrose.finance.service.SettlementQueryService;
import org.ece.blackrose.finance.service.SettlementQueryService.DailyReportFilter;
import org.ece.blackrose.finance.service.SettlementQueryService.SettlementSearch;
import org.ece.blackrose.finance.service.SettlementService;
import org.ece.blackrose.finance.web.FinanceDtos.AccountResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AccountTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CreateFundRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePurchaseInvoiceRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CurrencyResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyReportResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DashboardResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExchangeRateResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseCalendarResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseContextOptionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemActiveRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemSummaryResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseListItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseMonthlyResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseTypeResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FinanceSettingsResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FundTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.HeatmapCell;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentCustodyRequest;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentListItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentMovementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentNumberCheckResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentTransitionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentUpdateRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ManualAccountTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ManualFundTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.OpenInvoiceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PayPlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PlanEventResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PlanNoteRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PlanResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PostponePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PurchaseInvoiceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ReverseExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ReverseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ReviseExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseItemRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseTypeRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveFinanceSettingsRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveThresholdRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementCheckResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementCorrectionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementListItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ThresholdResponse;
import org.ece.blackrose.finance.web.FinanceDtos.UpdateFundRequest;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/finance")
public class FinanceController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";
  private static final String POST = "hasAuthority('FINANCE_PAYMENT_CREATE')";
  private static final String APPROVE = "hasAuthority('FINANCE_APPROVE')";
  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
  private static final int ACCOUNT_PAGE_MAX = 2000;
  private static final int EXPENSE_PAGE_MAX = 500;

  private final AccountService accounts;
  private final FundService funds;
  private final FundQueryService fundQueries;
  private final InstrumentService instruments;
  private final InstrumentQueryService instrumentQueries;
  private final SettlementService settlements;
  private final SettlementQueryService settlementQueries;
  private final PurchaseInvoiceService invoices;
  private final PaymentPlanService plans;
  private final ExpenseTypeRepository expenseTypes;
  private final ExpenseItemService expenseItemService;
  private final ExpenseService expenseService;
  private final CurrencyRepository currencies;
  private final ExchangeRateRepository rates;
  private final RateRefresher rateRefresher;
  private final FinanceMapper mapper;
  private final BranchScopeService scope;

  @SuppressWarnings("java:S107")
  public FinanceController(
      AccountService accounts,
      FundService funds,
      FundQueryService fundQueries,
      InstrumentService instruments,
      InstrumentQueryService instrumentQueries,
      SettlementService settlements,
      SettlementQueryService settlementQueries,
      PurchaseInvoiceService invoices,
      PaymentPlanService plans,
      ExpenseTypeRepository expenseTypes,
      ExpenseItemService expenseItemService,
      ExpenseService expenseService,
      CurrencyRepository currencies,
      ExchangeRateRepository rates,
      RateRefresher rateRefresher,
      FinanceMapper mapper,
      BranchScopeService scope) {
    this.scope = scope;
    this.accounts = accounts;
    this.funds = funds;
    this.fundQueries = fundQueries;
    this.instruments = instruments;
    this.instrumentQueries = instrumentQueries;
    this.settlements = settlements;
    this.settlementQueries = settlementQueries;
    this.invoices = invoices;
    this.plans = plans;
    this.expenseTypes = expenseTypes;
    this.expenseItemService = expenseItemService;
    this.expenseService = expenseService;
    this.currencies = currencies;
    this.rates = rates;
    this.rateRefresher = rateRefresher;
    this.mapper = mapper;
  }

  // Cari

  /**
   * Kart listesi. {@code branchIds} yalnız bakiyeleri süzer; {@code active} yoksa hepsi (MUI).
   * Sayfa boyutu bu uçta en çok {@value #ACCOUNT_PAGE_MAX} (ZTO istemci modu tüm kartları çeker).
   */
  @GetMapping("/accounts")
  @PreAuthorize(VIEW)
  PageResponse<AccountResponse> listAccounts(
      @RequestParam(required = false) String search,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<AccountType> types,
      @RequestParam(required = false) List<String> subGroups,
      @RequestParam(required = false) Boolean active,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) BalanceGroupBy balanceGroupBy,
      @RequestParam(defaultValue = "false") boolean includePlanSummary,
      @RequestParam(name = "size", required = false) Integer size,
      Pageable pageable) {
    Pageable page =
        size == null
            ? pageable
            : PageRequest.of(
                pageable.getPageNumber(),
                Math.max(1, Math.min(size, ACCOUNT_PAGE_MAX)),
                pageable.getSort());
    return accounts.list(
        new AccountListQuery(
            search,
            companyId,
            types,
            subGroups,
            active,
            branchIds,
            balanceGroupBy,
            includePlanSummary),
        page);
  }

  @GetMapping("/accounts/{id}")
  @PreAuthorize(VIEW)
  AccountResponse getAccount(
      @PathVariable UUID id,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return accounts.get(id, companyId, branchIds);
  }

  @PostMapping("/accounts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  AccountResponse createAccount(@Valid @RequestBody SaveAccountRequest request) {
    if (request.branchId() != null) {
      scope.requireNew(request.branchId());
    }
    return accounts.create(request);
  }

  @PutMapping("/accounts/{id}")
  @PreAuthorize(MANAGE)
  AccountResponse updateAccount(
      @PathVariable UUID id, @Valid @RequestBody SaveAccountRequest request) {
    return accounts.update(id, request);
  }

  @DeleteMapping("/accounts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(MANAGE)
  void deleteAccount(@PathVariable UUID id) {
    accounts.delete(id);
  }

  @PostMapping("/accounts/{id}/transactions")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  AccountTransactionResponse postAccountTransaction(
      @PathVariable UUID id, @Valid @RequestBody ManualAccountTransactionRequest request) {
    scope.requireNew(request.branchId());
    return mapper.toResponse(accounts.postManual(id, request));
  }

  @PostMapping("/accounts/transactions/{id}/reverse")
  @PreAuthorize(POST)
  AccountTransactionResponse reverseAccountTransaction(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(accounts.reverseManual(id, request.date(), request.description()));
  }

  /**
   * Ekstre (12.1 §4.5): {@code currency} boşsa çok para birimli; {@code dateBasis=DOCUMENT} belge
   * tarihine göre süzer ve sıralar. Sayfa boyutu en çok {@value AccountService#STATEMENT_PAGE_MAX}.
   */
  @GetMapping("/accounts/{id}/statement")
  @PreAuthorize(VIEW)
  StatementResponse accountStatement(
      @PathVariable UUID id,
      @RequestParam(required = false) String currency,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) DateBasis dateBasis,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return accounts.statement(
        id, new StatementQuery(currency, from, to, companyId, branchIds, dateBasis), page, size);
  }

  // Banka ve kasa

  /**
   * Süzgeçli hesap listesi (12.2 §4.1); sıra tür, hesap türü, banka adı, ad. {@code asOf} boşsa
   * bugün ({@code currentBalance}, {@code futureNet}).
   */
  @GetMapping("/funds")
  @PreAuthorize(VIEW)
  List<FundResponse> listFunds(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(name = "branchId", required = false) List<UUID> branchIds,
      @RequestParam(required = false) FundKind kind,
      @RequestParam(required = false) FundAccountType accountType,
      @RequestParam(required = false) Boolean active,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate asOf) {
    return fundQueries.list(
        new FundSearch(companyId, branchIds, kind, accountType, active, currency, asOf));
  }

  @PostMapping("/funds")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  FundResponse createFund(@Valid @RequestBody CreateFundRequest request) {
    scope.requireNew(request.branchId());
    return funds.create(request);
  }

  @PutMapping("/funds/{id}")
  @PreAuthorize(MANAGE)
  FundResponse updateFund(@PathVariable UUID id, @Valid @RequestBody UpdateFundRequest request) {
    return funds.update(id, request);
  }

  @DeleteMapping("/funds/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(MANAGE)
  void deleteFund(@PathVariable UUID id) {
    funds.delete(id);
  }

  @PostMapping("/funds/{id}/transactions")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  FundTransactionResponse postFundTransaction(
      @PathVariable UUID id, @Valid @RequestBody ManualFundTransactionRequest request) {
    return mapper.toResponse(funds.postManual(id, request));
  }

  @PostMapping("/funds/transactions/{id}/reverse")
  @PreAuthorize(POST)
  FundTransactionResponse reverseFundTransaction(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(funds.reverseManual(id, request.date(), request.description()));
  }

  @GetMapping("/funds/{id}/statement")
  @PreAuthorize(VIEW)
  StatementResponse fundStatement(
      @PathVariable UUID id,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      Pageable pageable) {
    return funds.statement(id, from, to, unsorted(pageable));
  }

  // Çek ve senet

  /**
   * Çek/senet listesi (12.3 §4.2). Sayfalama açık {@code page}/{@code size} ({@code size} 1–500);
   * {@code status} ve {@code branchIds} tekrarlı.
   */
  @GetMapping("/instruments")
  @PreAuthorize(VIEW)
  @SuppressWarnings("java:S107")
  PageResponse<InstrumentListItemResponse> listInstruments(
      @RequestParam(required = false) InstrumentKind kind,
      @RequestParam(required = false) InstrumentDirection direction,
      @RequestParam(name = "status", required = false) List<InstrumentStatus> statuses,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate dueFrom,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate dueTo,
      @RequestParam(required = false) UUID checkBookId,
      @RequestParam(required = false) NoteType noteType,
      @RequestParam(required = false) Boolean endorsable,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    InstrumentSearch search =
        new InstrumentSearch(
            kind,
            direction,
            statuses,
            accountId,
            dueFrom,
            dueTo,
            checkBookId,
            noteType,
            endorsable,
            q,
            companyId,
            branchIds);
    return PageResponse.from(instrumentQueries.list(search, page, size), item -> item);
  }

  /** Çek numarası ön denetimi (12.3 §3.9); {@code companyId} zorunlu. */
  @GetMapping("/instruments/check-number")
  @PreAuthorize(VIEW)
  InstrumentNumberCheckResponse checkInstrumentNumber(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(defaultValue = "CHECK") InstrumentKind kind,
      @RequestParam InstrumentDirection direction,
      @RequestParam String number,
      @RequestParam(required = false) String bankName,
      @RequestParam(required = false) UUID excludeId) {
    return instrumentQueries.checkNumber(companyId, kind, direction, number, bankName, excludeId);
  }

  @GetMapping("/instruments/{id}")
  @PreAuthorize(VIEW)
  InstrumentDetailResponse instrumentDetail(@PathVariable UUID id) {
    return instrumentQueries.detail(id);
  }

  @GetMapping("/instruments/{id}/movements")
  @PreAuthorize(VIEW)
  List<InstrumentMovementResponse> instrumentHistory(@PathVariable UUID id) {
    return instrumentQueries.movements(id);
  }

  @PostMapping("/instruments/{id}/transition")
  @PreAuthorize(POST)
  InstrumentListItemResponse transitionInstrument(
      @PathVariable UUID id, @Valid @RequestBody InstrumentTransitionRequest request) {
    return instrumentQueries.view(instruments.transition(id, request).getId());
  }

  /** Finansal olmayan alan düzeltmesi (12.3 §3.2; defter yazmaz). */
  @PatchMapping("/instruments/{id}")
  @PreAuthorize(POST)
  InstrumentListItemResponse updateInstrument(
      @PathVariable UUID id, @Valid @RequestBody InstrumentUpdateRequest request) {
    return instrumentQueries.view(instruments.updateDetails(id, request).getId());
  }

  /** Portföydeki alınan çekin emanet kasası (12.3 §3.2; para hareketi değil). */
  @PutMapping("/instruments/{id}/custody")
  @PreAuthorize(POST)
  InstrumentListItemResponse moveInstrumentCustody(
      @PathVariable UUID id, @Valid @RequestBody InstrumentCustodyRequest request) {
    return instrumentQueries.view(instruments.moveCustody(id, request).getId());
  }

  // Ödeme ve tahsilat

  /**
   * Ödeme listesi (12.2a §4.2). Sayfalama açık {@code page}/{@code size} parametreleriyle ({@code
   * size} 1–500; global 200 sınırı uygulanmaz — Rev 1 F1); {@code sort} tekrarlı {@code alan,yön}.
   * Parametresiz çağrı tüm durumları tarih sınırı olmadan döner (MUI geriye uyumu).
   */
  @GetMapping("/payments")
  @PreAuthorize(VIEW)
  PageResponse<SettlementListItemResponse> listPayments(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) AccountType accountType,
      @RequestParam(required = false) String subGroup,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) List<UUID> fundAccountIds,
      @RequestParam(name = "method", required = false) List<DocumentPaymentMethod> methods,
      @RequestParam(required = false) SettlementStatus status,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) UUID counterpartyBankAccountId,
      @RequestParam(required = false) Boolean hasAccount,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestParam(required = false) List<String> sort) {
    return PageResponse.from(
        settlementQueries.list(
            SettlementType.PAYMENT,
            new SettlementSearch(
                companyId,
                accountId,
                accountType,
                subGroup,
                branchIds,
                fundAccountIds,
                methods,
                status,
                from,
                to,
                q,
                counterpartyBankAccountId,
                hasAccount),
            page,
            size,
            sort),
        item -> item);
  }

  @PostMapping("/payments")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  SettlementResponse createPayment(
      @Valid @RequestBody SettlementRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    scope.requireNew(request.branchId());
    return mapper.toResponse(
        settlements.createByUser(SettlementType.PAYMENT, request, idempotencyKey));
  }

  /** Tahsilat listesi; süzgeçler ve sayfalama ödeme listesiyle aynı. */
  @GetMapping("/collections")
  @PreAuthorize(VIEW)
  PageResponse<SettlementListItemResponse> listCollections(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) AccountType accountType,
      @RequestParam(required = false) String subGroup,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) List<UUID> fundAccountIds,
      @RequestParam(name = "method", required = false) List<DocumentPaymentMethod> methods,
      @RequestParam(required = false) SettlementStatus status,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) UUID counterpartyBankAccountId,
      @RequestParam(required = false) Boolean hasAccount,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      @RequestParam(required = false) List<String> sort) {
    return PageResponse.from(
        settlementQueries.list(
            SettlementType.COLLECTION,
            new SettlementSearch(
                companyId,
                accountId,
                accountType,
                subGroup,
                branchIds,
                fundAccountIds,
                methods,
                status,
                from,
                to,
                q,
                counterpartyBankAccountId,
                hasAccount),
            page,
            size,
            sort),
        item -> item);
  }

  @PostMapping("/collections")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  SettlementResponse createCollection(
      @Valid @RequestBody SettlementRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    scope.requireNew(request.branchId());
    return mapper.toResponse(
        settlements.createByUser(SettlementType.COLLECTION, request, idempotencyKey));
  }

  /**
   * Ödeme/tahsilat önizlemesi (12.2 §4.5): şirket dağılımı uyarısı ve eksik fatura; yazmaz. Kayıt
   * uçlarıyla aynı kapı ve doğrulamalar. {@code correctsSettlementId}: düzeltme önizlemesi (eski
   * ödeme borçtan düşülmüş gibi; 12.2a §3.4).
   */
  @PostMapping("/settlements/check")
  @PreAuthorize(POST)
  SettlementCheckResponse checkSettlement(
      @RequestParam SettlementType type,
      @RequestParam(required = false) UUID correctsSettlementId,
      @Valid @RequestBody SettlementRequest request) {
    scope.requireNew(request.branchId());
    return settlements.check(type, request, correctsSettlementId);
  }

  /**
   * Düzeltme (ZTO "Düzenle"; 12.2a §3.6): eski kayıt ters kayıtla iptal, yeni kayıt yazılır. Yeni
   * iş yeri her durumda yeni kayıt kurallarından geçer (pasif iş yeri/şirket 422; SEC-03).
   */
  @PostMapping("/settlements/{id}/correct")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  SettlementResponse correctSettlement(
      @PathVariable UUID id,
      @Valid @RequestBody SettlementCorrectionRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    scope.requireNew(request.replacement().branchId());
    return mapper.toResponse(settlements.correct(id, request, idempotencyKey));
  }

  /**
   * Ödeme/tahsilat detayı: defter satırları (ters kayıtlar dahil), çek, plan, eşleşmeler. Personel
   * carili kayıt izinsiz kullanıcıya 404 {@code SETTLEMENT_NOT_FOUND}.
   */
  @GetMapping("/settlements/{id}")
  @PreAuthorize(VIEW)
  SettlementDetailResponse settlementDetail(@PathVariable UUID id) {
    return settlementQueries.detail(id);
  }

  /**
   * Eşleştirilebilir açık fatura kalemleri (en çok 200, en eski vade önce). {@code
   * excludeSettlementId}: düzeltilen kaydın eşleşmeleri serbest sayılır.
   */
  @GetMapping("/settlements/open-invoices")
  @PreAuthorize(VIEW)
  List<OpenInvoiceResponse> openInvoices(
      @RequestParam SettlementType type,
      @RequestParam UUID accountId,
      @RequestParam UUID branchId,
      @RequestParam String currency,
      @RequestParam(required = false) UUID excludeSettlementId) {
    return settlementQueries.openInvoices(type, accountId, branchId, currency, excludeSettlementId);
  }

  @PostMapping("/settlements/{id}/reverse")
  @PreAuthorize(POST)
  SettlementResponse reverseSettlement(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(settlements.reverse(id, request.date(), request.description()));
  }

  /**
   * Günlük ödeme/tahsilat raporu (12.2a §3.8): o tarihteki durum, fon bakiyeleri ve banka/kasaya
   * yansıyan çek hareketleri. Kapsam dışı ya da süzgeçle uyuşmayan fon sessizce atlanır; satır
   * sınırı 5000 (422 {@code RESULT_TOO_LARGE}).
   */
  @GetMapping("/reports/daily")
  @PreAuthorize(VIEW)
  DailyReportResponse dailyReport(
      @RequestParam SettlementType type,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> fundAccountIds,
      @RequestParam(required = false) String currency,
      @RequestParam(name = "method", required = false) List<DocumentPaymentMethod> methods,
      @RequestParam(required = false) DailyReportSort sort) {
    return settlementQueries.daily(
        type,
        date,
        new DailyReportFilter(branchIds, companyId, fundAccountIds, currency, methods),
        sort);
  }

  // Tedarikçi faturası

  @GetMapping("/purchase-invoices")
  @PreAuthorize(VIEW)
  PageResponse<PurchaseInvoiceResponse> listInvoices(
      @RequestParam(required = false) UUID companyId, Pageable pageable) {
    return PageResponse.from(invoices.list(companyId, pageable), mapper::toResponse);
  }

  @PostMapping("/purchase-invoices")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  PurchaseInvoiceResponse createInvoice(@Valid @RequestBody CreatePurchaseInvoiceRequest request) {
    scope.requireNew(request.branchId());
    return mapper.toResponse(invoices.create(request));
  }

  @PostMapping("/purchase-invoices/{id}/cancel")
  @PreAuthorize(POST)
  PurchaseInvoiceResponse cancelInvoice(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(invoices.cancel(id, request.date()));
  }

  // Ödeme planı

  @GetMapping("/payment-plans")
  @PreAuthorize(VIEW)
  PageResponse<PlanResponse> listPlans(
      @RequestParam(required = false) PlanStatus status,
      @RequestParam(required = false) List<PlanStatus> statuses,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) UUID companyId,
      Pageable pageable) {
    // status ve çoklu statuses birlikte gelirse birleşimleri süzülür (12.2a §4.2).
    List<PlanStatus> wanted = new ArrayList<>();
    if (status != null) {
      wanted.add(status);
    }
    if (statuses != null) {
      wanted.addAll(statuses);
    }
    return PageResponse.from(
        plans.list(new PlanSearch(wanted, accountId, companyId), pageable), mapper::toResponse);
  }

  @PostMapping("/payment-plans")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  PlanResponse createPlan(@Valid @RequestBody CreatePlanRequest request) {
    scope.requireNew(request.branchId());
    return mapper.toResponse(plans.createManual(request));
  }

  @GetMapping("/payment-plans/{id}/events")
  @PreAuthorize(VIEW)
  List<PlanEventResponse> planHistory(@PathVariable UUID id) {
    return plans.history(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/payment-plans/{id}/submit")
  @PreAuthorize(POST)
  PlanResponse submitPlan(@PathVariable UUID id) {
    return mapper.toResponse(plans.submit(id));
  }

  @PostMapping("/payment-plans/{id}/approve")
  @PreAuthorize(APPROVE)
  PlanResponse approvePlan(@PathVariable UUID id, @Valid @RequestBody PlanNoteRequest request) {
    return mapper.toResponse(plans.approve(id, request.note()));
  }

  @PostMapping("/payment-plans/{id}/reject")
  @PreAuthorize(APPROVE)
  PlanResponse rejectPlan(@PathVariable UUID id, @Valid @RequestBody PlanNoteRequest request) {
    return mapper.toResponse(plans.reject(id, request.note()));
  }

  @PostMapping("/payment-plans/{id}/cancel")
  @PreAuthorize(POST)
  PlanResponse cancelPlan(@PathVariable UUID id, @Valid @RequestBody PlanNoteRequest request) {
    return mapper.toResponse(plans.cancel(id, request.note()));
  }

  @PostMapping("/payment-plans/{id}/postpone")
  @PreAuthorize(POST)
  PlanResponse postponePlan(
      @PathVariable UUID id, @Valid @RequestBody PostponePlanRequest request) {
    return mapper.toResponse(plans.postpone(id, request));
  }

  @PostMapping("/payment-plans/{id}/pay")
  @PreAuthorize(POST)
  SettlementResponse payPlan(@PathVariable UUID id, @Valid @RequestBody PayPlanRequest request) {
    return mapper.toResponse(plans.pay(id, request));
  }

  @GetMapping("/payment-plans/heatmap")
  @PreAuthorize(VIEW)
  List<HeatmapCell> heatmap(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "DAY") HeatmapPeriod period,
      @RequestParam(required = false) UUID companyId) {
    return plans.heatmap(from, to, period, companyId);
  }

  @GetMapping("/dashboard")
  @PreAuthorize(VIEW)
  DashboardResponse dashboard(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today,
      @RequestParam(required = false) UUID companyId) {
    return plans.dashboard(today, companyId);
  }

  @GetMapping("/density-thresholds")
  @PreAuthorize(VIEW)
  List<ThresholdResponse> listThresholds() {
    return plans.listThresholds().stream().map(mapper::toResponse).toList();
  }

  @PutMapping("/density-thresholds/{currency}")
  @PreAuthorize(MANAGE)
  ThresholdResponse saveThreshold(
      @PathVariable String currency, @Valid @RequestBody SaveThresholdRequest request) {
    return mapper.toResponse(plans.saveThreshold(currency, request));
  }

  // Finans ayarları

  @GetMapping("/settings")
  @PreAuthorize(VIEW)
  FinanceSettingsResponse getSettings() {
    return new FinanceSettingsResponse(plans.settings().isAllowSelfApproval());
  }

  @PutMapping("/settings")
  @PreAuthorize(MANAGE)
  FinanceSettingsResponse saveSettings(@Valid @RequestBody SaveFinanceSettingsRequest request) {
    return new FinanceSettingsResponse(
        plans.updateSettings(request.allowSelfApproval()).isAllowSelfApproval());
  }

  // Gider tanımları

  @GetMapping("/expense-types")
  @PreAuthorize(VIEW)
  List<ExpenseTypeResponse> listExpenseTypes() {
    return expenseTypes.findAll().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/expense-types")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  ExpenseTypeResponse createExpenseType(@Valid @RequestBody SaveExpenseTypeRequest request) {
    return mapper.toResponse(expenseTypes.save(new ExpenseType(request.code(), request.name())));
  }

  @GetMapping("/expense-items")
  @PreAuthorize(VIEW)
  List<ExpenseItemResponse> listExpenseItems() {
    return expenseItemService.list();
  }

  /** Kod boşsa {@code MK-00001} dizisinden üretilir (12.7 §3.1). */
  @PostMapping("/expense-items")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  ExpenseItemResponse createExpenseItem(@Valid @RequestBody SaveExpenseItemRequest request) {
    return expenseItemService.create(request);
  }

  @PutMapping("/expense-items/{id}")
  @PreAuthorize(MANAGE)
  ExpenseItemResponse updateExpenseItem(
      @PathVariable UUID id, @Valid @RequestBody SaveExpenseItemRequest request) {
    return expenseItemService.update(id, request);
  }

  /** ZTO "Sil": aktif/pasif; sistem kalemi pasifleştirilemez (409 {@code EXPENSE_ITEM_SYSTEM}). */
  @PutMapping("/expense-items/{id}/active")
  @PreAuthorize(MANAGE)
  ExpenseItemResponse setExpenseItemActive(
      @PathVariable UUID id, @Valid @RequestBody ExpenseItemActiveRequest request) {
    return expenseItemService.setActive(id, request.active());
  }

  // Genel masraf (12.7 §4.2)

  @GetMapping("/expenses")
  @PreAuthorize(VIEW)
  PageResponse<ExpenseListItemResponse> listExpenses(
      @RequestParam(required = false) UUID expenseItemId,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return expenseService.list(
        new ExpenseSearch(expenseItemId, currency, from, to, companyId, branchIds),
        Math.max(0, page),
        Math.max(1, Math.min(size, EXPENSE_PAGE_MAX)));
  }

  @GetMapping("/expenses/summary")
  @PreAuthorize(VIEW)
  List<ExpenseItemSummaryResponse> expenseSummary(
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return expenseService.summary(from, to, companyId, branchIds);
  }

  @GetMapping("/expenses/calendar")
  @PreAuthorize(VIEW)
  ExpenseCalendarResponse expenseCalendar(
      @RequestParam int year,
      @RequestParam int month,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return expenseService.calendar(year, month, companyId, branchIds);
  }

  @GetMapping("/expenses/monthly")
  @PreAuthorize(VIEW)
  List<ExpenseMonthlyResponse> expenseMonthly(
      @RequestParam(defaultValue = "6") int months,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return expenseService.monthly(months, companyId, branchIds);
  }

  @GetMapping("/expenses/context-options")
  @PreAuthorize(VIEW)
  List<ExpenseContextOptionResponse> expenseContextOptions(
      @RequestParam ExpenseContextType type,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) UUID branchId) {
    return expenseService.contextOptions(type, q, branchId);
  }

  @GetMapping("/expenses/{id}")
  @PreAuthorize(VIEW)
  ExpenseDetailResponse getExpense(@PathVariable UUID id) {
    return expenseService.get(id);
  }

  /**
   * Yeni masraf. Nakit/Banka masraf ayrıca {@code FINANCE_PAYMENT_CREATE} ister (403 {@code
   * PAYMENT_PERMISSION_REQUIRED}). Eşzamanlı aynı anahtar yarışında bir kez yeniden denenir.
   */
  @PostMapping("/expenses")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  ExpenseDetailResponse createExpense(
      @Valid @RequestBody SaveExpenseRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
      Authentication authentication) {
    scope.requireNew(request.branchId());
    boolean canPay = canPay(authentication);
    return retryOnce(() -> expenseService.create(request, idempotencyKey, canPay));
  }

  @PostMapping("/expenses/{id}/reverse")
  @PreAuthorize(MANAGE)
  ExpenseDetailResponse reverseExpense(
      @PathVariable UUID id,
      @Valid @RequestBody ReverseExpenseRequest request,
      Authentication authentication) {
    return expenseService.reverse(id, request, canPay(authentication));
  }

  /** Düzeltme: aynı anahtar aynı yeni kaydı döner (12.7 §3.2.2). */
  @PostMapping("/expenses/{id}/revise")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  ExpenseDetailResponse reviseExpense(
      @PathVariable UUID id,
      @Valid @RequestBody ReviseExpenseRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey,
      Authentication authentication) {
    scope.requireNew(request.expense().branchId());
    boolean canPay = canPay(authentication);
    return retryOnce(() -> expenseService.revise(id, request, idempotencyKey, canPay));
  }

  private static boolean canPay(Authentication authentication) {
    return authentication != null
        && authentication.getAuthorities().stream()
            .anyMatch(a -> "FINANCE_PAYMENT_CREATE".equals(a.getAuthority()));
  }

  /** Eşzamanlı aynı anahtarlı istek ({@code IDEMPOTENCY_IN_PROGRESS}) bir kez yeniden denenir. */
  private static <T> T retryOnce(Supplier<T> call) {
    try {
      return call.get();
    } catch (BusinessException ex) {
      if ("IDEMPOTENCY_IN_PROGRESS".equals(ex.getCode())) {
        return call.get();
      }
      throw ex;
    }
  }

  // Para birimi ve kur

  /** Teklif, tarife ve araç gideri ekranları da para birimi seçer. */
  @GetMapping("/currencies")
  @PreAuthorize(
      "hasAnyAuthority('FINANCE_VIEW', 'CRM_VIEW', 'FLEET_VIEW', 'SHIPMENT_VIEW', 'WAREHOUSE_VIEW', 'CUSTOMS_VIEW')")
  List<CurrencyResponse> listCurrencies() {
    return currencies.findAll().stream().map(mapper::toResponse).toList();
  }

  @GetMapping("/exchange-rates")
  @PreAuthorize(VIEW)
  List<ExchangeRateResponse> listRates(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
    return rates.findLatestOnOrBefore(date).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/exchange-rates/refresh")
  @ResponseStatus(HttpStatus.ACCEPTED)
  @PreAuthorize(MANAGE)
  void refreshRates() {
    rateRefresher.refresh();
  }

  /**
   * Kullanıcı girişli ödeme/tahsilat: pasif cari 422, cari–şirket kimlik kuralı. Plan ödemesi,
   * avans ve araç gideri türetilmiş akışlardır, bu kurala girmez (12.1 §3.1).
   */
  private static Pageable unsorted(Pageable pageable) {
    return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
  }
}
