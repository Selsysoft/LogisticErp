import { expect, login, tenantState, test } from "./support";

/** Menüdeki her modül açılır ve hata göstermez; sayfalar ayrı dosyadan yüklendiği için önemlidir. */
const MODULES = [
  { menu: "Finans", url: /\/finance$/ },
  { menu: "Operasyon", url: /\/operations$/ },
  { menu: "Satış/CRM", url: /\/crm$/ },
  { menu: "Filo", url: /\/fleet$/ },
  { menu: "Depo", url: /\/warehouse$/ },
  { menu: "Gümrük", url: /\/customs$/ },
  { menu: "Entegrasyonlar", url: /\/integrations$/ },
  { menu: "Raporlar", url: /\/reports/ },
  { menu: "Kullanıcılar", url: /\/users$/ },
  { menu: "Ana Sayfa", url: /\/dashboard$/ },
];

test("bütün modüller menüden açılır", async ({ page }) => {
  await login(page, tenantState());
  const nav = page.getByRole("navigation");
  for (const module of MODULES) {
    await nav.getByRole("link", { name: module.menu, exact: true }).click();
    await expect(page).toHaveURL(module.url);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByText("Bir sorun oluştu")).toHaveCount(0);
  }
});

test("sefer detay adresinin sonu silinince sefer listesi açılır", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/operations/shipments");
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByRole("button", { name: "Yeni sefer" })).toBeVisible();
});
