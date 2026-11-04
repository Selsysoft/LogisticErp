package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Tüm tenantlar için ortak para birimi listesi. */
@Entity
@Table(name = "currency", schema = "admin")
public class FinanceCurrency {

  @Id private String code;
  private String name;

  protected FinanceCurrency() {}

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }
}
