package org.ece.blackrose.crm.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.crm.domain.CrmProfile;
import org.ece.blackrose.crm.repository.CrmRepositories.CrmProfileRepository;
import org.ece.blackrose.crm.web.CrmDtos.CustomerResponse;
import org.ece.blackrose.crm.web.CrmDtos.SaveCustomerRequest;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.AccountAccess;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.security.PersonalDataProtector.TaxIdentity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finans carisiyle aynı kök kaydın CRM görünümü. Bakiye gibi finans bilgisi taşımaz. Personel
 * carileri izinsiz kullanıcıya görünmez ve tür kuralı finans kartıyla aynıdır (12.1 §3.2).
 */
@Service
public class CustomerService {

  private final AccountRepository accounts;
  private final CrmProfileRepository profiles;
  private final AccountAccess access;
  private final PersonalDataProtector protector;

  public CustomerService(
      AccountRepository accounts,
      CrmProfileRepository profiles,
      AccountAccess access,
      PersonalDataProtector protector) {
    this.accounts = accounts;
    this.profiles = profiles;
    this.access = access;
    this.protector = protector;
  }

  @Transactional(readOnly = true)
  public PageResponse<CustomerResponse> list(String search, Pageable pageable) {
    String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
    Page<Account> page =
        accounts.searchFiltered(term, null, null, null, access.employeeVisible(), pageable);
    Map<UUID, CrmProfile> byAccount =
        profiles.findAllById(page.getContent().stream().map(Account::getId).toList()).stream()
            .collect(Collectors.toMap(CrmProfile::getAccountId, Function.identity()));
    return PageResponse.from(
        page, account -> toResponse(account, byAccount.get(account.getId()), false));
  }

  @Transactional(readOnly = true)
  public CustomerResponse get(UUID id) {
    return toResponse(access.readable(id), profiles.findById(id).orElse(null), true);
  }

  @Transactional
  public CustomerResponse create(SaveCustomerRequest request) {
    Account.requireNotReserved(request.type());
    access.requireCanOpen(request.type());
    if (accounts.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_CODE_TAKEN", "Bu cari kodu kullanımda.");
    }
    TaxIdentity tax = protector.taxIdentity(request.taxNumber());
    Account account =
        new Account(request.code(), request.name(), request.type(), tax.plain(), null);
    account.applyTaxIdentity(tax);
    accounts.save(account);
    return toResponse(account, saveProfile(account.getId(), request), true);
  }

  @Transactional
  public CustomerResponse update(UUID id, SaveCustomerRequest request) {
    Account account = access.readable(id);
    account.requireNotIntercompany();
    Account.requireNotReserved(request.type());
    access.requireTypeChange(account, request.type());
    TaxIdentity tax = taxIdentity(account, request.taxNumber());
    account.update(request.name(), request.type(), tax.plain(), account.getBranchId());
    account.applyTaxIdentity(tax);
    return toResponse(account, saveProfile(id, request), true);
  }

  /**
   * Aday, teklif kabul edilince müşteriye dönüşür. Sistem dönüşümüdür (türetilmiş akış): tür kilidi
   * ({@code ACCOUNT_TYPE_LOCKED}) uygulanmaz, personel türü söz konusu değildir.
   */
  @Transactional
  public void promoteLead(UUID id) {
    Account account = access.readable(id);
    if (account.getType() == AccountType.LEAD) {
      account.update(
          account.getName(), AccountType.CUSTOMER, account.getTaxNumber(), account.getBranchId());
    }
  }

  public Account find(UUID id) {
    return accounts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
  }

  /** Saklı maske geri gönderilirse vergi numarası değişmez (MUI düzenleme formu). */
  private TaxIdentity taxIdentity(Account account, String raw) {
    String value = raw == null ? null : raw.trim();
    if (value != null && value.equals(account.getTaxNumberMasked())) {
      return new TaxIdentity(
          null,
          account.getTaxNumberEnc(),
          account.getTaxNumberHash(),
          account.getTaxNumberMasked());
    }
    return protector.taxIdentity(value);
  }

  private CrmProfile saveProfile(UUID accountId, SaveCustomerRequest request) {
    CrmProfile profile = profiles.findById(accountId).orElseGet(() -> new CrmProfile(accountId));
    Set<String> tags = request.tags() == null ? Set.of() : request.tags();
    profile.update(request.segment(), List.copyOf(tags));
    return profiles.save(profile);
  }

  /** TCKN listede maskeli; detayda yalnız CRM_EDIT sahibine açık. */
  private CustomerResponse toResponse(Account account, CrmProfile profile, boolean detail) {
    String taxNumber = account.getTaxNumber();
    boolean masked = false;
    if (taxNumber == null && account.getTaxNumberEnc() != null) {
      if (detail && AccountAccess.hasAuthority(Permission.CRM_EDIT.name())) {
        taxNumber = protector.decrypt(account.getTaxNumberEnc());
      } else {
        taxNumber = account.getTaxNumberMasked();
        masked = true;
      }
    }
    return new CustomerResponse(
        account.getId(),
        account.getCode(),
        account.getName(),
        account.getType(),
        taxNumber,
        masked,
        profile == null ? null : profile.getSegment(),
        profile == null ? Set.of() : Set.copyOf(profile.getTags()));
  }
}
