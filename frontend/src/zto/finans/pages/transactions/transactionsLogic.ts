import type { SortingState } from "@tanstack/react-table";
import type {
  Account,
  AccountDocumentType,
  AccountRollover,
  AccountTransactionRow,
  AccountType,
  BalanceBreakdownRow,
  DocumentSide,
  TransactionKind,
} from "../../../../pages/finance/types";

/*
 * Cari Hareketler (ZTO AccountTransaction/Transactions.cshtml + transactions.js) saf mantığı (12.1 §5.10).
 * Bakiye işareti Blackrose `balance` = Σ DEBIT − Σ CREDIT (> 0 cari bize borçlu); ZTO getEffect
 * (Alacak/Ödeme +, Borç/Tahsilat −) ile aynıdır.
 */

export const KINDS: readonly TransactionKind[] = ["DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"];

export type TabKey = "ALL" | TransactionKind;

/** ZTO `isCustomer` = hesap grubu "Müşteri"; Blackrose'ta müşteri türündeki kartlar (MUSTERI, ACENTE). */
export function isCustomerType(type: AccountType | null | undefined): boolean {
  return type === "CUSTOMER";
}

/** Sekme sırası (TR:925-975): müşteride Alacaklar önce, diğerlerinde Borçlar önce. */
export function tabOrder(customer: boolean): TabKey[] {
  return customer
    ? ["ALL", "RECEIVABLE", "COLLECTION", "DEBT", "PAYMENT"]
    : ["ALL", "DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"];
}

/** Özet kartı mini istatistik sırası (TR:341-385, :463-540). */
export function summaryOrder(customer: boolean): TransactionKind[] {
  return customer
    ? ["RECEIVABLE", "COLLECTION", "DEBT", "PAYMENT"]
    : ["DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"];
}

/**
 * Sekme listesinde klavye gezinmesi (MWG `tabs`, roving tabindex; seçim odağı izler). Ok tuşları
 * sarar; Home/End uçlara; diğer tuşlar null.
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
// Tarih yardımcıları (yalnız ISO yyyy-MM-dd; saat dilimi kaydırması yok)
// ---------------------------------------------------------------------------------------------

/** ISO tarihe gün ekler (UTC takvim aritmetiği; saat dilimi kayması olmaz). */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "2026-03-01" → "01.03.2026". */
export function isoToTr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : "";
}

// ---------------------------------------------------------------------------------------------
// Sezon (Cari Devir) süzgeci
// ---------------------------------------------------------------------------------------------

/** Seçici değeri: "all" Tüm Sezonlar, "opening" Açılış (devir öncesi), diğerleri rollover id. */
export type SeasonValue = string;
export const SEASON_ALL = "all";
export const SEASON_OPENING = "opening";

/** Silinmemiş sezonlar, devir tarihine göre artan. */
export function sortSeasons(rollovers: readonly AccountRollover[]): AccountRollover[] {
  return rollovers
    .filter((r) => !r.deletedAt)
    .slice()
    .sort((a, b) => a.rolloverDate.localeCompare(b.rolloverDate) || a.id.localeCompare(b.id));
}

/**
 * Sezon penceresi (ZTO CT_SEASON start/end): sezon kendi devir tarihinden bir sonrakinin bir gün
 * öncesine kadar; son sezon açık uçlu. "Açılış" ilk devirden önceki her şey (yalnız `to`). Sezon yoksa
 * ya da "Tüm Sezonlar" ise süzgeç yok (`accountId`'li istekte tarih sınırı yok, §3.7).
 */
export function seasonWindow(
  seasons: readonly AccountRollover[],
  value: SeasonValue,
): { from?: string; to?: string } {
  const sorted = sortSeasons(seasons);
  if (sorted.length === 0 || value === SEASON_ALL) return {};
  if (value === SEASON_OPENING) return { to: addDays(sorted[0].rolloverDate, -1) };
  const index = sorted.findIndex((s) => s.id === value);
  if (index < 0) return {};
  const next = sorted[index + 1];
  return next
    ? { from: sorted[index].rolloverDate, to: addDays(next.rolloverDate, -1) }
    : { from: sorted[index].rolloverDate };
}

