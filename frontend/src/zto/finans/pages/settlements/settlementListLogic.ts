import type { SettlementListParams } from "../../../../pages/finance/settlementApi";
import type {
  AccountType,
  PayMethod,
  SettlementListItem,
  SettlementType,
} from "../../../../pages/finance/types";
import type { SearchableGroup, SearchableItem } from "../../../components";
import type { DataTableState } from "../../../components/dataTableLogic";
import { cmpDec, fromScaled, tryScaled } from "../../../decimal";
import { currencySymbol, formatN2, formatNumber } from "../../../format";
import type { BranchTree } from "../../../branch/branchTree";
import { filterTreeByCompany } from "../../../branch/branchTree";
import { addDaysIso } from "../fundTransactions/fundTransactionsLogic";

/*
 * Ödemeler / Tahsilatlar listelerinin saf mantığı (12.2a_TASARIM §5.5, §5.6, §5.11; ZTO pjs:2907-3168,
 * :3437-3533, cjs:3436-4044). Tutar karşılaştırmaları `zto/decimal.ts` ile (float yok, OK-12.2a-32);
 * biçim yalnız gösterimde `formatN2`.
 */

// ---------------------------------------------------------------------------------------------
// Süzgeç durumu ve sorgu
// ---------------------------------------------------------------------------------------------

/**
 * ZTO tablosu: Payments.cshtml:1888 / Collections.cshtml:612 `pageLength: 25` (pjs:108-110, cjs:63-67
 * `...config.datatables.config` ile yayılır). ZTO'daki "Tümü" (-1) sunucu sayfalaması nedeniyle
 * bilinçli olarak çıkarıldı (Rev 1 F10, zto-onyuz:F6).
 */
export const PAGE_LENGTH = 25;
export const LENGTH_MENU = [10, 25, 50, 100];
export const TABLE_DOM =
  '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';

/** Süzgeç "Ödeme"/"TAHSİLAT YÖNTEMİ" seçenek sırası (ZTO ViewBag.PaymentMethods; "Diğer" yok). */
export const METHOD_OPTIONS: readonly PayMethod[] = [
  "CASH",
  "BANK",
  "CHECK",
  "NOTE",
  "CREDIT_CARD",
];

export type SettlementFilters = {
  /** Çoklu şirkette şirket seçici ("" = konsolide); tek şirkette kullanılmaz. */
  companyId: string;
  accountId: string;
  /** Tahsilatlar "Hesap Grubu": `accountType:code` ("" = tümü). */
  group: string;
  branchId: string;
  from: string;
  to: string;
  method: PayMethod | "";
};

/**
 * İlk açılış ve "Temizle" varsayılanı: bugün−7…bugün (yerel takvim; PAY:362, COL:303). ZTO "Temizle"
 * son 30 güne ve UTC tarihine (`toISOString`) dönüyordu — ZTO hatası (g), burada açılışla aynı.
 */
export function defaultFilters(today: string, companyId = ""): SettlementFilters {
  return {
    companyId,
    accountId: "",
    group: "",
    branchId: "",
    from: addDaysIso(today, -7),
    to: today,
    method: "",
  };
}

/** "Hesap Grubu" değeri ↔ `accountType` + `subGroup`. */
export function groupValue(accountType: AccountType, code: string): string {
  return `${accountType}:${code}`;
}

export function parseGroup(value: string): { accountType?: AccountType; subGroup?: string } {
  const index = value.indexOf(":");
  if (index <= 0) return {};
  return {
    accountType: value.slice(0, index) as AccountType,
    subGroup: value.slice(index + 1) || undefined,
  };
}

/** Sunucu sıralama alanları (beyaz liste §3.7); diğer sütunlar sıralanmaz. */
export const SORT_FIELDS: Readonly<Record<string, string>> = {
  date: "settlementDate",
  workPlace: "branchName",
  account: "accountName",
  documentNo: "documentNo",
  amount: "amount",
};

