package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;

/** Ödeme veya tahsilat. İkisi aynı akışı ters yönde izler. */
@Entity
@Table(name = "settlement")
public class Settlement extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private SettlementType type;

  @Enumerated(EnumType.STRING)
  private SettlementMethod method;

  private UUID accountId;
  private UUID branchId;
  private UUID fundAccountId;
  private UUID instrumentId;
  private UUID expenseItemId;
  private UUID planId;
  private BigDecimal amount;
  private String currency;
  private LocalDate settlementDate;
  private String description;

  @Enumerated(EnumType.STRING)
  private SettlementStatus status;

  private String idempotencyKey;

  protected Settlement() {}

  public Settlement(
      SettlementType type,
      SettlementMethod method,
      UUID accountId,
      UUID branchId,
      UUID fundAccountId,
      UUID instrumentId,
      UUID expenseItemId,
      UUID planId,
      Money money,
      LocalDate settlementDate,
      String description,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.type = type;
    this.method = method;
    this.accountId = accountId;
    this.branchId = branchId;
    this.fundAccountId = fundAccountId;
    this.instrumentId = instrumentId;
    this.expenseItemId = expenseItemId;
    this.planId = planId;
    this.amount = money.amount();
    this.currency = money.currency();
    this.settlementDate = settlementDate;
    this.description = description;
    this.status = SettlementStatus.POSTED;
    this.idempotencyKey = idempotencyKey;
  }

  public void markReversed() {
    status = SettlementStatus.REVERSED;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public SettlementType getType() {
    return type;
  }

  public SettlementMethod getMethod() {
    return method;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public UUID getInstrumentId() {
    return instrumentId;
  }

  public UUID getExpenseItemId() {
    return expenseItemId;
  }

  public UUID getPlanId() {
    return planId;
  }

  public LocalDate getSettlementDate() {
    return settlementDate;
  }

  public String getDescription() {
    return description;
  }

  public SettlementStatus getStatus() {
    return status;
  }
}
