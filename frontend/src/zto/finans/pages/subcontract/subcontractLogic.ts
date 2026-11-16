import type { AccountDocumentType } from "../../../../pages/finance/types";
import type {
  SaveSubcontractCostRequest,
  SubcontractCostRow,
  SubcontractCurrencyAmount,
  TransportMode,
} from "../../../../pages/operations/types";
import type { BranchTree } from "../../../branch/branchTree";
import { addDec, cmpDec, subDec, tryScaled, type DecimalInput } from "../../../decimal";
import { currencySymbol, formatNumber } from "../../../format";
import { isIsoDate } from "../expenses/expenseDates";

/*
 * Sevk Nakliye Masrafları (STI, CSD) ve "Nakliye Firması & Fiyat Düzenle" modalının saf mantığı
 * (12.7_TASARIM §5.7). Tutarlar ondalık metin (`zto/decimal.ts`); tarihler takvim tarihi
 * "YYYY-MM-DD" (MWG capture-location-agnostic-data).
 */

/** ZTO CSD varsayılan belge türü ("Alış Faturası" seçili). */
export const DEFAULT_DOCUMENT_TYPE = "ALIS_FATURASI";
export const DOCUMENT_NO_MAX = 50;
export const DESCRIPTION_MAX = 500;
export const REASON_MAX = 500;

// ---------------------------------------------------------------------------------------------
// Biçim
// ---------------------------------------------------------------------------------------------

/** ZTO `ToString("N0") + " " + simge`; boş tutar 0 sayılır (GetDecimalValue). */
export function formatN0(amount: DecimalInput, currency: string | null | undefined): string {
  const text = formatNumber(amount === null || amount === undefined ? 0 : String(amount), 0) || "0";
  const symbol = currencySymbol(currency ?? "TRY");
  return symbol ? `${text} ${symbol}` : text;
}

/** Para birimi kırılımı "1.234 ₺ / 50 $" (ZTO CurrencyBreakdown); boşsa "0 ₺". */
export function currencyBreakdown(totals: readonly SubcontractCurrencyAmount[] | null | undefined) {
  const parts = (totals ?? []).map((total) => formatN0(total.amount, total.currency));
  return parts.length > 0 ? parts.join(" / ") : formatN0("0", "TRY");
}

/** CSD "Araç No": sefer numarası + "/" + etap sırası. */
export function vehicleNo(row: Pick<SubcontractCostRow, "shipmentNumber" | "legSequenceNo">) {
  return `${row.shipmentNumber}/${row.legSequenceNo}`;
}

const COLLATOR = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

/** Doğal sıralama ("S-2/10" > "S-2/9"); ZTO kolon 0 sayısal sıralamasının karşılığı. */
export function compareNatural(a: string, b: string): number {
  return COLLATOR.compare(a, b);
}

/** STI Adres: "il / ilçe" (biri boşsa diğeri; ikisi de boşsa null → "-"). */
export function addressOf(city: string | null, district: string | null): string | null {
  const parts = [city, district].map((part) => part?.trim() ?? "").filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" / ") : null;
}

export type TransportBadge = { badge: string; icon: string };

/** ZTO: Gemi Nakliye `badge-info fa-ship`, diğerleri `badge-primary fa-truck`. */
export const TRANSPORT_BADGES: Record<TransportMode, TransportBadge> = {
  ROAD: { badge: "badge-primary", icon: "fa-truck" },
  SEA: { badge: "badge-info", icon: "fa-ship" },
  RAIL: { badge: "badge-primary", icon: "fa-train" },
  AIR: { badge: "badge-primary", icon: "fa-plane" },
};

// ---------------------------------------------------------------------------------------------
// Finansal bilgiler (tooltip ve TOPLAM satırı)
// ---------------------------------------------------------------------------------------------

export const FINANCE_KEYS = [
  "vat",
  "withholding",
  "total",
  "advance",
  "remaining",
  "deduction",
  "balance",
] as const;
export type FinanceKey = (typeof FINANCE_KEYS)[number];
export type FinanceAmounts = Record<FinanceKey, string>;

