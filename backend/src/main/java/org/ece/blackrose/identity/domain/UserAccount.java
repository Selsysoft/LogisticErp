package org.ece.blackrose.identity.domain;

import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "app_user")
@SQLRestriction("deleted = false")
public class UserAccount extends AuditableEntity {

  private static final String DEFAULT_LANDING = "/dashboard";

  @Id private UUID id;
  private String email;
  private String fullName;
  private String passwordHash;

  @Enumerated(EnumType.STRING)
  private UserStatus status;

  private Instant emailVerifiedAt;
  private int tokenVersion;
  @Embedded private LoginLock loginLock = new LoginLock();
  private String totpSecret;
  private boolean totpEnabled;
  private Long totpLastStep;

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(
      name = "user_role",
      joinColumns = @JoinColumn(name = "user_id"),
      inverseJoinColumns = @JoinColumn(name = "role_id"))
  private Set<Role> roles = new HashSet<>();

  protected UserAccount() {}

  public UserAccount(String email, String fullName, Collection<Role> roles) {
    this.id = UUID.randomUUID();
    this.email = email;
    this.fullName = fullName;
    this.status = UserStatus.INVITED;
    this.roles = new HashSet<>(roles);
  }

  public Set<Permission> getEffectivePermissions() {
    Set<Permission> result = EnumSet.noneOf(Permission.class);
    roles.forEach(role -> result.addAll(role.getEffectivePermissions()));
    return result;
  }

  public String landingPath() {
    return roles.stream()
        .max(Comparator.comparingInt(Role::getPriority))
        .map(Role::getLandingPath)
        .orElse(DEFAULT_LANDING);
  }

  public boolean isActiveOwner() {
    return status == UserStatus.ACTIVE && roles.stream().anyMatch(Role::isOwner);
  }

  /** Şifreyi belirler, hesabı etkinleştirir ve mevcut tüm erişim token'larını geçersiz kılar. */
  public void setPassword(String hash, Instant now) {
    passwordHash = hash;
    status = UserStatus.ACTIVE;
    if (emailVerifiedAt == null) {
      emailVerifiedAt = now;
    }
    loginLock.reset();
    tokenVersion++;
  }

  public void updateProfile(String fullName, Collection<Role> roles) {
    this.fullName = fullName;
    this.roles = new HashSet<>(roles);
  }

  public void disable() {
    status = UserStatus.DISABLED;
    tokenVersion++;
  }

  public void enable() {
    status = passwordHash != null ? UserStatus.ACTIVE : UserStatus.INVITED;
  }

  public void startTotpSetup(String encryptedSecret) {
    totpSecret = encryptedSecret;
    totpEnabled = false;
    totpLastStep = null;
  }

  public void enableTotp() {
    totpEnabled = true;
  }

  public void disableTotp() {
    totpSecret = null;
    totpEnabled = false;
    totpLastStep = null;
  }

  public void consumeTotpStep(long step) {
    totpLastStep = step;
  }

  public UUID getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getFullName() {
    return fullName;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public UserStatus getStatus() {
    return status;
  }

  public int getTokenVersion() {
    return tokenVersion;
  }

  public LoginLock getLoginLock() {
    return loginLock;
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

  public Set<Role> getRoles() {
    return roles;
  }
}
