package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** Fiyat kırılımı anlık görüntü olarak saklanır; tarife sonradan değişse de teklif değişmez. */
@Entity
@Table(name = "quote_line")
@SQLRestriction("deleted = false")
public class QuoteLine extends AuditableEntity {

  @Id private UUID id;
  private UUID quoteId;
  private String origin;
  private String destination;
  private String vehicleType;
  private BigDecimal weightTon;
  private Integer pallets;
  private BigDecimal distanceKm;
  private String description;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal totalAmount;
  private String breakdown;

  protected QuoteLine() {}

  public QuoteLine(
      UUID quoteId,
      String origin,
      String destination,
      String vehicleType,
      BigDecimal weightTon,
      Integer pallets,
      BigDecimal distanceKm,
      String description,
      BigDecimal netAmount,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal totalAmount,
      String breakdown) {
    this.id = UUID.randomUUID();
    this.quoteId = quoteId;
    this.origin = origin;
    this.destination = destination;
    this.vehicleType = vehicleType;
    this.weightTon = weightTon;
    this.pallets = pallets;
    this.distanceKm = distanceKm;
    this.description = description;
    this.netAmount = netAmount;
    this.vatAmount = vatAmount;
    this.withholdingAmount = withholdingAmount;
    this.totalAmount = totalAmount;
    this.breakdown = breakdown;
  }

  /** Yeni teklif sürümüne satırı aynı fiyatla taşır. */
  public QuoteLine copyTo(UUID newQuoteId) {
    return new QuoteLine(
        newQuoteId,
        origin,
        destination,
        vehicleType,
        weightTon,
        pallets,
        distanceKm,
        description,
        netAmount,
        vatAmount,
        withholdingAmount,
        totalAmount,
        breakdown);
  }

  public UUID getId() {
    return id;
  }

  public UUID getQuoteId() {
    return quoteId;
  }

  public String getOrigin() {
    return origin;
  }

  public String getDestination() {
    return destination;
  }

  public String getVehicleType() {
    return vehicleType;
  }

  public BigDecimal getWeightTon() {
    return weightTon;
  }

  public Integer getPallets() {
    return pallets;
  }

  public BigDecimal getDistanceKm() {
    return distanceKm;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getNetAmount() {
    return netAmount;
  }

  public BigDecimal getVatAmount() {
    return vatAmount;
  }

  public BigDecimal getWithholdingAmount() {
    return withholdingAmount;
  }

  public BigDecimal getTotalAmount() {
    return totalAmount;
  }

  public String getBreakdown() {
    return breakdown;
  }
}
