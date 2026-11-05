package org.ece.blackrose.reporting.service;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.ece.blackrose.reporting.web.ReportDtos.ForecastRow;

/**
 * Haftalık nakit öngörüsü. Tahsilat faturaya bağlanmadığı için açık tutar şöyle bulunur: carinin
 * bakiyesi, en yeni faturadan geriye doğru dağıtılır; ödenen en eski faturalar sayılır.
 */
final class ForecastCalculator {

  record OpenInvoice(String account, String currency, BigDecimal amount, LocalDate dueDate) {}

  record Due(String currency, BigDecimal amount, LocalDate dueDate) {}

  private record Key(String currency, LocalDate week) {}

  private ForecastCalculator() {}

  /**
   * Bakiyeye göre faturaların hâlâ açık kısmını bulur. Fazla bakiye vadesiz olduğu için sayılmaz.
   */
  static List<Due> openReceivables(
      List<OpenInvoice> invoices, Map<String, BigDecimal> balanceByAccountCurrency) {
    List<OpenInvoice> newestFirst =
        invoices.stream().sorted(Comparator.comparing(OpenInvoice::dueDate).reversed()).toList();
    Map<String, BigDecimal> remaining = new java.util.HashMap<>(balanceByAccountCurrency);
    List<Due> open = new ArrayList<>();
    for (OpenInvoice invoice : newestFirst) {
      String key = invoice.account() + "|" + invoice.currency();
      BigDecimal left = remaining.getOrDefault(key, BigDecimal.ZERO);
      if (left.signum() <= 0) {
        continue;
      }
      BigDecimal part = left.min(invoice.amount());
      open.add(new Due(invoice.currency(), part, invoice.dueDate()));
      remaining.put(key, left.subtract(part));
    }
    return open;
  }

  static List<ForecastRow> weekly(
      List<Due> inflows, List<Due> outflows, LocalDate today, int weeks) {
    LocalDate thisWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    LocalDate horizon = thisWeek.plusWeeks(weeks);
    Map<Key, BigDecimal[]> buckets =
        new TreeMap<>(
            Comparator.comparing(Key::currency)
                .thenComparing(Key::week, Comparator.nullsFirst(Comparator.naturalOrder())));
    add(buckets, inflows, 0, today, horizon);
    add(buckets, outflows, 1, today, horizon);
    return buckets.entrySet().stream()
        .map(
            entry ->
                new ForecastRow(
                    entry.getKey().week(),
                    entry.getKey().week() == null,
                    entry.getKey().currency(),
                    entry.getValue()[0],
                    entry.getValue()[1],
                    entry.getValue()[0].subtract(entry.getValue()[1])))
        .toList();
  }

  private static void add(
      Map<Key, BigDecimal[]> buckets,
      List<Due> dues,
      int slot,
      LocalDate today,
      LocalDate horizon) {
    for (Due due : dues) {
      if (!due.dueDate().isBefore(horizon)) {
        continue;
      }
      LocalDate week =
          due.dueDate().isBefore(today)
              ? null
              : due.dueDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
      BigDecimal[] bucket =
          buckets.computeIfAbsent(
              new Key(due.currency(), week),
              key -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
      bucket[slot] = bucket[slot].add(due.amount());
    }
  }
}
