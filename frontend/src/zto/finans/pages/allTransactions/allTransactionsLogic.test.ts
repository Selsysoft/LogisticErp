import { describe, expect, it } from "vitest";
import type { AccountTransactionRow } from "../../../../pages/finance/types";
import { compareValues, matchesSearch, smartSearchTerms } from "../../../components/dataTableLogic";
import {
  EMPTY_SELECTION,
  KIND_AMOUNT_CLASS,
  KIND_BADGE,
  MAX_RANGE_DAYS,
  QUICK_RANGES,
  addDays,
  buildRowsChunked,
  clearSelection,
  computeFacets,
  dataTableLanguage,
  daysBetween,
  errorText,
  extraBadge,
  facetGroups,
  formatCount,
  hasSelection,
  isIsoDate,
  quickRangeDates,
  rangeProblem,
  rowSortKey,
  selectionChips,
  selectionParams,
  toAtRow,
  toggleSelection,
} from "./allTransactionsLogic";

function makeRow(overrides: Partial<AccountTransactionRow> = {}): AccountTransactionRow {
  return {
    id: "t1",
    transactionDate: "2026-11-14",
    createdAt: "2026-11-14T09:30:00Z",
    createdBy: "ayse@acme.com",
    accountId: "a1",
    accountCode: "TED-0001",
    accountName: "Şahin Nakliyat",
    accountType: "SUPPLIER",
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    kind: "DEBT",
    sign: 1,
    direction: "CREDIT",
    amount: 1250.5,
    currency: "TRY",
    exchangeRate: 1,
    tlAmount: 1250.5,
    description: "Alış faturası",
    sourceType: "ACCOUNT_DOCUMENT",
    sourceId: "d1",
    documentNo: "AF-1",
    documentType: "ALIS_FATURASI",
    documentDate: "2026-11-14",
    dueDate: null,
    paymentMethod: null,
    reversal: false,
    reversed: false,
    transferRole: null,
    transferredOut: false,
    ...overrides,
  };
}

const KIND_LABELS = {
  DEBT: "Borç",
  PAYMENT: "Ödeme",
  RECEIVABLE: "Alacak",
  COLLECTION: "Tahsilat",
};
const LABELS = {
  kind: (kind: keyof typeof KIND_LABELS) => KIND_LABELS[kind],
  sale: "Satış",
  refund: "İade",
};

describe("hızlı tarih aralıkları (ajs applyQuickRange)", () => {
  it("ZTO sırası ve data-range değerleri", () => {
    expect(QUICK_RANGES.map((r) => r.dataRange)).toEqual([
      "today",
      "yesterday",
      "7",
      "14",
      "30",
      "90",
      "180",
    ]);
  });

  it("Bugün, Dün ve N gün; ay ve yıl sınırı takvimle", () => {
    expect(quickRangeDates("today", "2026-11-14")).toEqual({
      from: "2026-11-14",
      to: "2026-11-14",
    });
    expect(quickRangeDates("yesterday", "2026-03-01")).toEqual({
      from: "2026-02-28",
      to: "2026-02-28",
    });
    expect(quickRangeDates("d7", "2026-11-14")).toEqual({ from: "2026-11-07", to: "2026-11-14" });
    expect(quickRangeDates("d14", "2026-01-05")).toEqual({ from: "2025-12-22", to: "2026-01-05" });
    expect(quickRangeDates("d30", "2026-03-31")).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(quickRangeDates("d90", "2026-11-14").from).toBe("2026-08-16");
    expect(quickRangeDates("d180", "2024-03-01").from).toBe("2023-09-03");
  });

  it("tarih yardımcıları", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("14.11.2026")).toBe(false);
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(addDays("bozuk", 1)).toBe("bozuk");
    expect(daysBetween("", "2026-11-14")).toBeNaN();
    expect(rangeProblem("2026-02-30", "2026-03-01")).toBe("missing");
  });

  it("aralık kuralı: boş, ters, ≤ 366 gün", () => {
    expect(rangeProblem("", "2026-11-14")).toBe("missing");
    expect(rangeProblem("2026-11-14", "2026-11-13")).toBe("order");
    expect(rangeProblem("2025-11-13", "2026-11-14")).toBe(null);
    expect(daysBetween("2025-11-13", "2026-11-14")).toBe(MAX_RANGE_DAYS);
    expect(rangeProblem("2025-11-12", "2026-11-14")).toBe("tooLarge");
    expect(rangeProblem("2026-11-14", "2026-11-14")).toBe(null);
  });
});

