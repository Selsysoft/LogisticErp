/*
 * Hızlı Bakiye Özeti (Finansal Varlık Durumları) modalının saf mantığı (12.8_TASARIM §5.10; ZTO
 * Views/CustomerAccounts/Index.cshtml #treasuryModal JS :7335-8320). Tutarlar ondalık metindir
 * (`zto/decimal.ts`); TL toplamları sunucudan gelir (`bankTl` … `netTl`, kur yoksa `missingRates`).
 * Para birimleri birbirine eklenmez; kartlar para birimi satırlıdır (ZTO `sortedCurrencies`).
 */
import type {
  Branch,
  ReportRate,
  Treasury,
  TreasuryFund,
  TreasuryInstrument,
} from "../../pages/finance/types";
import { addDec, cmpDec, mulDec, roundDec, subDec, sumDec } from "../decimal";
import { formatDate, formatN2, formatNumber } from "../format";
import { formatMonthKey } from "./reports/reportDates";

// ---------------------------------------------------------------------------------------------
// Şube (ZTO "Şube" = Blackrose iş yeri grubu) → İş Yeri süzgeci (OK-12.8-21)
// ---------------------------------------------------------------------------------------------

export type TreasuryOption = { id: string; name: string };

const byName = (a: TreasuryOption, b: TreasuryOption) => a.name.localeCompare(b.name, "tr");

/** İş yerlerinden tekil şube (iş yeri grubu) listesi; grubu olmayan iş yerleri katılmaz. */
export function treasuryBranchGroups(branches: readonly Branch[]): TreasuryOption[] {
  const groups = new Map<string, string>();
  for (const branch of branches) {
    if (branch.branchGroupId && !groups.has(branch.branchGroupId)) {
      groups.set(branch.branchGroupId, branch.branchGroupName ?? branch.branchGroupId);
    }
  }
  return [...groups].map(([id, name]) => ({ id, name })).sort(byName);
}

/** İş yeri seçenekleri; şube seçiliyse yalnız o şubenin iş yerleri (ZTO `loadTreasuryWorkPlaces`). */
export function treasuryWorkPlaces(
  branches: readonly Branch[],
  branchGroupId: string,
): TreasuryOption[] {
  return branches
    .filter((branch) => !branchGroupId || branch.branchGroupId === branchGroupId)
    .map((branch) => ({ id: branch.id, name: branch.name }))
    .sort(byName);
}

/**
 * API'ye giden `branchIds`: iş yeri seçiliyse o; değilse şubenin iş yerleri; hiçbiri yoksa
 * undefined (kullanıcının tüm kapsamı).
 */
export function treasuryBranchIds(
  branches: readonly Branch[],
  branchGroupId: string,
  workPlaceId: string,
): string[] | undefined {
  if (workPlaceId) return [workPlaceId];
  if (!branchGroupId) return undefined;
  const ids = branches
    .filter((branch) => branch.branchGroupId === branchGroupId)
    .map((branch) => branch.id);
  return ids.length > 0 ? ids : undefined;
}

// ---------------------------------------------------------------------------------------------
// Özet kartları (ZTO renderSummaryCards)
// ---------------------------------------------------------------------------------------------

/** Kartların para birimi sırası: TL her zaman var ve başta, diğerleri alfabetik (ZTO). */
export function summaryCurrencies(data: Pick<Treasury, "byCurrency">): string[] {
  const codes = new Set<string>(["TRY"]);
  for (const row of data.byCurrency) codes.add(row.currency);
  return [...codes].sort((a, b) => (a === "TRY" ? -1 : b === "TRY" ? 1 : a.localeCompare(b)));
}

export type TreasuryCardKey =
  "bank" | "cash" | "check" | "bill" | "checkBill" | "cashTotal" | "general" | "afterDebt";

