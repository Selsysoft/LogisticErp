package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** Daire biçiminde bölge: müşteri deposu, sınır kapısı. */
@Entity
@Table(name = "geofence")
@SQLRestriction("deleted = false")
public class Geofence extends AuditableEntity {

  @Id private UUID id;
  private String name;
  private BigDecimal latitude;
  private BigDecimal longitude;

  @jakarta.persistence.Column(name = "radius_m")
  private int radiusM;

  protected Geofence() {}

  public Geofence(String name, BigDecimal latitude, BigDecimal longitude, int radiusM) {
    this.id = UUID.randomUUID();
    this.name = name;
    this.latitude = latitude;
    this.longitude = longitude;
    this.radiusM = radiusM;
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public int getRadiusM() {
    return radiusM;
  }
}
