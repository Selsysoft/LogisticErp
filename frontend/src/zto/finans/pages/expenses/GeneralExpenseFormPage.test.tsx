// @vitest-environment jsdom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import type { ExpenseDetail, ExpenseItem } from "../../../../pages/finance/types";
import {
  apiError,
  fakeApi,
  makeBranch,
  page,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { TREE, makeFund } from "../transferCenter/transferCenterTestUtils";
import { GeneralExpenseFormPage } from "./GeneralExpenseFormPage";

// Tam koşuda (yük altında) sorgular 1 sn varsayılanını aşabiliyor.
configure({ asyncUtilTimeout: 5000 });

const headers: Array<Record<string, string> | undefined> = [];

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown, extra?: Record<string, string>) => {
    headers.push(extra);
    return fakeApi.request(method, path, body);
  },
  apiUpload: (path: string, form: FormData) => fakeApi.request("UPLOAD", path, form),
}));

const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"];
const ROUTES = {
  "genel-masraflar/yeni": <GeneralExpenseFormPage />,
  "genel-masraflar/:id/duzenle": <GeneralExpenseFormPage />,
};

const ITEM: ExpenseItem = {
  id: "i1",
  expenseTypeId: "t1",
  expenseTypeName: "Genel Gider",
  code: "MK-00001",
  name: "Kırtasiye",
  description: null,
  defaultUnit: "adet",
  active: true,
  system: false,
  createdAt: "2026-11-01T00:00:00Z",
};

const DETAIL = {
  id: "e1",
  companyId: "c1",
  branchId: "b1",
  branchName: "Merkez",
  expenseItemId: "i1",
  expenseItemName: "Kırtasiye",
  expenseTypeName: "Genel Gider",
  contextType: "GENERAL",
  vehicleId: null,
  shipmentId: null,
  warehouseId: null,
  driverId: null,
  contextLabel: null,
  paymentMethod: "CASH",
  supplierAccountId: null,
  supplierName: null,
  fundAccountId: "f1",
  fundName: "Merkez Kasa",
  settlementId: "s1",
  invoiceNumber: "FTR-9",
  invoiceDate: "2026-11-10",
  dueDate: null,
  documentType: "ALIS_FATURASI",
  department: "IT",
  description: null,
  currency: "TRY",
  exchangeRate: "1",
  status: "POSTED",
  replacesExpenseId: null,
  lines: [
    {
      id: "l1",
      lineNo: 1,
      description: "Kağıt",
      quantity: "2.00",
      unit: "paket",
      unitPrice: "50.00",
      discountRate: "0.00",
      vatRate: "20.00",
      withholdingAmount: "0.00",
      otherTaxAmount: "0.00",
    },
  ],
} as unknown as ExpenseDetail;

function api() {
  fakeApi.on("GET", /^\/organization\/branch-tree/, TREE);
  fakeApi.on("GET", /^\/organization\/branches/, page([makeBranch()]));
  fakeApi.on("GET", "/finance/expense-items", [ITEM]);
  fakeApi.on("GET", "/finance/expense-types", [{ id: "t1", code: "GEN", name: "Genel Gider" }]);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", "/finance/account-document-types", [
    {
      side: "PAYABLE",
      code: "ALIS_FATURASI",
      name: "Alış Faturası",
      audience: "OTHER",
      invoiceSection: true,
      penalty: false,
      isDefault: true,
      selectable: true,
      sortOrder: 1,
    },
    {
      side: "PAYABLE",
      code: "KASA_FISI",
      name: "Kasa Fişi",
      audience: "OTHER",
      invoiceSection: false,
      penalty: false,
      isDefault: false,
      selectable: true,
      sortOrder: 2,
    },
  ]);
  fakeApi.on("GET", /^\/finance\/funds\?/, [
    makeFund({ id: "f1", kind: "CASH", name: "Merkez Kasa" }),
  ]);
  fakeApi.on("GET", /^\/files\?ownerType=EXPENSE/, []);
}

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const change = (id: string, value: string) => fireEvent.change(byId(id), { target: { value } });

