import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  api,
  assertNoZtoCssLeak,
  expect,
  linkFromMail,
  login,
  newPassword,
  openModule,
  openZtoSidebarLink,
  tenantState,
  test,
  type TenantState,
} from "./support";

/**
 * ZTO Finans 12.2 — Bankalar / Kasalar / Banka-Kasa Hareketleri / yazdırma (12.2_TASARIM §6.5 FE-1):
 * yeni vadesiz hesap (açılış 1000) → kartta bakiye ve sparkline; Banka Hareketleri süzgecinde
 * ZtoSearchableSelect araması ve `.ss-trigger` hesaplanmış stili; düzenle (Banka Adı etiketi, kod/para
 * birimi kilitli); kasa oluştur (yalnız klavyeyle); süzgeçler ve yürüyen bakiye; detay modalı (yalnız
 * Kapat); faaliyet raporu yeni sekme; ekstre yazdırma sayfası şirket başlığı; silme engeli ZTO cümlesi
 * + Pasifleştir; iki şirkette Şirketler çipi ve ŞİRKET süzgeci, tek şirkette yok; hesaplanmış ZTO
 * stilleri (kart, erp-stat-card).
 */

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** ZtoSelect (select2 görünümü): kutuyu açıp metne göre seçer. */
async function pickSelect2(page: Page, selectId: string, text: string) {
  await page.locator(`#${selectId} ~ .select2-container .select2-selection`).click();
  // Grup başlığı (şube grubu) alt seçeneklerin metnini de içerir; yalnız seçilebilir seçenek.
  await page.locator(".select2-results__option--selectable", { hasText: text }).first().click();
}

/** Vadesiz banka/kasa (API); bakiye verilirse elle giriş hareketi. */
async function fund(
  owner: Owner,
  body: { branchId: string; name: string; kind?: "BANK" | "CASH"; balance?: string },
) {
  const { id } = await owner.request<{ id: string }>("POST", "/finance/funds", {
    code: unique("F"),
    name: body.name,
    kind: body.kind ?? "BANK",
    currency: "TRY",
    branchId: body.branchId,
    bankName: body.kind === "CASH" ? null : "Akbank T.A.Ş.",
    allowNegative: false,
    accountType: "DEMAND",
  });
  if (body.balance) {
    await owner.request("POST", `/finance/funds/${id}/transactions`, {
      direction: "IN",
      money: { amount: body.balance, currency: "TRY" },
      date: localToday(),
      description: "E2E giriş",
    });
  }
  return id;
}

test("Yeni vadesiz hesap → kart, sparkline, ZTO stilleri; düzenle kilitleri", async ({ page }) => {
  test.setTimeout(120_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchName = unique("E2E BK ");
  await owner.branch(branchName);
  const accountName = unique("E2E Vadesiz ");
  const code = unique("BK");
  await login(page, state);

  await page.goto("/zto-finans/bankalar/yeni");
  const root = page.locator(".zto-finans.zto-page-bank-form");
  await expect(root.getByRole("heading", { name: "Yeni Banka" })).toBeVisible();
  await pickSelect2(page, "Bank", "Akbank T.A.Ş.");
  await root.locator("#BankCode").fill(code);
  await root.locator("#BankName").fill(accountName);
  await root.locator("#CurrencyID").selectOption("TRY");
  await root.locator("#Iban").fill("tr33 0006 1005 1978 6457 8413 26");
  await expect(root.locator("#Iban")).toHaveValue("TR330006100519786457841326");
  await pickSelect2(page, "WorkPlaceID", branchName);
  await root.locator("#InitialBalance").fill("1000");
  await root.getByRole("button", { name: /Yeni Banka Oluştur/ }).click();

  await expect(page).toHaveURL(/\/zto-finans\/bankalar$/);
  const list = page.locator(".zto-finans.zto-page-banks");
  await expect(list.getByText("Vadesiz hesap başarıyla oluşturuldu.")).toBeVisible();
  const card = list.locator(".account-card", { hasText: accountName });
  await expect(card.locator(".balance-value")).toHaveText("1.000,00 ₺");
  await expect(card.locator(".account-spark svg")).toBeVisible();
  // Hesaplanmış ZTO stilleri (timedeposits/index.css + BI satır içi stili kapsamlı).
  const cardStyle = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, radius: s.borderTopLeftRadius };
  });
  expect(cardStyle.display).toBe("flex");
  expect(cardStyle.radius).not.toBe("0px");
  const stat = list.locator(".erp-stat-card.card-total");
  expect(await stat.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");

  const id = await card.getAttribute("data-definition-id");
  await page.goto(`/zto-finans/bankalar/${id}/duzenle`);
  const edit = page.locator(".zto-finans.zto-page-bank-form");
  await expect(edit.getByRole("heading", { name: "Banka Düzenle" })).toBeVisible();
  await expect(edit.locator("label[for=BankName]")).toContainText("Banka Adı");
  await expect(edit.locator("#BankCode")).toHaveAttribute("readonly", "");
  await expect(edit.locator("#CurrencyID")).toBeDisabled();
  await expect(edit.locator("#Balance")).toHaveValue("1.000,00");
});

