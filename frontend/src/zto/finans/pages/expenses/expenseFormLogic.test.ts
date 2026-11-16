import { describe, expect, it } from "vitest";
import type {
  AccountDocumentType,
  ExpenseDetail,
  ExpenseItem,
} from "../../../../pages/finance/types";
import {
  FIELD_IDS,
  computeLine,
  computeTotals,
  documentTypeOptions,
  emptyLine,
  formatFileSize,
  initialState,
  itemOptionsFor,
  lineFieldId,
  serverErrorField,
  stateFromDetail,
  toRequest,
  validateFile,
  validateForm,
  type ExpenseFormState,
  type LineInput,
} from "./expenseFormLogic";

/** Sunucu `ExpenseCalculatorTest` ile aynı sıra: miktar, fiyat, iskonto %, KDV %, tevkifat, diğer. */
function line(
  quantity: string,
  unitPrice: string,
  discountRate: string,
  vatRate: string,
  withholdingAmount: string,
  otherTaxAmount: string,
): LineInput {
  return {
    ...emptyLine(),
    quantity,
    unitPrice,
    discountRate,
    vatRate,
    withholdingAmount,
    otherTaxAmount,
  };
}

function validState(overrides: Partial<ExpenseFormState> = {}): ExpenseFormState {
  return {
    ...initialState("2026-11-16"),
    expenseTypeId: "t1",
    expenseItemId: "i1",
    paymentMethod: "ACCOUNT",
    supplierAccountId: "a1",
    supplierLabel: "S-1 - Tedarikçi",
    department: "FLEET",
    branchId: "b1",
    lines: [line("2", "100", "10", "20", "4", "5")],
    ...overrides,
  };
}

const fields = (state: ExpenseFormState, mode: "new" | "edit" = "new") =>
  validateForm(state, mode).map((error) => `${error.field}:${error.message}`);

describe("computeLine / computeTotals (§3.2.3, ExpenseCalculatorTest örnekleri)", () => {
  it("iki satır: ara sonuçlar ve başlık toplamları; diğer vergiler eklenir", () => {
    const first = computeLine(line("2", "100", "10", "20", "4", "5"));
    expect(first).toEqual({
      subTotal: "200.00",
      discountAmount: "20.00",
      netAmount: "180.00",
      vatAmount: "36.00",
      totalAmount: "217.00",
    });
    const second = computeLine(line("1", "50.5", "0", "10", "0", "0"));
    expect(second.vatAmount).toBe("5.05");
    expect(second.totalAmount).toBe("55.55");
    expect(
      computeTotals([
        line("2", "100", "10", "20", "4", "5"),
        line("1", "50.5", "0", "10", "0", "0"),
      ]),
    ).toEqual({
      subTotal: "250.50",
      discountAmount: "20.00",
      netAmount: "230.50",
      vatAmount: "41.05",
      withholdingAmount: "4.00",
      otherTaxAmount: "5.00",
      totalAmount: "272.55",
    });
  });

  it("HALF_UP sınırları (0.005), %0/%100 iskonto, tevkifat = KDV", () => {
    expect(computeLine(line("1", "0.005", "0", "0", "0", "0")).subTotal).toBe("0.01");
    expect(computeLine(line("1", "0.004", "0", "0", "0", "0")).subTotal).toBe("0.00");
    expect(computeLine(line("1", "10.05", "0", "10", "0", "0")).vatAmount).toBe("1.01");
    const discount = computeLine(line("1", "3.33", "50", "0", "0", "0"));
    expect(discount.discountAmount).toBe("1.67");
    expect(discount.netAmount).toBe("1.66");
    expect(computeLine(line("3", "10", "0", "20", "0", "0")).totalAmount).toBe("36.00");
    const full = computeLine(line("3", "10", "100", "20", "0", "0"));
    expect([full.netAmount, full.vatAmount, full.totalAmount]).toEqual(["0.00", "0.00", "0.00"]);
    expect(computeLine(line("1", "100", "0", "20", "20", "0")).totalAmount).toBe("100.00");
  });

  it("boş ve geçersiz girdi gösterimde 0 sayılır", () => {
    expect(computeLine(line("2", "5", "", "", "", "")).totalAmount).toBe("10.00");
    expect(computeLine(line("abc", "5", "0", "20", "0", "0")).subTotal).toBe("0.00");
    expect(computeTotals([]).totalAmount).toBe("0.00");
  });
});

