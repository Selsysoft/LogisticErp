import { describe, expect, it } from "vitest";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import {
  NO_CARD_FILTERS,
  applyFormFilters,
  currencyTotals,
  currencyTotalsText,
  dayBadge,
  firstOfMonth,
  groupReport,
  isReportItem,
  parseReportState,
  reportRowText,
  reportSearch,
  rowVisible,
  sortReportRows,
  summaryCards,
  toReportRows,
  toggleCardFilter,
  validateReportRange,
} from "./checkReportLogic";

const TODAY = "2026-11-16";
const FALLBACK = { workPlace: "Tanımsız İş Yeri", bank: "Tanımsız Banka" };

function item(overrides: Partial<InstrumentListItem> = {}): InstrumentListItem {
  return {
    id: "i1",
    kind: "CHECK",
    direction: "ISSUED",
    number: "0000100",
    bankName: "Ziraat",
    bankBranch: "Konak",
    issueDate: "2026-11-01",
    dueDate: "2026-11-20",
    money: { amount: "100.10", currency: "TRY" },
    status: "ISSUED",
    accountId: "a1",
    accountCode: "320.01",
    accountName: "Tedarikçi A",
    accountType: "SUPPLIER",
    employeeMasked: false,
    endorsedAccountId: null,
    endorsedAccountName: null,
    drawerName: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    companyName: "Acme",
    fundAccountId: "f1",
    fundName: "Ziraat Vadesiz",
    fundKind: "BANK",
    fundBankName: "Ziraat",
    custodyFundId: null,
    custodyFundName: null,
    checkLeafId: null,
    checkBookId: null,
    checkBookSerial: null,
    leafNo: null,
    description: null,
    noteType: null,
    collateral: false,
    settledDate: null,
    originSettlementId: null,
    originSettlementStatus: null,
    movementCount: 1,
    lastMovementDate: null,
    allowedTransitions: [],
    ...overrides,
  };
}

const rowsOf = (items: InstrumentListItem[]) => toReportRows(items, TODAY, FALLBACK);

describe("aralık ve URL durumu", () => {
  it("varsayılan: ayın ilk günü … bugün, due-asc", () => {
    expect(firstOfMonth(TODAY)).toBe("2026-11-01");
    expect(parseReportState(new URLSearchParams(), TODAY)).toEqual({
      from: "2026-11-01",
      to: TODAY,
      workPlaceId: "",
      bankId: "",
      currency: "",
      sortBy: "due-asc",
    });
  });

  it("gidiş-dönüş; geçersiz sıralama varsayılana düşer", () => {
    const state = {
      from: "2026-10-01",
      to: "2026-10-31",
      workPlaceId: "b1",
      bankId: "f1",
      currency: "USD",
      sortBy: "amount-desc" as const,
    };
    expect(parseReportState(reportSearch(state), TODAY)).toEqual(state);
    expect(reportSearch({ ...state, sortBy: "due-asc", bankId: "" }).toString()).toBe(
      "from=2026-10-01&to=2026-10-31&workPlaceId=b1&currency=USD",
    );
    expect(parseReportState(new URLSearchParams("sortBy=x&currency=usd"), TODAY)).toMatchObject({
      sortBy: "due-asc",
      currency: "USD",
    });
  });

  it("doğrulama: boş tarih ve ters aralık", () => {
    expect(validateReportRange("", TODAY)).toBe("checks.report.errors.required");
    expect(validateReportRange("2026-11-20", "2026-11-01")).toBe("checks.report.errors.order");
    expect(validateReportRange("2026-11-01", "2026-11-01")).toBeNull();
  });
});

