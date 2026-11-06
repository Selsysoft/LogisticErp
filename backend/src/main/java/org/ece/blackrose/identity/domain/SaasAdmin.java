package org.ece.blackrose.identity.domain;

import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Tenant kullanıcılarından ayrı, admin şemasındaki platform yöneticisi. */
@Entity
@Table(name = "saas_admin", schema = "admin")
public class SaasAdmin extends AuditableEntity {

  @Id private UUID id;
  private String email;
  private String passwordHash;
  private boolean active;
  @Embedded private LoginLock loginLock = new LoginLock();
  private String totpSecret;
  private boolean totpEnabled;
  private Long totpLastStep;

  protected SaasAdmin() {}

  public SaasAdmin(String email, String passwordHash) {
    this.id = UUID.randomUUID();
    this.email = email;
    this.passwordHash = passwordHash;
    this.active = true;
  }

  public UUID getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public boolean isActive() {
    return active;
  }

  public LoginLock getLoginLock() {
    return loginLock;
  }

  public void startTotpSetup(String encryptedSecret) {
    totpSecret = encryptedSecret;
    totpEnabled = false;
    totpLastStep = null;
  }

  public void enableTotp() {
    totpEnabled = true;
  }

  public void consumeTotpStep(long step) {
    totpLastStep = step;
  }

  public String getTotpSecret() {
    return totpSecret;
  }

  public boolean isTotpEnabled() {
    return totpEnabled;
  }

  public Long getTotpLastStep() {
    return totpLastStep;
  }
}
