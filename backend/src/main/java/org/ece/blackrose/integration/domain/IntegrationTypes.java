package org.ece.blackrose.integration.domain;

public final class IntegrationTypes {

  private IntegrationTypes() {}

  public enum EDocumentKind {
    EFATURA,
    EARSIV,
    EIRSALIYE
  }

  public enum EDocumentSource {
    FREIGHT_INVOICE,
    WAYBILL
  }

  public enum EDocumentStatus {
    SENT,
    ACCEPTED,
    REJECTED,
    CANCELLED
  }

  public enum ImportKind {
    TOLL,
    FUEL
  }

  public enum ImportRowStatus {
    MATCHED,
    UNMATCHED,
    ERROR,
    POSTED,
    IGNORED
  }

  public enum GeofenceEventType {
    ENTER,
    EXIT
  }

  public enum StatementLineStatus {
    UNMATCHED,
    MATCHED,
    IGNORED
  }
}
