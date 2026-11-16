// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseItem } from "../../../../pages/finance/types";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { ExpenseItemFormPage } from "./ExpenseItemFormPage";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE"];

function item(overrides: Partial<ExpenseItem> = {}): ExpenseItem {
  return {
    id: "i1",
    expenseTypeId: "t1",
    expenseTypeName: "Genel",
    code: "MK-00001",
    name: "Kira",
    description: null,
    defaultUnit: null,
    active: true,
    system: false,
    createdAt: "2026-11-01T10:00:00",
    ...overrides,
  };
}

function api(items: ExpenseItem[] = [item(), item({ id: "i2", name: "Kırtasiye" })]) {
  fakeApi.on("GET", "/finance/expense-items", items);
  fakeApi.on("GET", "/finance/expense-types", [
    { id: "t1", code: "GENERAL", name: "Genel" },
    { id: "t2", code: "OPERATION", name: "Operasyon" },
  ]);
}

const routes = {
  "tanimlar/masraf-kalemleri": <span>liste</span>,
  "tanimlar/masraf-kalemleri/yeni": <ExpenseItemFormPage />,
  "tanimlar/masraf-kalemleri/:id/duzenle": <ExpenseItemFormPage />,
};

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("ExpenseItemFormPage", () => {
  it("yeni: öneri, blur'da tekrar hatası, geçerli adla gönderim", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/expense-items", item({ id: "n1", name: "Yakıt" }));
    renderAt("/zto-finans/tanimlar/masraf-kalemleri/yeni", routes);
    expect(await screen.findByRole("heading", { name: /Yeni Masraf Kalemi/ })).toBeTruthy();
    await screen.findByRole("option", { name: "Operasyon" });
    const submit = screen.getByRole("button", { name: /Yeni Masraf Kalemi Oluştur/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const name = screen.getByLabelText(/^Ad:/) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "KI" } });
    expect(await screen.findByRole("option", { name: "Kırtasiye" })).toBeTruthy();
    fireEvent.change(name, { target: { value: "KİRA" } });
    fireEvent.blur(name);
    expect(
      await screen.findByText('"KİRA" masraf adı zaten mevcut! Lütfen farklı bir ad girin.'),
    ).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(name, { target: { value: "Yakıt" } });
    expect(await screen.findByText('"Yakıt" masraf adı kullanılabilir.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Masraf Türü/), { target: { value: "t2" } });
    fireEvent.change(screen.getByLabelText(/Varsayılan Birim/), { target: { value: "Litre" } });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
        expenseTypeId: "t2",
        name: "Yakıt",
        description: null,
        defaultUnit: "Litre",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/zto-finans/tanimlar/masraf-kalemleri"),
    );
  });

  it("öneri seçilince ZTO uyarısı ve düğme kapalı", async () => {
    signIn(MANAGER);
    api();
    renderAt("/zto-finans/tanimlar/masraf-kalemleri/yeni", routes);
    const name = (await screen.findByLabelText(/^Ad:/)) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "kır" } });
    fireEvent.click(await screen.findByRole("option", { name: "Kırtasiye" }));
    expect(
      await screen.findByText(
        /Autocomplete'ten seçtiğiniz isimler veritabanında bulunan kayıtlardır/,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Yeni Masraf Kalemi Oluştur/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("düzenle: mevcut ad iletisi, kod korunur; sunucu 409 ad iletisini verir", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("PUT", "/finance/expense-items/i1", () => {
      throw apiError(409, "EXPENSE_ITEM_NAME_EXISTS", "var");
    });
    renderAt("/zto-finans/tanimlar/masraf-kalemleri/i1/duzenle", routes);
    expect(await screen.findByText("Mevcut masraf adı - değişiklik yapmadınız.")).toBeTruthy();
    expect((screen.getByLabelText(/^Ad:/) as HTMLInputElement).value).toBe("Kira");
    fireEvent.click(screen.getByRole("button", { name: /Masraf Kalemi Güncelle/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toEqual({
        expenseTypeId: "t1",
        code: "MK-00001",
        name: "Kira",
        description: null,
        defaultUnit: null,
      }),
    );
    expect(
      await screen.findByText(
        '"Kira" masraf adı başka bir kayıtta zaten mevcut! Lütfen farklı bir ad girin.',
      ),
    ).toBeTruthy();
  });

  it("sistem kaleminde masraf türü kilitli", async () => {
    signIn(MANAGER);
    api([item({ system: true })]);
    renderAt("/zto-finans/tanimlar/masraf-kalemleri/i1/duzenle", routes);
    await screen.findByText("Mevcut masraf adı - değişiklik yapmadınız.");
    expect((screen.getByLabelText(/Masraf Türü/) as HTMLSelectElement).disabled).toBe(true);
  });
});
