/*
 * Finans Raporları (ZTO FinanceReport/Index) saf mantığı (12.8_TASARIM §5.5). Kaynaklar:
 * Views/FinanceReport/Index.cshtml (kipler, sütunlar, işaret), Models/Report/ReportDateRange.cs (dönem
 * sözleşmesi), Models/Report/FinanceReport.cs `FrFilter` (varsayılan "Tümü"), Services/FinanceReport/
 * FrLedger.cs (`Display`, `State`, `Totals`, `Statement`), wwwroot/js/finance-report.js
 * (`currencyTotals`, `sumBySymbol`, `sheetRows`, `compare`, `matches`).
 *
 * Bakiye işareti Blackrose: `closing = Σ(DEBIT − CREDIT)`; > 0 cari bize borçlu (ZTO kanonik N ile
 * aynı yön). Para tutarları ondalık metindir; toplama `zto/decimal.ts` ile (parseFloat yok). Tarihler
 * `"YYYY-MM-DD"` takvim dizgesidir (MWG `capture-location-agnostic-data`; `new Date(iso)` yok).
 */
import type { ExportCell } from "../../../export";
import type { BranchTree } from "../../../../pages/organization/types";
import type {
  AccountMethodTotal,
  LedgerAccountRow,
  LedgerSide,
  ReportType,
  Statement,
  StatementLine,
} from "../../../../pages/finance/types";
import { addDec, cmpDec, subDec, type DecimalInput } from "../../../decimal";
import { currencySymbol } from "../../../format";
import type { FinanceReportQuery, FinanceReportRange } from "../../navItems";
import { addDaysIso, daysBetween, isIsoDate } from "../../reports/reportDates";

// ---------------------------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------------------------

/** Genel bakış ve "Rapor türü" sırası (§3.4.3; ZTO `FrTypes.All` karşılığı). */
export const REPORT_TYPES: readonly ReportType[] = [
  "SALES",
  "SUPPLIERS",
  "MATERIAL",
  "LABOR",
  "OTHER",
  "PERSONNEL",
];

/** Bakiyesi bundan küçük cari kapalı sayılır (`FrLedger.ClosedTolerance`). */
export const CLOSED_TOLERANCE = "0.005";

/** Hazır dönem düğmeleri (ZTO `_ReportFilterBar` sırası). */
export const RANGE_PRESETS: readonly FinanceReportRange[] = ["all", "30", "7", "today"];

/** ZTO `ReportDateRange` yıl sınırları (dışındaki tarih "okunamadı"). */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
const LAST_DAYS = 30;

/** Ekstre: sayfa boyutu (sunucu üst sınırı) ve en çok sayfa (§5.5: 30 × 2000 = 60.000 satır). */
export const STATEMENT_PAGE_SIZE = 2000;
export const STATEMENT_MAX_PAGES = 30;
export const STATEMENT_MAX_ROWS = STATEMENT_PAGE_SIZE * STATEMENT_MAX_PAGES;
/** "Tümü" döneminde ekstre başlangıcı (sunucu `from` zorunlu; ZTO `new DateTime(1, 1, 1)`). */
export const STATEMENT_OPEN_FROM = "0001-01-01";

/** URL'de konsolide görünüm (`companyId=all`); parametre yoksa aktif şirket kullanılır. */
export const COMPANY_CONSOLIDATED = "all";

/** Excel dosya adı (ZTO `labels.file` "Finans Raporları", boşluk → "_"). */
export const EXCEL_FILE_NAME = "Finans_Raporları";

/** 500+ satırda Excel satır üretimi 50 ms bütçeli parçalarla (MWG `break-up-long-tasks`). */
export const CHUNK_THRESHOLD = 500;

// ---------------------------------------------------------------------------------------------
// URL durumu
// ---------------------------------------------------------------------------------------------

export type FrMode = "overview" | "list" | "statement";

export type FrRange = {
  /** Etkin hazır aralık; tarih kutuları bir hazır aralığa denk geliyorsa o (ZTO `PresetOf`). */
  preset: FinanceReportRange | "custom";
  isAll: boolean;
  /** "Tümü"de null. */
  from: string | null;
  /** "Tümü"de bugün (API `to` boş = bugün; dönem sonu bakiyesi). */
  to: string;
  /** Verilmiş ama çözülemeyen tarih ya da aralık ("Tarih okunamadı" uyarısı). */
  invalid: boolean;
};

