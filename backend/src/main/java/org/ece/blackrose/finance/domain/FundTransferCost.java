package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferCostKind;
import org.hibernate.annotations.SQLRestriction;

/**
 * Transfer masrafı (V32): Komisyon, Masraf ya da KMV. {@code fundAccountId} maliyetin düştüğü
 * fondur (ZTO "Masraf Bank."); fon hareketi {@code FUND_TRANSFER_COST} ({@code source_id} = bu
 * kaydın kimliği). KMV'de oran ve taban dolu, diğerlerinde boştur (CHECK). Transfer başına türden
 * bir satır olur.
 */
@Entity
@Table(name = "fund_transfer_cost")
@SQLRestriction("deleted = false")
public class FundTransferCost extends AuditableEntity {

  @Id private UUID id;
  private UUID transferId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private TransferCostKind costKind;

  private UUID fundAccountId;
  private BigDecimal ratePercent;
  private BigDecimal baseAmount;
  private BigDecimal amount;
  private String currency;
  private UUID expenseItemId;

  protected FundTransferCost() {}

  public FundTransferCost(
      UUID transferId,
      UUID companyId,
      TransferCostKind costKind,
      UUID fundAccountId,
      BigDecimal ratePercent,
      BigDecimal baseAmount,
      Money money,
      UUID expenseItemId) {
    this.id = UUID.randomUUID();
    this.transferId = transferId;
    this.companyId = companyId;
    this.costKind = costKind;
    this.fundAccountId = fundAccountId;
    this.ratePercent = ratePercent;
    this.baseAmount = baseAmount;
    this.amount = money.amount();
    this.currency = money.currency();
    this.expenseItemId = expenseItemId;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getTransferId() {
    return transferId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public TransferCostKind getCostKind() {
    return costKind;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public BigDecimal getRatePercent() {
    return ratePercent;
  }

  public BigDecimal getBaseAmount() {
    return baseAmount;
  }

  public UUID getExpenseItemId() {
    return expenseItemId;
  }
}
