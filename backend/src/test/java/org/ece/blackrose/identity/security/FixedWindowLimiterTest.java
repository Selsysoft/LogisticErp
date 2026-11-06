package org.ece.blackrose.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class FixedWindowLimiterTest {

  private final AtomicLong now = new AtomicLong(1_000);
  private final FixedWindowLimiter limiter = new FixedWindowLimiter(60_000, now::get);

  @Test
  void sinirAsilincaKalanSureyiDoner() {
    assertThat(limiter.tryAcquire("a", 2)).isEmpty();
    assertThat(limiter.tryAcquire("a", 2)).isEmpty();
    now.addAndGet(10_000);

    assertThat(limiter.tryAcquire("a", 2)).hasValue(50_000);
  }

  @Test
  void anahtarlarBirbiriniEtkilemez() {
    assertThat(limiter.tryAcquire("a", 1)).isEmpty();
    assertThat(limiter.tryAcquire("a", 1)).isPresent();

    assertThat(limiter.tryAcquire("b", 1)).isEmpty();
  }

  @Test
  void pencereBitinceSayacSifirlanirVeEskiAnahtarlarSilinir() {
    limiter.tryAcquire("a", 1);
    limiter.tryAcquire("a", 1);
    limiter.tryAcquire("b", 1);
    now.addAndGet(60_000);

    assertThat(limiter.tryAcquire("a", 1)).isEmpty();
    assertThat(limiter.trackedKeys()).isEqualTo(1);
  }
}
