package org.ece.blackrose.identity.service;

import java.time.Instant;
import java.util.Optional;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasAdminRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.security.TokenService;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
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

  public SaasAuthService(
      SaasAdminRepository admins,
      PasswordEncoder passwordEncoder,
      TokenService tokens,
      SecurityProperties properties,
      AuditService audit) {
    this.admins = admins;
    this.passwordEncoder = passwordEncoder;
    this.tokens = tokens;
    this.properties = properties;
    this.audit = audit;
  }

  public TokenResponse login(String rawEmail, String password) {
    String email = AuthService.normalize(rawEmail);
    Instant now = Instant.now();
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
    admin.getLoginLock().reset();
    admins.save(admin);
    audit.record(AuditEvent.SAAS_LOGIN_SUCCESS, admin.getId(), email, null, null);
    return new TokenResponse(tokens.issueSaasToken(admin), null, tokens.saasTokenTtlSeconds());
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
