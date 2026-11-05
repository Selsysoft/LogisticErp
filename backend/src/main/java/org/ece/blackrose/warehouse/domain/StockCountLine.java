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

@Entity
@Table(name = "stock_count_line")
public class StockCountLine extends AuditableEntity {

  @Id private UUID id;
  private UUID countId;
  private UUID binId;
  private UUID itemId;
  private String lotNo;
  private LocalDate expiryDate;

  @Enumerated(EnumType.STRING)
  private CustomsStatus customsStatus;

  private BigDecimal systemQuantity;
  private BigDecimal countedQuantity;

  protected StockCountLine() {}

  public StockCountLine(
      UUID countId,
      UUID binId,
      UUID itemId,
      String lotNo,
      LocalDate expiryDate,
      CustomsStatus customsStatus,
      BigDecimal systemQuantity) {
    this.id = UUID.randomUUID();
    this.countId = countId;
    this.binId = binId;
    this.itemId = itemId;
    this.lotNo = lotNo;
    this.expiryDate = expiryDate;
    this.customsStatus = customsStatus;
    this.systemQuantity = systemQuantity;
  }

  public void count(BigDecimal quantity) {
    countedQuantity = quantity;
  }

  public BigDecimal difference() {
    return countedQuantity == null ? null : countedQuantity.subtract(systemQuantity);
  }

  public UUID getId() {
    return id;
  }

  public UUID getCountId() {
    return countId;
  }

  public UUID getBinId() {
    return binId;
  }

  public UUID getItemId() {
    return itemId;
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

  public BigDecimal getSystemQuantity() {
    return systemQuantity;
  }

  public BigDecimal getCountedQuantity() {
    return countedQuantity;
  }
}
