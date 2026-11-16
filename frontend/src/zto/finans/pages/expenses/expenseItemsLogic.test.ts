import { describe, expect, it } from "vitest";
import type { ExpenseItem } from "../../../../pages/finance/types";
import {
  activeItems,
  canSubmitName,
  errorCodeOf,
  evaluateName,
  findDuplicate,
  nameErrorText,
  nameSuccessText,
  sameName,
  submitNameStatus,
  submitTitle,
  suggestNames,
  toSaveRequest,
  trLower,
} from "./expenseItemsLogic";

function item(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "i1",
    expenseTypeId: "t1",
    expenseTypeName: "Genel",
    code: "MK-00001",
    name: "Kırtasiye",
    description: null,
    defaultUnit: null,
    active: true,
    system: false,
    createdAt: "2026-11-01T10:00:00",
    ...overrides,
  };
}

const ITEMS = [
  item({ id: "a", name: "İnternet" }),
  item({ id: "b", name: "Işık Gideri" }),
  item({ id: "c", name: "Kira" }),
  item({ id: "d", name: "Kırtasiye" }),
  item({ id: "e", name: "Kırmızı Kalem", active: false }),
];

describe("Türkçe harf kuralları", () => {
  it("İ/i ve I/ı doğru eşlenir", () => {
    expect(trLower("İNTERNET")).toBe("internet");
    expect(trLower("IŞIK")).toBe("ışık");
    expect(sameName("İnternet", " internet ")).toBe(true);
    expect(sameName("ışık gideri", "IŞIK GİDERİ")).toBe(true);
    // Türkçede "I" küçük harfi "ı"dır: INTERNET ≠ internet.
    expect(sameName("INTERNET", "internet")).toBe(false);
  });

  it("tekrar yalnız aktif kalemlerde ve kendisi hariç aranır", () => {
    expect(findDuplicate(ITEMS, "işık gideri")).toBeUndefined();
    expect(findDuplicate(ITEMS, "IŞIK GİDERİ")?.id).toBe("b");
    expect(findDuplicate(ITEMS, "kırmızı kalem")).toBeUndefined();
    expect(findDuplicate(ITEMS, "Kira", "c")).toBeUndefined();
    expect(findDuplicate(ITEMS, "  ")).toBeUndefined();
    expect(activeItems(ITEMS).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("öneriler", () => {
  it("aktiflerde içeren eşleşme; önce başlayanlar, en çok 10", () => {
    expect(suggestNames(ITEMS, "kı")).toEqual(["Kırtasiye"]);
    // Türkçe sıralama: ı, i'den önce gelir (Kırtasiye < Kira).
    expect(suggestNames(ITEMS, "i")).toEqual(["İnternet", "Işık Gideri", "Kırtasiye", "Kira"]);
    expect(suggestNames(ITEMS, "KIR")).toEqual(["Kırtasiye"]);
    expect(suggestNames(ITEMS, "")).toEqual([]);
    expect(suggestNames(ITEMS, "kira", "c")).toEqual([]);
    const many = Array.from({ length: 15 }, (_, i) => item({ id: `m${i}`, name: `Masraf ${i}` }));
    expect(suggestNames(many, "masraf")).toHaveLength(10);
  });
});

describe("ad durumu ve iletiler", () => {
  it("yeni kayıt", () => {
    expect(evaluateName(ITEMS, "", "new")).toBe("idle");
    expect(evaluateName(ITEMS, "Yakıt", "new")).toBe("available");
    expect(evaluateName(ITEMS, "kira", "new")).toBe("duplicate");
    expect(nameErrorText("duplicate", "kira", "new")).toBe(
      '"kira" masraf adı zaten mevcut! Lütfen farklı bir ad girin.',
    );
    expect(nameErrorText("suggested", "Kira", "new")).toBe(
      '"Kira" masraf adı zaten mevcut! Autocomplete\'ten seçtiğiniz isimler veritabanında bulunan kayıtlardır. Lütfen yeni bir ad girin.',
    );
    expect(nameSuccessText("available", " Yakıt ")).toBe('"Yakıt" masraf adı kullanılabilir.');
    expect(submitTitle("idle", "new")).toBe("Lütfen geçerli bir masraf adı girin");
    expect(submitTitle("available", "new")).toBe("Yeni masraf kalemi oluştur");
    expect(canSubmitName("available")).toBe(true);
    expect(canSubmitName("idle")).toBe(false);
  });

  it("düzenleme", () => {
    const original = ITEMS[2];
    expect(evaluateName(ITEMS, "Kira", "edit", original)).toBe("original");
    expect(evaluateName(ITEMS, "KIRTASİYE", "edit", original)).toBe("duplicate");
    expect(nameErrorText("duplicate", "Kırtasiye", "edit")).toBe(
      '"Kırtasiye" masraf adı başka bir kayıtta zaten mevcut! Lütfen farklı bir ad girin.',
    );
    expect(nameSuccessText("original", "Kira")).toBe("Mevcut masraf adı - değişiklik yapmadınız.");
    expect(submitTitle("duplicate", "edit")).toBeUndefined();
  });

  it("gönderim denetimi ZTO alert metinlerini verir", () => {
    expect(submitNameStatus(ITEMS, " ", "new")).toBe("empty");
    expect(nameErrorText("empty", "", "new")).toBe("Lütfen bir masraf adı girin!");
    expect(submitNameStatus(ITEMS, "Kira", "new")).toBe("invalid");
    expect(nameErrorText("invalid", "Kira", "new")).toBe(
      "Lütfen geçerli ve mevcut olmayan bir masraf adı girin!",
    );
    expect(submitNameStatus(ITEMS, "Yakıt", "new")).toBe("available");
  });
});

describe("istek gövdesi", () => {
  it("yeni kayıtta kod yok; düzenlemede mevcut kod; boşlar null", () => {
    const values = { expenseTypeId: "t1", name: " Yakıt ", description: " ", defaultUnit: "Litre" };
    expect(toSaveRequest(values)).toEqual({
      expenseTypeId: "t1",
      name: "Yakıt",
      description: null,
      defaultUnit: "Litre",
    });
    expect(toSaveRequest(values, item({ code: "MK-00007" }))).toMatchObject({ code: "MK-00007" });
  });

  it("hata kodu", () => {
    expect(errorCodeOf({ body: { code: "EXPENSE_ITEM_NAME_EXISTS" } })).toBe(
      "EXPENSE_ITEM_NAME_EXISTS",
    );
    expect(errorCodeOf(new Error("x"))).toBeNull();
    expect(errorCodeOf(null)).toBeNull();
  });
});
