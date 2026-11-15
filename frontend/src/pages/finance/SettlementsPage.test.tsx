// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; path: string; body?: unknown; headers?: Record<string, string> };
const calls: Call[] = [];
let respond: (call: Call) => unknown = () => undefined;

vi.mock("../../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/client")>();
  const handle = async (call: Call) => {
    calls.push(call);
    return respond(call);
  };
  return {
    ...original,
    apiGet: (path: string) => handle({ method: "GET", path }),
    apiRequest: (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
      handle({ method, path, body, headers }),
  };
});

import "../../i18n";
import { ApiError } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import { useCompanyStore } from "../../auth/companyStore";
import { SettlementsPage } from "./SettlementsPage";

const page = <T,>(content: T[]) => ({
  content,
  page: 0,
  size: 200,
  totalElements: content.length,
  totalPages: 1,
});

const confirmationError = () =>
  new ApiError(409, {
    code: "CONFIRMATION_REQUIRED",
    message:
      "Bu ödeme, carinin seçilen şirketteki borcunu aşıyor; onaylayarak devam edebilirsiniz.",
    details: [
      "warning=COMPANY_ALLOCATION_EXCEEDED",
      "currency=TRY",
      "companyId=B",
      "companyOutstanding=50.00",
      "amount=150.00",
      "excess=100.00",
      "other.A=100.00",
      "partialScope=false",
      "otherHiddenExists=false",
    ],
    traceId: null,
  });

function api(options: { confirmFirst: boolean }) {
  respond = (call) => {
    const { method, path } = call;
    if (method === "GET" && path.startsWith("/finance/payments")) return page([]);
    if (method === "GET" && path.startsWith("/finance/accounts")) {
      return page([{ id: "acc", code: "TED-1", name: "Demir Tedarik" }]);
    }
    if (method === "GET" && path.startsWith("/organization/branches")) {
      return page([
        { id: "bA", name: "A Merkez", companyId: "A", companyName: "Alfa", active: true },
        { id: "bB", name: "B Merkez", companyId: "B", companyName: "Beta", active: true },
      ]);
    }
    if (method === "GET" && path.startsWith("/finance/funds")) {
      return [
        {
          id: "kasaB",
          code: "K-B",
          name: "B Kasası",
          kind: "CASH",
          currency: "TRY",
          branchId: "bB",
          companyId: "B",
          active: true,
        },
        {
          id: "pasif",
          code: "K-P",
          name: "Pasif Kasa",
          kind: "CASH",
          currency: "TRY",
          branchId: "bB",
          companyId: "B",
          active: false,
        },
      ];
    }
    if (method === "GET" && path === "/finance/currencies") return [{ code: "TRY", name: "TL" }];
    if (method === "GET" && path === "/finance/expense-items") return [];
    if (method === "POST" && path === "/finance/settlements/check?type=PAYMENT") {
      return {
        warnings: [
          {
            code: "COMPANY_ALLOCATION_EXCEEDED",
            severity: "CONFIRM",
            currency: "TRY",
            companyId: "B",
            companyOutstanding: 50,
            amount: 150,
            excess: 100,
            others: [{ companyId: "A", outstanding: 100 }],
            partialScope: false,
            otherHiddenExists: false,
          },
        ],
        invoiceGaps: [
          {
            accountId: "acc",
            side: "PAYABLE",
            companyId: "B",
            currency: "TRY",
            ledgerTotal: 50,
            invoiceTotal: 0,
            missing: 50,
          },
        ],
      };
    }
    if (method === "POST" && path === "/finance/payments") {
      const body = call.body as { confirmWarnings?: boolean };
      if (options.confirmFirst && !body.confirmWarnings) throw confirmationError();
      return { id: "s1" };
    }
    throw new Error(`yanıt yok ${method} ${path}`);
  };
}

