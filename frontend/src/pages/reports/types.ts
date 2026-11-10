export type ProfitGroup = "SHIPMENT" | "CUSTOMER" | "ROUTE" | "VEHICLE" | "OWNERSHIP";

export interface ProfitRow {
  key: string;
  label: string;
  shipments: number;
  revenueTl: number;
  costTl: number;
  marginTl: number;
  marginPercent: number | null;
}

export interface ProfitReport {
  rows: ProfitRow[];
  totalElements: number;
  revenueTl: number;
  costTl: number;
  marginTl: number;
  marginPercent: number | null;
}

export interface KpiReport {
  shipments: number;
  cancelled: number;
  delivered: number;
  onTime: number;
  onTimePercent: number | null;
  averageFreightTl: number | null;
  averageFillPercent: number | null;
}

export interface DriverRow {
  driverId: string;
  driverName: string;
  shipments: number;
  delivered: number;
  onTime: number;
  onTimePercent: number | null;
}

export interface ForecastRow {
  weekStart: string | null;
  overdue: boolean;
  currency: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface PositionRow {
  currency: string;
  cash: number;
  receivable: number;
  payable: number;
  net: number;
}

export interface SettlementPerformanceRow {
  currency: string;
  collected: number;
  paid: number;
  collections: number;
  payments: number;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
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
