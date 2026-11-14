// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../../i18n";
import type { Fund, TransferDependent, TransferListRow } from "../../../../pages/finance/types";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  page,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { useCompanyStore } from "../../../../auth/companyStore";
import { FUNDS, TREE, makeFund, makeRow } from "./transferCenterTestUtils";
import { DeleteTransferModal } from "./DeleteTransferModal";
import { TransferCenterPage } from "./TransferCenterPage";
import { todayIso } from "./transferCenterLogic";

import { vi } from "vitest";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

/** b1'de ikinci Ziraat TRY hesabı (Virman hedefi). */
const ZIRAAT_2 = makeFund({ id: "f6", code: "B006", name: "Ziraat 2", balance: 50 });
const ALL_FUNDS: Fund[] = [...FUNDS, ZIRAAT_2];
const EMPTY_TX = { content: [], page: 0, size: 1, totalElements: 7, totalPages: 7, summary: null };

function api(funds: Fund[] = ALL_FUNDS, rows: TransferListRow[] = []) {
  fakeApi.on("GET", /^\/organization\/branch-tree/, TREE);
  fakeApi.on("GET", /^\/organization\/branches/, page([]));
  fakeApi.on("GET", "/finance/currencies", [{ code: "TRY", name: "Türk Lirası" }]);
  fakeApi.on("GET", /^\/finance\/funds(\?.*)?$/, funds);
  fakeApi.on("GET", /^\/finance\/funds\/transactions\?/, EMPTY_TX);
  fakeApi.on("GET", /^\/finance\/funds\/transfers\?/, ({ path }: { path: string }) => ({
    ...page(rows),
    totalElements: path.includes("size=1&") || path.endsWith("size=1") ? 3 : rows.length,
  }));
  fakeApi.on("GET", /^\/finance\/funds\/transfers\/summary/, [
    { group: "VIREMENT_EFT_WIRE", count: 2, amounts: [] },
    { group: "TOTAL", count: 5, amounts: [] },
  ]);
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const change = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id) as HTMLElement, { target: { value } });

async function open(path = "/zto-finans/transfer-merkezi") {
  renderAt(path, { "transfer-merkezi": <TransferCenterPage /> });
  await waitFor(() =>
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/funds?"))).toBe(true),
  );
  await screen.findByText("Yeni Transfer", { selector: "h6" });
}

async function selectOption(id: string, value: string) {
  await waitFor(() =>
    expect(
      Array.from(document.querySelectorAll<HTMLOptionElement>(`#${id} option`)).some(
        (o) => o.value === value,
      ),
    ).toBe(true),
  );
  change(id, value);
}

beforeEach(() => {
  fakeApi.reset();
  signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"]);
  api();
});
afterEach(cleanup);

