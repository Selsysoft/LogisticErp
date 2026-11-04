package org.ece.blackrose.common.error;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(BusinessException.class)
  ResponseEntity<ApiError> handleBusiness(BusinessException ex) {
    return ResponseEntity.status(ex.getStatus()).body(ApiError.of(ex.getCode(), ex.getMessage()));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<ApiError> handleConflict(DataIntegrityViolationException ex) {
    log.warn("Veri bütünlüğü ihlali", ex);
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ApiError.of("CONFLICT", "Kayıt mevcut verilerle çakışıyor."));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> handleUnexpected(Exception ex) {
    log.error("Beklenmeyen hata", ex);
    return ResponseEntity.internalServerError()
        .body(ApiError.of("INTERNAL_ERROR", "Beklenmeyen bir hata oluştu."));
  }

  @Override
  protected ResponseEntity<Object> handleMethodArgumentNotValid(
      MethodArgumentNotValidException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    List<String> details =
        ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .sorted()
            .toList();
    ApiError body = ApiError.of("VALIDATION_ERROR", "Girilen veriler geçersiz.", details);
    return ResponseEntity.badRequest().headers(headers).body(body);
  }

  /** Spring MVC'nin kendi hatalarını da standart gövdeye çevirir. */
  @Override
  protected ResponseEntity<Object> handleExceptionInternal(
      Exception ex, Object body, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
    HttpStatus resolved = HttpStatus.resolve(status.value());
    String code = resolved != null ? resolved.name() : "HTTP_" + status.value();
    return ResponseEntity.status(status)
        .headers(headers)
        .body(ApiError.of(code, "İstek işlenemedi."));
  }
}
