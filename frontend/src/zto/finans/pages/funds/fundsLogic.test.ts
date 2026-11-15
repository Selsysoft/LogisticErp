import { describe, expect, it } from "vitest";
import type { Fund, FundSummaryRow } from "../../../../pages/finance/types";
import type { BranchTree } from "../../../branch/branchTree";
import {
  ALL_VALUE,
  UNDEFINED_LABEL,
  accountTypeMeta,
  balanceClass,
  branchGroupName,
  branchIndex,
  buildCard,
  cashGroupCounts,
  cashStats,
  chipValueOf,
  companyNames,
  currencyTotals,
  deleteBlockedReason,
  filterCards,
  groupBanks,
  groupCashes,
  markParts,
  matchesSearch,
  parseAccountType,
  parseCashGroup,
  progressPct,
  searchWords,
  parseSettlementModal,
  settlementPath,
  SETTLEMENT_MODAL_PARAMS,
  signedAmountText,
  statItems,
  summaryByType,
  toggleChip,
  typeCounts,
} from "./fundsLogic";

const TREE: BranchTree = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [{ id: "b1", code: "IY-1", name: "Merkez", active: true }],
      },
      {
        groupId: null,
        groupName: "",
        groupActive: true,
        branches: [{ id: "b2", code: "IY-2", name: "Şişli Depo", active: true }],
      },
    ],
  },
  {
    companyId: "c2",
    companyName: "Beta",
    companyActive: true,
    groups: [
      {
        groupId: "g2",
        groupName: "Ankara",
        groupActive: true,
        branches: [{ id: "b3", code: "IY-3", name: "Çankaya", active: true }],
      },
    ],
  },
];

function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "f1",
    code: "ZRT-1",
    name: "Ziraat Vadesiz",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: "T.C. Ziraat Bankası A.Ş.",
    iban: "TR33 0006 1005 1978 6457 8413 26",
    allowNegative: false,
    balance: 1000,
    accountType: "DEMAND",
    accountNo: "****1234",
    bankBranchName: "Merkez Şube",
    description: null,
    active: true,
    currentBalance: 1000,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 500,
    openingDate: "2026-01-01",
    transactionCount: 3,
    ...overrides,
  };
}

const branches = branchIndex(TREE);
const companies = companyNames([
  { id: "c1", code: "ACME", shortName: "Acme", title: "Acme", defaultCompany: true, active: true },
  { id: "c2", code: "BETA", shortName: "Beta", title: "Beta", defaultCompany: false, active: true },
]);
const card = (overrides: Partial<Fund> = {}) => buildCard(makeFund(overrides), branches, companies);

