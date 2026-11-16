import type { Fund, InstrumentListItem } from "../../../../pages/finance/types";
import { addDec, cmpDec } from "../../../decimal";
import { currencySymbol, formatN2 } from "../../../format";
import { remainingDays } from "./instrumentLogic";

/*
 * Detaylı Çek Raporu (ZTO Checks/CheckDetailedReport + ChecksController.CheckDetailedReport:562-830;
 * 12.3_TASARIM §5.4). Saf mantık: kendi çeklerimiz (verilen çek), vade aralığı, iş yeri → banka
 * gruplaması, para birimi başına toplamlar (`zto/decimal.ts`), özet kartları ve istemci süzgeçleri.
 */

const NS = "checks.report";

export type ReportSort = "due-asc" | "due-desc" | "amount-desc" | "amount-asc";
export const REPORT_SORTS: readonly ReportSort[] = [
  "due-asc",
  "due-desc",
  "amount-desc",
  "amount-asc",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ayın ilk günü (ISO). */
export function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/**
 * M7 ve rapor sayfası tarih doğrulaması: ikisi de dolu olmalı (CHK:5510), başlangıç ≤ bitiş (§5.4).
 * Hata metni anahtarı ya da null.
 */
export function validateReportRange(from: string, to: string): string | null {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return `${NS}.errors.required`;
  if (from > to) return `${NS}.errors.order`;
  return null;
}

export type ReportState = {
  from: string;
  to: string;
  /** İş yeri (`branchId`); "" = tümü. */
  workPlaceId: string;
  /** Banka hesabı (`fundAccountId`); "" = tümü. */
  bankId: string;
  /** Para birimi kodu; "" = tümü. */
  currency: string;
  sortBy: ReportSort;
};

/** URL sorgusu → rapor durumu (ZTO varsayılanı: ayın ilk günü … bugün, `due-asc`). */
export function parseReportState(params: URLSearchParams, today: string): ReportState {
  const text = (key: string) => (params.get(key) ?? "").trim();
  const from = text("from");
  const to = text("to");
  const sort = text("sortBy") as ReportSort;
  return {
    from: ISO_DATE.test(from) ? from : firstOfMonth(today),
    to: ISO_DATE.test(to) ? to : today,
    workPlaceId: text("workPlaceId"),
    bankId: text("bankId"),
    currency: text("currency").toUpperCase(),
    sortBy: REPORT_SORTS.includes(sort) ? sort : "due-asc",
  };
}

/** Rapor durumu → URL sorgusu (boş alan yazılmaz). */
export function reportSearch(state: ReportState): URLSearchParams {
  const query = new URLSearchParams();
  query.set("from", state.from);
  query.set("to", state.to);
  if (state.workPlaceId) query.set("workPlaceId", state.workPlaceId);
  if (state.bankId) query.set("bankId", state.bankId);
  if (state.currency) query.set("currency", state.currency);
  if (state.sortBy !== "due-asc") query.set("sortBy", state.sortBy);
  return query;
}

// ---------------------------------------------------------------------------------------------
// Satırlar
// ---------------------------------------------------------------------------------------------

export type ReportRow = {
  item: InstrumentListItem;
  /** İş yeri anahtarı ve adı. */
  workPlaceId: string;
  workPlaceName: string;
  /** Banka grubu anahtarı (fon kimliği; yoksa ""). */
  bankId: string;
  /** Banka görünen adı (ZTO `BankDisplayName`). */
  bankName: string;
  currency: string;
  /** Vadeye kalan gün (bugün → vade). */
  remainingDays: number;
};

/** Rapor kapsamı: kendi çekimiz (verilen çek), iptal edilmemiş (ZTO `CheckType='Kendi Çekimiz'`). */
export function isReportItem(item: Pick<InstrumentListItem, "kind" | "direction" | "status">) {
  return item.kind === "CHECK" && item.direction === "ISSUED" && item.status !== "CANCELLED";
}

export function toReportRows(
  items: readonly InstrumentListItem[],
  today: string,
  fallback: { workPlace: string; bank: string },
): ReportRow[] {
  return items.filter(isReportItem).map((item) => ({
    item,
    workPlaceId: item.branchId ?? "",
    workPlaceName: item.branchName || fallback.workPlace,
    bankId: item.fundAccountId ?? "",
    bankName: item.fundBankName || item.bankName || fallback.bank,
    currency: item.money.currency || "TRY",
    remainingDays: remainingDays(item.dueDate, today) ?? 0,
  }));
}

/** Sıralama (ChecksController:681-688). */
export function sortReportRows(rows: readonly ReportRow[], sortBy: ReportSort): ReportRow[] {
  const byDue = (a: ReportRow, b: ReportRow) => a.item.dueDate.localeCompare(b.item.dueDate);
  const byNumber = (a: ReportRow, b: ReportRow) => a.item.number.localeCompare(b.item.number, "tr");
  const byAmount = (a: ReportRow, b: ReportRow) => cmpDec(a.item.money.amount, b.item.money.amount);
  const compare: Record<ReportSort, (a: ReportRow, b: ReportRow) => number> = {
    "due-asc": (a, b) => byDue(a, b) || byNumber(a, b),
    "due-desc": (a, b) => byDue(b, a) || byNumber(a, b),
    "amount-desc": (a, b) => byAmount(b, a) || byDue(a, b),
    "amount-asc": (a, b) => byAmount(a, b) || byDue(a, b),
  };
  return [...rows].sort(compare[sortBy]);
}

/** Sunucu tarafı süzgeçlerinin karşılığı (İş Yeri, Banka, Para Birimi). */
export function applyFormFilters(rows: readonly ReportRow[], state: ReportState): ReportRow[] {
  return rows.filter(
    (row) =>
      (!state.workPlaceId || row.workPlaceId === state.workPlaceId) &&
      (!state.bankId || row.bankId === state.bankId) &&
      (!state.currency || row.currency === state.currency),
  );
}

// ---------------------------------------------------------------------------------------------
// Toplamlar
// ---------------------------------------------------------------------------------------------

export type CurrencyTotal = { currency: string; total: string; count: number };

/** Para birimi başına toplam ve adet (para birimi koduna göre sıralı; decimal toplama). */
export function currencyTotals(
  rows: readonly Pick<ReportRow, "currency" | "item">[],
): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    const entry = map.get(row.currency) ?? { currency: row.currency, total: "0", count: 0 };
    entry.total = addDec(entry.total, row.item.money.amount);
    entry.count += 1;
    map.set(row.currency, entry);
  }
  return [...map.values()].sort((a, b) =>
    currencySymbol(a.currency).localeCompare(currencySymbol(b.currency)),
  );
}

