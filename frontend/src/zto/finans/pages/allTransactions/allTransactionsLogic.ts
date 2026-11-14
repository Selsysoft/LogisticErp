import type { TransactionParams } from "../../../../pages/finance/accountApi";
import type {
  AccountTransactionFacets,
  AccountTransactionRow,
  TransactionKind,
} from "../../../../pages/finance/types";
import { mapInChunks } from "../../../a11y/yieldToMain";
import type { DataTableLanguage } from "../../../components/dataTableLogic";
import { formatDate, formatMoney } from "../../../format";

/*
 * Günlük Tüm Cari İşlemleri saf mantığı (12.1 §5.12; ZTO wwwroot/js/zt/accounttransaction/
 * alltransactions.js). Bileşen yalnız çizer; tarih aralıkları, kart süzgeçleri, rozet/renk eşlemesi,
 * satır görünüm modeli ve DataTables dil metinleri burada ve testlidir.
 */

// ---------------------------------------------------------------------------------------------
// Hızlı tarih aralıkları (ajs applyQuickRange)
// ---------------------------------------------------------------------------------------------

export type QuickRange = "today" | "yesterday" | "d7" | "d14" | "d30" | "d90" | "d180";

/** ZTO sırası ve `data-range` değerleri (AllTransactions.cshtml:1267-1273). */
export const QUICK_RANGES: ReadonlyArray<{ key: QuickRange; dataRange: string }> = [
  { key: "today", dataRange: "today" },
  { key: "yesterday", dataRange: "yesterday" },
  { key: "d7", dataRange: "7" },
  { key: "d14", dataRange: "14" },
  { key: "d30", dataRange: "30" },
  { key: "d90", dataRange: "90" },
  { key: "d180", dataRange: "180" },
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/*
 * Tarihler saat dilimsiz takvim günüdür (MWG capture-location-agnostic-data). Temporal.PlainDate
 * Baseline değil ve polyfill yeni bağımlılık olurdu; bu yüzden gün, yıl/ay/gün parçalarından açıkça
 * UTC'de kurulur (Date.UTC) ve yalnız gün aritmetiği için kullanılır — yerel saat dilimi hiç girmez.
 */

/** "yyyy-MM-dd" → UTC gece yarısı (ms); geçersizde null. */
function utcDay(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time
    : null;
}

function isoOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Geçerli "yyyy-MM-dd" mi (takvimde var olan gün). */
export function isIsoDate(value: string): boolean {
  return utcDay(value) !== null;
}

/** Takvim günü ekler (ay/yıl sınırı takvimle). */
export function addDays(iso: string, days: number): string {
  const time = utcDay(iso);
  if (time === null) return iso;
  const date = new Date(time);
  date.setUTCDate(date.getUTCDate() + days);
  return isoOf(date.getTime());
}

/** `to - from` gün farkı (geçersiz tarihte NaN). */
export function daysBetween(from: string, to: string): number {
  const start = utcDay(from);
  const end = utcDay(to);
  return start === null || end === null ? Number.NaN : Math.round((end - start) / DAY_MS);
}

/**
 * Hızlı aralığın tarihleri; `today` yerel bugün (`common.tsx today()`). ZTO: Bugün = bugün–bugün,
 * Dün = dün–dün, N gün = (bugün − N)–bugün (ay sonu takvimle hesaplanır).
 */
export function quickRangeDates(range: QuickRange, today: string): { from: string; to: string } {
  if (range === "today") return { from: today, to: today };
  if (range === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  return { from: addDays(today, -Number(range.slice(1))), to: today };
}

/** Çapraz liste aralığı en çok 366 gün (sunucu 400 DATE_RANGE_TOO_LARGE ile aynı kural). */
export const MAX_RANGE_DAYS = 366;

export type RangeProblem = "missing" | "order" | "tooLarge";

/** Aralık sorunu; sorun yoksa null (istek yalnız o zaman gönderilir). */
export function rangeProblem(from: string, to: string): RangeProblem | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "missing";
  const days = daysBetween(from, to);
  if (days < 0) return "order";
  if (days > MAX_RANGE_DAYS) return "tooLarge";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Dinamik filtre kartları (ajs buildDynamicCards, toggleCardFilter, renderDynamicIndicator)
// ---------------------------------------------------------------------------------------------

export type CardKey = "branch" | "group" | "kind";

/** Kart başına tek seçim (ZTO `_activeCardFilters`). */
export type CardSelection = Record<CardKey, string | null>;

export const EMPTY_SELECTION: CardSelection = Object.freeze({
  branch: null,
  group: null,
  kind: null,
});

/** Aynı öğeye ikinci tık seçimi kaldırır (ZTO toggleCardFilter). */
export function toggleSelection(
  selection: CardSelection,
  key: CardKey,
  value: string,
): CardSelection {
  return { ...selection, [key]: selection[key] === value ? null : value };
}

export function clearSelection(selection: CardSelection, key: CardKey): CardSelection {
  return { ...selection, [key]: null };
}

export function hasSelection(selection: CardSelection): boolean {
  return selection.branch !== null || selection.group !== null || selection.kind !== null;
}

export type FacetItem = { value: string; label: string; count: number };
export type FacetGroups = Record<CardKey, FacetItem[]>;

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

/** Sayıya göre azalan (ZTO `counts[b] - counts[a]`); eşitlikte Türkçe ada göre. */
function byCount(items: FacetItem[]): FacetItem[] {
  return [...items].sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

/** Sunucu facet'lerinden kart öğeleri; tür adı çevrilir. */
export function facetGroups(
  facets: AccountTransactionFacets,
  kindLabel: (kind: string) => string,
): FacetGroups {
  return {
    branch: byCount(
      facets.branches.map((b) => ({ value: b.id, label: b.name || "-", count: b.count })),
    ),
    group: byCount(
      facets.groups.map((g) => ({ value: g.code, label: g.name || "-", count: g.count })),
    ),
    kind: byCount(
      facets.kinds.map((k) => ({ value: k.kind, label: kindLabel(k.kind), count: k.count })),
    ),
  };
}

/**
 * Sunucu facet döndürmezse (eski yanıt) satırlardan sayım (ZTO istemcide sayar). Kart seçimi
 * sunucuya gittiğinden bu yol yalnız seçimsiz veriyle doğrudur.
 */
export function computeFacets(rows: readonly AccountTransactionRow[]): AccountTransactionFacets {
  const branches = new Map<string, { id: string; name: string; count: number }>();
  const groups = new Map<string, { code: string; name: string; count: number }>();
  const kinds = new Map<string, { kind: string; count: number }>();
  for (const row of rows) {
    const branch = branches.get(row.branchId) ?? {
      id: row.branchId,
      name: row.branchName,
      count: 0,
    };
    branch.count += 1;
    branches.set(row.branchId, branch);
    const group = groups.get(row.subGroup) ?? {
      code: row.subGroup,
      name: row.subGroupName,
      count: 0,
    };
    group.count += 1;
    groups.set(row.subGroup, group);
    const kind = kinds.get(row.kind) ?? { kind: row.kind, count: 0 };
    kind.count += 1;
    kinds.set(row.kind, kind);
  }
  return {
    branches: [...branches.values()],
    groups: [...groups.values()],
    kinds: [...kinds.values()],
  };
}

export type SelectionChip = { key: CardKey; value: string };

/** Etkin süzgeç çipleri (ZTO sırası: İş Yeri, Hesap Grubu, İşlem Türü); değer kart öğesinin adı. */
export function selectionChips(selection: CardSelection, groups: FacetGroups): SelectionChip[] {
  const keys: CardKey[] = ["branch", "group", "kind"];
  return keys.flatMap((key) => {
    const value = selection[key];
    if (value === null) return [];
    const label = groups[key].find((item) => item.value === value)?.label ?? value;
    return [{ key, value: label }];
  });
}

/** Seçimin sorgu parametreleri (kart seçimi sunucuda süzer; facet'ler bundan etkilenmez). */
export function selectionParams(
  selection: CardSelection,
): Pick<TransactionParams, "branchIds" | "subGroups" | "kinds"> {
  return {
    branchIds: selection.branch ? [selection.branch] : undefined,
    subGroups: selection.group ? [selection.group] : undefined,
    kinds: selection.kind ? [selection.kind as TransactionKind] : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Satır görünüm modeli (ajs renderFilteredTable; tür rozeti AccountTransactionController:5690-5715)
// ---------------------------------------------------------------------------------------------

/** İşlem Türü rozeti (§3.5). */
export const KIND_BADGE: Record<TransactionKind, string> = {
  DEBT: "badge badge-danger",
  RECEIVABLE: "badge badge-success",
  PAYMENT: "badge badge-warning",
  COLLECTION: "badge badge-primary",
};

/** Tutar hücresinin rengi (ZTO amountClass). */
export const KIND_AMOUNT_CLASS: Record<TransactionKind, string> = {
  DEBT: "text-danger font-weight-bold",
  RECEIVABLE: "text-success font-weight-bold",
  PAYMENT: "text-warning font-weight-bold",
  COLLECTION: "text-primary font-weight-bold",
};

export type ExtraBadge = { className: string; kind: "sale" | "refund" };

/** Alacak satırında satış/iade faturası ek rozeti ("Satış" badge-info, "İade" badge-warning). */
export function extraBadge(kind: TransactionKind, documentType: string | null): ExtraBadge | null {
  if (kind !== "RECEIVABLE") return null;
  if (documentType === "SATIS_FATURASI")
    return { className: "badge badge-info ml-1", kind: "sale" };
  if (documentType === "IADE_FATURASI")
    return { className: "badge badge-warning ml-1", kind: "refund" };
  return null;
}

export type AtRowLabels = {
  kind: (kind: TransactionKind) => string;
  sale: string;
  refund: string;
};

export type AtRow = {
  id: string;
  accountId: string;
  /** Sunucu sırası: tarih, oluşturma, id (ISO; metin sıralaması kronolojiktir). */
  sortKey: string;
  dateText: string;
  branchName: string;
  accountCode: string;
  accountName: string;
  groupName: string;
  kind: TransactionKind;
  kindLabel: string;
  kindClass: string;
  extra: { className: string; label: string } | null;
  documentNo: string;
  /** İşaretli tutar (ters kayıt ve taşıma çıkışı eksi). */
  amount: number;
  amountText: string;
  amountClass: string;
  description: string;
  createdBy: string;
};

export function rowSortKey(
  row: Pick<AccountTransactionRow, "transactionDate" | "createdAt" | "id">,
) {
  return `${row.transactionDate}|${row.createdAt}|${row.id}`;
}

export function toAtRow(row: AccountTransactionRow, labels: AtRowLabels): AtRow {
  const extra = extraBadge(row.kind, row.documentType);
  const amount = row.sign * row.amount;
  return {
    id: row.id,
    accountId: row.accountId,
    sortKey: rowSortKey(row),
    dateText: formatDate(row.transactionDate),
    branchName: row.branchName || "-",
    accountCode: row.accountCode,
    accountName: row.accountName,
    groupName: row.subGroupName,
    kind: row.kind,
    kindLabel: labels.kind(row.kind),
    kindClass: KIND_BADGE[row.kind],
    extra: extra ? { className: extra.className, label: labels[extra.kind] } : null,
    documentNo: row.documentNo ?? "",
    amount,
    amountText: formatMoney(amount, row.currency),
    amountClass: KIND_AMOUNT_CLASS[row.kind],
    description: row.description ?? "",
    createdBy: row.createdBy ?? "",
  };
}

/**
 * Görünüm modeli 50 ms bütçeli parçalarla (MWG break-up-long-tasks; 10.000 satıra kadar). `signal`
 * iptal edilirse (yeni veri geldi) AbortError ile durur.
 */
export function buildRowsChunked(
  rows: readonly AccountTransactionRow[],
  labels: AtRowLabels,
  options: { budgetMs?: number; now?: () => number; signal?: AbortSignal } = {},
): Promise<AtRow[]> {
  return mapInChunks(rows, (row) => toAtRow(row, labels), options);
}

// ---------------------------------------------------------------------------------------------
// Metinler
// ---------------------------------------------------------------------------------------------

type Translate = (key: string, values?: Record<string, string>) => string;

/**
 * ajs datatableLanguageTR: yerelleştirme dosyasındaki {{total}} vb. DataTables yer tutucularına
 * (_TOTAL_ …) çevrilir; ZtoDataTable bunları doldurur.
 */
export function dataTableLanguage(t: Translate): DataTableLanguage {
  return {
    info: t("ztoFinans:allTransactions.dt.info", {
      total: "_TOTAL_",
      start: "_START_",
      end: "_END_",
    }),
    infoEmpty: t("ztoFinans:allTransactions.dt.infoEmpty"),
    infoFiltered: t("ztoFinans:allTransactions.dt.infoFiltered", { max: "_MAX_" }),
    lengthMenu: t("ztoFinans:allTransactions.dt.lengthMenu", { menu: "_MENU_" }),
    emptyTable: t("ztoFinans:allTransactions.dt.emptyTable"),
    zeroRecords: t("ztoFinans:allTransactions.dt.zeroRecords"),
    search: t("ztoFinans:allTransactions.dt.search"),
  };
}

const integerFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

/** Kayıt sayısı (N0, "12.345"). */
export function formatCount(value: number): string {
  return integerFormat.format(value);
}

/** Hata satırı (ajs: sunucu iletisi "Hata: …", bağlantı hatası "Hata oluştu"). */
export function errorText(
  error: unknown,
  labels: { error: string; errorOccurred: string },
): string {
  const message =
    error && typeof error === "object" && "body" in error && error instanceof Error
      ? error.message
      : "";
  return message ? `${labels.error}: ${message}` : labels.errorOccurred;
}
