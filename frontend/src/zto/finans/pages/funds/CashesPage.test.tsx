// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { BankDetailPage } from "./BankDetailPage";
import { CashesPage } from "./CashesPage";
import { MANAGER, makeDetail, makeFund, makeRow, mockFundCommon, txPage } from "./fundsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  kasalar: <CashesPage />,
  "bankalar/:id": <BankDetailPage />,
  bankalar: <div>BANKALAR</div>,
};

const cash = (o: Parameters<typeof makeFund>[0]) =>
  makeFund({
    kind: "CASH",
    bankName: null,
    iban: null,
    accountNo: null,
    bankBranchName: null,
    ...o,
  });
const CASHES = [
  cash({ id: "k1", code: "K1", name: "Merkez Kasa", currentBalance: 300, openingBalance: 100 }),
  cash({
    id: "k2",
    code: "K2",
    name: "Depo Kasa",
    branchId: "b2",
    currentBalance: 100,
    openingBalance: 0,
  }),
  cash({
    id: "k3",
    code: "K3",
    name: "Dolar Kasa",
    currency: "USD",
    currentBalance: 50,
    futureCount: 1,
    futureNet: 5,
  }),
];

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockFundCommon();
  fakeApi.on("GET", /^\/finance\/funds\?/, CASHES);
});

afterEach(cleanup);

