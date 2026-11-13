import { describe, expect, it } from "vitest";
import {
  buildShowcaseTransactions,
  countByDescription,
  monthlyTotals,
  SHOWCASE_BRANCH_TREE,
  SHOWCASE_SELECT_OPTIONS,
  showcaseWorkPlaceNames,
} from "./showcaseData";

describe("vitrin sahte verisi", () => {
  it("57 satır, belirlenimci, bakiye borç − alacak birikimi", () => {
    const rows = buildShowcaseTransactions();
    expect(rows).toHaveLength(57);
    expect(buildShowcaseTransactions()).toEqual(rows);
    expect(rows[0].date).toBe("2026-09-01");
    expect(rows[2].date).toBe("2026-09-05");
    expect(rows[56].documentNo).toBe("BLG-2026057");
    let balance = 0;
    for (const row of rows) {
      expect(row.debit === 0 || row.credit === 0).toBe(true);
      expect(row.debit + row.credit).toBeGreaterThanOrEqual(500);
      balance = Math.round((balance + row.debit - row.credit) * 100) / 100;
      expect(row.balance).toBe(balance);
    }
    expect(rows.some((r) => r.debit > 0) && rows.some((r) => r.credit > 0)).toBe(true);
    expect(buildShowcaseTransactions(3, "2026-12-31").map((r) => r.date)).toEqual([
      "2026-12-31",
      "2027-01-02",
      "2027-01-04",
    ]);
  });

  it("aylık toplamlar ve açıklama sayıları", () => {
    const rows = buildShowcaseTransactions();
    const monthly = monthlyTotals(rows);
    expect(monthly.labels).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum(monthly.debit)).toBe(sum(rows.map((r) => r.debit)));
    expect(sum(monthly.credit)).toBe(sum(rows.map((r) => r.credit)));
    const kinds = countByDescription(rows);
    expect(kinds.labels).toHaveLength(8);
    expect(sum(kinds.values)).toBe(57);
  });

  it("örnek ağaç iki şirketli, select seçenekleri gruplu, iş yeri adlarında boş var", () => {
    expect(SHOWCASE_BRANCH_TREE.map((c) => c.companyId)).toEqual(["c1", "c2"]);
    expect(SHOWCASE_SELECT_OPTIONS).toHaveLength(3);
    const names = showcaseWorkPlaceNames(10);
    expect(names).toHaveLength(10);
    expect(names).toContain("");
  });
});
