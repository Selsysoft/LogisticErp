package org.ece.blackrose.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.ece.blackrose.common.web.ApiErrorWriter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/** Faz 1'e kadar admin uçlarını korur. Anahtar tanımlı değilse tüm admin istekleri reddedilir. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AdminApiKeyFilter extends OncePerRequestFilter {

  private final byte[] expectedKey;
  private final ApiErrorWriter errors;

  public AdminApiKeyFilter(TenantProperties properties, ApiErrorWriter errors) {
    String key = properties.adminApiKey();
    this.expectedKey = StringUtils.hasText(key) ? key.getBytes(StandardCharsets.UTF_8) : null;
    this.errors = errors;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/api/v1/admin/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String provided = request.getHeader("X-Admin-Key");
    boolean allowed =
        expectedKey != null
            && provided != null
            && MessageDigest.isEqual(expectedKey, provided.getBytes(StandardCharsets.UTF_8));
    if (!allowed) {
      errors.write(response, HttpStatus.UNAUTHORIZED, "ADMIN_KEY_INVALID", "Yetkisiz istek.");
      return;
    }
    chain.doFilter(request, response);
  }
}
