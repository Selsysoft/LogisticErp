package org.ece.blackrose.fleet.domain;

import java.util.Set;

public final class FleetTypes {

  private FleetTypes() {}

  public enum VehicleKind {
    TRACTOR,
    TRUCK,
    VAN,
    TRAILER
  }

  public enum Ownership {
    OWNED,
    LEASED,
    SUBCONTRACTED
  }

  public enum VehicleStatus {
    ACTIVE,
    MAINTENANCE,
    OUT_OF_SERVICE
  }

  public enum DriverStatus {
    ACTIVE,
    ON_LEAVE,
    LEFT
  }

  public enum SubjectType {
    VEHICLE,
    DRIVER
  }

  public enum DocumentType {
    INSPECTION,
    TRAFFIC_INSURANCE,
    KASKO,
    K_CERTIFICATE,
    U_ETT,
    EXHAUST,
    VEHICLE_ADR,
    LICENSE,
    SRC,
    PSYCHOTECHNIC,
    DRIVER_ADR,
    HEALTH
  }

  /** Atama için geçerli olması gereken belgeler. Diğerleri yalnız hatırlatılır. */
  public static Set<DocumentType> requiredFor(SubjectType subject) {
    return subject == SubjectType.VEHICLE
        ? Set.of(DocumentType.INSPECTION, DocumentType.TRAFFIC_INSURANCE)
        : Set.of(DocumentType.LICENSE, DocumentType.SRC, DocumentType.PSYCHOTECHNIC);
  }

  public enum ExpenseKind {
    MAINTENANCE,
    REPAIR,
    TIRE,
    FUEL
  }

  public enum Availability {
    AVAILABLE,
    WARNING,
    BLOCKED
  }

  public enum ReminderType {
    DOCUMENT,
    MAINTENANCE_DATE,
    MAINTENANCE_KM
  }
}
