package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundBalanceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Banka/kasa hareketlerinin tek yazım noktası. Bakiye kontrolü satır kilidi altında yapılır. */
@Service
public class FundLedgerService {

  public record FundPosting(
      UUID fundAccountId,
      FundDirection direction,
      Money money,
      LocalDate date,
      String description,
      String sourceType,
      UUID sourceId,
      BigDecimal manualRate) {}

  private final FundTransactionRepository transactions;
  private final FundAccountRepository funds;
  private final ExchangeRateService rates;

  public FundLedgerService(
      FundTransactionRepository transactions,
      FundAccountRepository funds,
      ExchangeRateService rates) {
    this.transactions = transactions;
    this.funds = funds;
    this.rates = rates;
  }

  @Transactional
  public FundTransaction post(FundPosting posting) {
    return transactions
        .findBySourceTypeAndSourceIdAndFundAccountId(
            posting.sourceType(), posting.sourceId(), posting.fundAccountId())
        .orElseGet(() -> insert(posting));
  }

  private FundTransaction insert(FundPosting posting) {
    FundAccount fund =
        funds
            .findForUpdate(posting.fundAccountId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
    if (!fund.getCurrency().equals(posting.money().currency())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CURRENCY_MISMATCH",
          "Tutarın para birimi hesabın para birimiyle aynı olmalıdır.");
    }
    if (posting.money().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    if (posting.direction() == FundDirection.OUT) {
      ensureSufficient(fund, posting.money().amount());
    }
    Conversion conversion = rates.convert(posting.money(), posting.date(), posting.manualRate());
    return transactions.save(
        new FundTransaction(
            fund.getId(),
            posting.direction(),
            posting.money(),
            conversion.rate(),
            conversion.rateDate(),
            conversion.tlAmount(),
            posting.date(),
            posting.description(),
            posting.sourceType(),
            posting.sourceId()));
  }

  /** Kaynak belgenin tüm banka/kasa hareketlerini aynı kurla ters çevirir. */
  @Transactional
  public void reverseSource(String sourceType, UUID sourceId, LocalDate date, String description) {
    transactions
        .findBySourceTypeAndSourceId(sourceType, sourceId)
        .forEach(original -> reverse(original, date, description));
  }

  @Transactional
  public FundTransaction reverse(FundTransaction original, LocalDate date, String description) {
    if (LedgerService.SOURCE_REVERSAL.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ALREADY_REVERSAL", "Ters hareket yeniden ters çevrilemez.");
    }
    return transactions
        .findBySourceTypeAndSourceIdAndFundAccountId(
            LedgerService.SOURCE_REVERSAL, original.getId(), original.getFundAccountId())
        .orElseGet(
            () -> {
              FundAccount fund = funds.findForUpdate(original.getFundAccountId()).orElseThrow();
              if (original.getDirection() == FundDirection.IN) {
                ensureSufficient(fund, original.getMoney().amount());
              }
              return transactions.save(
                  new FundTransaction(
                      original.getFundAccountId(),
                      original.getDirection().opposite(),
                      original.getMoney(),
                      original.getExchangeRate(),
                      original.getRateDate(),
                      original.getTlAmount(),
                      date,
                      description,
                      LedgerService.SOURCE_REVERSAL,
                      original.getId()));
            });
  }

  private void ensureSufficient(FundAccount fund, BigDecimal amount) {
    if (fund.isAllowNegative()) {
      return;
    }
    List<FundBalanceRow> rows = transactions.balances(List.of(fund.getId()));
    BigDecimal balance = rows.isEmpty() ? BigDecimal.ZERO : rows.get(0).getBalance();
    if (balance.compareTo(amount) < 0) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "INSUFFICIENT_FUNDS", fund.getName() + " bakiyesi yetersiz.");
    }
  }
}
