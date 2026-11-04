package org.ece.blackrose.crm.domain;

public final class CrmTypes {

  private CrmTypes() {}

  public enum OpportunityStage {
    LEAD,
    QUALIFIED,
    QUOTE,
    WON,
    LOST
  }

  public enum ActivityType {
    NOTE,
    CALL,
    MEETING,
    TASK,
    STAGE_CHANGE
  }

  public enum QuoteStatus {
    DRAFT,
    SENT,
    ACCEPTED,
    REJECTED,
    SUPERSEDED
  }

  public enum ContractStatus {
    ACTIVE,
    ENDED,
    CANCELLED
  }

  public enum TariffLineKind {
    ROUTE,
    DISTANCE
  }

  public enum PriceUnit {
    TRIP,
    TON,
    PALLET,
    KM
  }

  /** Fiyatın hangi kuraldan geldiği; kırılımda gösterilir. */
  public enum TariffSource {
    EXPLICIT,
    CONTRACT,
    CUSTOMER,
    GENERAL,
    MANUAL
  }
}
