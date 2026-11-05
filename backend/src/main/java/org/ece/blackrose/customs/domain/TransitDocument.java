package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitKind;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitStatus;
import org.ece.blackrose.customs.web.CustomsDtos.SaveTransitRequest;

/** T1, T2 veya TIR belgesi. Teminat, varış gümrüğünde kapatılana kadar açık sayılır. */
@Entity
@Table(name = "transit_document")
public class TransitDocument extends AuditableEntity {

  @Id private UUID id;
  private UUID shipmentId;
  private UUID declarationId;

  @Enumerated(EnumType.STRING)
  private TransitKind kind;

  private String documentNo;
  private String departureOffice;
  private String destinationOffice;
  private BigDecimal guaranteeAmount;
  private String currency;
  private LocalDate issuedOn;
  private LocalDate deadline;
  private LocalDate dischargedOn;

  @Enumerated(EnumType.STRING)
  private TransitStatus status;

  protected TransitDocument() {}

  public TransitDocument(SaveTransitRequest request) {
    this.id = UUID.randomUUID();
    this.shipmentId = request.shipmentId();
    this.declarationId = request.declarationId();
    this.kind = request.kind();
    this.documentNo = request.documentNo();
    this.departureOffice = request.departureOffice();
    this.destinationOffice = request.destinationOffice();
    this.guaranteeAmount = request.guarantee().amount();
    this.currency = request.guarantee().currency();
    this.issuedOn = request.issuedOn();
    this.deadline = request.deadline();
    this.status = TransitStatus.OPEN;
  }

  public void discharge(LocalDate date) {
    dischargedOn = date;
    status = TransitStatus.DISCHARGED;
  }

  public void cancel() {
    status = TransitStatus.CANCELLED;
  }

  public Money getGuarantee() {
    return new Money(guaranteeAmount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getDeclarationId() {
    return declarationId;
  }

  public TransitKind getKind() {
    return kind;
  }

  public String getDocumentNo() {
    return documentNo;
  }

  public String getDepartureOffice() {
    return departureOffice;
  }

  public String getDestinationOffice() {
    return destinationOffice;
  }

  public LocalDate getIssuedOn() {
    return issuedOn;
  }

  public LocalDate getDeadline() {
    return deadline;
  }

  public LocalDate getDischargedOn() {
    return dischargedOn;
  }

  public TransitStatus getStatus() {
    return status;
  }
}
