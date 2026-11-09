import { Owner } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

test("ofis takip bağlantısı verir; müşteri giriş yapmadan izler; iptalden sonra açılmaz", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch();
  const customer = await owner.account("CUSTOMER", "Takip Müşterisi");
  const shipment = await owner.shipment(customer, branch);
  await owner.deliver(shipment.id, shipment.legs[0].id, "Ayşe Kabul");

  await login(page, tenantState());
  await page.goto(`/operations/shipments/${shipment.id}`);
  await page.getByRole("button", { name: "Müşteri takibi" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Etkin bağlantı yok.")).toBeVisible();
  await dialog.getByRole("button", { name: "Bağlantı oluştur" }).click();
  const url = await dialog.getByLabel("Takip bağlantısı").inputValue();
  expect(url).toMatch(/\/track\/[a-z0-9-]+\/[A-Za-z0-9_-]{40,}$/);

  // Müşteri: oturumu ve çerezi olmayan ayrı tarayıcı, telefon boyutu.
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customerPage = await customerContext.newPage();
  const problems: string[] = [];
  customerPage.on("pageerror", (error) => problems.push(error.message));
  customerPage.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/.test(message.text())) {
      problems.push(message.text());
    }
  });
  await customerPage.goto(url);
  await expect(customerPage.getByRole("heading", { name: "Sefer takibi" })).toBeVisible();
  await expect(customerPage.getByText(shipment.number)).toBeVisible();
  await expect(customerPage.getByText("İstanbul → Ankara")).toBeVisible();
  await expect(customerPage.getByText("Teslim alan: A. K.")).toBeVisible();
  // Fiyat ve teslim alanın tam adı gösterilmez.
  await expect(customerPage.getByText(/10\.000/)).toHaveCount(0);
  await expect(customerPage.getByText("Ayşe Kabul")).toHaveCount(0);
  const width = await customerPage.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);

  await dialog.getByRole("button", { name: "Kapat" }).click();
  await page.getByRole("button", { name: "Müşteri takibi" }).click();
  await expect(dialog.getByText(/Görüntülenme: 1/)).toBeVisible();
  await dialog.getByRole("button", { name: "Bağlantıyı iptal et" }).click();
  await expect(dialog.getByText("Etkin bağlantı yok.")).toBeVisible();

  await customerPage.reload();
  await expect(customerPage.getByText(/geçersiz veya süresi dolmuş/)).toBeVisible();
  expect(problems).toEqual([]);
  await customerContext.close();
});
