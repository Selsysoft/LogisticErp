package org.ece.blackrose.saas.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Son isteğe göre çevrimiçi durumu. Bellekte tutulur: yeniden başlatmada sıfırlanır ve birden çok
 * sunucuda yalnız o sunucuya gelen istekleri görür.
 */
@Component
public class PresenceTracker {

  public record Presence(long active, long idle, long disconnected) {}

  static final Duration ACTIVE_WINDOW = Duration.ofMinutes(5);
  static final Duration IDLE_WINDOW = Duration.ofMinutes(30);
  static final Duration RETENTION = Duration.ofHours(2);

  private final Map<String, Map<UUID, Instant>> lastSeen = new ConcurrentHashMap<>();

  public void touch(String tenantCode, UUID userId) {
    lastSeen
        .computeIfAbsent(tenantCode, key -> new ConcurrentHashMap<>())
        .put(userId, Instant.now());
  }

  public Presence presenceOf(String tenantCode) {
    return presenceAt(tenantCode, Instant.now());
  }

  Presence presenceAt(String tenantCode, Instant now) {
    Map<UUID, Instant> users = lastSeen.getOrDefault(tenantCode, Map.of());
    long active = 0;
    long idle = 0;
    long disconnected = 0;
    for (Map.Entry<UUID, Instant> entry : users.entrySet()) {
      Duration age = Duration.between(entry.getValue(), now);
      if (age.compareTo(RETENTION) > 0) {
        users.remove(entry.getKey());
      } else if (age.compareTo(ACTIVE_WINDOW) <= 0) {
        active++;
      } else if (age.compareTo(IDLE_WINDOW) <= 0) {
        idle++;
      } else {
        disconnected++;
      }
    }
    return new Presence(active, idle, disconnected);
  }

  void touchAt(String tenantCode, UUID userId, Instant at) {
    lastSeen.computeIfAbsent(tenantCode, key -> new ConcurrentHashMap<>()).put(userId, at);
  }
}
