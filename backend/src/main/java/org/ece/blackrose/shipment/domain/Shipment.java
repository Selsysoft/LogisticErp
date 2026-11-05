package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.web.ShipmentDtos.CreateShipmentRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveInternationalRequest;
import org.hibernate.annotations.SQLRestriction;

/** Taşıma emri. Fiyat oluşturulduğu anda sabitlenir; tarife değişse sefer değişmez. */
@Entity
@Table(name = "shipment")
@SQLRestriction("deleted = false")
public class Shipment extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private UUID accountId;
  private UUID branchId;

  @Enumerated(EnumType.STRING)
  private ShipmentStatus status;

  private String shipperName;
  private String shipperAddress;
  private String consigneeName;
  private String consigneeAddress;
  private String origin;
  private String destination;
  private Instant plannedPickup;
  private Instant plannedDelivery;
  private String vehicleType;
  private BigDecimal distanceKm;
  private UUID quoteLineId;
  private String currency;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal totalAmount;
  private String breakdown;
  private String notes;
  private String originCountry;
  private String destinationCountry;
  private String incoterm;
  private String liabilityPolicy;
  private String senderInstructions;
  private String attachedDocuments;

  protected Shipment() {}

  public Shipment(
      String number, CreateShipmentRequest request, PriceBreakdown price, String breakdownJson) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.accountId = request.accountId();
    this.branchId = request.branchId();
    this.status = ShipmentStatus.QUOTED;
    this.shipperName = request.shipperName();
    this.shipperAddress = request.shipperAddress();
    this.consigneeName = request.consigneeName();
    this.consigneeAddress = request.consigneeAddress();
    this.origin = request.origin();
    this.destination = request.destination();
    this.plannedPickup = request.plannedPickup();
    this.plannedDelivery = request.plannedDelivery();
    this.vehicleType = request.vehicleType();
    this.distanceKm = request.distanceKm();
    this.quoteLineId = request.quoteLineId();
    this.currency = price.currency();
    this.netAmount = price.net();
    this.vatAmount = price.vat();
    this.withholdingAmount = price.withholding();
    this.totalAmount = price.total();
    this.breakdown = breakdownJson;
    this.notes = request.notes();
  }

  public void updateInternational(SaveInternationalRequest request) {
    this.originCountry = request.originCountry();
    this.destinationCountry = request.destinationCountry();
    this.incoterm = request.incoterm();
    this.liabilityPolicy = request.liabilityPolicy();
    this.senderInstructions = request.senderInstructions();
    this.attachedDocuments = request.attachedDocuments();
  }

  /** Çıkış ve varış ülkesi farklıysa uluslararası taşımadır. */
  public boolean isInternational() {
    return originCountry != null
        && destinationCountry != null
        && !originCountry.equals(destinationCountry);
  }

  public String getOriginCountry() {
    return originCountry;
  }

  public String getDestinationCountry() {
    return destinationCountry;
  }

  public String getIncoterm() {
    return incoterm;
  }

  public String getLiabilityPolicy() {
    return liabilityPolicy;
  }

  public String getSenderInstructions() {
    return senderInstructions;
  }

  public String getAttachedDocuments() {
    return attachedDocuments;
  }

  /** Mesafe girilmediyse güzergâh tablosundan gelen değer yazılır. */
  public void fillDistance(BigDecimal km) {
    distanceKm = km;
  }

  public void moveTo(ShipmentStatus status) {
    this.status = status;
  }

  public Money getNet() {
    return new Money(netAmount, currency);
  }

  public Money getVat() {
    return new Money(vatAmount, currency);
  }

  public Money getWithholding() {
    return new Money(withholdingAmount, currency);
  }

  public Money getTotal() {
    return new Money(totalAmount, currency);
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public ShipmentStatus getStatus() {
    return status;
  }

  public String getShipperName() {
    return shipperName;
  }

  public String getShipperAddress() {
    return shipperAddress;
  }

  public String getConsigneeName() {
    return consigneeName;
  }

  public String getConsigneeAddress() {
    return consigneeAddress;
  }

  public String getOrigin() {
    return origin;
  }

  public String getDestination() {
    return destination;
  }

  public Instant getPlannedPickup() {
    return plannedPickup;
  }

  public Instant getPlannedDelivery() {
    return plannedDelivery;
  }

  public String getVehicleType() {
    return vehicleType;
  }

  public BigDecimal getDistanceKm() {
    return distanceKm;
  }

  public UUID getQuoteLineId() {
    return quoteLineId;
  }

  public String getBreakdown() {
    return breakdown;
  }

  public String getNotes() {
    return notes;
  }
}
