import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

test("finans ödeme planı girer, patron onaylar, finans bankadan öder", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branch = await owner.branch();
  const supplierName = `Tedarikçi ${unique("")}`;
  await owner.account("SUPPLIER", supplierName);
  const bankName = `Plan Bankası ${unique("")}`;
  const bank = await owner.bank(branch, bankName, "50000");
  const finance = await owner.user(
    "FINANCE",
    `${unique("finans").toLowerCase()}@${state.code}.test`,
  );
  const description = `Yakıt ödemesi ${unique("")}`;

  await login(page, finance);
  await page.goto("/finance/plans");
  await page.getByRole("button", { name: "Plan ekle" }).click();
  const create = page.getByRole("dialog");
  await create.getByRole("combobox", { name: /^Cari/ }).click();
  await page.getByRole("option", { name: new RegExp(supplierName) }).click();
  await create.getByRole("combobox", { name: /^Şube/ }).click();
  await page.getByRole("option").first().click();
  await create.getByLabel(/^Tutar/).fill("12500");
  await create.getByLabel(/^Açıklama/).fill(description);
  await create.getByRole("button", { name: "Kaydet" }).click();
  await expect(create).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: description });
  await expect(row.getByText("Taslak")).toBeVisible();
  await row.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(row.getByText("Onay bekliyor")).toBeVisible();
  // Finans rolünün onay yetkisi yoktur.
  await expect(row.getByRole("button", { name: "Onayla" })).toHaveCount(0);

  const patron = await browser.newPage();
  await login(patron, state);
  await patron.goto("/finance/plans");
  const pending = patron.getByRole("row").filter({ hasText: description });
  await pending.getByRole("button", { name: "Onayla" }).click();
  await expect(pending.getByText("Onaylandı")).toBeVisible();
  await patron.close();

  await page.reload();
  await row.getByRole("button", { name: "Öde" }).click();
  const pay = page.getByRole("dialog");
  await pay.getByRole("combobox", { name: /^Banka\/kasa hesabı/ }).click();
  await page.getByRole("option", { name: new RegExp(bankName) }).click();
  await pay.getByRole("button", { name: "Öde" }).click();
  await expect(pay).toBeHidden();
  await expect(row.getByText("Ödendi")).toBeVisible();
  await expect.poll(() => owner.fundBalance(bank)).toBe(37500);
});

test.describe("dört göz ilkesi", () => {
  // Kendi planını onaylama denemesi sunucudan bilerek 403 alır.
  test.use({ allowedStatuses: [403] });

  test("planı oluşturan onaylayamaz; ekran nedenini ve çözüm yolunu söyler", async ({ page }) => {
    const owner = await Owner.login(tenantState());
    const branch = await owner.branch();
    const supplier = await owner.account("SUPPLIER", `Tedarikçi ${unique("")}`);
    const description = `Kendi planı ${unique("")}`;
    const plan = await owner.request<{ id: string }>("POST", "/finance/payment-plans", {
      accountId: supplier,
      branchId: branch,
      money: { amount: "300", currency: "TRY" },
      dueDate: new Date().toISOString().slice(0, 10),
      description,
    });
    await owner.request("POST", `/finance/payment-plans/${plan.id}/submit`);

    await login(page, tenantState());
    await page.goto("/finance/plans");
    const row = page.getByRole("row").filter({ hasText: description });
    await row.getByRole("button", { name: "Onayla" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /başka bir yetkili/ })).toContainText(
      "Finans > Tanımlar",
    );
    await expect(row.getByText("Onay bekliyor")).toBeVisible();
  });
});

test("patron gerekçeyle reddeder; finans gerekçeyi geçmişte görür, planı yeniden onaya gönderir", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const state = tenantState();
  const owner = await Owner.login(state);
  const branch = await owner.branch();
  const supplier = await owner.account("SUPPLIER", `Tedarikçi ${unique("")}`);
  const financeLogin = await owner.user(
    "FINANCE",
    `${unique("finans").toLowerCase()}@${state.code}.test`,
  );
  const finance = await Owner.login(financeLogin);
  const description = `Lastik ödemesi ${unique("")}`;
  const plan = await finance.request<{ id: string }>("POST", "/finance/payment-plans", {
    accountId: supplier,
    branchId: branch,
    money: { amount: "4200", currency: "TRY" },
    dueDate: new Date().toISOString().slice(0, 10),
    description,
  });
  await finance.request("POST", `/finance/payment-plans/${plan.id}/submit`);

  const patron = await browser.newPage();
  await login(patron, state);
  await patron.goto("/finance/plans");
  const pending = patron.getByRole("row").filter({ hasText: description });
  await pending.getByRole("button", { name: "Reddet" }).click();
  const reject = patron.getByRole("dialog");
  // Gerekçesiz ret gönderilmez.
  await reject.getByRole("button", { name: "Reddet" }).click();
  await expect(reject.getByText("Bu alan zorunlu.")).toBeVisible();
  await reject.getByLabel(/^Ret gerekçesi/).fill("Fatura eki eksik");
  await reject.getByRole("button", { name: "Reddet" }).click();
  await expect(reject).toBeHidden();
  await expect(pending.getByText("Reddedildi")).toBeVisible();
  await patron.close();

  await login(page, financeLogin);
  await page.goto("/finance/plans");
  const row = page.getByRole("row").filter({ hasText: description });
  await expect(row.getByText("Reddedildi")).toBeVisible();
  await row.getByRole("button", { name: "Geçmiş" }).click();
  const history = page.getByRole("dialog");
  const rejected = history.getByRole("row").filter({ hasText: "Reddedildi" });
  await expect(rejected).toContainText("Fatura eki eksik");
  await expect(rejected).toContainText(state.email);
  await history.getByRole("button", { name: "Kapat" }).click();
  await expect(history).toBeHidden();

  await row.getByRole("button", { name: "Onaya gönder" }).click();
  await expect(row.getByText("Onay bekliyor")).toBeVisible();
  await expect
    .poll(async () =>
      (
        await finance.request<{ eventType: string }[]>(
          "GET",
          `/finance/payment-plans/${plan.id}/events`,
        )
      ).map((event) => event.eventType),
    )
    .toEqual(["CREATED", "SUBMITTED", "REJECTED", "SUBMITTED"]);
});