export type TreasuryCard = {
  key: TreasuryCardKey;
  icon: string;
  /** Sol kenar ve başlık rengi (ZTO satır içi). */
  border: string;
  color: string;
  gradient: string;
  /** Alt başlık: sayım anahtarı + değer ya da sabit anahtar. */
  sub: { key: string; count?: number };
  rows: Array<{ currency: string; amount: string; color?: string }>;
};

/**
 * Sekiz para birimi kartı (ZTO sırası ve renkleri). Blackrose'da çek/senet iki yönlüdür:
 * Bekleyen Çek/Senet = alınan − verilen (işaretli), Genel Toplam = banka + kasa + alınan çek/senet
 * (tüm varlıklar), Borç Sonrası Bakiye = (banka + kasa) − (verilen çek + senet).
 */
export function summaryCards(data: Treasury): TreasuryCard[] {
  const currencies = summaryCurrencies(data);
  const of = (currency: string) =>
    data.byCurrency.find((row) => row.currency === currency) ?? {
      currency,
      bank: "0",
      cash: "0",
      receivedChecks: "0",
      issuedChecks: "0",
      receivedNotes: "0",
      issuedNotes: "0",
      net: "0",
    };
  const rows = (
    value: (row: ReturnType<typeof of>) => string,
    color?: (amount: string) => string,
  ) =>
    currencies.map((currency) => {
      const amount = value(of(currency));
      return color ? { currency, amount, color: color(amount) } : { currency, amount };
    });
  const checkNet = (r: ReturnType<typeof of>) => subDec(r.receivedChecks, r.issuedChecks);
  const noteNet = (r: ReturnType<typeof of>) => subDec(r.receivedNotes, r.issuedNotes);
  const cashSum = (r: ReturnType<typeof of>) => addDec(r.bank, r.cash);
  return [
    {
      key: "bank",
      icon: "fas fa-university",
      border: "#3b82f6",
      color: "#1e40af",
      gradient: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      sub: { key: "treasury.cards.bankCount", count: data.banks.length },
      rows: rows((r) => r.bank),
    },
    {
      key: "cash",
      icon: "fas fa-wallet",
      border: "#10b981",
      color: "#166534",
      gradient: "linear-gradient(135deg, #10b981, #059669)",
      sub: { key: "treasury.cards.cashCount", count: data.cashes.length },
      rows: rows((r) => r.cash),
    },
    {
      key: "check",
      icon: "fas fa-money-check",
      border: "#f59e0b",
      color: "#92400e",
      gradient: "linear-gradient(135deg, #f59e0b, #d97706)",
      sub: { key: "treasury.cards.pieces", count: data.pendingChecks.length },
      rows: rows(checkNet),
    },
    {
      key: "bill",
      icon: "fas fa-file-invoice-dollar",
      border: "#06b6d4",
      color: "#0e7490",
      gradient: "linear-gradient(135deg, #06b6d4, #0891b2)",
      sub: { key: "treasury.cards.pieces", count: data.pendingBills.length },
      rows: rows(noteNet),
    },
    {
      key: "checkBill",
      icon: "fas fa-file-invoice",
      border: "#8b5cf6",
      color: "#7c3aed",
      gradient: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
      sub: {
        key: "treasury.cards.pieces",
        count: data.pendingChecks.length + data.pendingBills.length,
      },
      rows: rows((r) => addDec(checkNet(r), noteNet(r))),
    },
    {
      key: "cashTotal",
      icon: "fas fa-coins",
      border: "#10b981",
      color: "#059669",
      gradient: "linear-gradient(135deg, #10b981, #059669)",
      sub: { key: "treasury.cards.cashTotalSub" },
      rows: rows(cashSum),
    },
    {
      key: "general",
      icon: "fas fa-money-bill-alt",
      border: "#1e3a5f",
      color: "#1e3a5f",
      gradient: "linear-gradient(135deg, #1e3a5f, #2d5a87)",
      sub: { key: "treasury.cards.generalSub" },
      rows: rows((r) => sumDec([r.bank, r.cash, r.receivedChecks, r.receivedNotes])),
    },
    {
      key: "afterDebt",
      icon: "fas fa-check-circle",
      border: "#059669",
      color: "#059669",
      gradient: "linear-gradient(135deg, #059669, #047857)",
      sub: { key: "treasury.cards.afterDebtSub" },
      rows: rows(
        (r) => subDec(cashSum(r), addDec(r.issuedChecks, r.issuedNotes)),
        (amount) => signColor(amount),
      ),
    },
  ];
}

