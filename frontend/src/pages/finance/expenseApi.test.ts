// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
const apiUpload = vi.fn();
vi.mock("../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiGet: (p: string) => apiRequest("GET", p),
  apiUpload: (...args: unknown[]) => apiUpload(...args),
}));

import { useCompanyStore } from "../../auth/companyStore";
import * as api from "./expenseApi";
import type { SaveExpenseRequest } from "./types";

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
  apiUpload.mockReset();
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const body: SaveExpenseRequest = {
  branchId: "b1",
  expenseItemId: "k1",
  contextType: "GENERAL",
  paymentMethod: "ACCOUNT",
  supplierAccountId: "a1",
  invoiceDate: "2026-11-16",
  documentType: "ALIS_FATURASI",
  department: "OPERATION",
  currency: "TRY",
  lines: [{ quantity: "1", unitPrice: "100.00", vatRate: "20" }],
};

describe("sorgu yolları", () => {
  it("liste: boş alan yazılmaz, branchIds tekrar eder, page/size her zaman, size 1–500", () => {
    expect(api.expenseListPath({})).toBe("/finance/expenses?page=0&size=50");
    expect(
      api.expenseListPath(
        {
          expenseItemId: "k 1",
          currency: " USD ",
          from: "2026-11-01",
          to: "2026-11-30",
          branchIds: ["b1", "b2"],
          page: 2,
          size: 9999,
        },
        "c1",
      ),
    ).toBe(
      "/finance/expenses?expenseItemId=k%201&currency=USD&from=2026-11-01&to=2026-11-30" +
        "&companyId=c1&branchIds=b1&branchIds=b2&page=2&size=500",
    );
    // Açık null → konsolide (aktif şirket yazılmaz); size 0 → 1; geçersiz → 50.
    expect(api.expenseListPath({ companyId: null, size: 0 }, "c1")).toBe(
      "/finance/expenses?page=0&size=1",
    );
    expect(api.expensePageSize(Number.NaN)).toBe(50);
  });

  it("özet, takvim (ay 1–12), aylık (1–24, vars. 6), bağlam seçenekleri", () => {
    expect(api.expenseSummaryPath({ from: "2026-01-01" }, "c1")).toBe(
      "/finance/expenses/summary?from=2026-01-01&companyId=c1",
    );
    expect(api.expenseCalendarDataPath({ year: 2026, month: 13, branchIds: ["b1"] })).toBe(
      "/finance/expenses/calendar?year=2026&month=12&branchIds=b1",
    );
    expect(api.expenseMonthlyPath()).toBe("/finance/expenses/monthly?months=6");
    expect(api.expenseMonthlyPath({ months: 99, companyId: "c2" })).toBe(
      "/finance/expenses/monthly?months=24&companyId=c2",
    );
    expect(api.expenseMonthCount(0)).toBe(1);
    expect(api.expenseContextOptionsPath("VEHICLE", " 34 AB ", "b1")).toBe(
      "/finance/expenses/context-options?type=VEHICLE&q=34%20AB&branchId=b1",
    );
    expect(api.expenseContextOptionsPath("DRIVER", "ali", null)).toBe(
      "/finance/expenses/context-options?type=DRIVER&q=ali",
    );
  });

  it("kalem, tekil, ters kayıt, düzeltme ve belge yolları; kimlik kodlanır", () => {
    expect(api.expenseItemsPath()).toBe("/finance/expense-items");
    expect(api.expenseItemPath("k/1")).toBe("/finance/expense-items/k%2F1");
    expect(api.expenseItemActivePath("k1")).toBe("/finance/expense-items/k1/active");
    expect(api.expenseDetailPath("e1")).toBe("/finance/expenses/e1");
    expect(api.expenseReversePath("e1")).toBe("/finance/expenses/e1/reverse");
    expect(api.expenseRevisePath("e1")).toBe("/finance/expenses/e1/revise");
    expect(api.expenseFilesPath("e 1")).toBe("/files?ownerType=EXPENSE&ownerId=e%201");
  });

  it("kalem anahtarı MUI ile aynı; masraf anahtarları ['finance','expenses'] önekli", () => {
    expect(api.expenseKeys.items).toEqual(["finance", "expense-items"]);
    expect(api.expenseKeys.detail("e1")).toEqual(["finance", "expenses", "detail", "e1"]);
    expect(api.expenseKeys.contextOptions("SHIPMENT", "x", null)).toEqual([
      "finance",
      "expenses",
      "context-options",
      "SHIPMENT",
      "x",
      null,
    ]);
  });
});

