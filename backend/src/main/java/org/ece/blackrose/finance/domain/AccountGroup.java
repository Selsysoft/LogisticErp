package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.hibernate.annotations.SQLRestriction;

/**
 * Hesap grubu (ZTO "Hesap Grubu"): cari türünün alt grubu ve kod üretim sayacı. Tohum V27'dedir
 * (docs/zto-finans/uygulama/12.1_TASARIM.md §1.1).
 */
@Entity
@Table(name = "account_group")
@SQLRestriction("deleted = false")
public class AccountGroup extends AuditableEntity {

  @Id private String code;

  @Enumerated(EnumType.STRING)
  private AccountType accountType;

  private String name;

  /** Rapor sınıfı (SALES, SUPPLIERS …); aday ve grup carisinde boş. */
  private String reportType;

  private String codePrefix;
  private long nextCode;
  private int sortOrder;
  private boolean typeDefault;
  private boolean selectable;
  private boolean active;

  protected AccountGroup() {}

  /**
   * Sıradaki cari kodunu verir ({@code MUS-000001}) ve sayacı ilerletir. Çağıran satırı kilitlemiş
   * olmalıdır ({@code AccountGroupRepository.findForUpdate}).
   */
  public String issueNextCode() {
    return codePrefix + "-" + "%06d".formatted(nextCode++);
  }

  public String getCode() {
    return code;
  }

  public AccountType getAccountType() {
    return accountType;
  }

  public String getName() {
    return name;
  }

  public String getReportType() {
    return reportType;
  }

  public String getCodePrefix() {
    return codePrefix;
  }

  public long getNextCode() {
    return nextCode;
  }

  public int getSortOrder() {
    return sortOrder;
  }

  public boolean isTypeDefault() {
    return typeDefault;
  }

  public boolean isSelectable() {
    return selectable;
  }

  public boolean isActive() {
    return active;
  }
}
