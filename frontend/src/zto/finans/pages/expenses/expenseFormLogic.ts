import {
  addDec,
  cmpDec,
  fromScaled,
  mulDec,
  percentOf,
  subDec,
  sumDec,
  tryScaled,
} from "../../../decimal";
import type {
  AccountDocumentType,
  ExpenseContextType,
  ExpenseDepartment,
  ExpenseDetail,
  ExpenseItem,
  ExpensePaymentMethod,
  SaveExpenseLineRequest,
  SaveExpenseRequest,
} from "../../../../pages/finance/types";
import { compareIsoDate, isIsoDate } from "./expenseDates";

/*
 * Genel Masraf formu (PEA/PEE; 12.7_TASARIM §5.6) saf mantığı. Hesaplar sunucu `ExpenseCalculator`
 * (§3.2.3) ile birebir: her ara sonuç 2 haneye HALF_UP, tek adımda (`mulDec(q, p, 2)`,
 * `percentOf(x, r, 2)`); 4 haneye sonra 2 haneye yuvarlamak sunucudan farklı sonuç verebilir.
 * İstemci hesapları yalnız gösterim içindir; istek yalnız girdi alanlarını taşır (`toRequest`).
 * Doğrulama iletileri i18n anahtarıdır (`expenses.form.errors.<message>`).
 */

/** ZTO `DetailsJson` sınırı ve sunucu `@Size(max = 100)`. */
export const MAX_LINES = 100;
export const INVOICE_NUMBER_MAX = 50;
export const DESCRIPTION_MAX = 500;
export const LINE_DESCRIPTION_MAX = 300;
export const LINE_UNIT_MAX = 20;
export const REASON_MAX = 500;
/** ZTO yükleme sınırı: 10 MB. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILE_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "doc",
  "docx",
  "xls",
  "xlsx",
] as const;
/** `<input type=file accept>` (ZTO Add.cshtml:445). */
export const FILE_ACCEPT = ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
export const DEFAULT_DOCUMENT_TYPE = "ALIS_FATURASI";
export const DEFAULT_VAT_RATE = "20";
export const BASE_CURRENCY = "TRY";

/** 10 lojistik departman, ZTO sırası yerine `ExpenseDepartment` sırası (OK-12.7-19). */
export const DEPARTMENTS: readonly ExpenseDepartment[] = [
  "OPERATION",
  "FLEET",
  "WAREHOUSE",
  "CUSTOMS",
  "ADMIN",
  "ACCOUNTING",
  "SALES",
  "IT",
  "HR",
  "OTHER",
];

export const CONTEXT_TYPES: readonly ExpenseContextType[] = [
  "GENERAL",
  "VEHICLE",
  "SHIPMENT",
  "WAREHOUSE",
  "DRIVER",
];

export const PAYMENT_METHODS: readonly ExpensePaymentMethod[] = ["ACCOUNT", "CASH", "BANK"];

/** ZTO GIF'leri yerine Font Awesome bağlam ikonları (§5.3). */
export const CONTEXT_ICONS: Record<ExpenseContextType, string> = {
  GENERAL: "fas fa-building",
  VEHICLE: "fas fa-truck",
  SHIPMENT: "fas fa-route",
  WAREHOUSE: "fas fa-warehouse",
  DRIVER: "fas fa-id-card",
};

// ---------------------------------------------------------------------------------------------
// Satır hesapları (§3.2.3)
// ---------------------------------------------------------------------------------------------

/** Kart girdisi: `<input type=number>` metinleri ("" boş). `key` React anahtarıdır. */
export type LineInput = {
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountRate: string;
  vatRate: string;
  withholdingAmount: string;
  otherTaxAmount: string;
};

export type LineComputed = {
  subTotal: string;
  discountAmount: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
};

export type Totals = LineComputed & { withholdingAmount: string; otherTaxAmount: string };

/** Geçersiz/boş metin 0 sayılır (gösterim; doğrulama ayrı). */
function num(value: string | null | undefined): string {
  const scaled = tryScaled(value ?? "");
  return scaled === null ? "0" : fromScaled(scaled);
}

/**
 * sub = round2(q × p); discount = round2(sub × d / 100); net = sub − discount;
 * vat = round2(net × v / 100); total = net + vat + other − withholding (ZTO hatası düzeltildi:
 * diğer vergiler eklenir, OK-12.7-14).
 */
