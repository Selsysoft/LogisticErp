import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

function trDate(daysFromToday: number) {
  const date = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

test("açık faturalar içe aktarılır; tedarikçi faturası ödeme planı, müşteri faturası cari hareketi olur", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  await owner.branch();
  const customerCode = unique("M").slice(0, 20);
  const supplierCode = unique("T").slice(0, 20);
  await owner.request("POST", "/finance/accounts", {
    code: customerCode,
    name: "Açık Fatura Müşterisi",
    type: "CUSTOMER",
  });
  await owner.request("POST", "/finance/accounts", {
    code: supplierCode,
    name: "Açık Fatura Tedarikçisi",
    type: "SUPPLIER",
  });
  const receivable = unique("A");
  const payable = unique("F");
  const file = [
    "Cari kodu;Belge no;Belge tarihi;Vade;Tutar",
    `${customerCode};${receivable};${trDate(-30)};${trDate(15)};2.750,00`,
    `${supplierCode};${payable};${trDate(-10)};${trDate(20)};1.200,00`,
  ].join("\n");

  await login(page, tenantState());
  await page.goto("/finance/accounts");
  await page.getByRole("button", { name: "Açık faturaları içe aktar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Şube" }).click();
  await page.getByRole("option").first().click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "acik.csv", mimeType: "text/csv", buffer: Buffer.from(file, "utf8") });
  await dialog.getByRole("button", { name: "Önizle" }).click();
  await expect(dialog.getByText("Hazır: 2 fatura.")).toBeVisible();
  await expect(dialog.getByRole("row").filter({ hasText: receivable })).toContainText("Alacak");
  await expect(dialog.getByRole("row").filter({ hasText: payable })).toContainText("Borç");
  await dialog.getByRole("button", { name: "İçe aktar" }).click();
  await expect(dialog.getByText("İçe aktarıldı: 2 fatura.")).toBeVisible();
  await dialog.getByRole("button", { name: "Kapat" }).click();

  // Tedarikçi faturası taslak ödeme planı olarak ödeme takvimine girer.
  await page.goto("/finance/plans");
  const plan = page.getByRole("row").filter({ hasText: `Açılış faturası ${payable}` });
  await expect(plan).toContainText("Taslak");
  await expect(plan).toContainText("1.200,00");

  // Müşteri faturası cariye belge tarihiyle yazılır ve ekstreden geri alınabilir.
  await page.goto("/finance/accounts");
  await page.getByLabel("Ara").fill(customerCode);
  await page.getByRole("link", { name: "Açık Fatura Müşterisi" }).click();
  const line = page.getByRole("row").filter({ hasText: `Açılış faturası ${receivable}` });
  await expect(line).toContainText("2.750,00");
  await expect(line.getByRole("button", { name: "Ters çevir" })).toBeVisible();
});
