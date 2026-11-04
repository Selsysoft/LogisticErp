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
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.hibernate.annotations.SQLRestriction;

/** Çek veya senet. Geçiş kuralları InstrumentService içindeki tabloda tanımlıdır. */
@Entity
@Table(name = "instrument")
@SQLRestriction("deleted = false")
public class Instrument extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private InstrumentKind kind;

  @Enumerated(EnumType.STRING)
  private InstrumentDirection direction;

  private String number;
  private String bankName;
  private UUID accountId;
  private UUID endorsedAccountId;
  private UUID branchId;
  private UUID fundAccountId;
  private BigDecimal amount;
  private String currency;
  private LocalDate dueDate;

  @Enumerated(EnumType.STRING)
  private InstrumentStatus status;

  protected Instrument() {}

  public Instrument(
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      String bankName,
      UUID accountId,
      UUID branchId,
      Money money,
      LocalDate dueDate,
      InstrumentStatus status) {
    this.id = UUID.randomUUID();
    this.kind = kind;
    this.direction = direction;
    this.number = number;
    this.bankName = bankName;
    this.accountId = accountId;
    this.branchId = branchId;
    this.amount = money.amount();
    this.currency = money.currency();
    this.dueDate = dueDate;
    this.status = status;
  }

  public void moveTo(InstrumentStatus status) {
    this.status = status;
  }

  public void assignFund(UUID fundAccountId) {
    this.fundAccountId = fundAccountId;
  }

  public void endorseTo(UUID accountId) {
    this.endorsedAccountId = accountId;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public InstrumentKind getKind() {
    return kind;
  }

  public InstrumentDirection getDirection() {
    return direction;
  }

  public String getNumber() {
    return number;
  }

  public String getBankName() {
    return bankName;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getEndorsedAccountId() {
    return endorsedAccountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public InstrumentStatus getStatus() {
    return status;
  }
}
