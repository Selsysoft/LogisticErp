import type { Locator, Page } from "@playwright/test";
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
 * ZTO Finans 12.2 — Transfer Merkezi (12.2_TASARIM §6.5 FE-2): Virman kural budaması ve kayıt, EFT,
 * Bankadan Kasaya; banka kartı "EFT Al" derin bağlantısı (hedef iş yeri ve hedef banka ön seçili);
 * döviz bozumu (tahsilat seçimi → kur hesabı → KMV) → Transferler'de kod ve maliyet; düzenle (replace)
 * → eski "İptal" rozeti; sil (ters) → ekstrede ters kayıt; şirketler arası EFT (neden seçimi, kendi
 * kiracısında — ikinci şirket ortak kiracıda açılmaz, multi-company.spec.ts ile aynı gerekçe); BS-12
 * yalnız eksiye izinli hesapta.
 */

const PAGE = "/zto-finans/transfer-merkezi";

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Vadesiz banka/kasa; bakiye verilirse elle giriş hareketi (döviz için elle kur). */
async function fund(
  owner: Owner,
  body: {
    branchId: string;
    name: string;
    kind?: "BANK" | "CASH";
    currency?: string;
    bankName?: string;
    allowNegative?: boolean;
    balance?: string;
  },
) {
  const currency = body.currency ?? "TRY";
  const { id } = await owner.request<{ id: string }>("POST", "/finance/funds", {
    code: unique("F"),
    name: body.name,
    kind: body.kind ?? "BANK",
    currency,
    branchId: body.branchId,
    bankName: body.kind === "CASH" ? null : (body.bankName ?? body.name),
    allowNegative: body.allowNegative ?? false,
    accountType: "DEMAND",
  });
  if (body.balance) {
    await owner.request("POST", `/finance/funds/${id}/transactions`, {
      direction: "IN",
      money: { amount: body.balance, currency },
      date: localToday(),
      description: "Açılış",
      exchangeRate: currency === "TRY" ? undefined : 34,
    });
  }
  return id;
}

/** ZtoSelect (select2 görünümü): kutuyu açıp metne göre seçer. */
async function pickSelect2(page: Page, selectId: string, text: string) {
  await page.locator(`#${selectId} ~ .select2-container .select2-selection`).click();
  // Grup başlığı (şube grubu) alt seçeneklerin metnini de içerir; yalnız seçilebilir seçenek.
  await page.locator(".select2-results__option--selectable", { hasText: text }).first().click();
}

async function openNewTransfer(page: Page, query = "") {
  await page.goto(`${PAGE}${query}`);
  const root = page.locator(".zto-finans.zto-page-transfer-center");
  await expect(root.getByText("Yeni Transfer", { exact: true }).first()).toBeVisible();
  return root;
}

async function closeResult(page: Page, text: string) {
  const result = page.locator("#transferResultModal");
  // Yük altında (paralel IT koşusu) kayıt 10 sn'yi aşabildi (son kapı: 18 sn).
  await expect(result.getByText(text)).toBeVisible({ timeout: 30_000 });
  const code = (await result.locator("#transferResultCode").textContent())?.trim() ?? "";
  await result.getByRole("button", { name: "Tamam" }).click();
  await expect(result).toBeHidden();
  return code;
}

async function transfersRow(root: Locator, code: string) {
  await expect(root.locator("#transfers-tab")).toHaveAttribute("aria-selected", "true");
  const row = root.locator("#transfersTable tbody tr", { hasText: code });
  await expect(row).toBeVisible();
  return row;
}

