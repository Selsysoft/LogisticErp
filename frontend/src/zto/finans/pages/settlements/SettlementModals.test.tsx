// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { SettlementType } from "../../../../pages/finance/types";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { DailyReportModal } from "./DailyReportModal";
import { ReverseSettlementModal } from "./ReverseSettlementModal";
import { SettlementDetailModal } from "./SettlementDetailModal";
import {
  SETTLEMENT_MANAGER,
  bankItem,
  makeDetail,
  makeItem,
  settlementCommonApi,
} from "./settlementsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const norm = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const hidden = vi.fn();
const done = vi.fn();

function Detail({ id, type = "PAYMENT" }: { id: string; type?: SettlementType }) {
  const [current, setCurrent] = useState<string | null>(id);
  return (
    <SettlementDetailModal
      settlementId={current}
      type={type}
      onHide={() => {
        hidden();
        setCurrent(null);
      }}
    />
  );
}

function Reverse({ id, type = "PAYMENT" }: { id: string; type?: SettlementType }) {
  const [current, setCurrent] = useState<string | null>(id);
  return (
    <ReverseSettlementModal
      settlementId={current}
      type={type}
      onHide={() => {
        hidden();
        setCurrent(null);
      }}
      onDone={done}
    />
  );
}

const show = (element: JSX.Element) => renderAt("/zto-finans/x", { x: element });

beforeEach(() => {
  fakeApi.reset();
  hidden.mockReset();
  done.mockReset();
  signIn(SETTLEMENT_MANAGER);
  settlementCommonApi();
});

afterEach(cleanup);

// Tam sayfa + kabuk çizimi tam koşuda (kapsam açıkken) 5 sn varsayılanını aşabiliyor.
vi.setConfig({ testTimeout: 20_000 });

