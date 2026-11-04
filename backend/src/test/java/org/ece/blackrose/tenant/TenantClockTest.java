package org.ece.blackrose.tenant;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class TenantClockTest {

  @Test
  void dateFollowsTenantTimeZoneNotUtc() {
    Instant lateUtc = Instant.parse("2026-11-04T22:00:00Z");

    assertThat(TenantClock.dateAt(lateUtc, "Europe/Istanbul")).isEqualTo(LocalDate.of(2026, 11, 5));
    assertThat(TenantClock.dateAt(lateUtc, "UTC")).isEqualTo(LocalDate.of(2026, 11, 4));
  }
}
