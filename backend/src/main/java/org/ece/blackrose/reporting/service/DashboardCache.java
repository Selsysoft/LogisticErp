package org.ece.blackrose.reporting.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.ece.blackrose.reporting.web.ReportDtos.DashboardResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Ana sayfa her açılışta cari hareketlerin tamamını toplar; aynı anda açan kullanıcılar için tek
 * hesap yapılır. Anahtar firma ve yetki kümesidir, sonuç bunların dışında kullanıcıya bağlı
 * değildir; LIMITED kullanıcıda iş yeri kümesi de anahtara girer (kapsamlı sonuç ALL kullanıcıya,
 * ALL sonucu LIMITED kullanıcıya sızmaz). Rakamlar en çok TTL kadar eski olabilir; rapor ekranları
 * önbellek kullanmaz.
 */
@Component
public class DashboardCache {

  private static final int MAX_ENTRIES = 10_000;

  private record Key(String tenant, Set<String> widgets, List<UUID> scopeKey) {}

  private final Cache<Key, DashboardResponse> cache;

  public DashboardCache(@Value("${app.reporting.dashboard-cache-ttl}") Duration ttl) {
    this.cache = Caffeine.newBuilder().maximumSize(MAX_ENTRIES).expireAfterWrite(ttl).build();
  }

  public DashboardResponse get(
      String tenant, Set<String> widgets, Supplier<DashboardResponse> loader) {
    return get(tenant, widgets, null, loader);
  }

  /**
   * {@code allowedBranchIds} ALL kullanıcıda {@code null}; LIMITED kullanıcıda izinli iş yerleri
   * (sıralanarak anahtara girer).
   */
  public DashboardResponse get(
      String tenant,
      Set<String> widgets,
      Collection<UUID> allowedBranchIds,
      Supplier<DashboardResponse> loader) {
    List<UUID> scopeKey =
        allowedBranchIds == null ? null : allowedBranchIds.stream().sorted().toList();
    return cache.get(new Key(tenant, Set.copyOf(widgets), scopeKey), key -> loader.get());
  }
}
