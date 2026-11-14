package org.ece.blackrose.finance.service;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountBankAccount;
import org.ece.blackrose.finance.domain.AccountBankAccount.BankAccountData;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountBankAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.web.AccountDtos.AccountBankAccountResponse;
import org.ece.blackrose.finance.web.AccountDtos.SaveBankAccountRequest;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cari banka hesapları (ZTO BankAccounts; 12.1 §3.3). IBAN ve hesap no şifreli + maskeli; IBAN
 * tekilliği aktif kayıtlar arasında hash ile. Kart ortak olduğu için okuma kapsamdan bağımsızdır;
 * yazım kartın iş yeri kapsamını ister (ödeme yönlendirme riski). Pasif cariye IBAN eklenebilir.
 */
@Service
public class AccountBankAccountService {

  private final AccountBankAccountRepository banks;
  private final AccountRepository accounts;
  private final AccountAccess access;
  private final BranchScopeService scope;
  private final PersonalDataProtector protector;
  private final AuditService audit;

  public AccountBankAccountService(
      AccountBankAccountRepository banks,
      AccountRepository accounts,
      AccountAccess access,
      BranchScopeService scope,
      PersonalDataProtector protector,
      AuditService audit) {
    this.banks = banks;
    this.accounts = accounts;
    this.access = access;
    this.scope = scope;
    this.protector = protector;
    this.audit = audit;
  }

  /** Carinin hesapları (maskeli); pasifler yalnız istenirse. */
  @Transactional(readOnly = true)
  public List<AccountBankAccountResponse> listFor(UUID accountId, boolean includeInactive) {
    Account account = access.readable(accountId);
    return banks.findAllByAccountIdOrderByCreatedAt(accountId).stream()
        .filter(row -> includeInactive || row.isActive())
        .map(row -> toResponse(row, account, false))
        .toList();
  }

  /** Çapraz liste (ZTO {@code referenceID=0}); personel carilerinin hesapları izinsiz gizli. */
  @Transactional(readOnly = true)
  public PageResponse<AccountBankAccountResponse> search(
      UUID accountId, String q, String currency, Boolean active, Pageable pageable) {
    if (accountId != null) {
      access.readable(accountId);
    }
    Page<AccountBankAccount> page =
        banks.search(
            accountId,
            currency == null ? "" : currency.trim().toUpperCase(Locale.ROOT),
            active,
            access.employeeVisible(),
            q == null ? "" : q.trim().toLowerCase(Locale.ROOT),
            pageable);
    Map<UUID, Account> owners =
        ownersOf(page.getContent().stream().map(AccountBankAccount::getAccountId).toList());
    return PageResponse.from(page, row -> toResponse(row, owners.get(row.getAccountId()), false));
  }

  /** Düzenleme formu: IBAN/hesap no yalnız FINANCE_MANAGE sahibine açık döner. */
  @Transactional(readOnly = true)
  public AccountBankAccountResponse get(UUID id) {
    AccountBankAccount row = find(id);
    return toResponse(row, owner(row, false), true);
  }

  @Transactional
  public AccountBankAccountResponse create(UUID accountId, SaveBankAccountRequest request) {
    Account account = access.writable(accountId);
    return toResponse(createFor(account, request), account, true);
  }

  @Transactional
  public AccountBankAccountResponse update(UUID id, SaveBankAccountRequest request) {
    AccountBankAccount row = find(id);
    Account account = owner(row, true);
    return toResponse(updateRow(row, request), account, true);
  }

  @Transactional
  public AccountBankAccountResponse setActive(UUID id, boolean active) {
    AccountBankAccount row = find(id);
    Account account = owner(row, true);
    changeActive(row, active);
    return toResponse(row, account, true);
  }

  /**
   * Kart kaydı/profil formuyla aynı işlemde yeni hesap; çağıran kart yazım iznini denetlemiştir.
   */
  AccountBankAccount createFor(Account account, SaveBankAccountRequest request) {
    BankAccountData data = data(request);
    if (data.ibanHash() != null && banks.existsByIbanHashAndActiveTrue(data.ibanHash())) {
      throw ibanTaken();
    }
    AccountBankAccount row = save(new AccountBankAccount(account.getId(), data));
    record(AuditEvent.ACCOUNT_BANK_ACCOUNT_CREATED, row);
    return row;
  }

  /** Profil formundaki satır: başka carinin hesabı bu kartın formundan değiştirilemez (404). */
  void updateFor(Account account, UUID id, SaveBankAccountRequest request) {
    updateRow(rowOf(account, id), request);
  }

  void deactivateFor(Account account, UUID id) {
    changeActive(rowOf(account, id), false);
  }

  private AccountBankAccount updateRow(AccountBankAccount row, SaveBankAccountRequest request) {
    BankAccountData data = data(request);
    if (row.isActive()
        && data.ibanHash() != null
        && banks.existsByIbanHashAndActiveTrueAndIdNot(data.ibanHash(), row.getId())) {
      throw ibanTaken();
    }
    row.update(data);
    save(row);
    record(AuditEvent.ACCOUNT_BANK_ACCOUNT_UPDATED, row);
    return row;
  }