const ZERO = "0.00";

/** Satırın finansal tutarları; gider yoksa hepsi 0. Kalan = toplam − tevkifat, Bakiye = ödenecek. */
export function financeOf(row: SubcontractCostRow): FinanceAmounts {
  const vat = row.vatAmount ?? ZERO;
  const withholding = row.withholdingAmount ?? ZERO;
  const total = row.totalAmount ?? addDec(row.money?.amount ?? ZERO, vat);
  return {
    vat,
    withholding,
    total,
    advance: row.advanceAmount ?? ZERO,
    remaining: subDec(total, withholding),
    deduction: row.deductionAmount ?? ZERO,
    balance: row.payableAmount ?? ZERO,
  };
}

/** Para birimi başına finansal toplamlar (giderli satırlar; para birimi sırası ilk görülüş). */
export function financeTotals(rows: readonly SubcontractCostRow[]) {
  const totals = new Map<string, FinanceAmounts>();
  for (const row of rows) {
    if (!row.money) continue;
    const amounts = financeOf(row);
    const current = totals.get(row.money.currency);
    totals.set(
      row.money.currency,
      current
        ? (Object.fromEntries(
            FINANCE_KEYS.map((key) => [key, addDec(current[key], amounts[key])]),
          ) as FinanceAmounts)
        : amounts,
    );
  }
  return totals;
}

/** Tooltip satırları: anahtar → "1.000 ₺" ya da çok para biriminde "1.000 ₺ / 20 $". */
export function financeLines(
  totals: Map<string, FinanceAmounts>,
): Array<{ key: FinanceKey; value: string }> {
  const entries = [...totals.entries()];
  return FINANCE_KEYS.map((key) => ({
    key,
    value:
      entries.length === 0
        ? formatN0(ZERO, "TRY")
        : entries.map(([currency, amounts]) => formatN0(amounts[key], currency)).join(" / "),
  }));
}

// ---------------------------------------------------------------------------------------------
// Silme kararı (§5.7, Rev 1 F6)
// ---------------------------------------------------------------------------------------------

export type DeleteAction = "reverse" | "delete";

/** POSTED → ters kayıt; OPEN → DELETE; gider yoksa ya da ters çevrilmişse düğme yok. */
export function deleteActionOf(row: Pick<SubcontractCostRow, "costId" | "status">) {
  if (!row.costId) return null;
  if (row.status === "POSTED") return "reverse" as const;
  if (row.status === "OPEN") return "delete" as const;
  return null;
}

/** Gerekçe yalnız ters kayıtta gönderilir; boş/uzun gerekçe hata anahtarı döner. */
export function reasonError(action: DeleteAction, reason: string): "reasonRequired" | null {
  if (action === "delete") return null;
  const trimmed = reason.trim();
  return trimmed === "" || trimmed.length > REASON_MAX ? "reasonRequired" : null;
}

// ---------------------------------------------------------------------------------------------
// Modal formu
// ---------------------------------------------------------------------------------------------

export type SubcontractForm = {
  amount: string;
  currency: string;
  exchangeRate: string;
  vatAmount: string;
  withholdingAmount: string;
  deductionAmount: string;
  documentNo: string;
  documentType: string;
  costDate: string;
  description: string;
};

/** Satırdan ilk değerler: belge tarihi `costDate ?? loadingDate ?? bugün`, belge türü Alış Faturası. */
export function formFromRow(row: SubcontractCostRow, today: string): SubcontractForm {
  const currency = row.money?.currency ?? "TRY";
  return {
    amount: row.money?.amount ?? "",
    currency,
    exchangeRate: currency !== "TRY" && row.exchangeRate ? row.exchangeRate : "",
    vatAmount: row.vatAmount ?? "0",
    withholdingAmount: row.withholdingAmount ?? "0",
    deductionAmount: row.deductionAmount ?? "0",
    documentNo: row.documentNo ?? "",
    documentType: row.documentType ?? DEFAULT_DOCUMENT_TYPE,
    costDate: row.costDate ?? row.loadingDate ?? today,
    description: row.description ?? "",
  };
}

