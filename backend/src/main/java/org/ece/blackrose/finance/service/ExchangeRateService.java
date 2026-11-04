package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.money.MoneyRounding;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class ExchangeRateService {

  public static final String LOCAL_CURRENCY = "TRY";

  /** Hareketin TL karşılığı; kayda yazılır ve sonradan değişmez. */
  public record Conversion(BigDecimal rate, LocalDate rateDate, BigDecimal tlAmount) {}

  private final ExchangeRateRepository rates;
  private final TenantRepository tenants;

  public ExchangeRateService(ExchangeRateRepository rates, TenantRepository tenants) {
    this.rates = rates;
    this.tenants = tenants;
  }

  /**
   * Elle verilen kur önceliklidir. Yoksa işlem gününün kuru, o da yoksa son bilinen kur kullanılır.
   * Hiç kur yoksa kullanıcıdan kur girmesi istenir.
   */
  public Conversion convert(Money money, LocalDate date, BigDecimal manualRate) {
    if (LOCAL_CURRENCY.equals(money.currency())) {
      return new Conversion(BigDecimal.ONE, date, round(money.amount()));
    }
    if (manualRate != null) {
      if (manualRate.signum() <= 0) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "RATE_INVALID", "Kur sıfırdan büyük olmalıdır.");
      }
      return new Conversion(manualRate, date, round(money.amount().multiply(manualRate)));
    }
    ExchangeRate rate =
        rates
            .findFirstByCurrencyAndRateDateLessThanEqualOrderByRateDateDesc(money.currency(), date)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.UNPROCESSABLE_ENTITY,
                        "RATE_MISSING",
                        money.currency() + " için kur bulunamadı. Lütfen kuru elle girin."));
    return new Conversion(
        rate.getRate(), rate.getRateDate(), round(money.amount().multiply(rate.getRate())));
  }

  private BigDecimal round(BigDecimal value) {
    return rounding().apply(value);
  }

  private MoneyRounding rounding() {
    return tenants
        .findByCode(TenantContext.currentCode().orElseThrow())
        .orElseThrow()
        .moneyRounding();
  }
}
