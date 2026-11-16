import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.7 — Sevk Nakliye Masrafları (12.7_TASARIM §6.5 FE-3): sefer API ile oluşturulup
 * etabı taşerona atanır; STI'de firma satırı görünür, CSD'de "Nakliye Tutarı Düzenle" ile KDV ve
 * tevkifat girilip kaydedilir (cariye hemen işlenir, Y6); detay modalında bakiye ve cari hareket,
 * ekstrede hareket görünür; "Nakliye Giderini Sil" gerekçeyle ters kayıt yapar.
 */

type Setup = { carrierId: string; carrierName: string; shipmentNumber: string };

async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch(unique("E2E TAS "));
  const customer = await owner.account("CUSTOMER", unique("E2E Taşeron Müşteri "));
  const carrierName = unique("E2E Taşeron Nakliyat ");
  const carrierId = await owner.account("CARRIER", carrierName);
  const shipment = await owner.shipment(customer, branch);
  await owner.request("POST", `/shipment/legs/${shipment.legs[0].id}/assign`, {
    carrierAccountId: carrierId,
    carrierCost: { amount: "8000", currency: "TRY" },
  });
  return { carrierId, carrierName, shipmentNumber: shipment.number };
}

function vehicleRow(page: Page, shipmentNumber: string) {
  return page.locator("#dataTable2 tbody tr", { hasText: `${shipmentNumber}/1` });
}

test.describe("ZTO Sevk Nakliye Masrafları", () => {
  let data: Setup;

  test.beforeAll(async () => {
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, tenantState());
  });

  test("STI → CSD: tutar düzenle, cariye işle, detay ve ekstre, ters kayıt", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/zto-finans/sevk-nakliye-masraflari");
    await expect(
      page.getByRole("heading", { name: /Sevk İhracat Nakliye Hesapları/ }),
    ).toBeVisible();
    await page.getByRole("searchbox").fill(data.carrierName);
    const carrierRow = page.locator("#dataTable2 tbody tr", { hasText: data.carrierName });
    await expect(carrierRow).toBeVisible();
    await carrierRow.getByRole("button", { name: /Araçlar ve Detaylar/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sevk-nakliye-masraflari/firma/${data.carrierId}`));

    const row = vehicleRow(page, data.shipmentNumber);
    await expect(row).toContainText("8.000 ₺");
    await row.getByRole("button", { name: "Nakliye Tutarı Düzenle" }).click();
    const modal = page.getByRole("dialog", { name: /Nakliye Firması & Fiyat Düzenle/ });
    await expect(modal.getByLabel("Nakliye Firması")).toBeDisabled();
    await modal.getByLabel("Fatura KDV").fill("1600");
    await modal.getByLabel("Tevkifat").fill("320");
    await modal.getByLabel("Belge No / Fatura No").fill(unique("FTR-"));
    await expect(modal.getByLabel("Bakiye")).toHaveValue("9280.00");
    await modal.getByRole("button", { name: /Kaydet/ }).click();
    await expect(
      page.locator(".snackbar", { hasText: "Satış başarıyla güncellendi" }),
    ).toBeVisible();
    await expect(modal).toBeHidden();

    await row.getByRole("button", { name: "Sevk Nakliye Detayları" }).click();
    const detail = page.getByRole("dialog", { name: /Sevk Nakliye Firması Detayları/ });
    await expect(detail).toContainText("9.280 ₺");
    await expect(detail).toContainText("taşeron nakliye");
    await detail.getByRole("button", { name: "Kapat" }).last().click();

    // Ekstre: cariye hemen işlenen taşeron hareketi (Y6).
    const detailUrl = page.url();
    await page.goto(`/zto-finans/cari-kartlar/${data.carrierId}/hareketler`);
    await expect(
      page.getByText(new RegExp(`${data.shipmentNumber} taşeron nakliye`)).first(),
    ).toBeVisible();
    await page.goto(detailUrl);

    await row.getByRole("button", { name: /Nakliye Giderini Sil/ }).click();
    const confirm = page.getByRole("dialog", { name: /Silme Onayı/ });
    await expect(confirm).toContainText("ters kayıt oluşturulacak");
    await confirm.getByLabel(/Silme Gerekçesi/).fill("E2E yanlış tutar");
    await confirm.getByRole("button", { name: /Sil/ }).click();
    await expect(page.locator(".snackbar", { hasText: "Nakliye gideri silindi" })).toBeVisible();
    await expect(row.getByRole("button", { name: /Nakliye Giderini Sil/ })).toHaveCount(0);
  });
});
