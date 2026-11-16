import { Owner, unique } from "./fixtures";
import { expect, login, openZtoSidebar, tenantState, test } from "./support";

/**
 * ZTO Finans 12.8 — Kur Farkı Raporu, Nakit Akış ve Hızlı Bakiye Özeti (12.8_TASARIM §6.5 FE-3):
 * USD belge (işlem kuru 1, büyük fark için) API ile → Kur Farkı Raporu "Güncel Kurları Getir" → "Kes"
 * → onay → snackbar ve ✓ + belge no; satır yeniden kesilemez; cari hareketlerde KUR_FARKI satırında
 * Düzenle yok; Nakit Akış 8 hafta; yan menüden Hızlı Bakiye Özeti modalı, sekme klavyesi ve Kapat odak
 * dönüşü. e2e TCMB_ENABLED=false olduğundan test önce POST /finance/exchange-rates/refresh çağırır; USD
 * yine yoksa kur farkı senaryosu atlanır (e2e ağ bağımlılığı, R-10).
 */

/** Yerel takvim günü `"YYYY-MM-DD"` (n gün önce); tarih dizgisi `new Date(...)` ile ayrıştırılmaz. */
function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Setup = { owner: Owner; accountId: string; accountName: string; documentNo: string };

async function setup(): Promise<Setup> {
  const owner = await Owner.login(tenantState());
  const branchId = await owner.branch(unique("E2E KF "));
  const accountName = unique("E2E Kur Farkı Müşteri ");
  const accountId = await owner.account("CUSTOMER", accountName);
  const documentNo = unique("E2E-USD-");
  await owner.request("POST", `/finance/accounts/${accountId}/documents`, {
    side: "RECEIVABLE",
    documentType: "DIGER",
    documentNo,
    documentDate: isoDaysAgo(3),
    amount: 100,
    currency: "USD",
    exchangeRate: 1,
    paymentMethod: "OTHER",
    branchId,
    description: "E2E kur farkı kaynağı",
  });
  return { owner, accountId, accountName, documentNo };
}

