import { describe, expect, it } from "vitest";
import type { PayMethod } from "../../../../pages/finance/types";
import {
  CARD_LIMIT,
  CHUNK_THRESHOLD,
  NO_CARD_FILTERS,
  NO_FUND,
  accountText,
  balanceDisplay,
  buildReportItems,
  clearedState,
  currencyTotalText,
  currencyTotals,
  groupItems,
  hasCardFilter,
  instrumentItems,
  itemMatches,
  movementSummary,
  parseReportState,
  reportSearch,
  reportTotals,
  splitBalances,
  summaryCards,
  timeText,
  toDailyParams,
  toReportItem,
  toggleCardFilter,
  type ReportTexts,
} from "./dailyReportLogic";
import { bankItem, makeBalance, makeItem, makeMovement } from "./settlementsTestUtils";

const TEXTS: ReportTexts = {
  method: (m: PayMethod) =>
    ({ CASH: "Nakit", BANK: "Banka", CHECK: "Çek", NOTE: "Senet", CREDIT_CARD: "Kredi Kartı" })[m],
  cash: (name) => `Kasa: ${name}`,
  undefinedFund: "Banka/Kasa Tanımsız",
  masked: "Personel (gizli)",
  expense: (name) => `Gider: ${name}`,
};

const localIso = (h: number, m: number, s: number) => new Date(2026, 10, 14, h, m, s).toISOString();

const item = (row = makeItem(), i = 0) => toReportItem(row, i, TEXTS);

describe("URL durumu", () => {
  it("ayrıştırma: listeler, büyük harf para birimi, bilinen yöntem/sıralama", () => {
    expect(
      parseReportState(
        new URLSearchParams(
          "reportDate=2026-11-10&workPlaceIds=b1,%20b2,,&fundAccountIds=f1&currency=eur&method=credit_card&sort=time-desc",
        ),
        "2026-11-15",
      ),
    ).toEqual({
      reportDate: "2026-11-10",
      workPlaceIds: ["b1", "b2"],
      fundAccountIds: ["f1"],
      currency: "EUR",
      method: "CREDIT_CARD",
      sort: "time-desc",
    });
  });

  it("geçersiz tarih bugüne, bilinmeyen yöntem/sıralama varsayılana düşer", () => {
    expect(
      parseReportState(
        new URLSearchParams("reportDate=14.11.2026&method=OTHER&sort=x"),
        "2026-11-15",
      ),
    ).toEqual(clearedState("2026-11-15"));
  });

  it("yazım: boş alanlar yok, ZTO 'workPlaceIds=a,b', varsayılan sıralama yazılmaz", () => {
    expect(reportSearch(clearedState("2026-11-14"))).toBe("reportDate=2026-11-14");
    expect(
      reportSearch({
        reportDate: "2026-11-14",
        workPlaceIds: ["b1", "b 2"],
        fundAccountIds: ["f1", "f2"],
        currency: "USD",
        method: "NOTE",
        sort: "time-desc",
      }),
    ).toBe(
      "reportDate=2026-11-14&workPlaceIds=b1,b%202&fundAccountIds=f1,f2&currency=USD&method=NOTE&sort=time-desc",
    );
  });

  it("rapor uç parametreleri", () => {
    expect(toDailyParams("COLLECTION", clearedState("2026-11-14"))).toEqual({
      type: "COLLECTION",
      date: "2026-11-14",
      branchIds: undefined,
      fundAccountIds: undefined,
      currency: undefined,
      methods: undefined,
      sort: "TIME_ASC",
    });
    expect(
      toDailyParams("PAYMENT", {
        reportDate: "2026-11-14",
        workPlaceIds: ["b1"],
        fundAccountIds: ["f1"],
        currency: "EUR",
        method: "CASH",
        sort: "time-desc",
      }),
    ).toMatchObject({
      branchIds: ["b1"],
      fundAccountIds: ["f1"],
      currency: "EUR",
      methods: ["CASH"],
      sort: "TIME_DESC",
    });
  });
});

