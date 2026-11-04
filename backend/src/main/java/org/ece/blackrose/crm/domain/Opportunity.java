package org.ece.blackrose.crm.domain;

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
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "opportunity")
@SQLRestriction("deleted = false")
public class Opportunity extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private String title;

  @Enumerated(EnumType.STRING)
  private OpportunityStage stage;

  private BigDecimal amount;
  private String currency;
  private String ownerEmail;
  private LocalDate expectedCloseDate;
  private String lostReason;

  protected Opportunity() {}

  public Opportunity(
      UUID accountId, String title, Money value, String ownerEmail, LocalDate expectedCloseDate) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.stage = OpportunityStage.LEAD;
    this.ownerEmail = ownerEmail;
    update(title, value, expectedCloseDate);
  }

  public final void update(String title, Money value, LocalDate expectedCloseDate) {
    this.title = title;
    this.amount = value.amount();
    this.currency = value.currency();
    this.expectedCloseDate = expectedCloseDate;
  }

  public void moveTo(OpportunityStage stage, String lostReason) {
    this.stage = stage;
    this.lostReason = lostReason;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getTitle() {
    return title;
  }

  public OpportunityStage getStage() {
    return stage;
  }

  public String getOwnerEmail() {
    return ownerEmail;
  }

  public LocalDate getExpectedCloseDate() {
    return expectedCloseDate;
  }

  public String getLostReason() {
    return lostReason;
  }
}
