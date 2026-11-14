import { describe, expect, it, vi } from "vitest";
import type { Account, AccountPlanSummary, Balance } from "../../../../pages/finance/types";
import {
  GROUP_BADGES,
  NO_QUICK_FILTERS,
  PLAN_FILTERS,
  accountStats,
  applyQuickFilters,
  approvalBadge,
  branchLabelOf,
  buildRow,
  buildRowsChunked,
  invoiceGapAmounts,
  comparePlanDate,
  defaultOrder,
  financeEntries,
  groupAction,
  groupBadge,
  groupCollator,
  groupFilterOptions,
  listBalanceDisplay,
  matchesPlanFilter,
  planCategory,
  planCount,
  planDateClass,
  planStatusBadge,
  plannedTry,
  rowClassOf,
  totalsModes,
  type RowContext,
} from "./accountsListLogic";

const TODAY = "2026-11-14";

function summary(overrides: Partial<AccountPlanSummary> = {}): AccountPlanSummary {
  return {
    nextDueDate: null,
    overdueCount: 0,
    dueTodayCount: 0,
    draftCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    planned: [],
    ...overrides,
  };
}

function balance(overrides: Partial<Balance> = {}): Balance {
  return {
    currency: "TRY",
    debit: 0,
    credit: 0,
    balance: 0,
    tlBalance: 0,
    companyId: null,
    branchId: null,
    debt: 0,
    payment: 0,
    receivable: 0,
    collection: 0,
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    code: "TED-000001",
    name: "Ankara Lastik",
    type: "SUPPLIER",
    taxNumber: null,
    taxNumberMasked: false,
    branchId: "b1",
    companyId: null,
    representsCompanyId: null,
    balances: [],
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    active: true,
    defaultCurrency: "TRY",
    creditLimit: null,
    riskLimit: null,
    companyLimits: null,
    taxOffice: null,
    companyType: null,
    phone: null,
    email: null,
    website: null,
    contactName: null,
    contactTitle: null,
    contactMobile: null,
    address: null,
    city: null,
    district: null,
    country: null,
    postalCode: null,
    paymentTerms: null,
    notes: null,
    planSummary: null,
    createdBy: "ayse@acme.com",
    createdAt: "2026-01-01T08:00:00Z",
    updatedBy: "ayse@acme.com",
    updatedAt: "2026-01-01T08:00:00Z",
    updateCount: 0,
    ...overrides,
  };
}

const CTX: RowContext = {
  today: TODAY,
  mode: "CURRENCY",
  branchLabel: (id) => (id === "b1" ? "Merkez · İzmir" : undefined),
  branchName: (id) => (id === "b1" ? "Merkez" : undefined),
  companyName: (id) => (id === "c1" ? "Acme" : undefined),
};

describe("listBalanceDisplay (§5.0 #10: yalnız Cari Kartlar −balance)", () => {
  it("+100 → −100 Alacak text-success", () => {
    expect(listBalanceDisplay(100)).toMatchObject({
      value: -100,
      abs: 100,
      tone: "credit",
      className: "text-success",
      icon: "fa-arrow-up",
      badgeClass: "cbr-g",
    });
  });
  it("−50 → 50 Borç text-danger", () => {
    expect(listBalanceDisplay(-50)).toMatchObject({
      value: 50,
      abs: 50,
      tone: "debt",
      className: "text-danger",
      icon: "fa-arrow-down",
      badgeClass: "cbr-r",
    });
  });
  it("0 → Dengede", () => {
    expect(listBalanceDisplay(0)).toMatchObject({
      value: 0,
      tone: "balanced",
      className: "text-muted",
      icon: "fa-equals",
    });
  });
});

