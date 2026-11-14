import { describe, expect, it } from "vitest";
import type {
  Account,
  AccountDocumentType,
  AccountRollover,
  AccountTransactionRow,
  BalanceBreakdownRow,
} from "../../../../pages/finance/types";
import {
  addDays,
  balanceChip,
  canVoid,
  computeTax,
  currencyButtons,
  defaultSeason,
  documentTypeBadge,
  documentTypeOptions,
  effectiveLimits,
  extraBadge,
  invoiceGap,
  isCustomerType,
  isDocumentRow,
  isoToTr,
  kindTotals,
  limitSeries,
  limitStatus,
  newestFirst,
  nextTabIndex,
  round2,
  rowsOfTab,
  runningBalances,
  seasonMarkers,
  seasonOptions,
  seasonWindow,
  settlement,
  signedAmount,
  sortSeasons,
  summaryOrder,
  tabOrder,
} from "./transactionsLogic";

function season(id: string, date: string, extra: Partial<AccountRollover> = {}): AccountRollover {
  return {
    id,
    accountId: "a1",
    rolloverDate: date,
    seasonName: `S-${id}`,
    active: false,
    createdBy: "u",
    createdAt: "2026-01-01T00:00:00Z",
    updatedBy: "u",
    updatedAt: "2026-01-01T00:00:00Z",
    updateCount: 0,
    deletedBy: null,
    deletedAt: null,
    ...extra,
  };
}

function row(
  id: string,
  date: string,
  extra: Partial<AccountTransactionRow> = {},
): AccountTransactionRow {
  return {
    id,
    transactionDate: date,
    createdAt: `${date}T10:00:00Z`,
    createdBy: "u",
    accountId: "a1",
    accountCode: "C1",
    accountName: "Cari",
    accountType: "SUPPLIER",
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    kind: "DEBT",
    sign: 1,
    direction: "CREDIT",
    amount: 100,
    currency: "TRY",
    exchangeRate: 1,
    tlAmount: 100,
    description: null,
    sourceType: "ACCOUNT_DOCUMENT",
    sourceId: `d-${id}`,
    documentNo: null,
    documentType: null,
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    reversal: false,
    reversed: false,
    transferRole: null,
    transferredOut: false,
    ...extra,
  };
}

function bal(extra: Partial<BalanceBreakdownRow>): BalanceBreakdownRow {
  return {
    segment: "ALL",
    currency: "TRY",
    companyId: null,
    branchId: null,
    debit: 0,
    credit: 0,
    balance: 0,
    tlBalance: 0,
    debt: 0,
    payment: 0,
    receivable: 0,
    collection: 0,
    ...extra,
  };
}