/** Boş giriş 0; geçersiz giriş null. */
function decimalOf(value: string): string | null {
  const text = value.trim();
  if (text === "") return "0";
  return tryScaled(text) === null ? null : text;
}

export type SubcontractTotals = {
  /** Toplam Tutar = net + KDV. */
  total: string;
  /** Avans(Yakıt): 12.5'e kadar 0 (OK-12.7-7). */
  advance: string;
  /** Kalan Tutar = toplam − tevkifat. */
  remaining: string;
  /** Bakiye = net + KDV − tevkifat − kesinti (cariye yazılan, OK-12.7-3). */
  balance: string;
};

/** Hesaplanan alanlar; geçersiz girişte ilgili alan 0 sayılır (görüntü için). */
export function computeSubcontract(form: SubcontractForm): SubcontractTotals {
  const net = decimalOf(form.amount) ?? "0";
  const vat = decimalOf(form.vatAmount) ?? "0";
  const withholding = decimalOf(form.withholdingAmount) ?? "0";
  const deduction = decimalOf(form.deductionAmount) ?? "0";
  const total = addDec(net, vat);
  const remaining = subDec(total, withholding);
  return { total, advance: ZERO, remaining, balance: subDec(remaining, deduction) };
}

export type SubcontractField =
  | "currency"
  | "amount"
  | "exchangeRate"
  | "vatAmount"
  | "withholdingAmount"
  | "deductionAmount"
  | "costDate";

export type SubcontractErrorKey =
  "currency" | "amount" | "rate" | "negative" | "withholding" | "balance" | "costDate";

export type SubcontractError = { field: SubcontractField; key: SubcontractErrorKey };

/**
 * İlk hata (ZTO sırası: para birimi, tutar; ardından ZTO'da olmayan istemci denetimleri: kur,
 * negatif tutar, tevkifat ≤ KDV, bakiye > 0, belge tarihi). Hata yoksa null.
 */
