package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "expense_type")
@SQLRestriction("deleted = false")
public class ExpenseType extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  protected ExpenseType() {}

  public ExpenseType(String code, String name) {
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
