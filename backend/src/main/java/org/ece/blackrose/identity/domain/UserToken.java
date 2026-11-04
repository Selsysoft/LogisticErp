package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Davet ve şifre sıfırlama bağlantıları için tek kullanımlık token. */
@Entity
@Table(name = "user_token")
public class UserToken {

  @Id private UUID id;
  private UUID userId;
  private String tokenHash;
  private Instant expiresAt;
  private Instant usedAt;

  protected UserToken() {}

  public UserToken(UUID userId, String tokenHash, Instant expiresAt) {
    this.id = UUID.randomUUID();
    this.userId = userId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
  }

  public boolean isUsable(Instant now) {
    return usedAt == null && expiresAt.isAfter(now);
  }

  public void markUsed(Instant now) {
    usedAt = now;
  }

  public UUID getUserId() {
    return userId;
  }
}
