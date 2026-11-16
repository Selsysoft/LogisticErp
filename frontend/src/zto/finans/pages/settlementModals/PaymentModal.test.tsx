// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { useCompanyStore } from "../../../../auth/companyStore";
import {
  TWO_COMPANIES,
  apiError,
  type ApiCall,
  fakeApi,
  page,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { PaymentModal } from "./index";
import type { PaymentModalProps } from "./index";
import { makeAccount } from "../transactions/transactionsTestUtils";
import {
  FUNDS,
  balanceRow,
  detail,
  fund,
  modalApi,
  openInvoice,
  settlement,
} from "./settlementModalsTestUtils";

const headers: Array<Record<string, string> | undefined> = [];

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown, extra?: Record<string, string>) => {
    if (method === "POST" && /payments|correct/.test(path)) headers.push(extra);
    return fakeApi.request(method, path, body);
  },
}));

const onHide = vi.fn();
const onSaved = vi.fn();

/** Barındıran sayfa gibi: onHide modalı kapatır (show=false), bileşen bağlı kalır. */
function Host(props: Partial<PaymentModalProps>) {
  const [show, setShow] = useState(true);
  return (
    <PaymentModal
      mode="add"
      {...props}
      show={show}
      onSaved={onSaved}
      onHide={() => {
        onHide();
        setShow(false);
      }}
    />
  );
}

function open(props: Partial<PaymentModalProps> = {}) {
  return renderAt("/zto-finans/test", { test: <Host {...props} /> });
}

async function modal(id = "addPaymentModal") {
  await waitFor(() => expect(document.querySelector(`.modal#${id}`)).not.toBeNull(), {
    timeout: 20_000,
  });
  return document.querySelector(`.modal#${id}`) as HTMLElement;
}

const PRESET: Partial<PaymentModalProps> = {
  presetAccountId: "a1",
  presetBranchId: "b1",
  presetFundAccountId: "k1",
  presetMethod: "CASH",
};

/** b1'de USD banka fonu (modalApi fon listesine eklenir). */
const USD_BANK = fund("bk3", {
  kind: "BANK",
  name: "USD Banka",
  bankName: "Akbank",
  currency: "USD",
});

function withUsdBank() {
  const all = [...FUNDS, USD_BANK];
  fakeApi.on("GET", /^\/finance\/funds\?/, ({ path }: ApiCall) => {
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    const kind = q.get("kind");
    const branches = q.getAll("branchId");
    return all.filter(
      (item) =>
        (!kind || item.kind === kind) &&
        (branches.length === 0 || branches.includes(item.branchId)),
    );
  });
  fakeApi.on("GET", /^\/finance\/funds\/bk3(\?|$)/, USD_BANK);
}

beforeEach(() => {
  fakeApi.reset();
  headers.length = 0;
  onHide.mockReset();
  onSaved.mockReset();
  signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"]);
  modalApi();
});
afterEach(cleanup);

