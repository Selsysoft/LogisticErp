package org.ece.blackrose.identity.web;

import jakarta.servlet.http.HttpServletRequest;
import org.ece.blackrose.common.error.ApiError;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * @PreAuthorize reddi controller içinde oluşur; genel 500 işleyicisinden önce yakalanmalıdır.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityExceptionHandler {

  private final AuditService audit;

  public SecurityExceptionHandler(AuditService audit) {
    this.audit = audit;
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ApiError> handleDenied(AccessDeniedException ex, HttpServletRequest request) {
    audit.record(AuditEvent.ACCESS_DENIED, request.getRequestURI(), null);
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ApiError.of("ACCESS_DENIED", "Bu işlem için yetkiniz yok."));
  }
}
