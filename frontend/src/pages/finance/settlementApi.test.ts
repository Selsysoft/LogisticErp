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
import * as api from "./settlementApi";
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
    /page=/.test(path) ? emptyPage : [],
  );
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

afterEach(() => {
  cleanup();
});

describe("settlementListQuery", () => {
  it("boş alanlar yazılmaz; page/size her zaman (vars. 0 / 20)", () => {
    expect(api.settlementListQuery({}).toString()).toBe("page=0&size=20");
    expect(
      api
        .settlementListQuery({
          accountId: "",
          q: "  ",
          from: undefined,
          branchIds: [],
          methods: [],
          sort: [],
          companyId: null,
        })
        .toString(),
    ).toBe("page=0&size=20");
  });

  it("şirket: undefined → aktif, null → konsolide, açık değer korunur", () => {
    expect(api.settlementListQuery({}, "c1").get("companyId")).toBe("c1");
    expect(api.settlementListQuery({ companyId: null }, "c1").has("companyId")).toBe(false);
    expect(api.settlementListQuery({ companyId: "c2" }, "c1").get("companyId")).toBe("c2");
  });

  it("çoklu alanlar tekrar eder; sıra sabit; boolean yazılır", () => {
    const query = api.settlementListQuery(
      {
        companyId: "c1",
        accountId: "a1",
        accountType: "SUPPLIER",
        subGroup: "320",
        branchIds: ["b1", "b2"],
        fundAccountIds: ["f1", "f2"],
        methods: ["CASH", "CREDIT_CARD", "NOTE"],
        status: "POSTED",
        from: "2026-11-08",
        to: "2026-11-15",
        q: "fatura 12",
        counterpartyBankAccountId: "cb1",
        hasAccount: true,
        page: 3,
        size: 25,
        sort: ["settlementDate,desc", "amount,asc"],
      },
      "ignored",
    );
    expect(query.getAll("branchIds")).toEqual(["b1", "b2"]);
    expect(query.getAll("fundAccountIds")).toEqual(["f1", "f2"]);
    expect(query.getAll("method")).toEqual(["CASH", "CREDIT_CARD", "NOTE"]);
    expect(query.getAll("sort")).toEqual(["settlementDate,desc", "amount,asc"]);
    expect([...query.keys()].filter((k, i, all) => all.indexOf(k) === i)).toEqual([
      "companyId",
      "accountId",
      "accountType",
      "subGroup",
      "branchIds",
      "fundAccountIds",
      "method",
      "status",
      "from",
      "to",
      "q",
      "counterpartyBankAccountId",
      "hasAccount",
      "page",
      "size",
      "sort",
    ]);
    expect(query.get("hasAccount")).toBe("true");
    expect(query.get("page")).toBe("3");
    expect(query.get("size")).toBe("25");
    expect(api.settlementListQuery({ hasAccount: false }).get("hasAccount")).toBe("false");
  });

  it("kodlama: arama metni ve virgüllü sıralama URL-güvenli", () => {
    const text = api.settlementListQuery({ q: "a&b=c ş%", sort: ["accountName,asc"] }).toString();
    expect(text).toBe("q=a%26b%3Dc+%C5%9F%25&page=0&size=20&sort=accountName%2Casc");
    expect(new URLSearchParams(text).get("q")).toBe("a&b=c ş%");
  });

  it("sayfa boyutu 1–500'e kırpılır; geçersiz sayfa 0", () => {
    expect(api.settlementPageSize(undefined)).toBe(20);
    expect(api.settlementPageSize(Number.NaN)).toBe(20);
    expect(api.settlementPageSize(0)).toBe(1);
    expect(api.settlementPageSize(10.7)).toBe(10);
    expect(api.settlementPageSize(501)).toBe(500);
    expect(api.settlementPageSize(-1)).toBe(1);
    expect(api.settlementListQuery({ page: -2 }).get("page")).toBe("0");
    expect(api.settlementListQuery({ page: Number.NaN }).get("page")).toBe("0");
    expect(api.settlementListQuery({ page: 2.9, size: 1000 }).toString()).toBe("page=2&size=500");
  });
});

