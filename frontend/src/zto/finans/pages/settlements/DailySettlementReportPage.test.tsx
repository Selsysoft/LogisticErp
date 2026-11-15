// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { DailyReport } from "../../../../pages/finance/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { makeFund } from "../funds/fundsTestUtils";
import { DailySettlementReportPage } from "./DailySettlementReportPage";
import {
  SETTLEMENT_VIEWER,
  bankItem,
  makeBalance,
  makeItem,
  makeMovement,
  makeReport,
  settlementCommonApi,
} from "./settlementsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "odemeler/gunluk-rapor": <DailySettlementReportPage key="PAYMENT" type="PAYMENT" />,
  "tahsilatlar/gunluk-rapor": <DailySettlementReportPage key="COLLECTION" type="COLLECTION" />,
};

/** Görünen metin: metin düğümleri boşlukla birleşir (hücre/rozet sınırları korunur). */
function norm(el: Element | null | undefined): string {
  if (!el) return "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
}

const localIso = (h: number, m: number, s: number) => new Date(2026, 10, 14, h, m, s).toISOString();

const ROWS = [
  makeItem({ id: "r1", createdAt: localIso(9, 0, 1) }),
  bankItem({
    id: "r2",
    createdAt: localIso(9, 30, 0),
    accountName: "Beta A.Ş.",
    accountCode: "INT-1",
    intercompany: true,
    reversedOn: "2026-11-15",
    money: { amount: "200", currency: "USD" },
  }),
  makeItem({
    id: "r3",
    createdAt: localIso(10, 0, 0),
    employeeMasked: true,
    accountId: null,
    accountName: null,
    accountCode: null,
    description: null,
    branchId: "b2",
    branchName: "Depo",
    displayMethod: "CHECK",
    instrumentNumber: "7654321",
    instrumentStatus: "PORTFOLIO",
    fundAccountId: null,
    fundKind: null,
  }),
  bankItem({ id: "r4", createdAt: localIso(11, 0, 0), credit: true, accountName: "Kredi Bankası" }),
];

function api(report: DailyReport) {
  settlementCommonApi();
  fakeApi.on("GET", /^\/finance\/funds(\?.*)?$/, [
    makeFund(),
    makeFund({ id: "k1", kind: "CASH", name: "Merkez Kasa", bankName: null }),
  ]);
  fakeApi.on("GET", /^\/finance\/reports\/daily\?/, report);
}

const reportCalls = () => fakeApi.log("GET").filter((p) => p.startsWith("/finance/reports/daily?"));
const lastQuery = () => new URLSearchParams(reportCalls().at(-1)?.split("?")[1]);

async function open(path: string) {
  renderAt(path, ROUTES);
  await waitFor(() => expect(reportCalls().length).toBeGreaterThan(0));
  await waitFor(() => expect(document.querySelector(".report-page-title")).not.toBeNull());
}

beforeEach(() => {
  fakeApi.reset();
  signIn(SETTLEMENT_VIEWER);
});

afterEach(cleanup);

// Tam sayfa + kabuk çizimi tam koşuda (kapsam açıkken) 5 sn varsayılanını aşabiliyor.
vi.setConfig({ testTimeout: 20_000 });

