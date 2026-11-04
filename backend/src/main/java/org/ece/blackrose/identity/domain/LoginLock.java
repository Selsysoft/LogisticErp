package org.ece.blackrose.identity.domain;

import jakarta.persistence.Embeddable;
import java.time.Duration;
import java.time.Instant;

/** Art arda hatalı girişte hesabı geçici olarak kilitler. */
@Embeddable
public class LoginLock {

  private static final int MAX_FAILURES = 5;
  private static final Duration LOCK_DURATION = Duration.ofMinutes(15);

  private int failedLoginCount;
  private Instant lockedUntil;

  public boolean isLocked(Instant now) {
    return lockedUntil != null && lockedUntil.isAfter(now);
  }

  public void recordFailure(Instant now) {
    failedLoginCount++;
    if (failedLoginCount >= MAX_FAILURES) {
      lockedUntil = now.plus(LOCK_DURATION);
      failedLoginCount = 0;
    }
  }

  public void reset() {
    failedLoginCount = 0;
    lockedUntil = null;
  }
}
