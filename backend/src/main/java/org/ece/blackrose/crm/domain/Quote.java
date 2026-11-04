package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.hibernate.annotations.SQLRestriction;

/** Gönderilen teklif değişmez; değişiklik yeni sürüm olarak açılır. */
@Entity
@Table(name = "quote")
@SQLRestriction("deleted = false")
public class Quote extends AuditableEntity {

  @Id private UUID id;
  private String number;
  private int version;
  private UUID accountId;
  private UUID opportunityId;
  private UUID tariffId;
  private UUID taxRateId;
  private String currency;
  private LocalDate validUntil;

  @Enumerated(EnumType.STRING)
  private QuoteStatus status;

  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal totalAmount;
  private String notes;
  private UUID pdfFileId;

  protected Quote() {}

  public Quote(
      String number,
      int version,
      UUID accountId,
      UUID opportunityId,
      UUID tariffId,
      UUID taxRateId,
      String currency,
      LocalDate validUntil,
      String notes) {
    this.id = UUID.randomUUID();
    this.number = number;
    this.version = version;
    this.accountId = accountId;
    this.opportunityId = opportunityId;
    this.tariffId = tariffId;
    this.taxRateId = taxRateId;
    this.currency = currency;
    this.validUntil = validUntil;
    this.notes = notes;
    this.status = QuoteStatus.DRAFT;
    this.netAmount = BigDecimal.ZERO;
    this.vatAmount = BigDecimal.ZERO;
    this.withholdingAmount = BigDecimal.ZERO;
    this.totalAmount = BigDecimal.ZERO;
  }

  public void recalculate(List<QuoteLine> lines) {
    netAmount = BigDecimal.ZERO;
    vatAmount = BigDecimal.ZERO;
    withholdingAmount = BigDecimal.ZERO;
    totalAmount = BigDecimal.ZERO;
    for (QuoteLine line : lines) {
      netAmount = netAmount.add(line.getNetAmount());
      vatAmount = vatAmount.add(line.getVatAmount());
      withholdingAmount = withholdingAmount.add(line.getWithholdingAmount());
      totalAmount = totalAmount.add(line.getTotalAmount());
    }
  }

  public void moveTo(QuoteStatus status) {
    this.status = status;
  }

  public void attachPdf(UUID pdfFileId) {
    this.pdfFileId = pdfFileId;
  }

  public Money getNet() {
    return new Money(netAmount, currency);
  }

  public Money getVat() {
    return new Money(vatAmount, currency);
  }

  public Money getWithholding() {
    return new Money(withholdingAmount, currency);
  }

  public Money getTotal() {
    return new Money(totalAmount, currency);
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public int getVersion() {
    return version;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getOpportunityId() {
    return opportunityId;
  }

  public UUID getTariffId() {
    return tariffId;
  }

  public UUID getTaxRateId() {
    return taxRateId;
  }

  public String getCurrency() {
    return currency;
  }

  public LocalDate getValidUntil() {
    return validUntil;
  }

  public QuoteStatus getStatus() {
    return status;
  }

  public String getNotes() {
    return notes;
  }

  public UUID getPdfFileId() {
    return pdfFileId;
  }
}