/** Varsayılan seçim: URL'deki geçerli değer, yoksa aktif sezon, yoksa Tüm Sezonlar. */
export function defaultSeason(
  seasons: readonly AccountRollover[],
  fromUrl: string | null | undefined,
): SeasonValue {
  const sorted = sortSeasons(seasons);
  if (fromUrl === SEASON_ALL) return SEASON_ALL;
  if (fromUrl === SEASON_OPENING && sorted.length > 0) return SEASON_OPENING;
  if (fromUrl && sorted.some((s) => s.id === fromUrl)) return fromUrl;
  return sorted.find((s) => s.active)?.id ?? SEASON_ALL;
}

export type SeasonOption = { value: SeasonValue; label: string };

/** ZTO ctBuildSeasonSelect: "Tüm Sezonlar", (devir varsa) "Açılış (devir öncesi)", "{ad} ({tarih})  ·  Aktif". */
export function seasonOptions(
  seasons: readonly AccountRollover[],
  texts: { all: string; opening: string; active: string },
): SeasonOption[] {
  const sorted = sortSeasons(seasons);
  const options: SeasonOption[] = [{ value: SEASON_ALL, label: texts.all }];
  if (sorted.length > 0) options.push({ value: SEASON_OPENING, label: texts.opening });
  for (const s of sorted) {
    const base = `${s.seasonName} (${isoToTr(s.rolloverDate)})`;
    options.push({ value: s.id, label: s.active ? `${base}  ·  ${texts.active}` : base });
  }
  return options;
}

// ---------------------------------------------------------------------------------------------
// Belge türleri ve vergi hesabı
// ---------------------------------------------------------------------------------------------

/**
 * Borç/Alacak Ekle belge türü listesi (TR:1725-1754, :1350-1360): yalnız seçilebilir türler, `sortOrder`
 * sırasıyla; müşteride kitle CUSTOMER+ALL, diğerlerinde OTHER+ALL. Varsayılan: kitlesindeki
 * `isDefault` (müşteri Borç Ekle'de yok → "Seçiniz..." seçili).
 */
export function documentTypeOptions(
  types: readonly AccountDocumentType[],
  side: DocumentSide,
  customer: boolean,
): { options: AccountDocumentType[]; defaultCode: string } {
  const audiences = customer ? ["CUSTOMER", "ALL"] : ["OTHER", "ALL"];
  const options = types
    .filter((t) => t.side === side && t.selectable && audiences.includes(t.audience))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  return { options, defaultCode: options.find((t) => t.isDefault)?.code ?? "" };
}

/** BigDecimal.setScale(2, HALF_UP) karşılığı (sıfırdan uzağa yuvarlama). */
export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
}

export type TaxInput = {
  discountRate?: number | null;
  vatRate?: number | null;
  withholdingAmount?: number | null;
  otherTaxesAmount?: number | null;
};

export type TaxPreview = {
  grossAmount: number;
  discountAmount: number;
  netExclVat: number;
  vatAmount: number;
  totalInclVat: number;
  netPayable: number;
};

/**
 * Fatura bölümü hesabı — sunucunun §3.4 formülüyle aynı (ZTO calculateFaturaAlisDebt tjs:1625-1652):
 * indirim = round2(brüt × oran / 100); KDV hariç = brüt − indirim; KDV = round2(KDV hariç × oran / 100);
 * KDV dahil = hariç + KDV; net = dahil − stopaj − diğer. Yalnız önizleme; sunucu yeniden hesaplar.
 */
