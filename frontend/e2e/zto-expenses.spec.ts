import type { Locator, Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.7 — Genel Masraf (12.7_TASARIM §6.5 FE-2): masraf kalemi (API) → Genel Masraf formunda
 * iki satır + Cari ödeme şekli ile kayıt → kalem faturaları sayfasında satır ve toplam → cari ekstrede
 * "masrafı" hareketi → gerekçeli Sil (ters kayıt) → satır kalkar, ekstrede iptal izi kalır.
 */

type Setup = {
  itemId: string;
  itemName: string;
  supplierId: string;
  supplierName: string;
  branchName: string;
};

async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branchName = unique("E2E MSR ");
  await owner.branch(branchName);
  const supplierName = unique("E2E Masraf Tedarikçi ");
  const supplierId = await owner.account("SUPPLIER", supplierName);
  const types = await owner.request<Array<{ id: string; code: string }>>(
    "GET",
    "/finance/expense-types",
  );
  const type = types.find((candidate) => candidate.code === "GENERAL") ?? types[0];
  const itemName = unique("E2E Kırtasiye ");
  const item = await owner.request<{ id: string }>("POST", "/finance/expense-items", {
    expenseTypeId: type.id,
    name: itemName,
    defaultUnit: "adet",
  });
  return { itemId: item.id, itemName, supplierId, supplierName, branchName };
}

async function pickBranch(page: Page, root: Locator, name: string) {
  await root.locator("#WorkPlaceID ~ .select2-container .select2-selection").click();
  await page.locator(".select2-results__option[role='option']", { hasText: name }).first().click();
}

async function fillLine(root: Locator, index: number, values: Record<string, string>) {
  for (const [field, value] of Object.entries(values)) {
    await root.locator(`#detail-${index}-${field}`).fill(value);
  }
}

test.describe("ZTO Genel Masraf", () => {
  let data: Setup;

  test.beforeAll(async () => {
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, tenantState());
  });

  test("iki satırlı Cari masraf → faturalar → ekstre → gerekçeli sil", async ({ page }) => {
    const invoiceNo = unique("E2E-MSR-");
    await page.goto("/zto-finans/genel-masraflar/yeni");
    const root = page.locator(".zto-finans");
    await expect(root).toHaveClass(/zto-page-expense-form/);
    await expect(
      root.getByText("Yeni Fabrika İçi, Üretim veya Genel Masraf Bilgileri"),
    ).toBeVisible();

    // Masraf Bilgileri
    const typeSelect = root.locator("#expenseTypeId");
    await expect(typeSelect.locator("option")).not.toHaveCount(1);
    // Kalemin türünü seçmek için seçenekler arasında kalem görünene dek türleri dene.
    const typeValues = await typeSelect
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
      );
    for (const value of typeValues) {
      await typeSelect.selectOption(value);
      if ((await root.locator("#expenseItemId option", { hasText: data.itemName }).count()) > 0) {
        break;
      }
    }
    await root.locator("#expenseItemId").selectOption({ label: data.itemName });
    await root.locator("#InvoiceNumber").fill(invoiceNo);
    await expect(root.locator("#paymentMethod")).toHaveValue("ACCOUNT");
    await root.locator("#supplierAccountSearch").fill(data.supplierName);
    await page
      .getByRole("option", { name: new RegExp(data.supplierName) })
      .first()
      .click();

    // Genel Bilgiler
    await root.locator("#Department").selectOption("FLEET");
    await pickBranch(page, root, data.branchName);

    // Masraf Detayları: 2 × 100 (%10 iskonto, KDV %20) + 1 × 50 (KDV %20)
    await fillLine(root, 0, {
      description: "Kağıt",
      quantity: "2",
      unitPrice: "100",
      discountRate: "10",
    });
    await root.getByRole("button", { name: /Yeni Detay Ekle/ }).click();
    await expect(root.locator("#detail-1-description")).toBeFocused();
    await fillLine(root, 1, { description: "Toner", unitPrice: "50" });
    // 180 + 36 = 216; 50 + 10 = 60 → 276,00
    await expect(root.locator("#GrandTotalAmount")).toHaveValue("276,00");

    await root.getByRole("button", { name: /Yeni Masraf Oluştur/ }).click();
    await expect(page).toHaveURL(new RegExp(`/zto-finans/genel-masraflar/kalem/${data.itemId}`));
    await expect(
      root.locator(".snackbar", { hasText: "Masraf başarıyla oluşturuldu." }),
    ).toBeVisible();

    // Kalem faturaları: satır ve toplam
    const row = root.locator("table tbody tr", { hasText: invoiceNo });
    await expect(row).toBeVisible();
    await expect(row).toContainText("276,00");
    await expect(root.getByText(/TOPLAM/).first()).toBeVisible();

    // Cari ekstre: tedarikçi carisinde masraf hareketi
    await page.goto(`/zto-finans/cari-kartlar/${data.supplierId}/hareketler`);
    const statementRow = page.locator(".zto-finans #allTransactionsTable tbody tr", {
      hasText: invoiceNo,
    });
    await expect(statementRow.first()).toContainText("masrafı");

    // Gerekçeli sil (ters kayıt)
    await page.goto(`/zto-finans/genel-masraflar/kalem/${data.itemId}`);
    await root
      .locator("table tbody tr", { hasText: invoiceNo })
      .getByRole("button", { name: /Sil/ })
      .click();
    const confirm = page.getByRole("dialog", { name: /Silme İşlemini Onayla/ });
    await confirm.getByLabel(/İptal Gerekçesi/).fill("E2E yanlış kayıt");
    await confirm.getByRole("button", { name: /Evet, Sil/ }).click();
    await expect(root.locator("table tbody tr", { hasText: invoiceNo })).toHaveCount(0);

    await page.goto(`/zto-finans/cari-kartlar/${data.supplierId}/hareketler`);
    await expect(
      page.locator(".zto-finans #allTransactionsTable tbody tr", { hasText: "İptal" }).first(),
    ).toBeVisible();
  });
});
