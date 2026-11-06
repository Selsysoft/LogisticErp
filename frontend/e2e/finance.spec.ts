import { expect, login, tenantState, test } from "./support";

test("cari eklenir, listede ve detayda görünür", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/finance/accounts");

  const code = `C${Date.now().toString(36).toUpperCase()}`;
  const name = `Deneme Cari ${code}`;
  await page.getByRole("button", { name: "Cari ekle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kod").fill(code);
  // Zorunlu alan etiketinin sonunda "*" vardır.
  await dialog.getByLabel(/^Ad\b/).fill(name);
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/finance\/accounts\/[0-9a-f-]+$/);
  await expect(page.getByText(name).first()).toBeVisible();
});

test("zorunlu alanlar boşken kayıt gönderilmez", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/finance/accounts");
  await page.getByRole("button", { name: "Cari ekle" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Bu alan zorunlu.").first()).toBeVisible();
});