export type FrState = {
  type: ReportType | null;
  /** Verilmiş ama bilinmeyen (ya da yetkisiz PERSONNEL) tür: genel bakış + uyarı. */
  invalidType: boolean;
  range: FrRange;
  cur: string;
  account: string;
  branchGroupId: string;
  branchId: string;
  /** Ham URL değeri: "" (aktif şirket), `COMPANY_CONSOLIDATED` ya da şirket kimliği. */
  companyId: string;
};

export function isReportType(value: string | null | undefined): value is ReportType {
  return !!value && (REPORT_TYPES as readonly string[]).includes(value);
}

function inYearRange(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

function validIso(value: string | null | undefined): value is string {
  return isIsoDate(value) && inYearRange(value);
}

/** Hazır aralığın tarihleri (7 = bugün−6, 30 = bugün−29, bugün dahil); "all" ve bilinmeyende null. */
export function presetRange(
  token: string,
  today: string,
): { from: string; to: string; preset: FinanceReportRange } | null {
  switch (token) {
    case "today":
      return { from: today, to: today, preset: "today" };
    case "7":
      return { from: addDaysIso(today, -6), to: today, preset: "7" };
    case "30":
      return { from: addDaysIso(today, -(LAST_DAYS - 1)), to: today, preset: "30" };
    default:
      return null;
  }
}

/** Tarih kutuları bir hazır aralığı gösteriyorsa o aralık etkin görünür (ZTO `PresetOf`). */
export function presetOf(from: string, to: string, today: string): FinanceReportRange | "custom" {
  for (const token of ["today", "7", "30"] as const) {
    const range = presetRange(token, today);
    if (range && range.from === from && range.to === to) return token;
  }
  return "custom";
}

const ALL_RANGE = (today: string, invalid: boolean): FrRange => ({
  preset: "all",
  isAll: true,
  from: null,
  to: today,
  invalid,
});

/**
 * ZTO `ReportDateRange.Parse` (FinanceReport seçenekleri: varsayılan "Tümü", `range=all` izinli).
 * Öncelik: `range` düğmesi > ISO `from`/`to` > varsayılan. Yalnız `from` → `to` = bugün; yalnız `to`
 * → `from` = to − 29. Ters aralık yer değiştirir. Çözülemeyen değer uyarı bayrağı verir.
 */
export function parseRange(
  input: { range?: string | null; from?: string | null; to?: string | null },
  today: string,
): FrRange {
  let invalid = false;
  const token = (input.range ?? "").trim().toLowerCase();
  if (token) {
    if (token === "all") return ALL_RANGE(today, false);
    const preset = presetRange(token, today);
    if (preset)
      return { preset: preset.preset, isAll: false, from: preset.from, to: preset.to, invalid };
    invalid = true;
  }
  const fromText = (input.from ?? "").trim();
  const toText = (input.to ?? "").trim();
  if (fromText || toText) {
    const okFrom = validIso(fromText);
    const okTo = validIso(toText);
    if ((fromText && !okFrom) || (toText && !okTo)) invalid = true;
    if (okFrom || okTo) {
      let to = okTo ? toText : today;
      let from = okFrom ? fromText : addDaysIso(to, -(LAST_DAYS - 1));
      if (to < from) [from, to] = [to, from];
      return { preset: presetOf(from, to, today), isAll: false, from, to, invalid };
    }
  }
  return ALL_RANGE(today, invalid);
}

/** URL → durum (ZTO `FrFilter.Parse`). PERSONNEL izinsizse bilinmeyen tür sayılır (ZTO SuperOnly). */
export function parseFrState(
  params: URLSearchParams,
  today: string,
  canSeePersonnel: boolean,
): FrState {
  const rawType = (params.get("type") ?? "").trim().toUpperCase();
  const known = isReportType(rawType) && (rawType !== "PERSONNEL" || canSeePersonnel);
  return {
    type: known ? (rawType as ReportType) : null,
    invalidType: !known && rawType !== "",
    range: parseRange(
      { range: params.get("range"), from: params.get("from"), to: params.get("to") },
      today,
    ),
    cur: (params.get("cur") ?? "").trim().toUpperCase(),
    account: (params.get("account") ?? "").trim(),
    branchGroupId: (params.get("branchGroupId") ?? "").trim(),
    branchId: (params.get("branchId") ?? "").trim(),
    companyId: (params.get("companyId") ?? "").trim(),
  };
}

/** Kip: `account` dolu → ekstre, `type` dolu → liste, aksi genel bakış. */
export function frMode(state: Pick<FrState, "type" | "account">): FrMode {
  if (state.account) return "statement";
  if (state.type) return "list";
  return "overview";
}

/**
 * İç bağlantı sorgusu (ZTO `Href`): dönem (`range=all` ya da `from`/`to`), para birimi, şube, iş yeri
 * ve şirket korunur; `type` ve `account` verilen değerlerdir.
 */
export function frQuery(
  state: FrState,
  target: { type?: ReportType | null; account?: string | null } = {},
): FinanceReportQuery {
  const range = state.range;
  return {
    type: target.type ?? undefined,
    range: range.isAll ? "all" : undefined,
    from: range.isAll ? undefined : (range.from ?? undefined),
    to: range.isAll ? undefined : range.to,
    cur: state.cur || undefined,
    account: target.account ?? undefined,
    branchGroupId: state.branchGroupId || undefined,
    branchId: state.branchId || undefined,
    companyId: state.companyId || undefined,
  };
}

/** Rapor uçlarının dönemi: "Tümü"de `from` yok, `to` sunucu bugünü; aksi seçili aralık. */
export function apiPeriod(range: FrRange): { from?: string; to?: string } {
  return range.isAll ? {} : { from: range.from ?? undefined, to: range.to };
}

/** Ekstre dönemi (sunucuda `from`/`to` zorunlu): "Tümü" → 0001-01-01 … bugün. */
export function statementPeriod(range: FrRange): { from: string; to: string } {
  return {
    from: range.isAll ? STATEMENT_OPEN_FROM : (range.from ?? STATEMENT_OPEN_FROM),
    to: range.to,
  };
}

/**
 * URL şirket değeri → rapor parametresi: tek şirkette (seçici yok) `undefined` (aktif şirket kuralı);
 * `all` → konsolide (null); kimlik → o şirket; boş → aktif şirket (undefined).
 */
export function reportCompany(raw: string, multiCompany: boolean): string | null | undefined {
  if (!multiCompany || raw === "") return undefined;
  return raw === COMPANY_CONSOLIDATED ? null : raw;
}

/** Şirket seçicisinin değeri: URL boşsa aktif şirket ya da konsolide. */
export function companySelectValue(raw: string, activeCompanyId: string | null): string {
  if (raw) return raw;
  return activeCompanyId ?? COMPANY_CONSOLIDATED;
}

/** Seçicideki şirket → URL değeri (aktif şirketle aynıysa parametre yazılmaz). */
export function companyUrlValue(selected: string, activeCompanyId: string | null): string {
  const active = activeCompanyId ?? COMPANY_CONSOLIDATED;
  return selected === active ? "" : selected;
}

// ---------------------------------------------------------------------------------------------
// Şube (ZTO `bp`) ve iş yeri (ZTO `wp`) — Rev 1 FE-FRI-BRANCHGROUP
// ---------------------------------------------------------------------------------------------

export type FrOption = { value: string; label: string };

/** Şube seçenekleri: kapsamdaki şube grupları (grupsuz iş yerleri seçenek değildir), ağaç sırasıyla. */
export function branchGroupOptions(tree: BranchTree | undefined): FrOption[] {
  const seen = new Set<string>();
  const options: FrOption[] = [];
  for (const company of tree ?? []) {
    for (const group of company.groups) {
      if (!group.groupId || seen.has(group.groupId)) continue;
      seen.add(group.groupId);
      options.push({ value: group.groupId, label: group.groupName });
    }
  }
  return options;
}

/** İş yeri seçenekleri; şube seçiliyse yalnız o şubenin iş yerleri. */
export function workplaceOptions(tree: BranchTree | undefined, branchGroupId: string): FrOption[] {
  const options: FrOption[] = [];
  for (const company of tree ?? []) {
    for (const group of company.groups) {
      if (branchGroupId && group.groupId !== branchGroupId) continue;
      for (const branch of group.branches) options.push({ value: branch.id, label: branch.name });
    }
  }
  return options;
}

export type ResolvedBranches = {
  /** Ağaç yüklenmeden şube çözülemez: sorgu bekler. */
  ready: boolean;
  /** API `branchIds`; undefined = kullanıcının tüm kapsamı. */
  ids?: string[];
  /** Şubenin kapsamda iş yeri yok: sorgu atılmaz, sonuç boş. */
  empty: boolean;
};

/**
 * API iş yeri listesi: iş yeri > şube > yok (§5.5). Şube, kapsamdaki iş yerlerine açılır; iş yeri
 * seçiliyse şube yalnız seçenek süzgecidir.
 */
export function resolveBranchIds(
  branchId: string,
  branchGroupId: string,
  tree: BranchTree | undefined,
): ResolvedBranches {
  if (branchId) return { ready: true, ids: [branchId], empty: false };
  if (!branchGroupId) return { ready: true, ids: undefined, empty: false };
  if (!tree) return { ready: false, ids: undefined, empty: false };
  const ids = workplaceOptions(tree, branchGroupId).map((option) => option.value);
  return ids.length > 0
    ? { ready: true, ids, empty: false }
    : { ready: true, ids: undefined, empty: true };
}

// ---------------------------------------------------------------------------------------------
// İşaret, durum, toplamlar
// ---------------------------------------------------------------------------------------------

export function negDec(value: DecimalInput): string {
  return subDec(0, value);
}

export function absDec(value: DecimalInput): string {
  return cmpDec(value, 0) < 0 ? negDec(value) : addDec(value, 0);
}

/** Kapalı mı: |v| < 0,005 (`FrLedger.State`). */
export function isClosed(value: DecimalInput): boolean {
  return cmpDec(absDec(value), CLOSED_TOLERANCE) < 0;
}

/**
 * Ekranda gösterilen kalan (ZTO `FrLedger.Display`, Rev 1 FE-FRI-SIGN): alacak yanında aynen, borç
 * yanında ters işaret (normal borcumuz pozitif görünür). Devir/Kalan hücreleri, `fr-neg`, Kalan
 * kutucuğu, sıralama ve Excel bu değerden.
 */
export function display(side: LedgerSide, value: DecimalInput): string {
  return side === "RECEIVABLE" ? addDec(value, 0) : negDec(value);
}

export type LedgerStateKey = "CLOSED" | "THEY_OWE" | "WE_OWE";

/** Durum kartı ham `closing`'den (`FrLedger.State`). */
export function ledgerState(closing: DecimalInput): LedgerStateKey {
  if (isClosed(closing)) return "CLOSED";
  return cmpDec(closing, 0) > 0 ? "THEY_OWE" : "WE_OWE";
}

/** Net metninin yan eki: > 0 "(bize borçlu)", < 0 "(borcumuz)", 0 boş. */
export function netSide(net: DecimalInput): "theyOwe" | "weOwe" | null {
  const sign = cmpDec(net, 0);
  return sign > 0 ? "theyOwe" : sign < 0 ? "weOwe" : null;
}

/** Ekstre bakiye eki (`FrLedger.BalanceSide`): B cari bize borçlu, A alacaklı, sıfırda yok. */
export function balanceSuffix(value: DecimalInput): "B" | "A" | "" {
  const sign = cmpDec(value, 0);
  return sign > 0 ? "B" : sign < 0 ? "A" : "";
}

const CURRENCY_RANK: Record<string, number> = { TRY: 0, USD: 1, EUR: 2, GBP: 3 };

/** Para birimi sırası (ZTO para birimi kimliği sırası: TL, $, €, £; sonra alfabetik). */
export function compareCurrency(a: string, b: string): number {
  const ra = CURRENCY_RANK[a] ?? 99;
  const rb = CURRENCY_RANK[b] ?? 99;
  return ra !== rb ? ra - rb : a.localeCompare(b);
}

export type CurrencyTotal = {
  currency: string;
  weOwe: string;
  theyOwe: string;
  net: string;
  open: number;
};

/**
 * Para birimi başına toplam (`FrLedger.Totals` / finance-report.js `currencyTotals`): borcumuz ve
 * alacağımız yalnız açık satırlardan AYRI toplanır, net hepsinin toplamıdır; bir carinin avansı başka
 * birinin borcundan düşülmez. Para birimleri birbirine çevrilmez.
 */
export function currencyTotals(
  rows: ReadonlyArray<{ currency: string; closing: string }>,
): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    let total = map.get(row.currency);
    if (!total) {
      total = { currency: row.currency, weOwe: "0.00", theyOwe: "0.00", net: "0.00", open: 0 };
      map.set(row.currency, total);
    }
    total.net = addDec(total.net, row.closing);
    if (isClosed(row.closing)) continue;
    total.open++;
    if (cmpDec(row.closing, 0) < 0) total.weOwe = subDec(total.weOwe, row.closing);
    else total.theyOwe = addDec(total.theyOwe, row.closing);
  }
  return [...map.values()].sort((a, b) => compareCurrency(a.currency, b.currency));
}

