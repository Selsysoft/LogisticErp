import { describe, expect, it } from "vitest";
import type { FundActivityReport } from "../../../../pages/finance/types";
import {
  activityCsv,
  activitySummary,
  defaultActivityRange,
  fifoRows,
  remainingState,
  usedPercent,
  validateActivity,
} from "./activityLogic";

/** §6.2 örneği: açılış 100, +50, −120, +30, −40. */
const REPORT = {
  from: "2026-10-01",
  to: "2026-10-31",
  opening: 100,
  totalIn: 80,
  totalOut: 160,
  net: 20,
  unmatchedOut: 0,
  inflows: [
    {
      no: 1,
      id: null,
      date: "2026-10-01",
      accountingType: "OPENING",
      description: null,
      amount: 100,
      remaining: 0,
      outflows: [
        { id: "o1", date: "2026-10-05", accountingType: "EXPENSE", description: null, amount: 100 },
      ],
    },
    {
      no: 2,
      id: "i1",
      date: "2026-10-02",
      accountingType: "ACCOUNT_COLLECTION",
      description: "x",
      amount: 50,
      remaining: 0,
      outflows: [
        { id: "o1", date: "2026-10-05", accountingType: "EXPENSE", description: null, amount: 20 },
        { id: "o2", date: "2026-10-09", accountingType: "EXPENSE", description: null, amount: 30 },
      ],
    },
    {
      no: 3,
      id: "i2",
      date: "2026-10-07",
      accountingType: "INCOME",
      description: null,
      amount: 30,
      remaining: 20,
      outflows: [
        { id: "o2", date: "2026-10-09", accountingType: "EXPENSE", description: null, amount: 10 },
      ],
    },
  ],
  unspent: [
    {
      no: 3,
      date: "2026-10-07",
      accountingType: "INCOME",
      description: null,
      original: 30,
      remaining: 20,
      used: 10,
    },
  ],
} as unknown as FundActivityReport;

describe("activityLogic (FIFO raporu)", () => {
  it("giriş satırı + altında eşleşen çıkışlar, kalan çıkış sonrası", () => {
    const rows = fifoRows(REPORT.inflows);
    expect(rows.map((r) => r.kind)).toEqual([
      "inflow",
      "outflow",
      "inflow",
      "outflow",
      "outflow",
      "inflow",
      "outflow",
    ]);
    expect(rows[3]).toMatchObject({ kind: "outflow", amount: 20, remainingAfter: 30 });
    expect(rows[4]).toMatchObject({ kind: "outflow", amount: 30, remainingAfter: 0 });
    expect(rows[0]).toMatchObject({ kind: "inflow", id: null, no: 1 });
  });

  it("özet: dönem başı devri giriş sayılmaz, çıkışlar tekil", () => {
    expect(activitySummary(REPORT)).toEqual({
      incomeCount: 2,
      expenseCount: 2,
      totalRemaining: 20,
      totalOriginal: 30,
      remainingCount: 1,
    });
  });

  it("kalan durumu ve kullanım yüzdesi", () => {
    expect(remainingState(5)).toBe("open");
    expect(remainingState(0)).toBe("done");
    expect(remainingState(-1)).toBe("negative");
    expect(usedPercent({ original: 30, used: 10 })).toBeCloseTo(33.33, 1);
    expect(usedPercent({ original: 0, used: 10 })).toBe(0);
    expect(usedPercent({ original: 10, used: 20 })).toBe(100);
  });

  it("modal varsayılanı ve doğrulama", () => {
    expect(defaultActivityRange("2026-03-31")).toEqual({ from: "2026-02-28", to: "2026-03-31" });
    expect(validateActivity("", "a", "b")).toBe("fundRequired");
    expect(validateActivity("f", "", "b")).toBe("rangeRequired");
    expect(validateActivity("f", "2026-02-01", "2026-01-01")).toBe("rangeInvalid");
    expect(validateActivity("f", "2026-01-01", "2026-02-01")).toBeNull();
  });

  it("CSV: tırnaklı, ';' ayraçlı, bloklar arası boş satır, formül öneki", () => {
    const csv = activityCsv([
      {
        headers: ["NO", "AÇIKLAMA"],
        rows: [
          ["#1", '=cmd"x'],
          ["", "-12,00"],
        ],
      },
      { headers: ["A"], rows: [] },
    ]);
    expect(csv).toBe(
      String.fromCharCode(0xfeff) + '"NO";"AÇIKLAMA"\n"#1";"\'=cmd""x"\n"";"-12,00"\n\n"A"\n\n',
    );
  });
});
