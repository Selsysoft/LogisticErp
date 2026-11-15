import { describe, expect, it } from "vitest";
import type { BalanceBreakdownRow, Plan } from "../../../../pages/finance/types";
import {
  INFO_NOTE_STYLE,
  WORKPLACE_GRADIENT,
  approvalBadge,
  approvalGradient,
  approvalState,
  balanceCardStyle,
  branchBalances,
  cardColor,
  creditSummary,
  currenciesOf,
  dateStatus,
  daysBetween,
  infoNoteKind,
  planSummary,
  planningBadge,
  planningGradient,
  timelineSteps,
} from "./panelLogic";

function row(patch: Partial<BalanceBreakdownRow>): BalanceBreakdownRow {
  return {
    segment: "ALL",
    currency: "TRY",
    companyId: "c1",
    branchId: null,
    debit: 0,
    credit: 0,
    balance: 0,
    tlBalance: 0,
    debt: 0,
    payment: 0,
    receivable: 0,
    collection: 0,
    ...patch,
  };
}

function plan(patch: Partial<Plan>): Plan {
  return {
    id: "p",
    accountId: "a1",
    branchId: "b1",
    companyId: "c1",
    money: { amount: "100.0000", currency: "TRY" },
    dueDate: "2026-11-20",
    status: "DRAFT",
    purchaseInvoiceId: null,
    description: null,
    rejectNote: null,
    ...patch,
  };
}

const TODAY = "2026-11-15";

describe("panelLogic — alacak paneli", () => {
  it("para birimleri yalnız ALL segmentinden, ilk görülme sırasıyla", () => {
    expect(
      currenciesOf([
        row({ currency: "USD" }),
        row({ currency: "TRY" }),
        row({ currency: "EUR", segment: "BEFORE" }),
      ]),
    ).toEqual(["USD", "TRY"]);
    expect(currenciesOf(null)).toEqual([]);
  });

  it("4 kart + mahsuplaşma: şirket başına alacak/borç, oranlar, net yön", () => {
    const rows = [
      row({
        companyId: "c1",
        debit: 500,
        credit: 200,
        receivable: 500,
        collection: 200,
        debt: 0,
        payment: 0,
      }),
      row({ companyId: "c2", debit: 0, credit: 80, debt: 100, payment: 20 }),
      row({ companyId: "c1", currency: "USD", debit: 9 }),
    ];
    const all = creditSummary(rows, "TRY", null);
    expect(all).toMatchObject({
      totalReceivable: "500.00",
      totalCollection: "200.00",
      totalDebt: "100.00",
      totalPayment: "20.00",
      collectionRate: 40,
      paymentRate: 20,
      toCollect: "300.00",
      toPay: "80.00",
      net: "220.00",
      netSign: 1,
    });
    expect(creditSummary(rows, "TRY", "c2")).toMatchObject({
      net: "80.00",
      netSign: -1,
      collectionRate: 0,
    });
    expect(creditSummary([], "TRY", null)).toMatchObject({ net: "0.00", netSign: 0 });
  });
});

