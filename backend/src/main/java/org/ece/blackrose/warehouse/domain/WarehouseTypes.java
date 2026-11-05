package org.ece.blackrose.warehouse.domain;

public final class WarehouseTypes {

  private WarehouseTypes() {}

  public enum CustomsStatus {
    NONE,
    UNDER_BOND,
    CLEARED
  }

  public enum MovementType {
    RECEIPT,
    ISSUE,
    ADJUSTMENT,
    CUSTOMS_RELEASE,
    REVERSAL
  }

  public enum CountStatus {
    OPEN,
    POSTED
  }

  public enum StorageBasis {
    PALLET_DAY,
    M2_DAY,
    UNIT_DAY
  }

  public enum HandlingKind {
    UNLOADING,
    LOADING,
    LABELING,
    PICKING,
    OTHER
  }

  public enum WarehouseInvoiceStatus {
    ISSUED,
    CANCELLED
  }
}
