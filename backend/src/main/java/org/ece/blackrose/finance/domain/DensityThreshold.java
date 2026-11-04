package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.DensityLevel;

/** Bir para birimi için dönem toplamının yoğunluk sınırları. */
@Entity
@Table(name = "density_threshold")
public class DensityThreshold extends AuditableEntity {

  @Id private String currency;
  private BigDecimal low;
  private BigDecimal medium;
  private BigDecimal high;

  protected DensityThreshold() {}

  public DensityThreshold(String currency, BigDecimal low, BigDecimal medium, BigDecimal high) {
    this.currency = currency;
    update(low, medium, high);
  }

  public final void update(BigDecimal low, BigDecimal medium, BigDecimal high) {
    this.low = low;
    this.medium = medium;
    this.high = high;
  }

  public DensityLevel levelOf(BigDecimal total) {
    if (total.compareTo(low) <= 0) {
      return DensityLevel.LOW;
    }
    if (total.compareTo(medium) <= 0) {
      return DensityLevel.MEDIUM;
    }
    return total.compareTo(high) <= 0 ? DensityLevel.HIGH : DensityLevel.VERY_HIGH;
  }

  public String getCurrency() {
    return currency;
  }

  public BigDecimal getLow() {
    return low;
  }

  public BigDecimal getMedium() {
    return medium;
  }

  public BigDecimal getHigh() {
    return high;
  }
}
