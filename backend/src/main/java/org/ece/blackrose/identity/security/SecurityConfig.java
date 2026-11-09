package org.ece.blackrose.identity.security;

import org.ece.blackrose.common.web.ApiErrorWriter;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  /**
   * Prometheus ucu yalnız izleme token'ıyla açılır (`METRICS_TOKEN`). SaaS yöneticisi token'ı bir
   * saatte dolduğu için izleme sistemine uygun değildir.
   */
  @Bean
  @Order(1)
  SecurityFilterChain metricsFilterChain(
      HttpSecurity http,
      @Value("${app.security.metrics-token:}") String metricsToken,
      AuthenticationEntryPoint entryPoint)
      throws Exception {
    return http.securityMatcher("/actuator/prometheus")
        .csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .addFilterBefore(new MetricsTokenFilter(metricsToken), AnonymousAuthenticationFilter.class)
        .authorizeHttpRequests(auth -> auth.anyRequest().hasAuthority(MetricsTokenFilter.AUTHORITY))
        .exceptionHandling(errors -> errors.authenticationEntryPoint(entryPoint))
        .build();
  }

  @Bean
  @Order(2)
  SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      JwtPrincipalConverter converter,
      AuthenticationEntryPoint entryPoint,
      AccessDeniedHandler deniedHandler)
      throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth ->
                auth.requestMatchers(
                        "/actuator/health/**",
                        "/actuator/info",
                        "/api/v1/ping",
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/swagger-ui.html")
                    .permitAll()
                    .requestMatchers(
                        HttpMethod.POST,
                        "/api/v1/auth/login",
                        "/api/v1/auth/refresh",
                        "/api/v1/auth/password-reset/**",
                        "/api/v1/admin/auth/login",
                        "/api/v1/admin/auth/2fa/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/public/tracking/**")
                    .permitAll()
                    .requestMatchers("/actuator/**", "/api/v1/admin/**")
                    .hasAuthority(JwtPrincipalConverter.SAAS_ADMIN_AUTHORITY)
                    .anyRequest()
                    .authenticated())
        .oauth2ResourceServer(
            oauth ->
                oauth
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                    .authenticationEntryPoint(entryPoint)
                    .accessDeniedHandler(deniedHandler))
        .exceptionHandling(
            errors ->
                errors.authenticationEntryPoint(entryPoint).accessDeniedHandler(deniedHandler))
        .build();
  }

  @Bean
  AuthenticationEntryPoint authenticationEntryPoint(ApiErrorWriter errors) {
    return (request, response, ex) ->
        errors.write(response, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Oturum geçersiz.");
  }

  @Bean
  AccessDeniedHandler accessDeniedHandler(ApiErrorWriter errors, AuditService audit) {
    return (request, response, ex) -> {
      audit.record(AuditEvent.ACCESS_DENIED, request.getRequestURI(), null);
      errors.write(response, HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Bu işlem için yetkiniz yok.");
    };
  }
}