describe("Günlük Ödeme Raporu", () => {
  it("URL süzgeçleri sorguya; başlık, alt başlık, istatistik kartları", async () => {
    api(makeReport({ rows: ROWS }));
    await open(
      "/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14&workPlaceIds=b1,b2&currency=usd&method=BANK&sort=time-desc",
    );
    const query = lastQuery();
    expect(query.get("type")).toBe("PAYMENT");
    expect(query.get("date")).toBe("2026-11-14");
    expect(query.getAll("branchIds")).toEqual(["b1", "b2"]);
    expect(query.get("currency")).toBe("USD");
    expect(query.getAll("method")).toEqual(["BANK"]);
    expect(query.get("sort")).toBe("TIME_DESC");
    expect(document.querySelector(".zto-finans.zto-page-daily-settlement-report")).not.toBeNull();
    await waitFor(() =>
      expect(norm(document.querySelector(".report-page-title"))).toBe(
        "Günlük Ödeme Raporu (14.11.2026)",
      ),
    );
    await waitFor(() =>
      expect(norm(document.querySelector(".report-page-subtitle"))).toBe(
        "4 ödeme kaydı. Sıralama, oluşturulma saatine göre yapılır.",
      ),
    );
    const stats = Array.from(document.querySelectorAll(".report-stat-card"), (c) => norm(c));
    expect(stats[0]).toBe("Toplam Ödeme 4");
    expect(stats[1]).toContain("İş Yeri Sayısı 2");
    expect(stats[2]).toBe("Rapor Tarihi 14.11.2026 Günlük Ödeme Listesi");
    expect(document.querySelector(".container-fluid.dcr-report")).toBeNull();
    expect(screen.getByRole("link", { name: /Ödeme Listesine Dön/ }).getAttribute("href")).toBe(
      "/zto-finans/odemeler",
    );
    expect((document.getElementById("reportSort") as HTMLSelectElement).value).toBe("time-desc");
    expect((document.getElementById("reportCurrency") as HTMLSelectElement).value).toBe("USD");
  });

  it("gruplu görünüm: iş yeri → banka/kasa blokları, S. No, saat, transfer ve 'Sonradan iptal' rozeti", async () => {
    api(makeReport({ rows: ROWS }));
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll(".workplace-block")).toHaveLength(2));
    const blocks = document.querySelectorAll<HTMLElement>(".workplace-block");
    expect(norm(blocks[0].querySelector(".workplace-header-btn"))).toBe("Depo 1 ödeme 1.500,00 ₺");
    const merkez = blocks[1];
    expect(
      Array.from(merkez.querySelectorAll(".bank-block > button"), (b) => [
        b.className,
        norm(b.querySelector("div")),
      ]),
    ).toEqual([
      ["cash-header-btn", "Kasa: Merkez Kasa"],
      ["bank-header-btn", "Ziraat"],
    ]);
    const rows = Array.from(merkez.querySelectorAll<HTMLElement>("tr.report-row"));
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["1", "2", "4"]);
    const transfer = rows[1];
    expect(transfer.classList.contains("workplace-transfer-row")).toBe(true);
    const cells = within(transfer).getAllByRole("cell");
    expect(cells[1].textContent).toBe("09:30:00");
    expect(norm(cells[2])).toBe("Beta A.Ş. İş Yeri INT-1");
    expect(norm(cells[5])).toBe("Ziraat (Konak)");
    expect(norm(cells[6])).toBe("200,00 $ Sonradan iptal: 15.11.2026");
    expect(cells[6].querySelector(".badge.badge-light")).not.toBeNull();
    const depoRow = blocks[0].querySelector("tr.report-row") as HTMLElement;
    const depo = within(depoRow).getAllByRole("cell");
    expect(norm(depo[2])).toBe("Personel (gizli)");
    expect(depo[4].textContent).toBe("Çek");
    expect(depo[5].textContent).toBe("-");
    expect(depo[7].textContent).toBe("-");
    expect(norm(blocks[0].querySelector(".bank-header-btn"))).toContain("Banka/Kasa Tanımsız");
  });

  it("Tümünü Kapat / Tümünü Aç ve grup başlığı aria-expanded", async () => {
    api(makeReport({ rows: ROWS }));
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll(".workplace-block")).toHaveLength(2));
    const header = document.querySelector<HTMLElement>(".workplace-header-btn") as HTMLElement;
    const panel = document.getElementById(header.getAttribute("aria-controls") as string);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.classList.contains("show")).toBe(true);
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.classList.contains("show")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Tümünü Aç/ }));
    expect(panel?.classList.contains("show")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Tümünü Kapat/ }));
    expect(document.querySelectorAll("#groupedView .collapse.show")).toHaveLength(0);
  });

  it("Gruplamayı Kaldır: düz tablo İş Yeri sütunuyla; Grupla geri döner", async () => {
    api(makeReport({ rows: ROWS }));
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.getElementById("groupedView")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Gruplamayı Kaldır/ }));
    // Baskı CSS'i her zaman #groupedView basar (zto-onyuz:F2): düz görünümde DOM'da kalır, satır içi
    // (important olmayan) display:none ile gizlenir.
    const grouped = document.getElementById("groupedView") as HTMLElement;
    expect(grouped).not.toBeNull();
    expect(grouped.style.display).toBe("none");
    expect(grouped.querySelectorAll("tr.report-row")).toHaveLength(4);
    const flat = document.getElementById("flatView") as HTMLElement;
    const headers = Array.from(flat.querySelectorAll("th"), (th) => th.textContent);
    expect(headers).toEqual([
      "S. No",
      "Oluşturma Saati",
      "İş Yeri",
      "Cari Hesap",
      "Belge No",
      "Yöntem",
      "Kaynak",
      "Tutar",
      "Açıklama",
    ]);
    expect(flat.querySelectorAll("tr.report-row-flat")).toHaveLength(4);
    expect(norm(flat.querySelector("tr.report-row-flat td:nth-child(3)"))).toBe("Merkez İzmir");
    expect(
      screen.getByRole("button", { name: /Gruplamayı Kaldır/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Grupla$/ }));
    expect(document.getElementById("groupedView")).not.toBeNull();
    expect(document.getElementById("groupedView")?.style.display).toBe("");
    expect(document.getElementById("flatView")).toBeNull();
  });

  it("baskı CSS'i gruplu görünümü ve kapalı grupları basar (zto-onyuz:F2)", () => {
    // jsdom ortamında import.meta.url file: değil; vitest çalışma dizini frontend/.
    const reportCss = readFileSync(
      resolve(process.cwd(), "src/zto/styles/pages/scoped/daily-settlement-report.css"),
      "utf8",
    );
    const print = reportCss.slice(reportCss.indexOf("@media print"));
    expect(print).toMatch(/#groupedView\s*\{\s*display:\s*block\s*!important;?\s*\}/);
    expect(print).toMatch(/#flatView\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    expect(print).toMatch(/\.collapse\s*\{\s*display:\s*block\s*!important;/);
  });

  it("rapor içi arama ve özet kartı süzgeci (VE/VEYA) satır sayısını bildirir", async () => {
    api(makeReport({ rows: ROWS }));
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll("tr.report-row")).toHaveLength(4));
    const count = document.getElementById("searchResultCount") as HTMLElement;
    expect(count.getAttribute("role")).toBe("status");
    expect(count.textContent).toBe("");
    fireEvent.change(document.getElementById("reportSearchInput") as HTMLElement, {
      target: { value: "beta" },
    });
    await waitFor(() => expect(count.textContent).toBe("1 satır bulundu"));
    expect(document.querySelectorAll("tr.report-row")).toHaveLength(1);
    expect(document.querySelectorAll(".workplace-block")).toHaveLength(1);
    fireEvent.change(document.getElementById("reportSearchInput") as HTMLElement, {
      target: { value: "" },
    });
    await waitFor(() => expect(document.querySelectorAll("tr.report-row")).toHaveLength(4));

    const methodCard = (name: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-filter-type="method"]')).find(
        (el) => el.querySelector("span")?.textContent === name,
      ) as HTMLElement;
    fireEvent.click(methodCard("Banka"));
    await waitFor(() =>
      expect(count.textContent).toBe("2 satır listeleniyor (kart filtresi aktif)"),
    );
    expect(methodCard("Banka").classList.contains("active")).toBe(true);
    expect(methodCard("Banka").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(methodCard("Çek"), { key: "Enter" });
    await waitFor(() =>
      expect(count.textContent).toBe("3 satır listeleniyor (kart filtresi aktif)"),
    );
    const depo = document.querySelector<HTMLElement>(
      '[data-filter-type="workPlace"][data-filter-value="b2"]',
    );
    fireEvent.click(depo as HTMLElement);
    await waitFor(() =>
      expect(count.textContent).toBe("1 satır listeleniyor (kart filtresi aktif)"),
    );
  });

  it("genel toplamlar: transfer, cari (banka/kasa/tanımsız), kredi, genel", async () => {
    api(makeReport({ rows: ROWS }));
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll("tr.report-row")).toHaveLength(4));
    const totals = norm(document.querySelector(".totals-footer-card"));
    expect(totals).toContain("Genel Toplamlar (İş Yeri / Banka Bazlı)");
    expect(totals).toContain("Rapor Tarihi: 14.11.2026");
    expect(totals).toContain("İş Yerleri Arası Transferler 1 ödeme 200,00 $ (1 ödeme)");
    expect(totals).toContain("Cari Ödemeler 2 ödeme");
    expect(totals).toContain("Merkez Kasa (1 ödeme) 1.500,00 ₺ (1)");
    expect(totals).toContain("Tanımsız (1 ödeme) 1.500,00 ₺ (1)");
    expect(totals).toContain("Kredi Ödemeleri 1 ödeme");
    expect(totals).toContain("Kredi Toplamları 1.500,00 ₺ (1)");
    expect(totals).toContain("Genel Toplam 4 ödeme");
    expect(totals).toContain(
      "= İş Yerleri Arası Transferler + Cari Ödemeler (Bankalar + Kasalar) + Kredi Ödemeleri",
    );
    expect(totals).not.toContain("Banka Toplamları");
  });

  it("özet bakiye, bankaya yansıyan çek özeti ve tarihine göre yazılan çekler", async () => {
    api(
      makeReport({
        rows: ROWS,
        fundBalances: [
          makeBalance(),
          makeBalance({ fundAccountId: "k1", kind: "CASH", name: "Merkez Kasa" }),
        ],
        instrumentFundMovements: [makeMovement()],
      }),
    );
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll("tr.report-row")).toHaveLength(4));
    const page = norm(document.querySelector(".container-fluid"));
    expect(page).toContain("Özet Bakiye Bilgisi");
    expect(page).toContain("Bankalar (1)");
    expect(page).toContain("14.11.2026 Gün Sonu Bakiye");
    expect(page).toContain("Ziraat (Konak ₺) 1.000,00 ₺ 1.250,50 ₺");
    expect(page).toContain("Kasalar (1)");
    expect(page).toContain("Merkez Kasa ₺ 1.000,00 ₺");
    const legacy = norm(document.querySelector(".legacy-checks-card"));
    expect(legacy).toContain("Banka Hareketine Yansıyan Çek Özeti");
    expect(legacy).toContain("2 ödeme | 300,00 ₺");
    expect(legacy).toContain("Merkez Ziraat Vadesiz 2 300,00 ₺");
    const dated = norm(document.querySelector(".payment-date-checks-card"));
    expect(dated).toContain("Ödeme Tarihine Göre Yazılan Çekler");
    expect(dated).toContain("1 ödeme | 1.500,00 ₺");
    expect(dated).toContain("14.11.2026 Depo Personel (gizli) 7654321 - Portföyde 1.500,00 ₺");
  });

  it("boş rapor: ZTO boş metinleri", async () => {
    api(makeReport());
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    expect(await screen.findByText("Seçilen filtrelerde ödeme kaydı bulunamadı.")).toBeTruthy();
    const page = norm(document.querySelector(".container-fluid"));
    expect(page).toContain("Transfer kaydı yok");
    expect(page).toContain("Cari ödeme kaydı yok");
    expect(page).toContain("Toplam gösterilecek kayıt bulunamadı.");
    expect(page).toContain("Bakiye özeti için banka verisi bulunamadı.");
    expect(page).toContain("Bakiye özeti için kasa verisi bulunamadı.");
    expect(page).toContain("Bu tarih için bankaya yansımış tahsil çek kaydı bulunamadı.");
    expect(page).toContain("Bu tarih için yazılan çek ödemesi bulunamadı.");
    expect(page).not.toContain("Kredi Ödemeleri");
    expect(Array.from(document.querySelectorAll(".stat-items-wrapper"), (w) => norm(w))).toEqual([
      "Veri yok",
      "Veri yok",
      "Veri yok",
      "Veri yok",
    ]);
  });

  it("Filtrele süzgeci URL'ye yazar; Temizle yalnız tarihi korur; Yazdır", async () => {
    api(makeReport({ rows: ROWS }));
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14&method=CASH");
    await waitFor(() =>
      expect((document.getElementById("reportFund") as HTMLSelectElement).options.length).toBe(3),
    );
    fireEvent.change(document.getElementById("reportFund") as HTMLElement, {
      target: { value: "f1" },
    });
    fireEvent.change(document.getElementById("reportDate") as HTMLElement, {
      target: { value: "2026-11-13" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() => expect(lastQuery().get("date")).toBe("2026-11-13"));
    expect(lastQuery().getAll("fundAccountIds")).toEqual(["f1"]);
    expect(lastQuery().getAll("method")).toEqual(["CASH"]);
    expect(screen.getByTestId("where").textContent).toContain(
      "reportDate=2026-11-13&fundAccountIds=f1&method=CASH",
    );
    fireEvent.click(screen.getByRole("button", { name: /Temizle/ }));
    await waitFor(() => expect(lastQuery().get("method")).toBeNull());
    expect(lastQuery().get("date")).toBe("2026-11-13");
    expect(lastQuery().get("fundAccountIds")).toBeNull();
    expect((document.getElementById("reportMethod") as HTMLSelectElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Yazdır/ }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("yükleme hatası", async () => {
    settlementCommonApi();
    fakeApi.on("GET", /^\/finance\/funds(\?.*)?$/, []);
    fakeApi.on("GET", /^\/finance\/reports\/daily\?/, () => {
      throw new Error("x");
    });
    await open("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-14");
    expect(await screen.findByText("Rapor yüklenemedi.")).toBeTruthy();
  });
});

describe("Günlük Tahsilat Raporu", () => {
  it("DCR farkları: dcr-report kökü, metinler, 'Toplam Çek:', kredi bölümü yok, bakiye en altta", async () => {
    api(
      makeReport({
        type: "COLLECTION",
        rows: ROWS.map((r) => ({ ...r, type: "COLLECTION" as const })),
        instrumentFundMovements: [makeMovement()],
      }),
    );
    await open("/zto-finans/tahsilatlar/gunluk-rapor?reportDate=2026-11-14");
    await waitFor(() => expect(document.querySelectorAll("tr.report-row")).toHaveLength(4));
    expect(lastQuery().get("type")).toBe("COLLECTION");
    expect(document.querySelector(".container-fluid.dcr-report")).not.toBeNull();
    expect(norm(document.querySelector(".report-page-title"))).toBe(
      "Günlük Tahsilat Raporu (14.11.2026)",
    );
    const page = norm(document.querySelector(".container-fluid"));
    expect(page).toContain("4 tahsilat kaydı.");
    expect(page).toContain("Toplam Tahsilat 4");
    expect(page).toContain("Günlük Tahsilat Listesi");
    expect(page).toContain("İş Yerleri Arası Transferler (1 tahsilat)");
    expect(page).toContain("Cari Tahsilatlar (3 tahsilat)");
    expect(page).toContain("Banka Toplamları (1 tahsilat)");
    expect(page).toContain("Genel Toplam (4 tahsilat)");
    expect(page).not.toContain("Kredi Ödemeleri");
    expect(page).toContain("Toplam Çek: 2 | 300,00 ₺");
    expect(page).toContain("Tahsilat Tarihine Göre Yazılan Çekler");
    expect(page).toContain("Çek Adedi");
    expect(document.querySelector(".legacy-checks-card")).toBeNull();
    expect(page.indexOf("Özet Bakiye Bilgisi")).toBeGreaterThan(page.indexOf("Yazılan Çekler"));
    expect(screen.getByRole("link", { name: /Tahsilat Listesine Dön/ }).getAttribute("href")).toBe(
      "/zto-finans/tahsilatlar",
    );
  });
});
