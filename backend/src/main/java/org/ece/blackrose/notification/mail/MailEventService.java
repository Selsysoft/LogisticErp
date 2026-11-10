package org.ece.blackrose.notification.mail;

import com.fasterxml.jackson.databind.JsonNode;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * BulkMail olaylarını işler. Yalnız teslim sorunları saklanır; aynı alıcıya sonradan teslim olursa
 * eski sorun kapanır. Her olay türü {@code blackrose.mail.events} sayacına yazılır.
 */
@Service
public class MailEventService {

  static final String METRIC = "blackrose.mail.events";
  static final Duration RETENTION = Duration.ofDays(90);
  private static final int DETAIL_MAX = 500;
  private static final int SUBJECT_MAX = 998;

  /** Kullanıcı listesinde gösterilen son sorun. */
  public record Issue(MailEvent.Type type, String detail, Instant occurredAt) {}

  private final MailEventRepository events;
  private final MeterRegistry metrics;

  public MailEventService(MailEventRepository events, MeterRegistry metrics) {
    this.events = events;
    this.metrics = metrics;
  }

  /**
   * @return olay daha önce işlendiyse {@code false}
   */
  @Transactional
  public boolean handle(String webhookId, JsonNode event, Instant now) {
    String type = event.path("type").asText("");
    metrics.counter(METRIC, "type", type.isEmpty() ? "unknown" : type).increment();
    JsonNode data = event.path("data");
    String recipient = firstRecipient(data);
    if (recipient == null) {
      return true;
    }
    String tenant = tag(data, "tenant");
    Instant occurred = timestamp(event, now);
    if (type.equals("email.delivered")) {
      if (tenant == null) {
        events.resolveWithoutTenant(recipient, occurred);
      } else {
        events.resolve(tenant, recipient, occurred);
      }
      return true;
    }
    MailEvent.Type problem =
        switch (type) {
          case "email.bounced" -> MailEvent.Type.BOUNCED;
          case "email.complained" -> MailEvent.Type.COMPLAINED;
          case "email.failed" -> MailEvent.Type.FAILED;
          default -> null;
        };
    if (problem == null) {
      return true;
    }
    if (events.existsById(webhookId)) {
      return false;
    }
    events.save(
        new MailEvent(
            webhookId,
            text(data, "email_id"),
            problem,
            recipient,
            tenant,
            tag(data, "kind"),
            truncate(text(data, "subject"), SUBJECT_MAX),
            truncate(detail(problem, data), DETAIL_MAX),
            occurred,
            now));
    return true;
  }

  /** Adres başına en yeni sorun; adresler küçük harfle eşleşir. */
  @Transactional(readOnly = true)
  public Map<String, Issue> latestIssues(String tenantCode, Collection<String> emails) {
    Map<String, Issue> result = new LinkedHashMap<>();
    if (tenantCode == null || emails.isEmpty()) {
      return result;
    }
    List<String> lower = emails.stream().map(MailEventService::normalize).toList();
    for (MailEvent event :
        events.findByTenantCodeAndRecipientInOrderByOccurredAtDesc(tenantCode, lower)) {
      result.putIfAbsent(
          event.getRecipient(),
          new Issue(event.getType(), event.getDetail(), event.getOccurredAt()));
    }
    return result;
  }

  @Transactional(readOnly = true)
  public List<MailEvent> recent(Instant since, int limit) {
    return events.findByOccurredAtAfterOrderByOccurredAtDesc(since, PageRequest.of(0, limit));
  }

  @Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT1H")
  @Transactional
  public void deleteOld() {
    events.deleteOlderThan(Instant.now().minus(RETENTION));
  }

  static String normalize(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }

  private static String firstRecipient(JsonNode data) {
    JsonNode to = data.path("to");
    String value = to.isArray() ? to.path(0).asText(null) : to.asText(null);
    return value == null || value.isBlank() ? null : normalize(value);
  }

  private static String tag(JsonNode data, String name) {
    String value = data.path("tags").path(name).asText(null);
    return value == null || value.isBlank() ? null : value;
  }

  private static String text(JsonNode data, String name) {
    String value = data.path(name).asText(null);
    return value == null || value.isBlank() ? null : value;
  }

  private static Instant timestamp(JsonNode event, Instant fallback) {
    String value = event.path("timestamp").asText(null);
    if (value == null) {
      return fallback;
    }
    try {
      return Instant.parse(value);
    } catch (DateTimeParseException ex) {
      return fallback;
    }
  }

  /** Alıcının ekranda görmesi gereken neden: geri dönme türü, şikâyet türü veya hata nedeni. */
  private static String detail(MailEvent.Type type, JsonNode data) {
    return switch (type) {
      case BOUNCED -> {
        JsonNode bounce = data.path("bounce");
        String kind = bounce.path("type").asText("");
        String sub = bounce.path("sub_type").asText("");
        yield (kind + (sub.isEmpty() ? "" : " / " + sub)).trim();
      }
      case COMPLAINED -> data.path("complaint").path("feedback_type").asText("");
      case FAILED -> data.path("failed").path("reason").asText("");
    };
  }

  private static String truncate(String value, int max) {
    return value == null || value.length() <= max ? value : value.substring(0, max);
  }
}
