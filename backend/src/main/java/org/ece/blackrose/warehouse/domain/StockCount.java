package org.ece.blackrose.warehouse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;

/** Depo sayımı. Açık sayım boyunca o depoda stok hareketi yapılamaz. */
@Entity
@Table(name = "stock_count")
public class StockCount extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private UUID warehouseId;
  private LocalDate countDate;

  @Enumerated(EnumType.STRING)
  private CountStatus status;

  protected StockCount() {}

  public StockCount(String number, UUID warehouseId, LocalDate countDate) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.warehouseId = warehouseId;
    this.countDate = countDate;
    this.status = CountStatus.OPEN;
  }

  public void post() {
    status = CountStatus.POSTED;
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public UUID getWarehouseId() {
    return warehouseId;
  }

  public LocalDate getCountDate() {
    return countDate;
  }

  public CountStatus getStatus() {
    return status;
  }
}
