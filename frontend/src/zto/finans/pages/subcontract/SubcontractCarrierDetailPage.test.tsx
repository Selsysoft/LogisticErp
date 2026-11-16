// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { SubcontractCarrierDetail } from "../../../../pages/operations/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { SubcontractCarrierDetailPage } from "./SubcontractCarrierDetailPage";
import { BRANCH_TREE, makeRow } from "./subcontractTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const INVOICER = ["FINANCE_VIEW", "SHIPMENT_VIEW", "SHIPMENT_INVOICE"];
const VIEWER = ["FINANCE_VIEW", "SHIPMENT_VIEW"];

const DETAIL: SubcontractCarrierDetail = {
  accountId: "a1",
  accountName: "Hızlı Nakliyat",
  accountCode: "TS-1",
  rows: [
    makeRow({
      ledger: {
        transactionId: "t1",
        transactionDate: "2026-11-11",
        description: "SF-2026-0007 taşeron nakliye FTR-1",
      },
    }),
    makeRow({
      legId: "l2",
      legSequenceNo: 2,
      costId: "c2",
      status: "OPEN",
      transportMode: "SEA",
      vatAmount: "0.00",
      withholdingAmount: "0.00",
      deductionAmount: "0.00",
      totalAmount: "10000.00",
      payableAmount: "10000.00",
      documentType: null,
      costDate: null,
      postedAt: null,
    }),
  ],
  netTotals: [{ currency: "TRY", amount: "20000.00" }],
  payableTotals: [{ currency: "TRY", amount: "21500.00" }],
};

const PATH = "/zto-finans/sevk-nakliye-masraflari/firma/a1?days=30";
const ROUTES = { "sevk-nakliye-masraflari/firma/:accountId": <SubcontractCarrierDetailPage /> };

beforeEach(() => {
  fakeApi.reset();
  fakeApi.on("GET", /^\/organization\/branch-tree/, BRANCH_TREE);
  fakeApi.on("GET", /^\/shipment\/subcontract-costs\?/, DETAIL);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "ABD Doları" },
  ]);
  fakeApi.on("GET", "/finance/account-document-types", [
    {
      side: "PAYABLE",
      code: "ALIS_FATURASI",
      name: "Alış Faturası",
      audience: "OTHER",
      invoiceSection: true,
      penalty: false,
      isDefault: true,
      selectable: true,
      sortOrder: 1,
    },
  ]);
});
afterEach(cleanup);

async function rowOf(text: string) {
  const cell = await screen.findByText(text, {}, { timeout: 5000 });
  return cell.closest("tr") as HTMLElement;
}

