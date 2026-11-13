// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { ZtoFinansRoot } from "../../ZtoFinansRoot";
import { SHOWCASE_BRANCH_TREE } from "../showcaseData";

// jsdom'da canvas yok.
vi.mock("react-chartjs-2", () => ({
  Chart: (props: { type: string; "aria-label"?: string }) => (
    <canvas data-testid="chart" data-type={props.type} aria-label={props["aria-label"]} />
  ),
}));

// Canlı şube ağacı yerine sabit ağaç (API yok).
const liveCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../branch/branchTree", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../branch/branchTree")>()),
  useBranchTree: () => {
    liveCalls.count++;
    return { data: SHOWCASE_BRANCH_TREE.slice(0, 1), isPending: false, isError: false };
  },
}));

const { ShowcasePage } = await import("./ShowcasePage");

function renderPage() {
  render(
    <MemoryRouter>
      <ZtoFinansRoot>
        <ShowcasePage />
      </ZtoFinansRoot>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

// Sayfa iki tablo ve tüm bileşenleri çizer; yük altında varsayılan 5 sn yetmeyebilir.
describe("ShowcasePage", { timeout: 30_000 }, () => {
  it("tüm bölümler ve ortak bileşenler çizilir", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 6, name: "Bileşen vitrini" })).toBeTruthy();
    const sections = Array.from(document.querySelectorAll(".card-header:not(.bg-white)"), (h) =>
      h.textContent?.trim(),
    );
    expect(sections).toEqual([
      "Tablo — Düğmeli liste (dom 'Bfrtip')",
      "Tablo — Düğmesiz liste (dom 'lfrtip')",
      "İş yeri çipleri (Varyant D)",
      "Arama kutulu seçim",
      "İş yeri seçimi",
      "Modal",
      "İpucu ve açılır kutu",
      "Biçimlendirme",
      "Grafik",
      "Font Awesome ikonları",
      "Bootstrap 4 / SB Admin öğeleri",
    ]);
    // İki tablo: düğmeli (Bfrtip) ve çekirdek (lfrtip).
    const buttons = document.querySelector("#showcaseButtonsTable_wrapper .dt-buttons");
    expect(buttons?.querySelectorAll("button.dt-button")).toHaveLength(4);
    expect(document.querySelector("#showcaseButtonsTable_wrapper .dataTables_length")).toBeNull();
    expect(document.querySelector("#showcaseCoreTable_wrapper .dataTables_length")).not.toBeNull();
    expect(document.querySelectorAll("#showcaseButtonsTable tbody tr")).toHaveLength(10);
    expect(document.querySelectorAll("#showcaseCoreTable tbody tr")).toHaveLength(25);
    expect(screen.getAllByText(/57 kayıttan/).length).toBe(2);
    // Biçim örnekleri.
    expect(screen.getByText("1.234.567,89")).toBeTruthy();
    expect(screen.getByText("-1.250,50 ₺")).toBeTruthy();
    expect(screen.getByText("13.11.2026")).toBeTruthy();
    // Şube seçimi: örnek ağaç + canlı ağaç (taklit); çoklu seçimde iki şirket başlığı.
    expect(liveCalls.count).toBeGreaterThan(0);
    expect(document.querySelectorAll(".dpr-company")).toHaveLength(2);
    expect(document.querySelector(".wp-multiselect-container")).not.toBeNull();
    // Grafikler tembel yüklenir.
    // Tembel parça (chart.js) yük altında geç çözülebilir.
    await waitFor(() => expect(screen.getAllByTestId("chart")).toHaveLength(2), {
      timeout: 10_000,
    });
    expect(screen.getAllByTestId("chart").map((c) => c.dataset.type)).toEqual(["bar", "pie"]);
    expect(document.querySelectorAll("i.fa-2x")).toHaveLength(12);
  });

  it("iş yeri çipi tabloyu süzer, tekrar tıklama kaldırır", () => {
    renderPage();
    const chip = document.querySelector<HTMLElement>(".stat-item[data-filter-value='Gebze Depo']");
    expect(chip).not.toBeNull();
    fireEvent.click(chip!);
    expect(screen.getByText("Etkin çip:").textContent).toContain("Gebze Depo");
    const info = document.querySelector("#showcaseButtonsTable_info")?.textContent ?? "";
    expect(info).not.toContain("57 kayıttan");
    fireEvent.click(chip!);
    expect(screen.getByText("Etkin çip:").textContent).toContain("yok");
  });

  it("modal üstüne modal ve onay modalları", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Modalı aç" }));
    const first = await screen.findByRole("dialog");
    expect(within(first).getByText("Birinci modal")).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "İkinci modalı aç" }));
    await waitFor(() => expect(screen.getByText("İkinci modal")).toBeTruthy());
    expect(document.querySelectorAll(".modal.show").length).toBe(2);
    expect(first.closest(".zto-finans")).not.toBeNull();
  });

  it("useZtoConfirm yanıtı ekrana yazılır", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Onay sor (useZtoConfirm)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Onayla/ }));
    await waitFor(() => expect(screen.getByText("Son yanıt:").textContent).toContain("Evet"));
  });
});
