// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { SettlementListItem } from "../../../../pages/finance/types";
import { TWO_COMPANIES, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { FUND_TREE } from "../funds/fundsTestUtils";
import { addDaysIso, todayIso } from "../fundTransactions/fundTransactionsLogic";
import { CollectionsPage } from "./CollectionsPage";
import { PaymentsPage } from "./PaymentsPage";
import {
  SETTLEMENT_MANAGER,
  SETTLEMENT_VIEWER,
  bankItem,
  makeDetail,
  makeItem,
} from "./settlementsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const excel = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../../export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../export")>()),
  exportExcel: excel,
}));

type ModalProps = {
  show: boolean;
  onHide: () => void;
  mode: string;
  settlementId?: string;
  presetAccountId?: string;
  presetFundAccountId?: string;
  presetBranchId?: string;
  presetCurrency?: string;
  presetMethod?: string;
};
// FE-2 modalları kendi testlerinde; burada sayfanın verdiği proplar (12.2a §5.5, §5.6).
vi.mock("../settlementModals", () => {
  const stub = (name: string) =>
    function Stub(props: ModalProps) {
      return props.show ? (
        <div role="dialog" aria-label={name} data-mode={props.mode}>
          <span data-testid="modal-props">
            {[
              props.settlementId ?? "-",
              props.presetAccountId ?? "-",
              props.presetFundAccountId ?? "-",
              props.presetBranchId ?? "-",
              props.presetCurrency ?? "-",
              props.presetMethod ?? "-",
            ].join("|")}
          </span>
          <button type="button" onClick={props.onHide}>
            Kapat-{name}
          </button>
        </div>
      ) : null;
    };
  return { PaymentModal: stub("ödeme-modalı"), CollectionModal: stub("tahsilat-modalı") };
});

const ROUTES = { odemeler: <PaymentsPage />, tahsilatlar: <CollectionsPage /> };

const pageOf = (content: SettlementListItem[], totalElements = content.length) => ({
  content,
  page: 0,
  size: 10,
  totalElements,
  totalPages: Math.max(1, Math.ceil(totalElements / 10)),
});

function api(payments: SettlementListItem[] = [], collections: SettlementListItem[] = []) {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, FUND_TREE);
  fakeApi.on("GET", "/finance/currencies", [{ code: "TRY", name: "Türk Lirası" }]);
  fakeApi.on("GET", /^\/finance\/payment-plans\?/, pageOf([]));
  fakeApi.on("GET", /^\/finance\/accounts\?/, {
    content: [{ id: "a1", code: "120.01", name: "Kuzey Lojistik", subGroupName: "Tedarikçiler" }],
    page: 0,
    size: 2000,
    totalElements: 1,
    totalPages: 1,
  });
  fakeApi.on("GET", "/finance/account-groups", [
    { accountType: "SUPPLIER", code: "TED", name: "Tedarikçiler", selectable: true },
    { accountType: "CUSTOMER", code: "X", name: "Gizli", selectable: false },
  ]);
  fakeApi.on("GET", /^\/finance\/payments\?/, pageOf(payments));
  fakeApi.on("GET", /^\/finance\/collections\?/, pageOf(collections));
}

const listCalls = (base: string) =>
  fakeApi.log("GET").filter((p) => p.startsWith(`/finance/${base}?`));
const lastQuery = (base: string) => new URLSearchParams(listCalls(base).at(-1)?.split("?")[1]);

const norm = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const classes = (el: Element | null | undefined) => Array.from(el?.classList ?? []);

/** Başlık + veri satırları (yükleme satırı gidene kadar bekler). */
async function dataRows(): Promise<HTMLElement[]> {
  await waitFor(() => {
    const body = document.querySelector("table.dataTable tbody, table tbody");
    expect(body?.querySelector("td.dataTables_empty")).toBeFalsy();
    expect(body?.querySelectorAll("tr").length).toBeGreaterThan(0);
  });
  return screen.getAllByRole("row");
}

async function open(path = "/zto-finans/odemeler") {
  renderAt(path, ROUTES);
  const base = path.includes("tahsilat") ? "collections" : "payments";
  await waitFor(() => expect(listCalls(base).length).toBeGreaterThan(0));
}

