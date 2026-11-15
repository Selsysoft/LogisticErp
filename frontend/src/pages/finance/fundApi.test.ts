// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiGet: (p: string) => apiRequest("GET", p),
}));

import { useCompanyStore } from "../../auth/companyStore";
import * as api from "./fundApi";
import type { SettlementBody } from "./types";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

const emptyPage = { content: [], page: 0, size: 0, totalElements: 0, totalPages: 0 };

function paths(): string[] {
  return apiRequest.mock.calls.map((call) => `${call[0]} ${call[1]}`);
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, path: string) =>
    /page=/.test(path) ? { ...emptyPage, summary: null } : [],
  );
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

afterEach(() => {
  // Takılı kalan kancalar sonraki testte (şirket değişince) yeniden istek atmasın.
  cleanup();
  vi.useRealTimers();
});

describe("sorgu yolları", () => {
  it("fon listesi: şirket, tekrar eden iş yeri, tür, hesap türü, aktiflik, para birimi, tarih", () => {
    expect(api.fundListQuery({})).toBe("/finance/funds");
    expect(api.fundListQuery({}, "c1")).toBe("/finance/funds?companyId=c1");
    expect(api.fundListQuery({ companyId: null }, "c1")).toBe("/finance/funds");
    expect(
      api.fundListQuery(
        {
          companyId: "c2",
          branchIds: ["b1", "b2"],
          kind: "BANK",
          accountType: "DEMAND",
          active: false,
          currency: "USD",
          asOf: "2026-11-14",
        },
        "c1",
      ),
    ).toBe(
      "/finance/funds?companyId=c2&branchId=b1&branchId=b2&kind=BANK&accountType=DEMAND&active=false&currency=USD&asOf=2026-11-14",
    );
    expect(api.fundSummaryQuery({ kind: "CASH", asOf: "2026-11-14" }, "c1")).toBe(
      "/finance/funds/summary?companyId=c1&kind=CASH&asOf=2026-11-14",
    );
    expect(api.fundDetailQuery("f 1")).toBe("/finance/funds/f%201");
    expect(api.fundDetailQuery("f1", "2026-11-14")).toBe("/finance/funds/f1?asOf=2026-11-14");
    expect(api.fundSparklinesQuery(["a", "b"])).toBe("/finance/funds/sparklines?ids=a&ids=b");
  });

  it("kimlik parçaları: tekil, sıralı, boşsuz, 200'lük", () => {
    expect(api.chunkIds([])).toEqual([]);
    expect(api.chunkIds(["b", "a", "b", ""])).toEqual([["a", "b"]]);
    const many = Array.from({ length: 401 }, (_, i) => `id${String(i).padStart(3, "0")}`);
    const chunks = api.chunkIds(many);
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 1]);
    expect(api.chunkIds(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });

  it("hareket araması: süzgeçler, açık page/size, sıralama, q kırpılır", () => {
    expect(
      api.fundTransactionsQuery(
        {
          kind: "BANK",
          fundIds: ["f1", "f2"],
          branchIds: ["b1"],
          accountType: "DEMAND",
          direction: "OUT",
          accountingTypes: ["EFT", "Havale"],
          currency: "TRY",
          from: "2026-11-07",
          to: "2026-11-15",
          q: "  kira ",
          summary: true,
          sort: "desc",
        },
        2,
        100,
        "c1",
      ),
    ).toBe(
      "/finance/funds/transactions?companyId=c1&kind=BANK&fundId=f1&fundId=f2&branchId=b1&accountType=DEMAND&direction=OUT&accountingType=EFT&accountingType=Havale&currency=TRY&from=2026-11-07&to=2026-11-15&q=kira&summary=true&page=2&size=100&sort=transactionDate%2Cdesc",
    );
    expect(api.fundTransactionsQuery({ from: "2026-01-01", to: "2026-01-02" })).toBe(
      "/finance/funds/transactions?from=2026-01-01&to=2026-01-02&page=0&size=50",
    );
    expect(
      api.fundTransactionsQuery({ from: "a", to: "b", q: "x".repeat(150) }, -1, 9999),
    ).toContain(`q=${"x".repeat(100)}&page=0&size=500`);
    expect(
      api.fundTransactionsExportQuery(
        { kind: "CASH", from: "2026-01-01", to: "2026-01-31", sort: "asc", summary: true },
        "c1",
      ),
    ).toBe(
      "/finance/funds/transactions/export?companyId=c1&kind=CASH&from=2026-01-01&to=2026-01-31&sort=transactionDate%2Casc",
    );
  });

  it("hareket araması kuralları: to zorunlu, from yalnız tek fonda boş; boyut 1–500 / 50", () => {
    expect(api.fundTransactionsReady({ from: "a", to: "b" })).toBe(true);
    expect(api.fundTransactionsReady({ from: "a" })).toBe(false);
    expect(api.fundTransactionsReady({ to: "b" })).toBe(false);
    expect(api.fundTransactionsReady({ to: "b", fundIds: ["f1"] })).toBe(true);
    expect(api.fundTransactionsReady({ to: "b", fundIds: ["f1", "f2"] })).toBe(false);
    expect(api.fundTransactionsPageSize({ from: "a" }, 1000)).toBe(500);
    expect(api.fundTransactionsPageSize({ from: "a" }, 0)).toBe(1);
    expect(api.fundTransactionsPageSize({ from: "a" }, 25.7)).toBe(25);
    expect(api.fundTransactionsPageSize({ from: "a" }, Number.NaN)).toBe(50);
    expect(api.fundTransactionsPageSize({ fundIds: ["f1"] }, 200)).toBe(50);
  });

  it("faaliyet raporu, ekstre, transferler, döviz kaynakları, rapor, virman, eksik fatura", () => {
    expect(api.fundActivityQuery("f1", { from: "2026-10-14", to: "2026-11-14" })).toBe(
      "/finance/funds/f1/activity-report?from=2026-10-14&to=2026-11-14",
    );
    expect(api.fundStatementQuery("f1", { from: "a", to: "b" })).toBe(
      "/finance/funds/f1/statement?from=a&to=b&page=0&size=200",
    );
    expect(api.fundStatementQuery("f1", {}, 3, 5000)).toBe(
      "/finance/funds/f1/statement?page=3&size=200",
    );
    const transfers = {
      branchIds: ["b1"],
      transferType: "INTERCOMPANY" as const,
      status: "POSTED" as const,
      from: "2026-11-07",
      to: "2026-11-15",
      q: " VRM ",
    };
    expect(api.transfersQuery(transfers, 1, 999, "c1")).toBe(
      "/finance/funds/transfers?companyId=c1&branchId=b1&transferType=INTERCOMPANY&status=POSTED&from=2026-11-07&to=2026-11-15&q=VRM&page=1&size=200",
    );
    expect(api.transfersQuery({ from: "a", to: "b" })).toBe(
      "/finance/funds/transfers?from=a&to=b&page=0&size=25",
    );
    expect(api.transferSummaryQuery(transfers, null)).toBe(
      "/finance/funds/transfers/summary?branchId=b1&transferType=INTERCOMPANY&status=POSTED&from=2026-11-07&to=2026-11-15&q=VRM",
    );
    expect(api.fxSourcesQuery({ fundId: "f1", currency: "USD" })).toBe(
      "/finance/funds/transfers/fx-sources?fundId=f1&currency=USD",
    );
    expect(api.fxCandidatesQuery({ fundId: "f1", currency: "USD" })).toBe(
      "/finance/funds/transfers/fx-collection-candidates?fundId=f1&currency=USD",
    );
    expect(api.fxCandidatesQuery({ fundId: "f1", currency: "USD", accountId: "a1" })).toBe(
      "/finance/funds/transfers/fx-collection-candidates?fundId=f1&currency=USD&accountId=a1",
    );
    expect(api.fxReportQuery({ from: "a", to: "b" }, "c1")).toBe(
      "/finance/funds/transfers/fx-report?companyId=c1&from=a&to=b",
    );
    expect(api.intercompanyTransfersQuery({ from: "a", to: "b" }, 0, 50, "c1")).toBe(
      "/finance/intercompany-transfers?companyId=c1&from=a&to=b&page=0&size=50",
    );
    expect(api.intercompanyTransfersQuery({ from: "a", to: "b", companyId: null }, 0, 0)).toBe(
      "/finance/intercompany-transfers?from=a&to=b&page=0&size=1",
    );
    expect(api.invoiceGapsQuery({ side: "PAYABLE" }, "c1")).toBe(
      "/finance/accounts/invoice-gaps?companyId=c1&side=PAYABLE",
    );
    expect(api.invoiceGapsQuery({ companyId: null })).toBe("/finance/accounts/invoice-gaps");
    expect(api.settlementCheckPath("PAYMENT")).toBe("/finance/settlements/check?type=PAYMENT");
    // 12.2a düzeltme önizlemesi (§3.4): eski kaydın kimliği sorguda.
    expect(api.settlementCheckPath("COLLECTION", "s 1")).toBe(
      "/finance/settlements/check?type=COLLECTION&correctsSettlementId=s%201",
    );
    expect(api.settlementCheckPath("PAYMENT", null)).toBe(
      "/finance/settlements/check?type=PAYMENT",
    );
    expect(api.settlementCheckPath("PAYMENT", "")).toBe("/finance/settlements/check?type=PAYMENT");
  });

  it("uyarı önizlemesi için zorunlu alanlar", () => {
    const body: SettlementBody = {
      method: "CASH",
      accountId: "a1",
      branchId: "b1",
      money: { amount: "150", currency: "TRY" },
      date: "2026-11-14",
    };
    expect(api.settlementCheckReady(body)).toBe(true);
    expect(api.settlementCheckReady(null)).toBe(false);
    expect(api.settlementCheckReady(undefined)).toBe(false);
    expect(api.settlementCheckReady({ ...body, accountId: undefined })).toBe(false);
    expect(api.settlementCheckReady({ ...body, branchId: "" })).toBe(false);
    expect(api.settlementCheckReady({ ...body, money: { amount: "0", currency: "TRY" } })).toBe(
      false,
    );
    expect(api.settlementCheckReady({ ...body, money: { amount: "x", currency: "TRY" } })).toBe(
      false,
    );
    expect(api.settlementCheckReady({ ...body, money: { amount: "5", currency: "" } })).toBe(false);
  });
});

