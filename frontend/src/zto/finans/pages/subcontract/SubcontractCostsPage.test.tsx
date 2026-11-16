// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { SubcontractSummary } from "../../../../pages/operations/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { SubcontractCostsPage } from "./SubcontractCostsPage";
import { BRANCH_TREE } from "./subcontractTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const SUMMARY: SubcontractSummary = {
  carriers: [
    {
      accountId: "a1",
      accountName: "Hızlı Nakliyat",
      accountCode: "TS-1",
      companyNames: "Acme",
      phone: "05321112233",
      city: "İzmir",
      district: "Konak",
      legCount: 3,
      netTotals: [
        { currency: "TRY", amount: "15000.00" },
        { currency: "USD", amount: "250.00" },
      ],
      payableTotals: [{ currency: "TRY", amount: "17000.00" }],
    },
    {
      accountId: "a2",
      accountName: "Deniz Lojistik",
      accountCode: null,
      companyNames: null,
      phone: null,
      city: null,
      district: null,
      legCount: 1,
      netTotals: [],
      payableTotals: [],
    },
  ],
  carrierCount: 2,
  legCount: 4,
  netTotals: [
    { currency: "TRY", amount: "15000.00" },
    { currency: "USD", amount: "250.00" },
  ],
};

const ROUTES = {
  "sevk-nakliye-masraflari": <SubcontractCostsPage />,
  "sevk-nakliye-masraflari/firma/:accountId": <span>detay</span>,
};

beforeEach(() => {
  fakeApi.reset();
  fakeApi.on("GET", /^\/organization\/branch-tree/, BRANCH_TREE);
  fakeApi.on("GET", /^\/shipment\/subcontract-costs\/summary/, SUMMARY);
});
afterEach(cleanup);

describe("SubcontractCostsPage (STI)", () => {
  it("başlık, stat kartları, firma satırı ve tfoot TOPLAM", async () => {
    signIn(["FINANCE_VIEW", "SHIPMENT_VIEW"]);
    renderAt("/zto-finans/sevk-nakliye-masraflari", ROUTES);
    const link = await screen.findByRole("link", { name: /Hızlı Nakliyat/ }, { timeout: 5000 });
    expect(link.getAttribute("href")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("title")).toBe("Cari hesaba git (yeni sekme)");
    expect(screen.getByRole("heading", { name: /Sevk İhracat Nakliye Hesapları/ })).toBeTruthy();
    expect(screen.getByText("Satışlarda nakliye firması özeti!")).toBeTruthy();
    const row = link.closest("tr") as HTMLElement;
    expect(within(row).getByText("İzmir / Konak")).toBeTruthy();
    expect(within(row).getByText("15.000 ₺ / 250 $")).toBeTruthy();
    const other = screen.getByText("Deniz Lojistik").closest("tr") as HTMLElement;
    expect(within(other).getAllByText("-").length).toBe(3);
    expect(within(other).getByText("0 ₺")).toBeTruthy();
    const foot = document.querySelector("#dataTable2 tfoot") as HTMLElement;
    expect(within(foot).getByText(/TOPLAM/)).toBeTruthy();
    expect(within(foot).getByText("4")).toBeTruthy();
    expect(fakeApi.log("GET")).toContain("/shipment/subcontract-costs/summary?days=150");
  }, 20_000);

  it("Araçlar ve Detaylar firma detayına 150 günle gider", async () => {
    signIn(["FINANCE_VIEW", "SHIPMENT_VIEW"]);
    renderAt("/zto-finans/sevk-nakliye-masraflari", ROUTES);
    const buttons = await screen.findAllByRole("button", { name: /Araçlar ve Detaylar/ });
    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe(
        "/zto-finans/sevk-nakliye-masraflari/firma/a1?days=150",
      ),
    );
  });

  it("şube ve iş yeri süzgeci URL'ye branchIds yazar ve sorguya geçer", async () => {
    signIn(["FINANCE_VIEW", "SHIPMENT_VIEW"]);
    renderAt("/zto-finans/sevk-nakliye-masraflari", ROUTES);
    const branch = (await screen.findByLabelText("Şube")) as HTMLSelectElement;
    await waitFor(() => expect(branch.disabled).toBe(false));
    fireEvent.change(branch, { target: { value: "g1" } });
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe(
        "/zto-finans/sevk-nakliye-masraflari?branchIds=b1&branchIds=b2",
      ),
    );
    const place = screen.getByLabelText("İş Yeri") as HTMLSelectElement;
    expect(Array.from(place.options, (o) => o.text)).toEqual(["Tüm İş Yerleri", "Merkez", "Liman"]);
    fireEvent.change(place, { target: { value: "b2" } });
    await waitFor(() =>
      expect(fakeApi.log("GET")).toContain(
        "/shipment/subcontract-costs/summary?days=150&branchIds=b2",
      ),
    );
    expect(place.value).toBe("b2");
  });
});
