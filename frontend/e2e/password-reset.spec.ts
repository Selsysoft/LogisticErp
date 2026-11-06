import { api, expect, linkFromMail, newPassword, tenantState, test } from "./support";

/**
 * Sahibin şifresi diğer testlerde kullanıldığı için sıfırlama, bu test için davet edilen ayrı
 * bir kullanıcıyla yapılır.
 */
test("şifremi unuttum bağlantısıyla yeni şifre belirlenir ve giriş yapılır", async ({ page }) => {
  const state = tenantState();
  const { accessToken } = await api<{ accessToken: string }>("POST", "/auth/login", {
    tenant: state.code,
    body: { email: state.email, password: state.password },
  });
  const roles = await api<{ id: string; name: string }[]>("GET", "/identity/roles", {
    token: accessToken,
    tenant: state.code,
  });
  const email = `kullanici-${Date.now().toString(36)}@${state.code}.test`;
  await api("POST", "/identity/users", {
    token: accessToken,
    tenant: state.code,
    body: { email, fullName: "Deneme Kullanıcı", roleIds: [roles[0].id] },
  });
  const invite = new URL(await linkFromMail(email, "Hesabınızı etkinleştirin"));
  await api("POST", "/auth/password-reset/confirm", {
    tenant: state.code,
    body: { token: invite.searchParams.get("token"), newPassword: newPassword() },
  });

  await page.goto("/login");
  await page.getByRole("link", { name: "Şifremi unuttum" }).click();
  await page.getByLabel("Firma kodu").fill(state.code);
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Bağlantı gönder" }).click();
  await expect(page.getByText("sıfırlama bağlantısı gönderildi", { exact: false })).toBeVisible();

  const reset = new URL(await linkFromMail(email, "Şifre sıfırlama"));
  await page.goto(reset.pathname + reset.search);
  const password = newPassword();
  await page.getByLabel("Yeni şifre", { exact: true }).fill(password);
  await page.getByLabel("Yeni şifre (tekrar)").fill(password);
  await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await expect(page.getByText("Şifreniz kaydedildi")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Firma kodu").fill(state.code);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // Aynı bağlantı ikinci kez kullanılamaz.
  await page.goto(reset.pathname + reset.search);
  await page.getByLabel("Yeni şifre", { exact: true }).fill(password + "x");
  await page.getByLabel("Yeni şifre (tekrar)").fill(password + "x");
  await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Şifreniz kaydedildi")).toHaveCount(0);
});
