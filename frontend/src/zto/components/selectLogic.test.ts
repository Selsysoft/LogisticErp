import { describe, expect, it } from "vitest";
import type { BranchTree } from "../branch/branchTree";
import {
  branchTreeToSelectItems,
  computeDropdownPosition,
  containerIdFor,
  filterItems,
  findOption,
  flattenOptions,
  initialHighlight,
  isGroup,
  matchesTerm,
  moveHighlight,
  readDefaultBranchId,
  resolveDisplay,
  scrollTopToReveal,
  searchKey,
  selectableValues,
  selectKeyAction,
  shouldShowSearch,
  ZtoSelectItem,
} from "./selectLogic";

const items: ZtoSelectItem[] = [
  { value: "", label: "Tüm İş Yerleri" },
  {
    label: "İzmir Şubesi",
    options: [
      { value: "1", label: "Çiğli Depo" },
      { value: "2", label: "Bornova Ofis", disabled: true },
      { value: "3", label: "Işıkkent Fabrika" },
    ],
  },
  {
    label: "Ankara",
    options: [
      { value: "4", label: "Ostim Üretim" },
      { value: "5", label: "Sincan Şantiye" },
    ],
  },
  { value: "6", label: "Merkez" },
];

const labels = (list: ZtoSelectItem[]) => flattenOptions(list).map((option) => option.label);

describe("searchKey / matchesTerm (select2 diacritics + toUpperCase)", () => {
  it("Türkçe harfleri aksansız büyük harfe indirger", () => {
    expect(searchKey("çğıöşü")).toBe("CGIOSU");
    expect(searchKey("ÇĞİÖŞÜ")).toBe("CGIOSU");
    expect(searchKey("Işık")).toBe("ISIK");
    expect(searchKey("istanbul")).toBe(searchKey("İSTANBUL"));
  });

  it("NFD ile ayrışmayan harfler de eşlenir", () => {
    expect(searchKey("łøđħßæœ")).toBe("LODHSSAEOE");
    expect(searchKey("ŁØĐĦÆŒ")).toBe("LODHAEOE");
  });

  it("ı/i/İ/I birbirini, ç/c, ş/s, ğ/g, ö/o, ü/u birbirini bulur", () => {
    expect(matchesTerm("Işıkkent", "isik")).toBe(true);
    expect(matchesTerm("ışık", "IŞIK")).toBe(true);
    expect(matchesTerm("İzmir", "izm")).toBe(true);
    expect(matchesTerm("Çiğli", "cigli")).toBe(true);
    expect(matchesTerm("Sincan Şantiye", "santiye")).toBe(true);
    expect(matchesTerm("Ostim Üretim", "uret")).toBe(true);
    expect(matchesTerm("Gölbaşı", "GOLBASI")).toBe(true);
    expect(matchesTerm("Ankara", "izmir")).toBe(false);
  });

  it("boş ya da yalnız boşluk terim her şeyi eşler; terim kırpılmaz (select2)", () => {
    expect(matchesTerm("x", "")).toBe(true);
    expect(matchesTerm("x", "   ")).toBe(true);
    expect(matchesTerm("Ankara", "Ankara ")).toBe(false);
  });
});

describe("filterItems", () => {
  it("boş terimde hepsi döner; hiddenValue üst düzey seçeneği gizler", () => {
    expect(filterItems(items, "")).toEqual(items);
    expect(labels(filterItems(items, "", ""))).not.toContain("Tüm İş Yerleri");
  });

  it("optgroup içinde süzer, boş kalan grubu atar", () => {
    const result = filterItems(items, "fab");
    expect(result).toHaveLength(1);
    expect(isGroup(result[0])).toBe(true);
    expect(result[0].label).toBe("İzmir Şubesi");
    expect(labels(result)).toEqual(["Işıkkent Fabrika"]);
  });

  it("grup adı eşleşir ama çocuk eşleşmezse grubun tüm seçenekleri döner", () => {
    const result = filterItems(items, "ANKARA");
    expect(result).toHaveLength(1);
    expect(labels(result)).toEqual(["Ostim Üretim", "Sincan Şantiye"]);
  });

  it("boş grup adı eşleşse de eklenmez; eşleşme yoksa boş liste", () => {
    expect(filterItems([{ label: "Boş", options: [] }], "bo")).toEqual([]);
    expect(filterItems(items, "zzz")).toEqual([]);
  });

  it("düz seçeneklerde aksansız arama", () => {
    expect(labels(filterItems(items, "merk"))).toEqual(["Merkez"]);
  });
});

