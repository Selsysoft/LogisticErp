package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseContextType;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseDepartment;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpensePaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseStatus;
import org.hibernate.annotations.SQLRestriction;

/**
 * Tek masraf modeli (ZTO ZT_ProductionExpenses; 12.7_TASARIM §1.2, §2.1). Cari etkisi yalnız
 * LedgerService ({@code EXPENSE}), nakit etkisi yalnız SettlementService ({@code EXPENSE:{id}})
 * üzerinden yazılır. Kayıt değişmez: düzeltme ters kayıt + yeni kayıt, iptal ters kayıt + {@code
 * REVERSED} + silinmiş işaretidir. Bütün tutarlar servis (ExpenseCalculator) tarafından hesaplanır.
 */
@Entity
@Table(name = "expense")
@SQLRestriction("deleted = false")
public class Expense extends AuditableEntity {

  /** Masrafın bağlamı: GENERAL'da hepsi boş, diğerlerinde yalnız ilgili kimlik dolu. */
  public record ExpenseContext(
      ExpenseContextType type, UUID vehicleId, UUID shipmentId, UUID warehouseId, UUID driverId) {

    public ExpenseContext {
      Objects.requireNonNull(type, "type");
    }

    public static ExpenseContext general() {
      return new ExpenseContext(ExpenseContextType.GENERAL, null, null, null, null);
    }
  }

  /** Ödeme şekli; tedarikçi carisi yalnız ACCOUNT'ta dolu. */
  public record ExpensePayment(ExpensePaymentMethod method, UUID supplierAccountId) {

    public ExpensePayment {
      Objects.requireNonNull(method, "method");
    }
  }

  /** Belge bilgileri ("Fatura No" serbest metin, OK-12.7-13). */
  public record ExpenseDocument(
      String invoiceNumber,
      LocalDate invoiceDate,
      LocalDate dueDate,
      String documentType,
      ExpenseDepartment department,
      String description) {

    public ExpenseDocument {
      Objects.requireNonNull(invoiceDate, "invoiceDate");
      Objects.requireNonNull(documentType, "documentType");
      Objects.requireNonNull(department, "department");
    }
  }

  /** Başlık tutarları (satır toplamları) ile kur ve TL karşılığı. */
  public record ExpenseAmounts(
      String currency,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal subTotal,
      BigDecimal discountAmount,
      BigDecimal netAmount,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal otherTaxAmount,
      BigDecimal totalAmount,
      BigDecimal tlAmount) {

    public ExpenseAmounts {
      Objects.requireNonNull(currency, "currency");
      Objects.requireNonNull(exchangeRate, "exchangeRate");
      Objects.requireNonNull(rateDate, "rateDate");
      Objects.requireNonNull(totalAmount, "totalAmount");
      Objects.requireNonNull(tlAmount, "tlAmount");
    }
  }

  @Id private UUID id;
  private UUID companyId;
  private UUID branchId;
  private UUID expenseItemId;

  @Enumerated(EnumType.STRING)
  private ExpenseContextType contextType;

  private UUID vehicleId;
  private UUID shipmentId;
  private UUID warehouseId;
  private UUID driverId;

  @Enumerated(EnumType.STRING)
  private ExpensePaymentMethod paymentMethod;

  private UUID supplierAccountId;
  private UUID settlementId;
  private String invoiceNumber;
  private LocalDate invoiceDate;
  private LocalDate dueDate;
  private String documentType;

  @Enumerated(EnumType.STRING)
  private ExpenseDepartment department;

  private String description;
  private String currency;
  private BigDecimal exchangeRate;
  private LocalDate rateDate;
  private BigDecimal subTotal;
  private BigDecimal discountAmount;
  private BigDecimal netAmount;
  private BigDecimal vatAmount;
  private BigDecimal withholdingAmount;
  private BigDecimal otherTaxAmount;
  private BigDecimal totalAmount;
  private BigDecimal tlAmount;

  @Enumerated(EnumType.STRING)
  private ExpenseStatus status;

  private UUID replacesExpenseId;
  private LocalDate reversedOn;
  private String reverseReason;
  private String sourceType;
  private UUID sourceId;
  private String idempotencyKey;

  protected Expense() {}

