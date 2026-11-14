/*
 * Banka / Kasa Hareketleri mantığı (12.2 §5.9; ZTO BankTransactions/Index.cshtml, CashTransactions/
 * Index.cshtml, BankTransactionsController.cs:208-234, CashTransactionsController.cs:150-179):
 * muhasebe tipi seçenekleri, varsayılan süzgeçler (yerel takvim), sorgu parametreleri, sayfa boyutu,
 * satır yardımcıları ve CSV.
 */
import type {
  Fund,
  FundDirection,
  FundKind,
  FundTransactionRow,
} from "../../../../pages/finance/types";
import type { FundTransactionParams } from "../../../../pages/finance/fundApi";
import { FUND_TRANSACTIONS_MAX_SIZE } from "../../../../pages/finance/fundApi";
import { currencySymbol, formatDate, toIsoDate } from "../../../format";

/** UTF-8 BOM (Excel). */
const BOM = String.fromCharCode(0xfeff);

export type AccountingOption = {
  /** Seçenek kimliği (select değeri ve i18n anahtarı `fundTransactions.accountingTypes.<key>`). */
  key: string;
  /** Sunucu `accountingType` değeri (§3.2.6); iki seçenek aynı değeri taşıyabilir (S-18). */
  value: string;
};

/** Blackrose ekleri (iki listenin sonunda). */
const BLACKROSE_EXTRAS: AccountingOption[] = [
  { key: "transferCost", value: "TRANSFER_COST" },
  { key: "opening", value: "OPENING" },
  { key: "intercompany", value: "INTERCOMPANY" },
  { key: "checkPayment", value: "CHECK_PAYMENT" },
  { key: "notePayment", value: "NOTE_PAYMENT" },
  { key: "legacyTransfer", value: "LEGACY_TRANSFER" },
];

/**
 * ZTO "MUHASEBE TİPİ" seçenekleri, sırası birebir. İlk öğe "Tüm Tipler" (değer boş). Kasada karşılığı
 * olmayan EFT/Havale/Virman/Döviz Bozum kalır ve boş sonuç döner (S-17); "Bankadan Kasaya" ile
 * "Bankadan Çekim" BANK_TO_CASH, "Kasadan Bankaya" ile "Bankaya Yatırma" CASH_TO_BANK (S-18).
 */
export const ACCOUNTING_TYPES: Record<FundKind, readonly AccountingOption[]> = {
  BANK: [
    { key: "all", value: "" },
    { key: "accountPayment", value: "ACCOUNT_PAYMENT" },
    { key: "accountCollection", value: "ACCOUNT_COLLECTION" },
    { key: "eft", value: "EFT" },
    { key: "wire", value: "WIRE" },
    { key: "virement", value: "VIREMENT" },
    { key: "fxExchange", value: "FX_EXCHANGE" },
    { key: "bankToCash", value: "BANK_TO_CASH" },
    { key: "cashToBank", value: "CASH_TO_BANK" },
    { key: "netSalary", value: "NET_SALARY" },
    { key: "creditDrawdown", value: "CREDIT_DRAWDOWN" },
    { key: "checkCollection", value: "CHECK_COLLECTION" },
    { key: "noteCollection", value: "NOTE_COLLECTION" },
    { key: "expense", value: "EXPENSE" },
    { key: "income", value: "INCOME" },
    { key: "other", value: "OTHER" },
    ...BLACKROSE_EXTRAS,
  ],
  CASH: [
    { key: "all", value: "" },
    { key: "accountPayment", value: "ACCOUNT_PAYMENT" },
    { key: "accountCollection", value: "ACCOUNT_COLLECTION" },
    { key: "eft", value: "EFT" },
    { key: "wire", value: "WIRE" },
    { key: "virement", value: "VIREMENT" },
    { key: "fxExchange", value: "FX_EXCHANGE" },
    { key: "bankToCash", value: "BANK_TO_CASH" },
    { key: "cashToBank", value: "CASH_TO_BANK" },
    { key: "cashToCash", value: "CASH_TO_CASH" },
    { key: "netSalary", value: "NET_SALARY" },
    { key: "checkCollection", value: "CHECK_COLLECTION" },
    { key: "noteCollection", value: "NOTE_COLLECTION" },
    { key: "bankWithdrawal", value: "BANK_TO_CASH" },
    { key: "bankDeposit", value: "CASH_TO_BANK" },
    { key: "expense", value: "EXPENSE" },
    { key: "income", value: "INCOME" },
    { key: "other", value: "OTHER" },
    ...BLACKROSE_EXTRAS,
  ],
};

/** ZTO listesinin uzunluğu ("Tüm Tipler" dahil): BT 16, CT 18. */
export const ZTO_ACCOUNTING_COUNT: Record<FundKind, number> = { BANK: 16, CASH: 18 };