/** Sunucunun kabul ettiği en çok `sort` parametresi (B3 `SettlementQueryService.MAX_SORTS`). */
export const MAX_SORTS = 3;

/**
 * Tablo sıralaması → `sort` parametreleri; tarih sıralamasına aynı yönde `createdAt` eklenir (yer
 * varsa). Shift+tık çok sütunlu sıralamada en çok `MAX_SORTS` anahtar üretilir, aynı alan tekrar
 * edilmez (4. anahtar 400 SORT_INVALID döndürürdü — zto-onyuz:F3).
 */
export function sortParams(sorting: DataTableState["sorting"] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of sorting ?? []) {
    if (out.length >= MAX_SORTS) break;
    const field = SORT_FIELDS[item.id];
    if (!field || seen.has(field)) continue;
    seen.add(field);
    const dir = item.desc ? "desc" : "asc";
    out.push(`${field},${dir}`);
    if (field === "settlementDate" && out.length < MAX_SORTS) out.push(`createdAt,${dir}`);
  }
  return out.length > 0 ? out : ["settlementDate,desc", "createdAt,desc"];
}

/**
 * Liste sorgusu: her zaman `status=POSTED` (iptal edilenler gösterilmez, OK-12.2a-26) ve
 * `hasAccount=true` (carisiz gider ödemeleri ZTO listesinde yok). `companyId`: tek şirkette undefined
 * (aktif şirket), çoklu şirkette seçilen ("" → null = konsolide).
 */
export function listParams(
  filters: SettlementFilters,
  table: DataTableState | null,
  multiCompany: boolean,
): SettlementListParams {
  const length = table && table.length > 0 ? table.length : PAGE_LENGTH;
  const group = parseGroup(filters.group);
  return {
    companyId: multiCompany ? filters.companyId || null : undefined,
    accountId: filters.accountId || undefined,
    accountType: group.accountType,
    subGroup: group.subGroup,
    branchIds: filters.branchId ? [filters.branchId] : undefined,
    methods: filters.method ? [filters.method] : undefined,
    status: "POSTED",
    hasAccount: true,
    from: filters.from || undefined,
    to: filters.to || undefined,
    q: table?.search.trim() || undefined,
    page: table ? Math.floor(table.start / length) : 0,
    size: length,
    sort: sortParams(table?.sorting),
  };
}

