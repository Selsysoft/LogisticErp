// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseItemSummary, ExpenseListItem } from "../../../../pages/finance/types";
import { fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { localToday } from "./expenseDates";
import { ExpenseItemInvoicesPage } from "./ExpenseItemInvoicesPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE"];

function row(overrides: Partial<ExpenseListItem> = {}): ExpenseListItem {
  return {
    id: "x1",
    invoiceNumber: "F-001",
    description: "Kasım kirası",
    expenseItemId: "i1",
    expenseItemName: "Kira",
    expenseTypeName: "Genel",
    department: "ADMIN",
    companyId: "c1",
    branchId: "b1",
    branchName: "Alsancak",
    contextType: "GENERAL",
    contextLabel: null,
    paymentMethod: "ACCOUNT",
    supplierName: "Mal Sahibi",
    currency: "TRY",
    totalAmount: "1200.00",
    tlAmount: "1200.00",
    invoiceDate: "2026-11-02",
    dueDate: null,
    documentType: "ALIS_FATURASI",
    hasDocument: true,
    createdAt: "2026-11-02T09:00:00",
    ...overrides,
  };
}

const SUMMARY: ExpenseItemSummary = {
  expenseItemId: "i1",
  expenseItemName: "Kira",
  expenseItemCode: "MK-00001",
  expenseTypeName: "Genel",
  lastSupplierAccountId: "a1",
  lastSupplierName: "Mal Sahibi",
  lastSupplierTaxNumberMasked: "12*******90",
  lastSupplierPhone: "02320000000",
  lastSupplierCity: null,
  branchNames: ["Alsancak"],
  invoiceCount: 2,
  totals: [
    { currency: "TRY", count: 1, totalAmount: "1200.00" },
    { currency: "USD", count: 1, totalAmount: "50.00" },
  ],
  lastInvoiceDate: "2026-11-02",
};

function api() {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, []);
  fakeApi.on("GET", "/finance/expense-items", [
    {
      id: "i1",
      expenseTypeId: "t1",
      expenseTypeName: "Genel",
      code: "MK-00001",
      name: "Kira",
      description: null,
      defaultUnit: null,
      active: true,
      system: false,
      createdAt: "2026-11-01T10:00:00",
    },
  ]);
  fakeApi.on("GET", /^\/finance\/expenses\/summary/, [SUMMARY]);
  fakeApi.on("GET", /^\/finance\/expenses\?/, (call: { path: string }) =>
    call.path.includes("currency=USD")
      ? page([row({ id: "x2", currency: "USD", totalAmount: "50.00", invoiceNumber: null })])
      : page([
          row(),
          row({
            id: "x2",
            currency: "USD",
            totalAmount: "50.00",
            invoiceNumber: null,
            hasDocument: false,
            createdAt: "2026-11-01T09:00:00",
          }),
        ]),
  );
}

const ROUTE = { "genel-masraflar/kalem/:itemId": <ExpenseItemInvoicesPage /> };

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("ExpenseItemInvoicesPage", () => {
  it("kartlar, satırlar, Karışık toplam ve para birimi süzgeci", async () => {
    signIn(MANAGER);
    api();
    renderAt("/zto-finans/genel-masraflar/kalem/i1", ROUTE);
    expect(await screen.findByText(/Kira - Masraf Cari Hesap Faturaları/)).toBeTruthy();
    const table = document.getElementById("dataTable2") as HTMLElement;
    const first = (await within(table).findByText("F-001")).closest("tr") as HTMLElement;
    expect(first.textContent).toContain("Kasım kirası");
    expect(first.textContent).toContain("İdari");
    expect(first.textContent).toContain("1.200,00 ₺");
    expect(first.textContent).toContain("02.11.2026");
    expect(within(first).getByTitle("Fatura Detayları")).toBeTruthy();
    expect(document.getElementById("footerTotal")?.textContent).toBe("Karışık");
    expect(screen.getByText("12*******90")).toBeTruthy();
    expect(screen.getByText("02320000000")).toBeTruthy();
    expect(screen.getByText("MK-00001")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Para Birimi Filtresi/), { target: { value: "USD" } });
    await waitFor(() =>
      expect(document.getElementById("footerTotal")?.textContent).toBe("50,00 $"),
    );
    expect(document.getElementById("filterCount")?.textContent).toBe("1");
    expect(
      fakeApi.log("GET").some((p) => p.includes("currency=USD") && p.includes("size=500")),
    ).toBe(true);
  });

  it("Sil: gerekçe zorunlu, ters kayıt isteği gönderilir", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/expenses/x1/reverse", { id: "x1", status: "REVERSED" });
    renderAt("/zto-finans/genel-masraflar/kalem/i1", ROUTE);
    const first = (await screen.findByText("F-001")).closest("tr") as HTMLElement;
    fireEvent.click(within(first).getByTitle("Sil"));
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText(
        '"F-001" numaralı masraf faturasını silmek istediğinize emin misiniz?',
      ),
    ).toBeTruthy();
    expect(within(modal).getByText(/ters kaydı oluşturulacaktır/)).toBeTruthy();
    expect(within(modal).getByText("Tutar: 1.200,00 ₺")).toBeTruthy();
    fireEvent.click(within(modal).getByRole("button", { name: /Evet, Sil/ }));
    expect(await within(modal).findByText("İptal gerekçesi giriniz.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual([]);
    fireEvent.change(within(modal).getByLabelText(/İptal Gerekçesi/), {
      target: { value: "Mükerrer kayıt" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: /Evet, Sil/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
        date: localToday() > "2026-11-02" ? localToday() : "2026-11-02",
        reason: "Mükerrer kayıt",
      }),
    );
    expect((await screen.findAllByText("Masraf faturası silindi.")).length).toBeGreaterThan(0);
  });

  it("yalnız FINANCE_VIEW: Düzenle/Sil yok", async () => {
    signIn(["FINANCE_VIEW"]);
    api();
    renderAt("/zto-finans/genel-masraflar/kalem/i1", ROUTE);
    const first = (await screen.findByText("F-001")).closest("tr") as HTMLElement;
    expect(within(first).queryByTitle("Sil")).toBeNull();
    expect(within(first).queryByTitle("Düzenle")).toBeNull();
  });
});