describe("fundsLogic — yardımcılar", () => {
  it("hesap türü meta ve ?type= ayrıştırma", () => {
    expect(accountTypeMeta("CREDIT")).toEqual({
      slug: "kredi",
      icon: "fa-hand-holding-usd",
      color: "#f59e0b",
    });
    expect(accountTypeMeta(null).slug).toBe("vadesiz");
    expect(accountTypeMeta("XX" as never).slug).toBe("vadesiz");
    expect(parseAccountType("deposit")).toBe("DEPOSIT");
    expect(parseAccountType("Vadesiz")).toBeNull();
    expect(parseAccountType(null)).toBeNull();
  });

  it("iş yeri dizini: ad, şube grubu (boş → Diğer), şirket", () => {
    expect(branches.get("b1")).toEqual({ name: "Merkez", groupName: "İzmir", companyId: "c1" });
    expect(branchGroupName(branches, "b2")).toBe("Diğer");
    expect(branchGroupName(branches, "yok")).toBe("Diğer");
    expect(branchGroupName(branches, "")).toBe("");
    expect(branchIndex(undefined).size).toBe(0);
  });

  it("kart: banka çipi marka (yoksa Tanımsız), kasa çipi ad|kod", () => {
    expect(card().chipKey).toBe("T.C. Ziraat Bankası A.Ş.");
    expect(card({ bankName: null }).chipKey).toBe(UNDEFINED_LABEL);
    const cash = card({ kind: "CASH", name: "Merkez Kasa", code: "K1" });
    expect(cash.chipKey).toBe("Merkez Kasa|K1");
    expect(cash.chipLabel).toBe("Merkez Kasa (K1)");
    expect(card({ branchId: "yok", companyId: "c9" })).toMatchObject({
      workPlaceName: "",
      branchGroupName: "Diğer",
      companyName: "",
    });
  });

  it("arama: ≥ 2 karakter, çok kelime hepsi, TR katlama, boşluksuz IBAN", () => {
    expect(searchWords("z")).toEqual([]);
    expect(searchWords("  ziraat  merkez ")).toEqual(["ZIRAAT", "MERKEZ"]);
    expect(matchesSearch(card(), searchWords("ziraat sube"))).toBe(true);
    expect(matchesSearch(card(), searchWords("ziraat garanti"))).toBe(false);
    expect(matchesSearch(card(), searchWords("TR330006"))).toBe(true);
    expect(matchesSearch(card(), searchWords("izmir"))).toBe(true);
    expect(matchesSearch(card(), [])).toBe(true);
  });

  it("vurgu: her sözcüğün tüm geçişleri, özgün harflerle", () => {
    expect(markParts("Şişli Şube", ["SI"])).toEqual([
      { text: "Şi", mark: true },
      { text: "şli Şube", mark: false },
    ]);
    expect(markParts("Şişli Şube", ["S"])).toEqual([
      { text: "Ş", mark: true },
      { text: "i", mark: false },
      { text: "ş", mark: true },
      { text: "li ", mark: false },
      { text: "Ş", mark: true },
      { text: "ube", mark: false },
    ]);
    expect(markParts("Ziraat", [])).toEqual([{ text: "Ziraat", mark: false }]);
    expect(markParts("", ["A"])).toEqual([{ text: "", mark: false }]);
    expect(markParts("Ziraat Merkez", ["ZIR", "MER"])).toEqual([
      { text: "Zir", mark: true },
      { text: "aat ", mark: false },
      { text: "Mer", mark: true },
      { text: "kez", mark: false },
    ]);
  });
});

describe("fundsLogic — süzgeç ve çipler", () => {
  const cards = [
    card(),
    card({
      id: "f2",
      name: "Garanti",
      bankName: "Türkiye Garanti Bankası A.Ş.",
      currency: "USD",
      branchId: "b2",
    }),
    card({ id: "f3", name: "Beta Halk", bankName: null, companyId: "c2", branchId: "b3" }),
  ];

  it("çip değeri türe göre", () => {
    expect(chipValueOf(cards[0], "company")).toBe("Acme");
    expect(chipValueOf(cards[0], "workplace")).toBe("Merkez");
    expect(chipValueOf(cards[1], "currency")).toBe("$");
    expect(chipValueOf(cards[2], "bank")).toBe(UNDEFINED_LABEL);
    expect(chipValueOf(card({ companyId: "x", branchId: "x" }), "company")).toBe(UNDEFINED_LABEL);
    expect(chipValueOf(card({ companyId: "x", branchId: "x" }), "workplace")).toBe(UNDEFINED_LABEL);
  });

  it("çip + arama birlikte süzer", () => {
    expect(filterCards(cards, { currency: "₺" }, []).map((c) => c.fund.id)).toEqual(["f1", "f3"]);
    expect(
      filterCards(cards, { currency: "₺", company: "Beta", bank: null }, []).map((c) => c.fund.id),
    ).toEqual(["f3"]);
    expect(filterCards(cards, {}, searchWords("garanti")).map((c) => c.fund.id)).toEqual(["f2"]);
  });

  it("çip öğeleri: sayı görünürden, boş öğe işaretli, yüzde ve Tümü", () => {
    const visible = filterCards(cards, { currency: "₺" }, []);
    const items = statItems(cards, visible, "currency", "₺");
    expect(items).toEqual([
      { value: "₺", label: "₺", count: 2, pct: 100, empty: false },
      { value: "$", label: "$", count: 0, pct: 0, empty: true },
    ]);
    const banks = statItems(cards, visible, "bank", null, "Tüm Bankalar");
    expect(banks[0]).toEqual({
      value: ALL_VALUE,
      label: "Tüm Bankalar",
      count: 2,
      pct: 100,
      empty: false,
    });
    expect(banks.find((i) => i.value === UNDEFINED_LABEL)).toMatchObject({ count: 1, pct: 50 });
    expect(statItems(cards, [], "bank", "x", "Tümü")[0].empty).toBe(true);
    expect(statItems([], [], "currency", null)).toEqual([]);
  });

  it("çip tıklaması: aynı öğe kaldırır, Tümü kaldırır", () => {
    expect(toggleChip(null, "₺")).toBe("₺");
    expect(toggleChip("₺", "₺")).toBeNull();
    expect(toggleChip("₺", ALL_VALUE)).toBeNull();
  });
});

