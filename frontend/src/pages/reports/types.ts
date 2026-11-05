export type ProfitGroup = "SHIPMENT" | "CUSTOMER" | "ROUTE" | "VEHICLE" | "OWNERSHIP";

export interface ProfitRow {
  key: string;
  label: string;
  shipments: number;
  revenueTl: string;
  costTl: string;
  marginTl: string;
  marginPercent: string | null;
}

export interface ProfitReport {
  rows: ProfitRow[];
  totalElements: number;
  revenueTl: string;
  costTl: string;
  marginTl: string;
  marginPercent: string | null;
}

export interface KpiReport {
  shipments: number;
  cancelled: number;
  delivered: number;
  onTime: number;
  onTimePercent: string | null;
  averageFreightTl: string | null;
  averageFillPercent: string | null;
}

export interface DriverRow {
  driverId: string;
  driverName: string;
  shipments: number;
  delivered: number;
  onTime: number;
  onTimePercent: string | null;
}

export interface ForecastRow {
  weekStart: string | null;
  overdue: boolean;
  currency: string;
  inflow: string;
  outflow: string;
  net: string;
}

export interface PositionRow {
  currency: string;
  cash: string;
  receivable: string;
  payable: string;
  net: string;
}

export interface SettlementPerformanceRow {
  currency: string;
  collected: string;
  paid: string;
  collections: number;
  payments: number;
}

export interface CurrencyTotal {
  currency: string;
  total: string;
  count: number;
}

export interface Dashboard {
  operations: { lastThirtyDays: KpiReport; inTransit: number; waitingInvoice: number } | null;
  finance: {
    overdue: CurrencyTotal[];
    dueThisWeek: CurrencyTotal[];
    pendingApproval: number;
    position: PositionRow[];
  } | null;
  fleet: { overdueReminders: number; upcomingReminders: number } | null;
  customs: { openTransits: number; overdueTransits: number } | null;
}
