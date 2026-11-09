package org.ece.blackrose.saas.service;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;
import org.ece.blackrose.saas.domain.Subscription;
import org.ece.blackrose.saas.repository.SaasRepositories.PlanRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SaasInvoiceRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SubscriptionRepository;
import org.ece.blackrose.saas.web.SaasDtos.HealthResponse;
import org.ece.blackrose.saas.web.SaasDtos.HealthStatus;
import org.ece.blackrose.saas.web.SaasDtos.SlowEndpoint;
import org.ece.blackrose.saas.web.SaasDtos.TenantOverview;
import org.ece.blackrose.saas.web.SaasDtos.Usage;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Yönetim konsolunun firma özeti ve sistem sağlığı. Kullanıcı adı veya iş verisi göstermez. */
@Service
public class SaasConsoleService {

  private static final String HTTP_METRIC = "http.server.requests";
  private static final String SERVER_ERROR = "5";
  private static final int SLOW_ENDPOINTS = 5;
  private static final double DEGRADED_ERROR_PERCENT = 1;
  private static final double CRITICAL_ERROR_PERCENT = 10;
  private static final long SLOW_DB_MILLIS = 500;

  private final TenantRepository tenants;
  private final SubscriptionRepository subscriptions;
  private final PlanRepository plans;
  private final SaasInvoiceRepository invoices;
  private final PlanLimitService limits;
  private final PresenceTracker presence;
  private final JdbcTemplate jdbc;
  private final DataSource dataSource;
  private final MeterRegistry metrics;

  public SaasConsoleService(
      TenantRepository tenants,
      SubscriptionRepository subscriptions,
      PlanRepository plans,
      SaasInvoiceRepository invoices,
      PlanLimitService limits,
      PresenceTracker presence,
      JdbcTemplate jdbc,
      DataSource dataSource,
      MeterRegistry metrics) {
    this.tenants = tenants;
    this.subscriptions = subscriptions;
    this.plans = plans;
    this.invoices = invoices;
    this.limits = limits;
    this.presence = presence;
    this.jdbc = jdbc;
    this.dataSource = dataSource;
    this.metrics = metrics;
  }

  public List<TenantOverview> overview() {
    return tenants.findAll().stream()
        .sorted(Comparator.comparing(Tenant::getCode))
        .map(this::overviewOf)
        .toList();
  }

  public TenantOverview overviewOf(Tenant tenant) {
    Subscription subscription = subscriptions.findByTenantId(tenant.getId()).orElse(null);
    Plan plan = subscription == null ? null : plans.findById(subscription.getPlanId()).orElse(null);
    Usage usage = usage(tenant);
    return new TenantOverview(
        tenant.getId(),
        tenant.getCode(),
        tenant.getName(),
        tenant.getStatus(),
        plan == null ? null : plan.getId(),
        plan == null ? null : plan.getName(),
        subscription == null ? null : subscription.getStatus(),
        subscription == null ? null : subscription.getSuspendReason(),
        subscription == null ? null : subscription.getTrialEndsOn(),
        subscription == null ? null : subscription.getNextBillingOn(),
        usage != null && plan != null ? PlanLimitService.limits(usage, plan) : List.of(),
        presence.presenceOf(tenant.getCode()),
        invoices.countByTenantIdAndStatus(tenant.getId(), SaasInvoiceStatus.ISSUED));
  }

  /** Şeması hazır olmayan firmada kullanım sayılamaz; konsol yine açılır. */
  private Usage usage(Tenant tenant) {
    if (tenant.getStatus() == TenantStatus.PROVISIONING
        || tenant.getStatus() == TenantStatus.FAILED) {
      return null;
    }
    try {
      return limits.count(tenant);
    } catch (DataAccessException ex) {
      return null;
    }
  }