export function computeLine(input: Omit<LineInput, "key" | "description" | "unit">): LineComputed {
  const subTotal = mulDec(num(input.quantity), num(input.unitPrice), 2);
  const discountAmount = percentOf(subTotal, num(input.discountRate), 2);
  const netAmount = subDec(subTotal, discountAmount);
  const vatAmount = percentOf(netAmount, num(input.vatRate), 2);
  const totalAmount = subDec(
    addDec(addDec(netAmount, vatAmount), num(input.otherTaxAmount)),
    num(input.withholdingAmount),
  );
  return { subTotal, discountAmount, netAmount, vatAmount, totalAmount };
}

/** Başlık: her alan satır toplamıdır. */
export function computeTotals(lines: readonly LineInput[]): Totals {
  const computed = lines.map((line) => computeLine(line));
  const sum = (pick: (line: LineComputed) => string) => sumDec(computed.map(pick));
  return {
    subTotal: sum((line) => line.subTotal),
    discountAmount: sum((line) => line.discountAmount),
    netAmount: sum((line) => line.netAmount),
    vatAmount: sum((line) => line.vatAmount),
    withholdingAmount: sumDec(lines.map((line) => num(line.withholdingAmount))),
    otherTaxAmount: sumDec(lines.map((line) => num(line.otherTaxAmount))),
    totalAmount: sum((line) => line.totalAmount),
  };
}

let lineSeq = 0;

/** Yeni kart: Miktar 1, KDV %20, birim kalemin `defaultUnit` değeri (ZTO addDetailCard). */
export function emptyLine(defaultUnit?: string | null): LineInput {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    description: "",
    quantity: "1",
    unit: defaultUnit ?? "",
    unitPrice: "",
    discountRate: "0",
    vatRate: DEFAULT_VAT_RATE,
    withholdingAmount: "0",
    otherTaxAmount: "0",
  };
}

// ---------------------------------------------------------------------------------------------
// Form durumu
// ---------------------------------------------------------------------------------------------

export type ExpenseFormState = {
  expenseTypeId: string;
  expenseItemId: string;
  invoiceNumber: string;
  paymentMethod: ExpensePaymentMethod | "";
  supplierAccountId: string;
  supplierLabel: string;
  fundAccountId: string;
  currency: string;
  exchangeRate: string;
  department: ExpenseDepartment | "";
  branchId: string;
  invoiceDate: string;
  dueDate: string;
  contextType: ExpenseContextType;
  contextId: string;
  contextLabel: string;
  description: string;
  documentType: string;
  /** Yalnız düzenlemede: "Düzeltme Gerekçesi". */
  reason: string;
  lines: LineInput[];
};

export function initialState(today: string): ExpenseFormState {
  return {
    expenseTypeId: "",
    expenseItemId: "",
    invoiceNumber: "",
    paymentMethod: "ACCOUNT",
    supplierAccountId: "",
    supplierLabel: "",
    fundAccountId: "",
    currency: BASE_CURRENCY,
    exchangeRate: "",
    department: "",
    branchId: "",
    invoiceDate: today,
    dueDate: "",
    contextType: "GENERAL",
    contextId: "",
    contextLabel: "",
    description: "",
    documentType: DEFAULT_DOCUMENT_TYPE,
    reason: "",
    lines: [emptyLine()],
  };
}

function contextIdOf(detail: ExpenseDetail): string {
  switch (detail.contextType) {
    case "VEHICLE":
      return detail.vehicleId ?? "";
    case "SHIPMENT":
      return detail.shipmentId ?? "";
    case "WAREHOUSE":
      return detail.warehouseId ?? "";
    case "DRIVER":
      return detail.driverId ?? "";
    default:
      return "";
  }
}

