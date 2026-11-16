// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import {
  apiError,
  fakeApi,
  makeBranch,
  page,
  renderAt,
  signIn,
} from "./pages/definitions/definitionTestUtils";
import { TreasuryModal } from "./TreasuryModal";
import { treasuryFixture } from "./treasuryTestData";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const chartProps: Array<Record<string, unknown>> = [];
vi.mock("../components/ZtoChart", () => ({
  default: (props: Record<string, unknown>) => {
    chartProps.push(props);
    return <div data-testid="chart" role="img" aria-label={String(props.ariaLabel)} />;
  },
}));

function render(onHide = () => undefined) {
  return renderAt("/zto-finans/test", { test: <TreasuryModal show onHide={onHide} /> });
}

beforeEach(() => {
  fakeApi.reset();
  chartProps.length = 0;
  signIn(["FINANCE_VIEW"]);
  fakeApi.on(
    "GET",
    /^\/organization\/branches/,
    page([
      makeBranch({ id: "b1", name: "Alsancak", branchGroupId: "g1", branchGroupName: "İzmir" }),
      makeBranch({ id: "b2", name: "Bornova", branchGroupId: "g1", branchGroupName: "İzmir" }),
      makeBranch({ id: "b3", name: "Kadıköy", branchGroupId: "g2", branchGroupName: "İstanbul" }),
    ]),
  );
  fakeApi.on("GET", /^\/finance\/reports\/treasury/, treasuryFixture());
});
afterEach(cleanup);
vi.setConfig({ testTimeout: 30_000 });