/** Enter = Filtrele; IME bileşimi sürerken yok sayılır (MWG ime-safe-enter-submit). */
export function isSubmitEnter(event: {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return event.key === "Enter" && !event.isComposing && event.keyCode !== 229;
}

// ---------------------------------------------------------------------------------------------
// Seçenek listeleri
// ---------------------------------------------------------------------------------------------

/** Cari hesap seçeneği "kod - ad (grup)" (ZTO ViewBag.CustomerAccounts). */
export function accountOptions(
  accounts: ReadonlyArray<{ id: string; code: string; name: string; subGroupName?: string | null }>,
): SearchableItem[] {
  return accounts.map((a) => ({
    value: a.id,
    label: a.subGroupName ? `${a.code} - ${a.name} (${a.subGroupName})` : `${a.code} - ${a.name}`,
  }));
}

/** Tahsilatlar "İŞ YERİ" aranabilir seçici: şube optgroup'ları altında iş yerleri (COL:337-365). */
export function workPlaceGroups(
  tree: BranchTree | undefined,
  companyId: string | null,
): SearchableGroup[] {
  return filterTreeByCompany(tree ?? [], companyId).flatMap((company) =>
    company.groups
      .map((group) => ({
        label: group.groupName,
        options: group.branches
          .filter((b) => b.active)
          .map((b) => ({ value: b.id, label: b.name })),
      }))
      .filter((group) => group.options.length > 0),
  );
}

// ---------------------------------------------------------------------------------------------
// Hücreler
// ---------------------------------------------------------------------------------------------

/** "Ödeme/Tahsilat Yöntemi" rozeti (pjs:3437-3446, :3483-3487). */
export type MethodBadge = {
  method: PayMethod;
  className: string;
  /** Çek/Senet numarası satırı (`small.text-info` / `small.text-warning`). */
  sub: { kind: "CHECK" | "NOTE"; className: string; number: string } | null;
};

const METHOD_BADGE: Record<PayMethod, string> = {
  CASH: "badge-success",
  BANK: "badge-primary",
  CHECK: "badge-info",
  NOTE: "badge-warning",
  CREDIT_CARD: "badge-danger",
};

/** `displayMethod` (OTHER üretilmez; gelirse BANK sayılmaz, CASH değil — rozet "badge-secondary"). */
export function payMethodOf(row: Pick<SettlementListItem, "displayMethod">): PayMethod {
  const m = row.displayMethod as string;
  return (METHOD_OPTIONS as readonly string[]).includes(m) ? (m as PayMethod) : "BANK";
}

export function methodBadge(
  row: Pick<SettlementListItem, "displayMethod" | "instrumentNumber">,
): MethodBadge {
  const method = payMethodOf(row);
  const number = row.instrumentNumber ?? "";
  const sub =
    method === "CHECK" && number
      ? { kind: "CHECK" as const, className: "text-info", number }
      : method === "NOTE" && number
        ? { kind: "NOTE" as const, className: "text-warning", number }
        : null;
  return { method, className: METHOD_BADGE[method], sub };
}

/** "Muhasebe Tipi" (pjs:3051-3083, cjs:3599-3631; Blackrose türetmesi §5.5). */
export type AccountingCell = {
  key: "regular" | "check" | "note" | "intercompany";
  className: string;
  icon: string;
  /** `planId` doluysa altında `small.text-muted` "Plan". */
  plan: boolean;
};

export function accountingCell(
  row: Pick<SettlementListItem, "displayMethod" | "intercompany" | "planId">,
): AccountingCell {
  const plan = !!row.planId;
  if (row.intercompany) {
    return { key: "intercompany", className: "badge-primary", icon: "fa-university", plan };
  }
  const method = payMethodOf(row);
  if (method === "CHECK") {
    return { key: "check", className: "badge-secondary", icon: "fa-file-alt", plan };
  }
  if (method === "NOTE") {
    return { key: "note", className: "badge-secondary", icon: "fa-file-alt", plan };
  }
  return { key: "regular", className: "badge-success", icon: "fa-user", plan };
}

/** "Kaynak" (pjs:3458-3481, cjs:119-148): kasa turuncu, banka mavi; yoksa null ("-"). */
export type SourceCell = {
  kind: "CASH" | "BANK";
  fundAccountId: string;
  text: string;
};

export function sourceCell(
  row: Pick<
    SettlementListItem,
    "fundAccountId" | "fundName" | "fundKind" | "fundBankName" | "fundBankBranchName"
  >,
): SourceCell | null {
  if (!row.fundAccountId || !row.fundKind) return null;
  if (row.fundKind === "CASH") {
    return { kind: "CASH", fundAccountId: row.fundAccountId, text: row.fundName ?? "" };
  }
  const bank = row.fundBankName?.trim();
  const text = bank
    ? `${bank}${row.fundBankBranchName ? ` - ${row.fundBankBranchName}` : ""}`
    : (row.fundName ?? "");
  return { kind: "BANK", fundAccountId: row.fundAccountId, text };
}

/** Tutar "N2 sembol" (pjs:3153, cjs:3804-3806). */
export function amountText(money: { amount: string; currency: string }): string {
  return `${formatN2(money.amount)} ${currencySymbol(money.currency)}`;
}

/** Tahsilat Tutar hücresindeki "Kur:" değeri: her satırda; kur yoksa "1,0000" (cjs:3809, Rev 1 F7a). */
export function rateText(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "1,0000" : formatNumber(rate, 4);
}

// ---------------------------------------------------------------------------------------------
// Düzenle / Sil görünürlüğü (§5.5, §5.6; Ç5/Ç6)
// ---------------------------------------------------------------------------------------------

type ActionRow = Pick<
  SettlementListItem,
  "displayMethod" | "reversible" | "correctable" | "fxUsed" | "employeeMasked"
>;

/** Ödemeler: Düzenle yalnız `correctable` ve Nakit/Banka (Kredi Kartı satırında yok — ZTO birebir). */
export function canEdit(type: SettlementType, row: ActionRow): boolean {
  const method = payMethodOf(row);
  if (type === "PAYMENT") return row.correctable && (method === "CASH" || method === "BANK");
  return canDelete(type, row) && row.correctable;
}

/**
 * Sil: `reversible` ve Çek/Senet değil (çekli kayıt 12.3'e kadar iptal edilemez). Tahsilatta ayrıca
 * döviz bozumunda hiç kullanılmamış olmalı (cjs:3778 `exchangeStatus === 'Bekliyor'`).
 */
export function canDelete(type: SettlementType, row: ActionRow): boolean {
  const method = payMethodOf(row);
  if (!row.reversible || method === "CHECK" || method === "NOTE") return false;
  return type === "PAYMENT" || cmpDec(row.fxUsed, "0") === 0;
}

/** Detay: maskeli personel satırında gizli (sunucu 404 SETTLEMENT_NOT_FOUND döner, OK-12.2a-8). */
export function canShowDetail(row: Pick<SettlementListItem, "employeeMasked">): boolean {
  return !row.employeeMasked;
}

// ---------------------------------------------------------------------------------------------
// Döviz Bozum hücresi (cjs:3635-3758, Rev 1 F7)
// ---------------------------------------------------------------------------------------------

export type FxStatus = "WAITING" | "PARTIAL" | "DONE";

export type FxCell =
  | { kind: "notFx" }
  | {
      kind: "progress";
      status: FxStatus;
      badgeClass: "badge-warning" | "badge-info" | "badge-success";
      barClass: "bg-warning" | "bg-info" | "bg-success";
      /** Çubuk genişliği ve `aria-valuenow` ("0" Bekliyor'da, değilse 2 ondalık). */
      width: string;
      /** Alt metindeki oran: tam sayıysa 0, değilse 1 ondalık. */
      percentText: string;
      /** Alt metin, ör. "%0 • 1.000,00 €", "%25 • 250,00 / 1.000,00 €". */
      info: string;
      /** "Boz" (Bekliyor, Kısmi Bozum). */
      showExchange: boolean;
      /** "Transferler" bağlantısı (Tamamlandı). */
      showTransfers: boolean;
    };

/** Oranın milyonda biri (bigint): bozulan / toplam × 100 × 10⁶, [0, 100 × 10⁶]'ya kırpılır. */
function percentMicro(exchanged: bigint, total: bigint): bigint {
  if (total <= 0n) return 0n;
  const raw = (exchanged * 100_000_000n) / total;
  return raw < 0n ? 0n : raw > 100_000_000n ? 100_000_000n : raw;
}

function microToFixed(micro: bigint, digits: number): string {
  return (Number(micro) / 1_000_000).toFixed(digits);
}

export function fxCell(row: Pick<SettlementListItem, "money" | "fxUsed" | "fxRemaining">): FxCell {
  if (row.money.currency === "TRY") return { kind: "notFx" };
  const symbol = currencySymbol(row.money.currency);
  const total = tryScaled(row.money.amount) ?? 0n;
  const remaining = tryScaled(row.fxRemaining) ?? total;
  const used = tryScaled(row.fxUsed) ?? 0n;
  const totalText = formatN2(fromScaled(total));
  if (used <= 0n || total <= 0n) {
    return {
      kind: "progress",
      status: "WAITING",
      badgeClass: "badge-warning",
      barClass: "bg-warning",
      width: "0",
      percentText: "0",
      info: `%0 • ${total > 0n ? totalText : "0"} ${symbol}`,
      showExchange: true,
      showTransfers: false,
    };
  }
  let exchanged = total - remaining;
  if (exchanged < 0n) exchanged = 0n;
  const micro = percentMicro(exchanged, total);
  const width = microToFixed(micro, 2);
  const percentText = micro % 1_000_000n === 0n ? microToFixed(micro, 0) : microToFixed(micro, 1);
  if (remaining <= 0n) {
    return {
      kind: "progress",
      status: "DONE",
      badgeClass: "badge-success",
      barClass: "bg-success",
      width,
      percentText,
      info: `%${percentText} • ${totalText} ${symbol}`,
      showExchange: false,
      showTransfers: true,
    };
  }
  return {
    kind: "progress",
    status: "PARTIAL",
    badgeClass: "badge-info",
    barClass: "bg-info",
    width,
    percentText,
    info: `%${percentText} • ${formatN2(fromScaled(exchanged))} / ${totalText} ${symbol}`,
    showExchange: true,
    showTransfers: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Silme onayı (pjs:3538-3585; CAPC:2905-2907)
// ---------------------------------------------------------------------------------------------

/** İptal tarihi sınırları (OK-12.2a-6): kayıt tarihi ≤ tarih ≤ max(bugün, kayıt tarihi). */
export function reverseBounds(settlementDate: string, today: string) {
  const max = settlementDate > today ? settlementDate : today;
  return { min: settlementDate, max, initial: max };
}

export function isReverseDateValid(date: string, bounds: { min: string; max: string }): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= bounds.min && date <= bounds.max;
}

/**
 * Onay iletisinin parçaları: ZTO "{tutar} TL" sabiti yerine kaydın para birimi sembolü (ZTO hatası
 * (b)); HTML dizgisi yerine React öğeleriyle basılır (MWG sanitize-untrusted-html).
 */
export function deleteMessageParts(
  row: Pick<SettlementListItem, "money" | "accountName" | "employeeMasked">,
): { amount: string; currency: string; account: string | null } {
  return {
    amount: formatN2(row.money.amount),
    currency: currencySymbol(row.money.currency),
    account: row.employeeMasked ? null : (row.accountName ?? ""),
  };
}

// ---------------------------------------------------------------------------------------------
// Excel (DataTables excelHtml5 karşılığı; görünen metin)
// ---------------------------------------------------------------------------------------------

export type ExportTexts = {
  headers: string[];
  method: (method: PayMethod) => string;
  accounting: (cell: AccountingCell) => string;
  masked: string;
  companyName?: (id: string) => string;
};

/** Görünen hücre metinleri (İşlem sütunu hariç; ZTO tablo dışa aktarımı). */
export function exportRow(
  type: SettlementType,
  row: SettlementListItem,
  texts: ExportTexts,
  formatDate: (iso: string) => string,
): string[] {
  const badge = methodBadge(row);
  const source = sourceCell(row);
  const cells = [
    formatDate(row.settlementDate),
    row.branchName || "-",
    ...(texts.companyName ? [texts.companyName(row.companyId)] : []),
    row.employeeMasked
      ? texts.masked
      : `${row.accountName ?? ""}${row.accountCode ? ` (${row.accountCode})` : ""}`,
    row.documentNo || "-",
    amountText(row.money),
    `${texts.method(badge.method)}${badge.sub ? ` ${badge.sub.number}` : ""}`,
    texts.accounting(accountingCell(row)),
    source ? source.text || "-" : "-",
    row.description || "-",
  ];
  if (type === "COLLECTION") {
    const fx = fxCell(row);
    cells.push(fx.kind === "notFx" ? "-" : fx.info);
  }
  return cells;
}
