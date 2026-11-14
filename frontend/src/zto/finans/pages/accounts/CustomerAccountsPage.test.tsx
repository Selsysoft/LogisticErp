// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { MANAGER, balance, makeAccount, mockCommon, planSummary } from "./accountsTestUtils";
import { CustomerAccountsPage } from "./CustomerAccountsPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = { "cari-kartlar": <CustomerAccountsPage /> };

const SUPPLIER = makeAccount({
  balances: [balance({ debt: 100, payment: 50, balance: -50, tlBalance: -50 })],
  planSummary: planSummary({ nextDueDate: "2020-01-01", overdueCount: 1, draftCount: 1 }),
});
const CUSTOMER = makeAccount({
  id: "a2",
  code: "MUS-000001",
  name: "Beta Gıda",
  type: "CUSTOMER",
  subGroup: "MUSTERI",
  subGroupName: "Müşteri",
  branchId: null,
  balances: [balance({ receivable: 300, collection: 100, balance: 200, tlBalance: 200 })],
});
const PASSIVE = makeAccount({
  id: "a3",
  code: "TED-000009",
  name: "Eski Tedarikçi",
  active: false,
});

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockCommon();
  fakeApi.on("GET", /^\/finance\/accounts\?/, (call: { path: string }) =>
    page(call.path.includes("active=true") ? [SUPPLIER, CUSTOMER] : [SUPPLIER, CUSTOMER, PASSIVE]),
  );
});

afterEach(cleanup);

const headers = () =>
  Array.from(document.querySelectorAll("#customerAccountsTable thead th"), (th) =>
    (th.textContent ?? "").trim(),
  );
const bodyRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>("#customerAccountsTable tbody tr"));
const listCalls = () => fakeApi.log("GET").filter((p) => p.startsWith("/finance/accounts?"));