/** Seçenek kimliği → sunucu değeri (bilinmeyen/boş → undefined, süzgeç yok). */
export function accountingValueOf(kind: FundKind, key: string): string | undefined {
  const value = ACCOUNTING_TYPES[kind].find((o) => o.key === key)?.value;
  return value ? value : undefined;
}

/** Tablo rozeti için sunucu değeri → seçenek kimliği (ilk eşleşen; yoksa null). */
export function accountingKeyOf(kind: FundKind, value: string | null | undefined): string | null {
  if (!value) return null;
  return ACCOUNTING_TYPES[kind].find((o) => o.value === value)?.key ?? null;
}

export const DIRECTIONS: readonly ("" | FundDirection)[] = ["", "IN", "OUT"];

/** Yerel takvim bugün (`toISOString` yasak — UTC kayması, §5.0 #4). */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now) ?? "";
}

/** ISO tarih + gün (takvim aritmetiği, saat dilimsiz). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** ISO tarih + ay (ay sonu taşmasında ayın son günü). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return `${String(target.getUTCFullYear()).padStart(4, "0")}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

export type TxFilters = {
  /** "" = konsolide; yalnız ≥ 2 şirkette kullanıcı seçer. */
  companyId: string;
  branchId: string;
  fundId: string;
  direction: "" | FundDirection;
  /** `ACCOUNTING_TYPES` seçenek kimliği ("all" = süzgeç yok). */
  accountingKey: string;
  from: string;
  to: string;
};

/**
 * İlk varsayılanlar (ZTO): başlangıç bugün−7; bitiş BT bugün+1, CT bugün (BT:415-428, CT:378-391).
 * "Temizle" de buna döner (ZTO B8 düzeltmesi: ZTO −3 ay/+1 ay'a atıyordu).
 */
export function defaultFilters(
  kind: FundKind,
  today: string,
  initial: Partial<Pick<TxFilters, "companyId" | "branchId" | "fundId">> = {},
): TxFilters {
  return {
    companyId: initial.companyId ?? "",
    branchId: initial.branchId ?? "",
    fundId: initial.fundId ?? "",
    direction: "",
    accountingKey: "all",
    from: addDaysIso(today, -7),
    to: kind === "BANK" ? addDaysIso(today, 1) : today,
  };
}

/** Süzgeç → `/funds/transactions` parametreleri. */
export function toParams(
  kind: FundKind,
  filters: TxFilters,
  options: { q?: string; multiCompany: boolean; summary?: boolean; currency?: string },
): FundTransactionParams {
  const accounting = accountingValueOf(kind, filters.accountingKey);
  return {
    companyId: options.multiCompany ? filters.companyId || null : undefined,
    kind,
    fundIds: filters.fundId ? [filters.fundId] : undefined,
    branchIds: filters.branchId ? [filters.branchId] : undefined,
    direction: filters.direction || undefined,
    accountingTypes: accounting ? [accounting] : undefined,
    currency: options.currency || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    q: options.q?.trim() ? options.q.trim() : undefined,
    summary: options.summary,
    sort: "desc",
  };
}

/** DataTables `lengthMenu` (ZTO [10,25,50,100,-1]); "Tümü" sunucuya 500 (OK-12.2-34). */
export const LENGTH_MENU = [10, 25, 50, 100, -1];
/** ZTO `pageLength`: BT 50, CT 25. */
export const PAGE_LENGTH: Record<FundKind, number> = { BANK: 50, CASH: 25 };

export function serverPageSize(length: number): number {
  return length < 0 ? FUND_TRANSACTIONS_MAX_SIZE : length;
}

/**
 * Banka/Kasa süzgeci seçenekleri: yalnız Vadesiz ve aktif hesaplar (+ seçili olan), iş yeri
 * seçiliyse o iş yerininkiler. Etiket BT "Ad | Şube (Kod) [Vadesiz]", CT "Ad (Kod)".
 */
export function fundOptions(
  funds: readonly Fund[],
  kind: FundKind,
  branchId: string,
  selectedId: string,
  typeLabel: (fund: Fund) => string,
): Array<{ value: string; label: string }> {
  return funds
    .filter(
      (f) =>
        f.kind === kind &&
        (f.id === selectedId ||
          ((f.accountType ?? "DEMAND") === "DEMAND" &&
            f.active &&
            (!branchId || f.branchId === branchId))),
    )
    .map((f) => ({ value: f.id, label: fundLabel(f, kind, typeLabel(f)) }));
}

export function fundLabel(fund: Fund, kind: FundKind, typeLabel: string): string {
  if (kind === "CASH") return `${fund.name} (${fund.code})`;
  let text = fund.name;
  if (fund.bankBranchName) text += ` | ${fund.bankBranchName}`;
  if (fund.code) text += ` (${fund.code})`;
  return `${text} [${typeLabel}]`;
}