describe("planlama durumu", () => {
  it("kategori: gecikmiş / bugün / plansız / gelecek", () => {
    expect(planCategory(null, TODAY)).toBe("noplan");
    expect(planCategory(summary({ nextDueDate: "2026-11-01" }), TODAY)).toBe("overdue");
    expect(planCategory(summary({ overdueCount: 1, nextDueDate: "2026-12-01" }), TODAY)).toBe(
      "overdue",
    );
    expect(planCategory(summary({ nextDueDate: TODAY }), TODAY)).toBe("today");
    expect(planCategory(summary({ dueTodayCount: 2, nextDueDate: "2026-12-01" }), TODAY)).toBe(
      "today",
    );
    expect(planCategory(summary({ nextDueDate: "2026-12-01" }), TODAY)).toBe("future");
  });

  it("Planlama Durumu süzgecinin 7 değeri", () => {
    expect(PLAN_FILTERS).toEqual([
      "",
      "overdue",
      "today",
      "noplan",
      "future",
      "pending",
      "approved",
    ]);
    const s = summary({ nextDueDate: "2026-12-01", pendingCount: 1 });
    expect(matchesPlanFilter(s, "", TODAY)).toBe(true);
    expect(matchesPlanFilter(s, "future", TODAY)).toBe(true);
    expect(matchesPlanFilter(s, "overdue", TODAY)).toBe(false);
    expect(matchesPlanFilter(s, "today", TODAY)).toBe(false);
    expect(matchesPlanFilter(s, "noplan", TODAY)).toBe(false);
    expect(matchesPlanFilter(s, "pending", TODAY)).toBe(true);
    expect(matchesPlanFilter(s, "approved", TODAY)).toBe(false);
    expect(matchesPlanFilter(null, "noplan", TODAY)).toBe(true);
    expect(matchesPlanFilter(summary({ approvedCount: 2 }), "approved", TODAY)).toBe(true);
  });

  it("satır sınıfı, tarih rengi ve rozetler (ZTO CustomerAccount.cs)", () => {
    expect(rowClassOf("overdue")).toBe("overdue-row");
    expect(rowClassOf("today")).toBe("today-row");
    expect(rowClassOf("noplan")).toBe("no-plan-row");
    expect(rowClassOf("future")).toBeUndefined();
    expect(planDateClass("overdue")).toBe("text-danger");
    expect(planDateClass("today")).toBe("text-warning");
    expect(planDateClass("future")).toBe("text-info");
    expect(planStatusBadge("noplan")).toEqual({ key: "none", badge: "secondary" });
    expect(planStatusBadge("overdue")).toEqual({ key: "overdue", badge: "danger" });
    expect(planStatusBadge("today")).toEqual({ key: "today", badge: "warning" });
    expect(planStatusBadge("future")).toEqual({ key: "planned", badge: "info" });
    expect(approvalBadge(null)).toEqual({ key: "waiting", badge: "secondary" });
    expect(approvalBadge(summary({ draftCount: 1 }))).toEqual({ key: "planned", badge: "info" });
    expect(approvalBadge(summary({ draftCount: 1, pendingCount: 1 }))).toEqual({
      key: "pending",
      badge: "warning",
    });
    expect(approvalBadge(summary({ pendingCount: 1, approvedCount: 1 }))).toEqual({
      key: "approved",
      badge: "success",
    });
    expect(planCount(summary({ draftCount: 1, pendingCount: 2, approvedCount: 3 }))).toBe(6);
    expect(planCount(null)).toBe(0);
  });
});

describe("sıralama", () => {
  it("defaultOrder: gecikmiş → bugün → plansız → gelecek, sonra vade ve Türkçe ad", () => {
    const rows = [
      account({ id: "f", name: "Zeta", planSummary: summary({ nextDueDate: "2026-12-01" }) }),
      account({ id: "n2", name: "Çınar", planSummary: null }),
      account({ id: "n1", name: "Cem", planSummary: null }),
      account({ id: "t", name: "Bugün", planSummary: summary({ nextDueDate: TODAY }) }),
      account({ id: "o2", name: "B", planSummary: summary({ nextDueDate: "2026-11-10" }) }),
      account({ id: "o1", name: "A", planSummary: summary({ nextDueDate: "2026-11-01" }) }),
      account({ id: "n3", name: "İlhan", planSummary: null }),
    ];
    expect(defaultOrder(rows, TODAY).map((a) => a.id)).toEqual([
      "o1",
      "o2",
      "t",
      "n1",
      "n2",
      "n3",
      "f",
    ]);
  });

  it("comparePlanDate ISO değerle; null en sonda", () => {
    expect(comparePlanDate("2026-01-02", "2026-01-10")).toBeLessThan(0);
    expect(comparePlanDate("2026-02-01", "2026-01-10")).toBeGreaterThan(0);
    expect(comparePlanDate(null, "2026-01-10")).toBe(1);
    expect(comparePlanDate("2026-01-10", null)).toBe(-1);
    expect(comparePlanDate(null, null)).toBe(0);
  });

  it("groupCollator Türkçe sıra (Ç C'den sonra, İ I'dan sonra; büyük/küçük harf duyarsız)", () => {
    const names = ["Ürün", "Çay", "Cam", "ılık", "İnce", "Ilık", "acente"];
    expect([...names].sort(groupCollator.compare)).toEqual([
      "acente",
      "Cam",
      "Çay",
      "ılık",
      "Ilık",
      "İnce",
      "Ürün",
    ]);
    expect(groupCollator.compare("Grup 2", "Grup 10")).toBeLessThan(0);
  });
});