describe("validateForm", () => {
  it("geçerli form hatasız; edit'te gerekçe zorunlu", () => {
    expect(fields(validState())).toEqual([]);
    expect(fields(validState(), "edit")).toEqual(["ReviseReason:reasonRequired"]);
    expect(fields(validState({ reason: "x".repeat(501) }), "edit")).toEqual([
      "ReviseReason:reasonTooLong",
    ]);
  });

  it("zorunlu üst alanlar DOM sırasıyla", () => {
    const state = validState({
      expenseTypeId: "",
      expenseItemId: "",
      supplierAccountId: "",
      currency: "",
      department: "",
      branchId: "",
      invoiceDate: "",
      documentType: "",
    });
    expect(fields(state)).toEqual([
      "expenseTypeId:expenseTypeRequired",
      "expenseItemId:expenseItemRequired",
      "supplierAccountSearch:supplierRequired",
      "CurrencyID:currencyRequired",
      "Department:departmentRequired",
      "WorkPlaceID:branchRequired",
      "CreationDate:invoiceDateRequired",
      "DocumentType:documentTypeRequired",
    ]);
  });

  it("ödeme şekli: Nakit/Banka'da kasa/banka zorunlu, ödeme şekli boşsa ileti", () => {
    expect(fields(validState({ paymentMethod: "CASH", supplierAccountId: "" }))).toEqual([
      "fundAccountId:fundRequired",
    ]);
    expect(fields(validState({ paymentMethod: "BANK", fundAccountId: "f1" }))).toEqual([]);
    expect(fields(validState({ paymentMethod: "" }))).toEqual([
      "paymentMethod:paymentMethodRequired",
    ]);
  });

  it("kur, vade, bağlam ve uzunluklar", () => {
    expect(fields(validState({ currency: "USD", exchangeRate: "0" }))).toEqual([
      "ExchangeRate:exchangeRateInvalid",
    ]);
    expect(fields(validState({ currency: "USD", exchangeRate: "" }))).toEqual([]);
    expect(fields(validState({ currency: "TRY", exchangeRate: "0" }))).toEqual([]);
    expect(fields(validState({ dueDate: "2026-11-15" }))).toEqual(["DueDate:dueDateBeforeInvoice"]);
    expect(fields(validState({ dueDate: "2026-11-16" }))).toEqual([]);
    expect(fields(validState({ contextType: "VEHICLE" }))).toEqual(["contextId:contextRequired"]);
    expect(fields(validState({ contextType: "VEHICLE", contextId: "v1" }))).toEqual([]);
    expect(
      fields(validState({ invoiceNumber: "x".repeat(51), description: "y".repeat(501) })),
    ).toEqual(["InvoiceNumber:invoiceNumberTooLong", "Description:descriptionTooLong"]);
  });

  it("satırlar: en az bir, en çok 100, alan kuralları, tevkifat > KDV, toplam > 0", () => {
    expect(fields(validState({ lines: [] }))).toEqual(["expenseDetailsContainer:linesRequired"]);
    expect(
      fields(
        validState({
          lines: Array.from({ length: 101 }, () => line("1", "1", "0", "0", "0", "0")),
        }),
      ),
    ).toEqual(["expenseDetailsContainer:linesTooMany"]);
    expect(fields(validState({ lines: [line("0", "", "101", "", "-1", "x")] }))).toEqual([
      `${lineFieldId(0, "quantity")}:quantityInvalid`,
      `${lineFieldId(0, "unitPrice")}:unitPriceInvalid`,
      `${lineFieldId(0, "discountRate")}:rateInvalid`,
      `${lineFieldId(0, "vatRate")}:vatRateInvalid`,
      `${lineFieldId(0, "withholdingAmount")}:amountNegative`,
      `${lineFieldId(0, "otherTaxAmount")}:amountNegative`,
    ]);
    expect(
      fields(
        validState({
          lines: [line("1", "10", "0", "20", "0", "0"), line("1", "100", "0", "20", "20.01", "0")],
        }),
      ),
    ).toEqual([`${lineFieldId(1, "withholdingAmount")}:withholdingExceedsVat`]);
    expect(fields(validState({ lines: [line("1", "0", "0", "20", "0", "0")] }))).toEqual([
      "expenseDetailsContainer:totalInvalid",
    ]);
    expect(fields(validState({ lines: [line("1", "1", "0", "20", "0", "0")] }))).toEqual([]);
  });
});

