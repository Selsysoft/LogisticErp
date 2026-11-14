import { describe, expect, it } from "vitest";
import type { TransferableTransaction } from "../../../../pages/finance/types";
import {
  groupByCurrency,
  groupByWorkplace,
  groupState,
  isSelectable,
  pruneSelection,
  selectionSummary,
  sixMonthsAgo,
  toggleGroup,
  toggleRow,
  validateTransfer,
} from "./transferLogic";

function tx(id: string, extra: Partial<TransferableTransaction> = {}): TransferableTransaction {
  return {
    transactionId: id,
    transactionDate: "2026-01-01",
    kind: "DEBT",
    sign: 1,
    documentNo: null,
    documentType: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    direction: "CREDIT",
    amount: 10,
    currency: "TRY",
    description: null,
    instruments: [],
    instrumentGroup: null,
    blockedReason: null,
    ...extra,
  };
}

const check = {
  id: "i1",
  kind: "CHECK" as const,
  number: "C-1",
  status: "PORTFOLIO",
  role: "DRAWER" as const,
};
const note = {
  id: "i2",
  kind: "NOTE" as const,
  number: "S-1",
  status: "PORTFOLIO",
  role: "DRAWER" as const,
};

const all = [
  tx("t1"),
  tx("t2", { currency: "USD" }),
  tx("t3", { branchId: "b2", branchName: "Şube", instruments: [check], instrumentGroup: "g1" }),
  tx("t4", { instruments: [check], instrumentGroup: "g1" }),
  tx("t5", { blockedReason: "OPEN_PLAN" }),
  tx("t6", { branchId: "", branchName: "", instruments: [note] }),
];

describe("gruplama", () => {
  it("para birimi grupları ilk görünme sırasıyla", () => {
    expect(groupByCurrency(all).map((g) => [g.currency, g.items.length])).toEqual([
      ["TRY", 5],
      ["USD", 1],
    ]);
  });

  it("iş yeri → para birimi; adsız iş yeri etiketi", () => {
    const groups = groupByWorkplace(all, "İş Yeri Belirtilmedi");
    expect(groups.map((g) => g.label)).toEqual(["Merkez", "Şube", "İş Yeri Belirtilmedi"]);
    expect(groups[0].currencies.map((c) => c.currency)).toEqual(["TRY", "USD"]);
    expect(groups[0].currencies[0].key).toBe("w-b1-TRY");
  });
});

describe("seçim", () => {
  it("çek grubu birlikte seçilir ve kaldırılır", () => {
    const s1 = toggleRow(new Set(), all, all[3], true);
    expect([...s1].sort()).toEqual(["t3", "t4"]);
    expect([...toggleRow(s1, all, all[2], false)]).toEqual([]);
  });

  it("engelli satır seçilemez", () => {
    expect(isSelectable(all[4])).toBe(false);
    expect(toggleRow(new Set(), all, all[4], true).size).toBe(0);
  });

  it("grup tümünü seç ve karışık durum", () => {
    const group = all.filter((x) => x.currency === "TRY");
    const sel = toggleGroup(new Set(), all, group, true);
    expect(sel.has("t5")).toBe(false);
    expect(groupState(sel, group)).toBe("checked");
    expect(groupState(new Set(["t1"]), group)).toBe("mixed");
    expect(groupState(new Set(), group)).toBe("unchecked");
    expect(groupState(new Set(), [all[4]])).toBe("unchecked");
    expect(toggleGroup(sel, all, group, false).size).toBe(0);
  });

  it("çek ve senet içeren hareket sayıları", () => {
    expect(selectionSummary(new Set(["t1", "t3", "t4", "t6"]), all)).toEqual({
      count: 4,
      checkCount: 2,
      noteCount: 1,
    });
  });

  it("uyarı sırası: hedef, liste, seçim", () => {
    expect(validateTransfer(null, new Set(["t1"]), all)).toBe("errTarget");
    expect(validateTransfer("x", new Set(), [])).toBe("empty");
    expect(validateTransfer("x", new Set(), all)).toBe("errSelect");
    expect(validateTransfer("x", new Set(["zz"]), all)).toBe("errSelect");
    expect(validateTransfer("x", new Set(["t1"]), all)).toBeNull();
  });

  it("listede olmayan ve engelli seçimler atılır", () => {
    expect([...pruneSelection(new Set(["t1", "t5", "zz"]), all)]).toEqual(["t1"]);
  });
});

describe("son 6 ay", () => {
  it("yıl ve ay sonu taşması", () => {
    expect(sixMonthsAgo("2026-11-14")).toBe("2026-05-14");
    expect(sixMonthsAgo("2026-03-15")).toBe("2025-09-15");
    expect(sixMonthsAgo("2026-08-31")).toBe("2026-02-28");
  });
});
