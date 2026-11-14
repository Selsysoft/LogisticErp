import { describe, expect, it } from "vitest";
import {
  CT_TARGET_SEARCH_IDS,
  enterTarget,
  filterHits,
  groupIcon,
  highlightParts,
  isImeComposing,
  nextIndex,
  optionId,
  QCA_SEARCH_IDS,
  resolveIds,
  shouldSearch,
  TX_SEARCH_IDS,
  variantDefaults,
  VARIANT_CLASSES,
} from "./accountSearchLogic";
import { accountSearchQuery } from "../../pages/finance/accountApi";

describe("görünüm sınıfları ve kimlikler", () => {
  it("atcs: ZTO atcs-* sınıfları ve Transactions txCariSearch* kimlikleri", () => {
    expect(VARIANT_CLASSES.atcs).toMatchObject({
      wrap: "atcs-wrap",
      inputBox: "atcs-inputbox",
      icon: "fas fa-search atcs-ic",
      input: "atcs-input",
      clear: "atcs-clear",
      results: "atcs-results",
      resultsOpen: "show",
      item: "atcs-item",
      empty: "atcs-empty",
    });
    expect(TX_SEARCH_IDS).toEqual({
      wrap: "txCariSearchWrap",
      input: "txCariSearch",
      clear: "txCariSearchClear",
      results: "txCariSearchResults",
    });
  });

  it("qca ve listGroup (Cari Taşıma ct-target-item)", () => {
    expect(VARIANT_CLASSES.qca).toMatchObject({
      wrap: "qca-search-wrap",
      input: "qca-search-input",
      clear: "qca-clear",
      results: "qca-results",
      item: "qca-result-item",
      itemActive: "active",
      empty: "qca-results-empty",
    });
    expect(QCA_SEARCH_IDS).toEqual({
      input: "qcaSearchInput",
      clear: "qcaClearBtn",
      results: "qcaResults",
    });
    expect(VARIANT_CLASSES.listGroup).toMatchObject({
      wrap: undefined,
      input: "form-control form-control-sm",
      clear: undefined,
      results: "list-group",
      resultsOpen: undefined,
      item: "list-group-item list-group-item-action py-1 ct-target-item",
      empty: "list-group-item small text-muted",
    });
    expect(CT_TARGET_SEARCH_IDS).toEqual({ input: "ctTargetSearch", results: "ctTargetResults" });
  });

  it("varsayılanlar: atcs/qca 1 harf 220 ms; Cari Taşıma 2 harf 300 ms", () => {
    expect(variantDefaults("atcs")).toEqual({ minLength: 1, delayMs: 220 });
    expect(variantDefaults("qca")).toEqual({ minLength: 1, delayMs: 220 });
    expect(variantDefaults("listGroup")).toEqual({ minLength: 2, delayMs: 300 });
  });

  it("kimlik çözümü ve seçenek kimliği", () => {
    expect(resolveIds(undefined, "g")).toEqual({ input: "g-input", results: "g-results" });
    expect(resolveIds(TX_SEARCH_IDS, "g")).toEqual(TX_SEARCH_IDS);
    expect(resolveIds({ clear: "c" }, "g")).toEqual({
      clear: "c",
      input: "g-input",
      results: "g-results",
    });
    expect(optionId("r", 2)).toBe("r-option-2");
  });
});

describe("arama koşulu ve sorgu", () => {
  it("minLength kırpılmış terimle", () => {
    expect(shouldSearch("a", 1)).toBe(true);
    expect(shouldSearch(" a ", 2)).toBe(false);
    expect(shouldSearch("ab", 2)).toBe(true);
    expect(shouldSearch("   ", 1)).toBe(false);
    expect(shouldSearch("", 0)).toBe(false);
  });

  it("sorgu: types, subGroups, yalnız aktif; kaynak cari çıkarılır", () => {
    expect(accountSearchQuery("acar", { types: ["SUPPLIER"], subGroups: ["TED"] })).toBe(
      "/finance/accounts?search=acar&types=SUPPLIER&subGroups=TED&active=true&size=20",
    );
    const hits = [{ id: "a" }, { id: "b" }];
    expect(filterHits(hits, "a")).toEqual([{ id: "b" }]);
    expect(filterHits(hits)).toEqual(hits);
    expect(filterHits(hits)).not.toBe(hits);
  });
});

describe("klavye", () => {
  it("nextIndex sınırlarda döner; Home/End; boş liste -1", () => {
    expect(nextIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextIndex(-1, "ArrowUp", 3)).toBe(2);
    expect(nextIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextIndex(2, "ArrowUp", 3)).toBe(1);
    expect(nextIndex(1, "Home", 3)).toBe(0);
    expect(nextIndex(1, "End", 3)).toBe(2);
    expect(nextIndex(5, "x", 3)).toBe(2);
    expect(nextIndex(0, "ArrowDown", 0)).toBe(-1);
  });

  it("Enter IME kuralı: isComposing ya da keyCode 229 → seçim yok", () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });

  it("Enter hedefi: seçili satır, yoksa ilk; sonuç yoksa -1", () => {
    expect(enterTarget(-1, 3)).toBe(0);
    expect(enterTarget(2, 3)).toBe(2);
    expect(enterTarget(7, 3)).toBe(0);
    expect(enterTarget(0, 0)).toBe(-1);
  });
});

describe("grup simgesi ve vurgulama", () => {
  it("atcs ad içinde, qca tam adla", () => {
    expect(groupIcon("atcs", "Müşteri")).toBe("fa-user-tie");
    expect(groupIcon("atcs", "Sevk Nakliye Firması")).toBe("fa-truck");
    expect(groupIcon("atcs", "TEDARİKÇİ")).toBe("fa-truck-loading");
    expect(groupIcon("atcs", "Malzeme Tedarikçisi")).toBe("fa-boxes");
    expect(groupIcon("atcs", null)).toBe("fa-user-tie");
    expect(groupIcon("qca", "Tedarikçi")).toBe("fa-truck-loading");
    expect(groupIcon("qca", "Nakliye Firması")).toBe("fa-shipping-fast");
    expect(groupIcon("qca", "Personel")).toBe("fa-id-badge");
    expect(groupIcon("qca", "Acente")).toBe("fa-tag");
    expect(groupIcon("listGroup", "Müşteri")).toBe("fa-user-tie");
  });

  it("Türkçe büyük/küçük harf ve aksan duyarsız; özgün harfler korunur", () => {
    expect(highlightParts("İSTANBUL Işık", "ist")).toEqual([
      { text: "İST", match: true },
      { text: "ANBUL Işık", match: false },
    ]);
    expect(highlightParts("Işık Lojistik", "isi")).toEqual([
      { text: "Işı", match: true },
      { text: "k Lojistik", match: false },
    ]);
    expect(highlightParts("ŞAHİN şahin", "sahin")).toEqual([
      { text: "ŞAHİN", match: true },
      { text: " ", match: false },
      { text: "şahin", match: true },
    ]);
    expect(highlightParts("Acar", "")).toEqual([{ text: "Acar", match: false }]);
    expect(highlightParts("", "a")).toEqual([]);
    expect(highlightParts("Acar", "x")).toEqual([{ text: "Acar", match: false }]);
  });
});
