// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { FxDifferenceReport, FxDifferenceRow } from "../../../../pages/finance/types";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { FxDifferenceReportPage } from "./FxDifferenceReportPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    fakeApi.request(method, path, body, headers),
}));

const VIEW = ["FINANCE_VIEW"];
const CUTTER = ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"];
const MANAGER = ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE", "FINANCE_MANAGE"];

function row(overrides: Partial<FxDifferenceRow> = {}): FxDifferenceRow {
  return {
    transactionId: "t1",
    accountId: "a1",
    accountCode: "MUS-001",
    accountName: "Deniz Lojistik",
    accountActive: true,
    companyId: "c1",
    branchId: "b1",
    direction: "DEBIT",
    transactionDate: "2026-10-01",
    sourceType: "PURCHASE_INVOICE",
    documentNo: "FTR-9",
    documentTypeName: null,
    amount: "1000.00",
    currency: "USD",
    transactionRate: "30.0000",
    tlAmount: "30000.00",
    currentRate: null,
    currentRateDate: null,
    currentTl: null,
    difference: null,
    effect: null,
    openRemaining: "1000.00",
    closedOn: null,
    valuationBlock: null,
    cut: null,
    ...overrides,
  };
}

const RATED = {
  currentRate: "34.0000",
  currentRateDate: "2026-11-16",
  currentTl: "34000.00",
  difference: "4000.00",
  effect: "GAIN" as const,
};

function report(rows: FxDifferenceRow[], extra: Partial<FxDifferenceReport> = {}) {
  return {
    valuationDate: "2026-11-16",
    withRates: false,
    missingRates: [],
    rows,
    page: 0,
    size: 2000,
    totalElements: rows.length,
    totalPages: 1,
    ...extra,
  } satisfies FxDifferenceReport;
}

function api(withRatesRows: FxDifferenceRow[] = [row({ ...RATED, openRemaining: "400.00" })]) {
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/reports\/fx-differences\?/, (call: { path: string }) =>
    call.path.includes("withRates=true")
      ? report(withRatesRows, { withRates: true, missingRates: ["CHF"] })
      : report([row()]),
  );
}

function render() {
  return renderAt("/zto-finans/kur-farki-raporu", {
    "kur-farki-raporu": <FxDifferenceReportPage />,
  });
}

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 30_000 });

