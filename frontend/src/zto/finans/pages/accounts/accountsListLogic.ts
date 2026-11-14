/*
 * Cari Kartlar listesinin saf mantığı (12.1 §5.7; ZTO CustomerAccounts/Index.cshtml +
 * _AccountsTableBody.cshtml). Bileşen ince kalır: satır görünüm modeli, süzgeçler, sıralama, rozet
 * eşlemeleri ve istatistikler burada ve vitest ile sabitlenir.
 */
import type {
  Account,
  AccountGroup,
  AccountPlanSummary,
  Balance,
  BalanceGroupBy,
  CurrencyAmount,
} from "../../../../pages/finance/types";
import { mapInChunks, TASK_BUDGET_MS } from "../../../a11y";

// ---------------------------------------------------------------------------------------------
// Bakiye işareti (§5.0 #10): yalnız bu listede bakiye −balance gösterilir (CA:1681).
// ---------------------------------------------------------------------------------------------

export type BalanceTone = "debt" | "credit" | "balanced";

export type BalanceDisplay = {
  /** Gösterilen değer (= −balance). */
  value: number;
  /** Mutlak değer (ZTO Math.Abs(RemainingDebt)). */
  abs: number;
  tone: BalanceTone;
  /** ZTO sınıfı: > 0 text-danger, < 0 text-success, 0 text-muted. */
  className: "text-danger" | "text-success" | "text-muted";
  /** ZTO ikonu (faw): Borç fa-arrow-down, Alacak fa-arrow-up, Dengede fa-equals. */
  icon: "fa-arrow-down" | "fa-arrow-up" | "fa-equals";
  /** Dönen rozet sınıfı (cbr-r kırmızı, cbr-g yeşil). */
  badgeClass: "cbr-r" | "cbr-g";
};

/** Cari Kartlar listesinde gösterilen bakiye: Blackrose `balance`'ının tersi (ZTO RemainingDebt). */
export function listBalanceDisplay(balance: number): BalanceDisplay {
  const value = balance === 0 ? 0 : -balance;
  if (value > 0) {
    return {
      value,
      abs: value,
      tone: "debt",
      className: "text-danger",
      icon: "fa-arrow-down",
      badgeClass: "cbr-r",
    };
  }
  if (value < 0) {
    return {
      value,
      abs: -value,
      tone: "credit",
      className: "text-success",
      icon: "fa-arrow-up",
      badgeClass: "cbr-g",
    };
  }
  return {
    value: 0,
    abs: 0,
    tone: "balanced",
    className: "text-muted",
    icon: "fa-equals",
    badgeClass: "cbr-g",
  };
}

// ---------------------------------------------------------------------------------------------
// Ödeme planı durumu (planSummary; ZTO CustomerAccount.cs:207-262)
// ---------------------------------------------------------------------------------------------

export type PlanCategory = "overdue" | "today" | "noplan" | "future";
export type PlanFilter = "" | PlanCategory | "pending" | "approved";

export const PLAN_FILTERS: readonly PlanFilter[] = [
  "",
  "overdue",
  "today",
  "noplan",
  "future",
  "pending",
  "approved",
];

/** Kartın plan kategorisi: en yakın vade bugünden önce / bugün / sonra ya da plan yok. */
export function planCategory(summary: AccountPlanSummary | null, today: string): PlanCategory {
  const next = summary?.nextDueDate ?? null;
  if ((summary?.overdueCount ?? 0) > 0 || (next !== null && next < today)) return "overdue";
  if ((summary?.dueTodayCount ?? 0) > 0 || next === today) return "today";
  if (next === null) return "noplan";
  return "future";
}

/** "Planlama Durumu" istemci süzgeci (§5.7 filtre kartı 1). */
export function matchesPlanFilter(
  summary: AccountPlanSummary | null,
  filter: PlanFilter,
  today: string,
): boolean {
  switch (filter) {
    case "":
      return true;
    case "pending":
      return (summary?.pendingCount ?? 0) > 0;
    case "approved":
      return (summary?.approvedCount ?? 0) > 0;
    default:
      return planCategory(summary, today) === filter;
  }
}

/** Satır sınıfı (`_AccountsTableBody.cshtml:12-15`). */
export function rowClassOf(category: PlanCategory): string | undefined {
  if (category === "overdue") return "overdue-row";
  if (category === "today") return "today-row";
  if (category === "noplan") return "no-plan-row";
  return undefined;
}

