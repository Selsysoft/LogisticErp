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
import * as api from "./instrumentApi";

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

function pageOf(page: number, count: number, totalElements: number, size: number) {
  return {
    content: Array.from({ length: count }, (_, i) => ({ id: `p${page}-${i}` })),
    page,
    size,
    totalElements,
    totalPages: Math.ceil(totalElements / size),
  };
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

describe("sorgu yolları", () => {
  it("liste: boş alan yazılmaz, çoklu alan tekrar eder, page/size her zaman", () => {
    expect(api.instrumentListPath({})).toBe("/finance/instruments?page=0&size=50");
    expect(
      api.instrumentListPath(
        {
          kind: "CHECK",
          direction: "RECEIVED",
          statuses: ["PORTFOLIO", "AT_BANK"],
          accountId: "a1",
          dueFrom: "2026-11-01",
          dueTo: "2026-12-01",
          checkBookId: "",
          noteType: undefined,
          endorsable: true,
          q: "  akb ",
          branchIds: ["b1", "b2"],
          page: 2,
          size: 9999,
        },
        "c1",
      ),
    ).toBe(
      "/finance/instruments?kind=CHECK&direction=RECEIVED&status=PORTFOLIO&status=AT_BANK&accountId=a1&dueFrom=2026-11-01&dueTo=2026-12-01&endorsable=true&q=akb&companyId=c1&branchIds=b1&branchIds=b2&page=2&size=500",
    );
    // null → konsolide (companyId yazılmaz); açık değer aktif şirketi ezer.
    expect(api.instrumentListPath({ companyId: null, noteType: "BOND" }, "c1")).toBe(
      "/finance/instruments?noteType=BOND&page=0&size=50",
    );
    expect(api.instrumentListPath({ companyId: "c2", size: 0, page: -3 }, "c1")).toBe(
      "/finance/instruments?companyId=c2&page=0&size=1",
    );
    expect(api.instrumentPageSize(Number.NaN)).toBe(50);
  });

  it("tekil, hareket, geçiş, emanet, numara, koçan ve yaprak yolları", () => {
    expect(api.instrumentDetailPath("i/1")).toBe("/finance/instruments/i%2F1");
    expect(api.instrumentMovementsPath("i1")).toBe("/finance/instruments/i1/movements");
    expect(api.instrumentTransitionPath("i1")).toBe("/finance/instruments/i1/transition");
    expect(api.instrumentCustodyPath("i1")).toBe("/finance/instruments/i1/custody");
    expect(
      api.checkNumberPath({ direction: "ISSUED", number: " 0012345 ", excludeId: "x" }, "c1"),
    ).toBe(
      "/finance/instruments/check-number?companyId=c1&kind=CHECK&direction=ISSUED&number=0012345&excludeId=x",
    );
    expect(api.checkBookListPath({ fundAccountId: "f1", branchIds: ["b1"] }, "c1")).toBe(
      "/finance/check-books?fundAccountId=f1&companyId=c1&branchIds=b1",
    );
    expect(api.checkLeafListPath({ status: "UNUSED", serial: " A ", size: 5000 })).toBe(
      "/finance/check-leaves?status=UNUSED&serial=A&page=0&size=1000",
    );
    expect(api.checkLeafListPath({ size: 0 })).toBe("/finance/check-leaves?page=0&size=1");
    expect(api.checkLeafLookupPath("001", "", "c1")).toBe(
      "/finance/check-leaves/lookup?number=001&companyId=c1",
    );
    expect(api.checkLeafVoidPath("l1")).toBe("/finance/check-leaves/l1/void");
    expect(api.checkLeafPath("l1")).toBe("/finance/check-leaves/l1");
  });

  it("yaprak araması 3–7 rakamda etkin", () => {
    expect(api.leafLookupReady("12")).toBe(false);
    expect(api.leafLookupReady("012")).toBe(true);
    expect(api.leafLookupReady(" 1234567 ")).toBe(true);
    expect(api.leafLookupReady("12345678")).toBe(false);
    expect(api.leafLookupReady("12a")).toBe(false);
    expect(api.leafLookupReady(null)).toBe(false);
  });

  it("anahtarlar MUI önekiyle çakışmaz", () => {
    expect(api.instrumentKeys.all).toEqual(["finance", "instrument-center"]);
    expect(api.instrumentKeys.detail("i1")).toEqual([
      "finance",
      "instrument-center",
      "detail",
      "i1",
    ]);
    expect(api.instrumentKeys.movements("i1")[2]).toBe("movements");
    expect(api.instrumentKeys.list({ companyId: null })[2]).toBe("list");
    expect(
      api.instrumentKeys.leafLookup({ number: "123", fundAccountId: null, companyId: null })[2],
    ).toBe("leaf-lookup");
  });
});

describe("fetchAllInstruments (istemci kipi, en çok 10 × 500)", () => {
  it("tek sayfa: bir istek; size=500 ve süzgeçler korunur", async () => {
    apiRequest.mockResolvedValueOnce(pageOf(0, 3, 3, 500));
    const result = await api.fetchAllInstruments({ kind: "NOTE", page: 7, size: 10 }, "c1");
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.totalElements).toBe(3);
    expect(paths()).toEqual(["GET /finance/instruments?kind=NOTE&companyId=c1&page=0&size=500"]);
  });

  it("10 sayfada (5.000 satır) durur, fazlası truncated", async () => {
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return pageOf(page, 500, 6200, 500);
    });
    const result = await api.fetchAllInstruments({});
    expect(apiRequest).toHaveBeenCalledTimes(api.INSTRUMENT_FETCH_MAX_PAGES);
    expect(result.rows).toHaveLength(5000);
    expect(result.rows[4999]).toEqual({ id: "p9-499" });
    expect(result.truncated).toBe(true);
  });

  it("toplam sayfa kadar istenir", async () => {
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return pageOf(page, 500, 1000, 500);
    });
    const result = await api.fetchAllInstruments({});
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(result.truncated).toBe(false);
  });
});

