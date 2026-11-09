import { Page } from "@playwright/test";
import { Owner, plate, unique } from "./fixtures";
import { expect, login, mailMessage, tenantState, test } from "./support";

/** Sürücü telefonda kullanır; ekran telefon boyutunda denenir. */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function signatureOn(page: Page) {
  const pad = page.getByLabel("Teslim alanın imzası");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 15, { steps: 8 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 15, { steps: 8 });
  await page.mouse.up();
}

test("sürücü atanan seferi yükler, yola çıkar, imzayla teslim eder; masrafı ofis onaylar", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branch = await owner.branch();
  const customer = await owner.account("CUSTOMER", "Sürücü Testi Müşterisi");
  const vehicle = await owner.vehicle(plate());
  const driverName = `Veli Sürücü ${unique("")}`;
  const driver = await owner.driver(driverName);
  const email = `${unique("surucu").toLowerCase()}@${state.code}.test`;
  const driverLogin = await owner.user("DRIVER", email);
  await owner.linkDriverUser(driver, email);
  const shipment = await owner.shipment(customer, branch);
  await owner.assign(shipment.legs[0].id, vehicle, driver);
  await owner.moveTo(shipment.id, "PLANNED");

  await login(page, driverLogin);
  await expect(page).toHaveURL(/\/driver$/);
  await page.getByText(shipment.number).click();
  await expect(page).toHaveURL(new RegExp(`/driver/trips/${shipment.id}$`));
  await expect(page.getByText("Alıcı Mağazacılık", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Yüklendi" }).click();
  await expect(page.getByRole("button", { name: "Yola çıktım" })).toBeVisible();
  await expect.poll(() => owner.shipmentStatus(shipment.id)).toBe("LOADED");
  await page.getByRole("button", { name: "Yola çıktım" }).click();
  await expect.poll(() => owner.shipmentStatus(shipment.id)).toBe("IN_TRANSIT");

  // Masraf yolda girilir; teslimden sonra masraf düğmesi kalkar.
  await page.getByRole("button", { name: "Masraf ekle" }).click();
  const expense = page.getByRole("dialog");
  await expense.getByLabel(/^Tutar/).fill("750");
  await expense.getByRole("button", { name: "Kaydet" }).click();
  await expect(expense).toBeHidden();

  // İmza olmadan teslim kaydedilmez.
  await page.getByRole("button", { name: "Teslim et" }).click();
  const pod = page.getByRole("dialog");
  await pod.getByLabel("Teslim alan kişi").fill("Ayşe Kabul");
  await pod.getByRole("button", { name: "Teslimi kaydet" }).click();
  await expect(pod.getByText("İmza zorunludur.")).toBeVisible();
  await signatureOn(page);
  await pod.getByRole("button", { name: "Teslimi kaydet" }).click();
  await expect(pod).toBeHidden();
  await expect.poll(() => owner.shipmentStatus(shipment.id)).toBe("DELIVERED");
  await expect(page.getByRole("button", { name: "Masraf ekle" })).toHaveCount(0);

  await page.getByRole("link", { name: "Masraflarım" }).click();
  await expect(page.getByText("Onay bekliyor").first()).toBeVisible();

  // Ofis tarafı ayrı oturumda masrafı onaylar.
  const office = await browser.newPage();
  await login(office, state);
  await office.goto("/operations/driver-expenses");
  const row = office.getByRole("row").filter({ hasText: driverName });
  await row.getByRole("button", { name: "Onayla" }).click();
  await expect(office.getByRole("row").filter({ hasText: driverName })).toHaveCount(0);
  await office.close();

  // Ofis masraf girilince, sürücü karar verilince gerçek SMTP'den (Mailpit) e-posta alır.
  const request = await mailMessage(state.email, `Onay bekleyen sürücü masrafı: ${driverName}`);
  expect(request.Text).toContain("750,00 TRY");
  const decision = await mailMessage(driverLogin.email, "Masrafınız onaylandı");
  expect(decision.Text).toContain("750,00 TRY");
  expect(decision.Text).toContain(shipment.number);

  await page.reload();
  await expect(page.getByText("Onaylandı").first()).toBeVisible();

  // Sürücü adına dokununca Hesabım açılır; karar e-postasını buradan kapatabilir.
  await page.getByRole("link", { name: /Deneme Kullanıcı/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Masrafım onaylanınca veya reddedilince (hemen)")).toBeVisible();
});
