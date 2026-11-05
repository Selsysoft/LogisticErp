package org.ece.blackrose.saas.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AccountMailer;
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
import org.ece.blackrose.saas.service.PaymentProvider.ChargeRequest;
import org.ece.blackrose.saas.service.PaymentProvider.ChargeResult;
import org.ece.blackrose.saas.service.PaymentProvider.PaymentProviders;
import org.ece.blackrose.saas.web.SaasDtos.Usage;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Günlük akış: deneme bitişi, fatura kesme, tahsilat denemesi, hatırlatma, askıya alma, kullanım
 * kaydı. Bir firmanın hatası diğerlerini durdurmaz; iş tekrar çalışsa da sonuç değişmez.
 */
@Service
public class BillingService {

  public record RunResult(int processed, int failed) {}

  private static final Logger log = LoggerFactory.getLogger(BillingService.class);
  private static final int PAYMENT_TERM_DAYS = 7;
  private static final int MAX_CHARGE_ATTEMPTS = 3;
  private static final int MAX_CATCH_UP_MONTHS = 12;
  private static final int SECOND_REMINDER_DAYS = 7;
  private static final int SUSPEND_AFTER_DAYS = 14;
  private static final DateTimeFormatter PERIOD = DateTimeFormatter.BASIC_ISO_DATE;

  private final TenantRepository tenants;
  private final SubscriptionRepository subscriptions;
  private final PlanRepository plans;
  private final SaasInvoiceRepository invoices;
  private final PaymentProviders providers;
  private final PlanLimitService limits;
  private final SubscriptionService subscriptionService;
  private final AccountMailer mailer;
  private final AuditService audit;
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transaction;

  public BillingService(
      TenantRepository tenants,
      SubscriptionRepository subscriptions,
      PlanRepository plans,
      SaasInvoiceRepository invoices,
      PaymentProviders providers,
      PlanLimitService limits,
      SubscriptionService subscriptionService,
      AccountMailer mailer,
      AuditService audit,
      JdbcTemplate jdbc,
      TransactionTemplate transaction) {
    this.tenants = tenants;
    this.subscriptions = subscriptions;
    this.plans = plans;
    this.invoices = invoices;
    this.providers = providers;
    this.limits = limits;
    this.subscriptionService = subscriptionService;
    this.mailer = mailer;
    this.audit = audit;
    this.jdbc = jdbc;
    this.transaction = transaction;
  }

  @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Istanbul")
  void nightly() {
    runAll();
  }

  public RunResult runAll() {
    int processed = 0;
    int failed = 0;
    for (TenantStatus status : List.of(TenantStatus.ACTIVE, TenantStatus.SUSPENDED)) {
      for (Tenant tenant : tenants.findByStatus(status)) {
        try {
          process(tenant.getId(), SubscriptionService.todayOf(tenant));
          processed++;
        } catch (RuntimeException ex) {
          failed++;
          log.error("Abonelik işi başarısız: {}", tenant.getCode(), ex);
        }
      }
    }
    return new RunResult(processed, failed);
  }

  /** Testlerde tarih verilerek de çalıştırılır. */
  public void process(UUID tenantId, LocalDate today) {
    transaction.executeWithoutResult(
        status -> {
          Tenant tenant = tenants.findById(tenantId).orElseThrow();
          subscriptions
              .findByTenantId(tenantId)
              .ifPresent(subscription -> processSubscription(tenant, subscription, today));
          snapshot(tenant, today);
        });
  }

  private void processSubscription(Tenant tenant, Subscription subscription, LocalDate today) {
    if (subscription.getStatus() == SubscriptionStatus.CANCELLED) {
      return;
    }
    if (subscription.getStatus() == SubscriptionStatus.TRIAL
        && subscription.getTrialEndsOn().isBefore(today)) {
      subscription.suspend(SuspendReason.TRIAL_ENDED);
      tenant.suspend();
      audit.record(AuditEvent.TENANT_SUSPENDED, tenant.getCode(), SuspendReason.TRIAL_ENDED.name());
      notify(subscription, "Deneme süreniz bitti", "Firma erişiminiz askıya alındı.");
      return;
    }
    Plan plan = plans.findById(subscription.getPlanId()).orElseThrow();
    issueDueInvoices(tenant, subscription, plan, today);
    chargeOpenInvoices(tenant, subscription, today);
    dun(tenant, subscription, today);
  }

