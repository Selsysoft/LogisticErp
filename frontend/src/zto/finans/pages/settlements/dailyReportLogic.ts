import type { DailyReportParams } from "../../../../pages/finance/settlementApi";
import type {
  DailyFundBalance,
  DailyInstrumentMovement,
  PayMethod,
  SettlementListItem,
  SettlementType,
} from "../../../../pages/finance/types";
import { mapInChunks } from "../../../a11y";
import { sumDec } from "../../../decimal";
import { currencySymbol, formatN2 } from "../../../format";
import { searchKey } from "../../../searchKey";
import { METHOD_OPTIONS, payMethodOf } from "./settlementListLogic";

/*
 * Günlük Ödeme / Tahsilat Raporu saf mantığı (12.2a_TASARIM §5.12; ZTO DailyPaymentReport.cshtml,
 * DailyCollectionReport.cshtml ve CustomerAccountPaymentController :3400-3935). Satırlar sunucudan
 * `createdAt` sırasıyla gelir (TIME_ASC/TIME_DESC); gruplama, özet kartları, kart/arama süzgeci ve
 * genel toplamlar burada. Tutar toplamları `decimal.ts` ile (float yok).
 */

// ---------------------------------------------------------------------------------------------
// URL durumu (reportDate, workPlaceIds, fundAccountIds, currency, method, sort)
// ---------------------------------------------------------------------------------------------

export type ReportSort = "time-asc" | "time-desc";

export type DailyReportState = {
  reportDate: string;
  workPlaceIds: string[];
  fundAccountIds: string[];
  currency: string;
  method: PayMethod | "";
  sort: ReportSort;
};

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** URL → durum; geçersiz tarih bugüne, bilinmeyen yöntem/sıralama varsayılana düşer. */
export function parseReportState(params: URLSearchParams, today: string): DailyReportState {
  const date = params.get("reportDate") ?? "";
  const method = (params.get("method") ?? "").toUpperCase();
  return {
    reportDate: ISO_DATE.test(date) ? date : today,
    workPlaceIds: list(params.get("workPlaceIds")),
    fundAccountIds: list(params.get("fundAccountIds")),
    currency: (params.get("currency") ?? "").trim().toUpperCase(),
    method: (METHOD_OPTIONS as readonly string[]).includes(method) ? (method as PayMethod) : "",
    sort: params.get("sort") === "time-desc" ? "time-desc" : "time-asc",
  };
}

/** Durum → URL (boş alan yazılmaz; virgüllü listeler ZTO `workPlaceIds=a,b` biçimi). */
export function reportSearch(state: DailyReportState): string {
  const parts = [`reportDate=${encodeURIComponent(state.reportDate)}`];
  const ids = (key: string, values: string[]) => {
    if (values.length > 0) parts.push(`${key}=${values.map(encodeURIComponent).join(",")}`);
  };
  ids("workPlaceIds", state.workPlaceIds);
  ids("fundAccountIds", state.fundAccountIds);
  if (state.currency) parts.push(`currency=${encodeURIComponent(state.currency)}`);
  if (state.method) parts.push(`method=${state.method}`);
  if (state.sort !== "time-asc") parts.push(`sort=${state.sort}`);
  return parts.join("&");
}

/** "Temizle": yalnız tarih korunur (DPR:868-870). */
export function clearedState(reportDate: string): DailyReportState {
  return {
    reportDate,
    workPlaceIds: [],
    fundAccountIds: [],
    currency: "",
    method: "",
    sort: "time-asc",
  };
}

export function toDailyParams(type: SettlementType, state: DailyReportState): DailyReportParams {
  return {
    type,
    date: state.reportDate,
    branchIds: state.workPlaceIds.length > 0 ? state.workPlaceIds : undefined,
    fundAccountIds: state.fundAccountIds.length > 0 ? state.fundAccountIds : undefined,
    currency: state.currency || undefined,
    methods: state.method ? [state.method] : undefined,
    sort: state.sort === "time-desc" ? "TIME_DESC" : "TIME_ASC",
  };
}

// ---------------------------------------------------------------------------------------------
// Satırlar
// ---------------------------------------------------------------------------------------------