describe("kart süzgeçleri (ajs toggleCardFilter / renderDynamicIndicator)", () => {
  const facets = {
    branches: [
      { id: "b1", name: "Merkez", count: 2 },
      { id: "b2", name: "Depo", count: 5 },
    ],
    groups: [
      { code: "GENEL", name: "Tedarikçi", count: 3 },
      { code: "MUSTERI", name: "Müşteri", count: 3 },
    ],
    kinds: [
      { kind: "DEBT", count: 1 },
      { kind: "COLLECTION", count: 6 },
    ],
  };
  const groups = facetGroups(facets, (k) => KIND_LABELS[k as keyof typeof KIND_LABELS]);

  it("sayıya göre azalan; eşitlikte Türkçe ada göre; tür adı çevrilir", () => {
    expect(groups.branch.map((i) => i.label)).toEqual(["Depo", "Merkez"]);
    expect(groups.group.map((i) => i.label)).toEqual(["Müşteri", "Tedarikçi"]);
    expect(groups.kind).toEqual([
      { value: "COLLECTION", label: "Tahsilat", count: 6 },
      { value: "DEBT", label: "Borç", count: 1 },
    ]);
  });

  it("ikinci tık seçimi kaldırır; çip temizler", () => {
    let selection = toggleSelection(EMPTY_SELECTION, "branch", "b1");
    expect(selection.branch).toBe("b1");
    expect(hasSelection(selection)).toBe(true);
    selection = toggleSelection(selection, "branch", "b2");
    expect(selection.branch).toBe("b2");
    expect(toggleSelection(selection, "branch", "b2").branch).toBeNull();
    expect(clearSelection(selection, "branch")).toEqual(EMPTY_SELECTION);
    expect(hasSelection(EMPTY_SELECTION)).toBe(false);
  });

  it("çip metinleri kart öğesinin adıyla, ZTO sırasıyla", () => {
    const selection = { branch: "b2", group: null, kind: "DEBT" };
    expect(selectionChips(selection, groups)).toEqual([
      { key: "branch", value: "Depo" },
      { key: "kind", value: "Borç" },
    ]);
    // Öğe artık yoksa ham değer.
    expect(selectionChips({ ...EMPTY_SELECTION, group: "YOK" }, groups)).toEqual([
      { key: "group", value: "YOK" },
    ]);
  });

  it("seçim sunucu parametresine çevrilir", () => {
    expect(selectionParams(EMPTY_SELECTION)).toEqual({
      branchIds: undefined,
      subGroups: undefined,
      kinds: undefined,
    });
    expect(selectionParams({ branch: "b1", group: "GENEL", kind: "PAYMENT" })).toEqual({
      branchIds: ["b1"],
      subGroups: ["GENEL"],
      kinds: ["PAYMENT"],
    });
  });

  it("facet yoksa satırlardan sayılır", () => {
    const rows = [
      makeRow(),
      makeRow({ id: "t2", kind: "PAYMENT" }),
      makeRow({
        id: "t3",
        branchId: "b2",
        branchName: "Depo",
        subGroup: "MUSTERI",
        subGroupName: "Müşteri",
      }),
    ];
    expect(computeFacets(rows)).toEqual({
      branches: [
        { id: "b1", name: "Merkez", count: 2 },
        { id: "b2", name: "Depo", count: 1 },
      ],
      groups: [
        { code: "GENEL", name: "Tedarikçi", count: 2 },
        { code: "MUSTERI", name: "Müşteri", count: 1 },
      ],
      kinds: [
        { kind: "DEBT", count: 2 },
        { kind: "PAYMENT", count: 1 },
      ],
    });
  });
});

