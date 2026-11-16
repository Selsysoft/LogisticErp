// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { addDaysIso, todayIso } from "../fundTransactions/fundTransactionsLogic";
import {
  SETTLEMENT_MANAGER,
  SETTLEMENT_VIEWER,
  settlementCommonApi,
} from "../settlements/settlementsTestUtils";
import { CheckDetailedReportPage } from "./CheckDetailedReportPage";
import { ChecksPage } from "./ChecksPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

type PaymentProps = {
  show: boolean;
  onHide: () => void;
  presetMethod?: string;
  presetFundAccountId?: string;
  presetBranchId?: string;
  presetCurrency?: string;
  presetEndorseInstrumentId?: string;
};
// Ödeme modalı FE-3'ün; burada sayfanın verdiği proplar (12.3 §5.4).
vi.mock("../settlementModals", () => ({
  PaymentModal: (props: PaymentProps) =>
    props.show ? (
      <div role="dialog" aria-label="ödeme-modalı">
        <span data-testid="payment-props">
          {[
            props.presetMethod ?? "-",
            props.presetFundAccountId ?? "-",
            props.presetBranchId ?? "-",
            props.presetCurrency ?? "-",
            props.presetEndorseInstrumentId ?? "-",
          ].join("|")}
        </span>
      </div>
    ) : null,
}));

const TODAY = todayIso();

function check(overrides: Partial<InstrumentListItem> = {}): InstrumentListItem {
  return {
    id: "i1",
    kind: "CHECK",
    direction: "RECEIVED",
    number: "0000123",
    bankName: "Ziraat",
    bankBranch: "Konak",
    issueDate: TODAY,
    dueDate: addDaysIso(TODAY, 20),
    money: { amount: "1500.00", currency: "TRY" },
    status: "AT_BANK",
    accountId: "a1",
    accountCode: "120.01",
    accountName: "Kuzey Lojistik",
    accountType: "CUSTOMER",
    employeeMasked: false,
    endorsedAccountId: null,
    endorsedAccountName: null,
    drawerName: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    companyName: "Acme",
    fundAccountId: "f1",
    fundName: "Ziraat Vadesiz",
    fundKind: "BANK",
    fundBankName: "Ziraat",
    custodyFundId: null,
    custodyFundName: null,
    checkLeafId: null,
    checkBookId: null,
    checkBookSerial: null,
    leafNo: null,
    description: "Kasım tahsilatı",
    noteType: null,
    collateral: false,
    settledDate: null,
    originSettlementId: "s1",
    originSettlementStatus: "POSTED",
    movementCount: 2,
    lastMovementDate: TODAY,
    allowedTransitions: ["COLLECTED", "BOUNCED", "PORTFOLIO"],
    ...overrides,
  };
}

const pageOf = <T,>(content: T[]) => ({
  content,
  page: 0,
  size: 500,
  totalElements: content.length,
  totalPages: 1,
});

function api(rows: InstrumentListItem[]) {
  settlementCommonApi();
  fakeApi.on("GET", /^\/finance\/accounts\?/, pageOf([]));
  fakeApi.on("GET", /^\/finance\/check-books/, [
    { id: "k1", serialNo: "SR1", fundBankName: "Ziraat", fundName: "Ziraat Vadesiz" },
  ]);
  fakeApi.on("GET", /^\/finance\/instruments\?/, (call: { path: string }) =>
    pageOf(call.path.includes("endorsable=true") ? [] : rows),
  );
  fakeApi.on("GET", /^\/finance\/funds\?/, [
    {
      id: "f1",
      code: "B1",
      name: "Ziraat Vadesiz",
      kind: "BANK",
      currency: "TRY",
      branchId: "b1",
      companyId: "c1",
      bankName: "Ziraat",
      bankBranchName: "Konak",
      iban: "TR00",
      active: true,
    },
    {
      id: "k1",
      code: "K1",
      name: "Merkez Kasa",
      kind: "CASH",
      currency: "TRY",
      branchId: "b1",
      companyId: "c1",
      active: true,
    },
  ]);
}

const listQuery = () =>
  new URLSearchParams(
    fakeApi
      .log("GET")
      .filter((p) => p.startsWith("/finance/instruments?") && !p.includes("endorsable"))
      .at(-1)
      ?.split("?")[1],
  );

