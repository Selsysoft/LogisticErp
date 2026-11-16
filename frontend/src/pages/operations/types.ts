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
  /** 12.7: nakliye türü (ZTO "Sevk Nakliye" / "Gemi Nakliye"); varsayılan ROAD. */
  transportMode: TransportMode;
}

/** 12.7 (§2.2): etap nakliye türü. */
export type TransportMode = "ROAD" | "SEA" | "RAIL" | "AIR";
/** 12.7 (§2.2): sefer gideri durumu; taşeron gideri kaydedilince POSTED (Y6). */
export type TripCostStatus = "OPEN" | "POSTED" | "REVERSED";

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
  // 12.7 (§4.3): taşeron gideri alanları; tutarlar ondalık metin. `money` net, cariye yazılan
  // `payableAmount` = net + KDV − tevkifat − kesinti (OK-12.7-3).
  status: TripCostStatus;
  vatAmount: string;
  withholdingAmount: string;
  deductionAmount: string;
  payableAmount: string;
  documentNo: string | null;
  documentType: string | null;
  /** Takvim tarihi `"YYYY-MM-DD"`. */
  costDate: string | null;
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
  /** Kabul edilmiş teklif satırları; şirketi (12.1 §3.13) seçili iş yerinin şirketine göre süzülür. */
  acceptedQuoteLines: { id: string; label: string; accountId: string; companyId: string | null }[];
}

// ---------------------------------------------------------------------------------------------
// 12.7 — Sevk Nakliye Masrafları / taşeron gideri (12.7_TASARIM §4.3). Ad kuralı: TS adı = record
// adı − `Response`; `CurrencyAmount` kullanılmaz (Rev 1 F3). Tutarlar ondalık metin; tarihler
// takvim tarihi `"YYYY-MM-DD"`.
// ---------------------------------------------------------------------------------------------

/** Şema `SubcontractCurrencyAmountResponse`. */
export interface SubcontractCurrencyAmount {
  currency: string;
  amount: string;
}

/** Şema `SubcontractCarrierRowResponse` (STI firma satırı). */
export interface SubcontractCarrierRow {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  /** Seferlerin şirket adları (OK-12.7-12). */
  companyNames: string | null;
  phone: string | null;
  city: string | null;
  district: string | null;
  legCount: number;
  netTotals: SubcontractCurrencyAmount[];
  payableTotals: SubcontractCurrencyAmount[];
}

/** Şema `SubcontractSummaryResponse` (`GET /shipment/subcontract-costs/summary`). */
export interface SubcontractSummary {
  carriers: SubcontractCarrierRow[];
  carrierCount: number;
  legCount: number;
  netTotals: SubcontractCurrencyAmount[];
}

/** Şema `SubcontractLedgerRefResponse` (cariye yazılan hareket). */
export interface SubcontractLedgerRef {
  transactionId: string;
  transactionDate: string;
  description: string | null;
}

/**
 * Şema `SubcontractCostRowResponse` (CSD satırı = taşerona verilen etap). Gider yoksa `costId` ve
 * sonrası null. `totalAmount` = net + KDV; `advanceAmount` her zaman 0 (OK-12.7-7).
 */
export interface SubcontractCostRow {
  shipmentId: string;
  shipmentNumber: string;
  legId: string;
  legSequenceNo: number;
  shipmentStatus: ShipmentStatus;
  customerName: string | null;
  cargoDescription: string | null;
  freightInvoiceNumber: string | null;
  vehiclePlate: string | null;
  trailerPlate: string | null;
  driverName: string | null;
  branchId: string;
  branchName: string;
  loadingDate: string | null;
  transportMode: TransportMode;
  carrierAccountId: string | null;
  carrierName: string | null;
  costId: string | null;
  status: TripCostStatus | null;
  money: Money | null;
  vatAmount: string | null;
  withholdingAmount: string | null;
  deductionAmount: string | null;
  totalAmount: string | null;
  payableAmount: string | null;
  advanceAmount: string | null;
  documentNo: string | null;
  documentType: string | null;
  costDate: string | null;
  exchangeRate: string | null;
  description: string | null;
  postedAt: string | null;
  ledger: SubcontractLedgerRef | null;
}

/** Şema `SubcontractCarrierDetailResponse` (`GET /shipment/subcontract-costs?carrierAccountId`). */
export interface SubcontractCarrierDetail {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  rows: SubcontractCostRow[];
  netTotals: SubcontractCurrencyAmount[];
  payableTotals: SubcontractCurrencyAmount[];
}

/** `PUT /shipment/shipments/{id}/legs/{legId}/subcontract-cost` (kaydet + cariye işle, Y6). */
export type SaveSubcontractCostRequest = {
  /** Net tutar. */
  money: Money;
  vatAmount: string;
  withholdingAmount: string;
  deductionAmount: string;
  documentNo?: string | null;
  documentType?: string | null;
  costDate: string;
  exchangeRate?: string | null;
  description?: string | null;
  /** ZTO formu göndermez; API için (§3.3.1 #9). */
  transportMode?: TransportMode | null;
};

/** `POST /shipment/subcontract-costs/{costId}/reverse` (`ReverseCostRequest`). */
export type ReverseCostRequest = { date: string; reason: string };
