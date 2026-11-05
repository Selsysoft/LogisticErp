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

/** Göz, ürün, lot ve gümrük durumu başına güncel miktar. Yalnız hareketle değişir. */
@Entity
@Table(name = "stock_balance")
public class StockBalance extends AuditableEntity {

  @Id private UUID id;
  private UUID warehouseId;
  private UUID binId;
  private UUID itemId;
  private UUID accountId;
  private String lotNo;
  private LocalDate expiryDate;

  @Enumerated(EnumType.STRING)
  private CustomsStatus customsStatus;

  private BigDecimal quantity;

  protected StockBalance() {}

  public StockBalance(
      WarehouseBin bin,
      StockItem item,
      String lotNo,
      LocalDate expiryDate,
      CustomsStatus customsStatus) {
    this.id = UUID.randomUUID();
    this.warehouseId = bin.getWarehouseId();
    this.binId = bin.getId();
    this.itemId = item.getId();
    this.accountId = item.getAccountId();
    this.lotNo = lotNo;
    this.expiryDate = expiryDate;
    this.customsStatus = customsStatus;
    this.quantity = BigDecimal.ZERO;
  }

  public void add(BigDecimal delta) {
    quantity = quantity.add(delta);
  }

  public UUID getId() {
    return id;
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

  public LocalDate getExpiryDate() {
    return expiryDate;
  }

  public CustomsStatus getCustomsStatus() {
    return customsStatus;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }
}
