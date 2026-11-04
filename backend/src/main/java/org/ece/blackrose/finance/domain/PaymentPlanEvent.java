package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;

@Entity
@Table(name = "payment_plan_event")
public class PaymentPlanEvent extends AuditableEntity {

  @Id private UUID id;
  private UUID planId;
  private String eventType;
  private String note;

  protected PaymentPlanEvent() {}

  public PaymentPlanEvent(UUID planId, String eventType, String note) {
    this.id = UUID.randomUUID();
    this.planId = planId;
    this.eventType = eventType;
    this.note = note;
  }

  public UUID getId() {
    return id;
  }

  public UUID getPlanId() {
    return planId;
  }

  public String getEventType() {
    return eventType;
  }

  public String getNote() {
    return note;
  }
}