describe("toRequest", () => {
  it("yalnız girdi alanları; ACCOUNT'ta fon yok, GENERAL'de bağlam kimliği yok, TRY'de kur yok", () => {
    const body = toRequest(
      validState({
        invoiceNumber: " FTR-1 ",
        description: "  ",
        dueDate: "2026-12-01",
        fundAccountId: "f-stale",
        exchangeRate: "35",
        lines: [{ ...line("2", "100", "", "20", "", "5"), description: "Lastik", unit: " adet " }],
      }),
    );
    expect(body).toEqual({
      branchId: "b1",
      expenseItemId: "i1",
      contextType: "GENERAL",
      vehicleId: null,
      shipmentId: null,
      warehouseId: null,
      driverId: null,
      paymentMethod: "ACCOUNT",
      supplierAccountId: "a1",
      fundAccountId: null,
      invoiceNumber: "FTR-1",
      invoiceDate: "2026-11-16",
      dueDate: "2026-12-01",
      documentType: "ALIS_FATURASI",
      department: "FLEET",
      description: null,
      currency: "TRY",
      exchangeRate: null,
      lines: [
        {
          description: "Lastik",
          quantity: "2.00",
          unit: "adet",
          unitPrice: "100.00",
          discountRate: null,
          vatRate: "20.00",
          withholdingAmount: null,
          otherTaxAmount: "5.00",
        },
      ],
    });
    expect(Object.keys(body.lines[0])).not.toContain("totalAmount");
  });

  it("Nakit + araç bağlamı + döviz kuru", () => {
    const body = toRequest(
      validState({
        paymentMethod: "CASH",
        fundAccountId: "f1",
        contextType: "VEHICLE",
        contextId: "v1",
        currency: "USD",
        exchangeRate: "34.5",
      }),
    );
    expect(body).toMatchObject({
      vehicleId: "v1",
      shipmentId: null,
      supplierAccountId: null,
      fundAccountId: "f1",
      currency: "USD",
      exchangeRate: "34.50",
    });
  });

  it('geçersiz girdi ya da eksik ödeme şekli → RangeError ("Masraf detayları hazırlanamadı!")', () => {
    expect(() => toRequest(validState({ lines: [line("x", "1", "0", "0", "0", "0")] }))).toThrow(
      RangeError,
    );
    expect(() => toRequest(validState({ paymentMethod: "" }))).toThrow(RangeError);
  });
});

