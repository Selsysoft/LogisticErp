import { describe, expect, it } from "vitest";
import type { BranchTree } from "../branch/branchTree";
import {
  allBranchIds,
  buildStatGroups,
  checkState,
  companyKey,
  dropdownLabel,
  expandMatched,
  groupKey,
  isAllSelected,
  normalizeSearch,
  normalizeSelection,
  sameSelection,
  searchTree,
  selectionFromValue,
  setMany,
  toggleAll,
  toggleKey,
  toggleOne,
  toggleStatSelection,
} from "./branchMultiSelectLogic";

const b = (id: string, name: string) => ({ id, code: id.toUpperCase(), name, active: true });

const tree: BranchTree = [
  {
    companyId: "c1",
    companyName: "Gül Lojistik",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [b("a", "Bornova"), b("b", "Kemalpaşa")],
      },
      { groupId: null, groupName: "Diğer", groupActive: true, branches: [b("c", "Isparta Depo")] },
    ],
  },
  {
    companyId: null,
    companyName: "Lale Nakliyat",
    companyActive: true,
    groups: [
      { groupId: "g2", groupName: "Ankara", groupActive: true, branches: [b("d", "Sincan")] },
    ],
  },
];
const all = ["a", "b", "c", "d"];

describe("checkState", () => {
  it("hiçbiri, kısmi, hepsi (dprSyncBranch)", () => {
    expect(checkState(["a", "b"], new Set())).toEqual({
      checked: false,
      indeterminate: false,
      selected: 0,
      total: 2,
    });
    expect(checkState(["a", "b"], new Set(["a", "x"]))).toEqual({
      checked: false,
      indeterminate: true,
      selected: 1,
      total: 2,
    });
    expect(checkState(["a", "b"], new Set(["a", "b"]))).toEqual({
      checked: true,
      indeterminate: false,
      selected: 2,
      total: 2,
    });
  });

  it("boş grup ne işaretli ne belirsiz", () => {
    expect(checkState([], new Set(["a"]))).toMatchObject({ checked: false, indeterminate: false });
  });
});

describe("anahtarlar", () => {
  it("şirket kimliği yoksa adından; grup kimliği yoksa adından", () => {
    expect(companyKey(tree[0])).toBe("c1");
    expect(companyKey(tree[1])).toBe("~Lale Nakliyat");
    expect(groupKey(tree[0], tree[0].groups[0])).toBe("c1::g1");
    expect(groupKey(tree[0], tree[0].groups[1])).toBe("c1::~Diğer");
  });

  it("tüm kimlikler ağaç sırasıyla", () => {
    expect(allBranchIds(tree)).toEqual(all);
  });
});

