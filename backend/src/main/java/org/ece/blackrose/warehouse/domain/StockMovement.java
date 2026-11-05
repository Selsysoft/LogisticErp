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
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CustomsStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.MovementType;

/** Değişmez stok hareketi. Miktar işaretlidir: giriş artı, çıkış eksi. */
@Entity
@Table(name = "stock_movement")
public class StockMovement extends AuditableEntity {

  /** Hareketin kaynak bilgileri; zorunlu olmayanlar boş kalabilir. */
  public record Details(
      LocalDate movedOn,
      UUID shipmentId,
      UUID countId,
      UUID reversesId,
      String reference,
      String note) {}

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private MovementType type;

  private UUID warehouseId;
  private UUID binId;
  private UUID itemId;
  private UUID accountId;
  private String lotNo;

  @Enumerated(EnumType.STRING)
  private CustomsStatus customsStatus;

  private BigDecimal quantity;
  private LocalDate movedOn;
  private UUID shipmentId;
  private UUID countId;
  private UUID reversesId;
  private String reference;
  private String note;

  protected StockMovement() {}

  public StockMovement(
      MovementType type, StockBalance balance, BigDecimal quantity, Details details) {
    this.id = UUID.randomUUID();
    this.type = type;
    this.warehouseId = balance.getWarehouseId();
    this.binId = balance.getBinId();
    this.itemId = balance.getItemId();
    this.accountId = balance.getAccountId();
    this.lotNo = balance.getLotNo();
    this.customsStatus = balance.getCustomsStatus();
    this.quantity = quantity;
    this.movedOn = details.movedOn();
    this.shipmentId = details.shipmentId();
    this.countId = details.countId();
    this.reversesId = details.reversesId();
    this.reference = details.reference();
    this.note = details.note();
  }

  public UUID getId() {
    return id;
  }

  public MovementType getType() {
    return type;
  }

  public UUID getWarehouseId() {
    return warehouseId;
  }

  public UUID getBinId() {
    return binId;
  }

  public UUID getItemId() {
    return itemId;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getLotNo() {
    return lotNo;
  }

  public CustomsStatus getCustomsStatus() {
    return customsStatus;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public LocalDate getMovedOn() {
    return movedOn;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getCountId() {
    return countId;
  }

  public UUID getReversesId() {
    return reversesId;
  }

  public String getReference() {
    return reference;
  }

  public String getNote() {
    return note;
  }
}
