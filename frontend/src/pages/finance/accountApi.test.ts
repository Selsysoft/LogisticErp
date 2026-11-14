// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiGet: (p: string) => apiRequest("GET", p),
}));

import {
  ALL_TRANSACTIONS_LIMIT,
  accountListQuery,
  accountSearchQuery,
  balancesQuery,
  buildQuery,
  cancelDocument,
  createDocument,
  createTransfer,
  deleteRollover,
  effectiveCompany,
  fetchAllPages,
  fetchAllTransactions,
  fetchFullStatement,
  financeKeys,
  invoicesQuery,
  newIdempotencyKey,
  reviseDocument,
  setAccountActive,
  statementQuery,
  transactionsQuery,
  useIdempotencyKey,
} from "./accountApi";
import type { AccountTransactionPage, Statement } from "./types";

beforeEach(() => apiRequest.mockReset());

describe("buildQuery", () => {
  it("dizi değerlerini tekrar eden anahtarla yazar, boşları atlar, kodlar", () => {
    expect(
      buildQuery({
        search: "a b",
        types: ["CUSTOMER", "SUPPLIER"],
        empty: "",
        none: undefined,
        nul: null,
        list: [],
        active: false,
        page: 0,
      }),
    ).toBe("?search=a%20b&types=CUSTOMER&types=SUPPLIER&active=false&page=0");
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
  });

  it("şirket: undefined aktif şirketi, null konsolideyi seçer", () => {
    expect(effectiveCompany(undefined, "c1")).toBe("c1");
    expect(effectiveCompany(null, "c1")).toBeNull();
    expect(effectiveCompany("c2", "c1")).toBe("c2");
  });
});

describe("sorgu yolları", () => {
  it("cari listesi", () => {
    expect(
      accountListQuery(
        { search: " ali ", types: ["CUSTOMER"], subGroups: ["MUSTERI", "ACENTE"], active: true },
        1,
        2000,
        "c1",
      ),
    ).toBe(
      "/finance/accounts?search=ali&companyId=c1&types=CUSTOMER&subGroups=MUSTERI&subGroups=ACENTE&active=true&page=1&size=2000",
    );
    expect(
      accountListQuery({ companyId: null, includePlanSummary: true, balanceGroupBy: "BRANCH" }),
    ).toBe("/finance/accounts?balanceGroupBy=BRANCH&includePlanSummary=true&page=0&size=2000");
  });

  it("hareketler, ekstre, bakiye, fatura", () => {
    expect(
      transactionsQuery(
        { accountId: "a1", branchIds: ["b1", "b2"], kinds: ["DEBT", "PAYMENT"], facets: true },
        2,
        500,
        "c1",
      ),
    ).toBe(
      "/finance/account-transactions?accountId=a1&companyId=c1&branchIds=b1&branchIds=b2&kinds=DEBT&kinds=PAYMENT&facets=true&page=2&size=500",
    );
    expect(
      transactionsQuery({
        from: "2026-01-01",
        to: "2026-01-31",
        accountTypes: ["SUPPLIER"],
        subGroups: ["TED"],
        currency: "TRY",
      }),
    ).toBe(
      "/finance/account-transactions?from=2026-01-01&to=2026-01-31&currency=TRY&accountTypes=SUPPLIER&subGroups=TED&page=0&size=500",
    );
    expect(
      statementQuery(
        "a/1",
        { from: "2026-01-01", to: "2026-12-31", dateBasis: "DOCUMENT", branchIds: ["b1"] },
        0,
        2000,
        "c1",
      ),
    ).toBe(
      "/finance/accounts/a%2F1/statement?from=2026-01-01&to=2026-12-31&companyId=c1&branchIds=b1&dateBasis=DOCUMENT&page=0&size=2000",
    );
    expect(statementQuery("a1", { currency: "EUR", companyId: null })).toBe(
      "/finance/accounts/a1/statement?currency=EUR&page=0&size=2000",
    );
    expect(balancesQuery("a1", { groupBy: "COMPANY", rolloverId: "r1" }, "c1")).toBe(
      "/finance/accounts/a1/balances?companyId=c1&groupBy=COMPANY&rolloverId=r1",
    );
    expect(invoicesQuery("a1", { direction: "PURCHASE", reflected: false })).toBe(
      "/finance/accounts/a1/invoices?direction=PURCHASE&reflected=false",
    );
  });

  it("cari arama yalnız aktif kartlarda, 20 sonuç", () => {
    expect(accountSearchQuery(" Ay ", { types: ["CUSTOMER"], subGroups: ["ACENTE"] })).toBe(
      "/finance/accounts?search=Ay&types=CUSTOMER&subGroups=ACENTE&active=true&size=20",
    );
  });
});

