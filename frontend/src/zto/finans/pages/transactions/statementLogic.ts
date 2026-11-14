import type { StatementDateBasis, StatementLine } from "../../../../pages/finance/types";
import { TASK_BUDGET_MS, yieldToMain } from "../../../a11y/yieldToMain";

/*
 * Ekstre (ZTO Statement.cshtml + _CurrencyStatementPartial.cshtml) saf mantığı (12.1 §5.11). ZTO gibi
 * iş yeri × para birimi blokları; her blokta yürüyen bakiye sıfırdan, en eskiden en yeniye. Sütunlar:
 * DEBIT (Alacak/Ödeme) → "Borç", CREDIT (Borç/Tahsilat) → "Alacak"; bakiye ≥ 0 "B", < 0 "A".
 * Tarih süzgeci ZTO applyStatementDateFilter gibi istemcide: `from` öncesi satırlar bloğun
 * "DEVREDEN BAKİYE"sine toplanır (iş yeri × para birimi bazında doğru açılış için tüm geçmiş istenir).
 */

export type StatementOptions = {
  from?: string;
  to?: string;
  dateBasis: StatementDateBasis;
  /** Gösterilecek para birimleri; boş/verilmez → hepsi. */
  currencies?: ReadonlySet<string>;
  /** İş yeri süzgeci (ZTO "İşyeri"); verilmez → hepsi. */
  branchId?: string;
  branchName: (branchId: string) => string;
};

export type StatementRow = {
  no: number;
  line: StatementLine;
  date: string;
  invoiceDate: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type CurrencyBlock = {
  key: string;
  branchId: string;
  currency: string;
  /** `from` verilmiş ve öncesinde hareket varsa devreden bakiye; yoksa null. */
  opening: number | null;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  /** Bakiye (devreden + aralık). */
  balance: number;
};

export type WorkplaceBlock = { branchId: string; branchName: string; currencies: CurrencyBlock[] };

export type SummaryRow = {
  branchId: string;
  branchName: string;
  currency: string;
  debit: number;
  credit: number;
  balance: number;
};

export type StatementModel = {
  workplaces: WorkplaceBlock[];
  summary: SummaryRow[];
  /** Para birimi başına genel toplam (tüm iş yerleri). */
  grand: Array<{ currency: string; debit: number; credit: number; balance: number }>;
  /** Hareketi olan para birimleri (süzgeçten bağımsız; "Para Birimleri" kutuları). */
  allCurrencies: string[];
  /** Hareketi olan iş yerleri (süzgeçten bağımsız; "İşyeri" seçenekleri). */
  allBranches: string[];
};

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Etkin tarih: Fatura Tarihi tabanında belge tarihi (yoksa işlem tarihi). */
export function effectiveDate(line: StatementLine, basis: StatementDateBasis): string {
  return basis === "DOCUMENT" ? (line.documentDate ?? line.date) : line.date;
}

function compareLines(basis: StatementDateBasis) {
  return (a: StatementLine, b: StatementLine) =>
    effectiveDate(a, basis).localeCompare(effectiveDate(b, basis)) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id);
}

export function balanceMark(value: number): "B" | "A" {
  return value >= 0 ? "B" : "A";
}

/** "EKS-{kod}-{yyyyMMdd}" (ZTO "EKS-{CustomerAccountID}-{tarih}"; Blackrose hesap kodu). */
export function statementNo(code: string, isoDate: string): string {
  return `EKS-${code}-${isoDate.slice(0, 10).replace(/-/g, "")}`;
}

/** ZTO updateStatementPeriodLabel. */
export function periodLabel(
  from: string | undefined,
  to: string | undefined,
  allTime: string,
): string {
  const tr = (iso: string) => iso.split("-").reverse().join(".");
  if (!from && !to) return allTime;
  if (from && to) return `${tr(from)} - ${tr(to)}`;
  if (from) return `${tr(from)} - …`;
  return `… - ${tr(to!)}`;
}

/** "Detaysız ⇄ Detaylı" anahtarı yalnız tedarikçi/masraf benzeri gruplarda (Statement:930-934). */
const DETAIL_GROUPS = new Set([
  "GENEL",
  "YEDEK_PARCA_SERVIS",
  "AKARYAKIT",
  "HIZMET",
  "TASERON_NAKLIYECI",
  "SEVK_NAKLIYECI",
]);
export function showsDetailToggle(subGroup: string | null | undefined): boolean {
  return !!subGroup && DETAIL_GROUPS.has(subGroup);
}

type Builder = {
  options: StatementOptions;
  blocks: Map<string, CurrencyBlock>;
  order: string[];
  currencies: Set<string>;
  branches: Set<string>;
};

