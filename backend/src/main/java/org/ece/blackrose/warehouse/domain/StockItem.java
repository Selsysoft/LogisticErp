package org.ece.blackrose.warehouse.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveStockItemRequest;
import org.hibernate.annotations.SQLRestriction;

/**
 * Müşteriye ait ürün tanımı. Faturalama birimi sözleşmedeki palet, m² veya adettir; kaç ürün
 * biriminin bir faturalama birimi ettiğini bu kayıt söyler.
 */
@Entity
@Table(name = "stock_item")
@SQLRestriction("deleted = false")
public class StockItem extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private String sku;
  private String name;
  private String unit;
  private BigDecimal unitsPerBillingUnit;

  protected StockItem() {}

  public StockItem(SaveStockItemRequest request) {
    this.id = UUID.randomUUID();
    this.accountId = request.accountId();
    this.sku = request.sku();
    this.name = request.name();
    this.unit = request.unit();
    this.unitsPerBillingUnit = request.unitsPerBillingUnit();
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getSku() {
    return sku;
  }

  public String getName() {
    return name;
  }

  public String getUnit() {
    return unit;
  }

  public BigDecimal getUnitsPerBillingUnit() {
    return unitsPerBillingUnit;
  }
}