/** Yerel saat HH:mm:ss (`createdAt` Instant; MWG capture-location-agnostic-data). */
export function timeText(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type FundKey = string;
/** Fonsuz (çek) satırların blok anahtarı. */
export const NO_FUND: FundKey = "none";

export type ReportTexts = {
  method: (method: PayMethod) => string;
  /** "Kasa: {ad}". */
  cash: (name: string) => string;
  /** "Banka/Kasa Tanımsız". */
  undefinedFund: string;
  /** Maskeli personel satırının cari metni. */
  masked: string;
  /** Carisiz gider satırı "Gider: {ad}". */
  expense: (name: string) => string;
};

export type ReportItem = {
  row: SettlementListItem;
  /** S. No: rapor içi sıra (OK-12.2a-19). */
  no: number;
  time: string;
  method: PayMethod;
  fundKey: FundKey;
  fundKind: "BANK" | "CASH" | "NONE";
  /** Grup başlığı: banka adı / "Kasa: ad" / "Banka/Kasa Tanımsız". */
  fundTitle: string;
  /** Banka şubesi (bank-meta; yoksa "-"). */
  fundMeta: string;
  /** Kaynak sütunu: "Banka (Şube)" / "Kasa: ad" / "-". */
  source: string;
  accountText: string;
  /** Arama için katlanmış metin (görünen hücreler). */
  search: string;
};

function fundParts(row: SettlementListItem, texts: ReportTexts) {
  if (!row.fundAccountId || !row.fundKind) {
    return {
      fundKey: NO_FUND,
      fundKind: "NONE" as const,
      fundTitle: texts.undefinedFund,
      fundMeta: "-",
      source: "-",
    };
  }
  if (row.fundKind === "CASH") {
    const title = texts.cash(row.fundName ?? "");
    return {
      fundKey: row.fundAccountId,
      fundKind: "CASH" as const,
      fundTitle: title,
      fundMeta: "-",
      source: title,
    };
  }
  const bank = row.fundBankName?.trim() || row.fundName || "";
  const branch = row.fundBankBranchName?.trim() || "";
  return {
    fundKey: row.fundAccountId,
    fundKind: "BANK" as const,
    fundTitle: bank,
    fundMeta: branch || "-",
    source: branch ? `${bank} (${branch})` : bank,
  };
}

export function accountText(row: SettlementListItem, texts: ReportTexts): string {
  if (row.employeeMasked) return texts.masked;
  if (!row.accountId && !row.accountName) {
    return row.expenseItemName ? texts.expense(row.expenseItemName) : "-";
  }
  return row.accountName ?? "";
}

export function toReportItem(
  row: SettlementListItem,
  index: number,
  texts: ReportTexts,
): ReportItem {
  const method = payMethodOf(row);
  const fund = fundParts(row, texts);
  const account = accountText(row, texts);
  const search = searchKey(
    [
      account,
      row.accountCode ?? "",
      row.documentNo ?? "",
      texts.method(method),
      fund.source,
      formatN2(row.money.amount),
      currencySymbol(row.money.currency),
      row.description ?? "",
      row.branchName,
      row.instrumentNumber ?? "",
    ].join(" "),
  );
  return {
    row,
    no: index + 1,
    time: timeText(row.createdAt),
    method,
    ...fund,
    accountText: account,
    search,
  };
}

/** ≥ 500 satırda iş parçalara bölünür (MWG break-up-long-tasks; `mapInChunks` 50 ms bütçe). */
export const CHUNK_THRESHOLD = 500;

export async function buildReportItems(
  rows: readonly SettlementListItem[],
  texts: ReportTexts,
): Promise<ReportItem[]> {
  if (rows.length < CHUNK_THRESHOLD) return rows.map((row, i) => toReportItem(row, i, texts));
  return mapInChunks(rows, (row, i) => toReportItem(row, i, texts));
}

// ---------------------------------------------------------------------------------------------
// Para birimi toplamları (BuildCurrencyTotalText)
// ---------------------------------------------------------------------------------------------

export type CurrencyTotal = { symbol: string; total: string; count: number };

const collator = new Intl.Collator("tr");

/** Para birimi sembolüne göre toplamlar (sembol sırası). */
export function currencyTotals(items: readonly ReportItem[]): CurrencyTotal[] {
  const groups = new Map<string, ReportItem[]>();
  for (const item of items) {
    const symbol = currencySymbol(item.row.money.currency) || "₺";
    const list = groups.get(symbol) ?? [];
    list.push(item);
    groups.set(symbol, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([symbol, list]) => ({
      symbol,
      total: sumDec(list.map((i) => i.row.money.amount)),
      count: list.length,
    }));
}

/** "1.500,00 ₺ | 200,00 $"; boşsa "0,00 ₺" (CAPC BuildCurrencyTotalText). */
export function currencyTotalText(items: readonly ReportItem[]): string {
  const totals = currencyTotals(items);
  return totals.length === 0
    ? "0,00 ₺"
    : totals.map((t) => `${formatN2(t.total)} ${t.symbol}`).join(" | ");
}

// ---------------------------------------------------------------------------------------------
// Gruplama: iş yeri → banka/kasa
// ---------------------------------------------------------------------------------------------

export type FundGroup = {
  key: FundKey;
  kind: "BANK" | "CASH" | "NONE";
  title: string;
  meta: string;
  items: ReportItem[];
  totalText: string;
};

export type WorkPlaceGroup = {
  branchId: string;
  name: string;
  groupName: string | null;
  items: ReportItem[];
  funds: FundGroup[];
  totalText: string;
};

/** İş yeri adına, içinde banka/kasa başlığına göre sıralı (CAPC :3830-3860); satır sırası korunur. */
export function groupItems(items: readonly ReportItem[]): WorkPlaceGroup[] {
  const byBranch = new Map<string, ReportItem[]>();
  for (const item of items) {
    const list = byBranch.get(item.row.branchId) ?? [];
    list.push(item);
    byBranch.set(item.row.branchId, list);
  }
  return [...byBranch.entries()]
    .map(([branchId, list]) => {
      const byFund = new Map<string, ReportItem[]>();
      for (const item of list) {
        const fundList = byFund.get(item.fundKey) ?? [];
        fundList.push(item);
        byFund.set(item.fundKey, fundList);
      }
      const funds = [...byFund.entries()]
        .map(([key, fundItems]) => ({
          key,
          kind: fundItems[0].fundKind,
          title: fundItems[0].fundTitle,
          meta: fundItems[0].fundMeta,
          items: fundItems,
          totalText: currencyTotalText(fundItems),
        }))
        .sort((a, b) => collator.compare(a.title, b.title));
      return {
        branchId,
        name: list[0].row.branchName,
        groupName: list[0].row.branchGroupName,
        items: list,
        funds,
        totalText: currencyTotalText(list),
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));
}

// ---------------------------------------------------------------------------------------------
// Özet kartları ve kart süzgeci (DPR:1532-1640)
// ---------------------------------------------------------------------------------------------

export type CardType = "workPlace" | "fund" | "method" | "currency";

export type SummaryCard = {
  type: CardType;
  value: string;
  name: string;
  count: number;
  totalText: string;
};

/** Kart başına en çok 10 öğe gösterilir (DPR `Take(10)`). */
export const CARD_LIMIT = 10;

export function summaryCards(
  items: readonly ReportItem[],
  groups: readonly WorkPlaceGroup[],
  methodLabel: (method: PayMethod) => string,
): Record<CardType, SummaryCard[]> {
  const workPlace = groups.map((g) => ({
    type: "workPlace" as const,
    value: g.branchId,
    name: g.name,
    count: g.items.length,
    totalText: g.totalText,
  }));
  // Banka/Kasa kartı fon başına tektir (iş yerleri arasında birleşir; fonsuz satırlar tek
  // "Tanımsız" kartı) — kart kimliği aynı zamanda süzgeç değeridir.
  const byFund = new Map<string, ReportItem[]>();
  const byMethod = new Map<PayMethod, ReportItem[]>();
  const byCurrency = new Map<string, ReportItem[]>();
  for (const item of items) {
    byFund.set(item.fundKey, [...(byFund.get(item.fundKey) ?? []), item]);
    byMethod.set(item.method, [...(byMethod.get(item.method) ?? []), item]);
    const currency = item.row.money.currency;
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), item]);
  }
  const fund = [...byFund.entries()]
    .map(([key, list]) => ({
      type: "fund" as const,
      value: key,
      name: list[0].fundTitle,
      count: list.length,
      totalText: currencyTotalText(list),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
  const method = [...byMethod.entries()]
    .map(([m, list]) => ({
      type: "method" as const,
      value: m,
      name: methodLabel(m),
      count: list.length,
      totalText: currencyTotalText(list),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
  const currency = [...byCurrency.entries()]
    .map(([code, list]) => ({
      type: "currency" as const,
      value: code,
      name: currencySymbol(code),
      count: list.length,
      totalText: currencyTotalText(list),
    }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { workPlace, fund, method, currency };
}

export type CardFilters = Record<CardType, string[]>;

export const NO_CARD_FILTERS: CardFilters = { workPlace: [], fund: [], method: [], currency: [] };

/** Tür içi VEYA, türler arası VE (DPR:1600-1620 çoklu seçim). */
export function toggleCardFilter(filters: CardFilters, type: CardType, value: string): CardFilters {
  const current = filters[type];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [type]: next };
}

export function hasCardFilter(filters: CardFilters): boolean {
  return (Object.keys(filters) as CardType[]).some((type) => filters[type].length > 0);
}

export function itemMatches(item: ReportItem, term: string, filters: CardFilters): boolean {
  const key = searchKey(term.trim());
  if (key && !item.search.includes(key)) return false;
  const check = (type: CardType, value: string) =>
    filters[type].length === 0 || filters[type].includes(value);
  return (
    check("workPlace", item.row.branchId) &&
    check("fund", item.fundKey) &&
    check("method", item.method) &&
    check("currency", item.row.money.currency)
  );
}

// ---------------------------------------------------------------------------------------------
// Genel toplamlar (DPR:1100-1290, DCR farkları)
// ---------------------------------------------------------------------------------------------

export type TotalsBlock = { count: number; totals: CurrencyTotal[] };
export type CashTotals = TotalsBlock & { name: string };

export type ReportTotals = {
  transfer: TotalsBlock;
  regular: {
    count: number;
    bank: TotalsBlock | null;
    cashes: CashTotals[];
    undefined: TotalsBlock | null;
  };
  /** Yalnız PAYMENT ve kredi (BANK carisi) satırı varsa. */
  credit: TotalsBlock | null;
  grand: TotalsBlock;
};

function block(items: readonly ReportItem[]): TotalsBlock {
  return { count: items.length, totals: currencyTotals(items) };
}

/**
 * Transfer = şirketler arası; Cari = transfer ve (ödemede) kredi dışı — banka tek blok, her kasa ayrı,
 * fonsuz "Tanımsız"; Kredi = ödemede `credit`; Genel = hepsi ("Diğer" yöntemi yok).
 */
export function reportTotals(items: readonly ReportItem[], type: SettlementType): ReportTotals {
  const transfer = items.filter((i) => i.row.intercompany);
  const isCredit = (i: ReportItem) => type === "PAYMENT" && !i.row.intercompany && i.row.credit;
  const credit = items.filter(isCredit);
  const regular = items.filter((i) => !i.row.intercompany && !isCredit(i));
  const bank = regular.filter((i) => i.fundKind === "BANK");
  const cashMap = new Map<string, ReportItem[]>();
  for (const item of regular.filter((i) => i.fundKind === "CASH")) {
    const name = item.row.fundName ?? "";
    cashMap.set(name, [...(cashMap.get(name) ?? []), item]);
  }
  const none = regular.filter((i) => i.fundKind === "NONE");
  return {
    transfer: block(transfer),
    regular: {
      count: regular.length,
      bank: bank.length > 0 ? block(bank) : null,
      cashes: [...cashMap.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([name, list]) => ({ name, ...block(list) })),
      undefined: none.length > 0 ? block(none) : null,
    },
    credit: credit.length > 0 ? block(credit) : null,
    grand: block(items),
  };
}

// ---------------------------------------------------------------------------------------------
// Özet bakiye ve çek bölümleri
// ---------------------------------------------------------------------------------------------

/** "Banka (Şube ₺)" / "Banka ₺"; kasa "Kasa ₺" (CAPC :4031-4033, :4099). */
export function balanceDisplay(balance: DailyFundBalance): string {
  const symbol = currencySymbol(balance.currency);
  if (balance.kind === "CASH") return `${balance.name} ${symbol}`;
  const bank = balance.bankName?.trim() || balance.name;
  const branch = balance.bankBranchName?.trim();
  return branch ? `${bank} (${branch} ${symbol})` : `${bank} ${symbol}`;
}

export function splitBalances(balances: readonly DailyFundBalance[]) {
  const sorted = [...balances].sort((a, b) =>
    collator.compare(balanceDisplay(a), balanceDisplay(b)),
  );
  return {
    banks: sorted.filter((b) => b.kind === "BANK"),
    cashes: sorted.filter((b) => b.kind === "CASH"),
  };
}

/** Bankaya yansıyan çek özeti: toplam adet ve para birimine göre toplam metni. */
export function movementSummary(movements: readonly DailyInstrumentMovement[]) {
  const byCurrency = new Map<string, string[]>();
  let count = 0;
  for (const m of movements) {
    count += m.count;
    const symbol = currencySymbol(m.currency) || "₺";
    byCurrency.set(symbol, [...(byCurrency.get(symbol) ?? []), m.total]);
  }
  const text = [...byCurrency.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([symbol, totals]) => `${formatN2(sumDec(totals))} ${symbol}`)
    .join(" | ");
  return { count, text: text || "0,00 ₺" };
}

/** "Ödeme/Tahsilat Tarihine Göre Yazılan Çekler": çek ve senet satırları. */
export function instrumentItems(items: readonly ReportItem[]): ReportItem[] {
  return items.filter((i) => i.method === "CHECK" || i.method === "NOTE");
}
