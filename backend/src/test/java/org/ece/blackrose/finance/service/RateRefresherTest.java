package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.service.RateSource.FetchedRate;
import org.junit.jupiter.api.Test;

class RateRefresherTest {

  private static final Instant START = Instant.parse("2026-11-04T12:00:00Z");

  private final RateSource source = mock(RateSource.class);
  private final ExchangeRateRepository rates = mock(ExchangeRateRepository.class);

  @Test
  void savesOnlyMissingRates() {
    LocalDate date = LocalDate.of(2026, 11, 4);
    when(source.fetchLatest())
        .thenReturn(
            List.of(
                new FetchedRate("USD", date, BigDecimal.TEN),
                new FetchedRate("EUR", date, BigDecimal.ONE)));
    when(rates.existsByCurrencyAndRateDate("USD", date)).thenReturn(true);

    int added = new RateRefresher(source, rates, true, clockAt(START)).refresh();

    assertThat(added).isEqualTo(1);
    verify(rates, times(1)).save(any());
  }

  @Test
  void doesNotRetryUntilBackoffPasses() {
    when(source.fetchLatest()).thenThrow(new IllegalStateException("kapalı"));
    MutableClock clock = new MutableClock(START);
    RateRefresher refresher = new RateRefresher(source, rates, true, clock);

    assertThat(refresher.refresh()).isEqualTo(-1);
    assertThat(refresher.refresh()).isEqualTo(-1);
    verify(source, times(1)).fetchLatest();

    clock.now = START.plus(RateRefresher.FAILURE_BACKOFF).plusSeconds(1);
    refresher.refresh();
    verify(source, times(2)).fetchLatest();
  }

  private static Clock clockAt(Instant instant) {
    return Clock.fixed(instant, ZoneOffset.UTC);
  }

  private static final class MutableClock extends Clock {
    private Instant now;

    private MutableClock(Instant now) {
      this.now = now;
    }

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
