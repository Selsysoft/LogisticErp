package org.ece.blackrose.identity.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.OptionalLong;
import org.ece.blackrose.common.web.ApiErrorWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Oturum gerektirmeyen kimlik, takip ve webhook uçlarını IP başına sınırlar. Hesap kilidi tek
 * hesabı korur; bu filtre çok hesaba yayılan denemeleri ve e-posta tetikleyen istekleri yavaşlatır.
 * Firma çözümlemesinden önce çalışır, böylece firma kodu taraması da sayılır.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthRateLimitFilter extends OncePerRequestFilter {

  private static final Logger log = LoggerFactory.getLogger(AuthRateLimitFilter.class);
  private static final long WINDOW_MILLIS = Duration.ofMinutes(1).toMillis();

  private final RateLimitProperties limits;
  private final ApiErrorWriter errors;
  private final FixedWindowLimiter limiter =
      new FixedWindowLimiter(WINDOW_MILLIS, System::currentTimeMillis);

  public AuthRateLimitFilter(RateLimitProperties limits, ApiErrorWriter errors) {
    this.limits = limits;
    this.errors = errors;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String group = group(request.getRequestURI());
    if (group == null) {
      return true;
    }
    // Takip bağlantısı GET ile açılır; anahtar taramasını yavaşlatmak için o da sayılır.
    return !"POST".equals(request.getMethod()) && !"tracking".equals(group);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String group = group(request.getRequestURI());
    String ip = request.getRemoteAddr();
    OptionalLong retryMillis = limiter.tryAcquire(group + "|" + ip, limit(group));
    if (retryMillis.isEmpty()) {
      chain.doFilter(request, response);
      return;
    }
    log.warn("İstek sınırı aşıldı: {} {}", group, ip);
    long retrySeconds = Math.max(1, (retryMillis.getAsLong() + 999) / 1000);
    response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retrySeconds));
    errors.write(
        response,
        HttpStatus.TOO_MANY_REQUESTS,
        "TOO_MANY_REQUESTS",
        "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.");
  }

  private int limit(String group) {
    return switch (group) {
      case "login" -> limits.loginPerMinute();
      case "reset" -> limits.passwordResetPerMinute();
      case "tracking" -> limits.trackingPerMinute();
      case "webhook" -> limits.webhookPerMinute();
      default -> limits.refreshPerMinute();
    };
  }

  private static String group(String path) {
    if (path.equals("/api/v1/auth/login") || path.startsWith("/api/v1/admin/auth/")) {
      return "login";
    }
    if (path.startsWith("/api/v1/auth/password-reset/")) {
      return "reset";
    }
    if (path.startsWith("/api/v1/public/tracking/")) {
      return "tracking";
    }
    // İmza doğrulanmadan önce sayılır; sağlayıcı tek IP'den gönderir, sınır onun yükünü karşılar.
    if (path.startsWith("/api/v1/webhooks/")) {
      return "webhook";
    }
    return path.equals("/api/v1/auth/refresh") ? "refresh" : null;
  }
}
