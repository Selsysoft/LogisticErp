package org.ece.blackrose.finance.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.locks.ReentrantLock;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.service.RateSource.FetchedRate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Kurları çeker. Aynı anda tek çekim yapılır; başarısız çekimden sonra bir süre yeniden denenmez,
 * böylece kaynak kapalıyken her istek beklemez.
 */
@Component
public class RateRefresher {

  static final Duration FAILURE_BACKOFF = Duration.ofMinutes(10);
  private static final Logger log = LoggerFactory.getLogger(RateRefresher.class);

  private final RateSource source;
  private final ExchangeRateRepository rates;
  private final boolean enabled;
  private final Clock clock;
  private final ReentrantLock inFlight = new ReentrantLock();
  private volatile Instant retryAfter = Instant.MIN;

  @Autowired
  public RateRefresher(
      RateSource source,
      ExchangeRateRepository rates,
      @Value("${app.finance.tcmb.enabled}") boolean enabled) {
    this(source, rates, enabled, Clock.systemUTC());
  }

  RateRefresher(RateSource source, ExchangeRateRepository rates, boolean enabled, Clock clock) {
    this.source = source;
    this.rates = rates;
    this.enabled = enabled;
    this.clock = clock;
  }

  @Async
  @EventListener(ApplicationReadyEvent.class)
  public void refreshOnStartup() {
    refreshIfEnabled();
  }

  /** TCMB kurları iş günü 15:30'da yayımlar. */
  @Scheduled(cron = "0 45 15,16,17 * * MON-FRI", zone = "Europe/Istanbul")
  public void refreshOnSchedule() {
    refreshIfEnabled();
  }

  private void refreshIfEnabled() {
    if (enabled) {
      refresh();
    }
  }

  /** Yeni eklenen kur sayısını döner. Çekim yapılmadıysa veya başarısızsa -1 döner. */
  public int refresh() {
    if (clock.instant().isBefore(retryAfter) || !inFlight.tryLock()) {
      return -1;
    }
    try {
      int added = 0;
      for (FetchedRate rate : source.fetchLatest()) {
        if (!rates.existsByCurrencyAndRateDate(rate.currency(), rate.date())) {
          rates.save(new ExchangeRate(rate.currency(), rate.date(), rate.rate(), "TCMB"));
          added++;
        }
      }
      log.info("Kurlar güncellendi: {} yeni kayıt", added);
      return added;
    } catch (RuntimeException ex) {
      retryAfter = clock.instant().plus(FAILURE_BACKOFF);
      log.warn("Kurlar çekilemedi, {} sonra yeniden denenecek", FAILURE_BACKOFF, ex);
      return -1;
    } finally {
      inFlight.unlock();
    }
  }
}
