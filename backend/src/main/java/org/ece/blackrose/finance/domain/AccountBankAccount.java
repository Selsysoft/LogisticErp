package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountKind;
import org.hibernate.annotations.SQLRestriction;

/**
 * Carinin banka hesabı (ZTO ZT_BankAccounts). IBAN ve hesap numarası şifreli tutulur; IBAN
 * tekilliği hash ile sağlanır. Şifreleme servis katmanında yapılır, entity yalnız saklar.
 */
@Entity
@Table(name = "account_bank_account")
@SQLRestriction("deleted = false")
public class AccountBankAccount extends AuditableEntity {

  /** Formdan gelen, şifrelenmiş ve maskelenmiş değerler. */
  public record BankAccountData(
      String bankName,
      String branchName,
      String accountNumberEnc,
      String accountNumberMasked,
      String ibanEnc,
      String ibanHash,
      String ibanMasked,
      String holderName,
      String currency,
      BankAccountKind kind,
      BankAccountCategory category,
      LocalDate openedOn,
      String description) {}

  @Id private UUID id;
  private UUID accountId;
  private String bankName;
  private String branchName;
  private String accountNumberEnc;
  private String accountNumberMasked;
  private String ibanEnc;
  private String ibanHash;
  private String ibanMasked;
  private String holderName;
  private String currency;

  @Enumerated(EnumType.STRING)
  private BankAccountKind accountKind;

  @Enumerated(EnumType.STRING)
  private BankAccountCategory category;

  private LocalDate openedOn;

  /** Yalnız okunur; formda yok (ödeme akışı 12.2a ile doldurur). */
  private LocalDate lastTransactionOn;

  private String description;
  private boolean active;
  private int updateCount;

  protected AccountBankAccount() {}

  public AccountBankAccount(UUID accountId, BankAccountData data) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.active = true;
    apply(data);
  }

  public void update(BankAccountData data) {
    apply(data);
    updateCount++;
  }

  public void activate() {
    if (!active) {
      active = true;
      updateCount++;
    }
  }

  public void deactivate() {
    if (active) {
      active = false;
      updateCount++;
    }
  }

  private void apply(BankAccountData d) {
    this.bankName = d.bankName();
    this.branchName = d.branchName();
    this.accountNumberEnc = d.accountNumberEnc();
    this.accountNumberMasked = d.accountNumberMasked();
    this.ibanEnc = d.ibanEnc();
    this.ibanHash = d.ibanHash();
    this.ibanMasked = d.ibanMasked();
    this.holderName = d.holderName();
    this.currency = d.currency();
    this.accountKind = d.kind() == null ? BankAccountKind.DEMAND : d.kind();
    this.category = d.category() == null ? BankAccountCategory.SUB : d.category();
    this.openedOn = d.openedOn();
    this.description = d.description();
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getBankName() {
    return bankName;
  }

  public String getBranchName() {
    return branchName;
  }

  public String getAccountNumberEnc() {
    return accountNumberEnc;
  }

  public String getAccountNumberMasked() {
    return accountNumberMasked;
  }

  public String getIbanEnc() {
    return ibanEnc;
  }

  public String getIbanHash() {
    return ibanHash;
  }

  public String getIbanMasked() {
    return ibanMasked;
  }

  public String getHolderName() {
    return holderName;
  }

  public String getCurrency() {
    return currency;
  }

  public BankAccountKind getAccountKind() {
    return accountKind;
  }

  public BankAccountCategory getCategory() {
    return category;
  }

  public LocalDate getOpenedOn() {
    return openedOn;
  }

  public LocalDate getLastTransactionOn() {
    return lastTransactionOn;
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