  public Expense(
      UUID companyId,
      UUID branchId,
      UUID expenseItemId,
      ExpenseContext context,
      ExpensePayment payment,
      ExpenseDocument document,
      ExpenseAmounts amounts,
      UUID replacesExpenseId,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.companyId = Objects.requireNonNull(companyId, "companyId");
    this.branchId = Objects.requireNonNull(branchId, "branchId");
    this.expenseItemId = Objects.requireNonNull(expenseItemId, "expenseItemId");
    this.contextType = context.type();
    this.vehicleId = context.vehicleId();
    this.shipmentId = context.shipmentId();
    this.warehouseId = context.warehouseId();
    this.driverId = context.driverId();
    this.paymentMethod = payment.method();
    this.supplierAccountId = payment.supplierAccountId();
    this.invoiceNumber = document.invoiceNumber();
    this.invoiceDate = document.invoiceDate();
    this.dueDate = document.dueDate();
    this.documentType = document.documentType();
    this.department = document.department();
    this.description = document.description();
    this.currency = amounts.currency();
    this.exchangeRate = amounts.exchangeRate();
    this.rateDate = amounts.rateDate();
    this.subTotal = orZero(amounts.subTotal());
    this.discountAmount = orZero(amounts.discountAmount());
    this.netAmount = orZero(amounts.netAmount());
    this.vatAmount = orZero(amounts.vatAmount());
    this.withholdingAmount = orZero(amounts.withholdingAmount());
    this.otherTaxAmount = orZero(amounts.otherTaxAmount());
    this.totalAmount = amounts.totalAmount();
    this.tlAmount = amounts.tlAmount();
    this.status = ExpenseStatus.POSTED;
    this.replacesExpenseId = replacesExpenseId;
    this.idempotencyKey = idempotencyKey;
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  /** Nakit/Banka masrafın settlement'ını bağlar; Cari masrafta ya da ikinci kez bağlanamaz. */
  public void linkSettlement(UUID settlementId) {
    if (paymentMethod == ExpensePaymentMethod.ACCOUNT) {
      throw new IllegalStateException("Cari masrafa settlement bağlanamaz: " + id);
    }
    if (this.settlementId != null) {
      throw new IllegalStateException("Masrafın settlement'ı zaten bağlı: " + id);
    }
    this.settlementId = Objects.requireNonNull(settlementId, "settlementId");
  }

  /** Ters çevirir: REVERSED + silinmiş. Zaten ters çevrilmişse bir şey yapmaz. */
  public void reverse(LocalDate on, String reason) {
    if (isReversed()) {
      return;
    }
    this.status = ExpenseStatus.REVERSED;
    this.reversedOn = Objects.requireNonNull(on, "on");
    this.reverseReason = reason;
    markDeleted();
  }

  public boolean isReversed() {
    return status == ExpenseStatus.REVERSED;
  }

  public Money total() {
    return new Money(totalAmount, currency);
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

  public UUID getExpenseItemId() {
    return expenseItemId;
  }

  public ExpenseContextType getContextType() {
    return contextType;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public UUID getShipmentId() {
    return shipmentId;
  }

  public UUID getWarehouseId() {
    return warehouseId;
  }

  public UUID getDriverId() {
    return driverId;
  }

  public ExpensePaymentMethod getPaymentMethod() {
    return paymentMethod;
  }

  public UUID getSupplierAccountId() {
    return supplierAccountId;
  }

  public UUID getSettlementId() {
    return settlementId;
  }

  public String getInvoiceNumber() {
    return invoiceNumber;
  }

  public LocalDate getInvoiceDate() {
    return invoiceDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public String getDocumentType() {
    return documentType;
  }

  public ExpenseDepartment getDepartment() {
    return department;
  }

  public String getDescription() {
    return description;
  }

  public String getCurrency() {
    return currency;
  }

  public BigDecimal getExchangeRate() {
    return exchangeRate;
  }

  public LocalDate getRateDate() {
    return rateDate;
  }

  public BigDecimal getSubTotal() {
    return subTotal;
  }

  public BigDecimal getDiscountAmount() {
    return discountAmount;
  }

  public BigDecimal getNetAmount() {
    return netAmount;
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

  public BigDecimal getTlAmount() {
    return tlAmount;
  }

  public ExpenseStatus getStatus() {
    return status;
  }

  public UUID getReplacesExpenseId() {
    return replacesExpenseId;
  }

  public LocalDate getReversedOn() {
    return reversedOn;
  }

  public String getReverseReason() {
    return reverseReason;
  }

  public String getSourceType() {
    return sourceType;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }
}
