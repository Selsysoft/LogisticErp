package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Carinin bir şirketteki kredi/risk limiti. Satır yoksa kart limiti geçerlidir; yalnız gösterim ve
 * uyarı içindir, işlem engellemez.
 */
@Entity
@Table(name = "account_company_limit")
@SQLRestriction("deleted = false")
public class AccountCompanyLimit extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID companyId;
  private BigDecimal creditLimit;
  private BigDecimal riskLimit;

  protected AccountCompanyLimit() {}

  public AccountCompanyLimit(
      UUID accountId, UUID companyId, BigDecimal creditLimit, BigDecimal riskLimit) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.companyId = companyId;
    this.creditLimit = creditLimit;
    this.riskLimit = riskLimit;
  }

  public void update(BigDecimal creditLimit, BigDecimal riskLimit) {
    this.creditLimit = creditLimit;
    this.riskLimit = riskLimit;
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public BigDecimal getCreditLimit() {
    return creditLimit;
  }

  public BigDecimal getRiskLimit() {
    return riskLimit;
  }
}