/** ZTO `colorClass = finalBalance >= 0 ? '#059669' : '#dc2626'`. */
export function signColor(amount: string): string {
  return cmpDec(amount, "0") >= 0 ? "#059669" : "#dc2626";
}

/** TL BAZINDA TOPLAM kartı satırları (sunucu TL toplamları; Çek/Senet alınan − verilen). */
export function tlCardRows(
  data: Pick<Treasury, "bankTl" | "cashTl" | "checkTl" | "noteTl" | "netTl">,
): Array<{ key: "tlBank" | "tlCash" | "tlCheck" | "tlNote"; amount: string; color: string }> {
  return [
    { key: "tlBank", amount: data.bankTl, color: "#1e40af" },
    { key: "tlCash", amount: data.cashTl, color: "#166534" },
    { key: "tlCheck", amount: data.checkTl, color: "#92400e" },
    { key: "tlNote", amount: data.noteTl, color: "#0e7490" },
  ];
}

// ---------------------------------------------------------------------------------------------
// Tablolar
// ---------------------------------------------------------------------------------------------

export type FundCurrencyTotal = {
  currency: string;
  balance: string;
  in30: string;
  out30: string;
  checkCount: number;
  noteCount: number;
};

/** Banka/kasa tablosu `tfoot`: para birimi başına bir "TOPLAM ({PB}):" satırı (ZTO ≈7949-7958). */
export function fundTotals(funds: readonly TreasuryFund[]): FundCurrencyTotal[] {
  const totals = new Map<string, FundCurrencyTotal>();
  for (const fund of funds) {
    const current = totals.get(fund.currency) ?? {
      currency: fund.currency,
      balance: "0",
      in30: "0",
      out30: "0",
      checkCount: 0,
      noteCount: 0,
    };
    totals.set(fund.currency, {
      currency: fund.currency,
      balance: addDec(current.balance, fund.balance),
      in30: addDec(current.in30, fund.in30),
      out30: addDec(current.out30, fund.out30),
      checkCount: current.checkCount + fund.checkCount,
      noteCount: current.noteCount + fund.noteCount,
    });
  }
  return sortByCurrency([...totals.values()]);
}

/** Çek/senet `tfoot`: para birimi başına tutar toplamı. */
export function instrumentTotals(
  instruments: readonly TreasuryInstrument[],
): Array<{ currency: string; amount: string }> {
  const totals = new Map<string, string>();
  for (const item of instruments) {
    totals.set(item.currency, addDec(totals.get(item.currency) ?? "0", item.amount));
  }
  return sortByCurrency([...totals].map(([currency, amount]) => ({ currency, amount })));
}

function sortByCurrency<T extends { currency: string }>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    a.currency === "TRY" ? -1 : b.currency === "TRY" ? 1 : a.currency.localeCompare(b.currency),
  );
}

/** Bakiye sınıfı (ZTO `bank.balance >= 0 ? 'text-success' : 'text-danger'`). */
export function balanceClass(balance: string): "text-success" | "text-danger" {
  return cmpDec(balance, "0") >= 0 ? "text-success" : "text-danger";
}

/** Kalan gün sınıfı (ZTO: ≤ 7 kırmızı, ≤ 30 sarı, diğer yeşil). */
export function daysClass(daysLeft: number): "text-danger" | "text-warning" | "text-success" {
  if (daysLeft <= 7) return "text-danger";
  if (daysLeft <= 30) return "text-warning";
  return "text-success";
}

