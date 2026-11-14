import { describe, expect, it } from "vitest";
import type { FxReport, FxReportRow } from "../../../../pages/finance/types";
import {
  buildReportGroups,
  depthColor,
  depthPrefix,
  pageGroups,
  pageInfoText,
  percentText,
  totalBrokenText,
} from "./exchangeBreakReportLogic";

function fxRow(id: string, overrides: Partial<FxReportRow> = {}): FxReportRow {
  return {
    transferId: id,
    code: `DBZ-${id}`,
    date: "2026-11-10",
    level: 1,
    sourceFundName: "Ziraat USD",
    sourceMoney: { amount: "100.00", currency: "USD" },
    targetFundName: "Ziraat TL",
    targetMoney: { amount: "3400.00", currency: "TRY" },
    rate: 34,
    rateOperation: "MULTIPLY",
    fxDiffTl: null,
    status: "POSTED",
    sources: [],
    ...overrides,
  };
}

const settlement = (id: string, used: number, amount = 200) => ({
  kind: "SETTLEMENT" as const,
  id,
  code: `TAH-${id}`,
  date: "2026-11-01",
  accountName: "Demir İhracat",
  amount,
  used,
});
const transfer = (id: string, used: number) => ({
  kind: "TRANSFER" as const,
  id,
  code: `DBZ-${id}`,
  date: "2026-11-05",
  accountName: null,
  amount: 3400,
  used,
});

const REPORT: FxReport = {
  stats: {
    collectionCount: 2,
    fxCount: 4,
    fxWithoutCollection: 1,
    unbrokenCollectionCount: 1,
    totalBroken: [
      { currency: "USD", amount: 250 },
      { currency: "EUR", amount: 10 },
    ],
  },
  rows: [
    fxRow("a", { sources: [settlement("s1", 100)] }),
    fxRow("b", { sources: [settlement("s1", 50), settlement("s2", 30)] }),
    fxRow("c", { level: 2, sources: [transfer("a", 1000)] }),
    fxRow("d", { sources: [transfer("x-out-of-range", 5)] }),
  ],
  unbrokenCollections: [
    {
      settlementId: "s9",
      date: "2026-11-08",
      accountName: "Yıldız",
      money: { amount: "75.00", currency: "EUR" },
    },
  ],
};

describe("buildReportGroups", () => {
  it("tahsilat grupları, alt bozumlar, bozulmayanlar ve tahsilatsız bozumlar", () => {
    const groups = buildReportGroups(REPORT);
    expect(groups.map((g) => g.type)).toEqual([
      "collection",
      "collection",
      "unexchanged",
      "direct",
    ]);
    const [s1, s2, unbroken, direct] = groups;
    if (s1.type !== "collection" || s2.type !== "collection") throw new Error("tip");
    expect(s1.collection).toMatchObject({ id: "s1", code: "TAH-s1", amount: 200, currency: "USD" });
    expect(s1.transfers.map((n) => [n.row.transferId, n.depth])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 0],
    ]);
    expect([s1.breakCount, s1.exchanged, s1.remaining, s1.percent]).toEqual([2, 150, 50, 75]);
    // s2'yi kullanan b ilk tahsilatın altında; s2 yalnız tutarını sayar.
    expect(s2.transfers).toEqual([]);
    expect([s2.exchanged, s2.remaining]).toEqual([30, 170]);
    if (unbroken.type !== "unexchanged") throw new Error("tip");
    expect(unbroken.collection).toMatchObject({
      id: "s9",
      amount: 75,
      currency: "EUR",
      code: null,
    });
    if (direct.type !== "direct") throw new Error("tip");
    expect(direct.transfers.map((n) => n.row.transferId)).toEqual(["d"]);
    expect(s1.searchText).toContain("demir ihracat");
  });

  it("boş rapor ve sıfır tutarlı tahsilat", () => {
    expect(buildReportGroups(undefined)).toEqual([]);
    const zero = buildReportGroups({
      ...REPORT,
      rows: [fxRow("z", { sources: [settlement("s0", 0, 0)] })],
      unbrokenCollections: [],
    });
    expect(zero[0]).toMatchObject({ type: "collection", percent: 0, remaining: 0 });
  });
});

describe("sayfalama, arama ve metinler", () => {
  const groups = buildReportGroups(REPORT);

  it("arama küçük harf içerir; sayfa sınırları", () => {
    expect(pageGroups(groups, "YILDIZ", 1, 10).items.map((g) => g.type)).toEqual(["unexchanged"]);
    const first = pageGroups(groups, "", 1, 2);
    expect(first).toMatchObject({
      page: 1,
      totalPages: 2,
      totalCount: 4,
      startIndex: 1,
      endIndex: 2,
    });
    expect(pageInfoText(first)).toBe("1-2 / 4 kayıt");
    expect(pageGroups(groups, "", 9, 2).page).toBe(2);
    expect(pageGroups(groups, "", 0, 2).page).toBe(1);
    const none = pageGroups(groups, "yok-boyle", 1, 10);
    expect(none).toMatchObject({ totalCount: 0, startIndex: 0, totalPages: 1 });
    expect(pageInfoText(none)).toBe("0 kayıt");
  });

  it("yüzde, toplam bozulan, derinlik", () => {
    expect(percentText(37.5)).toBe("37,50%");
    expect(totalBrokenText(REPORT.stats)).toBe("250,00 $ | 10,00 €");
    expect(totalBrokenText(undefined)).toBe("0,00");
    expect(totalBrokenText({ ...REPORT.stats, totalBroken: [] })).toBe("0,00");
    expect(depthPrefix(0)).toBe("");
    expect(depthPrefix(1)).toBe("└ ");
    expect(depthPrefix(3)).toBe("└── ");
    expect(depthColor(0).badge).toBe("#f57c00");
    expect(depthColor(6)).toEqual(depthColor(0));
  });
});