describe("fetchAllCheckLeaves (en çok 5 × 1000)", () => {
  it("5 sayfada durur", async () => {
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return pageOf(page, 1000, 9000, 1000);
    });
    const result = await api.fetchAllCheckLeaves({ fundAccountId: "f1" });
    expect(apiRequest).toHaveBeenCalledTimes(api.CHECK_LEAF_FETCH_MAX_PAGES);
    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
    expect(paths()[0]).toBe("GET /finance/check-leaves?fundAccountId=f1&page=0&size=1000");
  });
});

describe("kancalar", () => {
  it("useInstrumentList aktif şirketle çözülür", async () => {
    useCompanyStore.setState({ activeCompanyId: "c9" } as never);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => api.useInstrumentList({ kind: "CHECK" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ rows: [], totalElements: 0, truncated: false });
    expect(paths()).toEqual(["GET /finance/instruments?kind=CHECK&companyId=c9&page=0&size=500"]);
  });

  it("useInstrument / useInstrumentMovements: id yokken istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(() => api.useInstrument(null), { wrapper: Wrapper });
    renderHook(() => api.useInstrumentMovements(undefined), { wrapper: Wrapper });
    const detail = renderHook(() => api.useInstrument("i1"), { wrapper: Wrapper });
    const moves = renderHook(() => api.useInstrumentMovements("i1"), { wrapper: Wrapper });
    await waitFor(() => expect(detail.result.current.isFetched).toBe(true));
    await waitFor(() => expect(moves.result.current.isFetched).toBe(true));
    expect(paths().sort()).toEqual([
      "GET /finance/instruments/i1",
      "GET /finance/instruments/i1/movements",
    ]);
  });

  it("useCheckNumber: şirket ve numara olmadan istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(() => api.useCheckNumber({ direction: "ISSUED", number: "1234567" }), {
      wrapper: Wrapper,
    });
    renderHook(() => api.useCheckNumber({ companyId: "c1", direction: "ISSUED", number: " " }), {
      wrapper: Wrapper,
    });
    const ok = renderHook(
      () => api.useCheckNumber({ companyId: "c1", direction: "RECEIVED", number: "1234567" }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(ok.result.current.isFetched).toBe(true));
    expect(paths()).toEqual([
      "GET /finance/instruments/check-number?companyId=c1&kind=CHECK&direction=RECEIVED&number=1234567",
    ]);
  });

  it("useCheckBooks / useCheckLeaves / useCheckLeafLookup", async () => {
    useCompanyStore.setState({ activeCompanyId: "c1" } as never);
    const { Wrapper } = wrapper();
    const books = renderHook(() => api.useCheckBooks({ fundAccountId: "f1" }), {
      wrapper: Wrapper,
    });
    const leaves = renderHook(() => api.useCheckLeaves({ status: "UNUSED" }), { wrapper: Wrapper });
    renderHook(() => api.useCheckLeafLookup("12", "f1"), { wrapper: Wrapper });
    const lookup = renderHook(() => api.useCheckLeafLookup("123", "f1"), { wrapper: Wrapper });
    await waitFor(() => expect(books.result.current.isFetched).toBe(true));
    await waitFor(() => expect(leaves.result.current.isFetched).toBe(true));
    await waitFor(() => expect(lookup.result.current.isFetched).toBe(true));
    expect(paths().sort()).toEqual([
      "GET /finance/check-books?fundAccountId=f1&companyId=c1",
      "GET /finance/check-leaves/lookup?number=123&fundAccountId=f1&companyId=c1",
      "GET /finance/check-leaves?status=UNUSED&companyId=c1&page=0&size=1000",
    ]);
  });
});

