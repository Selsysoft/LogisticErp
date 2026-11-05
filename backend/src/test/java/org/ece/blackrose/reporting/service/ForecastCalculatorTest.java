package org.ece.blackrose.reporting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.reporting.service.ForecastCalculator.Due;
import org.ece.blackrose.reporting.service.ForecastCalculator.OpenInvoice;
import org.ece.blackrose.reporting.web.ReportDtos.ForecastRow;
import org.junit.jupiter.api.Test;

class ForecastCalculatorTest {

  // 2026-11-05 perşembe; haftası 2026-11-02 pazartesi başlar.
  private static final LocalDate TODAY = LocalDate.of(2026, 11, 5);

  private static BigDecimal amount(String value) {
    return new BigDecimal(value);
  }

  @Test
  void collectionsCloseOldestInvoicesFirst() {
    List<OpenInvoice> invoices =
        List.of(
            new OpenInvoice("A", "TRY", amount("100"), TODAY.minusDays(30)),
            new OpenInvoice("A", "TRY", amount("100"), TODAY.plusDays(10)));

    // Toplam 200 kesildi, 150 açık: yeni fatura tam, eski fatura 50 açık.
    List<Due> open = ForecastCalculator.openReceivables(invoices, Map.of("A|TRY", amount("150")));

    assertThat(open).hasSize(2);
    assertThat(open.get(0).dueDate()).isEqualTo(TODAY.plusDays(10));
    assertThat(open.get(0).amount()).isEqualByComparingTo("100");
    assertThat(open.get(1).amount()).isEqualByComparingTo("50");
  }

  @Test
  void fullyCollectedOrCreditBalanceExpectsNothing() {
    List<OpenInvoice> invoices = List.of(new OpenInvoice("A", "TRY", amount("100"), TODAY));

    assertThat(ForecastCalculator.openReceivables(invoices, Map.of("A|TRY", amount("0"))))
        .isEmpty();
    assertThat(ForecastCalculator.openReceivables(invoices, Map.of("A|TRY", amount("-5"))))
        .isEmpty();
    assertThat(ForecastCalculator.openReceivables(invoices, Map.of())).isEmpty();
  }

  @Test
  void bucketsByWeekAndCurrencyAndSeparatesOverdue() {
    List<ForecastRow> rows =
        ForecastCalculator.weekly(
            List.of(
                new Due("TRY", amount("100"), TODAY.minusDays(1)),
                new Due("TRY", amount("40"), TODAY),
                new Due("TRY", amount("60"), TODAY.plusDays(1)),
                new Due("USD", amount("7"), TODAY.plusDays(1))),
            List.of(new Due("TRY", amount("30"), TODAY.plusDays(2))),
            TODAY,
            12);

    assertThat(rows).hasSize(3);
    ForecastRow overdue = rows.get(0);
    assertThat(overdue.overdue()).isTrue();
    assertThat(overdue.inflow()).isEqualByComparingTo("100");

    ForecastRow week = rows.get(1);
    assertThat(week.weekStart()).isEqualTo(LocalDate.of(2026, 11, 2));
    assertThat(week.inflow()).isEqualByComparingTo("100");
    assertThat(week.outflow()).isEqualByComparingTo("30");
    assertThat(week.net()).isEqualByComparingTo("70");

    assertThat(rows.get(2).currency()).isEqualTo("USD");
  }

  @Test
  void ignoresDuesBeyondHorizon() {
    assertThat(
            ForecastCalculator.weekly(
                List.of(new Due("TRY", amount("1"), TODAY.plusYears(1))), List.of(), TODAY, 12))
        .isEmpty();
  }
}