/**
 * Özet kutucukları (finance-report.js `sumBySymbol`): para birimi simgesi başına toplam, ilk görülme
 * sırasıyla; |toplam| < 0,005 yazılmaz.
 */
export function sumBySymbol(
  records: ReadonlyArray<{ sym: string; v: DecimalInput }>,
): Array<{ sym: string; total: string }> {
  const map = new Map<string, string>();
  for (const record of records) map.set(record.sym, addDec(map.get(record.sym) ?? 0, record.v));
  return [...map].map(([sym, total]) => ({ sym, total })).filter((entry) => !isClosed(entry.total));
}

// ---------------------------------------------------------------------------------------------
// Liste kipi
// ---------------------------------------------------------------------------------------------

/** Satır anahtarı cari × şirket × para birimi (Rev 1 F3, OK-12.8-28). */
export function listRowKey(row: Pick<LedgerAccountRow, "accountId" | "companyId" | "currency">) {
  return `${row.accountId}|${row.companyId}|${row.currency}`;
}

/** Son tahsilat/ödemenin yaşı (gün; bugün − tarih); tarih yoksa null. */
export function settleAge(date: string | null, today: string): number | null {
  return date ? daysBetween(date, today) : null;
}

export type SettleBucket = "none" | "last30" | "d31To90" | "d90";

