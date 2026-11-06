package org.ece.blackrose.identity.service;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;
import java.util.OptionalLong;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.domain.SaasRevokedToken;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasAdminRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasRevokedTokenRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.security.TokenService;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.ece.blackrose.identity.web.IdentityDtos.TwoFactorSetupResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** Platform yöneticisi girişi. İlk yönetici açılışta ortam değişkenlerinden oluşturulur. */
@Service
public class SaasAuthService implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(SaasAuthService.class);
  private static final String DUMMY_HASH =
      "$2a$10$7EqJtq98hPqEX7fNZaFWoOa8wS7Yy0N8m0n4m3RzQ0Xn0E6m1u0pC";

  private final SaasAdminRepository admins;
  private final PasswordEncoder passwordEncoder;
  private final TokenService tokens;
  private final SecurityProperties properties;
  private final AuditService audit;
  private final TextEncryptor totpEncryptor;
  private final SaasRevokedTokenRepository revokedTokens;

  public SaasAuthService(
      SaasAdminRepository admins,
      PasswordEncoder passwordEncoder,
      TokenService tokens,
      SecurityProperties properties,
      AuditService audit,
      TextEncryptor totpEncryptor,
      SaasRevokedTokenRepository revokedTokens) {
    this.totpEncryptor = totpEncryptor;
    this.revokedTokens = revokedTokens;
    this.admins = admins;
    this.passwordEncoder = passwordEncoder;
    this.tokens = tokens;
    this.properties = properties;
    this.audit = audit;
  }

  /** Erişim token'ını süresi dolmadan geçersiz kılar. */
  public void logout() {
    AuthenticatedUser actor = AuthenticatedUser.require();
    revokedTokens.save(new SaasRevokedToken(actor.jti(), actor.tokenExpiresAt()));
    audit.record(AuditEvent.SAAS_LOGOUT, actor.id(), actor.email(), null, null);
  }

  public TokenResponse login(String rawEmail, String password, String totpCode) {
    Instant now = Instant.now();
    SaasAdmin admin = authenticate(rawEmail, password, now);
    if (admin.isTotpEnabled()) {
      verifySecondFactor(admin, totpCode, now);
    } else if (properties.saasTwoFactorRequired()) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN,
          "TWO_FACTOR_SETUP_REQUIRED",
          "Giriş için iki adımlı doğrulamayı kurmanız gerekiyor.");
    }
    return completeLogin(admin);
  }

  /** Parola doğruysa yeni gizli anahtar üretir. Doğrulanana kadar 2FA açılmaz. */
  public TwoFactorSetupResponse startTwoFactorSetup(String rawEmail, String password) {
    SaasAdmin admin = authenticate(rawEmail, password, Instant.now());
    if (admin.isTotpEnabled()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TWO_FACTOR_ALREADY_ENABLED", "İki adımlı doğrulama zaten açık.");
    }
    String secret = Totp.newSecret();
    admin.startTotpSetup(totpEncryptor.encrypt(secret));
    admins.save(admin);
    String label = URLEncoder.encode(admin.getEmail(), StandardCharsets.UTF_8);
    return new TwoFactorSetupResponse(
        secret,
        "otpauth://totp/Blackrose%%20SaaS:%s?secret=%s&issuer=Blackrose%%20SaaS"
            .formatted(label, secret));
  }

  /** Aynı kod ikinci kez kullanılamadığı için kurulum oturumu da başlatır. */
  public TokenResponse enableTwoFactor(String rawEmail, String password, String code) {
    Instant now = Instant.now();
    SaasAdmin admin = authenticate(rawEmail, password, now);
    if (admin.isTotpEnabled()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TWO_FACTOR_ALREADY_ENABLED", "İki adımlı doğrulama zaten açık.");
    }
    if (admin.getTotpSecret() == null) {
      throw invalidCode();
    }
    verifySecondFactor(admin, code, now);
    admin.enableTotp();
    audit.record(AuditEvent.TWO_FACTOR_ENABLED, admin.getId(), admin.getEmail(), null, "SAAS");
    return completeLogin(admin);
  }

  private SaasAdmin authenticate(String rawEmail, String password, Instant now) {
    String email = AuthService.normalize(rawEmail);
    Optional<SaasAdmin> found = admins.findByEmail(email);
    if (found.isEmpty()) {
      passwordEncoder.matches(password, DUMMY_HASH);
      throw failed(null, email);
    }
    SaasAdmin admin = found.get();
    if (admin.getLoginLock().isLocked(now)
        || !admin.isActive()
        || !passwordEncoder.matches(password, admin.getPasswordHash())) {
      admin.getLoginLock().recordFailure(now);
      admins.save(admin);
      throw failed(admin, email);
    }
    return admin;
  }

  private TokenResponse completeLogin(SaasAdmin admin) {
    admin.getLoginLock().reset();
    admins.save(admin);
    audit.record(AuditEvent.SAAS_LOGIN_SUCCESS, admin.getId(), admin.getEmail(), null, null);
    return new TokenResponse(tokens.issueSaasToken(admin), null, tokens.saasTokenTtlSeconds());
  }

  private void verifySecondFactor(SaasAdmin admin, String code, Instant now) {
    if (code == null || code.isBlank()) {
      throw new BusinessException(
          HttpStatus.UNAUTHORIZED, "TOTP_REQUIRED", "Doğrulama kodu gerekli.");
    }
    OptionalLong step =
        Totp.matchingStep(
            totpEncryptor.decrypt(admin.getTotpSecret()),
            code.trim(),
            now.getEpochSecond(),
            admin.getTotpLastStep());
    if (step.isEmpty()) {
      admin.getLoginLock().recordFailure(now);
      admins.save(admin);
      audit.record(AuditEvent.SAAS_LOGIN_FAILED, admin.getId(), admin.getEmail(), null, "TOTP");
      throw invalidCode();
    }
    admin.consumeTotpStep(step.getAsLong());
  }

  private static BusinessException invalidCode() {
    return new BusinessException(HttpStatus.UNAUTHORIZED, "TOTP_INVALID", "Doğrulama kodu hatalı.");
  }

  @Override
  public void run(ApplicationArguments args) {
    String email = properties.bootstrapAdminEmail();
    String password = properties.bootstrapAdminPassword();
    if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
      return;
    }
    String normalized = AuthService.normalize(email);
    if (admins.findByEmail(normalized).isEmpty()) {
      admins.save(new SaasAdmin(normalized, passwordEncoder.encode(password)));
      log.info("İlk SaaS yöneticisi oluşturuldu");
    }
  }

  private BusinessException failed(SaasAdmin admin, String email) {
    audit.record(
        AuditEvent.SAAS_LOGIN_FAILED, admin != null ? admin.getId() : null, email, null, null);
    return new BusinessException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "E-posta veya şifre hatalı ya da hesap geçici olarak kilitli.");
  }
}
