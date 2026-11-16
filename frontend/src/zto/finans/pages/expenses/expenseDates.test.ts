import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  compareIsoDate,
  daysInMonth,
  formatIsoDate,
  isIsoDate,
  isoOf,
  isoParts,
  localToday,
  monthKey,
  monthRange,
  shiftMonth,
} from "./expenseDates";

describe("expenseDates (saat dilimsiz takvim tarihi)", () => {
  it("localToday yerel parçalardan; UTC'ye dönüştürmez", () => {
    // Yerel 1 Ocak 00:30 — UTC'nin doğusunda toISOString önceki günü verirdi.
    expect(localToday(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("geçerlilik, parçalar ve dd.MM.yyyy biçimi", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-01")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isoParts("2026-11-16")).toEqual({ year: 2026, month: 11, day: 16 });
    expect(isoParts("x")).toBeNull();
    expect(formatIsoDate("2026-11-06")).toBe("06.11.2026");
    expect(formatIsoDate(undefined)).toBe("");
    expect(isoOf(26, 1, 2)).toBe("0026-01-02");
  });

  it("karşılaştırma, gün ekleme ve ay yardımcıları", () => {
    expect(compareIsoDate("2026-11-15", "2026-11-16")).toBe(-1);
    expect(compareIsoDate("2026-11-16", "2026-11-16")).toBe(0);
    expect(compareIsoDate("2027-01-01", "2026-12-31")).toBe(1);
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2028-03-01", -1)).toBe("2028-02-29");
    expect(() => addDaysIso("2026-02-30", 1)).toThrow(RangeError);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(monthKey(2026, 3)).toBe("2026-03");
    expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 11, -23)).toEqual({ year: 2024, month: 12 });
  });
});
