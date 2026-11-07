import { Owner, plate, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

test("sefer araç ve sürücüye atanır, yüklemeden faturaya kadar ekrandan yürütülür", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  const branch = await owner.branch();
  const customer = await owner.account("CUSTOMER", "Alıcı Müşteri A.Ş.");
  const truck = plate();
  await owner.vehicle(truck);
  const driverName = `Ahmet Sürücü ${unique("")}`;
  await owner.driver(driverName);
  const shipment = await owner.shipment(customer, branch);

  await login(page, tenantState());
  await page.goto(`/operations/shipments/${shipment.id}`);
  await expect(page.getByText(shipment.number, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Teklif", { exact: true }).first()).toBeVisible();

  // Atama yapılmadan planlanamaz; önce araç ve sürücü atanır.
  await page.getByRole("button", { name: "Araç ve sürücü ata" }).click();
  const assign = page.getByRole("dialog");
  await assign.getByRole("combobox", { name: /^Araç/ }).click();
  await page.getByRole("option", { name: truck }).click();
  await assign.getByRole("combobox", { name: /^Sürücü/ }).click();
  await page.getByRole("option", { name: driverName }).click();
  await assign.getByRole("button", { name: "Kaydet" }).click();
  await expect(assign).toBeHidden();
  await expect(page.getByRole("cell", { name: new RegExp(truck) })).toBeVisible();

  for (const [action, status] of [
    ["Planlandı yap", "Planlandı"],
    ["Yüklendi yap", "Yüklendi"],
    ["Yola çıkar", "Yolda"],
  ]) {
    await page.getByRole("button", { name: action }).click();
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
  }

  // Teslim kanıtı olmadan teslim edildi yapılamaz.
  await page.getByRole("button", { name: "Teslim edildi yap" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /teslim kanıtı/i })).toBeVisible();

  await page.getByRole("button", { name: "Teslim kanıtı gir" }).click();
  const pod = page.getByRole("dialog");
  await pod.getByLabel(/^Teslim alan/).fill("Mehmet Depo Sorumlusu");
  await pod.getByRole("button", { name: "Kaydet" }).click();
  await expect(pod).toBeHidden();
  await page.getByRole("button", { name: "Teslim edildi yap" }).click();
  await expect(page.getByText("Teslim edildi", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Fatura kes" }).click();
  const invoice = page.getByRole("dialog");
  await invoice.getByRole("button", { name: "Kaydet" }).click();
  await expect(invoice).toBeHidden();
  await expect(page.getByText("Faturalandı", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /^NF-/ }).first()).toBeVisible();

  // Fatura müşteri carisine borç yazar.
  await page.goto(`/finance/accounts/${customer}`);
  await expect(page.getByText("10.000,00", { exact: false }).first()).toBeVisible();
});