describe("yollar", () => {
  it("liste, detay, düzeltme, iptal", () => {
    expect(api.settlementListPath("PAYMENT", {})).toBe("/finance/payments?page=0&size=20");
    expect(api.settlementListPath("COLLECTION", { from: "2026-11-01" }, "c1")).toBe(
      "/finance/collections?companyId=c1&from=2026-11-01&page=0&size=20",
    );
    expect(api.settlementListBase("PAYMENT")).toBe("/finance/payments");
    expect(api.settlementDetailPath("s/1")).toBe("/finance/settlements/s%2F1");
    expect(api.correctSettlementPath("s1")).toBe("/finance/settlements/s1/correct");
    expect(api.reverseSettlementPath("s1")).toBe("/finance/settlements/s1/reverse");
  });

  it("açık faturalar: zorunlu alanlar ve hariç tutulan kayıt", () => {
    const params = {
      type: "COLLECTION" as const,
      accountId: "a1",
      branchId: "b1",
      currency: "USD",
    };
    expect(api.openInvoicesReady(params)).toBe(true);
    expect(api.openInvoicesReady(null)).toBe(false);
    expect(api.openInvoicesReady({ ...params, accountId: "" })).toBe(false);
    expect(api.openInvoicesReady({ ...params, branchId: "" })).toBe(false);
    expect(api.openInvoicesReady({ ...params, currency: "" })).toBe(false);
    expect(api.openInvoicesPath(params)).toBe(
      "/finance/settlements/open-invoices?type=COLLECTION&accountId=a1&branchId=b1&currency=USD",
    );
    expect(api.openInvoicesPath({ ...params, excludeSettlementId: "s1" })).toBe(
      "/finance/settlements/open-invoices?type=COLLECTION&accountId=a1&branchId=b1&currency=USD&excludeSettlementId=s1",
    );
  });

  it("günlük rapor: mevcut + 12.2a süzgeçleri; şirket kuralı", () => {
    expect(api.dailyReportPath({ type: "PAYMENT", date: "2026-11-15" })).toBe(
      "/finance/reports/daily?type=PAYMENT&date=2026-11-15",
    );
    expect(
      api.dailyReportPath(
        {
          type: "COLLECTION",
          date: "2026-11-15",
          branchIds: ["b1", "b2"],
          fundAccountIds: ["f1"],
          currency: "EUR",
          methods: ["BANK", "CHECK"],
          sort: "TIME_DESC",
        },
        "c1",
      ),
    ).toBe(
      "/finance/reports/daily?type=COLLECTION&date=2026-11-15&branchIds=b1&branchIds=b2&companyId=c1&fundAccountIds=f1&currency=EUR&method=BANK&method=CHECK&sort=TIME_DESC",
    );
    expect(api.dailyReportPath({ type: "PAYMENT", date: "d", companyId: null }, "c1")).toBe(
      "/finance/reports/daily?type=PAYMENT&date=d",
    );
  });

  it("cari planları ve ciro edilebilir çekler", () => {
    expect(api.accountPlansPath("a1", api.OPEN_PLAN_STATUSES)).toBe(
      "/finance/payment-plans?accountId=a1&statuses=DRAFT&statuses=PENDING&statuses=APPROVED&statuses=REJECTED&page=0&size=50&sort=dueDate",
    );
    expect(api.endorsableChecksPath("c1")).toBe(
      "/finance/instruments?status=PORTFOLIO&direction=RECEIVED&kind=CHECK&companyId=c1&page=0&size=200&sort=dueDate",
    );
    expect(api.endorsableChecksPath(null)).toBe(
      "/finance/instruments?status=PORTFOLIO&direction=RECEIVED&kind=CHECK&page=0&size=200&sort=dueDate",
    );
  });
});

describe("sorgu anahtarları", () => {
  it("hepsi ['finance', 'settlement-center', …] önekli; MUI ve fon merkeziyle çakışmaz", () => {
    const keys: ReadonlyArray<readonly unknown[]> = [
      api.settlementKeys.all,
      api.settlementKeys.list("PAYMENT", { companyId: null }),
      api.settlementKeys.detail("s1"),
      api.settlementKeys.openInvoices({
        type: "PAYMENT",
        accountId: "a",
        branchId: "b",
        currency: "TRY",
      }),
      api.settlementKeys.daily({ type: "PAYMENT", date: "d", companyId: null }),
      api.settlementKeys.plans({ accountId: "a", statuses: ["DRAFT"] }),
      api.settlementKeys.endorsable({ companyId: "c", currency: null }),
    ];
    for (const key of keys) {
      expect(key.slice(0, 2)).toEqual(["finance", "settlement-center"]);
    }
    expect(api.settlementKeys.all).toEqual(["finance", "settlement-center"]);
  });

  it("kararlı: aynı girdi aynı anahtar, tür ve sorgu ayrıştırır", () => {
    const q = { companyId: "c1", from: "a", to: "b", page: 0, size: 10 };
    expect(api.settlementKeys.list("PAYMENT", q)).toEqual(
      api.settlementKeys.list("PAYMENT", { ...q }),
    );
    expect(api.settlementKeys.list("PAYMENT", q)).not.toEqual(
      api.settlementKeys.list("COLLECTION", q),
    );
    expect(api.settlementKeys.list("PAYMENT", q)).not.toEqual(
      api.settlementKeys.list("PAYMENT", { ...q, page: 1 }),
    );
    expect(api.settlementKeys.detail("s1")).toEqual([
      "finance",
      "settlement-center",
      "detail",
      "s1",
    ]);
  });
});

