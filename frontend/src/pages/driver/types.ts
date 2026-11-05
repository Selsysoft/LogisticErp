import { Money } from "../finance/types";

export type TripStatus = "PLANNED" | "LOADED" | "IN_TRANSIT" | "DELIVERED";
export type EventKind = "LOADED" | "IN_TRANSIT" | "BREAK" | "UNLOADED";
export type ExpenseKind = "FUEL" | "TOLL" | "PER_DIEM" | "OTHER";
export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Trip {
  id: string;
  number: string;
  status: TripStatus;
  origin: string;
  destination: string;
  plannedPickup: string;
  plannedDelivery: string;
  shipperName: string;
  consigneeName: string;
  legs: {
    sequenceNo: number;
    origin: string;
    destination: string;
    plannedStart: string;
    plannedEnd: string;
    plate: string | null;
  }[];
  cargo: { description: string; weightKg: string | null }[];
}

export interface MyExpense {
  id: string;
  shipmentId: string;
  kind: ExpenseKind;
  money: Money;
  date: string;
  description: string | null;
  status: ExpenseStatus;
  reviewNote: string | null;
}

export interface ReviewExpense {
  id: string;
  driverName: string | null;
  shipmentId: string;
  shipmentNumber: string | null;
  kind: ExpenseKind;
  money: Money;
  date: string;
  description: string | null;
  status: ExpenseStatus;
  reviewNote: string | null;
  receiptFileId: string | null;
}
