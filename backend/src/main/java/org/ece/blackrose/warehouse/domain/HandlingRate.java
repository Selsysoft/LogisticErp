package org.ece.blackrose.warehouse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.HandlingKind;

@Entity
@Table(name = "handling_rate")
public class HandlingRate extends AuditableEntity {

  @Id private UUID id;
  private UUID contractId;

  @Enumerated(EnumType.STRING)
  private HandlingKind kind;

  private BigDecimal unitPrice;

  protected HandlingRate() {}

  public HandlingRate(UUID contractId, HandlingKind kind, BigDecimal unitPrice) {
    this.id = UUID.randomUUID();
    this.contractId = contractId;
    this.kind = kind;
    this.unitPrice = unitPrice;
  }

  public void changePrice(BigDecimal price) {
    unitPrice = price;
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

  public BigDecimal getUnitPrice() {
    return unitPrice;
  }
}
