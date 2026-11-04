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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Finans carisiyle aynı kök kaydın CRM görünümü. Bakiye gibi finans bilgisi taşımaz. */
@Service
public class CustomerService {

  private final AccountRepository accounts;
  private final CrmProfileRepository profiles;

  public CustomerService(AccountRepository accounts, CrmProfileRepository profiles) {
    this.accounts = accounts;
    this.profiles = profiles;
  }

  @Transactional(readOnly = true)
  public PageResponse<CustomerResponse> list(String search, Pageable pageable) {
    String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
    Page<Account> page = accounts.search(term, pageable);
    Map<UUID, CrmProfile> byAccount =
        profiles.findAllById(page.getContent().stream().map(Account::getId).toList()).stream()
            .collect(Collectors.toMap(CrmProfile::getAccountId, Function.identity()));
    return PageResponse.from(page, account -> toResponse(account, byAccount.get(account.getId())));
  }

  @Transactional(readOnly = true)
  public CustomerResponse get(UUID id) {
    return toResponse(find(id), profiles.findById(id).orElse(null));
  }

  @Transactional
  public CustomerResponse create(SaveCustomerRequest request) {
    if (accounts.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_CODE_TAKEN", "Bu cari kodu kullanımda.");
    }
    Account account =
        accounts.save(
            new Account(request.code(), request.name(), request.type(), request.taxNumber(), null));
    return toResponse(account, saveProfile(account.getId(), request));
  }

  @Transactional
  public CustomerResponse update(UUID id, SaveCustomerRequest request) {
    Account account = find(id);
    account.update(request.name(), request.type(), request.taxNumber(), account.getBranchId());
    return toResponse(account, saveProfile(id, request));
  }

  /** Aday, teklif kabul edilince müşteriye dönüşür. */
  @Transactional
  public void promoteLead(UUID id) {
    Account account = find(id);
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

  private CrmProfile saveProfile(UUID accountId, SaveCustomerRequest request) {
    CrmProfile profile = profiles.findById(accountId).orElseGet(() -> new CrmProfile(accountId));
    Set<String> tags = request.tags() == null ? Set.of() : request.tags();
    profile.update(request.segment(), List.copyOf(tags));
    return profiles.save(profile);
  }

  private static CustomerResponse toResponse(Account account, CrmProfile profile) {
    return new CustomerResponse(
        account.getId(),
        account.getCode(),
        account.getName(),
        account.getType(),
        account.getTaxNumber(),
        profile == null ? null : profile.getSegment(),
        profile == null ? Set.of() : Set.copyOf(profile.getTags()));
  }
}
