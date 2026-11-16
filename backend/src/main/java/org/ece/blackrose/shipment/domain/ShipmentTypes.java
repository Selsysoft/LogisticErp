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

  /** Sefer giderinin cari durumu: OPEN yazılmadı, POSTED cariye yazıldı, REVERSED ters çevrildi. */
  public enum TripCostStatus {
    OPEN,
    POSTED,
    REVERSED
  }

  /** Etabın nakliye türü (ZTO "Sevk Nakliye" / "Gemi Nakliye"). */
  public enum TransportMode {
    ROAD,
    SEA,
    RAIL,
    AIR
  }
}
