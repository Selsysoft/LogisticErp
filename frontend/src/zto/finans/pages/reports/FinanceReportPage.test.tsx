// @vitest-environment jsdom
import { cleanup, configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type {
  Account,
  LedgerAccountRow,
  LedgerAccounts,
  LedgerSummary,
  Statement,
  StatementLine,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  page,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { FinanceReportPage } from "./FinanceReportPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
  apiBlobUrl: async () => "blob:logo",
}));

vi.setConfig({ testTimeout: 30_000 });
// İlk çizim (kabuk + tembel modüller) tam koşuda 1 sn varsayılanını aşabiliyor.
configure({ asyncUtilTimeout: 8000 });

const ROUTES = { "finans-raporlari": <FinanceReportPage /> };

const TREE: BranchTree = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [
          { id: "b1", code: "IY1", name: "Merkez", active: true },
          { id: "b2", code: "IY2", name: "Depo", active: true },
        ],
      },
      {
        groupId: "g2",
        groupName: "Ankara",
        groupActive: true,
        branches: [{ id: "b3", code: "IY3", name: "Ostim", active: true }],
      },
    ],
  },
];

const SUMMARY: LedgerSummary = {
  from: null,
  to: "2026-11-16",
  personnelHidden: true,
  rows: [
    { reportType: "SALES", currency: "USD", weOwe: "0", theyOwe: "50", net: "50", openAccounts: 1 },
    {
      reportType: "SALES",
      currency: "TRY",
      weOwe: "100",
      theyOwe: "1500.5",
      net: "1400.5",
      openAccounts: 3,
    },
    { reportType: null, currency: "TRY", weOwe: "20", theyOwe: "0", net: "-20", openAccounts: 1 },
  ],
};

function row(overrides: Partial<LedgerAccountRow> = {}): LedgerAccountRow {
  return {
    accountId: "a1",
    accountCode: "TED-0001",
    accountName: "Kuzey Nakliye",
    accountType: "SUPPLIER",
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    active: true,
    companyId: "c1",
    companyName: "Acme",
    currency: "TRY",
    opening: "-20",
    debt: "300",
    payment: "120",
    receivable: "10",
    penalty: "0",
    collection: "0",
    closing: "-190",
    lastSettlementDate: "2026-11-16",
    lastSettlementAmount: "120",
    lastMovementDate: "2026-11-16",
    ...overrides,
  };
}

function ledger(rows: LedgerAccountRow[], overrides: Partial<LedgerAccounts> = {}): LedgerAccounts {
  return {
    reportType: "SUPPLIERS",
    side: "PAYABLE",
    from: null,
    to: "2026-11-16",
    postPeriodCount: 0,
    rows,
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    code: "MUS-0001",
    name: "Ayşe Yılmaz",
    type: "CUSTOMER",
    taxNumber: "12345678901",
    taxNumberMasked: false,
    branchId: null,
    companyId: null,
    representsCompanyId: null,
    balances: [],
    subGroup: "MUSTERI",
    subGroupName: "Müşteri",
    active: true,
    defaultCurrency: "TRY",
    creditLimit: null,
    riskLimit: null,
    companyLimits: null,
    taxOffice: "Konak",
    companyType: "INDIVIDUAL",
    phone: null,
    email: null,
    website: null,
    contactName: null,
    contactTitle: null,
    contactMobile: null,
    address: "Alsancak",
    city: null,
    district: null,
    country: null,
    postalCode: null,
    paymentTerms: null,
    notes: null,
    planSummary: null,
    createdBy: "x",
    createdAt: "2026-01-01T00:00:00Z",
    updatedBy: "x",
    updatedAt: "2026-01-01T00:00:00Z",
    updateCount: 0,
    ...overrides,
  } as Account;
}