describe("okuma kancaları", () => {
  it("liste: aktif şirket anahtara ve sorguya girer; eski sayfa korunur", async () => {
    useCompanyStore.setState({ activeCompanyId: "c1" } as never);
    const { Wrapper, client } = wrapper();
    const { result } = renderHook(
      () => api.useSettlementList("PAYMENT", { status: "POSTED", hasAccount: true, size: 10 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual([
      "GET /finance/payments?companyId=c1&status=POSTED&hasAccount=true&page=0&size=10",
    ]);
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(
      api.settlementKeys.list("PAYMENT", {
        status: "POSTED",
        hasAccount: true,
        size: 10,
        companyId: "c1",
      }),
    );
  });

  it("konsolide liste şirketsiz; enabled:false istek atmaz", async () => {
    useCompanyStore.setState({ activeCompanyId: "c1" } as never);
    const { Wrapper } = wrapper();
    renderHook(() => api.useSettlementList("COLLECTION", {}, { enabled: false }), {
      wrapper: Wrapper,
    });
    const { result } = renderHook(() => api.useSettlementList("COLLECTION", { companyId: null }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(paths()).toEqual(["GET /finance/collections?page=0&size=20"]);
  });

  it("detay, açık faturalar, günlük rapor, planlar doğru uca gider", async () => {
    useCompanyStore.setState({ activeCompanyId: "c9" } as never);
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => ({
        detail: api.useSettlement("s1"),
        invoices: api.useOpenInvoices({
          type: "PAYMENT",
          accountId: "a1",
          branchId: "b1",
          currency: "TRY",
        }),
        daily: api.useDailyReport({ type: "PAYMENT", date: "2026-11-15" }),
        plans: api.useAccountPlans("a1"),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.detail.isSuccess).toBe(true);
      expect(result.current.invoices.isSuccess).toBe(true);
      expect(result.current.daily.isSuccess).toBe(true);
      expect(result.current.plans.isSuccess).toBe(true);
    });
    expect(paths().sort()).toEqual(
      [
        "GET /finance/settlements/s1",
        "GET /finance/settlements/open-invoices?type=PAYMENT&accountId=a1&branchId=b1&currency=TRY",
        "GET /finance/reports/daily?type=PAYMENT&date=2026-11-15&companyId=c9",
        "GET /finance/payment-plans?accountId=a1&statuses=DRAFT&statuses=PENDING&statuses=APPROVED&statuses=REJECTED&page=0&size=50&sort=dueDate",
      ].sort(),
    );
  });

  it("eksik girdide istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(
      () => {
        api.useSettlement(undefined);
        api.useSettlement("s1", { enabled: false });
        api.useOpenInvoices(null);
        api.useOpenInvoices({ type: "PAYMENT", accountId: "a", branchId: "", currency: "TRY" });
        api.useOpenInvoices(
          { type: "PAYMENT", accountId: "a", branchId: "b", currency: "TRY" },
          { enabled: false },
        );
        api.useDailyReport({ type: "PAYMENT", date: "" });
        api.useAccountPlans(null);
        return api.useEndorsableChecks("c1", "TRY", { enabled: false });
      },
      { wrapper: Wrapper },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("ciro edilebilir çekler: şirketle istenir, para birimi istemcide süzülür", async () => {
    apiRequest.mockResolvedValue({
      ...emptyPage,
      content: [
        { id: "i1", money: { amount: "10.00", currency: "TRY" } },
        { id: "i2", money: { amount: "5.00", currency: "USD" } },
      ],
    });
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => ({ usd: api.useEndorsableChecks("c1", "USD"), all: api.useEndorsableChecks("c1") }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.usd.isSuccess).toBe(true);
      expect(result.current.all.isSuccess).toBe(true);
    });
    expect(result.current.usd.data?.map((i) => i.id)).toEqual(["i2"]);
    expect(result.current.all.data?.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(new Set(paths())).toEqual(
      new Set([
        "GET /finance/instruments?status=PORTFOLIO&direction=RECEIVED&kind=CHECK&companyId=c1&page=0&size=200&sort=dueDate",
      ]),
    );
  });
});

describe("fetchAllSettlements (Excel, en çok 4 × 500)", () => {
  function pageOf(page: number, count: number, totalElements: number) {
    return {
      content: Array.from({ length: count }, (_, i) => ({ id: `p${page}-${i}` })),
      page,
      size: 500,
      totalElements,
      totalPages: Math.ceil(totalElements / 500),
    };
  }

  it("tek sayfa: bir istek; size=500 ve süzgeçler korunur", async () => {
    apiRequest.mockResolvedValueOnce(pageOf(0, 3, 3));
    const result = await api.fetchAllSettlements(
      "PAYMENT",
      { from: "a", to: "b", status: "POSTED", hasAccount: true, page: 7, size: 10 },
      "c1",
    );
    expect(result.content).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.totalElements).toBe(3);
    expect(paths()).toEqual([
      "GET /finance/payments?companyId=c1&status=POSTED&from=a&to=b&hasAccount=true&page=0&size=500",
    ]);
  });

  it("sayfalar sırayla istenir; 4 sayfada (2000 satır) durur, fazlası truncated", async () => {
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return pageOf(page, 500, 2600);
    });
    const result = await api.fetchAllSettlements("COLLECTION", { sort: ["amount,desc"] });
    expect(apiRequest).toHaveBeenCalledTimes(api.SETTLEMENT_EXPORT_MAX_PAGES);
    expect(result.content).toHaveLength(2000);
    expect(result.content[1999]).toEqual({ id: "p3-499" });
    expect(result.totalElements).toBe(2600);
    expect(result.truncated).toBe(true);
    expect(paths().map((p) => new URLSearchParams(p.split("?")[1]).get("page"))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(paths().every((p) => p.includes("size=500") && p.includes("sort=amount%2Cdesc"))).toBe(
      true,
    );
  });

  it("son sayfa eksik dönerse durur (toplam değişmiş olsa da)", async () => {
    apiRequest
      .mockResolvedValueOnce(pageOf(0, 500, 1200))
      .mockResolvedValueOnce(pageOf(1, 120, 1200));
    const result = await api.fetchAllSettlements("PAYMENT", {});
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(result.content).toHaveLength(620);
    expect(result.truncated).toBe(true);
  });

  it("boş sonuç", async () => {
    apiRequest.mockResolvedValueOnce(emptyPage);
    const result = await api.fetchAllSettlements("PAYMENT", {});
    expect(result).toEqual({ content: [], totalElements: 0, truncated: false });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe("yazma", () => {
  const body: SettlementBody = {
    method: "BANK",
    channel: "CREDIT_CARD",
    accountId: "a1",
    branchId: "b1",
    fundAccountId: "f1",
    money: { amount: "150.00", currency: "TRY" },
    date: "2026-11-15",
    allocations: [{ targetType: "PURCHASE_INVOICE", targetId: "i1", amount: "100.00" }],
  };

  it("kayıt, düzeltme ve iptal uçları; Idempotency-Key başlığı", async () => {
    apiRequest.mockResolvedValue({ id: "s2" });
    await api.createSettlement("PAYMENT", body, "k1");
    await api.createSettlement("COLLECTION", body);
    await api.correctSettlement("s1", { reason: "tutar", replacement: body }, "k2");
    await api.reverseSettlement("s1", { date: "2026-11-15", description: "hata" });
    expect(apiRequest.mock.calls).toEqual([
      ["POST", "/finance/payments", body, { "Idempotency-Key": "k1" }],
      ["POST", "/finance/collections", body, undefined],
      [
        "POST",
        "/finance/settlements/s1/correct",
        { reason: "tutar", replacement: body },
        { "Idempotency-Key": "k2" },
      ],
      ["POST", "/finance/settlements/s1/reverse", { date: "2026-11-15", description: "hata" }],
    ]);
  });

  it("mutasyonlar aynı anahtarı taşır (409 onayı) ve ['finance']'ı geçersizler", async () => {
    apiRequest.mockResolvedValue({ id: "s2" });
    const { Wrapper, client } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => ({
        create: api.useCreateSettlement("PAYMENT", { onSuccess }),
        correct: api.useCorrectSettlement(),
        reverse: api.useReverseSettlement(),
      }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.create.mutateAsync({ body, idempotencyKey: "key-1" });
      await result.current.create.mutateAsync({
        body: { ...body, confirmWarnings: true },
        idempotencyKey: "key-1",
      });
      await result.current.correct.mutateAsync({
        id: "s1",
        body: { replacement: body },
        idempotencyKey: "key-2",
      });
      await result.current.reverse.mutateAsync({ id: "s1", body: { date: "2026-11-15" } });
    });
    expect(apiRequest.mock.calls.map((c) => [c[1], c[3]])).toEqual([
      ["/finance/payments", { "Idempotency-Key": "key-1" }],
      ["/finance/payments", { "Idempotency-Key": "key-1" }],
      ["/finance/settlements/s1/correct", { "Idempotency-Key": "key-2" }],
      ["/finance/settlements/s1/reverse", undefined],
    ]);
    expect((apiRequest.mock.calls[1][2] as SettlementBody).confirmWarnings).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
  });
});