  public HealthResponse health() {
    List<String> issues = new ArrayList<>();
    boolean critical = false;

    boolean databaseUp = true;
    long started = System.nanoTime();
    try {
      jdbc.queryForObject("select 1", Integer.class);
    } catch (DataAccessException ex) {
      databaseUp = false;
    }
    long databaseMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
    if (!databaseUp) {
      issues.add("Veritabanına ulaşılamıyor.");
      critical = true;
    } else if (databaseMillis > SLOW_DB_MILLIS) {
      issues.add("Veritabanı yanıtı yavaş.");
    }

    HikariPoolMXBean pool = pool();
    int active = pool == null ? 0 : pool.getActiveConnections();
    int idle = pool == null ? 0 : pool.getIdleConnections();
    int waiting = pool == null ? 0 : pool.getThreadsAwaitingConnection();
    if (waiting > 0) {
      issues.add("Bağlantı bekleyen istek var.");
    }

    long requests = 0;
    long serverErrors = 0;
    List<SlowEndpoint> endpoints = new ArrayList<>();
    for (Timer timer : metrics.find(HTTP_METRIC).timers()) {
      requests += timer.count();
      String status = timer.getId().getTag("status");
      if (status != null && status.startsWith(SERVER_ERROR)) {
        serverErrors += timer.count();
      }
      endpoints.add(
          new SlowEndpoint(
              timer.getId().getTag("method") + " " + timer.getId().getTag("uri"),
              timer.count(),
              Math.round(timer.mean(TimeUnit.MILLISECONDS)),
              Math.round(timer.max(TimeUnit.MILLISECONDS))));
    }
    double errorPercent = requests == 0 ? 0 : serverErrors * 100d / requests;
    if (errorPercent >= CRITICAL_ERROR_PERCENT) {
      issues.add("Sunucu hata oranı çok yüksek.");
      critical = true;
    } else if (errorPercent >= DEGRADED_ERROR_PERCENT) {
      issues.add("Sunucu hata oranı yüksek.");
    }

    Map<TenantStatus, Long> byStatus = new EnumMap<>(TenantStatus.class);
    long onlineActive = 0;
    long onlineIdle = 0;
    Map<UUID, LocalDate> todayByTenant = new HashMap<>();
    for (Tenant tenant : tenants.findAll()) {
      todayByTenant.put(tenant.getId(), SubscriptionService.todayOf(tenant));
      byStatus.merge(tenant.getStatus(), 1L, Long::sum);
      PresenceTracker.Presence current = presence.presenceOf(tenant.getCode());
      onlineActive += current.active();
      onlineIdle += current.idle();
    }
    if (byStatus.getOrDefault(TenantStatus.FAILED, 0L) > 0) {
      issues.add("Altyapısı hatalı firma var.");
    }
    long overdue = overdueInvoices(todayByTenant);

    HealthStatus status =
        critical
            ? HealthStatus.CRITICAL
            : issues.isEmpty() ? HealthStatus.OK : HealthStatus.DEGRADED;
    return new HealthResponse(
        status,
        issues,
        databaseUp,
        databaseMillis,
        active,
        idle,
        waiting,
        requests,
        serverErrors,
        endpoints.stream()
            .sorted(Comparator.comparingLong(SlowEndpoint::maxMillis).reversed())
            .limit(SLOW_ENDPOINTS)
            .toList(),
        byStatus,
        onlineActive,
        onlineIdle,
        overdue);
  }

  /**
   * Faturalama vadeyi firmanın yerel tarihiyle değerlendirir; sayım da öyle yapılır. Hiçbir saat
   * dilimi UTC'nin bir gün ilerisini geçmediği için aday faturalar tek sorguyla daraltılır.
   */
  private long overdueInvoices(Map<UUID, LocalDate> todayByTenant) {
    LocalDate latestToday = LocalDate.now(ZoneOffset.UTC).plusDays(1);
    return invoices.findByStatusAndDueOnBefore(SaasInvoiceStatus.ISSUED, latestToday).stream()
        .filter(
            invoice -> {
              LocalDate today = todayByTenant.get(invoice.getTenantId());
              return today != null && invoice.getDueOn().isBefore(today);
            })
        .count();
  }

  private HikariPoolMXBean pool() {
    try {
      return dataSource.isWrapperFor(HikariDataSource.class)
          ? dataSource.unwrap(HikariDataSource.class).getHikariPoolMXBean()
          : null;
    } catch (SQLException ex) {
      return null;
    }
  }
}
