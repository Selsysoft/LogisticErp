package org.ece.blackrose.shipment.domain;

public final class ShipmentTypes {

  private ShipmentTypes() {}

  public enum ShipmentStatus {
    QUOTED,
    PLANNED,
    LOADED,
    IN_TRANSIT,
    DELIVERED,
    INVOICED,
    CLOSED,
    CANCELLED
  }

  public enum EventType {
    STATUS,
    EXCEPTION,
    NOTE
  }

  public enum DocumentType {
    CMR,
    WAYBILL
  }

  public enum DocumentStatus {
    DRAFT,
    ISSUED
  }

  public enum InvoiceStatus {
    ISSUED,
    CANCELLED
  }

  public enum CostKind {
    FUEL,
    TOLL,
    PER_DIEM,
    SUBCONTRACTOR,
    BORDER_FEE,
    OTHER
  }
}
