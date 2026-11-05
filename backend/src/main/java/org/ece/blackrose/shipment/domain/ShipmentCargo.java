package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.shipment.web.ShipmentDtos.CargoRequest;

@Entity
@Table(name = "shipment_cargo")
public class ShipmentCargo extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private String description;
  private BigDecimal quantity;
  private String packaging;
  private BigDecimal weightKg;

  @Column(name = "volume_m3")
  private BigDecimal volumeM3;

  private String adrClass;

  protected ShipmentCargo() {}

  public ShipmentCargo(UUID shipmentId, CargoRequest request) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.description = request.description();
    this.quantity = request.quantity();
    this.packaging = request.packaging();
    this.weightKg = request.weightKg();
    this.volumeM3 = request.volumeM3();
    this.adrClass = request.adrClass();
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public String getPackaging() {
    return packaging;
  }

  public BigDecimal getWeightKg() {
    return weightKg;
  }

  public BigDecimal getVolumeM3() {
    return volumeM3;
  }

  public String getAdrClass() {
    return adrClass;
  }
}
