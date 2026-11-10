package org.ece.blackrose.common.money;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.Currency;
import java.util.Objects;

/** Tutar ve para birimi. Eşitlik ölçekten bağımsızdır: 0.3 ile 0.30 eşittir. */
public record Money(
    // Ondalık hassasiyet kaybolmasın diye tutar JSON'da metindir ("1500.25"); şema da bunu söyler.
    @JsonFormat(shape = JsonFormat.Shape.STRING)
        @Schema(type = "string", format = "decimal", example = "1500.25")
        BigDecimal amount,
    String currency) {

  public Money {
    Objects.requireNonNull(amount, "amount");
    Objects.requireNonNull(currency, "currency");
    currency = Currency.getInstance(currency).getCurrencyCode();
  }

  public static Money of(String amount, String currency) {
    return new Money(new BigDecimal(amount), currency);
  }

  public Money add(Money other) {
    requireSameCurrency(other);
    return new Money(amount.add(other.amount), currency);
  }

  public Money subtract(Money other) {
    requireSameCurrency(other);
    return new Money(amount.subtract(other.amount), currency);
  }

  public Money rounded(MoneyRounding rounding) {
    return new Money(rounding.apply(amount), currency);
  }

  private void requireSameCurrency(Money other) {
    if (!currency.equals(other.currency)) {
      throw new IllegalArgumentException(
          "Para birimleri farklı: " + currency + " / " + other.currency);
    }
  }

  @Override
  public boolean equals(Object o) {
    return o instanceof Money other
        && currency.equals(other.currency)
        && amount.compareTo(other.amount) == 0;
  }

  @Override
  public int hashCode() {
    return Objects.hash(amount.stripTrailingZeros(), currency);
  }
}
