// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { AccountRollover, BalanceBreakdownRow } from "../../../../pages/finance/types";
import {
  apiError,
  fakeApi,
  makeBranch,
  page,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { AccountTransactionsPage } from "./AccountTransactionsPage";
import { commonApi, makeAccount, makeRow } from "./transactionsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));
vi.mock("../../../components/ZtoChart", () => ({
  default: (props: { ariaLabel?: string }) => (
    <div data-testid="chart" role="img" aria-label={props.ariaLabel} />
  ),
}));

const season: AccountRollover = {
  id: "s1",
  accountId: "a1",
  rolloverDate: "2026-02-01",
  seasonName: "2026 Sezonu",
  active: true,
  createdBy: "ayse@acme.com",
  createdAt: "2026-02-01T09:00:00",
  updatedBy: "ayse@acme.com",
  updatedAt: "2026-02-01T09:00:00",
  updateCount: 0,
  deletedBy: null,
  deletedAt: null,
};

const balanceRow = (extra: Partial<BalanceBreakdownRow>): BalanceBreakdownRow => ({
  segment: "ALL",
  currency: "TRY",
  companyId: null,
  branchId: "b1",
  debit: 0,
  credit: 1200,
  balance: -1200,
  tlBalance: -1200,
  debt: 1200,
  payment: 0,
  receivable: 0,
  collection: 0,
  ...extra,
});

function api(rollovers: AccountRollover[] = []) {
  commonApi();
  fakeApi.on("GET", /^\/organization\/branches/, page([makeBranch()]));
  fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/rollovers/, rollovers);
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/history/, page([]));
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances/, (call: { path: string }) => ({
    groupBy: call.path.includes("BRANCH") ? "BRANCH" : "CURRENCY",
    splitDate: call.path.includes("rolloverId") ? "2026-02-01" : null,
    rows: [
      balanceRow({}),
      balanceRow({ segment: "AFTER" }),
      balanceRow({ segment: "BEFORE", debt: 0, credit: 0, balance: 0 }),
    ],
    payableInvoiceTotals: [{ currency: "TRY", amount: 1000 }],
  }));
  fakeApi.on("GET", /^\/finance\/account-transactions\?/, {
    content: [
      makeRow("r1", { transactionDate: "2026-03-01" }),
      makeRow("r0", {
        transactionDate: "2026-01-10",
        sourceType: "MANUAL",
        documentNo: null,
        documentType: null,
      }),
    ],
    page: 0,
    size: 500,
    totalElements: 2,
    totalPages: 1,
    facets: null,
  });
}

function open(path = "/zto-finans/cari-kartlar/a1/hareketler") {
  return renderAt(path, { "cari-kartlar/:id/hareketler": <AccountTransactionsPage /> });
}

beforeEach(() => {
  fakeApi.reset();
  signIn(["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"]);
});
afterEach(cleanup);

