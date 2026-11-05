package org.ece.blackrose.warehouse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveWarehouseRequest;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "warehouse")
@SQLRestriction("deleted = false")
public class Warehouse extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;
  private UUID branchId;
  private String address;
  private boolean bonded;
  private String customsNo;

  protected Warehouse() {}

  public Warehouse(SaveWarehouseRequest request) {
    this.id = UUID.randomUUID();
    this.code = request.code();
    update(request);
  }

  public final void update(SaveWarehouseRequest request) {
    this.name = request.name();
    this.branchId = request.branchId();
    this.address = request.address();
    this.bonded = request.bonded();
    this.customsNo = request.customsNo();
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public String getAddress() {
    return address;
  }

  public boolean isBonded() {
    return bonded;
  }

  public String getCustomsNo() {
    return customsNo;
  }
}
