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
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceStatus;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "purchase_invoice")
@SQLRestriction("deleted = false")
public class PurchaseInvoice extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID branchId;
  private String number;
  private LocalDate invoiceDate;
  private LocalDate dueDate;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal totalAmount;
  private String currency;

  @Enumerated(EnumType.STRING)
  private InvoiceStatus status;

  private String description;

  protected PurchaseInvoice() {}

  public PurchaseInvoice(
      UUID accountId,
      UUID branchId,
      String number,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Money net,
      Money vat,
      String description) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.branchId = branchId;
    this.number = number;
    this.invoiceDate = invoiceDate;
    this.dueDate = dueDate;
    this.netAmount = net.amount();
    this.vatAmount = vat.amount();
    this.totalAmount = net.add(vat).amount();
    this.currency = net.currency();
    this.status = InvoiceStatus.OPEN;
    this.description = description;
  }

  public void cancel() {
    status = InvoiceStatus.CANCELLED;
  }

  public Money getTotal() {
    return new Money(totalAmount, currency);
  }

  public Money getNet() {
    return new Money(netAmount, currency);
  }

  public Money getVat() {
    return new Money(vatAmount, currency);
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

  public String getNumber() {
    return number;
  }

  public LocalDate getInvoiceDate() {
    return invoiceDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public InvoiceStatus getStatus() {
    return status;
  }

  public String getDescription() {
    return description;
  }
}
