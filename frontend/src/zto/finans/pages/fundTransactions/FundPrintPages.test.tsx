// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { TWO_COMPANIES, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { MANAGER, makeDetail, makeFund, mockFundCommon } from "../funds/fundsTestUtils";
import { FundActivityReportPage } from "./FundActivityReportPage";
import { FundExtractPage } from "./FundExtractPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
  apiBlobUrl: async () => "blob:logo",
}));

const download = vi.hoisted(() => vi.fn());
vi.mock("../../../export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../export")>()),
  downloadBlob: download,
}));

const ROUTES = {
  "banka-ekstre/:id": <FundExtractPage kind="BANK" />,
  "kasa-ekstre/:id": <FundExtractPage kind="CASH" />,
  "faaliyet-raporu/:id": <FundActivityReportPage />,
};

/** Sunucunun gerçek biçimi: `GET /funds/{id}/statement` kısa kurucuyla `currency` null döner. */
const line = (
  id: string,
  direction: "IN" | "OUT",
  amount: number,
  balance: number,
  sourceType = "MANUAL",
) => ({
  id,
  date: "2026-11-10",
  direction,
  amount,
  exchangeRate: null,
  tlAmount: null,
  description: `açıklama ${id}`,
  sourceType,
  balance,
  currency: null,
  companyId: "c1",
  branchId: "b1",
  sourceId: "s",
  kind: "",
  sign: direction === "IN" ? 1 : -1,
  reversal: false,
  reversed: false,
  transferRole: null,
  documentNo: null,
  documentType: null,
  documentDate: null,
  dueDate: null,
  paymentMethod: null,
  createdBy: "u",
  createdAt: "2026-11-10T00:00:00Z",
});

beforeEach(() => {
  fakeApi.reset();
  download.mockReset();
  signIn(MANAGER, TWO_COMPANIES);
  mockFundCommon();
  fakeApi.on("GET", "/finance/funds/f1", makeDetail({ futureCount: 1, futureNet: 75 }));
  fakeApi.on("GET", /^\/organization\/companies\/c1$/, {
    id: "c1",
    title: "Acme Lojistik A.Ş.",
    logoFileId: "logo1",
  });
  fakeApi.on("GET", /^\/finance\/funds\/f1\/statement\?/, (call: { path: string }) => ({
    currency: "TRY",
    openingBalance: 1000,
    openingBalances: [{ currency: "TRY", amount: 1000 }],
    lines: call.path.includes("page=0")
      ? [line("l1", "IN", 500, 1500)]
      : [line("l2", "OUT", 200, 1300, "REVERSAL")],
    page: 0,
    size: 200,
    totalElements: 2,
    totalPages: 2,
  }));
});

afterEach(cleanup);

