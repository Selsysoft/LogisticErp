// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("../../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/client")>();
  return {
    ...original,
    apiGet: async (path: string) => {
      calls.push(path);
      return respond(path);
    },
  };
});

import "../../i18n";
import { useAuthStore } from "../../auth/authStore";
import { useCompanyStore } from "../../auth/companyStore";
import { ReportsPage } from "./ReportsPage";
import type { SettlementListItem } from "./types";

const page = <T,>(content: T[]) => ({
  content,
  page: 0,
  size: 200,
  totalElements: content.length,
  totalPages: 1,
});

/** 12.2a §4.3 `SettlementListItem` (günlük rapor satırı). */
function item(overrides: Partial<SettlementListItem>): SettlementListItem {
  return {
    id: "s1",
    type: "PAYMENT",
    method: "BANK",
    channel: "TRANSFER",
    displayMethod: "BANK",
    accountId: "acc",
    accountCode: "TED-1",
    accountName: "Demir Tedarik",
    accountType: "SUPPLIER",
    accountSubGroup: null,
    accountGroupName: null,
    employeeMasked: false,
    branchId: "b1",
    branchName: "Merkez",
    branchGroupName: null,
    companyId: "A",
    fundAccountId: "f1",
    fundName: "Ziraat",
    fundKind: "BANK",
    fundBankName: null,
    fundBankBranchName: null,
    instrumentId: null,
    instrumentKind: null,
    instrumentNumber: null,
    instrumentStatus: null,
    expenseItemId: null,
    expenseItemName: null,
    planId: null,
    money: { amount: "100.00", currency: "TRY" },
    exchangeRate: 1,
    tlAmount: 100,
    settlementDate: "2026-11-15",
    documentNo: null,
    description: "Havale",
    status: "POSTED",
    counterpartyBankAccountId: null,
    counterpartyIbanMasked: null,
    counterpartyBankName: null,
    correctsSettlementId: null,
    correctedById: null,
    reverseReason: null,
    reversedOn: null,
    createdAt: "2026-11-15T08:00:00Z",
    createdBy: "x@y.z",
    intercompany: false,
    credit: false,
    transferred: false,
    fxUsed: "0",
    fxRemaining: "0",
    lockReason: null,
    reversible: true,
    correctable: true,
    ...overrides,
  };
}

let respond: (path: string) => unknown = () => undefined;

beforeEach(() => {
  calls.length = 0;
  useCompanyStore.setState({ activeCompanyId: null });
  useAuthStore.setState({
    me: {
      id: "u1",
      email: "x@y.z",
      fullName: "X",
      tenant: "acme",
      permissions: ["FINANCE_VIEW"],
      roles: [],
      landingPath: "/",
      twoFactorEnabled: false,
      companies: [],
    },
  });
  respond = (path) => {
    if (path.startsWith("/organization/branches")) {
      return page([
        { id: "b1", name: "Merkez", companyId: "A", companyName: "Alfa", active: true },
      ]);
    }
    if (path.startsWith("/finance/accounts")) {
      return page([{ id: "acc", code: "TED-1", name: "Demir Tedarik" }]);
    }
    if (path.startsWith("/finance/reports/daily")) {
      return {
        type: "PAYMENT",
        date: "2026-11-15",
        rows: [
          item({}),
          item({
            id: "s2",
            channel: "CREDIT_CARD",
            displayMethod: "CREDIT_CARD",
            accountName: "Kart Cari",
          }),
          item({
            id: "s3",
            method: "CASH",
            channel: null,
            displayMethod: "CASH",
            accountId: null,
            accountCode: null,
            accountName: null,
            employeeMasked: true,
            description: null,
          }),
        ],
        totals: [{ branchId: "b1", currency: "TRY", total: 300, count: 3 }],
        fundBalances: [],
        instrumentFundMovements: [],
      };
    }
    if (path.startsWith("/finance/reports/aging")) return [];
    throw new Error(`yanıt yok ${path}`);
  };
});

afterEach(cleanup);

describe("ReportsPage günlük rapor (12.2a §5.14)", () => {
  it("satır tipi SettlementListItem: Kredi Kartı yöntemi, cari adı satırdan, personel maskeli", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const card = (await screen.findByText("Kart Cari")).closest("tr") as HTMLElement;
    expect(within(card).getByText("Kredi Kartı")).toBeTruthy();
    const first = screen.getByText("Demir Tedarik").closest("tr") as HTMLElement;
    expect(within(first).getByText("Banka")).toBeTruthy();
    const masked = screen.getByText("Nakit").closest("tr") as HTMLElement;
    expect(within(masked).getByText("—")).toBeTruthy();
    expect(calls.some((p) => p.startsWith("/finance/reports/daily?type=PAYMENT&date="))).toBe(true);
    // Sonradan iptal edilmiş satır yoksa not ve etiket yok.
    expect(screen.queryByText(/Sonradan iptal/)).toBeNull();
    expect(screen.queryByText(/Toplamlara rapor gününden sonra iptal/)).toBeNull();
  });

  it("sonradan iptal edilen satır 'Sonradan iptal' etiketiyle; toplam notu görünür (goc-defter:F3)", async () => {
    const base = respond;
    respond = (path) => {
      if (!path.startsWith("/finance/reports/daily")) return base(path);
      return {
        type: "PAYMENT",
        date: "2026-11-15",
        rows: [
          item({ id: "s1", accountName: "Geçerli Cari" }),
          item({ id: "s2", accountName: "İptal Cari", reversedOn: "2026-11-18" }),
        ],
        totals: [{ branchId: "b1", currency: "TRY", total: 200, count: 2 }],
        fundBalances: [],
        instrumentFundMovements: [],
      };
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const reversed = (await screen.findByText("İptal Cari")).closest("tr") as HTMLElement;
    expect(within(reversed).getByText("Sonradan iptal: 18.11.2026")).toBeTruthy();
    const valid = screen.getByText("Geçerli Cari").closest("tr") as HTMLElement;
    expect(within(valid).queryByText(/Sonradan iptal/)).toBeNull();
    expect(
      screen.getByText(
        "Toplamlara rapor gününden sonra iptal edilen kayıtlar dahildir (o tarihteki durum).",
      ),
    ).toBeTruthy();
  });
});
