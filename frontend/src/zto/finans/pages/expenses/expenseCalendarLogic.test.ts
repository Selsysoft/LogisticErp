import { describe, expect, it } from "vitest";
import type { ExpenseCalendarEntry } from "../../../../pages/finance/types";
import {
  buildMonthGrid,
  dayAriaLabel,
  entriesByDay,
  fillMonths,
  groupDayEntries,
  lastMonthKeys,
  longDate,
  monthKeyLabel,
  monthTitle,
  weekdayIndex,
  yearOptions,
} from "./expenseCalendarLogic";

function entry(overrides: Partial<ExpenseCalendarEntry> = {}): ExpenseCalendarEntry {
  return {
    id: "e1",
    expenseItemId: "i1",
    expenseItemName: "Kira",
    expenseTypeName: "Genel",
    invoiceNumber: "F-1",
    contextType: "GENERAL",
    contextLabel: null,
    supplierName: null,
    department: "ADMIN",
    invoiceDate: "2026-11-16",
    currency: "TRY",
    totalAmount: "100",
    ...overrides,
  };
}

describe("takvim ızgarası (Pazartesi başlangıcı)", () => {
  it("Kasım 2026: 1'i Pazar → 6 boş hücre, 30 gün", () => {
    const grid = buildMonthGrid(2026, 11);
    expect(grid.filter((c) => c.kind === "blank")).toHaveLength(6);
    const days = grid.filter((c) => c.kind === "day");
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ iso: "2026-11-01", day: 1, weekend: true });
    expect(days[1]).toMatchObject({ iso: "2026-11-02", weekend: false });
    expect(grid).toHaveLength(36);
  });

  it("Şubat 2028 artık yıl: 1'i Salı → 1 boş hücre, 29 gün", () => {
    const grid = buildMonthGrid(2028, 2);
    expect(grid.filter((c) => c.kind === "blank")).toHaveLength(1);
    const days = grid.filter((c) => c.kind === "day");
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toMatchObject({ iso: "2028-02-29" });
  });

  it("Şubat 2027: 28 gün; Pazartesi başlayan ay boşluksuz", () => {
    expect(buildMonthGrid(2027, 2).filter((c) => c.kind === "day")).toHaveLength(28);
    // 1 Haziran 2026 Pazartesi.
    expect(weekdayIndex(2026, 6, 1)).toBe(0);
    expect(buildMonthGrid(2026, 6)[0]).toMatchObject({ kind: "day", iso: "2026-06-01" });
  });
});

describe("etiketler", () => {
  it("Türkçe ay ve tarih", () => {
    expect(monthTitle(2026, 11)).toBe("Kasım 2026");
    expect(longDate("2026-02-05")).toBe("5 Şubat 2026");
    expect(longDate("yok")).toBe("");
    expect(dayAriaLabel("2026-11-16", 2)).toBe("16 Kasım 2026, 2 kayıt");
    expect(monthKeyLabel("2026-01")).toBe("Ocak 2026");
    expect(yearOptions(2026)).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031,
    ]);
  });
});

describe("grafik", () => {
  it("son 6 ay yıl sınırını geçer", () => {
    expect(lastMonthKeys("2027-02-10", 6)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("fillMonths eksik ayları 0 ile doldurur, dışarıdakileri atar", () => {
    const months = ["2026-09", "2026-10", "2026-11"];
    const result = fillMonths(
      [
        { month: "2026-11", expenseTypeId: "t1", expenseTypeName: "Genel", tlAmount: "150.50" },
        { month: "2026-09", expenseTypeId: "t1", expenseTypeName: "Genel", tlAmount: "10" },
        { month: "2026-10", expenseTypeId: "t2", expenseTypeName: "Araç", tlAmount: "20" },
        { month: "2026-05", expenseTypeId: "t3", expenseTypeName: "Eski", tlAmount: "99" },
      ],
      months,
    );
    expect(result.labels).toEqual(["Eylül 2026", "Ekim 2026", "Kasım 2026"]);
    expect(result.series).toEqual([
      { label: "Genel", data: [10, 0, 150.5] },
      { label: "Araç", data: [0, 20, 0] },
    ]);
  });
});

describe("gün kayıtları", () => {
  it("boş günler atlanır; kalem kartları ve para birimi toplamları", () => {
    const map = entriesByDay({
      year: 2026,
      month: 11,
      days: [
        { date: "2026-11-15", expenses: [] },
        {
          date: "2026-11-16",
          expenses: [
            entry(),
            entry({ id: "e2", currency: "USD", totalAmount: "5" }),
            entry({ id: "e3", expenseItemId: "i2", expenseItemName: "Yakıt", totalAmount: "50" }),
            entry({ id: "e4", totalAmount: "0.5" }),
          ],
        },
      ],
      allTime: [],
    });
    expect([...map.keys()]).toEqual(["2026-11-16"]);
    const groups = groupDayEntries(map.get("2026-11-16") ?? []);
    expect(groups.map((g) => [g.expenseItemName, g.entries.length])).toEqual([
      ["Kira", 3],
      ["Yakıt", 1],
    ]);
    expect(groups[0].totals).toEqual([
      { currency: "TRY", count: 2, totalAmount: "100.50" },
      { currency: "USD", count: 1, totalAmount: "5.00" },
    ]);
    expect(entriesByDay(undefined).size).toBe(0);
  });
});