describe("fundsLogic — gruplama ve toplamlar", () => {
  const cards = [
    card({ id: "a", name: "B Hesap", currentBalance: 300 }),
    card({ id: "b", name: "A Hesap", bankBranchName: "Z", currentBalance: -100 }),
    card({ id: "c", name: "A Hesap", bankBranchName: "A", currentBalance: 100 }),
    card({ id: "d", accountType: "CREDIT", currentBalance: -50 }),
    card({ id: "e", companyId: "c2", currency: "USD", currentBalance: 10 }),
  ];

  it("tür grupları sırası ve grup içi ad + şube", () => {
    const [all] = groupBanks(cards, false);
    expect(all.companyId).toBeNull();
    expect(all.types.map((g) => g.type)).toEqual(["DEMAND", "CREDIT"]);
    expect(all.types[0].cards.map((c) => c.fund.id)).toEqual(["c", "b", "a", "e"]);
    expect(all.types[0].totals).toEqual([
      { currency: "USD", symbol: "$", total: 10 },
      { currency: "TRY", symbol: "₺", total: 300 },
    ]);
  });

  it("şube adı ve tür boş kartlar da sıralanır", () => {
    const [all] = groupBanks(
      [
        card({ id: "x", name: "Aynı", bankBranchName: null, accountType: undefined as never }),
        card({ id: "y", name: "Aynı", bankBranchName: null }),
      ],
      false,
    );
    expect(all.types[0].cards.map((c) => c.fund.id)).toEqual(["x", "y"]);
  });

  it("konsolidede şirket grupları", () => {
    const groups = groupBanks(cards, true);
    expect(groups.map((g) => [g.companyName, g.types.map((t) => t.cards.length)])).toEqual([
      ["Acme", [3, 1]],
      ["Beta", [1]],
    ]);
    expect(groups[0].totals).toEqual([{ currency: "TRY", symbol: "₺", total: 250 }]);
  });

  it("bakiye çubuğu: aynı para birimli |bakiye| payı", () => {
    const group = cards.slice(0, 3);
    expect(progressPct(group[0], group)).toBe(60);
    expect(progressPct(group[1], group)).toBe(20);
    expect(progressPct(card({ currentBalance: 0 }), [card({ currentBalance: 0 })])).toBe(0);
  });

  it("para birimi toplamları özel tutarla", () => {
    expect(currencyTotals(cards.slice(0, 1), (f) => f.openingBalance)).toEqual([
      { currency: "TRY", symbol: "₺", total: 500 },
    ]);
  });

  it("bakiye rengi: Kredi hep kırmızı", () => {
    expect(balanceClass({ accountType: "CREDIT", currentBalance: 10 })).toBe("text-danger");
    expect(balanceClass({ accountType: "DEMAND", currentBalance: 0 })).toBe("text-success");
    expect(balanceClass({ accountType: "DEMAND", currentBalance: -1 })).toBe("text-danger");
  });

  it("tür sekmesi sayıları", () => {
    expect(typeCounts(cards.map((c) => c.fund))).toEqual({
      ALL: 5,
      DEMAND: 4,
      CREDIT: 1,
      DEPOSIT: 0,
      INVESTMENT: 0,
    });
    expect(typeCounts([makeFund({ accountType: undefined as never })]).DEMAND).toBe(1);
  });
});