test("Virman (budama) → kayıt, EFT Al derin bağlantısı, Bankadan Kasaya, düzenle ve sil", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchA = unique("E2E TM A ");
  const branchB = unique("E2E TM B ");
  const a = await owner.branch(branchA);
  const b = await owner.branch(branchB);
  const bank = unique("TMBank");
  const source = await fund(owner, {
    branchId: a,
    name: `${bank} Ana`,
    bankName: bank,
    balance: "5000",
  });
  await fund(owner, { branchId: a, name: `${bank} Yan`, bankName: bank });
  await fund(owner, { branchId: a, name: unique("Başka Banka "), balance: "10" });
  const eftTarget = await fund(owner, { branchId: b, name: unique("EFT Hedef ") });
  await fund(owner, { branchId: a, name: unique("TM Kasa "), kind: "CASH" });
  await login(page, state);

  // Virman: yalnız aynı banka seçilebilir; ipucu bsjs:688-693 sırasıyla.
  let root = await openNewTransfer(page);
  await expect(root.locator("#transferTypeInfoAlert")).toContainText(
    "Virman / EFT / Havale tiplerinden birini seçin",
  );
  await root.locator("#virmanTransferType").selectOption("VIREMENT");
  await pickSelect2(page, "newSourceWorkPlace", branchA);
  await pickSelect2(page, "newSourceBank", `${bank} - (₺)`);
  await expect(root.locator("#targetBankWarning")).toContainText(
    "Virman için farklı bankalar pasif.",
  );
  await expect(root.locator("#targetBankWarning")).toContainText("Aynı hesap pasif.");
  await pickSelect2(page, "newTargetBank", `${bank} - (₺)`);
  await root.locator("#newSourceAmount").fill("100");
  await expect(root.locator("#calcSourceAmount")).toHaveText("100,00 ₺");
  await root.locator("#btnSaveTransfer").click();
  const virmanCode = await closeResult(page, "Virman başarıyla oluşturuldu.");
  const virmanRow = await transfersRow(root, virmanCode);
  await expect(virmanRow.locator(".transfer-badge.virman")).toHaveText("Virman");

  // "EFT Al" (banka kartı ⋮ bağlantısı): hedef iş yeri önce, sonra hedef banka ön seçili.
  root = await openNewTransfer(
    page,
    `?transferType=eft&targetFundId=${eftTarget}&targetBranchId=${b}&sourceFundId=${source}`,
  );
  await expect(root.locator("#virmanTransferType")).toHaveValue("EFT");
  await expect(root.locator("#newTargetWorkPlace")).toHaveValue(b);
  await expect(root.locator("#newTargetBank")).toHaveValue(eftTarget);
  await expect(root.locator("#newSourceBank")).toHaveValue(source);
  await expect(root.locator("#sourceAmountLabel")).toContainText("EFT Tutarı");
  await root.locator("#newSourceAmount").fill("50");
  await root.locator("#btnSaveTransfer").click();
  const eftCode = await closeResult(page, "EFT başarıyla oluşturuldu.");
  await transfersRow(root, eftCode);

  // Bankadan Kasaya.
  root = await openNewTransfer(page);
  await root.getByRole("button", { name: /Banka & Kasa Transferi/ }).click();
  await expect(root.locator("#bankCashTransferSection")).toBeVisible();
  await pickSelect2(page, "bankCashSourceWorkPlace", branchA);
  await pickSelect2(page, "bankCashTargetWorkPlace", branchA);
  await pickSelect2(page, "bankCashSourceBank", `${bank} - (₺)`);
  await expect(root.locator("#bankCashTargetWarning")).toHaveText(
    /Sadece aynı para birimine sahip hedef hesaplar seçilebilir\./,
  );
  await pickSelect2(page, "bankCashTargetCash", "TM Kasa");
  await root.locator("#newSourceAmount").fill("25");
  await root.locator("#btnSaveTransfer").click();
  const cashCode = await closeResult(page, "Bankadan Kasaya transfer başarıyla oluşturuldu.");
  await transfersRow(root, cashCode);

  // Düzenle (replace): eski transfer "İptal" rozeti, yeni kod listede.
  const editRow = await transfersRow(root, virmanCode);
  await editRow.getByRole("button", { name: /^Düzenle/ }).click();
  const editModal = page.locator(".transfer-edit-modal");
  await expect(editModal.getByText("Virman Düzenle")).toBeVisible();
  await expect(editModal.getByText(/eski transferi iptal eder/)).toBeVisible();
  await editModal.locator("#editSourceAmount").fill("120");
  await editModal.getByRole("button", { name: /Kaydet/ }).click();
  await expect(editModal).toBeHidden();
  await expect(root.locator("#transfersTable tbody tr", { hasText: virmanCode })).toContainText(
    "İptal",
  );

  // Sil (ters kayıt): BS-10, ilk odak İptal; ekstrede ters kayıt satırı.
  const deleteRow = await transfersRow(root, eftCode);
  await deleteRow.getByRole("button", { name: /^Sil/ }).click();
  const deleteModal = page.locator("#deleteTransferModal");
  await expect(deleteModal.locator("#deleteTransferInfo")).toHaveText(`${eftCode} | EFT`);
  await expect(deleteModal.getByRole("button", { name: "İptal" })).toBeFocused();
  await deleteModal.locator("#deleteTransferReason").fill("E2E ters kayıt");
  await deleteModal.locator("#btnConfirmDelete").click();
  await expect(deleteModal).toBeHidden();
  await expect(root.locator("#transfersTable tbody tr", { hasText: eftCode })).toContainText(
    "İptal",
  );
  await root.locator("#statement-tab").click();
  await expect(
    root.locator("#bankStatementTable tbody tr", { hasText: `İptal: ${eftCode}` }).first(),
  ).toBeVisible();
});

