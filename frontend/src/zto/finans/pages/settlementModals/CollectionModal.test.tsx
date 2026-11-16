// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { CollectionModal } from "./index";
import type { CollectionModalProps } from "./index";
import {
  FUNDS,
  balanceRow,
  detail,
  fund,
  modalApi,
  openInvoice,
  settlement,
} from "./settlementModalsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const onHide = vi.fn();

function Host(props: Partial<CollectionModalProps>) {
  const [show, setShow] = useState(true);
  return (
    <CollectionModal
      mode="add"
      {...props}
      show={show}
      onHide={() => {
        onHide();
        setShow(false);
      }}
    />
  );
}

function open(props: Partial<CollectionModalProps> = {}) {
  return renderAt("/zto-finans/test", { test: <Host {...props} /> });
}

async function modal(id = "addCollectionModal") {
  await waitFor(() => expect(document.querySelector(`.modal#${id}`)).not.toBeNull(), {
    timeout: 20_000,
  });
  return document.querySelector(`.modal#${id}`) as HTMLElement;
}

beforeEach(() => {
  fakeApi.reset();
  onHide.mockReset();
  signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"]);
  modalApi({
    rows: [balanceRow({ debit: 900, credit: 100, receivable: 900, collection: 100 })],
  });
});
afterEach(cleanup);

