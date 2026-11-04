package org.ece.blackrose.identity.security;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.domain.UserAccount;
import org.springframework.security.oauth2.jose.jws.JwsAlgorithms;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** İzinler token'a yazılmaz; her istekte veritabanından okunur. */
@Service
public class TokenService {

  public static final String CLAIM_TYPE = "typ";
  public static final String CLAIM_TENANT = "tenant";
  public static final String CLAIM_TOKEN_VERSION = "tv";
  public static final String TYPE_TENANT = "tenant-access";
  public static final String TYPE_SAAS = "saas-access";

  private final JwtEncoder encoder;
  private final SecurityProperties properties;

  public TokenService(JwtEncoder encoder, SecurityProperties properties) {
    this.encoder = encoder;
    this.properties = properties;
  }

  public String issueTenantAccessToken(UserAccount user, String tenantCode) {
    return encode(
        claims(user.getId(), properties.accessTokenTtl())
            .claim(CLAIM_TYPE, TYPE_TENANT)
            .claim(CLAIM_TENANT, tenantCode)
            .claim(CLAIM_TOKEN_VERSION, user.getTokenVersion())
            .build());
  }

  public String issueSaasToken(SaasAdmin admin) {
    return encode(
        claims(admin.getId(), properties.saasTokenTtl()).claim(CLAIM_TYPE, TYPE_SAAS).build());
  }

  public long accessTokenTtlSeconds() {
    return properties.accessTokenTtl().toSeconds();
  }

  public long saasTokenTtlSeconds() {
    return properties.saasTokenTtl().toSeconds();
  }

  private JwtClaimsSet.Builder claims(UUID subject, Duration ttl) {
    Instant now = Instant.now();
    return JwtClaimsSet.builder()
        .issuer(CryptoConfig.ISSUER)
        .subject(subject.toString())
        .id(UUID.randomUUID().toString())
        .issuedAt(now)
        .expiresAt(now.plus(ttl));
  }

  private String encode(JwtClaimsSet claims) {
    JwsHeader header = JwsHeader.with(MacAlgorithm.from(JwsAlgorithms.HS256)).build();
    return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
  }
}