export function validateSubcontract(form: SubcontractForm): SubcontractError | null {
  if (!form.currency) return { field: "currency", key: "currency" };
  const amount = form.amount.trim() === "" ? null : decimalOf(form.amount);
  if (amount === null || cmpDec(amount, "0") <= 0) return { field: "amount", key: "amount" };
  if (form.currency !== "TRY" && form.exchangeRate.trim() !== "") {
    const rate = decimalOf(form.exchangeRate);
    if (rate === null || cmpDec(rate, "0") <= 0) return { field: "exchangeRate", key: "rate" };
  }
  for (const field of ["vatAmount", "withholdingAmount", "deductionAmount"] as const) {
    const value = decimalOf(form[field]);
    if (value === null || cmpDec(value, "0") < 0) return { field, key: "negative" };
  }
  if (cmpDec(decimalOf(form.withholdingAmount) ?? "0", decimalOf(form.vatAmount) ?? "0") > 0) {
    return { field: "withholdingAmount", key: "withholding" };
  }
  if (cmpDec(computeSubcontract(form).balance, "0") <= 0) {
    return { field: "deductionAmount", key: "balance" };
  }
  if (!isIsoDate(form.costDate)) return { field: "costDate", key: "costDate" };
  return null;
}

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** İstek gövdesi; `transportMode` ZTO formunda yok (gönderilmez, §3.3.1 #9). */
export function toSaveRequest(form: SubcontractForm): SaveSubcontractCostRequest {
  return {
    money: { amount: form.amount.trim(), currency: form.currency },
    vatAmount: decimalOf(form.vatAmount) ?? "0",
    withholdingAmount: decimalOf(form.withholdingAmount) ?? "0",
    deductionAmount: decimalOf(form.deductionAmount) ?? "0",
    documentNo: blankToNull(form.documentNo),
    documentType: blankToNull(form.documentType),
    costDate: form.costDate,
    exchangeRate: form.currency === "TRY" ? null : blankToNull(form.exchangeRate),
    description: blankToNull(form.description),
  };
}

/** Belge türü seçenekleri: PAYABLE + OTHER + seçilebilir, `sortOrder` sırasıyla (§5.6 süzgeci). */
export function documentTypeOptions(types: readonly AccountDocumentType[] | undefined) {
  return (types ?? [])
    .filter((type) => type.side === "PAYABLE" && type.audience === "OTHER" && type.selectable)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---------------------------------------------------------------------------------------------
// Şube / iş yeri süzgeci (#branchFilter… / #workPlaceFilter…, URL ?branchIds)
// ---------------------------------------------------------------------------------------------

export type GroupOption = { key: string; name: string; branchIds: string[] };
export type WorkPlaceOption = { id: string; name: string; groupKey: string };

const groupKeyOf = (companyId: string | null, groupId: string | null) =>
  groupId ?? `none:${companyId ?? ""}`;

/** Şube grupları ("Şube" kutusu) ve iş yerleri ("İş Yeri" kutusu); ≥2 şirkette "Şirket › Grup". */
export function filterOptions(tree: BranchTree | undefined) {
  const groups: GroupOption[] = [];
  const workPlaces: WorkPlaceOption[] = [];
  const multi = (tree ?? []).length > 1;
  for (const company of tree ?? []) {
    for (const group of company.groups) {
      const key = groupKeyOf(company.companyId, group.groupId);
      const branches = group.branches.filter((branch) => branch.active);
      if (branches.length === 0) continue;
      groups.push({
        key,
        name: multi ? `${company.companyName} › ${group.groupName}` : group.groupName,
        branchIds: branches.map((branch) => branch.id),
      });
      for (const branch of branches) {
        workPlaces.push({ id: branch.id, name: branch.name, groupKey: key });
      }
    }
  }
  return { groups, workPlaces };
}

export type FilterState = { groupKey: string; workPlaceId: string };

/** URL'deki `branchIds`'ten seçim: tek iş yeri → o iş yeri; bir grubun tamamı → o grup. */
export function filterStateOf(
  options: ReturnType<typeof filterOptions>,
  branchIds: readonly string[],
): FilterState {
  if (branchIds.length === 1) {
    const place = options.workPlaces.find((wp) => wp.id === branchIds[0]);
    if (place) {
      const group = options.groups.find((g) => g.key === place.groupKey);
      // Tek iş yerli grupta grup seçimi ile iş yeri seçimi aynı URL'yi verir; grup gösterilir.
      if (group && group.branchIds.length === 1) return { groupKey: group.key, workPlaceId: "" };
      return { groupKey: place.groupKey, workPlaceId: place.id };
    }
  }
  if (branchIds.length > 0) {
    const wanted = [...branchIds].sort().join(",");
    const group = options.groups.find((g) => [...g.branchIds].sort().join(",") === wanted);
    if (group) return { groupKey: group.key, workPlaceId: "" };
  }
  return { groupKey: "", workPlaceId: "" };
}

/** Seçimden sorgu kimlikleri: iş yeri > grup > hepsi (boş). */
export function branchIdsOf(
  options: ReturnType<typeof filterOptions>,
  state: FilterState,
): string[] {
  if (state.workPlaceId) return [state.workPlaceId];
  if (state.groupKey) return options.groups.find((g) => g.key === state.groupKey)?.branchIds ?? [];
  return [];
}

/** URL `?days`: 1–365 dışı ya da geçersiz → 150 (ZTO §7 (e): 90/150 tutarsızlığı giderildi). */
export function parseDays(value: string | null | undefined, fallback = 150): number {
  if (value === null || value === undefined || !/^\d+$/.test(value.trim())) return fallback;
  const days = Number(value.trim());
  return days >= 1 && days <= 365 ? days : fallback;
}
