package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import org.ece.blackrose.common.error.BusinessException;
import org.junit.jupiter.api.Test;

/**
 * Kullanıcı iptal tarihi kuralı (12.2a §3.5, OK-12.2a-6): {@code kayıt tarihi ≤ tarih ≤ max(bugün,
 * kayıt tarihi)}; sınır günleri.
 */
class ReverseDateRuleTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 15);

  @Test
  void gecmisKayitBugunVeKayitTarihiArasinda() {
    LocalDate recorded = LocalDate.of(2026, 11, 10);
    assertThatCode(() -> SettlementService.requireReverseDate(recorded, recorded, TODAY))
        .doesNotThrowAnyException();
    assertThatCode(() -> SettlementService.requireReverseDate(recorded, TODAY, TODAY))
        .doesNotThrowAnyException();
    assertCode(recorded, recorded.minusDays(1), "REVERSE_BEFORE_SETTLEMENT");
    assertCode(recorded, TODAY.plusDays(1), "DATE_IN_FUTURE");
  }

  @Test
  void ileriTarihliKayitKendiTarihineKadar() {
    LocalDate recorded = TODAY.plusDays(5);
    assertThatCode(() -> SettlementService.requireReverseDate(recorded, recorded, TODAY))
        .doesNotThrowAnyException();
    // Bugün kayıt tarihinden önce: kural kayıt tarihini alt sınır yapar.
    assertCode(recorded, TODAY, "REVERSE_BEFORE_SETTLEMENT");
    assertCode(recorded, recorded.plusDays(1), "DATE_IN_FUTURE");
  }

  @Test
  void bugunluKayit() {
    assertThatCode(() -> SettlementService.requireReverseDate(TODAY, TODAY, TODAY))
        .doesNotThrowAnyException();
    assertCode(TODAY, TODAY.minusDays(1), "REVERSE_BEFORE_SETTLEMENT");
    assertCode(TODAY, TODAY.plusDays(1), "DATE_IN_FUTURE");
  }

  private static void assertCode(LocalDate recorded, LocalDate date, String code) {
    assertThatThrownBy(() -> SettlementService.requireReverseDate(recorded, date, TODAY))
        .isInstanceOfSatisfying(
            BusinessException.class,
            error -> {
              assertThat(error.getCode()).isEqualTo(code);
              assertThat(error.getStatus().value()).isEqualTo(400);
            });
  }
}
