import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import {
  assertNoZtoCssLeak,
  expect,
  login,
  openModule,
  openZtoSidebarLink,
  tenantState,
  test,
} from "./support";

/**
 * ZTO Finans 12.2a — Ödemeler / Tahsilatlar / Günlük rapor (12.2a_TASARIM §6.5 FE-1): Ödemeler
 * sayfası bugün−7…bugün süzgeciyle açılır, süz/temizle; Detay modalı; Sil (İptal Tarihi + Gerekçe)
 * → satır listeden kalkar; Günlük Ödeme Raporu modalı → yeni sekmede rapor (çoklu iş yeri korunur,
 * Grupla/Gruplamayı Kaldır, Yazdır); Tahsilatlar Döviz Bozum hücresi; `?settlementId=` detay
 * açılışı; MUI finans ekranlarına ZTO CSS'i sızmaz.
 */

function localDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Setup = {
  owner: Owner;
  branchA: string;
  branchAName: string;
  branchBName: string;
  supplierName: string;
  paymentId: string;
  bankPaymentId: string;
};

/** İki iş yeri, kasa + banka, tedarikçi; bugünkü nakit ve banka ödemesi (API). */
async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branchAName = unique("E2E ÖD A ");
  const branchBName = unique("E2E ÖD B ");
  const branchA = await owner.branch(branchAName);
  const branchB = await owner.branch(branchBName);
  const cash = (
    await owner.request<{ id: string }>("POST", "/finance/funds", {
      code: unique("K"),
      name: unique("E2E Kasa "),
      kind: "CASH",
      currency: "TRY",
      branchId: branchA,
      allowNegative: false,
    })
  ).id;
  await owner.request("POST", `/finance/funds/${cash}/transactions`, {
    direction: "IN",
    money: { amount: "5000", currency: "TRY" },
    date: localDate(),
    description: "Açılış",
  });
  const bank = await owner.bank(branchB, unique("E2E Banka "), "5000");
  const supplierName = unique("E2E Ödeme Tedarikçi ");
  const supplierId = await owner.account("SUPPLIER", supplierName);
  await owner.request("POST", `/finance/accounts/${supplierId}/transactions`, {
    branchId: branchA,
    direction: "CREDIT",
    money: { amount: "2000", currency: "TRY" },
    date: localDate(),
    description: "Hizmet",
  });
  const pay = (body: Record<string, unknown>) =>
    owner.request<{ id: string }>("POST", "/finance/payments", {
      accountId: supplierId,
      date: localDate(),
      confirmWarnings: true,
      ...body,
    });
  const paymentId = (
    await pay({
      method: "CASH",
      branchId: branchA,
      fundAccountId: cash,
      money: { amount: "150", currency: "TRY" },
      documentNo: unique("OD-"),
      description: "E2E nakit ödeme",
    })
  ).id;
  const bankPaymentId = (
    await pay({
      method: "BANK",
      channel: "TRANSFER",
      branchId: branchB,
      fundAccountId: bank,
      money: { amount: "75", currency: "TRY" },
      description: "E2E banka ödemesi",
    })
  ).id;
  return { owner, branchA, branchAName, branchBName, supplierName, paymentId, bankPaymentId };
}

/** ZtoSearchableSelect: tetikleyiciyi açar, arar ve seçeneği seçer. */
async function pickSearchable(page: Page, id: string, text: string) {
  await page.locator(`#${id}`).click();
  await page
    .getByRole("option", { name: new RegExp(text) })
    .first()
    .click();
}

