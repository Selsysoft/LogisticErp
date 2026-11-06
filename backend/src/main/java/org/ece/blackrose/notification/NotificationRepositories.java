package org.ece.blackrose.notification;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public final class NotificationRepositories {

  private NotificationRepositories() {}

  public interface NotificationPreferenceRepository
      extends JpaRepository<NotificationPreference, NotificationPreference.Key> {

    List<NotificationPreference> findByUserId(UUID userId);

    List<NotificationPreference> findByEmailFalse();
  }

  public interface DigestRunRepository extends JpaRepository<DigestRun, LocalDate> {

    /** Günü üstlenir; yalnız 1 dönen çağrı gönderir. */
    @Modifying
    @Transactional
    @Query(
        value = "insert into notification_digest_run (day) values (:day) on conflict do nothing",
        nativeQuery = true)
    int claim(@Param("day") LocalDate day);
  }
}
