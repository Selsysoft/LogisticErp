import { describe, expect, it } from "vitest";
import {
  BILL_STATUS_FILTERS,
  billMenuIcon,
  billParties,
  billStats,
  billStatusBadgeClass,
  billTransitionBody,
  compareAmount,
  compareBills,
  filterBills,
  fundKindFor,
  hasActiveFilter,
  maturity,
  needsConfirm,
  validateBillStatus,
} from "./billsLogic";
import { makeInstrument } from "./billsTestUtils";

const TODAY = "2026-11-16";

describe("billsLogic süzgeç", () => {
  const rows = [
    makeInstrument({ id: "p", status: "PORTFOLIO", noteType: "BOND" }),
    makeInstrument({ id: "i", status: "ISSUED", direction: "ISSUED", noteType: "PLAIN" }),
    makeInstrument({ id: "c", status: "COLLATERAL", noteType: "ORDER" }),
    makeInstrument({ id: "paid", status: "PAID", accountId: "a2" }),
    makeInstrument({ id: "col", status: "COLLECTED_TO_CASH" }),
    makeInstrument({ id: "pr", status: "PROTESTED" }),
    makeInstrument({ id: "x", status: "CANCELLED" }),
    makeInstrument({ id: "r", status: "RETURNED" }),
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);

  it("durum seçenekleri ZTO kümelerine eşlenir", () => {
    expect(BILL_STATUS_FILTERS.PORTFOLIO).toEqual(["PORTFOLIO", "ISSUED"]);
    const f = (status: Parameters<typeof filterBills>[1]["status"]) =>
      ids(filterBills(rows, { status, noteType: "", accountId: "" }));
    expect(f("")).toHaveLength(8);
    expect(f("PORTFOLIO")).toEqual(["p", "i"]);
    expect(f("COLLATERAL")).toEqual(["c"]);
    expect(f("PAID")).toEqual(["paid", "col"]);
    expect(f("PROTESTED")).toEqual(["pr"]);
    expect(f("CANCELLED")).toEqual(["x", "r"]);
  });

  it("tür ve cari süzgeci birlikte uygulanır", () => {
    expect(ids(filterBills(rows, { status: "", noteType: "PLAIN", accountId: "" }))).toEqual(["i"]);
    expect(ids(filterBills(rows, { status: "PAID", noteType: "", accountId: "a2" }))).toEqual([
      "paid",
    ]);
    expect(hasActiveFilter({ status: "", noteType: "", accountId: "" })).toBe(false);
    expect(hasActiveFilter({ status: "", noteType: "BOND", accountId: "" })).toBe(true);
  });
});

describe("billStats", () => {
  it("portföy adedi/tutarı para birimi başına, vadesi geçen açık senetler", () => {
    const stats = billStats(
      [
        makeInstrument({ status: "PORTFOLIO", money: { amount: "100.50", currency: "TRY" } }),
        makeInstrument({ status: "ISSUED", money: { amount: "200.25", currency: "TRY" } }),
        makeInstrument({ status: "PORTFOLIO", money: { amount: "10", currency: "USD" } }),
        makeInstrument({ status: "PORTFOLIO", money: { amount: "5", currency: "EUR" } }),
        makeInstrument({ status: "PAID", money: { amount: "999", currency: "TRY" } }),
        makeInstrument({ status: "COLLATERAL", dueDate: "2026-11-01" }),
        makeInstrument({ status: "PAID", dueDate: "2026-11-01" }),
      ],
      TODAY,
    );
    expect(stats.total).toBe(7);
    expect(stats.portfolioCount).toBe(4);
    expect(stats.portfolioAmounts).toEqual([
      { amount: "300.75", currency: "TRY" },
      { amount: "5.00", currency: "EUR" },
      { amount: "10.00", currency: "USD" },
    ]);
    expect(stats.overdueCount).toBe(1);
  });

  it("boş liste", () => {
    expect(billStats([], TODAY)).toEqual({
      total: 0,
      portfolioCount: 0,
      portfolioAmounts: [],
      overdueCount: 0,
    });
  });
});

