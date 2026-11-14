// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { apiError, fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { AccountFormPage } from "./AccountFormPage";
import { MANAGER, makeAccount, makeBank, mockCommon } from "./accountsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "cari-kartlar": <p>liste</p>,
  "cari-kartlar/yeni": <AccountFormPage mode="add" />,
  "cari-kartlar/:id/duzenle": <AccountFormPage mode="edit" />,
};

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockCommon();
  fakeApi.on("GET", /^\/finance\/accounts\?search=/, page([]));
});

afterEach(cleanup);

const where = () => screen.getByTestId("where");
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function chooseBranch(name: string) {
  const container = byId("WorkPlaceID").parentElement as HTMLElement;
  fireEvent.mouseDown(container.querySelector(".select2-selection") as Element, { button: 0 });
  fireEvent.mouseUp(screen.getByText(name, { selector: "li" }));
}

describe("AccountFormPage (ZTO CustomerAccounts/Add, Edit)", { timeout: 30_000 }, () => {
  it("Add düzeni: kartlar, tek boş banka satırı, Hesap Kodu yok, Kaydet", async () => {
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    expect(await screen.findByText("Yeni Cari Kart", { selector: "h6" })).toBeTruthy();
    for (const text of [
      "Temel Bilgiler",
      "Vergi ve finans",
      "İletişim ve yetkili",
      "Adres ve konum",
      "Ödeme ve notlar",
      "Banka Hesapları",
      "Bir cari karta birden fazla banka hesabı ekleyebilirsiniz.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(byId("AccountCode")).toBeNull();
    expect(screen.queryByText("Kayıt Bilgileri")).toBeNull();
    expect(document.querySelectorAll(".bank-row")).toHaveLength(1);
    expect(byId<HTMLInputElement>("Country").value).toBe("Türkiye");
    expect(byId<HTMLSelectElement>("CurrencyID").value).toBe("TRY");
    expect(byId<HTMLInputElement>("CreditLimit").value).toBe("0.00");
    expect(byId<HTMLInputElement>("AccountName").placeholder).toBe("Şirket Adı");
    expect(byId<HTMLInputElement>("Email").type).toBe("email");
    expect(byId<HTMLInputElement>("Phone").type).toBe("tel");
    expect(byId<HTMLInputElement>("Website").type).toBe("url");
    expect(byId<HTMLInputElement>("Email").autocomplete).toBe("off");
    expect(screen.getByRole("button", { name: /Kaydet/ })).toBeTruthy();
    expect(screen.getByLabelText(/^Hesap Adı/)).toBe(byId("AccountName"));
    const groupOptions = Array.from(byId<HTMLSelectElement>("AccountGroup").options, (o) => o.text);
    expect(groupOptions).toEqual([
      "Hesap Grubu Seçiniz",
      "Müşteri",
      "Tedarikçi",
      "Yedek Parça / Servis Tedarikçisi",
      "Nakliye Firması",
    ]);
  });

  it("zorunlu alan iletileri; aria-invalid yalnız dokunulduktan/gönderimden sonra", async () => {
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    await screen.findByText("Temel Bilgiler");
    const name = byId<HTMLInputElement>("AccountName");
    expect(name.getAttribute("aria-invalid")).toBe("false");
    expect(name.getAttribute("aria-describedby")).toBeNull();
    expect(byId("AccountName-error").hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
    expect(name.getAttribute("aria-describedby")).toBe("AccountName-error");
    expect(byId("AccountName-error").textContent).toBe("Lütfen bu alanı doldurun.");
    expect(byId("AccountGroup-error").textContent).toBe("Lütfen listeden bir öğe seçin.");
    expect(byId("WorkPlaceID-error").textContent).toBe("Lütfen listeden bir öğe seçin.");
    // İş yeri (select2): hata odaklanan combobox'a bağlı, gizli select'e değil (F5).
    const branchCombo = (byId("WorkPlaceID").parentElement as HTMLElement).querySelector(
      '[role="combobox"]',
    ) as HTMLElement;
    expect(branchCombo.getAttribute("aria-invalid")).toBe("true");
    expect(branchCombo.getAttribute("aria-describedby")).toBe("WorkPlaceID-error");
    expect(byId("WorkPlaceID").hasAttribute("aria-describedby")).toBe(false);
    expect(fakeApi.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("iş yeri combobox'ı gönderimden önce aria-invalid=false, aria-describedby yok", async () => {
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    await screen.findByText("Temel Bilgiler");
    const combo = (byId("WorkPlaceID").parentElement as HTMLElement).querySelector(
      '[role="combobox"]',
    ) as HTMLElement;
    expect(combo.getAttribute("aria-invalid")).toBe("false");
    expect(combo.hasAttribute("aria-describedby")).toBe(false);
  });

  it("Edit: Kredi Limiti değişince PUT /limits (kart limiti) + PUT /profile; profil gövdesinde limit yok", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts/, []);
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/history\?/, page([]));
    fakeApi.on("PUT", "/finance/accounts/a1/limits", () => makeAccount({ creditLimit: 50000 }));
    fakeApi.on("PUT", "/finance/accounts/a1/profile", () => makeAccount());
    renderAt("/zto-finans/cari-kartlar/a1/duzenle", ROUTES);
    expect(await screen.findByText("Cari Kart Düzenle", { selector: "h6" })).toBeTruthy();
    fireEvent.change(byId("CreditLimit"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/cari-kartlar"));
    const puts = fakeApi.calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.path)).toEqual([
      "/finance/accounts/a1/limits",
      "/finance/accounts/a1/profile",
    ]);
    expect(puts[0].body).toEqual({ companyId: null, creditLimit: 50000, riskLimit: 0 });
    expect(puts[1].body).not.toHaveProperty("creditLimit");
    expect(puts[1].body).not.toHaveProperty("riskLimit");
    expect(JSON.parse(where().dataset.state ?? "null")).toEqual({
      flash: "Cari kart başarıyla güncellendi.",
    });
  });

  it("Edit: limit hatası → profil gönderilmez, ileti formun üstünde, sayfada kalınır", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts/, []);
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/history\?/, page([]));
    fakeApi.on("PUT", "/finance/accounts/a1/limits", () => {
      throw apiError(403, "FORBIDDEN", "Yetkiniz yok.");
    });
    renderAt("/zto-finans/cari-kartlar/a1/duzenle", ROUTES);
    expect(await screen.findByText("Cari Kart Düzenle", { selector: "h6" })).toBeTruthy();
    fireEvent.change(byId("RiskLimit"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    expect(await screen.findByText("Yetkiniz yok.")).toBeTruthy();
    expect(fakeApi.calls.some((c) => c.path === "/finance/accounts/a1/profile")).toBe(false);
    expect(where().textContent).toBe("/zto-finans/cari-kartlar/a1/duzenle");
  });

  it("YPS grubunda vergi no yıldızı ve ZTO uyarısı; 1–15 karakter IBAN uyarısı", async () => {
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    await screen.findByText("Temel Bilgiler");
    expect(byId("taxRequiredStar")).toBeNull();
    fireEvent.change(byId("AccountGroup"), { target: { value: "YEDEK_PARCA_SERVIS" } });
    await waitFor(() => expect(byId("taxRequiredStar")).not.toBeNull());
    fireEvent.change(byId("TaxNumber"), { target: { value: "12a3" } });
    expect(byId<HTMLInputElement>("TaxNumber").value).toBe("123");
    fireEvent.change(byId("TaxNumber"), { target: { value: "" } });
    fireEvent.change(byId("bank-0-iban"), { target: { value: "tr12 34" } });
    expect(byId<HTMLInputElement>("bank-0-iban").value).toBe("TR1234");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    expect(
      await screen.findByText(
        "TC/Vergi No alanı boş geçilemez. Lütfen TC/Vergi No bilgisini giriniz.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("IBAN alanları en az 16 karakter olmalıdır.")).toBeTruthy();
  });

  it("banka satırı ekle/sil odak yönetimi", async () => {
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    await screen.findByText("Temel Bilgiler");
    fireEvent.click(screen.getByRole("button", { name: /Banka Ekle/ }));
    await waitFor(() => expect(document.activeElement).toBe(byId("bank-1-bankName")));
    expect(document.querySelectorAll(".bank-row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "2. banka hesabını kaldır" }));
    expect(document.querySelectorAll(".bank-row")).toHaveLength(1);
    expect(document.activeElement).toBe(byId("addBankRowBtn"));
  });

  it("Kaydet → POST gövdesi (boş banka satırı yok) → listeye bildirimle döner", async () => {
    fakeApi.on("POST", "/finance/accounts", (call: { body: unknown }) =>
      makeAccount({ code: "TED-000007", ...(call.body as object) }),
    );
    renderAt("/zto-finans/cari-kartlar/yeni", ROUTES);
    await screen.findByText("Temel Bilgiler");
    fireEvent.change(byId("AccountGroup"), { target: { value: "GENEL" } });
    await waitFor(() => expect(document.querySelector("#WorkPlaceID")).not.toBeNull());
    await screen.findByText("Merkez", { selector: "option" });
    chooseBranch("Merkez");
    fireEvent.change(byId("AccountName"), { target: { value: "Yeni Tedarikçi" } });
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/cari-kartlar"));
    const post = fakeApi.calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      name: "Yeni Tedarikçi",
      type: "SUPPLIER",
      subGroup: "GENEL",
      branchId: "b1",
      defaultCurrency: "TRY",
      bankAccounts: [],
    });
    expect(JSON.parse(where().dataset.state ?? "null")).toEqual({
      flash: "Cari kart başarıyla oluşturuldu. (Hesap Kodu: TED-000007)",
    });
  });

  it("Edit düzeni: Hesap Kodu, Kayıt Bilgileri, grup değişim kutusu; 409 kod iletisi alan altında", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount({ updateCount: 1 }));
    // Liste maskeli döner (OK-13); açık IBAN düzenleme formunda detay ucundan gelir.
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts/, [makeBank()]);
    fakeApi.on(
      "GET",
      "/finance/bank-accounts/bk1",
      makeBank({ iban: "TR330006100519786457841326" }),
    );
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
    fakeApi.on("PUT", "/finance/accounts/a1/profile", () => {
      throw apiError(409, "ACCOUNT_CODE_TAKEN", "conflict");
    });
    renderAt("/zto-finans/cari-kartlar/a1/duzenle", ROUTES);
    expect(await screen.findByText("Cari Kart Düzenle", { selector: "h6" })).toBeTruthy();
    expect(byId<HTMLInputElement>("AccountCode").value).toBe("TED-000001");
    expect(screen.getByText("Kayıt Bilgileri")).toBeTruthy();
    expect(
      screen.getByText("Mevcut bankaları güncelleyebilir, silebilir veya yeni ekleyebilirsiniz."),
    ).toBeTruthy();
    expect(byId<HTMLInputElement>("bank-0-iban").value).toBe("TR330006100519786457841326");
    await waitFor(() =>
      expect(byId<HTMLTextAreaElement>("recChangeLog").value).toContain(
        "ali@acme.com: Cari kart güncellendi",
      ),
    );
    expect(byId("refMigrateInfo")).toBeNull();
    fireEvent.change(byId("AccountGroup"), { target: { value: "YEDEK_PARCA_SERVIS" } });
    const info = await screen.findByText("Hesap grubu değişti:");
    expect(info.closest("#refMigrateInfo")?.textContent).toContain(
      "'Tedarikçi' → 'Yedek Parça / Servis Tedarikçisi'",
    );
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    expect(
      await screen.findByText("Bu hesap kodu başka bir kayıt tarafından kullanılıyor."),
    ).toBeTruthy();
    // Limitler değişmedi: PUT /limits çağrılmaz.
    expect(fakeApi.calls.some((c) => c.path.endsWith("/limits"))).toBe(false);
    const put = fakeApi.calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({
      code: "TED-000001",
      subGroup: "YEDEK_PARCA_SERVIS",
      deactivatedBankAccountIds: [],
    });
    expect(
      (put?.body as { bankAccounts: { id: string; iban: string }[] }).bankAccounts[0],
    ).toMatchObject({ id: "bk1", iban: "TR330006100519786457841326" });
    expect(within(document.body).queryByText("liste")).toBeNull();
  });
});
