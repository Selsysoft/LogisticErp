import { expect, login, tenantState, test } from "./support";

test("giriş, sayfa yenilemede oturumun sürmesi ve çıkış", async ({ page, context }) => {
  const state = tenantState();
  await login(page, state);
  await expect(page.getByText("Hoş geldiniz", { exact: false })).toBeVisible();

  // Yenileme token'ı JavaScript'in göremediği çerezdedir; yerel depoda token yoktur.
  const cookies = await context.cookies();
  const refresh = cookies.find((cookie) => cookie.name === "br_refresh");
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe("Strict");
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain(refresh!.value);

  await page.reload();
  await expect(page.getByText("Hoş geldiniz", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("yanlış şifre reddedilir", async ({ page }) => {
  const state = tenantState();
  await page.goto("/login");
  await page.getByLabel("Firma kodu").fill(state.code);
  await page.getByLabel("E-posta").fill(state.email);
  await page.getByLabel("Şifre", { exact: true }).fill("Yanlis-sifre-123");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("güvenlik başlıkları gelir", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-frame-options"]).toBe("DENY");
});
