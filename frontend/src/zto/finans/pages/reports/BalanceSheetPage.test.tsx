// @vitest-environment jsdom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { useCompanyStore } from "../../../../auth/companyStore";
import type {
  BalanceSheet,
  BalanceSheetCurrency,
  BalanceSheetWorkplace,
} from "../../../../pages/finance/types";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { BalanceSheetPage } from "./BalanceSheetPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

vi.setConfig({ testTimeout: 30_000 });
configure({ asyncUtilTimeout: 8000 });

const ROUTES = { bilanco: <BalanceSheetPage /> };

function block(overrides: Partial<BalanceSheetCurrency> = {}): BalanceSheetCurrency {
  return {
    currency: "TRY",
    debt: "1000",
    payment: "400",
    receivable: "2500",
    collection: "500",
    bank: "5000",
    cash: "750.4",
    receivedChecks: "300",
    receivedNotes: "200",
    issuedChecks: "100",
    issuedNotes: "0",
    receivedCheckCount: 2,
    receivedNoteCount: 1,
    issuedCheckCount: 1,
    issuedNoteCount: 0,
    accountReceivable: "2000",
    accountPayable: "600",
    bankOverdraft: "2000",
    fxAdjustment: "500",
    net: "1400",
    assets: "8250",
    liabilities: "2700",
    tlAssets: "8250",
    tlLiabilities: "2700",
    ...overrides,
  };
}

function workplace(overrides: Partial<BalanceSheetWorkplace> = {}): BalanceSheetWorkplace {
  return {
    branchId: "b1",
    branchName: "Merkez",
    branchGroupName: "İzmir",
    companyId: "c1",
    companyName: "Acme",
    assetsTl: "8250",
    liabilitiesTl: "2700",
    netTl: "5550",
    currencyCount: 2,
    accountCount: 3,
    currencies: [
      block(),
      block({ currency: "USD", net: "-50", bankOverdraft: "0", fxAdjustment: "0" }),
    ],
    accounts: [
      {
        accountId: "a1",
        accountCode: "MUS-1",
        accountName: "Kuzey Lojistik",
        subGroupName: "Müşteri",
        masked: false,
        balances: [{ currency: "TRY", amount: "1500" }],
      },
      {
        accountId: "a2",
        accountCode: "TED-1",
        accountName: "Batı Nakliye",
        subGroupName: "Tedarikçi",
        masked: false,
        balances: [{ currency: "TRY", amount: "-200" }],
      },
      {
        accountId: null,
        accountCode: null,
        accountName: null,
        subGroupName: "Personel (Sürücü)",
        masked: true,
        balances: [{ currency: "TRY", amount: "0" }],
      },
    ],
    ...overrides,
  };
}

function sheet(overrides: Partial<BalanceSheet> = {}): BalanceSheet {
  return {
    asOf: "2026-11-16",
    rateDate: "2026-11-15",
    rates: [{ currency: "USD", rate: "32.5", rateDate: "2026-11-15" }],
    missingRates: [],
    assetsTl: "12345.6",
    liabilitiesTl: "20000",
    netTl: "-7654.4",
    workplaceCount: 1,
    companies: [
      {
        companyId: "c1",
        companyName: "Acme",
        assetsTl: "8250",
        liabilitiesTl: "2700",
        netTl: "5550",
      },
    ],
    workplaces: [workplace()],
    intercompany: [
      {
        accountId: "i1",
        accountName: "Beta Grup Carisi",
        representsCompanyId: "c2",
        companyId: "c1",
        balances: [{ currency: "TRY", amount: "300" }],
      },
    ],
    creditDepositPending: true,
    ...overrides,
  };
}

