package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Firma başına tek satırlık finans ayarları. */
@Entity
@Table(name = "finance_settings")
public class FinanceSettings extends AuditableEntity {

  public static final int SINGLETON_ID = 1;

  @Id private Integer id;
  private boolean allowSelfApproval;

  protected FinanceSettings() {}

  public void update(boolean allowSelfApproval) {
    this.allowSelfApproval = allowSelfApproval;
  }

  public boolean isAllowSelfApproval() {
    return allowSelfApproval;
  }
}
