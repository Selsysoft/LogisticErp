package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.service.AccountBankAccountService;
import org.ece.blackrose.finance.service.AccountService;
import org.ece.blackrose.finance.web.AccountDtos.AccountActiveRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountBankAccountResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountGroupResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountHistoryResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountLimitRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountProfileRequest;
import org.ece.blackrose.finance.web.AccountDtos.SaveBankAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.AccountResponse;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Faz 12.1 cari kartı uçları (12.1 §4.1–§4.2): hesap grupları, ZTO profili, aktiflik, limitler,
 * değişiklik geçmişi ve cari banka hesapları. Eski MUI cari uçları {@link FinanceController}'da
 * kalır.
 */
@RestController
@RequestMapping("/api/v1/finance")
public class AccountProfileController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final AccountService accounts;
  private final AccountBankAccountService bankAccounts;

  public AccountProfileController(AccountService accounts, AccountBankAccountService bankAccounts) {
    this.accounts = accounts;
    this.bankAccounts = bankAccounts;
  }

  @GetMapping("/account-groups")
  @PreAuthorize(VIEW)
  List<AccountGroupResponse> listGroups() {
    return accounts.groups();
  }

  @PutMapping("/accounts/{id}/profile")
  @PreAuthorize(MANAGE)
  AccountResponse updateProfile(
      @PathVariable UUID id, @Valid @RequestBody AccountProfileRequest request) {
    return accounts.updateProfile(id, request);
  }

  @PatchMapping("/accounts/{id}/active")
  @PreAuthorize(MANAGE)
  AccountResponse setActive(
      @PathVariable UUID id, @Valid @RequestBody AccountActiveRequest request) {
    return accounts.setActive(id, request.active());
  }

  @PutMapping("/accounts/{id}/limits")
  @PreAuthorize(MANAGE)
  AccountResponse setLimits(
      @PathVariable UUID id, @Valid @RequestBody AccountLimitRequest request) {
    return accounts.setLimits(id, request);
  }

  @GetMapping("/accounts/{id}/history")
  @PreAuthorize(VIEW)
  PageResponse<AccountHistoryResponse> history(@PathVariable UUID id, Pageable pageable) {
    return accounts.history(id, pageable);
  }

  // Cari banka hesapları

  @GetMapping("/accounts/{id}/bank-accounts")
  @PreAuthorize(VIEW)
  List<AccountBankAccountResponse> listBankAccounts(
      @PathVariable UUID id, @RequestParam(defaultValue = "false") boolean includeInactive) {
    return bankAccounts.listFor(id, includeInactive);
  }

  @PostMapping("/accounts/{id}/bank-accounts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  AccountBankAccountResponse createBankAccount(
      @PathVariable UUID id, @Valid @RequestBody SaveBankAccountRequest request) {
    return bankAccounts.create(id, request);
  }

  @GetMapping("/bank-accounts")
  @PreAuthorize(VIEW)
  PageResponse<AccountBankAccountResponse> searchBankAccounts(
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String currency,
      @RequestParam(required = false) Boolean active,
      Pageable pageable) {
    return bankAccounts.search(accountId, q, currency, active, pageable);
  }

  @GetMapping("/bank-accounts/{id}")
  @PreAuthorize(VIEW)
  AccountBankAccountResponse getBankAccount(@PathVariable UUID id) {
    return bankAccounts.get(id);
  }

  @PutMapping("/bank-accounts/{id}")
  @PreAuthorize(MANAGE)
  AccountBankAccountResponse updateBankAccount(
      @PathVariable UUID id, @Valid @RequestBody SaveBankAccountRequest request) {
    return bankAccounts.update(id, request);
  }

  @PatchMapping("/bank-accounts/{id}/active")
  @PreAuthorize(MANAGE)
  AccountBankAccountResponse setBankAccountActive(
      @PathVariable UUID id, @Valid @RequestBody AccountActiveRequest request) {
    return bankAccounts.setActive(id, request.active());
  }
}
