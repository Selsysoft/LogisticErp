// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { useCompanyStore } from "../../../../auth/companyStore";
import {
  apiError,
  fakeApi,
  headers,
  makeBranch,
  makeGroup,
  missingFormClasses,
  page,
  renderAt,
  signIn,
  TWO_COMPANIES,
} from "./definitionTestUtils";
import { WorkPlaceFormPage } from "./WorkPlaceFormPage";
import { WorkPlacesPage } from "./WorkPlacesPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "tanimlar/is-yerleri": <WorkPlacesPage />,
  "tanimlar/is-yerleri/yeni": <WorkPlaceFormPage mode="add" />,
  "tanimlar/is-yerleri/:id": <WorkPlaceFormPage mode="edit" />,
  "tanimlar/subeler/yeni": <p>şube formu</p>,
};

const ACTIVE = makeBranch();
const PASSIVE = makeBranch({
  id: "b2",
  code: "IY-0002",
  name: "Depo",
  active: false,
  branchGroupId: null,
  branchGroupName: null,
  latitude: null,
  longitude: null,
  phone: null,
});

beforeEach(() => {
  fakeApi.reset();
  signIn();
  fakeApi.on("GET", /^\/organization\/branches\?/, (call: { path: string }) =>
    page(call.path.includes("active=true") ? [ACTIVE] : [ACTIVE, PASSIVE]),
  );
  fakeApi.on("GET", /^\/organization\/branch-groups\?/, page([makeGroup()]));
});

afterEach(cleanup);

const where = () => screen.getByTestId("where");

