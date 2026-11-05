package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.customs.domain.CustomsTypes.DeclarationStatus;
import org.ece.blackrose.customs.domain.CustomsTypes.DeclarationType;
import org.ece.blackrose.customs.web.CustomsDtos.SaveDeclarationRequest;

/** Gümrük beyanı kaydı. Gümrük sistemine gönderilmez; tescil numarası elle girilir. */
@Entity
@Table(name = "customs_declaration")
public class CustomsDeclaration extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private UUID shipmentId;

  @Enumerated(EnumType.STRING)
  private DeclarationType type;

  private String customsOffice;
  private String registrationNo;
  private LocalDate declaredOn;
  private String currency;

  @Enumerated(EnumType.STRING)
  private DeclarationStatus status;

  protected CustomsDeclaration() {}

  public CustomsDeclaration(String number, SaveDeclarationRequest request) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.shipmentId = request.shipmentId();
    this.type = request.type();
    this.customsOffice = request.customsOffice();
    this.declaredOn = request.declaredOn();
    this.currency = request.currency();
    this.status = DeclarationStatus.DRAFT;
  }

  public void moveTo(DeclarationStatus target, String registration) {
    status = target;
    if (registration != null) {
      registrationNo = registration;
    }
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public DeclarationType getType() {
    return type;
  }

  public String getCustomsOffice() {
    return customsOffice;
  }

  public String getRegistrationNo() {
    return registrationNo;
  }

  public LocalDate getDeclaredOn() {
    return declaredOn;
  }

  public String getCurrency() {
    return currency;
  }

  public DeclarationStatus getStatus() {
    return status;
  }
}
