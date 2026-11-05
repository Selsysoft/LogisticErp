package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "permit_usage")
@SQLRestriction("deleted = false")
public class PermitUsage extends AuditableEntity {

  @Id private UUID id;
  private UUID permitId;
  private UUID shipmentId;
  private LocalDate usedOn;

  protected PermitUsage() {}

  public PermitUsage(UUID permitId, UUID shipmentId, LocalDate usedOn) {
    this.id = UUID.randomUUID();
    this.permitId = permitId;
    this.shipmentId = shipmentId;
    this.usedOn = usedOn;
  }

  public UUID getId() {
    return id;
  }

  public UUID getPermitId() {
    return permitId;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public LocalDate getUsedOn() {
    return usedOn;
  }
}
