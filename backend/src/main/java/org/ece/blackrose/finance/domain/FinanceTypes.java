package org.ece.blackrose.finance.domain;

/** Finans modülünün sabit değer listeleri. */
public final class FinanceTypes {

  private FinanceTypes() {}

  public enum AccountType {
    CUSTOMER,
    CARRIER,
    SUPPLIER,
    EMPLOYEE,
    BANK,
    LEAD,
    /** Grup şirketi carisi; yalnız şirket kartından açılır (12.1a). */
    INTERCOMPANY;

    /** Türün varsayılan hesap grubu (V27 {@code account_group.type_default} tohumuyla birebir). */
    public String defaultSubGroup() {
      return switch (this) {
        case CUSTOMER -> "MUSTERI";
        case CARRIER -> "TASERON_NAKLIYECI";
        case SUPPLIER -> "GENEL";
        case EMPLOYEE -> "SURUCU";
        case BANK -> "BANKA";
        case LEAD -> "ADAY";
        case INTERCOMPANY -> "GRUP_SIRKETI";
      };
    }
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

  /** Borç/Alacak Ekle belgesinin yönü: RECEIVABLE → DEBIT, PAYABLE → CREDIT. */
  public enum AccountDocumentSide {
    RECEIVABLE,
    PAYABLE
  }

  public enum AccountDocumentStatus {
    OPEN,
    CANCELLED
  }

  /** Belge türünün hangi cari kitlesine açık olduğu (ZTO listeleri hesap grubuna bağlı). */
  public enum DocumentAudience {
    ALL,
    CUSTOMER,
    OTHER
  }

  public enum DocumentPaymentMethod {
    CASH,
    BANK,
    CHECK,
    NOTE,
    CREDIT_CARD,
    OTHER
  }

  /** ZTO Bireysel / Kurumsal. */
  public enum CompanyType {
    INDIVIDUAL,
    CORPORATE
  }

  /** Vadeli / Vadesiz / Birikim / Kurumsal. */
  public enum BankAccountKind {
    TIME,
    DEMAND,
    SAVINGS,
    CORPORATE
  }

  /** Ana Hesap / Yan Hesap. */
  public enum BankAccountCategory {
    MAIN,
    SUB
  }

  /** Çek/senet hareketi: durum geçişi ya da cari taşıma (durum değişmez). */
  public enum InstrumentMovementType {
    STATUS,
    TRANSFERRED
  }

  public enum AccountTransferStatus {
    POSTED,
    REVERSED
  }

  /** Hareket türü (sekmeler ve rozetler): Borç, Ödeme, Alacak, Tahsilat. */
  public enum TransactionKind {
    DEBT,
    PAYMENT,
    RECEIVABLE,
    COLLECTION
  }

  public enum BalanceGroupBy {
    CURRENCY,
    COMPANY,
    BRANCH
  }

  public enum DateBasis {
    TRANSACTION,
    DOCUMENT
  }

  public enum InvoiceDirection {
    PURCHASE,
    SALES
  }
}
