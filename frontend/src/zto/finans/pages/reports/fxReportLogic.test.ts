import { describe, expect, it } from "vitest";
import { ApiError } from "../../../../api/client";
import type { FxDifferenceRow } from "../../../../pages/finance/types";
import {
  absDec,
  confirmValues,
  cutBlock,
  cutBlockTitle,
  cutErrorMessage,
  cutSide,
  defaultFxFilters,
  detailValue,
  differenceClass,
  directionBadge,
  foreignCurrencies,
  formatDifference,
  formatRate,
  fxParams,
  isPartiallyOpen,
  isTruncated,
  rowSearchText,
  shouldNotifyRefreshError,
  sourceLabel,
} from "./fxReportLogic";

function row(overrides: Partial<FxDifferenceRow> = {}): FxDifferenceRow {
  return {
    transactionId: "t1",
    accountId: "a1",
    accountCode: "MUS-001",
    accountName: "Deniz Lojistik",
    accountActive: true,
    companyId: "c1",
    branchId: "b1",
    direction: "DEBIT",
    transactionDate: "2026-10-01",
    sourceType: "ACCOUNT_DOCUMENT",
    documentNo: "BLG-1",
    documentTypeName: "Satış Faturası",
    amount: "1000.00",
    currency: "USD",
    transactionRate: "30.0000",
    tlAmount: "30000.00",
    currentRate: "34.0000",
    currentRateDate: "2026-11-16",
    currentTl: "34000.00",
    difference: "4000.00",
    effect: "GAIN",
    openRemaining: "1000.00",
    closedOn: null,
    valuationBlock: null,
    cut: null,
    ...overrides,
  };
}

const apiError = (status: number, code: string, details: string[] = [], message = "Sunucu") =>
  new ApiError(status, { code, message, details, traceId: null });

describe("cutBlock (Kes etkinliği; §5.7, Rev 1 F4/F7)", () => {
  it("kurlar getirilmiş, engelsiz, fark ≥ 0,01 ve cari aktif → etkin", () => {
    expect(cutBlock(row(), true)).toBeNull();
    expect(cutBlock(row({ difference: "-0.01" }), true)).toBeNull();
  });

  it("kurlar getirilmeden ya da fark yokken pasif", () => {
    expect(cutBlock(row(), false)).toBe("NO_RATE");
    expect(cutBlock(row({ difference: null }), true)).toBe("NO_RATE");
  });

  it("fark 0,01'in altında → ZERO", () => {
    expect(cutBlock(row({ difference: "0.009" }), true)).toBe("ZERO");
    expect(cutBlock(row({ difference: "-0.0049" }), true)).toBe("ZERO");
  });

  it("öncelik: pasif cari > SETTLED > AFTER_VALUATION", () => {
    expect(cutBlock(row({ accountActive: false, valuationBlock: "SETTLED" }), true)).toBe(
      "INACTIVE",
    );
    expect(cutBlock(row({ valuationBlock: "SETTLED", closedOn: "2026-10-10" }), true)).toBe(
      "SETTLED",
    );
    expect(cutBlock(row({ valuationBlock: "AFTER_VALUATION" }), false)).toBe("AFTER_VALUATION");
  });

  it("pasif başlıkları: SETTLED tarihli, diğerleri sabit; ZTO varsayılanı için null", () => {
    expect(cutBlockTitle("INACTIVE", row())).toEqual({ key: "fxReport.blocked.INACTIVE" });
    expect(cutBlockTitle("AFTER_VALUATION", row())).toEqual({
      key: "fxReport.blocked.AFTER_VALUATION",
    });
    expect(cutBlockTitle("SETTLED", row({ closedOn: "2026-10-10" }))).toEqual({
      key: "fxReport.blocked.SETTLED",
      values: { date: "10.10.2026" },
    });
    expect(cutBlockTitle("NO_RATE", row())).toBeNull();
    expect(cutBlockTitle(null, row())).toBeNull();
  });
});

