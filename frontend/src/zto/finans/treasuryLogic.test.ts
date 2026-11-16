import { describe, expect, it } from "vitest";
import type { Branch } from "../../pages/finance/types";
import {
  assetDistribution,
  balanceClass,
  dailySeries,
  daysClass,
  drawerLabel,
  dueSeries,
  fundTotals,
  instrumentTotals,
  nextTreasuryTab,
  noteTypeLabel,
  ratesText,
  summaryCards,
  summaryCurrencies,
  tlCardRows,
  treasuryBranchGroups,
  treasuryBranchIds,
  treasurySheets,
  treasuryWorkPlaces,
} from "./treasuryLogic";
import { treasuryFixture } from "./treasuryTestData";

function branch(id: string, name: string, groupId: string | null, groupName: string | null) {
  return {
    id,
    code: id,
    name,
    companyId: "c1",
    companyName: "Acme",
    branchGroupId: groupId,
    branchGroupName: groupName,
    active: true,
  } as Branch;
}

const BRANCHES = [
  branch("b1", "Alsancak", "g1", "İzmir"),
  branch("b2", "Bornova", "g1", "İzmir"),
  branch("b3", "Kadıköy", "g2", "İstanbul"),
  branch("b4", "Merkez", null, null),
];

describe("şube → iş yeri süzgeci (OK-12.8-21)", () => {
  it("şubeler tekil ve tr sıralı; grubu olmayan iş yeri şube üretmez", () => {
    expect(treasuryBranchGroups(BRANCHES)).toEqual([
      { id: "g2", name: "İstanbul" },
      { id: "g1", name: "İzmir" },
    ]);
  });

  it("iş yerleri şubeye göre süzülür", () => {
    expect(treasuryWorkPlaces(BRANCHES, "g1").map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(treasuryWorkPlaces(BRANCHES, "")).toHaveLength(4);
  });

  it("branchIds: iş yeri > şube > tümü", () => {
    expect(treasuryBranchIds(BRANCHES, "g1", "b2")).toEqual(["b2"]);
    expect(treasuryBranchIds(BRANCHES, "g1", "")).toEqual(["b1", "b2"]);
    expect(treasuryBranchIds(BRANCHES, "", "")).toBeUndefined();
    expect(treasuryBranchIds(BRANCHES, "yok", "")).toBeUndefined();
  });
});

describe("özet kartları (ZTO renderSummaryCards)", () => {
  const data = treasuryFixture();

  it("para birimleri: TL başta ve her zaman var", () => {
    expect(summaryCurrencies({ byCurrency: [] })).toEqual(["TRY"]);
    expect(summaryCurrencies(data)).toEqual(["TRY", "EUR", "USD"]);
  });

  it("sekiz kart ZTO sırasıyla; değerler para birimi başına", () => {
    const cards = summaryCards(data);
    expect(cards.map((card) => card.key)).toEqual([
      "bank",
      "cash",
      "check",
      "bill",
      "checkBill",
      "cashTotal",
      "general",
      "afterDebt",
    ]);
    const value = (key: string, currency: string) =>
      cards.find((card) => card.key === key)?.rows.find((r) => r.currency === currency)?.amount;
    expect(value("bank", "TRY")).toBe("10000.00");
    expect(value("cash", "TRY")).toBe("500.00");
    expect(value("check", "TRY")).toBe("2000.00"); // 3000 alınan − 1000 verilen
    expect(value("bill", "TRY")).toBe("-200.00"); // 300 − 500
    expect(value("checkBill", "TRY")).toBe("1800.00");
    expect(value("cashTotal", "TRY")).toBe("10500.00");
    expect(value("general", "TRY")).toBe("13800.00"); // 10000 + 500 + 3000 + 300
    expect(value("afterDebt", "TRY")).toBe("9000.00"); // 10500 − (1000 + 500)
    expect(value("bank", "EUR")).toBe("0.00");
    expect(cards[0].sub).toEqual({ key: "treasury.cards.bankCount", count: 2 });
    expect(cards[2].sub).toEqual({ key: "treasury.cards.pieces", count: 2 });
  });

  it("borç sonrası bakiye eksi değerde kırmızı", () => {
    const cards = summaryCards(data);
    const usd = cards
      .find((card) => card.key === "afterDebt")
      ?.rows.find((r) => r.currency === "USD");
    expect(usd).toEqual({ currency: "USD", amount: "-100.00", color: "#dc2626" });
  });

  it("TL kartı sunucu toplamlarını gösterir", () => {
    expect(tlCardRows(data).map((row) => [row.key, row.amount])).toEqual([
      ["tlBank", "13400.00"],
      ["tlCash", "500.00"],
      ["tlCheck", "2000.00"],
      ["tlNote", "-200.00"],
    ]);
  });
});

describe("tablolar", () => {
  const data = treasuryFixture();

  it("banka tfoot: para birimi başına toplam, TL önce", () => {
    expect(fundTotals(data.banks)).toEqual([
      {
        currency: "TRY",
        balance: "10000.00",
        in30: "1500.00",
        out30: "250.00",
        checkCount: 1,
        noteCount: 0,
      },
      {
        currency: "USD",
        balance: "100.00",
        in30: "0.00",
        out30: "0.00",
        checkCount: 0,
        noteCount: 0,
      },
    ]);
  });

  it("çek tfoot: para birimi başına tutar", () => {
    expect(instrumentTotals(data.pendingChecks)).toEqual([{ currency: "TRY", amount: "4000.00" }]);
  });

  it("sınıflar: bakiye işareti ve kalan gün eşikleri", () => {
    expect(balanceClass("0")).toBe("text-success");
    expect(balanceClass("-1")).toBe("text-danger");
    expect(daysClass(-3)).toBe("text-danger");
    expect(daysClass(7)).toBe("text-danger");
    expect(daysClass(8)).toBe("text-warning");
    expect(daysClass(30)).toBe("text-warning");
    expect(daysClass(31)).toBe("text-success");
  });

  it("keşideci: personel maskeli, yoksa cari adı, yoksa '-'", () => {
    const [received, issued] = data.pendingChecks;
    expect(drawerLabel(received, "Personel carisi")).toBe("Ali Veli");
    expect(drawerLabel({ ...received, masked: true, drawerName: null }, "Personel carisi")).toBe(
      "Personel carisi",
    );
    expect(drawerLabel({ ...issued, drawerName: null, accountName: null }, "x")).toBe("-");
  });

  it("senet türü etiketi (yoksa yön)", () => {
    const t = (key: string) => key;
    expect(noteTypeLabel(data.pendingBills[0], t)).toBe("treasury.noteType.BOND");
    expect(noteTypeLabel({ ...data.pendingBills[0], noteType: null }, t)).toBe(
      "treasury.direction.RECEIVED",
    );
  });
});

describe("alt bilgi, grafikler, Excel", () => {
  const data = treasuryFixture();

  it("kur satırı yalnız USD/EUR/GBP/RUB, N4", () => {
    expect(ratesText(data.rates)).toBe("USD: 34,0000 ₺ | EUR: 37,5000 ₺");
    expect(ratesText([])).toBe("");
  });

  it("günlük seri dd.MM etiketli", () => {
    expect(dailySeries(data.bankDaily)).toEqual({
      labels: ["15.11", "16.11"],
      inData: [1000, 500],
      outData: [0, 250],
    });
  });

  it("varlık dağılımı: banka, kasa, brüt çek ve senet TL (eksi 0)", () => {
    expect(assetDistribution(data)).toEqual([13400, 500, 10800, 800]); // USD 200 × 34
  });

  it("vade takvimi MM.yyyy", () => {
    expect(dueSeries(data.dueBuckets)).toEqual({
      labels: ["11.2026", "12.2026"],
      checks: [3000, 1000],
      notes: [0, 800],
    });
  });

  it("Excel sayfaları: Bankalar, Kasalar, Çekler, Senetler", () => {
    const sheets = treasurySheets(data, { t: (key) => key });
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "ztoFinans:treasury.sheets.banks",
      "ztoFinans:treasury.sheets.cashes",
      "ztoFinans:treasury.sheets.checks",
      "ztoFinans:treasury.sheets.bills",
    ]);
    expect(sheets[0].rows[0]).toEqual([
      "İzmir",
      "Alsancak",
      "Garanti",
      "Alsancak Şb. / ****1234",
      "TR00 0000",
      "TRY",
      10000,
      1500,
      250,
      1,
      0,
    ]);
    expect(sheets[2].rows).toHaveLength(2);
    expect(sheets[2].headers).toHaveLength(sheets[2].rows[0].length);
  });

  it("sekme klavyesi: ←/→ döner, Home/End uçlar", () => {
    expect(nextTreasuryTab(0, "ArrowLeft", 5)).toBe(4);
    expect(nextTreasuryTab(4, "ArrowRight", 5)).toBe(0);
    expect(nextTreasuryTab(2, "Home", 5)).toBe(0);
    expect(nextTreasuryTab(2, "End", 5)).toBe(4);
    expect(nextTreasuryTab(2, "Enter", 5)).toBeNull();
    expect(nextTreasuryTab(0, "ArrowRight", 0)).toBeNull();
  });
});
