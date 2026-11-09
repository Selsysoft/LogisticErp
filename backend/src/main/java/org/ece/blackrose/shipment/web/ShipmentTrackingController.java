package org.ece.blackrose.shipment.web;

import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.shipment.service.ShipmentTrackingService;
import org.ece.blackrose.shipment.service.ShipmentTrackingService.LinkStatus;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Ofisin müşteriye verdiği takip bağlantısı. */
@RestController
@RequestMapping("/api/v1/shipment/shipments/{id}/tracking-link")
public class ShipmentTrackingController {

  /** Bağlantının tam hali yalnız oluşturma yanıtında döner. */
  public record CreatedLinkResponse(String path, Instant expiresAt) {}

  private final ShipmentTrackingService tracking;

  public ShipmentTrackingController(ShipmentTrackingService tracking) {
    this.tracking = tracking;
  }

  @GetMapping
  @PreAuthorize("hasAuthority('SHIPMENT_VIEW')")
  LinkStatus status(@PathVariable UUID id) {
    return tracking.status(id).orElse(new LinkStatus(false, null, null, null, 0, null));
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("hasAuthority('SHIPMENT_DISPATCH')")
  CreatedLinkResponse create(@PathVariable UUID id) {
    ShipmentTrackingService.CreatedLink link = tracking.create(id);
    String code = TenantContext.currentCode().orElseThrow();
    return new CreatedLinkResponse("/track/" + code + "/" + link.token(), link.expiresAt());
  }

  @DeleteMapping
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("hasAuthority('SHIPMENT_DISPATCH')")
  void revoke(@PathVariable UUID id) {
    tracking.revoke(id);
  }
}