describe("hücreler", () => {
  it("kalan gün rozeti eşikleri (BillsController)", () => {
    expect(maturity("2026-11-10", TODAY)).toEqual({
      kind: "overdue",
      days: -6,
      className: "badge-danger",
    });
    expect(maturity("2026-11-23", TODAY)?.kind).toBe("thisWeek");
    expect(maturity("2026-12-16", TODAY)?.className).toBe("badge-info");
    expect(maturity("2027-01-30", TODAY)?.className).toBe("badge-secondary");
    expect(maturity("", TODAY)).toBeNull();
  });

  it("durum rozetleri", () => {
    expect(billStatusBadgeClass("ISSUED")).toBe("badge-info");
    expect(billStatusBadgeClass("COLLATERAL")).toBe("badge-warning");
    expect(billStatusBadgeClass("COLLECTED")).toBe("badge-success");
    expect(billStatusBadgeClass("PROTESTED")).toBe("badge-danger");
    expect(billStatusBadgeClass("RETURNED")).toBe("badge-secondary");
  });

  it("taraflar yöne göre", () => {
    const received = billParties(makeInstrument({ drawerName: "Ali Veli" }));
    expect(received.drawer).toEqual({ code: null, name: "Ali Veli" });
    expect(received.drawee).toEqual({ code: "120.01", name: "Kuzey Lojistik" });
    expect(received.payee).toEqual({ code: null, name: "Acme" });
    expect(billParties(makeInstrument()).drawer.name).toBe("Kuzey Lojistik");
    const issued = billParties(makeInstrument({ direction: "ISSUED" }));
    expect(issued.drawer).toEqual({ code: "Acme", name: "Merkez" });
    expect(issued.payee.name).toBe("Kuzey Lojistik");
  });

  it("menü simgeleri ve sıralama", () => {
    expect(billMenuIcon("COLLATERAL")).toContain("fa-shield-alt");
    expect(billMenuIcon("bilinmeyen")).toContain("fa-exchange-alt");
    const a = makeInstrument({ dueDate: "2026-12-01", number: "B" });
    const b = makeInstrument({ dueDate: "2026-12-01", number: "A" });
    const c = makeInstrument({ dueDate: "2026-11-30", money: { amount: "2", currency: "TRY" } });
    expect([a, b, c].sort(compareBills).map((row) => row.number)).toEqual(["SEN-001", "A", "B"]);
    expect(compareAmount(a, c)).toBe(1);
  });
});

describe("durum modalı", () => {
  const portfolio = makeInstrument({ status: "PORTFOLIO" });
  const atBank = makeInstrument({ status: "AT_BANK", fundAccountId: "f1" });

  it("hedefin istediği fon", () => {
    expect(fundKindFor(portfolio, "PAID")).toBe("BANK");
    expect(fundKindFor(portfolio, "AT_BANK")).toBe("BANK");
    expect(fundKindFor(portfolio, "COLLECTED")).toBe("BANK");
    expect(fundKindFor(atBank, "COLLECTED")).toBeNull();
    expect(fundKindFor(portfolio, "COLLECTED_TO_CASH")).toBe("CASH");
    expect(fundKindFor(portfolio, "COLLATERAL")).toBeNull();
    expect(fundKindFor(portfolio, "")).toBeNull();
  });

  it("doğrulama iletileri", () => {
    const base = { target: "PAID" as const, date: TODAY, fundAccountId: "", note: "" };
    expect(validateBillStatus(portfolio, base)).toBe("bankRequired");
    expect(validateBillStatus(portfolio, { ...base, target: "COLLECTED_TO_CASH" })).toBe(
      "cashRequired",
    );
    expect(validateBillStatus(portfolio, { ...base, fundAccountId: "f1", date: "" })).toBe(
      "dateRequired",
    );
    expect(validateBillStatus(portfolio, { ...base, target: "PROTESTED" })).toBeNull();
  });

  it("gövde: fon yalnız gereken hedefte, not kırpılır", () => {
    expect(
      billTransitionBody(portfolio, {
        target: "PAID",
        date: TODAY,
        fundAccountId: "f1",
        note: "  ödeme ",
      }),
    ).toEqual({ toStatus: "PAID", date: TODAY, fundAccountId: "f1", note: "ödeme" });
    expect(
      billTransitionBody(portfolio, {
        target: "COLLATERAL",
        date: TODAY,
        fundAccountId: "f1",
        note: "",
      }),
    ).toEqual({ toStatus: "COLLATERAL", date: TODAY });
  });

  it("ters kayıt yazan hedeflerde onay", () => {
    expect(needsConfirm("PROTESTED")).toBe(true);
    expect(needsConfirm("RETURNED")).toBe(true);
    expect(needsConfirm("COLLATERAL")).toBe(false);
  });
});
