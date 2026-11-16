// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { localToday } from "../../reports/reportDates";
import { CurrenciesPage } from "./CurrenciesPage";
import { apiError, fakeApi, headers, renderAt, signIn } from "./definitionTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const today = localToday();

function render() {
  return renderAt("/zto-finans/tanimlar/para-birimleri", {
    "tanimlar/para-birimleri": <CurrenciesPage />,
  });
}

beforeEach(() => {
  fakeApi.reset();
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
    { code: "GBP", name: "İngiliz Sterlini" },
  ]);
  fakeApi.on("GET", `/finance/exchange-rates?date=${today}`, [
    { currency: "USD", rateDate: "2026-11-13", rate: 34.1234, source: "TCMB" },
  ]);
});
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("CurrenciesPage", () => {
  it("salt okunur liste: ZTO sütunları (Kur Tarihi), kur metni, İşlemler ve Yeni Kayıt yok", async () => {
    signIn(["FINANCE_VIEW"]);
    render();
    expect(await screen.findByRole("heading", { name: /Para Birimi Listesi/ })).toBeTruthy();
    const usd = (await screen.findByText("Amerikan Doları")).closest("tr") as HTMLElement;
    expect(headers()).toEqual(["Adı", "Sembol", "Kur Bilgisi", "Kur Tarihi"]);
    expect(Array.from(usd.children, (td) => td.textContent)).toEqual([
      "Amerikan Doları",
      "$ (USD)",
      "1 USD = 34,1234 ₺",
      "13.11.2026",
    ]);
    const tryRow = screen.getByText("Türk Lirası").closest("tr") as HTMLElement;
    expect(tryRow.children[2].textContent).toBe("—");
    const gbp = screen.getByText("İngiliz Sterlini").closest("tr") as HTMLElement;
    expect(gbp.children[2].textContent).toBe("Kur bulunamadı");
    expect(screen.queryByRole("button", { name: /Kurları Yenile/ })).toBeNull();
    expect(screen.queryByText(/Yeni Kayıt/)).toBeNull();
    expect(document.querySelector("ol.breadcrumb")?.textContent).toContain("Temel Tanımlar");
  });

  it("FINANCE_MANAGE: Kurları Yenile → 202, snackbar", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_MANAGE"]);
    fakeApi.on("POST", "/finance/exchange-rates/refresh", undefined);
    render();
    fireEvent.click(await screen.findByRole("button", { name: /Kurları Yenile/ }));
    await waitFor(() => expect(fakeApi.log("POST")).toEqual(["/finance/exchange-rates/refresh"]));
    expect(await screen.findByText("Kur güncelleme isteği alındı.")).toBeTruthy();
  });

  it("yenileme hatası sunucu iletisiyle; yükleme hatası uyarıda", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_MANAGE"]);
    fakeApi.on("POST", "/finance/exchange-rates/refresh", () => {
      throw apiError(403, "FORBIDDEN", "Yetkiniz yok");
    });
    fakeApi.on("GET", `/finance/exchange-rates?date=${today}`, () => {
      throw apiError(500, "INTERNAL", "Kur servisi yanıt vermedi");
    });
    render();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Kur servisi yanıt vermedi/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kurları Yenile/ }));
    expect(await screen.findByText("Kurlar yenilenemedi: Yetkiniz yok")).toBeTruthy();
  });
});
