import { describe, expect, it } from "vitest";
import type { AccountDocument } from "../../../../pages/finance/types";
import {
  documentFormSchema,
  emptyDocumentValues,
  numberOf,
  remainingAfterSave,
  summaryError,
  toDocumentBody,
  unreflectedInvoiceAmount,
  valuesFromDocument,
} from "./documentLogic";
import { apiErrorOf, sourceRouteOf } from "./transactionsLogic";

const base = emptyDocumentValues({
  date: "2026-03-01",
  documentType: "ALIS_FATURASI",
  currency: "TRY",
  branchId: "b1",
});

describe("belge formu", () => {
  it("boş değerler ZTO varsayılanlarıyla (KDV %20, yansıt işaretli)", () => {
    expect(base).toMatchObject({
      vatRate: "20",
      discountRate: "0",
      reflectToLedger: true,
      documentNo: "",
      amount: "",
    });
  });

  it("doğrulama iletileri: para birimi, zorunlu, tutar", () => {
    const empty = documentFormSchema.safeParse({ ...base, currency: "" });
    expect(empty.success).toBe(false);
    const errors = (r: ReturnType<typeof documentFormSchema.safeParse>) =>
      Object.fromEntries(
        (r.success ? [] : r.error.issues).map((i) => [String(i.path[0]), { message: i.message }]),
      );
    expect(summaryError(errors(empty))).toBe("errCurrency");
    expect(summaryError(errors(documentFormSchema.safeParse(base)))).toBe("errRequired");
    const zero = documentFormSchema.safeParse({
      ...base,
      documentNo: "F1",
      amount: "0",
      paymentMethod: "CASH",
    });
    expect(summaryError(errors(zero))).toBe("errAmount");
    expect(summaryError({})).toBeNull();
    expect(
      documentFormSchema.safeParse({
        ...base,
        documentNo: "F1",
        amount: "10",
        paymentMethod: "CASH",
      }).success,
    ).toBe(true);
    expect(
      documentFormSchema.safeParse({
        ...base,
        documentNo: "F1",
        amount: "10",
        paymentMethod: "CASH",
        vatRate: "120",
      }).success,
    ).toBe(false);
  });

  it("sayı: virgül, boş, geçersiz", () => {
    expect(numberOf("12,5")).toBe(12.5);
    expect(numberOf("")).toBe(0);
    expect(numberOf(null)).toBe(0);
    expect(numberOf("x")).toBeNaN();
  });

  it("gövde: fatura bölümünde vergi + yansıt; değilse yok; boş vade/açıklama atılır", () => {
    const values = {
      ...base,
      documentNo: " F1 ",
      amount: "100",
      paymentMethod: "BANK",
      discountRate: "5",
      dueDate: "2026-04-01",
      description: " not ",
    };
    expect(toDocumentBody(values, "PAYABLE", true)).toEqual({
      side: "PAYABLE",
      documentType: "ALIS_FATURASI",
      documentNo: "F1",
      documentDate: "2026-03-01",
      dueDate: "2026-04-01",
      amount: 100,
      currency: "TRY",
      paymentMethod: "BANK",
      branchId: "b1",
      description: "not",
      reflectToLedger: true,
      tax: { discountRate: 5, vatRate: 20, withholdingAmount: 0, otherTaxesAmount: 0 },
    });
    const plain = toDocumentBody({ ...values, dueDate: "", description: "" }, "RECEIVABLE", false);
    expect(plain.tax).toBeUndefined();
    expect(plain.reflectToLedger).toBeUndefined();
    expect(plain.dueDate).toBeUndefined();
    expect(plain.description).toBeUndefined();
  });

  it("revize: belgeden değerler", () => {
    const doc = {
      documentDate: "2026-01-01",
      documentNo: "X",
      documentType: "SATIS_FATURASI",
      dueDate: null,
      amount: 50,
      currency: "USD",
      paymentMethod: "CASH",
      branchId: "b2",
      description: null,
      reflectToLedger: false,
      tax: null,
    } as unknown as AccountDocument;
    expect(valuesFromDocument(doc)).toMatchObject({
      amount: "50",
      dueDate: "",
      description: "",
      vatRate: "20",
      reflectToLedger: false,
    });
    expect(
      valuesFromDocument({
        ...doc,
        tax: { discountRate: 3, vatRate: 10, withholdingAmount: 1, otherTaxesAmount: 2 },
      } as unknown as AccountDocument),
    ).toMatchObject({
      discountRate: "3",
      vatRate: "10",
      withholdingAmount: "1",
      otherTaxesAmount: "2",
    });
  });
});

describe("hata yardımcıları", () => {
  it("ApiError benzeri gövde; ağ hatasında null", () => {
    expect(
      apiErrorOf({ status: 409, body: { code: "X", message: "m", details: ["route=/a"] } }),
    ).toEqual({ status: 409, code: "X", message: "m", details: ["route=/a"] });
    expect(apiErrorOf({ status: 400, body: {} })).toEqual({
      status: 400,
      code: "",
      message: "",
      details: [],
    });
    expect(apiErrorOf(new TypeError("fetch"))).toBeNull();
    expect(apiErrorOf(null)).toBeNull();
  });

  it("kaynak rotası ayrıştırma", () => {
    expect(sourceRouteOf(["route=/operations/shipments/1"])).toBe("/operations/shipments/1");
    expect(sourceRouteOf(["x", "route: /fleet/vehicles/2"])).toBe("/fleet/vehicles/2");
    expect(sourceRouteOf(["/finance/instruments"])).toBe("/finance/instruments");
    expect(sourceRouteOf(["//evil.com"])).toBeNull();
    expect(sourceRouteOf([])).toBeNull();
  });
});

describe("12.2 eksik fatura: bu belge kaydedilince kalan (§5.14)", () => {
  const invoice = { countsAsInvoice: true, reflect: false, net: 30 };

  it("yalnız yansıtılmayan fatura belgesi eksiği azaltır", () => {
    expect(unreflectedInvoiceAmount(invoice)).toBe(30);
    expect(unreflectedInvoiceAmount({ ...invoice, reflect: true })).toBe(0);
    expect(unreflectedInvoiceAmount({ ...invoice, countsAsInvoice: false })).toBe(0);
    expect(unreflectedInvoiceAmount({ ...invoice, net: Number.NaN })).toBe(0);
    expect(unreflectedInvoiceAmount({ ...invoice, net: -5 })).toBe(0);
  });

  it("kalan = eksik − yeni katkı (+ revizede eski katkı); eksiye düşmez", () => {
    expect(remainingAfterSave(50, invoice)).toBe(20);
    expect(remainingAfterSave(50, { ...invoice, reflect: true })).toBe(50);
    expect(remainingAfterSave(50, { ...invoice, net: 80 })).toBe(0);
    expect(
      remainingAfterSave(50, invoice, { countsAsInvoice: true, reflect: false, net: 30 }),
    ).toBe(50);
    expect(remainingAfterSave(50, invoice, null)).toBe(20);
  });
});
