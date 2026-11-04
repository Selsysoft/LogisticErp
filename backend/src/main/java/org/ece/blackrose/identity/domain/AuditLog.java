package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Şema belirtilmez: tenant olayları tenant şemasına, SaaS yöneticisi olayları bağlam olmadığı için
 * admin şemasındaki aynı adlı tabloya yazılır.
 */
@Entity
@Table(name = "audit_log")
public class AuditLog {

  @Id private UUID id;
  private String eventType;
  private UUID actorId;
  private String actorEmail;
  private String target;
  private String details;
  private String ipAddress;
  private String traceId;
  private Instant createdAt;

  protected AuditLog() {}

  public AuditLog(
      String eventType,
      UUID actorId,
      String actorEmail,
      String target,
      String details,
      String ipAddress,
      String traceId) {
    this.id = UUID.randomUUID();
    this.eventType = eventType;
    this.actorId = actorId;
    this.actorEmail = actorEmail;
    this.target = target;
    this.details = details;
    this.ipAddress = ipAddress;
    this.traceId = traceId;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getEventType() {
    return eventType;
  }

  public UUID getActorId() {
    return actorId;
  }

  public String getActorEmail() {
    return actorEmail;
  }

  public String getTarget() {
    return target;
  }

  public String getDetails() {
    return details;
  }

  public String getIpAddress() {
    return ipAddress;
  }

  public String getTraceId() {
    return traceId;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
