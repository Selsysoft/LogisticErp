package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** Firmanın kendi güzergâh tablosu. Harita servisi seçilene kadar mesafe kaynağıdır. */
@Entity
@Table(name = "route_distance")
@SQLRestriction("deleted = false")
public class RouteDistance extends AuditableEntity {

  @Id private UUID id;
  private String origin;
  private String destination;
  private String routeKey;
  private BigDecimal distanceKm;
  private int minutes;

  protected RouteDistance() {}

  public RouteDistance(
      String origin, String destination, String routeKey, BigDecimal distanceKm, int minutes) {
    this.id = UUID.randomUUID();
    this.origin = origin;
    this.destination = destination;
    this.routeKey = routeKey;
    this.distanceKm = distanceKm;
    this.minutes = minutes;
  }

  public UUID getId() {
    return id;
  }

  public String getOrigin() {
    return origin;
  }

  public String getDestination() {
    return destination;
  }

  public String getRouteKey() {
    return routeKey;
  }

  public BigDecimal getDistanceKm() {
    return distanceKm;
  }

  public int getMinutes() {
    return minutes;
  }
}
