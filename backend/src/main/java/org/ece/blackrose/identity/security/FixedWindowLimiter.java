package org.ece.blackrose.identity.security;

import java.util.Map;
import java.util.OptionalLong;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Bellek içi sabit pencereli sayaç. Sayaçlar uygulama örneği başınadır; birden çok örnekte toplam
 * sınır örnek sayısıyla çarpılır.
 */
final class FixedWindowLimiter {

  private record Window(long startMillis, int count) {}

  private final long windowMillis;
  private final LongSupplier clock;
  private final Map<String, Window> windows = new ConcurrentHashMap<>();
  private volatile long nextSweepMillis;

  FixedWindowLimiter(long windowMillis, LongSupplier clock) {
    this.windowMillis = windowMillis;
    this.clock = clock;
    this.nextSweepMillis = clock.getAsLong() + windowMillis;
  }

  /** İzin verilirse boş, sınır aşıldıysa pencerenin bitimine kalan milisaniyeyi döner. */
  OptionalLong tryAcquire(String key, int limit) {
    long now = clock.getAsLong();
    sweep(now);
    Window window =
        windows.compute(
            key,
            (ignored, current) ->
                current == null || now - current.startMillis() >= windowMillis
                    ? new Window(now, 1)
                    : new Window(current.startMillis(), current.count() + 1));
    return window.count() <= limit
        ? OptionalLong.empty()
        : OptionalLong.of(window.startMillis() + windowMillis - now);
  }

  private void sweep(long now) {
    if (now >= nextSweepMillis) {
      nextSweepMillis = now + windowMillis;
      windows.values().removeIf(window -> now - window.startMillis() >= windowMillis);
    }
  }

  int trackedKeys() {
    return windows.size();
  }
}
