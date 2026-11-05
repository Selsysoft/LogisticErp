package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.shipment.web.ShipmentDtos.SavePodRequest;

/** Teslim kanıtı. İmza veya fotoğraf, sefere dosya olarak eklenir. */
@Entity
@Table(name = "proof_of_delivery")
public class ProofOfDelivery extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private String recipientName;
  private Instant deliveredAt;
  private BigDecimal latitude;
  private BigDecimal longitude;
  private String note;

  protected ProofOfDelivery() {}

  public ProofOfDelivery(UUID shipmentId) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
  }

  public void update(SavePodRequest request) {
    this.recipientName = request.recipientName();
    this.deliveredAt = request.deliveredAt();
    this.latitude = request.latitude();
    this.longitude = request.longitude();
    this.note = request.note();
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public String getRecipientName() {
    return recipientName;
  }

  public Instant getDeliveredAt() {
    return deliveredAt;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public String getNote() {
    return note;
  }
}
