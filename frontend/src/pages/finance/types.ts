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

export interface Branch {
  id: string;
  code: string;
  name: string;
}

export interface Balance {
  currency: string;
  debit: string;
  credit: string;
  balance: string;
  tlBalance: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  taxNumber: string | null;
  branchId: string | null;
  balances: Balance[];
}

export interface Fund {
  id: string;
  code: string;
  name: string;
  kind: "BANK" | "CASH";
  currency: string;
  branchId: string;
  bankName: string | null;
  iban: string | null;
  allowNegative: boolean;
  balance: string;
}

export interface StatementLine {
  id: string;
  date: string;
  direction: string;
  amount: string;
  exchangeRate: string | null;
  tlAmount: string | null;
  description: string | null;
  sourceType: string;
  balance: string;
}

export interface Statement {
  currency: string;
  openingBalance: string;
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
  money: Money;
  dueDate: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
  purchaseInvoiceId: string | null;
  description: string | null;
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
  total: string;
  count: number;
  level: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
}

export interface CurrencyTotal {
  currency: string;
  total: string;
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
  low: string;
  medium: string;
  high: string;
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
  rate: string;
  source: string;
}

export interface Aging {
  accountId: string;
  accountName: string;
  currency: string;
  days0To30: string;
  days31To60: string;
  days61To90: string;
  daysOver90: string;
  total: string;
}