describe("TreasuryModal", () => {
  it("ZTO kökü, xl + zto-treasury-dialog, başlık, kartlar ve banka tablosu", async () => {
    render();
    const modal = (await screen.findByRole("dialog")) as HTMLElement;
    await screen.findByText("Garanti");
    expect(document.querySelector(".modal#treasuryModal")).not.toBeNull();
    expect(
      document.querySelector("#treasuryModal .modal-dialog.modal-xl.zto-treasury-dialog"),
    ).not.toBeNull();
    expect(modal.getAttribute("aria-labelledby")).toBe("treasuryModalLabel");
    expect(document.getElementById("treasuryModalLabel")?.textContent).toContain(
      "Finansal Varlık Durumları",
    );
    const cards = document.getElementById("treasurySummaryCards") as HTMLElement;
    expect(cards.textContent).toContain("BANKA BAKİYESİ");
    expect(cards.textContent).toContain("TL BAZINDA TOPLAM");
    expect(cards.textContent).toContain("15.700,00 ₺");
    expect(cards.textContent).not.toContain("KREDİ BORCU");
    const banks = document.getElementById("treasuryBanksTable") as HTMLTableElement;
    expect(banks.tHead?.rows[0].cells).toHaveLength(11);
    const foot = Array.from(banks.tFoot?.rows ?? []).map((r) => r.cells[0].textContent);
    expect(foot).toEqual(["TOPLAM (TRY):", "TOPLAM (USD):"]);
    const action = banks.tBodies[0].rows[0].querySelector("a.btn.btn-sm.btn-outline-primary");
    expect(action?.querySelector("i.fas.fa-list")).not.toBeNull();
    expect(action?.getAttribute("title")).toBe("Hareketler");
    expect(action?.textContent).toBe("");
    expect(action?.getAttribute("href")).toBe("/zto-finans/banka-hareketleri?fundId=f1");
    expect(
      screen.getByRole("tab", { name: /Bankalar/ }).querySelector(".badge.badge-primary")
        ?.textContent,
    ).toBe("2");
    expect(document.getElementById("treasuryLastUpdate")?.textContent).toContain(
      "Son güncelleme: 16.11.2026 09:30",
    );
    expect(document.getElementById("treasuryLastUpdate")?.textContent).toContain(
      "Güncel Kurlar (TCMB): USD: 34,0000 ₺ | EUR: 37,5000 ₺",
    );
  });

  it("ilk odak şube seçicide; şube → iş yeri süzgeci branchIds gönderir", async () => {
    render();
    await screen.findByText("Garanti");
    await waitFor(() => expect(document.activeElement?.id).toBe("treasuryBranchFilter"));
    const branch = document.getElementById("treasuryBranchFilter") as HTMLSelectElement;
    const place = document.getElementById("treasuryWorkPlaceFilter") as HTMLSelectElement;
    expect(Array.from(branch.options, (o) => o.text)).toEqual(["Tüm Şubeler", "İstanbul", "İzmir"]);
    fireEvent.change(branch, { target: { value: "g1" } });
    expect(Array.from(place.options, (o) => o.text)).toEqual([
      "Tüm İş Yerleri",
      "Alsancak",
      "Bornova",
    ]);
    await waitFor(() =>
      expect(
        fakeApi.log("GET").some((p) => p.includes("branchIds=b1") && p.includes("branchIds=b2")),
      ).toBe(true),
    );
    fireEvent.change(place, { target: { value: "b2" } });
    await waitFor(() =>
      expect(fakeApi.log("GET").some((p) => /treasury\?branchIds=b2$/.test(p))).toBe(true),
    );
  });

  it("sekmeler: seçim odağı izler; çek tablosu maskeli keşideci ve kalan gün; senet tfoot", async () => {
    render();
    await screen.findByText("Garanti");
    const banksTab = screen.getByRole("tab", { name: /Bankalar/ });
    expect(banksTab.getAttribute("aria-selected")).toBe("true");
    banksTab.focus();
    fireEvent.keyDown(banksTab, { key: "ArrowRight" });
    const cashesTab = screen.getByRole("tab", { name: /Kasalar/ });
    expect(cashesTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(cashesTab);
    fireEvent.keyDown(cashesTab, { key: "ArrowRight" });
    const checks = document.getElementById("treasuryChecksTable") as HTMLTableElement;
    expect(document.getElementById("checksPanel")?.hidden).toBe(false);
    expect(document.getElementById("banksPanel")?.hidden).toBe(true);
    const first = checks.tBodies[0].rows[0];
    expect(first.cells[6].textContent).toBe("4 gün");
    expect(first.cells[6].className).toBe("text-danger");
    expect(first.cells[8].textContent).toBe("Alınan");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    const bills = document.getElementById("treasuryBillsTable") as HTMLTableElement;
    expect(bills.tBodies[0].rows[0].cells[3].textContent).toBe("Personel carisi");
    expect(bills.tBodies[0].rows[0].cells[1].textContent).toBe("Bono");
    expect(Array.from(bills.tFoot?.rows ?? []).map((r) => r.cells[0].textContent)).toEqual([
      "TOPLAM (TRY):",
    ]);
  });

  it("Grafikler tembel çizilir: dört grafik, height yok, aspectRatio 1.5", async () => {
    render();
    await screen.findByText("Garanti");
    expect(chartProps).toHaveLength(0);
    fireEvent.click(screen.getByRole("tab", { name: /Grafikler/ }));
    await waitFor(() => expect(screen.getAllByTestId("chart")).toHaveLength(4));
    for (const props of chartProps) {
      expect(props.height).toBeUndefined();
      expect(props.options).toEqual({ aspectRatio: 1.5 });
    }
    expect(chartProps.map((p) => p.type)).toEqual(["bar", "line", "doughnut", "bar"]);
  });

  it("rapor isteği hata verirse hata uyarısı; kartlar ve banka tablosu yok", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/treasury/, () => {
      throw apiError(500, "INTERNAL", "Sunucu hatası");
    });
    render();
    const alert = await screen.findByText("Veri yüklenirken hata oluştu: Sunucu hatası");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(document.getElementById("treasuryContent")).toBeNull();
    expect(document.getElementById("treasurySummaryCards")).toBeNull();
    expect(document.getElementById("treasuryBanksTable")).toBeNull();
    expect(document.getElementById("treasuryLoading")).toBeNull();
  });

  it("Kapat düğmeleri onHide çağırır", async () => {
    const onHide = vi.fn();
    render(onHide);
    const modal = (await screen.findByRole("dialog")) as HTMLElement;
    await screen.findByText("Garanti");
    const closes = within(modal).getAllByRole("button", { name: "Kapat" });
    expect(closes).toHaveLength(2);
    fireEvent.click(closes[1]);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