/** Keşideci hücresi: personel carisi maskeli (SEC-12.8-02; sunucu `drawerName`'i null döner). */
export function drawerLabel(item: TreasuryInstrument, maskedText: string): string {
  if (item.masked) return maskedText;
  return item.drawerName || item.accountName || "-";
}

/** Banka adı (yoksa hesap adı) — ZTO `bank.bankName`. */
export function fundBankName(fund: TreasuryFund): string {
  return fund.bankName || fund.name;
}

// ---------------------------------------------------------------------------------------------
// Alt bilgi ve grafikler
// ---------------------------------------------------------------------------------------------

/** ZTO alt bilgisi yalnız USD, EUR, GBP, RUB kurlarını yazar ("USD: 34,1234 ₺"). */
const FOOTER_RATES = ["USD", "EUR", "GBP", "RUB"];

export function ratesText(rates: readonly ReportRate[]): string {
  return FOOTER_RATES.flatMap((code) => {
    const rate = rates.find((item) => item.currency === code);
    return rate ? [`${code}: ${formatNumber(rate.rate, 4)} ₺`] : [];
  }).join(" | ");
}

/** Son 30 gün giriş/çıkış grafiği verisi (etiket `dd.MM`). */
export function dailySeries(daily: Treasury["bankDaily"]): {
  labels: string[];
  inData: number[];
  outData: number[];
} {
  return {
    labels: daily.map((day) => formatDate(day.date).slice(0, 5)),
    inData: daily.map((day) => Number(day.inTl)),
    outData: daily.map((day) => Number(day.outTl)),
  };
}

/** Kurla TL (TRY = 1; kur yoksa null). */
function toTl(amount: string, currency: string, rates: readonly ReportRate[]): string | null {
  if (currency === "TRY") return amount;
  const rate = rates.find((item) => item.currency === currency);
  return rate ? roundDec(mulDec(amount, rate.rate), 2) : null;
}

/**
 * Varlık Dağılımı (ZTO doughnut): banka, kasa, bekleyen çekler, bekleyen senetler — TL karşılığı. Çek
 * ve senet brüt (alınan + verilen; ZTO tüm bekleyenleri toplar), eksi değer 0 çizilir.
 */
export function assetDistribution(data: Treasury): number[] {
  const gross = (pick: (row: Treasury["byCurrency"][number]) => string) =>
    sumDec(data.byCurrency.map((row) => toTl(pick(row), row.currency, data.rates) ?? "0"));
  const values = [
    data.bankTl,
    data.cashTl,
    gross((row) => addDec(row.receivedChecks, row.issuedChecks)),
    gross((row) => addDec(row.receivedNotes, row.issuedNotes)),
  ];
  return values.map((value) => Math.max(0, Number(value)));
}

/** Çek/Senet Vade Takvimi (ay başına TL; etiket `MM.yyyy`). */
export function dueSeries(buckets: Treasury["dueBuckets"]): {
  labels: string[];
  checks: number[];
  notes: number[];
} {
  return {
    labels: buckets.map((bucket) => formatMonthKey(bucket.month)),
    checks: buckets.map((bucket) => Number(bucket.checksTl)),
    notes: buckets.map((bucket) => Number(bucket.notesTl)),
  };
}

// ---------------------------------------------------------------------------------------------
// Excel (ZTO `exportTreasuryToExcel` yalnız alert gösteriyordu → çalışır; §0.4)
// ---------------------------------------------------------------------------------------------

export type TreasuryLabels = {
  t: (key: string, values?: Record<string, unknown>) => string;
};

type Sheet = { name: string; headers: string[]; rows: Array<Array<string | number | null>> };

