import { describe, expect, it } from "vitest";
import type {
  AccountPerformanceRow,
  Aging,
  CurrencyPositionRow,
} from "../../../../pages/finance/types";
import { makeInstrument } from "../instruments/billsTestUtils";
import {
  BILL_STATUS_FILTERS,
  CAR_TABS,
  CHECK_STATUS_FILTERS,
  addMonthsIso,
  agingTlTotal,
  agingTotals,
  balanceClass,
  daysLeft,
  excelNumber,
  instrumentSummary,
  isCollateral,
  maturityGroup,
  nextTabIndex,
  parseCarTab,
  partyOf,
  positionChart,
  positionView,
  scoreBadge,
  sortByDue,
  statusBadge,
  totalsText,
  unmatchedTotal,
} from "./customerAccountReportLogic";

function aging(overrides: Partial<Aging> = {}): Aging {
  return {
    accountId: "a1",
    accountName: "Kuzey",
    currency: "TRY",
    days0To30: 0,
    days31To60: 0,
    days61To90: 0,
    daysOver90: 0,
    total: 0,
    accountCode: "120.01",
    subGroup: "MUSTERI",
    subGroupName: "Müşteri",
    phone: null,
    notDue: 0,
    tlTotal: 0,
    ...overrides,
  };
}

describe("sekmeler", () => {
  it("ZTO sırası ve kimlikleri", () => {
    expect(CAR_TABS.map((tab) => tab.id)).toEqual([
      "aging",
      "checks",
      "bills",
      "performance",
      "position",
    ]);
    expect(CAR_TABS.map((tab) => tab.tabId)).toEqual([
      "aging-tab",
      "check-maturity-tab",
      "bill-maturity-tab",
      "payment-performance-tab",
      "currency-position-tab",
    ]);
    expect(CAR_TABS.map((tab) => tab.icon)).toEqual([
      "fas fa-calendar-alt",
      "fas fa-money-check",
      "fas fa-file-invoice-dollar",
      "fas fa-chart-line",
      "fas fa-dollar-sign",
    ]);
  });

  it("?tab ayrıştırma: bilinmeyen/boş → aging", () => {
    expect(parseCarTab("bills")).toBe("bills");
    expect(parseCarTab("x")).toBe("aging");
    expect(parseCarTab(null)).toBe("aging");
  });

  it("klavye: ←/→ sarar, Home/End uçlar, diğerleri null", () => {
    expect(nextTabIndex(0, "ArrowRight", 5)).toBe(1);
    expect(nextTabIndex(4, "ArrowRight", 5)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 5)).toBe(4);
    expect(nextTabIndex(2, "Home", 5)).toBe(0);
    expect(nextTabIndex(2, "End", 5)).toBe(4);
    expect(nextTabIndex(2, "Enter", 5)).toBeNull();
    expect(nextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("tarih", () => {
  it("addMonthsIso ay sonunu kırpar (ZTO AddMonths)", () => {
    expect(addMonthsIso("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsIso("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonthsIso("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonthsIso("2026-11-16", 2)).toBe("2027-01-16");
    expect(addMonthsIso("bozuk", 1)).toBe("bozuk");
  });

  it("vade grubu sınırları: bugün, +6, ay sonu", () => {
    const today = "2026-11-16";
    expect(maturityGroup("2026-11-15", today)).toBe("overdue");
    expect(maturityGroup("2026-11-16", today)).toBe("thisWeek");
    expect(maturityGroup("2026-11-22", today)).toBe("thisWeek");
    expect(maturityGroup("2026-11-23", today)).toBe("thisMonth");
    expect(maturityGroup("2026-11-30", today)).toBe("thisMonth");
    expect(maturityGroup("2026-12-01", today)).toBe("future");
    // Ay sonuna 6 günden az kala: hafta ay sınırını aşar.
    expect(maturityGroup("2026-12-02", "2026-11-28")).toBe("thisWeek");
    expect(maturityGroup("2026-12-05", "2026-11-28")).toBe("future");
  });

  it("kalan gün (DST kayması yok)", () => {
    expect(daysLeft("2026-11-26", "2026-11-16")).toBe(10);
    expect(daysLeft("2026-11-10", "2026-11-16")).toBe(-6);
    expect(daysLeft("2026-03-30", "2026-03-28")).toBe(2);
    expect(daysLeft("x", "2026-11-16")).toBeNull();
  });
});

describe("çek / senet", () => {
  it("durum süzgeci eşlemesi (04 §3.2)", () => {
    expect(CHECK_STATUS_FILTERS.all).toEqual([]);
    expect(CHECK_STATUS_FILTERS.collected).toEqual(["COLLECTED", "COLLECTED_TO_CASH"]);
    expect(CHECK_STATUS_FILTERS.bounced).toEqual(["BOUNCED"]);
    expect(BILL_STATUS_FILTERS.paid).toEqual(["PAID", "COLLECTED", "COLLECTED_TO_CASH"]);
    expect(BILL_STATUS_FILTERS.collateral).toEqual(["COLLATERAL"]);
    expect(BILL_STATUS_FILTERS.protested).toEqual(["PROTESTED"]);
  });

  it("durum rozeti: ZTO renkleri, diğerleri secondary + 12.3 etiketi", () => {
    expect(statusBadge("CHECK", "PORTFOLIO").className).toBe("badge-info");
    expect(statusBadge("CHECK", "AT_BANK").className).toBe("badge-warning");
    expect(statusBadge("CHECK", "COLLECTED_TO_CASH").className).toBe("badge-success");
    expect(statusBadge("CHECK", "BOUNCED").className).toBe("badge-danger");
    expect(statusBadge("CHECK", "ENDORSED")).toEqual({
      className: "badge-secondary",
      labelKey: "instruments.status.check.ENDORSED",
    });
    expect(statusBadge("NOTE", "COLLATERAL").className).toBe("badge-warning");
    expect(statusBadge("NOTE", "PAID").className).toBe("badge-success");
    expect(statusBadge("NOTE", "PROTESTED").className).toBe("badge-danger");
    expect(statusBadge("NOTE", "RETURNED").labelKey).toBe("instruments.status.note.RETURNED");
  });

  it("özet: para birimi başına toplam, bu hafta, vadesi geçen yalnız açık durumda", () => {
    const today = "2026-11-16";
    const rows = [
      makeInstrument({
        id: "1",
        dueDate: "2026-11-10",
        money: { amount: "100.10", currency: "TRY" },
      }),
      makeInstrument({
        id: "2",
        dueDate: "2026-11-01",
        status: "COLLECTED",
        money: { amount: "0.20", currency: "TRY" },
      }),
      makeInstrument({ id: "3", dueDate: "2026-11-18", money: { amount: "50", currency: "USD" } }),
      makeInstrument({
        id: "4",
        dueDate: "2027-02-01",
        money: { amount: "0.70", currency: "TRY" },
      }),
    ];
    const summary = instrumentSummary(rows, today);
    expect(summary.count).toBe(4);
    expect(summary.totals).toEqual([
      { currency: "TRY", amount: "101.00" },
      { currency: "USD", amount: "50.00" },
    ]);
    expect(summary.thisWeek).toBe(1);
    expect(summary.overdue).toBe(1);
    expect(totalsText(summary.totals)).toBe("101,00 ₺ / 50,00 $");
    expect(totalsText([])).toBe("0,00 ₺");
  });

  it("vade sırası ve teminat", () => {
    const rows = sortByDue([
      makeInstrument({ id: "b", number: "2", dueDate: "2026-12-01" }),
      makeInstrument({ id: "a", number: "1", dueDate: "2026-12-01" }),
      makeInstrument({ id: "c", number: "9", dueDate: "2026-11-01" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(isCollateral(makeInstrument({ collateral: true }))).toBe(true);
    expect(isCollateral(makeInstrument({ status: "COLLATERAL" }))).toBe(true);
    expect(isCollateral(makeInstrument())).toBe(false);
  });

  it("taraf hücresi: alınan cari, verilen keşideci/şirket, personel maskesi", () => {
    expect(partyOf(makeInstrument())).toEqual({
      code: "120.01",
      name: "Kuzey Lojistik",
      masked: false,
    });
    expect(
      partyOf(
        makeInstrument({
          kind: "CHECK",
          direction: "ISSUED",
          drawerName: null,
          companyName: "Acme",
        }),
      ),
    ).toEqual({ code: "", name: "Acme", masked: false });
    expect(partyOf(makeInstrument({ employeeMasked: true, accountName: null }))).toEqual({
      code: "",
      name: "",
      masked: true,
    });
  });
});

describe("yaşlandırma", () => {
  it("para birimi başına GENEL TOPLAM (ondalık), TL KARŞILIĞI yalnız ≥ 2 para biriminde", () => {
    const rows = [
      aging({ notDue: 0.1, days0To30: 1000.2, total: 1000.3, tlTotal: 1000.3 }),
      aging({ accountId: "a2", notDue: 0.2, daysOver90: 5, total: 5.2, tlTotal: 5.2 }),
      aging({ accountId: "a3", currency: "USD", days31To60: 10, total: 10, tlTotal: 340.5 }),
    ];
    const totals = agingTotals(rows);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toEqual({
      currency: "TRY",
      buckets: {
        notDue: "0.30",
        days0To30: "1000.20",
        days31To60: "0.00",
        days61To90: "0.00",
        daysOver90: "5.00",
      },
      total: "1005.50",
    });
    expect(totals[1].buckets.days31To60).toBe("10.00");
    expect(agingTlTotal(rows)).toBe("1346.00");
    expect(agingTlTotal(rows.slice(0, 2))).toBeNull();
  });

  it("bakiye sınıfı", () => {
    expect(balanceClass(-1)).toBe("text-danger");
    expect(balanceClass(0)).toBe("text-success");
    expect(balanceClass("12.5")).toBe("text-success");
  });
});

describe("performans", () => {
  it("skor rozeti eşikleri ve '{score}%'", () => {
    expect(scoreBadge(85)).toEqual({ className: "badge-success", text: "85%" });
    expect(scoreBadge(80).className).toBe("badge-success");
    expect(scoreBadge(79).className).toBe("badge-warning");
    expect(scoreBadge(50).className).toBe("badge-warning");
    expect(scoreBadge(49).className).toBe("badge-danger");
    expect(scoreBadge(0)).toEqual({ className: "badge-danger", text: "0%" });
    expect(scoreBadge(null)).toEqual({ className: "badge-secondary", text: "-" });
  });

  it("eşleşmesiz kayıt toplamı", () => {
    const row = { unmatchedCount: 2 } as AccountPerformanceRow;
    expect(unmatchedTotal([row, { ...row, unmatchedCount: 3 }])).toBe(5);
    expect(unmatchedTotal([])).toBe(0);
  });
});

describe("döviz pozisyonu", () => {
  const row = (currency: string, receivable: string, payable: string): CurrencyPositionRow => ({
    currency,
    companyId: null,
    cash: "999",
    receivable,
    payable,
    net: "0",
  });

  it("net = alacak − borç (banka/kasa dahil değil), durum", () => {
    expect(positionView(row("USD", "100.10", "40.05"))).toMatchObject({
      net: "60.05",
      kind: "receivable",
    });
    expect(positionView(row("EUR", "1", "3")).kind).toBe("payable");
    expect(positionView(row("TRY", "5", "5.00")).kind).toBe("balanced");
  });

  it("grafik verisi ZTO renkleriyle", () => {
    const data = positionChart([positionView(row("USD", "10", "4"))], {
      receivable: "Alacak",
      payable: "Borç",
    });
    expect(data.labels).toEqual(["USD"]);
    expect(data.datasets[0]).toMatchObject({
      label: "Alacak",
      data: [10],
      backgroundColor: "rgba(40, 167, 69, 0.7)",
      borderWidth: 2,
    });
    expect(data.datasets[1]).toMatchObject({
      label: "Borç",
      data: [4],
      backgroundColor: "rgba(220, 53, 69, 0.7)",
    });
  });
});

describe("Excel", () => {
  it("ondalık metin → sayı, boş/geçersiz → null", () => {
    expect(excelNumber("1234.50")).toBe(1234.5);
    expect(excelNumber(3)).toBe(3);
    expect(excelNumber(null)).toBeNull();
    expect(excelNumber("")).toBeNull();
    expect(excelNumber("x")).toBeNull();
  });
});