function renderPage(url: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <SettlementsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function choose(dialog: HTMLElement, label: RegExp, option: string) {
  fireEvent.mouseDown(within(dialog).getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

const payments = () => calls.filter((c) => c.method === "POST" && c.path === "/finance/payments");

beforeEach(() => {
  calls.length = 0;
  useCompanyStore.setState({ activeCompanyId: null });
  useAuthStore.setState({
    me: {
      id: "u1",
      email: "x@y.z",
      fullName: "X",
      tenant: "acme",
      permissions: ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"],
      roles: [],
      landingPath: "/",
      twoFactorEnabled: false,
      companies: [
        {
          id: "A",
          code: "A",
          shortName: "Alfa",
          title: "Alfa A.Ş.",
          defaultCompany: true,
          active: true,
        },
        {
          id: "B",
          code: "B",
          shortName: "Beta",
          title: "Beta A.Ş.",
          defaultCompany: false,
          active: true,
        },
      ],
    },
  });
});

afterEach(cleanup);

describe("SettlementsPage şirket dağılımı uyarısı (K-12.2-3)", { timeout: 30_000 }, () => {
  it("bağlantıyla fon ön seçili açılır; kırmızı uyarı; 409 → Vazgeç → açık kalır; Tamam → confirmWarnings", async () => {
    api({ confirmFirst: true });
    renderPage("/finance/settlements?new=PAYMENT&method=CASH&fundAccountId=kasaB");

    const dialog = await screen.findByRole("dialog", { name: /Ödeme · Nakit/ });
    // Fon ve iş yeri ön seçili; pasif fon seçeneklerde yok.
    expect(within(dialog).getByRole("combobox", { name: /Banka\/kasa hesabı/ }).textContent).toBe(
      "B Kasası (TRY)",
    );
    expect(within(dialog).getByRole("combobox", { name: /Şube/ }).textContent).toBe(
      "Beta › B Merkez",
    );
    fireEvent.mouseDown(within(dialog).getByRole("combobox", { name: /Banka\/kasa hesabı/ }));
    expect(screen.queryByRole("option", { name: /Pasif Kasa/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    choose(dialog, /^Cari/, "TED-1 · Demir Tedarik");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Tutar/ }), {
      target: { value: "150" },
    });

    const warning = await within(dialog).findByText(
      "Bu şirketin cariye borcu 50,00 TRY; ödeme 150,00 TRY, borçtan 100,00 TRY fazla. Diğer şirketlerdeki borç: Alfa 100,00 TRY.",
      {},
      { timeout: 5_000 },
    );
    expect(warning).toBeTruthy();
    expect(
      within(dialog).getByText(
        "Cari alacağı 50,00 TRY, girilen fatura 0,00 TRY: kalan 50,00 TRY için fatura bilgisi eksik.",
      ),
    ).toBeTruthy();
    const check = calls.find((c) => c.path === "/finance/settlements/check?type=PAYMENT");
    expect(check?.body).toMatchObject({
      method: "CASH",
      accountId: "acc",
      branchId: "bB",
      fundAccountId: "kasaB",
      money: { amount: "150", currency: "TRY" },
    });
    expect((check?.body as { confirmWarnings?: boolean }).confirmWarnings).toBeUndefined();

    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    const confirm = await screen.findByRole("dialog", { name: "Uyarı" });
    expect(
      within(confirm).getByText("Yine de kaydetmek istiyor musunuz?", { exact: false }),
    ).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Vazgeç");
    fireEvent.click(within(confirm).getByRole("button", { name: "Vazgeç" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Uyarı" })).toBeNull());
    expect(payments()).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: /Ödeme · Nakit/ })).toBeTruthy();
    expect(within(dialog).queryByText(/İşlem başarısız|Hata/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    const again = await screen.findByRole("dialog", { name: "Uyarı" });
    fireEvent.click(within(again).getByRole("button", { name: "Tamam" }));
    await waitFor(() => expect(payments()).toHaveLength(3));
    const [first, , confirmed] = payments();
    expect((confirmed.body as { confirmWarnings?: boolean }).confirmWarnings).toBe(true);
    expect(confirmed.headers?.["Idempotency-Key"]).toBe(first.headers?.["Idempotency-Key"]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Ödeme · Nakit/ })).toBeNull());
  });

  it("çek/senetle ödemede de kırmızı uyarı form altında çıkar; yer tutucu çek yok (12.2a §5.14)", async () => {
    api({ confirmFirst: false });
    // F-12.2-R4 sunucuda kapandı (12.2a §3.4): önizleme çek/senet bilgisi olmadan 200 döner.
    respond = ((base) => (call: Call) =>
      call.method === "GET" && call.path.startsWith("/finance/instruments")
        ? page([])
        : base(call))(respond);
    renderPage("/finance/settlements?new=PAYMENT&method=CHECK");
    const dialog = await screen.findByRole("dialog", { name: /Ödeme · Çek\/Senet/ });
    choose(dialog, /^Cari/, "TED-1 · Demir Tedarik");
    choose(dialog, /Şube/, "Beta › B Merkez");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Tutar/ }), {
      target: { value: "150" },
    });
    const alert = await within(dialog).findByText(
      "Bu şirketin cariye borcu 50,00 TRY; ödeme 150,00 TRY, borçtan 100,00 TRY fazla. Diğer şirketlerdeki borç: Alfa 100,00 TRY.",
      {},
      { timeout: 5_000 },
    );
    expect(alert.closest(".MuiAlert-root")?.className).toContain("Error");
    const check = calls.find((c) => c.path === "/finance/settlements/check?type=PAYMENT");
    expect(check?.body).toMatchObject({
      method: "CHECK",
      accountId: "acc",
      branchId: "bB",
      money: { amount: "150", currency: "TRY" },
    });
    expect(check?.body).not.toHaveProperty("instrument");
    expect(payments()).toHaveLength(0);
  });

  it("≥ 2 şirkette listede Şirket sütunu", async () => {
    api({ confirmFirst: false });
    respond = ((base) => (call: Call) =>
      call.method === "GET" && call.path.startsWith("/finance/payments")
        ? page([
            {
              id: "s1",
              type: "PAYMENT",
              method: "CASH",
              accountId: "acc",
              branchId: "bB",
              fundAccountId: "kasaB",
              instrumentId: null,
              expenseItemId: null,
              planId: null,
              money: { amount: "10", currency: "TRY" },
              settlementDate: "2026-11-14",
              description: null,
              status: "POSTED",
              companyId: "B",
            },
          ])
        : base(call))(respond);
    renderPage("/finance/settlements");
    expect(await screen.findByRole("columnheader", { name: "Şirket" })).toBeTruthy();
    expect(await screen.findByRole("cell", { name: "Beta" })).toBeTruthy();
  });
});

