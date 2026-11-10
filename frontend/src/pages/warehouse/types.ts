import { Money } from "../finance/types";

export type CustomsStatus = "NONE" | "UNDER_BOND" | "CLEARED";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId: string;
  address: string | null;
  bonded: boolean;
  customsNo: string | null;
}

export interface Bin {
  id: string;
  warehouseId: string;
  code: string;
  description: string | null;
}

export interface StockItem {
  id: string;
  accountId: string;
  accountName: string;
  sku: string;
  name: string;
  unit: string;
  unitsPerBillingUnit: number;
}

export interface Balance {
  id: string;
  warehouseId: string;
  warehouseName: string;
  binId: string;
  binCode: string;
  itemId: string;
  sku: string;
  itemName: string;
  unit: string;
  accountId: string;
  accountName: string;
  lotNo: string;
  expiryDate: string | null;
  customsStatus: CustomsStatus;
  quantity: number;
}

export interface Movement {
  id: string;
  type: string;
  warehouseName: string;
  binCode: string;
  sku: string;
  itemName: string;
  accountName: string;
  lotNo: string;
  customsStatus: CustomsStatus;
  quantity: number;
  movedOn: string;
  reference: string | null;
  createdBy: string;
  reversible: boolean;
}

export interface CountLine {
  id: string;
  binCode: string;
  sku: string;
  itemName: string;
  accountName: string;
  lotNo: string;
  customsStatus: CustomsStatus;
  systemQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
}

export interface CountSummary {
  id: string;
  number: string;
  warehouseId: string;
  warehouseName: string;
  date: string;
  status: "OPEN" | "POSTED";
}

export interface CountDetail {
  count: CountSummary;
  lines: CountLine[];
}

export interface Contract {
  id: string;
  accountId: string;
  accountName: string;
  warehouseId: string;
  warehouseName: string;
  startDate: string;
  endDate: string;
  currency: string;
  storageBasis: string;
  storageRate: number;
  taxRateId: string | null;
}

export interface Rate {
  id: string;
  kind: string;
  unitPrice: number;
}

export interface Handling {
  id: string;
  kind: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  chargedOn: string;
  invoiceId: string | null;
  note: string | null;
}

export interface InvoicePreview {
  storageQuantity: number;
  storage: Money;
  handling: Money;
  net: Money;
  vat: Money;
  withholding: Money;
  total: Money;
}

export interface WarehouseInvoice extends InvoicePreview {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  invoiceDate: string;
  dueDate: string;
  status: "ISSUED" | "CANCELLED";
}

export interface WarehouseOptions {
  customers: { id: string; label: string }[];
  taxRates: { id: string; label: string }[];
  shipments: { id: string; label: string }[];
}