test("Banka Hareketleri: SearchableSelect araması/stili, süzgeç, yürüyen bakiye, detay, faaliyet raporu, ekstre", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchName = unique("E2E BT ");
  const branch = await owner.branch(branchName);
  const name = unique("E2E Hareket ");
  const fundId = await fund(owner, { branchId: branch, name, balance: "700" });
  await owner.request("POST", `/finance/funds/${fundId}/transactions`, {
    direction: "OUT",
    money: { amount: "200", currency: "TRY" },
    date: localToday(),
    description: "E2E çıkış",
  });
  await login(page, state);

  await page.goto("/zto-finans/banka-hareketleri");
  const root = page.locator(".zto-finans.zto-page-bank-transactions");
  await expect(root.getByRole("heading", { name: "Banka Hareketleri" })).toBeVisible();
  const trigger = root.locator("#filterBank");
  await expect(trigger).toHaveClass(/ss-trigger/);
  await expect(trigger).toHaveText("Tüm Bankalar");
  const triggerStyle = await trigger.evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, cursor: s.cursor, minHeight: s.minHeight };
  });
  expect(triggerStyle).toEqual({ display: "flex", cursor: "pointer", minHeight: "34px" });
  await trigger.click();
  await root.getByPlaceholder("Banka ara...").fill(name.slice(4, 12));
  const option = root.getByRole("option", { name: new RegExp(name) });
  await expect(option).toBeVisible();
  await expect(root.locator(".ss-highlight").first()).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(name);

  // Seçili hesap özeti ve yürüyen bakiye (sunucu, tarih azalan).
  await expect(root.getByText("GÜNCEL BAKİYE")).toBeVisible();
  const rows = root.locator("#transactionsTable tbody tr");
  await expect(rows.first()).toContainText("E2E çıkış");
  await expect(rows.first()).toContainText("500,00 ₺");
  await root.locator("#filterTransactionType").selectOption("IN");
  await root.getByRole("button", { name: "Filtrele" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("700,00 ₺");

  // Detay modalı: altbilgide yalnız "Kapat".
  await rows.first().getByRole("button", { name: "Detay" }).click();
  const modal = page.locator("#transactionDetailModal");
  await expect(modal.getByText("Banka Bilgileri")).toBeVisible();
  await expect(modal.locator(".modal-footer button")).toHaveText(["Kapat"]);
  await modal.locator(".modal-footer").getByRole("button", { name: "Kapat" }).click();
  await expect(modal).toBeHidden();

  // Faaliyet raporu yeni sekmede.
  await root.getByRole("button", { name: /Faaliyet Raporu/ }).click();
  await page.locator("#activityReportBank").selectOption(fundId);
  const [report] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: /Raporu Göster/ }).click(),
  ]);
  await expect(report.locator(".zto-finans.zto-page-fund-activity-report")).toBeVisible();
  await expect(report.getByRole("heading", { name: "Banka Faaliyet Raporu" })).toBeVisible();
  await report.close();

  // Ekstre yazdırma sayfası: şirket başlığı (varsayılan şirket adı) ve DEVİR.
  await page.goto(`/zto-finans-yazdir/banka-ekstre/${fundId}`);
  const extract = page.locator(".zto-finans.zto-page-fund-extract");
  await expect(extract.getByRole("heading", { name: "BANKA EKSTRESİ" })).toBeVisible();
  await expect(extract.locator(".company-name")).not.toBeEmpty();
  await expect(extract.getByText("DEVİR")).toBeVisible();
});