describe("seçim işlemleri", () => {
  it("isAllSelected: boş listede hayır", () => {
    expect(isAllSelected([], new Set())).toBe(false);
    expect(isAllSelected(all, new Set(all))).toBe(true);
    expect(isAllSelected(all, new Set(["a"]))).toBe(false);
  });

  it("toggleAll: Tümünü seç ↔ Temizle", () => {
    expect([...toggleAll(all, new Set(["a"]))]).toEqual(all);
    expect(toggleAll(all, new Set(all)).size).toBe(0);
  });

  it("setMany ekler ve kaldırır; girdiyi değiştirmez", () => {
    const start = new Set(["a"]);
    expect([...setMany(start, ["b", "c"], true)]).toEqual(["a", "b", "c"]);
    expect([...setMany(start, ["a"], false)]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });

  it("toggleOne", () => {
    expect([...toggleOne(new Set(["a"]), "a")]).toEqual([]);
    expect([...toggleOne(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  });

  it("toggleKey", () => {
    expect([...toggleKey(new Set(["x"]), "x")]).toEqual([]);
    expect([...toggleKey(new Set(), "x")]).toEqual(["x"]);
  });
});

describe("normalizeSelection (hepsi seçiliyse parametre gönderme, CAI :5999-6001)", () => {
  it("emptyMeansAll: hiçbiri ve hepsi → []", () => {
    expect(normalizeSelection(new Set(), all, true)).toEqual([]);
    expect(normalizeSelection(new Set(all), all, true)).toEqual([]);
  });

  it("kısmi seçim ağaç sırasıyla, ağaçta olmayan atılır", () => {
    expect(normalizeSelection(new Set(["d", "zz", "a"]), all, true)).toEqual(["a", "d"]);
  });

  it("emptyMeansAll=false iken hepsi açıkça gönderilir", () => {
    expect(normalizeSelection(new Set(all), all, false)).toEqual(all);
    expect(normalizeSelection(new Set(), all, false)).toEqual([]);
  });
});

describe("selectionFromValue", () => {
  it("boş değer: listede hiçbiri, açılır listede hepsi işaretli", () => {
    expect(selectionFromValue([], all, "list", true).size).toBe(0);
    expect([...selectionFromValue([], all, "dropdown", true)]).toEqual(all);
  });

  it("emptyMeansAll=false ya da dolu değer olduğu gibi", () => {
    expect(selectionFromValue([], all, "dropdown", false).size).toBe(0);
    expect([...selectionFromValue(["b"], all, "dropdown", true)]).toEqual(["b"]);
  });
});

describe("sameSelection", () => {
  it("sırası önemsiz küme eşitliği", () => {
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
    expect(sameSelection(["a", "c"], ["a", "b"])).toBe(false);
    expect(sameSelection([], [])).toBe(true);
  });
});

describe("arama", () => {
  it("normalizeSearch select2 searchKey katlaması ve kırpma", () => {
    expect(normalizeSearch("  İZMİR ")).toBe("IZMIR");
    expect(normalizeSearch("ISPARTA")).toBe(normalizeSearch("isparta"));
    expect(normalizeSearch("kırmızı")).toBe("KIRMIZI");
  });

  it("Türkçe karaktersiz yazım da bulur (ZTO toLowerCase gibi)", () => {
    const upper: BranchTree = [
      {
        companyId: null,
        companyName: "",
        companyActive: true,
        groups: [
          {
            groupId: "k",
            groupName: "KIRMIZI",
            groupActive: true,
            branches: [{ id: "x", code: "X", name: "ISPARTA DEPO", active: true }],
          },
        ],
      },
    ];
    expect([...searchTree(upper, "isparta").visibleBranchIds]).toEqual(["x"]);
    const byGroup = searchTree(upper, "kirmizi");
    expect([...byGroup.visibleBranchIds]).toEqual(["x"]);
    expect(byGroup.expandKeys.size).toBeGreaterThan(0);
  });

  it("boş arama: her şey görünür, açılacak yok", () => {
    const result = searchTree(tree, "   ");
    expect([...result.visibleBranchIds]).toEqual(all);
    expect(result.visibleGroupKeys.size).toBe(3);
    expect(result.visibleCompanyKeys.size).toBe(2);
    expect(result.expandKeys.size).toBe(0);
  });

  it("iş yeri adında (tr-TR duyarsız) arar; eşleşen grup ve şirket açılır", () => {
    const result = searchTree(tree, "KEMAL");
    expect([...result.visibleBranchIds]).toEqual(["b"]);
    expect([...result.visibleGroupKeys]).toEqual(["c1::g1"]);
    expect([...result.visibleCompanyKeys]).toEqual(["c1"]);
    expect([...result.expandKeys]).toEqual(["c1::g1", "c1"]);
  });

  it("İ/i: 'izmir' İzmir grubunu bulur, grubun tüm iş yerleri görünür", () => {
    const result = searchTree(tree, "izmir");
    expect([...result.visibleBranchIds]).toEqual(["a", "b"]);
  });

  it("I/ı: 'ISPARTA' Isparta Depo'yu bulur", () => {
    expect([...searchTree(tree, "ISPARTA").visibleBranchIds]).toEqual(["c"]);
  });

  it("şirket adında eşleşme o şirketin tümünü gösterir", () => {
    const result = searchTree(tree, "lale");
    expect([...result.visibleBranchIds]).toEqual(["d"]);
    expect([...result.visibleCompanyKeys]).toEqual(["~Lale Nakliyat"]);
  });

  it("eşleşme yoksa hepsi gizli", () => {
    const result = searchTree(tree, "yok");
    expect(result.visibleBranchIds.size).toBe(0);
    expect(result.visibleGroupKeys.size).toBe(0);
    expect(result.visibleCompanyKeys.size).toBe(0);
  });

  it("expandMatched yalnız eşleşenleri açar", () => {
    const collapsed = new Set(["c1::g1", "c1::~Diğer", "c1"]);
    const next = expandMatched(collapsed, searchTree(tree, "bornova").expandKeys);
    expect([...next]).toEqual(["c1::~Diğer"]);
  });
});

describe("dropdownLabel (updateWpLabel)", () => {
  it("hepsi ya da boş ağaç → tümü", () => {
    expect(dropdownLabel(tree, new Set(all))).toEqual({ kind: "all" });
    expect(dropdownLabel([], new Set())).toEqual({ kind: "all" });
  });

  it("hiçbiri, bir, çok", () => {
    expect(dropdownLabel(tree, new Set())).toEqual({ kind: "none" });
    expect(dropdownLabel(tree, new Set(["c"]))).toEqual({ kind: "one", name: "Isparta Depo" });
    expect(dropdownLabel(tree, new Set(["a", "d", "zz"]))).toEqual({ kind: "many", count: 2 });
  });
});

describe("istatistik çipleri", () => {
  it("buildStatGroups: Tanımsız, kırpma, adet azalan sonra ad", () => {
    const rows = [
      { wp: "Merkez" },
      { wp: " Merkez " },
      { wp: null },
      { wp: "" },
      { wp: "Çanakkale" },
      { wp: "Bornova" },
      { wp: undefined },
    ];
    expect(buildStatGroups(rows, (row) => row.wp, "Tanımsız")).toEqual([
      { name: "Tanımsız", count: 3 },
      { name: "Merkez", count: 2 },
      { name: "Bornova", count: 1 },
      { name: "Çanakkale", count: 1 },
    ]);
  });

  it("toggleStatSelection", () => {
    expect(toggleStatSelection(null, "A")).toBe("A");
    expect(toggleStatSelection("A", "A")).toBeNull();
    expect(toggleStatSelection("A", "B")).toBe("B");
    expect(toggleStatSelection(undefined, "B")).toBe("B");
  });
});
