package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** Seferin bir etabı. Etap öz filoya (araç + sürücü) ya da taşerona atanır. */
@Entity
@Table(name = "shipment_leg")
@SQLRestriction("deleted = false")
public class ShipmentLeg extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;

  @Column(name = "sequence_no")
  private int sequenceNo;

  private String origin;
  private String destination;
  private Instant plannedStart;
  private Instant plannedEnd;
  private UUID vehicleId;
  private UUID trailerId;
  private UUID driverId;
  private UUID carrierAccountId;

  protected ShipmentLeg() {}

  public ShipmentLeg(
      UUID shipmentId,
      int sequenceNo,
      String origin,
      String destination,
      Instant plannedStart,
      Instant plannedEnd) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.sequenceNo = sequenceNo;
    this.origin = origin;
    this.destination = destination;
    this.plannedStart = plannedStart;
    this.plannedEnd = plannedEnd;
  }

  public void assignOwnFleet(UUID vehicleId, UUID trailerId, UUID driverId) {
    this.vehicleId = vehicleId;
    this.trailerId = trailerId;
    this.driverId = driverId;
    this.carrierAccountId = null;
  }

  public void assignCarrier(UUID carrierAccountId) {
    this.vehicleId = null;
    this.trailerId = null;
    this.driverId = null;
    this.carrierAccountId = carrierAccountId;
  }

  public boolean isAssigned() {
    return carrierAccountId != null || (vehicleId != null && driverId != null);
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public int getSequenceNo() {
    return sequenceNo;
  }

  public String getOrigin() {
    return origin;
  }

  public String getDestination() {
    return destination;
  }

  public Instant getPlannedStart() {
    return plannedStart;
  }

  public Instant getPlannedEnd() {
    return plannedEnd;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public UUID getTrailerId() {
    return trailerId;
  }

  public UUID getDriverId() {
    return driverId;
  }

  public UUID getCarrierAccountId() {
    return carrierAccountId;
  }
}
