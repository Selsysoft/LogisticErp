import { describe, expect, it } from "vitest";
import type { AccountDocumentType } from "../../../../pages/finance/types";
import type { BranchTree } from "../../../branch/branchTree";
import {
  addressOf,
  branchIdsOf,
  compareNatural,
  computeSubcontract,
  currencyBreakdown,
  deleteActionOf,
  documentTypeOptions,
  filterOptions,
  filterStateOf,
  financeLines,
  financeOf,
  financeTotals,
  formFromRow,
  formatN0,
  parseDays,
  reasonError,
  toSaveRequest,
  validateSubcontract,
  vehicleNo,
  type SubcontractForm,
} from "./subcontractLogic";
import { makeRow } from "./subcontractTestUtils";

const FORM: SubcontractForm = {
  amount: "10000",
  currency: "TRY",
  exchangeRate: "",
  vatAmount: "2000",
  withholdingAmount: "400",
  deductionAmount: "100",
  documentNo: " FTR-1 ",
  documentType: "ALIS_FATURASI",
  costDate: "2026-11-11",
  description: "",
};

describe("biçim", () => {
  it("N0 + simge; kırılım ve boş kırılım", () => {
    expect(formatN0("1234.56", "TRY")).toBe("1.235 ₺");
    expect(formatN0(null, "USD")).toBe("0 $");
    expect(
      currencyBreakdown([
        { currency: "TRY", amount: "1500" },
        { currency: "EUR", amount: "20.4" },
      ]),
    ).toBe("1.500 ₺ / 20 €");
    expect(currencyBreakdown([])).toBe("0 ₺");
  });

  it("araç no, doğal sıralama ve adres", () => {
    expect(vehicleNo(makeRow({ legSequenceNo: 2 }))).toBe("SF-2026-0007/2");
    expect(compareNatural("S-2/10", "S-2/9")).toBeGreaterThan(0);
    expect(addressOf("İzmir", "Konak")).toBe("İzmir / Konak");
    expect(addressOf(null, " Konak ")).toBe("Konak");
    expect(addressOf(null, "")).toBeNull();
  });
});

describe("finansal bilgiler", () => {
  it("kalan = toplam − tevkifat; bakiye = ödenecek; gider yoksa 0", () => {
    expect(financeOf(makeRow())).toMatchObject({
      total: "12000.00",
      remaining: "11600.00",
      balance: "11500.00",
      advance: "0.00",
    });
    const empty = financeOf(
      makeRow({
        costId: null,
        status: null,
        money: null,
        vatAmount: null,
        withholdingAmount: null,
        deductionAmount: null,
        totalAmount: null,
        payableAmount: null,
        advanceAmount: null,
      }),
    );
    expect(empty).toMatchObject({ vat: "0.00", total: "0.00", balance: "0.00" });
  });

  it("para birimi başına toplam ve tooltip satırları", () => {
    const totals = financeTotals([
      makeRow(),
      makeRow({ legId: "l2" }),
      makeRow({
        legId: "l3",
        money: { amount: "100.00", currency: "USD" },
        vatAmount: "0.00",
        withholdingAmount: "0.00",
        deductionAmount: "0.00",
        totalAmount: "100.00",
        payableAmount: "100.00",
      }),
      makeRow({ legId: "l4", money: null, costId: null }),
    ]);
    expect(totals.get("TRY")?.balance).toBe("23000.00");
    const lines = financeLines(totals);
    expect(lines.map((line) => line.key)).toEqual([
      "vat",
      "withholding",
      "total",
      "advance",
      "remaining",
      "deduction",
      "balance",
    ]);
    expect(lines.find((line) => line.key === "balance")?.value).toBe("23.000 ₺ / 100 $");
    expect(financeLines(new Map())[0].value).toBe("0 ₺");
  });
});

