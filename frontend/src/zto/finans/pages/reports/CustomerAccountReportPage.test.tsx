// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type {
  AccountGroup,
  AccountPerformanceRow,
  Aging,
  CurrencyPositionRow,
} from "../../../../pages/finance/types";
import { TWO_COMPANIES, fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { makeInstrument } from "../instruments/billsTestUtils";
import { addDaysIso, localToday } from "../../reports/reportDates";
import { CustomerAccountReportPage } from "./CustomerAccountReportPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const chartProps: Array<Record<string, unknown>> = [];
vi.mock("../../../components/ZtoChart", () => ({
  default: (props: Record<string, unknown> & { ariaLabel?: string }) => {
    chartProps.push(props);
    return <div data-testid="chart" role="img" aria-label={props.ariaLabel} />;
  },
}));

const VIEWER = ["FINANCE_VIEW"];
const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE"];
const today = localToday();

const GROUPS: AccountGroup[] = [
  {
    code: "MUSTERI",
    accountType: "CUSTOMER",
    name: "Müşteri",
    reportType: "SALES",
    codePrefix: "120",
    sortOrder: 1,
    typeDefault: true,
    selectable: true,
    active: true,
  },
  {
    code: "PERSONEL",
    accountType: "EMPLOYEE",
    name: "Personel",
    reportType: "PERSONNEL",
    codePrefix: "335",
    sortOrder: 9,
    typeDefault: true,
    selectable: true,
    active: true,
  },
];

function aging(overrides: Partial<Aging> = {}): Aging {
  return {
    accountId: "a1",
    accountName: "Kuzey Lojistik",
    currency: "TRY",
    days0To30: 1000,
    days31To60: 0,
    days61To90: 0,
    daysOver90: 250.5,
    total: 1350.5,
    accountCode: "120.01",
    subGroup: "MUSTERI",
    subGroupName: "Müşteri",
    phone: null,
    notDue: 100,
    tlTotal: 1350.5,
    ...overrides,
  };
}

function performance(overrides: Partial<AccountPerformanceRow> = {}): AccountPerformanceRow {
  return {
    accountId: "a1",
    accountCode: "120.01",
    accountName: "Kuzey Lojistik",
    subGroupName: "Müşteri",
    currency: "USD",
    paymentCount: 0,
    collectionCount: 4,
    paymentAmount: "0.00",
    collectionAmount: "1200.00",
    avgDelayDays: "2.5",
    lateCount: 1,
    onTimeCount: 6,
    unmatchedCount: 2,
    score: 85,
    ...overrides,
  };
}

function render(path = "/zto-finans/cari-raporlari") {
  return renderAt(path, { "cari-raporlari": <CustomerAccountReportPage /> });
}

function where(): string {
  return screen.getByTestId("where").textContent ?? "";
}

function pane(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

beforeEach(() => {
  fakeApi.reset();
  chartProps.length = 0;
  fakeApi.on("GET", "/finance/account-groups", GROUPS);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
});
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("CustomerAccountReportPage", () => {
  it("iskelet: kök sınıf, 5 sekme, açılışta rapor istenmez, filtre kartı ZTO DOM'u", async () => {
    signIn(VIEWER);
    render();
    const tablist = await screen.findByRole("tablist", { name: "Cari Hesap Raporları" });
    expect(document.querySelector(".zto-finans.zto-page-customer-account-report")).toBeTruthy();
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent?.trim()),
    ).toEqual([
      "Cari Yaşlandırma",
      "Çek Vadesi",
      "Senet Vadesi",
      "Ödeme Performansı",
      "Döviz Pozisyonu",
    ]);
    const selected = within(tablist).getByRole("tab", { selected: true });
    expect(selected.id).toBe("aging-tab");
    expect(selected.getAttribute("tabindex")).toBe("0");
    expect(pane("aging").hidden).toBe(false);
    expect(pane("checkMaturity").hidden).toBe(true);
    expect(pane("aging").className).toBe("tab-pane fade show active");

    // Filtre kartı: mb-3 yok, col-md-3 > .form-group; rapor kartı card.mt-3 > card-header.bg-light.
    const filterCard = pane("aging").querySelector(":scope > .card") as HTMLElement;
    expect(filterCard.className).toBe("card");
    expect(filterCard.querySelector(".card-header.bg-light > h6.mb-0")?.textContent).toContain(
      "Filtreler",
    );
    expect(filterCard.querySelectorAll(".col-md-3 > .form-group").length).toBeGreaterThanOrEqual(4);
    const reportCard = pane("aging").querySelector(".card.mt-3") as HTMLElement;
    expect(
      reportCard.querySelector(".card-header.bg-light .d-flex h6.mb-0")?.textContent?.trim(),
    ).toBe("Cari Yaşlandırma Raporu");
    expect(
      within(pane("aging")).getByText('Filtreleri seçip "Raporu Getir" butonuna tıklayınız.'),
    ).toBeTruthy();
    expect((screen.getByLabelText("Rapor Tarihi") as HTMLInputElement).value).toBe(today);
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/reports/"))).toBe(false);
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/instruments"))).toBe(false);
  });

  it("yaşlandırma: Raporu Getir → istek, satır, para birimi başına GENEL TOPLAM, personel grubu izinsiz yok", async () => {
    signIn(VIEWER);
    fakeApi.on("GET", /^\/finance\/reports\/aging\?/, [
      aging(),
      aging({
        accountId: "a2",
        accountCode: "120.02",
        accountName: "Güney",
        currency: "USD",
        phone: "05321112233",
        total: -10,
        days0To30: -10,
        daysOver90: 0,
        notDue: 0,
        tlTotal: -340,
      }),
    ]);
    render();
    fireEvent.click(within(pane("aging")).getByRole("button", { name: /Raporu Getir/ }));
    const row = (await screen.findByText("Kuzey Lojistik")).closest("tr") as HTMLElement;
    expect(fakeApi.log("GET").find((p) => p.startsWith("/finance/reports/aging"))).toBe(
      `/finance/reports/aging?type=RECEIVABLE&asOf=${today}&basis=DUE`,
    );
    const cells = Array.from(row.children, (td) => td.textContent?.trim());
    expect(cells).toEqual([
      "120.01",
      "Kuzey Lojistik",
      "Müşteri",
      "-",
      "100,00 ₺",
      "1.000,00 ₺",
      "0,00 ₺",
      "0,00 ₺",
      "250,50 ₺",
      "1.350,50 ₺",
    ]);
    expect(row.lastElementChild?.className).toContain("text-success");
    const usd = screen.getByText("Güney").closest("tr") as HTMLElement;
    expect(usd.lastElementChild?.className).toContain("text-danger");
    const foot = document.querySelector("#agingReportTable tfoot") as HTMLElement;
    const footRows = Array.from(foot.querySelectorAll("tr"), (tr) => tr.textContent);
    expect(footRows).toHaveLength(3);
    expect(footRows[0]).toContain("GENEL TOPLAM:");
    expect(footRows[0]).toContain("1.350,50 ₺");
    expect(footRows[1]).toContain("-10,00 $");
    expect(footRows[2]).toContain("TL KARŞILIĞI:");
    expect(footRows[2]).toContain("1.010,50 ₺");
    // Personel grubu FINANCE_EMPLOYEE_VIEW olmadan seçenek değil (gizli yerel select).
    const groupSelect = document.getElementById("agingAccountGroup") as HTMLSelectElement;
    expect(Array.from(groupSelect.options, (o) => o.textContent)).toEqual([
      "Tüm Gruplar",
      "Müşteri",
    ]);
    expect(
      within(pane("aging"))
        .getByRole("button", { name: /Excel'e Aktar/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("yaşlandırma: hata/boş → ZTO iletisi", async () => {
    signIn(VIEWER);
    fakeApi.on("GET", /^\/finance\/reports\/aging\?/, []);
    render();
    fireEvent.click(within(pane("aging")).getByRole("button", { name: /Raporu Getir/ }));
    expect(
      await within(pane("aging")).findByText("Veri bulunamadı veya hata oluştu."),
    ).toBeTruthy();
  });

  it("çok şirketli: Blackrose eki Şirket seçicisi ve Konsolide", async () => {
    signIn(VIEWER, TWO_COMPANIES);
    render();
    await screen.findByRole("tablist");
    const select = document.getElementById("agingCompany") as HTMLSelectElement;
    expect(Array.from(select.options, (o) => o.textContent)).toEqual(["Konsolide", "Acme", "Beta"]);
    expect(document.getElementById("agingType")).toBeTruthy();
    expect(document.getElementById("agingBasis")).toBeTruthy();
  });

  it("sekme klavyesi: ok odak taşır, Enter seçer (?tab, replace)", async () => {
    signIn(VIEWER);
    render();
    const first = await screen.findByRole("tab", { name: /Cari Yaşlandırma/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const checks = screen.getByRole("tab", { name: /Çek Vadesi/ });
    expect(document.activeElement).toBe(checks);
    expect(where()).toBe("/zto-finans/cari-raporlari");
    fireEvent.keyDown(checks, { key: "Enter" });
    await waitFor(() => expect(where()).toBe("/zto-finans/cari-raporlari?tab=checks"));
    expect(checks.getAttribute("aria-selected")).toBe("true");
    expect(pane("checkMaturity").hidden).toBe(false);
    expect(pane("aging").hidden).toBe(true);
    fireEvent.keyDown(checks, { key: "End" });
    const position = screen.getByRole("tab", { name: /Döviz Pozisyonu/ });
    expect(document.activeElement).toBe(position);
    fireEvent.keyDown(position, { key: " " });
    fireEvent.keyUp(position, { key: " " });
    await waitFor(() => expect(where()).toBe("/zto-finans/cari-raporlari?tab=position"));
    fireEvent.keyDown(position, { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("çek vadesi: süzgeç etiketleri, istek, kartlar, satır, Düzenle yalnız MANAGE", async () => {
    signIn(MANAGER);
    fakeApi.on(
      "GET",
      /^\/finance\/instruments\?/,
      page([
        makeInstrument({
          id: "c1",
          kind: "CHECK",
          number: "CK-1",
          bankName: "Ziraat",
          bankBranch: "Konak",
          noteType: null,
          dueDate: addDaysIso(today, -3),
          status: "PORTFOLIO",
          money: { amount: "1000", currency: "TRY" },
        }),
        makeInstrument({
          id: "c2",
          kind: "CHECK",
          number: "CK-2",
          noteType: null,
          dueDate: addDaysIso(today, 2),
          status: "AT_BANK",
          employeeMasked: true,
          accountName: null,
          accountCode: null,
          money: { amount: "50", currency: "USD" },
        }),
      ]),
    );
    render("/zto-finans/cari-raporlari?tab=checks");
    const checkPane = pane("checkMaturity");
    expect(within(checkPane).getByLabelText("Başlangıç Tarihi")).toBeTruthy();
    expect((within(checkPane).getByLabelText("Bitiş Tarihi") as HTMLInputElement).value).toBe(
      addDaysIso(today, 90),
    );
    fireEvent.change(document.getElementById("checkStatus") as HTMLSelectElement, {
      target: { value: "collected" },
    });
    fireEvent.click(within(checkPane).getByRole("button", { name: /Raporu Getir/ }));
    const row = (await within(checkPane).findByText("CK-1")).closest("tr") as HTMLElement;
    const call = fakeApi.log("GET").find((p) => p.startsWith("/finance/instruments")) ?? "";
    expect(call).toContain("kind=CHECK");
    expect(call).toContain(`dueFrom=${today}`);
    expect(call).toContain("status=COLLECTED&status=COLLECTED_TO_CASH");
    expect(within(checkPane).getByText("Çek Vade Raporu")).toBeTruthy();
    expect(document.getElementById("checkTotalCount")?.textContent).toBe("2");
    expect(document.getElementById("checkTotalAmount")?.textContent).toBe("1.000,00 ₺ / 50,00 $");
    expect(document.getElementById("checkThisWeek")?.textContent).toBe("1");
    expect(document.getElementById("checkOverdue")?.textContent).toBe("1");
    expect(row.textContent).toContain("Ziraat");
    expect(row.textContent).toContain("Konak");
    expect(row.textContent).toContain("-3 gün");
    expect(within(row).getByText("Vadesi Geçmiş").className).toBe("badge badge-danger");
    expect(within(row).getByText("Portföyde").className).toBe("badge badge-info");
    const edit = within(row).getByRole("link", { name: "Düzenle CK-1" });
    expect(edit.getAttribute("href")).toBe("/zto-finans/cekler/c1/duzenle");
    expect(edit.getAttribute("title")).toBe("Düzenle");
    const masked = within(checkPane).getByText("CK-2").closest("tr") as HTMLElement;
    expect(within(masked).getByText("Personel carisi")).toBeTruthy();
    expect(within(masked).getByText("Bu Hafta").className).toBe("badge badge-warning");
  });

  it("çek vadesi: FINANCE_VIEW'da Düzenle yok; kırpılmış listede uyarı", async () => {
    signIn(VIEWER);
    fakeApi.on("GET", /^\/finance\/instruments\?/, {
      ...page([makeInstrument({ id: "c1", kind: "CHECK", number: "CK-1", noteType: null })]),
      totalElements: 6000,
    });
    render("/zto-finans/cari-raporlari?tab=checks");
    const checkPane = pane("checkMaturity");
    fireEvent.click(within(checkPane).getByRole("button", { name: /Raporu Getir/ }));
    const row = (await within(checkPane).findByText("CK-1")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("link")).toBeNull();
    expect(
      within(checkPane).getByText("İlk 5000 kayıt gösteriliyor; tarih aralığını daraltın."),
    ).toBeTruthy();
  });

  it("senet vadesi: kart sırası, Teminat rozeti, senet türü, Düzenle yolu", async () => {
    signIn(MANAGER);
    fakeApi.on(
      "GET",
      /^\/finance\/instruments\?/,
      page([makeInstrument({ id: "n1", number: "SEN-001", collateral: true, noteType: "BOND" })]),
    );
    render("/zto-finans/cari-raporlari?tab=bills");
    const billPane = pane("billMaturity");
    fireEvent.click(within(billPane).getByRole("button", { name: /Raporu Getir/ }));
    const row = (await within(billPane).findByText("SEN-001")).closest("tr") as HTMLElement;
    expect(fakeApi.log("GET").find((p) => p.startsWith("/finance/instruments"))).toContain(
      "kind=NOTE",
    );
    expect(
      Array.from(billPane.querySelectorAll(".info-box"), (box) => box.className.split(" ")[1]),
    ).toEqual(["bg-warning", "bg-success", "bg-info", "bg-danger"]);
    expect(within(billPane).getByText("Senet Vade Raporu")).toBeTruthy();
    expect(within(row).getByText("Bono")).toBeTruthy();
    expect(within(row).getByText(/Teminat/).className).toBe("badge badge-warning");
    expect(row.textContent).toContain("120.01");
    expect(
      within(row)
        .getByRole("link", { name: /Düzenle/ })
        .getAttribute("href"),
    ).toBe("/zto-finans/senetler/n1/duzenle");
    expect(row.children).toHaveLength(11);
  });

  it("ödeme performansı: istek, 11 sütun, skor '85%', eşleşmesiz not", async () => {
    signIn(VIEWER);
    fakeApi.on("GET", /^\/finance\/reports\/account-performance\?/, [performance()]);
    render("/zto-finans/cari-raporlari?tab=performance");
    const perfPane = pane("paymentPerformance");
    fireEvent.click(within(perfPane).getByRole("button", { name: /Raporu Getir/ }));
    const row = (await within(perfPane).findByText("Kuzey Lojistik")).closest("tr") as HTMLElement;
    const call =
      fakeApi.log("GET").find((p) => p.startsWith("/finance/reports/account-performance")) ?? "";
    expect(call).toContain(`to=${today}`);
    expect(row.children).toHaveLength(11);
    expect(within(row).getByText("85%").className).toBe("badge badge-success font-weight-bold");
    expect(row.textContent).toContain("1.200,00 $");
    expect(row.textContent).toContain("2,5");
    expect(within(perfPane).getByText("Ödeme Performans Raporu")).toBeTruthy();
    expect(within(perfPane).getByText(/eşleştirilmemiş 2 kayıt skora girmez/)).toBeTruthy();
  });

  it("döviz pozisyonu: Raporu Yükle, satır, durum, grafik height yok + aspectRatio 3", async () => {
    signIn(VIEWER);
    const rows: CurrencyPositionRow[] = [
      { currency: "USD", companyId: null, cash: "5", receivable: "100", payable: "40", net: "65" },
      { currency: "TRY", companyId: null, cash: "0", receivable: "10", payable: "10", net: "0" },
    ];
    fakeApi.on("GET", /^\/finance\/reports\/currency-position/, rows);
    render("/zto-finans/cari-raporlari?tab=position");
    const positionPane = pane("currencyPosition");
    const refresh = within(positionPane).getByRole("button", { name: /Yenile/ });
    expect(refresh.className).toBe("btn btn-primary");
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/reports/currency-position"))).toBe(
      false,
    );
    fireEvent.click(within(positionPane).getByRole("button", { name: /Raporu Yükle/ }));
    const usd = (await within(positionPane).findByText("Amerikan Doları")).closest(
      "tr",
    ) as HTMLElement;
    expect(within(usd).getByText("Alacak").className).toBe("badge badge-success");
    expect(usd.textContent).toContain("60,00 $");
    const tl = within(positionPane).getByText("Türk Lirası").closest("tr") as HTMLElement;
    expect(within(tl).getByText("Dengede").className).toBe("badge badge-secondary");
    expect(
      await within(positionPane).findByRole("img", {
        name: "Döviz bazında alacak ve borç dağılımı; ayrıntılar tablodadır.",
      }),
    ).toBeTruthy();
    const props = chartProps[chartProps.length - 1];
    expect(props.height).toBeUndefined();
    expect(props.options).toMatchObject({ aspectRatio: 3 });
    expect(props.title).toBe("Döviz Bazında Alacak/Borç Dağılımı");
    expect(within(positionPane).getByText(/Bu rapor tüm para birimlerindeki/)).toBeTruthy();
  });
});
