package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.integration.domain.IntegrationTypes.GeofenceEventType;

@Entity
@Table(name = "geofence_event")
public class GeofenceEvent {

  @Id private UUID id;
  private UUID geofenceId;
  private UUID vehicleId;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private GeofenceEventType type;

  private Instant occurredAt;
  private Instant createdAt;

  protected GeofenceEvent() {}

  public GeofenceEvent(
      UUID geofenceId,
      UUID vehicleId,
      UUID shipmentId,
      GeofenceEventType type,
      Instant occurredAt) {
    this.id = UUID.randomUUID();
    this.geofenceId = geofenceId;
    this.vehicleId = vehicleId;
    this.shipmentId = shipmentId;
    this.type = type;
    this.occurredAt = occurredAt;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getGeofenceId() {
    return geofenceId;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public GeofenceEventType getType() {
    return type;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }
}
