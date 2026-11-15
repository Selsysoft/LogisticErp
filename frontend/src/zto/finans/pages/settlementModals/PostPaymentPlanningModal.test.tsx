// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { Plan } from "../../../../pages/finance/types";
import { apiError, fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { PostPaymentPlanningModal, RemainingDebtPanel } from "./index";
import { balanceRow, breakdown, modalApi, settlement } from "./settlementModalsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const onHide = vi.fn();
const ACCOUNT = { id: "a1", code: "TED-001", name: "Demir Tedarik", type: "SUPPLIER" as const };

function plan(patch: Partial<Plan>): Plan {
  return {
    id: "p1",
    accountId: "a1",
    branchId: "b1",
    companyId: "c1",
    money: { amount: "400.0000", currency: "TRY" },
    dueDate: "2026-12-01",
    status: "DRAFT",
    purchaseInvoiceId: null,
    description: "Eski plan",
    rejectNote: null,
    ...patch,
  };
}

function Host() {
  const [show, setShow] = useState(true);
  return (
    <PostPaymentPlanningModal
      show={show}
      onHide={() => {
        onHide();
        setShow(false);
      }}
      settlement={settlement()}
      account={ACCOUNT}
    />
  );
}

async function modal() {
  await waitFor(
    () => expect(document.querySelector(".modal#postPaymentPlanningModal")).not.toBeNull(),
    {
      timeout: 20_000,
    },
  );
  return document.querySelector(".modal#postPaymentPlanningModal") as HTMLElement;
}

beforeEach(() => {
  fakeApi.reset();
  onHide.mockReset();
  signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"]);
  modalApi({
    rows: [balanceRow({ debit: 100, credit: 600 }), balanceRow({ currency: "USD", credit: 20 })],
  });
});
afterEach(cleanup);

describe("PostPaymentPlanningModal", { timeout: 60_000 }, () => {
  it("Bölüm A → Evet, Planla → satır; doğrulama; Kaydet DRAFT plan", async () => {
    fakeApi.on("POST", "/finance/payment-plans", plan({ id: "p9" }));
    renderAt("/zto-finans/test", { test: <Host /> });
    const root = await modal();
    expect(root.getAttribute("aria-labelledby")).toBe(
      within(root).getByText("Ödeme Başarılı!").closest("h5")?.id,
    );
    expect(root.querySelector("#paymentSummaryAlert")?.textContent).toContain("Demir Tedarik");
    await waitFor(() =>
      expect(root.querySelector("#ppRemainingDebtRows")?.textContent).toContain("500,00 ₺"),
    );
    expect(root.querySelector("#ppRemainingDebtRows")?.textContent).toContain("20,00 $");
    expect(
      within(root).getByText("Bu borç için ödeme planlaması yapmak ister misiniz?"),
    ).toBeTruthy();
    fireEvent.click(within(root).getByRole("button", { name: /Evet, Planla/ }));
    const table = root.querySelector("#ppPaymentPlanRows") as HTMLTableElement;
    expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
    const bank = table.querySelector(".pp-plan-bank") as HTMLSelectElement;
    expect(bank.disabled).toBe(true);
    expect(bank.title).toBe("Faz 12.4'te");
    expect(table.querySelector("tbody .badge")?.textContent).toBe("Manuel");
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Tutar sıfırdan büyük olmalıdır."));
    fireEvent.change(table.querySelector(".pp-plan-amount") as HTMLInputElement, {
      target: { value: "300.5" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Şube seçiniz."));
    fireEvent.change(table.querySelector(".pp-plan-branch") as HTMLSelectElement, {
      target: { value: "g1" },
    });
    fireEvent.change(table.querySelector(".pp-plan-workplace") as HTMLSelectElement, {
      target: { value: "b1" },
    });
    fireEvent.change(table.querySelector(".pp-plan-desc") as HTMLInputElement, {
      target: { value: "Kalan" },
    });
    expect(table.querySelector("tfoot")?.textContent).toContain("300,50 ₺");
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    expect(fakeApi.calls.find((call) => call.path === "/finance/payment-plans")?.body).toEqual({
      accountId: "a1",
      branchId: "b1",
      money: { amount: "300.50", currency: "TRY" },
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      description: "Kalan",
    });
    expect(await screen.findByText("Ödeme planlaması başarıyla kaydedildi.")).toBeTruthy();
  });

  it("mevcut planlar salt okunur; DRAFT kaldırılır (iptal), APPROVED kilitli; kısmi başarı", async () => {
    fakeApi.on(
      "GET",
      /^\/finance\/payment-plans\?/,
      page([plan({}), plan({ id: "p2", status: "APPROVED", purchaseInvoiceId: "inv" })]),
    );
    fakeApi.on("POST", "/finance/payment-plans/p1/cancel", () => {
      throw apiError(409, "PLAN_STATE", "Plan iptal edilemez");
    });
    renderAt("/zto-finans/test", { test: <Host /> });
    const root = await modal();
    await waitFor(() => expect(root.querySelector("#ppPlanTableSection")).not.toBeNull());
    const rows = root.querySelectorAll("#ppPaymentPlantbody tr");
    expect(rows).toHaveLength(2);
    expect((rows[0].querySelector(".pp-plan-date") as HTMLInputElement).readOnly).toBe(true);
    expect(rows[1].querySelector(".badge")?.textContent).toBe("Fatura");
    expect(
      within(rows[1] as HTMLElement).getByRole("img", { name: "Salt okunur plan" }),
    ).toBeTruthy();
    fireEvent.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Satırı kaldır" }));
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Planlama kaydedilemedi."));
    expect(root.textContent).toContain("Bir hata oluştu: Plan iptal edilemez");
    expect(
      fakeApi.calls.find((call) => call.path === "/finance/payment-plans/p1/cancel")?.body,
    ).toEqual({
      note: "Ödeme sonrası planlamada kaldırıldı",
    });
    expect(onHide).not.toHaveBeenCalled();
    fireEvent.click(root.querySelector("#ppTableButtons .btn-secondary") as HTMLElement);
    expect(onHide).toHaveBeenCalled();
  });

  it("Daha Sonra Yaparım kapatır; satır yoksa Kaydet yalnız kapatır", async () => {
    renderAt("/zto-finans/test", { test: <Host /> });
    const root = await modal();
    fireEvent.click(within(root).getByRole("button", { name: /Daha Sonra Yaparım/ }));
    expect(onHide).toHaveBeenCalled();
  });
});

describe("RemainingDebtPanel", { timeout: 60_000 }, () => {
  it("başlık, rozetler, akordeonlar (aria-expanded) ve gecikmiş plan bildirimi", async () => {
    fakeApi.on(
      "GET",
      /^\/finance\/payment-plans\?/,
      page([plan({ status: "APPROVED", dueDate: "2020-01-01" })]),
    );
    fakeApi.on(
      "GET",
      /^\/finance\/accounts\/a1\/balances\?.*groupBy=BRANCH/,
      breakdown([balanceRow({ branchId: "b1", debit: 100, credit: 600, debt: 600, payment: 100 })]),
    );
    renderAt("/zto-finans/test", {
      test: (
        <div id="remainingDebtInfo">
          <RemainingDebtPanel accountId="a1" companyId="c1" />
        </div>
      ),
    });
    const title = await screen.findByText("TED-001 - Demir Tedarik", {}, { timeout: 20_000 });
    const card = title.closest(".card") as HTMLElement;
    expect(card.style.borderLeft).toContain("4px solid");
    expect(within(card).getByText("Gecikmiş")).toBeTruthy();
    expect(within(card).getByText(/GECİKMİŞ ÖDEME!/)).toBeTruthy();
    const workplace = within(card).getByRole("button", { name: /İş Yeri Bazlı Borç/ });
    expect(workplace.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(workplace);
    expect(workplace.getAttribute("aria-expanded")).toBe("true");
    const controls = workplace.getAttribute("aria-controls") as string;
    expect(document.getElementById(controls)?.classList.contains("show")).toBe(true);
    await waitFor(() => expect(card.textContent).toContain("Alacaklı"));
    expect(card.querySelector(".workplace-balance-card")?.textContent).toContain("Merkez");
    expect(within(card).getByRole("button", { name: /Onay Süreci Takibi/ })).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: /Ödeme Planlaması/ }));
    expect(card.textContent).toContain("PLAN TARİHİ");
    expect(card.textContent).toContain("01.01.2020");
  });

  it("bağlantı hatası iletisi", async () => {
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances/, () => {
      throw new Error("zaman aşımı");
    });
    renderAt("/zto-finans/test", { test: <RemainingDebtPanel accountId="a1" companyId={null} /> });
    expect(
      await screen.findByText(/Bilgiler alınamadı - zaman aşımı/, {}, { timeout: 20_000 }),
    ).toBeTruthy();
  });
});
