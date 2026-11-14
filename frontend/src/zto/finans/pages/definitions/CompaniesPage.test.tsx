// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type {
  CompanyEDocumentSettings,
  DocumentSeries,
} from "../../../../pages/organization/types";
import { CompaniesPage } from "./CompaniesPage";
import { CompanyFormPage } from "./CompanyFormPage";
import {
  apiError,
  fakeApi,
  headers,
  makeCompany,
  missingFormClasses,
  page,
  renderAt,
  signIn,
} from "./definitionTestUtils";

const upload = vi.hoisted(() => ({ calls: [] as Array<{ path: string; form: FormData }> }));

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
  apiUpload: (path: string, form: FormData) => {
    upload.calls.push({ path, form });
    return fakeApi.request("UPLOAD", path, form);
  },
  apiBlobUrl: (path: string) => Promise.resolve(`blob:${path}`),
}));

const ROUTES = {
  "tanimlar/sirketler": <CompaniesPage />,
  "tanimlar/sirketler/yeni": <CompanyFormPage mode="add" />,
  "tanimlar/sirketler/:id": <CompanyFormPage mode="edit" />,
};

const ACME = makeCompany();
const BETA = makeCompany({
  id: "c2",
  code: "BETA",
  title: "Beta Ticaret Ltd.",
  shortName: "Beta",
  defaultCompany: false,
  edocumentEnabled: true,
  edocumentTestMode: false,
  logoFileId: "logo1",
  defaultFundAccountId: "f1",
});

const SETTINGS: CompanyEDocumentSettings = {
  companyId: "c2",
  provider: "MOCK",
  enabled: true,
  testMode: true,
  serviceUrl: "https://efatura-test.uyumsoft.com.tr/Services/Integration",
  username: "beta",
  passwordSet: true,
  defaultProfile: "TICARIFATURA",
  invoiceSeries: "BTA",
  despatchSeries: null,
  despatchEnabled: false,
  inboxEnabled: false,
  inboxLastSync: null,
  senderTaxNumber: "1234567890",
  senderTitle: "Beta Ticaret Ltd.",
};

const SERIES: DocumentSeries[] = [
  {
    id: "s1",
    companyId: "c2",
    docType: "FREIGHT_INVOICE",
    year: null,
    prefix: "BETA-NF",
    nextValue: 150,
    padding: 6,
    sample: "BETA-NF-2026-000150",
  },
  {
    id: "s2",
    companyId: "c2",
    docType: "WAREHOUSE_INVOICE",
    year: 2026,
    prefix: "BETA-DF",
    nextValue: 1,
    padding: 6,
    sample: "BETA-DF-2026-000001",
  },
  {
    id: "s3",
    companyId: "c2",
    docType: "FUND_TRANSFER",
    year: 2027,
    prefix: "BETA-VRM",
    nextValue: 1,
    padding: 6,
    sample: "BETA-VRM-2026-000001",
  },
];