describe("FxDifferenceReportPage", () => {
  it("açılış: ZTO iskeleti, rcpdt şeridi, kurlar '-' ve Kes pasif", async () => {
    signIn(CUTTER);
    api();
    render();
    const name = await screen.findByText("Deniz Lojistik");
    expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-fx-report");
    expect(document.querySelector(".rcp-page > ol.rcp-breadcrumb.no-print a")?.textContent).toBe(
      "Finans Raporları",
    );
    expect(document.querySelector(".fx-hero.rcp-hero")?.textContent).toContain("Kur Farkı Raporu");
    const table = document.getElementById("fxTable") as HTMLTableElement;
    expect(table.className).toBe("table table-bordered table-hover fx-phone-card-table");
    expect(table.classList.contains("dataTable")).toBe(false);
    expect(document.querySelector(".rcpdt-bar + .table-responsive #fxTable")).not.toBeNull();
    const ths = Array.from(table.tHead?.rows[0].cells ?? []);
    expect(ths).toHaveLength(12);
    expect(ths[11].className).toBe("no-print");
    const tr = name.closest("tr") as HTMLTableRowElement;
    expect(tr.cells[0].querySelector(".badge.badge-success")?.textContent).toBe("Alacak");
    expect(tr.cells[3].textContent).toBe("FTR-9Alış faturası");
    expect(tr.cells[4].getAttribute("data-label")).toBe("Tutar (döviz)");
    // PB: ZTO sembolü yazar (FxReport.cshtml:166 CurrencySymbol), ISO kodu değil.
    const pb = tr.querySelector('td[data-label="PB"]');
    expect(pb).toBe(tr.cells[5]);
    expect(pb?.textContent).toBe("$");
    expect(tr.cells[8].textContent).toBe("-");
    expect(tr.cells[10].textContent).toBe("-");
    expect(tr.cells[11].getAttribute("data-label")).toBe("İşlem");
    const cut = within(tr).getByRole("button", { name: /Kur farkı cari kaydını kes/ });
    expect(cut.className).toBe("btn btn-outline-dark btn-sm fx-cut");
    expect(cut.querySelector("i.fas.fa-cut")).not.toBeNull();
    expect(cut.getAttribute("title")).toBe("Kur farkı cari kaydını kes");
    expect((cut as HTMLButtonElement).disabled).toBe(true);
    expect(fakeApi.log("GET").some((p) => p.includes("withRates=true"))).toBe(false);
  });

  it("FINANCE_PAYMENT_CREATE yoksa Kes düğmesi yok", async () => {
    signIn(VIEW);
    api();
    render();
    await screen.findByText("Deniz Lojistik");
    expect(document.querySelector(".fx-cut")).toBeNull();
  });

  it("Güncel Kurları Getir (MANAGE) → yenile + withRates; Kes → onay → POST, snackbar", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/exchange-rates/refresh", undefined);
    fakeApi.on("POST", "/finance/fx-differences", { id: "d1", documentNo: "KF-FTR-9" });
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    await waitFor(() =>
      expect(fakeApi.log("GET").some((p) => p.includes("withRates=true"))).toBe(true),
    );
    expect(fakeApi.log("POST")).toContain("/finance/exchange-rates/refresh");
    expect(await screen.findByText("Kur bulunamadı: CHF")).toBeTruthy();
    const diff = await screen.findByText("+4.000,00");
    expect(diff.className).toBe("text-right fx-diff fx-pos");
    const tr = diff.closest("tr") as HTMLTableRowElement;
    const cut = within(tr).getByRole("button", { name: /Kur farkı cari kaydını kes/ });
    await waitFor(() => expect((cut as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(cut);
    const modal = (
      await screen.findByText("Bu hareket için kur farkı cari kaydı kesilsin mi?")
    ).closest(".modal") as HTMLElement;
    expect(modal.textContent).toContain(
      "Tutar: 4.000,00 TL · Alacak kaydı (aynı yön) · Kur: 34,0000 (16.11.2026)",
    );
    expect(modal.textContent).toContain(
      "Kaynağın 400,00 USD'si açık; fark tüm tutardan hesaplanır.",
    );
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Vazgeç"));
    fireEvent.click(within(modal).getByRole("button", { name: /Kes/ }));
    expect(
      await screen.findByText("Kur farkı kaydı oluşturuldu: 4.000,00 TL (aynı yön)."),
    ).toBeTruthy();
    const post = fakeApi.calls.find((c) => c.path === "/finance/fx-differences");
    expect(post?.body).toEqual({
      sourceTransactionId: "t1",
      valuationDate: "2026-11-16",
      expectedDifference: "4000.00",
    });
  });

  it("yenileme 5xx'te snackbar ve kayıtlı kurlarla sorgu; FINANCE_MANAGE yoksa yenileme yok", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/exchange-rates/refresh", () => {
      throw apiError(503, "UNAVAILABLE", "Servis yok");
    });
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    expect(
      await screen.findByText("Kurlar yenilenemedi; kayıtlı kurlarla devam ediliyor."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(fakeApi.log("GET").some((p) => p.includes("withRates=true"))).toBe(true),
    );
    cleanup();
    fakeApi.reset();
    signIn(CUTTER);
    api();
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    await waitFor(() =>
      expect(fakeApi.log("GET").some((p) => p.includes("withRates=true"))).toBe(true),
    );
    expect(fakeApi.log("POST")).toEqual([]);
  });

  it("kapanmış kaynak: kur hücreleri '-', Kes pasif ve tarihli başlık; pasif cari başlığı", async () => {
    signIn(CUTTER);
    api([
      row({ valuationBlock: "SETTLED", closedOn: "2026-10-10" }),
      row({ ...RATED, transactionId: "t2", accountName: "Pasif Cari", accountActive: false }),
    ]);
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    const settled = await screen.findByTitle(
      "Kaynak 10.10.2026 tarihinde kapandı; kur tarihini en çok bu tarih seçin.",
    );
    expect((settled as HTMLButtonElement).disabled).toBe(true);
    const tr = settled.closest("tr") as HTMLTableRowElement;
    expect(tr.cells[8].textContent).toBe("-");
    expect(tr.cells[10].textContent).toBe("-");
    const inactive = screen.getByTitle("Pasif cariye işlem girilemez.") as HTMLButtonElement;
    expect(inactive.disabled).toBe(true);
  });

  it("FX_DIFFERENCE_CHANGED: snackbar ve otomatik yeniden sorgu; kesilmiş satırda ✓ + belge no", async () => {
    signIn(CUTTER);
    let cut = false;
    api();
    fakeApi.on("GET", /^\/finance\/reports\/fx-differences\?/, (call: { path: string }) =>
      call.path.includes("withRates=true")
        ? report(
            [
              row({
                ...RATED,
                cut: cut
                  ? {
                      documentId: "d1",
                      documentNo: "KF-FTR-9",
                      side: "RECEIVABLE",
                      amount: "4000.00",
                      documentDate: "2026-11-16",
                    }
                  : null,
              }),
            ],
            { withRates: true },
          )
        : report([row()]),
    );
    fakeApi.on("POST", "/finance/fx-differences", () => {
      cut = true;
      throw apiError(409, "FX_DIFFERENCE_CHANGED", "Kur farkı değişti; raporu yenileyin.");
    });
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    const button = await screen.findByRole("button", { name: /Kur farkı cari kaydını kes/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    const modal = (await screen.findByText(/kesilsin mi/)).closest(".modal") as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: /Kes/ }));
    expect(await screen.findByText("Kur farkı değişti; raporu yenileyin.")).toBeTruthy();
    const link = await screen.findByRole("link", { name: "KF-FTR-9" });
    expect(link.getAttribute("href")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
    expect(document.querySelector(".fx-cut")).toBeNull();
  });

  it("boş liste: ZTO boş satırı (colspan 12)", async () => {
    signIn(CUTTER);
    api();
    fakeApi.on("GET", /^\/finance\/reports\/fx-differences\?/, report([]));
    render();
    const empty = await screen.findByText(
      "Dövizli cari hareket bulunamadı (yalnız TL dışı kayıtlar listelenir).",
    );
    expect(empty.getAttribute("colspan")).toBe("12");
  });

  it("rapor isteği hata verirse boş satırda hata metni; Kes düğmesi ve veri satırı yok", async () => {
    signIn(CUTTER);
    api();
    fakeApi.on("GET", /^\/finance\/reports\/fx-differences\?/, () => {
      throw apiError(500, "INTERNAL", "Sunucu hatası");
    });
    const { container } = render();
    const message = await screen.findByText("Rapor yüklenemedi: Sunucu hatası");
    expect(message.matches('td[colspan="12"]')).toBe(true);
    expect(container.querySelector("button.fx-cut")).toBeNull();
    const body = (document.getElementById("fxTable") as HTMLTableElement).tBodies[0];
    expect(body.rows).toHaveLength(1);
    expect(screen.queryByText("Deniz Lojistik")).toBeNull();
  });

  it("Kes: hata sonrası aynı Idempotency-Key, başarı sonrası yeni anahtar", async () => {
    signIn(CUTTER);
    api([row({ ...RATED })]);
    let posts = 0;
    fakeApi.on("POST", "/finance/fx-differences", () => {
      posts += 1;
      if (posts === 1) throw apiError(503, "UNAVAILABLE", "Geçici hata");
      return { id: `d${posts}`, documentNo: `KF-FTR-${posts}` };
    });
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.click(screen.getByRole("button", { name: /Güncel Kurları Getir/ }));
    await screen.findByText("+4.000,00");

    const cutOnce = async () => {
      const button = await screen.findByRole("button", { name: /Kur farkı cari kaydını kes/ });
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button);
      const modal = (await screen.findByText(/kesilsin mi/)).closest(".modal") as HTMLElement;
      fireEvent.click(within(modal).getByRole("button", { name: /Kes/ }));
    };

    await cutOnce();
    expect(await screen.findByText("Geçici hata")).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".modal.show")).toBeNull());
    await cutOnce();
    expect(
      await screen.findByText("Kur farkı kaydı oluşturuldu: 4.000,00 TL (aynı yön)."),
    ).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".modal.show")).toBeNull());
    await cutOnce();
    await waitFor(() => expect(posts).toBe(3));

    const keys = fakeApi.calls
      .filter((c) => c.method === "POST" && c.path === "/finance/fx-differences")
      .map((c) => c.headers?.["Idempotency-Key"]);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBeTruthy();
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("Filtrele süzgeci istekle gönderir", async () => {
    signIn(CUTTER);
    api();
    render();
    await screen.findByText("Deniz Lojistik");
    fireEvent.change(screen.getByLabelText("Para birimi"), { target: { value: "USD" } });
    fireEvent.change(screen.getByLabelText("Kesim durumu"), { target: { value: "OPEN" } });
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() =>
      expect(
        fakeApi.log("GET").some((p) => p.includes("currency=USD") && p.includes("cutState=OPEN")),
      ).toBe(true),
    );
  });
});