describe("CollectionModal", { timeout: 60_000 }, () => {
  it("çek tahsilatı Bankaya Yatırıldı: AT_BANK + banka gövdesi; 12.3 alanları gönderilir", async () => {
    fakeApi.on("POST", "/finance/collections", settlement({ type: "COLLECTION", method: "CHECK" }));
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "CHECK" });
    const root = await modal();
    expect(root.classList.contains("erp-modal")).toBe(true);
    expect(within(root).getByText("Yeni Tahsilat Ekle")).toBeTruthy();
    await waitFor(() => expect(root.querySelector("#checkTopFields")).not.toBeNull());
    // Çek durumu radyo grubu (MWG forms): role=radiogroup + "Çek Durumu" etiketi.
    const group = within(root).getByRole("radiogroup", { name: /Çek Durumu/ });
    expect(
      (within(group).getByRole("radio", { name: /Bankaya Yatırıldı/ }) as HTMLInputElement).checked,
    ).toBe(true);
    for (const id of ["BranchName", "IssueDate", "CheckDescription"]) {
      expect((root.querySelector(`#${id}`) as HTMLInputElement).disabled).toBe(false);
    }
    fireEvent.change(root.querySelector("#BranchName") as HTMLInputElement, {
      target: { value: "Merkez Şube" },
    });
    fireEvent.change(root.querySelector("#CheckDescription") as HTMLTextAreaElement, {
      target: { value: "Açıklama" },
    });
    fireEvent.change(root.querySelector("#CheckNumber") as HTMLInputElement, {
      target: { value: "1234567" },
    });
    fireEvent.change(root.querySelector("#BankName") as HTMLInputElement, {
      target: { value: "Ziraat Bankası" },
    });
    fireEvent.change(root.querySelector("#CollectionAmountInput") as HTMLInputElement, {
      target: { value: "750,5" },
    });
    expect((root.querySelector("#Amount") as HTMLInputElement).value).toBe("750.50");
    expect(root.querySelector("#calculationCollectionResult")?.textContent).toContain("750.50 ₺");
    // Banka seçilmeden kayıt: ZTO iletisi.
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() =>
      expect(root.textContent).toContain("Çekin yatırıldığı banka hesabını seçiniz."),
    );
    fireEvent.click(root.querySelector("#CheckBankID") as HTMLElement);
    fireEvent.click(await within(root).findByRole("option", { name: /Ziraat - Konak/ }));
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const call = fakeApi.calls.find((item) => item.path === "/finance/collections");
    expect(call?.body).toMatchObject({
      method: "CHECK",
      accountId: "a1",
      branchId: "b1",
      money: { amount: "750.50", currency: "TRY" },
      instrument: {
        kind: "CHECK",
        number: "1234567",
        bankName: "Ziraat Bankası",
        initialStatus: "AT_BANK",
        fundAccountId: "bk1",
        bankBranch: "Merkez Şube",
        description: "Açıklama",
      },
    });
    expect((call?.body as { instrument: Record<string, unknown> }).instrument.issueDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(await screen.findByText("Tahsilat başarıyla kaydedildi.")).toBeTruthy();
    // Tahsilatta plan modalı yok.
    expect(document.querySelector("#postPaymentPlanningModal")).toBeNull();
  });

  it("Kasaya Al (Ciro) → PORTFOLIO + emanet kasası (zorunlu), banka gönderilmez", async () => {
    fakeApi.on("POST", "/finance/collections", settlement({ type: "COLLECTION" }));
    open({ presetAccountId: "a1", presetBranchId: "b1", presetMethod: "CHECK" });
    const root = await modal();
    await waitFor(() => expect(root.querySelector("#checkTopFields")).not.toBeNull());
    fireEvent.click(within(root).getByRole("radio", { name: /Kasaya Al/ }));
    fireEvent.change(root.querySelector("#CheckNumber") as HTMLInputElement, {
      target: { value: "7654321" },
    });
    fireEvent.change(root.querySelector("#CollectionAmountInput") as HTMLInputElement, {
      target: { value: "10" },
    });
    // Kasa seçilmeden kayıt: ZTO iletisi (cjs:2945-2948).
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(root.textContent).toContain("Çekin tutulduğu kasayı seçiniz."));
    fireEvent.click(root.querySelector("#CheckCashID") as HTMLElement);
    fireEvent.click(await within(root).findByRole("option", { name: /Merkez Kasa/ }));
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const body = fakeApi.calls.find((item) => item.path === "/finance/collections")?.body as {
      instrument: Record<string, unknown>;
    };
    expect(body.instrument.initialStatus).toBe("PORTFOLIO");
    expect(body.instrument.fundAccountId).toBeUndefined();
    expect(body.instrument.custodyFundId).toBe("k1");
  });

  it("kalan alacak paneli: para birimi düğmesi, akordeon ve 4 kart", async () => {
    open({ presetAccountId: "a1" });
    const root = await modal();
    const header = await within(root).findByRole(
      "button",
      { name: /CARİ ALACAK BİLGİLERİ/ },
      { timeout: 20_000 },
    );
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector("#creditInfoBody")?.hasAttribute("hidden")).toBe(true);
    fireEvent.keyDown(header, { key: "Enter" });
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector("#creditInfoBody")?.textContent).toContain("Toplam Alacak");
    expect(root.querySelector("#customerNetBalanceCard")?.textContent).toContain("800,00 ₺");
    expect(root.querySelector("#customerNetBalanceCard")?.textContent).toContain("Borçlu");
    expect(within(root).getByRole("button", { name: "₺" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("düzenleme: bg-warning başlık fa-edit, Güncelle btn-primary btn-update, cari kilitli, düzeltme", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      detail({
        type: "COLLECTION",
        displayMethod: "CASH",
        money: { amount: "300.0000", currency: "TRY" },
      }),
    );
    fakeApi.on(
      "POST",
      "/finance/settlements/s1/correct",
      settlement({ id: "s2", type: "COLLECTION" }),
    );
    open({ mode: "edit", settlementId: "s1" });
    const root = await modal("editCollectionModal");
    expect(root.classList.contains("erp-modal")).toBe(true);
    const header = root.querySelector(".modal-header") as HTMLElement;
    expect(header.classList.contains("bg-warning")).toBe(true);
    expect(header.querySelector(".fa-edit")).not.toBeNull();
    expect(within(header).getByText("Tahsilat Düzenle")).toBeTruthy();
    const update = within(root).getByRole("button", { name: /Güncelle/ });
    expect(update.className).toBe("btn btn-primary btn-update");
    expect(root.querySelector("#EditCustomerAccountID")?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(root.textContent).toContain("Belge / Fiş / Dekont No");
    expect(root.textContent).toContain("Tahsilat Tutarı ve Para Birimi");
    expect(root.querySelector("#customerBankSection")).toBeNull();
    await waitFor(() =>
      expect((root.querySelector("#EditCollectionAmountInput") as HTMLInputElement).value).toBe(
        "300.00",
      ),
    );
    fireEvent.click(update);
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const call = fakeApi.calls.find((item) => item.path === "/finance/settlements/s1/correct");
    expect(call?.body).toMatchObject({
      replacement: {
        method: "CASH",
        fundAccountId: "k1",
        money: { amount: "300.00", currency: "TRY" },
      },
    });
    expect(await screen.findByText("Tahsilat başarıyla güncellendi.")).toBeTruthy();
  });

  it("fatura eşleştirme: Faturaları Yükle, otomatik doldurma, aşım uyarısı ve gövde", async () => {
    fakeApi.on("GET", /^\/finance\/settlements\/open-invoices/, [
      openInvoice("i1", "80.0000", { targetType: "FREIGHT_INVOICE", typeName: "Navlun Faturası" }),
      openInvoice("i2", "500.0000", { targetType: "FREIGHT_INVOICE", typeName: "Navlun Faturası" }),
      openInvoice("i3", "40.0000", { currency: "USD" }),
    ]);
    fakeApi.on("POST", "/finance/collections", settlement({ type: "COLLECTION" }));
    open({
      presetAccountId: "a1",
      presetBranchId: "b1",
      presetFundAccountId: "k1",
      presetMethod: "CASH",
    });
    const root = await modal();
    fireEvent.change(root.querySelector("#CollectionAmountInput") as HTMLInputElement, {
      target: { value: "100" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Faturaları Yükle/ }));
    const first = await within(root).findByRole(
      "checkbox",
      { name: /F-i1 faturasını seç/ },
      { timeout: 20_000 },
    );
    expect(root.querySelector("#orderCreditInfo")?.textContent).toContain(
      "Kalan Fatura Alacakları:",
    );
    expect(
      (within(root).getByRole("checkbox", { name: /F-i3 faturasını seç/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(root.textContent).toContain("Farklı para birimi");
    fireEvent.click(first);
    expect((root.querySelector("#invoiceAmount_i1") as HTMLInputElement).value).toBe("80.00");
    const selectAll = root.querySelector("#selectAllInvoices") as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(true);
    fireEvent.click(within(root).getByRole("checkbox", { name: /F-i2 faturasını seç/ }));
    expect((root.querySelector("#invoiceAmount_i2") as HTMLInputElement).value).toBe("20.00");
    expect(selectAll.checked).toBe(true);
    expect(root.querySelector("#totalAllocatedAmount")?.textContent).toBe("100,00");
    // Tutar düşünce eşleşmeler yeni sınıra kırpılır.
    fireEvent.change(root.querySelector("#CollectionAmountInput") as HTMLInputElement, {
      target: { value: "50" },
    });
    await waitFor(() =>
      expect((root.querySelector("#invoiceAmount_i1") as HTMLInputElement).value).toBe("50.00"),
    );
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() =>
      expect(root.textContent).toContain("Toplam tahsis tutarı tahsilat tutarını aşıyor!"),
    );
    expect(root.querySelector("#allocationWarning")?.hasAttribute("hidden")).toBe(false);
    fireEvent.click(within(root).getByRole("checkbox", { name: /F-i2 faturasını seç/ }));
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const body = fakeApi.calls.find((item) => item.path === "/finance/collections")?.body as {
      allocations: unknown;
    };
    expect(body.allocations).toEqual([
      { targetType: "FREIGHT_INVOICE", targetId: "i1", amount: "50.00" },
    ]);
  });
  it("422 ALLOCATION_TARGET_INVALID reason=CURRENCY nedene özgü metin (zto-onyuz:F5)", async () => {
    fakeApi.on("POST", "/finance/collections", () => {
      throw Object.assign(apiError(422, "ALLOCATION_TARGET_INVALID", "Sunucu iletisi"), {
        body: {
          code: "ALLOCATION_TARGET_INVALID",
          message: "Sunucu iletisi",
          details: ["targetId=i1", "reason=CURRENCY"],
        },
      });
    });
    open({
      presetAccountId: "a1",
      presetBranchId: "b1",
      presetFundAccountId: "k1",
      presetMethod: "CASH",
    });
    const root = await modal();
    fireEvent.change(root.querySelector("#CollectionAmountInput") as HTMLInputElement, {
      target: { value: "10" },
    });
    fireEvent.click(within(root).getByRole("button", { name: /Kaydet/ }));
    await waitFor(
      () =>
        expect(root.textContent).toContain(
          "Bu faturanın para birimi seçilen tahsilat para birimi ile aynı değil.",
        ),
      { timeout: 20_000 },
    );
    expect(root.textContent).not.toContain("Sunucu iletisi");
  });

  it("döviz tahsilat düzenlemesi: tarih değişince önyüklenen eski kur temizlenir (goc-defter:F1)", async () => {
    const usdCash = fund("k3", { name: "Döviz Kasa", currency: "USD" });
    const all = [...FUNDS, usdCash];
    fakeApi.on("GET", /^\/finance\/funds\?/, ({ path }: { path: string }) => {
      const q = new URLSearchParams(path.split("?")[1] ?? "");
      const kind = q.get("kind");
      const branches = q.getAll("branchId");
      return all.filter(
        (item) =>
          (!kind || item.kind === kind) &&
          (branches.length === 0 || branches.includes(item.branchId)),
      );
    });
    fakeApi.on("GET", /^\/finance\/funds\/k3(\?|$)/, usdCash);
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      detail({
        type: "COLLECTION",
        displayMethod: "CASH",
        fundAccountId: "k3",
        money: { amount: "500.0000", currency: "USD" },
        exchangeRate: 34.5,
      }),
    );
    fakeApi.on(
      "POST",
      "/finance/settlements/s1/correct",
      settlement({ id: "s2", type: "COLLECTION" }),
    );
    open({ mode: "edit", settlementId: "s1" });
    const root = await modal("editCollectionModal");
    const rate = root.querySelector("#EditExchangeRate") as HTMLInputElement;
    await waitFor(() => expect(rate.value).toBe("34.5000"));
    await waitFor(() => expect(root.querySelector("#EditCashID")?.textContent).toContain("Döviz"));
    fireEvent.change(root.querySelector("#EditCollectionDate") as HTMLInputElement, {
      target: { value: "2026-11-11" },
    });
    expect(rate.value).toBe("");
    fireEvent.click(within(root).getByRole("button", { name: /Güncelle/ }));
    await waitFor(() => expect(onHide).toHaveBeenCalled(), { timeout: 20_000 });
    const call = fakeApi.calls.find((item) => item.path === "/finance/settlements/s1/correct");
    const replacement = (call?.body as { replacement: Record<string, unknown> }).replacement;
    expect(replacement).toMatchObject({
      date: "2026-11-11",
      money: { amount: "500.00", currency: "USD" },
    });
    expect(replacement.exchangeRate).toBeUndefined();
  });
});
