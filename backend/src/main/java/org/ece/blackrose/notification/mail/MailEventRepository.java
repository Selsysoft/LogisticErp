package org.ece.blackrose.notification.mail;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface MailEventRepository extends JpaRepository<MailEvent, String> {

  List<MailEvent> findByTenantCodeAndRecipientInOrderByOccurredAtDesc(
      String tenantCode, Collection<String> recipients);

  List<MailEvent> findByOccurredAtAfterOrderByOccurredAtDesc(Instant after, Pageable pageable);

  /** Sonradan teslim edilen adresin eski sorunları kapanır. */
  @Modifying
  @Query(
      "delete from MailEvent e where e.recipient = :recipient and e.tenantCode = :tenantCode"
          + " and e.occurredAt < :before")
  int resolve(String tenantCode, String recipient, Instant before);

  @Modifying
  @Query(
      "delete from MailEvent e where e.recipient = :recipient and e.tenantCode is null"
          + " and e.occurredAt < :before")
  int resolveWithoutTenant(String recipient, Instant before);

  @Modifying
  @Query("delete from MailEvent e where e.occurredAt < :before")
  int deleteOlderThan(Instant before);
}
