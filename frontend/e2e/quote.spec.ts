import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

test("teklif hazırlanır, kabul edilir ve kabul edilen satırdan fiyatıyla sefer açılır", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  await owner.branch();
  const customerName = `Teklif Müşterisi ${unique("")}`;
  await owner.account("CUSTOMER", customerName);

  await login(page, tenantState());
  await page.goto("/crm/quotes");
  await page.getByRole("button", { name: "Teklif oluştur" }).click();
  const create = page.getByRole("dialog");
  await create.getByRole("combobox", { name: /^Cari/ }).click();
  await page.getByRole("option", { name: new RegExp(customerName) }).click();
  await create.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/crm\/quotes\/[0-9a-f-]+$/);
  const quoteNumber = (await page.getByRole("heading", { name: / \/ v1$/ }).innerText())
    .replace(" / v1", "")
    .trim();

  // Fiyat tarifesiz, elle girilen net tutarla verilir.
  await page.getByRole("button", { name: "Satır ekle" }).click();
  const line = page.getByRole("dialog");
  await line.getByLabel(/^Çıkış/).fill("İzmir");
  await line.getByLabel(/^Varış/).fill("Bursa");
  await line.getByLabel(/^Elle net tutar/).fill("8000");
  await line.getByRole("button", { name: "Kaydet" }).click();
  await expect(line).toBeHidden();
  await expect(page.getByRole("cell", { name: "İzmir" })).toBeVisible();

  await page.getByRole("button", { name: "Gönderildi işaretle" }).click();
  await expect(page.getByText(/· Gönderildi ·/)).toBeVisible();
  await page.getByRole("button", { name: "Kabul et" }).click();
  const accept = page.getByRole("dialog");
  await accept.getByRole("button", { name: "Kaydet" }).click();
  await expect(accept).toBeHidden();
  await expect(page.getByText(/· Kabul edildi ·/)).toBeVisible();
  // Kabul edilen teklif artık değiştirilemez.
  await expect(page.getByRole("button", { name: "Satır ekle" })).toHaveCount(0);

  // Sefer, kabul edilen teklif satırının fiyatını alır.
  await page.goto("/operations");
  await page.getByRole("button", { name: "Yeni sefer" }).click();
  const shipment = page.getByRole("dialog");
  await shipment.getByRole("combobox", { name: /^Müşteri/ }).click();
  await page.getByRole("option", { name: customerName, exact: true }).click();
  await shipment.getByRole("combobox", { name: /^Şube/ }).click();
  await page.getByRole("option").first().click();
  await shipment.getByLabel(/^Çıkış/).fill("İzmir");
  await shipment.getByLabel(/^Varış/).fill("Bursa");
  await shipment.getByRole("combobox", { name: /^Kabul edilmiş teklif satırı/ }).click();
  await page.getByRole("option", { name: `${quoteNumber} · İzmir - Bursa` }).click();
  await shipment.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/operations\/shipments\/[0-9a-f-]+$/);
  await expect(page.getByText("8.000,00", { exact: false }).first()).toBeVisible();
});
