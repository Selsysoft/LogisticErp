package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.crm.domain.CrmTypes.ActivityType;
import org.hibernate.annotations.SQLRestriction;

/** Not, görüşme, görev ve hatırlatma; aşama geçişleri de buraya yazılır. */
@Entity
@Table(name = "crm_activity")
@SQLRestriction("deleted = false")
public class CrmActivity extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID opportunityId;

  @Enumerated(EnumType.STRING)
  private ActivityType type;

  private String subject;
  private LocalDate dueDate;
  private Instant completedAt;

  protected CrmActivity() {}

  public CrmActivity(
      UUID accountId, UUID opportunityId, ActivityType type, String subject, LocalDate dueDate) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.opportunityId = opportunityId;
    this.type = type;
    this.subject = subject;
    this.dueDate = dueDate;
  }

  public void complete() {
    completedAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getOpportunityId() {
    return opportunityId;
  }

  public ActivityType getType() {
    return type;
  }

  public String getSubject() {
    return subject;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public Instant getCompletedAt() {
    return completedAt;
  }
}
