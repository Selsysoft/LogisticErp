package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;

/** CMR veya irsaliye. İçerik anlık görüntüdür; düzenlenince değişmez. */
@Entity
@Table(name = "shipment_document")
public class ShipmentDocument extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private DocumentType type;

  private String number;

  @Enumerated(EnumType.STRING)
  private DocumentStatus status;

  private String content;

  protected ShipmentDocument() {}

  public ShipmentDocument(UUID shipmentId, DocumentType type, String number, String content) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.type = type;
    this.number = number;
    this.status = DocumentStatus.DRAFT;
    this.content = content;
  }

  public void refresh(String content) {
    this.content = content;
  }

  public void issue() {
    this.status = DocumentStatus.ISSUED;
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public DocumentType getType() {
    return type;
  }

  public String getNumber() {
    return number;
  }

  public DocumentStatus getStatus() {
    return status;
  }

  public String getContent() {
    return content;
  }
}
