package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.hibernate.annotations.SQLRestriction;

/** Banka hesabı veya kasa. İkisinin hareket ve bakiye kuralları aynıdır. */
@Entity
@Table(name = "fund_account")
@SQLRestriction("deleted = false")
public class FundAccount extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  @Enumerated(EnumType.STRING)
  private FundKind kind;

  private String currency;
  private UUID branchId;
  private String bankName;
  private String iban;
  private boolean allowNegative;

  protected FundAccount() {}

  public FundAccount(
      String code,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      String bankName,
      String iban,
      boolean allowNegative) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.kind = kind;
    this.currency = currency;
    update(name, branchId, bankName, iban, allowNegative);
  }

  public final void update(
      String name, UUID branchId, String bankName, String iban, boolean allowNegative) {
    this.name = name;
    this.branchId = branchId;
    this.bankName = bankName;
    this.iban = iban;
    this.allowNegative = allowNegative;
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

  public FundKind getKind() {
    return kind;
  }

  public String getCurrency() {
    return currency;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public String getBankName() {
    return bankName;
  }

  public String getIban() {
    return iban;
  }

  public boolean isAllowNegative() {
    return allowNegative;
  }
}