/** PLAN TARİHİ rengi (`_AccountsTableBody.cshtml:179-183`). */
export function planDateClass(category: PlanCategory): string {
  if (category === "overdue") return "text-danger";
  if (category === "today") return "text-warning";
  return "text-info";
}

export type BadgeInfo = { key: string; badge: string };

/** Plan durumu rozeti (PlanningStatusDisplay / PlanningStatusBadgeClass). */
export function planStatusBadge(category: PlanCategory): BadgeInfo {
  switch (category) {
    case "noplan":
      return { key: "none", badge: "secondary" };
    case "overdue":
      return { key: "overdue", badge: "danger" };
    case "today":
      return { key: "today", badge: "warning" };
    default:
      return { key: "planned", badge: "info" };
  }
}

/**
 * Onay rozeti (ApprovalStatusBadgeClass; MX1 §3 #9 eşlemesi): Onaylandı=APPROVED, Onay Bekliyor=PENDING,
 * Planlama Yapıldı=DRAFT, plan yoksa Beklemede. Reddedildi/Talimat Verildi 12.4'e kadar yok.
 */
export function approvalBadge(summary: AccountPlanSummary | null): BadgeInfo {
  if ((summary?.approvedCount ?? 0) > 0) return { key: "approved", badge: "success" };
  if ((summary?.pendingCount ?? 0) > 0) return { key: "pending", badge: "warning" };
  if ((summary?.draftCount ?? 0) > 0) return { key: "planned", badge: "info" };
  return { key: "waiting", badge: "secondary" };
}

