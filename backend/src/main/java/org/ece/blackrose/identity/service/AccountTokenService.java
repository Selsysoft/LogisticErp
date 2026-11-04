package org.ece.blackrose.identity.service;

import java.time.Duration;
import java.time.Instant;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserToken;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserTokenRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Davet ve sıfırlama bağlantıları üretir. Yeni bağlantı, kullanıcının eskilerini geçersiz kılar.
 */
@Service
public class AccountTokenService {

  private static final Duration INVITE_TTL = Duration.ofDays(7);
  private static final Duration RESET_TTL = Duration.ofHours(1);

  private final UserTokenRepository tokens;
  private final AccountMailer mailer;
  private final SecurityProperties properties;

  public AccountTokenService(
      UserTokenRepository tokens, AccountMailer mailer, SecurityProperties properties) {
    this.tokens = tokens;
    this.mailer = mailer;
    this.properties = properties;
  }

  @Transactional
  public void sendInvite(UserAccount user) {
    mailer.sendInvite(user.getEmail(), createLink(user, INVITE_TTL));
  }

  @Transactional
  public void sendPasswordReset(UserAccount user) {
    mailer.sendPasswordReset(user.getEmail(), createLink(user, RESET_TTL));
  }

  private String createLink(UserAccount user, Duration ttl) {
    Instant now = Instant.now();
    tokens.invalidateForUser(user.getId(), now);
    String raw = SecureTokens.generate();
    tokens.save(new UserToken(user.getId(), SecureTokens.hash(raw), now.plus(ttl)));
    return "%s/set-password?token=%s&tenant=%s"
        .formatted(properties.frontendBaseUrl(), raw, TenantContext.currentCode().orElseThrow());
  }
}
