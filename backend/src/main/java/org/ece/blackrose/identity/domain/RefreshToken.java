package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_token")
public class RefreshToken {

  @Id private UUID id;
  private UUID userId;
  private UUID familyId;
  private String tokenHash;
  private Instant expiresAt;
  private Instant revokedAt;

  protected RefreshToken() {}

  public RefreshToken(UUID userId, UUID familyId, String tokenHash, Instant expiresAt) {
    this.id = UUID.randomUUID();
    this.userId = userId;
    this.familyId = familyId;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
  }

  public void revoke(Instant now) {
    revokedAt = now;
  }

  public boolean isRevoked() {
    return revokedAt != null;
  }

  public boolean isExpired(Instant now) {
    return !expiresAt.isAfter(now);
  }

  public UUID getUserId() {
    return userId;
  }

  public UUID getFamilyId() {
    return familyId;
  }
}
