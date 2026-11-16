import type { Locator, Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.2a — Ödeme / Tahsilat modalları (12.2a_TASARIM §6.5 FE-2): Yeni Ödeme (nakit) borcu
 * aşınca kırmızı uyarı → "Uyarı" → Vazgeç → Tamam → kayıt; kalan borçlu ödemede "Ödeme Başarılı!" plan
 * modalı → "Evet, Planla" → satır → Kaydet; Kredi Kartı ödemesi (BANK + CREDIT_CARD); Ödeme Düzenle
 * (düzeltme: eski kayıt ters, listede tek POSTED kayıt); Yeni Tahsilat (çek, Bankaya Yatırıldı →
 * AT_BANK); fatura eşleştirme ("Faturaları Yükle" → seç → uyarılar → kaydet). Ön veriler API ile.
 */

const PAYMENTS = "/zto-finans/odemeler";
const COLLECTIONS = "/zto-finans/tahsilatlar";

function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Fixture = {
  owner: Owner;
  branchId: string;
  branchName: string;
  cashName: string;
  bankName: string;
};

async function fixture(): Promise<Fixture> {
  const owner = await Owner.login(tenantState());
  const branchName = unique("E2E Ödeme İY ");
  const branchId = await owner.branch(branchName);
  const cashName = unique("Ödeme Kasa ");
  const cash = (
    await owner.request<{ id: string }>("POST", "/finance/funds", {
      code: unique("K"),
      name: cashName,
      kind: "CASH",
      currency: "TRY",
      branchId,
      allowNegative: false,
    })
  ).id;
  await owner.request("POST", `/finance/funds/${cash}/transactions`, {
    direction: "IN",
    money: { amount: "5000", currency: "TRY" },
    date: localToday(),
    description: "Açılış",
  });
  const bankName = unique("Ödeme Banka ");
  await owner.bank(branchId, bankName, "5000");
  return { owner, branchId, branchName, cashName, bankName };
}

/** Carinin alacağı (bizim borcumuz). */
async function supplierWithDebt(f: Fixture, amount: string) {
  const name = unique("E2E Tedarikçi ");
  const id = await f.owner.account("SUPPLIER", name);
  await f.owner.request("POST", `/finance/accounts/${id}/transactions`, {
    branchId: f.branchId,
    direction: "CREDIT",
    money: { amount, currency: "TRY" },
    date: localToday(),
    description: "Faturasız hizmet",
  });
  return { id, name };
}

async function settlementsOf(owner: Owner, type: "payments" | "collections", accountId: string) {
  const page = await owner.request<{
    content: {
      id: string;
      accountId: string;
      status: string;
      channel: string | null;
      method: string;
    }[];
  }>("GET", `/finance/${type}?accountId=${accountId}&size=100`);
  return page.content;
}

/** ZtoSearchableSelect: tetikleyiciyi açar, arar ve seçeneği seçer. */
async function pick(root: Locator, triggerId: string, text: string) {
  await root.locator(`#${triggerId}`).click();
  const dropdown = root.locator(".ss-dropdown.ss-open");
  await dropdown.locator(".ss-search-input").fill(text);
  await dropdown
    .getByRole("option", { name: new RegExp(text) })
    .first()
    .click();
  await expect(dropdown).toHaveCount(0);
}

async function openNewPayment(page: Page) {
  await page.goto(PAYMENTS);
  const pageRoot = page.locator(".zto-finans.zto-page-payments");
  await pageRoot.getByRole("button", { name: /Yeni Ödeme/ }).click();
  const modal = page.locator(".modal#addPaymentModal.erp-modal");
  await expect(modal.getByText("Yeni Ödeme Ekle")).toBeVisible();
  return modal;
}

async function fillPayment(
  modal: Locator,
  f: Fixture,
  accountName: string,
  method: "CASH" | "CREDIT_CARD",
  amount: string,
) {
  await pick(modal, "CustomerAccountID", accountName);
  await modal.locator("#WorkPlaceID").selectOption({ label: f.branchName });
  await modal.locator("#PaymentMethod").selectOption(method);
  if (method === "CASH") await pick(modal, "CashID", f.cashName);
  else await pick(modal, "BankID", f.bankName);
  await modal.locator("#PaymentAmountInput").fill(amount);
}

test("Yeni Ödeme: borcu aşınca uyarı → Vazgeç → Tamam; Kredi Kartı; Ödeme Düzenle (düzeltme)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const f = await fixture();
  const supplier = await supplierWithDebt(f, "100");
  await login(page, tenantState());

  let modal = await openNewPayment(page);
  await fillPayment(modal, f, supplier.name, "CASH", "150");
  // 12.2 uyarısı tutarın altında (CONFIRM → small.text-danger).
  await expect(modal.locator("#paymentWarningLines small.text-danger")).toBeVisible({
    timeout: 15_000,
  });
  await expect(modal.getByLabel(/Ödeme Açıklaması/)).toBeVisible();
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  const confirm = page
    .getByRole("dialog")
    .filter({ hasText: "Yine de kaydetmek istiyor musunuz?" });
  await expect(confirm.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await confirm.getByRole("button", { name: "Vazgeç" }).click();
  await expect(modal).toBeVisible();
  expect(await settlementsOf(f.owner, "payments", supplier.id)).toHaveLength(0);
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  await page
    .getByRole("dialog")
    .filter({ hasText: "Yine de kaydetmek" })
    .getByRole("button", { name: /Tamam/ })
    .click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Ödeme başarıyla kaydedildi.")).toBeVisible();
  expect(await settlementsOf(f.owner, "payments", supplier.id)).toHaveLength(1);

  // Kredi Kartı: BANK fonu + CREDIT_CARD kanalı.
  modal = await openNewPayment(page);
  await fillPayment(modal, f, supplier.name, "CREDIT_CARD", "10");
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  const tamam = page
    .getByRole("dialog")
    .filter({ hasText: "Yine de kaydetmek" })
    .getByRole("button", { name: /Tamam/ });
  await tamam.click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  const rows = await settlementsOf(f.owner, "payments", supplier.id);
  const card = rows.find((row) => row.channel === "CREDIT_CARD");
  expect(card?.method).toBe("BANK");

  // Ödeme Düzenle (derin bağlantı): düzeltme eski kaydı ters çevirir, yenisi tek POSTED kayıt.
  const cash = rows.find((row) => row.channel !== "CREDIT_CARD") as { id: string };
  await page.goto(`${PAYMENTS}?openEditPayment=true&paymentId=${cash.id}`);
  const edit = page.locator(".modal#editPaymentModal.erp-modal");
  await expect(edit.getByText("Ödeme Düzenle")).toBeVisible();
  await expect(edit.locator("#editPaymentMethod option")).toHaveText([
    "Seçiniz",
    "Nakit",
    "Banka Havalesi/Eft",
    "Çek",
    "Senet",
    "Kredi Kartı",
  ]);
  await edit.locator("#editPaymentAmountInput").fill("90");
  await edit.getByLabel("Düzeltme gerekçesi").fill("E2E tutar düzeltmesi");
  await edit.getByRole("button", { name: /Kaydet/ }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Ödeme başarıyla güncellendi.")).toBeVisible();
  const after = await settlementsOf(f.owner, "payments", supplier.id);
  const posted = after.filter((row) => row.status === "POSTED" && row.channel !== "CREDIT_CARD");
  expect(posted).toHaveLength(1);
  expect(after.find((row) => row.id === cash.id)?.status).toBe("REVERSED");
});

test("kalan borçlu ödeme → 'Ödeme Başarılı!' → Evet, Planla → satır → Kaydet", async ({ page }) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const supplier = await supplierWithDebt(f, "500");
  await login(page, tenantState());
  const modal = await openNewPayment(page);
  await fillPayment(modal, f, supplier.name, "CASH", "200");
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  const plan = page.locator(".modal#postPaymentPlanningModal");
  await expect(plan.getByText("Ödeme Başarılı!")).toBeVisible({ timeout: 15_000 });
  await expect(plan.locator("#ppRemainingDebtRows")).toContainText("300,00");
  await expect(plan.getByRole("button", { name: /Evet, Planla/ })).toBeFocused();
  await plan.getByRole("button", { name: /Evet, Planla/ }).click();
  const row = plan.locator("#ppPaymentPlantbody tr").first();
  await row.locator(".pp-plan-amount").fill("300");
  // Gruba bağlı olmayan iş yeri "Diğer" grubundadır (branchTree OTHER_GROUP_NAME).
  const group = row.locator(".pp-plan-branch");
  const groups = await group.locator("option").allTextContents();
  for (const label of groups.slice(1)) {
    await group.selectOption({ label });
    if ((await row.locator(".pp-plan-workplace option", { hasText: f.branchName }).count()) > 0)
      break;
  }
  await row.locator(".pp-plan-workplace").selectOption({ label: f.branchName });
  await expect(row.locator(".pp-plan-bank")).toBeDisabled();
  await plan.locator("#ppSaveBtn").click();
  await expect(plan).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Ödeme planlaması başarıyla kaydedildi.")).toBeVisible();
  const plans = await f.owner.request<{ content: { status: string }[] }>(
    "GET",
    `/finance/payment-plans?accountId=${supplier.id}&statuses=DRAFT`,
  );
  expect(plans.content.length).toBeGreaterThan(0);
});

test("Yeni Tahsilat: çek Bankaya Yatırıldı → AT_BANK", async ({ page }) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const customerName = unique("E2E Müşteri ");
  const customerId = await f.owner.account("CUSTOMER", customerName);
  await login(page, tenantState());
  await page.goto(COLLECTIONS);
  await page
    .locator(".zto-finans.zto-page-collections")
    .getByRole("button", { name: /Yeni Tahsilat/ })
    .click();
  const modal = page.locator(".modal#addCollectionModal.erp-modal");
  await expect(modal.getByText("Yeni Tahsilat Ekle")).toBeVisible();
  await pick(modal, "CustomerAccountID", customerName);
  await modal.locator("#CollectionMethod").selectOption("CHECK");
  await modal.locator("#WorkPlaceID").selectOption({ label: f.branchName });
  await expect(modal.getByRole("radio", { name: /Bankaya Yatırıldı/ })).toBeChecked();
  // 12.3: keşide tarihi açık ve bugünle dolu.
  await expect(modal.locator("#IssueDate")).toBeEnabled();
  await pick(modal, "CheckBankID", f.bankName);
  await modal.locator("#CheckNumber").fill("1234567");
  await modal.locator("#BankName").fill("Ziraat Bankası");
  await modal.locator("#CollectionAmountInput").fill("750");
  await expect(modal.locator("#Amount")).toHaveValue("750.00");
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Tahsilat başarıyla kaydedildi.")).toBeVisible();
  const rows = await settlementsOf(f.owner, "collections", customerId);
  expect(rows[0]?.method).toBe("CHECK");
  const checks = await f.owner.request<{ content: { status: string; number: string }[] }>(
    "GET",
    "/finance/instruments?direction=RECEIVED&kind=CHECK&size=200",
  );
  expect(checks.content.find((check) => check.number === "1234567")?.status).toBe("AT_BANK");
});

