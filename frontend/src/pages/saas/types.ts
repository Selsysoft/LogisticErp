export type TenantStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "CLOSED" | "FAILED";
export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
export type SuspendReason = "TRIAL_ENDED" | "PAYMENT" | "MANUAL";
export type LimitedResource = "USERS" | "VEHICLES" | "SHIPMENTS_MONTH";

export interface LimitUsage {
  resource: LimitedResource;
  used: number;
  limit: number | null;
  warning: boolean;
  reached: boolean;
}

export interface TenantOverview {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  planId: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  suspendReason: SuspendReason | null;
  trialEndsOn: string | null;
  nextBillingOn: string | null;
  limits: LimitUsage[];
  online: { active: number; idle: number; disconnected: number };
  openInvoices: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  monthlyPrice: string;
  currency: string;
  maxUsers: number | null;
  maxVehicles: number | null;
  maxShipmentsMonth: number | null;
  active: boolean;
}

export interface SaasInvoice {
  id: string;
  tenantCode: string | null;
  number: string;
  planName: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  status: "ISSUED" | "PAID" | "VOID";
  issuedOn: string;
  dueOn: string;
  paidOn: string | null;
  paymentRef: string | null;
  failedAttempts: number;
  reminderCount: number;
}

export interface Health {
  status: "OK" | "DEGRADED" | "CRITICAL";
  issues: string[];
  databaseUp: boolean;
  databaseMillis: number;
  connectionsActive: number;
  connectionsIdle: number;
  connectionsWaiting: number;
  requests: number;
  serverErrors: number;
  slowestEndpoints: { endpoint: string; count: number; meanMillis: number; maxMillis: number }[];
  tenantsByStatus: Partial<Record<TenantStatus, number>>;
  onlineActive: number;
  onlineIdle: number;
  overdueInvoices: number;
  dependencies: Dependency[];
}

export interface Dependency {
  key: string;
  name: string;
  state: "UP" | "DOWN" | "WARNING" | "NOT_CONFIGURED";
  detail: string;
  millis: number;
  essential: boolean;
}

export interface AuditRow {
  id: string;
  eventType: string;
  actorEmail: string | null;
  target: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface MySubscription {
  planName: string;
  monthlyPrice: string;
  currency: string;
  status: SubscriptionStatus;
  trialEndsOn: string | null;
  nextBillingOn: string | null;
  limits: LimitUsage[];
  invoices: SaasInvoice[];
}