function line(overrides: Partial<StatementLine> = {}): StatementLine {
  return {
    id: "l1",
    date: "2026-11-02",
    direction: "DEBIT",
    amount: 250,
    exchangeRate: null,
    tlAmount: null,
    description: "Navlun",
    sourceType: "ACCOUNT_DOCUMENT",
    balance: 0,
    currency: "TRY",
    companyId: "c1",
    branchId: "b1",
    sourceId: "s1",
    kind: "RECEIVABLE",
    sign: 1,
    reversal: false,
    reversed: false,
    transferRole: null,
    documentNo: "BA-1",
    documentType: "FATURA",
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    createdBy: "x",
    createdAt: "2026-11-02T08:00:00Z",
    ...overrides,
  };
}

function commonApi() {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, TREE);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/organization\/branches\?/, page([{ id: "b1", name: "Merkez" }]));
  fakeApi.on("GET", "/finance/account-groups", [
    { code: "MUSTERI", accountType: "CUSTOMER", name: "Müşteri", reportType: "SALES" },
  ]);
  fakeApi.on("GET", "/finance/account-document-types", [
    { code: "FATURA", side: "RECEIVABLE", name: "Fatura" },
  ]);
  fakeApi.on("GET", /^\/organization\/companies\//, { id: "c1", logoFileId: null });
}

const calls = (prefix: string) => fakeApi.log("GET").filter((p) => p.startsWith(prefix));
const query = (prefix: string) => new URLSearchParams(calls(prefix).at(-1)?.split("?")[1]);
const where = () => screen.getByTestId("where").textContent ?? "";

