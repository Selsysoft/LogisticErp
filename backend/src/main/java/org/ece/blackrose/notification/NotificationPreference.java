package org.ece.blackrose.notification;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.UUID;

@Entity
@Table(name = "notification_preference")
@IdClass(NotificationPreference.Key.class)
public class NotificationPreference {

  public record Key(UUID userId, NotificationTopic topic) implements Serializable {
    public Key() {
      this(null, null);
    }
  }

  @Id private UUID userId;

  @Id
  @Enumerated(EnumType.STRING)
  private NotificationTopic topic;

  private boolean email;

  protected NotificationPreference() {}

  public NotificationPreference(UUID userId, NotificationTopic topic, boolean email) {
    this.userId = userId;
    this.topic = topic;
    this.email = email;
  }

  public void setEmail(boolean email) {
    this.email = email;
  }

  public UUID getUserId() {
    return userId;
  }

  public NotificationTopic getTopic() {
    return topic;
  }

  public boolean isEmail() {
    return email;
  }
}
