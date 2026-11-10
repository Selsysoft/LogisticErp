package org.ece.blackrose.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.ece.blackrose.common.web.ApiErrorWriter;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Tenant verisi taşıyan her API isteğini etkin bir tenant şemasına bağlar. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class TenantFilter extends OncePerRequestFilter {

  private final List<TenantResolver> resolvers;
  private final TenantRepository tenants;
  private final ApiErrorWriter errors;

  public TenantFilter(
      List<TenantResolver> resolvers, TenantRepository tenants, ApiErrorWriter errors) {
    this.resolvers = resolvers;
    this.tenants = tenants;
    this.errors = errors;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    return !path.startsWith("/api/v1/")
        || path.equals("/api/v1/ping")
        || path.startsWith("/api/v1/webhooks/")
        || path.startsWith("/api/v1/admin/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    List<String> codes =
        resolvers.stream()
            .map(resolver -> resolver.resolve(request))
            .flatMap(Optional::stream)
            .distinct()
            .toList();
    if (codes.size() > 1) {
      errors.write(response, HttpStatus.FORBIDDEN, "TENANT_MISMATCH", "Firma bilgisi uyuşmuyor.");
      return;
    }
    if (codes.isEmpty()) {
      if (request.getHeader(HttpHeaders.AUTHORIZATION) != null) {
        errors.write(response, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Oturum geçersiz.");
      } else {
        errors.write(response, HttpStatus.BAD_REQUEST, "TENANT_REQUIRED", "Firma belirlenemedi.");
      }
      return;
    }
    Optional<Tenant> tenant = tenants.findByCode(codes.get(0));
    if (tenant.isEmpty()) {
      errors.write(response, HttpStatus.NOT_FOUND, "TENANT_NOT_FOUND", "Firma bulunamadı.");
      return;
    }
    if (tenant.get().getStatus() != TenantStatus.ACTIVE) {
      errors.write(response, HttpStatus.FORBIDDEN, "TENANT_NOT_ACTIVE", "Firma etkin değil.");
      return;
    }
    TenantContext.set(tenant.get().getCode(), tenant.get().getSchemaName());
    MDC.put("tenant", tenant.get().getCode());
    try {
      chain.doFilter(request, response);
    } finally {
      TenantContext.clear();
      MDC.remove("tenant");
    }
  }
}