describe("satırlar", () => {
  it("yalnız kendi çekimiz (verilen) ve iptal edilmemiş", () => {
    expect(isReportItem(item())).toBe(true);
    expect(isReportItem(item({ direction: "RECEIVED" }))).toBe(false);
    expect(isReportItem(item({ status: "CANCELLED" }))).toBe(false);
    expect(isReportItem(item({ kind: "NOTE" }))).toBe(false);
    const rows = rowsOf([item(), item({ id: "x", direction: "RECEIVED" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workPlaceId: "b1",
      bankId: "f1",
      bankName: "Ziraat",
      currency: "TRY",
      remainingDays: 4,
    });
  });

  it("fon/şube yoksa ZTO 'Tanımsız' adları", () => {
    const [row] = rowsOf([
      item({ branchName: "", fundAccountId: null, fundBankName: null, bankName: null }),
    ]);
    expect(row).toMatchObject({
      workPlaceName: "Tanımsız İş Yeri",
      bankId: "",
      bankName: "Tanımsız Banka",
    });
  });

  it("sıralama dört seçenek (decimal tutar karşılaştırması)", () => {
    const rows = rowsOf([
      item({ id: "a", dueDate: "2026-11-20", money: { amount: "9.99", currency: "TRY" } }),
      item({ id: "b", dueDate: "2026-11-10", money: { amount: "100.00", currency: "TRY" } }),
      item({ id: "c", dueDate: "2026-11-30", money: { amount: "10.00", currency: "TRY" } }),
    ]);
    const ids = (sort: Parameters<typeof sortReportRows>[1]) =>
      sortReportRows(rows, sort).map((r) => r.item.id);
    expect(ids("due-asc")).toEqual(["b", "a", "c"]);
    expect(ids("due-desc")).toEqual(["c", "a", "b"]);
    expect(ids("amount-desc")).toEqual(["b", "c", "a"]);
    expect(ids("amount-asc")).toEqual(["a", "c", "b"]);
  });

  it("form süzgeçleri: iş yeri, banka, para birimi", () => {
    const rows = rowsOf([
      item({ id: "a" }),
      item({ id: "b", branchId: "b2", branchName: "Şube" }),
      item({ id: "c", fundAccountId: "f2", money: { amount: "5", currency: "USD" } }),
    ]);
    const base = parseReportState(new URLSearchParams(), TODAY);
    expect(applyFormFilters(rows, { ...base, workPlaceId: "b2" }).map((r) => r.item.id)).toEqual([
      "b",
    ]);
    expect(applyFormFilters(rows, { ...base, bankId: "f2" }).map((r) => r.item.id)).toEqual(["c"]);
    expect(applyFormFilters(rows, { ...base, currency: "USD" }).map((r) => r.item.id)).toEqual([
      "c",
    ]);
    expect(applyFormFilters(rows, base)).toHaveLength(3);
  });
});

describe("para birimi toplamları", () => {
  it("decimal toplama, adet ve ZTO metni", () => {
    const rows = rowsOf([
      item({ money: { amount: "0.10", currency: "TRY" } }),
      item({ id: "2", money: { amount: "0.20", currency: "TRY" } }),
      item({ id: "3", money: { amount: "1000", currency: "USD" } }),
    ]);
    expect(currencyTotals(rows)).toEqual([
      { currency: "USD", total: "1000.00", count: 1 },
      { currency: "TRY", total: "0.30", count: 2 },
    ]);
    expect(currencyTotalsText(rows)).toBe("1.000,00 $ | 0,30 ₺");
    expect(currencyTotalsText([])).toBe("0,00 ₺");
  });
});

describe("iş yeri → banka gruplama", () => {
  const funds = new Map([
    [
      "f1",
      { id: "f1", name: "Ziraat TL", bankName: "Ziraat", bankBranchName: "Alsancak", iban: "TR11" },
    ],
  ]);

  it("gruplar tr sırasıyla; banka meta fon tanımından; ara toplamlar", () => {
    const rows = rowsOf([
      item({ id: "1", branchId: "b2", branchName: "Şube" }),
      item({
        id: "2",
        branchId: "b1",
        branchName: "Çarşı",
        fundAccountId: "f2",
        fundBankName: "Akbank",
        fundName: "Ak USD",
        money: { amount: "50", currency: "USD" },
      }),
      item({ id: "3", branchId: "b1", branchName: "Çarşı" }),
    ]);
    const groups = groupReport(rows, funds);
    expect(groups.map((g) => g.workPlaceName)).toEqual(["Çarşı", "Şube"]);
    const [carsi] = groups;
    expect(carsi.count).toBe(2);
    expect(carsi.totalsText).toBe("50,00 $ | 100,10 ₺");
    expect(carsi.banks.map((b) => b.bankName)).toEqual(["Akbank", "Ziraat"]);
    expect(carsi.banks[1]).toMatchObject({
      officialName: "Ziraat TL",
      branchName: "Alsancak",
      iban: "TR11",
      count: 1,
      totalsText: "100,10 ₺",
    });
    expect(carsi.banks[0]).toMatchObject({
      officialName: "Ak USD",
      branchName: "Konak",
      iban: "-",
    });
  });

  it("özet kartları: iş yeri grup sırası, banka/para birimi adet azalan; en çok 10", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({
        id: `x${i}`,
        fundAccountId: `f${i}`,
        fundBankName: `Banka ${String(i).padStart(2, "0")}`,
      }),
    );
    const rows = rowsOf([...many, item({ id: "y", money: { amount: "1", currency: "EUR" } })]);
    const cards = summaryCards(rows, groupReport(rows, new Map()));
    expect(cards.workPlaces).toHaveLength(1);
    expect(cards.banks).toHaveLength(10);
    expect(cards.banks[0]).toMatchObject({ value: "f1", count: 2 });
    expect(cards.currencies.map((c) => c.value)).toEqual(["TRY", "EUR"]);
  });
});

describe("istemci süzgeçleri ve rozet", () => {
  it("kart tıklaması açılır/kapanır; arama + kart birlikte", () => {
    const toggled = toggleCardFilter(NO_CARD_FILTERS, "bank", "f1");
    expect(toggled.bank).toBe("f1");
    expect(toggleCardFilter(toggled, "bank", "f1").bank).toBe("");
    const [row] = rowsOf([item({ description: "Kira ödemesi" })]);
    const text = reportRowText(row, "Kullanıldı");
    expect(rowVisible(row, text, "KİRA", NO_CARD_FILTERS)).toBe(true);
    expect(rowVisible(row, text, "yok", NO_CARD_FILTERS)).toBe(false);
    expect(rowVisible(row, text, "", { ...NO_CARD_FILTERS, bank: "f9" })).toBe(false);
    expect(
      rowVisible(row, text, "", { ...NO_CARD_FILTERS, currency: "TRY", workPlace: "b1" }),
    ).toBe(true);
  });

  it("kalan gün rozeti: ödendi, geçti, bugün, kaldı", () => {
    const [paid] = rowsOf([item({ status: "PAID" })]);
    expect(dayBadge(paid).className).toBe("days-collected");
    const [late] = rowsOf([item({ dueDate: "2026-11-10" })]);
    expect(dayBadge(late)).toMatchObject({ className: "days-overdue", count: 6 });
    const [today] = rowsOf([item({ dueDate: TODAY })]);
    expect(dayBadge(today).key).toBe("checks.report.days.today");
    const [future] = rowsOf([item({ dueDate: "2026-11-26" })]);
    expect(dayBadge(future)).toMatchObject({ className: "days-future", count: 10 });
  });
});
