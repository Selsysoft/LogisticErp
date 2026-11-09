package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** Müşteriye verilen takip bağlantısı. Anahtar yalnız oluşturulurken bir kez gösterilir. */
@Entity
@Table(name = "shipment_tracking_link")
@SQLRestriction("deleted = false")
public class ShipmentTrackingLink extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private String tokenHash;
  private Instant expiresAt;
  private Instant revokedAt;
  private int viewCount;
  private Instant lastViewedAt;

  protected ShipmentTrackingLink() {}

  public ShipmentTrackingLink(UUID shipmentId, String tokenHash, Instant expiresAt) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
  }

  public boolean isUsableAt(Instant now) {
    return revokedAt == null && expiresAt.isAfter(now);
  }

  public void revoke(Instant now) {
    if (revokedAt == null) {
      revokedAt = now;
    }
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getRevokedAt() {
    return revokedAt;
  }

  public int getViewCount() {
    return viewCount;
  }

  public Instant getLastViewedAt() {
    return lastViewedAt;
  }
}