async function open(path = "/zto-finans/cekler") {
  renderAt(path, { cekler: <ChecksPage />, "cekler-rapor": <CheckDetailedReportPage /> });
  await waitFor(() => expect(screen.getAllByText("0000123").length).toBeGreaterThan(0));
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /İşlemler 0000123/ }));
  return screen.findByRole("menu");
}

beforeEach(() => {
  fakeApi.reset();
  signIn(SETTLEMENT_MANAGER);
});
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("Çekler sayfası", () => {
  it("ZTO iskeleti ve ilk sorgu: CHECK, vade −7/+30, istemci kipi 500'lük sayfa", async () => {
    api([check()]);
    await open();
    expect(document.querySelector(".zto-finans.zto-page-checks")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Çek Yönetimi" })).toBeTruthy();
    expect(screen.getByText("1 Çek")).toBeTruthy();
    const query = listQuery();
    expect(query.get("kind")).toBe("CHECK");
    expect(query.get("dueFrom")).toBe(addDaysIso(TODAY, -7));
    expect(query.get("dueTo")).toBe(addDaysIso(TODAY, 30));
    expect(query.get("size")).toBe("500");
    expect(screen.getByRole("button", { name: /Yeni Ödeme Çeki/ })).toBeTruthy();
    expect(document.querySelector("#checksTable.chk-phone-card-table")).not.toBeNull();
    expect(screen.getByText("Tahsil Edilecek")).toBeTruthy();
  });

  it("satır menüsü yalnız allowedTransitions'tan; ZTO 'Sil' yok", async () => {
    api([check()]);
    await open();
    const menu = await openMenu();
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((el) => (el.textContent ?? "").trim());
    expect(labels).toEqual(
      expect.arrayContaining(["Bankaya Tahsil Et", "Karşılıksız", "Portföye Geri Al"]),
    );
    expect(labels.some((l) => l.startsWith("Bankaya Yatır"))).toBe(false);
    expect(labels.some((l) => l === "Sil")).toBe(false);
    expect(labels.some((l) => l.startsWith("Hareket Geçmişi"))).toBe(true);
  });

  it("Portföye Geri Al: kasa zorunlu iletisi, onay ve transition gövdesi", async () => {
    api([check()]);
    let body: unknown = null;
    fakeApi.on("POST", "/finance/instruments/i1/transition", (call: { body?: unknown }) => {
      body = call.body;
      return check({ status: "PORTFOLIO" });
    });
    await open();
    const menu = await openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Portföye Geri Al/ }));
    const select = await screen.findByLabelText(/Yeni Durum/);
    expect((select as HTMLSelectElement).value).toBe("PORTFOLIO");
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    expect(
      await screen.findByText("Çek bankada. Portföye almak için kasa seçmelisiniz!"),
    ).toBeTruthy();
    const cash = (await screen.findByLabelText(/^Kasa/)) as HTMLSelectElement;
    expect(cash.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(cash.querySelectorAll("option").length).toBe(2));
    fireEvent.change(cash, { target: { value: "k1" } });
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Onayla ve Devam Et/ }));
    await waitFor(() =>
      expect(body).toEqual({ toStatus: "PORTFOLIO", date: TODAY, custodyFundId: "k1" }),
    );
    expect(await screen.findByText("Çek durumu başarıyla güncellendi.")).toBeTruthy();
  });

  it("sunucu hatası katalog iletisiyle gösterilir", async () => {
    api([check({ allowedTransitions: ["BOUNCED"] })]);
    fakeApi.on("POST", "/finance/instruments/i1/transition", () => {
      throw apiError(409, "SETTLEMENT_CHECK_NOT_REVERSIBLE", "x");
    });
    await open();
    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: /Karşılıksız/ }));
    expect(await screen.findByText(/Banka işlemi varsa iptal edilecektir!/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    expect(await screen.findByText("Bu işlem ters kayıt oluşturacaktır!")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Onayla ve Devam Et/ }));
    expect(
      await screen.findByText("Çek/senet işlem gördü; önce çekin durumunu güncelleyin."),
    ).toBeTruthy();
  });

  it("yetkisiz kullanıcı: yazma düğmeleri ve durum menüsü yok; derin bağlantı yok sayılır", async () => {
    signIn(SETTLEMENT_VIEWER);
    api([check()]);
    await open("/zto-finans/cekler?bankId=f1&openCheckPaymentModal=true");
    expect(screen.queryByRole("button", { name: /Yeni Ödeme Çeki/ })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "ödeme-modalı" })).toBeNull();
    const menu = await openMenu();
    expect(within(menu).queryByText("Durum Değiştir")).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: /Düzenle/ })).toBeNull();
  });

  it("derin bağlantı ödeme modalını çek kipinde açar ve URL'den silinir", async () => {
    api([check()]);
    await open(
      "/zto-finans/cekler?bankId=f1&workPlaceId=b1&currencyId=usd&openCheckPaymentModal=true",
    );
    expect(screen.getByTestId("payment-props").textContent).toBe("CHECK|f1|b1|USD|-");
    await waitFor(() => expect(screen.getByTestId("where").textContent).not.toContain("bankId"));
  });

  it("personel carili satır maskeli; menüde yalnız Hareket Geçmişi", async () => {
    api([check({ employeeMasked: true, accountName: null, description: null })]);
    await open();
    expect(screen.getAllByText("Personel (gizli)").length).toBeGreaterThan(0);
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((el) => (el.textContent ?? "").trim()),
    ).toEqual(["Hareket Geçmişi2"]);
  });

  it("çek no tıklanınca 3B Çek Detayları; Çevir düğmesi yüzü değiştirir", async () => {
    api([check({ direction: "ISSUED", status: "ISSUED", allowedTransitions: ["PAID"] })]);
    await open();
    fireEvent.click(screen.getByTitle("Çek detaylarını görüntüle"));
    const flip = await screen.findByRole("button", { name: /Çevir/ });
    expect(document.querySelector("#c3dBack")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(flip);
    expect(document.querySelector("#c3dCard")?.classList.contains("is-flipped")).toBe(true);
    expect(document.querySelector("#c3dFront")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("#BinBeşYüzTürkLirası#")).toBeTruthy();
  });

  it("Detaylı Rapor modalı: ters aralıkta ileti, geçerlide yeni sekme", async () => {
    api([check()]);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Detaylı Rapor/ }));
    const start = await screen.findByLabelText("Vade Başlangıç Tarihi");
    fireEvent.change(start, { target: { value: "2026-12-31" } });
    fireEvent.change(screen.getByLabelText("Vade Bitiş Tarihi"), {
      target: { value: "2026-12-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Raporu Görüntüle/ }));
    expect(await screen.findByText("Bitiş tarihi başlangıç tarihinden önce olamaz.")).toBeTruthy();
    expect(openSpy).not.toHaveBeenCalled();
    fireEvent.change(start, { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Raporu Görüntüle/ }));
    expect(openSpy).toHaveBeenCalledWith(
      "/zto-finans-yazdir/cek-raporu?from=2026-11-01&to=2026-12-01",
      "_blank",
      "noopener",
    );
    openSpy.mockRestore();
  });
});

describe("Detaylı Çek Raporu", () => {
  it("kendi çekimiz, iş yeri → banka grupları ve genel toplam", async () => {
    api([
      check({ id: "o1", direction: "ISSUED", status: "ISSUED", number: "0000777" }),
      check({ id: "o2", direction: "ISSUED", status: "CANCELLED", number: "0000888" }),
    ]);
    renderAt("/zto-finans/cekler-rapor?from=2026-11-01&to=2027-12-31", {
      "cekler-rapor": <CheckDetailedReportPage />,
    });
    await waitFor(() => expect(screen.getByText("0000777")).toBeTruthy());
    expect(screen.queryByText("0000888")).toBeNull();
    const query = listQuery();
    expect(query.get("direction")).toBe("ISSUED");
    expect(query.get("dueFrom")).toBe("2026-11-01");
    const header = document.querySelector(".workplace-header-btn");
    expect(header?.textContent).toContain("Merkez");
    expect(header?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByText("1.500,00 ₺").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Rapor İçi Arama"), { target: { value: "yok-böyle" } });
    expect(await screen.findByText("0 satır bulundu")).toBeTruthy();
  });
});
