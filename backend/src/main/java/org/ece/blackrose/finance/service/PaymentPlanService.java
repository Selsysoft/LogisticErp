package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.DensityThreshold;
import org.ece.blackrose.finance.domain.FinanceSettings;
import org.ece.blackrose.finance.domain.FinanceTypes.HeatmapPeriod;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PaymentPlanEvent;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.DensityThresholdRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FinanceSettingsRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanEventRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CurrencyTotal;
import org.ece.blackrose.finance.web.FinanceDtos.DashboardResponse;
import org.ece.blackrose.finance.web.FinanceDtos.HeatmapCell;
import org.ece.blackrose.finance.web.FinanceDtos.PayPlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.PostponePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveThresholdRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceMapper;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.service.AuditService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Taslak → onaya gönderildi → onaylandı/reddedildi → ödendi. Onaysız plan ödenemez. */
@Service
public class PaymentPlanService {

  private static final Set<PlanStatus> OPEN_STATUSES =
      Set.of(PlanStatus.DRAFT, PlanStatus.PENDING, PlanStatus.APPROVED);
  private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");
  private static final int WEEK_DAYS = 7;
  private static final int UPCOMING_LIMIT = 10;

  private final PaymentPlanRepository plans;
  private final PaymentPlanEventRepository events;
  private final DensityThresholdRepository thresholds;
  private final AccountRepository accounts;
  private final SettlementService settlements;
  private final FinanceMapper mapper;
  private final FinanceSettingsRepository settingsRepository;
  private final AuditService audit;

  public PaymentPlanService(
      PaymentPlanRepository plans,
      PaymentPlanEventRepository events,
      DensityThresholdRepository thresholds,
      AccountRepository accounts,
      SettlementService settlements,
      FinanceMapper mapper,
      FinanceSettingsRepository settingsRepository,
      AuditService audit) {
    this.settingsRepository = settingsRepository;
    this.audit = audit;
    this.plans = plans;
    this.events = events;
    this.thresholds = thresholds;
    this.accounts = accounts;
    this.settlements = settlements;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public Page<PaymentPlan> list(PlanStatus status, Pageable pageable) {
    return plans.search(status, pageable);
  }

  @Transactional(readOnly = true)
  public List<PaymentPlanEvent> history(UUID id) {
    return events.findByPlanIdOrderByCreatedAt(id);
  }

  @Transactional
  public PaymentPlan create(CreatePlanRequest request, UUID purchaseInvoiceId) {
    if (!accounts.existsById(request.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (request.money().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    PaymentPlan plan =
        plans.save(
            new PaymentPlan(
                request.accountId(),
                request.branchId(),
                request.money(),
                request.dueDate(),
                purchaseInvoiceId,
                request.description()));
    event(plan, "CREATED", null);
    return plan;
  }

  @Transactional
  public PaymentPlan submit(UUID id) {
    return move(
        id, Set.of(PlanStatus.DRAFT, PlanStatus.REJECTED), PlanStatus.PENDING, "SUBMITTED", null);
  }

  @Transactional
  public PaymentPlan approve(UUID id, String note) {
    ensureApproverAllowed(lock(id));
    return move(id, Set.of(PlanStatus.PENDING), PlanStatus.APPROVED, "APPROVED", note);
  }

  @Transactional
  public PaymentPlan reject(UUID id, String note) {
    return move(id, Set.of(PlanStatus.PENDING), PlanStatus.REJECTED, "REJECTED", note);
  }

  @Transactional
  public PaymentPlan cancel(UUID id, String note) {
    return move(
        id,
        Set.of(PlanStatus.DRAFT, PlanStatus.PENDING, PlanStatus.APPROVED, PlanStatus.REJECTED),
        PlanStatus.CANCELLED,
        "CANCELLED",
        note);
  }

  /** Ertelenen plan durumunu korur; tutar değişmediği için onay geçerliliğini yitirmez. */
  @Transactional
  public PaymentPlan postpone(UUID id, PostponePlanRequest request) {
    PaymentPlan plan = lock(id);
    if (!OPEN_STATUSES.contains(plan.getStatus())) {
      throw invalidState(plan);
    }
    if (!request.dueDate().isAfter(plan.getDueDate())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "POSTPONE_DATE_INVALID",
          "Yeni vade mevcut vadeden sonra olmalıdır.");
    }
    event(plan, "POSTPONED", plan.getDueDate() + " → " + request.dueDate());
    plan.postponeTo(request.dueDate());
    return plan;
  }

  @Transactional
  public Settlement pay(UUID id, PayPlanRequest request) {
    PaymentPlan plan = lock(id);
    if (plan.getStatus() != PlanStatus.APPROVED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "PLAN_NOT_APPROVED", "Onaylanmamış plan ödenemez.");
    }
    if (request.method() == SettlementMethod.CHECK) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "PLAN_METHOD_INVALID",
          "Plan ödemesi banka veya kasadan yapılır.");
    }
    Settlement settlement =
        settlements.create(
            SettlementType.PAYMENT,
            new SettlementRequest(
                request.method(),
                plan.getAccountId(),
                plan.getBranchId(),
                request.fundAccountId(),
                null,
                null,
                null,
                plan.getMoney(),
                request.date(),
                plan.getDescription(),
                request.exchangeRate()),
            null,
            plan.getId());
    plan.moveTo(PlanStatus.PAID);
    event(plan, "PAID", null);
    return settlement;
  }