/** "Son tahsilat"/"Son ödeme" kartı kovası (ileri tarih = son 30 gün; ZTO). */
export function settleBucket(date: string | null, today: string): SettleBucket {
  const age = settleAge(date, today);
  if (age === null) return "none";
  if (age <= 30) return "last30";
  if (age <= 90) return "d31To90";
  return "d90";
}

/** Cari araması (finance-report.js `matches`): `kod + " " + ad` üzerinde tr küçük harf. */
export function matchesSearch(
  row: Pick<LedgerAccountRow, "accountCode" | "accountName">,
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase("tr");
  return q === "" || `${row.accountCode} ${row.accountName}`.toLocaleLowerCase("tr").includes(q);
}

export type FrColumnId =
  | "code"
  | "name"
  | "company"
  | "group"
  | "currency"
  | "opening"
  | "sales"
  | "penalty"
  | "otherDebt"
  | "collection"
  | "payment"
  | "purchase"
  | "paid"
  | "refund"
  | "closing"
  | "lastSettlement"
  | "settlementAmount"
  | "lastMovement";

export type FrColumn = {
  id: FrColumnId;
  /** Sayısal sütun (ZTO `th.num`): ham ondalıkla sıralanır. */
  numeric: boolean;
  /** ZTO `th` sınıfları (`fr-opt`, `fr-sticky`, `num fr-mid` …). */
  className: string;
};