describe("grup rozetleri", () => {
  it("GROUP_BADGES her tohum grubunu kapsar (V27 14 grup)", () => {
    const seed = [
      "MUSTERI",
      "ACENTE",
      "GENEL",
      "YEDEK_PARCA_SERVIS",
      "AKARYAKIT",
      "HIZMET",
      "ELLECLEME_TASERON",
      "TASERON_NAKLIYECI",
      "SEVK_NAKLIYECI",
      "SURUCU",
      "OFIS",
      "BANKA",
      "ADAY",
      "GRUP_SIRKETI",
    ];
    expect(Object.keys(GROUP_BADGES).sort()).toEqual([...seed].sort());
    expect(GROUP_BADGES.MUSTERI).toEqual({
      bg: "#dcfce7",
      color: "#14532d",
      border: "#bbf7d0",
      icon: "fa-user-tie",
    });
    expect(GROUP_BADGES.ACENTE.icon).toBe("fa-handshake");
    expect(GROUP_BADGES.ACENTE.bg).toBe(GROUP_BADGES.MUSTERI.bg);
    expect(GROUP_BADGES.GENEL.icon).toBe("fa-truck-loading");
    expect(GROUP_BADGES.SURUCU).toBe(GROUP_BADGES.OFIS);
    expect(groupBadge("BILINMEYEN").icon).toBe("fa-tag");
    expect(groupBadge(null).icon).toBe("fa-tag");
  });

  it("Hesap Grubu süzgeci sortOrder sırasıyla, seçilemeyenler dahil", () => {
    const g = (code: string, sortOrder: number, selectable = true) => ({
      code,
      accountType: "SUPPLIER" as const,
      name: code,
      reportType: null,
      codePrefix: code,
      sortOrder,
      typeDefault: false,
      selectable,
      active: true,
    });
    expect(
      groupFilterOptions([g("B", 20), g("ADAY", 130, false), g("A", 10)]).map((x) => x.code),
    ).toEqual(["A", "B", "ADAY"]);
  });

  it("gruba özel işlem", () => {
    expect(groupAction("TASERON_NAKLIYECI", false)?.labelKey).toBe("tripCosts");
    expect(groupAction("SEVK_NAKLIYECI", true)?.href).toBe("/operations/shipments");
    expect(groupAction("SURUCU", true)).toMatchObject({
      labelKey: "driverCard",
      href: "/fleet/drivers",
    });
    expect(groupAction("SURUCU", false)).toBeNull();
    expect(groupAction("GENEL", true)).toBeNull();
  });

  it("iş yeri etiketi ve görünen kipler", () => {
    expect(branchLabelOf("Merkez", "İzmir")).toBe("Merkez · İzmir");
    expect(branchLabelOf("Merkez", null)).toBe("Merkez");
    expect(totalsModes(false)).toEqual(["CURRENCY", "BRANCH"]);
    expect(totalsModes(true)).toEqual(["CURRENCY", "BRANCH", "COMPANY"]);
  });
});

