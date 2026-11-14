// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../../api/client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiGet: (p: string) => apiRequest("GET", p),
}));

import { useCompanyStore } from "../../auth/companyStore";
import * as api from "./accountApi";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

const emptyPage = { content: [], page: 0, size: 0, totalElements: 0, totalPages: 0 };

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, path: string) =>
    path.includes("statement")
      ? { ...emptyPage, lines: [], openingBalances: [], currency: null, openingBalance: null }
      : path.includes("?") && /page=|size=/.test(path)
        ? { ...emptyPage, facets: null }
        : [],
  );
  useCompanyStore.setState({ activeCompanyId: null } as never);
});

describe("okuma kancaları doğru uca gider", () => {
  const cases: Array<[string, () => unknown, string]> = [
    ["hesap grupları", () => api.useAccountGroups(), "/finance/account-groups"],
    [
      "cari listesi",
      () => api.useAccountList({ active: true }),
      "/finance/accounts?active=true&page=0&size=2000",
    ],
    [
      "cari",
      () => api.useAccount("a1", { branchIds: ["b1"] }),
      "/finance/accounts/a1?branchIds=b1",
    ],
    [
      "arama",
      () => api.useAccountSearch(" ac "),
      "/finance/accounts?search=ac&active=true&size=20",
    ],
    [
      "bakiye",
      () => api.useAccountBalances("a1", { groupBy: "BRANCH" }),
      "/finance/accounts/a1/balances?groupBy=BRANCH",
    ],
    [
      "cari hareketleri",
      () => api.useAccountTransactions({ accountId: "a1" }),
      "/finance/account-transactions?accountId=a1&page=0&size=500",
    ],
    [
      "günlük tüm cari işlemleri",
      () => api.useAllAccountTransactions({ from: "2026-11-01", to: "2026-11-14", facets: true }),
      "/finance/account-transactions?from=2026-11-01&to=2026-11-14&facets=true&page=0&size=500",
    ],
    [
      "ekstre",
      () => api.useAccountStatement("a1", { currency: "TRY" }),
      "/finance/accounts/a1/statement?currency=TRY&page=0&size=2000",
    ],
    [
      "faturalar",
      () => api.useAccountInvoices("a1", { direction: "SALES" }),
      "/finance/accounts/a1/invoices?direction=SALES",
    ],
    ["belge türleri", () => api.useDocumentTypes(), "/finance/account-document-types"],
    ["belge", () => api.useAccountDocument("d1"), "/finance/account-documents/d1"],
    ["hareket detayı", () => api.useTransactionDetail("t1"), "/finance/accounts/transactions/t1"],
    [
      "hareket kaynağı",
      () => api.useTransactionSource("t1"),
      "/finance/accounts/transactions/t1/source",
    ],
    ["sezonlar", () => api.useRollovers("a1", true), "/finance/accounts/a1/rollovers?deleted=true"],
    [
      "taşınabilir",
      () => api.useTransferable("a1"),
      "/finance/accounts/a1/transferable-transactions",
    ],
    [
      "taşıma geçmişi",
      () => api.useTransferHistory({ accountId: "a1" }),
      "/finance/account-transfers?accountId=a1&page=0&size=500",
    ],
    [
      "banka hesapları",
      () => api.useBankAccounts("a1", true),
      "/finance/accounts/a1/bank-accounts?includeInactive=true",
    ],
    ["banka hesabı", () => api.useBankAccount("b1"), "/finance/bank-accounts/b1"],
    ["geçmiş", () => api.useAccountHistory("a1"), "/finance/accounts/a1/history?page=0&size=200"],
  ];

  it.each(cases)("%s", async (_name, hook, path) => {
    const { Wrapper } = wrapper();
    renderHook(hook, { wrapper: Wrapper });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("GET", path));
  });

  it("kimlik yoksa istek yok", async () => {
    const { Wrapper } = wrapper();
    renderHook(
      () => {
        api.useAccount(undefined);
        api.useAccountSearch("  ");
        api.useAccountStatement(undefined, {});
        api.useBankAccounts(undefined);
        api.useTransferable("a1", { enabled: false });
        api.useAllAccountTransactions({ from: "", to: "" });
        return null;
      },
      { wrapper: Wrapper },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe("useFinanceMutation", () => {
  it("başarıda ['finance'] geçersizlenir ve çağıranın onSuccess'i çalışır", async () => {
    const { client, Wrapper } = wrapper();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () => api.useFinanceMutation((id: string) => api.setAccountActive(id, true), { onSuccess }),
      { wrapper: Wrapper },
    );
    await act(async () => {
      await result.current.mutateAsync("a1");
    });
    expect(apiRequest).toHaveBeenCalledWith("PATCH", "/finance/accounts/a1/active", {
      active: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance"] });
    expect(onSuccess).toHaveBeenCalled();
  });

  it("tüm yazma uçları", async () => {
    apiRequest.mockResolvedValue({});
    const bank = { bankName: "B", currency: "TRY", category: "MAIN" as const };
    await api.createAccount({ name: "A", type: "CUSTOMER" });
    await api.updateProfile("a1", { code: "C", name: "A", type: "CUSTOMER", subGroup: "MUSTERI" });
    await api.setLimits("a1", { creditLimit: 10 });
    await api.createBankAccount("a1", bank);
    await api.updateBankAccount("b1", bank);
    await api.setBankAccountActive("b1", false);
    await api.voidTransaction("t1");
    await api.createRollover("a1", { rolloverDate: "2026-01-01", seasonName: "2026" });
    await api.updateRollover("r1", { rolloverDate: "2026-01-02", seasonName: "2026" });
    await api.activateRollover("r1");
    await api.restoreRollover("r1");
    await api.reverseTransfer("x1");
    expect(apiRequest.mock.calls.map((c) => `${c[0]} ${c[1]}`)).toEqual([
      "POST /finance/accounts",
      "PUT /finance/accounts/a1/profile",
      "PUT /finance/accounts/a1/limits",
      "POST /finance/accounts/a1/bank-accounts",
      "PUT /finance/bank-accounts/b1",
      "PATCH /finance/bank-accounts/b1/active",
      "POST /finance/accounts/transactions/t1/void",
      "POST /finance/accounts/a1/rollovers",
      "PUT /finance/rollovers/r1",
      "POST /finance/rollovers/r1/activate",
      "POST /finance/rollovers/r1/restore",
      "POST /finance/account-transfers/x1/reverse",
    ]);
  });
});