test("Kasa: yalnız klavyeyle oluştur; silme engeli ZTO cümlesi + Pasifleştir", async ({ page }) => {
  test.setTimeout(120_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchName = unique("E2E KS ");
  const branch = await owner.branch(branchName);
  const busy = unique("E2E Dolu Kasa ");
  await fund(owner, { branchId: branch, name: busy, kind: "CASH", balance: "50" });
  await login(page, state);

  await page.goto("/zto-finans/kasalar/yeni");
  const form = page.locator(".zto-finans.zto-page-cash-form");
  await expect(form.getByRole("heading", { name: "Yeni Kasa" })).toBeVisible();
  const cashName = unique("E2E Kasa ");
  await form.locator("#CashCode").focus();
  await page.keyboard.type(unique("KS"));
  await page.keyboard.press("Tab");
  await page.keyboard.type(cashName);
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");
  await form.locator("#CurrencyID").selectOption("TRY");
  await pickSelect2(page, "WorkPlaceID", branchName);
  await form.locator("#InitialBalance").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/zto-finans\/kasalar$/);

  const list = page.locator(".zto-finans.zto-page-cashes");
  await expect(list.locator(".cash-card", { hasText: cashName })).toBeVisible();
  const card = list.locator(".cash-card", { hasText: busy });
  // ⋮ menüsü (position: fixed) sayfa kayınca kapanır; uzun menü görünüm alanının altına taşarsa
  // Playwright'ın "görünüme kaydır" adımı onu kapatıyordu. Kart önce ortaya alınır; açma + "Sil"
  // birlikte yeniden denenir. Kartın :hover transform'u menüyü ekran dışına itiyordu (CSS'te
  // düzeltildi). "Kasadan Cari Tahsilatı Yap" da "Sil" içerdiğinden tam ad.
  await expect(async () => {
    await card.evaluate((element) => element.scrollIntoView({ block: "center" }));
    const menu = card.getByRole("menuitem", { name: "Sil", exact: true });
    if (!(await menu.isVisible())) await card.getByRole("button", { name: /işlemleri$/ }).click();
    await menu.click({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  const modal = page.locator(".modal", { hasText: "Kasa Silme" });
  await expect(modal.getByText("Bu kasa silinemez!")).toBeVisible();
  await expect(modal.locator("#deleteNotAllowedReason")).toContainText(
    "Bu kasaya bağlı işlemler var:",
  );
  await expect(modal.getByRole("button", { name: "İptal" })).toBeFocused();
  await modal.getByRole("button", { name: /Pasifleştir/ }).click();
  await expect(list.getByText("Kasa pasifleştirildi.")).toBeVisible();
  await expect(card.getByText("Pasif", { exact: true })).toBeVisible();
});

/** Kendi kiracısı (multi-company.spec.ts ile aynı yol): SaaS yönetici API'siyle açılır. */
async function provisionTenant(): Promise<TenantState> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `bk${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Banka Kasa Sahibi",
    },
  });
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E banka kasa",
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

test("iki şirkette Şirketler çipi, şirket başlıkları ve ŞİRKET süzgeci; tek şirkette yok", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Tek şirketli ortak kiracı: çip ve süzgeç yok.
  const shared = tenantState();
  await login(page, shared);
  await page.goto("/zto-finans/bankalar");
  const single = page.locator(".zto-finans.zto-page-banks");
  await expect(single.getByRole("heading", { name: "Banka Hesapları" })).toBeVisible();
  await expect(single.locator(".stat-main-header", { hasText: "Şirketler" })).toHaveCount(0);
  await page.goto("/zto-finans/banka-hareketleri");
  await expect(page.locator("#filterCompany")).toHaveCount(0);

  // Kendi kiracısı + ikinci şirket.
  const state = await provisionTenant();
  const owner = await Owner.login(state);
  const company = await owner.request<{ id: string }>("POST", "/organization/companies", {
    code: "BETA",
    title: "Beta Nakliyat Ltd. Şti.",
    shortName: "Beta Nakliyat",
    taxIdType: "VKN",
    taxNumber: null,
  });
  const branchA = (
    await owner.request<{ id: string }>("POST", "/organization/branches", { name: unique("A İY ") })
  ).id;
  const branchB = (
    await owner.request<{ id: string }>("POST", "/organization/branches", {
      name: unique("B İY "),
      companyId: company.id,
    })
  ).id;
  await fund(owner, { branchId: branchA, name: "A Bankası", balance: "100" });
  await fund(owner, { branchId: branchB, name: "B Bankası", balance: "50" });
  await page.context().clearCookies();
  await login(page, state);

  await page.goto("/zto-finans/bankalar");
  const root = page.locator(".zto-finans.zto-page-banks");
  await expect(root.locator(".stat-main-header", { hasText: "Şirketler" })).toBeVisible();
  await expect(root.locator(".account-card")).toHaveCount(2);
  await root.locator('.stat-item[data-filter-value="Beta Nakliyat"]').click();
  await expect(root.locator(".account-card")).toHaveCount(1);
  await expect(root.locator(".account-card")).toContainText("B Bankası");

  await page.goto("/zto-finans/banka-hareketleri");
  const tx = page.locator(".zto-finans.zto-page-bank-transactions");
  await expect(tx.locator("label[for=filterCompany]")).toContainText("ŞİRKET");
  await expect(tx.locator("#transactionsTable thead th", { hasText: "Şirket" })).toBeVisible();
});

test("Bankalar ve Banka Hareketleri CSS'i (.ss-* dahil) MUI ekranlarına sızmaz (§6.5)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await login(page, tenantState());
  await assertNoZtoCssLeak(page, async (p) => {
    await openModule(p, "ZTO Finans", /\/zto-finans\/cari-hareketler$/);
    await openZtoSidebarLink(p, "Bankalar", /\/zto-finans\/bankalar$/);
    await expect(p.locator(".zto-finans.zto-page-banks")).toBeVisible();
    await openZtoSidebarLink(p, "Tüm Banka Hareketleri", /\/zto-finans\/banka-hareketleri$/);
    const root = p.locator(".zto-finans.zto-page-bank-transactions");
    await expect(root).toBeVisible();
    // ZtoSearchableSelect açılır listesi: .ss-* kuralları ve payments.css parçası yüklenir.
    await root.locator("#filterBank").click();
    await expect(root.getByPlaceholder("Banka ara...")).toBeVisible();
    await p.keyboard.press("Escape");
  });
});