describe("SubcontractCarrierDetailPage (CSD)", () => {
  it("satırlar, stat kartları, rozet ve gün süzgeci", async () => {
    signIn(INVOICER);
    renderAt(PATH, ROUTES);
    const first = await rowOf("SF-2026-0007/1");
    expect(within(first).getByText("Sevk Nakliye")).toBeTruthy();
    expect(within(first).getByText("10.000 ₺")).toBeTruthy();
    expect(within(first).getByText("10.11.2026")).toBeTruthy();
    const second = await rowOf("SF-2026-0007/2");
    expect(within(second).getByText("Gemi Nakliye").className).toBe("badge badge-info");
    expect(screen.getByText("Son 30 Gün")).toBeTruthy();
    expect(screen.getAllByText("20.000 ₺").length).toBeGreaterThan(0);
    expect(fakeApi.log("GET")).toContain("/shipment/subcontract-costs?carrierAccountId=a1&days=30");

    const days = screen.getByLabelText("Gün sayısı") as HTMLInputElement;
    fireEvent.change(days, { target: { value: "500" } });
    fireEvent.blur(days);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("days=150"));
    expect(days.value).toBe("150");
  });

  it("Nakliye Tutarı Düzenle: hesap, tevkifat > KDV uyarısı ve kaydet gövdesi", async () => {
    signIn(INVOICER);
    fakeApi.on("PUT", "/shipment/shipments/s1/legs/l2/subcontract-cost", makeRow());
    renderAt(PATH, ROUTES);
    const row = await rowOf("SF-2026-0007/2");
    fireEvent.click(within(row).getByRole("button", { name: "Nakliye Tutarı Düzenle" }));
    const dialog = await screen.findByRole("dialog", { name: /Nakliye Firması & Fiyat Düzenle/ });
    expect((within(dialog).getByLabelText("Nakliye Firması") as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect((within(dialog).getByLabelText("Belge Türü") as HTMLSelectElement).value).toBe(
      "ALIS_FATURASI",
    );
    expect((within(dialog).getByLabelText("Belge Tarihi *") as HTMLInputElement).value).toBe(
      "2026-11-10",
    );
    fireEvent.change(within(dialog).getByLabelText("Fatura KDV"), { target: { value: "2000" } });
    fireEvent.change(within(dialog).getByLabelText("Tevkifat"), { target: { value: "2500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Kaydet/ }));
    expect((await screen.findAllByText("Tevkifat KDV tutarını aşamaz!")).length).toBeGreaterThan(0);
    const withholding = within(dialog).getByLabelText("Tevkifat");
    expect(withholding.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(withholding);
    expect(fakeApi.log("PUT")).toEqual([]);

    fireEvent.change(withholding, { target: { value: "400" } });
    fireEvent.change(within(dialog).getByLabelText("İndirim"), { target: { value: "100" } });
    expect((within(dialog).getByLabelText("Toplam Tutar") as HTMLInputElement).value).toBe(
      "12000.00",
    );
    expect((within(dialog).getByLabelText("Kalan Tutar") as HTMLInputElement).value).toBe(
      "11600.00",
    );
    expect((within(dialog).getByLabelText("Bakiye") as HTMLInputElement).value).toBe("11500.00");
    fireEvent.change(within(dialog).getByLabelText("Belge No / Fatura No"), {
      target: { value: "FTR-9" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(fakeApi.log("PUT")).toHaveLength(1));
    expect(fakeApi.calls.find((call) => call.method === "PUT")?.body).toEqual({
      money: { amount: "10000.00", currency: "TRY" },
      vatAmount: "2000",
      withholdingAmount: "400",
      deductionAmount: "100",
      documentNo: "FTR-9",
      documentType: "ALIS_FATURASI",
      costDate: "2026-11-10",
      exchangeRate: null,
      description: null,
    });
    // Yük altında snackbar geçişi sırasında aynı metin kısa süre iki düğümde bulunabilir.
    expect((await screen.findAllByText("Satış başarıyla güncellendi")).length).toBeGreaterThan(0);
  }, 20_000);

  it("Sil: POSTED gerekçeli ters kayıt, OPEN DELETE", async () => {
    signIn(INVOICER);
    fakeApi.on("POST", "/shipment/subcontract-costs/c1/reverse", undefined);
    fakeApi.on("DELETE", "/shipment/subcontract-costs/c2", undefined);
    renderAt(PATH, ROUTES);
    const posted = await rowOf("SF-2026-0007/1");
    fireEvent.click(within(posted).getByRole("button", { name: /Nakliye Giderini Sil/ }));
    const dialog = await screen.findByRole("dialog", { name: /Silme Onayı/ });
    expect(within(dialog).getByText(/ters kayıt oluşturulacak/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Sil/ }));
    expect(await within(dialog).findByText("Gerekçe zorunludur.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual([]);
    fireEvent.change(within(dialog).getByLabelText(/Silme Gerekçesi/), {
      target: { value: "Yanlış tutar" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Sil/ }));
    await waitFor(() =>
      expect(fakeApi.log("POST")).toEqual(["/shipment/subcontract-costs/c1/reverse"]),
    );
    const body = fakeApi.calls.find((call) => call.method === "POST")?.body as {
      date: string;
      reason: string;
    };
    expect(body.reason).toBe("Yanlış tutar");
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await screen.findAllByText("Nakliye gideri silindi")).length).toBeGreaterThan(0);

    const open = await rowOf("SF-2026-0007/2");
    fireEvent.click(within(open).getByRole("button", { name: /Nakliye Giderini Sil/ }));
    const second = await screen.findByRole("dialog", { name: /Silme Onayı/ });
    expect(within(second).queryByLabelText(/Silme Gerekçesi/)).toBeNull();
    fireEvent.click(within(second).getByRole("button", { name: /Sil/ }));
    await waitFor(() => expect(fakeApi.log("DELETE")).toEqual(["/shipment/subcontract-costs/c2"]));
  });

  it("detay modalı cari hareketi gösterir; SHIPMENT_INVOICE yoksa Düzenle/Sil yok", async () => {
    signIn(VIEWER);
    renderAt(PATH, ROUTES);
    const row = await rowOf("SF-2026-0007/1");
    expect(within(row).queryByRole("button", { name: "Nakliye Tutarı Düzenle" })).toBeNull();
    expect(within(row).queryByRole("button", { name: /Nakliye Giderini Sil/ })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Sevk Nakliye Detayları" }));
    const dialog = await screen.findByRole("dialog", { name: /Sevk Nakliye Firması Detayları/ });
    expect(within(dialog).getByText("SF-2026-0007 taşeron nakliye FTR-1")).toBeTruthy();
    expect(within(dialog).getByText("11.500 ₺")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Ekstreye git" }).getAttribute("href")).toBe(
      "/zto-finans/cari-kartlar/a1/hareketler",
    );
  });
});
