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
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.hibernate.annotations.SQLRestriction;

/**
 * Bilgi amaçlı gelir/gider kaydı (V33): döviz bozumu kur farkı, transfer masrafı, faiz. Nakit
 * değildir (nakit {@code fund_transaction}'dadır). Değiştirilemez; tek yazıcı {@code
 * IncomeExpenseService}. Ters kayıt {@link #reversalOf} ile: {@code source_type = 'REVERSAL'},
 * {@code source_id} = asıl satır, yön ters, kategori aynı.
 */
@Entity
@Table(name = "fin_income_expense")
@SQLRestriction("deleted = false")
public class FinIncomeExpense extends AuditableEntity {

  /** Ters kaydın kaynak türü (fon/cari defterleriyle aynı ad). */
  public static final String SOURCE_REVERSAL = "REVERSAL";

  @Id private UUID id;
  private UUID companyId;
  private UUID branchId;

  @Enumerated(EnumType.STRING)
  private IncomeExpenseDirection direction;

  @Enumerated(EnumType.STRING)
  private IncomeExpenseCategory category;

  private String sourceType;
  private UUID sourceId;
  private LocalDate transactionDate;
  private BigDecimal amount;
  private String currency;
  private BigDecimal exchangeRate;
  private LocalDate rateDate;
  private BigDecimal tlAmount;
  private UUID fundAccountId;
  private String description;

  protected FinIncomeExpense() {}

  public FinIncomeExpense(
      UUID companyId,
      UUID branchId,
      IncomeExpenseDirection direction,
      IncomeExpenseCategory category,
      String sourceType,
      UUID sourceId,
      LocalDate transactionDate,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      UUID fundAccountId,
      String description) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.branchId = branchId;
    this.direction = direction;
    this.category = category;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.transactionDate = transactionDate;
    this.amount = money.amount();
    this.currency = money.currency();
    this.exchangeRate = exchangeRate;
    this.rateDate = rateDate;
    this.tlAmount = tlAmount;
    this.fundAccountId = fundAccountId;
    this.description = description;
  }

  /** Asıl kaydın aynı kur ve tutarla ters yönlü kopyası. */
  public static FinIncomeExpense reversalOf(
      FinIncomeExpense original, LocalDate date, String description) {
    return new FinIncomeExpense(
        original.companyId,
        original.branchId,
        original.direction.opposite(),
        original.category,
        SOURCE_REVERSAL,
        original.id,
        date,
        original.getMoney(),
        original.exchangeRate,
        original.rateDate,
        original.tlAmount,
        original.fundAccountId,
        description);
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public IncomeExpenseDirection getDirection() {
    return direction;
  }

  public IncomeExpenseCategory getCategory() {
    return category;
  }

  public String getSourceType() {
    return sourceType;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public LocalDate getTransactionDate() {
    return transactionDate;
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

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public String getDescription() {
    return description;
  }
}
