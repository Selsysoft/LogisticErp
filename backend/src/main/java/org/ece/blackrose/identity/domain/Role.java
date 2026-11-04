package org.ece.blackrose.identity.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "role")
@SQLRestriction("deleted = false")
public class Role extends AuditableEntity {

  public static final String OWNER_CODE = "PATRON";

  @Id private UUID id;
  private String code;
  private String name;
  private boolean locked;
  private int priority;
  private String landingPath;

  @ElementCollection(fetch = FetchType.EAGER)
  @CollectionTable(name = "role_permission", joinColumns = @JoinColumn(name = "role_id"))
  @Column(name = "permission")
  @Enumerated(EnumType.STRING)
  private Set<Permission> permissions = new HashSet<>();

  protected Role() {}

  public Role(
      String code, String name, int priority, String landingPath, Set<Permission> permissions) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.name = name;
    this.priority = priority;
    this.landingPath = landingPath;
    this.permissions = new HashSet<>(permissions);
  }

  public void update(String name, int priority, String landingPath, Set<Permission> permissions) {
    this.name = name;
    this.priority = priority;
    this.landingPath = landingPath;
    this.permissions = new HashSet<>(permissions);
  }

  public boolean isOwner() {
    return OWNER_CODE.equals(code);
  }

  public Set<Permission> getEffectivePermissions() {
    return isOwner() ? EnumSet.allOf(Permission.class) : Set.copyOf(permissions);
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

  public boolean isLocked() {
    return locked;
  }

  public int getPriority() {
    return priority;
  }

  public String getLandingPath() {
    return landingPath;
  }
}
