import { ADMIN_EMAIL, ADMIN_PASSWORD, expect, test } from "./support";

test("SaaS yöneticisi dış bağlantıların durumunu görür ve yeniden denetletir", async ({ page }) => {
  await page.goto("/saas/login");
  await page.getByLabel(/^E-posta/).fill(ADMIN_EMAIL);
  await page.getByLabel(/^Şifre/).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).not.toHaveURL(/\/saas\/login/);
  // Yönetici oturumu bellektedir; sayfa yeniden yüklenmeden menüden gidilir.
  await page
    .getByRole("tab", { name: "Sistem sağlığı" })
    .or(page.getByRole("link", { name: "Sistem sağlığı" }))
    .click();
  await expect(page).toHaveURL(/\/saas\/health$/);

  // E2E yığınında e-posta gerçek SMTP sunucusuna (Mailpit) gider.
  const mail = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "E-posta", exact: true }) });
  await expect(mail).toContainText("Çalışıyor");
  await expect(mail).toContainText("SMTP mailpit:1025");
  // Deneme alan adının SPF ve DMARC kaydı yoktur. Docker'ın DNS'i .local adlarına yanıt
  // vermeyebilir; iki durum da uyarıdır ve genel durumu düşürmez.
  const domain = page.getByRole("row").filter({ hasText: "Gönderen alan adı" });
  await expect(domain).toContainText("Uyarı");
  await expect(domain).toContainText(/blackrose\.local: (SPF, DMARC kaydı yok|DNS sorgulanamadı)/);
  await expect(page.getByRole("row").filter({ hasText: "Dosya deposu" })).toContainText(
    "Çalışıyor",
  );
  await expect(page.getByRole("row").filter({ hasText: "Virüs tarama" })).toContainText(
    "Tanımlı değil",
  );

  const recheck = page.getByRole("button", { name: "Yeniden denetle" });
  const fresh = page.waitForResponse((response) => response.url().includes("/health?fresh=true"));
  await recheck.click();
  expect((await fresh).ok()).toBe(true);
  await expect(recheck).toBeEnabled();
  await expect(mail).toContainText("Çalışıyor");
});
