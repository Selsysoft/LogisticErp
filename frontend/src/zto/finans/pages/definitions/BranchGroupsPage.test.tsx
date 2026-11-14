// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { BranchGroupFormPage } from "./BranchGroupFormPage";
import { BranchGroupsPage } from "./BranchGroupsPage";
import {
  apiError,
  fakeApi,
  headers,
  makeGroup,
  missingFormClasses,
  page,
  renderAt,
  signIn,
  TWO_COMPANIES,
} from "./definitionTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "tanimlar/subeler": <BranchGroupsPage />,
  "tanimlar/subeler/yeni": <BranchGroupFormPage mode="add" />,
  "tanimlar/subeler/:id": <BranchGroupFormPage mode="edit" />,
};

const MAIN = makeGroup();
const SUB = makeGroup({
  id: "g2",
  name: "Ege",
  groupType: "SUB",
  phone: null,
  email: null,
  createdAt: "2026-05-01T10:00:00",
});

beforeEach(() => {
  fakeApi.reset();
  signIn();
  fakeApi.on("GET", /^\/organization\/branch-groups\?/, page([MAIN, SUB]));
});

afterEach(cleanup);

const where = () => screen.getByTestId("where");
const rows = () =>
  Array.from(
    document.querySelectorAll("#dataTable tbody tr"),
    (tr) => tr.querySelector("strong")?.textContent,
  );

