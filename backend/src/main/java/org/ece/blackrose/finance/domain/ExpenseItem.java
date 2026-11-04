package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "expense_item")
@SQLRestriction("deleted = false")
public class ExpenseItem extends AuditableEntity {

  @Id private UUID id;
  private UUID expenseTypeId;
  private String code;
  private String name;

  protected ExpenseItem() {}

  public ExpenseItem(UUID expenseTypeId, String code, String name) {
    this.id = UUID.randomUUID();
    this.expenseTypeId = expenseTypeId;
    this.code = code;
    this.name = name;
  }

  public UUID getId() {
    return id;
  }

  public UUID getExpenseTypeId() {
    return expenseTypeId;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }
}
