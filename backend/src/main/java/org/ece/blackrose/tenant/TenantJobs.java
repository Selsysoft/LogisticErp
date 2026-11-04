package org.ece.blackrose.tenant;

import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Zamanlanmış işleri her aktif tenant için ayrı bağlamda çalıştırır. */
@Component
public class TenantJobs {

  private static final Logger log = LoggerFactory.getLogger(TenantJobs.class);

  private final TenantRepository tenants;

  public TenantJobs(TenantRepository tenants) {
    this.tenants = tenants;
  }

  public void forEachActiveTenant(Runnable job) {
    for (Tenant tenant : tenants.findByStatus(TenantStatus.ACTIVE)) {
      TenantContext.set(tenant.getCode(), tenant.getSchemaName());
      try {
        job.run();
      } catch (RuntimeException ex) {
        log.error("Tenant işi başarısız: {}", tenant.getCode(), ex);
      } finally {
        TenantContext.clear();
      }
    }
  }
}