/** Faaliyet raporu bankası (ZTO activityReportBank): "Ad | Şube [Tür]" (kod yok). */
export function activityFundLabel(fund: Fund, kind: FundKind, typeLabel: string): string {
  if (kind === "CASH") return `${fund.name} (${fund.code})`;
  return `${fund.name}${fund.bankBranchName ? ` | ${fund.bankBranchName}` : ""} [${typeLabel}]`;
}

/** BAKİYE ipucu (ZTO equationTooltip): "(önceki) ± (tutar) = (sonraki)". */
export function balanceEquation(row: FundTransactionRow, format: (n: number) => string): string {
  const signed = row.direction === "IN" ? row.amount : -row.amount;
  const previous = row.runningBalance - signed;
  return `(${format(previous)}) ${signed >= 0 ? "+" : "-"} (${format(Math.abs(signed))}) = ${format(row.runningBalance)}`;
}

/** Yalnız Çıkış + Cari Ödeme için "Ödemeyi Düzenle" (ZTO canEditPayment). */
export function canEditPayment(
  row: Pick<FundTransactionRow, "direction" | "accountingType">,
): boolean {
  return row.direction === "OUT" && row.accountingType === "ACCOUNT_PAYMENT";
}

/** Sıra numarası (ZTO S.No; sunucu sırası tarih azalan): sayfa × boyut + 1'den. */
export function rowNumber(page: number, size: number, index: number): number {
  return page * size + index + 1;
}

// ---------------------------------------------------------------------------------------------
// CSV (ZTO exportToExcel BT:5146-5215, CT aynı desen)
// ---------------------------------------------------------------------------------------------

const FORMULA_START = /^[=+\-@\t\r]/;

/** ZTO escapeCSV + formül enjeksiyonu koruması (metin hücresi `=+-@` ile başlıyorsa `'` öneki). */
export function csvCell(value: string | number | null | undefined, numeric = false): string {
  if (value === null || value === undefined || value === "") return "";
  let text = String(value);
  if (!numeric && FORMULA_START.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  if (/[;\n"]/.test(text)) text = `"${text}"`;
  return text;
}

/** Tutar: TR ondalık virgül, binlik ayırıcısız ("1234,56"). */
export function csvAmount(value: number): string {
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;
  return rounded.toFixed(2).replace(".", ",");
}

export type CsvTexts = {
  headers: string[];
  companyHeader: string;
  directionLabel: (direction: FundDirection) => string;
  accountingLabel: (row: FundTransactionRow) => string;
  companyName: (companyId: string) => string;
};

/** CSV başlık satırı (≥ 2 şirkette sona "Şirket"). */
export function csvHeader(texts: CsvTexts, multiCompany: boolean): string {
  const header = [...texts.headers, ...(multiCompany ? [texts.companyHeader] : [])];
  return header.map((h) => csvCell(h)).join(";");
}

/** Tek CSV satırı (`index` 0 tabanlı; Sıra No = index + 1). */
export function csvRow(
  kind: FundKind,
  row: FundTransactionRow,
  index: number,
  texts: CsvTexts,
  multiCompany: boolean,
): string {
  const common = [
    csvCell(index + 1, true),
    csvCell(formatDate(row.transactionDate)),
    csvCell(row.fundName),
    csvCell(row.fundCode),
    csvCell(texts.directionLabel(row.direction)),
    csvCell(texts.accountingLabel(row)),
    csvCell(csvAmount(row.amount), true),
    csvCell(currencySymbol(row.currency)),
  ];
  const tail =
    kind === "BANK"
      ? [
          csvCell(row.accountCode ?? ""),
          csvCell(row.accountName ?? ""),
          csvCell(row.description ?? ""),
        ]
      : [csvCell(row.description ?? "")];
  const company = multiCompany ? [csvCell(texts.companyName(row.companyId))] : [];
  return [...common, ...tail, ...company].join(";");
}

/** CSV satırları (başlık dahil; `\n` ile birleştirilmeye hazır). */
export function csvLines(
  kind: FundKind,
  rows: readonly FundTransactionRow[],
  texts: CsvTexts,
  multiCompany: boolean,
): string[] {
  return [
    csvHeader(texts, multiCompany),
    ...rows.map((row, index) => csvRow(kind, row, index, texts, multiCompany)),
  ];
}

/** Dosya adı: banka_hareketleri_YYYY-MM-DD.csv / kasa_hareketleri_… (tarih yerel takvim). */
export function csvFileName(kind: FundKind, today: string): string {
  return `${kind === "BANK" ? "banka" : "kasa"}_hareketleri_${today}.csv`;
}

/** BOM'lu CSV içeriği (Excel UTF-8). */
export function csvContent(lines: readonly string[]): string {
  return `${BOM}${lines.join("\n")}\n`;
}
