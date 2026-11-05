package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Araç konum kaydı. Çok satır üreteceği için denetim alanı taşımaz. */
@Entity
@Table(name = "vehicle_position")
public class VehiclePosition {

  @Id private UUID id;
  private UUID vehicleId;
  private Instant recordedAt;
  private BigDecimal latitude;
  private BigDecimal longitude;
  private BigDecimal speedKmh;
  private Instant createdAt;

  protected VehiclePosition() {}

  public VehiclePosition(
      UUID vehicleId,
      Instant recordedAt,
      BigDecimal latitude,
      BigDecimal longitude,
      BigDecimal speedKmh) {
    this.id = UUID.randomUUID();
    this.vehicleId = vehicleId;
    this.recordedAt = recordedAt;
    this.latitude = latitude;
    this.longitude = longitude;
    this.speedKmh = speedKmh;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public Instant getRecordedAt() {
    return recordedAt;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public BigDecimal getSpeedKmh() {
    return speedKmh;
  }
}
