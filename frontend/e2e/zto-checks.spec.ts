import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { assertNoZtoCssLeak, expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.3 — Çekler (12.3_TASARIM §6.5 FE-1). Akış 1: koçan (10 yaprak) → koçandan yapraklı
 * kendi çekimizle ödeme (API; "Bankadan Cari Çek Ödemesi" modal akışı FE-3 spec'inde) → Çekler'de
 * satır "Kullanıldı" → "Çek Ödendi İşaretle" (banka seçili) → "Çek Ödendi" rozeti → Düzenle ekranı
 * açılır. Akış 2: müşteri tahsilatı (portföy + kasa) → "Bankaya Yatır" → "Portföye Geri Al" (kasa
 * zorunlu iletisi, sonra kasa seçip onay). Ek: Detaylı Rapor yeni sekme; MUI'ye ZTO CSS'i sızmaz.
 */

function localDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Setup = {
  ownNo: string;
  receivedNo: string;
  bankName: string;
  cashName: string;
};

/** Dört basamaklı benzersiz yaprak başlangıcı (7 haneli çek numarası). */
function leafStart() {
  return String(1_000_000 + Math.floor(Math.random() * 8_000_000)).padStart(7, "0");
}

async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch(unique("E2E CEK "));
  const bankName = unique("E2E Çek Banka ");
  const bank = await owner.bank(branch, bankName, "100000");
  const cashName = unique("E2E Çek Kasa ");
  const cash = await owner.request<{ id: string }>("POST", "/finance/funds", {
    code: unique("K"),
    name: cashName,
    kind: "CASH",
    currency: "TRY",
    branchId: branch,
    allowNegative: false,
  });
  const supplier = await owner.account("SUPPLIER", unique("E2E Çek Tedarikçi "));
  const customer = await owner.account("CUSTOMER", unique("E2E Çek Müşteri "));

  const start = leafStart();
  const end = String(Number(start) + 9).padStart(7, "0");
  const created = await owner.request<{ book: { id: string } }>("POST", "/finance/check-books", {
    fundAccountId: bank,
    serialNo: unique("SR"),
    startNumber: start,
    endNumber: end,
  });
  const leaves = await owner.request<{ content: { id: string; number: string }[] }>(
    "GET",
    `/finance/check-leaves?checkBookId=${created.book.id}&status=UNUSED&size=1000`,
  );
  const leaf = leaves.content[0];
  await owner.request("POST", "/finance/payments", {
    method: "CHECK",
    accountId: supplier,
    branchId: branch,
    money: { amount: "2500", currency: "TRY" },
    date: localDate(),
    confirmWarnings: true,
    instrument: {
      kind: "CHECK",
      number: leaf.number,
      dueDate: localDate(10),
      fundAccountId: bank,
      checkLeafId: leaf.id,
    },
  });

  const receivedNo = leafStart();
  await owner.request("POST", "/finance/collections", {
    method: "CHECK",
    accountId: customer,
    branchId: branch,
    money: { amount: "1800", currency: "TRY" },
    date: localDate(),
    confirmWarnings: true,
    instrument: {
      kind: "CHECK",
      number: receivedNo,
      bankName: "Garanti",
      dueDate: localDate(20),
      initialStatus: "PORTFOLIO",
      custodyFundId: cash.id,
    },
  });
  return { ownNo: leaf.number, receivedNo, bankName, cashName };
}

async function openChecks(page: Page) {
  await page.goto("/zto-finans/cekler");
  await expect(page.getByRole("heading", { name: "Çek Yönetimi" })).toBeVisible();
}

/**
 * Satır menüsünü açıp öğeyi seçer. `ZtoMenuButton` kaydırma/yeniden çizimde kapanır (tıklamadan önceki
 * otomatik kaydırma dahil); açma + seçim kapanırsa yeniden denenir.
 */
async function rowMenu(page: Page, number: string, item: string | RegExp) {
  const row = page.locator("#checksTable tbody tr", { hasText: number });
  await expect(row).toBeVisible();
  const button = row.getByRole("button", { name: new RegExp(`İşlemler ${number}`) });
  await row.scrollIntoViewIfNeeded();
  await expect(async () => {
    if (!(await page.getByRole("menu").isVisible())) await button.click();
    // Tıklamanın otomatik kaydırması menüyü kapatabiliyor (2 işçili yükte sık); olay kaydırmasız
    // gönderilir. Öğe görünür olmalı (menü açık) — aksi halde yeniden denenir.
    const menuItem = page.getByRole("menuitem", { name: item });
    await expect(menuItem).toBeVisible({ timeout: 2_000 });
    await menuItem.dispatchEvent("click");
  }).toPass({ timeout: 30_000 });
  return row;
}

/** Yerel `<select>`'te metni içeren seçeneği seçer. */
async function selectByText(page: Page, selector: string, text: string) {
  const option = page.locator(`${selector} option`, { hasText: text }).first();
  await page.locator(selector).selectOption((await option.getAttribute("value")) ?? "");
}

async function confirmStatus(page: Page) {
  await page.getByRole("button", { name: /Güncelle/ }).click();
  await page.getByRole("button", { name: /Onayla ve Devam Et/ }).click();
  await expect(page.getByText("Çek durumu başarıyla güncellendi.")).toBeVisible();
}

test.describe("ZTO Çekler", () => {
  // 13 sütunlu tablo yatay kayar; satır menüsü alt satırlarda görünüm dışına taşınca Playwright'ın
  // otomatik kaydırması menüyü kapatır (ZtoMenuButton kaydırmada kapanır). Daha uzun görünüm alanı.
  test.use({ viewport: { width: 1440, height: 1100 } });

  let data: Setup;

  test.beforeAll(async () => {
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, tenantState());
  });

  test("koçanlı kendi çekimiz: Kullanıldı → Çek Ödendi; Düzenle açılır", async ({ page }) => {
    test.setTimeout(120_000);
    await openChecks(page);
    const row = page.locator("#checksTable tbody tr", { hasText: data.ownNo });
    await expect(row).toContainText("Kullanıldı");
    await expect(row).toContainText("Kendi Çekimiz");
    await rowMenu(page, data.ownNo, /Çek Ödendi İşaretle/);
    const bank = page.locator("#updateBankId");
    await expect(bank).toBeVisible();
    if (!(await bank.inputValue())) {
      await selectByText(page, "#updateBankId", data.bankName);
    }
    await confirmStatus(page);
    await expect(row).toContainText("Çek Ödendi");

    await rowMenu(page, data.ownNo, /Düzenle/);
    await expect(page).toHaveURL(/\/zto-finans\/cekler\/[^/]+\/duzenle/);
  });

  test("müşteri çeki: Bankaya Yatır → Portföye Geri Al (kasa zorunlu)", async ({ page }) => {
    test.setTimeout(120_000);
    await openChecks(page);
    const row = page.locator("#checksTable tbody tr", { hasText: data.receivedNo });
    await expect(row).toContainText("Portföyde");
    await expect(row).toContainText("Ciro Edilebilir");

    await rowMenu(page, data.receivedNo, "Bankaya Yatır");
    await expect(page.locator("#updateCheckStatus")).toHaveValue("AT_BANK");
    await selectByText(page, "#updateBankId", data.bankName);
    await confirmStatus(page);
    await expect(row).toContainText("Bankada");

    await rowMenu(page, data.receivedNo, /Portföye Geri Al/);
    await page.getByRole("button", { name: /Güncelle/ }).click();
    await expect(
      page.getByText("Çek bankada. Portföye almak için kasa seçmelisiniz!"),
    ).toBeVisible();
    await selectByText(page, "#updateCashId", data.cashName);
    await page.getByRole("button", { name: /Güncelle/ }).click();
    await page.getByRole("button", { name: /Onayla ve Devam Et/ }).click();
    await expect(row).toContainText("Portföyde");
  });

  test("Detaylı Rapor yeni sekmede kendi çekimizi gruplar", async ({ page, context }) => {
    await openChecks(page);
    await page.getByRole("button", { name: /Detaylı Rapor/ }).click();
    await page.getByLabel("Vade Başlangıç Tarihi").fill(localDate(-30));
    await page.getByLabel("Vade Bitiş Tarihi").fill(localDate(60));
    const [report] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: /Raporu Görüntüle/ }).click(),
    ]);
    await expect(report.locator(".zto-finans.zto-page-check-detailed-report")).toBeVisible();
    await expect(report.getByText(data.ownNo)).toBeVisible();
    await expect(report.getByText(data.receivedNo)).toHaveCount(0);
  });

  test("ZTO Çekler CSS'i MUI ekranlarına sızmaz", async ({ page }) => {
    test.setTimeout(120_000);
    await assertNoZtoCssLeak(page, openChecks);
  });
});
