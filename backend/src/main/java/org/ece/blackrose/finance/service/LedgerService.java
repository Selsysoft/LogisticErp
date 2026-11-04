package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cari hareketlerin tek yazım noktası. Aynı kaynak belge ikinci kez kayıt üretmez. */
@Service
public class LedgerService {

  public static final String SOURCE_MANUAL = "MANUAL";
  public static final String SOURCE_REVERSAL = "REVERSAL";

  public record Posting(
      UUID accountId,
      UUID branchId,
      Direction direction,
      Money money,
      LocalDate date,
      String description,
      String sourceType,
      UUID sourceId,
      BigDecimal manualRate) {}

  private final AccountTransactionRepository transactions;
  private final AccountRepository accounts;
  private final ExchangeRateService rates;

  public LedgerService(
      AccountTransactionRepository transactions,
      AccountRepository accounts,
      ExchangeRateService rates) {
    this.transactions = transactions;
    this.accounts = accounts;
    this.rates = rates;
  }

  @Transactional
  public AccountTransaction post(Posting posting) {
    return transactions
        .findBySourceTypeAndSourceId(posting.sourceType(), posting.sourceId())
        .orElseGet(() -> insert(posting));
  }

  private AccountTransaction insert(Posting posting) {
    if (!accounts.existsById(posting.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (posting.money().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    Conversion conversion = rates.convert(posting.money(), posting.date(), posting.manualRate());
    return transactions.save(
        new AccountTransaction(
            posting.accountId(),
            posting.branchId(),
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

  /** Kaynak belgenin cari hareketini aynı kur ve TL karşılığıyla ters çevirir. */
  @Transactional
  public void reverseSource(String sourceType, UUID sourceId, LocalDate date, String description) {
    transactions
        .findBySourceTypeAndSourceId(sourceType, sourceId)
        .ifPresent(original -> reverse(original, date, description));
  }

  @Transactional
  public AccountTransaction reverse(
      AccountTransaction original, LocalDate date, String description) {
    if (SOURCE_REVERSAL.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ALREADY_REVERSAL", "Ters hareket yeniden ters çevrilemez.");
    }
    return transactions
        .findBySourceTypeAndSourceId(SOURCE_REVERSAL, original.getId())
        .orElseGet(
            () ->
                transactions.save(
                    new AccountTransaction(
                        original.getAccountId(),
                        original.getBranchId(),
                        original.getDirection().opposite(),
                        original.getMoney(),
                        original.getExchangeRate(),
                        original.getRateDate(),
                        original.getTlAmount(),
                        date,
                        description,
                        SOURCE_REVERSAL,
                        original.getId())));
  }
}
