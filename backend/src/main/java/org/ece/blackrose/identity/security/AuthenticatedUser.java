package org.ece.blackrose.identity.security;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public record AuthenticatedUser(UUID id, String email, UUID jti, Instant tokenExpiresAt) {

  public static Optional<AuthenticatedUser> current() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user
        ? Optional.of(user)
        : Optional.empty();
  }

  public static AuthenticatedUser require() {
    return current().orElseThrow(() -> new IllegalStateException("Oturum bulunamadı"));
  }
}