describe("SettlementDetailModal", () => {
  it("temel ve ödeme bilgileri, banka kaynağı + maskeli IBAN, cari banka hesabı, eşleştirmeler", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      makeDetail({
        item: bankItem({
          money: { amount: "100", currency: "USD" },
          exchangeRate: 36.5,
          tlAmount: 3650,
          counterpartyBankName: "Garanti",
          counterpartyIbanMasked: "TR** **** 1234",
        }),
        fundIbanMasked: "TR33 **** 1326",
        allocations: [
          {
            id: "al1",
            targetType: "PURCHASE_INVOICE",
            targetId: "inv1",
            targetNumber: "ALF-1",
            targetTypeName: "Alış Faturası",
            invoiceDate: "2026-11-01",
            dueDate: null,
            money: { amount: "60", currency: "USD" },
            targetCancelled: true,
            active: false,
            outOfScope: false,
          },
          {
            id: "al2",
            targetType: "ACCOUNT_DOCUMENT",
            targetId: null,
            targetNumber: null,
            targetTypeName: null,
            invoiceDate: null,
            dueDate: null,
            money: { amount: "40", currency: "USD" },
            targetCancelled: false,
            active: true,
            outOfScope: true,
          },
        ],
        bankStatementMatched: true,
      }),
    );
    show(<Detail id="s1" />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Temel Bilgiler");
    expect(norm(dialog.querySelector(".modal-header"))).toContain("Ödeme Detayı");
    expect(dialog.querySelector(".modal-header")?.classList.contains("bg-primary")).toBe(true);
    const text = norm(dialog);
    expect(text).toContain("14.11.2026");
    expect(text).toContain("120.01 - Kuzey Lojistik");
    expect(text).toContain("Tedarikçiler");
    expect(text).toContain("100,00 $");
    expect(text).toContain("Kur: 36,5000 | TL: 3.650,00 ₺");
    expect(within(dialog).getByText("Tamamlandı").className).toContain("badge-success");
    expect(text).toContain("Ziraat - Konak");
    expect(text).toContain("TR33 **** 1326");
    expect(text).toContain("Garanti");
    expect(text).toContain("TR** **** 1234");
    expect(text).toContain("Fatura Eşleştirmeleri");
    expect(text).toContain("ALF-1");
    expect(text).toContain("Kapsam dışı");
    expect(text).toContain("Bu kaydın banka hareketi ekstreyle eşleşmiş.");
    expect(text).toContain("Oluşturan: ayse@acme.com");
    expect(within(dialog).getByText("Kasım ödemesi").getAttribute("style")).toContain("pre-wrap");
    fireEvent.click(dialog.querySelector(".modal-footer .btn-secondary") as HTMLElement);
    expect(hidden).toHaveBeenCalledTimes(1);
  });

  it("iptal edilmiş + düzeltilmiş kayıt: İptal rozeti, iptal tarihi/gerekçe, 'Güncel kaydı aç'", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/old",
      makeDetail({
        item: makeItem({
          id: "old",
          status: "REVERSED",
          reversedOn: "2026-11-15",
          reverseReason: "Yanlış tutar",
          correctedById: "new",
        }),
      }),
    );
    fakeApi.on(
      "GET",
      "/finance/settlements/new",
      makeDetail({ item: makeItem({ id: "new", documentNo: "FT-2" }) }),
    );
    show(<Detail id="old" type="COLLECTION" />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("İptal");
    expect(norm(dialog.querySelector(".modal-header"))).toContain("Tahsilat Detayı");
    expect(norm(dialog)).toContain("Tahsilat Bilgileri");
    expect(norm(dialog)).toContain("15.11.2026");
    expect(norm(dialog)).toContain("Yanlış tutar");
    expect(norm(dialog)).toContain("Düzeltildi");
    fireEvent.click(within(dialog).getByRole("button", { name: "Güncel kaydı aç" }));
    await waitFor(() => expect(norm(screen.getByRole("dialog"))).toContain("FT-2"));
  });

  it("çek bilgileri; keşide tarihi 12.3'e kadar '-'", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/c1",
      makeDetail({
        item: makeItem({ id: "c1", displayMethod: "CHECK", instrumentNumber: "1234567" }),
        instrument: {
          id: "i1",
          kind: "CHECK",
          number: "1234567",
          bankName: "Akbank",
          dueDate: "2026-12-15",
          status: "PORTFOLIO",
        } as never,
      }),
    );
    show(<Detail id="c1" />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Çek Bilgileri");
    const text = norm(dialog);
    expect(text).toContain("Çek No:1234567");
    expect(text).toContain("Banka:Akbank");
    expect(text).toContain("Keşide Tarihi:-");
    expect(text).toContain("15.12.2026");
  });

  it("hata ve maskeli personel: ZTO metni / sunucu iletisi", async () => {
    fakeApi.on("GET", "/finance/settlements/x", () => {
      throw apiError(404, "SETTLEMENT_NOT_FOUND_X", "");
    });
    show(<Detail id="x" />);
    expect(await screen.findByText("Ödeme bilgileri alınamadı.")).toBeTruthy();
  });

  it("tahsilat detayında 404 SETTLEMENT_NOT_FOUND türe özgü metin (zto-onyuz:F5)", async () => {
    fakeApi.on("GET", "/finance/settlements/y", () => {
      throw apiError(404, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı");
    });
    show(<Detail id="y" type="COLLECTION" />);
    expect(await screen.findByText("Tahsilat bilgileri alınamadı.")).toBeTruthy();
    expect(screen.queryByText("Ödeme bilgileri alınamadı.")).toBeNull();
  });
});

