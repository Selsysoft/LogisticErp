import { describe, expect, it, vi } from "vitest";
import type { Statement, StatementLine } from "../../../../pages/finance/types";
import {
  collectStatement,
  extractCsv,
  extractFileName,
  extractModel,
  openingOf,
} from "./extractLogic";

function line(overrides: Partial<StatementLine> = {}): StatementLine {
  return {
    id: "l1",
    date: "2026-11-10",
    direction: "IN",
    amount: 100,
    exchangeRate: null,
    tlAmount: null,
    description: null,
    sourceType: "MANUAL",
    balance: 100,
    currency: "TRY",
    companyId: "c1",
    branchId: "b1",
    sourceId: "s1",
    kind: "",
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
    createdAt: "2026-11-10T00:00:00Z",
    ...overrides,
  };
}

function page(lines: StatementLine[], pageNo: number, totalPages: number, size = 200): Statement {
  return {
    currency: "TRY",
    openingBalance: 7,
    openingBalances: [{ currency: "TRY", amount: 50 }],
    lines,
    page: pageNo,
    size,
    totalElements: lines.length * totalPages,
    totalPages,
  };
}

describe("extractLogic (Banka/Kasa ekstresi)", () => {
  it("dönem başı: openingBalances satırı, yoksa ekstre para birimi, yoksa 0", () => {
    expect(openingOf(page([], 0, 1), "TRY")).toBe(50);
    expect(openingOf({ ...page([], 0, 1), openingBalances: [] }, "TRY")).toBe(7);
    expect(openingOf({ ...page([], 0, 1), openingBalances: [] }, "USD")).toBe(0);
    expect(openingOf(undefined, "TRY")).toBe(0);
  });

  it("sayfaları totalPages ve gerçek size ile sırayla toplar", async () => {
    const fetchPage = vi.fn(async (p: number) => page([line({ id: `p${p}` })], p, 3, 150));
    const result = await collectStatement(fetchPage, "TRY");
    expect(fetchPage.mock.calls).toEqual([
      [0, 200],
      [1, 150],
      [2, 150],
    ]);
    expect(result.lines.map((l) => l.id)).toEqual(["p0", "p1", "p2"]);
    expect(result).toMatchObject({ opening: 50, truncated: false });
  });

  it("10.000 satırı aşınca keser ve işaretler", async () => {
    const many = Array.from({ length: 3 }, (_, i) => line({ id: `x${i}` }));
    const fetchPage = vi.fn(async (p: number) => page(many, p, 5, 3));
    const result = await collectStatement(fetchPage, "TRY", 5);
    expect(result.lines).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    const zeroSize = await collectStatement(
      async () => ({ ...page([line()], 0, 0), size: 0 }),
      "TRY",
    );
    expect(zeroSize.lines).toHaveLength(1);
  });

  it("model: giriş/çıkış, toplamlar, dönem sonu, iptal satırı", () => {
    const model = extractModel(
      [
        line({ id: "a", amount: 100.105, balance: 150.1 }),
        line({
          id: "b",
          direction: "OUT",
          amount: 40,
          balance: 110.1,
          description: "ödeme",
          reversed: true,
        }),
      ],
      50,
      "TRY",
    );
    expect(model.rows[0]).toMatchObject({
      no: 1,
      direction: "IN",
      debit: 100.105,
      credit: 0,
      description: "",
    });
    expect(model.rows[1]).toMatchObject({
      no: 2,
      direction: "OUT",
      debit: 0,
      credit: 40,
      reversal: true,
    });
    expect(model).toMatchObject({
      opening: 50,
      totalIn: 100.11,
      totalOut: 40,
      closing: 110.11,
      count: 2,
    });
  });

  it("sunucunun kısa satırı: para birimi null → fon para birimi; REVERSAL kaynağı iptal sayılır (F-12.2-2)", () => {
    const model = extractModel(
      [
        line({ id: "a", currency: null as unknown as string }),
        line({
          id: "b",
          direction: "OUT",
          sourceType: "REVERSAL",
          currency: null as unknown as string,
        }),
        line({ id: "c", currency: "USD", reversal: null as unknown as boolean }),
      ],
      0,
      "EUR",
    );
    expect(model.rows.map((r) => r.currency)).toEqual(["EUR", "EUR", "USD"]);
    expect(model.rows.map((r) => r.reversal)).toEqual([false, true, false]);
  });

  it("CSV null/undefined hücreyi boş yazar (F-12.2-2)", () => {
    expect(extractCsv([["1", null, undefined, "x"]])).toBe(
      String.fromCharCode(0xfeff) + '"1";"";"";"x"',
    );
  });

  it("dosya adı ve CSV", () => {
    expect(extractFileName("BANK", "ZRT-1", "2026-11-01", "2026-11-14")).toBe(
      "banka_ekstresi_ZRT1_20261101_20261114.csv",
    );
    expect(extractFileName("CASH", "K1", "2026-11-01", "2026-11-14")).toBe(
      "kasa_ekstresi_K1_20261101_20261114.csv",
    );
    expect(
      extractCsv([
        ["#", "Açıklama"],
        ["1", "@x"],
        ["2", "-5,00"],
      ]),
    ).toBe(String.fromCharCode(0xfeff) + '"#";"Açıklama"\n"1";"\'@x"\n"2";"-5,00"');
  });
});
