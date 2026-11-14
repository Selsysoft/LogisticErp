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
  TenantState,
} from "./support";

/**
 * 12.2 §6.5 FE-3 — Ödeme şirket dağılımı uyarısı (K-12.2-3) ve eksik fatura (K-12.2-4).
 *
 * Kullanıcı örneği: tedarikçinin A şirketinde 100, B şirketinde 50 alacağı (bizim borcumuz) var; B
 * kasasından 150 ödeme → küçük kırmızı uyarı; Kaydet → "Uyarı" penceresi; Vazgeç → kayıt yok; Tamam →
 * kayıt. Borçsuz yeni cariye ödeme de onay ister (OK-12.2-4). Eksik fatura: A'daki 100'lük borç
 * yansıtılmayan 100'lük Alış Faturası ile kapanır; B'deki 50 faturasızdır → dört yerde "kalan 50".
 *
 * İkinci şirket ortak e2e kiracısında açılmaz (multi-company.spec.ts ile aynı gerekçe); spec kendi
 * kiracısını SaaS yönetici API'siyle açar. Mevcut finance.spec.ts değişmez.
 */

async function provisionTenant(): Promise<TenantState> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `sw${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Uyarı Sahibi",
    },
  });
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E uyarı",
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

/** Yerel takvim tarihi (UTC kayması yok). */
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type Setup = {
  state: TenantState;
  owner: Owner;
  branchAName: string;
  branchBName: string;
  bankAName: string;
  cashBName: string;
  supplierId: string;
  supplierName: string;
};

async function setup(): Promise<Setup> {
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
  const bankAName = `A Bankası ${unique("")}`;
  await owner.bank(branchA, bankAName, "1000");
  const cashBName = `B Kasası ${unique("")}`;
  const cashB = (
    await owner.request<{ id: string }>("POST", "/finance/funds", {
      code: unique("K"),
      name: cashBName,
      kind: "CASH",
      currency: "TRY",
      branchId: branchB,
      allowNegative: false,
    })
  ).id;
  const today = localToday();
  await owner.request("POST", `/finance/funds/${cashB}/transactions`, {
    direction: "IN",
    money: { amount: "1000", currency: "TRY" },
    date: today,
    description: "Açılış",
  });

  const supplierName = unique("E2E Tedarikçi ");
  const supplierId = await owner.account("SUPPLIER", supplierName);
  // Carinin alacağı (bizim borcumuz): A şirketinde 100, B şirketinde 50 (faturasız).
  for (const [branchId, amount] of [
    [branchA, "100"],
    [branchB, "50"],
  ]) {
    await owner.request("POST", `/finance/accounts/${supplierId}/transactions`, {
      branchId,
      direction: "CREDIT",
      money: { amount, currency: "TRY" },
      date: today,
      description: "Faturasız hizmet",
    });
  }
  // A'daki borcun faturası: yansıtılmayan 100 TRY Alış Faturası (KDV 0) → A'da eksik yok.
  await owner.request("POST", `/finance/accounts/${supplierId}/documents`, {
    side: "PAYABLE",
    documentType: "ALIS_FATURASI",
    documentNo: unique("FTR-"),
    documentDate: today,
    amount: 100,
    currency: "TRY",
    paymentMethod: "BANK",
    branchId: branchA,
    reflectToLedger: false,
    tax: { discountRate: 0, vatRate: 0, withholdingAmount: 0, otherTaxesAmount: 0 },
  });
  return {
    state,
    owner,
    branchAName,
    branchBName,
    bankAName,
    cashBName,
    supplierId,
    supplierName,
  };
}

async function paymentsOf(owner: Owner, accountId: string) {
  const page = await owner.request<{ content: { accountId: string; status: string }[] }>(
    "GET",
    "/finance/payments?size=100&sort=settlementDate,desc",
  );
  return page.content.filter((row) => row.accountId === accountId && row.status === "POSTED");
}

async function choose(page: Page, label: RegExp, option: string | RegExp) {
  const dialog = page.getByRole("dialog").first();
  await dialog.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("ödeme şirket dağılımını aşınca kırmızı uyarı ve onay; eksik fatura dört yerde", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const s = await setup();
  await login(page, s.state);

  // 1) Kullanıcı örneği: B kasasından 150 ödeme.
  await page.goto("/finance/settlements");
  await page.getByRole("button", { name: "Ödeme · Nakit" }).click();
  const form = page.getByRole("dialog", { name: /Ödeme · Nakit/ });
  await choose(page, /^Cari/, new RegExp(s.supplierName));
  await choose(page, /^Şube/, new RegExp(s.branchBName));
  await choose(page, /Banka\/kasa hesabı/, new RegExp(s.cashBName));
  await form.getByRole("textbox", { name: /Tutar/ }).fill("150");

  const warning = form.getByText(
    "Bu şirketin cariye borcu 50,00 TRY; ödeme 150,00 TRY, borçtan 100,00 TRY fazla.",
    { exact: false },
  );
  await expect(warning).toBeVisible();
  await expect(form.getByText(/Diğer şirketlerdeki borç: .+ 100,00 TRY\./)).toBeVisible();
  // Kırmızı (hata) kenarlıklı küçük satır.
  await expect(form.locator(".MuiAlert-outlinedError")).toHaveCount(1);
  await expect(
    form.getByText("kalan 50,00 TRY için fatura bilgisi eksik.", { exact: false }),
  ).toBeVisible();

  await form.getByRole("button", { name: "Kaydet" }).click();
  let confirm = page.getByRole("dialog", { name: "Uyarı" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText("Yine de kaydetmek istiyor musunuz?")).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  await expect(confirm).toBeHidden();
  await expect(form).toBeVisible();
  expect(await paymentsOf(s.owner, s.supplierId)).toHaveLength(0);

  await form.getByRole("button", { name: "Kaydet" }).click();
  confirm = page.getByRole("dialog", { name: "Uyarı" });
  await confirm.getByRole("button", { name: "Tamam" }).click();
  // Onay penceresi açıkken form aria-hidden olduğundan getByRole onu hemen "gizli" sayar; kayıt
  // tamamlanana kadar API'den beklenir.
  await expect(confirm).toBeHidden();
  await expect.poll(async () => (await paymentsOf(s.owner, s.supplierId)).length).toBe(1);
  await expect(form).toBeHidden();

  // 2) Borçsuz yeni cariye ödeme de onay ister (OK-12.2-4).
  const freshName = unique("E2E Borçsuz ");
  const freshId = await s.owner.account("SUPPLIER", freshName);
  await page.reload();
  await page.getByRole("button", { name: "Ödeme · Banka" }).click();
  const bankForm = page.getByRole("dialog", { name: /Ödeme · Banka/ });
  await choose(page, /^Cari/, new RegExp(freshName));
  await choose(page, /^Şube/, new RegExp(s.branchAName));
  await choose(page, /Banka\/kasa hesabı/, new RegExp(s.bankAName));
  await bankForm.getByRole("textbox", { name: /Tutar/ }).fill("10");
  await expect(
    bankForm.getByText(
      "Bu şirketin cariye borcu 0,00 TRY; ödeme 10,00 TRY, borçtan 10,00 TRY fazla.",
    ),
  ).toBeVisible();
  await bankForm.getByRole("button", { name: "Kaydet" }).click();
  await page.getByRole("dialog", { name: "Uyarı" }).getByRole("button", { name: "Tamam" }).click();
  await expect.poll(async () => (await paymentsOf(s.owner, freshId)).length).toBe(1);
  await expect(bankForm).toBeHidden();

  // 3) Eksik fatura — cari listesi: ikon + "Eksik Faturalı" süzgeci.
  await page.goto("/zto-finans/cari-kartlar");
  const row = page.locator("#customerAccountsTable tbody tr", { hasText: s.supplierName });
  await expect(row.getByRole("img", { name: "Eksik fatura: 50,00 ₺" })).toBeVisible();
  await page.getByRole("switch", { name: "Eksik Faturalı" }).click();
  await expect(row).toBeVisible();
  await expect(page.locator("#customerAccountsTable tbody tr", { hasText: freshName })).toHaveCount(
    0,
  );

  // 4) Cari Hareketler kartı.
  await page.goto(`/zto-finans/cari-kartlar/${s.supplierId}/hareketler`);
  await expect(
    page.getByText("Kalan 50,00 ₺ için fatura bilgisi eksik.", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator(".badge.badge-danger", { hasText: "Eksik fatura" })).toBeVisible();

  // 5) Borç Ekle modalı (Alış Faturası fatura sayılır).
  await page.getByRole("button", { name: "Borç Ekle" }).click();
  const debtModal = page.locator("#addDebtModal");
  await expect(debtModal.getByText("Yeni Borç Ekle")).toBeVisible();
  await expect(
    debtModal.getByText("Kalan 50,00 ₺ için fatura bilgisi eksik.", { exact: false }),
  ).toBeVisible();
  await expect(debtModal.getByText("Bu belge kaydedilince kalan: 50,00 ₺")).toBeVisible();
  await debtModal.getByRole("button", { name: /İptal/ }).click();

  // 6) Ekstre (yazdırmada görünür satır).
  await page.goto(`/zto-finans-yazdir/cari-ekstre/${s.supplierId}`);
  const missing = page.locator(".grand-summary-table .missing-invoice-row");
  await expect(missing).toContainText("Fatura bilgisi eksik");
  await expect(missing).toContainText("50,00 ₺");
});