describe("TransferCenterPage — Yeni Transfer", { timeout: 30_000 }, () => {
  it("başlık, sekmeler ve rozetler; tür kartları aria-pressed, bilgi kutusu ZTO metni", async () => {
    await open();
    expect(
      screen.getByText("Virman / EFT / Havale / Döviz Bozum / Banka & Kasa Transferi İşlemleri"),
    ).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.id)).toEqual([
      "newTransfer-tab",
      "transfers-tab",
      "statement-tab",
      "cash-statement-tab",
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(q("#transferCountBadge").textContent).toBe("3"));
    expect(q("#bankStatementCountBadge").textContent).toBe("7");
    const card = screen.getByRole("button", { name: /Virman \/ EFT \/ Havale Bankadan/ });
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(q("#transferTypeInfoAlert").textContent).toContain(
      "Virman / EFT / Havale tiplerinden birini seçin",
    );
    expect(q("#transferTypeInfoAlert").getAttribute("role")).toBe("status");
  });

  it("boş kayıt → 'Kaynak ve hedef banka seçiniz.' (üst uyarı + alan hatası, aria-invalid)", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    expect(screen.getByRole("alert").textContent).toContain("Kaynak ve hedef banka seçiniz.");
    expect(q("#newSourceBank-error").hidden).toBe(false);
    expect(fakeApi.log("POST")).toEqual([]);
  });

  it("alt tür boşaltılınca 'Lütfen önce transfer tipini seçin.'; Virman kuralı: farklı banka pasif", async () => {
    await open();
    change("virmanTransferType", "VIREMENT");
    change("virmanTransferType", "");
    expect(q("#targetBankWarning").textContent).toContain("Lütfen önce transfer tipini seçin.");
    change("virmanTransferType", "VIREMENT");
    await selectOption("newSourceWorkPlace", "b1");
    // Virman'da hedef iş yeri kaynağa kilitli.
    expect(q<HTMLSelectElement>("#newTargetWorkPlace").value).toBe("b1");
    await selectOption("newSourceBank", "f1");
    const target = q<HTMLSelectElement>("#newTargetBank");
    const disabled = Array.from(target.options)
      .filter((o) => o.disabled)
      .map((o) => o.value);
    expect(disabled.sort()).toEqual(["f1", "f2", "f3"]);
    expect(q("#targetBankWarning").textContent).toContain(
      "Farklı para birimine sahip bankalar pasif. Virman için farklı bankalar pasif. Aynı hesap pasif.",
    );
  });

  it("Virman → kayıt: POST /funds/transfers, BS-11 'Virman başarıyla oluşturuldu.', Tamam → Transferler", async () => {
    fakeApi.on("POST", "/finance/funds/transfers", {
      id: "t1",
      code: "VRM-000001",
      targetMoney: { amount: "250.00", currency: "TRY" },
    });
    await open();
    change("virmanTransferType", "VIREMENT");
    await selectOption("newSourceWorkPlace", "b1");
    await selectOption("newSourceBank", "f1");
    await selectOption("newTargetBank", "f6");
    expect(q("#targetBankBalance").textContent).toBe("50,00 ₺");
    expect(screen.getByText(/Virman Tutarı/)).toBeTruthy();
    change("newSourceAmount", "250");
    change("newDocumentNo", "DK-1");
    expect(q("#calcSourceAmount").textContent).toBe("250,00 ₺");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText("Virman başarıyla oluşturuldu.");
    const call = fakeApi.calls.find((c) => c.method === "POST");
    expect(call?.body).toEqual({
      transferType: "VIREMENT",
      fromFundId: "f1",
      toFundId: "f6",
      money: { amount: "250.00", currency: "TRY" },
      date: todayIso(),
      documentNo: "DK-1",
      description: undefined,
    });
    expect(q("#transferResultCode").textContent).toBe("VRM-000001");
    const ok = screen.getByRole("button", { name: "Tamam" });
    expect(document.activeElement).toBe(ok);
    fireEvent.click(ok);
    await waitFor(() => expect(q("#transfers-tab").getAttribute("aria-selected")).toBe("true"));
  });

  it("sunucu hatası BS-11 'İşlem Hatası' + ileti", async () => {
    fakeApi.on("POST", "/finance/funds/transfers", () => {
      throw apiError(409, "INSUFFICIENT_FUNDS", "Yetersiz bakiye.");
    });
    await open();
    change("virmanTransferType", "VIREMENT");
    await selectOption("newSourceWorkPlace", "b1");
    await selectOption("newSourceBank", "f1");
    await selectOption("newTargetBank", "f6");
    change("newSourceAmount", "5000");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText("İşlem Hatası");
    expect(q("#transferResultMessage").textContent).toBe("Hata: Yetersiz bakiye.");
  });

  it("BS-12: eksiye izinli kaynakta 'Bakiye Bilgilendirmesi', ilk odak Vazgeç; Evet → kayıt", async () => {
    fakeApi.reset();
    api([makeFund({ allowNegative: true, balance: 100 }), ...ALL_FUNDS.slice(1)]);
    fakeApi.on("POST", "/finance/funds/transfers", {
      id: "t1",
      code: "VRM-2",
      targetMoney: { amount: "150.00", currency: "TRY" },
    });
    await open();
    change("virmanTransferType", "VIREMENT");
    await selectOption("newSourceWorkPlace", "b1");
    await selectOption("newSourceBank", "f1");
    await selectOption("newTargetBank", "f6");
    change("newSourceAmount", "150");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText("Bakiye Bilgilendirmesi");
    const modal = q("#negativeBalanceConfirmModal");
    expect(modal.querySelector(".modal-header.bg-light.border-0")).not.toBeNull();
    expect(q("#negativeBalanceAfter").textContent).toBe("-50,00 ₺");
    expect(document.activeElement?.textContent).toBe("Vazgeç");
    expect(fakeApi.log("POST")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Evet, Devam Et" }));
    await screen.findByText("Virman başarıyla oluşturuldu.");
  });

  it("şirketler arası EFT: bilgi satırı, neden zorunlu, POST /intercompany-transfers", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"], TWO_COMPANIES);
    fakeApi.on("POST", "/finance/intercompany-transfers", {
      id: "i1",
      code: "SVR-000001",
      money: { amount: "100.00", currency: "TRY" },
    });
    await open();
    change("virmanTransferType", "EFT");
    await selectOption("newSourceWorkPlace", "b1");
    await selectOption("newSourceBank", "f1");
    await selectOption("newTargetWorkPlace", "b3");
    await selectOption("newTargetBank", "f5");
    expect(q("#transferTypeInfoAlert").textContent).toContain(
      "Şirketler arası transfer: Acme → Beta. Grup şirketi carilerine otomatik kayıt oluşur.",
    );
    const reason = q<HTMLSelectElement>("#transferReasonType");
    expect(Array.from(reason.options).map((o) => o.textContent)).toEqual([
      "Seçiniz",
      "Acme - Beta 'YE BORCUNU ÖDÜYOR / Beta - Acme 'TAN ALACAĞINI TAHSİL EDİYOR",
      "Acme - Beta 'YE BORÇ VERİYOR / Beta - Acme 'TAN BORÇ ALIYOR",
    ]);
    change("newSourceAmount", "100");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    expect(screen.getByRole("alert").textContent).toContain("Transfer nedeni seçiniz.");
    expect(reason.getAttribute("aria-invalid")).toBe("true");
    change("transferReasonType", "DEBT_PAID");
    fireEvent.click(screen.getByRole("button", { name: /Kaydet/ }));
    await screen.findByText("Şirketler arası transfer başarıyla oluşturuldu.");
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      transferType: "EFT",
      reasonType: "DEBT_PAID",
      fromFundId: "f1",
      toFundId: "f5",
    });
  });

  it("derin bağlantı 'EFT Al': hedef iş yeri fondan türetilir, sonra hedef banka", async () => {
    await open("/zto-finans/transfer-merkezi?transferType=eft&targetFundId=f4&sourceFundId=f1");
    await waitFor(() => expect(q<HTMLSelectElement>("#newTargetWorkPlace").value).toBe("b2"));
    expect(q<HTMLSelectElement>("#virmanTransferType").value).toBe("EFT");
    expect(q<HTMLSelectElement>("#newSourceWorkPlace").value).toBe("b1");
    await waitFor(() => expect(q<HTMLSelectElement>("#newTargetBank").value).toBe("f4"));
    expect(q<HTMLSelectElement>("#newSourceBank").value).toBe("f1");
  });

  it("Döviz: hedef iş yeri seçilmeden ipucu; kur hesabı ve maliyet paneli", async () => {
    fakeApi.on("GET", /^\/finance\/funds\/transfers\/fx-/, []);
    await open();
    fireEvent.click(screen.getByRole("button", { name: /Döviz Bozum \/ Döviz Alım Farklı/ }));
    await selectOption("newSourceWorkPlace", "b1");
    await selectOption("newSourceBank", "f2");
    expect(q("#targetBankWarning").textContent).toContain("Önce hedef iş yeri seçiniz.");
    await selectOption("newTargetWorkPlace", "b1");
    await selectOption("newTargetBank", "f1");
    fireEvent.click(q("#rateCalcSymbolBtn"));
    expect(q("#rateCalcSymbolBtn").getAttribute("aria-pressed")).toBe("true");
    change("newSourceAmount", "100");
    change("newRate1", "34");
    expect(q<HTMLInputElement>("#newTargetAmount").value).toBe("3.400,00");
    expect(q<HTMLInputElement>("#newTargetAmount").readOnly).toBe(true);
    change("newKmvRate", "0.2");
    expect(q("#calcKmv").textContent).toBe("6,80 ₺");
    expect(q("#rateCurrencyLabel").textContent).toBe("₺/$");
  });

  it("FINANCE_PAYMENT_CREATE yoksa Yeni Transfer gövdesi erişim reddi", async () => {
    signIn(["FINANCE_VIEW"]);
    renderAt("/zto-finans/transfer-merkezi", { "transfer-merkezi": <TransferCenterPage /> });
    expect(await screen.findByText(/yetki/i)).toBeTruthy();
    expect(document.querySelector("#btnSaveTransfer")).toBeNull();
  });
});

