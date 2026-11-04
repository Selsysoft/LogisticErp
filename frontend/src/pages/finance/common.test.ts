import { describe, expect, it } from "vitest";
import { formatAmount, normalizeAmount, shiftDays } from "./common";

describe("finans yardımcıları", () => {
  it("virgüllü tutarı API biçimine çevirir", () => {
    expect(normalizeAmount(" 1234,56 ")).toBe("1234.56");
    expect(normalizeAmount("10.5")).toBe("10.5");
  });

  it("tutarı Türkçe biçimlendirir", () => {
    expect(formatAmount("1234.5")).toBe("1.234,50");
    expect(formatAmount("1000.1234")).toBe("1.000,1234");
  });

  it("tarih kaydırmada ay sınırını geçer", () => {
    expect(shiftDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
