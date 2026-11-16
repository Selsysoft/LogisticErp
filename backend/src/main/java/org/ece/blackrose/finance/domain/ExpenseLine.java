package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Masraf satırı (ZTO ZT_ProductionExpensesDetail; 12.7_TASARIM §1.2). Değişmez; düzeltme yeni
 * başlıkla yapılır. Tutarlar ExpenseCalculator sonucudur.
 */
@Entity
@Table(name = "expense_line")
@SQLRestriction("deleted = false")
public class ExpenseLine extends AuditableEntity {

  /** Satırın hesaplanmış tutarları. */
  public record ExpenseLineAmounts(
      BigDecimal subTotal,
      BigDecimal discountRate,
      BigDecimal discountAmount,
      BigDecimal netAmount,
      BigDecimal vatRate,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal otherTaxAmount,
      BigDecimal totalAmount) {}

  @Id private UUID id;
  private UUID expenseId;
  private int lineNo;
  private String description;
  private BigDecimal quantity;
  private String unit;
  private BigDecimal unitPrice;
  private BigDecimal subTotal;
  private BigDecimal discountRate;
  private BigDecimal discountAmount;
  private BigDecimal netAmount;
  private BigDecimal vatRate;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal otherTaxAmount;
  private BigDecimal totalAmount;

  protected ExpenseLine() {}

  public ExpenseLine(
      UUID expenseId,
      int lineNo,
      String description,
      BigDecimal quantity,
      String unit,
      BigDecimal unitPrice,
      ExpenseLineAmounts amounts) {
    this.id = UUID.randomUUID();
    this.expenseId = Objects.requireNonNull(expenseId, "expenseId");
    this.lineNo = lineNo;
    this.description = description;
    this.quantity = Objects.requireNonNull(quantity, "quantity");
    this.unit = unit;
    this.unitPrice = Objects.requireNonNull(unitPrice, "unitPrice");
    this.subTotal = amounts.subTotal();
    this.discountRate = orZero(amounts.discountRate());
    this.discountAmount = orZero(amounts.discountAmount());
    this.netAmount = amounts.netAmount();
    this.vatRate = orZero(amounts.vatRate());
    this.vatAmount = orZero(amounts.vatAmount());
    this.withholdingAmount = orZero(amounts.withholdingAmount());
    this.otherTaxAmount = orZero(amounts.otherTaxAmount());
    this.totalAmount = amounts.totalAmount();
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  public UUID getId() {
    return id;
  }

  public UUID getExpenseId() {
    return expenseId;
  }

  public int getLineNo() {
    return lineNo;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public String getUnit() {
    return unit;
  }

  public BigDecimal getUnitPrice() {
    return unitPrice;
  }

  public BigDecimal getSubTotal() {
    return subTotal;
  }

  public BigDecimal getDiscountRate() {
    return discountRate;
  }

  public BigDecimal getDiscountAmount() {
    return discountAmount;
  }

  public BigDecimal getNetAmount() {
    return netAmount;
  }

  public BigDecimal getVatRate() {
    return vatRate;
  }

  public BigDecimal getVatAmount() {
    return vatAmount;
  }

  public BigDecimal getWithholdingAmount() {
    return withholdingAmount;
  }

  public BigDecimal getOtherTaxAmount() {
    return otherTaxAmount;
  }

  public BigDecimal getTotalAmount() {
    return totalAmount;
  }
}