describe("sorgu anahtarları", () => {
  it("hepsi ['finance', …] önekli; şirket anahtarda", () => {
    const keys = [
      financeKeys.accountGroups(),
      financeKeys.accountList({}, "c1"),
      financeKeys.account("a", "c1"),
      financeKeys.accountSearch("x", {}),
      financeKeys.balances("a", {}, null),
      financeKeys.transactions({ accountId: "a" }, "c1"),
      financeKeys.allTransactions({ from: "x", to: "y" }, "c1"),
      financeKeys.statement("a", {}, "c1"),
      financeKeys.invoices("a", { direction: "SALES" }, null),
      financeKeys.documentTypes(),
      financeKeys.document("d"),
      financeKeys.transaction("t"),
      financeKeys.transactionSource("t"),
      financeKeys.rollovers("a", false),
      financeKeys.transferable("a", null),
      financeKeys.transferHistory({}),
      financeKeys.bankAccounts("a", true),
      financeKeys.bankAccount("b"),
      financeKeys.history("a"),
    ];
    for (const key of keys) expect(key[0]).toBe("finance");
    expect(financeKeys.accountList({}, "c1")).toEqual(["finance", "accounts", "list", {}, "c1"]);
    expect(financeKeys.allTransactions({ from: "x", to: "y" }, "c1").slice(0, 3)).toEqual([
      "finance",
      "account-transactions",
      "all",
    ]);
    expect(financeKeys.transactionSource("t")).toEqual([
      "finance",
      "account-transaction",
      "t",
      "source",
    ]);
  });
});

describe("sayfaları birleştirme", () => {
  const page = (n: number, totalPages: number, totalElements: number, ids: string[]) => ({
    content: ids.map((id) => ({ id })),
    page: n,
    size: ids.length,
    totalPages,
    totalElements,
  });

  it("sayfaları sırayla çeker ve birleştirir", async () => {
    const calls: number[] = [];
    const result = await fetchAllPages<{ id: string }, ReturnType<typeof page>>(async (n) => {
      calls.push(n);
      return page(n, 3, 5, n === 2 ? ["e"] : [`${n}a`, `${n}b`]);
    });
    expect(calls).toEqual([0, 1, 2]);
    expect(result.rows.map((r) => r.id)).toEqual(["0a", "0b", "1a", "1b", "e"]);
    expect(result.tooLarge).toBe(false);
  });

  it("sınır aşılırsa ilk sayfadan sonra durur", async () => {
    const fetch = vi.fn(async (n: number) => page(n, 30, 15_000, ["x"]));
    const result = await fetchAllPages(fetch, { limit: 10_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ rows: [], total: 15_000, tooLarge: true });
  });

  it("Günlük Tüm Cari İşlemleri: facet yalnız ilk istekte, 10.000 sınırı", async () => {
    const paths: string[] = [];
    const facets = { branches: [], groups: [], kinds: [{ kind: "DEBT", count: 3 }] };
    const get = async (p: string): Promise<AccountTransactionPage> => {
      paths.push(p);
      const n = Number(/page=(\d+)/.exec(p)?.[1]);
      return {
        ...page(n, 2, 3, n === 0 ? ["a", "b"] : ["c"]),
        content: [],
        facets: n === 0 ? facets : null,
      } as AccountTransactionPage;
    };
    const result = await fetchAllTransactions(
      get,
      { from: "2026-01-01", to: "2026-01-02", facets: true },
      "c1",
    );
    expect(paths[0]).toContain("facets=true");
    expect(paths[1]).not.toContain("facets");
    expect(paths[1]).toContain("page=1&size=500");
    expect(result.facets).toBe(facets);
    expect(result.tooLarge).toBe(false);

    const big = await fetchAllTransactions(
      async () =>
        ({
          content: [],
          page: 0,
          size: 500,
          totalPages: 21,
          totalElements: ALL_TRANSACTIONS_LIMIT + 1,
          facets: null,
        }) as AccountTransactionPage,
      { from: "a", to: "b" },
      null,
    );
    expect(big).toEqual({ rows: [], total: 10_001, tooLarge: true, facets: null });
  });

  it("ekstre: satırlar birleşir, açılış ilk sayfadan", async () => {
    const get = async (p: string): Promise<Statement> => {
      const n = Number(/page=(\d+)/.exec(p)?.[1]);
      return {
        currency: "TRY",
        openingBalance: 10,
        openingBalances: [{ currency: "TRY", amount: 10 }],
        lines: [{ id: `l${n}` }] as Statement["lines"],
        page: n,
        size: 2000,
        totalElements: 2,
        totalPages: 2,
      };
    };
    const statement = await fetchFullStatement(get, "a1", { currency: "TRY" }, null);
    expect(statement.lines.map((l) => l.id)).toEqual(["l0", "l1"]);
    expect(statement.openingBalances).toEqual([{ currency: "TRY", amount: 10 }]);
    expect(statement.totalPages).toBe(1);
  });
});