const sheetCalls = () =>
  fakeApi.log("GET").filter((p) => p.startsWith("/finance/reports/balance-sheet"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
  fakeApi.reset();
  signIn(["FINANCE_VIEW"]);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Finansal Bilanço", () => {
  it("başlık, genel özet, kapalı kart, akordeon klavyeyle açılır", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, sheet());
    renderAt("/zto-finans/bilanco", ROUTES);
    await waitFor(() => expect(document.querySelector(".fbs-wp-card")).not.toBeNull());
    expect(
      document.querySelector(".zto-finans")?.classList.contains("zto-page-financial-balance-sheet"),
    ).toBe(true);
    expect(sheetCalls()[0]).toBe("/finance/reports/balance-sheet?asOf=2026-11-16");
    expect(screen.getByText("Finansal Bilanço")).toBeTruthy();
    expect(document.querySelector(".col-md-5 small strong")?.textContent).toBe("15.11.2026");

    const values = Array.from(
      document.querySelectorAll(".fbs-grand-summary .gs-value"),
      (v) => v.textContent,
    );
    expect(values).toEqual(["12.346 ₺", "20.000 ₺", "-7.654 ₺", "1"]);
    expect(screen.getByText("Negatif")).toBeTruthy();
    expect(screen.getByText(/Genel toplamlarda cari bakiyeleri şirket düzeyinde/)).toBeTruthy();
    expect(screen.getByText(/Kredi ve vadeli mevduat kalemleri/)).toBeTruthy();

    const card = document.querySelector(".fbs-wp-card") as HTMLElement;
    const header = card.querySelector(".fbs-wp-header") as HTMLElement;
    const body = document.getElementById("wp-body-b1") as HTMLElement;
    expect(header.getAttribute("role")).toBe("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(header.getAttribute("aria-controls")).toBe("wp-body-b1");
    expect(body.hidden).toBe(true);
    expect(card.querySelector(".mini-stock")).toBeNull();
    expect(
      Array.from(card.querySelectorAll(".wp-stats-mini .stat-chip"), (c) => c.textContent),
    ).toEqual(["2 Para Birimi", "3 Cari"]);

    header.focus();
    fireEvent.keyDown(header, { key: "Enter" });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(card.classList.contains("is-open")).toBe(true);
    expect(body.hidden).toBe(false);
    fireEvent.keyDown(header, { key: " " });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(header, { key: "ArrowDown" });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(header);
    expect(body.hidden).toBe(false);
  });

  it("para birimi bloğu: rozet işareti, likidite, net, KMH ve kur farkı bilgi satırları, 3'lü alt şerit", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, sheet());
    renderAt("/zto-finans/bilanco", ROUTES);
    await waitFor(() => expect(document.querySelector(".fbs-currency-block")).not.toBeNull());
    const [tl, usd] = Array.from(document.querySelectorAll<HTMLElement>(".fbs-currency-block"));
    await waitFor(() => expect(tl.querySelector(".cb-name")?.textContent).toBe("Türk Lirası"));
    expect(tl.querySelector(".cb-net-badge")?.textContent).toBe("(+) Borçlu Bakiye");
    expect((tl.querySelector(".cb-net-badge") as HTMLElement).style.color).toBe("rgb(220, 38, 38)");
    expect(usd.querySelector(".cb-net-badge")?.textContent).toBe("(−) Alacaklı Bakiye");
    expect(usd.querySelector(".cb-net-summary strong i")?.className).toBe("fas fa-arrow-down");
    expect(Array.from(tl.querySelectorAll(".liq-value"), (v) => v.textContent)).toEqual([
      "5.000 ₺",
      "750 ₺",
      "500 ₺",
      "100 ₺",
    ]);
    expect(Array.from(tl.querySelectorAll(".liq-count"), (v) => v.textContent)).toEqual([
      "2 çek · 1 senet",
      "1 çek",
    ]);
    expect(tl.textContent).toContain("Eksi bakiyeli banka hesabı (KMH): 2.000 ₺");
    expect(tl.textContent).toContain("Açık kaynaklı kur farkı (değerlemede düşüldü): 500 ₺");
    expect(usd.textContent).not.toContain("KMH");
    expect(document.querySelectorAll(".fbs-wp-footer .footer-stat")).toHaveLength(3);
    expect(document.querySelector(".fbs-tcmb-info")?.textContent).toContain(
      "TCMB Kurları (15.11.2026): 1 $ = 32,50 ₺",
    );
  });

  it("cari listesi: bağlantı yeni sekme, maskeli personel, arama; grup şirketi bakiyesi", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, sheet());
    renderAt("/zto-finans/bilanco", ROUTES);
    await waitFor(() => expect(document.querySelector(".fbs-cari-item")).not.toBeNull());
    const list = document.getElementById("cariList_b1") as HTMLElement;
    // Kart kapalıyken gövde gizli (erişilebilirlik ağacında yok); açınca bağlantı görünür.
    expect(within(list).queryByRole("link", { name: /Kuzey Lojistik/ })).toBeNull();
    fireEvent.click(document.querySelector(".fbs-wp-header") as HTMLElement);
    const link = within(list).getByRole("link", { name: /Kuzey Lojistik/ });
    expect(link.getAttribute("href")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("title")).toBe("Kuzey Lojistik — Müşteri (Yeni sekme)");
    expect(link.querySelector(".fbs-cari-balance")?.className).toBe("fbs-cari-balance borcli");
    const masked = list.querySelector("div.fbs-cari-item") as HTMLElement;
    expect(masked.textContent).toContain("Personel carisi");
    expect(masked.querySelector("a")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cari ara..."), { target: { value: "batı" } });
    expect(list.querySelectorAll(".fbs-cari-item")).toHaveLength(1);

    const iwp = document.querySelector(".fbs-iwp-item") as HTMLElement;
    expect(iwp.textContent).toContain("Beta Grup Carisi");
    expect(iwp.textContent).toContain("Alacaklıyız");
    expect(iwp.querySelector(".fbs-iwp-arrow i")?.className).toBe(
      "fas fa-long-arrow-alt-left text-danger",
    );
  });

  it("çok şirkette Konsolide seçici, şirket grubu başlığı, eksik kur uyarısı, boş iş yeri", async () => {
    signIn(["FINANCE_VIEW"], TWO_COMPANIES);
    useCompanyStore.setState({ activeCompanyId: null });
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, (call: { path: string }) =>
      call.path.includes("companyId=c2")
        ? sheet({ workplaces: [], companies: [], workplaceCount: 0 })
        : sheet({
            missingRates: ["CHF"],
            companies: [
              {
                companyId: "c1",
                companyName: "Acme",
                assetsTl: "8250",
                liabilitiesTl: "2700",
                netTl: "5550",
              },
              {
                companyId: "c2",
                companyName: "Beta",
                assetsTl: "100",
                liabilitiesTl: "0",
                netTl: "100",
              },
            ],
            workplaces: [
              workplace(),
              workplace({
                branchId: "b9",
                branchName: "Ankara",
                companyId: "c2",
                companyName: "Beta",
                currencies: [],
                accounts: [],
              }),
            ],
          }),
    );
    renderAt("/zto-finans/bilanco", ROUTES);
    await waitFor(() => expect(document.querySelectorAll(".fbs-company-group")).toHaveLength(2));
    expect(
      screen.getByText("Kur bulunamadı: CHF — bu para birimi TL toplamlarına katılmadı."),
    ).toBeTruthy();
    const heads = Array.from(
      document.querySelectorAll(".fbs-company-group h6.mb-0"),
      (h) => h.textContent,
    );
    expect(heads).toEqual(["Acme", "Beta"]);
    expect(
      document.querySelector('.fbs-company-group[data-company-id="c2"]')?.textContent,
    ).toContain("Bu iş yerinde henüz finansal hareket yok.");
    const select = document.getElementById("fbsCompany") as HTMLSelectElement;
    expect(select.value).toBe("all");
    fireEvent.change(select, { target: { value: "c2" } });
    await waitFor(() => expect(sheetCalls().at(-1)).toContain("companyId=c2"));
    await waitFor(() =>
      expect(screen.getByText("Henüz aktif iş yeri tanımlanmamış.")).toBeTruthy(),
    );
  });

  it("rapor isteği hata verirse hata uyarısı; özet ve akordeon yok", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, () => {
      throw apiError(500, "INTERNAL", "Sunucu hatası");
    });
    renderAt("/zto-finans/bilanco", ROUTES);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Bilanço yüklenemedi: Sunucu hatası");
    expect(document.querySelector(".fbs-grand-summary")).toBeNull();
    expect(document.querySelector(".fbs-wp-header")).toBeNull();
  });

  it("tarih ileri olamaz: istek atılmaz", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/balance-sheet/, sheet());
    renderAt("/zto-finans/bilanco", ROUTES);
    await waitFor(() => expect(sheetCalls()).toHaveLength(1));
    const date = document.getElementById("fbsAsOf") as HTMLInputElement;
    expect(date.max).toBe("2026-11-16");
    await waitFor(() => expect(document.querySelector(".fbs-grand-summary")).not.toBeNull());
    fireEvent.change(date, { target: { value: "2026-12-01" } });
    expect(date.getAttribute("aria-invalid")).toBe("true");
    // Görünür uyarı; bugünün önbellekteki bilançosu ileri tarihinmiş gibi gösterilmez.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Tarih bugünden ileri olamaz.");
    expect(alert.id).toBe("fbsAsOfError");
    expect(date.getAttribute("aria-describedby")).toBe("fbsAsOfError");
    expect(document.querySelector(".fbs-grand-summary")).toBeNull();
    expect(sheetCalls().some((p) => p.includes("2026-12-01"))).toBe(false);
    // Yarım/boş tarih: ayrı metin.
    fireEvent.change(date, { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toBe("Geçerli bir tarih girin.");
    fireEvent.change(date, { target: { value: "2026-10-31" } });
    await waitFor(() =>
      expect(sheetCalls().at(-1)).toBe("/finance/reports/balance-sheet?asOf=2026-10-31"),
    );
    expect(sheetCalls().some((p) => p.includes("2026-12-01"))).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(date.hasAttribute("aria-describedby")).toBe(false);
    await waitFor(() => expect(document.querySelector(".fbs-grand-summary")).not.toBeNull());
  });
});