describe("sekme ve kart sırası", () => {
  it("müşteride Alacak önce, diğerlerinde Borç önce", () => {
    expect(isCustomerType("CUSTOMER")).toBe(true);
    expect(isCustomerType("SUPPLIER")).toBe(false);
    expect(tabOrder(true)).toEqual(["ALL", "RECEIVABLE", "COLLECTION", "DEBT", "PAYMENT"]);
    expect(tabOrder(false)).toEqual(["ALL", "DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"]);
    expect(summaryOrder(true)).toEqual(["RECEIVABLE", "COLLECTION", "DEBT", "PAYMENT"]);
    expect(summaryOrder(false)).toEqual(["DEBT", "PAYMENT", "RECEIVABLE", "COLLECTION"]);
  });

  it("nextTabIndex ←/→ sarar, Home/End uçlar, diğer tuş null", () => {
    expect(nextTabIndex(0, "ArrowRight", 5)).toBe(1);
    expect(nextTabIndex(4, "ArrowRight", 5)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 5)).toBe(4);
    expect(nextTabIndex(3, "Home", 5)).toBe(0);
    expect(nextTabIndex(1, "End", 5)).toBe(4);
    expect(nextTabIndex(1, "Enter", 5)).toBeNull();
    expect(nextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("sezonlar", () => {
  const seasons = [
    season("s2", "2026-03-01", { active: true }),
    season("s1", "2025-09-01"),
    season("x", "2025-01-01", { deletedAt: "2026-01-01T00:00:00Z" }),
  ];

  it("silinenleri atar, tarihe göre sıralar", () => {
    expect(sortSeasons(seasons).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoToTr("2026-03-01")).toBe("01.03.2026");
    expect(isoToTr(null)).toBe("");
  });

  it("pencereler: açılış yalnız to; ara sezon from–to; son sezon açık uçlu; tümü/sezonsuz süzgeçsiz", () => {
    expect(seasonWindow(seasons, "opening")).toEqual({ to: "2025-08-31" });
    expect(seasonWindow(seasons, "s1")).toEqual({ from: "2025-09-01", to: "2026-02-28" });
    expect(seasonWindow(seasons, "s2")).toEqual({ from: "2026-03-01" });
    expect(seasonWindow(seasons, "all")).toEqual({});
    expect(seasonWindow(seasons, "nope")).toEqual({});
    expect(seasonWindow([], "opening")).toEqual({});
  });

  it("varsayılan: URL > aktif sezon > tümü", () => {
    expect(defaultSeason(seasons, null)).toBe("s2");
    expect(defaultSeason(seasons, "s1")).toBe("s1");
    expect(defaultSeason(seasons, "all")).toBe("all");
    expect(defaultSeason(seasons, "opening")).toBe("opening");
    expect(defaultSeason([], "opening")).toBe("all");
    expect(defaultSeason([season("a", "2026-01-01")], "bad")).toBe("all");
  });

  it("seçenekler ZTO metinleriyle", () => {
    const texts = { all: "Tüm Sezonlar", opening: "Açılış (devir öncesi)", active: "Aktif" };
    expect(seasonOptions(seasons, texts).map((o) => o.label)).toEqual([
      "Tüm Sezonlar",
      "Açılış (devir öncesi)",
      "S-s1 (01.09.2025)",
      "S-s2 (01.03.2026)  ·  Aktif",
    ]);
    expect(seasonOptions([], texts)).toHaveLength(1);
  });
});

describe("belge türleri", () => {
  const t = (
    side: "RECEIVABLE" | "PAYABLE",
    code: string,
    audience: "ALL" | "CUSTOMER" | "OTHER",
    sortOrder: number,
    extra: Partial<AccountDocumentType> = {},
  ): AccountDocumentType => ({
    side,
    code,
    name: code,
    audience,
    invoiceSection: false,
    penalty: false,
    isDefault: false,
    selectable: true,
    sortOrder,
    ...extra,
  });
  const types = [
    t("PAYABLE", "ALIS_FATURASI", "OTHER", 110, { isDefault: true, invoiceSection: true }),
    t("PAYABLE", "CEZA_FATURASI", "CUSTOMER", 10),
    t("PAYABLE", "CEZA_BIZE", "ALL", 195),
    t("PAYABLE", "KUR_FARKI", "ALL", 900, { selectable: false }),
    t("RECEIVABLE", "SATIS_FATURASI", "ALL", 10, { isDefault: true }),
    t("RECEIVABLE", "CEZA_KARSI_TARAF", "ALL", 95),
    t("RECEIVABLE", "KUR_FARKI", "ALL", 900, { selectable: false }),
  ];

  it("müşteri Borç Ekle: CUSTOMER + ALL, varsayılan yok; Kur Farkı yok", () => {
    const r = documentTypeOptions(types, "PAYABLE", true);
    expect(r.options.map((o) => o.code)).toEqual(["CEZA_FATURASI", "CEZA_BIZE"]);
    expect(r.defaultCode).toBe("");
  });

  it("tedarikçi Borç Ekle: OTHER + ALL, varsayılan Alış Faturası", () => {
    const r = documentTypeOptions(types, "PAYABLE", false);
    expect(r.options.map((o) => o.code)).toEqual(["ALIS_FATURASI", "CEZA_BIZE"]);
    expect(r.defaultCode).toBe("ALIS_FATURASI");
  });

  it("Alacak Ekle: varsayılan Satış Faturası, ceza türü dahil", () => {
    const r = documentTypeOptions(types, "RECEIVABLE", true);
    expect(r.options.map((o) => o.code)).toEqual(["SATIS_FATURASI", "CEZA_KARSI_TARAF"]);
    expect(r.defaultCode).toBe("SATIS_FATURASI");
  });
});

describe("computeTax (§3.4 sunucu formülü)", () => {
  it("indirim, KDV, stopaj, diğer", () => {
    expect(
      computeTax(1000, {
        discountRate: 10,
        vatRate: 20,
        withholdingAmount: 50,
        otherTaxesAmount: 5,
      }),
    ).toEqual({
      grossAmount: 1000,
      discountAmount: 100,
      netExclVat: 900,
      vatAmount: 180,
      totalInclVat: 1080,
      netPayable: 1025,
    });
  });

  it("HALF_UP yuvarlama ve boş girişler", () => {
    expect(computeTax(10.05, { vatRate: 10 }).vatAmount).toBe(1.01);
    expect(computeTax(0.125, {}).netPayable).toBe(0.13);
    expect(computeTax(Number.NaN).grossAmount).toBe(0);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("özet", () => {
  const rows = [
    bal({ debt: 500, payment: 200, receivable: 100, collection: 50, balance: -550 }),
    bal({ currency: "USD", debt: 10, balance: -10 }),
    bal({ segment: "BEFORE", debt: 300, balance: -300 }),
  ];

  it("para birimi ve segment toplamı", () => {
    expect(kindTotals(rows, "TRY")).toEqual({
      DEBT: 500,
      PAYMENT: 200,
      RECEIVABLE: 100,
      COLLECTION: 50,
      balance: -550,
    });
    expect(kindTotals(rows, null).DEBT).toBe(510);
    expect(kindTotals(rows, "TRY", "BEFORE").DEBT).toBe(300);
  });

  it("mahsuplaşma: müşteri ve tedarikçi işaretleri", () => {
    const totals = kindTotals(rows, "TRY");
    const supplier = settlement(false, totals);
    expect(supplier.payableNet).toBe(300);
    expect(supplier.receivableNet).toBe(50);
    expect(supplier.status.label).toBe("creditor");
    expect(supplier.status.amount).toBe(250);
    expect(settlement(true, totals).status).toMatchObject({
      label: "creditor",
      badge: "badge-danger",
      amount: 250,
    });
    expect(settlement(true, { ...totals, RECEIVABLE: 1000 }).status.label).toBe("debtor");
    expect(settlement(false, { ...totals, RECEIVABLE: 1000 }).status).toMatchObject({
      label: "debtor",
      badge: "badge-success",
    });
    expect(
      settlement(false, { DEBT: 0, PAYMENT: 0, RECEIVABLE: 0, COLLECTION: 0, balance: 0 }).status
        .label,
    ).toBe("balanced");
  });

  it("fatura popover farkı üç dal (1 birim tolerans)", () => {
    expect(invoiceGap(1000, 800)).toMatchObject({ status: "warning", diff: 200 });
    expect(invoiceGap(800, 1000)).toMatchObject({ status: "info", diff: -200 });
    expect(invoiceGap(1000, 999.5).status).toBe("success");
  });

  it("bakiye çipi ve para birimi düğmeleri", () => {
    expect(balanceChip(true, 10)?.className).toBe("chip-warning");
    expect(balanceChip(false, 10)?.className).toBe("chip-danger");
    expect(balanceChip(false, -10)).toMatchObject({
      className: "chip-success",
      amount: 10,
      icon: "fas fa-arrow-down",
    });
    expect(balanceChip(true, 0)).toBeNull();
    expect(currencyButtons(rows, "TRY")).toEqual(["TRY", "USD"]);
    expect(currencyButtons([bal({ currency: "EUR", debit: 1 })], null)).toEqual(["EUR"]);
  });

  it("limitler: aktif şirketin limiti, yoksa kart; durum", () => {
    const account = {
      creditLimit: 1000,
      riskLimit: 500,
      companyLimits: [{ companyId: "c2", creditLimit: 50, riskLimit: null }],
    } as unknown as Account;
    expect(effectiveLimits(account, null)).toEqual({ credit: 1000, risk: 500, company: false });
    expect(effectiveLimits(account, "c2")).toEqual({ credit: 50, risk: 0, company: true });
    expect(effectiveLimits(account, "c9").company).toBe(false);
    expect(effectiveLimits(undefined, null)).toEqual({ credit: 0, risk: 0, company: false });
    expect(limitStatus(1500, 1000, 500)).toBe("credit");
    expect(limitStatus(700, 1000, 500)).toBe("risk");
    expect(limitStatus(100, 1000, 500)).toBeNull();
    expect(limitStatus(100, 0, 0)).toBeNull();
  });

  it("limit grafiği: günlük kapanış, öncesi taşınır, Maks. ilk hareketten", () => {
    const points = [
      { date: "2026-01-01", balance: 10 },
      { date: "2026-03-05", balance: 30 },
      { date: "2026-03-05", balance: 40 },
      { date: "2026-03-07", balance: 5 },
    ];
    const s = limitSeries(points, 4, "2026-03-07");
    expect(s.dates).toEqual(["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"]);
    expect(s.values).toEqual([10, 40, 40, 5]);
    expect(limitSeries(points, 0, "2026-01-03").values).toEqual([10, 10, 10]);
    expect(limitSeries([], 0, "2026-01-03").dates).toEqual(["2026-01-03"]);
  });
});

describe("satırlar", () => {
  it("rozetler", () => {
    expect(extraBadge({ kind: "RECEIVABLE", documentType: "SATIS_FATURASI" })?.className).toBe(
      "badge-info",
    );
    expect(extraBadge({ kind: "RECEIVABLE", documentType: "IADE_FATURASI" })?.className).toBe(
      "badge-warning",
    );
    expect(extraBadge({ kind: "RECEIVABLE", documentType: "DIGER" })).toBeNull();
    expect(extraBadge({ kind: "DEBT", documentType: "SATIS_FATURASI" })).toBeNull();
    expect(documentTypeBadge("Alış Faturası").className).toBe("badge-primary");
    expect(documentTypeBadge("Sevk İrsaliyesi").className).toBe("badge-info");
    expect(documentTypeBadge("Kasa Fişi").className).toBe("badge-secondary");
  });

  it("yürüyen bakiye para birimi başına, eskiden yeniye; sıra ve sekme", () => {
    const rows = [
      row("r3", "2026-01-03", { direction: "DEBIT", amount: 50, kind: "RECEIVABLE" }),
      row("r1", "2026-01-01", { amount: 100 }),
      row("u1", "2026-01-02", { currency: "USD", direction: "DEBIT", amount: 7, kind: "PAYMENT" }),
    ];
    const balances = runningBalances(rows);
    expect(balances.get("r1")).toBe(-100);
    expect(balances.get("r3")).toBe(-50);
    expect(balances.get("u1")).toBe(7);
    expect(newestFirst(rows).map((r) => r.id)).toEqual(["r3", "u1", "r1"]);
    expect(rowsOfTab(rows, "DEBT").map((r) => r.id)).toEqual(["r1"]);
    expect(rowsOfTab(rows, "ALL")).toHaveLength(3);
    expect(signedAmount({ amount: 10, sign: -1 })).toBe(-10);
  });

  it("düzenle ve sil uygunluğu", () => {
    expect(isDocumentRow(row("a", "2026-01-01"))).toBe(true);
    expect(isDocumentRow(row("a", "2026-01-01", { sourceType: "SETTLEMENT" }))).toBe(false);
    expect(isDocumentRow(row("a", "2026-01-01", { reversed: true }))).toBe(false);
    expect(canVoid(row("a", "2026-01-01"))).toBe(true);
    expect(canVoid(row("a", "2026-01-01", { reversal: true }))).toBe(false);
    expect(canVoid(row("a", "2026-01-01", { transferRole: "IN" }))).toBe(false);
    expect(canVoid(row("a", "2026-01-01", { transferredOut: true }))).toBe(false);
  });
});

describe("sezon işaretçileri", () => {
  const seasons = [season("s1", "2026-02-01"), season("s2", "2026-04-01", { active: true })];
  const desc = [
    row("a", "2026-05-01"),
    row("b", "2026-04-01"),
    row("c", "2026-03-01"),
    row("d", "2026-01-15"),
  ];

  it("azalan: devir eski ilk satırdan önce, açılış son sayfanın sonunda", () => {
    const m = seasonMarkers(desc, desc, seasons, [{ id: "date", desc: true }], "date");
    expect(m.map((x) => [x.key, x.beforeIndex])).toEqual([
      ["season-s2", 2],
      ["season-s1", 3],
      ["opening", 4],
    ]);
  });

  it("sayfalı: yalnız bu sayfadaki hedefler; açılış yalnız son sayfada", () => {
    const first = desc.slice(0, 2);
    const second = desc.slice(2);
    expect(seasonMarkers(first, desc, seasons, [{ id: "date", desc: true }], "date")).toEqual([]);
    expect(
      seasonMarkers(second, desc, seasons, [{ id: "date", desc: true }], "date").map((x) => [
        x.key,
        x.beforeIndex,
      ]),
    ).toEqual([
      ["season-s2", 0],
      ["season-s1", 1],
      ["opening", 2],
    ]);
  });

  it("satırsız eski devir sona; artan sırada açılış başta", () => {
    const rows = [row("a", "2026-05-01")];
    expect(
      seasonMarkers(rows, rows, seasons, [{ id: "date", desc: true }], "date").map((x) => x.key),
    ).toEqual(["season-s2", "season-s1", "opening"]);
    const asc = desc.slice().reverse();
    expect(
      seasonMarkers(asc, asc, seasons, [{ id: "date", desc: false }], "date").map((x) => [
        x.key,
        x.beforeIndex,
      ]),
    ).toEqual([
      ["opening", 0],
      ["season-s1", 1],
      ["season-s2", 2],
    ]);
  });

  it("tarih dışı sıralamada ve boş sayfada yok", () => {
    expect(seasonMarkers(desc, desc, seasons, [{ id: "amount", desc: true }], "date")).toEqual([]);
    expect(seasonMarkers([], desc, seasons, [{ id: "date", desc: true }], "date")).toEqual([]);
    expect(seasonMarkers(desc, desc, seasons, [], "date")).toEqual([]);
  });
});
