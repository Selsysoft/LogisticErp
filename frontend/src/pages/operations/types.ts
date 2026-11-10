import { Money } from "../finance/types";
import { PriceBreakdown } from "../crm/types";
import { AvailabilityRow } from "../fleet/types";

export type ShipmentStatus =
  | "QUOTED"
  | "PLANNED"
  | "LOADED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "INVOICED"
  | "CLOSED"
  | "CANCELLED";

export interface Cargo {
  id: string;
  description: string;
  quantity: number | null;
  packaging: string | null;
  weightKg: number | null;
  volumeM3: number | null;
  adrClass: string | null;
  unNumber: string | null;
}

export interface Leg {
  id: string;
  sequenceNo: number;
  origin: string;
  destination: string;
  plannedStart: string;
  plannedEnd: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  trailerId: string | null;
  trailerPlate: string | null;
  driverId: string | null;
  driverName: string | null;
  carrierAccountId: string | null;
  carrierName: string | null;
}

export interface ShipmentSummary {
  id: string;
  number: string;
  accountId: string;
  accountName: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  plannedPickup: string;
  plannedDelivery: string;
  net: Money;
  total: Money;
}

export interface Shipment extends ShipmentSummary {
  branchId: string;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  vehicleType: string | null;
  distanceKm: number | null;
  vat: Money;
  withholding: Money;
  breakdown: PriceBreakdown;
  notes: string | null;
  cargo: Cargo[];
  legs: Leg[];
  international: boolean;
  originCountry: string | null;
  destinationCountry: string | null;
  incoterm: string | null;
  liabilityPolicy: string | null;
  senderInstructions: string | null;
  attachedDocuments: string | null;
}

export interface ShipmentEvent {
  id: string;
  type: "STATUS" | "EXCEPTION" | "NOTE";
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus | null;
  message: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Candidates {
  vehicles: AvailabilityRow[];
  trailers: AvailabilityRow[];
  drivers: AvailabilityRow[];
}

export interface BoardRow {
  shipmentId: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  leg: Leg;
}

export interface Pod {
  id: string;
  recipientName: string;
  deliveredAt: string;
  note: string | null;
  createdBy: string;
}

export interface ShipmentDocument {
  id: string;
  type: "CMR" | "WAYBILL";
  number: string;
  status: "DRAFT" | "ISSUED";
}

export interface FreightInvoice {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  net: Money;
  vat: Money;
  withholding: Money;
  total: Money;
  status: "ISSUED" | "CANCELLED";
}

export interface TripCost {
  id: string;
  kind: string;
  accountName: string | null;
  vehicleExpenseId: string | null;
  money: Money;
  tlAmount: number;
  description: string | null;
  postedAt: string | null;
}

export interface LinkableExpense {
  id: string;
  plate: string;
  date: string;
  kind: string;
  money: Money;
}

export interface Profit {
  shipmentId: string;
  number: string;
  accountName: string;
  status: ShipmentStatus;
  revenueTl: number | null;
  costTl: number;
  marginTl: number | null;
  marginPercent: number | null;
  invoiced: boolean;
}

export interface ShipmentOptions {
  customers: { id: string; label: string }[];
  carriers: { id: string; label: string }[];
  costAccounts: { id: string; label: string }[];
  tariffs: { id: string; label: string }[];
  taxRates: { id: string; label: string }[];
  acceptedQuoteLines: { id: string; label: string; accountId: string }[];
}
