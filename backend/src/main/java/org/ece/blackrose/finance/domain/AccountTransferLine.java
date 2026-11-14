package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.hibernate.annotations.SQLRestriction;

/**
 * Taşınan tek hareket. Virman çiftinin {@code source_id}'si bu satırın kimliğidir. Bir hareket aynı
 * anda yalnız bir etkin taşımada olabilir (kısmi tekil indeks).
 */
@Entity
@Table(name = "account_transfer_line")
@SQLRestriction("deleted = false")
public class AccountTransferLine extends AuditableEntity {

  @Id private UUID id;
  private UUID accountTransferId;
  private UUID accountTransactionId;
  private UUID branchId;
  private UUID companyId;

  /** Orijinal hareketin yönü. */
  @Enumerated(EnumType.STRING)
  private Direction direction;

  private BigDecimal amount;
  private String currency;
  private boolean active;

  protected AccountTransferLine() {}

  public AccountTransferLine(
      UUID accountTransferId,
      UUID accountTransactionId,
      UUID branchId,
      UUID companyId,
      Direction direction,
      Money money) {
    this.id = UUID.randomUUID();
    this.accountTransferId = accountTransferId;
    this.accountTransactionId = accountTransactionId;
    this.branchId = branchId;
    this.companyId = companyId;
    this.direction = direction;
    this.amount = money.amount();
    this.currency = money.currency();
    this.active = true;
  }

  /** Taşıma geri alınınca hareket yeniden taşınabilir olur. */
  public void deactivate() {
    this.active = false;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountTransferId() {
    return accountTransferId;
  }

  public UUID getAccountTransactionId() {
    return accountTransactionId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public Direction getDirection() {
    return direction;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public boolean isActive() {
    return active;
  }
}
