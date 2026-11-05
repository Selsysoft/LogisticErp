package org.ece.blackrose.saas.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.service.AuditService;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Her SaaS yöneticisi çağrısı denetim günlüğüne yazılır; sorgu metni yazılmaz. */
@Configuration
public class AdminAccessAudit implements WebMvcConfigurer {

  private final AuditService audit;

  public AdminAccessAudit(AuditService audit) {
    this.audit = audit;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              @Override
              public void afterCompletion(
                  HttpServletRequest request,
                  HttpServletResponse response,
                  Object handler,
                  Exception ex) {
                if (AuthenticatedUser.current().isPresent()) {
                  audit.record(
                      AuditEvent.SAAS_ADMIN_ACCESS,
                      request.getMethod() + " " + request.getRequestURI(),
                      String.valueOf(response.getStatus()));
                }
              }
            })
        .addPathPatterns("/api/v1/admin/**");
  }
}