describe("WorkPlacesPage (ZTO WorkPlace/Index)", { timeout: 30_000 }, () => {
  it("liste kartı, sütun başlıkları birebir (+ Kayıt Bilgileri), data-label, kök sınıf", async () => {
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    await screen.findByText("Merkez");
    expect(document.querySelector(".zto-finans")?.className).toContain("definition-list-page");
    expect(document.title).toBeDefined();
    expect(headers()).toEqual([
      "Ad",
      "Telefon Numarası",
      "Adres",
      "Lokasyon",
      "Şube",
      "Oluşturma Tarihi",
      "Kayıt Bilgileri",
      "İşlemler",
    ]);
    const table = document.querySelector("#dataTable") as HTMLTableElement;
    expect(table.className).toContain("table table-hover definition-list-table");
    expect(table.getAttribute("data-definition-density")).toBe("standard");
    const ths = table.querySelectorAll("thead th");
    expect(ths[6].className).toContain("definition-list-audit-head");
    expect(ths[7].className).toContain("definition-list-actions-head");
    const cells = Array.from(table.querySelectorAll("tbody tr")[0].children) as HTMLElement[];
    expect(cells.map((td) => td.getAttribute("data-label"))).toEqual(headers());
    expect(cells[0].className).toContain("definition-list-primary-cell");
    expect(cells[5].className).toContain("definition-list-date-cell");
    expect(cells[5].textContent).toBe("04.03.2026");
    expect(cells[6].className).toContain("intro-audit-host definition-list-audit-cell");
    expect(cells[7].className).toContain("definition-list-actions-cell");
    const map = cells[3].querySelector("a") as HTMLAnchorElement;
    expect(map.href).toBe("https://www.google.com/maps/search/?api=1&query=38.4,27.14");
    expect(map.target).toBe("_blank");
    expect(map.rel).toBe("noopener noreferrer");
    expect(map.title).toBe("Google Haritalar'da Görüntüle");
    expect(map.querySelector("i.fas.fa-map-marker-alt")).not.toBeNull();
    const search = document.querySelector(".dataTables_filter input") as HTMLInputElement;
    expect(search.placeholder).toBe("Listede ara...");
    expect(document.querySelector(".definition-list-count")?.textContent).toBe("1");
    expect(fakeApi.log("GET")).toContain("/organization/branches?size=200&sort=name&active=true");
  });

  it("tek şirkette Şirket sütunu yok; iki şirkette var ve aktif şirket süzgeci gönderilir", async () => {
    signIn(undefined, TWO_COMPANIES);
    useCompanyStore.setState({ activeCompanyId: "c2" });
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    await screen.findByText("Merkez");
    expect(headers()).toContain("Şirket");
    expect(headers().indexOf("Şirket")).toBe(headers().indexOf("Şube") + 1);
    expect(fakeApi.log("GET")).toContain(
      "/organization/branches?size=200&sort=name&active=true&companyId=c2",
    );
  });

  it("'Pasifleri göster' active parametresini kaldırır; pasif satır soluk ve Aktifleştir'li", async () => {
    fakeApi.on("POST", "/organization/branches/b2/activate", makeBranch({ id: "b2" }));
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    await screen.findByText("Merkez");
    fireEvent.click(screen.getByLabelText("Pasifleri göster"));
    const depo = await screen.findByText("Depo");
    expect(fakeApi.log("GET")).toContain("/organization/branches?size=200&sort=name");
    const row = depo.closest("tr") as HTMLElement;
    expect(row.className).toContain("definition-row--inactive");
    expect(within(row).getByText("Belirtilmemiş")).toBeTruthy();
    expect(within(row).queryByRole("button", { name: "Sil" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Aktifleştir" }));
    expect(await screen.findByText("İş yeri aktifleştirildi.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual(["/organization/branches/b2/activate"]);
  });

  it("Sil → ZTO onay metni (geri alınamaz notu yok) → pasifleştir → bildirim", async () => {
    fakeApi.on("POST", "/organization/branches/b1/deactivate", makeBranch({ active: false }));
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    const merkez = await screen.findByText("Merkez");
    fireEvent.click(within(merkez.closest("tr")!).getByRole("button", { name: "Sil" }));
    const modal = await screen.findByText("Silmek istediğinize emin misiniz?");
    expect(screen.queryByText(/geri alınamaz/)).toBeNull();
    fireEvent.click(
      within(modal.closest(".modal-content") as HTMLElement).getByRole("button", { name: /Sil/ }),
    );
    expect(await screen.findByText("İş yeri pasifleştirildi.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual(["/organization/branches/b1/deactivate"]);
  });

  it("Sil vazgeçilirse istek gitmez; sunucu hatası danger bildirimi olur", async () => {
    fakeApi.on("POST", "/organization/branches/b1/deactivate", () => {
      throw apiError(409, "CONFLICT", "Çakışma oldu.");
    });
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    const merkez = await screen.findByText("Merkez");
    const del = within(merkez.closest("tr")!).getByRole("button", { name: "Sil" });
    fireEvent.click(del);
    fireEvent.click(await screen.findByRole("button", { name: "İptal" }));
    await waitFor(() => expect(fakeApi.log("POST")).toEqual([]));
    fireEvent.click(del);
    const modal = (await screen.findByText("Silmek istediğinize emin misiniz?")).closest(
      ".modal-content",
    ) as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: /Sil/ }));
    const alert = await screen.findByText("Çakışma oldu.");
    expect(alert.closest(".alert")?.className).toContain("alert-danger");
  });

  it("Detay modalı satırdan; yetkisiz kullanıcıda Yeni Kayıt/Düzenle/Sil yok", async () => {
    signIn(["FINANCE_VIEW", "BRANCH_VIEW"]);
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    const merkez = await screen.findByText("Merkez");
    expect(screen.queryByText("Yeni Kayıt")).toBeNull();
    const row = merkez.closest("tr") as HTMLElement;
    expect(within(row).queryByRole("link", { name: "Düzenle" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Kayıt detayını görüntüle" }));
    const title = await screen.findByText("Kayıt No");
    const modal = title.closest(".modal-content") as HTMLElement;
    expect(modal.querySelector("h5.modal-title")?.textContent).toBe("İş Yeri");
    expect(modal.querySelector(".definition-details__record-number strong")?.textContent).toBe(
      "#IY-0001",
    );
    expect(
      Array.from(
        modal.querySelectorAll(".definition-details__field-content span"),
        (s) => s.textContent,
      ),
    ).toEqual(["Adı", "Telefon", "Adres", "Durum", "Şube", "Konum"]);
    fireEvent.click(within(modal).getByRole("button", { name: "Kapat" }));
  });

  it("kayıt sonrası gelen bildirim (location.state.flash) gösterilir", async () => {
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES, { flash: "İş yeri oluşturuldu." });
    const alert = await screen.findByText("İş yeri oluşturuldu.");
    expect(alert.closest(".alert")?.className).toBe("alert alert-success alert-dismissible");
    fireEvent.click(
      within(alert.closest(".alert") as HTMLElement).getByRole("button", { name: "Kapat" }),
    );
    expect(screen.queryByText("İş yeri oluşturuldu.")).toBeNull();
  });

  it("liste yüklenemezse hata gösterilir", async () => {
    fakeApi.on("GET", /^\/organization\/branches\?/, () => {
      throw apiError(500, "X", "Sunucu hatası");
    });
    renderAt("/zto-finans/tanimlar/is-yerleri", ROUTES);
    expect((await screen.findByText("Sunucu hatası")).className).toBe("alert alert-danger");
    expect(where().textContent).toBe("/zto-finans/tanimlar/is-yerleri");
  });
});

describe("WorkPlaceFormPage (ZTO WorkPlace/Add, Edit)", { timeout: 30_000 }, () => {
  it("Add: düzen, yıldızlar, ZTO süsleme sınıfları birebir; zorunlu alan mesajları", async () => {
    renderAt("/zto-finans/tanimlar/is-yerleri/yeni", ROUTES);
    await screen.findByText("İzmir", { selector: "option" });
    expect(document.querySelector(".zto-finans")?.className).toContain("definition-form-page");
    expect(document.querySelector("h4.definition-form-title")?.textContent).toBe("Yeni İş Yeri");
    expect(document.querySelector("h4 + hr")).not.toBeNull();
    expect(
      Array.from(document.querySelectorAll("ol.breadcrumb li"), (li) => li.textContent),
    ).toEqual(["İş Yeri", "", "Ekleme"]);
    expect(missingFormClasses()).toEqual([]);
    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-primary col-md-12");
    expect(button.textContent).toBe(" Yeni İş Yeri Oluştur");
    expect(
      screen.getByText("Telefon Numarası:", { exact: false }).querySelector("span")?.textContent,
    ).toBe("*");
    expect(screen.getByText("Adres:").querySelector("span")).toBeNull();
    expect((document.querySelector("#CreationDate") as HTMLInputElement).readOnly).toBe(true);
    // Şirket alanı tek şirkette yok.
    expect(document.querySelector("#CompanyID")).toBeNull();

    fireEvent.click(button);
    expect(screen.getAllByText("Bu alan zorunludur.")).toHaveLength(4);
    expect(fakeApi.log("POST")).toEqual([]);
    // Telefon rakam süzgeci, konum biçimi.
    fireEvent.change(screen.getByLabelText(/Telefon Numarası/), {
      target: { value: "0(232) 111" },
    });
    expect((screen.getByLabelText(/Telefon Numarası/) as HTMLInputElement).value).toBe("0232111");
    fireEvent.change(screen.getByLabelText("Konum:"), { target: { value: "41" } });
    fireEvent.click(button);
    expect(screen.getByText('Konum "enlem,boylam" biçiminde olmalıdır.')).toBeTruthy();
    const map = screen.getByText("Haritada Göster") as HTMLAnchorElement;
    expect(map.className).toContain("disabled");
    fireEvent.change(screen.getByLabelText("Konum:"), { target: { value: "41.01,28.97" } });
    expect(map.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=41.01,28.97",
    );
  });

  it("Add: gönderim gövdesi ve listeye bildirimle dönüş", async () => {
    fakeApi.on("POST", "/organization/branches", makeBranch({ id: "yeni" }));
    renderAt("/zto-finans/tanimlar/is-yerleri/yeni", ROUTES);
    await screen.findByText("İzmir", { selector: "option" });
    fireEvent.change(screen.getByLabelText(/^Ad:/), { target: { value: " Merkez " } });
    fireEvent.change(screen.getByLabelText(/Telefon Numarası/), {
      target: { value: "02321112233" },
    });
    fireEvent.change(document.querySelector("#BranchProvinceID")!, { target: { value: "g1" } });
    fireEvent.change(screen.getByLabelText("Adres:"), { target: { value: "Alsancak" } });
    fireEvent.change(screen.getByLabelText("Konum:"), { target: { value: "38.4, 27.14" } });
    fireEvent.click(document.querySelector("#submitButton")!);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/is-yerleri"));
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Merkez",
      phone: "02321112233",
      branchGroupId: "g1",
      address: "Alsancak",
      latitude: 38.4,
      longitude: 27.14,
    });
    expect(await screen.findByText("İş yeri oluşturuldu.")).toBeTruthy();
  });

  it("Add: şube listesi boşsa not + bağlantı; iki şirkette Şirket alanı ve şirket değişince şube temizlenir", async () => {
    signIn(undefined, TWO_COMPANIES);
    fakeApi.on("GET", /branch-groups\?.*companyId=c2/, page([]));
    renderAt("/zto-finans/tanimlar/is-yerleri/yeni", ROUTES);
    await screen.findByText("İzmir", { selector: "option" });
    expect(fakeApi.log("GET")).toContain(
      "/organization/branch-groups?size=200&sort=name&active=true&companyId=c1",
    );
    const group = document.querySelector("#BranchProvinceID") as HTMLSelectElement;
    fireEvent.change(group, { target: { value: "g1" } });
    expect(group.value).toBe("g1");
    fireEvent.change(document.querySelector("#CompanyID")!, { target: { value: "c2" } });
    expect((document.querySelector("#BranchProvinceID") as HTMLSelectElement).value).toBe("");
    const note = await screen.findByText(/Önce Şube tanımlayın\./);
    expect(note.className).toBe("form-text text-muted");
    fireEvent.click(screen.getByRole("link", { name: "Şube ekle" }));
    expect(where().textContent).toBe("/zto-finans/tanimlar/subeler/yeni");
  });

  it("Edit: ZTO Edit düzeni ve sınıfları; gizli şirket alanında da PUT companyId/branchGroupId içerir", async () => {
    fakeApi.on("GET", "/organization/branches/b1", ACTIVE);
    fakeApi.on("PUT", "/organization/branches/b1", ACTIVE);
    renderAt("/zto-finans/tanimlar/is-yerleri/b1", ROUTES);
    await screen.findByDisplayValue("IY-0001");
    await screen.findByText("İzmir", { selector: "option" });
    expect(document.querySelector("h4.definition-form-title")?.textContent).toBe("İş Yeri Düzenle");
    expect(document.querySelector("hr")).toBeNull();
    expect(missingFormClasses()).toEqual([]);
    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-info");
    expect(button.textContent).toBe("Güncelle");
    expect(button.parentElement?.tagName).toBe("FORM");
    expect(screen.getByText("Telefon Numarası").querySelector("span")).toBeNull();
    expect((screen.getByLabelText("Oluşturma Tarihi") as HTMLInputElement).value).toBe(
      "04.03.2026 08:05",
    );
    fireEvent.change(screen.getByLabelText("Ad"), { target: { value: "Merkez 2" } });
    fireEvent.click(button);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/is-yerleri"));
    expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      code: "IY-0001",
      name: "Merkez 2",
      companyId: "c1",
      branchGroupId: "g1",
    });
  });

  it("Edit: 409 BRANCH_COMPANY_LOCKED formda gösterilir", async () => {
    signIn(undefined, TWO_COMPANIES);
    fakeApi.on("GET", "/organization/branches/b1", ACTIVE);
    fakeApi.on("PUT", "/organization/branches/b1", () => {
      throw apiError(
        409,
        "BRANCH_COMPANY_LOCKED",
        "Bu iş yerinde kayıt var; şirketi değiştirilemez.",
      );
    });
    renderAt("/zto-finans/tanimlar/is-yerleri/b1", ROUTES);
    await screen.findByText("İzmir", { selector: "option" });
    fireEvent.click(document.querySelector("#submitButton")!);
    const alert = await screen.findByText("Bu iş yerinde kayıt var; şirketi değiştirilemez.");
    expect(alert.closest(".alert")?.className).toContain("alert-danger");
    expect(where().textContent).toBe("/zto-finans/tanimlar/is-yerleri/b1");
  });

  it("Edit: kayıt yüklenemezse hata", async () => {
    fakeApi.on("GET", "/organization/branches/yok", () => {
      throw apiError(404, "BRANCH_NOT_FOUND", "İş yeri bulunamadı.");
    });
    renderAt("/zto-finans/tanimlar/is-yerleri/yok", ROUTES);
    expect(await screen.findByText("İş yeri bulunamadı.")).toBeTruthy();
  });
});
