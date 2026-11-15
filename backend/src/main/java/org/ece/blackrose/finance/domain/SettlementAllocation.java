package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.Objects;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;

/**
 * Ödeme/tahsilatın açık fatura kalemiyle BİLGİ AMAÇLI eşleşmesi (V36; 04 §6.2-Y5). Defteri,
 * yaşlandırmayı (FIFO) ve eksik fatura hesabını değiştirmez. Hedef türü başına ayrı kolon ve
 * bileşik FK {@code (x_id, company_id)} vardır; tam biri doludur. Satırlar değişmez: geçerlilik
 * sorguda türetilir (settlement POSTED + {@code deleted = false} + hedef iptal değil), bu yüzden
 * {@code @SQLRestriction} kullanılmaz; sorgular {@code deleted = false} süzgecini açıkça yazar.
 */
@Entity
@Table(name = "settlement_allocation")
public class SettlementAllocation extends AuditableEntity {

  @Id private UUID id;
  private UUID settlementId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private AllocationTargetType targetType;

  private UUID purchaseInvoiceId;
  private UUID freightInvoiceId;
  private UUID warehouseInvoiceId;
  private UUID openingInvoiceId;
  private UUID accountDocumentId;
  private BigDecimal amount;
  private String currency;

  protected SettlementAllocation() {}

  private SettlementAllocation(
      UUID settlementId, UUID companyId, AllocationTargetType targetType, Money money) {
    this.id = UUID.randomUUID();
    this.settlementId = Objects.requireNonNull(settlementId, "settlementId");
    this.companyId = Objects.requireNonNull(companyId, "companyId");
    this.targetType = Objects.requireNonNull(targetType, "targetType");
    this.amount = money.amount();
    this.currency = money.currency();
  }

  /** Hedef türüne göre ilgili kolonu dolduran fabrika. */
  public static SettlementAllocation of(
      UUID settlementId, UUID companyId, AllocationTargetType type, UUID targetId, Money money) {
    Objects.requireNonNull(targetId, "targetId");
    SettlementAllocation allocation =
        new SettlementAllocation(settlementId, companyId, type, money);
    switch (type) {
      case PURCHASE_INVOICE -> allocation.purchaseInvoiceId = targetId;
      case FREIGHT_INVOICE -> allocation.freightInvoiceId = targetId;
      case WAREHOUSE_INVOICE -> allocation.warehouseInvoiceId = targetId;
      case OPENING_INVOICE -> allocation.openingInvoiceId = targetId;
      case ACCOUNT_DOCUMENT -> allocation.accountDocumentId = targetId;
    }
    return allocation;
  }

  /** Türün dolu hedef kolonu. */
  public UUID getTargetId() {
    return switch (targetType) {
      case PURCHASE_INVOICE -> purchaseInvoiceId;
      case FREIGHT_INVOICE -> freightInvoiceId;
      case WAREHOUSE_INVOICE -> warehouseInvoiceId;
      case OPENING_INVOICE -> openingInvoiceId;
      case ACCOUNT_DOCUMENT -> accountDocumentId;
    };
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSettlementId() {
    return settlementId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public AllocationTargetType getTargetType() {
    return targetType;
  }

  public UUID getPurchaseInvoiceId() {
    return purchaseInvoiceId;
  }

  public UUID getFreightInvoiceId() {
    return freightInvoiceId;
  }

  public UUID getWarehouseInvoiceId() {
    return warehouseInvoiceId;
  }

  public UUID getOpeningInvoiceId() {
    return openingInvoiceId;
  }

  public UUID getAccountDocumentId() {
    return accountDocumentId;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }
}
