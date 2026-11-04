package org.ece.blackrose.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.ece.blackrose.common.web.ApiErrorWriter;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Tenant verisi taşıyan her API isteğini etkin bir tenant şemasına bağlar. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class TenantFilter extends OncePerRequestFilter {

  private final TenantResolver resolver;
  private final TenantRepository tenants;
  private final ApiErrorWriter errors;

  public TenantFilter(TenantResolver resolver, TenantRepository tenants, ApiErrorWriter errors) {
    this.resolver = resolver;
    this.tenants = tenants;
    this.errors = errors;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    return !path.startsWith("/api/v1/")
        || path.equals("/api/v1/ping")
        || path.startsWith("/api/v1/admin/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    Optional<String> code = resolver.resolve(request);
    if (code.isEmpty()) {
      errors.write(response, HttpStatus.BAD_REQUEST, "TENANT_REQUIRED", "Firma belirlenemedi.");
      return;
    }
    Optional<Tenant> tenant = tenants.findByCode(code.get());
    if (tenant.isEmpty()) {
      errors.write(response, HttpStatus.NOT_FOUND, "TENANT_NOT_FOUND", "Firma bulunamadı.");
      return;
    }
    if (tenant.get().getStatus() != TenantStatus.ACTIVE) {
      errors.write(response, HttpStatus.FORBIDDEN, "TENANT_NOT_ACTIVE", "Firma etkin değil.");
      return;
    }
    TenantContext.setSchema(tenant.get().getSchemaName());
    MDC.put("tenant", tenant.get().getCode());
    try {
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
      MDC.remove("tenant");
    }
  }
}