describe("CashesPage (ZTO CashIntroduction/Index)", { timeout: 30_000 }, () => {
  it("başlık, dört kart, iş yeri gruplaması (varsayılan), kart ve çipler", async () => {
    renderAt("/zto-finans/kasalar", ROUTES);
    await screen.findByText("Depo Kasa");
    expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-cashes");
    expect(Array.from(document.querySelectorAll(".erp-stat-label"), (e) => e.textContent)).toEqual([
      "Toplam Bakiye",
      "Ortalama Bakiye",
      "Başlangıç Bakiyesi",
      "Şubeler",
    ]);
    expect(document.querySelector(".card-methods .erp-stat-value")?.textContent).toBe("1");
    expect(document.querySelector(".card-methods .erp-stat-subtext")?.textContent).toBe(
      "2 para birimi",
    );
    expect(
      Array.from(
        document.querySelectorAll(".cash-group-title > span:first-of-type"),
        (e) => e.textContent,
      ),
    ).toEqual(["Depo", "Merkez"]);
    expect(document.querySelector(".type-tab.workplace")?.className).toContain("active");
    expect(screen.getByText("Tüm Kasalar", { selector: ".stat-item-label" })).toBeTruthy();
    expect(screen.getByText("Merkez Kasa (K1)", { selector: ".stat-item-label" })).toBeTruthy();
    expect(screen.queryByText("Şirketler")).toBeNull();
    expect(document.activeElement?.id).toBe("cashSearchInput");
    const card = document.querySelector('.cash-card[data-definition-id="k1"]') as HTMLElement;
    expect(card.getAttribute("data-cash-name")).toBe("Merkez Kasa|K1");
    expect(within(card).getByText("Tahsilat").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/kasa-hareketleri?fundId=k1&openCollection=true&collectionMethod=Nakit",
    );
    fireEvent.click(within(card).getByRole("button", { name: /işlemleri$/ }));
    expect(
      within(card)
        .getByRole("menuitem", { name: /Bankadan Bu Kasaya Transfer/ })
        .getAttribute("href"),
    ).toBe(
      "/zto-finans/transfer-merkezi?tab=new&transferType=bankcash&targetFundId=k1&targetBranchId=b1",
    );
  });

  it("?group=currency ve all; çip süzgeci", async () => {
    renderAt("/zto-finans/kasalar?group=currency", ROUTES);
    await screen.findByText("Depo Kasa");
    expect(
      Array.from(
        document.querySelectorAll(".cash-group-title > span:first-of-type"),
        (e) => e.textContent,
      ),
    ).toEqual(["$", "₺"]);
    fireEvent.click(
      document.querySelector('.stat-item[data-filter-value="Dolar Kasa|K3"]') as Element,
    );
    expect(document.querySelectorAll(".cash-card")).toHaveLength(1);
  });

  it("CI-1 detay modalı: bakiye, genel bilgiler, son 10 hareket, Kapat'a odak", async () => {
    fakeApi.on(
      "GET",
      "/finance/funds/k1",
      makeDetail({ id: "k1", kind: "CASH", name: "Merkez Kasa", code: "K1" }),
    );
    fakeApi.on(
      "GET",
      /^\/finance\/funds\/transactions\?/,
      txPage([makeRow({ kind: "CASH", direction: "IN", accountingType: "BANK_TO_CASH" })]),
    );
    renderAt("/zto-finans/kasalar", ROUTES);
    await screen.findByText("Merkez Kasa");
    const card = document.querySelector('.cash-card[data-definition-id="k1"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /Detay/ }));
    expect(await screen.findByText("Kasa Detayları")).toBeTruthy();
    await screen.findByText("Bankadan Kasaya");
    expect(screen.getByText("Son İşlemler")).toBeTruthy();
    expect(screen.getByText("Denetim bilgisi kullanılamıyor")).toBeTruthy();
    const query =
      fakeApi.log("GET").find((p) => p.startsWith("/finance/funds/transactions?")) ?? "";
    expect(query).toContain("fundId=k1");
    expect(query).toContain("size=10");
    expect(query).not.toContain("from=");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Kapat"));
  });

  it("çok şirkette Şirket sekmesi ve Şirketler çipi", async () => {
    signIn(MANAGER, TWO_COMPANIES);
    renderAt("/zto-finans/kasalar?group=company", ROUTES);
    await screen.findByText("Depo Kasa");
    expect(screen.getByText("Şirketler")).toBeTruthy();
    expect(document.querySelector(".type-tab.company")?.className).toContain("active");
  });
});

describe("BankDetailPage (ZTO BankIntroduction/Details)", { timeout: 30_000 }, () => {
  it("genel bilgiler, son işlemler (from yok, size=20), silinemez kutusu", async () => {
    fakeApi.on("GET", "/finance/funds/f1", makeDetail({ description: "Ana hesap" }));
    fakeApi.on("GET", "/finance/funds/f1/can-delete", {
      allowed: false,
      reasons: [{ kind: "SETTLEMENT", count: 2 }],
    });
    fakeApi.on(
      "GET",
      /^\/finance\/funds\/transactions\?/,
      txPage([makeRow(), makeRow({ id: "t2", direction: "IN", currency: "USD" })]),
    );
    renderAt("/zto-finans/bankalar/f1", ROUTES);
    expect(await screen.findByText("Banka Hesap Detayı")).toBeTruthy();
    expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-bank-detail");
    expect(screen.getByText("Ana hesap")).toBeTruthy();
    expect(screen.getByText("İzmir")).toBeTruthy();
    await screen.findByText("Bu hesap silinemez!");
    expect(screen.getByText(/2 adet ödeme\/tahsilat/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
    await screen.findByText(/\+250,00 \$/);
    expect(screen.getByText(/-250,00 ₺/)).toBeTruthy();
    const query =
      fakeApi.log("GET").find((p) => p.startsWith("/finance/funds/transactions?")) ?? "";
    expect(query).toContain("size=20");
    expect(query).not.toContain("from=");
  });

  it("silinebilir hesap: Sil → modal → liste + flash; kredi hesabı uyarı kutusu", async () => {
    fakeApi.on("GET", "/finance/funds/f1", makeDetail());
    fakeApi.on("GET", "/finance/funds/f1/can-delete", { allowed: true, reasons: [] });
    fakeApi.on("GET", /^\/finance\/funds\/transactions\?/, txPage([]));
    fakeApi.on("DELETE", "/finance/funds/f1", null);
    renderAt("/zto-finans/bankalar/f1", ROUTES);
    const slow = { timeout: 5000 };
    fireEvent.click(await screen.findByRole("button", { name: "Sil" }, slow));
    fireEvent.click(await screen.findByRole("button", { name: /Evet, Sil/ }, slow));
    await screen.findByText("BANKALAR", {}, slow);
    cleanup();
    fakeApi.on("GET", "/finance/funds/f3", makeDetail({ id: "f3", accountType: "CREDIT" }));
    fakeApi.on("GET", "/finance/funds/f3/can-delete", { allowed: true, reasons: [] });
    renderAt("/zto-finans/bankalar/f3", ROUTES);
    expect(await screen.findByText("Kredi Hesabı", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("Kredi Borcu")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Düzenle" })).toBeNull();
  });

  it("bulunamayan hesap", async () => {
    fakeApi.on("GET", "/finance/funds/yok", () => {
      throw apiError(404, "FUND_NOT_FOUND", "Banka hesabı bulunamadı.");
    });
    fakeApi.on("GET", "/finance/funds/yok/can-delete", { allowed: false, reasons: [] });
    fakeApi.on("GET", /^\/finance\/funds\/transactions\?/, txPage([]));
    renderAt("/zto-finans/bankalar/yok", ROUTES);
    expect(await screen.findByText("Banka hesabı bulunamadı.")).toBeTruthy();
  });
});
