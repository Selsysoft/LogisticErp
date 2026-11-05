package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.hibernate.annotations.SQLRestriction;

/** Takvimde kapalı dönem: araç bakımda, sürücü izinde gibi. */
@Entity
@Table(name = "resource_block")
@SQLRestriction("deleted = false")
public class ResourceBlock extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private SubjectType subjectType;

  private UUID subjectId;
  private LocalDate startDate;
  private LocalDate endDate;
  private String reason;

  protected ResourceBlock() {}

  public ResourceBlock(
      SubjectType subjectType,
      UUID subjectId,
      LocalDate startDate,
      LocalDate endDate,
      String reason) {
    this.id = UUID.randomUUID();
    this.subjectType = subjectType;
    this.subjectId = subjectId;
    this.startDate = startDate;
    this.endDate = endDate;
    this.reason = reason;
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

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public String getReason() {
    return reason;
  }
}