  private void changeActive(AccountBankAccount row, boolean active) {
    if (active == row.isActive()) {
      return;
    }
    if (active) {
      if (row.getIbanHash() != null
          && banks.existsByIbanHashAndActiveTrueAndIdNot(row.getIbanHash(), row.getId())) {
        throw ibanTaken();
      }
      row.activate();
    } else {
      row.deactivate();
    }
    save(row);
    record(
        active
            ? AuditEvent.ACCOUNT_BANK_ACCOUNT_ACTIVATED
            : AuditEvent.ACCOUNT_BANK_ACCOUNT_DEACTIVATED,
        row);
  }

  /** Doğrulama, normalizasyon ve şifreleme; istemcinin maskeli değerlerine güvenilmez. */
  private BankAccountData data(SaveBankAccountRequest request) {
    String iban = blankToNull(PersonalDataProtector.normalizeIban(request.iban()));
    String number = blankToNull(request.accountNumber());
    if (iban == null && number == null) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "BANK_ACCOUNT_IDENTIFIER_REQUIRED",
          "IBAN veya hesap numarası girilmelidir.");
    }
    if (iban != null && !PersonalDataProtector.isValidIban(iban)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "IBAN_INVALID",
          "IBAN geçersiz (ülke kodu, uzunluk ve kontrol hanesi denetlendi).");
    }
    return new BankAccountData(
        request.bankName().trim(),
        blankToNull(request.branchName()),
        protector.encrypt(number),
        PersonalDataProtector.maskAccountNumber(number),
        protector.encrypt(iban),
        iban == null ? null : protector.hash(iban),
        PersonalDataProtector.maskIban(iban),
        blankToNull(request.holderName()),
        request.currency().trim().toUpperCase(Locale.ROOT),
        request.accountKind(),
        request.category(),
        request.openedOn(),
        blankToNull(request.description()));
  }

  /** Yarışta tekil indeks ihlali aynı genel 409'a çevrilir (çakışan kart bilgisi dönmez). */
  private AccountBankAccount save(AccountBankAccount row) {
    try {
      return banks.saveAndFlush(row);
    } catch (DataIntegrityViolationException ex) {
      String cause = String.valueOf(ex.getMostSpecificCause().getMessage());
      if (cause.contains("account_bank_account_iban_uq")) {
        throw ibanTaken();
      }
      throw ex;
    }
  }

  private AccountBankAccount find(UUID id) {
    return banks.findById(id).orElseThrow(AccountBankAccountService::notFound);
  }

  private AccountBankAccount rowOf(Account account, UUID id) {
    AccountBankAccount row = find(id);
    if (!row.getAccountId().equals(account.getId())) {
      throw notFound();
    }
    return row;
  }

  /**
   * Kaydın carisi: personel carisi izinsiz kullanıcıya yokmuş gibi (404 {@code
   * BANK_ACCOUNT_NOT_FOUND}); yazımda kartın iş yeri kapsamda olmalı (403).
   */
  private Account owner(AccountBankAccount row, boolean write) {
    Account account =
        accounts.findById(row.getAccountId()).orElseThrow(AccountBankAccountService::notFound);
    if (account.getType() == AccountType.EMPLOYEE && !access.employeeVisible()) {
      throw notFound();
    }
    if (write) {
      scope.requireVisible(account.getBranchId());
    }
    return account;
  }

  private Map<UUID, Account> ownersOf(Collection<UUID> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return accounts.findAllById(ids).stream()
        .collect(Collectors.toMap(Account::getId, Function.identity()));
  }

  private AccountBankAccountResponse toResponse(
      AccountBankAccount row, Account account, boolean detail) {
    boolean open = detail && AccountAccess.hasAuthority(Permission.FINANCE_MANAGE.name());
    String accountName = account == null ? null : account.getName();
    return new AccountBankAccountResponse(
        row.getId(),
        row.getAccountId(),
        account == null ? null : account.getCode(),
        accountName,
        account == null ? null : account.getType(),
        row.getBankName(),
        row.getBranchName(),
        open ? protector.decrypt(row.getAccountNumberEnc()) : null,
        row.getAccountNumberMasked(),
        open ? protector.decrypt(row.getIbanEnc()) : null,
        row.getIbanMasked(),
        row.getHolderName() != null ? row.getHolderName() : accountName,
        row.getCurrency(),
        row.getAccountKind(),
        row.getCategory(),
        row.getOpenedOn(),
        row.getLastTransactionOn(),
        row.getDescription(),
        row.isActive(),
        row.getCreatedBy(),
        row.getCreatedAt(),
        row.getUpdatedBy(),
        row.getUpdatedAt(),
        row.getUpdateCount());
  }

  private void record(AuditEvent event, AccountBankAccount row) {
    String masked =
        row.getIbanMasked() != null ? row.getIbanMasked() : row.getAccountNumberMasked();
    audit.record(event, "ACCOUNT:" + row.getAccountId(), row.getBankName() + " " + masked);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "BANK_ACCOUNT_NOT_FOUND", "Banka hesabı bulunamadı.");
  }

  /** Her durumda aynı genel ileti; çakışan cari adı/kodu/kimliği dönmez (§9 OK-41). */
  private static BusinessException ibanTaken() {
    return new BusinessException(
        HttpStatus.CONFLICT, "IBAN_TAKEN", "Bu IBAN bilgisi kayıtlıdır, lütfen kontrol ediniz.");
  }
}