describe("sorgu anahtarları", () => {
  it("hepsi ['finance', 'fund-center', …] önekli; mevcut MUI anahtarlarıyla çakışmaz", () => {
    const keys: ReadonlyArray<readonly unknown[]> = [
      api.fundKeys.all,
      api.fundKeys.list({ companyId: "c1" }),
      api.fundKeys.summary({ companyId: null }),
      api.fundKeys.sparklines(["a"]),
      api.fundKeys.detail("f1"),
      api.fundKeys.canDelete("f1"),
      api.fundKeys.transactions({ companyId: null, page: 0, size: 50 }),
      api.fundKeys.transaction("t1"),
      api.fundKeys.activity("f1", { from: "a", to: "b" }),
      api.fundKeys.statement("f1", { page: 0, size: 200 }),
      api.fundKeys.transfers({ from: "a", to: "b", companyId: null, page: 0, size: 25 }),
      api.fundKeys.transferSummary({ from: "a", to: "b", companyId: null }),
      api.fundKeys.transfer("x"),
      api.fundKeys.dependents("x"),
      api.fundKeys.fxSources({ fundId: "f", currency: "USD" }),
      api.fundKeys.fxCandidates({ fundId: "f", currency: "USD" }),
      api.fundKeys.fxReport({ from: "a", to: "b", companyId: null }),
      api.fundKeys.intercompanyList({ from: "a", to: "b", companyId: null, page: 0, size: 1 }),
      api.fundKeys.intercompany("i1"),
      api.fundKeys.invoiceGaps({ companyId: null }),
      api.fundKeys.settlementCheck({ type: "PAYMENT", body: null }),
    ];
    for (const key of keys) {
      expect(key.slice(0, 2)).toEqual(["finance", "fund-center"]);
    }
    expect(api.fundKeys.detail("f1", "2026-11-14")).toEqual([
      "finance",
      "fund-center",
      "detail",
      "f1",
      "2026-11-14",
    ]);
    expect(api.fundKeys.detail("f1")[4]).toBeNull();
  });
});

