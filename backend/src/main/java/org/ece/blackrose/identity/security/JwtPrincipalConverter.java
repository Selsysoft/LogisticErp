package org.ece.blackrose.identity.security;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.RevokedAccessTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasAdminRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasRevokedTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.saas.service.PresenceTracker;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Her istekte kullanıcıyı ve izinleri veritabanından okur. Rol değişikliği, hesap kapatma ve çıkış
 * bu sayede token süresini beklemeden etkili olur.
 */
@Component
public class JwtPrincipalConverter implements Converter<Jwt, AbstractAuthenticationToken> {

  public static final String SAAS_ADMIN_AUTHORITY = "SAAS_ADMIN";

  private final UserAccountRepository users;
  private final SaasAdminRepository admins;
  private final RevokedAccessTokenRepository revokedTokens;
  private final SaasRevokedTokenRepository saasRevokedTokens;
  private final PresenceTracker presence;

  public JwtPrincipalConverter(
      UserAccountRepository users,
      SaasAdminRepository admins,
      RevokedAccessTokenRepository revokedTokens,
      SaasRevokedTokenRepository saasRevokedTokens,
      PresenceTracker presence) {
    this.saasRevokedTokens = saasRevokedTokens;
    this.presence = presence;
    this.users = users;
    this.admins = admins;
    this.revokedTokens = revokedTokens;
  }

  @Override
  public AbstractAuthenticationToken convert(Jwt jwt) {
    String type = jwt.getClaimAsString(TokenService.CLAIM_TYPE);
    if (TokenService.TYPE_SAAS.equals(type)) {
      return saasAuthentication(jwt);
    }
    if (TokenService.TYPE_TENANT.equals(type)) {
      return tenantAuthentication(jwt);
    }
    throw invalid();
  }

  private AbstractAuthenticationToken saasAuthentication(Jwt jwt) {
    if (TenantContext.currentSchema().isPresent()
        || saasRevokedTokens.existsById(UUID.fromString(jwt.getId()))) {
      throw invalid();
    }
    SaasAdmin admin =
        admins
            .findById(UUID.fromString(jwt.getSubject()))
            .filter(SaasAdmin::isActive)
            .orElseThrow(JwtPrincipalConverter::invalid);
    return authentication(
        new AuthenticatedUser(
            admin.getId(), admin.getEmail(), UUID.fromString(jwt.getId()), jwt.getExpiresAt()),
        List.of(SAAS_ADMIN_AUTHORITY));
  }

  private AbstractAuthenticationToken tenantAuthentication(Jwt jwt) {
    String claimedTenant = jwt.getClaimAsString(TokenService.CLAIM_TENANT);
    if (!TenantContext.currentCode().filter(claimedTenant::equals).isPresent()) {
      throw invalid();
    }
    UUID jti = UUID.fromString(jwt.getId());
    if (revokedTokens.existsById(jti)) {
      throw invalid();
    }
    UserAccount user =
        users
            .findById(UUID.fromString(jwt.getSubject()))
            .filter(candidate -> candidate.getStatus() == UserStatus.ACTIVE)
            .filter(candidate -> candidate.getTokenVersion() == tokenVersion(jwt))
            .orElseThrow(JwtPrincipalConverter::invalid);
    presence.touch(claimedTenant, user.getId());
    List<String> authorities = user.getEffectivePermissions().stream().map(Enum::name).toList();
    return authentication(
        new AuthenticatedUser(user.getId(), user.getEmail(), jti, jwt.getExpiresAt()), authorities);
  }

  private static int tokenVersion(Jwt jwt) {
    Number version = jwt.getClaim(TokenService.CLAIM_TOKEN_VERSION);
    if (version == null) {
      throw invalid();
    }
    return version.intValue();
  }

  private static AbstractAuthenticationToken authentication(
      AuthenticatedUser principal, List<String> authorities) {
    return new UsernamePasswordAuthenticationToken(
        principal, null, authorities.stream().map(SimpleGrantedAuthority::new).toList());
  }

  private static BadCredentialsException invalid() {
    return new BadCredentialsException("Geçersiz token");
  }
}