beforeEach(() => {
  fakeApi.reset();
  upload.calls = [];
  signIn();
  fakeApi.on("GET", /^\/organization\/companies\?/, page([ACME, BETA]));
  fakeApi.on("GET", "/organization/companies/c2", BETA);
  fakeApi.on("GET", "/organization/companies/c2/edocument-settings", SETTINGS);
  fakeApi.on("GET", "/organization/companies/c2/document-series", SERIES);
  fakeApi.on("GET", /^\/finance\/funds\?companyId=c2/, [
    { id: "f1", code: "B1", name: "Ziraat TL", kind: "BANK", bankName: "Ziraat" },
    { id: "f2", code: "K1", name: "Kasa", kind: "CASH", bankName: null },
  ]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const where = () => screen.getByTestId("where");

describe("CompaniesPage", { timeout: 30_000 }, () => {
  it("başlıklar; varsayılan rozeti; e-Belge yığını; sıra sunucudan", async () => {
    renderAt("/zto-finans/tanimlar/sirketler", ROUTES);
    await screen.findByText("Acme Lojistik A.Ş.");
    expect(headers()).toEqual([
      "Unvan / Kısa Ad / Durum",
      "VKN-TCKN / Vergi Dairesi",
      "Telefon Numarası / E-posta",
      "Adres",
      "e-Belge",
      "Kayıt Bilgileri",
      "İşlemler",
    ]);
    const titles = Array.from(
      document.querySelectorAll("#dataTable tbody strong"),
      (s) => s.textContent,
    );
    expect(titles).toEqual(["Acme Lojistik A.Ş.", "Beta Ticaret Ltd."]);
    const badge = screen.getByText("Varsayılan");
    expect(badge.className).toBe("badge badge-primary");
    expect(badge.closest("tr")?.textContent).toContain("Acme");
    const beta = screen.getByText("Beta Ticaret Ltd.").closest("tr") as HTMLElement;
    expect(within(beta).getByText("Açık")).toBeTruthy();
    expect(within(beta).getByText("Canlı")).toBeTruthy();
    expect(document.querySelector(".definition-list-title__icon i")?.className).toBe(
      "fas fa-landmark",
    );
    fireEvent.click(within(beta).getByRole("button", { name: "Kayıt detayını görüntüle" }));
    const modal = (await screen.findByText("Kayıt No")).closest(".modal-content") as HTMLElement;
    expect(modal.querySelector(".definition-details")?.className).toContain("dd-accent-indigo");
    expect(modal.querySelector(".definition-details__record-number strong")?.textContent).toBe(
      "#BETA",
    );
    fireEvent.click(within(modal).getByRole("button", { name: "Kapat" }));
    expect(fakeApi.log("GET")).toContain("/organization/companies?size=200&active=true");
    fireEvent.click(screen.getByLabelText("Pasifleri göster"));
    await waitFor(() => expect(fakeApi.log("GET")).toContain("/organization/companies?size=200"));
    await screen.findByText("Beta Ticaret Ltd.");
  });

  it("COMPANY_MANAGE yoksa yalnız Detay; varsa Sil → pasifleştir (409 mesajı gösterilir)", async () => {
    signIn(["FINANCE_VIEW", "BRANCH_VIEW"]);
    renderAt("/zto-finans/tanimlar/sirketler", ROUTES);
    await screen.findByText("Acme Lojistik A.Ş.");
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
    expect(screen.queryByText("Yeni Kayıt")).toBeNull();
    cleanup();

    signIn();
    fakeApi.on("POST", "/organization/companies/c1/deactivate", () => {
      throw apiError(409, "DEFAULT_COMPANY_REQUIRED", "Varsayılan şirket pasifleştirilemez.");
    });
    renderAt("/zto-finans/tanimlar/sirketler", ROUTES);
    const row = (await screen.findByText("Acme Lojistik A.Ş.")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Sil" }));
    const modal = (await screen.findByText("Silmek istediğinize emin misiniz?")).closest(
      ".modal-content",
    ) as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: /Sil/ }));
    expect(await screen.findByText("Varsayılan şirket pasifleştirilemez.")).toBeTruthy();
  });
});

describe("CompanyFormPage", { timeout: 30_000 }, () => {
  it("ekleme: e-Belge ve Seriler devre dışı; Genel sınıfları birebir; doğrulama; gövde", async () => {
    fakeApi.on("POST", "/organization/companies", makeCompany({ id: "c9" }));
    renderAt("/zto-finans/tanimlar/sirketler/yeni", ROUTES);
    await screen.findByText("Yeni Şirket", { selector: "h4" });
    const tabs = Array.from(document.querySelectorAll("ul.nav.nav-tabs a.nav-link"));
    expect(tabs.map((a) => [a.textContent, a.className])).toEqual([
      ["Genel", "nav-link active"],
      ["e-Belge", "nav-link disabled"],
      ["Seriler", "nav-link disabled"],
    ]);
    expect(missingFormClasses()).toEqual([]);
    expect(document.querySelector("#Logo")).toBeNull();
    expect(document.querySelector("#DefaultFund")).toBeNull();
    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-primary col-md-12");
    expect(button.textContent).toBe(" Yeni Şirket Oluştur");

    fireEvent.click(button);
    expect(screen.getAllByText("Bu alan zorunludur.")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText(/^Kod/), { target: { value: "beta-1 x" } });
    expect((screen.getByLabelText(/^Kod/) as HTMLInputElement).value).toBe("BETA-1X");
    fireEvent.change(screen.getByLabelText(/^Unvan/), { target: { value: "Beta Ltd." } });
    fireEvent.change(screen.getByLabelText(/^Kısa Ad/), { target: { value: "Beta" } });
    fireEvent.change(screen.getByLabelText("VKN/TCKN"), { target: { value: "1234567891" } });
    fireEvent.click(button);
    expect(screen.getByText("Vergi numarası geçersiz.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("VKN/TCKN"), { target: { value: "1234567890" } });
    fireEvent.click(button);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/sirketler"));
    const body = fakeApi.calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      code: "BETA-1X",
      title: "Beta Ltd.",
      shortName: "Beta",
      taxIdType: "VKN",
      taxNumber: "1234567890",
      defaultCompany: false,
      active: true,
    });
    expect(body).not.toHaveProperty("defaultFundAccountId");
    expect(await screen.findByText("Şirket oluşturuldu.")).toBeTruthy();
  });

  it("düzenleme Genel: varsayılan banka hesabı (yalnız BANK), logo önizleme/yükleme/kaldırma, PUT", async () => {
    fakeApi.on("PUT", "/organization/companies/c2", BETA);
    fakeApi.on("UPLOAD", "/organization/companies/c2/logo", { ...BETA, logoFileId: "logo2" });
    fakeApi.on("DELETE", "/organization/companies/c2/logo", undefined);
    renderAt("/zto-finans/tanimlar/sirketler/c2", ROUTES);
    await screen.findByDisplayValue("BETA");
    expect(document.querySelector("h4.definition-form-title")?.textContent).toBe("Şirket Düzenle");
    expect(document.querySelector("hr")).toBeNull();
    expect(missingFormClasses()).toEqual([]);
    await screen.findByText("Ziraat TL (Ziraat)", { selector: "option" });
    expect(screen.queryByText("Kasa", { selector: "option" })).toBeNull();
    const img = (await screen.findByAltText("Logo")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:/files/logo1/content");
    const file = screen.getByLabelText("Logo") as HTMLInputElement;
    expect(file.accept).toBe("image/png,image/jpeg");

    // İstemci denetimi: SVG reddedilir, istek gitmez.
    fireEvent.change(file, {
      target: { files: [new File(["<svg/>"], "l.svg", { type: "image/svg+xml" })] },
    });
    expect(screen.getByText("Logo PNG veya JPEG ve en çok 1 MB olmalı.")).toBeTruthy();
    expect(upload.calls).toHaveLength(0);
    fireEvent.change(file, {
      target: { files: [new File(["png"], "l.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Logo güncellendi.")).toBeTruthy();
    expect(upload.calls[0].path).toBe("/organization/companies/c2/logo");
    expect((upload.calls[0].form.get("file") as File).name).toBe("l.png");
    await waitFor(() =>
      expect(screen.getByAltText("Logo").getAttribute("src")).toBe("blob:/files/logo2/content"),
    );
    fireEvent.click(screen.getByRole("button", { name: /Logoyu Kaldır/ }));
    expect(await screen.findByText("Logo kaldırıldı.")).toBeTruthy();
    expect(screen.queryByAltText("Logo")).toBeNull();

    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-info btn-block");
    fireEvent.click(button);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/sirketler"));
    expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      code: "BETA",
      defaultFundAccountId: "f1",
    });
  });

  it("FINANCE_VIEW yoksa banka hesabı alanı gizli ve fon isteği atılmaz", async () => {
    signIn(["BRANCH_VIEW", "COMPANY_MANAGE"]);
    renderAt("/zto-finans/tanimlar/sirketler/c2", ROUTES);
    await screen.findByDisplayValue("BETA");
    expect(document.querySelector("#DefaultFund")).toBeNull();
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/funds"))).toBe(false);
  });

  it("e-Belge sekmesi: uy-* düzeni, şifre notu passwordSet'e göre, kayıt mesajı ve şifre boşaltma", async () => {
    let saved: unknown;
    fakeApi.on(
      "PUT",
      "/organization/companies/c2/edocument-settings",
      (call: { body?: unknown }) => {
        saved = call.body;
        return { ...SETTINGS, passwordSet: true, enabled: false };
      },
    );
    renderAt("/zto-finans/tanimlar/sirketler/c2?sekme=e-belge", ROUTES);
    await screen.findByText("Uyumsoft e-Dönüşüm");
    expect(document.querySelector(".nav-link.active")?.textContent).toBe("e-Belge");
    expect(document.querySelector(".uy-wrap > .uy-head > h1")).not.toBeNull();
    expect(screen.getByText(/şirket bazlı kimlik bilgileri/)).toBeTruthy();
    expect(document.querySelector("#uyFlag")?.className).toBe("uy-flag on");
    expect(document.querySelector("#uyPassNote")?.textContent).toBe(
      "Kayıtlı şifre var — değiştirmek istemiyorsanız boş bırakın.",
    );
    expect((document.querySelector("#uySenderVkn") as HTMLInputElement).disabled).toBe(true);
    expect((document.querySelector("#uySenderVkn") as HTMLInputElement).value).toBe("1234567890");
    expect((document.querySelector("#uyCheckBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.querySelector("#uyTestBtn") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Faz 12.10 ile gelecek.")).toBeTruthy();
    expect(screen.getByText(/Son senkron: -/)).toBeTruthy();
    expect((document.querySelector("#uyMsg") as HTMLElement).style.display).toBe("");

    fireEvent.click(screen.getByLabelText("Uyumsoft işlemleri aktif"));
    fireEvent.change(document.querySelector("#uyPass")!, { target: { value: "gizli" } });
    fireEvent.change(document.querySelector("#uyDespatchSeries")!, { target: { value: "zt-i9" } });
    fireEvent.change(document.querySelector("#uyTestMode")!, { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    const message = await screen.findByText("Uyumsoft ayarları kaydedildi.");
    expect(message.className).toBe("uy-msg ok");
    expect(message.style.display).toBe("block");
    expect(saved).toMatchObject({
      enabled: false,
      password: "gizli",
      despatchSeries: "ZTI",
      testMode: false,
      invoiceSeries: "BTA",
    });
    expect((document.querySelector("#uyPass") as HTMLInputElement).value).toBe("");
    expect(document.querySelector("#uyFlag")?.textContent).toBe("Kapalı");
  });

  it("e-Belge: şifresiz kayıt null gönderir; hata 'Hata: …'; geçersiz adres istemcide", async () => {
    let saved: Record<string, unknown> | undefined;
    fakeApi.on(
      "PUT",
      "/organization/companies/c2/edocument-settings",
      (call: { body?: unknown }) => {
        saved = call.body as Record<string, unknown>;
        throw apiError(400, "VALIDATION_ERROR", "Geçersiz istek");
      },
    );
    fakeApi.on("GET", "/organization/companies/c2/edocument-settings", {
      ...SETTINGS,
      passwordSet: false,
      inboxLastSync: "2026-06-01T09:30:00",
    });
    renderAt("/zto-finans/tanimlar/sirketler/c2?sekme=e-belge", ROUTES);
    await screen.findByText("Şifre henüz girilmemiş.");
    expect(screen.getByText(/Son senkron: 01\.06\.2026 09:30/)).toBeTruthy();
    fireEvent.change(document.querySelector("#uyUrl")!, { target: { value: "ftp://x" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(
      screen.getByText("Hata: Servis adresi http:// ya da https:// ile başlamalıdır."),
    ).toBeTruthy();
    expect(saved).toBeUndefined();
    fireEvent.change(document.querySelector("#uyUrl")!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    const error = await screen.findByText("Hata: Geçersiz istek");
    expect(error.className).toBe("uy-msg err");
    expect(saved).toMatchObject({ password: null, serviceUrl: null });
  });

  it("Seriler sekmesi: tablo; düzenleme modalı geri almayı istemcide engeller; PUT", async () => {
    fakeApi.on("PUT", "/organization/companies/c2/document-series/s1", SERIES[0]);
    renderAt("/zto-finans/tanimlar/sirketler/c2?sekme=seriler", ROUTES);
    await screen.findByText("BETA-NF-2026-000150");
    const heads = Array.from(document.querySelectorAll("#seriesTable thead th"), (th) =>
      th.textContent?.trim(),
    );
    expect(heads).toEqual(["Belge Türü", "Yıl", "Önek", "Sıradaki No", "Örnek", "İşlemler"]);
    expect(screen.getByText("Navlun Faturası")).toBeTruthy();
    // 12.2: transfer serisi kendi etiketiyle (önceden "Depo Faturası"na düşüyordu).
    expect(screen.getByText("Banka/Kasa Transferi")).toBeTruthy();
    expect(screen.getAllByText("Depo Faturası")).toHaveLength(1);
    expect(screen.getByText("Tüm yıllar")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(document.querySelector("#seriesTable_filter")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Seri Düzenle" })[0]);
    const prefix = (await screen.findByLabelText(/Önek/, {
      selector: "input",
    })) as HTMLInputElement;
    expect(prefix.value).toBe("BETA-NF");
    const next = screen.getByLabelText(/Sıradaki No/, { selector: "input" }) as HTMLInputElement;
    expect(next.min).toBe("150");
    expect(screen.getAllByText("Sıradaki numara yalnız ileri alınabilir.").length).toBeGreaterThan(
      0,
    );
    fireEvent.change(next, { target: { value: "149" } });
    fireEvent.change(prefix, { target: { value: "be ta" } });
    expect(prefix.value).toBe("BETA");
    expect(screen.getByText("BETA-2026-000149")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getAllByText("Sıradaki numara yalnız ileri alınabilir.")).toHaveLength(2);
    expect(fakeApi.log("PUT")).toEqual([]);
    fireEvent.change(next, { target: { value: "151" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Seri güncellendi.")).toBeTruthy();
    expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toEqual({
      prefix: "BETA",
      nextValue: 151,
    });
  });

  it("Seriler: sunucu 422 modalda gösterilir; Vazgeç kapatır", async () => {
    fakeApi.on("PUT", "/organization/companies/c2/document-series/s1", () => {
      throw apiError(422, "DOCUMENT_SERIES_BACKWARDS", "Sıradaki numara geri alınamaz.");
    });
    renderAt("/zto-finans/tanimlar/sirketler/c2?sekme=seriler", ROUTES);
    await screen.findByText("BETA-NF-2026-000150");
    fireEvent.click(screen.getAllByRole("button", { name: "Seri Düzenle" })[0]);
    await screen.findByLabelText(/Önek/, { selector: "input" });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Sıradaki numara geri alınamaz.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await act(async () => undefined);
  });

  it("sekmeler arası geçiş ?sekme= ile; kayıt yüklenemezse hata", async () => {
    renderAt("/zto-finans/tanimlar/sirketler/c2", ROUTES);
    await screen.findByDisplayValue("BETA");
    fireEvent.click(screen.getByRole("tab", { name: "Seriler" }));
    expect(where().textContent).toBe("/zto-finans/tanimlar/sirketler/c2?sekme=seriler");
    await screen.findByText("BETA-NF-2026-000150");
    fireEvent.click(screen.getByRole("tab", { name: "Genel" }));
    expect(await screen.findByDisplayValue("BETA")).toBeTruthy();
    cleanup();
    fakeApi.on("GET", "/organization/companies/yok", () => {
      throw apiError(404, "COMPANY_NOT_FOUND", "Şirket bulunamadı.");
    });
    renderAt("/zto-finans/tanimlar/sirketler/yok", ROUTES);
    expect(await screen.findByText("Şirket bulunamadı.")).toBeTruthy();
  });
});
