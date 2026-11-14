package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.hibernate.annotations.SQLRestriction;

/**
 * Banka hesabı veya kasa. İkisinin hareket ve bakiye kuralları aynıdır. Bakiye saklanmaz; açılış
 * bakiyesi {@link FundOpening} ile bir harekettir. Hesap no şifreli + maskeli taşınır (şifreleme
 * servis katmanında, {@code PersonalDataProtector}); kod, tür, para birimi ve hesap türü
 * değiştirilemez (12.2_TASARIM §2.2).
 */
@Entity
@Table(name = "fund_account")
@SQLRestriction("deleted = false")
public class FundAccount extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String name;

  @Enumerated(EnumType.STRING)
  private FundKind kind;

  private String currency;
  private UUID branchId;
  private UUID companyId;
  private String bankName;
  private String iban;
  private boolean allowNegative;

  @Enumerated(EnumType.STRING)
  private FundAccountType accountType;

  private String accountNoEnc;
  private String accountNoMasked;
  private String bankBranchName;
  private String description;
  private boolean active;
  private int updateCount;

  protected FundAccount() {}

  /** 12.2 öncesi kurucu: vadesiz, hesap nosuz, açıklamasız aktif hesap. */
  public FundAccount(
      String code,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      UUID companyId,
      String bankName,
      String iban,
      boolean allowNegative) {
    this(
        code,
        name,
        kind,
        currency,
        branchId,
        companyId,
        bankName,
        iban,
        allowNegative,
        FundAccountType.DEMAND,
        null,
        null,
        null,
        null);
  }

  public FundAccount(
      String code,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      UUID companyId,
      String bankName,
      String iban,
      boolean allowNegative,
      FundAccountType accountType,
      String accountNoEnc,
      String accountNoMasked,
      String bankBranchName,
      String description) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.kind = kind;
    this.currency = currency;
    this.accountType = accountType == null ? FundAccountType.DEMAND : accountType;
    this.active = true;
    update(name, branchId, companyId, bankName, iban, allowNegative);
    updateDetails(accountNoEnc, accountNoMasked, bankBranchName, description);
  }

  public final void update(
      String name,
      UUID branchId,
      UUID companyId,
      String bankName,
      String iban,
      boolean allowNegative) {
    this.name = name;
    this.branchId = branchId;
    this.companyId = companyId;
    this.bankName = bankName;
    this.iban = iban;
    this.allowNegative = allowNegative;
  }

  /** Hesap no (şifreli + maske birlikte; ikisi de null ya da ikisi de dolu), şube adı, açıklama. */
  public final void updateDetails(
      String accountNoEnc, String accountNoMasked, String bankBranchName, String description) {
    this.accountNoEnc = accountNoEnc;
    this.accountNoMasked = accountNoMasked;
    this.bankBranchName = bankBranchName;
    this.description = description;
  }

  public void activate() {
    this.active = true;
  }

  public void deactivate() {
    this.active = false;
  }

  public void incrementUpdateCount() {
    this.updateCount++;
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

  public FundKind getKind() {
    return kind;
  }

  public String getCurrency() {
    return currency;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public String getBankName() {
    return bankName;
  }

  public String getIban() {
    return iban;
  }

  public boolean isAllowNegative() {
    return allowNegative;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public FundAccountType getAccountType() {
    return accountType;
  }

  public String getAccountNoEnc() {
    return accountNoEnc;
  }

  public String getAccountNoMasked() {
    return accountNoMasked;
  }

  public String getBankBranchName() {
    return bankBranchName;
  }

  public String getDescription() {
    return description;
  }

  public boolean isActive() {
    return active;
  }

  public int getUpdateCount() {
    return updateCount;
  }
}