describe("fundsLogic — kasalar", () => {
  const cash = (o: Partial<Fund>) => card({ kind: "CASH", bankName: null, ...o });
  const cards = [
    cash({ id: "k1", name: "Merkez", code: "K1", currentBalance: 100, openingBalance: 50 }),
    cash({
      id: "k2",
      name: "Depo",
      code: "K2",
      branchId: "b2",
      currentBalance: 300,
      openingBalance: 0,
    }),
    cash({
      id: "k3",
      name: "Dolar",
      code: "K3",
      currency: "USD",
      companyId: "c2",
      branchId: "b3",
      currentBalance: 7,
    }),
  ];

  it("gruplama kipleri ve ?group= ayrıştırma", () => {
    expect(parseCashGroup(null, false)).toBe("workplace");
    expect(parseCashGroup("company", false)).toBe("workplace");
    expect(parseCashGroup("COMPANY", true)).toBe("company");
    expect(parseCashGroup("x", true)).toBe("workplace");
    expect(
      groupCashes(cards, "all", "Tüm Kasalar", "?").map((g) => [
        g.name,
        g.icon,
        g.cards.map((c) => c.fund.id),
      ]),
    ).toEqual([["Tüm Kasalar", "fa-list", ["k2", "k3", "k1"]]]);
    expect(groupCashes(cards, "workplace", "", "?").map((g) => g.name)).toEqual([
      "Çankaya",
      "Merkez",
      "Şişli Depo",
    ]);
    expect(groupCashes(cards, "branch", "", "?").map((g) => g.name)).toEqual([
      "Ankara",
      "Diğer",
      "İzmir",
    ]);
    expect(groupCashes(cards, "currency", "", "?").map((g) => g.name)).toEqual(["$", "₺"]);
    expect(groupCashes(cards, "company", "", "?").map((g) => [g.name, g.icon])).toEqual([
      ["Acme", "fa-landmark"],
      ["Beta", "fa-landmark"],
    ]);
    expect(
      groupCashes([cash({ branchId: "x", companyId: "x" })], "workplace", "", "Belirtilmemiş")[0]
        .name,
    ).toBe("Belirtilmemiş");
    expect(
      groupCashes([cash({ branchId: "x", companyId: "x" })], "company", "", "Belirtilmemiş")[0]
        .name,
    ).toBe("Belirtilmemiş");
  });

  it("sekme sayıları ve dört kart", () => {
    expect(cashGroupCounts(cards)).toEqual({
      all: 3,
      workplace: 3,
      branch: 3,
      currency: 2,
      company: 2,
    });
    const stats = cashStats(cards);
    expect(stats.currencies).toEqual([
      { currency: "USD", symbol: "$", total: 7, count: 1, opening: 500, average: 7 },
      { currency: "TRY", symbol: "₺", total: 400, count: 2, opening: 50, average: 200 },
    ]);
    expect(stats.branchCount).toBe(3);
    expect(stats.currencyCount).toBe(2);
  });
});

