package org.ece.blackrose.finance.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Masraf kalemi (gider sınıflandırması; ZTO ExpenseItems). ZTO'daki "kalem = cari" deseni yoktur;
 * borç tedarikçi carisine yazılır (12.7_TASARIM §2.2). Sistem kalemi (V3 tohumu) pasifleştirilemez
 * ve türü değişmez (servis denetler).
 */
@Entity
@Table(name = "expense_item")
@SQLRestriction("deleted = false")
public class ExpenseItem extends AuditableEntity {

  @Id private UUID id;
  private UUID expenseTypeId;
  private String code;
  private String name;
  private String description;
  private String defaultUnit;
  private boolean active = true;

  @Column(name = "is_system")
  private boolean system;

  protected ExpenseItem() {}

  public ExpenseItem(UUID expenseTypeId, String code, String name) {
    this(expenseTypeId, code, name, null, null);
  }

  public ExpenseItem(
      UUID expenseTypeId, String code, String name, String description, String defaultUnit) {
    this.id = UUID.randomUUID();
    this.expenseTypeId = expenseTypeId;
    this.code = code;
    this.name = name;
    this.description = description;
    this.defaultUnit = defaultUnit;
  }

  public void update(UUID expenseTypeId, String name, String description, String defaultUnit) {
    this.expenseTypeId = expenseTypeId;
    this.name = name;
    this.description = description;
    this.defaultUnit = defaultUnit;
  }

  public void setActive(boolean active) {
    this.active = active;
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

  public String getDescription() {
    return description;
  }

  public String getDefaultUnit() {
    return defaultUnit;
  }

  public boolean isActive() {
    return active;
  }

  public boolean isSystem() {
    return system;
  }
}
