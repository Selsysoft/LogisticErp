package org.ece.blackrose.identity.security;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Oturumdaki kullanıcı. {@code allowedBranchIds} istek başına bir kez okunur: {@code null} = tüm iş
 * yerleri (ALL; SaaS yöneticisi de), dolu = yalnız bu iş yerleri (LIMITED).
 */
public record AuthenticatedUser(
    UUID id, String email, UUID jti, Instant tokenExpiresAt, Set<UUID> allowedBranchIds) {

  public AuthenticatedUser {
    allowedBranchIds = allowedBranchIds == null ? null : Set.copyOf(allowedBranchIds);
  }

  public AuthenticatedUser(UUID id, String email, UUID jti, Instant tokenExpiresAt) {
    this(id, email, jti, tokenExpiresAt, null);
  }

  public boolean branchLimited() {
    return allowedBranchIds != null;
  }

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