  private void issueDueInvoices(
      Tenant tenant, Subscription subscription, Plan plan, LocalDate today) {
    boolean billable =
        subscription.getStatus() == SubscriptionStatus.ACTIVE
            || subscription.getStatus() == SubscriptionStatus.PAST_DUE;
    if (!billable || !plan.isPaid() || subscription.getNextBillingOn() == null) {
      return;
    }
    int months = 0;
    while (!subscription.getNextBillingOn().isAfter(today) && months < MAX_CATCH_UP_MONTHS) {
      LocalDate start = subscription.getNextBillingOn();
      LocalDate next = start.plusMonths(1);
      invoices.save(
          new SaasInvoice(
              tenant.getId(),
              "SAAS-" + tenant.getCode() + "-" + PERIOD.format(start),
              plan,
              start,
              next.minusDays(1),
              today,
              today.plusDays(PAYMENT_TERM_DAYS)));
      subscription.setNextBillingOn(next);
      months++;
    }
    invoices.flush();
  }

  private void chargeOpenInvoices(Tenant tenant, Subscription subscription, LocalDate today) {
    PaymentProvider provider = providers.configured().orElse(null);
    if (provider == null) {
      return;
    }
    for (SaasInvoice invoice : open(tenant)) {
      if (invoice.getFailedAttempts() >= MAX_CHARGE_ATTEMPTS) {
        continue;
      }
      ChargeResult result =
          provider.charge(
              new ChargeRequest(
                  invoice.getId(),
                  invoice.getId() + "-" + invoice.getFailedAttempts(),
                  tenant.getCode(),
                  invoice.getAmount(),
                  invoice.getCurrency()));
      recordAttempt(invoice, result);
      if (result.success()) {
        invoice.markPaid(today, result.reference());
        audit.record(AuditEvent.SAAS_INVOICE_PAID, invoice.getNumber(), result.reference());
        subscriptionService.afterSettled(invoice);
      } else {
        invoice.recordFailure();
        if (subscription.getStatus() == SubscriptionStatus.ACTIVE) {
          subscription.markPastDue();
        }
        notify(
            subscription,
            "Ödeme alınamadı: " + invoice.getNumber(),
            "Abonelik ödemeniz alınamadı. Vade: " + invoice.getDueOn());
      }
    }
  }

  private void dun(Tenant tenant, Subscription subscription, LocalDate today) {
    if (subscription.getStatus() == SubscriptionStatus.SUSPENDED) {
      return;
    }
    for (SaasInvoice invoice : open(tenant)) {
      long late = ChronoUnit.DAYS.between(invoice.getDueOn(), today);
      if (late <= 0) {
        continue;
      }
      if (subscription.getStatus() == SubscriptionStatus.ACTIVE) {
        subscription.markPastDue();
      }
      if (late >= SUSPEND_AFTER_DAYS) {
        subscription.suspend(SuspendReason.PAYMENT);
        tenant.suspend();
        audit.record(AuditEvent.TENANT_SUSPENDED, tenant.getCode(), invoice.getNumber());
        notify(subscription, "Hesabınız askıya alındı", "Ödenmemiş fatura: " + invoice.getNumber());
        return;
      }
      int due = late >= SECOND_REMINDER_DAYS ? 2 : 1;
      if (invoice.getReminderCount() < due) {
        invoice.setReminderCount(due);
        notify(
            subscription,
            "Ödeme hatırlatması: " + invoice.getNumber(),
            "Vadesi "
                + invoice.getDueOn()
                + " olan fatura ödenmedi. Vadeden "
                + SUSPEND_AFTER_DAYS
                + " gün sonra hesap askıya alınır.");
      }
    }
  }

  private List<SaasInvoice> open(Tenant tenant) {
    return invoices.findByTenantIdAndStatusOrderByDueOnAsc(
        tenant.getId(), SaasInvoiceStatus.ISSUED);
  }

  private void recordAttempt(SaasInvoice invoice, ChargeResult result) {
    jdbc.update(
        """
        insert into admin.saas_payment_attempt
          (id, invoice_id, success, reference, message, created_at)
        values (?, ?, ?, ?, ?, now())
        """,
        UUID.randomUUID(),
        invoice.getId(),
        result.success(),
        result.reference(),
        result.message());
  }

  private void snapshot(Tenant tenant, LocalDate today) {
    Usage usage = limits.count(tenant);
    jdbc.update(
        """
        insert into admin.usage_snapshot
          (tenant_id, snapshot_date, users, vehicles, shipments_month)
        values (?, ?, ?, ?, ?)
        on conflict (tenant_id, snapshot_date) do update set
          users = excluded.users,
          vehicles = excluded.vehicles,
          shipments_month = excluded.shipments_month
        """,
        tenant.getId(),
        today,
        usage.users(),
        usage.vehicles(),
        usage.shipmentsMonth());
  }

  private void notify(Subscription subscription, String subject, String text) {
    if (subscription.getContactEmail() != null) {
      mailer.sendNotice(subscription.getContactEmail(), subject, text);
    }
  }
}
