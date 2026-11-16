package org.ece.blackrose.shipment.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TripCostStatus;
import org.hibernate.annotations.SQLRestriction;

/**
 * Sefer gideri. Cariye bağlı gider sefer kapanınca borç yazar. Araç giderine bağlı olan zaten
 * finansa yazılmıştır, yalnız kârlılıkta sayılır; böylece aynı gider iki kez işlenmez.
 *
 * <p>Taşeron (SUBCONTRACTOR) gideri ZTO ekranından kaydedilince hemen cariye yazılır (12.7 Y6).
 * {@code amount}/{@code tlAmount} NET kalır (kârlılık değişmez); cariye yazılan {@link #payable()}
 * = net + KDV − tevkifat − kesinti. Yazılmış satır değişmez: düzeltme ters kayıt + yeni satırdır.
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
  private BigDecimal vatAmount = BigDecimal.ZERO;
  private BigDecimal withholdingAmount = BigDecimal.ZERO;
  private BigDecimal deductionAmount = BigDecimal.ZERO;
  private String documentNo;
  private String documentType;
  private LocalDate costDate;
  private BigDecimal exchangeRate;

  @Enumerated(EnumType.STRING)
  private TripCostStatus status = TripCostStatus.OPEN;

  private UUID replacedById;
  private LocalDate reversedOn;
  private String reverseReason;

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
    status = TripCostStatus.POSTED;
  }

  /** Cariye yazılacak tutar: net + KDV − tevkifat − kesinti. */
  public BigDecimal payable() {
    return amount.add(vatAmount).subtract(withholdingAmount).subtract(deductionAmount);
  }

  /** Taşeron alanlarını günceller; yalnız OPEN (cariye yazılmamış) satırda. */
  public void updateSubcontract(
      Money money,
      BigDecimal tlAmount,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal deductionAmount,
      String documentNo,
      String documentType,
      LocalDate costDate,
      BigDecimal exchangeRate,
      String description) {
    if (status != TripCostStatus.OPEN) {
      throw new IllegalStateException("Yalnız açık sefer gideri güncellenir: " + id);
    }
    this.amount = money.amount();
    this.currency = money.currency();
    this.tlAmount = tlAmount;
    this.vatAmount = orZero(vatAmount);
    this.withholdingAmount = orZero(withholdingAmount);
    this.deductionAmount = orZero(deductionAmount);
    this.documentNo = documentNo;
    this.documentType = documentType;
    this.costDate = costDate;
    this.exchangeRate = exchangeRate;
    this.description = description;
  }

  /**
   * Taşeron alanları verilenlerle aynı mı (no-op denetimi). Tutarlar ölçekten bağımsız ({@code
   * compareTo}) karşılaştırılır; kur verilmemişse (sunucu kuru) karşılaştırılmaz.
   */
  public boolean sameSubcontract(
      Money money,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal deductionAmount,
      String documentNo,
      String documentType,
      LocalDate costDate,
      BigDecimal exchangeRate,
      String description) {
    return sameAmount(amount, money.amount())
        && currency.equals(money.currency())
        && sameAmount(this.vatAmount, orZero(vatAmount))
        && sameAmount(this.withholdingAmount, orZero(withholdingAmount))
        && sameAmount(this.deductionAmount, orZero(deductionAmount))
        && Objects.equals(blankToNull(this.documentNo), blankToNull(documentNo))
        && Objects.equals(blankToNull(this.documentType), blankToNull(documentType))
        && Objects.equals(this.costDate, costDate)
        && (exchangeRate == null || sameAmount(this.exchangeRate, exchangeRate))
        && Objects.equals(blankToNull(this.description), blankToNull(description));
  }

  /**
   * Ters çevirir: REVERSED + silinmiş; {@code replacedBy} düzeltmede yeni satırdır. Zaten ters
   * çevrilmişse bir şey yapmaz.
   */
  public void reverse(LocalDate on, String reason, UUID replacedBy) {
    if (status == TripCostStatus.REVERSED) {
      return;
    }
    this.status = TripCostStatus.REVERSED;
    this.reversedOn = Objects.requireNonNull(on, "on");
    this.reverseReason = reason;
    this.replacedById = replacedBy;
    markDeleted();
  }

  public boolean isPosted() {
    return status == TripCostStatus.POSTED;
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private static boolean sameAmount(BigDecimal a, BigDecimal b) {
    return a == null ? b == null : b != null && a.compareTo(b) == 0;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.strip();
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

  public BigDecimal getVatAmount() {
    return vatAmount;
  }

  public BigDecimal getWithholdingAmount() {
    return withholdingAmount;
  }

  public BigDecimal getDeductionAmount() {
    return deductionAmount;
  }

  public String getDocumentNo() {
    return documentNo;
  }

  public String getDocumentType() {
    return documentType;
  }

  public LocalDate getCostDate() {
    return costDate;
  }

  public BigDecimal getExchangeRate() {
    return exchangeRate;
  }

  public TripCostStatus getStatus() {
    return status;
  }

  public UUID getReplacedById() {
    return replacedById;
  }

  public LocalDate getReversedOn() {
    return reversedOn;
  }

  public String getReverseReason() {
    return reverseReason;
  }
}