beforeEach(() => {
  fakeApi.reset();
  excel.mockClear();
  signIn(SETTLEMENT_MANAGER);
});

afterEach(cleanup);

// Tam sayfa + kabuk çizimi tam koşuda (kapsam açıkken) 5 sn varsayılanını aşabiliyor.
vi.setConfig({ testTimeout: 20_000 });

describe("Ödemeler sayfası", () => {
  it("ZTO iskeleti: başlık, iki çip tek d-none d-lg-flex sarmalayıcıda, card-body p-2", async () => {
    api([makeItem()]);
    await open();
    expect(document.querySelector(".zto-finans.zto-page-payments")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ödeme Yönetimi" })).toBeTruthy();
    const chips = document.querySelectorAll(".erp-info-chip");
    expect(chips).toHaveLength(2);
    expect(chips[0].parentElement).toBe(chips[1].parentElement);
    expect(chips[0].parentElement?.className).toBe("d-none d-lg-flex align-items-center");
    expect(document.querySelector(".card > .card-body.p-2 > .erp-filter-card")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Yeni Ödeme/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ödemeler/ })).toBeNull();
    expect(document.querySelector(".table-responsive[role=region][tabindex='0']")).not.toBeNull();
    expect(document.querySelector("#paymentsTable.pym-phone-card-table")).not.toBeNull();
  });

  it("ilk sorgu: bugün−7…bugün, POSTED, carili, ilk sayfa 25 satır (ZTO); uzunluk menüsü 'Tümü'süz", async () => {
    api([makeItem()]);
    await open();
    const query = lastQuery("payments");
    const today = todayIso();
    expect(query.get("from")).toBe(addDaysIso(today, -7));
    expect(query.get("to")).toBe(today);
    expect(query.get("status")).toBe("POSTED");
    expect(query.get("hasAccount")).toBe("true");
    expect(query.get("page")).toBe("0");
    expect(query.get("size")).toBe("25");
    expect(query.getAll("sort")).toEqual(["settlementDate,desc", "createdAt,desc"]);
    const length = document.querySelector<HTMLSelectElement>("select[name='paymentsTable_length']");
    expect(Array.from(length?.options ?? [], (o) => o.value)).toEqual(["10", "25", "50", "100"]);
    expect(length?.value).toBe("25");
  });

  it("Shift ile çok sütunlu sıralama sunucuya en çok 3 sort gönderir (zto-onyuz:F3)", async () => {
    api([makeItem()]);
    await open();
    const header = (text: string) =>
      Array.from(document.querySelectorAll<HTMLElement>("#paymentsTable thead th")).find(
        (th) => th.textContent?.trim() === text,
      ) as HTMLElement;
    fireEvent.click(header("Tutar"), { shiftKey: true });
    fireEvent.click(header("Belge No"), { shiftKey: true });
    await waitFor(() =>
      expect(lastQuery("payments").getAll("sort")).toEqual([
        "settlementDate,desc",
        "createdAt,desc",
        "amount,asc",
      ]),
    );
    fireEvent.click(header("İş Yeri"), { shiftKey: true });
    // Tablo en çok 3 sütun tutar (en eski = Tarih düşer); istek hâlâ ≤ 3 anahtar.
    await waitFor(() =>
      expect(lastQuery("payments").getAll("sort")).toEqual([
        "amount,asc",
        "documentNo,asc",
        "branchName,asc",
      ]),
    );
  });

  it("satır hücreleri: tarih, iş yeri + şube, cari bağlantısı, tutar, rozet, muhasebe, kaynak", async () => {
    api([makeItem(), bankItem({ id: "s2", displayMethod: "CREDIT_CARD", planId: "p1" })]);
    await open();
    const rows = await dataRows();
    const first = rows[1];
    const cells = within(first).getAllByRole("cell");
    expect(norm(cells[0])).toContain("14.11.2026");
    expect(norm(cells[1])).toContain("Merkezİzmir");
    const link = within(cells[2]).getByRole("link");
    expect(link?.getAttribute("href")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("title")).toBe("Cari Hesap İşlemleri");
    expect(norm(cells[3])).toContain("FT-1");
    expect(norm(cells[4].querySelector(".payment-amount-cell"))).toContain("1.500,00 ₺");
    expect(classes(within(cells[5]).getByText("Nakit"))).toEqual(
      expect.arrayContaining(["badge", "badge-success"]),
    );
    expect(classes(within(cells[6]).getByText("Cari Ödeme"))).toEqual(
      expect.arrayContaining(["badge-success"]),
    );
    expect(norm(cells[7])).toContain("Merkez Kasa");
    expect(cells[8].querySelector(".desc-clamp")?.getAttribute("title")).toBe("Kasım ödemesi");
    expect(cells[0]?.getAttribute("data-label")).toBe("Tarih");
    const second = within(rows[2]).getAllByRole("cell");
    expect(classes(within(second[5]).getByText("Kredi Kartı"))).toEqual(
      expect.arrayContaining(["badge-danger"]),
    );
    expect(norm(second[6])).toContain("Plan");
    expect(norm(second[7])).toContain("Ziraat - Konak");
  });

  it("İşlem: Detay her zaman, Düzenle Nakit/Banka (Kredi Kartı yok), Sil reversible; maskeli satır", async () => {
    api([
      makeItem({ id: "cash" }),
      makeItem({ id: "card", displayMethod: "CREDIT_CARD" }),
      makeItem({ id: "check", displayMethod: "CHECK", correctable: false, reversible: false }),
      makeItem({
        id: "masked",
        employeeMasked: true,
        accountId: null,
        accountName: null,
        reversible: false,
        correctable: false,
      }),
    ]);
    await open();
    const rows = (await dataRows()).slice(1);
    const buttons = (row: HTMLElement) =>
      within(row)
        .queryAllByRole("button")
        .map((b) => b.getAttribute("title"));
    expect(buttons(rows[0])).toEqual(["Detay", "Düzenle", "Sil"]);
    expect(buttons(rows[1])).toEqual(["Detay", "Sil"]);
    expect(buttons(rows[2])).toEqual(["Detay"]);
    expect(buttons(rows[3])).toEqual([]);
    expect(norm(rows[3])).toContain("Personel (gizli)");
    expect(within(rows[3]).queryByRole("link")).toBeNull();
  });

  it("yazma izni yoksa Yeni Ödeme, Düzenle ve Sil gizli; ?openModal yok sayılır", async () => {
    signIn(SETTLEMENT_VIEWER);
    api([makeItem()]);
    await open("/zto-finans/odemeler?openModal=true&id=a1");
    expect(screen.queryByRole("button", { name: /Yeni Ödeme/ })).toBeNull();
    const row = (await dataRows())[1];
    expect(
      within(row)
        .getAllByRole("button")
        .map((b) => b.getAttribute("title")),
    ).toEqual(["Detay"]);
    expect(screen.queryByRole("dialog", { name: "ödeme-modalı" })).toBeNull();
    // Cari süzgeci yine uygulanır ve parametreler URL'den silinir.
    expect(lastQuery("payments").get("accountId")).toBe("a1");
    await waitFor(() =>
      expect(norm(screen.getByTestId("where"))).toContain("/zto-finans/odemeler"),
    );
  });

  it("süzgeç: Filtrele sorguyu kurar, Enter (IME dışı) uygular, Temizle varsayılana döner", async () => {
    api([makeItem()]);
    await open();
    const today = todayIso();
    fireEvent.change(document.getElementById("filterDateStart") as HTMLElement, {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(document.getElementById("filterMethod") as HTMLElement, {
      target: { value: "NOTE" },
    });
    expect(lastQuery("payments").get("from")).toBe(addDaysIso(today, -7));
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() => expect(lastQuery("payments").get("from")).toBe("2026-01-01"));
    expect(lastQuery("payments").getAll("method")).toEqual(["NOTE"]);

    fireEvent.change(document.getElementById("filterDateEnd") as HTMLElement, {
      target: { value: "2026-02-01" },
    });
    fireEvent.keyDown(document.getElementById("filterDateEnd") as HTMLElement, {
      key: "Enter",
      keyCode: 229,
    });
    expect(lastQuery("payments").get("to")).toBe(today);
    fireEvent.keyDown(document.getElementById("filterDateEnd") as HTMLElement, { key: "Enter" });
    await waitFor(() => expect(lastQuery("payments").get("to")).toBe("2026-02-01"));

    fireEvent.click(screen.getByRole("button", { name: /Temizle/ }));
    await waitFor(() => expect(lastQuery("payments").get("from")).toBe(addDaysIso(today, -7)));
    expect(lastQuery("payments").get("to")).toBe(today);
    expect(lastQuery("payments").get("method")).toBeNull();
    expect((document.getElementById("filterMethod") as HTMLSelectElement).value).toBe("");
  });

  it("boş ve hata durumları ZTO metinleriyle", async () => {
    api([]);
    await open();
    expect(await screen.findByText("Kayıt bulunamadı")).toBeTruthy();
    cleanup();
    fakeApi.reset();
    api();
    fakeApi.on("GET", /^\/finance\/payments\?/, () => {
      throw new Error("boom");
    });
    await open();
    expect(await screen.findByText("Veriler yüklenirken hata oluştu")).toBeTruthy();
  });

  it("Yeni Ödeme ve Düzenle modalı doğru kiple açılır; derin bağlantı ön değerleri", async () => {
    api([makeItem()]);
    await open(
      "/zto-finans/odemeler?openModal=true&id=a1&bankId=f1&workPlaceId=b1&currencyId=usd&paymentMethod=Kredi%20Kart%C4%B1",
    );
    const dialog = await screen.findByRole("dialog", { name: "ödeme-modalı" });
    expect(dialog?.getAttribute("data-mode")).toBe("add");
    expect(norm(within(dialog).getByTestId("modal-props"))).toContain("-|a1|f1|b1|USD|CREDIT_CARD");
    await waitFor(() => expect(screen.getByTestId("where").textContent).not.toContain("openModal"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Kapat-ödeme-modalı" }));
    expect(screen.queryByRole("dialog", { name: "ödeme-modalı" })).toBeNull();

    const row = (await dataRows())[1];
    fireEvent.click(within(row).getByRole("button", { name: "Düzenle" }));
    const edit = screen.getByRole("dialog", { name: "ödeme-modalı" });
    expect(edit?.getAttribute("data-mode")).toBe("edit");
    expect(norm(within(edit).getByTestId("modal-props"))).toMatch(/^s1\|/);
  });

  it("openEditPayment derin bağlantısı düzenleme modalını açar; settlementId detay açar", async () => {
    api([makeItem()]);
    fakeApi.on("GET", "/finance/settlements/s7", makeDetail({ item: makeItem({ id: "s7" }) }));
    await open("/zto-finans/odemeler?openEditPayment=true&paymentId=s5&settlementId=s7");
    const edit = await screen.findByRole("dialog", { name: "ödeme-modalı", hidden: true });
    expect(edit.getAttribute("data-mode")).toBe("edit");
    expect(norm(within(edit).getByTestId("modal-props"))).toMatch(/^s5\|/);
    expect(await screen.findByText("Ödeme Detayı")).toBeTruthy();
  });

  it("Detay ve Sil modalları satırdan açılır; Günlük Ödeme Raporu modalı", async () => {
    api([makeItem()]);
    fakeApi.on("GET", "/finance/settlements/s1", makeDetail());
    await open();
    const row = (await dataRows())[1];
    fireEvent.click(within(row).getByRole("button", { name: "Detay" }));
    expect(await screen.findByText("Ödeme Detayı")).toBeTruthy();
    fireEvent.click(document.querySelector(".modal-footer .btn-secondary") as HTMLElement);
    await waitFor(() => expect(screen.queryByText("Ödeme Detayı")).toBeNull());

    fireEvent.click(within(row).getByRole("button", { name: "Sil" }));
    expect(await screen.findByText("Ödeme Silme Onayı")).toBeTruthy();
    expect(document.getElementById("confirmDeleteModal")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^İptal$/ }));
    await waitFor(() => expect(screen.queryByText("Ödeme Silme Onayı")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Günlük Ödeme Raporu/ }));
    expect(await screen.findByRole("button", { name: /Günlük Ödeme Raporu Al/ })).toBeTruthy();
  });

  it("Excel tüm süzülmüş sonucu (sayfa sayfa) görünen metinle aktarır", async () => {
    api([makeItem()]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() => expect(excel).toHaveBeenCalledTimes(1));
    const options = (excel.mock.calls[0] as unknown[])[0] as {
      headers: string[];
      rows: string[][];
      fileName: string;
    };
    expect(options.headers).toEqual([
      "Tarih",
      "İş Yeri",
      "Cari Hesap",
      "Belge No",
      "Tutar",
      "Ödeme Yöntemi",
      "Muhasebe Tipi",
      "Kaynak",
      "Açıklama",
    ]);
    expect(options.rows[0]).toEqual([
      "14.11.2026",
      "Merkez",
      "Kuzey Lojistik (120.01)",
      "FT-1",
      "1.500,00 ₺",
      "Nakit",
      "Cari Ödeme",
      "Merkez Kasa",
      "Kasım ödemesi",
    ]);
    expect(options.fileName).toMatch(/^Odemeler_\d{4}-\d{2}-\d{2}$/);
    expect(listCalls("payments").some((p) => p.includes("size=500"))).toBe(true);
  });

  it("çoklu şirkette Şirket sütunu ve şirket seçici", async () => {
    signIn(SETTLEMENT_MANAGER, TWO_COMPANIES);
    api([makeItem()]);
    await open();
    expect(document.getElementById("filterCompany")).not.toBeNull();
    const headers = Array.from(document.querySelectorAll("#paymentsTable thead th"), (th) =>
      th.textContent?.trim(),
    );
    expect(headers.slice(0, 4)).toEqual(["Tarih", "İş Yeri", "Şirket", "Cari Hesap"]);
  });
});

