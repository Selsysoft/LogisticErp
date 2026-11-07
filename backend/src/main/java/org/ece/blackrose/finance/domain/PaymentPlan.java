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
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "payment_plan")
@SQLRestriction("deleted = false")
public class PaymentPlan extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID branchId;
  private BigDecimal amount;
  private String currency;
  private LocalDate dueDate;

  @Enumerated(EnumType.STRING)
  private PlanStatus status;

  private UUID purchaseInvoiceId;
  private String description;
  private String rejectNote;

  protected PaymentPlan() {}

  public PaymentPlan(
      UUID accountId,
      UUID branchId,
      Money money,
      LocalDate dueDate,
      UUID purchaseInvoiceId,
      String description) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.branchId = branchId;
    this.amount = money.amount();
    this.currency = money.currency();
    this.dueDate = dueDate;
    this.status = PlanStatus.DRAFT;
    this.purchaseInvoiceId = purchaseInvoiceId;
    this.description = description;
  }

  /** Ret gerekçesi yalnız plan reddedilmiş dururken anlamlıdır. */
  public void moveTo(PlanStatus status) {
    this.status = status;
    if (status != PlanStatus.REJECTED) {
      this.rejectNote = null;
    }
  }

  public void reject(String note) {
    this.status = PlanStatus.REJECTED;
    this.rejectNote = note;
  }

  public void postponeTo(LocalDate dueDate) {
    this.dueDate = dueDate;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public PlanStatus getStatus() {
    return status;
  }

  public UUID getPurchaseInvoiceId() {
    return purchaseInvoiceId;
  }

  public String getDescription() {
    return description;
  }

  public String getRejectNote() {
    return rejectNote;
  }
}