/**
 * Liste sütunları (Index.cshtml:249-278): alacak yanı Satış, Ceza, Diğer borç, Tahsilat, Ödeme; borç
 * yanı Alış / borç, Ödenen, İade / alacak, Tahsilat. "Şirket" yalnız çok şirketli konsolidede
 * (Blackrose eki). "Bekleyen (tahmini)" yok (bahçe akışı, MX1 §2.7).
 */
export function listColumns(side: LedgerSide, showCompany: boolean): FrColumn[] {
  const head: FrColumn[] = [
    { id: "code", numeric: false, className: "fr-opt" },
    { id: "name", numeric: false, className: "fr-sticky" },
  ];
  if (showCompany) head.push({ id: "company", numeric: false, className: "fr-opt" });
  head.push(
    { id: "group", numeric: false, className: "fr-opt" },
    { id: "currency", numeric: false, className: "" },
    { id: "opening", numeric: true, className: "num fr-mid" },
  );
  const middle: FrColumn[] =
    side === "RECEIVABLE"
      ? [
          { id: "sales", numeric: true, className: "num fr-mid" },
          { id: "penalty", numeric: true, className: "num fr-mid" },
          { id: "otherDebt", numeric: true, className: "num fr-mid" },
          { id: "collection", numeric: true, className: "num fr-mid" },
          { id: "payment", numeric: true, className: "num fr-mid" },
        ]
      : [
          { id: "purchase", numeric: true, className: "num fr-mid" },
          { id: "paid", numeric: true, className: "num fr-mid" },
          { id: "refund", numeric: true, className: "num fr-mid" },
          { id: "collection", numeric: true, className: "num fr-mid" },
        ];
  return [
    ...head,
    ...middle,
    { id: "closing", numeric: true, className: "num" },
    { id: "lastSettlement", numeric: false, className: "" },
    { id: "settlementAmount", numeric: true, className: "num fr-mid" },
    { id: "lastMovement", numeric: false, className: "fr-opt" },
  ];
}

