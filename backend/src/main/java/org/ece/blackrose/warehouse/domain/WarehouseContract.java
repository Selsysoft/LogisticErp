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
import org.ece.blackrose.warehouse.domain.WarehouseTypes.StorageBasis;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveContractRequest;
import org.hibernate.annotations.SQLRestriction;

/** Müşteri ve depo için 3PL fiyatı. */
@Entity
@Table(name = "warehouse_contract")
@SQLRestriction("deleted = false")
public class WarehouseContract extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID warehouseId;
  private LocalDate startDate;
  private LocalDate endDate;
  private String currency;

  @Enumerated(EnumType.STRING)
  private StorageBasis storageBasis;

  private BigDecimal storageRate;
  private UUID taxRateId;

  protected WarehouseContract() {}

  public WarehouseContract(SaveContractRequest request) {
    this.id = UUID.randomUUID();
    this.accountId = request.accountId();
    this.warehouseId = request.warehouseId();
    this.startDate = request.startDate();
    this.endDate = request.endDate();
    this.currency = request.currency();
    this.storageBasis = request.storageBasis();
    this.storageRate = request.storageRate();
    this.taxRateId = request.taxRateId();
  }

  public boolean covers(LocalDate date) {
    return !date.isBefore(startDate) && !date.isAfter(endDate);
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getWarehouseId() {
    return warehouseId;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public String getCurrency() {
    return currency;
  }

  public StorageBasis getStorageBasis() {
    return storageBasis;
  }

  public BigDecimal getStorageRate() {
    return storageRate;
  }

  public UUID getTaxRateId() {
    return taxRateId;
  }
}
