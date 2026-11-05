package org.ece.blackrose.integration.domain;

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
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportRowStatus;

@Entity
@Table(name = "import_row")
public class ImportRow extends AuditableEntity {

  /** Dosyadan okunan hareket. */
  public record Parsed(
      String externalKey,
      String plate,
      Instant occurredAt,
      String place,
      BigDecimal amount,
      String currency,
      BigDecimal liters,
      BigDecimal odometerKm) {}

  @Id private UUID id;
  private UUID batchId;

  @Enumerated(EnumType.STRING)
  private ImportKind kind;

  private int lineNo;
  private String externalKey;
  private String plate;
  private Instant occurredAt;
  private String place;
  private BigDecimal amount;
  private String currency;
  private BigDecimal liters;
  private BigDecimal odometerKm;
  private UUID vehicleId;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private ImportRowStatus status;

  private String message;

  protected ImportRow() {}

  public static ImportRow error(UUID batchId, ImportKind kind, int lineNo, String message) {
    ImportRow row = new ImportRow();
    row.id = UUID.randomUUID();
    row.batchId = batchId;
    row.kind = kind;
    row.lineNo = lineNo;
    row.status = ImportRowStatus.ERROR;
    row.message = message;
    return row;
  }

  public ImportRow(UUID batchId, ImportKind kind, int lineNo, Parsed parsed) {
    this.id = UUID.randomUUID();
    this.batchId = batchId;
    this.kind = kind;
    this.lineNo = lineNo;
    this.externalKey = parsed.externalKey();
    this.plate = parsed.plate();
    this.occurredAt = parsed.occurredAt();
    this.place = parsed.place();
    this.amount = parsed.amount();
    this.currency = parsed.currency();
    this.liters = parsed.liters();
    this.odometerKm = parsed.odometerKm();
    this.status = ImportRowStatus.UNMATCHED;
  }

  public void match(UUID vehicle, UUID shipment, ImportRowStatus newStatus, String note) {
    vehicleId = vehicle;
    shipmentId = shipment;
    status = newStatus;
    message = note;
  }

  public void mark(ImportRowStatus newStatus) {
    status = newStatus;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getBatchId() {
    return batchId;
  }

  public ImportKind getKind() {
    return kind;
  }

  public int getLineNo() {
    return lineNo;
  }

  public String getExternalKey() {
    return externalKey;
  }

  public String getPlate() {
    return plate;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public String getPlace() {
    return place;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public BigDecimal getLiters() {
    return liters;
  }

  public BigDecimal getOdometerKm() {
    return odometerKm;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public ImportRowStatus getStatus() {
    return status;
  }

  public String getMessage() {
    return message;
  }
}