describe("TransferCenterPage — Transferler sekmesi", { timeout: 30_000 }, () => {
  it("özet kartları, satırlar; şirketler arası satırda Düzenle yok; iptal rozeti", async () => {
    fakeApi.reset();
    api(ALL_FUNDS, [
      makeRow(),
      makeRow({ id: "t2", code: "SVR-1", recordType: "INTERCOMPANY", transferType: "EFT" }),
      makeRow({ id: "t3", code: "VRM-3", status: "REVERSED" }),
    ]);
    await open("/zto-finans/transfer-merkezi?tab=transfers&q=VRM");
    const table = await screen.findByRole("grid");
    await within(table).findByText("VRM-000001");
    expect(
      fakeApi.log("GET").some((p) => p.includes("/funds/transfers?") && p.includes("q=VRM")),
    ).toBe(true);
    const cards = Array.from(document.querySelectorAll(".summary-card"), (c) => c.textContent);
    expect(cards[0]).toBe("Virman / EFT / Havale2");
    expect(cards).toContain("Toplam5");
    expect(within(table).getAllByRole("button", { name: /^Düzenle/ })).toHaveLength(1);
    expect(within(table).getAllByRole("button", { name: /^Sil/ })).toHaveLength(2);
    expect(within(table).getByText("İptal")).toBeTruthy();
    expect(within(table).getByText("Şirketler Arası EFT").className).toBe(
      "transfer-badge intercompany",
    );
  });
});

