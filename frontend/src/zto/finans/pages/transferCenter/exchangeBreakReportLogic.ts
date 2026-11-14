import type { FxReport, FxReportRow, FxReportStats } from "../../../../pages/finance/types";
import { currencySymbol, formatN2 } from "../../../format";
import { round } from "./fxCalcLogic";

/*
 * Döviz Bozum & Tahsilat İzlenebilirliği tablo görünümü (ZTO Views/BankStatement/ExchangeBreakReport.cshtml
 * `buildTableGroups`, `renderTablePage` :1176-1418). Gruplar: tahsilat (altında bozumlar ve onlardan
 * beslenen sonraki bozumlar), hiç bozulmamış tahsilat, tahsilata bağlı olmayan bozum. "Siparişler"
 * sütunu yok (S-6). SVG ağaç 12.2b.
 */

export type ReportTransferNode = { row: FxReportRow; depth: number };

export type ReportCollection = {
  id: string;
  date: string;
  code: string | null;
  accountName: string | null;
  amount: number;
  currency: string;
};

export type ReportGroup =
  | {
      type: "collection";
      collection: ReportCollection;
      transfers: ReportTransferNode[];
      breakCount: number;
      exchanged: number;
      remaining: number;
      percent: number;
      searchText: string;
    }
  | { type: "unexchanged"; collection: ReportCollection; searchText: string }
  | { type: "direct"; transfers: ReportTransferNode[]; searchText: string };

const text = (...parts: Array<string | number | null | undefined>) =>
  parts
    .filter((p) => p !== null && p !== undefined && p !== "")
    .join(" ")
    .toLocaleLowerCase("tr");

/** Bozumu ve (özyinelemeli) ondan beslenen sonraki bozumları derinlikleriyle düzler. */
function flatten(
  row: FxReportRow,
  depth: number,
  children: Map<string, FxReportRow[]>,
  seen: Set<string>,
): ReportTransferNode[] {
  if (seen.has(row.transferId)) return [];
  seen.add(row.transferId);
  return [
    { row, depth },
    ...(children.get(row.transferId) ?? []).flatMap((child) =>
      flatten(child, depth + 1, children, seen),
    ),
  ];
}

const rowSearch = (row: FxReportRow) =>
  text(row.code, row.date, row.sourceFundName, row.targetFundName, row.sourceMoney.currency);

/** Rapor yanıtından tablo grupları (tahsilat → bozumlar; bozulmayanlar; tahsilatsız bozumlar). */
export function buildReportGroups(report: FxReport | undefined): ReportGroup[] {
  if (!report) return [];
  const inReport = new Set(report.rows.map((row) => row.transferId));
  const children = new Map<string, FxReportRow[]>();
  const collections = new Map<
    string,
    { collection: ReportCollection; rows: FxReportRow[]; used: number }
  >();
  const direct: FxReportRow[] = [];

  for (const row of report.rows) {
    const settlements = row.sources.filter((s) => s.kind === "SETTLEMENT");
    for (const source of settlements) {
      const entry = collections.get(source.id) ?? {
        collection: {
          id: source.id,
          date: source.date,
          code: source.code,
          accountName: source.accountName,
          amount: source.amount,
          currency: row.sourceMoney.currency,
        },
        rows: [],
        used: 0,
      };
      entry.used += source.used;
      collections.set(source.id, entry);
    }
    if (settlements.length > 0) {
      collections.get(settlements[0].id)?.rows.push(row);
      continue;
    }
    const parent = row.sources.find((s) => s.kind === "TRANSFER" && inReport.has(s.id));
    if (parent) {
      children.set(parent.id, [...(children.get(parent.id) ?? []), row]);
    } else {
      direct.push(row);
    }
  }

  const seen = new Set<string>();
  const groups: ReportGroup[] = [];
  for (const { collection, rows, used } of collections.values()) {
    const transfers = rows.flatMap((row) => flatten(row, 0, children, seen));
    const exchanged = round(used);
    const percent =
      collection.amount > 0 ? Math.min(100, (exchanged / collection.amount) * 100) : 0;
    groups.push({
      type: "collection",
      collection,
      transfers,
      breakCount: rows.length,
      exchanged,
      remaining: round(Math.max(0, collection.amount - exchanged)),
      percent,
      searchText: text(
        collection.date,
        collection.code,
        collection.accountName,
        ...transfers.map((node) => rowSearch(node.row)),
      ),
    });
  }
  for (const unbroken of report.unbrokenCollections) {
    const collection: ReportCollection = {
      id: unbroken.settlementId,
      date: unbroken.date,
      code: null,
      accountName: unbroken.accountName,
      amount: Number(unbroken.money.amount),
      currency: unbroken.money.currency,
    };
    groups.push({
      type: "unexchanged",
      collection,
      searchText: text(collection.date, collection.accountName, collection.currency),
    });
  }
  for (const row of direct) {
    const transfers = flatten(row, 0, children, seen);
    if (transfers.length > 0) {
      groups.push({
        type: "direct",
        transfers,
        searchText: transfers.map((n) => rowSearch(n.row)).join(" "),
      });
    }
  }
  return groups;
}

export type ReportPage = {
  items: ReportGroup[];
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
};

/** Arama (küçük harf içerir) + sayfalama (ZTO `filterAndPaginateTableGroups`). */
export function pageGroups(
  groups: readonly ReportGroup[],
  term: string,
  page: number,
  size: number,
): ReportPage {
  const needle = term.trim().toLocaleLowerCase("tr");
  const filtered = needle ? groups.filter((g) => g.searchText.includes(needle)) : [...groups];
  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const end = start + size;
  return {
    items: filtered.slice(start, end),
    page: current,
    totalPages,
    totalCount: filtered.length,
    startIndex: filtered.length === 0 ? 0 : start + 1,
    endIndex: Math.min(end, filtered.length),
  };
}

/** "#eb-page-info": "0 kayıt" ya da "1-25 / 40 kayıt". */
export function pageInfoText(page: ReportPage): string {
  return page.totalCount === 0
    ? "0 kayıt"
    : `${page.startIndex}-${page.endIndex} / ${page.totalCount} kayıt`;
}

/** Yüzde metni: "37,50%". */
export function percentText(value: number): string {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

/** "Toplam Bozulan": "1.234,00 $ | 500,00 €" (boşsa "0,00"). */
export function totalBrokenText(stats: FxReportStats | undefined): string {
  if (!stats || stats.totalBroken.length === 0) return "0,00";
  return stats.totalBroken
    .map((item) => `${formatN2(item.amount)} ${currencySymbol(item.currency)}`)
    .join(" | ");
}

/** Derinlik renkleri (ZTO `DEPTH_COLORS`): satır zemini ve seviye rozeti. */
const DEPTH_COLORS = [
  { bg: "#fff8e1", badge: "#f57c00" },
  { bg: "#fce4ec", badge: "#c62828" },
  { bg: "#e8eaf6", badge: "#3949ab" },
  { bg: "#e8f5e9", badge: "#2e7d32" },
  { bg: "#f3e5f5", badge: "#7b1fa2" },
  { bg: "#fff3e0", badge: "#e65100" },
];

export function depthColor(depth: number) {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length];
}

/** Kod hücresi öneki: derinlikte "└──… " (ZTO `renderTransferRow`). */
export function depthPrefix(depth: number): string {
  return depth > 0 ? `└${"─".repeat(depth - 1)} ` : "";
}
