package org.ece.blackrose.saas.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.saas.domain.SaasTypes.SubscriptionStatus;
import org.ece.blackrose.saas.domain.SaasTypes.SuspendReason;

@Entity
@Table(name = "subscription", schema = "admin")
public class Subscription extends AuditableEntity {

  @Id private UUID id;
  private UUID tenantId;
  private UUID planId;

  @Enumerated(EnumType.STRING)
  private SubscriptionStatus status;

  @Enumerated(EnumType.STRING)
  private SuspendReason suspendReason;

  private LocalDate trialEndsOn;
  private LocalDate nextBillingOn;
  private String contactEmail;

  protected Subscription() {}

  public Subscription(UUID tenantId, UUID planId, LocalDate trialEndsOn, String contactEmail) {
    this.id = UUID.randomUUID();
    this.tenantId = tenantId;
    this.planId = planId;
    this.status = SubscriptionStatus.TRIAL;
    this.trialEndsOn = trialEndsOn;
    this.contactEmail = contactEmail;
  }

  public void activate(LocalDate nextBillingOn) {
    status = SubscriptionStatus.ACTIVE;
    suspendReason = null;
    trialEndsOn = null;
    this.nextBillingOn = nextBillingOn;
  }

  public void resume() {
    status = trialEndsOn != null ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE;
    suspendReason = null;
  }

  public void suspend(SuspendReason reason) {
    status = SubscriptionStatus.SUSPENDED;
    suspendReason = reason;
  }

  public void cancel() {
    status = SubscriptionStatus.CANCELLED;
    suspendReason = null;
  }

  public void markPastDue() {
    status = SubscriptionStatus.PAST_DUE;
  }

  public void changePlan(UUID planId) {
    this.planId = planId;
  }

  public void extendTrial(LocalDate trialEndsOn) {
    this.trialEndsOn = trialEndsOn;
  }

  public void setNextBillingOn(LocalDate nextBillingOn) {
    this.nextBillingOn = nextBillingOn;
  }

  public UUID getId() {
    return id;
  }

  public UUID getTenantId() {
    return tenantId;
  }

  public UUID getPlanId() {
    return planId;
  }

  public SubscriptionStatus getStatus() {
    return status;
  }

  public SuspendReason getSuspendReason() {
    return suspendReason;
  }

  public LocalDate getTrialEndsOn() {
    return trialEndsOn;
  }

  public LocalDate getNextBillingOn() {
    return nextBillingOn;
  }

  public String getContactEmail() {
    return contactEmail;
  }
}
