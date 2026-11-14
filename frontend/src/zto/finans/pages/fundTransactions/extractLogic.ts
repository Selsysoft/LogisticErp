/*
 * Banka / Kasa Ekstresi (12.2 §5.10; ZTO BankStatement/BankExtract.cshtml, CashTransactions/
 * CashExtract.cshtml). Veri mevcut `GET /funds/{id}/statement` ucundan sayfa sayfa (en çok 200; uç
 * `Pageable` alır, `max-page-size: 200` — F2/zto) toplanır; döngü yanıttaki `totalPages` ve gerçek
 * `size`'a göre kurulur, toplam ≤ 10.000 satır (fazlası kesilir ve uyarı gösterilir).
 */
import type { Statement, StatementLine } from "../../../../pages/finance/types";
import { FUND_STATEMENT_MAX_SIZE } from "../../../../pages/finance/fundApi";

/** UTF-8 BOM (Excel). */
const BOM = String.fromCharCode(0xfeff);

export const EXTRACT_MAX_ROWS = 10_000;

export type CollectedStatement = {
  lines: StatementLine[];
  opening: number;
  truncated: boolean;
};

/** Dönem başı bakiyesi (ZTO "DEVİR"): fon para biriminin `openingBalances` satırı (yoksa 0). */
export function openingOf(statement: Statement | undefined, currency: string): number {
  if (!statement) return 0;
  const row = statement.openingBalances?.find((o) => o.currency === currency);
  if (row) return row.amount;
  return statement.currency === currency ? (statement.openingBalance ?? 0) : 0;
}

/** Tüm sayfaları sırayla ister; 10.000 satırda keser. */
export async function collectStatement(
  fetchPage: (page: number, size: number) => Promise<Statement>,
  currency: string,
  maxRows = EXTRACT_MAX_ROWS,
): Promise<CollectedStatement> {
  const first = await fetchPage(0, FUND_STATEMENT_MAX_SIZE);
  const lines = [...first.lines];
  const size = first.size > 0 ? first.size : FUND_STATEMENT_MAX_SIZE;
  const totalPages = Math.max(1, first.totalPages);
  let truncated = false;
  for (let page = 1; page < totalPages; page++) {
    if (lines.length >= maxRows) {
      truncated = true;
      break;
    }
    const next = await fetchPage(page, size);
    lines.push(...next.lines);
  }
  if (lines.length > maxRows) {
    lines.length = maxRows;
    truncated = true;
  }
  return { lines, opening: openingOf(first, currency), truncated };
}

export type ExtractRow = {
  key: string;
  no: number;
  date: string;
  direction: "IN" | "OUT";
  debit: number;
  credit: number;
  balance: number;
  currency: string;
  description: string;
  reversal: boolean;
};

export type ExtractModel = {
  rows: ExtractRow[];
  opening: number;
  totalIn: number;
  totalOut: number;
  closing: number;
  count: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `GET /funds/{id}/statement` satırı sunucuda kısa kurucuyla üretildiğinden `currency` null,
 * `reversal`/`reversed` false gelebilir (F-12.2-2); model bu alanları güvenle tamamlar.
 */
export type ExtractSourceLine = Omit<StatementLine, "currency" | "reversal" | "reversed"> & {
  currency: string | null;
  reversal?: boolean | null;
  reversed?: boolean | null;
};

/**
 * Satırlar tarih artan (sunucu sırası), yürüyen bakiye sunucudan; özet toplamları istemcide. Satır
 * para birimi yoksa fonun para birimi; ters kayıt `reversal`/`reversed` ya da `sourceType = REVERSAL`.
 */
export function extractModel(
  lines: readonly ExtractSourceLine[],
  opening: number,
  fundCurrency: string,
): ExtractModel {
  let totalIn = 0;
  let totalOut = 0;
  const rows = lines.map((line, index) => {
    const isIn = line.direction === "IN";
    if (isIn) totalIn += line.amount;
    else totalOut += line.amount;
    return {
      key: line.id,
      no: index + 1,
      date: line.date,
      direction: isIn ? ("IN" as const) : ("OUT" as const),
      debit: isIn ? line.amount : 0,
      credit: isIn ? 0 : line.amount,
      balance: line.balance,
      currency: line.currency ?? fundCurrency,
      description: line.description ?? "",
      reversal: Boolean(line.reversal || line.reversed || line.sourceType === "REVERSAL"),
    };
  });
  totalIn = round2(totalIn);
  totalOut = round2(totalOut);
  return {
    rows,
    opening,
    totalIn,
    totalOut,
    closing: round2(opening + totalIn - totalOut),
    count: rows.length,
  };
}

/** ZTO CSV dosya adı: banka_ekstresi_<kod>_<başlangıç>_<bitiş> (tiresiz) .csv. */
export function extractFileName(
  kind: "BANK" | "CASH",
  code: string,
  from: string,
  to: string,
): string {
  const base = kind === "BANK" ? "banka_ekstresi" : "kasa_ekstresi";
  return `${base}_${code}_${from}_${to}`.replace(/-/g, "") + ".csv";
}

/** ZTO downloadCsv: tablo hücreleri tırnaklı, ';' ayraçlı, BOM'lu; metin hücresi formül önekiyle. */
export function extractCsv(rows: ReadonlyArray<ReadonlyArray<string | null | undefined>>): string {
  const cell = (value: string | null | undefined) => {
    const text = value ?? "";
    const safe = /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d.,\s]+$/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `${BOM}${rows.map((r) => r.map(cell).join(";")).join("\n")}`;
}
