package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountStatementRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.BalanceRow;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.AccountResponse;
import org.ece.blackrose.finance.web.FinanceDtos.AgingResponse;
import org.ece.blackrose.finance.web.FinanceDtos.BalanceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ManualAccountTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SaveAccountRequest;
import org.ece.blackrose.finance.web.FinanceDtos.StatementLine;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final LedgerService ledger;

  public AccountService(
      AccountRepository accounts, AccountTransactionRepository transactions, LedgerService ledger) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.ledger = ledger;
  }

  /** Sayfa başına tek bakiye sorgusu çalışır; hesap başına sorgu yapılmaz. */
  @Transactional(readOnly = true)
  public PageResponse<AccountResponse> list(String search, Pageable pageable) {
    String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
    Page<Account> page = accounts.search(term, pageable);
    Map<UUID, List<BalanceResponse>> balances =
        balancesOf(page.getContent().stream().map(Account::getId).toList());
    return PageResponse.from(
        page, account -> toResponse(account, balances.getOrDefault(account.getId(), List.of())));
  }

  @Transactional(readOnly = true)
  public AccountResponse get(UUID id) {
    Account account = find(id);
    return toResponse(account, balancesOf(List.of(id)).getOrDefault(id, List.of()));
  }

  @Transactional
  public AccountResponse create(SaveAccountRequest request) {
    if (accounts.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_CODE_TAKEN", "Bu cari kodu kullanımda.");
    }
    Account account =
        accounts.save(
            new Account(
                request.code(),
                request.name(),
                request.type(),
                request.taxNumber(),
                request.branchId()));
    return toResponse(account, List.of());
  }

  @Transactional
  public AccountResponse update(UUID id, SaveAccountRequest request) {
    Account account = find(id);
    account.update(request.name(), request.type(), request.taxNumber(), request.branchId());
    return toResponse(account, balancesOf(List.of(id)).getOrDefault(id, List.of()));
  }

  @Transactional
  public void delete(UUID id) {
    Account account = find(id);
    if (transactions.existsByAccountId(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_HAS_TRANSACTIONS", "Hareketi olan cari silinemez.");
    }
    account.markDeleted();
  }

  @Transactional
  public AccountTransaction postManual(UUID accountId, ManualAccountTransactionRequest request) {
    find(accountId);
    return ledger.post(
        new Posting(
            accountId,
            request.branchId(),
            request.direction(),
            request.money(),
            request.date(),
            request.description(),
            LedgerService.SOURCE_MANUAL,
            UUID.randomUUID(),
            request.exchangeRate()));
  }

  /** Belgeden gelen hareket yalnız kendi belgesi üzerinden ters çevrilir. */
  @Transactional
  public AccountTransaction reverseManual(UUID transactionId, LocalDate date, String description) {
    AccountTransaction original =
        transactions
            .findById(transactionId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı."));
    // Açılış bakiyesinin belgesi yoktur; yanlış yüklenen açılış ekstreden düzeltilir.
    if (!LedgerService.SOURCE_MANUAL.equals(original.getSourceType())
        && !OpeningBalanceImportService.SOURCE_OPENING.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_NOT_MANUAL",
          "Belgeye bağlı hareket, belgesinden iptal edilmelidir.");
    }
    return ledger.reverse(original, date, description);
  }

  @Transactional(readOnly = true)
  public StatementResponse statement(
      UUID accountId, String currency, LocalDate from, LocalDate to, Pageable pageable) {
    find(accountId);
    BigDecimal opening = transactions.balanceBefore(accountId, currency, from);
    Page<AccountStatementRow> page =
        transactions.statement(accountId, currency, from, to, pageable);
    List<StatementLine> lines =
        page.getContent().stream()
            .map(
                row ->
                    new StatementLine(
                        row.getId(),
                        row.getTransactionDate(),
                        row.getDirection(),
                        row.getAmount(),
                        row.getExchangeRate(),
                        row.getTlAmount(),
                        row.getDescription(),
                        row.getSourceType(),
                        opening.add(row.getRunningBalance())))
            .toList();
    return new StatementResponse(
        currency,
        opening,
        lines,
        page.getNumber(),
        page.getSize(),
        page.getTotalElements(),
        page.getTotalPages());
  }

  /**
   * Açık bakiyeyi vadesiz eskitme: karşı yöndeki hareketler en eski açık kalemleri kapatır, kalan
   * kalemler işlem tarihine göre dilimlere ayrılır.
   */
  @Transactional(readOnly = true)
  public List<AgingResponse> aging(AgingType type, LocalDate asOf) {
    String openDirection = type == AgingType.RECEIVABLE ? "DEBIT" : "CREDIT";
    Collection<String> types =
        type == AgingType.RECEIVABLE
            ? List.of(AccountType.CUSTOMER.name())
            : List.of(AccountType.SUPPLIER.name(), AccountType.CARRIER.name());

    return transactions.agingRows(asOf, openDirection, types).stream()
        .map(
            row ->
                new AgingResponse(
                    row.getAccountId(),
                    row.getAccountName(),
                    row.getCurrency(),
                    row.getCurrent(),
                    row.getDays31To60(),
                    row.getDays61To90(),
                    row.getOver90(),
                    row.getCurrent()
                        .add(row.getDays31To60())
                        .add(row.getDays61To90())
                        .add(row.getOver90())))
        .toList();
  }

  private Map<UUID, List<BalanceResponse>> balancesOf(Collection<UUID> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return transactions.balances(ids).stream()
        .collect(
            Collectors.groupingBy(
                BalanceRow::getAccountId,
                Collectors.mapping(
                    row ->
                        new BalanceResponse(
                            row.getCurrency(),
                            row.getDebit(),
                            row.getCredit(),
                            row.getDebit().subtract(row.getCredit()),
                            row.getTlBalance()),
                    Collectors.toList())));
  }

  private Account find(UUID id) {
    return accounts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
  }

  private static AccountResponse toResponse(Account account, List<BalanceResponse> balances) {
    return new AccountResponse(
        account.getId(),
        account.getCode(),
        account.getName(),
        account.getType(),
        account.getTaxNumber(),
        account.getBranchId(),
        balances);
  }
}
