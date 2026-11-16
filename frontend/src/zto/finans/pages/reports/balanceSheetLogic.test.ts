import { describe, expect, it } from "vitest";
import type {
  BalanceSheetAccount,
  BalanceSheetCompany,
  BalanceSheetCurrency,
  BalanceSheetWorkplace,
} from "../../../../pages/finance/types";
import {
  NET_COLORS,
  absText,
  balanceClass,
  filterAccounts,
  groupWorkplaces,
  hasValue,
  intercompanyRows,
  intercompanyView,
  isNonNegative,
  issuedTotal,
  n0,
  netArrow,
  netKind,
  rateInfo,
  receivedTotal,
} from "./balanceSheetLogic";

function block(overrides: Partial<BalanceSheetCurrency> = {}): BalanceSheetCurrency {
  return {
    currency: "TRY",
    debt: "0",
    payment: "0",
    receivable: "0",
    collection: "0",
    bank: "0",
    cash: "0",
    receivedChecks: "100.50",
    receivedNotes: "50.25",
    issuedChecks: "10",
    issuedNotes: "0",
    receivedCheckCount: 2,
    receivedNoteCount: 1,
    issuedCheckCount: 1,
    issuedNoteCount: 0,
    accountReceivable: "0",
    accountPayable: "0",
    bankOverdraft: "0",
    fxAdjustment: "0",
    net: "0",
    assets: "0",
    liabilities: "0",
    tlAssets: "0",
    tlLiabilities: "0",
    ...overrides,
  };
}

function workplace(id: string, companyId: string, companyName = companyId): BalanceSheetWorkplace {
  return {
    branchId: id,
    branchName: id,
    branchGroupName: null,
    companyId,
    companyName,
    assetsTl: "0",
    liabilitiesTl: "0",
    netTl: "0",
    currencyCount: 0,
    accountCount: 0,
    currencies: [],
    accounts: [],
  };
}

const company = (id: string, name: string): BalanceSheetCompany => ({
  companyId: id,
  companyName: name,
  assetsTl: "1",
  liabilitiesTl: "2",
  netTl: "-1",
});

describe("balanceSheetLogic", () => {
  it("rozet etiketi işaret eşlemesi (Blackrose: > 0 bize borçlu = Borçlu Bakiye)", () => {
    expect(netKind("12.5")).toBe("debtor");
    expect(netKind("-1")).toBe("creditor");
    expect(netKind("0.00")).toBe("balanced");
    expect(NET_COLORS.debtor.color).toBe("#dc2626");
    expect(NET_COLORS.creditor.bg).toBe("#f0fdf4");
  });

  it("ok yönleri ve cari bakiye sınıfları", () => {
    expect(netArrow("5")).toBe("fa-arrow-up");
    expect(netArrow("-5")).toBe("fa-arrow-down");
    expect(netArrow("0")).toBeNull();
    expect(balanceClass("1")).toBe("borcli");
    expect(balanceClass("-1")).toBe("alacakli");
    expect(balanceClass("0")).toBe("denge");
  });

  it("grup şirketi yönü: > 0 alacaklıyız (sol ok), < 0 borçluyuz (sağ ok)", () => {
    expect(intercompanyView("10")).toEqual({
      direction: "receivable",
      icon: "fas fa-long-arrow-alt-left text-danger",
      color: "#dc2626",
    });
    expect(intercompanyView("-10").direction).toBe("payable");
    expect(intercompanyView("0").icon).toBe("fas fa-equals text-muted");
  });

  it("tam sayı gösterim, mutlak değer, pozitif net", () => {
    expect(n0("1234.56")).toBe("1.235");
    expect(n0(null)).toBe("0");
    expect(absText("-12.30")).toBe("12.30");
    expect(absText("7")).toBe("7.00");
    expect(isNonNegative("0")).toBe(true);
    expect(isNonNegative("-0.01")).toBe(false);
  });

  it("Tahsil/Ödenecek = çek + senet; bilgi satırı yalnız değer ≠ 0", () => {
    expect(receivedTotal(block())).toBe("150.75");
    expect(issuedTotal(block())).toBe("10.00");
    expect(hasValue("0.00")).toBe(false);
    expect(hasValue("-2000")).toBe(true);
  });

  it("şirket gruplaması: companies[] sırası, kartı olmayan şirket atlanır, bilinmeyen şirket sonda", () => {
    const groups = groupWorkplaces({
      companies: [company("c2", "Beta"), company("c1", "Acme"), company("c3", "Boş")],
      workplaces: [
        workplace("b1", "c1"),
        workplace("b2", "c2"),
        workplace("b3", "c9", "Gama"),
        workplace("b4", "c1"),
      ],
    });
    expect(
      groups.map((g) => [g.companyName, g.workplaces.map((w) => w.branchId), !!g.summary]),
    ).toEqual([
      ["Beta", ["b2"], true],
      ["Acme", ["b1", "b4"], true],
      ["Gama", ["b3"], false],
    ]);
  });

  it("cari araması ad ya da kodda, tr küçük harf; maskeli satır aramada çıkmaz", () => {
    const accounts: BalanceSheetAccount[] = [
      {
        accountId: "a1",
        accountCode: "MUS-1",
        accountName: "İzmir Liman",
        subGroupName: "Müşteri",
        masked: false,
        balances: [],
      },
      {
        accountId: "a2",
        accountCode: "TED-9",
        accountName: "Kuzey",
        subGroupName: "Tedarikçi",
        masked: false,
        balances: [],
      },
      {
        accountId: null,
        accountCode: null,
        accountName: null,
        subGroupName: "Personel",
        masked: true,
        balances: [],
      },
    ];
    expect(filterAccounts(accounts, "")).toHaveLength(3);
    expect(filterAccounts(accounts, "izmir").map((a) => a.accountId)).toEqual(["a1"]);
    expect(filterAccounts(accounts, "ted").map((a) => a.accountId)).toEqual(["a2"]);
  });

  it("grup şirketi satırları iş yerinin şirketine göre, para birimi başına", () => {
    const rows = intercompanyRows(
      [
        {
          accountId: "i1",
          accountName: "Beta Grup",
          representsCompanyId: "c2",
          companyId: "c1",
          balances: [
            { currency: "TRY", amount: "10" },
            { currency: "USD", amount: "-3" },
          ],
        },
        {
          accountId: "i2",
          accountName: "Acme Grup",
          representsCompanyId: "c1",
          companyId: "c2",
          balances: [{ currency: "TRY", amount: "-10" }],
        },
      ],
      "c1",
    );
    expect(rows.map((r) => [r.key, r.amount])).toEqual([
      ["i1|TRY", "10"],
      ["i1|USD", "-3"],
    ]);
  });

  it("TCMB kur bilgisi: iş yerindeki TL dışı para birimleri", () => {
    const rates = [
      { currency: "USD", rate: "32.5", rateDate: "2026-11-16" },
      { currency: "EUR", rate: "35.123", rateDate: "2026-11-16" },
      { currency: "GBP", rate: "41", rateDate: "2026-11-16" },
    ];
    expect(rateInfo(rates, [block(), block({ currency: "USD" }), block({ currency: "EUR" })])).toBe(
      "1 $ = 32,50 ₺ · 1 € = 35,12 ₺",
    );
    expect(rateInfo(rates, [block()])).toBe("");
  });
});