describe("satırlar", () => {
  it("oluşturma saati yerel saat diliminde HH:mm:ss; geçersizde boş", () => {
    expect(timeText(localIso(8, 5, 9))).toBe("08:05:09");
    expect(timeText(localIso(23, 59, 0))).toBe("23:59:00");
    expect(timeText("x")).toBe("");
  });

  it("S. No rapor içi sıra; kasa/banka/fonsuz blok bilgisi; arama metni", () => {
    const cash = item(makeItem(), 0);
    expect(cash).toMatchObject({
      no: 1,
      method: "CASH",
      fundKey: "k1",
      fundKind: "CASH",
      fundTitle: "Kasa: Merkez Kasa",
      fundMeta: "-",
      source: "Kasa: Merkez Kasa",
      accountText: "Kuzey Lojistik",
    });
    expect(cash.search).toContain("KUZEY LOJISTIK");
    expect(cash.search).toContain("FT-1");
    expect(cash.search).toContain("1.500,00");
    const bank = item(bankItem(), 4);
    expect(bank).toMatchObject({
      no: 5,
      fundKey: "f1",
      fundKind: "BANK",
      fundTitle: "Ziraat",
      fundMeta: "Konak",
      source: "Ziraat (Konak)",
    });
    expect(item(bankItem({ fundBankName: null, fundBankBranchName: null }))).toMatchObject({
      fundTitle: "Ziraat Vadesiz",
      fundMeta: "-",
      source: "Ziraat Vadesiz",
    });
    const check = item(
      makeItem({
        displayMethod: "CHECK",
        fundAccountId: null,
        fundKind: null,
        instrumentNumber: "7654321",
      }),
    );
    expect(check).toMatchObject({
      method: "CHECK",
      fundKey: NO_FUND,
      fundKind: "NONE",
      fundTitle: "Banka/Kasa Tanımsız",
      source: "-",
    });
    expect(check.search).toContain("7654321");
  });

  it("cari metni: maskeli personel, carisiz gider, ad", () => {
    expect(accountText(makeItem({ employeeMasked: true, accountName: null }), TEXTS)).toBe(
      "Personel (gizli)",
    );
    expect(
      accountText(
        makeItem({ accountId: null, accountName: null, expenseItemName: "Yakıt" }),
        TEXTS,
      ),
    ).toBe("Gider: Yakıt");
    expect(accountText(makeItem({ accountId: null, accountName: null }), TEXTS)).toBe("-");
    expect(accountText(makeItem({ accountId: null }), TEXTS)).toBe("Kuzey Lojistik");
  });

  it("büyük girdi (≥ 500) parçalı kurulur; küçük girdi eşzamanlı aynı sonucu verir", async () => {
    const rows = Array.from({ length: CHUNK_THRESHOLD }, (_, i) => makeItem({ id: `s${i}` }));
    const big = await buildReportItems(rows, TEXTS);
    expect(big).toHaveLength(CHUNK_THRESHOLD);
    expect(big[CHUNK_THRESHOLD - 1].no).toBe(CHUNK_THRESHOLD);
    const small = await buildReportItems(rows.slice(0, 3), TEXTS);
    expect(small.map((i) => i.no)).toEqual([1, 2, 3]);
  });
});

