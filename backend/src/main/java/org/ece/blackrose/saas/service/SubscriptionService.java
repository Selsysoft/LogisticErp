package org.ece.blackrose.saas.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.SaasInvoice;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;
import org.ece.blackrose.saas.domain.SaasTypes.SubscriptionStatus;
import org.ece.blackrose.saas.domain.SaasTypes.SuspendReason;
import org.ece.blackrose.saas.domain.Subscription;
import org.ece.blackrose.saas.repository.SaasRepositories.PlanRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SaasInvoiceRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SubscriptionRepository;
import org.ece.blackrose.saas.web.SaasDtos.LimitUsage;
import org.ece.blackrose.saas.web.SaasDtos.SavePlanRequest;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Plan tanımları ve firmanın abonelik yaşam döngüsü. */
@Service
public class SubscriptionService {

  private static final int DEFAULT_TRIAL_DAYS = 14;

  private final PlanRepository plans;
  private final SubscriptionRepository subscriptions;
  private final SaasInvoiceRepository invoices;
  private final TenantRepository tenants;
  private final PlanLimitService limits;
  private final TenantMigrator migrator;
  private final AuditService audit;

  public SubscriptionService(
      PlanRepository plans,
      SubscriptionRepository subscriptions,
      SaasInvoiceRepository invoices,
      TenantRepository tenants,
      PlanLimitService limits,
      TenantMigrator migrator,
      AuditService audit) {
    this.plans = plans;
    this.subscriptions = subscriptions;
    this.invoices = invoices;
    this.tenants = tenants;
    this.limits = limits;
    this.migrator = migrator;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public void ensurePlanSelectable(String planCode) {
    planByCode(planCode == null ? Plan.TRIAL_CODE : planCode);
  }

  /** Sağlama tekrar denendiğinde mevcut abonelik korunur. */
  @Transactional
  public Subscription startTrial(
      Tenant tenant, String planCode, Integer trialDays, String contactEmail) {
    return subscriptions
        .findByTenantId(tenant.getId())
        .orElseGet(
            () -> {
              Plan plan = planByCode(planCode == null ? Plan.TRIAL_CODE : planCode);
              int days = trialDays == null ? DEFAULT_TRIAL_DAYS : trialDays;
              return subscriptions.save(
                  new Subscription(
                      tenant.getId(), plan.getId(), todayOf(tenant).plusDays(days), contactEmail));
            });
  }

  @Transactional
  public Plan savePlan(UUID id, SavePlanRequest request) {
    Plan plan;
    if (id == null) {
      if (plans.findByCode(request.code()).isPresent()) {
        throw new BusinessException(
            HttpStatus.CONFLICT, "PLAN_CODE_TAKEN", "Bu plan kodu kayıtlı.");
      }
      plan = new Plan(request.code());
    } else {
      plan = plans.findById(id).orElseThrow(SubscriptionService::planNotFound);
    }
    plan.update(
        request.name(),
        request.monthlyPrice(),
        request.currency(),
        request.maxUsers(),
        request.maxVehicles(),
        request.maxShipmentsMonth(),
        request.active());
    return plans.save(plan);
  }

  /** Denemeden ücretli döneme geçer. İlk fatura zamanlanmış işte veya elle çalıştırmada kesilir. */
  @Transactional
  public void activate(UUID tenantId) {
    Tenant tenant = tenant(tenantId);
    Subscription subscription = subscription(tenantId);
    if (subscription.getStatus() == SubscriptionStatus.CANCELLED) {
      throw conflict("SUBSCRIPTION_CANCELLED", "Kapalı firma önce yeniden açılmalıdır.");
    }
    if (subscription.getStatus() != SubscriptionStatus.TRIAL
        && subscription.getSuspendReason() != SuspendReason.TRIAL_ENDED) {
      throw conflict("SUBSCRIPTION_NOT_TRIAL", "Abonelik deneme süresinde değil.");
    }
    subscription.activate(todayOf(tenant));
    tenant.activate();
    audit.record(AuditEvent.SUBSCRIPTION_CHANGED, tenant.getCode(), "ACTIVE");
  }

  /** Yükseltme hemen geçerlidir. Mevcut kullanım yeni sınırı aşıyorsa düşürme reddedilir. */
  @Transactional
  public void changePlan(UUID tenantId, UUID planId) {
    Tenant tenant = tenant(tenantId);
    Subscription subscription = subscription(tenantId);
    Plan plan = plans.findById(planId).orElseThrow(SubscriptionService::planNotFound);
    if (!plan.isActive()) {
      throw conflict("PLAN_INACTIVE", "Bu plan artık seçilemez.");
    }
    List<LimitUsage> usage = limits.usageOf(tenant, plan);
    for (LimitUsage row : usage) {
      if (row.limit() != null && row.used() > row.limit()) {
        throw conflict(
            "PLAN_USAGE_EXCEEDED",
            "Mevcut %s kullanımı (%d) bu planın sınırını (%d) aşıyor."
                .formatted(row.resource().label(), row.used(), row.limit()));
      }
    }
    subscription.changePlan(planId);
    boolean billable =
        subscription.getStatus() == SubscriptionStatus.ACTIVE
            || subscription.getStatus() == SubscriptionStatus.PAST_DUE;
    if (billable && plan.isPaid() && subscription.getNextBillingOn() == null) {
      subscription.setNextBillingOn(todayOf(tenant));
    }
    audit.record(AuditEvent.SUBSCRIPTION_CHANGED, tenant.getCode(), plan.getCode());
  }

  @Transactional
  public void extendTrial(UUID tenantId, LocalDate until) {
    Tenant tenant = tenant(tenantId);
    Subscription subscription = subscription(tenantId);
    if (subscription.getTrialEndsOn() == null) {
      throw conflict("SUBSCRIPTION_NOT_TRIAL", "Abonelik deneme süresinde değil.");
    }
    if (!until.isAfter(todayOf(tenant))) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "TRIAL_DATE_INVALID",
          "Yeni bitiş tarihi ileri bir tarih olmalıdır.");
    }
    subscription.extendTrial(until);
    if (subscription.getSuspendReason() == SuspendReason.TRIAL_ENDED) {
      subscription.resume();
      tenant.activate();
    }
    audit.record(AuditEvent.SUBSCRIPTION_CHANGED, tenant.getCode(), "TRIAL_UNTIL " + until);
  }

  @Transactional
  public void suspend(UUID tenantId) {
    Tenant tenant = tenant(tenantId);
    requireStatus(tenant, TenantStatus.ACTIVE, "Yalnız etkin firma askıya alınır.");
    subscription(tenantId).suspend(SuspendReason.MANUAL);
    tenant.suspend();
    audit.record(AuditEvent.TENANT_SUSPENDED, tenant.getCode(), SuspendReason.MANUAL.name());
  }

  /** Ödeme veya deneme nedeniyle askıda olan firma, nedeni giderilmeden açılmaz. */
  @Transactional
  public void resume(UUID tenantId) {
    Tenant tenant = tenant(tenantId);
    Subscription subscription = subscription(tenantId);
    if (tenant.getStatus() == TenantStatus.SUSPENDED) {
      if (subscription.getSuspendReason() == SuspendReason.TRIAL_ENDED) {
        throw conflict(
            "TRIAL_ENDED", "Deneme süresi bitti: süreyi uzatın veya aboneliği başlatın.");
      }
      if (subscription.getSuspendReason() == SuspendReason.PAYMENT
          && hasOverdue(tenantId, todayOf(tenant))) {
        throw conflict("INVOICE_OVERDUE", "Vadesi geçmiş fatura kapanmadan firma açılamaz.");
      }
    } else if (tenant.getStatus() == TenantStatus.CLOSED) {
      // Kapalıyken uygulanmayan şema değişiklikleri açılmadan önce uygulanır.
      migrator.migrate(tenant.getSchemaName());
    } else {
      throw conflict("TENANT_NOT_SUSPENDED", "Firma askıda veya kapalı değil.");
    }
    resumeBilling(subscription, tenant);
    tenant.activate();
    audit.record(AuditEvent.TENANT_RESUMED, tenant.getCode(), null);
  }

  /** Erişimi kapatır, veriyi silmez. Fiziksel silme hukuki görüş alınmadan yapılmaz. */
  @Transactional
  public void close(UUID tenantId, String confirmCode) {
    Tenant tenant = tenant(tenantId);
    if (!tenant.getCode().equals(confirmCode)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "CONFIRM_CODE_MISMATCH", "Onay için firma kodunu yazın.");
    }
    if (tenant.getStatus() != TenantStatus.ACTIVE && tenant.getStatus() != TenantStatus.SUSPENDED) {
      throw conflict("TENANT_NOT_CLOSABLE", "Bu durumdaki firma kapatılamaz.");
    }
    subscription(tenantId).cancel();
    tenant.close();
    audit.record(AuditEvent.TENANT_CLOSED, tenant.getCode(), null);
  }

  /** Elle ödeme. Açık başka vadesi geçmiş fatura yoksa askıdaki firma açılır. */
  @Transactional
  public SaasInvoice markPaid(UUID invoiceId, LocalDate date, String reference) {
    SaasInvoice invoice = openInvoice(invoiceId);
    invoice.markPaid(date, reference);
    afterSettled(invoice);
    audit.record(AuditEvent.SAAS_INVOICE_PAID, invoice.getNumber(), reference);
    return invoice;
  }

  @Transactional
  public SaasInvoice voidInvoice(UUID invoiceId) {
    SaasInvoice invoice = openInvoice(invoiceId);
    invoice.voidInvoice();
    afterSettled(invoice);
    audit.record(AuditEvent.SUBSCRIPTION_CHANGED, invoice.getNumber(), "VOID");
    return invoice;
  }

  void afterSettled(SaasInvoice invoice) {
    Tenant tenant = tenant(invoice.getTenantId());
    Subscription subscription = subscription(invoice.getTenantId());
    if (hasOverdue(invoice.getTenantId(), todayOf(tenant))) {
      return;
    }
    if (subscription.getSuspendReason() == SuspendReason.PAYMENT) {
      resumeBilling(subscription, tenant);
      tenant.activate();
      audit.record(AuditEvent.TENANT_RESUMED, tenant.getCode(), "PAYMENT");
    } else if (subscription.getStatus() == SubscriptionStatus.PAST_DUE) {
      subscription.resume();
    }
  }

  /** Erişimin kapalı olduğu dönem faturalanmaz: yeni dönem açılış gününden başlar. */
  private static void resumeBilling(Subscription subscription, Tenant tenant) {
    subscription.resume();
    LocalDate today = todayOf(tenant);
    if (subscription.getNextBillingOn() != null
        && subscription.getNextBillingOn().isBefore(today)) {
      subscription.setNextBillingOn(today);
    }
  }

  private boolean hasOverdue(UUID tenantId, LocalDate today) {
    return invoices
        .findByTenantIdAndStatusOrderByDueOnAsc(tenantId, SaasInvoiceStatus.ISSUED)
        .stream()
        .anyMatch(invoice -> invoice.getDueOn().isBefore(today));
  }

  private SaasInvoice openInvoice(UUID invoiceId) {
    SaasInvoice invoice =
        invoices
            .findById(invoiceId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Fatura bulunamadı."));
    if (invoice.getStatus() != SaasInvoiceStatus.ISSUED) {
      throw conflict("INVOICE_NOT_OPEN", "Fatura açık değil.");
    }
    return invoice;
  }

  private Plan planByCode(String code) {
    Plan plan = plans.findByCode(code).orElseThrow(SubscriptionService::planNotFound);
    if (!plan.isActive()) {
      throw conflict("PLAN_INACTIVE", "Bu plan artık seçilemez.");
    }
    return plan;
  }

  private Tenant tenant(UUID id) {
    return tenants
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "TENANT_NOT_FOUND", "Firma bulunamadı."));
  }

  private Subscription subscription(UUID tenantId) {
    return subscriptions
        .findByTenantId(tenantId)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "SUBSCRIPTION_NOT_FOUND", "Abonelik bulunamadı."));
  }

  private static void requireStatus(Tenant tenant, TenantStatus status, String message) {
    if (tenant.getStatus() != status) {
      throw conflict("TENANT_STATUS_INVALID", message);
    }
  }

  static LocalDate todayOf(Tenant tenant) {
    return LocalDate.now(ZoneId.of(tenant.getTimeZone()));
  }

  private static BusinessException conflict(String code, String message) {
    return new BusinessException(HttpStatus.CONFLICT, code, message);
  }

  private static BusinessException planNotFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "PLAN_NOT_FOUND", "Plan bulunamadı.");
  }
}
