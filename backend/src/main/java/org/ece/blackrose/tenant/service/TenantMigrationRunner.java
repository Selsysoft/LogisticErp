package org.ece.blackrose.tenant.service;

import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Açılışta aktif tenantları günceller. Hata alan tenant kapanır, diğerleri etkilenmez. */
@Component
public class TenantMigrationRunner implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(TenantMigrationRunner.class);

  private final TenantRepository tenants;
  private final TenantMigrator migrator;

  public TenantMigrationRunner(TenantRepository tenants, TenantMigrator migrator) {
    this.tenants = tenants;
    this.migrator = migrator;
  }

  @Override
  public void run(ApplicationArguments args) {
    for (Tenant tenant : tenants.findByStatus(TenantStatus.ACTIVE)) {
      try {
        migrator.migrate(tenant.getSchemaName());
      } catch (RuntimeException ex) {
        log.error("Tenant migration başarısız: {}", tenant.getCode(), ex);
        tenant.markFailed();
        tenants.save(tenant);
      }
    }
  }
}
