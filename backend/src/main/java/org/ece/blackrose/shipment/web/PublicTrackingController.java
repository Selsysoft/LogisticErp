package org.ece.blackrose.shipment.web;

import org.ece.blackrose.shipment.service.ShipmentTrackingService;
import org.ece.blackrose.shipment.service.ShipmentTrackingService.PublicView;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Oturum gerektirmeyen takip ucu. Firma yoldaki koddan çözülür (PublicTrackingTenantResolver);
 * istekler IP başına sınırlanır (AuthRateLimitFilter).
 */
@RestController
@RequestMapping("/api/v1/public/tracking")
public class PublicTrackingController {

  public static final String PATH = "/api/v1/public/tracking/";

  private final ShipmentTrackingService tracking;

  public PublicTrackingController(ShipmentTrackingService tracking) {
    this.tracking = tracking;
  }

  /** Yanıt saklanmaz ve arama motorlarına kapalıdır. */
  @GetMapping("/{tenant}/{token}")
  ResponseEntity<PublicView> view(@PathVariable String tenant, @PathVariable String token) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .header("X-Robots-Tag", "noindex, nofollow")
        .body(tracking.view(token));
  }
}
