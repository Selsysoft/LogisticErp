package org.ece.blackrose.tenant;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class SubdomainTenantResolver implements TenantResolver {

  private final String suffix;

  public SubdomainTenantResolver(TenantProperties properties) {
    this.suffix = "." + properties.baseDomain().toLowerCase(Locale.ROOT);
  }

  @Override
  public Optional<String> resolve(HttpServletRequest request) {
    String host = request.getServerName().toLowerCase(Locale.ROOT);
    if (!host.endsWith(suffix)) {
      return Optional.empty();
    }
    String label = host.substring(0, host.length() - suffix.length());
    return label.isEmpty() || label.contains(".") ? Optional.empty() : Optional.of(label);
  }
}
