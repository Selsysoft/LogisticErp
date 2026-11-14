// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { today } from "../../../../pages/finance/common";
import type { AccountTransactionRow } from "../../../../pages/finance/types";
import { fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { AllTransactionsPage } from "./AllTransactionsPage";
import { quickRangeDates } from "./allTransactionsLogic";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "cari-hareketler": <AllTransactionsPage />,
  "cari-kartlar/:id/hareketler": <p>cari hareketleri</p>,
};

function row(overrides: Partial<AccountTransactionRow> = {}): AccountTransactionRow {
  return {
    id: "t1",
    transactionDate: today(),
    createdAt: `${today()}T09:30:00Z`,
    createdBy: "ayse@acme.com",
    accountId: "a1",
    accountCode: "TED-0001",
    accountName: "Şahin Nakliyat",
    accountType: "SUPPLIER",
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    kind: "DEBT",
    sign: 1,
    direction: "CREDIT",
    amount: 1250.5,
    currency: "TRY",
    exchangeRate: 1,
    tlAmount: 1250.5,
    description: "Alış faturası",
    sourceType: "ACCOUNT_DOCUMENT",
    sourceId: "d1",
    documentNo: "AF-1",
    documentType: "ALIS_FATURASI",
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    reversal: false,
    reversed: false,
    transferRole: null,
    transferredOut: false,
    ...overrides,
  };
}

const FACETS = {
  branches: [
    { id: "b1", name: "Merkez", count: 1 },
    { id: "b2", name: "Depo", count: 1 },
  ],
  groups: [{ code: "GENEL", name: "Tedarikçi", count: 2 }],
  kinds: [
    { kind: "DEBT", count: 1 },
    { kind: "RECEIVABLE", count: 1 },
  ],
};

function txPage(content: AccountTransactionRow[], totalElements = content.length) {
  return { ...page(content), totalElements, facets: FACETS };
}

const ACCOUNT = {
  id: "a1",
  code: "TED-0001",
  name: "Şahin Nakliyat",
  type: "SUPPLIER",
  subGroup: "GENEL",
  subGroupName: "Tedarikçi",
  balances: [],
};

beforeEach(() => {
  fakeApi.reset();
  signIn(["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"]);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "ABD Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/accounts\?search=/, page([ACCOUNT]));
});

afterEach(cleanup);

const txCalls = () =>
  fakeApi.log("GET").filter((p) => p.startsWith("/finance/account-transactions"));

