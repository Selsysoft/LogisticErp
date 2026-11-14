// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { DocumentModal } from "./DocumentModal";
import { commonApi, docType, makeAccount } from "./transactionsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const onHide = vi.fn();

function open(side: "PAYABLE" | "RECEIVABLE", account = makeAccount()) {
  return renderAt("/zto-finans/test", {
    test: (
      <DocumentModal
        show
        onHide={onHide}
        side={side}
        account={account}
        defaultCurrency="TRY"
        defaultBranchId="b1"
      />
    ),
  });
}

beforeEach(() => {
  fakeApi.reset();
  onHide.mockReset();
  signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"]);
  commonApi();
});
afterEach(cleanup);

describe("DocumentModal", { timeout: 60_000 }, () => {
  it("tedarikçi Borç Ekle: OTHER + ALL türleri, varsayılan Alış Faturası, Kur Farkı yok, fatura bölümü", async () => {
    open("PAYABLE");
    const select = (await screen.findByLabelText(
      /Belge Türü/,
      {},
      { timeout: 20_000 },
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("ALIS_FATURASI"));
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels).toEqual(["Seçiniz...", "Alış Faturası", "Kasa Fişi", "Ceza (bize kesilen)"]);
    expect(screen.getByText("Yeni Borç Ekle")).toBeTruthy();
    expect(await screen.findByText("Fatura Bilgileri", {}, { timeout: 20_000 })).toBeTruthy();
    expect(screen.getByLabelText(/Borca Yansıt/)).toBeTruthy();
    expect(document.querySelector(".modal#addDebtModal")).not.toBeNull();
  });

  it("müşteri Borç Ekle: varsayılan yok (Seçiniz... pasif)", async () => {
    open(
      "PAYABLE",
      makeAccount({ type: "CUSTOMER", subGroup: "MUSTERI", subGroupName: "Müşteri" }),
    );
    const select = (await screen.findByLabelText(
      /Belge Türü/,
      {},
      { timeout: 20_000 },
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3));
    expect(select.value).toBe("");
    expect(select.options[0].disabled).toBe(true);
    // Eksik fatura canlı bölgesi uyarı yokken de DOM'da: boş ve sr-only (F-12.2-R7).
    const region = document.getElementById("debtInvoiceGapNote") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.className).toBe("sr-only");
    expect(region.textContent).toBe("");
  });

  it("zorunlu alan eksikse ZTO iletisi ve aria-invalid yalnız gönderimden sonra", async () => {
    open("PAYABLE");
    const docNo = await screen.findByPlaceholderText("Örn: FTR-2024-001");
    expect(docNo.getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText("Lütfen tüm zorunlu alanları doldurunuz.");
    const after = screen.getByPlaceholderText("Örn: FTR-2024-001");
    expect(after.getAttribute("aria-invalid")).toBe("true");
    expect(after.getAttribute("aria-describedby")).toBe("debtDocumentNo-error");
    expect(fakeApi.log("POST")).toEqual([]);
  });

  it("Kaydet → gövde (vergi hesabı sunucuya bırakılır) ve ZTO başarı iletisi", async () => {
    fakeApi.on("POST", "/finance/accounts/a1/documents", (call: { body?: unknown }) => ({
      id: "doc1",
      ...(call.body as object),
    }));
    open("PAYABLE");
    await waitFor(() =>
      expect((screen.getByLabelText(/Belge Türü/) as HTMLSelectElement).value).toBe(
        "ALIS_FATURASI",
      ),
    );
    fireEvent.change(screen.getByPlaceholderText("Örn: FTR-2024-001"), {
      target: { value: "FTR-9" },
    });
    fireEvent.change(screen.getByLabelText(/Mal Hizmet Toplam Tutar/), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText(/Ödeme Yöntemi/), { target: { value: "BANK" } });
    // KDV %20 önizleme: KDV dahil 1200
    await waitFor(() =>
      expect((document.getElementById("totalPriceIncludingVAT") as HTMLInputElement).value).toBe(
        "1200.00",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(fakeApi.log("POST")).toEqual(["/finance/accounts/a1/documents"]));
    const body = fakeApi.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      side: "PAYABLE",
      documentType: "ALIS_FATURASI",
      documentNo: "FTR-9",
      amount: 1000,
      currency: "TRY",
      paymentMethod: "BANK",
      branchId: "b1",
      reflectToLedger: true,
      tax: { discountRate: 0, vatRate: 20, withholdingAmount: 0, otherTaxesAmount: 0 },
    });
    await waitFor(() => expect(onHide).toHaveBeenCalled());
  });

  it("Alacak Ekle: ceza türü seçilebilir, fatura dışı türde vergi gönderilmez; sunucu hatası modal içinde", async () => {
    fakeApi.on("POST", "/finance/accounts/a1/documents", () => {
      throw apiError(
        422,
        "DOCUMENT_TYPE_INVALID",
        "Belge türü bu cari ve işlem için geçerli değil.",
      );
    });
    open("RECEIVABLE");
    expect(await screen.findByText("Yeni Alacak Ekle")).toBeTruthy();
    const select = screen.getByLabelText(/Belge Türü/) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("SATIS_FATURASI"));
    fireEvent.change(select, { target: { value: "CEZA_KARSI_TARAF" } });
    expect(screen.queryByText("Fatura Bilgileri")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("Örn: IRS-2024-001"), {
      target: { value: "CZ-1" },
    });
    fireEvent.change(screen.getByLabelText(/^.*Tutar/, { selector: "#creditAmount" }), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/Ödeme Yöntemi/), { target: { value: "CASH" } });
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText(/Alacak kaydı eklenirken bir hata oluştu! Belge türü bu cari/);
    const body = fakeApi.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body.documentType).toBe("CEZA_KARSI_TARAF");
    expect(body.tax).toBeUndefined();
    expect(onHide).not.toHaveBeenCalled();
  });

  it("12.2 fatura sayılan türde eksik fatura ve kaydedilince kalan (yansıtılmayan: net düşer)", async () => {
    fakeApi.on("GET", "/finance/account-document-types", [
      docType("PAYABLE", "ALIS_FATURASI", "Alış Faturası", {
        audience: "OTHER",
        invoiceSection: true,
        isDefault: true,
        countsAsInvoice: true,
      }),
    ]);
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
    open("PAYABLE");
    expect(
      await screen.findByText(
        "Kalan 50,00 ₺ için fatura bilgisi eksik.",
        { exact: false },
        { timeout: 20_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText("Bu belge kaydedilince kalan: 50,00 ₺")).toBeTruthy();
    const region = document.getElementById("debtInvoiceGapNote") as HTMLElement;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.className).toBe("col-12 mb-2");
    expect(region.textContent).toContain("Kalan 50,00 ₺ için fatura bilgisi eksik.");
    fireEvent.change(screen.getByLabelText(/Mal Hizmet Toplam Tutar/), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/KDV Oranı/), { target: { value: "0" } });
    fireEvent.click(screen.getByLabelText(/Borca Yansıt/));
    expect(await screen.findByText("Bu belge kaydedilince kalan: 25,00 ₺")).toBeTruthy();
  });
});
