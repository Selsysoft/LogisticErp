import type {
  InstrumentListItem,
  InstrumentStatus,
  InstrumentTransitionBody,
  Money,
  NoteType,
} from "../../../../pages/finance/types";
import { cmpDec, sumDec } from "../../../decimal";
import { isOverdue, remainingDays } from "./instrumentLogic";

/*
 * Senetler (ZTO Views/Bills/Bills.cshtml; 12.3_TASARIM §5.5) saf mantığı. Liste istemci kipindedir
 * (OK-12.3-15): tüm senetler bir kez okunur, durum/tür/cari süzgeci burada uygulanır; özet kartları
 * ZTO'daki gibi süzgeçten bağımsızdır (GetBillsSummary). Tarihler ISO takvim günü.
 */

// ---------------------------------------------------------------------------------------------
// Süzgeç (BillsController StatusList / BillTypeList)
// ---------------------------------------------------------------------------------------------

export type BillStatusFilter = "" | "PORTFOLIO" | "COLLATERAL" | "PAID" | "PROTESTED" | "CANCELLED";

/** ZTO durum seçenekleri → sunucu durumları (§5.5). */
export const BILL_STATUS_FILTERS: Readonly<
  Record<Exclude<BillStatusFilter, "">, readonly InstrumentStatus[]>
> = {
  PORTFOLIO: ["PORTFOLIO", "ISSUED"],
  COLLATERAL: ["COLLATERAL"],
  PAID: ["PAID", "COLLECTED", "COLLECTED_TO_CASH"],
  PROTESTED: ["PROTESTED"],
  CANCELLED: ["CANCELLED", "RETURNED"],
};

export const BILL_STATUS_FILTER_OPTIONS = Object.keys(BILL_STATUS_FILTERS) as Exclude<
  BillStatusFilter,
  ""
>[];

export const NOTE_TYPES: readonly NoteType[] = ["PLAIN", "ORDER", "BOND"];

export type BillFilters = {
  status: BillStatusFilter;
  noteType: NoteType | "";
  accountId: string;
};

export const EMPTY_BILL_FILTERS: BillFilters = { status: "", noteType: "", accountId: "" };

export function filterBills(rows: readonly InstrumentListItem[], filters: BillFilters) {
  const statuses = filters.status ? BILL_STATUS_FILTERS[filters.status] : null;
  return rows.filter(
    (row) =>
      (!statuses || statuses.includes(row.status)) &&
      (!filters.noteType || row.noteType === filters.noteType) &&
      (!filters.accountId || row.accountId === filters.accountId),
  );
}

/** Süzgeç dolu mu ("Aktif Filtreleme" çipi ZTO'da hep görünür; burada ekran okuyucu bilgisi). */
export function hasActiveFilter(filters: BillFilters): boolean {
  return filters.status !== "" || filters.noteType !== "" || filters.accountId !== "";
}

// ---------------------------------------------------------------------------------------------
// Özet kartları (GetBillsSummary; ZTO hatası (e) düzeltildi: "Portföydeki" = portföy tutarı)
// ---------------------------------------------------------------------------------------------

/** "Portföyde" sayılan durumlar (ZTO BillStatus 'Portföyde'; verilen senet de "Portföyde" görünür). */
const PORTFOLIO_STATUSES: readonly InstrumentStatus[] = BILL_STATUS_FILTERS.PORTFOLIO;

export type BillStats = {
  total: number;
  portfolioCount: number;
  /** Para birimi başına portföy tutarı (sıra: TRY önce, sonra alfabetik); boşsa []. */
  portfolioAmounts: Money[];
  overdueCount: number;
};

export function billStats(rows: readonly InstrumentListItem[], today: string): BillStats {
  const byCurrency = new Map<string, string[]>();
  let portfolioCount = 0;
  let overdueCount = 0;
  for (const row of rows) {
    if (PORTFOLIO_STATUSES.includes(row.status)) {
      portfolioCount += 1;
      const list = byCurrency.get(row.money.currency) ?? [];
      list.push(row.money.amount);
      byCurrency.set(row.money.currency, list);
    }
    if (isOverdue(row, today)) overdueCount += 1;
  }
  const portfolioAmounts = [...byCurrency.entries()]
    .sort(([a], [b]) => (a === "TRY" ? -1 : b === "TRY" ? 1 : a.localeCompare(b)))
    .map(([currency, amounts]) => ({ amount: sumDec(amounts), currency }));
  return { total: rows.length, portfolioCount, portfolioAmounts, overdueCount };
}

// ---------------------------------------------------------------------------------------------
// Hücreler
// ---------------------------------------------------------------------------------------------

export type MaturityKind = "overdue" | "thisWeek" | "thisMonth" | "future";

export type Maturity = { kind: MaturityKind; days: number; className: string };

/** Kalan gün rozeti (BillsController :608-615 + getMaturityBadge). Tarih geçersizse null. */
export function maturity(dueDate: string | null | undefined, today: string): Maturity | null {
  const days = remainingDays(dueDate, today);
  if (days === null) return null;
  if (days < 0) return { kind: "overdue", days, className: "badge-danger" };
  if (days <= 7) return { kind: "thisWeek", days, className: "badge-warning" };
  if (days <= 30) return { kind: "thisMonth", days, className: "badge-info" };
  return { kind: "future", days, className: "badge-secondary" };
}

