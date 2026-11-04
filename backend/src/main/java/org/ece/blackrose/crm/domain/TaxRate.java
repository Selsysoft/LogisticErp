package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/** KDV ve tevkifat oranı. Değerler kodda sabit değildir; firma kendisi tanımlar. */
@Entity
@Table(name = "tax_rate")
@SQLRestriction("deleted = false")
public class TaxRate extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;
  private BigDecimal vatPercent;
  private int withholdingNumerator;
  private int withholdingDenominator;

  protected TaxRate() {}

  public TaxRate(
      String code,
      String name,
      BigDecimal vatPercent,
      int withholdingNumerator,
      int withholdingDenominator) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.name = name;
    this.vatPercent = vatPercent;
    this.withholdingNumerator = withholdingNumerator;
    this.withholdingDenominator = withholdingDenominator;
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

  public BigDecimal getVatPercent() {
    return vatPercent;
  }

  public int getWithholdingNumerator() {
    return withholdingNumerator;
  }

  public int getWithholdingDenominator() {
    return withholdingDenominator;
  }
}
