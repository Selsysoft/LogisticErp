import { describe, expect, it } from "vitest";
import {
  clampPage,
  effectiveSize,
  filterRows,
  infoRange,
  normalizeRcpQuery,
  pageCount,
  pageRows,
  pageWindow,
  parsePageSize,
  RCP_PAGE_SIZES,
} from "./rcpTableLogic";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `r${i + 1}`, text: `${i + 1}` }));

describe("arama (ZTO textContent.toLowerCase().indexOf)", () => {
  const data = [
    { key: "a", text: "İSTANBUL Tarım A.Ş. USD" },
    { key: "b", text: "Ankara ılgaz EUR" },
    { key: "c", text: "izmir 1.250,00" },
  ];

  it("boş arama hepsini sırayla verir; büyük/küçük harf duyarsız alt dize", () => {
    expect(filterRows(data, "").map((r) => r.key)).toEqual(["a", "b", "c"]);
    expect(filterRows(data, "usd").map((r) => r.key)).toEqual(["a"]);
    expect(filterRows(data, "TARIM").map((r) => r.key)).toEqual(["a"]);
    expect(filterRows(data, "1.250").map((r) => r.key)).toEqual(["c"]);
    expect(filterRows(data, "yok")).toEqual([]);
  });

  it("Türkçe İ/ı yerel küçük harfle eşleşir", () => {
    expect(normalizeRcpQuery("İSTANBUL")).toBe("istanbul");
    expect(normalizeRcpQuery("ILGAZ")).toBe("ılgaz");
    expect(filterRows(data, "istanbul").map((r) => r.key)).toEqual(["a"]);
    expect(filterRows(data, "ILGAZ").map((r) => r.key)).toEqual(["b"]);
  });

  it("aramada baş/son boşluk korunur (ZTO kırpmaz)", () => {
    expect(filterRows(data, " eur").map((r) => r.key)).toEqual(["b"]);
    expect(filterRows(data, "eur ")).toEqual([]);
  });
});

describe("sayfa boyutu ve sayfalar", () => {
  it("10/25/50/Tümü seçenekleri; geçersiz değer 10", () => {
    expect(RCP_PAGE_SIZES).toEqual([10, 25, 50, 0]);
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("0")).toBe(0);
    expect(parsePageSize("7")).toBe(10);
    expect(parsePageSize("x")).toBe(10);
  });

  it("Tümü = 0 → tek sayfa; boş listede de 1 sayfa", () => {
    expect(effectiveSize(37, 0)).toBe(37);
    expect(effectiveSize(0, 0)).toBe(1);
    expect(pageCount(37, 0)).toBe(1);
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
    expect(pageCount(11, 10)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
  });

  it("clampPage sınırlar", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(5, 3)).toBe(3);
    expect(clampPage(2, 0)).toBe(1);
    expect(clampPage(Number.NaN, 3)).toBe(1);
    expect(clampPage(2.7, 3)).toBe(2);
  });

  it("pageRows dilimler; sınır dışı sayfa son sayfaya sıkışır", () => {
    expect(pageRows(rows(23), 1, 10).map((r) => r.key)).toEqual(
      Array.from({ length: 10 }, (_, i) => `r${i + 1}`),
    );
    expect(pageRows(rows(23), 3, 10).map((r) => r.key)).toEqual(["r21", "r22", "r23"]);
    expect(pageRows(rows(23), 9, 10).map((r) => r.key)).toEqual(["r21", "r22", "r23"]);
    expect(pageRows(rows(23), 1, 0)).toHaveLength(23);
    expect(pageRows([], 1, 10)).toEqual([]);
  });
});

describe("infoRange (Toplam n kayıttan a-b arası)", () => {
  it("1 tabanlı aralık; son sayfa kısa; boşta 0-0", () => {
    expect(infoRange(23, 1, 10)).toEqual({ start: 1, end: 10 });
    expect(infoRange(23, 3, 10)).toEqual({ start: 21, end: 23 });
    expect(infoRange(23, 1, 0)).toEqual({ start: 1, end: 23 });
    expect(infoRange(8, 1, 10)).toEqual({ start: 1, end: 8 });
    expect(infoRange(0, 1, 10)).toEqual({ start: 0, end: 0 });
    expect(infoRange(23, 99, 10)).toEqual({ start: 21, end: 23 });
  });
});

describe("pageWindow (1, son, etkin ±2, aralarda …)", () => {
  it("az sayfada etkin ±2 ve uçlar", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, "dots", 5]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("başta, ortada ve sonda üç nokta", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, "dots", 10]);
    expect(pageWindow(5, 10)).toEqual([1, "dots", 3, 4, 5, 6, 7, "dots", 10]);
    expect(pageWindow(6, 12)).toEqual([1, "dots", 4, 5, 6, 7, 8, "dots", 12]);
    expect(pageWindow(10, 10)).toEqual([1, "dots", 8, 9, 10]);
    // 1 ile 3 arası tek boşluk (2) da üç noktayla gösterilir (ZTO `p - last > 1`).
    expect(pageWindow(5, 7)).toEqual([1, "dots", 3, 4, 5, 6, 7]);
  });

  it("sınır dışı etkin sayfa sıkıştırılır", () => {
    expect(pageWindow(99, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(0, 10)).toEqual([1, 2, 3, "dots", 10]);
  });
});