/** Durum rozeti sınıfı (getBillStatusBadge). */
export function billStatusBadgeClass(status: InstrumentStatus): string {
  switch (status) {
    case "PORTFOLIO":
    case "ISSUED":
      return "badge-info";
    case "COLLATERAL":
      return "badge-warning";
    case "PAID":
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
      return "badge-success";
    case "PROTESTED":
    case "BOUNCED":
      return "badge-danger";
    default:
      return "badge-secondary";
  }
}

export type BillParty = { code: string | null; name: string | null };

export type BillParties = { drawer: BillParty; drawee: BillParty; payee: BillParty };

/**
 * Keşideci / Muhatap / Lehdar (§5.5): alınan senette keşideci `drawerName ?? cari`, lehdar şirket;
 * verilen senette keşideci iş yeri, lehdar cari. Muhatap her iki yönde cari. Maskeli satırda cari
 * ve keşideci null (ekranda "—").
 */
export function billParties(
  item: Pick<
    InstrumentListItem,
    "direction" | "drawerName" | "accountCode" | "accountName" | "companyName" | "branchName"
  >,
): BillParties {
  const account: BillParty = { code: item.accountCode, name: item.accountName };
  if (item.direction === "ISSUED") {
    return {
      drawer: { code: item.companyName, name: item.branchName },
      drawee: account,
      payee: account,
    };
  }
  return {
    drawer: item.drawerName ? { code: null, name: item.drawerName } : account,
    drawee: account,
    payee: { code: null, name: item.companyName },
  };
}

// ---------------------------------------------------------------------------------------------
// Satır menüsü simgeleri (BIL:3300-3420; BR ekleri sonda)
// ---------------------------------------------------------------------------------------------

const MENU_ICONS: Readonly<Record<string, string>> = {
  COLLATERAL: "fa-shield-alt text-warning",
  COLLECTED: "fa-check-circle text-success",
  PAID: "fa-check-circle text-success",
  PROTESTED: "fa-times-circle text-danger",
  PORTFOLIO: "fa-undo text-info",
  RETURNED: "fa-ban text-danger",
  cancelSettlement: "fa-ban text-danger",
  COLLECTED_TO_CASH: "fa-cash-register text-success",
  AT_BANK: "fa-university text-primary",
  BOUNCED: "fa-times-circle text-danger",
};

export function billMenuIcon(key: string): string {
  return MENU_ICONS[key] ?? "fa-exchange-alt text-secondary";
}

// ---------------------------------------------------------------------------------------------
// Durum modalı ("Senet Durumu Güncelle"; BIL:1669-1732, 2990-3040)
// ---------------------------------------------------------------------------------------------

/** Ters kayıt yazan hedefler: onay modalı (M8 tarzı) açılır. */
const CONFIRM_TARGETS: readonly InstrumentStatus[] = ["PROTESTED", "BOUNCED", "RETURNED"];

export function needsConfirm(target: InstrumentStatus): boolean {
  return CONFIRM_TARGETS.includes(target);
}

/**
 * Hedefin istediği fon: banka (AT_BANK, PAID, portföyden COLLECTED; bankadaki senet aynı bankada
 * tahsil edilir), kasa (COLLECTED_TO_CASH) ya da yok. COLLATERAL defter etkisizdir (ZTO hatası (f)).
 */
export function fundKindFor(
  item: Pick<InstrumentListItem, "status">,
  target: InstrumentStatus | "",
): "BANK" | "CASH" | null {
  if (target === "AT_BANK" || target === "PAID") return "BANK";
  if (target === "COLLECTED") return item.status === "AT_BANK" ? null : "BANK";
  if (target === "COLLECTED_TO_CASH") return "CASH";
  return null;
}

export type BillStatusForm = {
  target: InstrumentStatus | "";
  date: string;
  fundAccountId: string;
  note: string;
};

export type BillStatusError = "bankRequired" | "cashRequired" | "dateRequired" | null;

export function validateBillStatus(
  item: Pick<InstrumentListItem, "status">,
  form: BillStatusForm,
): BillStatusError {
  const kind = fundKindFor(item, form.target);
  if (kind && !form.fundAccountId) return kind === "BANK" ? "bankRequired" : "cashRequired";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return "dateRequired";
  return null;
}

export function billTransitionBody(
  item: Pick<InstrumentListItem, "status">,
  form: BillStatusForm,
): InstrumentTransitionBody {
  const kind = fundKindFor(item, form.target);
  const note = form.note.trim();
  return {
    toStatus: form.target as InstrumentStatus,
    date: form.date,
    ...(kind && form.fundAccountId ? { fundAccountId: form.fundAccountId } : {}),
    ...(note ? { note: note.slice(0, 500) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------------------------

/** Sıralama anahtarı: Vade artan, sonra numara (ZTO order [[7,'asc']]). */
export function compareBills(a: InstrumentListItem, b: InstrumentListItem): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return a.number.localeCompare(b.number, "tr");
}

/** Tutar karşılaştırması (sıralama; ondalık metin). */
export function compareAmount(a: InstrumentListItem, b: InstrumentListItem): number {
  return cmpDec(a.money.amount, b.money.amount);
}
