package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

@Entity
@Table(name = "account")
@SQLRestriction("deleted = false")
public class Account extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  @Enumerated(EnumType.STRING)
  private AccountType type;

  private String taxNumber;
  private UUID branchId;

  /** NULL = tüm şirketlerde ortak kart. */
  private UUID companyId;

  /** Dolu ise grup şirketini temsil eden intercompany carisi. */
  private UUID representsCompanyId;

  protected Account() {}

  /** {@link AccountType#INTERCOMPANY} bu kurucuyla açılamaz (422 {@code ACCOUNT_TYPE_RESERVED}). */
  public Account(String code, String name, AccountType type, String taxNumber, UUID branchId) {
    requireNotReserved(type);
    this.id = UUID.randomUUID();
    this.code = code;
    apply(name, type, taxNumber, branchId);
  }

  /**
   * Grup şirketini temsil eden cari (ortak kart, şubesiz). Bu türü kuran tek yoldur; yalnız
   * organization modülünün intercompany servisi çağırır.
   */
  public static Account intercompany(
      String code, String name, String taxNumber, UUID representsCompanyId) {
    Account account = new Account();
    account.id = UUID.randomUUID();
    account.code = code;
    account.representsCompanyId = representsCompanyId;
    account.apply(name, AccountType.INTERCOMPANY, taxNumber, null);
    return account;
  }

  /** Grup carisi değiştirilemez (409); başka kart grup carisine çevrilemez (422). */
  public void update(String name, AccountType type, String taxNumber, UUID branchId) {
    requireNotIntercompany();
    requireNotReserved(type);
    apply(name, type, taxNumber, branchId);
  }

  /** Grup carisinin adı ve vergi numarası şirket kartından eşitlenir. */
  public void syncIntercompany(String name, String taxNumber) {
    this.name = name;
    this.taxNumber = taxNumber;
  }

  /** Grup carisi silinemez; şirket kartından yönetilir. */
  @Override
  public void markDeleted() {
    requireNotIntercompany();
    super.markDeleted();
  }

  private void apply(String name, AccountType type, String taxNumber, UUID branchId) {
    this.name = name;
    this.type = type;
    this.taxNumber = taxNumber;
    this.branchId = branchId;
  }

  private void requireNotIntercompany() {
    if (representsCompanyId != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INTERCOMPANY_ACCOUNT_LOCKED",
          "Grup şirketi carisi şirket kartından yönetilir.");
    }
  }

  /** Elle açılamayan cari türü için 422. */
  public static void requireNotReserved(AccountType type) {
    if (type == AccountType.INTERCOMPANY) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "ACCOUNT_TYPE_RESERVED", "Bu cari türü elle açılamaz.");
    }
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

  public AccountType getType() {
    return type;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getRepresentsCompanyId() {
    return representsCompanyId;
  }
}
