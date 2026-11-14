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

export interface Fund {
  id: string;
  code: string;
  name: string;
  kind: "BANK" | "CASH";
  currency: string;
  branchId: string;
  companyId: string;
  bankName: string | null;
  iban: string | null;
  allowNegative: boolean;
  balance: number;
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
}

export interface DailyReport {
  type: string;
  date: string;
  rows: Settlement[];
  totals: { branchId: string; currency: string; total: string; count: number }[];
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