export function computeTax(gross: number, tax: TaxInput = {}): TaxPreview {
  const g = Number.isFinite(gross) ? gross : 0;
  const discountAmount = round2((g * (tax.discountRate ?? 0)) / 100);
  const netExclVat = round2(g - discountAmount);
  const vatAmount = round2((netExclVat * (tax.vatRate ?? 0)) / 100);
  const totalInclVat = round2(netExclVat + vatAmount);
  const netPayable = round2(
    totalInclVat - (tax.withholdingAmount ?? 0) - (tax.otherTaxesAmount ?? 0),
  );
  return { grossAmount: g, discountAmount, netExclVat, vatAmount, totalInclVat, netPayable };
}

// ---------------------------------------------------------------------------------------------
// Özet kartı
// ---------------------------------------------------------------------------------------------

export type KindTotals = Record<TransactionKind, number> & { balance: number };

const ZERO: KindTotals = { DEBT: 0, PAYMENT: 0, RECEIVABLE: 0, COLLECTION: 0, balance: 0 };

/** Bakiye kırılımı satırlarından para birimi + segment toplamı (iş yeri/şirket satırları toplanır). */
export function kindTotals(
  rows: readonly BalanceBreakdownRow[],
  currency: string | null,
  segment: BalanceBreakdownRow["segment"] = "ALL",
): KindTotals {
  return rows
    .filter((r) => r.segment === segment && (currency === null || r.currency === currency))
    .reduce<KindTotals>(
      (acc, r) => ({
        DEBT: acc.DEBT + r.debt,
        PAYMENT: acc.PAYMENT + r.payment,
        RECEIVABLE: acc.RECEIVABLE + r.receivable,
        COLLECTION: acc.COLLECTION + r.collection,
        balance: acc.balance + r.balance,
      }),
      { ...ZERO },
    );
}

export type NetStatus = {
  amount: number;
  label: "debtor" | "creditor" | "balanced";
  badge: "badge-success" | "badge-danger" | "badge-info";
  icon: string;
  iconClass: string;
  badgeIcon: string;
};

/**
 * Mahsuplaşma ve net durum (TR:400-460 müşteri, :600-650 diğer). Müşteride net = (Alacak − Tahsilat) −
 * (Borç − Ödeme): > 0 "Borçlu" yeşil, < 0 "Alacaklı" kırmızı; diğerlerinde net = (Borç − Ödeme) −
 * (Alacak − Tahsilat): > 0 "Alacaklı" kırmızı, < 0 "Borçlu" yeşil; 0 "Dengede".
 */
export function settlement(customer: boolean, totals: KindTotals) {
  const receivableNet = totals.RECEIVABLE - totals.COLLECTION;
  const payableNet = totals.DEBT - totals.PAYMENT;
  const net = customer ? receivableNet - payableNet : payableNet - receivableNet;
  let status: NetStatus;
  if (net > 0) {
    status = customer
      ? {
          amount: net,
          label: "debtor",
          badge: "badge-success",
          icon: "fas fa-arrow-circle-up fa-2x",
          iconClass: "text-success",
          badgeIcon: "fas fa-hand-holding-usd",
        }
      : {
          amount: net,
          label: "creditor",
          badge: "badge-danger",
          icon: "fas fa-arrow-circle-up fa-2x",
          iconClass: "text-danger",
          badgeIcon: "fas fa-exclamation-triangle",
        };
  } else if (net < 0) {
    status = customer
      ? {
          amount: -net,
          label: "creditor",
          badge: "badge-danger",
          icon: "fas fa-arrow-circle-down fa-2x",
          iconClass: "text-danger",
          badgeIcon: "fas fa-exclamation-triangle",
        }
      : {
          amount: -net,
          label: "debtor",
          badge: "badge-success",
          icon: "fas fa-arrow-circle-down fa-2x",
          iconClass: "text-success",
          badgeIcon: "fas fa-check-double",
        };
  } else {
    status = {
      amount: 0,
      label: "balanced",
      badge: "badge-info",
      icon: "fas fa-check-circle fa-2x",
      iconClass: "text-info",
      badgeIcon: "fas fa-balance-scale",
    };
  }
  return { receivableNet: Math.abs(receivableNet), payableNet: Math.abs(payableNet), status };
}