describe("satır görünüm modeli", () => {
  it("tür rozetleri ve tutar renkleri (§3.5, AT:5690-5715)", () => {
    expect(KIND_BADGE).toEqual({
      DEBT: "badge badge-danger",
      RECEIVABLE: "badge badge-success",
      PAYMENT: "badge badge-warning",
      COLLECTION: "badge badge-primary",
    });
    expect(KIND_AMOUNT_CLASS.COLLECTION).toBe("text-primary font-weight-bold");
  });

  it("Satış/İade ek rozeti yalnız Alacak satırında", () => {
    expect(extraBadge("RECEIVABLE", "SATIS_FATURASI")).toEqual({
      className: "badge badge-info ml-1",
      kind: "sale",
    });
    expect(extraBadge("RECEIVABLE", "IADE_FATURASI")?.kind).toBe("refund");
    expect(extraBadge("RECEIVABLE", "ALIS_FATURASI")).toBeNull();
    expect(extraBadge("DEBT", "SATIS_FATURASI")).toBeNull();
  });

  it("toAtRow: tarih, tutar (işaretli) ve metinler", () => {
    const row = toAtRow(makeRow(), LABELS);
    expect(row).toMatchObject({
      dateText: "14.11.2026",
      sortKey: "2026-11-14|2026-11-14T09:30:00Z|t1",
      kindLabel: "Borç",
      kindClass: "badge badge-danger",
      amount: 1250.5,
      amountText: "1.250,50 ₺",
      amountClass: "text-danger font-weight-bold",
      documentNo: "AF-1",
      extra: null,
    });
    const reversal = toAtRow(
      makeRow({ sign: -1, kind: "RECEIVABLE", documentType: "SATIS_FATURASI", currency: "USD" }),
      LABELS,
    );
    expect(reversal.amount).toBe(-1250.5);
    expect(reversal.amountText).toBe("-1.250,50 $");
    expect(reversal.extra).toEqual({ className: "badge badge-info ml-1", label: "Satış" });
    const blank = toAtRow(makeRow({ branchName: "", documentNo: null, description: null }), LABELS);
    expect(blank).toMatchObject({ branchName: "-", documentNo: "", description: "" });
  });

  it("tarih sıralaması ISO değerle (ZTO dd.MM.yyyy metin sıralama hatası giderilir)", () => {
    const keys = [
      rowSortKey({ transactionDate: "2026-02-01", createdAt: "2026-02-01T08:00:00Z", id: "x" }),
      rowSortKey({ transactionDate: "2026-01-15", createdAt: "2026-01-15T08:00:00Z", id: "y" }),
      rowSortKey({ transactionDate: "2026-02-01", createdAt: "2026-02-01T07:00:00Z", id: "z" }),
    ];
    const sorted = [...keys].sort(compareValues).reverse();
    expect(sorted.map((k) => k.split("|")[2])).toEqual(["x", "z", "y"]);
    // Metin olarak "01.02.2026" < "15.01.2026" olurdu.
    expect(compareValues(-5, 3)).toBeLessThan(0);
  });

  it("istemci arama Türkçe katlamalı (ı/i, ş/s)", () => {
    const row = toAtRow(makeRow(), LABELS);
    const haystack = [row.accountName, row.groupName, row.kindLabel].join("  ");
    expect(matchesSearch(haystack, smartSearchTerms("sahin"))).toBe(true);
    expect(matchesSearch(haystack, smartSearchTerms("TEDARIKCI borc"))).toBe(true);
    expect(matchesSearch(haystack, smartSearchTerms("tahsilat"))).toBe(false);
  });

  it("buildRowsChunked senkron sonuçla aynı ve 50 ms bütçede verir", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow({ id: `t${i}` }));
    let clock = 0;
    const result = await buildRowsChunked(rows, LABELS, {
      budgetMs: 50,
      now: () => (clock += 30),
    });
    expect(result).toEqual(rows.map((row) => toAtRow(row, LABELS)));
  });

  it("iptal edilen kurulum durur", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildRowsChunked([makeRow()], LABELS, { signal: controller.signal }),
    ).rejects.toThrow("Aborted");
  });
});

describe("metinler", () => {
  it("DataTables dil metinleri yer tutucularla (ajs:53-75)", () => {
    const texts: Record<string, string> = {
      "ztoFinans:allTransactions.dt.info":
        "{{total}} kayıttan {{start}} - {{end}} arası gösteriliyor",
      "ztoFinans:allTransactions.dt.infoFiltered": "({{max}} kayıt içinden filtrelendi)",
      "ztoFinans:allTransactions.dt.lengthMenu": "Göster {{menu}} kayıt",
    };
    const t = (key: string, values: Record<string, string> = {}) =>
      (texts[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => values[name]);
    const language = dataTableLanguage(t);
    expect(language.info).toBe("_TOTAL_ kayıttan _START_ - _END_ arası gösteriliyor");
    expect(language.infoFiltered).toBe("(_MAX_ kayıt içinden filtrelendi)");
    expect(language.lengthMenu).toBe("Göster _MENU_ kayıt");
    expect(language.search).toBe("ztoFinans:allTransactions.dt.search");
  });

  it("10.000 üstü uyarısındaki sayı N0", () => {
    expect(formatCount(12345)).toBe("12.345");
  });

  it("hata metni: sunucu iletisi ya da genel", () => {
    const labels = { error: "Hata", errorOccurred: "Hata oluştu" };
    const apiError = Object.assign(new Error("Tarih aralığı en çok 1 yıl olabilir."), {
      body: { code: "DATE_RANGE_TOO_LARGE" },
    });
    expect(errorText(apiError, labels)).toBe("Hata: Tarih aralığı en çok 1 yıl olabilir.");
    expect(errorText(new TypeError("Failed to fetch"), labels)).toBe("Hata oluştu");
    expect(errorText(null, labels)).toBe("Hata oluştu");
  });
});