describe("biçim ve sınıflar", () => {
  it("+ öneki ZTO kuralıyla (≥ 0 → +), fark yoksa '-'", () => {
    expect(formatDifference("4000")).toBe("+4.000,00");
    expect(formatDifference("0.00")).toBe("+0,00");
    expect(formatDifference("-1234.5")).toBe("-1.234,50");
    expect(formatDifference(null)).toBe("-");
  });

  it("GAIN fx-pos, LOSS fx-neg, NONE sınıfsız", () => {
    expect(differenceClass(row({ effect: "GAIN" }))).toBe("text-right fx-diff fx-pos");
    expect(differenceClass(row({ effect: "LOSS" }))).toBe("text-right fx-diff fx-neg");
    expect(differenceClass(row({ effect: "NONE" }))).toBe("text-right fx-diff");
    expect(differenceClass(row({ effect: null }))).toBe("text-right fx-diff");
  });

  it("yön rozeti: CREDIT Borç (danger), DEBIT Alacak (success)", () => {
    expect(directionBadge("CREDIT")).toEqual({ className: "badge badge-danger", key: "debt" });
    expect(directionBadge("DEBIT")).toEqual({ className: "badge badge-success", key: "credit" });
  });

  it("kur N4, yoksa '-'", () => {
    expect(formatRate("34.1234")).toBe("34,1234");
    expect(formatRate(null)).toBe("-");
  });

  it("absDec", () => {
    expect(absDec("-12.50")).toBe("12.50");
    expect(absDec("3")).toBe("3.00");
  });
});

describe("kesim yanı ve onay metni (§3.2.3 adım 12)", () => {
  it("DEBIT + artış → Alacak aynı yön; DEBIT + düşüş → Borç ters yön", () => {
    expect(cutSide(row())).toEqual({ side: "RECEIVABLE", same: true });
    expect(cutSide(row({ difference: "-50" }))).toEqual({ side: "PAYABLE", same: false });
  });

  it("CREDIT + artış → Borç aynı yön; CREDIT + düşüş → Alacak ters yön", () => {
    expect(cutSide(row({ direction: "CREDIT" }))).toEqual({ side: "PAYABLE", same: true });
    expect(cutSide(row({ direction: "CREDIT", difference: "-50" }))).toEqual({
      side: "RECEIVABLE",
      same: false,
    });
  });

  it("onay değerleri: |fark|, kur ve tarih; tam açık kaynakta kısmi satır yok", () => {
    expect(confirmValues(row({ difference: "-4000.5" }))).toEqual({
      amount: "4.000,50",
      side: "PAYABLE",
      same: false,
      rate: "34,0000",
      date: "16.11.2026",
      partial: null,
    });
  });

  it("kısmen açık kaynak (0 < açık < tutar) uyarı satırı verir", () => {
    expect(isPartiallyOpen(row({ openRemaining: "600" }))).toBe(true);
    expect(isPartiallyOpen(row({ openRemaining: "0" }))).toBe(false);
    expect(isPartiallyOpen(row({ openRemaining: "1000" }))).toBe(false);
    expect(confirmValues(row({ openRemaining: "600" })).partial).toEqual({
      amount: "600,00",
      currency: "USD",
    });
  });
});

