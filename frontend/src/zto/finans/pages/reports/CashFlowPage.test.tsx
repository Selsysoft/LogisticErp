// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { CashFlow, CashFlowWeek } from "../../../../pages/finance/types";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { CashFlowPage } from "./CashFlowPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

function week(index: number, overrides: Partial<CashFlowWeek> = {}): CashFlowWeek {
  const day = 16 + (index - 1) * 7;
  const iso = (d: number) =>
    d > 30 ? `2026-12-${String(d - 30).padStart(2, "0")}` : `2026-11-${String(d).padStart(2, "0")}`;
  return {
    index,
    weekStart: iso(day),
    weekEnd: iso(day + 6),
    receivableDue: "1500.00",
    receivedChecks: "0.00",
    issuedChecks: "2000.00",
    notesInfo: "75.00",
    payableDue: "0.00",
    net: "-500.00",
    cumulative: String(-500 * index),
    ...overrides,
  };
}

function flow(currency: string | null = null): CashFlow {
  return {
    today: "2026-11-16",
    weeks: 8,
    currency,
    rateDate: "2026-11-16",
    missingRates: currency ? [] : ["CHF"],
    rows: Array.from({ length: 8 }, (_, i) =>
      week(i + 1, i === 0 ? { net: "1000.00", cumulative: "1000.00" } : {}),
    ),
    planExcluded: true,
  };
}

function render() {
  return renderAt("/zto-finans/nakit-akis", { "nakit-akis": <CashFlowPage /> });
}

beforeEach(() => {
  fakeApi.reset();
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/reports\/cash-flow\?/, (call: { path: string }) =>
    flow(call.path.includes("currency=USD") ? "USD" : null),
  );
});
afterEach(cleanup);
vi.setConfig({ testTimeout: 30_000 });

describe("CashFlowPage", () => {
  it("ZTO iskeleti: 8 satır, renk yalnız th'de, data-label, cf-pos/cf-neg, şerit görünür", async () => {
    signIn(["FINANCE_VIEW"]);
    render();
    const first = (await screen.findByText("16.11 – 22.11")).closest("tr") as HTMLTableRowElement;
    expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-cash-flow");
    expect(document.querySelector(".cf-hero.rcp-hero")?.textContent).toContain(
      "Nakit Akış Projeksiyonu (8 Hafta)",
    );
    const table = document.getElementById("cfTable") as HTMLTableElement;
    expect(table.className).toBe("table table-bordered table-hover cf-phone-card-table");
    expect(table.tBodies[0].rows).toHaveLength(8);
    expect(document.querySelector(".rcpdt-bar")).not.toBeNull();
    expect(document.querySelector(".rcpdt-pg")).toBeNull();
    const ths = Array.from(table.tHead?.rows[0].cells ?? []);
    expect(ths.map((th) => th.textContent)).toEqual([
      "Hafta",
      "Alacak Vadesi",
      "Alınan Çek",
      "Kendi Çekimiz",
      "Senet (bilgi)",
      "Net",
      "Kümülatif",
    ]);
    expect(ths[1].getAttribute("style")).toContain("background");
    expect(ths[3].getAttribute("style")).toContain("background");
    expect(first.cells[1].getAttribute("style")).toBeNull();
    expect(Array.from(first.cells, (td) => td.getAttribute("data-label"))).toEqual(
      ths.map((th) => th.textContent),
    );
    expect(first.cells[1].textContent).toBe("1.500");
    expect(first.cells[5].className).toBe("text-right cf-pos");
    expect(first.cells[6].className).toBe("text-right cf-pos");
    const second = table.tBodies[0].rows[1];
    expect(second.cells[5].className).toBe("text-right cf-neg");
    expect(second.cells[6].className).toBe("text-right cf-neg");
    expect(screen.getByText(/Ödeme planları bu projeksiyona dahil değildir/)).toBeTruthy();
    expect(screen.getByText("Kur bulunamadı (TL toplamına dahil edilmedi): CHF")).toBeTruthy();
    expect(document.querySelector(".rcp-breadcrumb a")?.getAttribute("href")).toBe(
      "/zto-finans/finans-raporlari",
    );
  });

  it("para birimi kipi N2 + simge; çok şirkette şirket seçici", async () => {
    signIn(["FINANCE_VIEW"], TWO_COMPANIES);
    render();
    await screen.findByText("16.11 – 22.11");
    expect(screen.getByLabelText("Şirket")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Para birimi"), { target: { value: "USD" } });
    fireEvent.change(screen.getByLabelText("Şirket"), { target: { value: "c2" } });
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() =>
      expect(
        fakeApi.log("GET").some((p) => p.includes("currency=USD") && p.includes("companyId=c2")),
      ).toBe(true),
    );
    expect(await screen.findAllByText("1.500,00 $")).toHaveLength(8);
    expect(screen.getByText(/Tutarlar USD cinsindendir/)).toBeTruthy();
  });

  it("rapor isteği hata verirse boş satırda hata metni; hafta satırı yok", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on("GET", /^\/finance\/reports\/cash-flow\?/, () => {
      throw apiError(500, "INTERNAL", "Sunucu hatası");
    });
    render();
    const message = await screen.findByText("Rapor yüklenemedi: Sunucu hatası");
    expect(message.getAttribute("colspan")).toBe("7");
    const table = document.getElementById("cfTable") as HTMLTableElement;
    expect(table.tBodies[0].rows).toHaveLength(1);
    expect(document.querySelector(".cf-pos, .cf-neg")).toBeNull();
  });

  it("boş: ZTO boş satırı (colspan 7)", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on("GET", /^\/finance\/reports\/cash-flow\?/, { ...flow(), rows: [] });
    render();
    const empty = await screen.findByText("Vadeli kalem bulunamadı.");
    expect(empty.getAttribute("colspan")).toBe("7");
  });
});