describe("mutasyonlar", () => {
  it("doğru yöntem/yol/gövde; başarıda ['finance'] geçersizlenir", async () => {
    apiRequest.mockResolvedValue({});
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const transition = renderHook(() => api.useInstrumentTransition(), { wrapper: Wrapper });
    const update = renderHook(() => api.useUpdateInstrument(), { wrapper: Wrapper });
    const custody = renderHook(() => api.useMoveCustody(), { wrapper: Wrapper });
    const create = renderHook(() => api.useCreateCheckBook(), { wrapper: Wrapper });
    const voidLeaf = renderHook(() => api.useVoidCheckLeaf(), { wrapper: Wrapper });
    const remove = renderHook(() => api.useDeleteCheckLeaf(), { wrapper: Wrapper });
    await act(async () => {
      await transition.result.current.mutateAsync({
        id: "i1",
        body: { toStatus: "AT_BANK", date: "2026-11-16", fundAccountId: "f1" },
      });
      await update.result.current.mutateAsync({ id: "i1", body: { description: "x" } });
      await custody.result.current.mutateAsync({
        id: "i1",
        body: { custodyFundId: null, date: "2026-11-16" },
      });
      await create.result.current.mutateAsync({
        fundAccountId: "f1",
        serialNo: "A",
        startNumber: "0000001",
        endNumber: "0000010",
      });
      await voidLeaf.result.current.mutateAsync({ id: "l1" });
      await remove.result.current.mutateAsync("l2");
    });
    expect(apiRequest.mock.calls).toEqual([
      [
        "POST",
        "/finance/instruments/i1/transition",
        { toStatus: "AT_BANK", date: "2026-11-16", fundAccountId: "f1" },
      ],
      ["PATCH", "/finance/instruments/i1", { description: "x" }],
      ["PUT", "/finance/instruments/i1/custody", { custodyFundId: null, date: "2026-11-16" }],
      [
        "POST",
        "/finance/check-books",
        { fundAccountId: "f1", serialNo: "A", startNumber: "0000001", endNumber: "0000010" },
      ],
      ["POST", "/finance/check-leaves/l1/void", {}],
      ["DELETE", "/finance/check-leaves/l2"],
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
    expect(invalidate).toHaveBeenCalledTimes(6);
  });
});
