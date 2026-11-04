package org.ece.blackrose.identity.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;
import java.util.Optional;
import org.ece.blackrose.tenant.TenantResolver;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** Tek domain kullanımında giriş formundaki firma kodu. Yalnız kimlik uçlarında geçerlidir. */
@Component
public class LoginFormTenantResolver implements TenantResolver {

  public static final String HEADER = "X-Tenant-Code";

  @Override
  public Optional<String> resolve(HttpServletRequest request) {
    String value = request.getHeader(HEADER);
    if (!request.getRequestURI().startsWith("/api/v1/auth/") || !StringUtils.hasText(value)) {
      return Optional.empty();
    }
    return Optional.of(value.trim().toLowerCase(Locale.ROOT));
  }
}
