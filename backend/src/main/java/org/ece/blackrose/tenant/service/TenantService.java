package org.ece.blackrose.tenant.service;

import java.util.Optional;
import java.util.Set;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.identity.service.UserService;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.ece.blackrose.tenant.web.CreateTenantRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Durum kaydı ve şema göçü ayrı adımlardır. Göç hata verse de {@code FAILED} durumu kalıcı
 * olmalıdır, bu yüzden servis tek bir transaction içinde çalışmaz.
 */
@Service
public class TenantService {

  private static final Logger log = LoggerFactory.getLogger(TenantService.class);
  private static final Set<String> RESERVED_CODES = Set.of("www", "api", "admin", "app", "public");

  private final TenantRepository tenants;
  private final TenantMigrator migrator;
  private final UserService users;
  private final AuditService audit;

  public TenantService(
      TenantRepository tenants, TenantMigrator migrator, UserService users, AuditService audit) {
    this.tenants = tenants;
    this.migrator = migrator;
    this.users = users;
    this.audit = audit;
  }

  public Tenant create(CreateTenantRequest request) {
    if (RESERVED_CODES.contains(request.code())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TENANT_CODE_RESERVED", "Bu firma kodu kullanılamaz.");
    }
    Optional<Tenant> existing = tenants.findByCode(request.code());
    if (existing.isPresent() && existing.get().getStatus() != TenantStatus.FAILED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TENANT_CODE_TAKEN", "Bu firma kodu zaten kayıtlı.");
    }
    Tenant tenant =
        existing.orElseGet(
            () ->
                new Tenant(
                    request.code(), request.name(), request.defaultCurrency(), request.timeZone()));
    tenant.restartProvisioning();
    tenant = tenants.save(tenant);
    try {
      migrator.migrate(tenant.getSchemaName());
      createOwner(tenant, request);
    } catch (RuntimeException ex) {
      log.error("Tenant sağlama başarısız: {}", tenant.getCode(), ex);
      tenant.markFailed();
      tenants.save(tenant);
      throw new BusinessException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "TENANT_PROVISIONING_FAILED",
          "Firma altyapısı oluşturulamadı.");
    }
    tenant.activate();
    tenant = tenants.save(tenant);
    audit.record(AuditEvent.TENANT_CREATED, tenant.getCode(), null);
    return tenant;
  }

  private void createOwner(Tenant tenant, CreateTenantRequest request) {
    TenantContext.set(tenant.getCode(), tenant.getSchemaName());
    try {
      users.ensureOwner(request.ownerEmail(), request.ownerFullName());
    } finally {
      TenantContext.clear();
    }
  }
}
