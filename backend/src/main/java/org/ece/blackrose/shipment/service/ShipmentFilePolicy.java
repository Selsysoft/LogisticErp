package org.ece.blackrose.shipment.service;

import java.util.UUID;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.springframework.stereotype.Component;

/** Sefere eklenen dosyalar: teslim imzası, fotoğraf ve diğer belgeler. */
@Component
public class ShipmentFilePolicy implements FileOwnerPolicy {

  private final ShipmentRepository shipments;
  private final BranchScopeService scope;

  public ShipmentFilePolicy(ShipmentRepository shipments, BranchScopeService scope) {
    this.shipments = shipments;
    this.scope = scope;
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

  /** Seferin iş yeri kapsamda olmalı (403 {@code BRANCH_OUT_OF_SCOPE}). */
  @Override
  public void requireAccess(UUID ownerId) {
    shipments.findById(ownerId).ifPresent(shipment -> scope.requireVisible(shipment.getBranchId()));
  }
}
