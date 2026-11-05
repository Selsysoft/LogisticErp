package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;

/** Sefer zaman çizelgesi. Kim ve ne zaman bilgisi denetim alanlarından gelir. */
@Entity
@Table(name = "shipment_event")
public class ShipmentEvent extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private EventType type;

  @Enumerated(EnumType.STRING)
  private ShipmentStatus fromStatus;

  @Enumerated(EnumType.STRING)
  private ShipmentStatus toStatus;

  private String message;

  protected ShipmentEvent() {}

  public ShipmentEvent(
      UUID shipmentId,
      EventType type,
      ShipmentStatus fromStatus,
      ShipmentStatus toStatus,
      String message) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.type = type;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.message = message;
  }

  public UUID getId() {
    return id;
  }

  public EventType getType() {
    return type;
  }

  public ShipmentStatus getFromStatus() {
    return fromStatus;
  }

  public ShipmentStatus getToStatus() {
    return toStatus;
  }

  public String getMessage() {
    return message;
  }
}
