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
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.hibernate.annotations.SQLRestriction;

/**
 * Sefer gideri. Cariye bağlı gider sefer kapanınca borç yazar. Araç giderine bağlı olan zaten
 * finansa yazılmıştır, yalnız kârlılıkta sayılır; böylece aynı gider iki kez işlenmez.
 */
@Entity
@Table(name = "trip_cost")
@SQLRestriction("deleted = false")
public class TripCost extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private UUID legId;

  @Enumerated(EnumType.STRING)
  private CostKind kind;

  private UUID accountId;
  private UUID vehicleExpenseId;
  private BigDecimal amount;
  private String currency;
  private BigDecimal tlAmount;
  private String description;
  private Instant postedAt;

  protected TripCost() {}

  public TripCost(
      UUID shipmentId,
      UUID legId,
      CostKind kind,
      UUID accountId,
      UUID vehicleExpenseId,
      Money money,
      BigDecimal tlAmount,
      String description) {
    this.id = UUID.randomUUID();
    this.shipmentId = shipmentId;
    this.legId = legId;
    this.kind = kind;
    this.accountId = accountId;
    this.vehicleExpenseId = vehicleExpenseId;
    this.amount = money.amount();
    this.currency = money.currency();
    this.tlAmount = tlAmount;
    this.description = description;
  }

  public void markPosted(Instant now) {
    postedAt = now;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getLegId() {
    return legId;
  }

  public CostKind getKind() {
    return kind;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getVehicleExpenseId() {
    return vehicleExpenseId;
  }

  public BigDecimal getTlAmount() {
    return tlAmount;
  }

  public String getDescription() {
    return description;
  }

  public Instant getPostedAt() {
    return postedAt;
  }
}
