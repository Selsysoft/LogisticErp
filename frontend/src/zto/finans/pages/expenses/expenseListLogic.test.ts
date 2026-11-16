import { describe, expect, it } from "vitest";
import type { ExpenseItemSummary } from "../../../../pages/finance/types";
import {
  branchHeader,
  branchIdsOf,
  currencyClass,
  currencyOptionText,
  dateSortKey,
  filterCategoryCards,
  footerTotal,
  groupByCurrency,
  isPositive,
  moneyText,
  moneyTextN0,
  reverseDateOf,
  sortInvoices,
  totalInvoiceCount,
  totalsByCurrency,
  truncateName,
} from "./expenseListLogic";

function summary(overrides: Partial<ExpenseItemSummary> = {}): ExpenseItemSummary {
  return {
    expenseItemId: "i1",
    expenseItemName: "Kırtasiye",
    expenseItemCode: "MK-00001",
    expenseTypeName: "Genel",
    lastSupplierAccountId: null,
    lastSupplierName: null,
    lastSupplierTaxNumberMasked: null,
    lastSupplierPhone: null,
    lastSupplierCity: null,
    branchNames: ["Merkez"],
    invoiceCount: 1,
    totals: [{ currency: "TRY", count: 1, totalAmount: "100.10" }],
    lastInvoiceDate: "2026-11-02",
    ...overrides,
  };
}

describe("para birimi kırılımı", () => {
  it("kalemler para birimi başına toplanır, ₺ ile karışmaz; TRY önce", () => {
    const rows = [
      summary({
        invoiceCount: 3,
        totals: [
          { currency: "USD", count: 1, totalAmount: "10.00" },
          { currency: "TRY", count: 2, totalAmount: "0.10" },
        ],
      }),
      summary({
        expenseItemId: "i2",
        invoiceCount: 2,
        totals: [
          { currency: "TRY", count: 1, totalAmount: "0.20" },
          { currency: "EUR", count: 1, totalAmount: "5" },
        ],
      }),
    ];
    expect(totalsByCurrency(rows)).toEqual([
      { currency: "TRY", count: 3, totalAmount: "0.30" },
      { currency: "EUR", count: 1, totalAmount: "5.00" },
      { currency: "USD", count: 1, totalAmount: "10.00" },
    ]);
    expect(totalInvoiceCount(rows)).toBe(5);
  });

  it('"Karışık" kuralı: tek para biriminde toplam, birden çoksa karışık', () => {
    expect(footerTotal([])).toEqual({ kind: "empty" });
    expect(
      footerTotal([
        { currency: "TRY", totalAmount: "0.10" },
        { currency: "TRY", totalAmount: "0.20" },
      ]),
    ).toEqual({ kind: "single", currency: "TRY", amount: "0.30" });
    expect(
      footerTotal([
        { currency: "TRY", totalAmount: "1" },
        { currency: "USD", totalAmount: "1" },
      ]),
    ).toEqual({ kind: "mixed" });
    expect(
      groupByCurrency([
        { currency: "USD", totalAmount: "2" },
        { currency: "USD", totalAmount: "3.5" },
      ]),
    ).toEqual([{ currency: "USD", count: 2, totalAmount: "5.50" }]);
  });

  it("biçimler", () => {
    expect(moneyText("1234.5", "TRY")).toBe("1.234,50 ₺");
    expect(moneyText("10", "USD")).toBe("10,00 $");
    expect(moneyTextN0("1234.5", "EUR")).toBe("1.235 €");
    expect(currencyClass("USD")).toBe("USD");
    expect(currencyClass("CHF")).toBe("TRY");
    expect(currencyOptionText({ currency: "EUR", count: 2, totalAmount: "1" })).toBe(
      "EUR (€) - 2 fatura",
    );
    expect(isPositive("0.0001")).toBe(true);
    expect(isPositive("0")).toBe(false);
    expect(isPositive(null)).toBe(false);
  });
});

describe("yardımcılar", () => {
  it("ad kısaltma 35 karakter", () => {
    const long = "A".repeat(36);
    expect(truncateName(long)).toBe(`${"A".repeat(32)}...`);
    expect(truncateName("A".repeat(35))).toBe("A".repeat(35));
  });

  it("sıralama anahtarı ve ters kayıt tarihi", () => {
    expect(dateSortKey("2026-11-02")).toBe("20261102");
    expect(dateSortKey(null)).toBe("");
    expect(reverseDateOf("2026-11-16", "2026-11-01")).toBe("2026-11-16");
    expect(reverseDateOf("2026-11-16", "2026-12-01")).toBe("2026-12-01");
    expect(branchIdsOf("")).toBeUndefined();
    expect(branchIdsOf("b1")).toEqual(["b1"]);
  });

  it("özet kartı araması Türkçe harf duyarsız; ad, kod ve tutar", () => {
    const rows = [
      summary({ expenseItemId: "a", expenseItemName: "IŞIK Gideri", expenseItemCode: "MK-1" }),
      summary({ expenseItemId: "b", expenseItemName: "İnternet", expenseItemCode: "MK-2" }),
      summary({
        expenseItemId: "c",
        expenseItemName: "Kira",
        expenseItemCode: "MK-3",
        totals: [{ currency: "TRY", count: 1, totalAmount: "4500.00" }],
      }),
    ];
    expect(filterCategoryCards(rows, "ışık").map((x) => x.expenseItemId)).toEqual(["a"]);
    expect(filterCategoryCards(rows, "internet").map((x) => x.expenseItemId)).toEqual(["b"]);
    expect(filterCategoryCards(rows, "mk-3").map((x) => x.expenseItemId)).toEqual(["c"]);
    expect(filterCategoryCards(rows, "4.500").map((x) => x.expenseItemId)).toEqual(["c"]);
    expect(filterCategoryCards(rows, " ")).toHaveLength(3);
  });

  it("faturalar oluşturma zamanına göre azalan", () => {
    const base = {
      invoiceNumber: null,
      description: null,
      expenseItemId: "i1",
      expenseItemName: "Kira",
      expenseTypeName: "Genel",
      department: "ADMIN" as const,
      companyId: "c1",
      branchId: "b1",
      branchName: "Merkez",
      contextType: "GENERAL" as const,
      contextLabel: null,
      paymentMethod: "ACCOUNT" as const,
      supplierName: null,
      currency: "TRY",
      totalAmount: "1",
      tlAmount: "1",
      dueDate: null,
      documentType: "ALIS_FATURASI",
      hasDocument: false,
    };
    const sorted = sortInvoices([
      { ...base, id: "x", invoiceDate: "2026-11-01", createdAt: "2026-11-01T09:00:00" },
      { ...base, id: "y", invoiceDate: "2026-10-01", createdAt: "2026-11-02T09:00:00" },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["y", "x"]);
  });

  it("şube başlığı ağaçtan", () => {
    const tree = [
      {
        companyId: "c1",
        companyName: "Acme",
        companyActive: true,
        groups: [
          {
            groupId: "g1",
            groupName: "İzmir",
            groupActive: true,
            branches: [{ id: "b1", code: "IY-1", name: "Alsancak", active: true }],
          },
        ],
      },
    ];
    expect(branchHeader(tree, "b1")).toEqual({ groupName: "İzmir", branchName: "Alsancak" });
    expect(branchHeader(tree, "")).toEqual({ groupName: "", branchName: "" });
    expect(branchHeader(undefined, "b1")).toEqual({ groupName: "", branchName: "" });
  });
});
