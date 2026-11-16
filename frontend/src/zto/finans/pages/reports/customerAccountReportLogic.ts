/*
 * Cari Hesap Raporları saf mantığı (12.8_TASARIM §5.4; ZTO Views/CustomerAccountReport/Reports.cshtml
 * + Controllers/CustomerAccountReportController.cs). Para alanları ondalık metin ya da sayıdır; toplama
 * yalnız `zto/decimal.ts` ile yapılır (ZTO `parseFloat(replace('.', ''))` binlik hatası CAR:628-634
 * taşınmaz). Tarihler `"YYYY-MM-DD"` dizgisidir (MWG `capture-location-agnostic-data`); `new Date`
 * ile ayrıştırılmaz.
 */
import { cmpDec, subDec, sumDec, type DecimalInput } from "../../../decimal";
import { formatMoney } from "../../../format";
import type {
  AccountPerformanceRow,
  Aging,
  CurrencyPositionRow,
  InstrumentKind,
  InstrumentListItem,
  InstrumentStatus,
} from "../../../../pages/finance/types";
import type { CustomerAccountReportTab } from "../../navItems";
import { daysInMonth, isoOf, isoParts } from "../expenses/expenseDates";
import { addDaysIso, compareIsoDate, daysBetween, endOfMonthIso } from "../../reports/reportDates";

// ---------------------------------------------------------------------------------------------
// Sekmeler (CAR:20-49)
// ---------------------------------------------------------------------------------------------

export type CarTabDef = {
  id: CustomerAccountReportTab;
  /** ZTO `a.nav-link` kimliği (`aging-tab` …) ve panel kimliği (`aging` …). */
  tabId: string;
  paneId: string;
  icon: string;
};

/** ZTO sırası, ikonları ve kimlikleri birebir. */
export const CAR_TABS: readonly CarTabDef[] = [
  { id: "aging", tabId: "aging-tab", paneId: "aging", icon: "fas fa-calendar-alt" },
  {
    id: "checks",
    tabId: "check-maturity-tab",
    paneId: "checkMaturity",
    icon: "fas fa-money-check",
  },
  {
    id: "bills",
    tabId: "bill-maturity-tab",
    paneId: "billMaturity",
    icon: "fas fa-file-invoice-dollar",
  },
  {
    id: "performance",
    tabId: "payment-performance-tab",
    paneId: "paymentPerformance",
    icon: "fas fa-chart-line",
  },
  {
    id: "position",
    tabId: "currency-position-tab",
    paneId: "currencyPosition",
    icon: "fas fa-dollar-sign",
  },
];

/** `?tab=` değeri; bilinmeyen/boş → "aging" (ZTO ilk sekme). */
export function parseCarTab(value: string | null | undefined): CustomerAccountReportTab {
  return CAR_TABS.find((tab) => tab.id === value)?.id ?? "aging";
}

/**
 * Sekme listesinde klavye gezinmesi (MWG `tabs`, roving tabindex): ←/→ sarar, Home/End uçlara.
 * Sekme URL'yi değiştirdiği için seçim etkinleştirmeyle olur (Enter/Space); bu yalnız odak indeksi.
 */
