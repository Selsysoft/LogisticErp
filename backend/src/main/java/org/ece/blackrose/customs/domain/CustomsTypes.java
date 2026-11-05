package org.ece.blackrose.customs.domain;

public final class CustomsTypes {

  private CustomsTypes() {}

  public enum DeclarationType {
    EXPORT,
    IMPORT,
    TRANSIT
  }

  public enum DeclarationStatus {
    DRAFT,
    SUBMITTED,
    CLEARED,
    REJECTED,
    CANCELLED
  }

  public enum TransitKind {
    T1,
    T2,
    TIR
  }

  public enum TransitStatus {
    OPEN,
    DISCHARGED,
    CANCELLED
  }

  public enum PermitKind {
    BILATERAL,
    MULTILATERAL,
    TRANSIT
  }

  public enum CrossingDirection {
    EXIT,
    ENTRY
  }
}