describe("seçenek yardımcıları", () => {
  it("flattenOptions, selectableValues, findOption", () => {
    expect(flattenOptions(items).map((o) => o.value)).toEqual(["", "1", "2", "3", "4", "5", "6"]);
    expect(selectableValues(items)).toEqual(["", "1", "3", "4", "5", "6"]);
    expect(findOption(items, "4")?.label).toBe("Ostim Üretim");
    expect(findOption(items, "x")).toBeUndefined();
  });

  it("shouldShowSearch: minimumResultsForSearch (gruplar sayılmaz, negatif/Infinity gizler)", () => {
    expect(shouldShowSearch(items)).toBe(true);
    expect(shouldShowSearch(items, 7)).toBe(true);
    expect(shouldShowSearch(items, 8)).toBe(false);
    expect(shouldShowSearch(items, Infinity)).toBe(false);
    expect(shouldShowSearch(items, -1)).toBe(false);
    expect(shouldShowSearch([], 0)).toBe(true);
  });

  it("resolveDisplay: yer tutucu, eşleşen seçenek, ilk etkin seçenek, boş", () => {
    expect(resolveDisplay(items, "", "Seçiniz")).toEqual({ kind: "placeholder", text: "Seçiniz" });
    expect(resolveDisplay(items, "3", "Seçiniz")).toEqual({
      kind: "option",
      option: { value: "3", label: "Işıkkent Fabrika" },
    });
    expect(resolveDisplay(items, "yok", "Seçiniz")).toEqual({
      kind: "placeholder",
      text: "Seçiniz",
    });
    expect(resolveDisplay(items, "")).toEqual({
      kind: "option",
      option: { value: "", label: "Tüm İş Yerleri" },
    });
    const disabledFirst: ZtoSelectItem[] = [
      { value: "a", label: "A", disabled: true },
      { value: "b", label: "B" },
    ];
    expect(resolveDisplay(disabledFirst, "yok")).toEqual({
      kind: "option",
      option: { value: "b", label: "B" },
    });
    expect(resolveDisplay([], "")).toEqual({ kind: "empty" });
  });
});

describe("vurgu gezinmesi (results.js)", () => {
  const selectable = ["1", "3", "4"];

  it("initialHighlight: seçili öğe listedeyse o, yoksa ilk; liste boşsa null", () => {
    expect(initialHighlight(selectable, "4")).toBe("4");
    expect(initialHighlight(selectable, "9")).toBe("1");
    expect(initialHighlight([], "1")).toBeNull();
  });

  it("next: sonraki öğe, sonda durur; vurgu yoksa ilk öğe", () => {
    expect(moveHighlight(selectable, "1", "next")).toBe("3");
    expect(moveHighlight(selectable, "4", "next")).toBe("4");
    expect(moveHighlight(selectable, null, "next")).toBe("1");
    expect(moveHighlight([], null, "next")).toBeNull();
  });

  it("previous: önceki öğe, başta durur; vurgu yoksa değişmez", () => {
    expect(moveHighlight(selectable, "4", "previous")).toBe("3");
    expect(moveHighlight(selectable, "1", "previous")).toBe("1");
    expect(moveHighlight(selectable, null, "previous")).toBeNull();
  });

  it("listede olmayan vurgudan next ilk öğeye gider", () => {
    expect(moveHighlight(selectable, "2", "next")).toBe("1");
  });
});