test("Döviz bozumu: tahsilat seçimi → kur → KMV; Transferler'de kod ve maliyet; BS-12 eksiye izinli", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchName = unique("E2E FX ");
  const branchId = await owner.branch(branchName);
  const usd = await fund(owner, { branchId, name: unique("FX USD "), currency: "USD" });
  await fund(owner, { branchId, name: unique("FX TL "), balance: "100" });
  await fund(owner, {
    branchId,
    name: unique("Eksi TL "),
    allowNegative: true,
    balance: "10",
  });
  const customer = await owner.account("CUSTOMER", unique("FX Müşteri "));
  await owner.request("POST", "/finance/collections", {
    method: "BANK",
    accountId: customer,
    branchId,
    fundAccountId: usd,
    money: { amount: "100.00", currency: "USD" },
    date: localToday(),
    exchangeRate: 34,
  });
  await login(page, state);

  const root = await openNewTransfer(page);
  await root.getByRole("button", { name: /Döviz Bozum \/ Döviz Alım/ }).click();
  await expect(root.locator("#transferTypeInfoAlert")).toContainText(
    "Kur fiyatına göre hesaplanır.",
  );
  await pickSelect2(page, "newSourceWorkPlace", branchName);
  await pickSelect2(page, "newSourceBank", "FX USD");
  await expect(root.locator("#targetBankWarning")).toContainText("Önce hedef iş yeri seçiniz.");
  await pickSelect2(page, "newTargetWorkPlace", branchName);
  await pickSelect2(page, "newTargetBank", "FX TL");
  await root.locator("#exchangeCustomerAccount").selectOption({ index: 1 });
  await pickSelect2(page, "exchangeCollection", "100,00 $");
  await expect(root.locator("#detailRemainingAmount")).toHaveText("100,00 $");
  await expect(root.locator("#newSourceAmount")).toHaveValue("100.00");
  await root.locator("#rateCalcSymbolBtn").click();
  await root.locator("#newRate1").fill("34");
  await expect(root.locator("#newTargetAmount")).toHaveValue("3.400,00");
  await root.locator("#newKmvRate").fill("0.2");
  await expect(root.locator("#calcKmv")).toHaveText("6,80 ₺");
  await root.locator("#btnSaveTransfer").click();
  const fxCode = await closeResult(page, "Döviz bozum başarıyla oluşturuldu.");
  const row = await transfersRow(root, fxCode);
  await expect(row.locator(".transfer-badge.doviz")).toBeVisible();
  await expect(row).toContainText("6,80 ₺");
  await expect(row.locator(".badge-success")).toHaveText("Tamamlandı");

  // BS-12: eksiye izinli kaynakta "Bakiye Bilgilendirmesi"; Vazgeç ilk odak, kayıt yok.
  await root.locator("#newTransfer-tab").click();
  await root.getByRole("button", { name: /Banka & Kasa Transferi/ }).click();
  await root.getByRole("button", { name: /Virman \/ EFT \/ Havale Bankadan/ }).click();
  await root.locator("#virmanTransferType").selectOption("EFT");
  await pickSelect2(page, "newSourceWorkPlace", branchName);
  await pickSelect2(page, "newSourceBank", "Eksi TL");
  await pickSelect2(page, "newTargetWorkPlace", branchName);
  await pickSelect2(page, "newTargetBank", "FX TL");
  await root.locator("#newSourceAmount").fill("50");
  await root.locator("#btnSaveTransfer").click();
  const negative = page.locator("#negativeBalanceConfirmModal");
  await expect(negative.getByText("Bakiye Bilgilendirmesi")).toBeVisible();
  await expect(negative.locator("#negativeBalanceAfter")).toHaveText("-40,00 ₺");
  await expect(negative.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await negative.getByRole("button", { name: "Vazgeç" }).click();
  await expect(negative).toBeHidden();
});