/** Düzenleme (PEE loadExistingDetails): kaydın alanları ve satırları forma. */
export function stateFromDetail(
  detail: ExpenseDetail,
  items: readonly ExpenseItem[] | undefined,
): ExpenseFormState {
  const item = items?.find((candidate) => candidate.id === detail.expenseItemId);
  return {
    expenseTypeId: item?.expenseTypeId ?? "",
    expenseItemId: detail.expenseItemId,
    invoiceNumber: detail.invoiceNumber ?? "",
    paymentMethod: detail.paymentMethod,
    supplierAccountId: detail.supplierAccountId ?? "",
    supplierLabel: detail.supplierName ?? "",
    fundAccountId: detail.fundAccountId ?? "",
    currency: detail.currency,
    exchangeRate: detail.currency === BASE_CURRENCY ? "" : (detail.exchangeRate ?? ""),
    department: detail.department,
    branchId: detail.branchId,
    invoiceDate: detail.invoiceDate,
    dueDate: detail.dueDate ?? "",
    contextType: detail.contextType,
    contextId: contextIdOf(detail),
    contextLabel: detail.contextLabel ?? "",
    description: detail.description ?? "",
    documentType: detail.documentType,
    reason: "",
    lines: detail.lines.map((line) => ({
      ...emptyLine(),
      description: line.description ?? "",
      quantity: line.quantity,
      unit: line.unit ?? "",
      unitPrice: line.unitPrice,
      discountRate: line.discountRate,
      vatRate: line.vatRate,
      withholdingAmount: line.withholdingAmount,
      otherTaxAmount: line.otherTaxAmount,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Seçenekler
// ---------------------------------------------------------------------------------------------

/** Türe bağlı aktif kalemler; düzenlemede mevcut kalem pasif olsa da listede kalır. */
export function itemOptionsFor(
  items: readonly ExpenseItem[] | undefined,
  expenseTypeId: string,
  keepId?: string,
): ExpenseItem[] {
  if (!expenseTypeId) return [];
  return (items ?? [])
    .filter(
      (item) =>
        item.expenseTypeId === expenseTypeId && (item.active || (!!keepId && item.id === keepId)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** ZTO'nun 10 belge türü: PAYABLE + OTHER + selectable, `sortOrder` sırası. */
export function documentTypeOptions(
  types: readonly AccountDocumentType[] | undefined,
): AccountDocumentType[] {
  return (types ?? [])
    .filter((type) => type.side === "PAYABLE" && type.audience === "OTHER" && type.selectable)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---------------------------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------------------------

export type LineField =
  | "description"
  | "quantity"
  | "unit"
  | "unitPrice"
  | "discountRate"
  | "vatRate"
  | "withholdingAmount"
  | "otherTaxAmount";

/** Kart alanının DOM kimliği (etiket `for`, hata eşleme ve odak). */
export function lineFieldId(index: number, field: LineField): string {
  return `detail-${index}-${field}`;
}

/** Üst alanların DOM kimlikleri (ZTO id'leri korunur). */
export const FIELD_IDS = {
  expenseTypeId: "expenseTypeId",
  expenseItemId: "expenseItemId",
  invoiceNumber: "InvoiceNumber",
  paymentMethod: "paymentMethod",
  supplierAccountId: "supplierAccountSearch",
  fundAccountId: "fundAccountId",
  currency: "CurrencyID",
  exchangeRate: "ExchangeRate",
  department: "Department",
  branchId: "WorkPlaceID",
  invoiceDate: "CreationDate",
  dueDate: "DueDate",
  contextType: "contextType",
  contextId: "contextId",
  description: "Description",
  documentType: "DocumentType",
  reason: "ReviseReason",
  lines: "expenseDetailsContainer",
} as const;

export type FormField = keyof typeof FIELD_IDS;

export type FormError = {
  /** DOM kimliği (`FIELD_IDS` ya da `lineFieldId`). */
  field: string;
  /** `expenses.form.errors.<message>` anahtarı. */
  message: string;
};

type Mode = "new" | "edit";

/** Boş ya da ≥ 0 olmayan metin geçersizdir; `allowBlank` boşu kabul eder. */
function decimalState(value: string, allowBlank: boolean): "blank" | "invalid" | "ok" {
  if (value.trim() === "") return allowBlank ? "blank" : "invalid";
  return tryScaled(value) === null ? "invalid" : "ok";
}

function rateInRange(value: string): boolean {
  return cmpDec(value, "0") >= 0 && cmpDec(value, "100") <= 0;
}

function validateLine(line: LineInput, index: number, errors: FormError[]) {
  const id = (field: LineField) => lineFieldId(index, field);
  if (line.description.trim().length > LINE_DESCRIPTION_MAX) {
    errors.push({ field: id("description"), message: "lineDescriptionTooLong" });
  }
  if (decimalState(line.quantity, false) !== "ok" || cmpDec(line.quantity, "0") <= 0) {
    errors.push({ field: id("quantity"), message: "quantityInvalid" });
  }
  if (line.unit.trim().length > LINE_UNIT_MAX) {
    errors.push({ field: id("unit"), message: "unitTooLong" });
  }
  if (decimalState(line.unitPrice, false) !== "ok" || cmpDec(line.unitPrice, "0") < 0) {
    errors.push({ field: id("unitPrice"), message: "unitPriceInvalid" });
  }
  const discount = decimalState(line.discountRate, true);
  if (discount === "invalid" || (discount === "ok" && !rateInRange(line.discountRate))) {
    errors.push({ field: id("discountRate"), message: "rateInvalid" });
  }
  if (decimalState(line.vatRate, false) !== "ok" || !rateInRange(line.vatRate)) {
    errors.push({ field: id("vatRate"), message: "vatRateInvalid" });
  }
  const badAmounts = (["withholdingAmount", "otherTaxAmount"] as const).filter((field) => {
    const state = decimalState(line[field], true);
    const ok = state === "blank" || (state === "ok" && cmpDec(line[field], "0") >= 0);
    if (!ok) errors.push({ field: id(field), message: "amountNegative" });
    return !ok;
  });
  if (badAmounts.length > 0) return;
  const computed = computeLine(line);
  if (cmpDec(num(line.withholdingAmount), computed.vatAmount) > 0) {
    errors.push({ field: id("withholdingAmount"), message: "withholdingExceedsVat" });
  } else if (cmpDec(computed.totalAmount, "0") < 0) {
    errors.push({ field: id("withholdingAmount"), message: "lineTotalNegative" });
  }
}

/**
 * Gönderim öncesi denetim (sunucu kurallarının istemci karşılığı). Sıra DOM sırasıdır: ilk hata
 * odaklanır.
 */
export function validateForm(state: ExpenseFormState, mode: Mode = "new"): FormError[] {
  const errors: FormError[] = [];
  const push = (field: FormField, message: string) =>
    errors.push({ field: FIELD_IDS[field], message });

  if (!state.expenseTypeId) push("expenseTypeId", "expenseTypeRequired");
  if (!state.expenseItemId) push("expenseItemId", "expenseItemRequired");
  if (state.invoiceNumber.trim().length > INVOICE_NUMBER_MAX) {
    push("invoiceNumber", "invoiceNumberTooLong");
  }
  if (!state.paymentMethod) {
    push("paymentMethod", "paymentMethodRequired");
  } else if (state.paymentMethod === "ACCOUNT") {
    if (!state.supplierAccountId) push("supplierAccountId", "supplierRequired");
  } else if (!state.fundAccountId) {
    push("fundAccountId", "fundRequired");
  }
  if (!state.currency) push("currency", "currencyRequired");
  if (state.currency && state.currency !== BASE_CURRENCY && state.exchangeRate.trim() !== "") {
    if (tryScaled(state.exchangeRate) === null || cmpDec(state.exchangeRate, "0") <= 0) {
      push("exchangeRate", "exchangeRateInvalid");
    }
  }
  if (!state.department) push("department", "departmentRequired");
  if (!state.branchId) push("branchId", "branchRequired");
  if (!isIsoDate(state.invoiceDate)) {
    push("invoiceDate", "invoiceDateRequired");
  }
  if (state.dueDate) {
    if (!isIsoDate(state.dueDate)) push("dueDate", "dueDateInvalid");
    else if (isIsoDate(state.invoiceDate) && compareIsoDate(state.dueDate, state.invoiceDate) < 0) {
      push("dueDate", "dueDateBeforeInvoice");
    }
  }
  if (state.contextType !== "GENERAL" && !state.contextId) {
    push("contextId", "contextRequired");
  }
  if (state.lines.length === 0) {
    push("lines", "linesRequired");
  } else if (state.lines.length > MAX_LINES) {
    push("lines", "linesTooMany");
  } else {
    state.lines.forEach((line, index) => validateLine(line, index, errors));
    const lineErrors = errors.some((error) => error.field.startsWith("detail-"));
    if (!lineErrors && cmpDec(computeTotals(state.lines).totalAmount, "0") <= 0) {
      push("lines", "totalInvalid");
    }
  }
  if (state.description.trim().length > DESCRIPTION_MAX) {
    push("description", "descriptionTooLong");
  }
  if (!state.documentType) push("documentType", "documentTypeRequired");
  if (mode === "edit") {
    if (!state.reason.trim()) push("reason", "reasonRequired");
    else if (state.reason.trim().length > REASON_MAX) push("reason", "reasonTooLong");
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// İstek
// ---------------------------------------------------------------------------------------------

/** Geçerli ondalık metni sunucu gövdesine (ör. "1" → "1.00"); geçersizde RangeError. */
function decimalBody(value: string): string {
  const scaled = tryScaled(value);
  if (scaled === null) throw new RangeError(`Geçersiz ondalık: ${value}`);
  return fromScaled(scaled);
}

function optionalDecimal(value: string): string | null {
  return value.trim() === "" ? null : decimalBody(value);
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Yalnız girdi alanları; türetilen tutarlar gönderilmez. Geçersiz girdide RangeError. */
export function toLineRequest(line: LineInput): SaveExpenseLineRequest {
  return {
    description: blankToNull(line.description),
    quantity: decimalBody(line.quantity),
    unit: blankToNull(line.unit),
    unitPrice: decimalBody(line.unitPrice),
    discountRate: optionalDecimal(line.discountRate),
    vatRate: decimalBody(line.vatRate),
    withholdingAmount: optionalDecimal(line.withholdingAmount),
    otherTaxAmount: optionalDecimal(line.otherTaxAmount),
  };
}

/**
 * `SaveExpenseRequest`: bağlamın yalnız ilgili kimliği, ödeme şeklinin yalnız ilgili tarafı; kur yalnız
 * TRY dışında ve doluysa. Şirket gönderilmez (sunucu iş yerinden türetir).
 */
export function toRequest(state: ExpenseFormState): SaveExpenseRequest {
  if (!state.paymentMethod || !state.department) {
    throw new RangeError("Eksik form alanı");
  }
  const context = (type: ExpenseContextType) =>
    state.contextType === type && state.contextId ? state.contextId : null;
  const account = state.paymentMethod === "ACCOUNT";
  return {
    branchId: state.branchId,
    expenseItemId: state.expenseItemId,
    contextType: state.contextType,
    vehicleId: context("VEHICLE"),
    shipmentId: context("SHIPMENT"),
    warehouseId: context("WAREHOUSE"),
    driverId: context("DRIVER"),
    paymentMethod: state.paymentMethod,
    supplierAccountId: account ? state.supplierAccountId || null : null,
    fundAccountId: account ? null : state.fundAccountId || null,
    invoiceNumber: blankToNull(state.invoiceNumber),
    invoiceDate: state.invoiceDate,
    dueDate: state.dueDate || null,
    documentType: state.documentType,
    department: state.department,
    description: blankToNull(state.description),
    currency: state.currency,
    exchangeRate: state.currency !== BASE_CURRENCY ? optionalDecimal(state.exchangeRate) : null,
    lines: state.lines.map(toLineRequest),
  };
}

// ---------------------------------------------------------------------------------------------
// Sunucu hatası ve dosya
// ---------------------------------------------------------------------------------------------

/**
 * Sunucu hata kodu → alan: `WITHHOLDING_EXCEEDS_VAT` ilk aşan kartın (yoksa ilk kartın) Tevkifat
 * alanına, `COMPANY_MISMATCH` İş Yeri alanına; diğerleri null (snackbar).
 */
export function serverErrorField(
  code: string | undefined,
  lines: readonly LineInput[],
): string | null {
  if (code === "WITHHOLDING_EXCEEDS_VAT") {
    const index = lines.findIndex(
      (line) => cmpDec(num(line.withholdingAmount), computeLine(line).vatAmount) > 0,
    );
    return lineFieldId(Math.max(0, index), "withholdingAmount");
  }
  if (code === "COMPANY_MISMATCH") return FIELD_IDS.branchId;
  return null;
}

/** ZTO istemci denetimi: > 10 MB `fileTooLarge`, izinli uzantı dışı `fileType`; geçerliyse null. */
export function validateFile(file: {
  name: string;
  size: number;
}): "fileTooLarge" | "fileType" | null {
  if (file.size > MAX_FILE_BYTES) return "fileTooLarge";
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  return (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext) ? null : "fileType";
}

/** ZTO formatFileSize: "0 Bytes", "1.5 KB", "2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = Math.round((bytes / 1024 ** index) * 100) / 100;
  return `${value} ${units[index]}`;
}
