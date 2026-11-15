import { describe, expect, it } from "vitest";
import {
  consumedKeys,
  paramNames,
  parseMethodParam,
  parseSettlementDeepLink,
  remainingSearch,
} from "./settlementDeepLink";

const q = (search: string) => new URLSearchParams(search);

describe("parseMethodParam", () => {
  it("ZTO metinleri (Türkçe, büyük/küçük harf duyarsız) ve Blackrose kodları", () => {
    expect(parseMethodParam("Nakit")).toBe("CASH");
    expect(parseMethodParam("BANKA")).toBe("BANK");
    expect(parseMethodParam("Banka Havalesi/Eft")).toBe("BANK");
    expect(parseMethodParam("Çek")).toBe("CHECK");
    expect(parseMethodParam("ÇEK")).toBe("CHECK");
    expect(parseMethodParam("cek")).toBe("CHECK");
    expect(parseMethodParam("Senet")).toBe("NOTE");
    expect(parseMethodParam("Kredi Kartı")).toBe("CREDIT_CARD");
    expect(parseMethodParam("KREDİ KARTI")).toBe("CREDIT_CARD");
    for (const code of ["CASH", "BANK", "CHECK", "NOTE", "CREDIT_CARD"]) {
      expect(parseMethodParam(code)).toBe(code);
    }
  });

  it("geçersiz / boş değer undefined", () => {
    expect(parseMethodParam("Diğer")).toBeUndefined();
    expect(parseMethodParam("OTHER")).toBeUndefined();
    expect(parseMethodParam("")).toBeUndefined();
    expect(parseMethodParam(null)).toBeUndefined();
    expect(parseMethodParam(undefined)).toBeUndefined();
  });
});

describe("parseSettlementDeepLink", () => {
  it("ödeme: cari + Yeni Ödeme + fon/iş yeri/para birimi/yöntem ön değerleri", () => {
    expect(
      parseSettlementDeepLink(
        "PAYMENT",
        q("id=a1&openModal=true&bankId=f1&workPlaceId=b1&currencyId=eur&paymentMethod=Banka"),
      ),
    ).toEqual({
      accountId: "a1",
      openAdd: true,
      editId: undefined,
      fundAccountId: "f1",
      branchId: "b1",
      currency: "EUR",
      method: "BANK",
      settlementId: undefined,
    });
  });

  it("kasa kimliği (cashId) ve tahsilat yöntemi adı", () => {
    const link = parseSettlementDeepLink(
      "COLLECTION",
      q("openModal=TRUE&cashId=k1&collectionMethod=Nakit&paymentMethod=Banka"),
    );
    expect(link).toMatchObject({ openAdd: true, fundAccountId: "k1", method: "CASH" });
  });

  it("düzenleme: openEditPayment + paymentId; düzenleme varsa Yeni açılmaz", () => {
    expect(
      parseSettlementDeepLink("PAYMENT", q("openEditPayment=true&paymentId=s1&openModal=true")),
    ).toMatchObject({ editId: "s1", openAdd: false });
    expect(
      parseSettlementDeepLink("COLLECTION", q("openEditCollection=true&collectionId=s2")),
    ).toMatchObject({ editId: "s2", openAdd: false });
    // Kimliksiz ya da bayraksız düzenleme yok sayılır; tür adları karışmaz.
    expect(parseSettlementDeepLink("PAYMENT", q("openEditPayment=true")).editId).toBeUndefined();
    expect(parseSettlementDeepLink("PAYMENT", q("paymentId=s1")).editId).toBeUndefined();
    expect(
      parseSettlementDeepLink("PAYMENT", q("openEditCollection=true&collectionId=s2")).editId,
    ).toBeUndefined();
  });

  it("settlementId detay; boş/geçersiz değerler yok sayılır", () => {
    expect(parseSettlementDeepLink("PAYMENT", q("settlementId=s9")).settlementId).toBe("s9");
    expect(
      parseSettlementDeepLink("PAYMENT", q("id=%20&openModal=false&paymentMethod=x&currencyId=")),
    ).toEqual({
      accountId: undefined,
      openAdd: false,
      editId: undefined,
      fundAccountId: undefined,
      branchId: undefined,
      currency: undefined,
      method: undefined,
      settlementId: undefined,
    });
  });
});

describe("URL'den silinen anahtarlar", () => {
  it("türe göre ZTO parametre adları", () => {
    expect(paramNames("PAYMENT")).toEqual({
      edit: "openEditPayment",
      editId: "paymentId",
      method: "paymentMethod",
    });
    expect(consumedKeys("COLLECTION")).toEqual([
      "id",
      "openModal",
      "openEditCollection",
      "collectionId",
      "bankId",
      "cashId",
      "workPlaceId",
      "currencyId",
      "collectionMethod",
      "settlementId",
    ]);
  });

  it("okunan anahtarlar silinir, diğerleri kalır; değişiklik yoksa null", () => {
    expect(remainingSearch("PAYMENT", q("id=a1&openModal=true&foo=1"))).toBe("foo=1");
    expect(remainingSearch("PAYMENT", q("settlementId=s1"))).toBe("");
    expect(remainingSearch("PAYMENT", q("foo=1&collectionMethod=Nakit"))).toBeNull();
    expect(remainingSearch("COLLECTION", q("collectionMethod=Nakit&x=2"))).toBe("x=2");
  });
});
