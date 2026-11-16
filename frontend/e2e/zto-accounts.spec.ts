import type { Locator, Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.1 — Cari Kartlar, cari kart formu ve cari banka hesapları (§6.5 FE1):
 * Yeni Cari Kart (Tedarikçi + iş yeri + banka satırı) → listede TED- kodu ve bildirim; Düzenle →
 * Güncelle; Banka Hesapları maskeli IBAN; aynı IBAN ikinci cariye eklenemez; Sil → Pasifleri göster →
 * Aktifleştir; klavye ile form doldurup Enter ile gönderme.
 */

/** Geçerli rastgele TR IBAN (ISO 13616 mod-97): tekillik kuralı yeniden koşularda çakışmasın. */
function randomTrIban(): string {
  const digits = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
  const bban = `${digits(5)}0${digits(16)}`;
  // "TR" → 29 27; kontrol hanesi 00 ile hesaplanır.
  const numeric = `${bban}292700`;
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  const check = String(98 - remainder).padStart(2, "0");
  return `TR${check}${bban}`;
}

/** ZtoBranchSelect (select2 görünümü): kutuyu açıp ilk iş yerini seçer. */
async function pickFirstBranch(page: Page, root: Locator) {
  await root.locator("#WorkPlaceID ~ .select2-container .select2-selection").click();
  await page
    .locator(".select2-results__option[role='option']:not(.select2-results__option--disabled)")
    .first()
    .click();
}

/**
 * Satır menüsünü açıp öğeyi seçer. `ZtoMenuButton` kaydırma/yeniden çizimde kapanır (tıklamadan önceki
 * otomatik kaydırma dahil, 2 işçili yükte sık); menü açık değilse yeniden açılır, öğe olayı
 * kaydırmasız gönderilir (zto-checks.spec ile aynı desen).
 */
async function rowMenuItem(root: Locator, name: string, item: string) {
  const button = root.getByRole("button", { name: `${name} işlemleri` });
  await button.scrollIntoViewIfNeeded();
  await expect(async () => {
    const menu = root.getByRole("menu");
    if (!(await menu.isVisible())) await button.click();
    const menuItem = menu.getByRole("menuitem", { name: item, exact: true });
    await expect(menuItem).toBeVisible({ timeout: 2_000 });
    await menuItem.dispatchEvent("click");
  }).toPass({ timeout: 30_000 });
}

async function findRow(root: Locator, name: string) {
  await root.locator("#customerAccountsTable_filter input").fill(name);
  const row = root.locator("#customerAccountsTable tbody tr", { hasText: name });
  await expect(row).toBeVisible();
  return row;
}

test("Cari Kartlar: yeni cari, düzenle, banka hesapları, IBAN tekilliği, sil ve aktifleştir", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36).toUpperCase();
  const first = `E2E Tedarikçi ${suffix}`;
  const second = `E2E Klavye ${suffix}`;
  const iban = randomTrIban();
  const state = tenantState();
  // Spec tek başına da koşabilsin: yeni kiracıda aktif iş yeri yok (önceden başka spec'e bağlıydı).
  await (await Owner.login(state)).branch(unique("E2E İY "));
  await login(page, state);
  await page.goto("/zto-finans/cari-kartlar");
  const root = page.locator(".zto-finans");
  await expect(root).toHaveClass(/zto-page-customer-accounts/);
  await expect(root.getByText("Cari Hesaplar Paneli")).toBeVisible();
  await expect(root.locator("#customerAccountsTable thead th").first()).toHaveText(/PLAN TARİHİ/);

  // 1) Yeni Cari Kart: Tedarikçi, iş yeri, ad, bir banka satırı (geçerli IBAN).
  await root.getByRole("link", { name: "Yeni Cari Kart" }).click();
  await expect(page).toHaveURL(/\/zto-finans\/cari-kartlar\/yeni$/);
  await expect(root).toHaveClass(/zto-page-account-form/);
  await root.locator("#AccountGroup").selectOption({ label: "Tedarikçi" });
  await pickFirstBranch(page, root);
  await root.locator("#AccountName").fill(first);
  await root.locator("#bank-0-bankName").fill("Ziraat Bankası");
  await root.locator("#bank-0-iban").fill(iban.toLowerCase());
  await expect(root.locator("#bank-0-iban")).toHaveValue(iban);
  await root.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/zto-finans\/cari-kartlar$/);
  await expect(
    root.getByText(/Cari kart başarıyla oluşturuldu\. \(Hesap Kodu: TED-/),
  ).toBeVisible();
  const row = await findRow(root, first);
  await expect(row).toContainText(/TED-\d+/);

  // 2) Düzenle → telefon → Güncelle.
  await rowMenuItem(root, first, "Düzenle");
  await expect(page).toHaveURL(/\/cari-kartlar\/[^/]+\/duzenle$/);
  await expect(root.locator("#AccountCode")).toHaveValue(/TED-\d+/);
  await expect(root.getByText("Kayıt Bilgileri")).toBeVisible();
  await root.locator("#Phone").fill("02324445566");
  await root.getByRole("button", { name: "Güncelle" }).click();
  await expect(root.getByText("Cari kart başarıyla güncellendi.")).toBeVisible();

  // 3) Banka Hesapları: IBAN maskeli, ekran okuyucu metni son dört hane.
  await findRow(root, first);
  await rowMenuItem(root, first, "Banka Hesapları");
  await expect(page).toHaveURL(/\/banka-hesaplari$/);
  await expect(root).toHaveClass(/zto-page-bank-accounts/);
  const ibanCell = root.locator("#dataTable tbody td.iban").first();
  await expect(ibanCell).toContainText("****");
  await expect(ibanCell).not.toContainText(iban);
  await expect(ibanCell.locator(".sr-only")).toHaveText(`IBAN, son dört hane ${iban.slice(-4)}`);

  // 4) Klavye (§6.5): form YALNIZ klavyeyle doldurulur (Tab/Shift+Tab, ok tuşları, Enter) ve Enter
  // ile gönderilir; selectOption/click/focus yok. DOM sırası: Hesap Grubu → İş Yeri (select2
  // combobox) → [Şirket, ≥2 aktif şirkette] → Hesap Adı (açılışta odaklı) → Telefon.
  await page.goto("/zto-finans/cari-kartlar/yeni");
  const nameInput = root.locator("#AccountName");
  const groupSelect = root.locator("#AccountGroup");
  const companySelect = root.locator("#CompanyID");
  const branchBox = root.locator("#WorkPlaceID ~ .select2-container .select2-selection");
  await expect(nameInput).toBeFocused();
  const multiCompany = (await companySelect.count()) > 0;
  await page.keyboard.press("Shift+Tab");
  if (multiCompany) {
    await expect(companySelect).toBeFocused();
    await page.keyboard.press("Shift+Tab");
  }
  await expect(branchBox).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(groupSelect).toBeFocused();
  // Kapalı yerel select'te yazarak arama (type-ahead).
  await page.keyboard.type("Ted");
  await expect(groupSelect.locator("option:checked")).toHaveText("Tedarikçi");
  // İş yeri: Enter listeyi açar (odak arama kutusunda, ilk iş yeri vurgulu), ArrowDown vurguyu
  // taşır (son öğede durur), Enter seçer ve odak combobox'a döner.
  await page.keyboard.press("Tab");
  await expect(branchBox).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".select2-container--open .select2-search__field")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(root.locator("#WorkPlaceID")).not.toHaveValue("");
  await expect(branchBox).toBeFocused();
  await page.keyboard.press("Tab");
  if (multiCompany) {
    await expect(companySelect).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(nameInput).toBeFocused();
  await page.keyboard.type(second);
  await page.keyboard.press("Tab");
  await expect(root.locator("#Phone")).toBeFocused();
  await page.keyboard.type("05320000000");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/zto-finans\/cari-kartlar$/);
  await expect(root.getByText(/Cari kart başarıyla oluşturuldu/)).toBeVisible();

  // 5) Aynı IBAN ikinci cariye eklenemez (genel ileti).
  await findRow(root, second);
  await rowMenuItem(root, second, "Banka Hesapları");
  await root.getByRole("link", { name: "Yeni Banka Hesabı" }).click();
  await expect(root).toHaveClass(/zto-page-bank-account-form/);
  await root.locator("#BankName").fill("Ziraat Bankası");
  await root.locator("#IBAN").fill(iban);
  await root.locator("#CurrencyID").selectOption("TRY");
  await root.getByRole("button", { name: "Yeni Banka Hesabı Oluştur" }).click();
  await expect(root.locator("#IBAN-error")).toHaveText(
    "Bu IBAN bilgisi kayıtlıdır, lütfen kontrol ediniz.",
  );
  await expect(root.locator("#IBAN")).toHaveAttribute("aria-invalid", "true");

  // 6) Sil → ZTO onayı → pasif; Pasifleri göster → Aktifleştir.
  await page.goto("/zto-finans/cari-kartlar");
  await findRow(root, first);
  await rowMenuItem(root, first, "Sil");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cari kartı silmek istediğinizde emin misiniz?");
  await expect(dialog.getByRole("button", { name: "İptal" })).toBeFocused();
  await dialog.getByRole("button", { name: "Sil" }).click();
  await expect(page.locator(".snackbar", { hasText: "Cari kart pasifleştirildi." })).toBeVisible();
  await expect(root.locator("#customerAccountsTable tbody tr", { hasText: first })).toHaveCount(0);
  await root.getByLabel("Pasifleri göster").check();
  const passive = await findRow(root, first);
  await expect(passive).toHaveClass(/definition-row--inactive/);
  await rowMenuItem(root, first, "Aktifleştir");
  await expect(page.locator(".snackbar", { hasText: "Cari kart aktifleştirildi." })).toBeVisible();
});
