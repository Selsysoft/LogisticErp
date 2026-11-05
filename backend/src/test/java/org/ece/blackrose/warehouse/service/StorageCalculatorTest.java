package org.ece.blackrose.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.warehouse.service.StorageCalculator.DailyDelta;
import org.junit.jupiter.api.Test;

class StorageCalculatorTest {

  private static final UUID ITEM = UUID.randomUUID();
  private static final Map<UUID, BigDecimal> PER_TEN = Map.of(ITEM, BigDecimal.TEN);
  private static final LocalDate DAY1 = LocalDate.of(2026, 3, 1);

  @Test
  void countsEndOfDayStockIncludingReceiptDayExcludingIssuedQuantity() {
    // 1. gün 100 giriş, 3. gün 50 çıkış; 4 gün: 100 + 100 + 50 + 50 = 300 adet-gün = 30 birim-gün.
    List<DailyDelta> deltas =
        List.of(
            new DailyDelta(ITEM, DAY1, new BigDecimal("100")),
            new DailyDelta(ITEM, DAY1.plusDays(2), new BigDecimal("-50")));

    assertThat(StorageCalculator.billingUnitDays(deltas, PER_TEN, DAY1, DAY1.plusDays(3)))
        .isEqualByComparingTo("30");
  }

  @Test
  void openingBalanceComesFromMovementsBeforeThePeriod() {
    List<DailyDelta> deltas =
        List.of(new DailyDelta(ITEM, DAY1.minusDays(20), new BigDecimal("40")));

    assertThat(StorageCalculator.billingUnitDays(deltas, PER_TEN, DAY1, DAY1.plusDays(1)))
        .isEqualByComparingTo("8");
  }

  @Test
  void movementsAfterPeriodStartDoNotAffectEarlierDaysAndNegativeDaysAreNotCharged() {
    List<DailyDelta> deltas =
        List.of(
            new DailyDelta(ITEM, DAY1, new BigDecimal("-10")),
            new DailyDelta(ITEM, DAY1.plusDays(1), new BigDecimal("20")));

    // 1. gün -10 (sıfır sayılır), 2. gün 10 → 1 birim-gün.
    assertThat(StorageCalculator.billingUnitDays(deltas, PER_TEN, DAY1, DAY1.plusDays(1)))
        .isEqualByComparingTo("1");
  }

  @Test
  void emptyStockCostsNothing() {
    assertThat(StorageCalculator.billingUnitDays(List.of(), PER_TEN, DAY1, DAY1.plusDays(5)))
        .isEqualByComparingTo("0");
  }
}
