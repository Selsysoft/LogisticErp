package org.ece.blackrose.common.money;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.RoundingMode;
import org.junit.jupiter.api.Test;

class MoneyTest {

  @Test
  void addsDecimalsWithoutFloatingPointError() {
    Money sum = Money.of("0.1", "TRY").add(Money.of("0.2", "TRY"));

    assertThat(sum).isEqualTo(Money.of("0.3", "TRY"));
  }

  @Test
  void equalityAndHashIgnoreScale() {
    assertThat(Money.of("0.30", "TRY")).isEqualTo(Money.of("0.3", "TRY"));
    assertThat(Money.of("0.30", "TRY")).hasSameHashCodeAs(Money.of("0.3", "TRY"));
    assertThat(Money.of("0.3", "TRY")).isNotEqualTo(Money.of("0.3", "EUR"));
  }

  @Test
  void roundsWithConfiguredRule() {
    Money value = Money.of("10.125", "TRY");

    assertThat(value.rounded(new MoneyRounding(2, RoundingMode.HALF_UP)).amount())
        .isEqualByComparingTo("10.13");
    assertThat(value.rounded(new MoneyRounding(2, RoundingMode.HALF_EVEN)).amount())
        .isEqualByComparingTo("10.12");
    assertThat(value.rounded(new MoneyRounding(0, RoundingMode.DOWN)).amount())
        .isEqualByComparingTo("10");
  }

  @Test
  void rejectsMixedCurrenciesAndUnknownCodes() {
    assertThatThrownBy(() -> Money.of("1", "TRY").add(Money.of("1", "EUR")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Money.of("1", "XXXX")).isInstanceOf(IllegalArgumentException.class);
  }
}
