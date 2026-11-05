package org.ece.blackrose.shipment.domain;

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
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;

/** Navlun faturası. Kesildiği an müşteri carisine BORÇ yazılır; bu gelirin tek kayıt noktasıdır. */
@Entity
@Table(name = "freight_invoice")
public class FreightInvoice extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private UUID shipmentId;
  private UUID accountId;
  private UUID branchId;
  private LocalDate invoiceDate;
  private LocalDate dueDate;
  private String currency;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal totalAmount;
  private BigDecimal netTl;

  @Enumerated(EnumType.STRING)
  private InvoiceStatus status;

  protected FreightInvoice() {}

  public FreightInvoice(
      String number,
      Shipment shipment,
      LocalDate invoiceDate,
      LocalDate dueDate,
      BigDecimal netTl) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.shipmentId = shipment.getId();
    this.accountId = shipment.getAccountId();
    this.branchId = shipment.getBranchId();
    this.invoiceDate = invoiceDate;
    this.dueDate = dueDate;
    this.currency = shipment.getTotal().currency();
    this.netAmount = shipment.getNet().amount();
    this.vatAmount = shipment.getVat().amount();
    this.withholdingAmount = shipment.getWithholding().amount();
    this.totalAmount = shipment.getTotal().amount();
    this.netTl = netTl;
    this.status = InvoiceStatus.ISSUED;
  }

  public void cancel() {
    status = InvoiceStatus.CANCELLED;
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

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public LocalDate getInvoiceDate() {
    return invoiceDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public BigDecimal getNetTl() {
    return netTl;
  }

  public InvoiceStatus getStatus() {
    return status;
  }
}
