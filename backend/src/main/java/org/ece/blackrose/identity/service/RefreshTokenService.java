package org.ece.blackrose.identity.service;

import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.RefreshToken;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.RefreshTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.security.TokenService;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Her yenilemede token değişir. Kullanılmış bir token tekrar gelirse çalınmış sayılır ve aynı
 * oturumdan üretilen tüm token'lar iptal edilir.
 */
@Service
public class RefreshTokenService {

  private final RefreshTokenRepository tokens;
  private final UserAccountRepository users;
  private final TokenService tokenService;
  private final SecurityProperties properties;
  private final AuditService audit;

  public RefreshTokenService(
      RefreshTokenRepository tokens,
      UserAccountRepository users,
      TokenService tokenService,
      SecurityProperties properties,
      AuditService audit) {
    this.tokens = tokens;
    this.users = users;
    this.tokenService = tokenService;
    this.properties = properties;
    this.audit = audit;
  }

  @Transactional
  public TokenResponse startSession(UserAccount user) {
    return issue(user, UUID.randomUUID());
  }

  /** Aile iptali, hata fırlatılsa da kalıcı olmalıdır. */
  @Transactional(noRollbackFor = BusinessException.class)
  public TokenResponse rotate(String rawToken) {
    Instant now = Instant.now();
    RefreshToken current =
        tokens.findByTokenHash(SecureTokens.hash(rawToken)).orElseThrow(this::invalid);
    if (current.isRevoked()) {
      tokens.revokeFamily(current.getFamilyId(), now);
      audit.record(
          AuditEvent.REFRESH_TOKEN_REUSED,
          current.getUserId(),
          null,
          "user",
          "Oturum iptal edildi");
      throw invalid();
    }
    if (current.isExpired(now)) {
      throw invalid();
    }
    UserAccount user =
        users
            .findById(current.getUserId())
            .filter(candidate -> candidate.getStatus() == UserStatus.ACTIVE)
            .orElseThrow(this::invalid);
    current.revoke(now);
    return issue(user, current.getFamilyId());
  }

  /** Bilinmeyen token sessizce yok sayılır; çıkış her zaman başarılıdır. */
  @Transactional
  public void revokeSession(String rawToken) {
    tokens
        .findByTokenHash(SecureTokens.hash(rawToken))
        .ifPresent(token -> tokens.revokeFamily(token.getFamilyId(), Instant.now()));
  }

  private TokenResponse issue(UserAccount user, UUID familyId) {
    String raw = SecureTokens.generate();
    tokens.save(
        new RefreshToken(
            user.getId(),
            familyId,
            SecureTokens.hash(raw),
            Instant.now().plus(properties.refreshTokenTtl())));
    String access =
        tokenService.issueTenantAccessToken(user, TenantContext.currentCode().orElseThrow());
    return new TokenResponse(access, raw, tokenService.accessTokenTtlSeconds());
  }

  private BusinessException invalid() {
    return new BusinessException(
        HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_INVALID", "Oturum süresi doldu.");
  }
}