describe("FundExtractPage (ZTO BankExtract / CashExtract)", { timeout: 30_000 }, () => {
  it("şirket başlığı, DEVİR, sayfalar, özet, ileri tarih notu, CSV ve @page", async () => {
    renderAt("/zto-finans/banka-ekstre/f1?from=2026-11-01&to=2026-11-14", ROUTES);
    expect(await screen.findByText("BANKA EKSTRESİ")).toBeTruthy();
    await screen.findByText("açıklama l2");
    expect(screen.getByText("Acme Lojistik A.Ş.")).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector(".company-name img")?.getAttribute("src")).toBe("blob:logo"),
    );
    expect(screen.getByText("DEVİR")).toBeTruthy();
    expect(screen.getByText("Banka Markası:")).toBeTruthy();
    expect(screen.getByText("Şirket:")).toBeTruthy();
    expect(screen.getByText("2 adet")).toBeTruthy();
    expect(screen.getByText("1.300,00 ₺")).toBeTruthy();
    expect(screen.getByText(/1 adet ileri tarihli hareket bulunuyor/)).toBeTruthy();
    expect(screen.getByText("Çıkış (İptal)")).toBeTruthy();
    expect(document.getElementById("zto-fund-extract-page")?.textContent).toContain("A4 landscape");
    const statementCalls = fakeApi.log("GET").filter((p) => p.includes("/statement?"));
    expect(statementCalls).toEqual([
      "/finance/funds/f1/statement?from=2026-11-01&to=2026-11-14&page=0&size=200",
      "/finance/funds/f1/statement?from=2026-11-01&to=2026-11-14&page=1&size=200",
    ]);
    // Döviz hücresi satırda para birimi yokken fonun para birimi (F-12.2-2).
    const currencyCells = [...document.querySelectorAll("tbody td.col-currency")].map(
      (td) => td.textContent,
    );
    expect(currencyCells.length).toBeGreaterThanOrEqual(2);
    expect(currencyCells.every((text) => text === "TRY")).toBe(true);
    expect(() => fireEvent.click(screen.getByRole("button", { name: /CSV İndir/ }))).not.toThrow();
    expect(download.mock.calls[0][1]).toBe("banka_ekstresi_ZRT1_20261101_20261114.csv");
    const csv = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(download.mock.calls[0][0] as Blob);
    });
    expect(csv).toContain('"açıklama l1"');
    expect(csv).not.toContain('"null"');
    // Satır 0 başlık, 1 DEVİR, 2 ilk hareket.
    expect(csv.split(String.fromCharCode(10))[2]).toContain(';"TRY";');
    fireEvent.change(document.getElementById("filterStart") as Element, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Filtrele" }));
    expect(screen.getByRole("alert").textContent).toBe("Lütfen başlangıç ve bitiş tarihi seçiniz.");
  });

  it("kasa ekstresi metinleri", async () => {
    fakeApi.on(
      "GET",
      "/finance/funds/f1",
      makeDetail({ kind: "CASH", bankName: null, iban: null }),
    );
    renderAt("/zto-finans/kasa-ekstre/f1", ROUTES);
    expect(await screen.findByText("KASA EKSTRESİ")).toBeTruthy();
    expect(screen.getByText("Kasa Hesap Bilgileri")).toBeTruthy();
    expect(document.querySelector(".fund-extract-cash")).toBeTruthy();
  });
});

describe("FundActivityReportPage (ZTO ActivityReport)", { timeout: 30_000 }, () => {
  it("özet kartları, FIFO satırları, harcanmamış girişler, Excel", async () => {
    fakeApi.on("GET", /^\/finance\/funds\/f1\/activity-report\?/, {
      fund: makeFund(),
      from: "2026-10-01",
      to: "2026-10-31",
      opening: 100,
      totalIn: 80,
      totalOut: 160,
      net: 20,
      unmatchedOut: 5,
      inflows: [
        {
          no: 1,
          id: null,
          date: "2026-10-01",
          accountingType: "OPENING",
          description: null,
          amount: 100,
          remaining: 0,
          outflows: [
            {
              id: "o1",
              date: "2026-10-05",
              accountingType: "EXPENSE",
              description: "masraf",
              amount: 100,
            },
          ],
        },
        {
          no: 2,
          id: "i1",
          date: "2026-10-02",
          accountingType: "INCOME",
          description: "gelir",
          amount: 80,
          remaining: 20,
          outflows: [],
        },
      ],
      unspent: [
        {
          no: 2,
          date: "2026-10-02",
          accountingType: "INCOME",
          description: "gelir",
          original: 80,
          remaining: 20,
          used: 60,
        },
      ],
    });
    renderAt("/zto-finans/faaliyet-raporu/f1?from=2026-10-01&to=2026-10-31", ROUTES);
    expect(await screen.findByText("Banka Faaliyet Raporu")).toBeTruthy();
    expect(screen.getByText("BAŞLANGIÇ")).toBeTruthy();
    expect(screen.getByText("Harcanmamış Girişler")).toBeTruthy();
    expect(screen.getAllByText("Masraf").length).toBeGreaterThan(0);
    expect(screen.getByText("Eşleşmeyen çıkış: 5,00")).toBeTruthy();
    expect(document.querySelectorAll(".fifo-table tbody tr")).toHaveLength(3);
    expect(document.title).toBe("Banka Faaliyet Raporu - FIFO Analizi");
    fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
    expect(download.mock.calls[0][1]).toBe("fifo_raporu.csv");
  });

  it("hata iletisi", async () => {
    fakeApi.on("GET", /^\/finance\/funds\/f1\/activity-report\?/, () => {
      throw new Error("RESULT_TOO_LARGE");
    });
    renderAt("/zto-finans/faaliyet-raporu/f1", ROUTES);
    expect(await screen.findByText(/Rapor yüklenemedi: RESULT_TOO_LARGE/)).toBeTruthy();
  });
});
