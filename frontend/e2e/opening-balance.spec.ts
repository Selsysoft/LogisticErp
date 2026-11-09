import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

function csv(lines: string[]) {
  return {
    name: "acilis.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(lines.join("\n"), "utf8"),
  };
}

test("açılış bakiyeleri önizlenir; hatalı dosya yazılmaz, düzeltilen dosya içe aktarılır", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  await owner.branch();
  const code = unique("A").slice(0, 20);
  const header = "Kod;Ad;Tür;Para birimi;Bakiye";

  await login(page, tenantState());
  await page.goto("/finance/accounts");
  await page.getByRole("button", { name: "Açılış bakiyesi içe aktar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Şube" }).click();
  await page.getByRole("option").first().click();

  // Belirsiz tutar: 1.500 hem 1,5 hem 1500 okunabilir.
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(csv([header, `${code};Açılış Müşterisi;Müşteri;TRY;1.500`]));
  await dialog.getByRole("button", { name: "Önizle" }).click();
  await expect(dialog.getByText("1 satır hatalı")).toBeVisible();
  await expect(dialog.getByText(/Bakiye belirsiz/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "İçe aktar" })).toBeDisabled();

  await dialog
    .locator('input[type="file"]')
    .setInputFiles(csv([header, `${code};Açılış Müşterisi;Müşteri;TRY;1.500,00`]));
  await dialog.getByRole("button", { name: "Önizle" }).click();
  await expect(dialog.getByText("Hazır: 1 yeni cari, 1 açılış hareketi.")).toBeVisible();
  await expect(dialog.getByText("Yeni cari", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "İçe aktar" }).click();
  await expect(dialog.getByText("İçe aktarıldı: 1 yeni cari, 1 açılış hareketi.")).toBeVisible();
  await dialog.getByRole("button", { name: "Kapat" }).click();

  await page.getByLabel("Ara").fill(code);
  await page.getByRole("link", { name: "Açılış Müşterisi" }).click();
  const opening = page.getByRole("row").filter({ hasText: "Açılış bakiyesi" });
  await expect(opening).toContainText("1.500,00");

  // Yanlış yüklenen açılış ekstreden ters çevrilir.
  await opening.getByRole("button", { name: "Ters çevir" }).click();
  const reverse = page.getByRole("dialog");
  await reverse.getByRole("button", { name: "Ters çevir" }).click();
  await expect(reverse).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Ters kayıt" })).toBeVisible();
});
