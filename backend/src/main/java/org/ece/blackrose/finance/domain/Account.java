package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "account")
@SQLRestriction("deleted = false")
public class Account extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  @Enumerated(EnumType.STRING)
  private AccountType type;

  private String taxNumber;
  private UUID branchId;

  protected Account() {}

  public Account(String code, String name, AccountType type, String taxNumber, UUID branchId) {
    this.id = UUID.randomUUID();
    this.code = code;
    update(name, type, taxNumber, branchId);
  }

  public final void update(String name, AccountType type, String taxNumber, UUID branchId) {
    this.name = name;
    this.type = type;
    this.taxNumber = taxNumber;
    this.branchId = branchId;
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

  public AccountType getType() {
    return type;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public UUID getBranchId() {
    return branchId;
  }
}
