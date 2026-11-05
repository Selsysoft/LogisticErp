package org.ece.blackrose.shipment.service;

import java.util.UUID;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.springframework.stereotype.Component;

/** Sefere eklenen dosyalar: teslim imzası, fotoğraf ve diğer belgeler. */
@Component
public class ShipmentFilePolicy implements FileOwnerPolicy {

  private final ShipmentRepository shipments;

  public ShipmentFilePolicy(ShipmentRepository shipments) {
    this.shipments = shipments;
  }

  @Override
  public String ownerType() {
    return "SHIPMENT";
  }

  @Override
  public String viewPermission() {
    return "SHIPMENT_VIEW";
  }

  @Override
  public String editPermission() {
    return "SHIPMENT_DISPATCH";
  }

  @Override
  public boolean exists(UUID ownerId) {
    return shipments.existsById(ownerId);
  }
}
