package org.ece.blackrose.tenant.service;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.stereotype.Component;

@Component
public class TenantMigrator {

  private final DataSource dataSource;

  public TenantMigrator(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  /** Şema yoksa oluşturur ve tenant migration'larını uygular. */
  public void migrate(String schema) {
    Flyway.configure()
        .dataSource(dataSource)
        .schemas(schema)
        .defaultSchema(schema)
        .locations("classpath:db/migration/tenant")
        .load()
        .migrate();
  }
}