// İlk test sayfayı ve ZTO CSS'ini soğuk yükler; kapsam ölçümünde (yük altında) 5 sn yetmeyebilir.
describe("AccountTransactionsPage", { timeout: 60_000 }, () => {
  it("başlık, kök sınıf, tedarikçi sekme sırası, özet ve satırlar", async () => {
    api();
    open();
    expect(await screen.findByText("Cari Hesap Hareketleri", {}, { timeout: 20_000 })).toBeTruthy();
    await screen.findByText("FTR-1", {}, { timeout: 20_000 });
    expect(document.querySelector(".zto-finans")?.className).toContain(
      "zto-page-account-transactions",
    );
    const tabs = within(screen.getByRole("tablist"))
      .getAllByRole("tab")
      .map((t) => t.textContent?.trim());
    expect(tabs).toEqual(["Tüm Hareketler", "Borçlar", "Ödemeler", "Alacaklar", "Tahsilatlar"]);
    expect(document.title).toBe("Cari Hareketler - Demir Tedarik");
    expect(screen.getByText("Kredi Limiti:")).toBeTruthy();
    expect(screen.getByText("Risk Limiti:")).toBeTruthy();
    // Bakiye eskiden yeniye: −1.200 + −1.200
    expect(
      document.querySelector("#allTransactionsTable tbody tr .atx-balance-cell")?.textContent,
    ).toContain("2.400,00");
  });

  it("sekmeler roving tabindex ve ok tuşlarıyla", async () => {
    api();
    open();
    await screen.findByText("FTR-1", {}, { timeout: 20_000 });
    const all = screen.getByRole("tab", { name: /Tüm Hareketler/ });
    expect(all.getAttribute("tabindex")).toBe("0");
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    const debts = screen.getByRole("tab", { name: /Borçlar/ });
    await waitFor(() => expect(debts.getAttribute("aria-selected")).toBe("true"));
    expect(document.activeElement).toBe(debts);
    expect(document.querySelector("#debtsTable")).not.toBeNull();
  });

  it("aktif sezon: işaretçi satırı ve sezon penceresi isteği", async () => {
    api([season]);
    open();
    await screen.findByText("FTR-1", {}, { timeout: 20_000 });
    await waitFor(() =>
      expect(
        fakeApi
          .log("GET")
          .some(
            (p) => p.startsWith("/finance/account-transactions?") && p.includes("from=2026-02-01"),
          ),
      ).toBe(true),
    );
    expect((screen.getByLabelText(/Devir Sezonları/) as HTMLSelectElement).value).toBe("s1");
    await waitFor(() =>
      expect(document.querySelector(".atx-season-row")?.textContent).toContain("2026 Sezonu"),
    );
    expect(document.querySelector(".atx-opening-row")?.textContent).toContain("Cari Açılışı");
  });

  it("Sil → Silme Onayı → void; kaynak modülde iptal edilen kayıtta ileti", async () => {
    api();
    fakeApi.on("POST", /\/void$/, () => {
      throw apiError(409, "TRANSACTION_SOURCE_MANAGED", "Bu kayıt kendi modülünden iptal edilir.");
    });
    open();
    await screen.findByText("FTR-1", {}, { timeout: 20_000 });
    fireEvent.click(screen.getAllByRole("button", { name: /^Sil:/ })[0]);
    const modal = (await screen.findByText("Silme Onayı")).closest(".modal") as HTMLElement;
    expect(within(modal).getByText(/kaydı iptal edilecek/).textContent).toContain(
      "Alış Faturası kaydı iptal edilecek (ters kayıt oluşturulur).",
    );
    await waitFor(() => expect(document.activeElement?.textContent).toContain("İptal"));
    fireEvent.click(within(modal).getByRole("button", { name: /Evet, Sil/ }));
    await within(modal).findByText("Bu kayıt kendi modülünden iptal edilir.");
    expect(fakeApi.log("POST")).toEqual(["/finance/accounts/transactions/r1/void"]);
  });

  it("12.2 eksik fatura: Borç kartı altında kalan ve başlıkta rozet (sunucu invoiceGaps)", async () => {
    api();
    fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances/, (call: { path: string }) => ({
      groupBy: call.path.includes("BRANCH") ? "BRANCH" : "CURRENCY",
      splitDate: null,
      rows: [balanceRow({})],
      payableInvoiceTotals: [{ currency: "TRY", amount: 100 }],
      receivableInvoiceTotals: [],
      invoiceGaps: [
        {
          accountId: "a1",
          side: "PAYABLE",
          companyId: null,
          currency: "TRY",
          ledgerTotal: 150,
          invoiceTotal: 100,
          missing: 50,
        },
      ],
    }));
    open();
    expect(
      await screen.findByText(
        "Kalan 50,00 ₺ için fatura bilgisi eksik.",
        { exact: false },
        { timeout: 20_000 },
      ),
    ).toBeTruthy();
    expect(screen.getByText("Eksik fatura").className).toContain("badge-danger");
    // Popover sunucu tabanıyla (Toplam Borç = defter tabanı 150, Resmi Fatura 100).
    fireEvent.click(screen.getByRole("button", { name: "Borç ve resmi fatura karşılaştırması" }));
    expect(await screen.findByText("150,00 ₺")).toBeTruthy();
    expect(screen.getByText("50,00 ₺")).toBeTruthy();
  });
});