describe("kancalar", () => {
  it("liste/özet/takvim/aylık aktif şirketle çözülür", async () => {
    useCompanyStore.setState({ activeCompanyId: "c9" } as never);
    apiRequest.mockResolvedValue({ content: [], totalElements: 0 });
    const { Wrapper } = wrapper();
    const list = renderHook(() => api.useExpenseList({ expenseItemId: "k1" }), {
      wrapper: Wrapper,
    });
    renderHook(() => api.useExpenseSummary(), { wrapper: Wrapper });
    renderHook(() => api.useExpenseCalendar({ year: 2026, month: 11 }), { wrapper: Wrapper });
    renderHook(() => api.useExpenseMonthly({ companyId: null }), { wrapper: Wrapper });
    renderHook(() => api.useExpenseItems(), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(5));
    expect(paths().sort()).toEqual(
      [
        "GET /finance/expenses?expenseItemId=k1&companyId=c9&page=0&size=50",
        "GET /finance/expenses/summary?companyId=c9",
        "GET /finance/expenses/calendar?year=2026&month=11&companyId=c9",
        "GET /finance/expenses/monthly?months=6",
        "GET /finance/expense-items",
      ].sort(),
    );
  });

  it("useExpense / useExpenseFiles: id yokken istek yok", async () => {
    apiRequest.mockResolvedValue({});
    const { Wrapper } = wrapper();
    renderHook(() => api.useExpense(undefined), { wrapper: Wrapper });
    renderHook(() => api.useExpenseFiles(null), { wrapper: Wrapper });
    const one = renderHook(() => api.useExpense("e1"), { wrapper: Wrapper });
    await waitFor(() => expect(one.result.current.isSuccess).toBe(true));
    expect(paths()).toEqual(["GET /finance/expenses/e1"]);
  });

  it("useExpenseContextOptions: tür ve en az 1 karakter gerekir; 300 ms gecikmeli", async () => {
    apiRequest.mockResolvedValue([]);
    const { Wrapper } = wrapper();
    renderHook(() => api.useExpenseContextOptions(null, "abc"), { wrapper: Wrapper });
    const hook = renderHook(
      ({ q }: { q: string }) => api.useExpenseContextOptions("VEHICLE", q, "b1"),
      { wrapper: Wrapper, initialProps: { q: "" } },
    );
    expect(apiRequest).not.toHaveBeenCalled();
    hook.rerender({ q: "34" });
    expect(apiRequest).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(paths()).toEqual([
        "GET /finance/expenses/context-options?type=VEHICLE&q=34&branchId=b1",
      ]),
    );
  });
});

describe("mutasyonlar", () => {
  it("doğru yöntem/yol/gövde/başlık; başarıda ['finance'] geçersizlenir", async () => {
    apiRequest.mockResolvedValue({ id: "x" });
    apiUpload.mockResolvedValue({ id: "f1" });
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const createItem = renderHook(() => api.useSaveExpenseItem(), { wrapper: Wrapper });
    const editItem = renderHook(() => api.useSaveExpenseItem("k1"), { wrapper: Wrapper });
    const active = renderHook(() => api.useSetExpenseItemActive(), { wrapper: Wrapper });
    const create = renderHook(() => api.useCreateExpense(), { wrapper: Wrapper });
    const reverse = renderHook(() => api.useReverseExpense(), { wrapper: Wrapper });
    const revise = renderHook(() => api.useReviseExpense(), { wrapper: Wrapper });
    const upload = renderHook(() => api.useUploadExpenseDocument(), { wrapper: Wrapper });
    const file = new File(["x"], "fatura.pdf", { type: "application/pdf" });
    const item = { expenseTypeId: "t1", name: "Kırtasiye" };
    await act(async () => {
      await createItem.result.current.mutateAsync(item);
      await editItem.result.current.mutateAsync({ ...item, code: "MK-00002" });
      await active.result.current.mutateAsync({ id: "k1", active: false });
      await create.result.current.mutateAsync({ body, idempotencyKey: "key-1" });
      await reverse.result.current.mutateAsync({
        id: "e1",
        body: { date: "2026-11-16", reason: "Hatalı" },
      });
      await revise.result.current.mutateAsync({
        id: "e1",
        body: { expense: body, reason: "Tutar", removeDocument: false },
        idempotencyKey: "key-2",
      });
      await upload.result.current.mutateAsync({ expenseId: "e2", file });
    });
    expect(apiRequest.mock.calls).toEqual([
      ["POST", "/finance/expense-items", item],
      ["PUT", "/finance/expense-items/k1", { ...item, code: "MK-00002" }],
      ["PUT", "/finance/expense-items/k1/active", { active: false }],
      ["POST", "/finance/expenses", body, { "Idempotency-Key": "key-1" }],
      ["POST", "/finance/expenses/e1/reverse", { date: "2026-11-16", reason: "Hatalı" }],
      [
        "POST",
        "/finance/expenses/e1/revise",
        { expense: body, reason: "Tutar", removeDocument: false },
        { "Idempotency-Key": "key-2" },
      ],
    ]);
    expect(apiUpload.mock.calls[0][0]).toBe("/files?ownerType=EXPENSE&ownerId=e2");
    expect((apiUpload.mock.calls[0][1] as FormData).get("file")).toBe(file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
    expect(invalidate).toHaveBeenCalledTimes(7);
  });

  it("anahtarsız oluşturma başlık göndermez", async () => {
    apiRequest.mockResolvedValue({});
    await api.createExpense(body);
    expect(apiRequest).toHaveBeenCalledWith("POST", "/finance/expenses", body, undefined);
  });
});