describe("CustomerAccountsPage (ZTO CustomerAccounts/Index)", { timeout: 30_000 }, () => {
  it("başlık, düğme şeridi ve tablo sütunları birebir", async () => {
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    expect(screen.getByText("Cari Hesaplar Paneli")).toBeTruthy();
    expect(screen.getByText("Cari hesap hareketleri ve ödeme planlamalarını yönetin")).toBeTruthy();
    expect(headers()).toEqual([
      "PLAN TARİHİ",
      "HESAP KODU",
      "CARİ HESAP & İŞ YERİ/ŞUBE",
      "HESAP GRUBU",
      "TOPLAM BORÇ / TOPLAM ÖDENEN",
      "TOPLAM ALACAK / TOPLAM TAHSİLAT",
      "BAKİYE / PLANLANAN",
      "DURUM",
      "İŞLEMLER",
    ]);
    for (const text of [
      "Tüm Cari Hareketleri",
      "Tüm Planlamalar",
      "Ödeme Onay Yönetimi",
      "Ödeme & Tahsilat",
      "Finansal İşlemler",
      "Kredi & Yatırım",
      "Yeni Cari Kart",
    ]) {
      expect(screen.getByText(text, { selector: ".erp-btn span" })).toBeTruthy();
    }
    expect(screen.queryByText("Personel Yönetimi", { selector: ".erp-btn span" })).toBeNull();
    expect(
      screen
        .getByText("Tüm Planlamalar", { selector: ".erp-btn span" })
        .closest("button")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      document.querySelector("#customerAccountsTable_wrapper .dt-toggle-col #btnRedBalanceOnly"),
    ).not.toBeNull();
    expect(document.querySelectorAll("#totalsModeToggle .tmt-btn")).toHaveLength(2);
    expect(document.querySelector(".dt-buttons")).toBeNull();
    expect(document.querySelector("#customerAccountsTable_info")?.textContent).toBe(
      "2 kayıttan 1 - 2 arası gösteriliyor",
    );
    expect(document.querySelector("#customerAccountsTable_length")?.textContent).toContain(
      "Sayfada",
    );
    const first = listCalls()[0];
    expect(first).toContain("active=true");
    expect(first).toContain("includePlanSummary=true");
    expect(first).toContain("balanceGroupBy=CURRENCY");
  });

  it("satır: gecikmiş sınıfı, −balance gösterimi, iş yeri ve grup rozeti", async () => {
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Beta Gıda");
    const [supplierRow, customerRow] = bodyRows();
    expect(supplierRow.className).toContain("overdue-row");
    expect(customerRow.className).toContain("no-plan-row");
    expect(supplierRow.textContent).toContain("01.01.2020");
    expect(supplierRow.textContent).toContain("Merkez · İzmir");
    expect(customerRow.textContent).toContain("Tanımsız İş Yeri");
    const supplierBalance = supplierRow.querySelector(".ca-b");
    expect(supplierBalance?.className).toContain("text-danger");
    expect(supplierBalance?.textContent).toContain("50,00");
    expect(supplierBalance?.textContent).toContain("Borç");
    const customerBalance = customerRow.querySelector(".ca-b");
    expect(customerBalance?.className).toContain("text-success");
    expect(customerBalance?.textContent).toContain("Alacak");
    expect(supplierRow.querySelector(".account-group-badge")?.textContent?.trim()).toBe(
      "Tedarikçi",
    );
    expect(supplierRow.textContent).toContain("Gecikmiş Ödeme");
    expect(supplierRow.textContent).toContain("Planlama Yapıldı");
    const link = within(supplierRow).getByRole("link", { name: /Ankara Lastik/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("href")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
  });

  it("Alacaklı Cariler, Müşteriler ve Planlama Durumu istemci süzgeçleri", async () => {
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Beta Gıda");
    const red = screen.getByRole("switch", { name: "Alacaklı Cariler" });
    fireEvent.click(red);
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(red.getAttribute("aria-checked")).toBe("true");
    expect(bodyRows()[0].textContent).toContain("Ankara Lastik");
    fireEvent.click(red);
    fireEvent.click(screen.getByRole("switch", { name: "Müşteriler" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0].textContent).toContain("Ankara Lastik");
    fireEvent.click(screen.getByRole("switch", { name: "Müşteriler" }));
    fireEvent.change(screen.getByLabelText("Planlama Durumu"), { target: { value: "noplan" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(bodyRows()[0].textContent).toContain("Beta Gıda");
  });

  it("Pasifleri göster → active parametresi yok; pasif satırda Aktifleştir", async () => {
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    fireEvent.click(screen.getByLabelText("Pasifleri göster"));
    await screen.findByText("Eski Tedarikçi");
    expect(listCalls().at(-1)).not.toContain("active=");
    const row = bodyRows().find((tr) => tr.textContent?.includes("Eski Tedarikçi"));
    expect(row?.className).toContain("definition-row--inactive");
    fakeApi.on("PATCH", "/finance/accounts/a3/active", makeAccount({ id: "a3" }));
    fireEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Eski Tedarikçi işlemleri" }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /Aktifleştir/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: true }),
    );
  });

  it("Sil → ZTO onay metni → PATCH active=false → bildirim", async () => {
    fakeApi.on("PATCH", "/finance/accounts/a1/active", makeAccount({ active: false }));
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    const trigger = screen.getByRole("button", { name: "Ankara Lastik işlemleri" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getByRole("menuitem", { name: /Ödeme Planlaması Yap|Planlamayı Düzenle/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      within(menu)
        .getByRole("menuitem", { name: /Ekstre Al/ })
        .getAttribute("href"),
    ).toBe("/zto-finans-yazdir/cari-ekstre/a1");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Sil$/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Cari kartı silmek istediğinizde emin misiniz?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PATCH")).toMatchObject({
        path: "/finance/accounts/a1/active",
        body: { active: false },
      }),
    );
    expect(await screen.findByText("Cari kart pasifleştirildi.")).toBeTruthy();
  });

  it("menü klavyeyle: ↓ açar ve ilk öğeye odaklanır, Escape kapatıp tetikleyiciye döner", async () => {
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    const trigger = screen.getByRole("button", { name: "Ankara Lastik işlemleri" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(items[1], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Düzenleme Geçmişi detay modalında; FINANCE_MANAGE yoksa Yeni Cari Kart ve Sil yok", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on(
      "GET",
      /^\/finance\/accounts\/a1\/history\?/,
      page([
        {
          at: "2026-03-05T10:00:00",
          actorEmail: "ali@acme.com",
          event: "ACCOUNT_UPDATED",
          details: null,
        },
      ]),
    );
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    expect(screen.queryByText("Yeni Cari Kart")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ankara Lastik işlemleri" }));
    expect(screen.queryByRole("menuitem", { name: /^Sil$/ })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: /Düzenleme Geçmişi/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Cari Hesap Detayı");
    expect(await within(dialog).findByText(/Cari kart güncellendi/)).toBeTruthy();
  });

  it("12.2 eksik fatura işareti, Eksik Faturalı süzgeci ve Transfer Merkezi bağlantısı", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/invoice-gaps/, [
      {
        accountId: "a1",
        side: "PAYABLE",
        companyId: null,
        currency: "TRY",
        ledgerTotal: 150,
        invoiceTotal: 100,
        missing: 50,
      },
    ]);
    renderAt("/zto-finans/cari-kartlar", ROUTES);
    await screen.findByText("Ankara Lastik");
    const mark = await screen.findByRole("img", { name: "Eksik fatura: 50,00 ₺" });
    expect(mark.getAttribute("tabindex")).toBe("0");
    expect(mark.querySelector("i.fas.fa-exclamation-circle.text-danger.ml-1")).not.toBeNull();
    expect(bodyRows()).toHaveLength(2);

    const toggle = screen.getByRole("switch", { name: "Eksik Faturalı" });
    fireEvent.click(toggle);
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(bodyRows()[0].textContent).toContain("Ankara Lastik");

    fireEvent.click(screen.getByRole("button", { name: /Finansal İşlemler/ }));
    const link = screen.getByRole("menuitem", { name: /Banka Transferi & Virman & Döviz Bozum/ });
    expect(link.getAttribute("href")).toBe("/zto-finans/transfer-merkezi");
  });
});
