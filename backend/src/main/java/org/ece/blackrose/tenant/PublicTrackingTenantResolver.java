package org.ece.blackrose.tenant;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Herkese açık takip bağlantısında firma, yoldaki ilk bölümden okunur: /tracking/{firma}/{anahtar}.
 */
@Component
public class PublicTrackingTenantResolver implements TenantResolver {

  static final String PREFIX = "/api/v1/public/tracking/";

  @Override
  public Optional<String> resolve(HttpServletRequest request) {
    String path = request.getRequestURI();
    if (!path.startsWith(PREFIX)) {
      return Optional.empty();
    }
    String rest = path.substring(PREFIX.length());
    int slash = rest.indexOf('/');
    if (slash <= 0) {
      return Optional.empty();
    }
    return Optional.of(rest.substring(0, slash).toLowerCase(Locale.ROOT));
  }
}