beforeEach(() => {
  fakeApi.reset();
  headers.length = 0;
});
afterEach(cleanup);

describe("GeneralExpenseFormPage", () => {
  it("yeni: ZTO başlıkları, hesaplar, doğrulama odağı ve gönderim gövdesi (Idempotency-Key)", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/expenses", { ...DETAIL, id: "e2" });
    fakeApi.on("UPLOAD", "/files?ownerType=EXPENSE&ownerId=e2", { id: "file1" });
    renderAt("/zto-finans/genel-masraflar/yeni", ROUTES);
    expect(
      await screen.findByText("Yeni Fabrika İçi, Üretim veya Genel Masraf Bilgileri"),
    ).toBeTruthy();
    expect(screen.getByText("Masraf Türü Seçiniz", { selector: "#expenseTypeTitle" })).toBeTruthy();
    expect(screen.getByText("Detay #1")).toBeTruthy();

    // Boş gönderim: istek yok, ilk geçersiz alana odak.
    fireEvent.click(screen.getByRole("button", { name: /Yeni Masraf Oluştur/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("expenseTypeId"));
    expect(byId("expenseTypeId").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Masraf türü seçiniz.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual([]);

    // Son kart silinemez.
    fireEvent.click(screen.getByRole("button", { name: /^Sil/ }));
    expect(await screen.findByText("En az bir detay kalmalıdır!")).toBeTruthy();

    await screen.findByRole("option", { name: "Genel Gider" });
    change("expenseTypeId", "t1");
    change("expenseItemId", "i1");
    change("InvoiceNumber", "FTR-77");
    change("WorkPlaceID", "b1");
    change("paymentMethod", "CASH");
    await screen.findByRole("option", { name: /Merkez Kasa/ });
    change("fundAccountId", "f1");
    change("Department", "FLEET");
    change("detail-0-unitPrice", "100");
    change("detail-0-discountRate", "10");
    change("detail-0-otherTaxAmount", "5");
    expect(byId<HTMLInputElement>("detail-0-netAmount").value).toBe("90.00");
    expect(byId<HTMLInputElement>("detail-0-totalAmount").value).toBe("113.00");
    expect(byId<HTMLInputElement>("GrandTotalAmount").value).toBe("113,00");

    // Yeni kart kalemin birimini alır ve odak Açıklama alanına gider.
    fireEvent.click(screen.getByRole("button", { name: /Yeni Detay Ekle/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("detail-1-description"));
    expect(byId<HTMLInputElement>("detail-1-unit").value).toBe("adet");
    change("detail-1-unitPrice", "10");

    const file = new File(["%PDF"], "fatura.pdf", { type: "application/pdf" });
    fireEvent.change(byId("DocumentFileInput"), { target: { files: [file] } });
    expect(await screen.findByText("fatura.pdf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Yeni Masraf Oluştur/ }));
    await waitFor(() => expect(fakeApi.log("UPLOAD")).toHaveLength(1));
    const post = fakeApi.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      branchId: "b1",
      expenseItemId: "i1",
      contextType: "GENERAL",
      vehicleId: null,
      shipmentId: null,
      warehouseId: null,
      driverId: null,
      paymentMethod: "CASH",
      supplierAccountId: null,
      fundAccountId: "f1",
      invoiceNumber: "FTR-77",
      invoiceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      dueDate: null,
      documentType: "ALIS_FATURASI",
      department: "FLEET",
      description: null,
      currency: "TRY",
      exchangeRate: null,
      lines: [
        {
          description: null,
          quantity: "1.00",
          unit: null,
          unitPrice: "100.00",
          discountRate: "10.00",
          vatRate: "20.00",
          withholdingAmount: "0.00",
          otherTaxAmount: "5.00",
        },
        {
          description: null,
          quantity: "1.00",
          unit: "adet",
          unitPrice: "10.00",
          discountRate: "0.00",
          vatRate: "20.00",
          withholdingAmount: "0.00",
          otherTaxAmount: "0.00",
        },
      ],
    });
    expect(headers.find((h) => h?.["Idempotency-Key"])?.["Idempotency-Key"]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/zto-finans/genel-masraflar/kalem/i1"),
    );
  }, 30_000);

  it("sunucu WITHHOLDING_EXCEEDS_VAT kartın Tevkifat alanına eşlenir; Nakit izni yoksa seçenek kapalı", async () => {
    signIn(["FINANCE_VIEW", "FINANCE_MANAGE"]);
    api();
    fakeApi.on("POST", "/finance/expenses", () => {
      throw apiError(400, "WITHHOLDING_EXCEEDS_VAT", "Tevkifat KDV'yi aşamaz");
    });
    renderAt("/zto-finans/genel-masraflar/yeni", ROUTES);
    await screen.findByRole("option", { name: "Genel Gider" });
    expect(screen.getByRole<HTMLOptionElement>("option", { name: "Nakit (Kasa)" }).disabled).toBe(
      true,
    );
    change("expenseTypeId", "t1");
    change("expenseItemId", "i1");
    change("Department", "OTHER");
    change("WorkPlaceID", "b1");
    change("detail-0-unitPrice", "100");
    // Cari seçimi ZtoAccountSearch ile; burada doğrudan seçili duruma getirmek için Nakit'e
    // izin yok → cari zorunluluğu hatası beklenir.
    fireEvent.click(screen.getByRole("button", { name: /Yeni Masraf Oluştur/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("supplierAccountSearch"));
    expect(screen.getByText("Tedarikçi cari seçiniz.")).toBeTruthy();
    expect(fakeApi.log("POST")).toEqual([]);
  }, 20_000);

  it("düzenleme: PEE başlığı, gerekçe zorunlu, revise gövdesi; REVERSED kayıtta uyarı", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("GET", "/finance/expenses/e1", DETAIL);
    fakeApi.on("POST", "/finance/expenses/e1/revise", { ...DETAIL, id: "e3" });
    renderAt("/zto-finans/genel-masraflar/e1/duzenle", ROUTES);
    expect(await screen.findByText(/Masraf Düzenleme \| FTR-9/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Masraf Faturaları" })).toBeTruthy();
    expect(byId<HTMLInputElement>("detail-0-totalAmount").value).toBe("120.00");

    fireEvent.click(screen.getByRole("button", { name: /Değişiklikleri Kaydet/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("ReviseReason"));
    expect(fakeApi.log("POST")).toEqual([]);

    change("ReviseReason", "Tutar hatası");
    change("detail-0-unitPrice", "60");
    fireEvent.click(screen.getByRole("button", { name: /Değişiklikleri Kaydet/ }));
    await waitFor(() => expect(fakeApi.log("POST")).toEqual(["/finance/expenses/e1/revise"]));
    const body = fakeApi.calls.find((call) => call.method === "POST")?.body as {
      reason: string;
      removeDocument: boolean;
      expense: { paymentMethod: string; fundAccountId: string; lines: { unitPrice: string }[] };
    };
    expect(body.reason).toBe("Tutar hatası");
    expect(body.removeDocument).toBe(false);
    expect(body.expense).toMatchObject({ paymentMethod: "CASH", fundAccountId: "f1" });
    expect(body.expense.lines[0].unitPrice).toBe("60.00");
    expect(headers.some((h) => !!h?.["Idempotency-Key"])).toBe(true);

    cleanup();
    fakeApi.on("GET", "/finance/expenses/e1", { ...DETAIL, status: "REVERSED" });
    renderAt("/zto-finans/genel-masraflar/e1/duzenle", ROUTES);
    expect(await screen.findByText("Bu masraf kaydı iptal edilmiş.")).toBeTruthy();
  }, 30_000);
});