describe("selectKeyAction (core.js keypress)", () => {
  it("kapalıyken Enter, boşluk, Alt+Aşağı açar; düz Aşağı açmaz", () => {
    expect(selectKeyAction({ key: "Enter", open: false })).toBe("open");
    expect(selectKeyAction({ key: " ", open: false })).toBe("open");
    expect(selectKeyAction({ key: "ArrowDown", altKey: true, open: false })).toBe("open");
    expect(selectKeyAction({ key: "ArrowDown", open: false })).toBeNull();
    expect(selectKeyAction({ key: "a", open: false })).toBeNull();
  });

  it("kapalıyken Delete/Backspace yalnız allowClear ile temizler", () => {
    expect(selectKeyAction({ key: "Delete", open: false, allowClear: true })).toBe("clear");
    expect(selectKeyAction({ key: "Backspace", open: false, allowClear: true })).toBe("clear");
    expect(selectKeyAction({ key: "Delete", open: false })).toBeNull();
  });

  it("açıkken ESC/Alt+Yukarı kapatır, Enter/Tab seçer, oklar gezinir", () => {
    expect(selectKeyAction({ key: "Escape", open: true })).toBe("close");
    expect(selectKeyAction({ key: "ArrowUp", altKey: true, open: true })).toBe("close");
    expect(selectKeyAction({ key: "Enter", open: true })).toBe("select");
    expect(selectKeyAction({ key: "Tab", open: true })).toBe("select");
    expect(selectKeyAction({ key: "ArrowUp", open: true })).toBe("previous");
    expect(selectKeyAction({ key: "ArrowDown", open: true })).toBe("next");
    expect(selectKeyAction({ key: " ", open: true })).toBeNull();
    expect(selectKeyAction({ key: "Delete", open: true, allowClear: true })).toBeNull();
  });
});

describe("computeDropdownPosition (AttachBody._positionDropdown)", () => {
  const trigger = { top: 100, bottom: 134, left: 20, width: 300 };
  const origin = { top: 0, left: 0 };

  it("yer varsa aşağı; konum kapsayıcı başlangıcına göre", () => {
    expect(
      computeDropdownPosition({
        trigger,
        dropdownHeight: 200,
        viewportHeight: 800,
        origin: { top: -50, left: 10 },
        current: null,
      }),
    ).toEqual({ top: 184, left: 10, width: 300, direction: "below" });
  });

  it("aşağıda yer yok, yukarıda var → yukarı", () => {
    const low = { top: 700, bottom: 734, left: 0, width: 100 };
    expect(
      computeDropdownPosition({
        trigger: low,
        dropdownHeight: 200,
        viewportHeight: 800,
        origin,
        current: null,
      }),
    ).toEqual({ top: 500, left: 0, width: 100, direction: "above" });
  });

  it("iki yönde de yer yoksa aşağı (ilk açılış) ya da mevcut yön korunur", () => {
    const base = { trigger, dropdownHeight: 1000, viewportHeight: 800, origin };
    expect(computeDropdownPosition({ ...base, current: null }).direction).toBe("below");
    expect(computeDropdownPosition({ ...base, current: "above" }).direction).toBe("above");
    expect(computeDropdownPosition({ ...base, current: "above" }).top).toBe(-900);
  });

  it("yukarıdayken yukarıda yer kalmaz, aşağıda olursa aşağı döner", () => {
    expect(
      computeDropdownPosition({
        trigger,
        dropdownHeight: 150,
        viewportHeight: 800,
        origin,
        current: "above",
      }).direction,
    ).toBe("below");
  });

  it("aşağıdayken iki yönde de yer varsa aşağıda kalır", () => {
    const mid = { top: 400, bottom: 434, left: 0, width: 100 };
    expect(
      computeDropdownPosition({
        trigger: mid,
        dropdownHeight: 100,
        viewportHeight: 800,
        origin,
        current: "below",
      }).direction,
    ).toBe("below");
  });
});