function newBuilder(options: StatementOptions): Builder {
  return { options, blocks: new Map(), order: [], currencies: new Set(), branches: new Set() };
}

function addLine(b: Builder, line: StatementLine) {
  const { options } = b;
  b.currencies.add(line.currency);
  b.branches.add(line.branchId);
  if (options.currencies && options.currencies.size > 0 && !options.currencies.has(line.currency))
    return;
  if (options.branchId && options.branchId !== line.branchId) return;
  const date = effectiveDate(line, options.dateBasis);
  if (options.to && date > options.to) return;
  const key = `${line.branchId}|${line.currency}`;
  let block = b.blocks.get(key);
  if (!block) {
    block = {
      key,
      branchId: line.branchId,
      currency: line.currency,
      opening: null,
      rows: [],
      totalDebit: 0,
      totalCredit: 0,
      balance: 0,
    };
    b.blocks.set(key, block);
    b.order.push(key);
  }
  const debit = line.direction === "DEBIT" ? line.amount : 0;
  const credit = line.direction === "CREDIT" ? line.amount : 0;
  block.balance = round2(block.balance + debit - credit);
  if (options.from && date < options.from) {
    block.opening = block.balance;
    return;
  }
  block.totalDebit = round2(block.totalDebit + debit);
  block.totalCredit = round2(block.totalCredit + credit);
  block.rows.push({
    no: block.rows.length + 1,
    line,
    date,
    invoiceDate: line.documentDate,
    debit,
    credit,
    balance: block.balance,
  });
}

function finish(b: Builder): StatementModel {
  const byBranch = new Map<string, WorkplaceBlock>();
  for (const key of b.order) {
    const block = b.blocks.get(key)!;
    let wp = byBranch.get(block.branchId);
    if (!wp) {
      wp = {
        branchId: block.branchId,
        branchName: b.options.branchName(block.branchId),
        currencies: [],
      };
      byBranch.set(block.branchId, wp);
    }
    wp.currencies.push(block);
  }
  const workplaces = [...byBranch.values()]
    .sort((x, y) => x.branchName.localeCompare(y.branchName, "tr"))
    .map((wp) => ({
      ...wp,
      currencies: wp.currencies.slice().sort((x, y) => x.currency.localeCompare(y.currency)),
    }));
  const summary: SummaryRow[] = [];
  const grandMap = new Map<
    string,
    { currency: string; debit: number; credit: number; balance: number }
  >();
  for (const wp of workplaces) {
    for (const c of wp.currencies) {
      summary.push({
        branchId: wp.branchId,
        branchName: wp.branchName,
        currency: c.currency,
        debit: c.totalDebit,
        credit: c.totalCredit,
        balance: c.balance,
      });
      const g = grandMap.get(c.currency) ?? {
        currency: c.currency,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      g.debit = round2(g.debit + c.totalDebit);
      g.credit = round2(g.credit + c.totalCredit);
      g.balance = round2(g.balance + c.balance);
      grandMap.set(c.currency, g);
    }
  }
  return {
    workplaces,
    summary,
    grand: [...grandMap.values()].sort((x, y) => x.currency.localeCompare(y.currency)),
    allCurrencies: [...b.currencies].sort(),
    allBranches: [...b.branches],
  };
}

/** İş yeri × para birimi ekstre modeli (senkron). */
export function groupStatement(
  lines: readonly StatementLine[],
  options: StatementOptions,
): StatementModel {
  const builder = newBuilder(options);
  for (const line of lines.slice().sort(compareLines(options.dateBasis))) addLine(builder, line);
  return finish(builder);
}

/**
 * Aynı model, 50 ms bütçeli parçalarla (MWG `break-up-long-tasks`): süre dolunca `yieldToMain()`
 * (scheduler.yield yoksa setTimeout). Sonuç senkron sürümle aynıdır. `signal` iptalinde AbortError.
 */
export async function groupStatementChunked(
  lines: readonly StatementLine[],
  options: StatementOptions,
  deadlineMs = TASK_BUDGET_MS,
  deps: { now?: () => number; yieldFn?: () => Promise<void>; signal?: AbortSignal } = {},
): Promise<StatementModel> {
  const now = deps.now ?? (() => performance.now());
  const yieldFn = deps.yieldFn ?? yieldToMain;
  const builder = newBuilder(options);
  const sorted = lines.slice().sort(compareLines(options.dateBasis));
  let deadline = now() + deadlineMs;
  for (let i = 0; i < sorted.length; i++) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    addLine(builder, sorted[i]);
    if (now() >= deadline && i < sorted.length - 1) {
      await yieldFn();
      deadline = now() + deadlineMs;
    }
  }
  return finish(builder);
}
