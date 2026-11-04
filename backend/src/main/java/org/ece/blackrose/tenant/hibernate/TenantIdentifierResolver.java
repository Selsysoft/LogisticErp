package org.ece.blackrose.tenant.hibernate;

import org.ece.blackrose.tenant.TenantContext;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.stereotype.Component;

@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<String> {

  public static final String ADMIN_SCHEMA = "admin";

  @Override
  public String resolveCurrentTenantIdentifier() {
    return TenantContext.currentSchema().orElse(ADMIN_SCHEMA);
  }

  @Override
  public boolean validateExistingCurrentSessions() {
    return true;
  }
}
