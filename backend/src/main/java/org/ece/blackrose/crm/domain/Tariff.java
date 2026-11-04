package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.crm.web.CrmDtos.SaveTariffRequest;
import org.hibernate.annotations.SQLRestriction;

/** Müşteri alanı boşsa genel tarifedir. */
@Entity
@Table(name = "tariff")
@SQLRestriction("deleted = false")
public class Tariff extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;
  private String currency;
  private UUID accountId;
  private LocalDate validFrom;
  private LocalDate validTo;
  private boolean active;
  private BigDecimal fuelSurchargePercent;
  private BigDecimal waitingHourlyFee;
  private BigDecimal extraStopFee;
  private BigDecimal adrPercent;
  private BigDecimal insurancePercent;
  private UUID taxRateId;

  protected Tariff() {}

  public Tariff(SaveTariffRequest request) {
    this.id = UUID.randomUUID();
    this.code = request.code();
    this.currency = request.currency();
    update(request);
  }

  public final void update(SaveTariffRequest request) {
    this.name = request.name();
    this.accountId = request.accountId();
    this.validFrom = request.validFrom();
    this.validTo = request.validTo();
    this.active = request.active();
    this.fuelSurchargePercent = request.fuelSurchargePercent();
    this.waitingHourlyFee = request.waitingHourlyFee();
    this.extraStopFee = request.extraStopFee();
    this.adrPercent = request.adrPercent();
    this.insurancePercent = request.insurancePercent();
    this.taxRateId = request.taxRateId();
  }

  public boolean isValidOn(LocalDate date) {
    return active && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date));
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public String getCurrency() {
    return currency;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public LocalDate getValidFrom() {
    return validFrom;
  }

  public LocalDate getValidTo() {
    return validTo;
  }

  public boolean isActive() {
    return active;
  }

  public BigDecimal getFuelSurchargePercent() {
    return fuelSurchargePercent;
  }

  public BigDecimal getWaitingHourlyFee() {
    return waitingHourlyFee;
  }

  public BigDecimal getExtraStopFee() {
    return extraStopFee;
  }

  public BigDecimal getAdrPercent() {
    return adrPercent;
  }

  public BigDecimal getInsurancePercent() {
    return insurancePercent;
  }

  public UUID getTaxRateId() {
    return taxRateId;
  }
}