/** Bankalar, Kasalar, Çekler, Senetler sayfaları (ekranda görünen, süzülmüş satırlar). */
export function treasurySheets(data: Treasury, { t }: TreasuryLabels): Sheet[] {
  const c = (key: string) => t(`treasury.col.${key}`);
  const money = (amount: string) => Number(amount);
  return [
    {
      name: t("ztoFinans:treasury.sheets.banks"),
      headers: [
        c("branchGroup"),
        c("workPlace"),
        c("bank"),
        c("bankBranch"),
        c("iban"),
        "PB",
        c("balance"),
        c("in30"),
        c("out30"),
        c("checks"),
        c("notes"),
      ],
      rows: data.banks.map((fund) => [
        fund.branchGroupName ?? "-",
        fund.branchName,
        fundBankName(fund),
        [fund.bankBranchName, fund.accountNoMasked].filter(Boolean).join(" / "),
        fund.iban ?? "",
        fund.currency,
        money(fund.balance),
        money(fund.in30),
        money(fund.out30),
        fund.checkCount,
        fund.noteCount,
      ]),
    },
    {
      name: t("ztoFinans:treasury.sheets.cashes"),
      headers: [
        c("branchGroup"),
        c("workPlace"),
        c("cashCode"),
        c("cashName"),
        "PB",
        c("balance"),
        c("in30"),
        c("out30"),
      ],
      rows: data.cashes.map((fund) => [
        fund.branchGroupName ?? "-",
        fund.branchName,
        fund.code,
        fund.name,
        fund.currency,
        money(fund.balance),
        money(fund.in30),
        money(fund.out30),
      ]),
    },
    {
      name: t("ztoFinans:treasury.sheets.checks"),
      headers: [
        c("checkNo"),
        c("bank"),
        c("branch"),
        c("drawer"),
        "PB",
        c("amount"),
        c("dueDate"),
        c("daysLeft"),
        c("status"),
        c("type"),
      ],
      rows: data.pendingChecks.map((item) => [
        item.number,
        item.bankName ?? "-",
        item.bankBranch ?? "-",
        drawerLabel(item, t("ztoFinans:treasury.maskedDrawer")),
        item.currency,
        money(item.amount),
        formatDate(item.dueDate),
        item.daysLeft,
        t(`treasury.status.${item.status}`),
        t(`treasury.direction.${item.direction}`),
      ]),
    },
    {
      name: t("ztoFinans:treasury.sheets.bills"),
      headers: [
        c("noteNo"),
        c("type"),
        c("bank"),
        c("drawer"),
        "PB",
        c("amount"),
        c("dueDate"),
        c("daysLeft"),
        c("status"),
      ],
      rows: data.pendingBills.map((item) => [
        item.number,
        noteTypeLabel(item, t),
        item.bankName ?? "-",
        drawerLabel(item, t("ztoFinans:treasury.maskedDrawer")),
        item.currency,
        money(item.amount),
        formatDate(item.dueDate),
        item.daysLeft,
        t(`treasury.status.${item.status}`),
      ]),
    },
  ];
}

/** Senet "Tür" hücresi: senet türü (yoksa yön). */
export function noteTypeLabel(item: TreasuryInstrument, t: TreasuryLabels["t"]): string {
  return item.noteType
    ? t(`treasury.noteType.${item.noteType}`, { defaultValue: item.noteType })
    : t(`treasury.direction.${item.direction}`);
}

/** "1.234,56" (N2) — ZTO `formatCurrency`. */
export function formatTreasuryAmount(amount: string): string {
  return formatN2(amount);
}

// ---------------------------------------------------------------------------------------------
// Sekmeler (MWG `tabs`: URL değişmez → seçim odağı izler; ←/→/Home/End)
// ---------------------------------------------------------------------------------------------

export const TREASURY_TABS = ["banks", "cashes", "checks", "bills", "charts"] as const;
export type TreasuryTab = (typeof TREASURY_TABS)[number];

/** Klavyeyle sonraki sekmenin sırası; ilgisiz tuşta null. */
export function nextTreasuryTab(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
