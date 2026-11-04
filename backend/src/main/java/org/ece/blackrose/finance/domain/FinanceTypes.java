package org.ece.blackrose.finance.domain;

/** Finans modülünün sabit değer listeleri. */
public final class FinanceTypes {

  private FinanceTypes() {}

  public enum AccountType {
    CUSTOMER,
    CARRIER,
    SUPPLIER,
    EMPLOYEE,
    BANK
  }

  /** Yön firmanın bakışıyla yazılır: pozitif bakiye "cari bize borçlu" demektir. */
  public enum Direction {
    DEBIT,
    CREDIT;

    public Direction opposite() {
      return this == DEBIT ? CREDIT : DEBIT;
    }
  }

  public enum FundKind {
    BANK,
    CASH
  }

  public enum FundDirection {
    IN,
    OUT;

    public FundDirection opposite() {
      return this == IN ? OUT : IN;
    }
  }

  public enum InstrumentKind {
    CHECK,
    NOTE
  }

  public enum InstrumentDirection {
    RECEIVED,
    ISSUED
  }

  public enum InstrumentStatus {
    PORTFOLIO,
    AT_BANK,
    COLLECTED,
    ENDORSED,
    COLLECTED_TO_CASH,
    BOUNCED,
    ISSUED,
    PAID
  }

  public enum SettlementType {
    PAYMENT,
    COLLECTION
  }

  public enum SettlementMethod {
    CASH,
    BANK,
    CHECK
  }

  public enum SettlementStatus {
    POSTED,
    REVERSED
  }

  public enum InvoiceStatus {
    OPEN,
    CANCELLED
  }

  public enum PlanStatus {
    DRAFT,
    PENDING,
    APPROVED,
    REJECTED,
    PAID,
    CANCELLED
  }

  public enum DensityLevel {
    LOW,
    MEDIUM,
    HIGH,
    VERY_HIGH
  }

  public enum HeatmapPeriod {
    DAY,
    MONTH
  }

  public enum AgingType {
    RECEIVABLE,
    PAYABLE
  }
}
