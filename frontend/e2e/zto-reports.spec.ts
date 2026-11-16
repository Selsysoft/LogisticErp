import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  api,
  expect,
  linkFromMail,
  login,
  newPassword,
  test,
  type TenantState,
} from "./support";

/**
 * ZTO Finans 12.8 — Finans Raporları, Finansal Bilanço, Cari Hesap Raporları (12.8_TASARIM §6.5 FE-2).
 * Spec kendi kiracısını (dolayısıyla kendi şirketini) ve iş yerini kurar: rapor toplamları ortak
 * kiracıdaki diğer spec'lerin verisinden etkilenmez. Müşteri + tedarikçi carisi, TRY borç/alacak
 * belgeleri ve banka tahsilatı API ile → Genel Bakış satırı → tür bağlantısı → liste satırı → cari
 * ekstre ve "Listeye dön"; Excel indirme olayı; Bilanço iş yeri kartı akordeonu klavyeyle açılır ve
 * banka bakiyesi görünür; Cari Raporları yaşlandırma "Raporu Getir" ve Döviz Pozisyonu tablosu.
 */

function localDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Kendi kiracısı (multi-company.spec.ts ile aynı yol): SaaS yönetici API'siyle açılır. */
async function provisionTenant(): Promise<TenantState> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `fr${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Finans Raporları Sahibi",
    },
  });
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E finans raporları",
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
  branchName: string;
  customerName: string;
  supplierName: string;
};

/**
 * İş yeri + 5.000 ₺ banka; müşteri: 1.000 ₺ alacak belgesi − 400 ₺ banka tahsilatı = 600 ₺ (bize
 * borçlu); tedarikçi: 2.000 ₺ borç belgesi (borcumuz). Banka bakiyesi 5.400 ₺.
 */
async function setup(): Promise<Setup> {
  const state = await provisionTenant();
  const owner = await Owner.login(state);
  const branchName = unique("E2E FR ");
  const branchId = await owner.branch(branchName);
  const bank = await owner.bank(branchId, unique("E2E FR Banka "), "5000");
  const customerName = unique("E2E FR Müşteri ");
  const customerId = await owner.account("CUSTOMER", customerName);
  const supplierName = unique("E2E FR Tedarikçi ");
  const supplierId = await owner.account("SUPPLIER", supplierName);
  const documentOf = (side: "RECEIVABLE" | "PAYABLE", amount: string) => ({
    side,
    documentType: "DIGER",
    documentNo: unique("FR-"),
    documentDate: localDate(),
    amount,
    currency: "TRY",
    paymentMethod: "BANK",
    branchId,
    description: "E2E finans raporu",
  });
  await owner.request(
    "POST",
    `/finance/accounts/${customerId}/documents`,
    documentOf("RECEIVABLE", "1000"),
  );
  await owner.request(
    "POST",
    `/finance/accounts/${supplierId}/documents`,
    documentOf("PAYABLE", "2000"),
  );
  await owner.request("POST", "/finance/collections", {
    method: "BANK",
    channel: "TRANSFER",
    accountId: customerId,
    branchId,
    fundAccountId: bank,
    money: { amount: "400", currency: "TRY" },
    date: localDate(),
    confirmWarnings: true,
    description: "E2E tahsilat",
  });
  return { state, branchName, customerName, supplierName };
}

const cellsOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from((row as HTMLTableRowElement).cells, (cell) =>
          (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
        ),
      ),
    );

test.describe("ZTO Finans raporları", () => {
  let data: Setup;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, data.state);
  });

  test("Finans Raporları: genel bakış → tür → liste → cari ekstre → Listeye dön; Excel", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/zto-finans/finans-raporlari");
    const root = page.locator(".zto-finans.zto-page-finance-report");
    await expect(root.locator(".rp-page > .rp-wrap.fr-page")).toHaveAttribute(
      "data-fr-mode",
      "overview",
    );
    await expect(root.getByRole("heading", { level: 1, name: "Genel Bakış" })).toBeVisible();
    // Kabuk içi sayfa: kökte rp-page sınıfı yok (yalnız sarmalayıcıda).
    await expect(root).not.toHaveClass(/(^|\s)rp-page(\s|$)/);

    const overview = root.locator('table[data-fr-sheet="Genel Bakış"] tbody tr');
    const sales = overview.filter({ hasText: "Satış ve Müşteri Alacakları" });
    await expect(sales).toHaveCount(1);
    await expect(sales).toContainText("600,00 ₺ (bize borçlu)");
    // "Malzeme Tedarikçileri" satırı da "Tedarikçiler" içerir; yalnız baştaki tam ad.
    await expect(overview.filter({ hasText: /^\s*Tedarikçiler(?!i)/ })).toContainText(
      "2.000,00 ₺ (borcumuz)",
    );

    // Excel indirme olayı.
    const download = page.waitForEvent("download");
    await root.getByRole("button", { name: /Excel'e Aktar/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^Finans_Rapor.*\.xlsx$/);

    // Tür bağlantısı → liste kipi.
    await sales.getByRole("link", { name: "Satış ve Müşteri Alacakları" }).click();
    await expect(page).toHaveURL(/\/zto-finans\/finans-raporlari\?type=SALES&range=all/);
    await expect(root.locator(".fr-page")).toHaveAttribute("data-fr-mode", "list");
    const list = root.locator("#frList");
    await expect(list.locator("thead th").filter({ hasText: "Kalan (bize borcu)" })).toHaveCount(1);
    const row = list.locator("tbody tr", { hasText: data.customerName });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td.fr-closing")).toHaveText("600,00");
    await expect(root.locator('[data-fr-tile="kalan"]')).toHaveText("600,00 ₺");

    // Sıralama düğmesi: aria-sort yalnız sıralı sütunda.
    const sortButton = list.getByRole("button", { name: "Kalan (bize borcu)" });
    await sortButton.click();
    await expect(list.locator("th[aria-sort]")).toHaveCount(1);
    await expect(sortButton).toBeFocused();

    // Cari → ekstre kipi.
    await row.getByRole("link", { name: data.customerName }).click();
    await expect(page).toHaveURL(/account=/);
    await expect(root.locator(".fr-page")).toHaveAttribute("data-fr-mode", "statement");
    await expect(root.getByRole("heading", { level: 1 })).toHaveText(
      `${data.customerName} - Cari Ekstre`,
    );
    // cellsOf beklemez: önce ekstre tablosunun çizilmesini (ilk ve son satır) bekle.
    const statementRows = root.locator('table[data-fr-sheet="Ekstre ₺"] tbody tr');
    await expect(statementRows.first()).toContainText("DEVREDEN BAKİYE");
    await expect(statementRows.last()).toContainText("Dönem toplamı ve kapanış");
    const statement = await cellsOf(
      page,
      '.zto-page-finance-report table[data-fr-sheet="Ekstre ₺"] tbody tr',
    );
    expect(statement[0]).toContain("DEVREDEN BAKİYE");
    expect(statement.at(-1)).toEqual([
      "",
      "",
      "",
      "Dönem toplamı ve kapanış",
      "",
      "",
      "1.000,00",
      "400,00",
      "600,00 B",
    ]);
    await expect(root.getByText("Ödeme ve tahsilat yöntemleri")).toBeVisible();

    await root.getByRole("link", { name: /Listeye dön/ }).click();
    await expect(page).toHaveURL(/\/zto-finans\/finans-raporlari\?type=SALES&range=all$/);
    await expect(root.locator(".fr-page")).toHaveAttribute("data-fr-mode", "list");
  });

  test("Finansal Bilanço: iş yeri kartı klavyeyle açılır, banka bakiyesi görünür", async ({
    page,
  }) => {
    await page.goto("/zto-finans/bilanco");
    const root = page.locator(".zto-finans.zto-page-financial-balance-sheet");
    await expect(root.getByText("Finansal Bilanço", { exact: true })).toBeVisible();
    const card = root.locator(".fbs-wp-card", { hasText: data.branchName });
    const header = card.locator(".fbs-wp-header");
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await header.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await expect(card).toHaveClass(/is-open/);
    const tl = card.locator('.fbs-currency-block[data-currency="TRY"]');
    await expect(tl.locator(".liq-cell.bank .liq-value")).toHaveText("5.400 ₺");
    await expect(tl.locator(".cb-net-badge")).toHaveText("(−) Alacaklı Bakiye");
    await expect(card.locator(".fbs-cari-item", { hasText: data.customerName })).toBeVisible();
    await expect(card.locator(".fbs-wp-footer .footer-stat")).toHaveCount(3);
    await page.keyboard.press("Space");
    await expect(header).toHaveAttribute("aria-expanded", "false");
  });

  test("Cari Hesap Raporları: yaşlandırma Raporu Getir, Döviz Pozisyonu tablosu", async ({
    page,
  }) => {
    await page.goto("/zto-finans/cari-raporlari");
    const root = page.locator(".zto-finans.zto-page-customer-account-report");
    await expect(root.getByRole("heading", { name: "Cari Hesap Raporları" })).toBeVisible();
    await root.getByRole("button", { name: "Raporu Getir" }).first().click();
    const aging = root.locator("#agingReportTable tbody tr", { hasText: data.customerName });
    await expect(aging).toHaveCount(1);
    await expect(aging).toContainText("600,00");

    await root.getByRole("tab", { name: /Döviz Pozisyonu/ }).click();
    const panel = root.locator("#currencyPositionTable");
    const load = panel.getByRole("button", { name: "Raporu Yükle" });
    // Sekme açılışta veri çekmez; "Raporu Yükle" her zaman çizilir (isVisible beklemez, yarışa düşer).
    await load.click();
    const tl = panel.locator("tbody tr", { hasText: "₺" });
    await expect(tl).toHaveCount(1);
    await expect(tl).toContainText("600,00");
    await expect(tl).toContainText("2.000,00");
  });
});
