import { Owner, unique } from "./fixtures";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  api,
  expect,
  linkFromMail,
  login,
  newPassword,
  tenantState,
  test,
  TenantState,
} from "./support";

/**
 * 12.1a çoklu şirket (§7.5). İkinci şirket ortak e2e kiracısında açılmaz: açılsaydı diğer testlerin
 * "Şube" seçenekleri "Şirket › İş yeri" etiketine döner, AppBar'da seçici çıkardı. Bu dosya kendi
 * kiracısını SaaS yönetici API'siyle açar.
 */
async function provisionTenant(): Promise<TenantState> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `mc${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Çok Şirket Sahibi",
    },
  });
  // Deneme planının kullanıcı/şirket sınırı testi etkilemesin.
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E çok şirket",
      monthlyPrice: "0",
      currency: "TRY",
      maxUsers: null,
      maxVehicles: null,
      maxShipmentsMonth: null,
      maxCompanies: null,
      maxBranches: null,
      active: true,
    },
  });
  await api("PUT", `/admin/tenants/${tenant.id}/plan`, {
    token: accessToken,
    body: { planId: plan.id },
  });
  const invite = new URL(await linkFromMail(email, "Hesabınızı etkinleştirin"));
  const password = newPassword();
  await api("POST", "/auth/password-reset/confirm", {
    tenant: code,
    body: { token: invite.searchParams.get("token"), newPassword: password },
  });
  return { code, email, password };
}

type Setup = {
  state: TenantState;
  owner: Owner;
  branchA: string;
  branchB: string;
  branchAName: string;
  branchBName: string;
  fundA: string;
  fundB: string;
};

/** Varsayılan şirket A + yeni şirket B; her birinde bir iş yeri ve bir banka hesabı. */
async function twoCompanies(): Promise<Setup> {
  const state = await provisionTenant();
  const owner = await Owner.login(state);
  const company = await owner.request<{ id: string }>("POST", "/organization/companies", {
    code: "BETA",
    title: "Beta Nakliyat Ltd. Şti.",
    shortName: "Beta Nakliyat",
    taxIdType: "VKN",
    taxNumber: null,
  });
  const branchAName = `A İş Yeri ${unique("")}`;
  const branchBName = `B İş Yeri ${unique("")}`;
  const branchA = (
    await owner.request<{ id: string }>("POST", "/organization/branches", { name: branchAName })
  ).id;
  const branchB = (
    await owner.request<{ id: string }>("POST", "/organization/branches", {
      name: branchBName,
      companyId: company.id,
    })
  ).id;
  const fundA = `A Bankası ${unique("")}`;
  const fundB = `B Bankası ${unique("")}`;
  await owner.bank(branchA, fundA, "1000");
  await owner.bank(branchB, fundB, "2000");
  return { state, owner, branchA, branchB, branchAName, branchBName, fundA, fundB };
}

test("tek şirketli kiracıda AppBar'da şirket seçici yoktur", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/finance/funds");
  await expect(page.getByRole("button", { name: "Hesap ekle" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Aktif şirket" })).toHaveCount(0);
});

test("iki şirkette seçici görünür; seçilen şirketin fonları listelenir, konsolidede hepsi", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const setup = await twoCompanies();
  await login(page, setup.state);
  await page.goto("/finance/funds");

  const switcher = page.getByRole("combobox", { name: "Aktif şirket" });
  await expect(switcher).toBeVisible();
  await expect(switcher).toHaveText("Tüm şirketler (konsolide)");
  await expect(page.getByRole("link", { name: setup.fundA })).toBeVisible();
  await expect(page.getByRole("link", { name: setup.fundB })).toBeVisible();

  await switcher.click();
  await page.getByRole("option", { name: "Beta Nakliyat" }).click();
  await expect(page.getByRole("link", { name: setup.fundB })).toBeVisible();
  await expect(page.getByRole("link", { name: setup.fundA })).toHaveCount(0);

  // Seçim kullanıcıya özgü saklanır; yeniden yüklemede korunur.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Aktif şirket" })).toHaveText("Beta Nakliyat");
  await expect(page.getByRole("link", { name: setup.fundA })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Aktif şirket" }).click();
  await page.getByRole("option", { name: "Tüm şirketler (konsolide)" }).click();
  await expect(page.getByRole("link", { name: setup.fundA })).toBeVisible();
  await expect(page.getByRole("link", { name: setup.fundB })).toBeVisible();
});

test("İş Yeri Yetkisi: sınırlı kullanıcı ödeme formunda yalnız izinli iş yerini görür", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const setup = await twoCompanies();
  const email = `${unique("sinirli").toLowerCase()}@${setup.state.code}.test`;
  const limited = await setup.owner.user("FINANCE", email);

  await login(page, setup.state);
  await page.goto("/users");
  await page
    .getByRole("row")
    .filter({ hasText: email })
    .getByRole("button", { name: "Düzenle" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "İş Yeri Yetkisi" }).click();
  await dialog.getByRole("radio", { name: "Seçili iş yerleri" }).check();
  // ZTO çoklu seçim listesi (.zto-finans kökü): iş yeri satırı etiketle işaretlenir.
  await dialog.locator("label", { hasText: setup.branchAName }).locator("input").check();
  // Arama kutusunda Enter kullanıcı formunu göndermez (sekme form değildir).
  await dialog.getByPlaceholder("İş yeri / şube ara...").press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("İş yeri yetkisi kaydedildi.")).toBeVisible();
  await dialog.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByRole("row").filter({ hasText: email }).getByText("Sınırlı")).toBeVisible();

  const other = await browser.newPage();
  await login(other, limited);
  await other.goto("/finance/settlements");
  await other.getByRole("button", { name: "Ödeme · Banka" }).click();
  const form = other.getByRole("dialog");
  await form.getByRole("combobox", { name: /^Şube/ }).click();
  const options = other.getByRole("option");
  await expect(options.filter({ hasText: setup.branchAName })).toHaveCount(1);
  await expect(options.filter({ hasText: setup.branchBName })).toHaveCount(0);
  await other.keyboard.press("Escape");

  // Ana sayfa panosu: LIMITED kullanıcıda finance.position null gelir (§4.16); pano çökmez, finans
  // bölümü çizilir, kiracı geneli net pozisyon kutucuğu çizilmez.
  await other.goto("/");
  await expect(other.getByText("Onay bekleyen plan")).toBeVisible();
  await expect(other.getByText(/Net pozisyon/)).toHaveCount(0);
  await other.close();
});
