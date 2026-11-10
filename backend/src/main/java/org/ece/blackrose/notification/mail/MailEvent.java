package org.ece.blackrose.notification.mail;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Teslim edilemeyen bir e-posta; firmalar arası yönetim şemasında tutulur. */
@Entity
@Table(name = "mail_event", schema = "admin")
public class MailEvent {

  public enum Type {
    BOUNCED,
    COMPLAINED,
    FAILED
  }

  @Id private String webhookId;
  private String emailId;

  @Enumerated(EnumType.STRING)
  private Type type;

  private String recipient;
  private String tenantCode;
  private String kind;
  private String subject;
  private String detail;
  private Instant occurredAt;
  private Instant receivedAt;

  protected MailEvent() {}

  public MailEvent(
      String webhookId,
      String emailId,
      Type type,
      String recipient,
      String tenantCode,
      String kind,
      String subject,
      String detail,
      Instant occurredAt,
      Instant receivedAt) {
    this.webhookId = webhookId;
    this.emailId = emailId;
    this.type = type;
    this.recipient = recipient;
    this.tenantCode = tenantCode;
    this.kind = kind;
    this.subject = subject;
    this.detail = detail;
    this.occurredAt = occurredAt;
    this.receivedAt = receivedAt;
  }

  public String getWebhookId() {
    return webhookId;
  }

  public String getEmailId() {
    return emailId;
  }

  public Type getType() {
    return type;
  }

  public String getRecipient() {
    return recipient;
  }

  public String getTenantCode() {
    return tenantCode;
  }

  public String getKind() {
    return kind;
  }

  public String getSubject() {
    return subject;
  }

  public String getDetail() {
    return detail;
  }

  public Instant getOccurredAt() {
    return occurredAt;
  }

  public Instant getReceivedAt() {
    return receivedAt;
  }
}
