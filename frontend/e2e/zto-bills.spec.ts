import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { assertNoZtoCssLeak, expect, login, openModule, tenantState, test } from "./support";

/**
 * ZTO Finans 12.3 — Senetler (12.3_TASARIM §6.5 FE-2): verilen Bono senedi (ödeme, API) Senetler
 * listesinde görünür, "Yeni Ödeme Senedi" ödeme modalını Senet yöntemiyle açar, "Protestolu Olarak
 * İşaretle" onayla durum "Protestolu" olur. Alınan senet (tahsilat, API) → "Teminata Ver" →
 * "Portföye Geri Al". Çek Koçanları ve Düzenle ekranları açılır; MUI ekranlarına ZTO CSS'i sızmaz.
 */

function localDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Setup = { issuedNo: string; receivedNo: string; receivedId: string };

/** İş yeri, tedarikçi ve müşteri; verilen Bono (ödeme) ve alınan senet (tahsilat). */
async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch(unique("E2E SEN "));
  const supplier = await owner.account("SUPPLIER", unique("E2E Senet Tedarikçi "));
  const customer = await owner.account("CUSTOMER", unique("E2E Senet Müşteri "));
  const issuedNo = unique("BONO-");
  const receivedNo = unique("SEN-");
  await owner.request("POST", "/finance/payments", {
    method: "CHECK",
    accountId: supplier,
    branchId: branch,
    money: { amount: "750", currency: "TRY" },
    date: localDate(),
    confirmWarnings: true,
    instrument: { kind: "NOTE", number: issuedNo, dueDate: localDate(30), noteType: "BOND" },
  });
  const collection = await owner.request<{ instrument?: { id: string } | null }>(
    "POST",
    "/finance/collections",
    {
      method: "CHECK",
      accountId: customer,
      branchId: branch,
      money: { amount: "1200", currency: "TRY" },
      date: localDate(),
      confirmWarnings: true,
      instrument: {
        kind: "NOTE",
        number: receivedNo,
        dueDate: localDate(45),
        noteType: "PLAIN",
        initialStatus: "PORTFOLIO",
      },
    },
  );
  return { issuedNo, receivedNo, receivedId: collection.instrument?.id ?? "" };
}

async function openBills(page: Page) {
  await page.goto("/zto-finans/senetler");
  await expect(page.getByRole("heading", { name: "Senet Yönetimi" })).toBeVisible();
}

/**
 * Satır menüsünü açıp öğeyi seçer. `ZtoMenuButton` kaydırma/yeniden çizimde kapanır (tıklamadan önceki
 * otomatik kaydırma dahil); açma + seçim kapanırsa yeniden denenir.
 */
async function rowMenu(page: Page, number: string, item: string | RegExp) {
  const row = page.locator("#billsTable tbody tr", { hasText: number });
  await expect(row).toBeVisible();
  const button = row.getByRole("button", { name: /İşlemler menüsü/ });
  await row.scrollIntoViewIfNeeded();
  await expect(async () => {
    if (!(await page.getByRole("menu").isVisible())) await button.click();
    await page.getByRole("menuitem", { name: item }).click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return row;
}

test.describe("ZTO Senetler", () => {
  let data: Setup;

  test.beforeAll(async () => {
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, tenantState());
  });

  test("verilen Bono listede; Yeni Ödeme Senedi; protesto onayı", async ({ page }) => {
    await openBills(page);
    const row = page.locator("#billsTable tbody tr", { hasText: data.issuedNo });
    await expect(row).toContainText("Bono");
    await expect(row).toContainText("Portföyde");

    await page.getByRole("button", { name: /Yeni Ödeme Senedi/ }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await rowMenu(page, data.issuedNo, "Protestolu Olarak İşaretle");
    const modal = page.getByRole("dialog", { name: /Senet Durumu Güncelle/ });
    await modal.getByRole("button", { name: /Güncelle/ }).click();
    const confirm = page.getByRole("dialog", { name: /İşlemi Onaylayın/ });
    await expect(confirm).toContainText("Bu işlem ters kayıt oluşturacaktır!");
    await confirm.getByRole("button", { name: /Onayla ve Devam Et/ }).click();
    await expect(row).toContainText("Protestolu");
  });

  test("alınan senet: Teminata Ver → Portföye Geri Al; detay ve düzenle", async ({ page }) => {
    await openBills(page);
    const row = await rowMenu(page, data.receivedNo, "Teminata Ver");
    await page
      .getByRole("dialog", { name: /Senet Durumu Güncelle/ })
      .getByRole("button", { name: /Güncelle/ })
      .click();
    await expect(row).toContainText("Teminata Verildi");

    await rowMenu(page, data.receivedNo, "Portföye Geri Al");
    await page
      .getByRole("dialog", { name: /Senet Durumu Güncelle/ })
      .getByRole("button", { name: /Güncelle/ })
      .click();
    await expect(row).toContainText("Portföyde");

    await rowMenu(page, data.receivedNo, "Detay Görüntüle");
    await expect(page.getByRole("dialog", { name: /Senet Detayları/ })).toContainText(
      data.receivedNo,
    );
    await page
      .getByRole("dialog", { name: "Senet Detayları" })
      .getByRole("button", { name: "Kapat" })
      .last()
      .click();

    await rowMenu(page, data.receivedNo, "Düzenle");
    await expect(page.getByText(`Senet Düzenle - ${data.receivedNo}`)).toBeVisible();
    await page.getByLabel("Açıklama", { exact: true }).fill("E2E açıklama");
    await page.getByRole("button", { name: /Değişiklikleri Kaydet/ }).click();
    await expect(page.getByText("Değişiklikler kaydedildi.")).toBeVisible();
  });

  test("Çek Koçanları açılır", async ({ page }) => {
    await page.goto("/zto-finans/cekler/kocanlar");
    await expect(page.getByRole("heading", { name: "Çek Koçanları Yönetimi" })).toBeVisible();
  });

  test("ZTO CSS'i MUI ekranlarına sızmaz", async ({ page }) => {
    await assertNoZtoCssLeak(page, async (p) => {
      await openModule(p, "ZTO Finans", /\/zto-finans\/cari-hareketler$/);
      await openBills(p);
    });
  });
});
