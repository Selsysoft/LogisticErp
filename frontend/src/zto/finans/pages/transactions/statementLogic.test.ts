import { describe, expect, it, vi } from "vitest";
import type { AccountInvoiceGap, StatementLine } from "../../../../pages/finance/types";
import {
  balanceMark,
  effectiveDate,
  groupStatement,
  groupStatementChunked,
  missingInvoiceRows,
  periodLabel,
  showsDetailToggle,
  statementNo,
  type StatementOptions,
} from "./statementLogic";

function line(id: string, date: string, extra: Partial<StatementLine> = {}): StatementLine {
  return {
    id,
    date,
    direction: "DEBIT",
    amount: 100,
    exchangeRate: null,
    tlAmount: null,
    description: null,
    sourceType: "MANUAL",
    balance: 0,
    currency: "TRY",
    companyId: "c1",
    branchId: "b1",
    sourceId: "s",
    kind: "RECEIVABLE",
    sign: 1,
    reversal: false,
    reversed: false,
    transferRole: null,
    documentNo: null,
    documentType: null,
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    createdBy: "u",
    createdAt: `${date}T09:00:00Z`,
    ...extra,
  };
}

const names: Record<string, string> = { b1: "Merkez", b2: "Ankara" };
const base: StatementOptions = { dateBasis: "TRANSACTION", branchName: (id) => names[id] ?? "?" };

const lines = [
  line("l3", "2026-02-01", { direction: "CREDIT", amount: 30 }),
  line("l1", "2026-01-01"),
  line("l2", "2026-01-15", { branchId: "b2", amount: 40 }),
  line("l4", "2026-03-01", { currency: "USD", amount: 5, documentDate: "2025-12-01" }),
  line("l5", "2026-03-10", { direction: "CREDIT", amount: 200 }),
];

