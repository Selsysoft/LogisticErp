export interface Money {
  amount: string;
  currency: string;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Şema `BranchResponse` (12.1a §5.1). MUI'de "Şube" etiketiyle gösterilir (iş yeri). */
export interface Branch {
  id: string;
  code: string;
  name: string;
  companyId: string;
  companyName: string;
  branchGroupId: string | null;
  branchGroupName: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/** Cari türü (`FinanceTypes.AccountType`). */
export type AccountType =
  "CUSTOMER" | "CARRIER" | "SUPPLIER" | "EMPLOYEE" | "BANK" | "LEAD" | "INTERCOMPANY";

/** Hareket türü (12.1 §3.5): Borç, Ödeme, Alacak, Tahsilat. */
export type TransactionKind = "DEBT" | "PAYMENT" | "RECEIVABLE" | "COLLECTION";
export type DocumentSide = "RECEIVABLE" | "PAYABLE";
export type CompanyType = "INDIVIDUAL" | "CORPORATE";
export type BankAccountKind = "TIME" | "DEMAND" | "SAVINGS" | "CORPORATE";
export type BankAccountCategory = "MAIN" | "SUB";
export type DocumentPaymentMethod = "CASH" | "BANK" | "CHECK" | "NOTE" | "CREDIT_CARD" | "OTHER";
export type BalanceGroupBy = "CURRENCY" | "COMPANY" | "BRANCH";
export type StatementDateBasis = "TRANSACTION" | "DOCUMENT";
export type InvoiceDirection = "PURCHASE" | "SALES";

/** Şema `BalanceResponse`; 12.1'de şirket/iş yeri kırılımı ve dört tür toplamı eklendi. */
export interface Balance {
  currency: string;
  debit: number;
  credit: number;
  balance: number;
  tlBalance: number;
  companyId: string | null;
  branchId: string | null;
  debt: number;
  payment: number;
  receivable: number;
  collection: number;
}

/** Şema `CurrencyAmountResponse`. */
export interface CurrencyAmount {
  currency: string;
  amount: number;
}

/** Şema `AccountCompanyLimitResponse`. */
export interface AccountCompanyLimit {
  companyId: string;
  creditLimit: number | null;
  riskLimit: number | null;
}

/** Şema `AccountPlanSummaryResponse` (liste `includePlanSummary=true`). */
export interface AccountPlanSummary {
  nextDueDate: string | null;
  overdueCount: number;
  dueTodayCount: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  planned: CurrencyAmount[];
}

/** Şema `AccountResponse` (12.1 §4.1). `address` yalnız detayda ve FINANCE_MANAGE'de dolu. */
export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  /** VKN düz; TCKN listede ve izinsiz detayda maskeli (`taxNumberMasked`). */
  taxNumber: string | null;
  taxNumberMasked: boolean;
  branchId: string | null;
  companyId: string | null;
  representsCompanyId: string | null;
  balances: Balance[];
  subGroup: string;
  subGroupName: string;
  active: boolean;
  defaultCurrency: string | null;
  creditLimit: number | null;
  riskLimit: number | null;
  companyLimits: AccountCompanyLimit[] | null;
  taxOffice: string | null;
  companyType: CompanyType | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactMobile: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  country: string | null;
  postalCode: string | null;
  paymentTerms: string | null;
  notes: string | null;
  planSummary: AccountPlanSummary | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/** Şema `AccountGroupResponse` (Hesap Grubu). */
export interface AccountGroup {
  code: string;
  accountType: AccountType;
  name: string;
  reportType: string | null;
  codePrefix: string;
  sortOrder: number;
  typeDefault: boolean;
  selectable: boolean;
  active: boolean;
}

/** Şema `AccountHistoryResponse` (kart değişiklik geçmişi). */
export interface AccountHistory {
  at: string;
  actorEmail: string | null;
  event: string;
  details: string | null;
}

/** Şema `AccountBankAccountResponse`; IBAN/hesap no yalnız detayda ve MANAGE'de açık. */
export interface AccountBankAccount {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  bankName: string;
  branchName: string | null;
  accountNumber: string | null;
  accountNumberMasked: string | null;
  iban: string | null;
  ibanMasked: string | null;
  holderName: string;
  currency: string;
  accountKind: string;
  category: string;
  openedOn: string | null;
  lastTransactionOn: string | null;
  description: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/** Şema `AccountDocumentTypeResponse`. */
export interface AccountDocumentType {
  side: DocumentSide;
  code: string;
  name: string;
  audience: "ALL" | "CUSTOMER" | "OTHER";
  invoiceSection: boolean;
  penalty: boolean;
  isDefault: boolean;
  selectable: boolean;
  sortOrder: number;
  /**
   * 12.2 (V34): belge eksik fatura hesabında fatura sayılır (§3.7). İsteğe bağlı: B4 öncesi sunucu
   * göndermez ve 12.1 test verileri alanı içermez (FE-0 bu dosyalara dokunmaz); yoksa false sayılır.
   */
  countsAsInvoice?: boolean;
}

/** Şema `AccountDocumentTaxResponse`. */
export interface AccountDocumentTax {
  grossAmount: number;
  discountRate: number;
  discountAmount: number;
  netExclVat: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  withholdingAmount: number;
  otherTaxesAmount: number;
  netPayable: number;
}

/** Şema `AccountDocumentResponse` (Borç/Alacak belgesi). */
export interface AccountDocument {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  branchId: string;
  companyId: string;
  side: string;
  documentType: string;
  documentTypeName: string;
  documentNo: string;
  documentDate: string;
  dueDate: string | null;
  amount: number;
  currency: string;
  exchangeRate: number | null;
  paymentMethod: string;
  description: string | null;
  reflectToLedger: boolean;
  ledgerAmount: number | null;
  status: "OPEN" | "CANCELLED";
  cancelDate: string | null;
  cancelReason: string | null;
  revisedFromId: string | null;
  revisedById: string | null;
  transactionId: string | null;
  tax: AccountDocumentTax | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

/** Şema `AccountTransactionRowResponse` (çapraz cari hareket satırı). */
export interface AccountTransactionRow {
  id: string;
  transactionDate: string;
  createdAt: string;
  createdBy: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subGroup: string;
  subGroupName: string;
  branchId: string;
  branchName: string;
  companyId: string;
  kind: TransactionKind;
  sign: 1 | -1;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
  exchangeRate: number;
  tlAmount: number;
  description: string | null;
  sourceType: string;
  sourceId: string;
  documentNo: string | null;
  documentType: string | null;
  documentDate: string | null;
  dueDate: string | null;
  paymentMethod: string | null;
  reversal: boolean;
  reversed: boolean;
  transferRole: "OUT" | "IN" | null;
  transferredOut: boolean;
}

/** Şema `AccountTransactionFacetsResponse` (sayımlı kırılımlar). */
export interface AccountTransactionFacets {
  branches: { id: string; name: string; count: number }[];
  groups: { code: string; name: string; count: number }[];
  kinds: { kind: string; count: number }[];
}

/** Şema `AccountTransactionPageResponse`. */
export interface AccountTransactionPage {
  content: AccountTransactionRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  facets: AccountTransactionFacets | null;
}

/** Şema `AccountTransactionDetailResponse`. */
export interface AccountTransactionDetail {
  row: AccountTransactionRow;
  document: AccountDocument | null;
  reversedById: string | null;
  transfer: {
    transferId: string;
    role: "OUT" | "IN" | "MOVED";
    fromAccountId: string;
    toAccountId: string;
  } | null;
}

/** Şema `TransactionSourceResponse` (hareketin kaynağı). */
export interface TransactionSource {
  sourceType: string;
  sourceId: string;
  label: string;
  route: string | null;
}

/** Şema `BalanceBreakdownRowResponse`. */
export interface BalanceBreakdownRow {
  segment: "ALL" | "BEFORE" | "AFTER";
  currency: string;
  companyId: string | null;
  branchId: string | null;
  debit: number;
  credit: number;
  balance: number;
  tlBalance: number;
  debt: number;
  payment: number;
  receivable: number;
  collection: number;
}

/** Şema `AccountBalanceBreakdownResponse`. */
export interface AccountBalanceBreakdown {
  groupBy: string;
  splitDate: string | null;
  rows: BalanceBreakdownRow[];
  payableInvoiceTotals: CurrencyAmount[];
  /** 12.2 §4.6: kesilen (satış tarafı) fatura toplamları. */
  receivableInvoiceTotals: CurrencyAmount[];
  /** 12.2 §4.6: şirket başına satırlar + `companyId = null` konsolide satır. */
  invoiceGaps: AccountInvoiceGap[];
}

/** Şema `AccountInvoiceRowResponse` (alış ∪ satış birleşik fatura satırı). */
export interface AccountInvoiceRow {
  kind: "PURCHASE_INVOICE" | "FREIGHT_INVOICE" | "WAREHOUSE_INVOICE" | "ACCOUNT_DOCUMENT";
  id: string;
  number: string;
  documentType: string;
  documentTypeName: string;
  invoiceDate: string;
  dueDate: string | null;
  netAmount: number;
  vatAmount: number;
  withholdingAmount: number;
  totalAmount: number;
  currency: string;
  reflected: boolean;
  status: "OPEN" | "CANCELLED";
  companyId: string;
  branchId: string;
}

/** Şema `AccountRolloverResponse` (Cari Devir / sezon). */
export interface AccountRollover {
  id: string;
  accountId: string;
  rolloverDate: string;
  seasonName: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
  deletedBy: string | null;
  deletedAt: string | null;
}

/** Şema `TransferableTransactionResponse` (Cari Taşıma satırı). */
export interface TransferableTransaction {
  transactionId: string;
  transactionDate: string;
  kind: string;
  sign: number;
  documentNo: string | null;
  documentType: string | null;
  branchId: string;
  branchName: string;
  companyId: string;
  direction: string;
  amount: number;
  currency: string;
  description: string | null;
  instruments: {
    id: string;
    kind: "CHECK" | "NOTE";
    number: string;
    status: string;
    role: "DRAWER" | "ENDORSEE";
  }[];
  /** Aynı çeke bağlı satırlar birlikte seçilir. */
  instrumentGroup: string | null;
  blockedReason: "OPEN_PLAN" | null;
}

/** Şema `AccountTransferResponse`. */
export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  transferDate: string;
  description: string | null;
  status: "POSTED" | "REVERSED";
  reverseDate: string | null;
  lines: {
    id: string;
    transactionId: string;
    branchId: string;
    companyId: string;
    direction: string;
    amount: number;
    currency: string;
    active: boolean;
  }[];
  instruments: {
    instrumentId: string;
    kind: string;
    number: string;
    movedDrawer: boolean;
    movedEndorsee: boolean;
    reverted: boolean;
  }[];
  checkCount: number;
  noteCount: number;
  skippedInstruments: string[];
  createdBy: string;
  createdAt: string;
}

/** Şema `AccountTransferHistoryRowResponse` (Geçmiş Taşımalar). */
export interface AccountTransferHistoryRow {
  transferId: string;
  lineId: string;
  transferDate: string;
  status: string;
  fromAccountId: string;
  fromAccountCode: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountCode: string;
  toAccountName: string;
  kind: string;
  amount: number;
  currency: string;
  instrumentNumbers: string[];
  createdBy: string;
}

// İstek gövdeleri: type alias (sözleşme testi yalnız dışa aktarılan yanıt arayüzlerini denetler).

/** `POST /finance/accounts/{id}/bank-accounts`; kart formundaki banka satırı. */
export type SaveBankAccountBody = {
  bankName: string;
  branchName?: string;
  accountNumber?: string;
  iban?: string;
  holderName?: string;
  currency: string;
  accountKind?: BankAccountKind;
  category: BankAccountCategory;
  openedOn?: string;
  description?: string;
};

/** Kart profil alanları (12.1 §4.1; MUI göndermez). */
export type AccountProfileFields = {
  subGroup?: string;
  companyId?: string;
  defaultCurrency?: string;
  taxOffice?: string;
  companyType?: CompanyType;
  phone?: string;
  email?: string;
  website?: string;
  contactName?: string;
  contactTitle?: string;
  contactMobile?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  postalCode?: string;
  paymentTerms?: string;
  notes?: string;
};

/**
 * `POST /finance/accounts` (kod boşsa sunucu gruptan üretir). Kart limitleri yalnız kayıtta gövdede;
 * düzenlemede `PUT /finance/accounts/{id}/limits` (`LimitBody`) ile yazılır (profil PUT'u limit almaz).
 */
export type SaveAccountBody = AccountProfileFields & {
  creditLimit?: number;
  riskLimit?: number;
  code?: string;
  name: string;
  type: AccountType;
  taxNumber?: string;
  branchId?: string;
  bankAccounts?: SaveBankAccountBody[];
};

/** `PUT /finance/accounts/{id}/profile`. */
export type AccountProfileBody = AccountProfileFields & {
  code: string;
  name: string;
  type: AccountType;
  subGroup: string;
  taxNumber?: string;
  branchId?: string;
  bankAccounts?: (SaveBankAccountBody & { id?: string })[];
  deactivatedBankAccountIds?: string[];
};

/** `PUT /finance/accounts/{id}/limits` (companyId yoksa kart limiti). */
export type LimitBody = {
  companyId?: string | null;
  creditLimit?: number | null;
  riskLimit?: number | null;
};

/** `POST /finance/accounts/{id}/documents` ve `/account-documents/{id}/revise`. */
export type AccountDocumentBody = {
  side: DocumentSide;
  documentType: string;
  documentNo: string;
  documentDate: string;
  dueDate?: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  paymentMethod: DocumentPaymentMethod;
  branchId: string;
  description?: string;
  reflectToLedger?: boolean;
  tax?: {
    discountRate?: number;
    vatRate?: number;
    withholdingAmount?: number;
    otherTaxesAmount?: number;
  };
};

/** `POST /accounts/transactions/{id}/void` ve `/account-transfers/{id}/reverse`. */
export type VoidBody = { date?: string; description?: string };

/** `POST /account-documents/{id}/cancel`. */
export type CancelDocumentBody = { date?: string; reason?: string };

/** `POST /accounts/{id}/rollovers`, `PUT /rollovers/{id}`. */
export type RolloverBody = { rolloverDate: string; seasonName: string };

/** `POST /account-transfers`. */
export type AccountTransferBody = {
  fromAccountId: string;
  toAccountId: string;
  transactionIds: string[];
  description?: string;
  date?: string;
};

/** Şema `FundResponse` (12.2 §4.1; mevcut alan sırası korunur, yeniler sonda). */
export interface Fund {
  id: string;
  code: string;
  name: string;
  kind: FundKind;
  currency: string;
  branchId: string;
  companyId: string;
  bankName: string | null;
  iban: string | null;
  allowNegative: boolean;
  /** Tüm hareketler (ileri tarihliler dahil) — 12.2 §3.2.1. */
  balance: number;
  accountType: FundAccountType;
  /** Maskeli "****1234" (düz hali yalnız `FundDetail`'de ve FINANCE_MANAGE'de). */
  accountNo: string | null;
  bankBranchName: string | null;
  description: string | null;
  active: boolean;
  /** `asOf` (varsayılan bugün) dahil bakiye — ekranlardaki "Güncel Bakiye". */
  currentBalance: number;
  futureCount: number;
  futureNet: number;
  openingBalance: number;
  openingDate: string | null;
  transactionCount: number;
}

/** Şema `StatementLine` (12.1 §4.5 eklemeleri). */
export interface StatementLine {
  id: string;
  date: string;
  direction: string;
  amount: number;
  exchangeRate: number | null;
  tlAmount: number | null;
  description: string | null;
  sourceType: string;
  balance: number;
  currency: string;
  companyId: string;
  branchId: string;
  sourceId: string;
  kind: string;
  sign: number;
  reversal: boolean;
  reversed: boolean;
  transferRole: string | null;
  documentNo: string | null;
  documentType: string | null;
  documentDate: string | null;
  dueDate: string | null;
  paymentMethod: string | null;
  createdBy: string;
  createdAt: string;
}

/**
 * Şema `StatementResponse`. Sunucu `currency` verilmeyen çok para birimli ekstrede `currency` ve
 * `openingBalance`'ı null döndürebilir; MUI her zaman `currency` gönderdiği için ikisi burada null'suz
 * bırakıldı (12.1 §5.2 F8). ZTO ekstresi bu iki alanı okumaz, açılışı `openingBalances`'tan alır.
 */
export interface Statement {
  currency: string;
  openingBalance: number;
  openingBalances: CurrencyAmount[];
  lines: StatementLine[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Instrument {
  id: string;
  kind: string;
  direction: "RECEIVED" | "ISSUED";
  number: string;
  bankName: string | null;
  accountId: string;
  endorsedAccountId: string | null;
  branchId: string;
  companyId: string;
  fundAccountId: string | null;
  money: Money;
  dueDate: string;
  status: string;
}

export interface InstrumentMovement {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  movementDate: string;
  note: string | null;
  createdBy: string;
  /** 12.1: cari taşımada `TRANSFERRED` satırı (durum değişmez, cari değişir). */
  movementType: "STATUS" | "TRANSFERRED";
  fromAccountId: string | null;
  toAccountId: string | null;
  accountTransferId: string | null;
}

export interface Settlement {
  id: string;
  type: "PAYMENT" | "COLLECTION";
  method: string;
  accountId: string | null;
  branchId: string;
  fundAccountId: string | null;
  instrumentId: string | null;
  expenseItemId: string | null;
  planId: string | null;
  money: Money;
  settlementDate: string;
  description: string | null;
  status: "POSTED" | "REVERSED";
  companyId: string;
  // 12.2a (12.2a_TASARIM §4.3): mevcut 14 alanın sonuna.
  documentNo: string | null;
  /** Yalnız `method = BANK` iken dolu (NULL eski kayıt = TRANSFER). */
  channel: SettlementChannel | null;
  counterpartyBankAccountId: string | null;
  /** Düzeltme (`POST /settlements/{id}/correct`) ile oluşan kayıtta eski kaydın kimliği. */
  correctsSettlementId: string | null;
  reverseReason: string | null;
  reversedOn: string | null;
}

/**
 * Şema `DailyReportResponse` (12.2a §4.3): `rows` liste satırının üst kümesi (`SettlementListItem`;
 * `reversedOn` dolu satır = o tarihte geçerli, sonradan iptal — OK-12.2a-30).
 */
export interface DailyReport {
  type: string;
  date: string;
  rows: SettlementListItem[];
  /** `DailyTotal.total` sunucuda JSON sayısı (BigDecimal, @JsonFormat yok; 12.2a B4 notu). */
  totals: { branchId: string; currency: string; total: number; count: number }[];
  fundBalances: DailyFundBalance[];
  instrumentFundMovements: DailyInstrumentMovement[];
}

export interface Invoice {
  id: string;
  accountId: string;
  branchId: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  net: Money;
  vat: Money;
  total: Money;
  status: "OPEN" | "CANCELLED";
  description: string | null;
  companyId: string;
}

export interface Plan {
  id: string;
  accountId: string;
  branchId: string;
  companyId: string;
  money: Money;
  dueDate: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
  purchaseInvoiceId: string | null;
  description: string | null;
  rejectNote: string | null;
}

export interface PlanEvent {
  id: string;
  eventType: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface HeatmapCell {
  period: string;
  currency: string;
  total: number;
  count: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

export interface Dashboard {
  overdue: CurrencyTotal[];
  dueToday: CurrencyTotal[];
  dueThisWeek: CurrencyTotal[];
  pendingApproval: number;
  upcoming: Plan[];
}

export interface Threshold {
  currency: string;
  low: number;
  medium: number;
  high: number;
}

export interface ExpenseItem {
  id: string;
  expenseTypeId: string;
  code: string;
  name: string;
}

export interface ExpenseType {
  id: string;
  code: string;
  name: string;
}

export interface Rate {
  currency: string;
  rateDate: string;
  rate: number;
  source: string;
}

export interface Aging {
  accountId: string;
  accountName: string;
  currency: string;
  days0To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
  total: number;
}

// ---------------------------------------------------------------------------------------------
// 12.2 — Banka / kasa / transfer merkezi / döviz bozumu / uyarılar (12.2_TASARIM §4). Ad kuralı:
// backend record adı eksi `Response` soneki (contract.test.ts `schemaFor`). Yanıt arayüzlerinde
// satır içi tip yok; her iç nesne adlıdır. decimal → number, Money.amount → string (mevcut şema).
// ---------------------------------------------------------------------------------------------

export type FundKind = "BANK" | "CASH";
/** `fund_account.account_type`: Vadesiz / Kredi / Vadeli Mevduat / Yatırım. */
export type FundAccountType = "DEMAND" | "CREDIT" | "DEPOSIT" | "INVESTMENT";
export type FundDirection = "IN" | "OUT";
/** Manuel fon hareketi kategorisi (V33 `fin_income_expense`). */
export type FundCategory = "EXPENSE" | "INCOME" | "OTHER";
export type FundTransferType =
  "VIREMENT" | "EFT" | "WIRE" | "FX_EXCHANGE" | "BANK_TO_CASH" | "CASH_TO_BANK" | "CASH_TO_CASH";
/** Şirketler arası virmanda VIREMENT ve FX_EXCHANGE yok (OK-12.2-12, OK-12.2-13). */
export type IntercompanyTransferType = Exclude<FundTransferType, "VIREMENT" | "FX_EXCHANGE">;
export type IntercompanyReasonType = "DEBT_PAID" | "LOAN_GIVEN";
export type TransferStatus = "POSTED" | "REVERSED";
export type TransferCostKind = "COMMISSION" | "FEE" | "KMV";
export type TransferSourceKind = "SETTLEMENT" | "TRANSFER";
export type RateOperation = "MULTIPLY" | "DIVIDE";
export type FxCalcMode = "SOURCE_RATE" | "RATE_TARGET" | "SOURCE_TARGET";
export type TransferRecordType = "FUND_TRANSFER" | "INTERCOMPANY";
/** `GET /funds/transfers?transferType=`: tür ya da şirketler arası kayıtlar. */
export type TransferListType = FundTransferType | "INTERCOMPANY";
export type TransferCollectionState = "COMPLETE" | "PARTIAL" | "PENDING" | "CANCELLED" | "NONE";
export type TransferSummaryGroup =
  | "VIREMENT_EFT_WIRE"
  | "FX_EXCHANGE"
  | "BANK_TO_CASH"
  | "CASH_TO_BANK"
  | "CASH_TO_CASH"
  | "INTERCOMPANY"
  | "TOTAL";
export type SettlementType = "PAYMENT" | "COLLECTION";
export type SettlementWarningSeverity = "CONFIRM" | "INFO";

/** Şema `FundDetailResponse`: `accountNo` yalnız burada ve FINANCE_MANAGE'de düz (SEC-12.2-07). */
export interface FundDetail extends Fund {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
  lastTransactionDate: string | null;
}

/** Şema `FundSummaryRowResponse` (şirket × tür × hesap türü × para birimi). */
export interface FundSummaryRow {
  companyId: string;
  kind: FundKind;
  accountType: FundAccountType;
  currency: string;
  count: number;
  inactiveCount: number;
  currentBalance: number;
  balance: number;
  futureNet: number;
  openingTotal: number;
}

/**
 * Şema `FundSparklineResponse`: son 20 hareketin işaretli tutarları (giriş +, çıkış −), eskiden
 * yeniye (12.2 §3.2.4); bakiye eğrisi istemcide birikimli toplamla çizilir.
 */
export interface FundSparkline {
  fundId: string;
  points: number[];
}

/** Şema `FundDeleteReasonResponse` (`kind` = engelleyen kayıt türü). */
export interface FundDeleteReason {
  kind: string;
  count: number;
}

/** Şema `FundCanDeleteResponse`. */
export interface FundCanDelete {
  allowed: boolean;
  reasons: FundDeleteReason[];
}

/** Şema `FundActivityOutflowResponse` (FIFO eşleşen çıkış). */
export interface FundActivityOutflow {
  id: string;
  date: string;
  accountingType: string;
  description: string | null;
  amount: number;
}

/** Şema `FundActivityInflowResponse` (FIFO giriş; `id` yoksa dönem başı devri). */
export interface FundActivityInflow {
  no: number;
  id: string | null;
  date: string;
  accountingType: string;
  description: string | null;
  amount: number;
  remaining: number;
  outflows: FundActivityOutflow[];
}

/** Şema `FundActivityUnspentResponse` (dönem sonunda harcanmamış giriş). */
export interface FundActivityUnspent {
  no: number;
  date: string;
  accountingType: string;
  description: string | null;
  original: number;
  remaining: number;
  used: number;
}

/** Şema `FundActivityReportResponse` (`GET /funds/{id}/activity-report`). */
export interface FundActivityReport {
  fund: Fund;
  from: string;
  to: string;
  opening: number;
  totalIn: number;
  totalOut: number;
  net: number;
  inflows: FundActivityInflow[];
  unspent: FundActivityUnspent[];
  unmatchedOut: number;
}

/** Şema `FundTransactionRowResponse` (çok hesaplı hareket araması; yürüyen bakiye hesap başına). */
export interface FundTransactionRow {
  id: string;
  fundAccountId: string;
  fundCode: string;
  fundName: string;
  bankName: string | null;
  kind: FundKind;
  accountType: FundAccountType;
  companyId: string;
  branchId: string;
  currency: string;
  transactionDate: string;
  direction: FundDirection;
  amount: number;
  exchangeRate: number;
  tlAmount: number;
  runningBalance: number;
  description: string | null;
  sourceType: string;
  sourceId: string;
  /** Sunucuda türetilen ZTO "MUHASEBE TİPİ" (§3.2.6). */
  accountingType: string;
  transferCode: string | null;
  category: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  reversal: boolean;
  reversed: boolean;
  createdBy: string;
  createdAt: string;
}

/** Şema `FundCurrencyTotalResponse`. */
export interface FundCurrencyTotal {
  currency: string;
  totalIn: number;
  totalOut: number;
  net: number;
  count: number;
}

/** Şema `FundTransactionSummaryResponse` (`summary=true`; dönem açılış/kapanış tek fonda). */
export interface FundTransactionSummary {
  currencies: FundCurrencyTotal[];
  periodOpening: number | null;
  periodClosing: number | null;
}

/** Şema `FundTransactionPageResponse` (`PageResponse` + özet). */
export interface FundTransactionPage {
  content: FundTransactionRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  summary: FundTransactionSummary | null;
}

/** Şema `FundRefResponse` (hareket detayındaki fon; `accountNo` maskeli). */
export interface FundRef {
  id: string;
  code: string;
  name: string;
  bankName: string | null;
  iban: string | null;
  accountNo: string | null;
  bankBranchName: string | null;
  currency: string;
}

/** Şema `FundSourceRefResponse` (kaynak belge bağlantısı; `route` yoksa bağlantı yok). */
export interface FundSourceRef {
  kind: string;
  id: string;
  code: string | null;
  route: string | null;
}

/** Şema `FundTransactionDetailResponse`. */
export interface FundTransactionDetail extends FundTransactionRow {
  fund: FundRef;
  source: FundSourceRef | null;
}

/** Şema `TransferCostResponse` (Komisyon / Masraf / KMV; `fundAccountId` = masrafın düştüğü fon). */
export interface TransferCost {
  id: string;
  kind: TransferCostKind;
  fundAccountId: string;
  ratePercent: number | null;
  baseAmount: number | null;
  money: Money;
}

/** Şema `TransferSourceResponse` (döviz bozumunun tahsilat / önceki bozum kaynağı). */
export interface TransferSource {
  id: string;
  kind: TransferSourceKind;
  sourceId: string;
  code: string | null;
  date: string;
  amount: number;
  usedAmount: number;
}

/** Şema `FundTransferResponse`; görünmeyen tarafın kod/adı `null`. */
export interface FundTransfer {
  id: string;
  /** = id (eski `TransferResponse` uyumu). */
  transferId: string;
  code: string;
  companyId: string;
  transferType: FundTransferType;
  transferDate: string;
  fromFundId: string;
  fromFundCode: string | null;
  fromFundName: string | null;
  toFundId: string;
  toFundCode: string | null;
  toFundName: string | null;
  money: Money;
  targetMoney: Money;
  rate: number | null;
  rateOperation: RateOperation | null;
  calcMode: FxCalcMode | null;
  fxDiffTl: number | null;
  documentNo: string | null;
  description: string | null;
  status: TransferStatus;
  reversedAt: string | null;
  reversalReason: string | null;
  replacesTransferId: string | null;
  replacedByTransferId: string | null;
  costs: TransferCost[];
  sources: TransferSource[];
  createdBy: string;
  createdAt: string;
}

/** Şema `TransferCollectionResponse` (döviz bozumunun bağlı tahsilatı). */
export interface TransferCollection {
  settlementId: string;
  date: string;
  amount: number;
  accountId: string | null;
  accountName: string | null;
  state: TransferCollectionState;
}

/** Şema `TransferListRowResponse` (Transferler sekmesi; şirket içi + şirketler arası). */
export interface TransferListRow {
  recordType: TransferRecordType;
  id: string;
  code: string;
  transferType: FundTransferType;
  reasonType: IntercompanyReasonType | null;
  transferDate: string;
  companyId: string;
  toCompanyId: string | null;
  fromFundId: string;
  fromFundCode: string | null;
  fromFundName: string | null;
  fromKind: FundKind;
  fromBranchId: string | null;
  toFundId: string;
  toFundCode: string | null;
  toFundName: string | null;
  toKind: FundKind;
  toBranchId: string | null;
  sourceMoney: Money;
  targetMoney: Money;
  rate: number | null;
  rateOperation: RateOperation | null;
  costTotalTl: number;
  costFundNames: string | null;
  collection: TransferCollection | null;
  description: string | null;
  status: TransferStatus;
  documentNo: string | null;
}

/** Şema `TransferSummaryRowResponse` (grup başına adet ve para birimi tutarları). */
export interface TransferSummaryRow {
  group: TransferSummaryGroup;
  count: number;
  amounts: CurrencyAmount[];
}

/** Şema `TransferDependentResponse` (bu transferi kaynak kullanan döviz bozumu). */
export interface TransferDependent {
  transferId: string;
  code: string;
  date: string;
  sourceFundName: string;
  targetFundName: string;
  usedAmount: number;
}

/** Şema `FxSourceResponse` (önceki bozumdan kalan döviz). */
export interface FxSource {
  transferId: string;
  code: string;
  date: string;
  sourceFundName: string;
  deposited: number;
  used: number;
  remaining: number;
}

/** Şema `FxCandidateAccountResponse` (bozulabilir tahsilatı olan cari). */
export interface FxCandidateAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  collectionCount: number;
  remainingTotal: number;
}

/** Şema `FxCandidateCollectionResponse`. */
export interface FxCandidateCollection {
  settlementId: string;
  date: string;
  amount: number;
  broken: number;
  remaining: number;
  description: string | null;
}

/** Şema `FxReportStatsResponse`. */
export interface FxReportStats {
  collectionCount: number;
  fxCount: number;
  fxWithoutCollection: number;
  unbrokenCollectionCount: number;
  totalBroken: CurrencyAmount[];
}

/** Şema `FxReportSourceResponse`. */
export interface FxReportSource {
  kind: TransferSourceKind;
  id: string;
  code: string | null;
  date: string;
  accountName: string | null;
  amount: number;
  used: number;
}

/** Şema `FxReportRowResponse` (`level` = izlenebilirlik girintisi). */
export interface FxReportRow {
  transferId: string;
  code: string;
  date: string;
  level: number;
  sourceFundName: string | null;
  sourceMoney: Money;
  targetFundName: string | null;
  targetMoney: Money;
  rate: number;
  rateOperation: RateOperation;
  fxDiffTl: number | null;
  status: TransferStatus;
  sources: FxReportSource[];
}

/** Şema `FxUnbrokenCollectionResponse`. */
export interface FxUnbrokenCollection {
  settlementId: string;
  date: string;
  accountName: string | null;
  money: Money;
}

/** Şema `FxReportResponse` (Döviz Bozum & Tahsilat İzlenebilirliği). */
export interface FxReport {
  stats: FxReportStats;
  rows: FxReportRow[];
  unbrokenCollections: FxUnbrokenCollection[];
}

/** Şema `IntercompanyTransferResponse`; görünmeyen tarafın kod/ad/iş yeri `null`. */
export interface IntercompanyTransfer {
  id: string;
  code: string;
  transferType: IntercompanyTransferType;
  reasonType: IntercompanyReasonType;
  transferDate: string;
  fromCompanyId: string;
  toCompanyId: string;
  fromBranchId: string | null;
  toBranchId: string | null;
  fromFundId: string;
  fromFundCode: string | null;
  fromFundName: string | null;
  toFundId: string;
  toFundCode: string | null;
  toFundName: string | null;
  money: Money;
  paymentSettlementId: string;
  collectionSettlementId: string;
  documentNo: string | null;
  /** Kullanıcı açıklaması. */
  description: string | null;
  /** Sunucunun kurduğu neden metni (§3.4.1). */
  reasonText: string;
  status: TransferStatus;
  reversedAt: string | null;
  reversalReason: string | null;
  createdBy: string;
  createdAt: string;
}

/** Şema `CompanyOutstandingResponse` (yalnız görünür şirketler). */
export interface CompanyOutstanding {
  companyId: string;
  outstanding: number;
}

/**
 * Şema `SettlementWarningResponse` (§3.6): tutarlar kullanıcının kapsamındakilerdir; gizli kısım
 * yalnız `partialScope` / `otherHiddenExists` bayraklarıyla bildirilir (SEC-12.2-02).
 */
export interface SettlementWarning {
  code: "COMPANY_ALLOCATION_EXCEEDED";
  severity: SettlementWarningSeverity;
  currency: string;
  companyId: string;
  companyOutstanding: number;
  amount: number;
  excess: number;
  others: CompanyOutstanding[];
  partialScope: boolean;
  otherHiddenExists: boolean;
}

/**
 * Şema `AccountInvoiceGapResponse` (§3.7): PAYABLE = cari alacağı / girilen fatura, RECEIVABLE = cari
 * borcu / kesilen fatura; `companyId = null` konsolide satır.
 */
export interface AccountInvoiceGap {
  accountId: string;
  side: DocumentSide;
  companyId: string | null;
  currency: string;
  ledgerTotal: number;
  invoiceTotal: number;
  missing: number;
}

/** Şema `SettlementCheckResponse` (`POST /settlements/check`; yazmaz). */
export interface SettlementCheck {
  warnings: SettlementWarning[];
  invoiceGaps: AccountInvoiceGap[];
}

// 12.2 istek gövdeleri (type alias; sözleşme testi yalnız arayüzleri tarar).

/** `POST /finance/funds` (`CreateFundRequest`). */
export type FundBody = {
  code: string;
  name: string;
  kind: FundKind;
  currency: string;
  branchId: string;
  bankName?: string;
  iban?: string;
  allowNegative: boolean;
  accountType?: FundAccountType;
  /** Şifreli saklanır. */
  accountNo?: string;
  bankBranchName?: string;
  description?: string;
  active?: boolean;
  /** İşaretli, 2 hane. */
  openingBalance?: number;
  openingDate?: string;
  /** Döviz açılışında elle kur (`> 0`); boşsa açılış tarihindeki kur (OK-12.2-37). */
  openingRate?: number;
};

/** `PUT /finance/funds/{id}` (`UpdateFundRequest`); null/undefined = değişmez. */
export type UpdateFundBody = {
  name: string;
  branchId: string;
  bankName?: string;
  iban?: string;
  allowNegative?: boolean;
  accountNo?: string;
  bankBranchName?: string;
  description?: string;
  active?: boolean | null;
  openingBalance?: number | null;
  openingDate?: string;
  /** Yalnız açılış değişirken; döviz fonda kur tablosu boşsa zorunlu (422 `RATE_MISSING`). */
  openingRate?: number;
};

/** `TransferCostRequest`. */
export type TransferCostBody = {
  kind: TransferCostKind;
  fundAccountId?: string;
  amount?: number;
  ratePercent?: number;
};

/** `TransferSourceRequest` (yalnız döviz bozumu). */
export type TransferSourceBody = {
  kind: TransferSourceKind;
  id: string;
  usedAmount: number;
};

/** `POST /finance/funds/transfers` (`FundTransferRequest`); `transferType` yoksa eski gövde. */
export type FundTransferBody = {
  transferType?: FundTransferType;
  fromFundId: string;
  toFundId: string;
  /** Kaynak tutar. */
  money: Money;
  /** Döviz bozumunda zorunlu. */
  targetMoney?: Money;
  rate?: number;
  rateOperation?: RateOperation;
  calcMode?: FxCalcMode;
  date: string;
  documentNo?: string;
  description?: string;
  /** Eski: aynı para birimli bacakların elle TL kuru. */
  exchangeRate?: number;
  costs?: TransferCostBody[];
  sources?: TransferSourceBody[];
};

/** `POST /finance/funds/transfers/{id}/replace`. */
export type ReplaceTransferBody = { transfer: FundTransferBody; reason?: string };

/** `POST …/transfers/{id}/reverse` ve `/intercompany-transfers/{id}/reverse`. */
export type ReverseTransferBody = { date: string; reason?: string };

/** `POST /finance/intercompany-transfers`. */
export type IntercompanyTransferBody = {
  transferType: IntercompanyTransferType;
  reasonType: IntercompanyReasonType;
  fromFundId: string;
  toFundId: string;
  money: Money;
  date: string;
  documentNo?: string;
  description?: string;
};

/**
 * `POST /finance/payments|collections` ve `/settlements/check` (`SettlementRequest`);
 * `confirmWarnings` yalnız kayıt uçlarında (409 CONFIRMATION_REQUIRED sonrası).
 */
export type SettlementBody = {
  method: SettlementMethod;
  accountId?: string;
  branchId: string;
  fundAccountId?: string;
  /** Ciro edilecek (portföydeki) çek. */
  instrumentId?: string;
  /** Yeni çek/senet (12.2a §4.1 `NewInstrument`). */
  instrument?: NewInstrumentBody;
  expenseItemId?: string;
  money: Money;
  date: string;
  description?: string;
  exchangeRate?: number;
  confirmWarnings?: boolean;
  // 12.2a (§4.1): sona dört alan.
  /** ≤ 50. */
  documentNo?: string;
  /** Yalnız BANK; yoksa TRANSFER (Kredi Kartı = BANK + CREDIT_CARD, OK-12.2a-9). */
  channel?: SettlementChannel;
  /** Yalnız BANK; carinin banka hesabı (maskeli gösterilir, OK-12.2a-14). */
  counterpartyBankAccountId?: string;
  /** ≤ 50 satır; `amount` ondalık metin. */
  allocations?: AllocationBody[];
};

/** `NewInstrument` (12.2a §4.1): mevcut 4 alan + `fundAccountId`, `initialStatus`. */
export type NewInstrumentBody = {
  kind: InstrumentKind;
  /** 1–50 (çekte istemci 7 hane, OK-12.2a-10). */
  number: string;
  bankName?: string;
  dueDate: string;
  /** Ödeme: çekin çekildiği BANK fonu; tahsilat AT_BANK: yatırılan banka. */
  fundAccountId?: string;
  /** Yalnız tahsilat. */
  initialStatus?: "PORTFOLIO" | "AT_BANK";
};

/** `AllocationRequest` (12.2a §4.1); `amount` ondalık metin ("250.00"; > 0, en çok 4 ondalık). */
export type AllocationBody = {
  targetType: AllocationTargetType;
  targetId: string;
  amount: string;
};

/** `POST /finance/settlements/{id}/correct` (`SettlementCorrectionRequest`). */
export type CorrectSettlementBody = {
  /** ≤ 500. */
  reason?: string;
  replacement: SettlementBody;
};

/** `POST /finance/settlements/{id}/reverse` (`ReverseRequest`); `description` → reverse_reason. */
export type ReverseSettlementBody = { date: string; description?: string };

// ---------------------------------------------------------------------------------------------
// 12.2a ödeme / tahsilat (12.2a_TASARIM §4.3, §5.2). Para alanları (`Money.amount` ve "decimal"
// alanlar) JSON'da ondalık metindir; toplama/karşılaştırma `zto/decimal.ts` ile (float yok).
// Kur (`exchangeRate`) ve TL karşılığı (`tlAmount`) yalnız gösterim, JSON number.
// ---------------------------------------------------------------------------------------------

/** `settlement.method` (DB; CHECK = çek ve senet). */
export type SettlementMethod = "CASH" | "BANK" | "CHECK";
/** `SettlementChannel`: yalnız BANK kayıtlarında. */
export type SettlementChannel = "TRANSFER" | "CREDIT_CARD";
export type SettlementStatus = "POSTED" | "REVERSED";
/** ZTO'da görünen yöntem (`displayMethod`, `DocumentPaymentMethod` alt kümesi; OTHER yok). */
export type PayMethod = "CASH" | "BANK" | "CREDIT_CARD" | "CHECK" | "NOTE";
export type InstrumentKind = "CHECK" | "NOTE";
export type AllocationTargetType =
  | "PURCHASE_INVOICE"
  | "FREIGHT_INVOICE"
  | "WAREHOUSE_INVOICE"
  | "OPENING_INVOICE"
  | "ACCOUNT_DOCUMENT";
/** Düzenle/Sil kilidinin nedeni (§3.7; `TRANSFERRED` = cari taşımayla taşınmış, OK-12.2a-34). */
export type SettlementLockReason =
  | "REVERSED"
  | "CHECK"
  | "PLAN"
  | "INTERCOMPANY"
  | "FX_SOURCE"
  | "VEHICLE_EXPENSE"
  | "TRANSFERRED"
  | "NO_ACCOUNT";
/** `GET /reports/daily?sort=` (`DailyReportSort`). */
export type DailyReportSort = "TIME_ASC" | "TIME_DESC";

/**
 * Şema `SettlementListItemResponse` (`GET /payments|collections`, günlük rapor satırı). Maskeli
 * personel satırında (`employeeMasked`) cari alanları, `description` ve karşı taraf banka alanları
 * null; `reversible`/`correctable` false (OK-12.2a-8).
 */
export interface SettlementListItem {
  id: string;
  type: SettlementType;
  method: SettlementMethod;
  channel: SettlementChannel | null;
  displayMethod: DocumentPaymentMethod;
  accountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  accountType: AccountType | null;
  accountSubGroup: string | null;
  accountGroupName: string | null;
  employeeMasked: boolean;
  branchId: string;
  branchName: string;
  branchGroupName: string | null;
  companyId: string;
  fundAccountId: string | null;
  fundName: string | null;
  fundKind: FundKind | null;
  fundBankName: string | null;
  fundBankBranchName: string | null;
  instrumentId: string | null;
  instrumentKind: InstrumentKind | null;
  instrumentNumber: string | null;
  instrumentStatus: string | null;
  expenseItemId: string | null;
  expenseItemName: string | null;
  planId: string | null;
  money: Money;
  exchangeRate: number | null;
  tlAmount: number | null;
  settlementDate: string;
  documentNo: string | null;
  description: string | null;
  status: SettlementStatus;
  counterpartyBankAccountId: string | null;
  counterpartyIbanMasked: string | null;
  counterpartyBankName: string | null;
  correctsSettlementId: string | null;
  correctedById: string | null;
  reverseReason: string | null;
  reversedOn: string | null;
  createdAt: string;
  createdBy: string;
  intercompany: boolean;
  credit: boolean;
  /** Cari satırı cari taşımayla başka cariye taşınmış (lockReason TRANSFERRED). */
  transferred: boolean;
  /** Döviz bozumunda kullanılan tutar (ondalık metin). */
  fxUsed: string;
  /** Bozulmamış kalan (ondalık metin). */
  fxRemaining: string;
  lockReason: SettlementLockReason | null;
  reversible: boolean;
  correctable: boolean;
}

/** Şema `SettlementLineResponse`: kaydın cari ve banka/kasa defter satırları (ters kayıtlar dahil). */
export interface SettlementLine {
  ledger: "ACCOUNT" | "FUND";
  transactionId: string;
  direction: "DEBIT" | "CREDIT" | "IN" | "OUT";
  money: Money;
  exchangeRate: number;
  tlAmount: number;
  transactionDate: string;
  reversal: boolean;
}

/**
 * Şema `SettlementAllocationResponse`: fatura eşleştirmesi. `outOfScope` iken hedef bilgileri
 * (`targetId`, `targetNumber`, `targetTypeName`, `invoiceDate`, `dueDate`) null, tutar görünür
 * (OK-12.2a-33). `active` = kayıt POSTED ve hedef açık (OK-12.2a-3).
 */
export interface SettlementAllocation {
  id: string;
  targetType: AllocationTargetType;
  targetId: string | null;
  targetNumber: string | null;
  targetTypeName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  money: Money;
  targetCancelled: boolean;
  active: boolean;
  outOfScope: boolean;
}

/** Şema `SettlementDetailResponse` (`GET /settlements/{id}`; personel carisinde 404). */
export interface SettlementDetail {
  item: SettlementListItem;
  lines: SettlementLine[];
  instrument: Instrument | null;
  plan: Plan | null;
  allocations: SettlementAllocation[];
  /** Kapsam dışı fonda null. */
  fundIbanMasked: string | null;
  bankStatementMatched: boolean;
}

/**
 * Şema `OpenInvoiceResponse` (`GET /settlements/open-invoices`; ≤ 200). `allocated` = eşleşmeler +
 * faturaya bağlı POSTED plan ödemeleri (OK-12.2a-29); tutarlar ondalık metin.
 */
export interface OpenInvoice {
  targetType: AllocationTargetType;
  id: string;
  number: string;
  typeName: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  total: string;
  allocated: string;
  remaining: string;
  branchId: string;
  companyId: string;
}

/** Şema `DailyFundBalanceResponse` (günlük rapor "Özet Bakiye Bilgisi"); bakiyeler ondalık metin. */
export interface DailyFundBalance {
  fundAccountId: string;
  name: string;
  kind: FundKind;
  currency: string;
  branchId: string;
  branchName: string;
  bankName: string | null;
  bankBranchName: string | null;
  balanceAtDate: string;
  balanceNow: string;
}

/** Şema `DailyInstrumentMovementResponse` ("Banka Hareketine Yansıyan Çek Özeti"). */
export interface DailyInstrumentMovement {
  branchId: string;
  branchName: string;
  fundAccountId: string;
  fundName: string;
  fundKind: FundKind;
  currency: string;
  count: number;
  total: string;
}
