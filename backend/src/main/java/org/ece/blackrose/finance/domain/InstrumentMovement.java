package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;

@Entity
@Table(name = "instrument_movement")
public class InstrumentMovement extends AuditableEntity {

  @Id private UUID id;
  private UUID instrumentId;

  @Enumerated(EnumType.STRING)
  private InstrumentStatus fromStatus;

  @Enumerated(EnumType.STRING)
  private InstrumentStatus toStatus;

  private LocalDate movementDate;
  private String note;

  /** STATUS = durum geçişi; TRANSFERRED = cari taşıma (durum değişmez, from = to). */
  @Enumerated(EnumType.STRING)
  private InstrumentMovementType movementType = InstrumentMovementType.STATUS;

  private UUID fromAccountId;
  private UUID toAccountId;
  private UUID accountTransferId;

  /** Hareketin fonu (V37): banka/kasa ya da emanet kasası; para hareketi olmayabilir. */
  private UUID fundAccountId;

  protected InstrumentMovement() {}

  public InstrumentMovement(
      UUID instrumentId,
      InstrumentStatus fromStatus,
      InstrumentStatus toStatus,
      LocalDate movementDate,
      String note) {
    this.id = UUID.randomUUID();
    this.instrumentId = instrumentId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    this.movementDate = movementDate;
    this.note = note;
  }

  /** Fonlu durum hareketi (12.3 §2.2): {@code AT_BANK}/{@code COLLECTED}/… ya da emanet kasası. */
  public InstrumentMovement(
      UUID instrumentId,
      InstrumentStatus fromStatus,
      InstrumentStatus toStatus,
      LocalDate movementDate,
      String note,
      UUID fundAccountId) {
    this(instrumentId, fromStatus, toStatus, movementDate, note);
    this.fundAccountId = fundAccountId;
  }

  /** Cari taşıma hareketi: çekin durumu değişmez, yalnız bağlı cari {@code from → to} olur. */
  public static InstrumentMovement transferred(
      UUID instrumentId,
      InstrumentStatus current,
      LocalDate date,
      UUID from,
      UUID to,
      UUID transferId,
      String note) {
    InstrumentMovement movement =
        new InstrumentMovement(instrumentId, current, current, date, note);
    movement.movementType = InstrumentMovementType.TRANSFERRED;
    movement.fromAccountId = from;
    movement.toAccountId = to;
    movement.accountTransferId = transferId;
    return movement;
  }

  public UUID getId() {
    return id;
  }

  public UUID getInstrumentId() {
    return instrumentId;
  }

  public InstrumentStatus getFromStatus() {
    return fromStatus;
  }

  public InstrumentStatus getToStatus() {
    return toStatus;
  }

  public LocalDate getMovementDate() {
    return movementDate;
  }

  public String getNote() {
    return note;
  }

  public InstrumentMovementType getMovementType() {
    return movementType;
  }

  public UUID getFromAccountId() {
    return fromAccountId;
  }

  public UUID getToAccountId() {
    return toAccountId;
  }

  public UUID getAccountTransferId() {
    return accountTransferId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }
}