describe("silme kararı", () => {
  it("POSTED ters kayıt, OPEN silme, diğerleri düğmesiz", () => {
    expect(deleteActionOf(makeRow())).toBe("reverse");
    expect(deleteActionOf(makeRow({ status: "OPEN" }))).toBe("delete");
    expect(deleteActionOf(makeRow({ status: "REVERSED" }))).toBeNull();
    expect(deleteActionOf(makeRow({ costId: null, status: null }))).toBeNull();
  });

  it("gerekçe yalnız ters kayıtta zorunlu", () => {
    expect(reasonError("reverse", "  ")).toBe("reasonRequired");
    expect(reasonError("reverse", "x".repeat(501))).toBe("reasonRequired");
    expect(reasonError("reverse", "Yanlış tutar")).toBeNull();
    expect(reasonError("delete", "")).toBeNull();
  });
});

describe("modal formu", () => {
  it("satırdan ilk değerler; belge tarihi costDate ?? yükleme ?? bugün", () => {
    const form = formFromRow(makeRow(), "2026-11-16");
    expect(form).toMatchObject({ amount: "10000.00", currency: "TRY", exchangeRate: "" });
    expect(form.costDate).toBe("2026-11-11");
    const open = formFromRow(
      makeRow({
        costId: null,
        status: null,
        money: null,
        vatAmount: null,
        documentType: null,
        costDate: null,
        exchangeRate: null,
      }),
      "2026-11-16",
    );
    expect(open).toMatchObject({
      amount: "",
      currency: "TRY",
      vatAmount: "0",
      documentType: "ALIS_FATURASI",
      costDate: "2026-11-10",
    });
    expect(formFromRow(makeRow({ loadingDate: null, costDate: null }), "2026-11-16").costDate).toBe(
      "2026-11-16",
    );
    const usd = formFromRow(
      makeRow({ money: { amount: "5", currency: "USD" }, exchangeRate: "34.5" }),
      "x",
    );
    expect(usd.exchangeRate).toBe("34.5");
  });

  it("toplam / kalan / bakiye", () => {
    expect(computeSubcontract(FORM)).toEqual({
      total: "12000.00",
      advance: "0.00",
      remaining: "11600.00",
      balance: "11500.00",
    });
    expect(computeSubcontract({ ...FORM, vatAmount: "", deductionAmount: "abc" }).balance).toBe(
      "9600.00",
    );
  });

  it("doğrulama sırası: para birimi, tutar, kur, negatif, tevkifat ≤ KDV, bakiye, tarih", () => {
    expect(validateSubcontract({ ...FORM, currency: "" })?.key).toBe("currency");
    expect(validateSubcontract({ ...FORM, amount: "" })?.key).toBe("amount");
    expect(validateSubcontract({ ...FORM, amount: "0" })?.field).toBe("amount");
    expect(validateSubcontract({ ...FORM, currency: "USD", exchangeRate: "0" })?.key).toBe("rate");
    expect(validateSubcontract({ ...FORM, currency: "USD", exchangeRate: "" })).toBeNull();
    expect(validateSubcontract({ ...FORM, vatAmount: "-1" })).toEqual({
      field: "vatAmount",
      key: "negative",
    });
    expect(validateSubcontract({ ...FORM, withholdingAmount: "2000.01" })).toEqual({
      field: "withholdingAmount",
      key: "withholding",
    });
    expect(validateSubcontract({ ...FORM, deductionAmount: "11600" })?.key).toBe("balance");
    expect(validateSubcontract({ ...FORM, costDate: "" })?.key).toBe("costDate");
    expect(validateSubcontract(FORM)).toBeNull();
  });

  it("istek gövdesi: boşlar null, TRY'de kur yok, transportMode gönderilmez", () => {
    expect(toSaveRequest(FORM)).toEqual({
      money: { amount: "10000", currency: "TRY" },
      vatAmount: "2000",
      withholdingAmount: "400",
      deductionAmount: "100",
      documentNo: "FTR-1",
      documentType: "ALIS_FATURASI",
      costDate: "2026-11-11",
      exchangeRate: null,
      description: null,
    });
    const usd = toSaveRequest({ ...FORM, currency: "USD", exchangeRate: "34.5", vatAmount: "" });
    expect(usd.exchangeRate).toBe("34.5");
    expect(usd.vatAmount).toBe("0");
  });

  it("belge türleri: PAYABLE + OTHER + seçilebilir, sortOrder sırası", () => {
    const type = (overrides: Partial<AccountDocumentType>): AccountDocumentType => ({
      side: "PAYABLE",
      code: "X",
      name: "X",
      audience: "OTHER",
      invoiceSection: false,
      penalty: false,
      isDefault: false,
      selectable: true,
      sortOrder: 0,
      ...overrides,
    });
    const result = documentTypeOptions([
      type({ code: "B", sortOrder: 2 }),
      type({ code: "A", sortOrder: 1 }),
      type({ code: "R", side: "RECEIVABLE" }),
      type({ code: "C", audience: "CUSTOMER" }),
      type({ code: "N", selectable: false }),
    ]);
    expect(result.map((item) => item.code)).toEqual(["A", "B"]);
    expect(documentTypeOptions(undefined)).toEqual([]);
  });
});