beforeEach(() => {
  // Yalnız Date sahte: "bugün" 16.11.2026 (zamanlayıcılar gerçek; waitFor çalışır).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
  fakeApi.reset();
  signIn(["FINANCE_VIEW"]);
  commonApi();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Finans Raporları — genel bakış", () => {
  it("kök sınıf, rp-page sarmalayıcısı, tür satırları, Rapor dışı, bağlantılar süzgeci korur", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-summary/, SUMMARY);
    renderAt("/zto-finans/finans-raporlari?cur=TRY&branchGroupId=g1", ROUTES);
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "Satış ve Müşteri Alacakları" })).toHaveLength(2),
    );

    const root = document.querySelector(".zto-finans") as HTMLElement;
    expect(root.classList.contains("zto-page-finance-report")).toBe(true);
    expect(root.classList.contains("rp-page")).toBe(false);
    const wrap = document.querySelector(".rp-page > .rp-wrap.fr-page") as HTMLElement;
    expect(wrap.dataset.frMode).toBe("overview");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Genel Bakış");

    // Şube → kapsamdaki iş yerleri; Tümü → from/to yok; para birimi.
    const q = query("/finance/reports/ledger-summary");
    expect(q.getAll("branchIds")).toEqual(["b1", "b2"]);
    expect(q.get("from")).toBeNull();
    expect(q.get("currency")).toBe("TRY");

    const table = document.querySelector('table[data-fr-sheet="Genel Bakış"]') as HTMLTableElement;
    const rows = Array.from(table.tBodies[0].rows).map((tr) =>
      Array.from(tr.cells, (td) => td.textContent?.replace(/\s+/g, " ").trim()),
    );
    expect(rows[0]).toEqual([
      "Satış ve Müşteri Alacakları",
      "Türk Lirası (₺)",
      "100,00 ₺",
      "1.500,50 ₺",
      "1.400,50 ₺ (bize borçlu)",
      "3",
    ]);
    expect(rows[1][1]).toBe("Amerikan Doları ($)");
    expect(rows[2]).toEqual(["Tedarikçiler", "-", "-", "-", "-", "0"]);
    // PERSONNEL izinsiz yok; son satır Rapor dışı, bağlantısız.
    expect(rows.map((r) => r[0])).not.toContain("Personel Ödemeleri");
    expect(rows.at(-1)).toEqual([
      "Rapor dışı (kredi, iç virman)",
      "Türk Lirası (₺)",
      "20,00 ₺",
      "0,00 ₺",
      "20,00 ₺ (borcumuz)",
      "1",
    ]);
    expect(within(table).queryByRole("link", { name: /Rapor dışı/ })).toBeNull();

    const link = screen.getByRole("link", { name: "Tedarikçiler" }).getAttribute("href");
    expect(link).toBe(
      "/zto-finans/finans-raporlari?type=SUPPLIERS&range=all&cur=TRY&branchGroupId=g1",
    );

    // Çipler ve FA5 ikonları.
    const chips = Array.from(document.querySelectorAll("#frChips .rp-chip"), (c) => c.textContent);
    expect(chips[0]).toBe("Dönem: Tüm zamanlar");
    expect(chips).toContain("Para birimi: Türk Lirası");
    expect(chips).toContain("Şube: İzmir");
    expect(
      document.querySelector(".fa-scale-balanced, .fa-rotate-left, .fa-circle-info"),
    ).toBeNull();
    expect(document.querySelector(".rp-buttons a.rp-btn .fa-undo-alt")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Excel'e Aktar/ })).toBeTruthy();

    // Şube seçimi iş yeri seçeneklerini süzer.
    fireEvent.change(document.getElementById("frbp") as HTMLSelectElement, {
      target: { value: "g2" },
    });
    const workplaces = Array.from(
      (document.getElementById("frwp") as HTMLSelectElement).options,
      (o) => o.text,
    );
    expect(workplaces).toEqual(["Tümü", "Ostim"]);
  });

  it("hazır aralık düğmesi URL'ye range yazar; Enter Filtrele'yi çalıştırır", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-summary/, SUMMARY);
    renderAt("/zto-finans/finans-raporlari", ROUTES);
    await waitFor(() => expect(calls("/finance/reports/ledger-summary").length).toBe(1));
    const all = screen.getByRole("button", { name: "Tümü" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Son 7 Gün" }));
    await waitFor(() => expect(where()).toBe("/zto-finans/finans-raporlari?range=7"));
    await waitFor(() =>
      expect(query("/finance/reports/ledger-summary").get("from")).not.toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Son 7 Gün" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.change(screen.getByLabelText("Rapor türü"), { target: { value: "SALES" } });
    fireEvent.submit(document.getElementById("frForm") as HTMLFormElement);
    await waitFor(() =>
      expect(where()).toMatch(/^\/zto-finans\/finans-raporlari\?type=SALES&from=/),
    );
  });

  it("Oluşturma çipi etkin sorgunun veri zamanını gösterir; süzgeç sonrası güncellenir", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-summary/, SUMMARY);
    renderAt("/zto-finans/finans-raporlari", ROUTES);
    const chips = () => document.getElementById("frChips")?.textContent ?? "";
    await waitFor(() => expect(calls("/finance/reports/ledger-summary").length).toBe(1));
    await waitFor(() => expect(chips()).toContain("Oluşturma: 16.11.2026 10:00"));

    // 11:30'da yeni aralık: yeni sorgu, çip yeni veri zamanını taşır (ilk açılış saatinde donmaz).
    vi.setSystemTime(new Date(2026, 10, 16, 11, 30, 0));
    fireEvent.click(screen.getByRole("button", { name: "Bugün" }));
    await waitFor(() => expect(calls("/finance/reports/ledger-summary").length).toBe(2));
    await waitFor(() => expect(chips()).toContain("Oluşturma: 16.11.2026 11:30"));
    expect(chips()).not.toContain("10:00");
  });

  it("geçersiz tarih ve bilinmeyen tür uyarısı", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-summary/, SUMMARY);
    renderAt("/zto-finans/finans-raporlari?type=garden&from=2026-99-01", ROUTES);
    expect(
      await screen.findByText("Bilinmeyen rapor türü; genel bakış gösteriliyor."),
    ).toBeTruthy();
    expect(screen.getByText("Tarih okunamadı; varsayılan dönem kullanıldı.")).toBeTruthy();
  });

  it("sunucu REPORT_TYPE_NOT_FOUND → genel bakış + uyarı", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-accounts/, () => {
      throw apiError(404, "REPORT_TYPE_NOT_FOUND", "Rapor türü bulunamadı.");
    });
    fakeApi.on("GET", /^\/finance\/reports\/ledger-summary/, SUMMARY);
    renderAt("/zto-finans/finans-raporlari?type=LABOR", ROUTES);
    expect(
      await screen.findByText("Bilinmeyen rapor türü; genel bakış gösteriliyor."),
    ).toBeTruthy();
    await waitFor(() =>
      expect((document.querySelector(".fr-page") as HTMLElement).dataset.frMode).toBe("overview"),
    );
  });
});

