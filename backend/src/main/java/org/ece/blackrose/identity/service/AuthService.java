package org.ece.blackrose.identity.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.OptionalLong;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.RevokedAccessToken;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.domain.UserToken;
import org.ece.blackrose.identity.repository.IdentityRepositories.RefreshTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.RevokedAccessTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserTokenRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.web.IdentityDtos.LoginRequest;
import org.ece.blackrose.identity.web.IdentityDtos.MeResponse;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.ece.blackrose.identity.web.IdentityDtos.TwoFactorSetupResponse;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

  /** Bilinmeyen e-postada da BCrypt çalışsın diye kullanılır; yanıt süresi hesabı ele vermez. */
  private static final String DUMMY_HASH =
      "$2a$10$7EqJtq98hPqEX7fNZaFWoOa8wS7Yy0N8m0n4m3RzQ0Xn0E6m1u0pC";

  private final UserAccountRepository users;
  private final UserTokenRepository userTokens;
  private final RefreshTokenRepository refreshTokens;
  private final RevokedAccessTokenRepository revokedTokens;
  private final RefreshTokenService sessions;
  private final AccountTokenService accountTokens;
  private final PasswordEncoder passwordEncoder;
  private final TextEncryptor totpEncryptor;
  private final AuditService audit;

  public AuthService(
      UserAccountRepository users,
      UserTokenRepository userTokens,
      RefreshTokenRepository refreshTokens,
      RevokedAccessTokenRepository revokedTokens,
      RefreshTokenService sessions,
      AccountTokenService accountTokens,
      PasswordEncoder passwordEncoder,
      TextEncryptor totpEncryptor,
      AuditService audit) {
    this.users = users;
    this.userTokens = userTokens;
    this.refreshTokens = refreshTokens;
    this.revokedTokens = revokedTokens;
    this.sessions = sessions;
    this.accountTokens = accountTokens;
    this.passwordEncoder = passwordEncoder;
    this.totpEncryptor = totpEncryptor;
    this.audit = audit;
  }

  /**
   * Hatalı deneme sayacı işlem hata verse de kalıcı olmalıdır, bu yüzden tek transaction yoktur.
   */
  public TokenResponse login(LoginRequest request) {
    String email = normalize(request.email());
    Optional<UserAccount> found = users.findByEmail(email);
    Instant now = Instant.now();

    if (found.isEmpty()) {
      passwordEncoder.matches(request.password(), DUMMY_HASH);
      throw loginFailed(null, email);
    }
    UserAccount user = found.get();
    if (user.getLoginLock().isLocked(now)
        || user.getStatus() != UserStatus.ACTIVE
        || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      user.getLoginLock().recordFailure(now);
      users.save(user);
      throw loginFailed(user, email);
    }
    if (user.isTotpEnabled()) {
      verifySecondFactor(user, request.totpCode(), now);
    }
    user.getLoginLock().reset();
    users.save(user);
    audit.record(AuditEvent.LOGIN_SUCCESS, user.getId(), email, null, null);
    return sessions.startSession(user);
  }

  public TokenResponse refresh(String refreshToken) {
    return sessions.rotate(refreshToken);
  }

  public void logout(String refreshToken) {
    AuthenticatedUser actor = AuthenticatedUser.require();
    revokedTokens.save(new RevokedAccessToken(actor.jti(), actor.tokenExpiresAt()));
    if (refreshToken != null) {
      sessions.revokeSession(refreshToken);
    }
    audit.record(AuditEvent.LOGOUT, null, null);
  }

  public MeResponse me() {
    UserAccount user = currentUser();
    return new MeResponse(
        user.getId(),
        user.getEmail(),
        user.getFullName(),
        TenantContext.currentCode().orElseThrow(),
        user.getEffectivePermissions(),
        user.getRoles().stream().map(Role::getName).sorted().toList(),
        user.landingPath(),
        user.isTotpEnabled());
  }

  /** E-postanın kayıtlı olup olmadığı yanıttan anlaşılmaz. */
  public void requestPasswordReset(String email) {
    String normalized = normalize(email);
    users
        .findByEmail(normalized)
        .filter(user -> user.getStatus() != UserStatus.DISABLED)
        .ifPresent(accountTokens::sendPasswordReset);
    audit.record(AuditEvent.PASSWORD_RESET_REQUESTED, null, normalized, normalized, null);
  }

  /** Hem davet kabulünde hem şifre sıfırlamada kullanılır. */
  @Transactional
  public void setPasswordWithToken(String rawToken, String newPassword) {
    PasswordPolicy.check(newPassword);
    Instant now = Instant.now();
    UserToken token =
        userTokens
            .findByTokenHash(SecureTokens.hash(rawToken))
            .filter(candidate -> candidate.isUsable(now))
            .orElseThrow(AuthService::invalidLink);
    UserAccount user =
        users
            .findById(token.getUserId())
            .filter(candidate -> candidate.getStatus() != UserStatus.DISABLED)
            .orElseThrow(AuthService::invalidLink);
    token.markUsed(now);
    user.setPassword(passwordEncoder.encode(newPassword), now);
    refreshTokens.revokeAllForUser(user.getId(), now);
    audit.record(AuditEvent.PASSWORD_SET, user.getId(), user.getEmail(), null, null);
  }

  @Transactional
  public void changePassword(String currentPassword, String newPassword) {
    UserAccount user = currentUser();
    if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PASSWORD_INCORRECT", "Mevcut şifre hatalı.");
    }
    PasswordPolicy.check(newPassword);
    Instant now = Instant.now();
    user.setPassword(passwordEncoder.encode(newPassword), now);
    refreshTokens.revokeAllForUser(user.getId(), now);
    audit.record(AuditEvent.PASSWORD_CHANGED, null, null);
  }

  @Transactional
  public TwoFactorSetupResponse startTwoFactorSetup() {
    UserAccount user = currentUser();
    if (user.isTotpEnabled()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TWO_FACTOR_ALREADY_ENABLED", "İki adımlı doğrulama zaten açık.");
    }
    String secret = Totp.newSecret();
    user.startTotpSetup(totpEncryptor.encrypt(secret));
    String label = URLEncoder.encode(user.getEmail(), StandardCharsets.UTF_8);
    return new TwoFactorSetupResponse(
        secret, "otpauth://totp/Blackrose:%s?secret=%s&issuer=Blackrose".formatted(label, secret));
  }

  @Transactional
  public void enableTwoFactor(String code) {
    UserAccount user = currentUser();
    if (user.getTotpSecret() == null || !consumeCode(user, code, Instant.now())) {
      throw invalidCode();
    }
    user.enableTotp();
    audit.record(AuditEvent.TWO_FACTOR_ENABLED, null, null);
  }

  @Transactional
  public void disableTwoFactor(String code) {
    UserAccount user = currentUser();
    if (!user.isTotpEnabled() || !consumeCode(user, code, Instant.now())) {
      throw invalidCode();
    }
    user.disableTotp();
    audit.record(AuditEvent.TWO_FACTOR_DISABLED, null, null);
  }

  private void verifySecondFactor(UserAccount user, String code, Instant now) {
    if (code == null || code.isBlank()) {
      throw new BusinessException(
          HttpStatus.UNAUTHORIZED, "TOTP_REQUIRED", "Doğrulama kodu gerekli.");
    }
    if (!consumeCode(user, code.trim(), now)) {
      user.getLoginLock().recordFailure(now);
      users.save(user);
      audit.record(AuditEvent.LOGIN_FAILED, user.getId(), user.getEmail(), null, "TOTP");
      throw new BusinessException(
          HttpStatus.UNAUTHORIZED, "TOTP_INVALID", "Doğrulama kodu hatalı.");
    }
  }

  private boolean consumeCode(UserAccount user, String code, Instant now) {
    OptionalLong step =
        Totp.matchingStep(
            totpEncryptor.decrypt(user.getTotpSecret()),
            code,
            now.getEpochSecond(),
            user.getTotpLastStep());
    step.ifPresent(user::consumeTotpStep);
    return step.isPresent();
  }

  private UserAccount currentUser() {
    return users.findById(AuthenticatedUser.require().id()).orElseThrow();
  }

  private BusinessException loginFailed(UserAccount user, String email) {
    audit.record(AuditEvent.LOGIN_FAILED, user != null ? user.getId() : null, email, null, null);
    return new BusinessException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "E-posta veya şifre hatalı ya da hesap geçici olarak kilitli.");
  }

  private static BusinessException invalidLink() {
    return new BusinessException(
        HttpStatus.BAD_REQUEST, "TOKEN_INVALID", "Bağlantı geçersiz veya süresi dolmuş.");
  }

  private static BusinessException invalidCode() {
    return new BusinessException(HttpStatus.BAD_REQUEST, "TOTP_INVALID", "Doğrulama kodu hatalı.");
  }

  static String normalize(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }
}
