package org.ece.blackrose.notification.mail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * BulkMail teslim olaylarını alır. Oturum gerektirmez; her istek Standard Webhooks imzasıyla
 * doğrulanır. {@code BULKMAIL_WEBHOOK_SECRET} tanımlı değilse uç kapalıdır (404). Aynı olay birden
 * çok kez gelebilir; {@code webhook-id} ile ayıklanır ve her durumda 2xx dönülür ki BulkMail
 * yeniden denemesin.
 */
@RestController
public class BulkMailWebhookController {

  public static final String PATH = "/api/v1/webhooks/bulkmail";
  private static final Logger log = LoggerFactory.getLogger(BulkMailWebhookController.class);

  private final WebhookSignature signature;
  private final MailEventService events;
  private final ObjectMapper json;
  private final Clock clock;

  @Autowired
  public BulkMailWebhookController(
      @Value("${app.mail.bulkmail.webhook-secret:}") String secret,
      MailEventService events,
      ObjectMapper json) {
    this(secret, events, json, Clock.systemUTC());
  }

  BulkMailWebhookController(
      String secret, MailEventService events, ObjectMapper json, Clock clock) {
    this.signature = secret == null || secret.isBlank() ? null : new WebhookSignature(secret);
    this.events = events;
    this.json = json;
    this.clock = clock;
  }

  @PostMapping(PATH)
  ResponseEntity<Void> receive(
      @RequestHeader(name = "webhook-id", required = false) String id,
      @RequestHeader(name = "webhook-timestamp", required = false) String timestamp,
      @RequestHeader(name = "webhook-signature", required = false) String signatures,
      @RequestBody(required = false) byte[] body) {
    if (signature == null) {
      return ResponseEntity.notFound().build();
    }
    Instant now = clock.instant();
    if (!signature.verify(id, timestamp, signatures, body, now)) {
      log.warn("BulkMail webhook imzası geçersiz (webhook-id {})", id);
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
    JsonNode event;
    try {
      event = json.readTree(body);
    } catch (IOException ex) {
      return ResponseEntity.badRequest().build();
    }
    if (!events.handle(id, event, now)) {
      log.debug("BulkMail olayı daha önce işlendi: {}", id);
    }
    return ResponseEntity.noContent().build();
  }
}
