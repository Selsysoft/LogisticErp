import { Money } from "../finance/types";

export interface Vehicle {
  id: string;
  plate: string;
  kind: string;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  capacityTon: number | null;
  capacityM3: number | null;
  capacityPallet: number | null;
  fuelType: string | null;
  ownership: string;
  status: string;
  branchId: string | null;
  odometerKm: number | null;
}

export interface Driver {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  licenseClass: string | null;
  status: string;
  accountId: string;
  branchId: string | null;
}

export interface ComplianceDocument {
  id: string;
  docType: string;
  number: string | null;
  issuedOn: string | null;
  expiresOn: string;
}

export interface ResourceBlock {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface VehicleExpense {
  id: string;
  vehicleId: string;
  kind: string;
  expenseDate: string;
  odometerKm: number | null;
  description: string | null;
  money: Money;
  tlAmount: number;
  liters: number | null;
  station: string | null;
  tirePosition: string | null;
  nextDueDate: string | null;
  nextDueKm: number | null;
}

export interface Reminder {
  type: "DOCUMENT" | "MAINTENANCE_DATE" | "MAINTENANCE_KM";
  subjectType: "VEHICLE" | "DRIVER";
  subjectId: string;
  subjectName: string;
  docType: string | null;
  dueDate: string | null;
  dueKm: number | null;
  currentKm: number | null;
  overdue: boolean;
}

export interface AvailabilityRow {
  subjectType: "VEHICLE" | "DRIVER";
  subjectId: string;
  name: string;
  availability: "AVAILABLE" | "WARNING" | "BLOCKED";
  issues: string[];
}

export interface FuelConsumption {
  averageLitersPer100Km: number | null;
  rows: {
    expenseId: string;
    date: string;
    odometerKm: string;
    liters: string;
    distanceKm: string | null;
    litersPer100Km: string | null;
    anomaly: boolean;
  }[];
}

export interface VehicleCost {
  vehicleId: string;
  plate: string;
  maintenanceTl: number;
  repairTl: number;
  tireTl: number;
  fuelTl: number;
  totalTl: number;
  liters: number;
  distanceKm: number;
  litersPer100Km: number | null;
  costPerKmTl: number | null;
}

export interface FleetOptions {
  suppliers: { id: string; label: string }[];
  funds: { id: string; label: string; kind: string; currency: string }[];
}

export interface FleetSettings {
  blockOnExpired: boolean;
  reminderDays: number;
  reminderEmail: boolean;
}
