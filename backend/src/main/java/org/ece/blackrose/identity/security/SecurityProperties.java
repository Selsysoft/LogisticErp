package org.ece.blackrose.identity.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.security")
public record SecurityProperties(
    String jwtSecret,
    String totpKey,
    Duration accessTokenTtl,
    Duration refreshTokenTtl,
    Duration saasTokenTtl,
    String frontendBaseUrl,
    String mailFrom,
    String bootstrapAdminEmail,
    String bootstrapAdminPassword,
    boolean saasTwoFactorRequired) {

  private static final int MIN_SECRET_BYTES = 32;

  public SecurityProperties {
    requireSecret("JWT_SECRET", jwtSecret);
    requireSecret("TOTP_ENCRYPTION_KEY", totpKey);
  }

  private static void requireSecret(String name, String value) {
    if (value == null || value.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
      throw new IllegalStateException(name + " en az " + MIN_SECRET_BYTES + " bayt olmalıdır.");
    }
  }
}
