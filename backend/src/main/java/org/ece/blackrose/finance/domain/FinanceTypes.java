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

  // --- Faz 12.2 (banka/kasa, transfer merkezi, uyarılar; 12.2_TASARIM §2.1)

  /** Banka hesabı türü (ZTO AccountType). Kasa yalnız {@link #DEMAND} olur (V31 CHECK). */
  public enum FundAccountType {
    DEMAND,
    CREDIT,
    DEPOSIT,
    INVESTMENT
  }

  public enum FundOpeningStatus {
    POSTED,
    REVERSED
  }

  /** Şirket içi transfer türü; şirketler arası virmanda {@link #VIREMENT} ve FX yoktur. */
  public enum FundTransferType {
    VIREMENT,
    EFT,
    WIRE,
    FX_EXCHANGE,
    BANK_TO_CASH,
    CASH_TO_BANK,
    CASH_TO_CASH
  }

  /** Döviz bozumunda kurun uygulanışı: hedef = kaynak × kur ya da kaynak ÷ kur. */
  public enum RateOperation {
    MULTIPLY,
    DIVIDE
  }

  /** Döviz bozumunda kullanıcının girdiği iki değerden üçüncünün hesaplanışı. */
  public enum FxCalcMode {
    SOURCE_RATE,
    RATE_TARGET,
    SOURCE_TARGET
  }

  public enum TransferStatus {
    POSTED,
    REVERSED
  }

  public enum TransferCostKind {
    COMMISSION,
    FEE,
    KMV
  }

  /** Döviz bozumunun kaynağı: tahsilat ya da önceki bozum. */
  public enum TransferSourceKind {
    SETTLEMENT,
    TRANSFER
  }

  /** Şirketler arası virmanın nedeni (açıklama metnini belirler). */
  public enum IntercompanyReason {
    DEBT_PAID,
    LOAN_GIVEN
  }

  /** Fon hareketinin kaynak türünden türetilemeyen sınıfı ({@code fund_transaction.category}). */
  public enum FundCategory {
    EXPENSE,
    INCOME,
    OTHER,
    OPENING,
    COMMISSION,
    FEE,
    KMV
  }

  public enum IncomeExpenseDirection {
    INCOME,
    EXPENSE;

    public IncomeExpenseDirection opposite() {
      return this == INCOME ? EXPENSE : INCOME;
    }
  }

  public enum IncomeExpenseCategory {
    INTEREST,
    FX_DIFF,
    BANK_CHARGE
  }

  /** ZTO "MUHASEBE TİPİ"; sorguda taban satırdan türetilir (12.2_TASARIM §3.2.6). */
  public enum FundAccountingType {
    INTERCOMPANY,
    ACCOUNT_PAYMENT,
    ACCOUNT_COLLECTION,
    EXPENSE,
    VIREMENT,
    EFT,
    WIRE,
    FX_EXCHANGE,
    BANK_TO_CASH,
    CASH_TO_BANK,
    CASH_TO_CASH,
    TRANSFER_COST,
    LEGACY_TRANSFER,
    CHECK_COLLECTION,
    NOTE_COLLECTION,
    CHECK_PAYMENT,
    NOTE_PAYMENT,
    INCOME,
    OTHER,
    OPENING,
    /** 12.5'te veri üretir; 12.2'de süzgeç seçeneği olarak durur. */
    CREDIT_DRAWDOWN,
    /** 12.9'da veri üretir; 12.2'de süzgeç seçeneği olarak durur. */
    NET_SALARY
  }

  public enum SettlementWarningCode {
    COMPANY_ALLOCATION_EXCEEDED,
    INVOICE_MISSING
  }

  /** {@link #CONFIRM}: kayıt için onay gerekir; {@link #INFO}: yalnız bilgi. */
  public enum WarningSeverity {
    CONFIRM,
    INFO
  }

  /** Eksik fatura hesabının tarafı: cari alacağı (PAYABLE) ya da cari borcu (RECEIVABLE). */
  public enum InvoiceSide {
    PAYABLE,
    RECEIVABLE
  }
}
