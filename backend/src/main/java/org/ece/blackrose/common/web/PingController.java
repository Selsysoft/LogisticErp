package org.ece.blackrose.common.web;

import java.util.Map;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Yük dengeleyici ve dağıtım betikleri için hazır olma ucu. Sunucu istek almaya açılış adımları
 * (ilk SaaS yöneticisi, firma migration'ları) bitmeden başlar; o arada 503 döner, böylece trafik
 * hazır olmayan örneğe gönderilmez.
 */
@RestController
public class PingController {

  private final ApplicationAvailability availability;

  public PingController(ApplicationAvailability availability) {
    this.availability = availability;
  }

  @GetMapping("/api/v1/ping")
  ResponseEntity<Map<String, String>> ping() {
    if (availability.getReadinessState() != ReadinessState.ACCEPTING_TRAFFIC) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("status", "starting"));
    }
    return ResponseEntity.ok(Map.of("status", "ok"));
  }
}
