// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { BillsPage } from "./BillsPage";
import { POSTER, VIEWER, makeInstrument, pageOf } from "./billsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

// Ödeme modalı FE-3'ün; burada sayfanın verdiği proplar. Fon seçici basit select.
vi.mock("../settlementModals", () => ({
  PaymentModal: (props: { show: boolean; presetMethod?: string; presetAccountId?: string }) =>
    props.show ? (
      <div role="dialog" aria-label="ödeme-modalı">
        {props.presetMethod}|{props.presetAccountId ?? "-"}
      </div>
    ) : null,
  FundSelect: (props: { id: string; value: string; onChange: (v: string) => void }) => (
    <select
      id={props.id}
      aria-label="fon"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">Seçiniz</option>
      <option value="f1">Ziraat</option>
    </select>
  ),
}));
vi.mock("./InstrumentMovementsModal", () => ({
  InstrumentMovementsModal: (props: { show: boolean }) =>
    props.show ? <div role="dialog" aria-label="hareketler" /> : null,
}));

function api(rows: InstrumentListItem[]) {
  fakeApi.on("GET", /^\/finance\/instruments\?/, pageOf(rows));
  fakeApi.on(
    "GET",
    /^\/finance\/accounts\?/,
    pageOf([{ id: "a1", code: "120.01", name: "Kuzey" }]),
  );
  fakeApi.on("GET", /^\/finance\/accounts\/a1/, { id: "a1", phone: "0555 000 00 00" });
}

const norm = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

async function rowOf(number: string) {
  const cell = await screen.findByText(number);
  return cell.closest("tr") as HTMLElement;
}

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
// Ağır sayfa: tam koşu + kapsam yükünde ilk render 5 sn'yi aşabiliyor (ChecksPage deseni).
vi.setConfig({ testTimeout: 20_000 });

describe("BillsPage", () => {
  const portfolio = makeInstrument({
    id: "n1",
    number: "SEN-001",
    allowedTransitions: [
      "AT_BANK",
      "COLLECTED",
      "COLLECTED_TO_CASH",
      "RETURNED",
      "COLLATERAL",
      "PROTESTED",
    ],
  });
  const paid = makeInstrument({
    id: "n2",
    number: "SEN-002",
    status: "PAID",
    noteType: "PLAIN",
    collateral: true,
    dueDate: "2026-01-01",
  });

  it("ZTO kabuğu, özet kartları ve satır hücreleri", async () => {
    signIn(POSTER);
    api([portfolio, paid]);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    expect(await screen.findByRole("heading", { name: "Senet Yönetimi" })).toBeTruthy();
    const row = await rowOf("SEN-001");
    expect(norm(row)).toContain("Bono");
    expect(norm(row)).toContain("Portföyde");
    expect(norm(row)).toContain("Hayır");
    expect(norm(await rowOf("SEN-002"))).toContain("Evet");
    expect(document.getElementById("totalCount")?.textContent).toBe("2");
    expect(document.getElementById("portfolioCount")?.textContent).toBe("1");
    expect(norm(document.getElementById("totalChipCount"))).toBe("2 Senet");
    expect(screen.getByRole("button", { name: /Yeni Ödeme Senedi/ })).toBeTruthy();
  });

  it("süzgeç istemcide uygulanır (Ödendi)", async () => {
    signIn(POSTER);
    api([portfolio, paid]);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    await rowOf("SEN-001");
    fireEvent.change(screen.getByLabelText("Durum"), { target: { value: "PAID" } });
    fireEvent.click(screen.getByRole("button", { name: /Filtrele/ }));
    await waitFor(() => expect(screen.queryByText("SEN-001")).toBeNull());
    expect(screen.getByText("SEN-002")).toBeTruthy();
  });

  it("menü yalnız allowedTransitions'tan kurulur; Sil yok", async () => {
    signIn(POSTER);
    api([portfolio]);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-001");
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    const menu = await screen.findByRole("menu");
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((item) => norm(item));
    expect(items).toEqual([
      "Teminata Ver",
      "Ödendi Olarak İşaretle",
      "Protestolu Olarak İşaretle",
      "İptal Et",
      "Kasaya Tahsil Et",
      "Bankaya Yatır",
      "Detay Görüntüle",
      "Düzenle",
      "Hareket Geçmişi",
    ]);
  });

  it("durum modalı: banka zorunlu iletisi, sonra gönderim", async () => {
    signIn(POSTER);
    api([portfolio]);
    fakeApi.on("POST", "/finance/instruments/n1/transition", portfolio);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-001");
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Ödendi Olarak İşaretle/ }));
    const dialog = await screen.findByRole("dialog", { name: /Senet Durumu Güncelle/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Güncelle/ }));
    expect(await within(dialog).findByText("Lütfen banka hesabı seçiniz!")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("fon"), { target: { value: "f1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Güncelle/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
        toStatus: "COLLECTED",
        fundAccountId: "f1",
      }),
    );
  });

  it("protestoda onay sorulur", async () => {
    signIn(POSTER);
    api([portfolio]);
    fakeApi.on("POST", "/finance/instruments/n1/transition", portfolio);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-001");
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Protestolu Olarak İşaretle/ }));
    const dialog = await screen.findByRole("dialog", { name: /Senet Durumu Güncelle/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Güncelle/ }));
    const confirm = await screen.findByRole("dialog", { name: /İşlemi Onaylayın/ });
    expect(norm(confirm)).toContain("Bu işlem ters kayıt oluşturacaktır!");
    fireEvent.click(within(confirm).getByRole("button", { name: /Onayla ve Devam Et/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
        toStatus: "PROTESTED",
      }),
    );
  });

  it("detay modalı telefonu cari kartından gösterir", async () => {
    signIn(POSTER);
    api([portfolio]);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-001");
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Detay Görüntüle/ }));
    const dialog = await screen.findByRole("dialog", { name: /Senet Detayları/ });
    expect(await within(dialog).findAllByText("0555 000 00 00")).toHaveLength(2);
  });

  it("yetkisiz kullanıcıda yazma düğmeleri ve durum menüsü gizli; derin bağlantı yok sayılır", async () => {
    signIn(VIEWER);
    api([portfolio]);
    renderAt("/zto-finans/senetler?openBillPaymentModal=true", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-001");
    expect(screen.queryByRole("button", { name: /Yeni Ödeme Senedi/ })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "ödeme-modalı" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => norm(item)),
    ).toEqual(["Detay Görüntüle", "Hareket Geçmişi"]);
  });

  it("derin bağlantı ödeme modalını senet yöntemiyle açar", async () => {
    signIn(POSTER);
    api([]);
    renderAt("/zto-finans/senetler?openBillPaymentModal=true&accountId=a1", {
      senetler: <BillsPage />,
    });
    expect(norm(await screen.findByRole("dialog", { name: "ödeme-modalı" }))).toBe("NOTE|a1");
  });

  it("maskeli satırda cari gizli, menü yalnız hareket geçmişi", async () => {
    signIn(POSTER);
    api([
      makeInstrument({
        number: "SEN-009",
        employeeMasked: true,
        accountId: null,
        accountCode: null,
        accountName: null,
        allowedTransitions: [],
      }),
    ]);
    renderAt("/zto-finans/senetler", { senetler: <BillsPage /> });
    const row = await rowOf("SEN-009");
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
    fireEvent.click(within(row).getByRole("button", { name: /İşlemler menüsü/ }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => norm(item)),
    ).toEqual(["Hareket Geçmişi"]);
  });
});
