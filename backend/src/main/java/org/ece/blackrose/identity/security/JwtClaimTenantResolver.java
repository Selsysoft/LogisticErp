package org.ece.blackrose.identity.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.ece.blackrose.tenant.TenantResolver;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

/** Yalnız imzası geçerli token'daki tenant claim'ine güvenir. */
@Component
public class JwtClaimTenantResolver implements TenantResolver {

  private static final String BEARER_PREFIX = "Bearer ";

  private final JwtDecoder decoder;

  public JwtClaimTenantResolver(JwtDecoder decoder) {
    this.decoder = decoder;
  }

  @Override
  public Optional<String> resolve(HttpServletRequest request) {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.startsWith(BEARER_PREFIX)) {
      return Optional.empty();
    }
    try {
      return Optional.ofNullable(
          decoder
              .decode(header.substring(BEARER_PREFIX.length()))
              .getClaimAsString(TokenService.CLAIM_TENANT));
    } catch (JwtException ex) {
      return Optional.empty();
    }
  }
}