describe("toplamlar ve gruplama", () => {
  const rows = [
    item(makeItem({ id: "1", money: { amount: "0.10", currency: "TRY" } }), 0),
    item(makeItem({ id: "2", money: { amount: "0.20", currency: "TRY" } }), 1),
    item(bankItem({ id: "3", money: { amount: "100", currency: "USD" } }), 2),
    item(
      bankItem({
        id: "4",
        branchId: "b2",
        branchName: "Ankara",
        branchGroupName: null,
        money: { amount: "5", currency: "EUR" },
      }),
      3,
    ),
  ];

  it("para birimi toplamları ondalık güvenli (0.10 + 0.20 = 0,30)", () => {
    const totals = currencyTotals(rows.slice(0, 2));
    expect(totals).toEqual([{ symbol: "₺", total: "0.30", count: 2 }]);
    expect(currencyTotalText(rows.slice(0, 2))).toBe("0,30 ₺");
    expect(currencyTotalText([])).toBe("0,00 ₺");
    const text = currencyTotalText(rows);
    expect(text.split(" | ").sort()).toEqual(["0,30 ₺", "100,00 $", "5,00 €"].sort());
    expect(
      currencyTotals([item(makeItem({ money: { amount: "1", currency: "" } }))])[0].symbol,
    ).toBe("₺");
  });

  it("iş yeri → banka/kasa gruplaması, ada göre sıralı; satır sırası korunur", () => {
    const groups = groupItems(rows);
    expect(groups.map((g) => g.name)).toEqual(["Ankara", "Merkez"]);
    const merkez = groups[1];
    expect(merkez).toMatchObject({ branchId: "b1", groupName: "İzmir" });
    expect(merkez.items.map((i) => i.row.id)).toEqual(["1", "2", "3"]);
    expect(merkez.funds.map((f) => [f.title, f.kind, f.items.length])).toEqual([
      ["Kasa: Merkez Kasa", "CASH", 2],
      ["Ziraat", "BANK", 1],
    ]);
    expect(merkez.funds[0].totalText).toBe("0,30 ₺");
  });

  it("özet kartları: iş yeri, banka/kasa, yöntem, para birimi; adet ve toplam", () => {
    const groups = groupItems(rows);
    const cards = summaryCards(rows, groups, TEXTS.method);
    expect(cards.workPlace.map((c) => [c.value, c.count])).toEqual([
      ["b2", 1],
      ["b1", 3],
    ]);
    // Fon kartı iş yerleri arasında birleşir (kimlik = süzgeç değeri; yinelenen kart yok).
    expect(cards.fund.map((c) => [c.value, c.name, c.count])).toEqual([
      ["k1", "Kasa: Merkez Kasa", 2],
      ["f1", "Ziraat", 2],
    ]);
    expect(cards.method.map((c) => [c.value, c.name, c.count])).toEqual([
      ["BANK", "Banka", 2],
      ["CASH", "Nakit", 2],
    ]);
    expect(cards.currency.find((c) => c.value === "TRY")).toMatchObject({
      name: "₺",
      count: 2,
      totalText: "0,30 ₺",
    });
    expect(CARD_LIMIT).toBe(10);
  });

  it("kart süzgeci: tür içi VEYA, türler arası VE; arama aksan/büyük harf duyarsız", () => {
    let filters = toggleCardFilter(NO_CARD_FILTERS, "workPlace", "b1");
    expect(hasCardFilter(NO_CARD_FILTERS)).toBe(false);
    expect(hasCardFilter(filters)).toBe(true);
    expect(rows.filter((r) => itemMatches(r, "", filters)).map((r) => r.row.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    filters = toggleCardFilter(filters, "workPlace", "b2");
    expect(rows.filter((r) => itemMatches(r, "", filters))).toHaveLength(4);
    filters = toggleCardFilter(filters, "method", "BANK");
    expect(rows.filter((r) => itemMatches(r, "", filters)).map((r) => r.row.id)).toEqual([
      "3",
      "4",
    ]);
    filters = toggleCardFilter(filters, "currency", "EUR");
    expect(rows.filter((r) => itemMatches(r, "", filters)).map((r) => r.row.id)).toEqual(["4"]);
    filters = toggleCardFilter(filters, "currency", "EUR");
    filters = toggleCardFilter(filters, "fund", "k1");
    expect(rows.filter((r) => itemMatches(r, "", filters))).toHaveLength(0);
    expect(rows.filter((r) => itemMatches(r, "  ziraat ", NO_CARD_FILTERS))).toHaveLength(2);
    expect(rows.filter((r) => itemMatches(r, "LOJİSTİK", NO_CARD_FILTERS))).toHaveLength(4);
    expect(rows.filter((r) => itemMatches(r, "yok-böyle", NO_CARD_FILTERS))).toHaveLength(0);
  });

  it("genel toplamlar: transfer / cari (banka, her kasa, tanımsız) / kredi (yalnız ödeme) / genel", () => {
    const list = [
      item(makeItem({ id: "c1", fundName: "B Kasa", fundAccountId: "k2" })),
      item(makeItem({ id: "c2" })),
      item(bankItem({ id: "t1", intercompany: true })),
      item(bankItem({ id: "k1", credit: true, money: { amount: "10", currency: "TRY" } })),
      item(makeItem({ id: "n1", displayMethod: "CHECK", fundAccountId: null, fundKind: null })),
    ];
    const pay = reportTotals(list, "PAYMENT");
    expect(pay.transfer.count).toBe(1);
    expect(pay.credit).toEqual({ count: 1, totals: [{ symbol: "₺", total: "10.00", count: 1 }] });
    expect(pay.regular.count).toBe(3);
    expect(pay.regular.bank).toBeNull();
    expect(pay.regular.cashes.map((c) => [c.name, c.count])).toEqual([
      ["B Kasa", 1],
      ["Merkez Kasa", 1],
    ]);
    expect(pay.regular.undefined?.count).toBe(1);
    expect(pay.grand.count).toBe(5);
    const col = reportTotals(list, "COLLECTION");
    expect(col.credit).toBeNull();
    expect(col.regular.count).toBe(4);
    expect(col.regular.bank?.count).toBe(1);
    const empty = reportTotals([], "PAYMENT");
    expect(empty).toMatchObject({
      transfer: { count: 0, totals: [] },
      regular: { count: 0, bank: null, cashes: [], undefined: null },
      credit: null,
      grand: { count: 0, totals: [] },
    });
  });
});

describe("bakiye ve çek bölümleri", () => {
  it("bakiye adı: 'Banka (Şube ₺)', şubesiz 'Banka ₺', kasa 'Ad ₺'", () => {
    expect(balanceDisplay(makeBalance())).toBe("Ziraat (Konak ₺)");
    expect(balanceDisplay(makeBalance({ bankBranchName: " ", currency: "USD" }))).toBe("Ziraat $");
    expect(balanceDisplay(makeBalance({ bankName: null, bankBranchName: null }))).toBe(
      "Ziraat Vadesiz ₺",
    );
    expect(balanceDisplay(makeBalance({ kind: "CASH", name: "Merkez Kasa" }))).toBe(
      "Merkez Kasa ₺",
    );
  });

  it("bankalar ve kasalar ayrı, ada göre sıralı", () => {
    const split = splitBalances([
      makeBalance({ fundAccountId: "f2", bankName: "Akbank", bankBranchName: null }),
      makeBalance({ fundAccountId: "k1", kind: "CASH", name: "Kasa" }),
      makeBalance(),
    ]);
    expect(split.banks.map((b) => b.fundAccountId)).toEqual(["f2", "f1"]);
    expect(split.cashes.map((b) => b.fundAccountId)).toEqual(["k1"]);
  });

  it("bankaya yansıyan çek özeti: adet ve para birimi toplamı; boşsa 0,00 ₺", () => {
    expect(movementSummary([])).toEqual({ count: 0, text: "0,00 ₺" });
    expect(
      movementSummary([
        makeMovement(),
        makeMovement({ fundAccountId: "f2", count: 1, total: "0.10" }),
      ]),
    ).toEqual({ count: 3, text: "300,10 ₺" });
    expect(movementSummary([makeMovement({ currency: "" })]).text).toBe("300,00 ₺");
  });

  it("tarihine göre yazılan çekler: çek ve senet satırları", () => {
    const list = [
      item(makeItem({ id: "a" })),
      item(makeItem({ id: "b", displayMethod: "CHECK" })),
      item(makeItem({ id: "c", displayMethod: "NOTE" })),
    ];
    expect(instrumentItems(list).map((i) => i.row.id)).toEqual(["b", "c"]);
  });
});
