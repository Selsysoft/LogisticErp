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
import org.hibernate.annotations.SQLRestriction;

/**
 * Önceki sistemden gelen açık fatura: belge numarası önceki sistemindir, tutar açık kalan kısımdır.
 * Alacaksa nakit öngörüsüne vadesiyle girer; borçsa bir ödeme planı taşır.
 */
@Entity
@Table(name = "opening_invoice")
@SQLRestriction("deleted = false")
public class OpeningInvoice extends AuditableEntity {

  public enum Kind {
    RECEIVABLE,
    PAYABLE
  }

  public enum Status {
    OPEN,
    CANCELLED
  }

  @Id private UUID id;
  private UUID accountId;
  private UUID branchId;

  @Enumerated(EnumType.STRING)
  private Kind kind;

  private String number;
  private LocalDate invoiceDate;
  private LocalDate dueDate;
  private String currency;
  private BigDecimal totalAmount;

  @Enumerated(EnumType.STRING)
  private Status status;

  private UUID paymentPlanId;

  protected OpeningInvoice() {}

  public OpeningInvoice(
      UUID accountId,
      UUID branchId,
      Kind kind,
      String number,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Money total) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.branchId = branchId;
    this.kind = kind;
    this.number = number;
    this.invoiceDate = invoiceDate;
    this.dueDate = dueDate;
    this.currency = total.currency();
    this.totalAmount = total.amount();
    this.status = Status.OPEN;
  }

  public void linkPlan(UUID planId) {
    this.paymentPlanId = planId;
  }

  public void cancel() {
    this.status = Status.CANCELLED;
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public Kind getKind() {
    return kind;
  }

  public String getNumber() {
    return number;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public Money getTotal() {
    return new Money(totalAmount, currency);
  }

  public Status getStatus() {
    return status;
  }

  public UUID getPaymentPlanId() {
    return paymentPlanId;
  }
}
