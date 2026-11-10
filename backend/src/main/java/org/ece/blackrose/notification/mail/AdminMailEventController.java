package org.ece.blackrose.notification.mail;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** SaaS konsolu: bütün firmalarda son 30 günde teslim edilemeyen e-postalar. */
@RestController
@RequestMapping("/api/v1/admin/mail-events")
public class AdminMailEventController {

  static final Duration WINDOW = Duration.ofDays(30);
  static final int LIMIT = 200;

  @Schema(name = "MailEventResponse")
  public record MailEventResponse(
      String type,
      String recipient,
      String tenantCode,
      String kind,
      String subject,
      String detail,
      Instant occurredAt) {}

  private final MailEventService events;

  public AdminMailEventController(MailEventService events) {
    this.events = events;
  }

  @GetMapping
  List<MailEventResponse> recent() {
    return events.recent(Instant.now().minus(WINDOW), LIMIT).stream()
        .map(
            event ->
                new MailEventResponse(
                    event.getType().name(),
                    event.getRecipient(),
                    event.getTenantCode(),
                    event.getKind(),
                    event.getSubject(),
                    event.getDetail(),
                    event.getOccurredAt()))
        .toList();
  }
}
