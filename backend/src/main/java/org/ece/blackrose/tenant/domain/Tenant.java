package org.ece.blackrose.tenant.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.RoundingMode;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.MoneyRounding;

@Entity
@Table(name = "tenant", schema = "admin")
public class Tenant extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;
  private String schemaName;

  @Enumerated(EnumType.STRING)
  private TenantStatus status;

  private String defaultCurrency;
  private String timeZone;
  private int moneyScale;

  @Enumerated(EnumType.STRING)
  private RoundingMode roundingMode;

  protected Tenant() {}

  public Tenant(String code, String name, String defaultCurrency, String timeZone) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.name = name;
    this.schemaName = "tenant_" + code.replace('-', '_');
    this.status = TenantStatus.PROVISIONING;
    this.defaultCurrency = defaultCurrency;
    this.timeZone = timeZone;
    this.moneyScale = 2;
    this.roundingMode = RoundingMode.HALF_UP;
  }

  public void restartProvisioning() {
    status = TenantStatus.PROVISIONING;
  }

  public void activate() {
    status = TenantStatus.ACTIVE;
  }

  public void suspend() {
    status = TenantStatus.SUSPENDED;
  }

  public void close() {
    status = TenantStatus.CLOSED;
  }

  public void markFailed() {
    status = TenantStatus.FAILED;
  }

  public MoneyRounding moneyRounding() {
    return new MoneyRounding(moneyScale, roundingMode);
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public String getSchemaName() {
    return schemaName;
  }

  public TenantStatus getStatus() {
    return status;
  }

  public String getDefaultCurrency() {
    return defaultCurrency;
  }

  public String getTimeZone() {
    return timeZone;
  }
}
