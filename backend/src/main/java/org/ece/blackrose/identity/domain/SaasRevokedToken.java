package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "saas_revoked_token", schema = "admin")
public class SaasRevokedToken {

  @Id private UUID jti;
  private Instant expiresAt;

  protected SaasRevokedToken() {}

  public SaasRevokedToken(UUID jti, Instant expiresAt) {
    this.jti = jti;
    this.expiresAt = expiresAt;
  }
}
