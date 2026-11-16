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
import * as api from "./subcontractApi";
import type { SaveSubcontractCostRequest } from "./types";

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
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

afterEach(() => cleanup());

describe("sorgu yolları", () => {
  it("özet: days 1–365 (vars. 150), şirket ve iş yerleri", () => {
    expect(api.subcontractSummaryPath()).toBe("/shipment/subcontract-costs/summary?days=150");
    expect(api.subcontractSummaryPath({ days: 90, branchIds: ["b1", "b2"] }, "c1")).toBe(
      "/shipment/subcontract-costs/summary?days=90&companyId=c1&branchIds=b1&branchIds=b2",
    );
    expect(api.subcontractSummaryPath({ days: 0, companyId: null }, "c1")).toBe(
      "/shipment/subcontract-costs/summary?days=1",
    );
    expect(api.subcontractDays(9999)).toBe(365);
    expect(api.subcontractDays(Number.NaN)).toBe(150);
    expect(api.subcontractDays(null)).toBe(150);
  });

  it("detay, kaydet, ters kayıt ve silme yolları; kimlik kodlanır", () => {
    expect(api.subcontractDetailPath("a 1", { days: 30 }, "c1")).toBe(
      "/shipment/subcontract-costs?carrierAccountId=a%201&days=30&companyId=c1",
    );
    expect(api.subcontractCostSavePath("s1", "l/1")).toBe(
      "/shipment/shipments/s1/legs/l%2F1/subcontract-cost",
    );
    expect(api.subcontractCostReversePath("c1")).toBe("/shipment/subcontract-costs/c1/reverse");
    expect(api.subcontractCostDeletePath("c1")).toBe("/shipment/subcontract-costs/c1");
  });

  it("anahtarlar ['shipment', 'subcontract-costs'] önekli", () => {
    const q = { days: 150, companyId: null, branchIds: null };
    expect(api.subcontractKeys.summary(q)).toEqual(["shipment", "subcontract-costs", "summary", q]);
    expect(api.subcontractKeys.detail("a1", q)).toEqual([
      "shipment",
      "subcontract-costs",
      "detail",
      "a1",
      q,
    ]);
  });
});

describe("kancalar", () => {
  it("özet aktif şirketle; detay hesap yokken istek atmaz", async () => {
    useCompanyStore.setState({ activeCompanyId: "c9" } as never);
    apiRequest.mockResolvedValue({ carriers: [], rows: [] });
    const { Wrapper } = wrapper();
    const summary = renderHook(() => api.useSubcontractSummary({ branchIds: [] }), {
      wrapper: Wrapper,
    });
    renderHook(() => api.useSubcontractDetail(undefined), { wrapper: Wrapper });
    const detail = renderHook(() => api.useSubcontractDetail("a1", { days: 60 }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    expect(paths().sort()).toEqual([
      "GET /shipment/subcontract-costs/summary?days=150&companyId=c9",
      "GET /shipment/subcontract-costs?carrierAccountId=a1&days=60&companyId=c9",
    ]);
  });
});

describe("mutasyonlar", () => {
  it("kaydet (PUT), ters kayıt (POST), sil (DELETE); ['shipment'] ve ['finance'] geçersizlenir", async () => {
    apiRequest.mockResolvedValue(undefined);
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    const save = renderHook(() => api.useSaveSubcontractCost({ onSuccess }), {
      wrapper: Wrapper,
    });
    const reverse = renderHook(() => api.useReverseSubcontractCost(), { wrapper: Wrapper });
    const remove = renderHook(() => api.useDeleteSubcontractCost(), { wrapper: Wrapper });
    const body: SaveSubcontractCostRequest = {
      money: { amount: "1000.00", currency: "TRY" },
      vatAmount: "200.00",
      withholdingAmount: "40.00",
      deductionAmount: "10.00",
      documentNo: "A-1",
      documentType: "ALIS_FATURASI",
      costDate: "2026-11-16",
    };
    await act(async () => {
      await save.result.current.mutateAsync({ shipmentId: "s1", legId: "l1", body });
      await reverse.result.current.mutateAsync({
        costId: "c1",
        body: { date: "2026-11-16", reason: "Hatalı" },
      });
      await remove.result.current.mutateAsync("c2");
    });
    expect(apiRequest.mock.calls).toEqual([
      ["PUT", "/shipment/shipments/s1/legs/l1/subcontract-cost", body],
      ["POST", "/shipment/subcontract-costs/c1/reverse", { date: "2026-11-16", reason: "Hatalı" }],
      ["DELETE", "/shipment/subcontract-costs/c2"],
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shipment"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
    expect(invalidate).toHaveBeenCalledTimes(6);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
