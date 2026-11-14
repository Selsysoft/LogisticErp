import type { Locator, Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans 12.1 — Cari Hareketler ve Ekstre (§6.5 FE2): Borç Ekle (Alış Faturası, KDV %20) → tabloda
 * Borç satırı ve özet kartı; satır Sil → "Silme Onayı" → "Evet, Sil" → "İptal" rozeti; Alacak Ekle →
 * "Ceza / Kesinti (karşı tarafa kesilen)"; Cari Devir → sezon → sezon seçici; Cari Taşıma → hedef ara →
 * iki hareket → onay → "{n} hareket taşındı." → Geçmiş Taşımalar → Geri Al; Ekstre Al yeni sekme →
 * şirket adı, "ZTO FABRİKA" yok, Bootstrap nötrleme (hesaplanmış stil); limit düzenle → "Kredi Limiti".
 */

/**
 * ZTO Statement.cshtml'de geçerli (hesaplanmış) değerler: kök Courier New 11px; ikinci <style> bloğunun
 * "kompakt" kuralları (:891-:904, !important) ilk bloğu ezer: .print-actions .btn-print 5px 14px, h1 16px.
 */
const STATEMENT_STYLE = { fontSize: "11px", printPadding: "5px 14px", h1FontSize: "16px" };

async function addDocument(
  page: Page,
  root: Locator,
  options: {
    side: "debt" | "credit";
    type?: string;
    documentNo: string;
    amount: string;
    branch: string;
  },
) {
  await root
    .getByRole("button", { name: options.side === "debt" ? "Borç Ekle" : "Alacak Ekle" })
    .click();
  const modal = page.locator(options.side === "debt" ? "#addDebtModal" : "#addCreditModal");
  await expect(
    modal.getByText(options.side === "debt" ? "Yeni Borç Ekle" : "Yeni Alacak Ekle"),
  ).toBeVisible();
  const prefix = options.side;
  if (options.type)
    await modal.locator(`#${prefix}DocumentType`).selectOption({ label: options.type });
  await modal.locator(`#${prefix}DocumentNo`).fill(options.documentNo);
  await modal.locator(`#${prefix}Amount`).fill(options.amount);
  await modal.locator(`#${prefix}PaymentMethod`).selectOption("BANK");
  await modal
    .locator(options.side === "debt" ? "#workPlaceID" : "#creditWorkPlaceID")
    .selectOption({ label: options.branch });
  await modal.getByRole("button", { name: /Kaydet/ }).click();
  await expect(modal).toBeHidden();
}

test("Cari Hareketler: borç/alacak, sil, devir, taşıma, ekstre ve limit", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branchName = unique("E2E İY ");
  const branchId = await owner.branch(branchName);
  const sourceName = unique("E2E Kaynak ");
  const targetName = unique("E2E Hedef ");
  const source = await owner.request<{ id: string; code: string }>("POST", "/finance/accounts", {
    name: sourceName,
    type: "SUPPLIER",
    branchId,
  });
  await owner.request("POST", "/finance/accounts", {
    name: targetName,
    type: "SUPPLIER",
    branchId,
  });

  await login(page, state);
  await page.goto(`/zto-finans/cari-kartlar/${source.id}/hareketler`);
  const root = page.locator(".zto-finans");
  await expect(root).toHaveClass(/zto-page-account-transactions/);
  await expect(root.getByText("Cari Hesap Hareketleri")).toBeVisible();

  // 1) Borç Ekle: Alış Faturası (varsayılan), KDV %20 → net 1.200
  await addDocument(page, root, {
    side: "debt",
    documentNo: "E2E-FTR-1",
    amount: "1000",
    branch: branchName,
  });
  await expect(
    root.locator(".snackbar", { hasText: "Borç kaydı başarıyla eklendi" }),
  ).toBeVisible();
  const debtRow = root.locator("#allTransactionsTable tbody tr", { hasText: "E2E-FTR-1" });
  await expect(debtRow).toBeVisible();
  await expect(debtRow.locator(".badge", { hasText: "Borç" }).first()).toBeVisible();
  await expect(
    root.locator(".erp-mini-stat", { hasText: "Borç" }).locator(".erp-mini-value"),
  ).toContainText("1.200");

  // 2) Sil → Silme Onayı → Evet, Sil → ters kayıt "İptal" rozeti
  await debtRow.getByRole("button", { name: /^Sil:/ }).click();
  const confirm = page.locator("#deleteTransactionConfirmModal");
  await expect(confirm.getByText("Silme Onayı")).toBeVisible();
  await expect(confirm.getByRole("button", { name: /İptal/ })).toBeFocused();
  await confirm.getByRole("button", { name: /Evet, Sil/ }).click();
  await expect(confirm).toBeHidden();
  await expect(
    root.locator("#allTransactionsTable tbody tr .badge", { hasText: "İptal" }).first(),
  ).toBeVisible();

  // 3) Alacak Ekle → ceza türü (karşı tarafa kesilen)
  await addDocument(page, root, {
    side: "credit",
    type: "Ceza / Kesinti (karşı tarafa kesilen)",
    documentNo: "E2E-CZ-1",
    amount: "250",
    branch: branchName,
  });
  await expect(
    root.locator("#allTransactionsTable tbody tr", { hasText: "E2E-CZ-1" }),
  ).toBeVisible();

  // 4) İki taşınabilir borç daha
  await addDocument(page, root, {
    side: "debt",
    documentNo: "E2E-FTR-2",
    amount: "100",
    branch: branchName,
  });
  await addDocument(page, root, {
    side: "debt",
    documentNo: "E2E-FTR-3",
    amount: "200",
    branch: branchName,
  });

  // 5) Cari Devir → sezon oluştur → sezon seçici
  await root.getByRole("button", { name: "Cari Devir" }).click();
  const devir = page.locator("#cariDevirModal");
  await devir.locator("#cdSeasonName").fill("E2E Sezonu");
  await devir.getByRole("button", { name: /Devir Oluştur/ }).click();
  await expect(devir.locator("#cdDevirBody")).toContainText("E2E Sezonu");
  await devir.getByRole("button", { name: "Kapat" }).last().click();
  await expect(root.locator("#ctSeasonSelect option", { hasText: "E2E Sezonu" })).toHaveCount(1);
  await root.locator("#ctSeasonSelect").selectOption("all");

  // 6) Cari Taşıma → hedef → iki hareket → onay → sonuç → Geçmiş → Geri Al
  await root.getByRole("button", { name: "Cari Taşıma" }).click();
  const transfer = page.locator("#cariTasimaModal");
  await expect(transfer.locator(".modal-dialog.ct-modal-90")).toBeVisible();
  await transfer.locator("#ctTargetSearch").fill(targetName.slice(0, 12));
  await transfer.locator("#ctTargetResults .ct-target-item", { hasText: targetName }).click();
  for (const no of ["E2E-FTR-2", "E2E-FTR-3"]) {
    await transfer.locator("tr", { hasText: no }).locator("input.ct-chk").check();
  }
  await expect(transfer.locator("#ctSelectedCount")).toHaveText("2 seçili");
  await transfer.getByRole("button", { name: /^Taşı$/ }).click();
  const ct = page.locator("#ctConfirmModal");
  await expect(ct.locator("#ctConfirmText")).toContainText("2 hareket");
  await ct.getByRole("button", { name: /Evet, Taşı/ }).click();
  await expect(root.locator(".snackbar", { hasText: "hareket taşındı." })).toBeVisible();

  await root.getByRole("button", { name: "Cari Taşıma" }).click();
  await transfer.getByRole("button", { name: /Geçmiş Taşımalar/ }).click();
  const history = page.locator("#cariTasimaHistoryModal");
  await expect(history.locator("#ctHistoryBody")).toContainText(targetName);
  await history
    .getByRole("button", { name: /Geri Al/ })
    .first()
    .click();
  await page.locator("#cdConfirmModal").getByRole("button", { name: "Geri Al" }).click();
  await expect(root.locator(".snackbar", { hasText: "Taşıma geri alındı." })).toBeVisible();
  await history.getByRole("button", { name: "Kapat" }).last().click();
  await transfer.getByRole("button", { name: "Kapat" }).last().click();

  // 7) Limit düzenle → "Kredi Limiti" etiketi (04 §7 #5)
  await root.getByRole("button", { name: "Limitleri Düzenle" }).click();
  const limits = page.locator("#editLimitsModal");
  await expect(limits.getByText("Kredi & Risk Limiti Düzenle")).toBeVisible();
  await expect(limits.getByLabel(/Kredi Limiti/)).toBeVisible();
  await limits.getByLabel(/Kredi Limiti/).fill("5000");
  await limits.getByRole("button", { name: /Kaydet/ }).click();
  await expect(root.locator("#creditLimitBox")).toContainText("Kredi Limiti:");

  // 8) Ekstre Al → yeni sekme: şirket adı, ZTO FABRİKA yok, hesaplanmış stil (F9)
  const [statement] = await Promise.all([
    context.waitForEvent("page"),
    root.getByRole("button", { name: /Ekstre Al/ }).click(),
  ]);
  await statement.waitForLoadState();
  const print = statement.locator(".zto-finans.zto-print");
  await expect(print.locator(".statement-title h1")).toHaveText("EKSTRE");
  await expect(print.locator(".company-name")).not.toHaveText("");
  await expect(print).not.toContainText("ZTO FABRİKA");
  await expect(print.locator(".account-box")).toContainText(sourceName);
  // Ekstre isteği gerçekten döndü (from/to eksikse sunucu 400 verir): hata yok, en az bir satır var.
  await expect(print.locator(".currency-section tbody tr").first()).toBeVisible();
  await expect(print.locator("[role=alert]")).toHaveCount(0);
  const styles = await print.evaluate((el) => {
    const button = el.querySelector(".btn-print") as HTMLElement;
    const h1 = el.querySelector(".statement-title h1") as HTMLElement;
    const root = getComputedStyle(el);
    return {
      fontFamily: root.fontFamily,
      fontSize: root.fontSize,
      printPadding: getComputedStyle(button).padding,
      h1FontSize: getComputedStyle(h1).fontSize,
    };
  });
  expect(styles.fontFamily.replace(/["']/g, "")).toMatch(/^Courier New/);
  expect(styles.fontSize).toBe(STATEMENT_STYLE.fontSize);
  expect(styles.printPadding).toBe(STATEMENT_STYLE.printPadding);
  expect(styles.h1FontSize).toBe(STATEMENT_STYLE.h1FontSize);
  await statement.close();
});