/** Açık plan sayısı (DURUM rozetindeki kırmızı nokta, TotalPlanCount). */
export function planCount(summary: AccountPlanSummary | null): number {
  return (summary?.draftCount ?? 0) + (summary?.pendingCount ?? 0) + (summary?.approvedCount ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Sıralama (MWG sortable-table: tarih ISO değeriyle, metin Intl.Collator ile)
// ---------------------------------------------------------------------------------------------

/** HESAP GRUBU karşılaştırıcısı (Türkçe, sayısal, büyük/küçük harf duyarsız). */
export const groupCollator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

/** İki ISO tarih (null'lar ayrıca en sona konur — TanStack `sortUndefined: "last"`). */
export function comparePlanDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

const CATEGORY_RANK: Record<PlanCategory, number> = { overdue: 0, today: 1, noplan: 2, future: 3 };

/**
 * Varsayılan veri sırası (ZTO "order": [] — sunucu sırası): gecikmiş → bugün → plansız → gelecek,
 * aynı grupta en yakın vade, sonra cari adı (Türkçe).
 */
export function defaultOrder<T extends Pick<Account, "name" | "planSummary">>(
  accounts: readonly T[],
  today: string,
): T[] {
  return accounts
    .map((account) => ({ account, category: planCategory(account.planSummary, today) }))
    .sort(
      (a, b) =>
        CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
        comparePlanDate(
          a.account.planSummary?.nextDueDate ?? null,
          b.account.planSummary?.nextDueDate ?? null,
        ) ||
        groupCollator.compare(a.account.name, b.account.name),
    )
    .map((entry) => entry.account);
}

// ---------------------------------------------------------------------------------------------
// Hesap grubu rozetleri (ZTO groupBadgeMap, _AccountsTableBody.cshtml:44-61)
// ---------------------------------------------------------------------------------------------

export type GroupBadge = { bg: string; color: string; border: string; icon: string };

const ZTO_BADGE = {
  supplier: { bg: "#e0f2fe", color: "#0c4a6e", border: "#bae6fd", icon: "fa-truck-loading" },
  customer: { bg: "#dcfce7", color: "#14532d", border: "#bbf7d0", icon: "fa-user-tie" },
  material: { bg: "#e0e7ff", color: "#312e81", border: "#c7d2fe", icon: "fa-boxes" },
  pesticide: { bg: "#ccfbf1", color: "#134e4a", border: "#99f6e4", icon: "fa-flask" },
  production: { bg: "#fee2e2", color: "#7f1d1d", border: "#fecaca", icon: "fa-hard-hat" },
  transport: { bg: "#ede9fe", color: "#4c1d95", border: "#ddd6fe", icon: "fa-shipping-fast" },
  dispatch: { bg: "#f3e8ff", color: "#581c87", border: "#e9d5ff", icon: "fa-truck-moving" },
  analysis: { bg: "#fce7f3", color: "#831843", border: "#fbcfe8", icon: "fa-microscope" },
  workplace: { bg: "#dbeafe", color: "#1e3a8a", border: "#bfdbfe", icon: "fa-building" },
  personnel: { bg: "#fef9c3", color: "#713f12", border: "#fde68a", icon: "fa-id-badge" },
  expense: { bg: "#fef2f2", color: "#7f1d1d", border: "#fecaca", icon: "fa-receipt" },
  fallback: { bg: "#f1f5f9", color: "#334155", border: "#e2e8f0", icon: "fa-tag" },
} as const satisfies Record<string, GroupBadge>;

/** Blackrose grup kodu → ZTO grup rozeti (§5.7 eşlemesi). */
export const GROUP_BADGES: Readonly<Record<string, GroupBadge>> = {
  MUSTERI: ZTO_BADGE.customer,
  ACENTE: { ...ZTO_BADGE.customer, icon: "fa-handshake" },
  GENEL: ZTO_BADGE.supplier,
  YEDEK_PARCA_SERVIS: ZTO_BADGE.material,
  AKARYAKIT: ZTO_BADGE.pesticide,
  HIZMET: ZTO_BADGE.analysis,
  ELLECLEME_TASERON: ZTO_BADGE.production,
  TASERON_NAKLIYECI: ZTO_BADGE.transport,
  SEVK_NAKLIYECI: ZTO_BADGE.dispatch,
  SURUCU: ZTO_BADGE.personnel,
  OFIS: ZTO_BADGE.personnel,
  BANKA: ZTO_BADGE.expense,
  ADAY: ZTO_BADGE.fallback,
  GRUP_SIRKETI: ZTO_BADGE.workplace,
};

export function groupBadge(code: string | null | undefined): GroupBadge {
  return (code && GROUP_BADGES[code]) || ZTO_BADGE.fallback;
}

// ---------------------------------------------------------------------------------------------
// Grup kipi ve finans hücreleri
// ---------------------------------------------------------------------------------------------

export type TotalsMode = BalanceGroupBy;

/** Görünen kipler: Genel Toplam, İş Yeri Bazlı (+ ≥2 aktif şirkette Şirket Bazlı, OK-12). */
export function totalsModes(multiCompany: boolean): TotalsMode[] {
  return multiCompany ? ["CURRENCY", "BRANCH", "COMPANY"] : ["CURRENCY", "BRANCH"];
}

export type NameLookup = (id: string) => string | undefined;

export type FinanceEntry = {
  key: string;
  currency: string;
  debt: number;
  payment: number;
  receivable: number;
  collection: number;
  balance: BalanceDisplay;
  /** İş yeri/şirket rozeti (Genel Toplam'da yok). */
  scopeLabel: string | null;
  /** Rozet tanımsız (wp-o) mu. */
  scopeUndefined: boolean;
};

/** Bakiye satırları → hücre girdileri (para birimi × iş yeri/şirket; sunucu kırılımı korunur). */
export function financeEntries(
  account: Pick<Account, "balances" | "defaultCurrency">,
  mode: TotalsMode,
  names: { branch: NameLookup; company: NameLookup },
): FinanceEntry[] {
  const balances: Balance[] =
    account.balances.length > 0
      ? account.balances
      : [
          {
            currency: account.defaultCurrency ?? "TRY",
            debit: 0,
            credit: 0,
            balance: 0,
            tlBalance: 0,
            companyId: null,
            branchId: null,
            debt: 0,
            payment: 0,
            receivable: 0,
            collection: 0,
          },
        ];
  return balances.map((b, index) => {
    let scopeLabel: string | null = null;
    let scopeUndefined = false;
    if (mode === "BRANCH" && account.balances.length > 0) {
      const name = b.branchId ? names.branch(b.branchId) : undefined;
      scopeLabel = name ?? null;
      scopeUndefined = name === undefined;
    } else if (mode === "COMPANY" && account.balances.length > 0) {
      const name = b.companyId ? names.company(b.companyId) : undefined;
      scopeLabel = name ?? null;
      scopeUndefined = name === undefined;
    }
    return {
      key: `${b.currency}|${b.branchId ?? ""}|${b.companyId ?? ""}|${index}`,
      currency: b.currency,
      debt: b.debt ?? 0,
      payment: b.payment ?? 0,
      receivable: b.receivable ?? 0,
      collection: b.collection ?? 0,
      balance: listBalanceDisplay(b.balance),
      scopeLabel,
      scopeUndefined,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Satır görünüm modeli
// ---------------------------------------------------------------------------------------------

export type AccountRow = {
  account: Account;
  id: string;
  code: string;
  name: string;
  /** "{iş yeri} · {şube}" ya da null (Tanımsız İş Yeri). */
  branchLabel: string | null;
  groupCode: string;
  groupName: string;
  badge: GroupBadge;
  category: PlanCategory;
  nextDueDate: string | null;
  planStatus: BadgeInfo;
  approval: BadgeInfo;
  planCount: number;
  planned: CurrencyAmount[];
  entries: FinanceEntry[];
  /** Bakiye kırmızı (gösterilen > 0) olan girdi var mı (Alacaklı Cariler). */
  hasDebtBalance: boolean;
  /** Tüm gösterilen bakiyeler 0 mı (Borçsuzlar). */
  zeroBalance: boolean;
  isCustomer: boolean;
  active: boolean;
};

export type RowContext = {
  today: string;
  mode: TotalsMode;
  branchLabel: (branchId: string) => string | undefined;
  branchName: NameLookup;
  companyName: NameLookup;
};

export function buildRow(account: Account, ctx: RowContext): AccountRow {
  const category = planCategory(account.planSummary, ctx.today);
  const entries = financeEntries(account, ctx.mode, {
    branch: ctx.branchName,
    company: ctx.companyName,
  });
  return {
    account,
    id: account.id,
    code: account.code,
    name: account.name,
    branchLabel: account.branchId ? (ctx.branchLabel(account.branchId) ?? null) : null,
    groupCode: account.subGroup,
    groupName: account.subGroupName || account.subGroup,
    badge: groupBadge(account.subGroup),
    category,
    nextDueDate: account.planSummary?.nextDueDate ?? null,
    planStatus: planStatusBadge(category),
    approval: approvalBadge(account.planSummary),
    planCount: planCount(account.planSummary),
    planned: (account.planSummary?.planned ?? []).filter((p) => p.amount !== 0),
    entries,
    hasDebtBalance: entries.some((e) => e.balance.tone === "debt"),
    zeroBalance: entries.every((e) => e.balance.value === 0),
    isCustomer: account.type === "CUSTOMER",
    active: account.active,
  };
}

/**
 * Satır modelini 50 ms bütçeli parçalarla kurar (MWG break-up-long-tasks; 2.000+ kart). `signal`
 * süzgeç/kip değişince eski hesabı durdurur.
 */
export function buildRowsChunked(
  accounts: readonly Account[],
  ctx: RowContext,
  options: { budgetMs?: number; now?: () => number; signal?: AbortSignal } = {},
): Promise<AccountRow[]> {
  return mapInChunks(accounts, (account) => buildRow(account, ctx), {
    budgetMs: options.budgetMs ?? TASK_BUDGET_MS,
    now: options.now,
    signal: options.signal,
  });
}

// ---------------------------------------------------------------------------------------------
// İstemci süzgeçleri (Planlama Durumu, Borçsuzlar, Müşteriler, Alacaklı Cariler)
// ---------------------------------------------------------------------------------------------

export type QuickFilters = {
  plan: PlanFilter;
  hideZeroDebt: boolean;
  hideCustomers: boolean;
  onlyRedBalance: boolean;
};

export const NO_QUICK_FILTERS: QuickFilters = {
  plan: "",
  hideZeroDebt: false,
  hideCustomers: false,
  onlyRedBalance: false,
};

export function applyQuickFilters(
  rows: readonly AccountRow[],
  filters: QuickFilters,
  today: string,
): AccountRow[] {
  if (
    filters.plan === "" &&
    !filters.hideZeroDebt &&
    !filters.hideCustomers &&
    !filters.onlyRedBalance
  ) {
    return rows.slice();
  }
  return rows.filter(
    (row) =>
      matchesPlanFilter(row.account.planSummary, filters.plan, today) &&
      !(filters.hideZeroDebt && row.zeroBalance) &&
      !(filters.hideCustomers && row.isCustomer) &&
      (!filters.onlyRedBalance || row.hasDebtBalance),
  );
}

// ---------------------------------------------------------------------------------------------
// İstatistik kartları ve sayaçlar
// ---------------------------------------------------------------------------------------------

export type AccountStats = {
  overdue: number;
  today: number;
  noplan: number;
  future: number;
  pending: number;
  approved: number;
  /** "Ödeme Onay Yönetimi" rozetleri: Beklemede (DRAFT), Onay Bekliyor, Onaylandı. */
  draftPlans: number;
  pendingPlans: number;
  approvedPlans: number;
  /** Gecikmiş plan sayısı (zil rozeti). */
  overduePlans: number;
  planned: CurrencyAmount[];
  /** Gösterilen bakiyesi > 0 olanların TL toplamı (işlem günü kuru, OK-17). */
  debtTl: number;
  /** Gösterilen bakiyesi < 0 olanların TL toplamı (mutlak). */
  creditTl: number;
  debtByCurrency: CurrencyAmount[];
  creditByCurrency: CurrencyAmount[];
};

function addTo(map: Map<string, number>, currency: string, amount: number) {
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

function sortedAmounts(map: Map<string, number>): CurrencyAmount[] {
  return [...map.entries()]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => (a === "TRY" ? -1 : b === "TRY" ? 1 : a.localeCompare(b)))
    .map(([currency, amount]) => ({ currency, amount }));
}

export function accountStats(accounts: readonly Account[], today: string): AccountStats {
  const counts = { overdue: 0, today: 0, noplan: 0, future: 0, pending: 0, approved: 0 };
  let draftPlans = 0;
  let pendingPlans = 0;
  let approvedPlans = 0;
  let overduePlans = 0;
  let debtTl = 0;
  let creditTl = 0;
  const planned = new Map<string, number>();
  const debt = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const account of accounts) {
    const summary = account.planSummary;
    counts[planCategory(summary, today)] += 1;
    if ((summary?.pendingCount ?? 0) > 0) counts.pending += 1;
    if ((summary?.approvedCount ?? 0) > 0) counts.approved += 1;
    draftPlans += summary?.draftCount ?? 0;
    pendingPlans += summary?.pendingCount ?? 0;
    approvedPlans += summary?.approvedCount ?? 0;
    overduePlans += summary?.overdueCount ?? 0;
    for (const p of summary?.planned ?? []) addTo(planned, p.currency, p.amount);
    for (const b of account.balances) {
      const shown = listBalanceDisplay(b.balance);
      const tl = -(b.tlBalance ?? 0);
      if (shown.tone === "debt") {
        addTo(debt, b.currency, shown.abs);
        debtTl += tl;
      } else if (shown.tone === "credit") {
        addTo(credit, b.currency, shown.abs);
        creditTl += -tl;
      }
    }
  }
  return {
    ...counts,
    draftPlans,
    pendingPlans,
    approvedPlans,
    overduePlans,
    planned: sortedAmounts(planned),
    debtTl,
    creditTl,
    debtByCurrency: sortedAmounts(debt),
    creditByCurrency: sortedAmounts(credit),
  };
}

/** TL karşılığı toplam planlanan (yalnız TRY tutarları; diğerleri hover kırılımında). */
export function plannedTry(planned: readonly CurrencyAmount[]): number {
  return planned.filter((p) => p.currency === "TRY").reduce((sum, p) => sum + p.amount, 0);
}

// ---------------------------------------------------------------------------------------------
// Hesap grubu süzgeci ve gruba özel işlem
// ---------------------------------------------------------------------------------------------

/** "Hesap Grubu" seçenekleri: tüm gruplar (seçilemeyenler dahil), `sortOrder` sırasıyla. */
export function groupFilterOptions(groups: readonly AccountGroup[]): AccountGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
}

export type GroupAction = { labelKey: "tripCosts" | "driverCard"; href: string; icon: string };

/** Gruba özel işlem (ZTO accountActionUrl karşılığı, §5.7). */
export function groupAction(subGroup: string, canFleet: boolean): GroupAction | null {
  if (subGroup === "TASERON_NAKLIYECI" || subGroup === "SEVK_NAKLIYECI") {
    return { labelKey: "tripCosts", href: "/operations/shipments", icon: "fa-shipping-fast" };
  }
  if (subGroup === "SURUCU" && canFleet) {
    return { labelKey: "driverCard", href: "/fleet/drivers", icon: "fa-id-badge" };
  }
  return null;
}

/** "{iş yeri} · {şube}" (şube = iş yeri grubu; grupsuzda yalnız ad). */
export function branchLabelOf(name: string, groupName: string | null | undefined): string {
  return groupName ? `${name} · ${groupName}` : name;
}