test("Ödemeler: −7 gün süzgeci, süz/temizle, detay, sil (iptal tarihi + gerekçe)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const s = await setup();
  await login(page, s.owner.state);

  await page.goto("/zto-finans/odemeler");
  const root = page.locator(".zto-finans.zto-page-payments");
  await expect(root.getByRole("heading", { name: "Ödeme Yönetimi" })).toBeVisible();
  await expect(root.locator("#filterDateStart")).toHaveValue(localDate(-7));
  await expect(root.locator("#filterDateEnd")).toHaveValue(localDate());
  // İki çip tek sarmalayıcıda; ZTO kart gövdesi p-2.
  await expect(root.locator(".d-none.d-lg-flex > .erp-info-chip")).toHaveCount(2);
  await expect(root.locator(".card-body.p-2 .erp-filter-card")).toBeVisible();

  const rows = root.locator("#paymentsTable tbody tr");
  await pickSearchable(page, "filterAccount", s.supplierName);
  await root.getByRole("button", { name: "Filtrele" }).click();
  await expect(rows).toHaveCount(2);
  await root.locator("#filterMethod").selectOption("CASH");
  await root.locator("#filterMethod").press("Enter");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("E2E nakit ödeme");
  await expect(rows.first().locator(".badge", { hasText: "Nakit" })).toHaveClass(/badge-success/);
  await expect(rows.first().locator(".payment-amount-cell")).toHaveText("150,00 ₺");

  // Detay modalı.
  await rows.first().getByRole("button", { name: "Detay" }).click();
  const detail = page.locator(".modal", { hasText: "Ödeme Detayı" });
  await expect(detail.getByText("Temel Bilgiler")).toBeVisible();
  await expect(detail.getByText("Tamamlandı")).toBeVisible();
  await detail.locator(".modal-footer").getByRole("button", { name: "Kapat" }).click();
  await expect(detail).toBeHidden();

  // Sil: ZTO kökü #confirmDeleteModal; ilk odak "İptal"; İptal Tarihi + Gerekçe.
  await rows.first().getByRole("button", { name: "Sil" }).click();
  const confirm = page.locator("#confirmDeleteModal");
  await expect(confirm.getByText("Ödeme Silme Onayı")).toBeVisible();
  await expect(confirm.getByText(/150,00 ₺ tutarındaki ödemeyi silmek/)).toBeVisible();
  await expect(confirm.getByRole("button", { name: "İptal" })).toBeFocused();
  await expect(confirm.locator("#reverseSettlementDate")).toHaveValue(localDate());
  await confirm.locator("#reverseSettlementReason").fill("E2E mükerrer kayıt");
  await confirm.getByRole("button", { name: /Onayla ve Sil/ }).click();
  await expect(page.getByText("Ödeme başarıyla silindi.")).toBeVisible();
  await expect(rows.first()).toContainText("Kayıt bulunamadı");
  const reversed = await s.owner.request<{ item: { status: string; reverseReason: string } }>(
    "GET",
    `/finance/settlements/${s.paymentId}`,
  );
  expect(reversed.item).toMatchObject({ status: "REVERSED", reverseReason: "E2E mükerrer kayıt" });

  // Temizle: ilk açılış varsayılanına döner (yöntem boş, tarih −7 gün).
  await root.getByRole("button", { name: "Temizle" }).click();
  await expect(root.locator("#filterMethod")).toHaveValue("");
  await expect(root.locator("#filterDateStart")).toHaveValue(localDate(-7));
});

test("Günlük Ödeme Raporu: modal → yeni sekme, çoklu iş yeri, Grupla/Gruplamayı Kaldır, Yazdır", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const s = await setup();
  await login(page, s.owner.state);

  await page.goto("/zto-finans/odemeler");
  const root = page.locator(".zto-finans.zto-page-payments");
  await root.getByRole("button", { name: "Günlük Ödeme Raporu" }).click();
  const modal = page.locator("#dailyPaymentReportModal");
  await expect(modal.getByText("Seçtiğiniz güne ait ödemeler")).toBeVisible();
  await modal.locator(".dpr-wp-search input").fill("E2E ÖD");
  await modal.getByRole("checkbox", { name: s.branchAName }).check();
  await modal.getByRole("checkbox", { name: s.branchBName }).check();
  const [report] = await Promise.all([
    context.waitForEvent("page"),
    modal.getByRole("button", { name: /Günlük Ödeme Raporu Al/ }).click(),
  ]);
  await expect(report).toHaveURL(
    /\/zto-finans\/odemeler\/gunluk-rapor\?reportDate=.*workPlaceIds=/,
  );
  const page2 = report.locator(".zto-finans.zto-page-daily-settlement-report");
  await expect(page2.locator(".report-page-title")).toContainText("Günlük Ödeme Raporu");
  await expect(page2.locator(".workplace-block")).toHaveCount(2);
  await expect(page2.locator(".workplace-block", { hasText: s.branchAName })).toBeVisible();
  // Çoklu seçim "Filtrele"den sonra da korunur (ZTO hatası (f)).
  await page2.getByRole("button", { name: "Filtrele" }).click();
  await expect(page2.locator(".workplace-block")).toHaveCount(2);

  await page2.getByRole("button", { name: "Gruplamayı Kaldır" }).click();
  await expect(page2.locator("#flatView tr.report-row-flat")).toHaveCount(2);
  // Baskı düz görünümde de gruplu görünümü basar (ZTO baskı CSS'i; zto-onyuz:F2).
  await report.emulateMedia({ media: "print" });
  await expect(page2.locator("#groupedView tr.report-row").first()).toBeVisible();
  await expect(page2.locator("#flatView")).toBeHidden();
  await report.emulateMedia({ media: "screen" });
  await expect(page2.locator("#groupedView")).toBeHidden();
  await page2.getByRole("button", { name: "Grupla", exact: true }).click();
  await expect(page2.locator("#groupedView")).toBeVisible();
  await page2.getByRole("button", { name: "Tümünü Kapat" }).click();
  await expect(page2.locator("#groupedView .collapse.show")).toHaveCount(0);
  await page2.getByRole("button", { name: "Tümünü Aç" }).click();
  await expect(page2.locator("#groupedView tr.report-row").first()).toBeVisible();
  await expect(page2.getByRole("button", { name: "Yazdır" })).toBeVisible();
  await expect(page2.locator(".totals-footer-card").first()).toContainText("Genel Toplam");
  await report.close();
});