describe("Tahsilatlar sayfası", () => {
  it("ZTO farkları: başlık, Ödemeler bağlantısı, Hesap Grubu, tablo sınıfı, 11 sütun", async () => {
    api([], [makeItem({ type: "COLLECTION" })]);
    await open("/zto-finans/tahsilatlar");
    expect(document.querySelector(".zto-finans.zto-page-collections")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Tahsilat Yönetimi" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ödemeler/ }).getAttribute("href")).toBe(
      "/zto-finans/odemeler",
    );
    const group = document.getElementById("accountGroupFilter") as HTMLSelectElement;
    await waitFor(() => expect(group.options).toHaveLength(2));
    expect(Array.from(group.options, (o) => o.textContent)).toEqual([
      "Tüm Hesap Grupları",
      "Tedarikçiler",
    ]);
    expect(document.querySelector("#collectionsTable.pym-phone-card-table")).toBeNull();
    const headers = Array.from(document.querySelectorAll("#collectionsTable thead th"), (th) =>
      th.textContent?.trim(),
    );
    expect(headers).toEqual([
      "Tarih",
      "İş Yeri",
      "Cari Hesap",
      "Belge No",
      "Tutar",
      "Tahsilat Yöntemi",
      "Muhasebe Tipi",
      "Kaynak",
      "Açıklama",
      "Döviz Bozum",
      "İşlem",
    ]);
    fireEvent.change(group, { target: { value: "SUPPLIER:TED" } });
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() => expect(lastQuery("collections").get("accountType")).toBe("SUPPLIER"));
    expect(lastQuery("collections").get("subGroup")).toBe("TED");
  });

  it("Tutar hücresinde her satırda 'Kur:'; Döviz Bozum hücreleri ve Boz/Transferler bağlantıları", async () => {
    api(
      [],
      [
        makeItem({ id: "try", type: "COLLECTION" }),
        makeItem({
          id: "wait",
          type: "COLLECTION",
          money: { amount: "1000.00", currency: "EUR" },
          exchangeRate: 36.5,
          fxUsed: "0",
          fxRemaining: "1000.00",
        }),
        makeItem({
          id: "part",
          type: "COLLECTION",
          money: { amount: "1000.00", currency: "EUR" },
          fxUsed: "250.00",
          fxRemaining: "750.00",
        }),
        makeItem({
          id: "done",
          type: "COLLECTION",
          money: { amount: "1000.00", currency: "EUR" },
          fxUsed: "1000.00",
          fxRemaining: "0",
        }),
      ],
    );
    await open("/zto-finans/tahsilatlar");
    const rows = (await dataRows()).slice(1);
    const amount = (row: HTMLElement) => within(row).getAllByRole("cell")[4];
    expect(norm(amount(rows[0]))).toContain("1.500,00 ₺ Kur: 1,0000");
    expect(norm(amount(rows[1]))).toContain("1.000,00 € Kur: 36,5000");
    const fx = (row: HTMLElement) => within(row).getAllByRole("cell")[9];
    expect(fx(rows[0]).textContent).toBe("Döviz Değil");
    expect(fx(rows[0]).querySelector(".progress")).toBeNull();

    expect(classes(within(fx(rows[1])).getByText("Bekliyor"))).toEqual(
      expect.arrayContaining(["badge-warning"]),
    );
    expect(norm(fx(rows[1]))).toContain("%0 • 1.000,00 €");
    const boz = within(fx(rows[1])).getByRole("link", { name: /Boz/ });
    expect(classes(boz)).toEqual(
      expect.arrayContaining(["btn", "btn-xs", "btn-outline-info", "ml-1", "px-1", "py-0"]),
    );
    expect(boz?.getAttribute("title")).toBe("Boz");
    expect(boz.getAttribute("href")).toContain("transferType=exchange");
    const bar = within(fx(rows[1])).getByRole("progressbar", { name: "Döviz bozum oranı" });
    expect(bar?.getAttribute("aria-valuenow")).toBe("0");

    expect(classes(within(fx(rows[2])).getByText("Kısmi Bozum"))).toEqual(
      expect.arrayContaining(["badge-info"]),
    );
    expect(norm(fx(rows[2]))).toContain("%25 • 250,00 / 1.000,00 €");
    expect((within(fx(rows[2])).getByRole("progressbar") as HTMLElement).style.width).toBe("25%");
    expect(within(fx(rows[2])).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");

    expect(classes(within(fx(rows[3])).getByText("Tamamlandı"))).toEqual(
      expect.arrayContaining(["badge-success"]),
    );
    expect(norm(fx(rows[3]))).toContain("%100 • 1.000,00 €");
    expect(within(fx(rows[3])).queryByRole("link", { name: /Boz/ })).toBeNull();
    expect(
      within(fx(rows[3]))
        .getByRole("link", { name: /Transferler/ })
        .getAttribute("target"),
    ).toBe("_blank");

    // Bozumda kullanılmış tahsilatta Düzenle/Sil yok; bozulmamışta ikisi de var.
    const titles = (row: HTMLElement) =>
      within(row)
        .getAllByRole("button")
        .map((b) => b.getAttribute("title"));
    expect(titles(rows[1])).toEqual(["Detay", "Düzenle", "Sil"]);
    expect(titles(rows[2])).toEqual(["Detay"]);
    expect(rows[1].querySelector("div.btn.btn-sm.btn-group")).not.toBeNull();
  });

  it("çekli tahsilatta Düzenle/Sil sunucu bayraklarıyla (12.3); Kaynak yeni sekmede fon hareketleri", async () => {
    api(
      [],
      [
        makeItem({
          id: "c",
          type: "COLLECTION",
          displayMethod: "CHECK",
          instrumentNumber: "1234567",
          reversible: false,
          correctable: false,
          lockReason: "CHECK",
        }),
        bankItem({ id: "b", type: "COLLECTION" }),
      ],
    );
    await open("/zto-finans/tahsilatlar");
    const rows = (await dataRows()).slice(1);
    expect(
      within(rows[0])
        .getAllByRole("button")
        .map((b) => b.getAttribute("title")),
    ).toEqual(["Detay"]);
    expect(classes(within(rows[0]).getByText("Çek: 1234567"))).toEqual(
      expect.arrayContaining(["text-info"]),
    );
    expect(within(rows[0]).getByText("Çek Tahsil")).toBeTruthy();
    const source = within(within(rows[1]).getAllByRole("cell")[7]).getByRole("link");
    expect(source?.getAttribute("title")).toBe("Banka İşlemleri");
    expect(source.getAttribute("href")).toContain("fundId=f1");
  });
});