describe("şube / iş yeri süzgeci", () => {
  const tree: BranchTree = [
    {
      companyId: "c1",
      companyName: "Acme",
      companyActive: true,
      groups: [
        {
          groupId: "g1",
          groupName: "İzmir",
          groupActive: true,
          branches: [
            { id: "b1", code: "1", name: "Merkez", active: true },
            { id: "b2", code: "2", name: "Liman", active: true },
            { id: "b9", code: "9", name: "Kapalı", active: false },
          ],
        },
        {
          groupId: null,
          groupName: "Diğer",
          groupActive: true,
          branches: [{ id: "b3", code: "3", name: "Depo", active: true }],
        },
      ],
    },
  ];
  const options = filterOptions(tree);

  it("seçenekler: pasif iş yeri yok, grupsuzlar ayrı anahtar", () => {
    expect(options.groups.map((g) => [g.key, g.name, g.branchIds])).toEqual([
      ["g1", "İzmir", ["b1", "b2"]],
      ["none:c1", "Diğer", ["b3"]],
    ]);
    expect(options.workPlaces.map((w) => w.id)).toEqual(["b1", "b2", "b3"]);
    const multi = filterOptions([...tree, { ...tree[0], companyId: "c2", companyName: "Beta" }]);
    expect(multi.groups[0].name).toBe("Acme › İzmir");
    expect(filterOptions(undefined).groups).toEqual([]);
  });

  it("URL branchIds ↔ seçim", () => {
    expect(filterStateOf(options, [])).toEqual({ groupKey: "", workPlaceId: "" });
    expect(filterStateOf(options, ["b2"])).toEqual({ groupKey: "g1", workPlaceId: "b2" });
    expect(filterStateOf(options, ["b2", "b1"])).toEqual({ groupKey: "g1", workPlaceId: "" });
    expect(filterStateOf(options, ["b3"])).toEqual({ groupKey: "none:c1", workPlaceId: "" });
    expect(filterStateOf(options, ["zz"])).toEqual({ groupKey: "", workPlaceId: "" });
    expect(branchIdsOf(options, { groupKey: "g1", workPlaceId: "" })).toEqual(["b1", "b2"]);
    expect(branchIdsOf(options, { groupKey: "g1", workPlaceId: "b1" })).toEqual(["b1"]);
    expect(branchIdsOf(options, { groupKey: "", workPlaceId: "" })).toEqual([]);
    expect(branchIdsOf(options, { groupKey: "yok", workPlaceId: "" })).toEqual([]);
  });

  it("gün: 1–365, aksi halde 150", () => {
    expect(parseDays("30")).toBe(30);
    expect(parseDays(null)).toBe(150);
    expect(parseDays("0")).toBe(150);
    expect(parseDays("366")).toBe(150);
    expect(parseDays("1.5")).toBe(150);
    expect(parseDays(" 365 ")).toBe(365);
  });
});
