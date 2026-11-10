import { Money } from "../finance/types";

export interface Customer {
  id: string;
  code: string;
  name: string;
  type: string;
  taxNumber: string | null;
  segment: string | null;
  tags: string[];
}

export interface Contact {
  id: string;
  accountId: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notifyDepartures: boolean;
  notifyDeliveries: boolean;
}

export interface Opportunity {
  id: string;
  accountId: string;
  title: string;
  stage: "LEAD" | "QUALIFIED" | "QUOTE" | "WON" | "LOST";
  money: Money;
  ownerEmail: string;
  expectedCloseDate: string | null;
  lostReason: string | null;
}

export interface Activity {
  id: string;
  accountId: string;
  opportunityId: string | null;
  type: string;
  subject: string;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface TaxRate {
  id: string;
  code: string;
  name: string;
  vatPercent: number;
  withholdingNumerator: number;
  withholdingDenominator: number;
}

export interface Tariff {
  id: string;
  code: string;
  name: string;
  currency: string;
  accountId: string | null;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  fuelSurchargePercent: number | null;
  waitingHourlyFee: number | null;
  extraStopFee: number | null;
  adrPercent: number | null;
  insurancePercent: number | null;
  taxRateId: string | null;
}

export interface TariffLine {
  id: string;
  tariffId: string;
  kind: "ROUTE" | "DISTANCE";
  origin: string | null;
  destination: string | null;
  vehicleType: string | null;
  unit: string;
  unitPrice: number;
  minAmount: number | null;
}

export interface PriceComponent {
  code: string;
  basis: string;
  amount: number;
}

export interface PriceBreakdown {
  source: string;
  tariffId: string | null;
  tariffCode: string | null;
  contractId: string | null;
  tariffLineId: string | null;
  currency: string;
  components: PriceComponent[];
  net: number;
  vatPercent: number;
  vat: number;
  withholding: number;
  total: number;
}

export interface QuoteLine {
  id: string;
  origin: string;
  destination: string;
  vehicleType: string | null;
  weightTon: number | null;
  pallets: number | null;
  distanceKm: number | null;
  description: string | null;
  net: number;
  vat: number;
  withholding: number;
  total: number;
  breakdown: PriceBreakdown;
}

export interface Quote {
  id: string;
  number: string;
  version: number;
  accountId: string;
  opportunityId: string | null;
  tariffId: string | null;
  taxRateId: string | null;
  currency: string;
  validUntil: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";
  net: Money;
  vat: Money;
  withholding: Money;
  total: Money;
  notes: string | null;
  lines: QuoteLine[];
}

export interface Contract {
  id: string;
  number: string;
  accountId: string;
  quoteId: string | null;
  tariffId: string | null;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "ENDED" | "CANCELLED";
  paymentTermDays: number | null;
  fuelSurchargePercent: number | null;
  waitingHourlyFee: number | null;
  specialTerms: string | null;
}

export interface Dashboard {
  funnel: { stage: string; currency: string; count: number; total: string }[];
  winRatePercent: number;
  owners: { ownerEmail: string; open: number; won: number; lost: number }[];
  upcomingActivities: Activity[];
}

export interface StoredFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
}