describe("panelLogic — kalan borç paneli", () => {
  it("iş yeri bakiyeleri: seçilen para birimi, |credit − debit|, işaret", () => {
    const rows = [
      row({ branchId: "b1", debit: 100, credit: 300, debt: 300, payment: 100 }),
      row({ branchId: "b1", debit: 50, credit: 0 }),
      row({ branchId: "b2", debit: 70, credit: 20 }),
      row({ branchId: "b3", debit: 10, credit: 10 }),
      row({ branchId: null, debit: 1 }),
      row({ branchId: "b4", currency: "USD", debit: 5 }),
    ];
    expect(branchBalances(rows, "TRY")).toEqual([
      {
        branchId: "b1",
        debt: "300.00",
        payment: "100.00",
        receivable: "0.00",
        collection: "0.00",
        net: "150.00",
        sign: 1,
      },
      {
        branchId: "b2",
        debt: "0.00",
        payment: "0.00",
        receivable: "0.00",
        collection: "0.00",
        net: "50.00",
        sign: -1,
      },
      {
        branchId: "b3",
        debt: "0.00",
        payment: "0.00",
        receivable: "0.00",
        collection: "0.00",
        net: "0.00",
        sign: 0,
      },
    ]);
  });

  it("gün farkı takvim günüyle", () => {
    expect(daysBetween("2026-11-15", "2026-11-20")).toBe(5);
    expect(daysBetween("2026-11-15", "2026-11-10")).toBe(-5);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("plan özeti: gecikmiş > bugün > gelecek; onay bekleyen toplamı", () => {
    const empty = planSummary([], TODAY);
    expect(empty).toMatchObject({
      plan: null,
      hasPlan: false,
      isOverdue: false,
      daysRemaining: 0,
      pendingAmount: "0.00",
    });
    const overdue = planSummary(
      [
        plan({ id: "a", dueDate: "2026-11-10", status: "APPROVED" }),
        plan({ id: "b", dueDate: "2026-11-15" }),
      ],
      TODAY,
    );
    expect(overdue).toMatchObject({
      isOverdue: true,
      isToday: true,
      isApproved: true,
      daysRemaining: -5,
    });
    expect(overdue.plan?.id).toBe("a");
    const pending = planSummary(
      [
        plan({ id: "p1", status: "PENDING", dueDate: "2026-11-25" }),
        plan({
          id: "p2",
          status: "PENDING",
          money: { amount: "50", currency: "TRY" },
          dueDate: "2026-11-30",
        }),
        plan({
          id: "p3",
          status: "PENDING",
          money: { amount: "7", currency: "USD" },
          dueDate: "2026-12-30",
        }),
        plan({ id: "x", status: "PAID", dueDate: "2026-11-16" }),
      ],
      TODAY,
    );
    expect(pending).toMatchObject({
      hasApprovalPending: true,
      pendingAmount: "150.00",
      daysRemaining: 10,
    });
    expect(pending.plan?.id).toBe("p1");
    const past = planSummary([plan({ dueDate: "2026-11-01", status: "DRAFT" })], TODAY);
    expect(past.plan?.status).toBe("DRAFT");
    expect(past.isOverdue).toBe(false);
    expect(planSummary([plan({ status: "REJECTED" })], TODAY).isRejected).toBe(true);
  });

  it("kart rengi, bilgi notu türü ve stilleri", () => {
    const base = planSummary([], TODAY);
    expect(cardColor(base)).toBe("#3b82f6");
    expect(cardColor({ ...base, isOverdue: true })).toBe("#ef4444");
    expect(cardColor({ ...base, isToday: true })).toBe("#f59e0b");
    expect(cardColor({ ...base, hasApprovalPending: true })).toBe("#f59e0b");
    expect(infoNoteKind(base, false)).toBe("noDebt");
    expect(infoNoteKind({ ...base, isApproved: true }, true)).toBe("approved");
    expect(infoNoteKind({ ...base, hasApprovalPending: true }, true)).toBe("pending");
    expect(infoNoteKind({ ...base, isOverdue: true }, true)).toBe("overdue");
    expect(infoNoteKind({ ...base, isToday: true }, true)).toBe("today");
    expect(infoNoteKind({ ...base, hasPlan: true }, true)).toBe("planned");
    expect(infoNoteKind(base, true)).toBe("noPlan");
    expect(INFO_NOTE_STYLE.overdue.icon).toBe("fa-exclamation-triangle");
  });

  it("rozetler ve akordeon renkleri (ZTO getPlanningStatusBadge / getApprovalStatusBadge)", () => {
    const base = planSummary([], TODAY);
    expect(planningBadge(base).key).toBe("badgeNoPlan");
    expect(planningBadge({ ...base, hasPlan: true }).className).toBe("badge-info");
    expect(planningBadge({ ...base, isToday: true }).key).toBe("badgeToday");
    expect(planningBadge({ ...base, isOverdue: true }).className).toBe("badge-danger");
    expect(approvalState(base)).toBe("WAITING");
    for (const [status, state] of [
      ["DRAFT", "PLANNED"],
      ["PENDING", "PENDING"],
      ["APPROVED", "APPROVED"],
      ["REJECTED", "REJECTED"],
    ] as const) {
      expect(approvalState(planSummary([plan({ status })], TODAY))).toBe(state);
    }
    expect(approvalBadge("PENDING")).toEqual({
      className: "badge-warning",
      icon: "fa-hourglass-half",
      key: "approvalPending",
    });
    expect(WORKPLACE_GRADIENT).toContain("#3b82f6");
    expect(planningGradient(base)).toContain("#6b7280");
    expect(planningGradient({ ...base, hasPlan: true, isOverdue: true })).toContain("#ef4444");
    expect(planningGradient({ ...base, hasPlan: true, isToday: true })).toContain("#f59e0b");
    expect(planningGradient({ ...base, hasPlan: true })).toContain("#10b981");
    expect(approvalGradient({ ...base, isApproved: true })).toContain("#10b981");
    expect(approvalGradient({ ...base, hasApprovalPending: true })).toContain("#f59e0b");
    expect(approvalGradient(base)).toContain("#6b7280");
  });

  it("onay zaman çizelgesi ve tarih durumu", () => {
    const rejected = timelineSteps(planSummary([plan({ status: "REJECTED" })], TODAY));
    expect(rejected.map((step) => [step.key, step.completed, step.active])).toEqual([
      ["stepPlanned", true, false],
      ["stepSent", true, false],
      ["stepRejected", true, true],
      ["stepOrdered", false, false],
    ]);
    const draft = timelineSteps(planSummary([plan({ status: "DRAFT" })], TODAY));
    expect(draft[0].active).toBe(true);
    expect(draft[1].completed).toBe(false);
    const pending = timelineSteps(planSummary([plan({ status: "PENDING" })], TODAY));
    expect(pending[1]).toMatchObject({ completed: true, active: true });
    expect(pending[2].key).toBe("stepApproved");
    const base = planSummary([], TODAY);
    expect(dateStatus({ ...base, isOverdue: true }).className).toBe("text-danger");
    expect(dateStatus({ ...base, isToday: true }).icon).toBe("fa-bell");
    expect(dateStatus(base).className).toBe("text-info");
    expect(balanceCardStyle(1).badge).toBe("badge-danger");
    expect(balanceCardStyle(-1).badge).toBe("badge-success");
    expect(balanceCardStyle(0).border).toBe("#e2e8f0");
  });
});
