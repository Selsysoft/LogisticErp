import { describe, expect, it } from "vitest";
import type { CashFlowWeek } from "../../../../pages/finance/types";
import {
  cashFlowParams,
  cashFlowRows,
  cashFlowSearchText,
  formatCashAmount,
  runningTotals,
  signClass,
  weekLabel,
} from "./cashFlowLogic";

function week(index: number, overrides: Partial<CashFlowWeek> = {}): CashFlowWeek {
  return {
    index,
    weekStart: "2026-11-16",
    weekEnd: "2026-11-22",
    receivableDue: "1500.00",
    receivedChecks: "250.40",
    issuedChecks: "2000.00",
    notesInfo: "75.00",
    payableDue: "900.00",
    net: "-249.60",
    cumulative: "-249.60",
    ...overrides,
  };
}

describe("cashFlowLogic", () => {
  it("hafta etiketi dd.MM – dd.MM (ZTO WeekLabel)", () => {
    expect(weekLabel(week(1))).toBe("16.11 – 22.11");
    expect(weekLabel({ weekStart: "2026-12-28", weekEnd: "2027-01-03" })).toBe("28.12 – 03.01");
  });

  it("işaret sınıfı: ≥ 0 cf-pos, < 0 cf-neg", () => {
    expect(signClass("0")).toBe("cf-pos");
    expect(signClass("12.5")).toBe("cf-pos");
    expect(signClass("-0.01")).toBe("cf-neg");
  });

  it("TL karşılığında N0, para birimi kipinde N2 + simge", () => {
    expect(formatCashAmount("1234.56", null)).toBe("1.235");
    expect(formatCashAmount("-249.60", null)).toBe("-250");
    expect(formatCashAmount("1234.56", "USD")).toBe("1.234,56 $");
    expect(formatCashAmount("10", "CHF")).toBe("10,00 CHF");
  });

  it("kümülatif sağlaması: önceki Net'ler + bu hafta", () => {
    expect(runningTotals([{ net: "100" }, { net: "-250.5" }, { net: "50.25" }])).toEqual([
      "100.00",
      "-150.50",
      "-100.25",
    ]);
  });

  it("görüntü satırları sınıfları sunucu Net/Kümülatif'inden alır", () => {
    const rows = cashFlowRows(
      [week(1), week(2, { net: "500", cumulative: "250.40", weekStart: "2026-11-23" })],
      null,
    );
    expect(rows[0]).toMatchObject({
      label: "16.11 – 22.11",
      receivableDue: "1.500",
      netClass: "cf-neg",
      cumulativeClass: "cf-neg",
      notes: "75",
    });
    expect(rows[1]).toMatchObject({ net: "500", netClass: "cf-pos", cumulativeClass: "cf-pos" });
    expect(cashFlowSearchText(rows[0])).toContain("16.11 – 22.11");
  });

  it("parametreler: 8 hafta; para birimi boş = TL karşılığı; şirket yalnız çok şirkette", () => {
    expect(cashFlowParams({ companyId: "", currency: "" }, false)).toEqual({
      weeks: 8,
      currency: undefined,
      companyId: undefined,
    });
    expect(cashFlowParams({ companyId: "", currency: "USD" }, true)).toEqual({
      weeks: 8,
      currency: "USD",
      companyId: null,
    });
    expect(cashFlowParams({ companyId: "c2", currency: "" }, true).companyId).toBe("c2");
  });
});