describe(
  "AllTransactionsPage (ZTO AccountTransaction/AllTransactions)",
  { timeout: 90_000 },
  () => {
    it("boş durum: ZTO metinleri; Hızlı Cari İşlemi modalı açar, cari seçilir, kart gezinir", async () => {
      fakeApi.on("GET", /^\/finance\/account-transactions\?/, txPage([]));
      renderAt("/zto-finans/cari-hareketler", ROUTES);
      expect(
        await screen.findByText("Bugün henüz bir cari işlemi yapılmadı", {}, { timeout: 20_000 }),
      ).toBeTruthy();
      expect(
        screen.getByText("Carileri incelemek veya cari işlemi yapmak için tıklayınız."),
      ).toBeTruthy();
      expect(document.querySelector(".zto-finans")?.className).toContain(
        "zto-page-all-transactions",
      );
      const day = today();
      expect(txCalls()[0]).toContain(`from=${day}&to=${day}`);
      expect(txCalls()[0]).toContain("facets=true");

      const cta = screen.getByRole("button", { name: /Hızlı Cari İşlemi/ });
      fireEvent.click(cta);
      const modal = await waitFor(
        () => {
          const element = document.querySelector<HTMLElement>(".modal#quickCariActionModal");
          if (!element) throw new Error("modal yok");
          return element;
        },
        { timeout: 20_000 },
      );
      // Çıplak ZtoModal: .modal-content.qca-content > .qca-header ilk çocuk, .modal-body yok.
      const content = modal.querySelector(".modal-content.qca-content")!;
      expect(content.firstElementChild?.className).toBe("qca-header");
      expect(modal.querySelector(".modal-body")).toBeNull();
      expect(modal.querySelector(".modal-dialog")?.className).toContain("modal-lg");
      expect(within(modal).getByText("Bir cari arayın ve seçin")).toBeTruthy();

      // Yük altında modal geç gelen bir sorgu yanıtıyla yeniden çizilip girdiyi sıfırlayabilir;
      // bu yüzden yazma + seçenek bekleme birlikte yeniden denenir.
      const option = await waitFor(
        async () => {
          const input = within(modal).getByPlaceholderText("Cari ara — ad veya kod yazın...");
          fireEvent.change(input, { target: { value: "şah" } });
          return within(modal).findByRole("option", {}, { timeout: 3_000 });
        },
        { timeout: 20_000 },
      );
      fireEvent.click(option);
      const transactions = await within(modal).findByRole(
        "link",
        { name: /Cari Hareketler/ },
        { timeout: 20_000 },
      );
      expect(
        within(modal)
          .getByRole("link", { name: /Ekstre Al/ })
          .getAttribute("target"),
      ).toBe("_blank");
      expect(within(modal).getByRole("link", { name: /Ödeme Ekle/ })).toBeTruthy();
      expect(within(modal).getByRole("link", { name: /Düzenle/ })).toBeTruthy();
      fireEvent.click(transactions);
      await waitFor(() =>
        expect(screen.getByTestId("where").textContent).toBe(
          "/zto-finans/cari-kartlar/a1/hareketler",
        ),
      );
    });

    it("satırlar, kart süzgeci sunucuya gider ve çip kaldırılır; hızlı aralık sorguyu değiştirir", async () => {
      fakeApi.on(
        "GET",
        /^\/finance\/account-transactions\?/,
        txPage([
          row(),
          row({
            id: "t2",
            kind: "RECEIVABLE",
            documentType: "SATIS_FATURASI",
            branchId: "b2",
            branchName: "Depo",
          }),
        ]),
      );
      renderAt("/zto-finans/cari-hareketler", ROUTES);
      const table = await waitFor(
        () => {
          const element = document.querySelector<HTMLTableElement>(
            "#allCustomerTransactionsTable.dataTable",
          );
          if (!element) throw new Error("tablo yok");
          return element;
        },
        { timeout: 20_000 },
      );
      expect(
        Array.from(table.querySelectorAll("thead th"), (th) => th.textContent?.trim()),
      ).toEqual([
        "Tarih",
        "İş Yeri",
        "Cari Kodu",
        "Cari Adı",
        "Hesap Grubu",
        "İşlem Türü",
        "Belge No",
        "Tutar",
        "Açıklama",
        "Oluşturan",
        "İşlem",
      ]);
      expect(within(table).getAllByText("1.250,50 ₺")).toHaveLength(2);
      expect(within(table).getByText("Satış").className).toContain("badge badge-info ml-1");
      const lengthLabel = document.querySelector(".dataTables_length label")?.textContent ?? "";
      expect(lengthLabel.startsWith("Göster")).toBe(true);
      expect(lengthLabel.endsWith("kayıt")).toBe(true);
      expect(document.querySelector(".dataTables_filter label")?.textContent).toContain("Ara:");

      // Kart öğesi: aria-pressed düğme; sunucuya branchIds gider, çip görünür.
      const cards = document.querySelector("#atCardWorkPlace")!;
      const depo = within(cards as HTMLElement).getByRole("button", { name: /Depo/ });
      fireEvent.click(depo);
      await waitFor(() => expect(txCalls().some((p) => p.includes("branchIds=b2"))).toBe(true));
      expect(depo.getAttribute("aria-pressed")).toBe("true");
      const chip = document.querySelector("#atDynamicFilterIndicator .at-filter-chip")!;
      expect(chip.textContent).toContain("İş Yeri: Depo");
      fireEvent.click(
        within(chip as HTMLElement).getByRole("button", { name: /süzgecini kaldır/ }),
      );
      await waitFor(() =>
        expect(document.querySelector("#atDynamicFilterIndicator .at-filter-chip")).toBeNull(),
      );

      // Hızlı aralık: 7 Gün → yeni aralık, seçim sıfır.
      fireEvent.click(screen.getByRole("button", { name: "7 Gün" }));
      const { from, to } = quickRangeDates("d7", today());
      await waitFor(() =>
        expect(txCalls().some((p) => p.includes(`from=${from}&to=${to}`))).toBe(true),
      );
      expect(screen.getByRole("button", { name: "7 Gün" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      // Para birimi düğmesi: sembol, sunucu parametresi.
      fireEvent.click(screen.getByRole("button", { name: "$" }));
      await waitFor(() => expect(txCalls().some((p) => p.includes("currency=USD"))).toBe(true));
    });

    it("10.000 kayıt üstünde tablo yerine uyarı; ters aralıkta istek gitmez", async () => {
      fakeApi.on("GET", /^\/finance\/account-transactions\?/, txPage([row()], 12_345));
      renderAt("/zto-finans/cari-hareketler", ROUTES);
      expect(
        await screen.findByText(
          "Seçilen aralıkta 12.345 kayıt var; lütfen tarih aralığını daraltın.",
        ),
      ).toBeTruthy();
      expect(document.querySelector("#allCustomerTransactionsTable")).toBeNull();
      // Facet kartları yine çizilir (ilk sayfanın yanıtından).
      expect(document.querySelectorAll("#atCardWorkPlace .stat-item")).toHaveLength(2);

      const before = txCalls().length;
      fireEvent.change(screen.getByLabelText("Bitiş Tarihi"), { target: { value: "2000-01-01" } });
      expect(
        await screen.findByText("Bitiş tarihi başlangıç tarihinden önce olamaz."),
      ).toBeTruthy();
      expect(txCalls().length).toBe(before);
      expect(
        screen.getByRole("group", { name: "Tarih aralığı" }).querySelector(".active"),
      ).toBeNull();
    });
  },
);
