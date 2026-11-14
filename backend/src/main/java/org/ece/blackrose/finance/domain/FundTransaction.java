package org.ece.blackrose.finance.domain;

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
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;

/** Değiştirilemez banka/kasa hareketi. */
@Entity
@Table(name = "fund_transaction")
public class FundTransaction extends AuditableEntity {

  @Id private UUID id;
  private UUID fundAccountId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private FundDirection direction;

  private BigDecimal amount;
  private String currency;
  private BigDecimal exchangeRate;
  private LocalDate rateDate;
  private BigDecimal tlAmount;
  private LocalDate transactionDate;
  private String description;
  private String sourceType;
  private UUID sourceId;

  /**
   * Kaynak türünden türetilemeyen sınıf (manuel masraf/gelir/diğer, masraf, açılış); yoksa null.
   */
  @Enumerated(EnumType.STRING)
  private FundCategory category;

  protected FundTransaction() {}

  /** Kategorisiz hareket (12.2 öncesi kurucu). */
  public FundTransaction(
      UUID fundAccountId,
      UUID companyId,
      FundDirection direction,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId) {
    this(
        fundAccountId,
        companyId,
        direction,
        money,
        exchangeRate,
        rateDate,
        tlAmount,
        transactionDate,
        description,
        sourceType,
        sourceId,
        null);
  }

  public FundTransaction(
      UUID fundAccountId,
      UUID companyId,
      FundDirection direction,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId,
      FundCategory category) {
    this.id = UUID.randomUUID();
    this.fundAccountId = fundAccountId;
    this.companyId = companyId;
    this.direction = direction;
    this.amount = money.amount();
    this.currency = money.currency();
    this.exchangeRate = exchangeRate;
    this.rateDate = rateDate;
    this.tlAmount = tlAmount;
    this.transactionDate = transactionDate;
    this.description = description;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.category = category;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public FundDirection getDirection() {
    return direction;
  }

  public BigDecimal getExchangeRate() {
    return exchangeRate;
  }

  public LocalDate getRateDate() {
    return rateDate;
  }

  public BigDecimal getTlAmount() {
    return tlAmount;
  }

  public LocalDate getTransactionDate() {
    return transactionDate;
  }

  public String getDescription() {
    return description;
  }

  public String getSourceType() {
    return sourceType;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public FundCategory getCategory() {
    return category;
  }
}