describe("TransferCenterPage — kaynak belge bağlantısı (F-12.2-R2)", { timeout: 30_000 }, () => {
  it("eski tarihli kodla açılış: istek bağlantıdaki tarihle ve şirket 'Tümü' ile gider", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"], TWO_COMPANIES);
    useCompanyStore.setState({ activeCompanyId: "c2" });
    api(ALL_FUNDS, [makeRow({ code: "VRM-000004", transferDate: "2026-09-01" })]);
    await open(
      "/zto-finans/transfer-merkezi?tab=transfers&q=VRM-000004&from=2026-09-01&to=2026-09-01",
    );
    await within(await screen.findByRole("grid")).findByText("VRM-000004");
    const calls = fakeApi
      .log("GET")
      .filter((p) => p.includes("/funds/transfers?") && p.includes("q=VRM-000004"));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain("from=2026-09-01");
      expect(call).toContain("to=2026-09-01");
      expect(call).not.toContain("companyId=");
    }
    expect(q<HTMLInputElement>("#transferFilterStartDate").value).toBe("2026-09-01");
    expect(q<HTMLInputElement>("#transferFilterEndDate").value).toBe("2026-09-01");
  });
});

describe("DeleteTransferModal (BS-10)", { timeout: 30_000 }, () => {
  function renderModal(row: TransferListRow) {
    renderAt("/zto-finans/test", {
      test: <DeleteTransferModal row={row} onHide={() => undefined} />,
    });
  }

  it("bağımlı bozum varsa engel bloğu ve Sil pasif", async () => {
    const dependent: TransferDependent = {
      transferId: "t8",
      code: "DBZ-8",
      date: "2026-11-12",
      sourceFundName: "Ziraat USD",
      targetFundName: "Ziraat TL",
      usedAmount: 40,
    };
    fakeApi.on("GET", "/finance/funds/transfers/t7/dependents", [dependent]);
    renderModal(makeRow({ id: "t7", code: "DBZ-7", transferType: "FX_EXCHANGE" }));
    await screen.findByText("Bu döviz bozum silinemez!");
    expect(q("#deleteBlockedMsg").textContent).toBe(
      " 1 bozum bu transferi kaynak olarak kullanıyor.",
    );
    expect(q("#deleteTransferInfo").textContent).toBe("DBZ-7 | Döviz Bozum");
    expect(screen.getByText("DBZ-8")).toBeTruthy();
    expect(q<HTMLButtonElement>("#btnConfirmDelete").disabled).toBe(true);
  });

  it("ileri tarihli transfer kendi tarihinde ters çevrilir; ilk odak İptal", async () => {
    fakeApi.on("POST", "/finance/funds/transfers/t1/reverse", {});
    renderModal(makeRow({ transferDate: "2099-01-05" }));
    await screen.findByText("Transfer Sil");
    expect(document.activeElement?.textContent).toBe("İptal");
    change("deleteTransferReason", "Hatalı giriş");
    await act(async () => {
      fireEvent.click(q("#btnConfirmDelete"));
    });
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
      date: "2099-01-05",
      reason: "Hatalı giriş",
    });
  });

  it("şirketler arası satır /intercompany-transfers/{id}/reverse; hata iletisi gösterilir", async () => {
    fakeApi.on("POST", "/finance/intercompany-transfers/i1/reverse", () => {
      throw apiError(409, "SETTLEMENT_USED_IN_FX_EXCHANGE", "Önce bozumu iptal edin.");
    });
    renderModal(makeRow({ id: "i1", recordType: "INTERCOMPANY", transferType: "EFT" }));
    await screen.findByText("Transfer Sil");
    await act(async () => {
      fireEvent.click(q("#btnConfirmDelete"));
    });
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
      date: todayIso(),
      reason: undefined,
    });
    expect(screen.getByRole("alert").textContent).toBe("Önce bozumu iptal edin.");
  });
});