/**
 * Hücrenin ham değeri (ZTO `data-v`): sayısal sütunda ondalık metin, metin sütununda metin; tarihler
 * ISO (metin olarak sıralanır). Satış = `receivable`, Ceza = `penalty`, Diğer borç / Alış = `debt`,
 * İade / alacak = `receivable + penalty`, Ödenen/Ödeme = `payment`, Devir/Kalan = `display`.
 */
export function cellValue(row: LedgerAccountRow, column: FrColumnId, side: LedgerSide): string {
  switch (column) {
    case "code":
      return row.accountCode;
    case "name":
      return row.accountName;
    case "company":
      return row.companyName;
    case "group":
      return row.subGroupName;
    case "currency":
      return currencySymbol(row.currency);
    case "opening":
      return display(side, row.opening);
    case "sales":
      return row.receivable;
    case "penalty":
      return row.penalty;
    case "otherDebt":
    case "purchase":
      return row.debt;
    case "collection":
      return row.collection;
    case "payment":
    case "paid":
      return row.payment;
    case "refund":
      return addDec(row.receivable, row.penalty);
    case "closing":
      return display(side, row.closing);
    case "lastSettlement":
      return row.lastSettlementDate ?? "";
    case "settlementAmount":
      return row.lastSettlementAmount ?? "0";
    case "lastMovement":
      return row.lastMovementDate ?? "";
  }
}

export type SortDirection = "ascending" | "descending";
export type FrSort = { column: FrColumnId; direction: SortDirection } | null;

const textCollator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

/** İlk tık artan, aynı sütuna tekrar ters; başka sütun yine artan (MWG `sortable-table`). */
export function nextSort(current: FrSort, column: FrColumnId): FrSort {
  if (current?.column === column) {
    return {
      column,
      direction: current.direction === "ascending" ? "descending" : "ascending",
    };
  }
  return { column, direction: "ascending" };
}

/**
 * Sıralama: sayısal sütun ham ondalıkla (`cmpDec`), metin `Intl.Collator("tr", { numeric, base })`;
 * `Array.prototype.sort` kararlıdır (eşitler önceki sırada kalır).
 */
export function sortRows(
  rows: readonly LedgerAccountRow[],
  sort: FrSort,
  side: LedgerSide,
): LedgerAccountRow[] {
  if (!sort) return rows.slice();
  const numeric = listColumns(side, true).find((column) => column.id === sort.column)?.numeric;
  const factor = sort.direction === "ascending" ? 1 : -1;
  const keyed = rows.map((row) => ({ row, value: cellValue(row, sort.column, side) }));
  keyed.sort((a, b) => {
    const result = numeric
      ? cmpDec(a.value || 0, b.value || 0)
      : textCollator.compare(a.value, b.value);
    return factor * result;
  });
  return keyed.map((entry) => entry.row);
}

export type TileKey = "credit" | "collection" | "penalty" | "debt" | "payment" | "kalan";