describe("okuma kancaları doğru uca gider", () => {
  const cases: Array<[string, () => unknown, string]> = [
    ["fon listesi", () => api.useFundList({ kind: "BANK" }), "GET /finance/funds?kind=BANK"],
    ["özet", () => api.useFundSummary(), "GET /finance/funds/summary"],
    ["detay", () => api.useFund("f1"), "GET /finance/funds/f1"],
    ["silme denetimi", () => api.useFundCanDelete("f1"), "GET /finance/funds/f1/can-delete"],
    [
      "hareketler",
      () => api.useFundTransactions({ from: "a", to: "b" }, 1, 100),
      "GET /finance/funds/transactions?from=a&to=b&page=1&size=100",
    ],
    ["hareket", () => api.useFundTransaction("t1"), "GET /finance/funds/transactions/t1"],
    [
      "faaliyet",
      () => api.useFundActivity("f1", { from: "a", to: "b" }),
      "GET /finance/funds/f1/activity-report?from=a&to=b",
    ],
    [
      "ekstre",
      () => api.useFundStatement("f1", { from: "a", to: "b" }, 0, 50),
      "GET /finance/funds/f1/statement?from=a&to=b&page=0&size=50",
    ],
    [
      "transferler",
      () => api.useTransfers({ from: "a", to: "b" }),
      "GET /finance/funds/transfers?from=a&to=b&page=0&size=25",
    ],
    [
      "transfer özeti",
      () => api.useTransferSummary({ from: "a", to: "b" }),
      "GET /finance/funds/transfers/summary?from=a&to=b",
    ],
    ["transfer", () => api.useTransfer("x1"), "GET /finance/funds/transfers/x1"],
    [
      "bağımlılar",
      () => api.useTransferDependents("x1"),
      "GET /finance/funds/transfers/x1/dependents",
    ],
    [
      "döviz kaynakları",
      () => api.useFxSources({ fundId: "f1", currency: "USD" }),
      "GET /finance/funds/transfers/fx-sources?fundId=f1&currency=USD",
    ],
    [
      "aday cariler",
      () => api.useFxCandidateAccounts({ fundId: "f1", currency: "USD" }),
      "GET /finance/funds/transfers/fx-collection-candidates?fundId=f1&currency=USD",
    ],
    [
      "aday tahsilatlar",
      () => api.useFxCandidateCollections({ fundId: "f1", currency: "USD", accountId: "a1" }),
      "GET /finance/funds/transfers/fx-collection-candidates?fundId=f1&currency=USD&accountId=a1",
    ],
    [
      "döviz raporu",
      () => api.useFxReport({ from: "a", to: "b" }),
      "GET /finance/funds/transfers/fx-report?from=a&to=b",
    ],
    [
      "virman listesi",
      () => api.useIntercompanyTransfers({ from: "a", to: "b" }),
      "GET /finance/intercompany-transfers?from=a&to=b&page=0&size=200",
    ],
    ["virman", () => api.useIntercompanyTransfer("i1"), "GET /finance/intercompany-transfers/i1"],
    [
      "eksik fatura",
      () => api.useInvoiceGaps({ side: "RECEIVABLE" }),
      "GET /finance/accounts/invoice-gaps?side=RECEIVABLE",
    ],
  ];

  it.each(cases)("%s", async (_name, hook, expected) => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => hook() as { isSuccess: boolean }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual([expected]);
  });

  it("aktif şirket anahtara ve parametreye girer; açık null konsolidedir", async () => {
    useCompanyStore.setState({ activeCompanyId: "c1" } as never);
    const { Wrapper, client } = wrapper();
    const list = renderHook(() => api.useFundList(), { wrapper: Wrapper });
    const gaps = renderHook(() => api.useInvoiceGaps({ companyId: null }), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(gaps.result.current.isSuccess).toBe(true));
    expect(paths()).toEqual([
      "GET /finance/funds?companyId=c1",
      "GET /finance/accounts/invoice-gaps",
    ]);
    expect(
      client.getQueryCache().find({ queryKey: api.fundKeys.list({ companyId: "c1" }) }),
    ).toBeTruthy();
  });

  it("eksik parametrede istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(
      () => {
        api.useFund(undefined);
        api.useFundCanDelete(undefined);
        api.useFundCanDelete("f1", { enabled: false });
        api.useFundActivity(undefined, { from: "a", to: "b" });
        api.useTransferDependents(undefined);
        api.useFxCandidateAccounts(null);
        api.useFxCandidateCollections(null);
        api.useFundTransactions({ from: "a" });
        api.useFundTransaction(undefined);
        api.useFundActivity("f1", { from: "", to: "b" });
        api.useFundStatement(undefined, {});
        api.useTransfers({ from: "", to: "b" });
        api.useTransferSummary({ from: "a", to: "" });
        api.useTransfer(undefined);
        api.useTransferDependents("x", { enabled: false });
        api.useFxSources(null);
        api.useFxCandidateAccounts({ fundId: "f1", currency: "" });
        api.useFxCandidateCollections({ fundId: "f1", currency: "USD" });
        api.useFxReport({ from: "", to: "" });
        api.useIntercompanyTransfers({ from: "", to: "" });
        api.useIntercompanyTransfer(undefined);
        api.useInvoiceGaps({}, { enabled: false });
        api.useFundList({}, { enabled: false });
        api.useFundSummary({}, { enabled: false });
        api.useFundSparklines([]);
        return api.useSettlementCheck("PAYMENT", null);
      },
      { wrapper: Wrapper },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("sparkline: 200'lük parçalar sırayla istenir, sonuçlar birleşir", async () => {
    apiRequest.mockImplementation(async (_m: string, path: string) =>
      path.includes("id000")
        ? [{ fundId: "id000", points: [1, 2] }]
        : [{ fundId: "x", points: [] }],
    );
    const ids = Array.from({ length: 201 }, (_, i) => `id${String(i).padStart(3, "0")}`);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => api.useFundSparklines(ids), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect((apiRequest.mock.calls[1][1] as string).endsWith("ids=id200")).toBe(true);
    expect(result.current.data?.map((s) => s.fundId)).toEqual(["id000", "x"]);
  });
});