test.describe("ZTO Kur Farkı ve Nakit Akış", () => {
  let data: Setup;

  test.beforeAll(async () => {
    data = await setup();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, tenantState());
  });

  test("Kur Farkı Raporu: Güncel Kurları Getir → Kes → ✓; hareketlerde Düzenle yok", async ({
    page,
  }) => {
    // Sahip FINANCE_MANAGE: 202 gövdesiz; TCMB hatasını sunucu yutar (kayıtlı kurlarla devam).
    await data.owner.request("POST", "/finance/exchange-rates/refresh");
    const rates = await data.owner.request<Array<{ currency: string }>>(
      "GET",
      `/finance/exchange-rates?date=${isoDaysAgo(0)}`,
    );
    test.skip(
      !rates.some((rate) => rate.currency === "USD"),
      "TCMB kuru yok (yenileme sonrası da)",
    );

    await page.goto("/zto-finans/kur-farki-raporu");
    const root = page.locator(".zto-finans");
    await expect(root).toHaveClass(/zto-page-fx-report/);
    await expect(root.locator(".fx-hero")).toContainText("Kur Farkı Raporu");
    await root.getByRole("textbox", { name: "Tabloda ara" }).fill(data.accountName);
    const row = root.locator("#fxTable tbody tr", { hasText: data.accountName });
    await expect(row).toHaveCount(1);
    const cut = row.locator("button.fx-cut");
    await expect(cut).toBeDisabled();
    await expect(row.locator("td.fx-diff")).toHaveText("-");

    await root.getByRole("button", { name: /Güncel Kurları Getir/ }).click();
    await expect(row.locator("td.fx-diff")).toHaveText(/^\+/);
    await expect(cut).toBeEnabled();
    await cut.click();

    const modal = page.locator(".modal", { hasText: "Bu hareket için kur farkı cari kaydı" });
    await expect(modal.getByText(/Alacak kaydı \(aynı yön\)/)).toBeVisible();
    await expect(modal.getByRole("button", { name: /Vazgeç/ })).toBeFocused();
    await modal.getByRole("button", { name: /Kes/ }).click();
    await expect(
      root.locator(".snackbar", { hasText: /Kur farkı kaydı oluşturuldu: .* TL \(aynı yön\)\./ }),
    ).toBeVisible();

    const link = row.getByRole("link", { name: /^KF-/ });
    await expect(link).toBeVisible();
    await expect(row.locator(".fa-check")).toBeVisible();
    await expect(row.locator("button.fx-cut")).toHaveCount(0);
    const kfNo = (await link.textContent())?.trim() ?? "";
    expect(kfNo).toContain(data.documentNo);

    await page.goto(`/zto-finans/cari-kartlar/${data.accountId}/hareketler`);
    const kfRow = root.locator("#allTransactionsTable tbody tr", { hasText: kfNo });
    await expect(kfRow).toBeVisible();
    await expect(kfRow.getByRole("button", { name: /^Düzenle:/ })).toHaveCount(0);
    const sourceRow = root.locator("#allTransactionsTable tbody tr", {
      hasText: data.documentNo,
    });
    await expect(sourceRow.first()).toBeVisible();
  });

  test("Nakit Akış: 8 haftalık satır, şerit ve renkli başlıklar", async ({ page }) => {
    await page.goto("/zto-finans/nakit-akis");
    const root = page.locator(".zto-finans");
    await expect(root).toHaveClass(/zto-page-cash-flow/);
    await expect(root.locator(".cf-hero")).toContainText("Nakit Akış Projeksiyonu (8 Hafta)");
    await expect(root.locator("#cfTable tbody tr")).toHaveCount(8);
    await expect(root.locator(".rcpdt-bar")).toBeVisible();
    await expect(root.locator("#cfTable tbody tr").first().locator("td").first()).toHaveText(
      /^\d{2}\.\d{2} – \d{2}\.\d{2}$/,
    );
    await expect(root.locator("#cfTable thead th").nth(1)).toHaveText("Alacak Vadesi");
  });

  test("Hızlı Bakiye Özeti: yan menüden açılır, sekme klavyesi, Kapat odak dönüşü", async ({
    page,
  }) => {
    await page.goto("/zto-finans/nakit-akis");
    const root = page.locator(".zto-finans");
    await expect(root.locator("#cfTable")).toBeVisible();
    const modal = page.locator("#treasuryModal");
    await expect(async () => {
      const sidebar = await openZtoSidebar(page);
      await sidebar.getByRole("button", { name: "Hızlı Bakiye Özeti" }).click({ timeout: 5_000 });
      await expect(modal).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    await expect(modal.locator(".modal-dialog.zto-treasury-dialog")).toBeVisible();
    await expect(modal.locator("#treasuryModalLabel")).toContainText("Finansal Varlık Durumları");
    await expect(modal.locator("#treasuryBranchFilter")).toBeFocused();
    await expect(modal.locator("#treasuryContent")).toBeVisible();

    const banks = modal.getByRole("tab", { name: /Bankalar/ });
    await expect(banks).toHaveAttribute("aria-selected", "true");
    await banks.focus();
    await page.keyboard.press("ArrowRight");
    const cashes = modal.getByRole("tab", { name: /Kasalar/ });
    await expect(cashes).toBeFocused();
    await expect(cashes).toHaveAttribute("aria-selected", "true");
    await expect(modal.locator("#cashesPanel")).toBeVisible();
    await page.keyboard.press("End");
    await expect(modal.getByRole("tab", { name: /Grafikler/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await modal.locator(".modal-footer").getByRole("button", { name: /Kapat/ }).click();
    await expect(modal).toBeHidden();
    // Odak yan menüye döner: menü açık kaldıysa öğeye, modal sırasında kapandıysa (imleç ayrıldı ya da
    // modal içi tıklama "dışarı tıklama" sayıldı) kapalı paneldeki öğe odak alamaz ve aç/kapa okuna
    // verilir (`sidebarFocus.ts`). Odak body'ye düşmez.
    await expect(
      page.locator('.zto-finans #ztSidebar :is(.zt-sidebar-arrow, a[role="button"]):focus'),
    ).toHaveCount(1);
  });
});