/**
 * Borç kartı fatura popover'ı (TR:470-560; ZTO 1 birim tolerans): fark = Toplam Borç − Resmi Fatura;
 * > 1 → "fatura kesilmesi gerekli" (warning), < −1 → "borç girişi gerekli" (info), diğer → eşleşiyor.
 */
export function invoiceGap(totalDebt: number, invoiceTotal: number) {
  const diff = round2(totalDebt - invoiceTotal);
  if (diff > 1) return { status: "warning" as const, diff, badge: "badge-warning" };
  if (diff < -1) return { status: "info" as const, diff, badge: "badge-info" };
  return { status: "success" as const, diff, badge: "badge-success" };
}

/** Başlık bakiye çipi (TR:268-276): müşteride > 0 chip-warning, diğerlerinde chip-danger; < 0 chip-success. */
export function balanceChip(customer: boolean, balance: number) {
  if (balance === 0) return null;
  return {
    className: balance > 0 ? (customer ? "chip-warning" : "chip-danger") : "chip-success",
    icon: balance > 0 ? "fas fa-arrow-up" : "fas fa-arrow-down",
    amount: Math.abs(balance),
  };
}

/** Para birimi düğmeleri: bakiyesi ya da hareketi olanlar; varsayılan para birimi her zaman listede, başta. */
export function currencyButtons(
  rows: readonly BalanceBreakdownRow[],
  defaultCurrency: string | null,
): string[] {
  const set = new Set<string>();
  if (defaultCurrency) set.add(defaultCurrency);
  for (const r of rows) {
    if (r.debit !== 0 || r.credit !== 0 || r.balance !== 0) set.add(r.currency);
  }
  const rest = [...set].filter((c) => c !== defaultCurrency).sort();
  return defaultCurrency ? [defaultCurrency, ...rest] : rest;
}

/** Kart ya da (aktif şirket seçiliyse ve tanımlıysa) şirket limiti. */
export function effectiveLimits(account: Account | undefined, companyId: string | null) {
  const company = companyId
    ? account?.companyLimits?.find((l) => l.companyId === companyId)
    : undefined;
  if (company)
    return { credit: company.creditLimit ?? 0, risk: company.riskLimit ?? 0, company: true };
  return { credit: account?.creditLimit ?? 0, risk: account?.riskLimit ?? 0, company: false };
}

/** #limitStatusAlert: bakiye > kredi limiti → danger; > risk limiti → warning; diğer null. */
export function limitStatus(balance: number, credit: number, risk: number) {
  if (credit > 0 && balance > credit) return "credit" as const;
  if (risk > 0 && balance > risk) return "risk" as const;
  return null;
}

/**
 * Limit grafiği serisi (renderLimitMiniChart): son `days` günün (0 = ilk hareketten bugüne) günlük
 * kapanış bakiyesi. `points` tarih sırasında (date, balance) — ekstre satırlarının yürüyen bakiyesi.
 */
export function limitSeries(
  points: ReadonlyArray<{ date: string; balance: number }>,
  days: number,
  today: string,
): { dates: string[]; values: number[] } {
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date));
  const start =
    days > 0
      ? addDays(today, -(days - 1))
      : sorted[0]?.date && sorted[0].date < today
        ? sorted[0].date
        : today;
  const dates: string[] = [];
  const values: number[] = [];
  let i = 0;
  let current = 0;
  while (i < sorted.length && sorted[i].date < start) {
    current = sorted[i].balance;
    i++;
  }
  for (let day = start; day <= today; day = addDays(day, 1)) {
    while (i < sorted.length && sorted[i].date <= day) {
      current = sorted[i].balance;
      i++;
    }
    dates.push(day);
    values.push(current);
    if (dates.length > 3700) break;
  }
  return { dates, values };
}