/** "1.234,56 ₺ | 10,00 $" (ZTO `FormatCurrencyTotals`; boşsa "0,00 ₺"). */
export function currencyTotalsText(rows: readonly Pick<ReportRow, "currency" | "item">[]): string {
  const totals = currencyTotals(rows);
  if (totals.length === 0) return `${formatN2(0)} ${currencySymbol("TRY")}`;
  return totals.map((t) => `${formatN2(t.total)} ${currencySymbol(t.currency)}`).join(" | ");
}

// ---------------------------------------------------------------------------------------------
// Gruplama
// ---------------------------------------------------------------------------------------------

export type BankGroup = {
  key: string;
  bankId: string;
  bankName: string;
  officialName: string;
  branchName: string;
  iban: string;
  rows: ReportRow[];
  count: number;
  totalsText: string;
};

export type WorkPlaceGroup = {
  key: string;
  workPlaceId: string;
  workPlaceName: string;
  banks: BankGroup[];
  count: number;
  totalsText: string;
};

type FundInfo = Pick<Fund, "id" | "name" | "bankName" | "bankBranchName" | "iban">;

const trCompare = (a: string, b: string) => a.localeCompare(b, "tr");

function firstFilled(values: Array<string | null | undefined>): string {
  return values.find((v) => !!v && v.trim() !== "" && v !== "-") ?? "-";
}

/**
 * İş yeri → banka gruplaması (ChecksController:707-738): gruplar ada göre (tr) sıralı, satırlar
 * verilen sırada kalır. Banka meta bilgisi (resmi ad, şube, IBAN) fon tanımından; IBAN düz
 * (fon IBAN'ı OK-12.2-18).
 */
export function groupReport(
  rows: readonly ReportRow[],
  funds: ReadonlyMap<string, FundInfo>,
): WorkPlaceGroup[] {
  const places = new Map<string, { id: string; name: string; rows: ReportRow[] }>();
  for (const row of rows) {
    const key = `${row.workPlaceId}|${row.workPlaceName}`;
    const place = places.get(key) ?? { id: row.workPlaceId, name: row.workPlaceName, rows: [] };
    place.rows.push(row);
    places.set(key, place);
  }
  return [...places.entries()]
    .map(([key, place]) => {
      const banks = new Map<string, ReportRow[]>();
      for (const row of place.rows) {
        const bankKey = `${row.bankId}|${row.bankName}`;
        banks.set(bankKey, [...(banks.get(bankKey) ?? []), row]);
      }
      const bankGroups: BankGroup[] = [...banks.entries()]
        .map(([bankKey, bankRows]) => {
          const fund = funds.get(bankRows[0].bankId);
          return {
            key: bankKey,
            bankId: bankRows[0].bankId,
            bankName: bankRows[0].bankName,
            officialName: firstFilled([fund?.name, ...bankRows.map((r) => r.item.fundName)]),
            branchName: firstFilled([
              fund?.bankBranchName,
              ...bankRows.map((r) => r.item.bankBranch),
            ]),
            iban: firstFilled([fund?.iban]),
            rows: bankRows,
            count: bankRows.length,
            totalsText: currencyTotalsText(bankRows),
          };
        })
        .sort((a, b) => trCompare(a.bankName, b.bankName));
      return {
        key,
        workPlaceId: place.id,
        workPlaceName: place.name,
        banks: bankGroups,
        count: place.rows.length,
        totalsText: currencyTotalsText(place.rows),
      };
    })
    .sort((a, b) => trCompare(a.workPlaceName, b.workPlaceName));
}