describe("PaymentModal", { timeout: 60_000 }, () => {
  it("kök .modal#addPaymentModal.erp-modal, başlık, Nakit'te açıklama görünür, kalan borcu doldur yok", async () => {
    open(PRESET);
    const root = await modal();
    expect(root.classList.contains("erp-modal")).toBe(true);
    expect(root.querySelector(".modal-dialog.modal-xl.modal-dialog-scrollable")).not.toBeNull();
    expect(root.querySelector(".modal-content > form#paymentForm > .modal-body")).not.toBeNull();
    const title = within(root).getByText("Yeni Ödeme Ekle");
    expect(title.closest("h5")?.querySelector(".fa-plus-circle")).not.toBeNull();
    expect(root.getAttribute("aria-labelledby")).toBe(title.closest("h5")?.id);
    await waitFor(() =>
      expect((root.querySelector("#PaymentMethod") as HTMLSelectElement).value).toBe("CASH"),
    );
    expect(root.querySelector("#cashFields")).not.toBeNull();
    expect(within(root).getByLabelText(/Ödeme Açıklaması/)).toBeTruthy();
    expect(root.querySelector("textarea#Description")?.getAttribute("maxlength")).toBe("500");
    expect(root.textContent).not.toContain("Kalan borcu doldur");
    expect(root.textContent).not.toContain("ÇAPRAZ KUR");
    expect(root.textContent).toContain("Fatura Eşleştirme (Opsiyonel)");
    const options = [...(root.querySelector("#PaymentMethod") as HTMLSelectElement).options].map(
      (option) => option.textContent,
    );
    expect(options).toEqual([
      "Seçiniz",
      "Nakit",
      "Banka Havalesi/Eft",
      "Çek",
      "Senet",
      "Kredi Kartı",
    ]);
    expect(root.querySelector("#remainingDebtInfo")).not.toBeNull();
  });

  it("boş gönderimde ZTO iletileri listesi ve ilk hatalı alana odak", async () => {
    open();
    const root = await modal();
    const amount = root.querySelector("#PaymentAmountInput") as HTMLInputElement;
    expect(amount.getAttribute("aria-invalid")).toBe("false");
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Cari hesap seçiniz."));
    for (const text of [
      "İş yeri seçiniz.",
      "Ödeme yöntemi seçiniz.",
      "Geçerli bir tutar giriniz.",
    ]) {
      expect(root.textContent).toContain(text);
    }
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")).toContain("PaymentAmountInput-error");
    expect(document.getElementById("PaymentAmountInput-error")?.textContent).toBe(
      "Geçerli bir tutar giriniz.",
    );
    await waitFor(() => expect(document.activeElement?.id).toBe("CustomerAccountID"));
    expect(fakeApi.log("POST").filter((path) => path === "/finance/payments")).toEqual([]);
  });

  it("borcu aşan ödeme: Uyarı → Vazgeç (kayıt yok) → Tamam aynı anahtarla confirmWarnings", async () => {
    let calls = 0;
    fakeApi.on("POST", "/finance/payments", ({ body }: ApiCall) => {
      calls++;
      if (!(body as { confirmWarnings?: boolean }).confirmWarnings) {
        throw Object.assign(apiError(409, "CONFIRMATION_REQUIRED", "Onay gerekli"), {
          body: {
            code: "CONFIRMATION_REQUIRED",
            message: "Onay gerekli",
            details: [
              "currency=TRY",
              "companyId=c1",
              "companyOutstanding=100",
              "amount=250",
              "excess=150",
            ],
          },
        });
      }
      return settlement();
    });
    open(PRESET);
    const root = await modal();
    await waitFor(() =>
      expect(root.querySelector("#CashID")?.textContent).toContain("Merkez Kasa"),
    );
    fireEvent.change(root.querySelector("#PaymentAmountInput") as HTMLInputElement, {
      target: { value: "250" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    const cancel = await screen.findByRole("button", { name: "Vazgeç" }, { timeout: 20_000 });
    expect(screen.getByText(/Yine de kaydetmek istiyor musunuz\?/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Vazgeç" })).toBeNull());
    expect(calls).toBe(1);
    expect(onHide).not.toHaveBeenCalled();

    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Tamam/ }, { timeout: 20_000 }));
    await waitFor(() => expect(onHide).toHaveBeenCalled());
    expect(calls).toBe(3);
    const posts = fakeApi.calls.filter((call) => call.path === "/finance/payments");
    expect(posts[2].body).toMatchObject({
      method: "CASH",
      accountId: "a1",
      branchId: "b1",
      fundAccountId: "k1",
      money: { amount: "250.00", currency: "TRY" },
      confirmWarnings: true,
    });
    expect(headers[0]?.["Idempotency-Key"]).toBeTruthy();
    expect(headers[2]?.["Idempotency-Key"]).toBe(headers[0]?.["Idempotency-Key"]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "s-new" }));
  });

  it("kayıttan sonra kalan borç varsa 'Ödeme Başarılı!' plan modalı açılır", async () => {
    fakeApi.on("POST", "/finance/payments", settlement());
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances\?companyId=c1&groupBy=COMPANY$/, {
      groupBy: "COMPANY",
      splitDate: null,
      rows: [balanceRow({ debit: 100, credit: 600 })],
      payableInvoiceTotals: [],
      receivableInvoiceTotals: [],
      invoiceGaps: [],
    });
    open(PRESET);
    const root = await modal();
    await waitFor(() =>
      expect(root.querySelector("#CashID")?.textContent).toContain("Merkez Kasa"),
    );
    fireEvent.change(root.querySelector("#PaymentAmountInput") as HTMLInputElement, {
      target: { value: "250" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    // Başarı bildirimi modal kapandıktan sonra (MWG persistent-toast-notifications).
    expect(await screen.findByText("Ödeme başarıyla kaydedildi.")).toBeTruthy();
    const plan = await modal("postPaymentPlanningModal");
    expect(within(plan).getByText("Ödeme Başarılı!")).toBeTruthy();
    expect(plan.classList.contains("erp-modal")).toBe(false);
    expect(plan.querySelector("#ppRemainingDebtRows")?.textContent).toContain("500,00 ₺");
    expect(plan.querySelector("#ppPaidAmount")?.textContent).toBe("250,00 ₺");
    // Plan kaydı: plan modalı kapanır, bildirimi yine görünür (kapanışta e2e bulgusu).
    fakeApi.on("POST", "/finance/payment-plans", { id: "p9" });
    fireEvent.click(within(plan).getByRole("button", { name: /Evet, Planla/ }));
    const table = plan.querySelector("#ppPaymentPlanRows") as HTMLTableElement;
    fireEvent.change(table.querySelector(".pp-plan-amount") as HTMLInputElement, {
      target: { value: "300" },
    });
    fireEvent.change(table.querySelector(".pp-plan-branch") as HTMLSelectElement, {
      target: { value: "g1" },
    });
    fireEvent.change(table.querySelector(".pp-plan-workplace") as HTMLSelectElement, {
      target: { value: "b1" },
    });
    fireEvent.click(within(plan).getByRole("button", { name: /Kaydet/ }));
    expect(
      await screen.findByText("Ödeme planlaması başarıyla kaydedildi.", undefined, {
        timeout: 20_000,
      }),
    ).toBeTruthy();
    expect(document.querySelector(".modal#postPaymentPlanningModal")).toBeNull();
  });

  it("düzenleme: aktif şirket ≠ kaydın şirketi iken iş yeri seçili; düzeltme isteği", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"], TWO_COMPANIES);
    useCompanyStore.setState({ activeCompanyId: "c1" });
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      detail({
        companyId: "c2",
        branchId: "b2",
        branchName: "Beta Depo",
        fundAccountId: null,
        displayMethod: "BANK",
        method: "BANK",
      }),
    );
    fakeApi.on("POST", "/finance/settlements/s1/correct", settlement({ id: "s2" }));
    open({ mode: "edit", settlementId: "s1" });
    const root = await modal("editPaymentModal");
    expect(root.classList.contains("erp-modal")).toBe(true);
    expect(root.querySelector(".modal-dialog-scrollable")).toBeNull();
    const title = within(root).getByText("Ödeme Düzenle");
    expect(title.closest("h5")?.querySelector(".fa-plus-circle")).not.toBeNull();
    await waitFor(() =>
      expect((root.querySelector("#editWorkPlaceID") as HTMLSelectElement).value).toBe("b2"),
    );
    const method = root.querySelector("#editPaymentMethod") as HTMLSelectElement;
    // 12.3 (OK-12.3-25): düzenlemede beş yöntem (ZTO EPM:242-246).
    expect([...method.options].map((option) => option.value)).toEqual([
      "",
      "CASH",
      "BANK",
      "CHECK",
      "NOTE",
      "CREDIT_CARD",
    ]);
    expect(method.value).toBe("BANK");
    expect((root.querySelector("#editDescription") as HTMLTextAreaElement).value).toBe(
      "Eski açıklama",
    );
    fireEvent.change(within(root).getByLabelText("Düzeltme gerekçesi"), {
      target: { value: "Tutar hatası" },
    });
    // Banka seçilmeden kayıt: banka iletisi.
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Banka seçiniz."));
    fireEvent.click(root.querySelector("#editBankID") as HTMLElement);
    fireEvent.click(await within(root).findByRole("option", { name: /Garanti/ }));
    // Düzeltme önizlemesi (12.2 uyarısı) kayıttan önce sorulur.
    const preview = "/finance/settlements/check?type=PAYMENT&correctsSettlementId=s1";
    fakeApi.on("POST", preview, { warnings: [], invoiceGaps: [] });
    await waitFor(() => expect(fakeApi.log("POST")).toContain(preview), { timeout: 10_000 });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const call = fakeApi.calls.find((item) => item.path === "/finance/settlements/s1/correct");
    // Düzeltmeden sonra iptal edilmiş kayıt için önizleme yeniden sorulmaz (sunucu 422 verirdi;
    // kapanış e2e bulgusu: kayıt `["finance"]`'ı geçersiz kılınca açık önizleme yeniden çekiliyordu).
    const index = fakeApi.calls.indexOf(call as ApiCall);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(fakeApi.calls.slice(index + 1).map((item) => item.path)).not.toContain(preview);
    expect(call?.body).toMatchObject({
      reason: "Tutar hatası",
      replacement: {
        method: "BANK",
        channel: "TRANSFER",
        branchId: "b2",
        fundAccountId: "bk2",
        money: { amount: "100.00", currency: "TRY" },
        documentNo: "D-1",
      },
    });
  });

  it("taşınmış kayıt düzenlenemez: modal açılmaz, kilit iletisi gösterilir", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      detail({
        correctable: false,
        reversible: false,
        lockReason: "TRANSFERRED",
        transferred: true,
      }),
    );
    open({ mode: "edit", settlementId: "s1" });
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    expect(
      await screen.findByText("Cari taşıma geri alınmadan düzenlenemez/silinemez."),
    ).toBeTruthy();
    expect(document.querySelector(".modal#editPaymentModal")).toBeNull();
  });

  it("müşteri çeki ciro: tutar ve para birimi çekten kilitlenir, gövde instrumentId", async () => {
    fakeApi.on(
      "GET",
      /^\/finance\/instruments\?/,
      page([
        {
          id: "i1",
          kind: "CHECK",
          direction: "RECEIVED",
          number: "7654321",
          bankName: "Ziraat",
          accountId: "a1",
          endorsedAccountId: null,
          branchId: "b1",
          companyId: "c1",
          fundAccountId: null,
          money: { amount: "1200.0000", currency: "USD" },
          dueDate: "2026-12-20",
          status: "PORTFOLIO",
        },
      ]),
    );
    fakeApi.on("POST", "/finance/payments", settlement());
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "CHECK" });
    const root = await modal();
    await waitFor(() => expect(root.querySelector("#checkPaymentInfo")).not.toBeNull());
    const group = within(root).getByRole("radiogroup", { name: /Çek Türü/ });
    fireEvent.click(within(group).getByRole("radio", { name: /Müşteri Çeki Ciro Et/ }));
    const select = root.querySelector("#EndorsableCheckID") as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    expect(select.options[1].textContent).toBe(
      "Çek No: 7654321 | Ziraat | 1.200,00 $ | Keşideci: Demir Tedarik | Vade: 20.12.2026",
    );
    expect(root.querySelector("#endorsableCheckHelpText")?.textContent).toContain(
      "1 adet ciro edilebilir çek bulundu.",
    );
    fireEvent.change(select, { target: { value: "i1" } });
    expect(root.querySelector("#infoCheckAmount")?.textContent).toBe("1.200,00 $");
    expect((root.querySelector("#PaymentAmountInput") as HTMLInputElement).value).toBe("1200.00");
    expect((root.querySelector("#PaymentAmountInput") as HTMLInputElement).readOnly).toBe(true);
    expect((root.querySelector("#CurrencyID") as HTMLSelectElement).value).toBe("USD");
    expect((root.querySelector("#CurrencyID") as HTMLSelectElement).disabled).toBe(true);
    expect(root.textContent).toContain("Ciro modunda değiştirilemez");
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const body = fakeApi.calls.find((call) => call.path === "/finance/payments")?.body;
    expect(body).toMatchObject({
      method: "CHECK",
      instrumentId: "i1",
      money: { amount: "1200.00", currency: "USD" },
    });
    expect((body as { instrument?: unknown }).instrument).toBeUndefined();
  });

  it("kendi çek: yöntem kilitli, koçandan yaprak, manuel numara + koçan denetimi (CLG), 12.3 gövdesi", async () => {
    const leaf = {
      id: "l1",
      checkBookId: "cb1",
      checkBookSerial: "A-1",
      leafNo: 3,
      number: "0001234",
      micrCode: null,
      status: "UNUSED",
      usedDate: null,
      voidReason: null,
      fundAccountId: "bk1",
      fundName: "Ziraat Ana",
      fundBankName: "Ziraat",
      fundBankBranchName: "Konak",
      fundIban: null,
      branchId: "b1",
      branchName: "Merkez",
      companyId: "c1",
      instrumentId: null,
      instrumentStatus: null,
    };
    fakeApi.on("GET", /^\/finance\/check-leaves\?/, page([leaf]));
    fakeApi.on("GET", /^\/finance\/check-leaves\/lookup/, ({ path }: ApiCall) =>
      path.includes("number=1234567") ? [{ ...leaf, number: "1234567" }] : [],
    );
    fakeApi.on("POST", "/finance/payments", settlement({ method: "CHECK" }));
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "CHECK" });
    const root = await modal();
    await waitFor(() => expect(root.querySelector("#ownCheckFields")).not.toBeNull());
    expect((root.querySelector("#PaymentMethod") as HTMLSelectElement).disabled).toBe(true);
    const number = root.querySelector("#CheckNumber") as HTMLInputElement;
    expect(number.readOnly).toBe(true);
    expect((root.querySelector("#CheckBookID") as HTMLSelectElement).disabled).toBe(true);
    expect((root.querySelector("#IssueDate") as HTMLInputElement).disabled).toBe(false);
    // Banka → koçan yaprakları (ZTO seçenek metni).
    fireEvent.click(root.querySelector("#CheckBankID") as HTMLElement);
    fireEvent.click(await within(root).findByRole("option", { name: /Ziraat - Konak/ }));
    const book = root.querySelector("#CheckBookID") as HTMLSelectElement;
    await waitFor(() => expect(book.options.length).toBe(2));
    expect(book.options[1].textContent).toBe("Yaprak 3 - Çek No: 0001234 (A-1)");
    expect((root.querySelector("#BranchName") as HTMLInputElement).value).toBe("Konak");
    fireEvent.change(book, { target: { value: "l1" } });
    expect(number.value).toBe("0001234");
    // Manuel kip: koçan devre dışı, numara yazılabilir; koçanda kayıtlı numara engellenir.
    fireEvent.click(within(root).getByRole("button", { name: /Manuel Çek Numarası Gir/ }));
    expect(book.disabled).toBe(true);
    expect(number.readOnly).toBe(false);
    expect(within(root).getByRole("button", { name: /Koçandan Seç/ })).toBeTruthy();
    fireEvent.change(number, { target: { value: "12345" } });
    fireEvent.change(root.querySelector("#PaymentAmountInput") as HTMLInputElement, {
      target: { value: "5" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Çek numarası 7 haneli olmalıdır."));
    expect(number.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(number, { target: { value: "1234567" } });
    await waitFor(
      () =>
        expect(root.querySelector("#CheckNumber-leaf")?.textContent).toContain(
          "manuel olarak kullanılamaz, lütfen koçandan seçiniz.",
        ),
      { timeout: 5_000 },
    );
    expect(number.classList.contains("chk-leaf-blocked")).toBe(true);
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() =>
      expect(root.textContent).toContain(
        "Bu çek numarası koçan yaprağı olarak kayıtlı — manuel olarak kullanılamaz",
      ),
    );
    expect(fakeApi.calls.some((call) => call.path === "/finance/payments")).toBe(false);
    // Koçana dönüp yaprağı seçince kayıt yapraklı gider.
    fireEvent.click(within(root).getByRole("button", { name: /Koçandan Seç/ }));
    fireEvent.change(book, { target: { value: "l1" } });
    fireEvent.change(root.querySelector("#CheckDescription") as HTMLTextAreaElement, {
      target: { value: "Kira" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const body = fakeApi.calls.find((call) => call.path === "/finance/payments")?.body as {
      instrument: Record<string, unknown>;
    };
    expect(body.instrument).toMatchObject({
      kind: "CHECK",
      number: "0001234",
      fundAccountId: "bk1",
      checkLeafId: "l1",
      bankBranch: "Konak",
      description: "Kira",
    });
  });

  it("karşı taraf banka hesabı: maskeli IBAN cümlesi (sahip adı yok); personel carisinde cümle yok", async () => {
    const bankAccount = {
      id: "cb1",
      accountId: "a1",
      bankName: "Garanti",
      branchName: "Alsancak",
      ibanMasked: "TR** **** 4567",
      holderName: "Ali Veli",
      active: true,
    };
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts/, [bankAccount]);
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "BANK" });
    let root = await modal();
    let select = (await within(root).findByLabelText(
      /Cari Banka Hesabı Seçiniz/,
      {},
      { timeout: 20_000 },
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    expect(select.options[1].textContent).toBe("Garanti - TR** **** 4567");
    fireEvent.change(select, { target: { value: "cb1" } });
    const description = root.querySelector("#Description") as HTMLTextAreaElement;
    expect(description.value).toMatch(
      /^\[Garanti - Alsancak\] - \d{2}\/\d{2}\/\d{4} - TR\*\* \*\*\*\* 4567 iban bilgisine sahip hesaba yatırılmıştır\.$/,
    );
    expect(description.value).not.toContain("Ali Veli");
    fireEvent.change(select, { target: { value: "" } });
    expect(description.value).toBe("");
    cleanup();

    fakeApi.on("GET", /^\/finance\/accounts\?/, page([makeAccount({ type: "EMPLOYEE" })]));
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "BANK" });
    root = await modal();
    select = (await within(root).findByLabelText(
      /Cari Banka Hesabı Seçiniz/,
      {},
      { timeout: 20_000 },
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    fireEvent.change(select, { target: { value: "cb1" } });
    expect((root.querySelector("#Description") as HTMLTextAreaElement).value).toBe("");
  });
  it("fon seçimi para birimini değiştirince seçili eşleştirmeler silinir (zto-onyuz:F1)", async () => {
    withUsdBank();
    fakeApi.on("GET", /^\/finance\/settlements\/open-invoices/, [
      openInvoice("i1", "400.0000"),
      openInvoice("i2", "300.0000"),
    ]);
    fakeApi.on("POST", "/finance/payments", settlement());
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "BANK" });
    const root = await modal();
    fireEvent.change(root.querySelector("#PaymentAmountInput") as HTMLInputElement, {
      target: { value: "1000" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Faturaları Yükle/ }));
    fireEvent.click(
      await within(root).findByRole(
        "checkbox",
        { name: /F-i1 faturasını seç/ },
        { timeout: 20_000 },
      ),
    );
    fireEvent.click(within(root).getByRole("checkbox", { name: /F-i2 faturasını seç/ }));
    expect(root.querySelector("#totalAllocatedAmount")?.textContent).toBe("700,00");
    fireEvent.click(root.querySelector("#BankID") as HTMLElement);
    fireEvent.click(await within(root).findByRole("option", { name: /Akbank/ }));
    await waitFor(() =>
      expect(within(root).queryByRole("checkbox", { name: /F-i1 faturasını seç/ })).toBeNull(),
    );
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const body = fakeApi.calls.find((call) => call.path === "/finance/payments")?.body as {
      money: { currency: string };
      fundAccountId: string;
      allocations?: unknown;
    };
    expect(body.money.currency).toBe("USD");
    expect(body.fundAccountId).toBe("bk3");
    expect(body.allocations).toBeUndefined();
  });

  it("422 ALLOCATION_EXCEEDS_SETTLEMENT ödemeye özgü metinle gösterilir (zto-onyuz:F5)", async () => {
    fakeApi.on("POST", "/finance/payments", () => {
      throw apiError(422, "ALLOCATION_EXCEEDS_SETTLEMENT", "Sunucu iletisi");
    });
    open(PRESET);
    const root = await modal();
    await waitFor(() =>
      expect(root.querySelector("#CashID")?.textContent).toContain("Merkez Kasa"),
    );
    fireEvent.change(root.querySelector("#PaymentAmountInput") as HTMLInputElement, {
      target: { value: "250" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(
      () => expect(root.textContent).toContain("Toplam tahsis tutarı ödeme tutarını aşıyor!"),
      { timeout: 20_000 },
    );
    expect(root.textContent).not.toContain("tahsilat tutarını aşıyor");
    expect(onHide).not.toHaveBeenCalled();
  });

  it("döviz ödeme düzeltmesi: tarih ve para birimi aynıysa kaydın kuru korunur (goc-defter:F1)", async () => {
    withUsdBank();
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      detail({
        displayMethod: "BANK",
        method: "BANK",
        channel: "TRANSFER",
        fundAccountId: "bk3",
        money: { amount: "1000.0000", currency: "USD" },
        exchangeRate: 35,
      }),
    );
    fakeApi.on("POST", "/finance/settlements/s1/correct", settlement({ id: "s2" }));
    open({ mode: "edit", settlementId: "s1" });
    const root = await modal("editPaymentModal");
    expect(root.textContent).toContain(
      "Tarih veya para birimi değişirse kur TCMB'den yeniden alınır",
    );
    fireEvent.change(root.querySelector("#editDescription") as HTMLTextAreaElement, {
      target: { value: "Yalnız açıklama" },
    });
    await waitFor(() => expect(root.querySelector("#editBankID")?.textContent).toContain("Akbank"));
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const call = fakeApi.calls.find((item) => item.path === "/finance/settlements/s1/correct");
    expect(call?.body).toMatchObject({
      replacement: {
        method: "BANK",
        fundAccountId: "bk3",
        money: { amount: "1000.00", currency: "USD" },
        date: "2026-11-10",
        exchangeRate: 35,
        description: "Yalnız açıklama",
      },
    });
  });
});
