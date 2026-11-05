package org.ece.blackrose.saas.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;
import org.ece.blackrose.saas.repository.SaasRepositories.PlanRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SubscriptionRepository;
import org.ece.blackrose.saas.web.SaasDtos.LimitUsage;
import org.ece.blackrose.saas.web.SaasDtos.Usage;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Plan sınırları ve kullanım sayımı. Sorgular şema adıyla yazıldığı için tenant bağlamı olmadan da
 * çalışır. Eşzamanlı son kayıtta sınır bir iki kayıt aşılabilir; bu kabul edilmiştir.
 */
@Service
public class PlanLimitService {

  private static final int WARNING_PERCENT = 80;
  private static final int HUNDRED = 100;

  private final TenantRepository tenants;
  private final SubscriptionRepository subscriptions;
  private final PlanRepository plans;
  private final JdbcTemplate jdbc;

  public PlanLimitService(
      TenantRepository tenants,
      SubscriptionRepository subscriptions,
      PlanRepository plans,
      JdbcTemplate jdbc) {
    this.tenants = tenants;
    this.subscriptions = subscriptions;
    this.plans = plans;
    this.jdbc = jdbc;
  }

  /** Yeni kayıttan önce çağrılır. Sınıra ulaşıldıysa kayıt reddedilir. */
  public void require(LimitedResource resource) {
    Tenant tenant = tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow();
    Plan plan = planOf(tenant);
    if (plan == null || plan.limitOf(resource) == null) {
      return;
    }
    int limit = plan.limitOf(resource);
    if (usedOf(count(tenant), resource) >= limit) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "PLAN_LIMIT_EXCEEDED",
          "Planınızın %s sınırına ulaşıldı (%d). Yeni kayıt için planı yükseltin."
              .formatted(resource.label(), limit));
    }
  }

  public List<LimitUsage> usageOf(Tenant tenant, Plan plan) {
    return limits(count(tenant), plan);
  }

  public static List<LimitUsage> limits(Usage usage, Plan plan) {
    List<LimitUsage> rows = new ArrayList<>();
    for (LimitedResource resource : LimitedResource.values()) {
      int used = usedOf(usage, resource);
      Integer limit = plan.limitOf(resource);
      rows.add(
          new LimitUsage(
              resource,
              used,
              limit,
              limit != null && used * HUNDRED >= limit * WARNING_PERCENT,
              limit != null && used >= limit));
    }
    return rows;
  }

  public Usage count(Tenant tenant) {
    String schema = '"' + tenant.getSchemaName() + '"';
    ZoneId zone = ZoneId.of(tenant.getTimeZone());
    var monthStart = LocalDate.now(zone).withDayOfMonth(1).atStartOfDay(zone).toOffsetDateTime();
    return jdbc.queryForObject(
        """
        select
          (select count(*) from %1$s.app_user where deleted = false and status <> 'DISABLED'),
          (select count(*) from %1$s.vehicle where deleted = false),
          (select count(*) from %1$s.shipment where deleted = false and created_at >= ?)
        """
            .formatted(schema),
        (row, index) -> new Usage(row.getInt(1), row.getInt(2), row.getInt(3)),
        monthStart);
  }

  private Plan planOf(Tenant tenant) {
    return subscriptions
        .findByTenantId(tenant.getId())
        .flatMap(subscription -> plans.findById(subscription.getPlanId()))
        .orElse(null);
  }

  private static int usedOf(Usage usage, LimitedResource resource) {
    return switch (resource) {
      case USERS -> usage.users();
      case VEHICLES -> usage.vehicles();
      case SHIPMENTS_MONTH -> usage.shipmentsMonth();
    };
  }
}