test("Tahsilatlar: Döviz Bozum hücresi ve ?settlementId= detay açılışı", async ({ page }) => {
  test.setTimeout(150_000);
  const owner = await Owner.login(tenantState());
  const branchName = unique("E2E TH ");
  const branch = await owner.branch(branchName);
  const eurBank = (
    await owner.request<{ id: string }>("POST", "/finance/funds", {
      code: unique("E"),
      name: unique("E2E EUR Banka "),
      kind: "BANK",
      currency: "EUR",
      branchId: branch,
      allowNegative: false,
    })
  ).id;
  const customer = await owner.account("CUSTOMER", unique("E2E Döviz Müşteri "));
  const collection = await owner.request<{ id: string }>("POST", "/finance/collections", {
    method: "BANK",
    channel: "TRANSFER",
    accountId: customer,
    branchId: branch,
    fundAccountId: eurBank,
    money: { amount: "100", currency: "EUR" },
    exchangeRate: 35,
    date: localDate(),
    confirmWarnings: true,
  });
  await login(page, owner.state);

  await page.goto(`/zto-finans/tahsilatlar?settlementId=${collection.id}`);
  const detail = page.locator(".modal", { hasText: "Tahsilat Detayı" });
  await expect(detail.getByText("Tahsilat Bilgileri")).toBeVisible();
  await expect(page).toHaveURL(/\/zto-finans\/tahsilatlar$/);
  await detail.locator(".modal-footer").getByRole("button", { name: "Kapat" }).click();

  const root = page.locator(".zto-finans.zto-page-collections");
  const row = root.locator("#collectionsTable tbody tr", { hasText: "100,00 €" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Kur: 35,0000");
  await expect(row.locator(".badge", { hasText: "Bekliyor" })).toHaveClass(/badge-warning/);
  await expect(row).toContainText("%0 • 100,00 €");
  await expect(row.getByRole("progressbar", { name: "Döviz bozum oranı" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  const boz = row.getByRole("link", { name: /Boz/ });
  await expect(boz).toHaveAttribute("href", /transferType=exchange/);
  await expect(boz).toHaveAttribute("target", "_blank");
});

test("ZTO Ödemeler/Tahsilatlar açılınca MUI finans ekranlarına CSS sızmaz", async ({ page }) => {
  test.setTimeout(150_000);
  await login(page, tenantState());
  await assertNoZtoCssLeak(page, async (p) => {
    await openModule(p, "ZTO Finans", /\/zto-finans\/cari-hareketler$/);
    await openZtoSidebarLink(p, "Ödemeler", /\/zto-finans\/odemeler$/);
    await expect(
      p.locator(".zto-finans.zto-page-payments").getByRole("heading", { name: "Ödeme Yönetimi" }),
    ).toBeVisible();
    await openZtoSidebarLink(p, "Tahsilatlar", /\/zto-finans\/tahsilatlar$/);
    await expect(
      p
        .locator(".zto-finans.zto-page-collections")
        .getByRole("heading", { name: "Tahsilat Yönetimi" }),
    ).toBeVisible();
  });
});