describe("seçenekler, düzenleme durumu, sunucu hatası ve dosya", () => {
  const item = (overrides: Partial<ExpenseItem>): ExpenseItem => ({
    id: "i1",
    expenseTypeId: "t1",
    expenseTypeName: "Genel",
    code: "MK-00001",
    name: "Kırtasiye",
    description: null,
    defaultUnit: "adet",
    active: true,
    system: false,
    createdAt: "2026-11-01T00:00:00Z",
    ...overrides,
  });

  it("itemOptionsFor: türe bağlı aktifler (Türkçe sıra), pasif yalnız mevcut kalemse", () => {
    const items = [
      item({ id: "i1", name: "Yakıt" }),
      item({ id: "i2", name: "Çay" }),
      item({ id: "i3", name: "Pasif", active: false }),
      item({ id: "i4", expenseTypeId: "t2" }),
    ];
    expect(itemOptionsFor(items, "t1").map((x) => x.id)).toEqual(["i2", "i1"]);
    expect(itemOptionsFor(items, "t1", "i3").map((x) => x.id)).toEqual(["i2", "i3", "i1"]);
    expect(itemOptionsFor(items, "")).toEqual([]);
  });

  it("documentTypeOptions: PAYABLE + OTHER + selectable, sortOrder sırası", () => {
    const type = (code: string, overrides: Partial<AccountDocumentType>): AccountDocumentType => ({
      side: "PAYABLE",
      code,
      name: code,
      audience: "OTHER",
      invoiceSection: false,
      penalty: false,
      isDefault: false,
      selectable: true,
      sortOrder: 0,
      ...overrides,
    });
    const options = documentTypeOptions([
      type("KASA_FISI", { sortOrder: 2 }),
      type("ALIS_FATURASI", { sortOrder: 1 }),
      type("SATIS", { side: "RECEIVABLE" }),
      type("MUSTERI", { audience: "CUSTOMER" }),
      type("GIZLI", { selectable: false }),
    ]);
    expect(options.map((o) => o.code)).toEqual(["ALIS_FATURASI", "KASA_FISI"]);
  });

  it("stateFromDetail: satırlar, bağlam kimliği, kur yalnız dövizde", () => {
    const detail = {
      expenseItemId: "i1",
      invoiceNumber: null,
      paymentMethod: "BANK",
      supplierAccountId: null,
      supplierName: null,
      fundAccountId: "f1",
      currency: "TRY",
      exchangeRate: "1",
      department: "IT",
      branchId: "b1",
      invoiceDate: "2026-11-10",
      dueDate: null,
      contextType: "SHIPMENT",
      vehicleId: null,
      shipmentId: "s1",
      warehouseId: null,
      driverId: null,
      contextLabel: "SF-1",
      description: "x",
      documentType: "KASA_FISI",
      lines: [
        {
          description: null,
          quantity: "1.00",
          unit: null,
          unitPrice: "10.00",
          discountRate: "0.00",
          vatRate: "20.00",
          withholdingAmount: "0.00",
          otherTaxAmount: "0.00",
        },
      ],
    } as unknown as ExpenseDetail;
    const state = stateFromDetail(detail, [item({})]);
    expect(state).toMatchObject({
      expenseTypeId: "t1",
      paymentMethod: "BANK",
      fundAccountId: "f1",
      exchangeRate: "",
      contextId: "s1",
      contextLabel: "SF-1",
      reason: "",
    });
    expect(state.lines[0]).toMatchObject({ quantity: "1.00", unit: "", description: "" });
  });

  it("serverErrorField: tevkifat aşan kart, şirket uyuşmazlığı İş Yeri, diğerleri null", () => {
    const lines = [line("1", "10", "0", "20", "0", "0"), line("1", "10", "0", "20", "3", "0")];
    expect(serverErrorField("WITHHOLDING_EXCEEDS_VAT", lines)).toBe(
      lineFieldId(1, "withholdingAmount"),
    );
    expect(serverErrorField("WITHHOLDING_EXCEEDS_VAT", [lines[0]])).toBe(
      lineFieldId(0, "withholdingAmount"),
    );
    expect(serverErrorField("COMPANY_MISMATCH", lines)).toBe(FIELD_IDS.branchId);
    expect(serverErrorField("ACCOUNT_NOT_FOUND", lines)).toBeNull();
    expect(serverErrorField(undefined, lines)).toBeNull();
  });

  it("validateFile ve formatFileSize (ZTO 10 MB, uzantı listesi)", () => {
    expect(validateFile({ name: "fatura.PDF", size: 1000 })).toBeNull();
    expect(validateFile({ name: "a.xlsx", size: 10 * 1024 * 1024 })).toBeNull();
    expect(validateFile({ name: "a.pdf", size: 10 * 1024 * 1024 + 1 })).toBe("fileTooLarge");
    expect(validateFile({ name: "a.exe", size: 10 })).toBe("fileType");
    expect(validateFile({ name: "noext", size: 10 })).toBe("fileType");
    expect(formatFileSize(0)).toBe("0 Bytes");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("emptyLine: Miktar 1, KDV %20, birim varsayılanı, benzersiz anahtar", () => {
    const a = emptyLine("lt");
    const b = emptyLine();
    expect(a).toMatchObject({ quantity: "1", vatRate: "20", unit: "lt", discountRate: "0" });
    expect(b.unit).toBe("");
    expect(a.key).not.toBe(b.key);
  });
});
