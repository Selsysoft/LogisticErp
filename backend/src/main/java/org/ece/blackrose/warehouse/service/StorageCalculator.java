package org.ece.blackrose.warehouse.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Faturalanacak depolama miktarını hesaplar: her gün sonundaki stok, faturalama birimine çevrilip
 * toplanır. Giriş günü ücrete dahildir, çıkış günü çıkan mal dahil değildir.
 */
final class StorageCalculator {

  record DailyDelta(UUID itemId, LocalDate date, BigDecimal quantity) {}

  private static final int SCALE = 4;

  private StorageCalculator() {}

  static BigDecimal billingUnitDays(
      Collection<DailyDelta> deltas,
      Map<UUID, BigDecimal> unitsPerBillingUnit,
      LocalDate from,
      LocalDate to) {
    Map<UUID, BigDecimal> balance = new HashMap<>();
    Map<UUID, Map<LocalDate, BigDecimal>> changes = new HashMap<>();
    for (DailyDelta delta : deltas) {
      if (delta.date().isBefore(from)) {
        balance.merge(delta.itemId(), delta.quantity(), BigDecimal::add);
      } else {
        changes
            .computeIfAbsent(delta.itemId(), key -> new HashMap<>())
            .merge(delta.date(), delta.quantity(), BigDecimal::add);
      }
    }
    BigDecimal total = BigDecimal.ZERO;
    for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
      for (Map.Entry<UUID, Map<LocalDate, BigDecimal>> entry : changes.entrySet()) {
        BigDecimal change = entry.getValue().get(day);
        if (change != null) {
          balance.merge(entry.getKey(), change, BigDecimal::add);
        }
      }
      for (Map.Entry<UUID, BigDecimal> entry : balance.entrySet()) {
        // Geriye dönük çıkış geçmişte eksi gün üretebilir; müşteriden eksi ücret alınmaz.
        BigDecimal quantity = entry.getValue().max(BigDecimal.ZERO);
        total =
            total.add(
                quantity.divide(
                    unitsPerBillingUnit.get(entry.getKey()), SCALE, RoundingMode.HALF_UP));
      }
    }
    return total;
  }
}
