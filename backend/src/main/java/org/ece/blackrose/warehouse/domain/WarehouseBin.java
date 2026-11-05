package org.ece.blackrose.warehouse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "warehouse_bin")
@SQLRestriction("deleted = false")
public class WarehouseBin extends AuditableEntity {

  @Id private UUID id;
  private UUID warehouseId;
  private String code;
  private String description;

  protected WarehouseBin() {}

  public WarehouseBin(UUID warehouseId, String code, String description) {
    this.id = UUID.randomUUID();
    this.warehouseId = warehouseId;
    this.code = code;
    this.description = description;
  }

  public UUID getId() {
    return id;
  }

  public UUID getWarehouseId() {
    return warehouseId;
  }

  public String getCode() {
    return code;
  }

  public String getDescription() {
    return description;
  }
}