/** Kendi kiracısı (multi-company.spec.ts ile aynı yol): SaaS yönetici API'siyle açılır. */
async function provisionTenant(): Promise<TenantState> {
  const { accessToken } = await api<{ accessToken: string }>("POST", "/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const code = `tc${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `owner@${code}.test`;
  const tenant = await api<{ id: string }>("POST", "/admin/tenants", {
    token: accessToken,
    body: {
      code,
      name: `${code} Lojistik`,
      defaultCurrency: "TRY",
      timeZone: "Europe/Istanbul",
      ownerEmail: email,
      ownerFullName: "Transfer Merkezi Sahibi",
    },
  });
  const plan = await api<{ id: string }>("POST", "/admin/plans", {
    token: accessToken,
    body: {
      code: code.toUpperCase().slice(0, 32),
      name: "E2E transfer merkezi",
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

test("şirketler arası EFT: neden seçimi zorunlu, grup şirketi carisine kayıt", async ({ page }) => {
  test.setTimeout(180_000);
  const state = await provisionTenant();
  const owner = await Owner.login(state);
  const company = await owner.request<{ id: string }>("POST", "/organization/companies", {
    code: "BETA",
    title: "Beta Nakliyat Ltd. Şti.",
    shortName: "Beta Nakliyat",
    taxIdType: "VKN",
    taxNumber: null,
  });
  const branchAName = unique("A İY ");
  const branchBName = unique("B İY ");
  const branchA = (
    await owner.request<{ id: string }>("POST", "/organization/branches", { name: branchAName })
  ).id;
  const branchB = (
    await owner.request<{ id: string }>("POST", "/organization/branches", {
      name: branchBName,
      companyId: company.id,
    })
  ).id;
  await fund(owner, { branchId: branchA, name: "A Bankası", balance: "1000" });
  await fund(owner, { branchId: branchB, name: "B Bankası" });
  await login(page, state);

  const root = await openNewTransfer(page);
  await root.locator("#virmanTransferType").selectOption("EFT");
  await pickSelect2(page, "newSourceWorkPlace", branchAName);
  await pickSelect2(page, "newSourceBank", "A Bankası");
  await pickSelect2(page, "newTargetWorkPlace", branchBName);
  await pickSelect2(page, "newTargetBank", "B Bankası");
  await expect(root.locator("#transferTypeInfoAlert")).toContainText(
    "Grup şirketi carilerine otomatik kayıt oluşur.",
  );
  await root.locator("#newSourceAmount").fill("200");
  await root.locator("#btnSaveTransfer").click();
  await expect(root.getByRole("alert")).toContainText("Transfer nedeni seçiniz.");
  await root.locator("#transferReasonType").selectOption("DEBT_PAID");
  await root.locator("#btnSaveTransfer").click();
  const code = await closeResult(page, "Şirketler arası transfer başarıyla oluşturuldu.");
  const row = await transfersRow(root, code);
  await expect(row.locator(".transfer-badge.intercompany")).toContainText("Şirketler Arası");
  await expect(row.getByRole("button", { name: /^Düzenle/ })).toHaveCount(0);

  // Grup şirketi carilerinde iki settlement oluştu (A'da GS-B'ye ödeme, B'de GS-A'dan tahsilat).
  const payments = await owner.request<{ content: Array<{ description: string | null }> }>(
    "GET",
    "/finance/payments?size=50",
  );
  expect(payments.content.some((p) => (p.description ?? "").includes("BORCUNU ÖDÜYOR"))).toBe(true);
});

test("Transfer Merkezi ve modallarının CSS'i MUI ekranlarına sızmaz (§6.5)", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, tenantState());
  await assertNoZtoCssLeak(page, async (p) => {
    await openModule(p, "ZTO Finans", /\/zto-finans\/cari-hareketler$/);
    await openZtoSidebarLink(
      p,
      "Banka & Kasa Transferi & Virman & Döviz Bozum",
      /\/zto-finans\/transfer-merkezi$/,
    );
    const root = p.locator(".zto-finans.zto-page-transfer-center");
    await expect(root.getByText("Yeni Transfer", { exact: true }).first()).toBeVisible();
    // Döviz bozumu kartı (kur/KMV paneli) ve Döviz Bozum Raporu modalı: :has(.show) ve modal CSS'i.
    await root.getByRole("button", { name: /Döviz Bozum \/ Döviz Alım/ }).click();
    await expect(root.locator("#transferTypeInfoAlert")).toContainText("Kur fiyatına göre");
    await root.locator("#btnExchangeBreakReport").click();
    const report = p.locator("#exchangeBreakReportModal");
    await expect(report).toBeVisible();
    await p.keyboard.press("Escape");
    await expect(report).toBeHidden();
  });
});
