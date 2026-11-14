// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { useCompanyStore } from "../../../../auth/companyStore";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { BanksPage } from "./BanksPage";
import { MANAGER, makeFund, mockFundCommon, summaryRow } from "./fundsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = { bankalar: <BanksPage /> };

const FUNDS = [
  makeFund(),
  makeFund({
    id: "f2",
    code: "GAR-1",
    name: "Garanti Dolar",
    bankName: "Türkiye Garanti Bankası A.Ş.",
    currency: "USD",
    branchId: "b2",
    currentBalance: 500,
    bankBranchName: null,
    iban: null,
    futureCount: 2,
    futureNet: -40,
  }),
  makeFund({
    id: "f3",
    code: "KRD-1",
    name: "Kredi Hesabı",
    accountType: "CREDIT",
    currentBalance: -2000,
  }),
  makeFund({ id: "f4", code: "PSF-1", name: "Eski Hesap", active: false, currentBalance: 0 }),
];

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockFundCommon();
  fakeApi.on("GET", /^\/finance\/funds\?/, FUNDS);
  fakeApi.on("GET", /^\/finance\/funds\/summary/, [
    summaryRow(),
    summaryRow({ currency: "USD", currentBalance: 500 }),
    summaryRow({ accountType: "CREDIT", currentBalance: -2000 }),
  ]);
});

afterEach(cleanup);

const NAMES: Record<string, string> = {
  f1: "Ziraat Vadesiz",
  f2: "Garanti Dolar",
  f3: "Kredi Hesabı",
  f4: "Eski Hesap",
  f5: "Beta Halk",
};
const cardNames = () =>
  Array.from(
    document.querySelectorAll(".account-card"),
    (el) => NAMES[el.getAttribute("data-definition-id") ?? ""],
  );