// ---------------------------------------------------------------------------------------------
// Satırlar
// ---------------------------------------------------------------------------------------------

/** Tür rozeti (AT:5690-5715) ve tutar rengi; RECEIVABLE'da Satış/İade ek rozeti. */
export const KIND_BADGE: Record<TransactionKind, string> = {
  DEBT: "badge-danger",
  RECEIVABLE: "badge-success",
  PAYMENT: "badge-warning",
  COLLECTION: "badge-primary",
};

export const KIND_AMOUNT_CLASS: Record<TransactionKind, string> = {
  DEBT: "text-danger font-weight-bold",
  RECEIVABLE: "text-success font-weight-bold",
  PAYMENT: "text-warning font-weight-bold",
  COLLECTION: "text-primary font-weight-bold",
};

export function extraBadge(row: Pick<AccountTransactionRow, "kind" | "documentType">) {
  if (row.kind !== "RECEIVABLE") return null;
  if (row.documentType === "SATIS_FATURASI")
    return { key: "SATIS_FATURASI" as const, className: "badge-info" };
  if (row.documentType === "IADE_FATURASI")
    return { key: "IADE_FATURASI" as const, className: "badge-warning" };
  return null;
}

/** Belge türü rozeti (tjs:2716-2737): "Fatura" → primary, "İrsaliye" → info, diğer secondary. */
export function documentTypeBadge(name: string) {
  if (name.includes("Fatura")) return { className: "badge-primary", icon: "fa-file-invoice" };
  if (name.includes("İrsaliye")) return { className: "badge-info", icon: "fa-file-alt" };
  return { className: "badge-secondary", icon: "fa-file" };
}

export function signedAmount(row: Pick<AccountTransactionRow, "amount" | "sign">): number {
  return row.amount * row.sign;
}

/** Defter etkisi: DEBIT +, CREDIT − (ZTO getEffect ile aynı işaret). */
export function ledgerEffect(row: Pick<AccountTransactionRow, "amount" | "direction">): number {
  return row.direction === "DEBIT" ? row.amount : -row.amount;
}

