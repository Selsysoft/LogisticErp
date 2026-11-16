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
import * as api from "./reportApi";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, Wrapper };
}

function paths(): string[] {
  return apiRequest.mock.calls.map((call) => `${call[0]} ${call[1]}`);
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({});
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

afterEach(() => {
  cleanup();
});

describe("yol yardımcıları", () => {
  it("yaşlandırma: zorunlular, tekrarlı subGroups/branchIds, şirket çözümü", () => {
    expect(api.agingPath({ type: "RECEIVABLE", asOf: "2026-11-16" })).toBe(
      "/finance/reports/aging?type=RECEIVABLE&asOf=2026-11-16",
    );
    expect(
      api.agingPath(
        {
          type: "PAYABLE",
          asOf: "2026-11-16",
          excludeIntercompany: false,
          basis: "DUE",
          accountId: "a1",
          subGroups: ["CUSTOMER", "SUPPLIER"],
          branchIds: ["b1", "b2"],
        },
        "c1",
      ),
    ).toBe(
      "/finance/reports/aging?type=PAYABLE&asOf=2026-11-16&companyId=c1&excludeIntercompany=false" +
        "&basis=DUE&accountId=a1&subGroups=CUSTOMER&subGroups=SUPPLIER&branchIds=b1&branchIds=b2",
    );
    // null → konsolide (aktif şirket yok sayılır).
    expect(api.agingPath({ type: "RECEIVABLE", asOf: "2026-11-16", companyId: null }, "c1")).toBe(
      "/finance/reports/aging?type=RECEIVABLE&asOf=2026-11-16",
    );
  });

  it("FinanceReport genel bakış, liste ve yöntem kırılımı", () => {
    expect(api.ledgerSummaryPath({})).toBe("/finance/reports/ledger-summary");
    expect(
      api.ledgerSummaryPath({ from: "2026-01-01", to: "2026-11-16", currency: "USD" }, "c1"),
    ).toBe(
      "/finance/reports/ledger-summary?from=2026-01-01&to=2026-11-16&currency=USD&companyId=c1",
    );
    expect(
      api.ledgerAccountsPath({ reportType: "SALES", accountId: "a 1", branchIds: ["w1"] }),
    ).toBe("/finance/reports/ledger-accounts?reportType=SALES&accountId=a%201&branchIds=w1");
    expect(api.accountMethodsPath({ accountId: "a1", from: "2026-01-01", companyId: "c2" })).toBe(
      "/finance/reports/account-methods?accountId=a1&from=2026-01-01&companyId=c2",
    );
  });

  it("bilanço, hazine, nakit akışı, performans, döviz pozisyonu", () => {
    expect(api.balanceSheetReportPath()).toBe("/finance/reports/balance-sheet");
    expect(api.balanceSheetReportPath({ asOf: "2026-11-16", branchIds: ["w1"] }, "c1")).toBe(
      "/finance/reports/balance-sheet?asOf=2026-11-16&companyId=c1&branchIds=w1",
    );
    expect(api.treasuryPath({ branchIds: ["w1", "w2"] })).toBe(
      "/finance/reports/treasury?branchIds=w1&branchIds=w2",
    );
    expect(api.cashFlowReportPath()).toBe("/finance/reports/cash-flow?weeks=8");
    expect(api.cashFlowReportPath({ weeks: 0, currency: "EUR" })).toBe(
      "/finance/reports/cash-flow?weeks=1&currency=EUR",
    );
    expect(api.cashFlowReportPath({ weeks: Number.NaN })).toBe(
      "/finance/reports/cash-flow?weeks=8",
    );
    expect(
      api.accountPerformancePath({
        from: "2026-10-01",
        to: "2026-10-31",
        subGroups: ["A", "B"],
      }),
    ).toBe(
      "/finance/reports/account-performance?from=2026-10-01&to=2026-10-31&subGroups=A&subGroups=B",
    );
    expect(api.currencyPositionPath()).toBe("/finance/reports/currency-position");
    expect(api.currencyPositionPath({ byCompany: true, companyId: "c1" })).toBe(
      "/finance/reports/currency-position?companyId=c1&byCompany=true",
    );
    expect(api.currencyPositionPath({ byCompany: false })).toBe(
      "/finance/reports/currency-position",
    );
  });

  it("kur farkı: page/size her zaman yazılır ve kırpılır (OK-12.8-22)", () => {
    expect(api.fxDifferencesPath()).toBe("/finance/reports/fx-differences?page=0&size=2000");
    expect(
      api.fxDifferencesPath(
        {
          accountId: "a1",
          currency: "USD",
          from: "2026-01-01",
          to: "2026-11-16",
          cutState: "OPEN",
          valuationDate: "2026-11-16",
          withRates: true,
          page: 3,
          size: 500,
        },
        "c1",
      ),
    ).toBe(
      "/finance/reports/fx-differences?companyId=c1&accountId=a1&currency=USD&from=2026-01-01" +
        "&to=2026-11-16&cutState=OPEN&valuationDate=2026-11-16&withRates=true&page=3&size=500",
    );
    expect(api.fxDifferencesPath({ page: -1, size: 0 })).toContain("page=0&size=1");
    expect(api.fxDifferencesPath({ page: 999_999, size: 99_999, withRates: false })).toBe(
      "/finance/reports/fx-differences?page=100000&size=2000",
    );
    expect(api.FX_REPORT_MAX_SIZE).toBe(2000);
    expect(api.FX_REPORT_MAX_PAGE).toBe(100_000);
  });

  it("kur uçları", () => {
    expect(api.exchangeRatesPath("2026-11-16")).toBe("/finance/exchange-rates?date=2026-11-16");
    expect(api.EXCHANGE_RATES_REFRESH_PATH).toBe("/finance/exchange-rates/refresh");
    expect(api.FX_DIFFERENCE_CREATE_PATH).toBe("/finance/fx-differences");
  });
});

describe("sorgu anahtarları", () => {
  it("hepsi ['finance','reports',<ad>,p] ve p companyId taşır", () => {
    const p = { companyId: "c1" };
    expect(api.financeReportKeys.all).toEqual(["finance", "reports"]);
    expect(api.financeReportKeys.treasury(p)).toEqual(["finance", "reports", "treasury", p]);
    expect(api.financeReportKeys.balanceSheet(p)).toEqual([
      "finance",
      "reports",
      "balanceSheet",
      p,
    ]);
    expect(api.financeReportKeys.fxDifferences({ companyId: null }).slice(0, 3)).toEqual([
      "finance",
      "reports",
      "fxDifferences",
    ]);
    for (const name of [
      "aging",
      "ledgerSummary",
      "ledgerAccounts",
      "accountMethods",
      "cashFlow",
      "accountPerformance",
      "currencyPosition",
    ] as const) {
      const key = (api.financeReportKeys[name] as (q: unknown) => readonly unknown[])(p);
      expect(key, name).toEqual(["finance", "reports", name, p]);
    }
    expect(api.exchangeRateKeys.byDate("2026-11-16")).toEqual(["finance", "rates", "2026-11-16"]);
  });
});

describe("kancalar", () => {
  it("rapor kancası aktif şirketi çözer, anahtara ve yola yazar", async () => {
    useCompanyStore.setState({ activeCompanyId: "c9" } as never);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => api.useTreasuryReport({ branchIds: ["w1"] }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual(["GET /finance/reports/treasury?companyId=c9&branchIds=w1"]);
    expect(
      client.getQueryCache().find({
        queryKey: ["finance", "reports", "treasury", { branchIds: ["w1"], companyId: "c9" }],
      }),
    ).toBeTruthy();
  });

  it("enabled false ya da zorunlu alan boşken istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(() => api.useTreasuryReport({}, { enabled: false }), { wrapper: Wrapper });
    renderHook(() => api.useAgingReport({ type: "RECEIVABLE", asOf: "" }), { wrapper: Wrapper });
    renderHook(() => api.useAccountPerformance({ from: "", to: "2026-11-16" }), {
      wrapper: Wrapper,
    });
    renderHook(() => api.useAccountMethods({ accountId: "" }), { wrapper: Wrapper });
    renderHook(() => api.useExchangeRates(""), { wrapper: Wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("diğer okuma kancaları doğru uca gider", async () => {
    const { Wrapper } = wrapper();
    const hooks: Array<() => { isSuccess: boolean }> = [
      () => api.useAgingReport({ type: "PAYABLE", asOf: "2026-11-16", companyId: null }),
      () => api.useLedgerSummary({ companyId: null }),
      () => api.useLedgerAccounts({ reportType: "OTHER", companyId: null }),
      () => api.useAccountMethods({ accountId: "a1", companyId: null }),
      () => api.useBalanceSheet({ companyId: null }),
      () => api.useCashFlow({ companyId: null }),
      () => api.useAccountPerformance({ from: "2026-10-01", to: "2026-10-31", companyId: null }),
      () => api.useCurrencyPosition({ companyId: null }),
      () => api.useFxDifferenceReport({ companyId: null }),
      () => api.useExchangeRates("2026-11-16"),
    ];
    for (const hook of hooks) {
      const { result } = renderHook(hook, { wrapper: Wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    }
    expect(paths()).toEqual([
      "GET /finance/reports/aging?type=PAYABLE&asOf=2026-11-16",
      "GET /finance/reports/ledger-summary",
      "GET /finance/reports/ledger-accounts?reportType=OTHER",
      "GET /finance/reports/account-methods?accountId=a1",
      "GET /finance/reports/balance-sheet",
      "GET /finance/reports/cash-flow?weeks=8",
      "GET /finance/reports/account-performance?from=2026-10-01&to=2026-10-31",
      "GET /finance/reports/currency-position",
      "GET /finance/reports/fx-differences?page=0&size=2000",
      "GET /finance/exchange-rates?date=2026-11-16",
    ]);
  });

  it("useCreateFxDifference: Idempotency-Key başlığı ve geçersizleme listesi", async () => {
    apiRequest.mockResolvedValue({ id: "d1" });
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    const { result } = renderHook(() => api.useCreateFxDifference({ onSuccess }), {
      wrapper: Wrapper,
    });
    const body = {
      sourceTransactionId: "t1",
      valuationDate: "2026-11-16",
      expectedDifference: "-12.50",
    };
    await act(async () => {
      await result.current.mutateAsync({ body, idempotencyKey: "k-1" });
    });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/finance/fx-differences", body, {
      "Idempotency-Key": "k-1",
    });
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual([...api.FX_DIFFERENCE_INVALIDATES]);
    expect(keys).toContainEqual(["finance", "reports"]);
    expect(keys).toContainEqual(["finance", "account-statement"]);
    expect(keys).toContainEqual(["finance", "account-transactions"]);
    expect(keys).toContainEqual(["finance", "account-balances"]);
    expect(keys).toContainEqual(["finance", "account-document"]);
    expect(keys).toContainEqual(["finance", "account-documents"]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("useCreateFxDifference: hata sonrası geçersizleme yok", async () => {
    apiRequest.mockRejectedValue(new Error("409"));
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => api.useCreateFxDifference(), { wrapper: Wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({
          body: { sourceTransactionId: "t1", valuationDate: "2026-11-16", expectedDifference: "1" },
          idempotencyKey: "k-1",
        })
        .catch(() => undefined);
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("useRefreshRates: POST, kur ve rapor anahtarları geçersizlenir", async () => {
    apiRequest.mockResolvedValue(undefined);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => api.useRefreshRates(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(paths()).toEqual(["POST /finance/exchange-rates/refresh"]);
    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual([
      ["finance", "rates"],
      ["finance", "reports"],
    ]);
  });
});

describe("kesim Idempotency-Key kaydı (§5.2)", () => {
  it("satır + değerleme tarihi başına sabit; hata sonrası korunur, başarıda bırakılır", () => {
    let n = 0;
    const registry = api.createFxCutKeyRegistry(() => `k${++n}`);
    expect(api.fxCutKeyId("t1", "2026-11-16")).toBe("t1|2026-11-16");
    const first = registry.keyFor("t1", "2026-11-16");
    expect(first).toBe("k1");
    // Hata sonrası yeniden deneme: aynı anahtar.
    expect(registry.keyFor("t1", "2026-11-16")).toBe("k1");
    // Başka tarih ya da satır: yeni anahtar.
    expect(registry.keyFor("t1", "2026-11-15")).toBe("k2");
    expect(registry.keyFor("t2", "2026-11-16")).toBe("k3");
    registry.release("t1", "2026-11-16");
    expect(registry.keyFor("t1", "2026-11-16")).toBe("k4");
  });

  it("varsayılan üretici UUID verir", () => {
    const key = api.createFxCutKeyRegistry().keyFor("t1", "2026-11-16");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