describe("SettlementsPage ters çevirme penceresi (12.2a §3.5, §5.14)", { timeout: 30_000 }, () => {
  const row = (settlementDate: string) => ({
    id: "s9",
    type: "PAYMENT",
    method: "CASH",
    accountId: "acc",
    branchId: "bB",
    fundAccountId: "kasaB",
    instrumentId: null,
    expenseItemId: null,
    planId: null,
    money: { amount: "10", currency: "TRY" },
    settlementDate,
    description: null,
    status: "POSTED",
    companyId: "B",
  });

  it("ileri tarihli kayıtta tarih varsayılanı kayıt tarihi; gerekçe gövdeye yazılır; hata pencerede", async () => {
    api({ confirmFirst: false });
    let fail = true;
    respond = ((base) => (call: Call) => {
      if (call.method === "GET" && call.path.startsWith("/finance/payments")) {
        return page([row("2099-01-05")]);
      }
      if (call.method === "POST" && call.path === "/finance/settlements/s9/reverse") {
        if (fail) {
          fail = false;
          throw new ApiError(400, {
            code: "REVERSE_BEFORE_SETTLEMENT",
            message: "İptal tarihi ödeme/tahsilat tarihinden önce olamaz.",
            details: [],
            traceId: null,
          });
        }
        return { ...row("2099-01-05"), status: "REVERSED" };
      }
      return base(call);
    })(respond);
    renderPage("/finance/settlements");
    fireEvent.click(await screen.findByRole("button", { name: "Ters çevir" }));
    const dialog = await screen.findByRole("dialog", { name: /Ters çevir/ });
    const date = within(dialog).getByLabelText(/Tarih/) as HTMLInputElement;
    expect(date.value).toBe("2099-01-05");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Gerekçe/ }), {
      target: { value: "  Mükerrer kayıt  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ters çevir" }));
    expect(
      await within(dialog).findByText(/İptal tarihi ödeme\/tahsilat tarihinden önce olamaz/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Ters çevir" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Ters çevir/ })).toBeNull());
    const reverses = calls.filter((c) => c.path === "/finance/settlements/s9/reverse");
    expect(reverses).toHaveLength(2);
    expect(reverses[1].body).toEqual({ date: "2099-01-05", description: "Mükerrer kayıt" });
  });

  it("geçmiş tarihli kayıtta tarih varsayılanı bugün; gerekçe boşsa null", async () => {
    api({ confirmFirst: false });
    respond = ((base) => (call: Call) => {
      if (call.method === "GET" && call.path.startsWith("/finance/payments")) {
        return page([row("2020-01-01")]);
      }
      if (call.method === "POST" && call.path === "/finance/settlements/s9/reverse") {
        return { ...row("2020-01-01"), status: "REVERSED" };
      }
      return base(call);
    })(respond);
    renderPage("/finance/settlements");
    fireEvent.click(await screen.findByRole("button", { name: "Ters çevir" }));
    const dialog = await screen.findByRole("dialog", { name: /Ters çevir/ });
    const now = new Date();
    const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    expect((within(dialog).getByLabelText(/Tarih/) as HTMLInputElement).value).toBe(todayIso);
    fireEvent.click(within(dialog).getByRole("button", { name: "Ters çevir" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/finance/settlements/s9/reverse")?.body).toEqual({
        date: todayIso,
        description: null,
      }),
    );
  });
});
