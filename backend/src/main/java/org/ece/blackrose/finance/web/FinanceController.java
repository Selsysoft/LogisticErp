package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingType;
import org.ece.blackrose.finance.domain.FinanceTypes.HeatmapPeriod;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.repository.FinanceRepositories.CurrencyRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseTypeRepository;
import org.ece.blackrose.finance.service.AccountService;
import org.ece.blackrose.finance.service.FundService;
import org.ece.blackrose.finance.service.InstrumentService;
import org.ece.blackrose.finance.service.PaymentPlanService;
import org.ece.blackrose.finance.service.PurchaseInvoiceService;
import org.ece.blackrose.finance.service.RateRefresher;
import org.ece.blackrose.finance.service.SettlementService;
import org.ece.blackrose.finance.web.FinanceDtos.AccountResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AccountTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AgingResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CreateFundRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePurchaseInvoiceRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CurrencyResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyReportResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DashboardResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExchangeRateResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseTypeResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FinanceSettingsResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FundTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.HeatmapCell;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentMovementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentTransitionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ManualAccountTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.ManualFundTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PayPlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PlanEventResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PlanNoteRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PlanResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PostponePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PurchaseInvoiceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ReverseRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseItemRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseTypeRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveFinanceSettingsRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveThresholdRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ThresholdResponse;
import org.ece.blackrose.finance.web.FinanceDtos.TransferRequest;
import org.ece.blackrose.finance.web.FinanceDtos.TransferResponse;
import org.ece.blackrose.finance.web.FinanceDtos.UpdateFundRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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

  private final AccountService accounts;
  private final FundService funds;
  private final InstrumentService instruments;
  private final SettlementService settlements;
  private final PurchaseInvoiceService invoices;
  private final PaymentPlanService plans;
  private final ExpenseTypeRepository expenseTypes;
  private final ExpenseItemRepository expenseItems;
  private final CurrencyRepository currencies;
  private final ExchangeRateRepository rates;
  private final RateRefresher rateRefresher;
  private final FinanceMapper mapper;

  public FinanceController(
      AccountService accounts,
      FundService funds,
      InstrumentService instruments,
      SettlementService settlements,
      PurchaseInvoiceService invoices,
      PaymentPlanService plans,
      ExpenseTypeRepository expenseTypes,
      ExpenseItemRepository expenseItems,
      CurrencyRepository currencies,
      ExchangeRateRepository rates,
      RateRefresher rateRefresher,
      FinanceMapper mapper) {
    this.accounts = accounts;
    this.funds = funds;
    this.instruments = instruments;
    this.settlements = settlements;
    this.invoices = invoices;
    this.plans = plans;
    this.expenseTypes = expenseTypes;
    this.expenseItems = expenseItems;
    this.currencies = currencies;
    this.rates = rates;
    this.rateRefresher = rateRefresher;
    this.mapper = mapper;
  }

  // Cari

  @GetMapping("/accounts")
  @PreAuthorize(VIEW)
  PageResponse<AccountResponse> listAccounts(
      @RequestParam(required = false) String search, Pageable pageable) {
    return accounts.list(search, pageable);
  }

  @GetMapping("/accounts/{id}")
  @PreAuthorize(VIEW)
  AccountResponse getAccount(@PathVariable UUID id) {
    return accounts.get(id);
  }

  @PostMapping("/accounts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  AccountResponse createAccount(@Valid @RequestBody SaveAccountRequest request) {
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
    return mapper.toResponse(accounts.postManual(id, request));
  }

  @PostMapping("/accounts/transactions/{id}/reverse")
  @PreAuthorize(POST)
  AccountTransactionResponse reverseAccountTransaction(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(accounts.reverseManual(id, request.date(), request.description()));
  }

  @GetMapping("/accounts/{id}/statement")
  @PreAuthorize(VIEW)
  StatementResponse accountStatement(
      @PathVariable UUID id,
      @RequestParam String currency,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      Pageable pageable) {
    return accounts.statement(id, currency, from, to, unsorted(pageable));
  }

  @GetMapping("/reports/aging")
  @PreAuthorize(VIEW)
  List<AgingResponse> aging(
      @RequestParam AgingType type,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
    return accounts.aging(type, asOf);
  }

  // Banka ve kasa

  @GetMapping("/funds")
  @PreAuthorize(VIEW)
  List<FundResponse> listFunds() {
    return funds.list();
  }

  @PostMapping("/funds")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  FundResponse createFund(@Valid @RequestBody CreateFundRequest request) {
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

  @PostMapping("/funds/transfers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  TransferResponse transfer(
      @Valid @RequestBody TransferRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    return funds.transfer(request, idempotencyKey);
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

  @GetMapping("/instruments")
  @PreAuthorize(VIEW)
  PageResponse<InstrumentResponse> listInstruments(
      @RequestParam(required = false) InstrumentStatus status, Pageable pageable) {
    return PageResponse.from(instruments.list(status, pageable), mapper::toResponse);
  }

  @GetMapping("/instruments/{id}/movements")
  @PreAuthorize(VIEW)
  List<InstrumentMovementResponse> instrumentHistory(@PathVariable UUID id) {
    return instruments.history(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/instruments/{id}/transition")
  @PreAuthorize(POST)
  InstrumentResponse transitionInstrument(
      @PathVariable UUID id, @Valid @RequestBody InstrumentTransitionRequest request) {
    return mapper.toResponse(instruments.transition(id, request));
  }

  // Ödeme ve tahsilat

  @GetMapping("/payments")
  @PreAuthorize(VIEW)
  PageResponse<SettlementResponse> listPayments(Pageable pageable) {
    return PageResponse.from(
        settlements.list(SettlementType.PAYMENT, pageable), mapper::toResponse);
  }

  @PostMapping("/payments")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  SettlementResponse createPayment(
      @Valid @RequestBody SettlementRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    return mapper.toResponse(
        settlements.create(SettlementType.PAYMENT, request, idempotencyKey, null));
  }

  @GetMapping("/collections")
  @PreAuthorize(VIEW)
  PageResponse<SettlementResponse> listCollections(Pageable pageable) {
    return PageResponse.from(
        settlements.list(SettlementType.COLLECTION, pageable), mapper::toResponse);
  }

  @PostMapping("/collections")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  SettlementResponse createCollection(
      @Valid @RequestBody SettlementRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) String idempotencyKey) {
    return mapper.toResponse(
        settlements.create(SettlementType.COLLECTION, request, idempotencyKey, null));
  }

  @PostMapping("/settlements/{id}/reverse")
  @PreAuthorize(POST)
  SettlementResponse reverseSettlement(
      @PathVariable UUID id, @Valid @RequestBody ReverseRequest request) {
    return mapper.toResponse(settlements.reverse(id, request.date(), request.description()));
  }

  @GetMapping("/reports/daily")
  @PreAuthorize(VIEW)
  DailyReportResponse dailyReport(
      @RequestParam SettlementType type,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam(required = false) List<UUID> branchIds) {
    return settlements.daily(type, date, branchIds);
  }

  // Tedarikçi faturası

  @GetMapping("/purchase-invoices")
  @PreAuthorize(VIEW)
  PageResponse<PurchaseInvoiceResponse> listInvoices(Pageable pageable) {
    return PageResponse.from(invoices.list(pageable), mapper::toResponse);
  }

  @PostMapping("/purchase-invoices")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  PurchaseInvoiceResponse createInvoice(@Valid @RequestBody CreatePurchaseInvoiceRequest request) {
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
      @RequestParam(required = false) PlanStatus status, Pageable pageable) {
    return PageResponse.from(plans.list(status, pageable), mapper::toResponse);
  }

  @PostMapping("/payment-plans")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  PlanResponse createPlan(@Valid @RequestBody CreatePlanRequest request) {
    return mapper.toResponse(plans.create(request, null));
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
      @RequestParam(defaultValue = "DAY") HeatmapPeriod period) {
    return plans.heatmap(from, to, period);
  }

  @GetMapping("/dashboard")
  @PreAuthorize(VIEW)
  DashboardResponse dashboard(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today) {
    return plans.dashboard(today);
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
    return expenseItems.findAll().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/expense-items")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  ExpenseItemResponse createExpenseItem(@Valid @RequestBody SaveExpenseItemRequest request) {
    if (!expenseTypes.existsById(request.expenseTypeId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "EXPENSE_TYPE_NOT_FOUND", "Gider tipi bulunamadı.");
    }
    return mapper.toResponse(
        expenseItems.save(
            new ExpenseItem(request.expenseTypeId(), request.code(), request.name())));
  }

  // Para birimi ve kur

  @GetMapping("/currencies")
  @PreAuthorize(VIEW)
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

  private static Pageable unsorted(Pageable pageable) {
    return org.springframework.data.domain.PageRequest.of(
        pageable.getPageNumber(), pageable.getPageSize());
  }
}
