import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  api,
  expect,
  linkFromMail,
  newPassword,
  STATE_FILE,
  test,
  TenantState,
} from "./support";

test("SaaS yöneticisi firma açar, sahibi davet bağlantısıyla şifresini belirler", async ({
  page,
}) => {
  // "compose up" konteyner başlar başlamaz döner; backend'in açılması yarım dakika sürebilir.
  test.setTimeout(180_000);
  await expect
    .poll(
      () =>
        api("GET", "/ping").then(
          () => true,
          () => false,
        ),
      {
        timeout: 120_000,
        intervals: [2_000],
      },
    )
    .toBe(true);

  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `e2e${Date.now().toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Deneme Sahibi",
    },
  });

  // Deneme planı 10 kullanıcıyla sınırlıdır; testler her çalıştırmada kullanıcı açar.
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E sınırsız",
      monthlyPrice: "0",
      currency: "TRY",
      maxUsers: null,
      maxVehicles: null,
      maxShipmentsMonth: null,
      active: true,
    },
  });
  await api("PUT", `/admin/tenants/${tenant.id}/plan`, {
    token: accessToken,
    body: { planId: plan.id },
  });

  const link = await linkFromMail(email, "Hesabınızı etkinleştirin");
  // Bağlantı backend'in FRONTEND_BASE_URL ayarından gelir; yalnız yol ve parametreler kullanılır.
  const url = new URL(link);
  await page.goto(url.pathname + url.search);

  const password = newPassword();
  await page.getByLabel("Yeni şifre", { exact: true }).fill(password);
  await page.getByLabel("Yeni şifre (tekrar)").fill(password);
  await page.getByRole("button", { name: "Şifreyi kaydet" }).click();
  await expect(page.getByText("Şifreniz kaydedildi")).toBeVisible();

  const state: TenantState = { code, email, password };
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state));
});
