import { describe, expect, it } from "vitest";
import {
  buildRows,
  dropdownPlacement,
  flattenOptions,
  highlightParts,
  matches,
  nextIndex,
  selectableRows,
  triggerState,
  type SearchableItem,
} from "./searchableSelectLogic";

const BANKS: SearchableItem[] = [
  { value: "f1", label: "Ziraat | Merkez (ZRT-1) [Vadesiz]" },
  { value: "f2", label: "Türkiye İş Bankası | Şişli (ISB-2) [Vadesiz]" },
  { value: "", label: "boş değerli seçenek atlanır" },
];

describe("searchableSelectLogic (ZTO SearchableSelect)", () => {
  it("TR katlamasıyla arar: ı/i/İ, ş/s, büyük/küçük harf", () => {
    expect(matches("Türkiye İş Bankası", "is bank")).toBe(true);
    expect(matches("Türkiye İş Bankası", "TURKIYE")).toBe(true);
    expect(matches("Şişli", "sisli")).toBe(true);
    expect(matches("Ziraat", "garanti")).toBe(false);
    expect(matches("Ziraat", "  ")).toBe(true);
  });

  it("ilk eşleşmeyi özgün harflerle işaretler", () => {
    expect(highlightParts("Türkiye İş Bankası", "is")).toEqual([
      { text: "Türkiye ", match: false },
      { text: "İş", match: true },
      { text: " Bankası", match: false },
    ]);
    expect(highlightParts("Ziraat", "zir")).toEqual([
      { text: "Zir", match: true },
      { text: "aat", match: false },
    ]);
    expect(highlightParts("Ziraat", "")).toEqual([{ text: "Ziraat", match: false }]);
    expect(highlightParts("Ziraat", "xyz")).toEqual([{ text: "Ziraat", match: false }]);
  });

  it("satırlar: boş seçenek başta, eşleşmeyen atlanır, boş değerli seçenek listelenmez", () => {
    const rows = buildRows(BANKS, "", "Tüm Bankalar", "Banka bulunamadı");
    expect(rows.map((r) => r.kind)).toEqual(["reset", "option", "option"]);
    expect(rows[0]).toMatchObject({ value: "", label: "Tüm Bankalar" });
    const filtered = buildRows(BANKS, "şişli", "Tüm Bankalar", "Banka bulunamadı");
    expect(filtered.map((r) => (r.kind === "option" ? r.value : r.kind))).toEqual(["f2"]);
  });

  it("boş seçenek aramayla eşleşirse kalır; hiçbir seçenek yoksa 'bulunamadı'", () => {
    const rows = buildRows(BANKS, "tüm", "Tüm Bankalar", "Banka bulunamadı");
    expect(rows.map((r) => r.kind)).toEqual(["reset", "empty"]);
    expect(rows[1]).toEqual({ kind: "empty", label: "Banka bulunamadı" });
    const none = buildRows(BANKS, "qqq", null, "Kasa bulunamadı");
    expect(none).toEqual([{ kind: "empty", label: "Kasa bulunamadı" }]);
    expect(selectableRows(none)).toEqual([]);
  });

  it("optgroup başlığı yalnız eşleşen seçeneği varken", () => {
    const grouped: SearchableItem[] = [
      { label: "Acme", options: [{ value: "a", label: "Kasa A" }] },
      {
        label: "Beta",
        options: [
          { value: "b", label: "Kasa B" },
          { value: "", label: "x" },
        ],
      },
    ];
    const rows = buildRows(grouped, "kasa b", null, "yok");
    expect(rows).toEqual([
      { kind: "group", label: "Beta" },
      {
        kind: "option",
        value: "b",
        label: "Kasa B",
        parts: [{ text: "Kasa B", match: true }],
      },
    ]);
    expect(flattenOptions(grouped).map((o) => o.value)).toEqual(["a", "b", ""]);
  });

  it("tetikleyici metni: seçili etiket ya da yer tutucu", () => {
    expect(triggerState(BANKS, "f1", "Tüm Bankalar", "Seçiniz...")).toEqual({
      text: "Ziraat | Merkez (ZRT-1) [Vadesiz]",
      placeholder: false,
    });
    expect(triggerState(BANKS, "", "Tüm Bankalar", "Seçiniz...")).toEqual({
      text: "Tüm Bankalar",
      placeholder: true,
    });
    expect(triggerState(BANKS, "yok", null, "Seçiniz...")).toEqual({
      text: "Seçiniz...",
      placeholder: true,
    });
  });

  it("ok tuşları sarar; arama kutusundan ↓ ilk, ↑ son", () => {
    expect(nextIndex(-1, 1, 3)).toBe(0);
    expect(nextIndex(-1, -1, 3)).toBe(2);
    expect(nextIndex(2, 1, 3)).toBe(0);
    expect(nextIndex(0, -1, 3)).toBe(2);
    expect(nextIndex(0, 1, 0)).toBe(-1);
  });

  it("açılır kutu altta yer yoksa yukarı açılır", () => {
    const rect = { top: 100, bottom: 130, left: 10, width: 200 };
    expect(dropdownPlacement(rect, 800)).toEqual({ top: 134, left: 10, width: 200 });
    expect(dropdownPlacement({ ...rect, top: 700, bottom: 730 }, 800)).toEqual({
      bottom: 104,
      left: 10,
      width: 200,
    });
  });
});
