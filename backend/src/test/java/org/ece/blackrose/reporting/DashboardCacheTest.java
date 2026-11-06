package org.ece.blackrose.reporting;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.ece.blackrose.reporting.service.DashboardCache;
import org.ece.blackrose.reporting.web.ReportDtos.DashboardResponse;
import org.junit.jupiter.api.Test;

class DashboardCacheTest {

  private static final Set<String> FINANCE = Set.of("FINANCE_VIEW");
  private final AtomicInteger loads = new AtomicInteger();
  private final Supplier<DashboardResponse> loader =
      () -> {
        loads.incrementAndGet();
        return new DashboardResponse(null, null, null, null);
      };

  @Test
  void ayniFirmaVeYetkiTekHesapYapar() {
    DashboardCache cache = new DashboardCache(Duration.ofMinutes(1));

    cache.get("a", FINANCE, loader);
    cache.get("a", Set.of("FINANCE_VIEW"), loader);

    assertThat(loads).hasValue(1);
  }

  @Test
  void firmalarVeYetkilerBirbirininSonucunuGormez() {
    DashboardCache cache = new DashboardCache(Duration.ofMinutes(1));

    DashboardResponse first = cache.get("a", FINANCE, loader);

    assertThat(cache.get("b", FINANCE, loader)).isNotSameAs(first);
    assertThat(cache.get("a", Set.of("FLEET_VIEW"), loader)).isNotSameAs(first);
    assertThat(loads).hasValue(3);
  }

  @Test
  void sifirSureOnbellegiKapatir() {
    DashboardCache cache = new DashboardCache(Duration.ZERO);

    cache.get("a", FINANCE, loader);
    cache.get("a", FINANCE, loader);

    assertThat(loads).hasValue(2);
  }
}
