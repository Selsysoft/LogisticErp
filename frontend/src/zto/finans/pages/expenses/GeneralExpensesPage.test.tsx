// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseItemSummary } from "../../../../pages/finance/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { GeneralExpensesPage } from "./GeneralExpensesPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const TREE = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [{ id: "b1", code: "IY-1", name: "Alsancak", active: true }],
      },
    ],
  },
];

function summary(overrides: Partial<ExpenseItemSummary> = {}): ExpenseItemSummary {
  return {
    expenseItemId: "i1",
    expenseItemName: "Kira",
    expenseItemCode: "MK-00001",
    expenseTypeName: "Genel",
    lastSupplierAccountId: "a1",
    lastSupplierName: "Mal Sahibi",
    lastSupplierTaxNumberMasked: "12*******90",
    lastSupplierPhone: "02320000000",
    lastSupplierCity: "İzmir",
    branchNames: ["Alsancak", "Konak"],
    invoiceCount: 2,
    totals: [{ currency: "TRY", count: 2, totalAmount: "4500.00" }],
    lastInvoiceDate: "2026-11-02",
    ...overrides,
  };
}

const ROWS = [
  summary(),
  summary({
    expenseItemId: "i2",
    expenseItemName: "Yazılım Lisansı",
    expenseItemCode: "MK-00002",
    lastSupplierTaxNumberMasked: null,
    invoiceCount: 3,
    totals: [
      { currency: "TRY", count: 1, totalAmount: "100.00" },
      { currency: "USD", count: 2, totalAmount: "250.00" },
    ],
    lastInvoiceDate: "2026-11-10",
  }),
];

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("GeneralExpensesPage", () => {
  it("kalem satırları, para birimi kırılımı ve özet kartları", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_MANAGE"]);
    fakeApi.on("GET", /^\/organization\/branch-tree\?/, TREE);
    fakeApi.on("GET", /^\/finance\/expenses\/summary/, ROWS);
    renderAt("/zto-finans/genel-masraflar", { "genel-masraflar": <GeneralExpensesPage /> });
    expect(await screen.findByText("Genel Masraf Hesapları Paneli")).toBeTruthy();
    const table = document.getElementById("dataTable2") as HTMLElement;
    const kira = (await within(table).findByText("Kira")).closest("tr") as HTMLElement;
    expect(kira.textContent).toContain("MK-00001");
    expect(kira.textContent).toContain("12*******90");
    expect(kira.textContent).toContain("Alsancak, Konak");
    expect(kira.textContent).toContain("4.500,00 ₺");
    expect(kira.textContent).toContain("02.11.2026");
    const license = within(table).getByText("Yazılım Lisansı").closest("tr") as HTMLElement;
    expect(license.textContent).toContain("250,00");
    expect(license.textContent).toContain("-");
    // Sıra: son fatura tarihi azalan.
    const first = table.querySelector("tbody tr") as HTMLElement;
    expect(first.textContent).toContain("Yazılım Lisansı");
    // Toplam Masraf: para birimi başına, ₺ ile toplanmaz.
    expect(screen.getByText("5 adet fatura")).toBeTruthy();
    expect(screen.getByText("4.600,00 ₺")).toBeTruthy();
    expect(screen.getByText("250,00 $")).toBeTruthy();
    expect(
      within(kira)
        .getByRole("link", { name: /Faturaları Gör/ })
        .getAttribute("href"),
    ).toBe("/zto-finans/genel-masraflar/kalem/i1");
    expect(screen.getByRole("link", { name: /Yeni Masraf/ })).toBeTruthy();
  });

  it("özet kartı araması ve kart tıklaması", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on("GET", /^\/organization\/branch-tree\?/, TREE);
    fakeApi.on("GET", /^\/finance\/expenses\/summary/, ROWS);
    renderAt("/zto-finans/genel-masraflar", {
      "genel-masraflar": <GeneralExpensesPage />,
      "genel-masraflar/kalem/:itemId": <span>faturalar</span>,
    });
    const cards = await screen.findByText((_, el) => el?.id === "categoryCards");
    expect(within(cards).getAllByRole("link")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Masraf kalemi ara"), { target: { value: "YAZILIM" } });
    expect(screen.getByText("1 sonuç bulundu")).toBeTruthy();
    expect(within(cards).getAllByRole("link")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Masraf kalemi ara"), { target: { value: "yok" } });
    expect(screen.getByText('"yok" için sonuç bulunamadı')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aramayı temizle" }));
    fireEvent.click(within(cards).getAllByRole("link")[0]);
    expect(screen.getByTestId("where").textContent).toBe("/zto-finans/genel-masraflar/kalem/i1");
    expect(screen.queryByRole("link", { name: /Yeni Masraf/ })).toBeNull();
  });

  it("iş yeri süzgeci isteğe branchIds ekler", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on("GET", /^\/organization\/branch-tree\?/, TREE);
    fakeApi.on("GET", /^\/finance\/expenses\/summary/, []);
    renderAt("/zto-finans/genel-masraflar", { "genel-masraflar": <GeneralExpensesPage /> });
    expect(await screen.findByText("Henüz masraf kaydı bulunmamaktadır.")).toBeTruthy();
    await screen.findByRole("option", { name: "Alsancak" });
    const select = document.getElementById("workPlaceFilterIE") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "b1" } });
    expect(await screen.findByText("Alsancak", { selector: "small" })).toBeTruthy();
    expect(
      fakeApi.log("GET").some((p) => p.includes("summary") && p.includes("branchIds=b1")),
    ).toBe(true);
  });
});