describe("hata iletileri (§5.7)", () => {
  it("kod bazlı anahtarlar ve yeniden sorgu bayrağı", () => {
    expect(
      cutErrorMessage(apiError(409, "FX_DIFFERENCE_EXISTS", ["documentId=d1", "documentNo=KF-1"])),
    ).toEqual({
      key: "fxReport.errors.FX_DIFFERENCE_EXISTS",
      values: { documentNo: "KF-1" },
      message: null,
      refetch: true,
    });
    expect(cutErrorMessage(apiError(422, "FX_DIFFERENCE_ZERO"))).toMatchObject({
      key: "fxReport.errors.FX_DIFFERENCE_ZERO",
      refetch: false,
    });
    expect(cutErrorMessage(apiError(404, "FX_SOURCE_NOT_FOUND"))).toMatchObject({
      key: "fxReport.errors.FX_SOURCE_NOT_FOUND",
      refetch: false,
    });
    expect(cutErrorMessage(apiError(409, "FX_DIFFERENCE_CHANGED"))).toMatchObject({
      key: "fxReport.errors.FX_DIFFERENCE_CHANGED",
      refetch: true,
    });
  });

  it("FX_SOURCE_SETTLED kapanış tarihini details'tan alır ve yeniden sorgular", () => {
    expect(cutErrorMessage(apiError(422, "FX_SOURCE_SETTLED", ["closedOn=2026-10-10"]))).toEqual({
      key: "fxReport.errors.FX_SOURCE_SETTLED",
      values: { date: "10.10.2026" },
      message: null,
      refetch: true,
    });
  });

  it("diğer kodda sunucu iletisi; ApiError değilse genel ileti", () => {
    expect(cutErrorMessage(apiError(422, "ACCOUNT_INACTIVE", [], "Pasif cari."))).toEqual({
      key: null,
      message: "Pasif cari.",
      refetch: false,
    });
    expect(cutErrorMessage(new Error("ağ"))).toMatchObject({ key: "fxReport.errors.generic" });
  });

  it("details değeri", () => {
    expect(detailValue(["a=1", "b=x=y"], "b")).toBe("x=y");
    expect(detailValue(undefined, "a")).toBeNull();
  });
});

describe("kur yenileme hatası (Rev 1 FE-FXR-REFRESH-ERR)", () => {
  it("ağ hatası, 403 ve 5xx'te snackbar; 4xx diğerlerinde yok", () => {
    expect(shouldNotifyRefreshError(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldNotifyRefreshError(apiError(403, "FORBIDDEN"))).toBe(true);
    expect(shouldNotifyRefreshError(apiError(503, "UNAVAILABLE"))).toBe(true);
    expect(shouldNotifyRefreshError(apiError(400, "BAD"))).toBe(false);
    expect(shouldNotifyRefreshError(undefined)).toBe(false);
  });
});

describe("süzgeç ve yardımcılar", () => {
  it("varsayılan süzgeç bugünün tarihiyle", () => {
    expect(defaultFxFilters("2026-11-16", "c1")).toEqual({
      companyId: "c1",
      accountId: "",
      accountLabel: "",
      currency: "",
      cutState: "ALL",
      valuationDate: "2026-11-16",
    });
  });

  it("parametreler: tek şirkette companyId yok, çok şirkette '' konsolide", () => {
    const filters = { ...defaultFxFilters("2026-11-16"), currency: "USD", accountId: "a1" };
    expect(fxParams(filters, true, false)).toEqual({
      companyId: undefined,
      accountId: "a1",
      currency: "USD",
      cutState: "ALL",
      valuationDate: "2026-11-16",
      withRates: true,
    });
    expect(fxParams(filters, false, true).companyId).toBeNull();
    expect(fxParams({ ...filters, companyId: "c2" }, false, true).companyId).toBe("c2");
  });

  it("para birimleri TRY hariç", () => {
    expect(foreignCurrencies([{ code: "TRY" }, { code: "USD" }, { code: "EUR" }])).toEqual([
      { code: "USD" },
      { code: "EUR" },
    ]);
  });

  it("kaynak etiketi: belge türü adı, yoksa kaynak türü etiketi", () => {
    const label = (type: string) => `[${type}]`;
    expect(sourceLabel(row(), label)).toBe("Satış Faturası");
    expect(sourceLabel(row({ documentTypeName: null, sourceType: "EXPENSE" }), label)).toBe(
      "[EXPENSE]",
    );
  });

  it("arama metni hücre metinlerini içerir", () => {
    const text = rowSearchText(row(), "Alacak", "Satış Faturası");
    expect(text).toContain("Deniz Lojistik");
    expect(text).toContain("01.10.2026");
    expect(text).toContain("+4.000,00");
    expect(text).toContain("34,0000");
    // ZTO PB hücresi sembolü yazar (FxReport.cshtml:166); hem kod hem sembol aranabilir.
    expect(text).toContain("USD");
    expect(text).toContain("$");
  });

  it("2000 sınırı uyarısı", () => {
    expect(isTruncated(2500, 2000)).toBe(true);
    expect(isTruncated(10, 10)).toBe(false);
  });
});
