package org.ece.blackrose.identity.service;

import java.time.Instant;
import org.ece.blackrose.identity.repository.IdentityRepositories.RefreshTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.RevokedAccessTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserTokenRepository;
import org.ece.blackrose.tenant.TenantJobs;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class IdentityCleanupJob {

  private final TenantJobs tenantJobs;
  private final RefreshTokenRepository refreshTokens;
  private final RevokedAccessTokenRepository revokedTokens;
  private final UserTokenRepository userTokens;

  public IdentityCleanupJob(
      TenantJobs tenantJobs,
      RefreshTokenRepository refreshTokens,
      RevokedAccessTokenRepository revokedTokens,
      UserTokenRepository userTokens) {
    this.tenantJobs = tenantJobs;
    this.refreshTokens = refreshTokens;
    this.revokedTokens = revokedTokens;
    this.userTokens = userTokens;
  }

  @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT1H")
  public void deleteExpiredTokens() {
    tenantJobs.forEachActiveTenant(
        () -> {
          Instant now = Instant.now();
          refreshTokens.deleteExpired(now);
          revokedTokens.deleteExpired(now);
          userTokens.deleteExpired(now);
        });
  }
}