describe("BanksPage (ZTO BankIntroduction/Index)", { timeout: 30_000 }, () => {
  it("başlık, özet kartları, onay rozeti, gruplar ve kartlar", async () => {
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Garanti Dolar");
    expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-banks");
    expect(screen.getByRole("heading", { level: 5 }).textContent).toBe("Banka Hesapları");
    const stats = Array.from(document.querySelectorAll(".erp-stat-label"), (el) => el.textContent);
    expect(stats).toEqual([
      "Vadesİz Hesaplar",
      "Kredİ Hesapları",
      "Vadelİ Mevduatlar",
      "Yatırımlar",
    ]);
    expect(document.querySelector(".card-total .erp-stat-subtext")?.textContent).toBe("2 hesap");
    expect(document.querySelector(".card-average .amount")?.className).toContain("text-danger");
    await waitFor(() =>
      expect(document.querySelector("#paymentApprovalBtn .badge")?.getAttribute("title")).toBe(
        "Onay Bekliyor",
      ),
    );
    expect(
      Array.from(
        document.querySelectorAll(".account-group-title > span:first-of-type"),
        (el) => el.textContent,
      ),
    ).toEqual(["Vadesiz Hesaplar", "Kredi Hesapları"]);
    const card = document.querySelector('.account-card[data-definition-id="f1"]') as HTMLElement;
    expect(card.className).toBe("account-card type-vadesiz");
    expect(card.querySelector(".balance-value")?.className).toContain("text-success");
    expect(card.querySelector(".account-info-clickable")?.getAttribute("href")).toBe(
      "/zto-finans/banka-hareketleri?fundId=f1",
    );
    expect(card.querySelector(".account-info-clickable")?.getAttribute("rel")).toContain(
      "noopener",
    );
    expect(within(card).getByText("Ödeme").closest("a")?.getAttribute("href")).toBe(
      "/finance/settlements?new=PAYMENT&method=BANK&fundAccountId=f1",
    );
    expect(
      document.querySelector('.account-card[data-definition-id="f3"] .balance-label')?.textContent,
    ).toBe("Borç Bakiyesi");
    expect(
      (document.querySelector('.account-card[data-definition-id="f4"]') as HTMLElement).style
        .opacity,
    ).toBe("0.6");
    expect(screen.getByText("2 ileri tarihli hareket", { exact: false })).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".account-spark svg path")).toBeTruthy());
  });

  it("arama: canlı, çok kelime, vurgu, sonuç ve 'bulunamadı'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderAt("/zto-finans/bankalar", ROUTES);
      await screen.findByText("Garanti Dolar");
      const input = screen.getByLabelText("Banka hesaplarında ara");
      expect(input.getAttribute("type")).toBe("search");
      fireEvent.change(input, { target: { value: "garanti" } });
      await act(async () => vi.advanceTimersByTime(350));
      expect(cardNames()).toEqual(["Garanti Dolar"]);
      expect(document.querySelector(".account-card mark")?.textContent).toBe("Garanti");
      expect(screen.getByRole("status", { name: "" }).textContent).toContain(
        "için 1 sonuç bulundu",
      );
      fireEvent.change(input, { target: { value: "garanti yok" } });
      await act(async () => vi.advanceTimersByTime(350));
      expect(screen.getByText("Arama sonucu bulunamadı")).toBeTruthy();
      fireEvent.click(screen.getAllByText("Aramayı Temizle")[0]);
      expect(cardNames()).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("çip süzgeci: para birimi, boş çip, gösterge ve temizle; tür sekmesi", async () => {
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Garanti Dolar");
    const usd = document.querySelector('.stat-item[data-filter-value="$"]') as HTMLElement;
    fireEvent.click(usd);
    expect(usd.getAttribute("aria-pressed")).toBe("true");
    expect(cardNames()).toEqual(["Garanti Dolar"]);
    expect(document.querySelector('.stat-item[data-filter-value="Merkez"]')?.className).toContain(
      "stat-item-empty",
    );
    expect(document.querySelector("#dynamicFilterResultsIndicator strong")?.textContent).toBe("1");
    expect(document.querySelector("#dynamicFilterResultsIndicator")?.textContent).toContain(
      "/ 4 kayıt gösteriliyor",
    );
    fireEvent.keyDown(screen.getByText("Filtreleri Temizle").closest("[role=button]") as Element, {
      key: "Enter",
    });
    expect(cardNames()).toHaveLength(4);
    expect(document.querySelector(".type-tab.kredi .count")?.textContent).toBe("1");
  });

  it("?type=CREDIT yalnız kredi hesapları; özet kartları değişmez", async () => {
    renderAt("/zto-finans/bankalar?type=CREDIT", ROUTES);
    await screen.findByText("Kredi Hesabı");
    expect(cardNames()).toEqual(["Kredi Hesabı"]);
    expect(document.querySelector(".type-tab.kredi")?.className).toContain("active");
    expect(document.querySelector(".card-total .erp-stat-subtext")?.textContent).toBe("2 hesap");
  });

  it("silme: izinli → Evet, Sil; engelli → ZTO cümlesi + Pasifleştir", async () => {
    fakeApi.on("GET", "/finance/funds/f1/can-delete", { allowed: true, reasons: [] });
    fakeApi.on("DELETE", "/finance/funds/f1", null);
    fakeApi.on("GET", "/finance/funds/f2/can-delete", {
      allowed: false,
      reasons: [
        { kind: "FUND_TRANSACTION", count: 3 },
        { kind: "SETTLEMENT", count: 0 },
        { kind: "FUND_TRANSFER", count: 1 },
      ],
    });
    fakeApi.on("PATCH", "/finance/funds/f2/active", makeFund({ id: "f2", active: false }));
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Garanti Dolar");

    const openMenu = (id: string) => {
      const card = document.querySelector(
        `.account-card[data-definition-id="${id}"]`,
      ) as HTMLElement;
      fireEvent.click(within(card).getByRole("button", { name: /işlemleri$/ }));
      fireEvent.click(within(card).getByRole("menuitem", { name: "Sil" }));
    };
    openMenu("f1");
    await screen.findByText("hesabı silinebilir.", { exact: false });
    expect(screen.getByText("Hesap Silme")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Evet, Sil/ }));
    await screen.findByText("Hesap başarıyla silindi.");
    expect(fakeApi.log("DELETE")).toEqual(["/finance/funds/f1"]);

    openMenu("f2");
    await screen.findByText("Bu hesap silinemez!");
    expect(document.getElementById("deleteNotAllowedReason")?.textContent).toBe(
      "Bu hesaba bağlı işlemler var: 3 adet banka işlemi, 1 adet transfer. Silmek için önce bu işlemleri silmeniz gerekiyor.",
    );
    expect(screen.queryByRole("button", { name: /Evet, Sil/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Pasifleştir/ }));
    await screen.findByText("Hesap pasifleştirildi.");
    expect(fakeApi.calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false });
  });

  it("silme hatası sayfa uyarısı; denetim hatası ZTO metni", async () => {
    fakeApi.on("GET", "/finance/funds/f1/can-delete", { allowed: true, reasons: [] });
    fakeApi.on("DELETE", "/finance/funds/f1", () => {
      throw apiError(409, "FUND_HAS_TRANSACTIONS", "Hareket var");
    });
    fakeApi.on("GET", "/finance/funds/f2/can-delete", () => {
      throw apiError(500, "X", "boom");
    });
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Garanti Dolar");
    const menu = (id: string) => {
      const card = document.querySelector(
        `.account-card[data-definition-id="${id}"]`,
      ) as HTMLElement;
      fireEvent.click(within(card).getByRole("button", { name: /işlemleri$/ }));
      fireEvent.click(within(card).getByRole("menuitem", { name: "Sil" }));
    };
    menu("f2");
    await screen.findByText("Kontrol sırasında bir hata oluştu.", undefined, { timeout: 10_000 });
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    await waitFor(() => expect(screen.queryByText("Hesap Silme")).toBeNull());
    menu("f1");
    // Yük altında (kapsam koşusu) silme denetimi ve modal geçişi 1 sn'yi aşabiliyor.
    fireEvent.click(await screen.findByRole("button", { name: /Evet, Sil/ }, { timeout: 10_000 }));
    await screen.findByText("İşlem sırasında bir hata oluştu: Hareket var", undefined, {
      timeout: 10_000,
    });
  });

  it("çok şirket konsolide: Şirketler çipi ve şirket başlıkları; tek şirkette yok", async () => {
    signIn(MANAGER, TWO_COMPANIES);
    fakeApi.on("GET", /^\/finance\/funds\?/, [
      ...FUNDS,
      makeFund({ id: "f5", name: "Beta Halk", companyId: "c2", branchId: "b3" }),
    ]);
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Beta Halk");
    expect(screen.getByText("Şirketler")).toBeTruthy();
    const heads = Array.from(
      document.querySelectorAll(".account-group-title > span:first-of-type"),
      (el) => el.textContent,
    );
    expect(heads[0]).toBe("Acme");
    expect(heads).toContain("Beta");
    cleanup();
    useCompanyStore.setState({ activeCompanyId: "c1" });
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Beta Halk");
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/funds?companyId=c1"))).toBe(true);
    expect(
      Array.from(
        document.querySelectorAll(".account-group-title > span:first-of-type"),
        (el) => el.textContent,
      )[0],
    ).toBe("Vadesiz Hesaplar");
  });

  it("Yenile: is-refreshing → is-refreshed; boş liste ZTO boş durumu", async () => {
    fakeApi.on("GET", /^\/finance\/funds\?/, []);
    renderAt("/zto-finans/bankalar", ROUTES);
    await screen.findByText("Henüz banka hesabı bulunmuyor");
    fireEvent.click(document.getElementById("refreshAccountsBtn") as HTMLElement);
    await waitFor(() =>
      expect(document.getElementById("refreshAccountsBtn")?.className).toContain("is-refreshed"),
    );
  });
});