describe("satır modeli ve süzgeçler", () => {
  it("financeEntries: bakiye yoksa kart para biriminde sıfır satır; kipe göre rozet", () => {
    const empty = financeEntries(account({ defaultCurrency: "USD" }), "BRANCH", {
      branch: () => "x",
      company: () => "y",
    });
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ currency: "USD", scopeLabel: null, scopeUndefined: false });

    const balances = [
      balance({ branchId: "b1", companyId: "c1", debt: 10, balance: -10 }),
      balance({ branchId: null, companyId: null, currency: "USD", collection: 5, balance: 5 }),
    ];
    const names = { branch: CTX.branchName, company: CTX.companyName };
    const byBranch = financeEntries(account({ balances }), "BRANCH", names);
    expect(byBranch.map((e) => [e.scopeLabel, e.scopeUndefined])).toEqual([
      ["Merkez", false],
      [null, true],
    ]);
    const byCompany = financeEntries(account({ balances }), "COMPANY", names);
    expect(byCompany.map((e) => e.scopeLabel)).toEqual(["Acme", null]);
    const general = financeEntries(account({ balances }), "CURRENCY", names);
    expect(general.every((e) => e.scopeLabel === null && !e.scopeUndefined)).toBe(true);
    expect(general[0].balance.tone).toBe("debt");
    expect(general[1]).toMatchObject({ currency: "USD", collection: 5 });
  });

  it("buildRow: etiket, rozet, plan ve bakiye bayrakları", () => {
    const row = buildRow(
      account({
        type: "CUSTOMER",
        subGroup: "MUSTERI",
        subGroupName: "Müşteri",
        active: false,
        balances: [balance({ balance: -20 })],
        planSummary: summary({
          nextDueDate: "2026-11-01",
          overdueCount: 1,
          draftCount: 1,
          planned: [
            { currency: "TRY", amount: 100 },
            { currency: "USD", amount: 0 },
          ],
        }),
      }),
      CTX,
    );
    expect(row).toMatchObject({
      branchLabel: "Merkez · İzmir",
      groupName: "Müşteri",
      category: "overdue",
      planCount: 1,
      hasDebtBalance: true,
      zeroBalance: false,
      isCustomer: true,
      active: false,
    });
    expect(row.planned).toEqual([{ currency: "TRY", amount: 100 }]);
    expect(buildRow(account({ branchId: null, subGroupName: "" }), CTX)).toMatchObject({
      branchLabel: null,
      groupName: "GENEL",
      zeroBalance: true,
    });
    expect(buildRow(account({ branchId: "zz" }), CTX).branchLabel).toBeNull();
  });

  it("Borçsuzlar / Müşteriler / Alacaklı Cariler / Planlama Durumu", () => {
    const rows = [
      buildRow(account({ id: "zero" }), CTX),
      buildRow(
        account({ id: "cust", type: "CUSTOMER", balances: [balance({ balance: 50 })] }),
        CTX,
      ),
      buildRow(account({ id: "debt", balances: [balance({ balance: -30 })] }), CTX),
      buildRow(
        account({
          id: "plan",
          balances: [balance({ balance: 10 })],
          planSummary: summary({ nextDueDate: TODAY }),
        }),
        CTX,
      ),
    ];
    const ids = (filters: Partial<typeof NO_QUICK_FILTERS>) =>
      applyQuickFilters(rows, { ...NO_QUICK_FILTERS, ...filters }, TODAY).map((r) => r.id);
    expect(ids({})).toEqual(["zero", "cust", "debt", "plan"]);
    expect(ids({ hideZeroDebt: true })).toEqual(["cust", "debt", "plan"]);
    expect(ids({ hideCustomers: true })).toEqual(["zero", "debt", "plan"]);
    expect(ids({ onlyRedBalance: true })).toEqual(["debt"]);
    expect(ids({ plan: "today" })).toEqual(["plan"]);
    expect(ids({ plan: "noplan", hideZeroDebt: true, hideCustomers: true })).toEqual(["debt"]);
  });

  it("buildRowsChunked 50 ms bütçede verir (sahte saat) ve sonuç senkron sürümle aynı", async () => {
    const accounts = Array.from({ length: 6 }, (_, i) => account({ id: `a${i}`, name: `C${i}` }));
    let clock = 0;
    const now = () => {
      clock += 30;
      return clock;
    };
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const rows = await buildRowsChunked(accounts, CTX, { now });
    expect(rows.map((r) => r.id)).toEqual(accounts.map((a) => a.id));
    expect(rows).toEqual(accounts.map((a) => buildRow(a, CTX)));
    expect(timeout).toHaveBeenCalled();
    timeout.mockRestore();
  });

  it("buildRowsChunked iptal edilince durur", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      buildRowsChunked([account()], CTX, { signal: controller.signal }),
    ).rejects.toThrow();
  });
});