describe("fundsLogic — özet, silme, bağlantılar", () => {
  const row = (o: Partial<FundSummaryRow>): FundSummaryRow => ({
    companyId: "c1",
    kind: "BANK",
    accountType: "DEMAND",
    currency: "TRY",
    count: 1,
    inactiveCount: 0,
    currentBalance: 100,
    balance: 100,
    futureNet: 0,
    openingTotal: 10,
    ...o,
  });

  it("özet kartları tür başına, şirket satırları toplanır, diğer tür atlanır", () => {
    const stats = summaryByType(
      [
        row({}),
        row({ companyId: "c2", count: 2, currentBalance: 50 }),
        row({ currency: "USD", currentBalance: 5 }),
        row({ accountType: "CREDIT", currentBalance: -900 }),
        row({ kind: "CASH", currentBalance: 1 }),
        row({ accountType: "XX" as never }),
      ],
      "BANK",
    );
    expect(stats.DEMAND.count).toBe(4);
    expect(stats.DEMAND.currencies).toEqual([
      { currency: "USD", symbol: "$", total: 5, count: 1, opening: 10 },
      { currency: "TRY", symbol: "₺", total: 150, count: 3, opening: 20 },
    ]);
    expect(stats.CREDIT.currencies[0].total).toBe(-900);
    expect(stats.INVESTMENT).toEqual({ count: 0, currencies: [] });
  });

  it("silme engeli ZTO cümlesi: sıfırlar atlanır, sıra, varsayılan hesap", () => {
    const texts = {
      intro: "Bu hesaba bağlı işlemler var:",
      outro: ". Silmek için önce bu işlemleri silmeniz gerekiyor.",
      companyDefault: "Şirketin varsayılan banka hesabıdır.",
      item: (kind: string, count: number) => `${count} adet ${kind}`,
    };
    expect(
      deleteBlockedReason(
        [
          { kind: "SETTLEMENT", count: 2 },
          { kind: "FUND_TRANSACTION", count: 3 },
          { kind: "INSTRUMENT", count: 0 },
          { kind: "ZZZ", count: 1 },
          { kind: "COMPANY_DEFAULT", count: 1 },
        ],
        texts,
      ),
    ).toBe(
      "Bu hesaba bağlı işlemler var: 3 adet FUND_TRANSACTION, 2 adet SETTLEMENT, 1 adet ZZZ. Silmek için önce bu işlemleri silmeniz gerekiyor. Şirketin varsayılan banka hesabıdır.",
    );
    expect(deleteBlockedReason([{ kind: "COMPANY_DEFAULT", count: 1 }], texts)).toBe(
      "Şirketin varsayılan banka hesabıdır.",
    );
    expect(deleteBlockedReason([], texts)).toBe("");
  });

  it("ödeme/tahsilat bağlantısı ve işaretli tutar", () => {
    expect(settlementPath("PAYMENT", "BANK", "f1")).toBe(
      "/zto-finans/banka-hareketleri?fundId=f1&openModal=true",
    );
    expect(settlementPath("COLLECTION", "BANK", "f1")).toBe(
      "/zto-finans/banka-hareketleri?fundId=f1&openCollection=true&collectionMethod=Banka",
    );
    expect(settlementPath("PAYMENT", "CASH")).toBe("/zto-finans/kasa-hareketleri?openModal=true");
    expect(settlementPath("COLLECTION", "CASH", "k1")).toBe(
      "/zto-finans/kasa-hareketleri?fundId=k1&openCollection=true&collectionMethod=Nakit",
    );
    expect(signedAmountText("IN", "1,00")).toBe("+1,00");
    expect(signedAmountText("OUT", "1,00")).toBe("-1,00");
  });

  it("modal açılış parametreleri (settlementPath'in tersi; ZTO 'true' büyük/küçük harf duyarsız)", () => {
    const parse = (query: string, kind: "BANK" | "CASH" = "BANK") =>
      parseSettlementModal(new URLSearchParams(query), kind);
    expect(parse("")).toBeNull();
    expect(parse("openModal=false&openCollection=0")).toBeNull();
    expect(parse("fundId=f1&openModal=TRUE")).toEqual({ type: "PAYMENT", method: "BANK" });
    expect(parse("openModal=true&collectionMethod=Nakit", "CASH")).toEqual({
      type: "PAYMENT",
      method: "CASH",
    });
    expect(parse("openCollection=true&collectionMethod=Banka", "CASH")).toEqual({
      type: "COLLECTION",
      method: "BANK",
    });
    expect(parse("openCollection=true&collectionMethod=NAKİT")).toEqual({
      type: "COLLECTION",
      method: "CASH",
    });
    expect(parse("openCollection=true&collectionMethod=cash")).toEqual({
      type: "COLLECTION",
      method: "CASH",
    });
    expect(parse("openCollection=true&collectionMethod=Çek", "CASH")).toEqual({
      type: "COLLECTION",
      method: "CASH",
    });
    expect(parse(new URL(settlementPath("COLLECTION", "BANK", "f1"), "http://x").search)).toEqual({
      type: "COLLECTION",
      method: "BANK",
    });
    expect(SETTLEMENT_MODAL_PARAMS).toEqual(["openModal", "openCollection", "collectionMethod"]);
  });
});
