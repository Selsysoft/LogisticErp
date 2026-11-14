// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { StatementLine } from "../../../../pages/finance/types";
import { ZtoFinansRoot } from "../../../ZtoFinansRoot";
import {
  apiError,
  fakeApi,
  makeBranch,
  makeCompany,
  page,
  signIn,
} from "../definitions/definitionTestUtils";
import { AccountStatementPage } from "./AccountStatementPage";
import { makeAccount } from "./transactionsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
  apiBlobUrl: (path: string) => Promise.resolve(`blob:${path}`),
}));

function line(id: string, date: string, extra: Partial<StatementLine> = {}): StatementLine {
  return {
    id,
    date,
    direction: "CREDIT",
    amount: 100,
    exchangeRate: null,
    tlAmount: null,
    description: `Satır ${id}`,
    sourceType: "MANUAL",
    balance: 0,
    currency: "TRY",
    companyId: "c1",
    branchId: "b1",
    sourceId: "s",
    kind: "DEBT",
    sign: 1,
    reversal: false,
    reversed: false,
    transferRole: null,
    documentNo: `B-${id}`,
    documentType: null,
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    createdBy: "u",
    createdAt: `${date}T09:00:00`,
    ...extra,
  };
}

function open(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/zto-finans-yazdir/cari-ekstre/:id"
            element={
              <ZtoFinansRoot className="zto-print zto-page-account-statement">
                <AccountStatementPage />
              </ZtoFinansRoot>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fakeApi.reset();
  signIn(["FINANCE_VIEW"]);
  fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
  fakeApi.on(
    "GET",
    /^\/organization\/branches/,
    page([makeBranch(), makeBranch({ id: "b2", name: "Ankara" })]),
  );
  fakeApi.on(
    "GET",
    "/organization/companies/c1",
    makeCompany({ title: "Acme Lojistik A.Ş.", logoFileId: "logo1" }),
  );
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/statement/, (call: { path: string }) => {
    // Sunucu sözleşmesi (FinanceController.accountStatement): `from` ve `to` zorunlu; eksikse 400.
    const query = new URL(call.path, "http://x").searchParams;
    if (!query.get("from") || !query.get("to")) {
      throw apiError(400, "VALIDATION_ERROR", "from/to zorunlu");
    }
    return STATEMENT;
  });
});
afterEach(cleanup);

/** Ekstre istekleri: [from, to] (sırayla). */
const statementRanges = () =>
  fakeApi.calls
    .filter((c) => c.path.startsWith("/finance/accounts/a1/statement"))
    .map((c) => {
      const query = new URL(c.path, "http://x").searchParams;
      return [query.get("from"), query.get("to")];
    });

const STATEMENT = {
  currency: "TRY",
  openingBalance: 0,
  openingBalances: [],
  lines: [
    line("l1", "2026-01-05", { direction: "DEBIT", kind: "RECEIVABLE", amount: 500 }),
    line("l2", "2026-02-10"),
    line("l3", "2026-02-12", { branchId: "b2" }),
  ],
  page: 0,
  size: 2000,
  totalElements: 3,
  totalPages: 1,
};

describe("AccountStatementPage", () => {
  it("şirket başlığı (ZTO FABRİKA yok), ekstre no, iş yeri blokları ve @page", async () => {
    open("/zto-finans-yazdir/cari-ekstre/a1");
    await screen.findByText("📍 Merkez");
    expect(screen.getByText("Acme Lojistik A.Ş.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ZTO FABRİKA");
    expect(document.body.textContent).toMatch(/EKS-TED-001-\d{8}/);
    expect(screen.getByText("📍 Ankara")).toBeTruthy();
    expect(document.getElementById("zto-account-statement-page")?.textContent).toContain("@page");
    expect(document.title).toBe("Hesap Ekstresi - Demir Tedarik");
    const merkez = screen.getByText("📍 Merkez").closest(".workplace-section") as HTMLElement;
    const cells = [...merkez.querySelectorAll(".transactions-table tbody tr")].map(
      (tr) => tr.querySelector(".col-balance")?.textContent,
    );
    expect(cells).toEqual(["500,00 B", "400,00 B"]);
    await waitFor(() =>
      expect(document.querySelector(".company-name img")?.getAttribute("src")).toBe(
        "blob:/files/logo1/content",
      ),
    );
  });

  it("tarih aralığı: devreden bakiye satırı ve dönem etiketi; Tüm Zamanlar temizler", async () => {
    open("/zto-finans-yazdir/cari-ekstre/a1?from=2026-02-01");
    await screen.findByText("📍 Merkez");
    expect(screen.getByText("01.02.2026 - …")).toBeTruthy();
    const opening = document.querySelector(".opening-balance-row") as HTMLElement;
    expect(opening.textContent).toContain("DEVREDEN BAKİYE");
    expect(opening.textContent).toContain("500,00 B");
    fireEvent.click(screen.getByRole("button", { name: "Tüm Zamanlar" }));
    await waitFor(() => expect(document.querySelector(".opening-balance-row")).toBeNull());
    expect(screen.getByText("Tüm Zamanlar", { selector: ".statement-period" })).toBeTruthy();
    // `from` her zaman açık aralık başı (devreden bakiye istemcide); boş `to` açık aralık sonu.
    expect(statementRanges().every(([from]) => from === "0001-01-01")).toBe(true);
    expect(statementRanges().at(-1)).toEqual(["0001-01-01", "9999-12-31"]);
  });

  it("ekstre isteği her zaman from ve to taşır; bitiş tarihi sunucuya gider, başlangıç gitmez", async () => {
    open("/zto-finans-yazdir/cari-ekstre/a1?from=2026-02-01&to=2026-02-11");
    await screen.findByText("📍 Merkez");
    expect(statementRanges()).toEqual([["0001-01-01", "2026-02-11"]]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("para birimi kutusu bloğu gizler; yazdır düğmesi hesap bitince etkin", async () => {
    open("/zto-finans-yazdir/cari-ekstre/a1");
    await screen.findByText("📍 Merkez");
    const printButton = screen.getByRole("button", { name: "Yazdır" }) as HTMLButtonElement;
    expect(printButton.disabled).toBe(false);
    fireEvent.click(document.querySelector(".currency-toggle") as HTMLInputElement);
    await waitFor(() => expect(document.querySelectorAll(".currency-section")).toHaveLength(0));
  });

  it('12.2 Genel Özet\'te para birimi başına "Fatura bilgisi eksik" satırı', async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances/, {
      groupBy: "CURRENCY",
      splitDate: null,
      rows: [],
      payableInvoiceTotals: [],
      receivableInvoiceTotals: [],
      invoiceGaps: [
        {
          accountId: "a1",
          side: "PAYABLE",
          companyId: null,
          currency: "TRY",
          ledgerTotal: 150,
          invoiceTotal: 100,
          missing: 50,
        },
      ],
    });
    open("/zto-finans-yazdir/cari-ekstre/a1");
    await screen.findByText("📍 Merkez");
    const row = (await waitFor(() => {
      const found = document.querySelector(".grand-summary-table .missing-invoice-row");
      if (!found) throw new Error("satır yok");
      return found;
    })) as HTMLElement;
    expect(row.textContent).toContain("Fatura bilgisi eksik");
    expect(row.textContent).toContain("50,00 ₺");
    expect(row.textContent).toContain("CARİ ALACAĞI");
    expect(row.querySelector(".text-danger")).not.toBeNull();
  });
});