export function nextTabIndex(current: number, key: string, count: number): number | null {
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

// ---------------------------------------------------------------------------------------------
// Tarih
// ---------------------------------------------------------------------------------------------

/** Ay ekler; gün hedef ayın son gününe kırpılır (ZTO `DateTime.AddMonths`). Geçersizde aynen döner. */
export function addMonthsIso(value: string, months: number): string {
  const parts = isoParts(value);
  if (!parts) return value;
  const index = parts.year * 12 + (parts.month - 1) + Math.trunc(months);
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return isoOf(year, month, Math.min(parts.day, daysInMonth(year, month)));
}

/** Vade grubu (CAR rozeti): Vadesi Geçmiş / Bu Hafta / Bu Ay / İleri Tarih. */
export type MaturityGroup = "overdue" | "thisWeek" | "thisMonth" | "future";

/**
 * 12.8 §5.4, §6.4: vade < bugün → geçmiş; bugün ≤ vade ≤ bugün + 6 → bu hafta; vade ≤ ay sonu →
 * bu ay; aksi ileri tarih. (ZTO sunucuda +7 / +30 gün kullanıyordu; tasarım kuralı geçerlidir.)
 */
export function maturityGroup(due: string, today: string): MaturityGroup {
  if (compareIsoDate(due, today) < 0) return "overdue";
  if (compareIsoDate(due, addDaysIso(today, 6)) <= 0) return "thisWeek";
  const monthEnd = endOfMonthIso(today);
  if (monthEnd && compareIsoDate(due, monthEnd) <= 0) return "thisMonth";
  return "future";
}

export const MATURITY_BADGE: Record<MaturityGroup, string> = {
  overdue: "badge-danger",
  thisWeek: "badge-warning",
  thisMonth: "badge-info",
  future: "badge-secondary",
};

/** "Kalan Gün" (bugünden vadeye; geçmişte eksi). Geçersiz tarihte null. */
export function daysLeft(due: string, today: string): number | null {
  return daysBetween(today, due);
}

// ---------------------------------------------------------------------------------------------
// Çek / senet durum süzgeci (04 §3.2 eşlemesi; CAR:183-190, 310-317)
// ---------------------------------------------------------------------------------------------

export type CheckStatusFilter = "all" | "portfolio" | "atBank" | "collected" | "bounced";
export type BillStatusFilter = "all" | "portfolio" | "collateral" | "paid" | "protested";

export const CHECK_STATUS_FILTERS: Readonly<
  Record<CheckStatusFilter, readonly InstrumentStatus[]>
> = {
  all: [],
  portfolio: ["PORTFOLIO"],
  atBank: ["AT_BANK"],
  collected: ["COLLECTED", "COLLECTED_TO_CASH"],
  bounced: ["BOUNCED"],
};

export const BILL_STATUS_FILTERS: Readonly<Record<BillStatusFilter, readonly InstrumentStatus[]>> =
  {
    all: [],
    portfolio: ["PORTFOLIO"],
    collateral: ["COLLATERAL"],
    paid: ["PAID", "COLLECTED", "COLLECTED_TO_CASH"],
    protested: ["PROTESTED"],
  };

export const CHECK_FILTER_ORDER: readonly CheckStatusFilter[] = [
  "all",
  "portfolio",
  "atBank",
  "collected",
  "bounced",
];
export const BILL_FILTER_ORDER: readonly BillStatusFilter[] = [
  "all",
  "portfolio",
  "collateral",
  "paid",
  "protested",
];

/** Satır durum rozeti: ZTO'nun renklendirdiği durumlar; diğerleri `badge-secondary` + 12.3 etiketi. */
export type StatusBadge = { className: string; labelKey: string };

export function statusBadge(kind: InstrumentKind, status: InstrumentStatus): StatusBadge {
  const fallback: StatusBadge = {
    className: "badge-secondary",
    labelKey: `instruments.status.${kind === "CHECK" ? "check" : "note"}.${status}`,
  };
  if (kind === "CHECK") {
    switch (status) {
      case "PORTFOLIO":
        return {
          className: "badge-info",
          labelKey: "customerAccountReport.checks.status.portfolio",
        };
      case "AT_BANK":
        return {
          className: "badge-warning",
          labelKey: "customerAccountReport.checks.status.atBank",
        };
      case "COLLECTED":
      case "COLLECTED_TO_CASH":
        return {
          className: "badge-success",
          labelKey: "customerAccountReport.checks.status.collected",
        };
      case "BOUNCED":
        return {
          className: "badge-danger",
          labelKey: "customerAccountReport.checks.status.bounced",
        };
      default:
        return fallback;
    }
  }
  switch (status) {
    case "PORTFOLIO":
      return { className: "badge-info", labelKey: "customerAccountReport.bills.status.portfolio" };
    case "COLLATERAL":
      return {
        className: "badge-warning",
        labelKey: "customerAccountReport.bills.status.collateral",
      };
    case "PAID":
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
      return { className: "badge-success", labelKey: "customerAccountReport.bills.status.paid" };
    case "PROTESTED":
      return {
        className: "badge-danger",
        labelKey: "customerAccountReport.bills.status.protested",
      };
    default:
      return fallback;
  }
}

/** Açık (henüz sonuçlanmamış) durumlar: "Vadesi Geçenler" kartı yalnız bunları sayar (§5.4). */
const OPEN_STATUSES: ReadonlySet<InstrumentStatus> = new Set<InstrumentStatus>([
  "PORTFOLIO",
  "AT_BANK",
  "ISSUED",
  "COLLATERAL",
]);

export function isOpenStatus(status: InstrumentStatus): boolean {
  return OPEN_STATUSES.has(status);
}

/** Teminat rozeti (CAR:799-801; alan adı `collateral`). */
export function isCollateral(row: Pick<InstrumentListItem, "collateral" | "status">): boolean {
  return row.collateral || row.status === "COLLATERAL";
}

export type InstrumentSummary = {
  count: number;
  /** Para birimi başına toplam (sıra: ilk görülme). */
  totals: Array<{ currency: string; amount: string }>;
  thisWeek: number;
  overdue: number;
};

/** Özet kartları (CAR:700-748): adet, para birimi başına tutar, bu hafta, vadesi geçen (açık). */
export function instrumentSummary(
  rows: readonly InstrumentListItem[],
  today: string,
): InstrumentSummary {
  const amounts = new Map<string, DecimalInput[]>();
  let thisWeek = 0;
  let overdue = 0;
  for (const row of rows) {
    const list = amounts.get(row.money.currency) ?? [];
    list.push(row.money.amount);
    amounts.set(row.money.currency, list);
    const group = maturityGroup(row.dueDate, today);
    if (group === "thisWeek") thisWeek++;
    if (group === "overdue" && isOpenStatus(row.status)) overdue++;
  }
  return {
    count: rows.length,
    totals: Array.from(amounts, ([currency, values]) => ({ currency, amount: sumDec(values) })),
    thisWeek,
    overdue,
  };
}

/** "1.234,00 ₺ / 500,00 $" (ZTO sabit ₺ → para birimi başına; boşta "0,00 ₺"). */
export function totalsText(totals: ReadonlyArray<{ currency: string; amount: string }>): string {
  if (totals.length === 0) return formatMoney(0, "TRY");
  return totals.map((total) => formatMoney(total.amount, total.currency)).join(" / ");
}

/** Vade sırası (ZTO sunucu `ORDER BY DueDate`); eşitlikte numara. */
export function sortByDue<T extends Pick<InstrumentListItem, "dueDate" | "number">>(
  rows: readonly T[],
): T[] {
  return rows
    .slice()
    .sort((a, b) => compareIsoDate(a.dueDate, b.dueDate) || a.number.localeCompare(b.number, "tr"));
}

/** Keşideci / muhatap hücresi: kod + ad (personel maskesi; verilen çekte keşideci ya da şirket). */
export type PartyCell = { code: string; name: string; masked: boolean };

export function partyOf(row: InstrumentListItem): PartyCell {
  if (row.employeeMasked) return { code: "", name: "", masked: true };
  if (row.kind === "CHECK" && row.direction === "ISSUED") {
    return { code: "", name: row.drawerName ?? row.companyName ?? "", masked: false };
  }
  return {
    code: row.accountCode ?? "",
    name: row.accountName ?? row.drawerName ?? "",
    masked: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Yaşlandırma (CAR:600-661)
// ---------------------------------------------------------------------------------------------

export type AgingBucketKey = "notDue" | "days0To30" | "days31To60" | "days61To90" | "daysOver90";

export const AGING_BUCKETS: readonly AgingBucketKey[] = [
  "notDue",
  "days0To30",
  "days31To60",
  "days61To90",
  "daysOver90",
];

export type AgingTotalRow = {
  currency: string;
  buckets: Record<AgingBucketKey, string>;
  total: string;
};

/** "GENEL TOPLAM:" para birimi başına satır (ZTO tüm para birimlerini tek toplama katıyordu). */
export function agingTotals(rows: readonly Aging[]): AgingTotalRow[] {
  const byCurrency = new Map<string, Aging[]>();
  for (const row of rows) {
    const list = byCurrency.get(row.currency) ?? [];
    list.push(row);
    byCurrency.set(row.currency, list);
  }
  return Array.from(byCurrency, ([currency, list]) => {
    const buckets = Object.fromEntries(
      AGING_BUCKETS.map((key) => [key, sumDec(list.map((row) => row[key]))]),
    ) as Record<AgingBucketKey, string>;
    return { currency, buckets, total: sumDec(list.map((row) => row.total)) };
  });
}

/** "TL KARŞILIĞI:" satırı yalnız ≥ 2 para biriminde; değer `tlTotal` toplamı. */
export function agingTlTotal(rows: readonly Aging[]): string | null {
  const currencies = new Set(rows.map((row) => row.currency));
  return currencies.size >= 2 ? sumDec(rows.map((row) => row.tlTotal)) : null;
}

/** Toplam Bakiye sınıfı: eksi `text-danger`, aksi `text-success` (CAR:637). */
export function balanceClass(value: DecimalInput): string {
  return cmpDec(value, 0) < 0 ? "text-danger" : "text-success";
}

// ---------------------------------------------------------------------------------------------
// Ödeme performansı (CAR:867-908)
// ---------------------------------------------------------------------------------------------

/** Skor rozeti: ≥ 80 success, ≥ 50 warning, aksi danger; null → secondary "-". */
export function scoreBadge(score: number | null): { className: string; text: string } {
  if (score === null || !Number.isFinite(score)) return { className: "badge-secondary", text: "-" };
  const className = score >= 80 ? "badge-success" : score >= 50 ? "badge-warning" : "badge-danger";
  return { className, text: `${score}%` };
}

/** Kart altı notundaki eşleşmesiz kayıt sayısı. */
export function unmatchedTotal(rows: readonly AccountPerformanceRow[]): number {
  return rows.reduce((total, row) => total + (row.unmatchedCount ?? 0), 0);
}

// ---------------------------------------------------------------------------------------------
// Döviz pozisyonu (CAR:917-1004)
// ---------------------------------------------------------------------------------------------

export type PositionKind = "receivable" | "payable" | "balanced";

export type PositionView = {
  currency: string;
  receivable: string;
  payable: string;
  /** ZTO tanımı: alacak − borç (banka/kasa dahil edilmez). */
  net: string;
  kind: PositionKind;
};

export function positionView(row: CurrencyPositionRow): PositionView {
  const net = subDec(row.receivable, row.payable);
  const sign = cmpDec(net, 0);
  return {
    currency: row.currency,
    receivable: row.receivable,
    payable: row.payable,
    net,
    kind: sign > 0 ? "receivable" : sign < 0 ? "payable" : "balanced",
  };
}

export const POSITION_BADGE: Record<PositionKind, string> = {
  receivable: "badge-success",
  payable: "badge-danger",
  balanced: "badge-secondary",
};

export const POSITION_NET_CLASS: Record<PositionKind, string> = {
  receivable: "text-success",
  payable: "text-danger",
  balanced: "text-muted",
};

/** Grafik verisi (yalnız çizim için `Number`; ZTO `rgba` renkleri). */
export function positionChart(
  rows: readonly PositionView[],
  labels: { receivable: string; payable: string },
) {
  return {
    labels: rows.map((row) => row.currency),
    datasets: [
      {
        label: labels.receivable,
        data: rows.map((row) => Number(row.receivable)),
        backgroundColor: "rgba(40, 167, 69, 0.7)",
        borderColor: "rgba(40, 167, 69, 1)",
        borderWidth: 2,
      },
      {
        label: labels.payable,
        data: rows.map((row) => Number(row.payable)),
        backgroundColor: "rgba(220, 53, 69, 0.7)",
        borderColor: "rgba(220, 53, 69, 1)",
        borderWidth: 2,
      },
    ],
  };
}

/** Excel hücresi: ondalık metin → sayı (yalnız dışa aktarım; geçersizde boş). */
export function excelNumber(value: DecimalInput): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Ekrandaki ZTO dosya adları (alert yerine çalışan Excel). */
export const CAR_EXCEL_FILES = {
  aging: "Cari_Yaslandirma",
  checks: "Cek_Vade_Raporu",
  bills: "Senet_Vade_Raporu",
  performance: "Odeme_Performans_Raporu",
} as const;
