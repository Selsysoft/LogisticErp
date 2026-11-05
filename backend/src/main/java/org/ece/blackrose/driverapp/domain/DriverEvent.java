package org.ece.blackrose.driverapp.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Sürücünün sahadan bildirdiği an: zaman ve varsa konum damgası. */
@Entity
@Table(name = "driver_event")
public class DriverEvent extends AuditableEntity {

  public enum Kind {
    LOADED,
    IN_TRANSIT,
    BREAK,
    UNLOADED,
    DELIVERED
  }

  @Id private UUID id;
  private UUID shipmentId;
  private UUID driverId;

  @Enumerated(EnumType.STRING)
  private Kind kind;

  private Instant occurredAt;
  private BigDecimal latitude;
  private BigDecimal longitude;
  private String note;

  protected DriverEvent() {}

  public DriverEvent(
      UUID shipmentId,
      UUID driverId,
      Kind kind,
      Instant occurredAt,
      BigDecimal latitude,
      BigDecimal longitude,
      String note) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.driverId = driverId;
    this.kind = kind;
    this.occurredAt = occurredAt;
    this.latitude = latitude;
    this.longitude = longitude;
    this.note = note;
  }

  public UUID getId() {
    return id;
  }
}
