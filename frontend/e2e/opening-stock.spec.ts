import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

test("açılış stoğu önizlenir ve içe aktarılır; yeni ürün ve göz açılır", async ({ page }) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch();
  const customerCode = unique("M").slice(0, 20);
  await owner.request("POST", "/finance/accounts", {
    code: customerCode,
    name: "Depo Müşterisi",
    type: "CUSTOMER",
  });
  const warehouseName = `Açılış Deposu ${unique("")}`;
  await owner.request("POST", "/warehouse/warehouses", {
    code: unique("D").slice(0, 30),
    name: warehouseName,
    branchId: branch,
    bonded: false,
  });
  const sku = unique("UN").slice(0, 20);
  const csv = (rows: string[]) => ({
    name: "stok.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["Müşteri kodu;Ürün kodu;Ürün adı;Birim;Göz;Lot;Son kullanma;Miktar", ...rows].join("\n"),
      "utf8",
    ),
  });

  await login(page, tenantState());
  await page.goto("/warehouse");
  await page.getByRole("button", { name: "Açılış stoğu içe aktar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Depo" }).click();
  await page.getByRole("option", { name: warehouseName }).click();

  await dialog.locator('input[type="file"]').setInputFiles(csv([`YOK;${sku};Un;ÇUVAL;A-01;;;10`]));
  await dialog.getByRole("button", { name: "Önizle" }).click();
  await expect(dialog.getByText("Müşteri carisi yok: YOK. Önce cariyi açın.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "İçe aktar" })).toBeDisabled();

  await dialog
    .locator('input[type="file"]')
    .setInputFiles(
      csv([
        `${customerCode};${sku};Un 50 kg;ÇUVAL;A-01;L1;31.12.2027;120`,
        `${customerCode};${sku};Un 50 kg;ÇUVAL;A-02;L1;31.12.2027;12,5`,
      ]),
    );
  await dialog.getByRole("button", { name: "Önizle" }).click();
  await expect(dialog.getByText("Hazır: 2 giriş, 1 yeni ürün, 2 yeni göz.")).toBeVisible();
  await dialog.getByRole("button", { name: "İçe aktar" }).click();
  await expect(dialog.getByText("İçe aktarıldı: 2 giriş, 1 yeni ürün, 2 yeni göz.")).toBeVisible();
  await dialog.getByRole("button", { name: "Kapat" }).click();

  const rows = page.getByRole("row").filter({ hasText: sku });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "A-02" })).toContainText("12,5");
});
