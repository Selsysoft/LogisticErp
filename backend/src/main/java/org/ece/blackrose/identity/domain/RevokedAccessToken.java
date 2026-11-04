package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "revoked_access_token")
public class RevokedAccessToken {

  @Id private UUID jti;
  private Instant expiresAt;

  protected RevokedAccessToken() {}

  public RevokedAccessToken(UUID jti, Instant expiresAt) {
    this.jti = jti;
    this.expiresAt = expiresAt;
  }
}
