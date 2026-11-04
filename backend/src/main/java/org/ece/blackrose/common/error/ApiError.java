package org.ece.blackrose.common.error;

import java.util.List;
import org.slf4j.MDC;

public record ApiError(String code, String message, List<String> details, String traceId) {

  public static ApiError of(String code, String message, List<String> details) {
    return new ApiError(code, message, details, MDC.get("traceId"));
  }

  public static ApiError of(String code, String message) {
    return of(code, message, List.of());
  }
}