describe("ekstre modeli", () => {
  it("iş yeri × para birimi; DEBIT Borç, CREDIT Alacak; yürüyen bakiye", () => {
    const m = groupStatement(lines, base);
    expect(m.workplaces.map((w) => w.branchName)).toEqual(["Ankara", "Merkez"]);
    const merkez = m.workplaces[1];
    expect(merkez.currencies.map((c) => c.currency)).toEqual(["TRY", "USD"]);
    const tryBlock = merkez.currencies[0];
    expect(tryBlock.rows.map((r) => [r.no, r.debit, r.credit, r.balance])).toEqual([
      [1, 100, 0, 100],
      [2, 0, 30, 70],
      [3, 0, 200, -130],
    ]);
    expect(tryBlock).toMatchObject({
      totalDebit: 100,
      totalCredit: 230,
      balance: -130,
      opening: null,
    });
    expect(m.allCurrencies).toEqual(["TRY", "USD"]);
  });

  it("özet ve genel toplam para birimi başına", () => {
    const m = groupStatement(lines, base);
    expect(m.summary.map((s) => [s.branchName, s.currency, s.balance])).toEqual([
      ["Ankara", "TRY", 40],
      ["Merkez", "TRY", -130],
      ["Merkez", "USD", 5],
    ]);
    expect(m.grand).toEqual([
      { currency: "TRY", debit: 140, credit: 230, balance: -90 },
      { currency: "USD", debit: 5, credit: 0, balance: 5 },
    ]);
  });

  it("from öncesi devreden bakiyeye, to sonrası dışarı", () => {
    const m = groupStatement(lines, { ...base, from: "2026-01-20", to: "2026-03-05" });
    const merkezTry = m.workplaces.find((w) => w.branchId === "b1")!.currencies[0];
    expect(merkezTry.opening).toBe(100);
    expect(merkezTry.rows.map((r) => r.line.id)).toEqual(["l3"]);
    expect(merkezTry.balance).toBe(70);
    expect(merkezTry.rows[0].no).toBe(1);
    const ankara = m.workplaces.find((w) => w.branchId === "b2")!.currencies[0];
    expect(ankara.rows).toEqual([]);
    expect(ankara.opening).toBe(40);
  });

  it("para birimi ve iş yeri süzgeci; seçenek listeleri süzgeçten bağımsız", () => {
    const m = groupStatement(lines, { ...base, currencies: new Set(["USD"]), branchId: "b1" });
    expect(m.workplaces).toHaveLength(1);
    expect(m.workplaces[0].currencies.map((c) => c.currency)).toEqual(["USD"]);
    expect(m.allCurrencies).toEqual(["TRY", "USD"]);
    expect(m.allBranches.sort()).toEqual(["b1", "b2"]);
  });

  it("Fatura Tarihi tabanı belge tarihini kullanır", () => {
    expect(effectiveDate(lines[3], "DOCUMENT")).toBe("2025-12-01");
    expect(effectiveDate(lines[0], "DOCUMENT")).toBe("2026-02-01");
    const m = groupStatement(lines, { ...base, dateBasis: "DOCUMENT", to: "2025-12-31" });
    expect(m.summary.map((s) => s.currency)).toEqual(["USD"]);
  });

  it("parçalı sürüm senkron sonuçla aynı ve süre dolunca bırakır", async () => {
    let clock = 0;
    const yieldFn = vi.fn(async () => undefined);
    const chunked = await groupStatementChunked(lines, base, 50, {
      now: () => (clock += 30),
      yieldFn,
    });
    expect(chunked).toEqual(groupStatement(lines, base));
    expect(yieldFn).toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      groupStatementChunked(lines, base, 50, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("biçim yardımcıları", () => {
    expect(balanceMark(0)).toBe("B");
    expect(balanceMark(-1)).toBe("A");
    expect(statementNo("TED-001", "2026-11-14T10:00:00")).toBe("EKS-TED-001-20261114");
    expect(periodLabel(undefined, undefined, "Tüm Zamanlar")).toBe("Tüm Zamanlar");
    expect(periodLabel("2026-01-01", "2026-02-01", "x")).toBe("01.01.2026 - 01.02.2026");
    expect(periodLabel("2026-01-01", undefined, "x")).toBe("01.01.2026 - …");
    expect(periodLabel(undefined, "2026-02-01", "x")).toBe("… - 01.02.2026");
    expect(showsDetailToggle("GENEL")).toBe(true);
    expect(showsDetailToggle("MUSTERI")).toBe(false);
    expect(showsDetailToggle(null)).toBe(false);
  });
});

describe("missingInvoiceRows (12.2 §5.14 ekstre)", () => {
  const gap = (extra: Partial<AccountInvoiceGap>): AccountInvoiceGap => ({
    accountId: "a1",
    side: "PAYABLE",
    companyId: null,
    currency: "TRY",
    ledgerTotal: 150,
    invoiceTotal: 100,
    missing: 50,
    ...extra,
  });
  const gaps = [
    gap({ currency: "USD", side: "RECEIVABLE", missing: 7 }),
    gap({ side: "RECEIVABLE", missing: 3 }),
    gap({}),
    gap({ currency: "EUR", missing: 0.5 }),
    gap({ companyId: "c2", missing: 20 }),
  ];

  it("konsolide: para birimi sırası, önce PAYABLE; tolerans altı yok", () => {
    expect(missingInvoiceRows(gaps, null)).toEqual([
      { key: "TRY|PAYABLE", currency: "TRY", side: "PAYABLE", missing: 50 },
      { key: "TRY|RECEIVABLE", currency: "TRY", side: "RECEIVABLE", missing: 3 },
      { key: "USD|RECEIVABLE", currency: "USD", side: "RECEIVABLE", missing: 7 },
    ]);
  });

  it("şirket seçili ve gizli para birimi", () => {
    expect(missingInvoiceRows(gaps, "c2").map((r) => r.missing)).toEqual([20]);
    expect(missingInvoiceRows(gaps, null, (c) => c !== "TRY").map((r) => r.key)).toEqual([
      "USD|RECEIVABLE",
    ]);
    expect(missingInvoiceRows(undefined, null)).toEqual([]);
  });
});