describe("BranchGroupsPage (ZTO BranchProvince/Index)", { timeout: 30_000 }, () => {
  it("başlıklar birebir; yığın hücreler; Kayıt Bilgileri'ne göre azalan; btn-group'lu işlemler", async () => {
    renderAt("/zto-finans/tanimlar/subeler", ROUTES);
    await screen.findByText("İzmir");
    expect(headers()).toEqual([
      "Şube Adı / Şube Tipi / Durum",
      "Telefon Numarası / E-posta",
      "Adres",
      "Vergi Numarası / Vergi Dairesi",
      "Kayıt Bilgileri",
      "İşlemler",
    ]);
    expect(document.querySelector("#dataTable")?.getAttribute("data-definition-density")).toBe(
      "grouped",
    );
    expect(document.querySelector("h5")?.textContent).toContain("Şube Listesi");
    expect(document.querySelector(".definition-list-title__icon i")?.className).toBe("fas fa-city");
    // order [[4,"desc"]]: daha yeni kayıt önce.
    expect(rows()).toEqual(["Ege", "İzmir"]);
    const stack = screen.getByText("İzmir").closest(".definition-cell-stack") as HTMLElement;
    expect(Array.from(stack.children, (c) => `${c.tagName}:${c.textContent}`)).toEqual([
      "STRONG:İzmir",
      "SMALL:Ana Şube",
      "SMALL:Aktif",
    ]);
    const actions = screen
      .getByText("İzmir")
      .closest("tr")!
      .querySelector(".definition-row-actions") as HTMLElement;
    expect(Array.from(actions.children, (c) => c.className)).toEqual([
      "btn-group",
      "btn btn-sm definition-detail-button",
    ]);
  });

  it("SUB ham değeriyle 'Şube' gösterilir ve 'Şube' ile aranır", async () => {
    renderAt("/zto-finans/tanimlar/subeler", ROUTES);
    const ege = await screen.findByText("Ege");
    expect(
      within(ege.closest(".definition-cell-stack") as HTMLElement).getByText("Şube"),
    ).toBeTruthy();
    const search = document.querySelector(".dataTables_filter input") as HTMLInputElement;
    // "Ana Şube" de "Şube" içerir (ZTO'da da); SUB'ın aranan değeri "Yan Şube" değil "Şube"dir.
    fireEvent.change(search, { target: { value: "Şube" } });
    expect(rows()).toEqual(["Ege", "İzmir"]);
    fireEvent.change(search, { target: { value: "Ege Şube" } });
    expect(rows()).toEqual(["Ege"]);
    fireEvent.change(search, { target: { value: "Yan" } });
    expect(rows()).toEqual([undefined]);
    fireEvent.change(search, { target: { value: "ana" } });
    expect(rows()).toEqual(["İzmir"]);
  });

  it("iki şirkette Şirket sütunu; Detay alanları; 'Pasifleri göster'", async () => {
    signIn(undefined, TWO_COMPANIES);
    renderAt("/zto-finans/tanimlar/subeler", ROUTES);
    await screen.findByText("İzmir");
    expect(headers()[1]).toBe("Şirket");
    expect(fakeApi.log("GET")).toContain(
      "/organization/branch-groups?size=200&sort=name&active=true",
    );
    fireEvent.click(screen.getByLabelText("Pasifleri göster"));
    await waitFor(() =>
      expect(fakeApi.log("GET")).toContain("/organization/branch-groups?size=200&sort=name"),
    );
    const row = (await screen.findByText("Ege")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Kayıt detayını görüntüle" }));
    const modal = (await screen.findByText("Kayıt No")).closest(".modal-content") as HTMLElement;
    expect(modal.querySelector("h5.modal-title")?.textContent).toBe("Şube");
    expect(modal.querySelector(".definition-details__record-number strong")?.textContent).toBe(
      "#Ege",
    );
    expect(
      Array.from(modal.querySelectorAll(".definition-details__field-content"), (f) =>
        Array.from(f.children, (c) => c.textContent).join("="),
      ),
    ).toEqual([
      "Adı=Ege",
      "Şube Türü=Şube",
      "Telefon=-",
      "E-posta=-",
      "Durum=Aktif",
      "Şirket=Acme",
    ]);
  });

  it("Sil → 409 BRANCH_GROUP_HAS_ACTIVE_BRANCHES → 'Önce iş yerlerini taşıyın.'", async () => {
    fakeApi.on("POST", "/organization/branch-groups/g1/deactivate", () => {
      throw apiError(409, "BRANCH_GROUP_HAS_ACTIVE_BRANCHES", "x");
    });
    renderAt("/zto-finans/tanimlar/subeler", ROUTES);
    const row = (await screen.findByText("İzmir")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Sil" }));
    const modal = (await screen.findByText("Silmek istediğinize emin misiniz?")).closest(
      ".modal-content",
    ) as HTMLElement;
    expect(within(modal).queryByText(/geri alınamaz/)).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: /Sil/ }));
    const alert = await screen.findByText("Önce iş yerlerini taşıyın.");
    expect(alert.closest(".alert")?.className).toContain("alert-danger");
  });

  it("Sil başarılı → 'Şube pasifleştirildi.'", async () => {
    fakeApi.on("POST", "/organization/branch-groups/g1/deactivate", makeGroup({ active: false }));
    renderAt("/zto-finans/tanimlar/subeler", ROUTES);
    const row = (await screen.findByText("İzmir")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Sil" }));
    const modal = (await screen.findByText("Silmek istediğinize emin misiniz?")).closest(
      ".modal-content",
    ) as HTMLElement;
    fireEvent.click(within(modal).getByRole("button", { name: /Sil/ }));
    expect(await screen.findByText("Şube pasifleştirildi.")).toBeTruthy();
  });
});

