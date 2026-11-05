package org.ece.blackrose.warehouse.domain;

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
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.WarehouseInvoiceStatus;

/** Dönemsel depolama ve elleçleme faturası. Kesildiğinde müşteri carisine BORÇ yazılır. */
@Entity
@Table(name = "warehouse_invoice")
public class WarehouseInvoice extends AuditableEntity {

  /** Dönem hesabının sonucu. */
  public record Amounts(BigDecimal storageQuantity, BigDecimal storage, BigDecimal handling) {}

  @Id private UUID id;
  private String number;
  private UUID contractId;
  private UUID accountId;
  private UUID branchId;
  private LocalDate periodFrom;
  private LocalDate periodTo;
  private LocalDate invoiceDate;
  private LocalDate dueDate;
  private String currency;
  private BigDecimal storageQuantity;
  private BigDecimal storageAmount;
  private BigDecimal handlingAmount;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal totalAmount;

  @Enumerated(EnumType.STRING)
  private WarehouseInvoiceStatus status;

  protected WarehouseInvoice() {}

  public WarehouseInvoice(
      String number,
      WarehouseContract contract,
      UUID branchId,
      LocalDate periodFrom,
      LocalDate periodTo,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Amounts amounts,
      PriceBreakdown price) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.contractId = contract.getId();
    this.accountId = contract.getAccountId();
    this.branchId = branchId;
    this.periodFrom = periodFrom;
    this.periodTo = periodTo;
    this.invoiceDate = invoiceDate;
    this.dueDate = dueDate;
    this.currency = contract.getCurrency();
    this.storageQuantity = amounts.storageQuantity();
    this.storageAmount = amounts.storage();
    this.handlingAmount = amounts.handling();
    this.netAmount = price.net();
    this.vatAmount = price.vat();
    this.withholdingAmount = price.withholding();
    this.totalAmount = price.total();
    this.status = WarehouseInvoiceStatus.ISSUED;
  }

  public void cancel() {
    status = WarehouseInvoiceStatus.CANCELLED;
  }

  public Money getStorage() {
    return new Money(storageAmount, currency);
  }

  public Money getHandling() {
    return new Money(handlingAmount, currency);
  }

  public Money getNet() {
    return new Money(netAmount, currency);
  }

  public Money getVat() {
    return new Money(vatAmount, currency);
  }

  public Money getWithholding() {
    return new Money(withholdingAmount, currency);
  }

  public Money getTotal() {
    return new Money(totalAmount, currency);
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public UUID getContractId() {
    return contractId;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public LocalDate getPeriodFrom() {
    return periodFrom;
  }

  public LocalDate getPeriodTo() {
    return periodTo;
  }

  public LocalDate getInvoiceDate() {
    return invoiceDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public BigDecimal getStorageQuantity() {
    return storageQuantity;
  }

  public WarehouseInvoiceStatus getStatus() {
    return status;
  }
}
