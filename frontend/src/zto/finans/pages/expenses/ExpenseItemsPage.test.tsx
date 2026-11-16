// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseItem } from "../../../../pages/finance/types";
import { fakeApi, headers, renderAt, signIn } from "../definitions/definitionTestUtils";
import { ExpenseItemsPage } from "./ExpenseItemsPage";

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
    expenseTypeName: "Genel Gider",
    code: "MK-00001",
    name: "Kırtasiye",
    description: "Ofis",
    defaultUnit: "Adet",
    active: true,
    system: false,
    createdAt: "2026-11-01T10:05:00",
    ...overrides,
  };
}

const ITEMS = [
  item(),
  item({ id: "i2", name: "Yakıt (sistem)", system: true, createdAt: "2026-11-03T08:00:00" }),
  item({ id: "i3", name: "Eski Kalem", active: false }),
];

beforeEach(() => fakeApi.reset());
afterEach(cleanup);
vi.setConfig({ testTimeout: 20_000 });

describe("ExpenseItemsPage", () => {
  it("aktif kalemler, ZTO sütunları (Anahtar yok), sistem kaleminde Sil yok", async () => {
    signIn(MANAGER);
    fakeApi.on("GET", "/finance/expense-items", ITEMS);
    renderAt("/zto-finans/tanimlar/masraf-kalemleri", {
      "tanimlar/masraf-kalemleri": <ExpenseItemsPage />,
    });
    expect(await screen.findByRole("heading", { name: /Masraf Kalemleri Listesi/ })).toBeTruthy();
    const row = (await screen.findByText("Kırtasiye")).closest("tr") as HTMLElement;
    expect(headers()).toEqual([
      "Masraf Türü",
      "Ad",
      "Açıklama",
      "Varsayılan Birim",
      "Oluşturma Tarihi",
      "İşlemler",
    ]);
    expect(row.textContent).toContain("01.11.2026 10:05");
    expect(screen.queryByText("Eski Kalem")).toBeNull();
    expect(within(row).getByTitle("Sil")).toBeTruthy();
    const system = screen.getByText("Yakıt (sistem)").closest("tr") as HTMLElement;
    expect(within(system).queryByTitle("Sil")).toBeNull();
    // Sıra: oluşturma tarihi azalan.
    const names = Array.from(document.querySelectorAll("#dataTable tbody tr"), (tr) =>
      tr.children[1]?.textContent?.trim(),
    );
    expect(names).toEqual(["Yakıt (sistem)", "Kırtasiye"]);
    expect(screen.getByRole("link", { name: /Yeni Kayıt/ })).toBeTruthy();
    expect(within(row).getByTitle("Masraf Hesapları").getAttribute("href")).toBe(
      "/zto-finans/genel-masraflar/kalem/i1",
    );
  });

  it("Sil onayıyla kalem pasifleştirilir", async () => {
    signIn(MANAGER);
    fakeApi.on("GET", "/finance/expense-items", ITEMS);
    fakeApi.on("PUT", "/finance/expense-items/i1/active", item({ active: false }));
    renderAt("/zto-finans/tanimlar/masraf-kalemleri", {
      "tanimlar/masraf-kalemleri": <ExpenseItemsPage />,
    });
    const row = (await screen.findByText("Kırtasiye")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByTitle("Sil"));
    expect(await screen.findByText("Silmek istediğinize emin misiniz?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Sil$/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toEqual({ active: false }),
    );
    expect(await screen.findByText("Masraf kalemi başarıyla pasifleştirildi.")).toBeTruthy();
  });

  it("yalnız FINANCE_VIEW: yazma düğmeleri yok", async () => {
    signIn(["FINANCE_VIEW"]);
    fakeApi.on("GET", "/finance/expense-items", ITEMS);
    renderAt("/zto-finans/tanimlar/masraf-kalemleri", {
      "tanimlar/masraf-kalemleri": <ExpenseItemsPage />,
    });
    const row = (await screen.findByText("Kırtasiye")).closest("tr") as HTMLElement;
    expect(within(row).queryByTitle("Sil")).toBeNull();
    expect(within(row).queryByTitle("Düzenle")).toBeNull();
    expect(screen.queryByRole("link", { name: /Yeni Kayıt/ })).toBeNull();
  });
});