// ---------------------------------------------------------------------------------------------
// Özet kartları ve istemci süzgeçleri
// ---------------------------------------------------------------------------------------------

export type CardFilterType = "workPlace" | "bank" | "currency";
export type CardFilters = Record<CardFilterType, string>;
export const NO_CARD_FILTERS: CardFilters = { workPlace: "", bank: "", currency: "" };

export type SummaryCard = {
  type: CardFilterType;
  value: string;
  name: string;
  count: number;
  totalsText: string;
};

/** Kart listeleri en çok 10 öğe (CDR:677, :698, :719). */
export const SUMMARY_CARD_LIMIT = 10;

export function summaryCards(rows: readonly ReportRow[], groups: readonly WorkPlaceGroup[]) {
  const workPlaces: SummaryCard[] = groups.map((g) => ({
    type: "workPlace",
    value: g.workPlaceId,
    name: g.workPlaceName,
    count: g.count,
    totalsText: g.totalsText,
  }));
  const grouped = <K extends string>(keyOf: (r: ReportRow) => K) => {
    const map = new Map<K, ReportRow[]>();
    for (const row of rows) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row]);
    return map;
  };
  const byCountThenName = (a: SummaryCard, b: SummaryCard) =>
    b.count - a.count || trCompare(a.name, b.name);
  const banks: SummaryCard[] = [...grouped((r) => r.bankId).entries()]
    .map(([value, list]) => ({
      type: "bank" as const,
      value,
      name: list[0].bankName,
      count: list.length,
      totalsText: currencyTotalsText(list),
    }))
    .sort(byCountThenName);
  const currencies: SummaryCard[] = [...grouped((r) => r.currency).entries()]
    .map(([value, list]) => ({
      type: "currency" as const,
      value,
      name: currencySymbol(value),
      count: list.length,
      totalsText: currencyTotalsText(list),
    }))
    .sort(byCountThenName);
  return {
    workPlaces: workPlaces.slice(0, SUMMARY_CARD_LIMIT),
    banks: banks.slice(0, SUMMARY_CARD_LIMIT),
    currencies: currencies.slice(0, SUMMARY_CARD_LIMIT),
  };
}

/** Kart tıklaması: aynı değer ikinci tıkta kalkar (CDR:986). */
export function toggleCardFilter(
  filters: CardFilters,
  type: CardFilterType,
  value: string,
): CardFilters {
  return { ...filters, [type]: filters[type] === value ? "" : value };
}

/** Satır arama metni (CDR satır `innerText`'i: çek no, keşideci, lehdar, banka, açıklama…). */
export function reportRowText(row: ReportRow, statusText: string): string {
  const i = row.item;
  return [
    i.number,
    i.companyName,
    i.accountName,
    row.bankName,
    i.description,
    statusText,
    formatN2(i.money.amount),
    currencySymbol(row.currency),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Arama (küçük harf `indexOf`, CDR:928-934) + kart süzgeçleri. */
export function rowVisible(
  row: ReportRow,
  text: string,
  term: string,
  cards: CardFilters,
): boolean {
  const query = term.trim().toLocaleLowerCase("tr");
  const searchMatch = query === "" || text.toLocaleLowerCase("tr").includes(query);
  return (
    searchMatch &&
    (!cards.workPlace || cards.workPlace === row.workPlaceId) &&
    (!cards.bank || cards.bank === row.bankId) &&
    (!cards.currency || cards.currency === row.currency)
  );
}

/** "Kalan Gün" rozeti (CDR:830-833). Kendi çekimizde "Tahsil Edildi" = ödendi (PAID). */
export function dayBadge(row: Pick<ReportRow, "item" | "remainingDays">): {
  className: string;
  icon: string;
  key: string;
  count: number;
} {
  const collected = ["PAID", "COLLECTED", "COLLECTED_TO_CASH"].includes(row.item.status);
  if (collected) {
    return {
      className: "days-collected",
      icon: "fa-check-circle",
      key: `${NS}.days.collected`,
      count: 0,
    };
  }
  const days = row.remainingDays;
  if (days < 0) {
    return {
      className: "days-overdue",
      icon: "fa-exclamation-circle",
      key: `${NS}.days.overdue`,
      count: -days,
    };
  }
  if (days === 0)
    return { className: "days-today", icon: "fa-clock", key: `${NS}.days.today`, count: 0 };
  return {
    className: "days-future",
    icon: "fa-hourglass-half",
    key: `${NS}.days.future`,
    count: days,
  };
}
