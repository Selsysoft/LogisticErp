package org.ece.blackrose.tenant.hibernate;

import org.hibernate.cfg.MultiTenancySettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class HibernateTenancyConfig {

  @Bean
  HibernatePropertiesCustomizer tenancyCustomizer(
      SchemaConnectionProvider connectionProvider, TenantIdentifierResolver identifierResolver) {
    return properties -> {
      properties.put(MultiTenancySettings.MULTI_TENANT_CONNECTION_PROVIDER, connectionProvider);
      properties.put(MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER, identifierResolver);
    };
  }
}