describe("yazma çağrıları", () => {
  it("belge ve taşıma POST'ları Idempotency-Key başlığı taşır", async () => {
    apiRequest.mockResolvedValue({});
    const body = {
      side: "PAYABLE" as const,
      documentType: "PURCHASE_INVOICE",
      documentNo: "F1",
      documentDate: "2026-11-14",
      amount: 10,
      currency: "TRY",
      paymentMethod: "BANK" as const,
      branchId: "b1",
    };
    await createDocument("a1", body, "k-1");
    expect(apiRequest).toHaveBeenLastCalledWith("POST", "/finance/accounts/a1/documents", body, {
      "Idempotency-Key": "k-1",
    });
    await reviseDocument("d1", body, "k-2");
    expect(apiRequest).toHaveBeenLastCalledWith(
      "POST",
      "/finance/account-documents/d1/revise",
      body,
      { "Idempotency-Key": "k-2" },
    );
    await createTransfer({ fromAccountId: "a", toAccountId: "b", transactionIds: ["t"] }, "k-3");
    expect(apiRequest.mock.lastCall?.[3]).toEqual({ "Idempotency-Key": "k-3" });
    await createDocument("a1", body);
    expect(apiRequest.mock.lastCall?.[3]).toBeUndefined();
  });

  it("diğer uçlar", async () => {
    apiRequest.mockResolvedValue(undefined);
    await setAccountActive("a1", false);
    expect(apiRequest).toHaveBeenLastCalledWith("PATCH", "/finance/accounts/a1/active", {
      active: false,
    });
    await cancelDocument("d1", { date: "2026-11-14" });
    expect(apiRequest).toHaveBeenLastCalledWith("POST", "/finance/account-documents/d1/cancel", {
      date: "2026-11-14",
    });
    await deleteRollover("r1", "r2");
    expect(apiRequest).toHaveBeenLastCalledWith("DELETE", "/finance/rollovers/r1?newActiveId=r2");
    await deleteRollover("r1");
    expect(apiRequest).toHaveBeenLastCalledWith("DELETE", "/finance/rollovers/r1");
  });
});

describe("Idempotency-Key", () => {
  it("UUID biçiminde ve her çağrıda farklı", () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });

  it("randomUUID yoksa getRandomValues ile üretir", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });

  it("modal başına sabit: açık kaldıkça aynı, yeniden açılışta yeni", () => {
    const { result, rerender } = renderHook(({ open }) => useIdempotencyKey(open), {
      initialProps: { open: true },
    });
    const first = result.current;
    rerender({ open: true });
    expect(result.current).toBe(first);
    rerender({ open: false });
    expect(result.current).toBe(first);
    rerender({ open: true });
    expect(result.current).not.toBe(first);
  });
});