  @Transactional(readOnly = true)
  public List<HeatmapCell> heatmap(LocalDate from, LocalDate to, HeatmapPeriod period) {
    record Bucket(BigDecimal total, int count) {}
    Map<String, Bucket> buckets = new TreeMap<>();
    for (PaymentPlan plan : plans.findByStatusInAndDueDateBetween(OPEN_STATUSES, from, to)) {
      String label =
          period == HeatmapPeriod.MONTH
              ? plan.getDueDate().format(MONTH)
              : plan.getDueDate().toString();
      String key = label + "|" + plan.getMoney().currency();
      Bucket current = buckets.getOrDefault(key, new Bucket(BigDecimal.ZERO, 0));
      buckets.put(
          key, new Bucket(current.total().add(plan.getMoney().amount()), current.count() + 1));
    }
    Map<String, DensityThreshold> limits = new TreeMap<>();
    thresholds.findAll().forEach(limit -> limits.put(limit.getCurrency(), limit));
    List<HeatmapCell> cells = new ArrayList<>();
    buckets.forEach(
        (key, bucket) -> {
          String[] parts = key.split("\\|");
          DensityThreshold limit = limits.get(parts[1]);
          cells.add(
              new HeatmapCell(
                  parts[0],
                  parts[1],
                  bucket.total(),
                  bucket.count(),
                  limit == null ? null : limit.levelOf(bucket.total())));
        });
    return cells;
  }

  @Transactional(readOnly = true)
  public DashboardResponse dashboard(LocalDate today) {
    List<PaymentPlan> overdue = plans.findByStatusInAndDueDateBefore(OPEN_STATUSES, today);
    List<PaymentPlan> week =
        plans.findByStatusInAndDueDateBetween(OPEN_STATUSES, today, today.plusDays(WEEK_DAYS));
    List<PaymentPlan> dueToday =
        week.stream().filter(plan -> plan.getDueDate().equals(today)).toList();
    return new DashboardResponse(
        totals(overdue),
        totals(dueToday),
        totals(week),
        plans.countByStatus(PlanStatus.PENDING),
        week.stream()
            .sorted(Comparator.comparing(PaymentPlan::getDueDate))
            .limit(UPCOMING_LIMIT)
            .map(mapper::toResponse)
            .toList());
  }

  @Transactional
  public DensityThreshold saveThreshold(String currency, SaveThresholdRequest request) {
    if (request.low().compareTo(request.medium()) > 0
        || request.medium().compareTo(request.high()) > 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "THRESHOLD_ORDER_INVALID",
          "Eşikler küçükten büyüğe sıralanmalıdır.");
    }
    DensityThreshold threshold =
        thresholds
            .findById(currency)
            .orElseGet(
                () ->
                    new DensityThreshold(
                        currency, request.low(), request.medium(), request.high()));
    threshold.update(request.low(), request.medium(), request.high());
    return thresholds.save(threshold);
  }

  @Transactional(readOnly = true)
  public FinanceSettings settings() {
    return settingsRepository.findById(FinanceSettings.SINGLETON_ID).orElseThrow();
  }

  @Transactional
  public FinanceSettings updateSettings(boolean allowSelfApproval) {
    FinanceSettings settings = settings();
    settings.update(allowSelfApproval);
    audit.record(
        AuditEvent.FINANCE_SETTINGS_UPDATED,
        "allowSelfApproval",
        String.valueOf(allowSelfApproval));
    return settings;
  }

  /** Firma ayarı kapalıysa plan, onu oluşturan kişi tarafından onaylanamaz. */
  private void ensureApproverAllowed(PaymentPlan plan) {
    boolean ownPlan = AuthenticatedUser.require().email().equals(plan.getCreatedBy());
    if (ownPlan && !settings().isAllowSelfApproval()) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN,
          "PLAN_SELF_APPROVAL",
          "Kendi oluşturduğunuz planı onaylayamazsınız.");
    }
  }

  @Transactional(readOnly = true)
  public List<DensityThreshold> listThresholds() {
    return thresholds.findAll();
  }

  private static List<CurrencyTotal> totals(List<PaymentPlan> list) {
    Map<String, CurrencyTotal> totals = new TreeMap<>();
    for (PaymentPlan plan : list) {
      String currency = plan.getMoney().currency();
      CurrencyTotal current =
          totals.getOrDefault(currency, new CurrencyTotal(currency, BigDecimal.ZERO, 0));
      totals.put(
          currency,
          new CurrencyTotal(
              currency, current.total().add(plan.getMoney().amount()), current.count() + 1));
    }
    return new ArrayList<>(totals.values());
  }

  private PaymentPlan move(
      UUID id, Set<PlanStatus> allowedFrom, PlanStatus target, String eventType, String note) {
    PaymentPlan plan = lock(id);
    if (!allowedFrom.contains(plan.getStatus())) {
      throw invalidState(plan);
    }
    plan.moveTo(target);
    event(plan, eventType, note);
    return plan;
  }

  private void event(PaymentPlan plan, String type, String note) {
    events.save(new PaymentPlanEvent(plan.getId(), type, note));
  }

  private PaymentPlan lock(UUID id) {
    return plans
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(HttpStatus.NOT_FOUND, "PLAN_NOT_FOUND", "Plan bulunamadı."));
  }

  private static BusinessException invalidState(PaymentPlan plan) {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "PLAN_INVALID_STATE",
        "Plan " + plan.getStatus() + " durumunda bu işlem yapılamaz.");
  }
}
