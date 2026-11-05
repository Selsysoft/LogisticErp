import { describe, expect, it } from "vitest";
import { formatPercent, formatTotals, reportQuery } from "./common";

describe("reportQuery", () => {
  it("boş filtreleri atar", () => {
    expect(reportQuery({ from: "2026-01-01", branchId: "", page: 0, group: null })).toBe(
      "?from=2026-01-01&page=0",
    );
    expect(reportQuery({ branchId: undefined })).toBe("");
  });
});

describe("formatPercent", () => {
  it("hesaplanamayan oranı sıfır göstermez", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent("0.00")).toBe("%0");
    expect(formatPercent("60.71")).toBe("%60,71");
  });
});

describe("formatTotals", () => {
  it("para birimlerini ayrı yazar", () => {
    expect(formatTotals([])).toBe("—");
    expect(
      formatTotals([
        { currency: "TRY", total: "1500.5", count: 1 },
        { currency: "USD", total: "20", count: 2 },
      ]),
    ).toBe("1.500,50 TRY · 20,00 USD");
  });
});
