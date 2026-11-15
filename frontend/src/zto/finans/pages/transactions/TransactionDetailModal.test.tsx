// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { AccountTransactionRow, SettlementDetail } from "../../../../pages/finance/types";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { commonApi, makeRow } from "./transactionsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"];

function detail(row: AccountTransactionRow, transfer: boolean = false) {
  fakeApi.on("GET", `/finance/accounts/transactions/${row.id}`, {
    row,
    document: null,
    reversedById: null,
    transfer: transfer
      ? { transferId: "tr1", role: "OUT", fromAccountId: "a1", toAccountId: "a2" }
      : null,
  });
  fakeApi.on("GET", `/finance/accounts/transactions/${row.id}/source`, {
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    label: "OD-1",
    route: `/zto-finans/odemeler?settlementId=${row.sourceId}`,
  });
}

/** Detayın yalnız düğmenin kullandığı alanları (12.2a §4.3 `SettlementListItem`). */
function settlement(item: Partial<SettlementDetail["item"]>): SettlementDetail {
  return {
    item: {
      id: "s1",
      type: "PAYMENT",
      lockReason: null,
      correctable: true,
      correctedById: null,
      ...item,
    } as SettlementDetail["item"],
    lines: [],
    instrument: null,
    plan: null,
    allocations: [],
    fundIbanMasked: null,
    bankStatementMatched: false,
  };
}

const paymentRow = (overrides: Partial<AccountTransactionRow> = {}) =>
  makeRow("r1", {
    kind: "PAYMENT",
    direction: "DEBIT",
    sign: -1,
    amount: 250,
    sourceType: "SETTLEMENT",
    sourceId: "s1",
    documentNo: "OD-1",
    documentType: null,
    paymentMethod: "CASH",
    ...overrides,
  });

function open(onHide = () => {}) {
  return renderAt("/zto-finans/x", {
    x: <TransactionDetailModal transactionId="r1" onHide={onHide} />,
  });
}

const footerButton = () =>
  screen
    .getAllByRole("button")
    .find((button) => button.textContent?.includes("Düzenle")) as HTMLButtonElement;

beforeEach(() => {
  fakeApi.reset();
  commonApi();
  signIn(MANAGER);
});
afterEach(cleanup);

describe("TransactionDetailModal Düzenle (12.2a §5.13)", { timeout: 30_000 }, () => {
  it("düzeltilebilir ödeme: Ödemeler yeni sekmede openEditPayment ile", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    detail(paymentRow());
    fakeApi.on("GET", "/finance/settlements/s1", settlement({}));
    open();
    await screen.findByText("İşlem Detayları");
    await waitFor(() => expect(footerButton().getAttribute("aria-disabled")).toBeNull());
    expect(footerButton().textContent).toContain("(yeni sekmede açılır)");
    fireEvent.click(footerButton());
    expect(openSpy).toHaveBeenCalledWith(
      "/zto-finans/odemeler?openEditPayment=true&paymentId=s1",
      "_blank",
      "noopener",
    );
    openSpy.mockRestore();
  });

  it("düzeltilebilir tahsilat: Tahsilatlar openEditCollection ile", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    detail(paymentRow({ kind: "COLLECTION", direction: "CREDIT", sign: 1 }));
    fakeApi.on("GET", "/finance/settlements/s1", settlement({ type: "COLLECTION" }));
    open();
    await waitFor(() => expect(footerButton().getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(footerButton());
    expect(openSpy.mock.calls[0][0]).toBe(
      "/zto-finans/tahsilatlar?openEditCollection=true&collectionId=s1",
    );
    openSpy.mockRestore();
  });

  it("cari taşımayla taşınmış kayıt: pasif, TRANSACTION_TRANSFERRED nedeni; tıklama bir şey açmaz", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    detail(paymentRow({ transferredOut: true }), true);
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      settlement({ lockReason: "TRANSFERRED", correctable: false }),
    );
    open();
    await screen.findByText("Bu hareket başka bir cariye taşınmış.");
    await waitFor(() =>
      expect(footerButton().textContent).toContain(
        "Cari taşıma geri alınmadan düzenlenemez/silinemez.",
      ),
    );
    expect(footerButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(footerButton());
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("iptal edilip düzeltilmiş kayıt ve detay hatası nedenleri", async () => {
    detail(paymentRow({ reversed: true }));
    fakeApi.on(
      "GET",
      "/finance/settlements/s1",
      settlement({ lockReason: "REVERSED", correctable: false, correctedById: "s2" }),
    );
    open();
    await waitFor(() =>
      expect(footerButton().textContent).toContain(
        "Bu kayıt zaten düzenlenmiş; güncel kaydı açın.",
      ),
    );
    cleanup();
    fakeApi.reset();
    commonApi();
    detail(paymentRow({ kind: "COLLECTION" }));
    fakeApi.on("GET", "/finance/settlements/s1", () => {
      throw apiError(404, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı.");
    });
    open();
    await waitFor(() =>
      expect(footerButton().textContent).toContain("Tahsilat bilgileri alınamadı."),
    );
  });

  it("ödeme/tahsilat dışı kaynak: pasif yedek metin, settlement isteği yok; yetkisizde düğme yok", async () => {
    detail(paymentRow({ sourceType: "INSTRUMENT", sourceId: "i1" }));
    open();
    await screen.findByText("İşlem Detayları");
    await waitFor(() => expect(footerButton().textContent).toContain("Bu kayıt düzenlenemez."));
    expect(fakeApi.log("GET").some((p) => p.startsWith("/finance/settlements/"))).toBe(false);
    cleanup();
    signIn(["FINANCE_VIEW"]);
    detail(paymentRow());
    open();
    const dialog = (await screen.findByText("İşlem Detayları")).closest(".modal") as HTMLElement;
    await within(dialog).findByText("Kaynağa Git");
    expect(footerButton()).toBeUndefined();
    expect(fakeApi.log("GET").filter((p) => p === "/finance/settlements/s1")).toHaveLength(0);
  });
});
