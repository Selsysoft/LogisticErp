package org.ece.blackrose.saas.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;

/** Abonelik borç kaydıdır; resmi e-fatura yerine geçmez. */
@Entity
@Table(name = "saas_invoice", schema = "admin")
public class SaasInvoice extends AuditableEntity {

  @Id private UUID id;
  private UUID tenantId;
  private String number;
  private String planName;
  private LocalDate periodStart;
  private LocalDate periodEnd;
  private BigDecimal amount;
  private String currency;

  @Enumerated(EnumType.STRING)
  private SaasInvoiceStatus status;

  private LocalDate issuedOn;
  private LocalDate dueOn;
  private LocalDate paidOn;
  private String paymentRef;
  private int failedAttempts;
  private int reminderCount;

  protected SaasInvoice() {}

  public SaasInvoice(
      UUID tenantId,
      String number,
      Plan plan,
      LocalDate periodStart,
      LocalDate periodEnd,
      LocalDate issuedOn,
      LocalDate dueOn) {
    this.id = UUID.randomUUID();
    this.tenantId = tenantId;
    this.number = number;
    this.planName = plan.getName();
    this.periodStart = periodStart;
    this.periodEnd = periodEnd;
    this.amount = plan.getMonthlyPrice();
    this.currency = plan.getCurrency();
    this.status = SaasInvoiceStatus.ISSUED;
    this.issuedOn = issuedOn;
    this.dueOn = dueOn;
  }

  public void markPaid(LocalDate date, String reference) {
    status = SaasInvoiceStatus.PAID;
    paidOn = date;
    paymentRef = reference;
  }

  public void voidInvoice() {
    status = SaasInvoiceStatus.VOID;
  }

  public void recordFailure() {
    failedAttempts++;
  }

  public void setReminderCount(int reminderCount) {
    this.reminderCount = reminderCount;
  }

  public UUID getId() {
    return id;
  }

  public UUID getTenantId() {
    return tenantId;
  }

  public String getNumber() {
    return number;
  }

  public String getPlanName() {
    return planName;
  }

  public LocalDate getPeriodStart() {
    return periodStart;
  }

  public LocalDate getPeriodEnd() {
    return periodEnd;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public SaasInvoiceStatus getStatus() {
    return status;
  }

  public LocalDate getIssuedOn() {
    return issuedOn;
  }

  public LocalDate getDueOn() {
    return dueOn;
  }

  public LocalDate getPaidOn() {
    return paidOn;
  }

  public String getPaymentRef() {
    return paymentRef;
  }

  public int getFailedAttempts() {
    return failedAttempts;
  }

  public int getReminderCount() {
    return reminderCount;
  }
}
