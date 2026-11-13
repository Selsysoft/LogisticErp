import { describe, expect, it } from "vitest";
import "../../i18n";
import { formatNumber } from "../format";
import {
  cellText,
  excelColumnWidth,
  formatDateTr,
  formatNumberTr,
  parseNumericText,
  toExcelValue,
  toExportCell,
} from "./cells";

describe("cellText", () => {
  it("türlere göre tr-TR metin", () => {
    expect(cellText(null)).toBe("");
    expect(cellText(undefined)).toBe("");
    expect(cellText("  ali ")).toBe("ali");
    expect(cellText(1234567.891)).toBe("1.234.567,891");
    expect(cellText(Number.NaN)).toBe("");
    expect(cellText(true)).toBe("Evet");
    expect(cellText(false)).toBe("Hayır");
    expect(cellText(new Date(2026, 10, 13))).toBe("13.11.2026");
    expect(cellText(new Date(2026, 10, 13, 9, 5))).toBe("13.11.2026 09:05");
    expect(cellText(new Date("geçersiz"))).toBe("");
  });

  it("biçim yardımcıları", () => {
    expect(formatNumberTr(-0.5)).toBe("-0,5");
    expect(formatDateTr(new Date(2026, 0, 1, 0, 0, 30))).toBe("01.01.2026 00:00");
  });
});

describe("toExportCell", () => {
  it("bilinen türler aynen, bigint metin, nesne boş", () => {
    const d = new Date();
    expect(toExportCell(d)).toBe(d);
    expect(toExportCell(5)).toBe(5);
    expect(toExportCell(null)).toBeNull();
    expect(toExportCell(BigInt(7))).toBe("7");
    expect(toExportCell({ a: 1 })).toBe("");
    expect(toExportCell([1])).toBe("");
  });
});

describe("parseNumericText / toExcelValue", () => {
  it("Buttons kuralı: düz sayı, baştaki sıfır metin kalır", () => {
    expect(parseNumericText("12")).toBe(12);
    expect(parseNumericText("-12.5")).toBe(-12.5);
    expect(parseNumericText("0.25")).toBe(0.25);
    expect(parseNumericText("0")).toBe(0);
    expect(parseNumericText("05321234567")).toBeNull();
    expect(parseNumericText("1234.5000")).toBe(1234.5);
    expect(parseNumericText("1.2345")).toBe(1.2345);
    expect(parseNumericText("0.250")).toBe(0.25);
  });

  it("tr-TR görünümü: noktadan sonra tam üç hane binlik ayırıcıdır", () => {
    expect(parseNumericText("1.234")).toBe(1234);
    expect(parseNumericText("12.345")).toBe(12345);
    expect(parseNumericText("-1.234")).toBe(-1234);
    expect(toExcelValue(formatNumber(1234, 0))).toBe(1234);
    expect(toExcelValue(formatNumber(999_999, 0))).toBe(999_999);
    expect(parseNumericText("1.234,56")).toBe(1234.56);
    expect(parseNumericText("-1.234.567")).toBe(-1234567);
    expect(parseNumericText("12,5")).toBe(12.5);
    expect(parseNumericText("0,75")).toBe(0.75);
    expect(parseNumericText("1.23,4")).toBeNull();
    expect(parseNumericText("1,234,5")).toBeNull();
  });

  it("metin ve uzun haneli sayılar", () => {
    expect(parseNumericText("TR12 0001")).toBeNull();
    expect(parseNumericText("1234567890123456")).toBeNull();
    expect(parseNumericText("12.11.2026")).toBeNull();
    expect(parseNumericText("1.234,56 TL")).toBeNull();
  });

  it("Excel değeri", () => {
    const d = new Date(2026, 10, 13);
    expect(toExcelValue(null)).toBeNull();
    expect(toExcelValue(undefined)).toBeNull();
    expect(toExcelValue(3.5)).toBe(3.5);
    expect(toExcelValue(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toExcelValue(true)).toBe("Evet");
    expect(toExcelValue(d)).toBe(d);
    expect(toExcelValue(new Date("x"))).toBeNull();
    expect(toExcelValue("   ")).toBeNull();
    expect(toExcelValue(" 1.234,50 ")).toBe(1234.5);
    expect(toExcelValue("Ana Kasa")).toBe("Ana Kasa");
  });
});

describe("excelColumnWidth (Buttons _excelColWidth)", () => {
  it("en uzun satır × 1,35, en az 6", () => {
    expect(excelColumnWidth("Ad", ["a", null])).toBe(6);
    expect(excelColumnWidth("Açıklama", ["kısa"])).toBeCloseTo(8 * 1.35);
    expect(excelColumnWidth("A", ["satır bir\nçok daha uzun satır"])).toBeCloseTo(19 * 1.35);
  });

  it("40 karakteri aşan sütun 54", () => {
    expect(excelColumnWidth("A", ["x".repeat(41)])).toBe(54);
  });
});