describe("ReverseSettlementModal", () => {
  it("kök #confirmDeleteModal, ilk odak İptal, ileti para birimi sembolüyle, tarih sınırları", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      makeDetail({
        item: makeItem({ money: { amount: "250", currency: "EUR" }, settlementDate: "2026-01-02" }),
      }),
    );
    show(<Reverse id="s1" />);
    const dialog = await screen.findByRole("dialog");
    const root = document.getElementById("confirmDeleteModal");
    expect(root?.classList.contains("modal")).toBe(true);
    await within(dialog).findByText("Cari Hesap:");
    expect(norm(dialog.querySelector(".modal-header"))).toContain("Ödeme Silme Onayı");
    expect(dialog.querySelector(".modal-header")?.className).toContain("bg-warning");
    expect(norm(dialog)).toContain("Bu işlem geri alınamaz!");
    expect(norm(dialog)).toContain(
      "250,00 € tutarındaki ödemeyi silmek istediğinize emin misiniz?",
    );
    expect(norm(dialog)).toContain("Cari Hesap: Kuzey Lojistik");
    expect(norm(dialog)).toContain("Ödeme Yöntemi: Nakit");
    const date = document.getElementById("reverseSettlementDate") as HTMLInputElement;
    const today = todayIso();
    expect(date.min).toBe("2026-01-02");
    expect(date.max).toBe(today);
    expect(date.value).toBe(today);
    expect(date.required).toBe(true);
    await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe("İptal"));
  });

  it("geçersiz tarih gönderilmez; geçerli tarih + gerekçe ters kayıt ister ve başarı iletisi verir", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      makeDetail({ item: makeItem({ type: "COLLECTION", settlementDate: "2026-01-02" }) }),
    );
    fakeApi.on("POST", "/finance/settlements/s1/reverse", makeItem({ status: "REVERSED" }));
    show(<Reverse id="s1" type="COLLECTION" />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Tahsilat Yöntemi:");
    const date = document.getElementById("reverseSettlementDate") as HTMLInputElement;
    fireEvent.change(date, { target: { value: "2025-12-31" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Onayla ve Sil/ }));
    expect(await within(dialog).findByText(/kayıt tarihinden önce/)).toBeTruthy();
    expect(date.getAttribute("aria-invalid")).toBe("true");
    expect(fakeApi.log("POST")).toEqual([]);

    fireEvent.change(date, { target: { value: "2026-01-05" } });
    fireEvent.change(document.getElementById("reverseSettlementReason") as HTMLElement, {
      target: { value: "  Mükerrer  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Onayla ve Sil/ }));
    await waitFor(() => expect(done).toHaveBeenCalledWith("Tahsilat başarıyla silindi."));
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
      date: "2026-01-05",
      description: "Mükerrer",
    });
    expect(hidden).toHaveBeenCalled();
  });

  it("sunucu hatası modal içinde (finance.error.<KOD> ya da ZTO metni); maskeli cari adı yok", async () => {
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      makeDetail({
        item: makeItem({ employeeMasked: true, accountName: null }),
        bankStatementMatched: true,
      }),
    );
    fakeApi.on("POST", "/finance/settlements/s1/reverse", () => {
      throw apiError(409, "SOMETHING_UNKNOWN", "");
    });
    show(<Reverse id="s1" />);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Cari Hesap:");
    expect(norm(dialog)).toContain("Cari Hesap: Personel (gizli)");
    expect(norm(dialog)).toContain("ekstreyle eşleşmiş");
    fireEvent.click(within(dialog).getByRole("button", { name: /Onayla ve Sil/ }));
    expect(await within(dialog).findByText("Silme işlemi sırasında hata oluştu.")).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
  });
});

describe("DailyReportModal", () => {
  it("rapor tarihi + iş yeri listesi; 'Raporu Al' yeni sekmede rapor yolunu açar", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    function Harness() {
      const [visible, setVisible] = useState(true);
      return <DailyReportModal type="COLLECTION" show={visible} onHide={() => setVisible(false)} />;
    }
    show(<Harness />);
    const dialog = await screen.findByRole("dialog");
    expect(norm(dialog.querySelector(".modal-header"))).toContain("Günlük Tahsilat Raporu");
    expect(dialog.querySelector(".modal-header")?.className).toContain("bg-info");
    expect(norm(dialog)).toContain(
      "Seçtiğiniz güne ait tahsilatlar, oluşturulma saatine göre listelenir.",
    );
    const date = document.getElementById("dailyCollectionReportDate") as HTMLInputElement;
    expect(date.value).toBe(todayIso());
    fireEvent.change(date, { target: { value: "2026-11-10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Günlük Tahsilat Raporu Al/ }));
    expect(open).toHaveBeenCalledWith(
      "/zto-finans/tahsilatlar/gunluk-rapor?reportDate=2026-11-10",
      "_blank",
      "noopener",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    open.mockRestore();
  });
});