/** Yana göre kutucuklar (Index.cshtml:224-237; sıra ve sınıf birebir). */
export function tileKeys(
  side: LedgerSide,
): Array<{ key: TileKey; css: "" | "ok" | "bad" | "warn" }> {
  return side === "RECEIVABLE"
    ? [
        { key: "credit", css: "" },
        { key: "collection", css: "ok" },
        { key: "penalty", css: "bad" },
        { key: "kalan", css: "warn" },
      ]
    : [
        { key: "debt", css: "" },
        { key: "payment", css: "ok" },
        { key: "credit", css: "" },
        { key: "kalan", css: "warn" },
      ];
}

/** Kutucuğun satır değeri (ZTO `data-<alan>`): alacak yanında `credit` = Satış, borç yanında İade / alacak. */
export function tileValue(row: LedgerAccountRow, key: TileKey, side: LedgerSide): string {
  switch (key) {
    case "credit":
      return side === "RECEIVABLE" ? row.receivable : addDec(row.receivable, row.penalty);
    case "collection":
      return row.collection;
    case "penalty":
      return row.penalty;
    case "debt":
      return row.debt;
    case "payment":
      return row.payment;
    case "kalan":
      return display(side, row.closing);
  }
}

/** Görünen satırlardan kutucuklar: ayrı cari sayısı + simge başına toplamlar. */
export function tileTotals(rows: readonly LedgerAccountRow[], side: LedgerSide) {
  const totals = {} as Record<TileKey, Array<{ sym: string; total: string }>>;
  for (const { key } of tileKeys(side)) {
    totals[key] = sumBySymbol(
      rows.map((row) => ({
        sym: currencySymbol(row.currency) || "?",
        v: tileValue(row, key, side),
      })),
    );
  }
  return { count: new Set(rows.map((row) => row.accountId)).size, totals };
}

// ---------------------------------------------------------------------------------------------
// Ekstre kipi (`FrLedger.Statement`)
// ---------------------------------------------------------------------------------------------

export type FrStatementRow = {
  line: StatementLine;
  /** "Borç" sütunu: DEBIT yönlü (alacaklarımız ve yaptığımız ödemeler). */
  debit: string;
  /** "Alacak" sütunu: CREDIT yönlü (borçlarımız ve aldığımız tahsilatlar). */
  credit: string;
  balance: string;
};

export type FrStatementBlock = {
  currency: string;
  opening: string;
  rows: FrStatementRow[];
  periodDebit: string;
  periodCredit: string;
  closing: string;
};

const KIND_ORDER: Record<string, number> = { DEBT: 0, RECEIVABLE: 1, PAYMENT: 2, COLLECTION: 3 };

