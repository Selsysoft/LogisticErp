package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
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
}
