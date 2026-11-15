import type { BalanceBreakdownRow, Plan } from "../../../../pages/finance/types";
import { fromScaled, tryScaled } from "../../../decimal";

/*
 * Kalan borç (`#remainingDebtInfo`, ZTO pjs:4148-5640) ve kalan alacak (`#remainingCreditInfo`,
 * cjs:1750-2070) panellerinin saf mantığı (12.2a_TASARIM §5.9). ZTO'nun `GetCustomerDebtSummary`
 * özeti Blackrose'ta `GET /accounts/{id}/balances?groupBy=COMPANY|BRANCH` + açık planlardan türetilir
 * (S-14); kalan borç/alacak şirket başına `max(0, ·)` ve para birimi bazında (ZTO B1 düzeltilir).
 */

type Row = Pick<
  BalanceBreakdownRow,
  | "currency"
  | "companyId"
  | "branchId"
  | "debit"
  | "credit"
  | "debt"
  | "payment"
  | "receivable"
  | "collection"
> & { segment?: BalanceBreakdownRow["segment"] };

function scaled(value: number | string | null | undefined): bigint {
  return tryScaled(value ?? 0) ?? 0n;
}

function positive(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

function allSegment(rows: readonly Row[] | null | undefined): Row[] {
  return (rows ?? []).filter((row) => !row.segment || row.segment === "ALL");
}

/** Satırlardaki para birimleri (ilk görülme sırası). */
export function currenciesOf(rows: readonly Row[] | null | undefined): string[] {
  return [...new Set(allSegment(rows).map((row) => row.currency))];
}

// ---------------------------------------------------------------------------------------------
// Kalan alacak paneli (4 kart + mahsuplaşma)
// ---------------------------------------------------------------------------------------------

export type CreditSummary = {
  totalReceivable: string;
  totalCollection: string;
  totalDebt: string;
  totalPayment: string;
  /** Tahsilat / alacak oranı (0–100), ilerleme çubuğu. */
  collectionRate: number;
  paymentRate: number;
  /** Şirket başına `max(0, debit − credit)` toplamı. */
  toCollect: string;
  /** Şirket başına `max(0, credit − debit)` toplamı. */
  toPay: string;
  /** toCollect − toPay (> 0 Borçlu, < 0 Alacaklı, 0 Mahsuplaştı). */
  net: string;
  netSign: -1 | 0 | 1;
};

function rate(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Math.min(100, Number((part * 10000n) / whole) / 100);
}

/** Seçilen para biriminin özet kartları (şirket satırları; `companyId` null → hepsi). */
export function creditSummary(
  rows: readonly Row[] | null | undefined,
  currency: string,
  companyId: string | null,
): CreditSummary {
  const list = allSegment(rows).filter(
    (row) => row.currency === currency && (companyId === null || row.companyId === companyId),
  );
  let receivable = 0n;
  let collection = 0n;
  let debt = 0n;
  let payment = 0n;
  let toCollect = 0n;
  let toPay = 0n;
  for (const row of list) {
    receivable += scaled(row.receivable);
    collection += scaled(row.collection);
    debt += scaled(row.debt);
    payment += scaled(row.payment);
    const net = scaled(row.debit) - scaled(row.credit);
    toCollect += positive(net);
    toPay += positive(-net);
  }
  const net = toCollect - toPay;
  return {
    totalReceivable: fromScaled(receivable),
    totalCollection: fromScaled(collection),
    totalDebt: fromScaled(debt),
    totalPayment: fromScaled(payment),
    collectionRate: rate(collection, receivable),
    paymentRate: rate(payment, debt),
    toCollect: fromScaled(toCollect),
    toPay: fromScaled(toPay),
    net: fromScaled(net < 0n ? -net : net),
    netSign: net > 0n ? 1 : net < 0n ? -1 : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Kalan borç paneli
// ---------------------------------------------------------------------------------------------

export type BranchBalance = {
  branchId: string;
  debt: string;
  payment: string;
  receivable: string;
  collection: string;
  /** |credit − debit|. */
  net: string;
  /** credit − debit > 0 → cari alacaklı (bizim borcumuz; kırmızı). */
  sign: -1 | 0 | 1;
};

/** İş yeri bazlı bakiyeler (accordion 1), seçilen para biriminde. */
export function branchBalances(
  rows: readonly Row[] | null | undefined,
  currency: string,
): BranchBalance[] {
  const map = new Map<string, Row[]>();
  for (const row of allSegment(rows)) {
    if (row.currency !== currency || !row.branchId) continue;
    map.set(row.branchId, [...(map.get(row.branchId) ?? []), row]);
  }
  return [...map].map(([branchId, list]) => {
    const sum = (pick: (row: Row) => number) => list.reduce((s, row) => s + scaled(pick(row)), 0n);
    const net = sum((row) => row.credit) - sum((row) => row.debit);
    return {
      branchId,
      debt: fromScaled(sum((row) => row.debt)),
      payment: fromScaled(sum((row) => row.payment)),
      receivable: fromScaled(sum((row) => row.receivable)),
      collection: fromScaled(sum((row) => row.collection)),
      net: fromScaled(net < 0n ? -net : net),
      sign: net > 0n ? 1 : net < 0n ? -1 : 0,
    };
  });
}

/** Takvim günü farkı (b − a); ISO "yyyy-MM-dd". */
export function daysBetween(a: string, b: string): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export type PlanSummary = {
  /** Gösterilen plan: en yakın vadeli açık plan. */
  plan: Plan | null;
  hasPlan: boolean;
  /** Vadesi geçmiş APPROVED/PENDING plan. */
  isOverdue: boolean;
  /** Bugün vadeli açık plan. */
  isToday: boolean;
  hasApprovalPending: boolean;
  isApproved: boolean;
  isRejected: boolean;
  /** Gösterilen planın vadesine kalan gün (geçmişte eksi). */
  daysRemaining: number;
  /** Onay bekleyen planların toplamı (gösterilen planın para biriminde). */
  pendingAmount: string;
};

const ACTIVE: readonly Plan["status"][] = ["DRAFT", "PENDING", "APPROVED", "REJECTED"];

export function planSummary(plans: readonly Plan[] | null | undefined, today: string): PlanSummary {
  const open = (plans ?? [])
    .filter((plan) => ACTIVE.includes(plan.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = open.filter(
    (plan) => plan.dueDate < today && (plan.status === "APPROVED" || plan.status === "PENDING"),
  );
  const dueToday = open.filter((plan) => plan.dueDate === today);
  const plan =
    overdue[0] ?? dueToday[0] ?? open.find((item) => item.dueDate >= today) ?? open[0] ?? null;
  const pending = open.filter((item) => item.status === "PENDING");
  const currency = plan?.money.currency ?? null;
  return {
    plan,
    hasPlan: open.length > 0,
    isOverdue: overdue.length > 0,
    isToday: dueToday.length > 0,
    hasApprovalPending: pending.length > 0,
    isApproved: open.some((item) => item.status === "APPROVED"),
    isRejected: plan?.status === "REJECTED",
    daysRemaining: plan ? daysBetween(today, plan.dueDate) : 0,
    pendingAmount: fromScaled(
      pending
        .filter((item) => item.money.currency === currency)
        .reduce((sum, item) => sum + scaled(item.money.amount), 0n),
    ),
  };
}

/** Kart sol kenar rengi (gecikmiş kırmızı, bugün/onay bekleyen turuncu, varsayılan mavi). */
export function cardColor(summary: PlanSummary): string {
  if (summary.isOverdue) return "#ef4444";
  if (summary.isToday || summary.hasApprovalPending) return "#f59e0b";
  return "#3b82f6";
}

export type InfoNoteKind =
  "noDebt" | "approved" | "pending" | "overdue" | "today" | "planned" | "noPlan";

/** Bilgilendirme notu (ZTO `buildInfoNote`; "Ödeme talimatı verilmiştir…" 12.4). */
export function infoNoteKind(summary: PlanSummary, hasDebt: boolean): InfoNoteKind {
  if (!hasDebt) return "noDebt";
  if (summary.isApproved) return "approved";
  if (summary.hasApprovalPending) return "pending";
  if (summary.isOverdue) return "overdue";
  if (summary.isToday) return "today";
  if (summary.hasPlan) return "planned";
  return "noPlan";
}

/** Notun renkleri (ZTO `buildInfoNote`). */
export const INFO_NOTE_STYLE: Record<
  InfoNoteKind,
  { icon: string; color: string; bg: string; border: string }
> = {
  noDebt: { icon: "fa-check-circle", color: "#10b981", bg: "#f0fdf4", border: "#86efac" },
  approved: { icon: "fa-info-circle", color: "#10b981", bg: "#f0fdf4", border: "#86efac" },
  pending: { icon: "fa-hourglass-half", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
  overdue: { icon: "fa-exclamation-triangle", color: "#ef4444", bg: "#fef2f2", border: "#fca5a5" },
  today: { icon: "fa-bell", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
  planned: { icon: "fa-info-circle", color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd" },
  noPlan: { icon: "fa-lightbulb", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d" },
};

// ---------------------------------------------------------------------------------------------
// Rozetler ve akordeon renkleri (ZTO getPlanningStatusBadge / getApprovalStatusBadge,
// buildDetailedDebtInfoHtml; "Talimat Verildi" adımı 12.4)
// ---------------------------------------------------------------------------------------------

export type Badge = { className: string; icon: string; key: string };

/** Planlama rozeti: gecikmiş > bugün > plan var > plan yok. */
export function planningBadge(summary: PlanSummary): Badge {
  if (summary.isOverdue) {
    return { className: "badge-danger", icon: "fa-exclamation-triangle", key: "badgeOverdue" };
  }
  if (summary.isToday)
    return { className: "badge-warning", icon: "fa-calendar-day", key: "badgeToday" };
  if (summary.hasPlan) {
    return { className: "badge-info", icon: "fa-calendar-check", key: "badgePlanned" };
  }
  return { className: "badge-secondary", icon: "fa-calendar-times", key: "badgeNoPlan" };
}

export type ApprovalState = "WAITING" | "PLANNED" | "PENDING" | "APPROVED" | "REJECTED";

/** Gösterilen planın onay durumu (plan yoksa "Beklemede"). */
export function approvalState(summary: PlanSummary): ApprovalState {
  switch (summary.plan?.status) {
    case "DRAFT":
      return "PLANNED";
    case "PENDING":
      return "PENDING";
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    default:
      return "WAITING";
  }
}

const APPROVAL_BADGES: Record<ApprovalState, Badge> = {
  WAITING: { className: "badge-secondary", icon: "fa-clock", key: "approvalWaiting" },
  PLANNED: { className: "badge-info", icon: "fa-calendar-plus", key: "badgePlanned" },
  PENDING: { className: "badge-warning", icon: "fa-hourglass-half", key: "approvalPending" },
  APPROVED: { className: "badge-success", icon: "fa-check-circle", key: "approvalApproved" },
  REJECTED: { className: "badge-danger", icon: "fa-times-circle", key: "approvalRejected" },
};

export function approvalBadge(state: ApprovalState): Badge {
  return APPROVAL_BADGES[state];
}

const GRADIENT = {
  blue: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  red: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
  orange: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  green: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  gray: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
};

/** 1. akordeon (İş Yeri Bazlı) her zaman mavi. */
export const WORKPLACE_GRADIENT = GRADIENT.blue;

/** 2. akordeon (Ödeme Planlaması) arka planı. */
export function planningGradient(summary: PlanSummary): string {
  if (!summary.hasPlan) return GRADIENT.gray;
  if (summary.isOverdue) return GRADIENT.red;
  if (summary.isToday) return GRADIENT.orange;
  return GRADIENT.green;
}

/** 3. akordeon (Onay Süreci Takibi) arka planı. */
export function approvalGradient(summary: PlanSummary): string {
  if (summary.isApproved) return GRADIENT.green;
  if (summary.hasApprovalPending) return GRADIENT.orange;
  return GRADIENT.gray;
}

export type TimelineStep = {
  key: "stepPlanned" | "stepSent" | "stepApproved" | "stepRejected" | "stepOrdered";
  icon: string;
  color: string;
  completed: boolean;
  active: boolean;
};

/** Onay süreci zaman çizelgesi (ZTO buildApprovalProcessContent; talimat adımı 12.4'te dolar). */
export function timelineSteps(summary: PlanSummary): TimelineStep[] {
  const state = approvalState(summary);
  const rejected = state === "REJECTED";
  const decided = state === "APPROVED" || rejected;
  return [
    {
      key: "stepPlanned",
      icon: "fa-calendar-plus",
      color: "#3b82f6",
      completed: summary.hasPlan,
      active: state === "PLANNED",
    },
    {
      key: "stepSent",
      icon: "fa-paper-plane",
      color: "#f59e0b",
      completed: state === "PENDING" || decided,
      active: state === "PENDING",
    },
    {
      key: rejected ? "stepRejected" : "stepApproved",
      icon: rejected ? "fa-times-circle" : "fa-check-circle",
      color: rejected ? "#ef4444" : "#10b981",
      completed: decided,
      active: decided,
    },
    {
      key: "stepOrdered",
      icon: "fa-file-invoice-dollar",
      color: "#8b5cf6",
      completed: false,
      active: false,
    },
  ];
}

/** Plan tarihi satırının durumu (ZTO buildPlanningSectionContent). */
export function dateStatus(summary: PlanSummary): {
  className: string;
  icon: string;
  bg: string;
  border: string;
} {
  if (summary.isOverdue) {
    return {
      className: "text-danger",
      icon: "fa-exclamation-triangle",
      bg: "#fef2f2",
      border: "#ef4444",
    };
  }
  if (summary.isToday) {
    return { className: "text-warning", icon: "fa-bell", bg: "#fffbeb", border: "#f59e0b" };
  }
  return { className: "text-info", icon: "fa-clock", bg: "#f0f9ff", border: "#3b82f6" };
}

/** İş yeri bakiye kartının renkleri (ZTO buildWorkPlaceBalancesHtml; borçlu kırmızı, alacaklı yeşil). */
export function balanceCardStyle(sign: -1 | 0 | 1): {
  border: string;
  bg: string;
  color: string;
  badge: string;
} {
  if (sign > 0)
    return { border: "#fecaca", bg: "#fef2f2", color: "#dc2626", badge: "badge-danger" };
  if (sign < 0)
    return { border: "#bbf7d0", bg: "#f0fdf4", color: "#10b981", badge: "badge-success" };
  return { border: "#e2e8f0", bg: "#ffffff", color: "#10b981", badge: "badge-success" };
}