/** Aynı anda önce borç/alacak doğar, sonra ödeme/tahsilat düşer (Cari Ekstre sırası). */
export function compareStatementLines(a: StatementLine, b: StatementLine): number {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    (KIND_ORDER[a.kind] ?? 4) - (KIND_ORDER[b.kind] ?? 4) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Para birimi başına ekstre blokları: devir (`openingBalances`), tarih sırasıyla hareketler, yürüyen
 * bakiye, dönem toplamları. Devri ya da hareketi olan her para birimi blok alır; `currency` verilirse
 * yalnız o.
 */
export function statementBlocks(statement: Statement, currency = ""): FrStatementBlock[] {
  const openings = new Map<string, string>();
  for (const opening of statement.openingBalances ?? []) {
    openings.set(opening.currency, addDec(opening.amount, 0));
  }
  const byCurrency = new Map<string, StatementLine[]>();
  for (const line of statement.lines) {
    const list = byCurrency.get(line.currency) ?? [];
    list.push(line);
    byCurrency.set(line.currency, list);
  }
  const currencies = new Set<string>(byCurrency.keys());
  for (const [code, amount] of openings) if (!isClosed(amount)) currencies.add(code);
  return [...currencies]
    .filter((code) => !currency || code === currency)
    .sort(compareCurrency)
    .map((code) => {
      const opening = openings.get(code) ?? "0.00";
      let balance = opening;
      let periodDebit = "0.00";
      let periodCredit = "0.00";
      const rows = (byCurrency.get(code) ?? [])
        .slice()
        .sort(compareStatementLines)
        .map((line) => {
          const debit = line.direction === "DEBIT" ? addDec(line.amount, 0) : "0.00";
          const credit = line.direction === "CREDIT" ? addDec(line.amount, 0) : "0.00";
          balance = subDec(addDec(balance, debit), credit);
          periodDebit = addDec(periodDebit, debit);
          periodCredit = addDec(periodCredit, credit);
          return { line, debit, credit, balance };
        });
      return { currency: code, opening, rows, periodDebit, periodCredit, closing: balance };
    });
}

/** Yöntem tablosu sırası (ZTO: tür, sonra yöntem). */
export function sortMethods(rows: readonly AccountMethodTotal[]): AccountMethodTotal[] {
  const typeRank = (type: string) => (type === "PAYMENT" ? 0 : 1);
  return rows
    .slice()
    .sort(
      (a, b) =>
        typeRank(a.type) - typeRank(b.type) ||
        a.method.localeCompare(b.method) ||
        compareCurrency(a.currency, b.currency),
    );
}

// ---------------------------------------------------------------------------------------------
// Excel (finance-report.js `sheetRows`; `data-fr-sheet` taşıyan her tablo bir sayfa)
// ---------------------------------------------------------------------------------------------

export type SheetCell = { text: string; v?: string | null };

/** `v` verilmişse sayısal ise sayı, boşsa boş hücre; yoksa metin (formül çalışmaz). */
export function sheetCell(cell: SheetCell): ExportCell {
  if (cell.v === undefined || cell.v === null) return cell.text;
  if (String(cell.v).trim() === "") return null;
  const number = Number(cell.v);
  return Number.isFinite(number) ? number : cell.text;
}

export type FrSheet = { name: string; headers: string[]; rows: SheetCell[][] };

/**
 * Tablodan sayfa: ad `data-fr-sheet`, başlık `thead`'in son satırı, gövde satırları (DOM'da yalnız
 * görünen satırlar vardır; süzülen satırlar çizilmez). Hücre `data-v` taşıyorsa ham değer.
 */
export function tableToSheet(table: HTMLTableElement): FrSheet {
  const textOf = (cell: Element) => (cell.textContent ?? "").replace(/\s+/g, " ").trim();
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  const headers = headRow ? Array.from(headRow.cells, textOf) : [];
  const rows: SheetCell[][] = [];
  for (const body of Array.from(table.tBodies)) {
    for (const tr of Array.from(body.rows)) {
      rows.push(
        Array.from(tr.cells, (cell) => {
          const v = cell.getAttribute("data-v");
          return v === null ? { text: textOf(cell) } : { text: textOf(cell), v };
        }),
      );
    }
  }
  return { name: table.getAttribute("data-fr-sheet") ?? "", headers, rows };
}

/** Toplam satır sayısı (Excel üretimi için parçalı işlem eşiği). */
export function sheetRowCount(sheets: readonly FrSheet[]): number {
  return sheets.reduce((count, sheet) => count + sheet.rows.length, 0);
}

/** Sayfaların sayı biçimi: ham değerli (sayısal) sütunlarda "#,##0.00". */
export function sheetNumberFormats(sheet: FrSheet): Array<string | undefined> {
  return sheet.headers.map((_, index) =>
    sheet.rows.some((row) => typeof sheetCell(row[index] ?? { text: "" }) === "number")
      ? "#,##0.00"
      : undefined,
  );
}

/**
 * Ekstrenin sayfaları sırayla (sunucuyu paralel istekle yormaz), en çok `maxPages` sayfa (§5.5: 30 ×
 * 2000 = 60.000 satır). Fazlası varsa `truncated` ("Ekstre {0} satırla sınırlandı").
 */
export async function fetchStatementCapped(
  getPage: (page: number) => Promise<Statement>,
  maxPages = STATEMENT_MAX_PAGES,
): Promise<{ statement: Statement; truncated: boolean }> {
  const first = await getPage(0);
  const lines = [...first.lines];
  const pages = Math.min(first.totalPages, maxPages);
  for (let page = 1; page < pages; page++) {
    lines.push(...(await getPage(page)).lines);
  }
  return {
    statement: { ...first, lines, page: 0, size: lines.length },
    truncated: first.totalPages > maxPages,
  };
}
