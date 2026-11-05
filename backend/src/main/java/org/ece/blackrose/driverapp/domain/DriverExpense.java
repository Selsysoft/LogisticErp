package org.ece.blackrose.driverapp.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;

/** Onaylanana kadar finansa hiçbir kayıt düşmeyen masraf taslağı. */
@Entity
@Table(name = "driver_expense")
public class DriverExpense extends AuditableEntity {

  public enum Status {
    PENDING,
    APPROVED,
    REJECTED
  }

  @Id private UUID id;
  private UUID driverId;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private CostKind kind;

  private BigDecimal amount;
  private String currency;
  private LocalDate expenseDate;
  private String description;

  @Enumerated(EnumType.STRING)
  private Status status;

  private String reviewNote;
  private UUID receiptFileId;
  private UUID tripCostId;

  protected DriverExpense() {}

  public DriverExpense(
      UUID driverId,
      UUID shipmentId,
      CostKind kind,
      BigDecimal amount,
      String currency,
      LocalDate expenseDate,
      String description,
      UUID receiptFileId) {
    this.id = UUID.randomUUID();
    this.driverId = driverId;
    this.shipmentId = shipmentId;
    this.kind = kind;
    this.amount = amount;
    this.currency = currency;
    this.expenseDate = expenseDate;
    this.description = description;
    this.receiptFileId = receiptFileId;
    this.status = Status.PENDING;
  }

  public void approve(UUID tripCostId) {
    this.status = Status.APPROVED;
    this.tripCostId = tripCostId;
  }

  public void reject(String note) {
    this.status = Status.REJECTED;
    this.reviewNote = note;
  }

  public UUID getId() {
    return id;
  }

  public UUID getDriverId() {
    return driverId;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public CostKind getKind() {
    return kind;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public LocalDate getExpenseDate() {
    return expenseDate;
  }

  public String getDescription() {
    return description;
  }

  public Status getStatus() {
    return status;
  }

  public String getReviewNote() {
    return reviewNote;
  }

  public UUID getReceiptFileId() {
    return receiptFileId;
  }

  public UUID getTripCostId() {
    return tripCostId;
  }
}
