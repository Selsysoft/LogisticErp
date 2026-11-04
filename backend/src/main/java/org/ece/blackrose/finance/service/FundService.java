package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Currency;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundBalanceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundStatementRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.web.FinanceDtos.CreateFundRequest;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ManualFundTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.StatementLine;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.TransferRequest;
import org.ece.blackrose.finance.web.FinanceDtos.TransferResponse;
import org.ece.blackrose.finance.web.FinanceDtos.UpdateFundRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FundService {

  private static final String SOURCE_TRANSFER = "TRANSFER";

  private final FundAccountRepository funds;
  private final FundTransactionRepository transactions;
  private final FundLedgerService ledger;

  public FundService(
      FundAccountRepository funds,
      FundTransactionRepository transactions,
      FundLedgerService ledger) {
    this.funds = funds;
    this.transactions = transactions;
    this.ledger = ledger;
  }

  @Transactional(readOnly = true)
  public List<FundResponse> list() {
    List<FundAccount> all = funds.findAll();
    Map<UUID, BigDecimal> balances = balances(all.stream().map(FundAccount::getId).toList());
    return all.stream()
        .map(fund -> toResponse(fund, balances.getOrDefault(fund.getId(), BigDecimal.ZERO)))
        .toList();
  }

  @Transactional
  public FundResponse create(CreateFundRequest request) {
    if (funds.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "FUND_CODE_TAKEN", "Bu hesap kodu kullanımda.");
    }
    String currency = Currency.getInstance(request.currency()).getCurrencyCode();
    FundAccount fund =
        funds.save(
            new FundAccount(
                request.code(),
                request.name(),
                request.kind(),
                currency,
                request.branchId(),
                request.bankName(),
                request.iban(),
                request.allowNegative()));
    return toResponse(fund, BigDecimal.ZERO);
  }

  @Transactional
  public FundResponse update(UUID id, UpdateFundRequest request) {
    FundAccount fund = find(id);
    fund.update(
        request.name(),
        request.branchId(),
        request.bankName(),
        request.iban(),
        request.allowNegative());
    return toResponse(fund, balances(List.of(id)).getOrDefault(id, BigDecimal.ZERO));
  }

  @Transactional
  public void delete(UUID id) {
    FundAccount fund = find(id);
    if (transactions.existsByFundAccountId(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "FUND_HAS_TRANSACTIONS", "Hareketi olan hesap silinemez.");
    }
    fund.markDeleted();
  }

  @Transactional
  public FundTransaction postManual(UUID fundId, ManualFundTransactionRequest request) {
    return ledger.post(
        new FundPosting(
            fundId,
            request.direction(),
            request.money(),
            request.date(),
            request.description(),
            LedgerService.SOURCE_MANUAL,
            UUID.randomUUID(),
            request.exchangeRate()));
  }

  @Transactional
  public FundTransaction reverseManual(UUID transactionId, LocalDate date, String description) {
    FundTransaction original =
        transactions
            .findById(transactionId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı."));
    if (!LedgerService.SOURCE_MANUAL.equals(original.getSourceType())
        && !SOURCE_TRANSFER.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_NOT_MANUAL",
          "Belgeye bağlı hareket, belgesinden iptal edilmelidir.");
    }
    if (SOURCE_TRANSFER.equals(original.getSourceType())) {
      ledger.reverseSource(SOURCE_TRANSFER, original.getSourceId(), date, description);
      return original;
    }
    return ledger.reverse(original, date, description);
  }

  /**
   * Yalnız aynı para birimli hesaplar arasında çalışır. Aynı anahtarla gelen ikinci istek yeni
   * kayıt üretmez.
   */
  @Transactional
  public TransferResponse transfer(TransferRequest request, String idempotencyKey) {
    if (request.fromFundId().equals(request.toFundId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TRANSFER_SAME_FUND", "Kaynak ve hedef hesap aynı olamaz.");
    }
    UUID transferId =
        idempotencyKey == null
            ? UUID.randomUUID()
            : UUID.nameUUIDFromBytes(
                ("transfer:" + idempotencyKey).getBytes(StandardCharsets.UTF_8));
    FundDirection[] order = {FundDirection.OUT, FundDirection.IN};
    UUID[] ids = {request.fromFundId(), request.toFundId()};
    // Karşılıklı transferlerde kilitlenme olmasın diye hesaplar hep aynı sırayla kilitlenir.
    if (request.fromFundId().compareTo(request.toFundId()) > 0) {
      order = new FundDirection[] {FundDirection.IN, FundDirection.OUT};
      ids = new UUID[] {request.toFundId(), request.fromFundId()};
    }
    for (int i = 0; i < ids.length; i++) {
      ledger.post(
          new FundPosting(
              ids[i],
              order[i],
              request.money(),
              request.date(),
              request.description(),
              SOURCE_TRANSFER,
              transferId,
              request.exchangeRate()));
    }
    return new TransferResponse(transferId);
  }

  @Transactional(readOnly = true)
  public StatementResponse statement(UUID id, LocalDate from, LocalDate to, Pageable pageable) {
    FundAccount fund = find(id);
    BigDecimal opening = transactions.balanceBefore(id, from);
    Page<FundStatementRow> page = transactions.statement(id, from, to, pageable);
    List<StatementLine> lines =
        page.getContent().stream()
            .map(
                row ->
                    new StatementLine(
                        row.getId(),
                        row.getTransactionDate(),
                        row.getDirection(),
                        row.getAmount(),
                        null,
                        null,
                        row.getDescription(),
                        row.getSourceType(),
                        opening.add(row.getRunningBalance())))
            .toList();
    return new StatementResponse(
        fund.getCurrency(),
        opening,
        lines,
        page.getNumber(),
        page.getSize(),
        page.getTotalElements(),
        page.getTotalPages());
  }

  FundAccount find(UUID id) {
    return funds
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
  }

  private Map<UUID, BigDecimal> balances(List<UUID> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return transactions.balances(ids).stream()
        .collect(Collectors.toMap(FundBalanceRow::getFundAccountId, FundBalanceRow::getBalance));
  }

  private static FundResponse toResponse(FundAccount fund, BigDecimal balance) {
    return new FundResponse(
        fund.getId(),
        fund.getCode(),
        fund.getName(),
        fund.getKind(),
        fund.getCurrency(),
        fund.getBranchId(),
        fund.getBankName(),
        fund.getIban(),
        fund.isAllowNegative(),
        balance);
  }
}
