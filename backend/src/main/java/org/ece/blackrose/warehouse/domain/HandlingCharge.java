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
import org.ece.blackrose.warehouse.domain.WarehouseTypes.HandlingKind;
import org.hibernate.annotations.SQLRestriction;

/** Yapılan elleçleme hizmeti. Fiyat kayıt anında sabitlenir, faturaya bir kez girer. */
@Entity
@Table(name = "handling_charge")
@SQLRestriction("deleted = false")
public class HandlingCharge extends AuditableEntity {

  @Id private UUID id;
  private UUID contractId;

  @Enumerated(EnumType.STRING)
  private HandlingKind kind;

  private BigDecimal quantity;
  private BigDecimal unitPrice;
  private BigDecimal amount;
  private LocalDate chargedOn;
  private UUID shipmentId;
  private UUID invoiceId;
  private String note;

  protected HandlingCharge() {}

  public HandlingCharge(
      UUID contractId,
      HandlingKind kind,
      BigDecimal quantity,
      BigDecimal unitPrice,
      BigDecimal amount,
      LocalDate chargedOn,
      UUID shipmentId,
      String note) {
    this.id = UUID.randomUUID();
    this.contractId = contractId;
    this.kind = kind;
    this.quantity = quantity;
    this.unitPrice = unitPrice;
    this.amount = amount;
    this.chargedOn = chargedOn;
    this.shipmentId = shipmentId;
    this.note = note;
  }

  public void bill(UUID invoice) {
    invoiceId = invoice;
  }

  public UUID getId() {
    return id;
  }

  public UUID getContractId() {
    return contractId;
  }

  public HandlingKind getKind() {
    return kind;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public BigDecimal getUnitPrice() {
    return unitPrice;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public LocalDate getChargedOn() {
    return chargedOn;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getInvoiceId() {
    return invoiceId;
  }

  public String getNote() {
    return note;
  }
}