describe("dışa aktarma", () => {
  it("sayfasız uca aktif şirketle gider", async () => {
    apiRequest.mockResolvedValueOnce([{ id: "t1" }]);
    const rows = await api.exportFundTransactions({ from: "a", to: "b" }, "c1");
    expect(rows).toEqual([{ id: "t1" }]);
    expect(paths()).toEqual(["GET /finance/funds/transactions/export?companyId=c1&from=a&to=b"]);
  });
});

describe("useDebouncedValue ve useSettlementCheck", () => {
  const body: SettlementBody = {
    method: "BANK",
    accountId: "a1",
    branchId: "b1",
    fundAccountId: "f1",
    money: { amount: "150", currency: "TRY" },
    date: "2026-11-14",
    confirmWarnings: true,
  };

  it("değer sabit kalınca gecikmeden sonra değişir; aynı içerik zamanlayıcı kurmaz", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => api.useDebouncedValue(v, 400), {
      initialProps: { v: { a: 1 } },
    });
    const first = result.current;
    rerender({ v: { a: 1 } });
    expect(result.current).toBe(first);
    rerender({ v: { a: 2 } });
    act(() => vi.advanceTimersByTime(399));
    expect(result.current).toEqual({ a: 1 });
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ a: 2 });
    rerender({ v: { a: 3 } });
    rerender({ v: { a: 2 } });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toEqual({ a: 2 });
  });

  it("undefined değer de kararlı", () => {
    const { result, rerender } = renderHook(({ v }) => api.useDebouncedValue(v, 10), {
      initialProps: { v: undefined as string | undefined },
    });
    rerender({ v: undefined });
    expect(result.current).toBeUndefined();
  });

  it("POST /settlements/check: gövde gecikmeyle gider, confirmWarnings gönderilmez", async () => {
    apiRequest.mockResolvedValue({ warnings: [], invoiceGaps: [] });
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(
      ({ b }: { b: SettlementBody | null }) =>
        api.useSettlementCheck("PAYMENT", b, { delayMs: 10 }),
      { wrapper: Wrapper, initialProps: { b: null as SettlementBody | null } },
    );
    expect(apiRequest).not.toHaveBeenCalled();
    rerender({ b: body });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [method, path, sent] = apiRequest.mock.calls[0];
    expect(method).toBe("POST");
    expect(path).toBe("/finance/settlements/check?type=PAYMENT");
    expect(sent).toMatchObject({ accountId: "a1", money: { amount: "150", currency: "TRY" } });
    expect((sent as SettlementBody).confirmWarnings).toBeUndefined();
  });

  it("ilk değer hazırsa varsayılan gecikmeyle hemen istenir; devre dışı seçenek", async () => {
    apiRequest.mockResolvedValue({ warnings: [], invoiceGaps: [] });
    const { Wrapper } = wrapper();
    const off = renderHook(() => api.useSettlementCheck("COLLECTION", body, { enabled: false }), {
      wrapper: Wrapper,
    });
    expect(off.result.current.fetchStatus).toBe("idle");
    const on = renderHook(() => api.useSettlementCheck("COLLECTION", body), { wrapper: Wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(paths()).toEqual(["POST /finance/settlements/check?type=COLLECTION"]);
  });

  it("üçüncü argüman correctsSettlementId sorguya ve anahtara girer (12.2a düzenleme)", async () => {
    apiRequest.mockResolvedValue({ warnings: [], invoiceGaps: [] });
    const { Wrapper, client } = wrapper();
    const { result } = renderHook(
      () => api.useSettlementCheck("PAYMENT", body, { correctsSettlementId: "old-1" }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual([
      "POST /finance/settlements/check?type=PAYMENT&correctsSettlementId=old-1",
    ]);
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toEqual([
      api.fundKeys.settlementCheck({ type: "PAYMENT", body, correctsSettlementId: "old-1" }),
    ]);
    // Aynı gövde, düzeltmesiz: ayrı anahtar ve kimliksiz yol.
    const plain = renderHook(
      () => api.useSettlementCheck("PAYMENT", body, { correctsSettlementId: "" }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(plain.result.current.isSuccess).toBe(true));
    expect(paths()[1]).toBe("POST /finance/settlements/check?type=PAYMENT");
  });
});

describe("yazma çağrıları", () => {
  it("fon tanımı uçları ve PATCH", async () => {
    apiRequest.mockResolvedValue({});
    await api.createFund({
      code: "B1",
      name: "Ana",
      kind: "BANK",
      currency: "TRY",
      branchId: "b1",
      allowNegative: false,
    });
    await api.updateFund("f1", { name: "Ana", branchId: "b1", active: null });
    await api.setFundActive("f1", false);
    await api.deleteFund("f1");
    expect(apiRequest.mock.calls.map((c) => [c[0], c[1], c[2], c[3]])).toEqual([
      [
        "POST",
        "/finance/funds",
        {
          code: "B1",
          name: "Ana",
          kind: "BANK",
          currency: "TRY",
          branchId: "b1",
          allowNegative: false,
        },
        undefined,
      ],
      ["PUT", "/finance/funds/f1", { name: "Ana", branchId: "b1", active: null }, undefined],
      ["PATCH", "/finance/funds/f1/active", { active: false }, undefined],
      ["DELETE", "/finance/funds/f1", undefined, undefined],
    ]);
  });

  it("transfer ve virman uçları; Idempotency-Key yalnız oluşturma/yerine koymada", async () => {
    apiRequest.mockResolvedValue({});
    const transfer = {
      transferType: "EFT" as const,
      fromFundId: "f1",
      toFundId: "f2",
      money: { amount: "10", currency: "TRY" },
      date: "2026-11-14",
    };
    await api.createTransfer(transfer, "k1");
    await api.createTransfer(transfer);
    await api.replaceTransfer("x1", { transfer, reason: "düzelt" }, "k2");
    await api.reverseTransfer("x1", { date: "2026-11-14" });
    await api.createIntercompanyTransfer(
      { ...transfer, reasonType: "DEBT_PAID", transferType: "EFT" },
      "k3",
    );
    await api.reverseIntercompanyTransfer("i1", { date: "2026-11-14", reason: "r" });
    expect(apiRequest.mock.calls.map((c) => [c[0], c[1], c[3]])).toEqual([
      ["POST", "/finance/funds/transfers", { "Idempotency-Key": "k1" }],
      ["POST", "/finance/funds/transfers", undefined],
      ["POST", "/finance/funds/transfers/x1/replace", { "Idempotency-Key": "k2" }],
      ["POST", "/finance/funds/transfers/x1/reverse", undefined],
      ["POST", "/finance/intercompany-transfers", { "Idempotency-Key": "k3" }],
      ["POST", "/finance/intercompany-transfers/i1/reverse", undefined],
    ]);
  });
});

describe("mutasyon kancaları", () => {
  const transfer = {
    fromFundId: "f1",
    toFundId: "f2",
    money: { amount: "10", currency: "TRY" },
    date: "2026-11-14",
  };

  function keyOf(call: unknown[]): string {
    return (call[3] as Record<string, string>)["Idempotency-Key"];
  }

  it("anahtar hatada aynı kalır, başarıda yenilenir; ['finance'] geçersizlenir", async () => {
    const { Wrapper, client } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    const { result } = renderHook(() => api.useCreateTransfer({ onSuccess }), {
      wrapper: Wrapper,
    });
    apiRequest.mockRejectedValueOnce(new Error("409"));
    await act(async () => {
      await result.current.mutateAsync(transfer).catch(() => undefined);
    });
    apiRequest.mockResolvedValueOnce({ id: "x1" });
    await act(async () => {
      await result.current.mutateAsync(transfer);
    });
    apiRequest.mockResolvedValueOnce({ id: "x2" });
    await act(async () => {
      await result.current.mutateAsync(transfer);
    });
    const keys = apiRequest.mock.calls.map(keyOf);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
  });

  it("resetIdempotencyKey anahtarı elle yeniler", async () => {
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => api.useCreateIntercompany(), { wrapper: Wrapper });
    apiRequest.mockRejectedValue(new Error("x"));
    const body = { ...transfer, transferType: "EFT" as const, reasonType: "LOAN_GIVEN" as const };
    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined);
    });
    act(() => result.current.resetIdempotencyKey());
    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined);
    });
    const keys = apiRequest.mock.calls.map(keyOf);
    expect(keys[1]).not.toBe(keys[0]);
    expect(apiRequest.mock.calls[0][1]).toBe("/finance/intercompany-transfers");
  });

  it("diğer mutasyonlar doğru uca gider", async () => {
    apiRequest.mockResolvedValue({});
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => ({
        create: api.useCreateFund(),
        update: api.useUpdateFund(),
        active: api.useSetFundActive(),
        remove: api.useDeleteFund(),
        replace: api.useReplaceTransfer(),
        reverse: api.useReverseTransfer(),
        reverseIc: api.useReverseIntercompany(),
      }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.create.mutateAsync({
        code: "K1",
        name: "Kasa",
        kind: "CASH",
        currency: "TRY",
        branchId: "b1",
        allowNegative: false,
      });
      await result.current.update.mutateAsync({ id: "f1", body: { name: "K", branchId: "b1" } });
      await result.current.active.mutateAsync({ id: "f1", active: true });
      await result.current.remove.mutateAsync("f1");
      await result.current.replace.mutateAsync({ id: "x1", body: { transfer } });
      await result.current.reverse.mutateAsync({ id: "x1", body: { date: "2026-11-14" } });
      await result.current.reverseIc.mutateAsync({ id: "i1", body: { date: "2026-11-14" } });
    });
    expect(paths()).toEqual([
      "POST /finance/funds",
      "PUT /finance/funds/f1",
      "PATCH /finance/funds/f1/active",
      "DELETE /finance/funds/f1",
      "POST /finance/funds/transfers/x1/replace",
      "POST /finance/funds/transfers/x1/reverse",
      "POST /finance/intercompany-transfers/i1/reverse",
    ]);
    expect(keyOf(apiRequest.mock.calls[4])).toMatch(/^[0-9a-f-]{36}$/);
  });
});
