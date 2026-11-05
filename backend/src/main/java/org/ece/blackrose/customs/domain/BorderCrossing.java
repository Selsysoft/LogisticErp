package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.customs.domain.CustomsTypes.CrossingDirection;
import org.hibernate.annotations.SQLRestriction;

/** Sınır geçişi. Ücret varsa sefer gideri olur ve sefer kapanınca finansa yazılır. */
@Entity
@Table(name = "border_crossing")
@SQLRestriction("deleted = false")
public class BorderCrossing extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private String gate;

  @Enumerated(EnumType.STRING)
  private CrossingDirection direction;

  private LocalDate crossedOn;
  private UUID tripCostId;
  private String note;

  protected BorderCrossing() {}

  public BorderCrossing(
      UUID shipmentId,
      String gate,
      CrossingDirection direction,
      LocalDate crossedOn,
      UUID tripCostId,
      String note) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.gate = gate;
    this.direction = direction;
    this.crossedOn = crossedOn;
    this.tripCostId = tripCostId;
    this.note = note;
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public String getGate() {
    return gate;
  }

  public CrossingDirection getDirection() {
    return direction;
  }

  public LocalDate getCrossedOn() {
    return crossedOn;
  }

  public UUID getTripCostId() {
    return tripCostId;
  }

  public String getNote() {
    return note;
  }
}