describe("scrollTopToReveal", () => {
  it("görünürse null, üstteyse öğe başına, alttaysa öğe sonuna kaydırır", () => {
    expect(scrollTopToReveal(0, 200, 50, 30)).toBeNull();
    expect(scrollTopToReveal(100, 200, 40, 30)).toBe(40);
    expect(scrollTopToReveal(0, 200, 190, 30)).toBe(20);
  });
});

describe("containerIdFor (select2 _generateId)", () => {
  it("id, sonra name kullanılır; özel karakterler atılır", () => {
    expect(containerIdFor("filterWorkPlace", "x", "r1")).toBe("select2-filterWorkPlace");
    expect(containerIdFor(undefined, "Items[0].Id", "r1")).toBe("select2-Items0Id-r1");
    expect(containerIdFor(undefined, undefined, "r1")).toBe("select2-r1");
  });
});

describe("branchTreeToSelectItems (MX5 Varyant A)", () => {
  const branch = (id: string, name: string, active = true) => ({ id, code: id, name, active });
  const opts = { inactiveSuffix: "(Pasif)" };

  it("tek şirket, grupsuz ağaç 'Diğer' optgroup'u olur (ZTO COALESCE); allLabel ilk boş seçenek", () => {
    const tree: BranchTree = [
      {
        companyId: null,
        companyName: "",
        groups: [{ groupId: null, groupName: "Diğer", branches: [branch("a", "Merkez")] }],
      },
    ];
    expect(branchTreeToSelectItems(tree, { ...opts, allLabel: "Tüm İş Yerleri" })).toEqual([
      { value: "", label: "Tüm İş Yerleri" },
      { label: "Diğer", options: [{ value: "a", label: "Merkez" }] },
    ]);
    expect(branchTreeToSelectItems([], opts)).toEqual([]);
  });

  it("tek şirkette gerçek grup varsa optgroup = grup adı; boş grup atlanır", () => {
    const tree: BranchTree = [
      {
        companyId: "c1",
        companyName: "Acme",
        groups: [
          { groupId: "g1", groupName: "İzmir", branches: [branch("a", "Çiğli")] },
          { groupId: "g2", groupName: "Boş", branches: [] },
          { groupId: null, groupName: "Diğer", branches: [branch("b", "Merkez", false)] },
        ],
      },
    ];
    expect(branchTreeToSelectItems(tree, opts)).toEqual([
      { label: "İzmir", options: [{ value: "a", label: "Çiğli" }] },
      { label: "Diğer", options: [{ value: "b", label: "Merkez (Pasif)", disabled: true }] },
    ]);
  });

  it('≥2 şirkette etiket "Şirket › Grup" (grupsuz olsa da)', () => {
    const tree: BranchTree = [
      {
        companyId: "c1",
        companyName: "Acme",
        groups: [{ groupId: null, groupName: "Diğer", branches: [branch("a", "A")] }],
      },
      {
        companyId: "c2",
        companyName: "Beta",
        groups: [{ groupId: "g", groupName: "Ege", branches: [branch("b", "B")] }],
      },
    ];
    expect(branchTreeToSelectItems(tree, opts).map((item) => item.label)).toEqual([
      "Acme › Diğer",
      "Beta › Ege",
    ]);
  });
});

describe("readDefaultBranchId", () => {
  it("alan yoksa ya da boşsa undefined", () => {
    expect(readDefaultBranchId(null)).toBeUndefined();
    expect(readDefaultBranchId({ id: "u" })).toBeUndefined();
    expect(readDefaultBranchId({ defaultBranchId: "" })).toBeUndefined();
    expect(readDefaultBranchId({ defaultBranchId: 5 })).toBeUndefined();
    expect(readDefaultBranchId({ defaultBranchId: "b1" })).toBe("b1");
  });
});