function chronological(a: AccountTransactionRow, b: AccountTransactionRow): number {
  return (
    a.transactionDate.localeCompare(b.transactionDate) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Sunucu sırası: transaction_date DESC, created_at DESC, id DESC. */
export function newestFirst(rows: readonly AccountTransactionRow[]): AccountTransactionRow[] {
  return rows.slice().sort((a, b) => chronological(b, a));
}

/** Yürüyen bakiye (eskiden yeniye, para birimi başına; ZTO balanceRow). */
export function runningBalances(rows: readonly AccountTransactionRow[]): Map<string, number> {
  const result = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const row of rows.slice().sort(chronological)) {
    const next = round2((totals.get(row.currency) ?? 0) + ledgerEffect(row));
    totals.set(row.currency, next);
    result.set(row.id, next);
  }
  return result;
}

export function rowsOfTab(
  rows: readonly AccountTransactionRow[],
  tab: TabKey,
): AccountTransactionRow[] {
  return tab === "ALL" ? rows.slice() : rows.filter((r) => r.kind === tab);
}

/** Satırın düzenlenebilir belgesi var mı (yalnız ACCOUNT_DOCUMENT; açıklık detayda denetlenir). */
export function isDocumentRow(
  row: Pick<AccountTransactionRow, "sourceType" | "reversal" | "reversed">,
) {
  return row.sourceType === "ACCOUNT_DOCUMENT" && !row.reversal && !row.reversed;
}

/** Sil düğmesi: ters kayıt, zaten ters çevrilmiş ve taşıma kayıtlarında yok (sunucu yine denetler). */
export function canVoid(row: AccountTransactionRow) {
  return !row.reversal && !row.reversed && !row.transferRole && !row.transferredOut;
}

// ---------------------------------------------------------------------------------------------
// Sezon işaretçi satırları (tjs __atxApplyMarkers :1080-1150)
// ---------------------------------------------------------------------------------------------

export type SeasonMarker =
  | { kind: "season"; beforeIndex: number; key: string; season: AccountRollover }
  | { kind: "opening"; beforeIndex: number; key: string };

/**
 * Geçerli sayfanın satırları arasına devir/sezon işaretçileri ve en alta "Cari Açılışı" satırı
 * (ZtoDataTable pageDecorator). Yalnız tarih sütununa göre sıralıyken (başka sütunda gizli). Her devir,
 * görünüm sırasında devir tarihinden eski ilk satırın önüne (azalan) / devir tarihine ulaşan ilk satırın
 * önüne (artan) yerleşir; satırı olmayan devirler ve açılış son sayfanın sonuna (artanda açılış başa).
 * `ordered` tablonun tüm satırları görünüm sırasında (sayfa sınırını bilmek için).
 */
export function seasonMarkers(
  pageRows: readonly AccountTransactionRow[],
  ordered: readonly AccountTransactionRow[],
  seasons: readonly AccountRollover[],
  sorting: SortingState,
  dateColumnId: string,
  dateOf: (row: AccountTransactionRow) => string = (row) => row.transactionDate,
): SeasonMarker[] {
  const sort = sorting[0];
  if (!sort || sort.id !== dateColumnId || pageRows.length === 0 || ordered.length === 0) return [];
  const desc = sort.desc;
  const pageIndex = new Map(pageRows.map((row, i) => [row.id, i]));
  const firstPage = ordered[0].id === pageRows[0].id;
  const lastPage = ordered[ordered.length - 1].id === pageRows[pageRows.length - 1].id;
  const list = sortSeasons(seasons);
  const markers: SeasonMarker[] = [];
  if (!desc && firstPage) markers.push({ kind: "opening", beforeIndex: 0, key: "opening" });
  const tail: SeasonMarker[] = [];
  const ordering = desc ? list.slice().reverse() : list;
  for (const season of ordering) {
    const d = season.rolloverDate;
    const target = ordered.find((row) => (desc ? dateOf(row) < d : dateOf(row) >= d));
    const marker = { kind: "season" as const, key: `season-${season.id}`, season };
    if (target) {
      const index = pageIndex.get(target.id);
      if (index !== undefined) markers.push({ ...marker, beforeIndex: index });
    } else if (lastPage) {
      tail.push({ ...marker, beforeIndex: pageRows.length });
    }
  }
  markers.push(...tail);
  if (desc && lastPage)
    markers.push({ kind: "opening", beforeIndex: pageRows.length, key: "opening" });
  return markers;
}

/** Sunucu hata gövdesi (ApiError benzeri: `body.code`, `body.message`); ağ hatasında null. */
export function apiErrorOf(
  error: unknown,
): { status: number; code: string; message: string; details: string[] } | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    status?: unknown;
    body?: { code?: unknown; message?: unknown; details?: unknown };
  };
  if (typeof e.status !== "number" || !e.body) return null;
  return {
    status: e.status,
    code: typeof e.body.code === "string" ? e.body.code : "",
    message: typeof e.body.message === "string" ? e.body.message : "",
    details: Array.isArray(e.body.details) ? (e.body.details as string[]) : [],
  };
}

/** 409 TRANSACTION_SOURCE_MANAGED `details` içindeki kaynak rotası ("route=/x", "route: /x" ya da "/x"). */
export function sourceRouteOf(details: readonly string[]): string | null {
  for (const d of details) {
    const value = d.replace(/^route\s*[=:]\s*/i, "").trim();
    if (value.startsWith("/") && !value.startsWith("//")) return value;
  }
  return null;
}
