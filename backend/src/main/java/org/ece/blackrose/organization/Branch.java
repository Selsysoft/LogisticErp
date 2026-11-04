package org.ece.blackrose.organization;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "branch")
@SQLRestriction("deleted = false")
public class Branch extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  protected Branch() {}

  public Branch(String code, String name) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.name = name;
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
}
