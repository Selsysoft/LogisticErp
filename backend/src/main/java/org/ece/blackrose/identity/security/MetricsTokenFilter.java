package org.ece.blackrose.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * İzleme sisteminin (Prometheus) sabit token'ını denetler. Token tanımlı değilse uç kapalıdır.
 * Bilerek bean değildir; yalnız ölçüm zincirine eklenir, bütün isteklere uygulanmaz.
 */
class MetricsTokenFilter extends OncePerRequestFilter {

  static final String AUTHORITY = "METRICS_SCRAPE";
  private static final String PREFIX = "Bearer ";

  private final byte[] expected;

  MetricsTokenFilter(String token) {
    if (!token.isEmpty() && token.getBytes(StandardCharsets.UTF_8).length < 32) {
      throw new IllegalStateException("METRICS_TOKEN en az 32 bayt olmalıdır.");
    }
    this.expected = token.isEmpty() ? null : token.getBytes(StandardCharsets.UTF_8);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (expected != null && header != null && header.startsWith(PREFIX)) {
      byte[] given = header.substring(PREFIX.length()).getBytes(StandardCharsets.UTF_8);
      if (MessageDigest.isEqual(expected, given)) {
        SecurityContextHolder.getContext()
            .setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                    "metrics", null, List.of(new SimpleGrantedAuthority(AUTHORITY))));
      }
    }
    chain.doFilter(request, response);
  }
}
