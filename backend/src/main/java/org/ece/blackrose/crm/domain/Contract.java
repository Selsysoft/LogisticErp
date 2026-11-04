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
import org.ece.blackrose.crm.domain.CrmTypes.ContractStatus;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "contract")
@SQLRestriction("deleted = false")
public class Contract extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private UUID accountId;
  private UUID quoteId;
  private UUID tariffId;
  private LocalDate startDate;
  private LocalDate endDate;

  @Enumerated(EnumType.STRING)
  private ContractStatus status;

  private Integer paymentTermDays;
  private BigDecimal fuelSurchargePercent;
  private BigDecimal waitingHourlyFee;
  private String specialTerms;

  protected Contract() {}

  public Contract(
      String number,
      UUID accountId,
      UUID quoteId,
      UUID tariffId,
      LocalDate startDate,
      LocalDate endDate,
      Integer paymentTermDays,
      BigDecimal fuelSurchargePercent,
      BigDecimal waitingHourlyFee,
      String specialTerms) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.accountId = accountId;
    this.quoteId = quoteId;
    this.tariffId = tariffId;
    this.startDate = startDate;
    this.endDate = endDate;
    this.status = ContractStatus.ACTIVE;
    this.paymentTermDays = paymentTermDays;
    this.fuelSurchargePercent = fuelSurchargePercent;
    this.waitingHourlyFee = waitingHourlyFee;
    this.specialTerms = specialTerms;
  }

  public void moveTo(ContractStatus status) {
    this.status = status;
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getQuoteId() {
    return quoteId;
  }

  public UUID getTariffId() {
    return tariffId;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public LocalDate getEndDate() {
    return endDate;
  }

  public ContractStatus getStatus() {
    return status;
  }

  public Integer getPaymentTermDays() {
    return paymentTermDays;
  }

  public BigDecimal getFuelSurchargePercent() {
    return fuelSurchargePercent;
  }

  public BigDecimal getWaitingHourlyFee() {
    return waitingHourlyFee;
  }

  public String getSpecialTerms() {
    return specialTerms;
  }
}
