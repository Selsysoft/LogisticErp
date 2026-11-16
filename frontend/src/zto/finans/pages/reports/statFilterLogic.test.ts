import { describe, expect, it } from "vitest";
import {
  BLANK,
  cardItems,
  cleanValue,
  facetCounts,
  formatResult,
  isFiltered,
  matches,
  orderValues,
  pruneActive,
  rebuildActive,
  rowValues,
  toggleMember,
  toggleMulti,
} from "./statFilterLogic";

const KEYS = ["grup", "pb"];
const ROWS = [
  { grup: "Müşteri", pb: "₺" },
  { grup: "Müşteri", pb: "$" },
  { grup: "Acente", pb: "₺" },
  { grup: "", pb: "₺" },
];

describe("statFilterLogic (stat-filter.js _internals)", () => {
  it("cleanValue boşlukları teke indirir, null boş kovadır", () => {
    expect(cleanValue("  a   b ")).toBe("a b");
    expect(cleanValue(null)).toBe(BLANK);
    expect(cleanValue(undefined)).toBe(BLANK);
    expect(rowValues({ grup: " X ", pb: null }, KEYS)).toEqual({ grup: "X", pb: "" });
  });

  it("kart içi VEYA, kartlar arası VE", () => {
    expect(matches(ROWS[0], { grup: ["Müşteri", "Acente"] })).toBe(true);
    expect(matches(ROWS[2], { grup: ["Müşteri"] })).toBe(false);
    expect(matches(ROWS[1], { grup: ["Müşteri"], pb: ["₺"] })).toBe(false);
    expect(matches(ROWS[0], { grup: ["Müşteri"], pb: ["₺"] })).toBe(true);
    expect(matches(ROWS[0], {})).toBe(true);
  });

  it("fasetli sayılar: kartın kendi seçimi sayılmaz, diğerleri uygulanır", () => {
    expect(facetCounts(ROWS, KEYS, {})).toEqual({
      grup: { Müşteri: 2, Acente: 1, "": 1 },
      pb: { "₺": 3, $: 1 },
    });
    const counts = facetCounts(ROWS, KEYS, { pb: ["$"] });
    expect(counts.grup).toEqual({ Müşteri: 1 });
    expect(counts.pb).toEqual({ "₺": 3, $: 1 });
    // İki seçimi geçemeyen kayıt hiçbir kartta sayılmaz.
    const both = facetCounts(ROWS, KEYS, { pb: ["$"], grup: ["Acente"] });
    expect(both.grup).toEqual({ Müşteri: 1 });
    expect(both.pb).toEqual({ "₺": 1 });
  });

  it("orderValues: çoktan aza, eşitlikte tr alfabetik, boş en sonda; value-desc", () => {
    expect(orderValues({ Çay: 1, "": 5, Acente: 1, Müşteri: 2 })).toEqual([
      "Müşteri",
      "Acente",
      "Çay",
      "",
    ]);
    expect(orderValues({ "2026-01": 3, "2026-11": 1, "2025-12": 2 }, "value-desc")).toEqual([
      "2026-11",
      "2026-01",
      "2025-12",
    ]);
  });

  it("toggleMember ekler/çıkarır, boşalan anahtar düşer, girdi değişmez", () => {
    const start = { grup: ["Müşteri"] };
    const added = toggleMember(start, "grup", "Acente");
    expect(added).toEqual({ grup: ["Müşteri", "Acente"] });
    expect(start).toEqual({ grup: ["Müşteri"] });
    expect(toggleMember(added, "grup", "Müşteri")).toEqual({ grup: ["Acente"] });
    expect(toggleMember({ grup: ["Acente"] }, "grup", "Acente")).toEqual({});
  });

  it("toggleMulti diğer kartta sayısı sıfıra inen seçimi bırakır; bilinmeyen anahtar yok sayılır", () => {
    const active = { grup: ["Acente"] };
    // pb=$ seçilince Acente'nin sayısı 0 olur ve seçimden düşer.
    expect(toggleMulti(active, "pb", "$", ROWS, KEYS)).toEqual({ pb: ["$"] });
    expect(toggleMulti(active, "yok", "x", ROWS, KEYS)).toBe(active);
  });

  it("pruneActive ve rebuildActive: artık olmayan değer düşer", () => {
    expect(pruneActive({ grup: ["Yok", "Müşteri"] }, facetCounts(ROWS, KEYS, {}))).toEqual({
      grup: ["Müşteri"],
    });
    expect(pruneActive({ grup: ["Yok"] }, facetCounts(ROWS, KEYS, {}), "grup")).toEqual({
      grup: ["Yok"],
    });
    // Seçimin bütününe uyan kayıt kalmadıysa bütün seçim düşer (stat-filter.js `rebuild`).
    expect(rebuildActive({ grup: ["Acente"], pb: ["$"] }, ROWS, KEYS)).toEqual({});
    expect(rebuildActive({ grup: ["Müşteri", "Yok"], pb: ["$"] }, ROWS, KEYS)).toEqual({
      grup: ["Müşteri"],
      pb: ["$"],
    });
  });

  it("Temizle (boş seçim), sayaç metni ve is-filtered", () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ grup: ["Müşteri"] })).toBe(true);
    expect(formatResult("{0} / {1} satır", 2, 4)).toBe("2 / 4 satır");
    expect(formatResult("", 1, 3)).toBe("1 / 3");
  });

  it("cardItems: seçili, boş ve soluk öğeler; boş kova etiketi", () => {
    const counts = facetCounts(ROWS, KEYS, { pb: ["$"] });
    const items = cardItems(
      "grup",
      ["Müşteri", "Acente", ""],
      counts,
      { pb: ["$"] },
      "Belirtilmedi",
    );
    expect(items.map((i) => [i.value, i.label, i.count, i.empty, i.blank])).toEqual([
      ["Müşteri", "Müşteri", 1, false, false],
      ["Acente", "Acente", 0, true, false],
      ["", "Belirtilmedi", 0, true, true],
    ]);
    expect(cardItems("grup", ["Müşteri", ""], counts, {}, "")).toHaveLength(1);
    const selected = cardItems("pb", ["₺", "$"], counts, { pb: ["$"] }, "");
    expect(selected.find((i) => i.value === "$")?.selected).toBe(true);
  });
});