describe("Finans Raporları — liste", () => {
  it("borç yanı işaret, Kalan başlığı, Durum ham closing, kartlar, arama, sıralama, toplamlar", async () => {
    fakeApi.on(
      "GET",
      /^\/finance\/reports\/ledger-accounts/,
      ledger(
        [
          row(),
          row({
            accountId: "a2",
            accountCode: "TED-0002",
            accountName: "Batı Lojistik",
            closing: "40",
            opening: "0",
            lastSettlementDate: null,
            lastSettlementAmount: null,
            active: false,
          }),
          row({
            accountId: "a3",
            accountCode: "TED-0003",
            accountName: "Çınar Taşıma",
            currency: "USD",
            closing: "-5",
            opening: "0",
          }),
        ],
        { postPeriodCount: 2 },
      ),
    );
    renderAt("/zto-finans/finans-raporlari?type=SUPPLIERS&range=30", ROUTES);
    await waitFor(() => expect(document.querySelector("#frList")).not.toBeNull());
    expect(query("/finance/reports/ledger-accounts").get("reportType")).toBe("SUPPLIERS");
    expect(screen.getByText(/Dönem sonrasında 2 hareket var/)).toBeTruthy();

    const list = document.querySelector("#frList") as HTMLTableElement;
    const headers = Array.from(list.tHead!.rows[0].cells, (th) => th.textContent);
    expect(headers).toEqual([
      "Kod",
      "Cari",
      "Grup",
      "PB",
      "Devir",
      "Alış / borç",
      "Ödenen",
      "İade / alacak",
      "Tahsilat",
      "Kalan (borcumuz)",
      "Son ödeme",
      "Tutar",
      "Son hareket",
    ]);
    const first = list.tBodies[0].rows[0];
    const kalan = first.cells[9];
    // Normal borcumuz (−190) pozitif ve fr-neg'siz.
    expect(kalan.textContent).toBe("190,00");
    expect(kalan.className).toBe("num fr-closing");
    expect(first.cells[4].textContent).toBe("20,00");
    expect(first.cells[10].textContent).toBe("16.11.2026 (Bugün)");
    const second = list.tBodies[0].rows[1];
    expect(second.cells[9].className).toContain("fr-neg");
    expect(second.cells[1].textContent).toBe("Batı Lojistik Pasif");
    expect(second.cells[10].textContent).toBe("Ödeme yok");
    expect(second.cells[1].querySelector("a")?.getAttribute("href")).toBe(
      "/zto-finans/finans-raporlari?type=SUPPLIERS&from=2026-10-18&to=2026-11-16&account=a2",
    );

    // Kutucuklar (görünen satırlar) ve Toplamlar (ham closing).
    expect(document.querySelector('[data-fr-tile="count"]')?.textContent).toBe("3");
    expect(document.querySelector('[data-fr-tile="kalan"]')?.textContent).toBe("150,00 ₺\n5,00 $");
    const totals = Array.from(
      (document.querySelector("#frTotals") as HTMLTableElement).tBodies[0].rows,
      (tr) => Array.from(tr.cells, (td) => td.textContent?.replace(/\s+/g, " ").trim()),
    );
    expect(totals[0]).toEqual([
      "Türk Lirası (₺)",
      "190,00 ₺",
      "40,00 ₺",
      "150,00 ₺ (borcumuz)",
      "2",
    ]);

    // Durum kartı ham closing'den: −190 Borçluyuz, 40 Bize borçlu.
    const durum = document.querySelector(
      '[data-filter-type="durum"].stat-items-wrapper',
    ) as HTMLElement;
    const values = Array.from(durum.querySelectorAll(".stat-item"), (i) =>
      i.getAttribute("data-filter-value"),
    );
    expect(values).toEqual(["Borçluyuz", "Bize borçlu"]);
    const weOwe = durum.querySelector('[data-filter-value="Borçluyuz"]') as HTMLElement;
    fireEvent.keyDown(weOwe, { key: "Enter" });
    await waitFor(() => expect(list.tBodies[0].rows).toHaveLength(2));
    expect(weOwe.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-stat-result]")?.textContent).toBe("2 / 3 satır");
    fireEvent.click(screen.getByRole("button", { name: /Temizle/ }));
    await waitFor(() => expect(list.tBodies[0].rows).toHaveLength(3));

    // Arama (200 ms gecikmeli, tr küçük harf).
    fireEvent.change(screen.getByLabelText("Cari ara"), { target: { value: "çınar" } });
    await waitFor(() => expect(list.tBodies[0].rows).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Cari ara"), { target: { value: "" } });
    await waitFor(() => expect(list.tBodies[0].rows).toHaveLength(3));

    // Sıralama: aria-sort yalnız sıralı sütunda; durum iletisi; odak düğmede.
    const sortButton = within(list.tHead!).getByRole("button", { name: "Kalan (borcumuz)" });
    sortButton.focus();
    fireEvent.click(sortButton);
    await waitFor(() =>
      expect(Array.from(list.tBodies[0].rows, (r) => r.dataset.acc)).toEqual(["a2", "a3", "a1"]),
    );
    expect(sortButton.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    expect(list.querySelectorAll("th[aria-sort]")).toHaveLength(1);
    expect(document.activeElement).toBe(sortButton);
    const status = list.closest("section")?.querySelector('[role="status"]');
    expect(status?.textContent).toBe("Kalan (borcumuz) sütununa göre artan sıralandı, 3 satır");
    fireEvent.click(sortButton);
    await waitFor(() =>
      expect(sortButton.closest("th")?.getAttribute("aria-sort")).toBe("descending"),
    );
  });

  it("çok şirketli konsolidede Şirket sütunu; satır anahtarı cari × şirket × PB", async () => {
    signIn(["FINANCE_VIEW"], TWO_COMPANIES);
    fakeApi.on(
      "GET",
      /^\/finance\/reports\/ledger-accounts/,
      ledger([row(), row({ companyId: "c2", companyName: "Beta", closing: "30" })], {
        reportType: "SALES",
        side: "RECEIVABLE",
      }),
    );
    renderAt("/zto-finans/finans-raporlari?type=SALES&companyId=all", ROUTES);
    await waitFor(() => expect(document.querySelector("#frList")).not.toBeNull());
    expect(query("/finance/reports/ledger-accounts").get("companyId")).toBeNull();
    const list = document.querySelector("#frList") as HTMLTableElement;
    expect(Array.from(list.tHead!.rows[0].cells, (th) => th.textContent)[2]).toBe("Şirket");
    expect(Array.from(list.tBodies[0].rows, (r) => r.cells[2].textContent)).toEqual([
      "Acme",
      "Beta",
    ]);
    // Alacak yanı: Kalan başlığı ve işaret aynen.
    expect(within(list.tHead!).getByRole("button", { name: "Kalan (bize borcu)" })).toBeTruthy();
    expect(list.tBodies[0].rows[0].cells[11].textContent).toBe("-190,00");
    expect((document.getElementById("frcompanyId") as HTMLSelectElement).value).toBe("all");
  });

  it("kayıt yoksa 'Bu dönemde kayıt yok.'", async () => {
    fakeApi.on("GET", /^\/finance\/reports\/ledger-accounts/, ledger([]));
    renderAt("/zto-finans/finans-raporlari?type=SUPPLIERS", ROUTES);
    expect(await screen.findByText("Bu dönemde kayıt yok.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Excel'e Aktar/ })).toBeNull();
  });
});

describe("Finans Raporları — ekstre", () => {
  function statementApi(statement: Partial<Statement> = {}) {
    fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, account());
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/statement\?/, {
      currency: "TRY",
      openingBalance: 0,
      openingBalances: [{ currency: "TRY", amount: 100 }],
      lines: [
        line(),
        line({
          id: "l2",
          date: "2026-11-03",
          direction: "CREDIT",
          amount: 400,
          kind: "COLLECTION",
          documentType: "SETTLEMENT",
          paymentMethod: "BANK",
          documentNo: null,
        }),
      ],
      page: 0,
      size: 2,
      totalElements: 2,
      totalPages: 1,
      ...statement,
    });
    fakeApi.on("GET", /^\/finance\/reports\/account-methods\?/, [
      { type: "COLLECTION", method: "BANK", currency: "TRY", amount: "400" },
    ]);
  }

  it("TCKN maskeli, devir + hareket + kapanış, yöntemler, Listeye dön", async () => {
    statementApi();
    renderAt("/zto-finans/finans-raporlari?account=a1&from=2026-11-01&to=2026-11-16", ROUTES);
    expect(await screen.findByText(/Vergi no: \*{7}8901 Konak/)).toBeTruthy();
    expect(document.body.textContent).not.toContain("12345678901");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ayşe Yılmaz - Cari Ekstre");
    expect(query("/finance/accounts/a1/statement").get("from")).toBe("2026-11-01");
    expect(query("/finance/accounts/a1/statement").get("size")).toBe("2000");

    const table = document.querySelector('table[data-fr-sheet="Ekstre ₺"]') as HTMLTableElement;
    const rows = Array.from(table.tBodies[0].rows, (tr) =>
      Array.from(tr.cells, (td) => td.textContent?.replace(/\s+/g, " ").trim()),
    );
    expect(rows[0]).toEqual(["01.11.2026", "", "", "DEVREDEN BAKİYE", "", "", "", "", "100,00 B"]);
    expect(rows[1]).toEqual([
      "02.11.2026",
      "BA-1",
      "Alacak kaydı · Fatura",
      "Navlun",
      "",
      "Merkez",
      "250,00",
      "",
      "350,00 B",
    ]);
    expect(rows[2]).toEqual([
      "03.11.2026",
      "",
      "Tahsilat",
      "Navlun",
      "Banka",
      "Merkez",
      "",
      "400,00",
      "50,00 A",
    ]);
    expect(rows[3]).toEqual([
      "",
      "",
      "",
      "Dönem toplamı ve kapanış",
      "",
      "",
      "250,00",
      "400,00",
      "50,00 A",
    ]);
    expect(screen.getByText("Kapanış: 50,00 ₺ A")).toBeTruthy();
    expect(screen.getByText("Ödeme ve tahsilat yöntemleri")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Listeye dön/ }).getAttribute("href")).toBe(
      "/zto-finans/finans-raporlari?type=SALES&from=2026-11-01&to=2026-11-16",
    );
    expect(screen.getByRole("link", { name: "Mevcut cari ekstresi" }).getAttribute("target")).toBe(
      "_blank",
    );
  });

  it("cari bulunamazsa uyarı; sınır aşımı notu", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/zz(\?|$)/, () => {
      throw apiError(404, "ACCOUNT_NOT_FOUND", "yok");
    });
    fakeApi.on("GET", /^\/finance\/accounts\/zz\/statement\?/, {
      lines: [],
      openingBalances: [],
      totalPages: 0,
    });
    fakeApi.on("GET", /^\/finance\/reports\/account-methods\?/, []);
    renderAt("/zto-finans/finans-raporlari?account=zz", ROUTES);
    expect(
      await screen.findByText("Cari bulunamadı ya da bu cariyi görme yetkiniz yok."),
    ).toBeTruthy();
  });

  it("31+ sayfalık ekstre sınırlandırılır", async () => {
    statementApi({ totalPages: 31 });
    renderAt("/zto-finans/finans-raporlari?account=a1", ROUTES);
    expect(
      await screen.findByText("Ekstre 60000 satırla sınırlandı; dönemi daraltın."),
    ).toBeTruthy();
    expect(calls("/finance/accounts/a1/statement")).toHaveLength(30);
  });
});
