package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.hibernate.annotations.SQLRestriction;

/** Araç veya sürücü belgesi. Yenilenen belge yeni kayıttır; geçmiş korunur. */
@Entity
@Table(name = "compliance_document")
@SQLRestriction("deleted = false")
public class ComplianceDocument extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private SubjectType subjectType;

  private UUID subjectId;

  @Enumerated(EnumType.STRING)
  private DocumentType docType;

  private String number;
  private LocalDate issuedOn;
  private LocalDate expiresOn;

  protected ComplianceDocument() {}

  public ComplianceDocument(
      SubjectType subjectType,
      UUID subjectId,
      DocumentType docType,
      String number,
      LocalDate issuedOn,
      LocalDate expiresOn) {
    this.id = UUID.randomUUID();
    this.subjectType = subjectType;
    this.subjectId = subjectId;
    this.docType = docType;
    this.number = number;
    this.issuedOn = issuedOn;
    this.expiresOn = expiresOn;
  }

  public UUID getId() {
    return id;
  }

  public SubjectType getSubjectType() {
    return subjectType;
  }

  public UUID getSubjectId() {
    return subjectId;
  }

  public DocumentType getDocType() {
    return docType;
  }

  public String getNumber() {
    return number;
  }

  public LocalDate getIssuedOn() {
    return issuedOn;
  }

  public LocalDate getExpiresOn() {
    return expiresOn;
  }
}
