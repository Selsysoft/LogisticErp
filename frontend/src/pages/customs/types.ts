import { Money } from "../finance/types";

export interface DeclarationLine {
  id: string;
  hsCode: string;
  description: string;
  quantity: string | null;
  weightKg: string | null;
  value: string;
}

export type DeclarationStatus = "DRAFT" | "SUBMITTED" | "CLEARED" | "REJECTED" | "CANCELLED";

export interface Declaration {
  id: string;
  number: string;
  shipmentId: string;
  shipmentNumber: string;
  type: string;
  customsOffice: string;
  registrationNo: string | null;
  declaredOn: string;
  status: DeclarationStatus;
  totalValue: Money;
  lines: DeclarationLine[];
}

export interface Transit {
  id: string;
  shipmentId: string;
  shipmentNumber: string;
  kind: string;
  documentNo: string;
  departureOffice: string;
  destinationOffice: string;
  guarantee: Money;
  issuedOn: string;
  deadline: string;
  dischargedOn: string | null;
  status: "OPEN" | "DISCHARGED" | "CANCELLED";
  overdue: boolean;
}

export interface PermitUsage {
  id: string;
  shipmentId: string;
  shipmentNumber: string;
  usedOn: string;
}

export interface Permit {
  id: string;
  number: string;
  kind: string;
  country: string;
  validFrom: string;
  validTo: string;
  quota: number;
  used: number;
  usages: PermitUsage[];
}

export interface Crossing {
  id: string;
  shipmentId: string;
  shipmentNumber: string;
  gate: string;
  direction: string;
  crossedOn: string;
  fee: Money | null;
  accountName: string | null;
  posted: boolean;
  note: string | null;
}

export interface CustomsOptions {
  shipments: { id: string; label: string }[];
  feeAccounts: { id: string; label: string }[];
}