describe("BranchGroupFormPage (ZTO BranchProvince/Add, Edit)", { timeout: 30_000 }, () => {
  it("Add: tek satır grid, iki noktalı etiketler, Aktif kutusu, süsleme sınıfları; gövde", async () => {
    fakeApi.on("POST", "/organization/branch-groups", makeGroup({ id: "g9" }));
    renderAt("/zto-finans/tanimlar/subeler/yeni", ROUTES);
    await screen.findByText("Yeni Şube", { selector: "h4" });
    expect(document.querySelector("h4 + hr")).not.toBeNull();
    expect(missingFormClasses()).toEqual([]);
    const labels = Array.from(document.querySelectorAll("form label"), (l) => l.textContent);
    expect(labels).toEqual([
      "Şube Adı: *",
      "Telefon Numarası:",
      "Adres:",
      "E-posta:",
      "Şube Tipi:",
      "Vergi Numarası:",
      "Vergi Dairesi:",
      "Oluşturma Tarihi: *",
      "Aktif",
    ]);
    expect(
      Array.from(document.querySelectorAll("#BranchType option"), (o) => [
        o.getAttribute("value"),
        o.textContent,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["MAIN", "Ana Şube"],
        ["SUB", "Yan Şube"],
      ]),
    );
    const check = document.querySelector("#Status") as HTMLInputElement;
    expect(check.checked).toBe(true);
    expect((check.parentElement as HTMLElement).style.marginTop).toBe("35px");
    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-primary col-md-12");
    expect(button.parentElement?.className).toBe("col-md-12 definition-form-actions");

    fireEvent.click(button);
    expect(screen.getByText("Bu alan zorunludur.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Şube Adı/), { target: { value: "Ege" } });
    fireEvent.change(screen.getByLabelText("Vergi Numarası:"), { target: { value: "12a345" } });
    fireEvent.change(screen.getByLabelText("E-posta:"), { target: { value: "x" } });
    fireEvent.click(button);
    expect(screen.getByText("Geçerli bir e-posta adresi girin.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("E-posta:"), { target: { value: "ege@acme.com" } });
    fireEvent.change(document.querySelector("#BranchType")!, { target: { value: "SUB" } });
    fireEvent.click(check);
    fireEvent.click(button);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/subeler"));
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
      companyId: null,
      name: "Ege",
      groupType: "SUB",
      phone: null,
      email: "ege@acme.com",
      address: null,
      managerName: null,
      taxNumber: "12345",
      taxOffice: null,
      active: false,
    });
    expect(await screen.findByText("Şube kaydedildi.")).toBeTruthy();
  });

  it("Add: iki şirkette Şirket ilk alan ve zorunlu", async () => {
    signIn(undefined, TWO_COMPANIES);
    renderAt("/zto-finans/tanimlar/subeler/yeni", ROUTES);
    await screen.findByText("Yeni Şube", { selector: "h4" });
    expect(document.querySelector("form label")?.textContent).toBe("Şirket: *");
    expect((document.querySelector("#CompanyID") as HTMLSelectElement).value).toBe("c1");
    expect(missingFormClasses()).toEqual([]);
  });

  it("Edit: iki sütun, iki noktasız etiketler, ID yok, btn-info btn-block; PUT companyId her zaman", async () => {
    fakeApi.on("GET", "/organization/branch-groups/g1", MAIN);
    fakeApi.on("PUT", "/organization/branch-groups/g1", MAIN);
    renderAt("/zto-finans/tanimlar/subeler/g1", ROUTES);
    await screen.findByDisplayValue("İzmir");
    expect(document.querySelector("h4.definition-form-title")?.textContent).toBe("Şube Düzenle");
    expect(document.querySelector("hr")).toBeNull();
    expect(missingFormClasses()).toEqual([]);
    expect(Array.from(document.querySelectorAll("form label"), (l) => l.textContent)).toEqual([
      "Şube Adı *",
      "Telefon Numarası",
      "Adres",
      "E-posta",
      "Şube Tipi",
      "Vergi Numarası",
      "Vergi Dairesi",
      "Oluşturma Tarihi",
      "Aktif",
    ]);
    expect(screen.queryByText("ID")).toBeNull();
    const button = document.querySelector("#submitButton") as HTMLButtonElement;
    expect(button.className).toBe("btn btn-info btn-block");
    expect(button.textContent).toBe(" Güncelle");
    expect(button.querySelector("i.fas.fa-edit")).not.toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(where().textContent).toBe("/zto-finans/tanimlar/subeler"));
    expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toMatchObject({
      companyId: "c1",
      name: "İzmir",
      groupType: "MAIN",
      active: true,
    });
    expect(await screen.findByText("Şube güncellendi.")).toBeTruthy();
  });

  it("Edit: pasifleştirme 409 formda", async () => {
    fakeApi.on("GET", "/organization/branch-groups/g1", MAIN);
    fakeApi.on("PUT", "/organization/branch-groups/g1", () => {
      throw apiError(409, "BRANCH_GROUP_HAS_ACTIVE_BRANCHES", "x");
    });
    renderAt("/zto-finans/tanimlar/subeler/g1", ROUTES);
    await screen.findByDisplayValue("İzmir");
    fireEvent.click(screen.getByLabelText("Aktif"));
    fireEvent.click(document.querySelector("#submitButton")!);
    expect(await screen.findByText("Önce iş yerlerini taşıyın.")).toBeTruthy();
  });
});
