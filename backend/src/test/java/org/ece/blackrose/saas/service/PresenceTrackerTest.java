package org.ece.blackrose.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.saas.service.PresenceTracker.Presence;
import org.junit.jupiter.api.Test;

class PresenceTrackerTest {

  private static final Instant NOW = Instant.parse("2026-11-05T12:00:00Z");

  @Test
  void classifiesUsersByLastRequestAndForgetsOldOnes() {
    PresenceTracker tracker = new PresenceTracker();
    tracker.touchAt("a", UUID.randomUUID(), NOW.minus(Duration.ofMinutes(1)));
    tracker.touchAt("a", UUID.randomUUID(), NOW.minus(Duration.ofMinutes(20)));
    tracker.touchAt("a", UUID.randomUUID(), NOW.minus(Duration.ofMinutes(60)));
    tracker.touchAt("a", UUID.randomUUID(), NOW.minus(Duration.ofHours(3)));
    tracker.touchAt("b", UUID.randomUUID(), NOW);

    assertThat(tracker.presenceAt("a", NOW)).isEqualTo(new Presence(1, 1, 1));
    assertThat(tracker.presenceAt("b", NOW)).isEqualTo(new Presence(1, 0, 0));
    assertThat(tracker.presenceAt("yok", NOW)).isEqualTo(new Presence(0, 0, 0));
  }

  @Test
  void sameUserCountsOnce() {
    PresenceTracker tracker = new PresenceTracker();
    UUID user = UUID.randomUUID();
    tracker.touchAt("a", user, NOW.minus(Duration.ofMinutes(20)));
    tracker.touchAt("a", user, NOW);

    assertThat(tracker.presenceAt("a", NOW)).isEqualTo(new Presence(1, 0, 0));
  }
}
