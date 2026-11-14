/*
 * FIFO Faaliyet Raporu (12.2 §5.10; ZTO BankTransactions/ActivityReport.cshtml, CashTransactions aynı):
 * FIFO tablosunun satırları (giriş + altında eşleşen çıkışlar), özet sayıları, harcanmamış giriş
 * istatistikleri, modal varsayılanları ve ZTO `exportToExcel` CSV'si. Eşleştirmeyi sunucu yapar
 * (§3.2.8); burada yalnız görünüm modeli kurulur.
 */
import type {
  FundActivityInflow,
  FundActivityReport,
  FundActivityUnspent,
} from "../../../../pages/finance/types";
import { addMonthsIso } from "./fundTransactionsLogic";

/** UTF-8 BOM (Excel). */
const BOM = String.fromCharCode(0xfeff);

export type FifoRow =
  | {
      kind: "inflow";
      key: string;
      no: number;
      id: string | null;
      date: string;
      accountingType: string;
      description: string | null;
      amount: number;
      remaining: number;
    }
  | {
      kind: "outflow";
      key: string;
      id: string;
      date: string;
      accountingType: string;
      description: string | null;
      amount: number;
      /** Bu çıkıştan sonra girişte kalan (ZTO RemainingAmountAfter). */
      remainingAfter: number;
    };

/** Giriş satırı ve altında kronolojik eşleşen çıkışlar (ZTO income-main-row + expense-match-row). */
export function fifoRows(inflows: readonly FundActivityInflow[]): FifoRow[] {
  const rows: FifoRow[] = [];
  for (const inflow of inflows) {
    rows.push({
      kind: "inflow",
      key: `in-${inflow.no}`,
      no: inflow.no,
      id: inflow.id,
      date: inflow.date,
      accountingType: inflow.accountingType,
      description: inflow.description,
      amount: inflow.amount,
      remaining: inflow.remaining,
    });
    let left = inflow.amount;
    inflow.outflows.forEach((outflow, index) => {
      left = Math.round((left - outflow.amount) * 100) / 100;
      rows.push({
        kind: "outflow",
        key: `out-${inflow.no}-${index}`,
        id: outflow.id,
        date: outflow.date,
        accountingType: outflow.accountingType,
        description: outflow.description,
        amount: outflow.amount,
        remainingAfter: left,
      });
    });
  }
  return rows;
}

/** KALAN sütunu sınıfı (ZTO): > 0 uyarı, 0 onay işareti, < 0 kırmızı. */
export function remainingState(remaining: number): "open" | "done" | "negative" {
  if (remaining > 0) return "open";
  if (remaining === 0) return "done";
  return "negative";
}

export type ActivitySummary = {
  incomeCount: number;
  expenseCount: number;
  totalRemaining: number;
  totalOriginal: number;
  remainingCount: number;
};

/** Özet kart sayıları: giriş işlemleri (dönem başı devri hariç), farklı çıkış işlemleri, kalanlar. */
export function activitySummary(report: FundActivityReport): ActivitySummary {
  const outflowIds = new Set<string>();
  for (const inflow of report.inflows) for (const o of inflow.outflows) outflowIds.add(o.id);
  return {
    incomeCount: report.inflows.filter((i) => i.id !== null).length,
    expenseCount: outflowIds.size,
    totalRemaining: sum(report.unspent.map((u) => u.remaining)),
    totalOriginal: sum(report.unspent.map((u) => u.original)),
    remainingCount: report.unspent.length,
  };
}

function sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}

/** KULLANILAN yüzdesi (ilerleme çubuğu). */
export function usedPercent(entry: Pick<FundActivityUnspent, "original" | "used">): number {
  if (entry.original <= 0) return 0;
  return Math.min(100, Math.max(0, (entry.used / entry.original) * 100));
}

/** Modal varsayılanları (ZTO): bugün − 1 ay … bugün. */
export function defaultActivityRange(today: string): { from: string; to: string } {
  return { from: addMonthsIso(today, -1), to: today };
}

export type ActivityValidation = "fundRequired" | "rangeRequired" | "rangeInvalid" | null;

/** "Raporu Göster" doğrulaması (ZTO alert "Lütfen bir banka seçin."). */
export function validateActivity(fundId: string, from: string, to: string): ActivityValidation {
  if (!fundId) return "fundRequired";
  if (!from || !to) return "rangeRequired";
  if (from > to) return "rangeInvalid";
  return null;
}

/** Tırnaklı hücre; sayı olmayan metin `=+-@` ile başlıyorsa `'` öneki (formül enjeksiyonu). */
function quote(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d.,\s]+$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * ZTO exportToExcel: her tablo ayrı blok, hücreler tırnaklı ve ';' ayraçlı, bloklar arası boş satır.
 * Hücre metinleri ekranda görünen metinlerdir (çağıran verir).
 */
export function activityCsv(
  tables: ReadonlyArray<{ headers: string[]; rows: string[][] }>,
): string {
  const blocks = tables.map((table) =>
    [table.headers, ...table.rows].map((cells) => cells.map(quote).join(";")).join("\n"),
  );
  return `${BOM}${blocks.join("\n\n")}\n\n`;
}
