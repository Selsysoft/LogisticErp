// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseCalendar } from "../../../../pages/finance/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { longDate } from "./expenseCalendarLogic";
import { isoParts, localToday } from "./expenseDates";
import { GeneralExpensesCalendarPage } from "./GeneralExpensesCalendarPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

vi.mock("../../../components/ZtoChart", () => ({
  default: (props: { ariaLabel?: string; data: { labels: string[] } }) => (
    <div data-testid="chart" role="img" aria-label={props.ariaLabel}>
      {props.data.labels.join("|")}
    </div>
  ),
}));

const today = localToday();
const parts = isoParts(today) as { year: number; month: number; day: number };

function calendar(): ExpenseCalendar {
  return {
    year: parts.year,
    month: parts.month,
    days: [
      {
        date: today,
        expenses: [
          {
            id: "e1",
            expenseItemId: "i1",
            expenseItemName: "Kira",
            expenseTypeName: "Genel",
            invoiceNumber: "F-001",
            contextType: "VEHICLE",
            contextLabel: "35 ABC 123",
            supplierName: "Mal Sahibi",
            department: "ADMIN",
            invoiceDate: today,
            currency: "TRY",
            totalAmount: "1200.00",
          },
          {
            id: "e2",
            expenseItemId: "i1",
            expenseItemName: "Kira",
            expenseTypeName: "Genel",
            invoiceNumber: null,
            contextType: "GENERAL",
            contextLabel: null,
            supplierName: null,
            department: "IT",
            invoiceDate: today,
            currency: "USD",
            totalAmount: "50.00",
          },
        ],
      },
    ],
    allTime: [
      {
        currency: "TRY",
        count: 4,
        netAmount: "1000.00",
        vatAmount: "200.00",
        discountAmount: "0",
        totalAmount: "1200.00",
      },
      {
        currency: "USD",
        count: 1,
        netAmount: "50.00",
        vatAmount: "0",
        discountAmount: "0",
        totalAmount: "50.00",
      },
    ],
  };
}

function api() {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, []);
  fakeApi.on("GET", /^\/finance\/expenses\/calendar\?/, calendar());
  fakeApi.on("GET", /^\/finance\/expenses\/monthly\?/, [
    { month: today.slice(0, 7), expenseTypeId: "t1", expenseTypeName: "Genel", tlAmount: "2900" },
  ]);
  fakeApi.on("GET", "/finance/expenses/e1", {
    id: "e1",
    currency: "TRY",
    lines: [
      {
        id: "l1",
        lineNo: 1,
        description: "Kasım kirası",
        quantity: "1",
        unit: "Adet",
        unitPrice: "1000",
        subTotal: "1000",
        discountRate: "0",
        discountAmount: "0",
        netAmount: "1000",
        vatRate: "20",
        vatAmount: "200",
        withholdingAmount: "0",
        otherTaxAmount: "0",
        totalAmount: "1200",
      },
    ],
  });
}

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("GeneralExpensesCalendarPage", () => {
  it("bugünün kayıtları, toplamlar ve fatura detay modalı", async () => {
    signIn(["FINANCE_VIEW"]);
    api();
    renderAt("/zto-finans/genel-masraflar/takvim", {
      "genel-masraflar/takvim": <GeneralExpensesCalendarPage />,
    });
    expect(await screen.findByText("Genel Masraflar Paneli")).toBeTruthy();
    const day = await screen.findByRole("button", { name: `${longDate(today)}, 2 kayıt` });
    expect(day.className).toContain("has-data");
    expect(day.className).toContain("today");
    expect(day.className).toContain("active");
    expect(day.getAttribute("aria-current")).toBe("date");
    const headers = Array.from(document.querySelectorAll(".calendar-days > .small"), (el) =>
      el.textContent?.trim(),
    );
    expect(headers).toEqual(["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"]);

    expect(screen.getByText(/Araç - 35 ABC 123/)).toBeTruthy();
    expect(screen.getByText(/Bağlam: Genel Masraf/)).toBeTruthy();
    expect(screen.getByText(/Departman: BT/)).toBeTruthy();
    expect(document.getElementById("selectedDateCount")?.textContent).toBe("2");
    expect(document.getElementById("selectedDateTotal")?.textContent).toBe("1.200,00 ₺ + 50,00 $");
    // Tüm zamanlar: para birimi başına satır (TRY + USD).
    expect(screen.getAllByText("Toplam KDV Tutarı:", { exact: false })).toHaveLength(2);
    expect(screen.getAllByText(/Tüm Zamanlar Toplam Masraf Sayısı/)).toHaveLength(2);
    expect((await screen.findByTestId("chart")).textContent?.split("|")).toHaveLength(6);

    fireEvent.click(screen.getAllByTitle("Fatura detaylarını aç")[0]);
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("F-001")).toBeTruthy();
    expect(await within(modal).findByText("Kasım kirası")).toBeTruthy();
    expect(document.getElementById("footerTotalAmount")?.textContent).toBe("1.200,00 ₺");
  });

  it("ay gezintisi takvim isteğini değiştirir", async () => {
    signIn(["FINANCE_VIEW"]);
    api();
    renderAt("/zto-finans/genel-masraflar/takvim", {
      "genel-masraflar/takvim": <GeneralExpensesCalendarPage />,
    });
    await screen.findByText("Genel Masraflar Paneli");
    fireEvent.click(screen.getByRole("button", { name: "Sonraki ay" }));
    const next = parts.month === 12 ? 1 : parts.month + 1;
    await waitFor(() =>
      expect(
        fakeApi
          .log("GET")
          .some((p) => p.includes("/calendar?") && new RegExp(`month=${next}(&|$)`).test(p)),
      ).toBe(true),
    );
    expect((document.getElementById("monthSelect") as HTMLSelectElement).value).toBe(String(next));
  });
});
