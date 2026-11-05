import { Money } from "../finance/types";

export interface EDocumentSettings {
  taxNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  provider: string;
  testProvider: boolean;
}

export interface EDocument {
  id: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  sourceNo: string;
  ettn: string;
  provider: string;
  status: "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  message: string | null;
}

export interface EDocumentCandidate {
  id: string;
  sourceType: "FREIGHT_INVOICE" | "WAYBILL";
  label: string;
}

export interface ImportBatch {
  id: string;
  kind: "TOLL" | "FUEL";
  fileName: string;
  accountName: string;
  duplicates: number;
  createdAt: string;
}

export interface ImportRow {
  id: string;
  lineNo: number;
  plate: string | null;
  occurredAt: string | null;
  place: string | null;
  money: Money | null;
  liters: string | null;
  shipmentNumber: string | null;
  status: "MATCHED" | "UNMATCHED" | "ERROR" | "POSTED" | "IGNORED";
  message: string | null;
}

export interface ImportDetail {
  batch: ImportBatch;
  rows: ImportRow[];
}

export interface VehiclePosition {
  vehicleId: string;
  plate: string;
  recordedAt: string;
  latitude: string;
  longitude: string;
  speedKmh: string | null;
  shipmentId: string | null;
  shipmentNumber: string | null;
}

export interface Geofence {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  radiusM: number;
}

export interface GeofenceEvent {
  id: string;
  geofenceName: string;
  plate: string;
  shipmentNumber: string | null;
  type: "ENTER" | "EXIT";
  occurredAt: string;
}

export interface StatementLine {
  id: string;
  date: string;
  amount: string;
  description: string | null;
  reference: string | null;
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  matchedDescription: string | null;
}

export interface OpenTransaction {
  id: string;
  date: string;
  amount: string;
  description: string | null;
}

export interface Reconciliation {
  matched: number;
  unmatched: number;
  ignored: number;
  unmatchedTotal: string;
}

export interface StatementImportResult {
  imported: number;
  duplicates: number;
  matched: number;
  errors: string[];
}

export interface RouteDistance {
  id: string;
  origin: string;
  destination: string;
  distanceKm: string;
  minutes: number;
}

export interface IntegrationOptions {
  shipments: { id: string; label: string }[];
  accounts: { id: string; label: string }[];
  bankAccounts: { id: string; label: string }[];
}