test("fatura eşleştirme: Faturaları Yükle → seç → uyarılar → kaydet", async ({ page }) => {
  test.setTimeout(150_000);
  const f = await fixture();
  const name = unique("E2E Faturalı ");
  const supplierId = await f.owner.account("SUPPLIER", name);
  for (const documentNo of [unique("FTR-A"), unique("FTR-B")]) {
    await f.owner.request("POST", `/finance/accounts/${supplierId}/documents`, {
      side: "PAYABLE",
      documentType: "ALIS_FATURASI",
      documentNo,
      documentDate: localToday(),
      amount: 300,
      currency: "TRY",
      paymentMethod: "BANK",
      branchId: f.branchId,
      reflectToLedger: true,
      tax: { discountRate: 0, vatRate: 0, withholdingAmount: 0, otherTaxesAmount: 0 },
    });
  }
  await login(page, tenantState());
  const modal = await openNewPayment(page);
  await fillPayment(modal, f, name, "CASH", "100");
  await modal.getByRole("button", { name: /Faturaları Yükle/ }).click();
  const checks = modal.locator("#invoicesTableBody input[type=checkbox]");
  await expect(checks).toHaveCount(2, { timeout: 15_000 });
  await expect(modal.locator("#orderCreditInfo")).toContainText("Kalan Fatura Borçları:");
  await checks.nth(0).check();
  await expect(modal.locator("#invoicesTableBody .order-amount-input").nth(0)).toHaveValue(
    "100.00",
  );
  await checks.nth(1).check();
  await expect(modal.getByText("Bu fatura için tahsis edilebilecek tutar kalmadı.")).toBeVisible();
  const amounts = modal.locator("#invoicesTableBody .order-amount-input");
  await amounts.nth(0).fill("50");
  await amounts.nth(0).blur();
  await amounts.nth(1).fill("80");
  await amounts.nth(1).blur();
  await expect(modal.getByText("Toplam tahsis tutarı aşıldı!")).toBeVisible();
  await expect(amounts.nth(1)).toHaveValue("50.00");
  await expect(modal.locator("#totalAllocatedAmount")).toHaveText("100,00");
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  const rows = await settlementsOf(f.owner, "payments", supplierId);
  const detail = await f.owner.request<{ allocations: { money: { amount: string } }[] }>(
    "GET",
    `/finance/settlements/${rows[0].id}`,
  );
  expect(detail.allocations).toHaveLength(2);
});