describe("istatistikler", () => {
  it("sayaçlar, plan toplamları ve TL dağılımı", () => {
    const stats = accountStats(
      [
        account({
          planSummary: summary({
            nextDueDate: "2026-11-01",
            overdueCount: 2,
            draftCount: 1,
            pendingCount: 1,
            planned: [{ currency: "TRY", amount: 100 }],
          }),
          balances: [balance({ balance: -100, tlBalance: -100 })],
        }),
        account({
          planSummary: summary({
            nextDueDate: TODAY,
            approvedCount: 1,
            planned: [
              { currency: "USD", amount: 10 },
              { currency: "TRY", amount: 50 },
            ],
          }),
          balances: [
            balance({ balance: 40, tlBalance: 40 }),
            balance({ currency: "USD", balance: 2, tlBalance: 70 }),
          ],
        }),
        account({ planSummary: null, balances: [balance()] }),
        account({ planSummary: summary({ nextDueDate: "2027-01-01" }) }),
      ],
      TODAY,
    );
    expect(stats).toMatchObject({
      overdue: 1,
      today: 1,
      noplan: 1,
      future: 1,
      pending: 1,
      approved: 1,
      draftPlans: 1,
      pendingPlans: 1,
      approvedPlans: 1,
      overduePlans: 2,
      debtTl: 100,
      creditTl: 110,
    });
    expect(stats.planned).toEqual([
      { currency: "TRY", amount: 150 },
      { currency: "USD", amount: 10 },
    ]);
    expect(stats.debtByCurrency).toEqual([{ currency: "TRY", amount: 100 }]);
    expect(stats.creditByCurrency).toEqual([
      { currency: "TRY", amount: 40 },
      { currency: "USD", amount: 2 },
    ]);
    expect(plannedTry(stats.planned)).toBe(150);
  });
});

describe("12.2 eksik fatura (K-12.2-4)", () => {
  it("buildRow invoiceGap bağlamdan; yoksa boş", () => {
    const gaps = new Map([["gap", [{ currency: "TRY", amount: 50 }]]]);
    expect(buildRow(account({ id: "gap" }), { ...CTX, invoiceGaps: gaps }).invoiceGap).toEqual([
      { currency: "TRY", amount: 50 },
    ]);
    expect(buildRow(account({ id: "none" }), { ...CTX, invoiceGaps: gaps }).invoiceGap).toEqual([]);
    expect(buildRow(account({ id: "gap" }), CTX).invoiceGap).toEqual([]);
  });

  it("Eksik Faturalı süzgeci yalnız eksiği olanları bırakır; diğer süzgeçlerle birleşir", () => {
    const gaps = new Map([
      ["gap", [{ currency: "TRY", amount: 50 }]],
      ["cust", [{ currency: "USD", amount: 5 }]],
    ]);
    const ctx = { ...CTX, invoiceGaps: gaps };
    const rows = [
      buildRow(account({ id: "gap" }), ctx),
      buildRow(account({ id: "plain" }), ctx),
      buildRow(account({ id: "cust", type: "CUSTOMER" }), ctx),
    ];
    const ids = (filters: Partial<typeof NO_QUICK_FILTERS>) =>
      applyQuickFilters(rows, { ...NO_QUICK_FILTERS, ...filters }, TODAY).map((r) => r.id);
    expect(ids({ missingInvoice: true })).toEqual(["gap", "cust"]);
    expect(ids({ missingInvoice: true, hideCustomers: true })).toEqual(["gap"]);
    expect(NO_QUICK_FILTERS.missingInvoice).toBe(false);
  });

  it("invoiceGapAmounts ipucu metni", () => {
    expect(
      invoiceGapAmounts(
        [
          { currency: "TRY", amount: 50 },
          { currency: "USD", amount: 2 },
        ],
        (a, c) => `${a} ${c}`,
      ),
    ).toBe("50 TRY, 2 USD");
    expect(invoiceGapAmounts([], (a, c) => `${a} ${c}`)).toBe("");
  });
});
