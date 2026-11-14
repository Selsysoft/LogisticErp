// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { apiError, fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { BankAccountFormPage } from "./BankAccountFormPage";
import { BankAccountsPage } from "./BankAccountsPage";
import { MANAGER, makeAccount, makeBank, mockCommon } from "./accountsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "cari-kartlar/:id/banka-hesaplari": <BankAccountsPage />,
  "cari-kartlar/:id/banka-hesaplari/yeni": <BankAccountFormPage mode="add" />,
  "banka-hesaplari/:bankAccountId/duzenle": <BankAccountFormPage mode="edit" />,
};

const ACTIVE = makeBank();
const PASSIVE = makeBank({
  id: "bk2",
  bankName: "Vakıfbank",
  active: false,
  ibanMasked: "TR12 **** 9999",
});

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockCommon();
  fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts\?/, (call: { path: string }) =>
    call.path.includes("includeInactive=true") ? [ACTIVE, PASSIVE] : [ACTIVE],
  );
  fakeApi.on("GET", "/finance/bank-accounts/bk1", {
    ...ACTIVE,
    iban: "TR330006100519786457841326",
    accountNumber: "1234567890",
  });
});

afterEach(cleanup);

const where = () => screen.getByTestId("where");
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

describe("BankAccountsPage (ZTO BankAccounts/Index)", { timeout: 30_000 }, () => {
  it("başlık, sütunlar, maskeli IBAN ve okuma metni", async () => {
    renderAt("/zto-finans/cari-kartlar/a1/banka-hesaplari", ROUTES);
    await screen.findByText("Ziraat Bankası");
    expect(document.querySelector(".ba-modern-head h6")?.textContent).toContain(
      "Ankara Lastik (Tedarikçi) — Banka Hesapları",
    );
    expect(screen.getByText("1 kayıt")).toBeTruthy();
    expect(
      Array.from(document.querySelectorAll("#dataTable thead th"), (th) => th.textContent?.trim()),
    ).toEqual([
      "Sıra No",
      "Hesap Sahibi",
      "Banka Adı",
      "Şube Adı",
      "Hesap No",
      "IBAN",
      "Hesap Türü",
      "Para Birimi",
      "Hesap Tipi",
      "Açıklama",
      "Açılış Tarihi",
      "Son İşlem",
      "İşlemler",
    ]);
    const row = document.querySelector("#dataTable tbody tr") as HTMLElement;
    expect(row.querySelector(".iban")?.textContent).toContain("TR33 **** 1326");
    expect(within(row).getByText("IBAN, son dört hane 1326").className).toBe("sr-only");
    expect(row.textContent).toContain("Vadesiz");
    expect(row.textContent).toContain("(Yan Hesap)");
    expect(row.textContent).toContain("02.01.2026");
  });

  it("Hesap Detayları paneli: odak başlıkta, tam IBAN + Kopyala, Escape odağı geri verir", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt("/zto-finans/cari-kartlar/a1/banka-hesaplari", ROUTES);
    await screen.findByText("Ziraat Bankası");
    const trigger = screen.getByRole("button", { name: "Ziraat Bankası hesabı işlemleri" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: /Hesap Detayları/ }));
    const panel = byId("bankAccountDetailsPanel");
    await waitFor(() => expect(panel.className).toContain("open"));
    expect(document.activeElement?.id).toBe("bankAccountDetailsPanel-title");
    expect(await within(panel).findByText(/TR330006100519786457841326/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "IBAN'ı kopyala" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("TR330006100519786457841326"));
    expect(await within(panel).findByText("Kopyalandı")).toBeTruthy();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panel.className).not.toContain("open");
    expect(document.activeElement).toBe(trigger);
  });

  it("Hesap İşlemleri paneli 12.2a notu; Sil → onay → PATCH → snackbar; Pasifleri göster", async () => {
    fakeApi.on("PATCH", "/finance/bank-accounts/bk1/active", { ...ACTIVE, active: false });
    renderAt("/zto-finans/cari-kartlar/a1/banka-hesaplari", ROUTES);
    await screen.findByText("Ziraat Bankası");
    fireEvent.click(screen.getByRole("button", { name: "Ziraat Bankası hesabı işlemleri" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Hesap İşlemleri/ }));
    expect(
      await screen.findByText("Bu hesaba yapılan ödemeler Faz 12.2a ile listelenecek."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ziraat Bankası hesabı işlemleri" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Sil$/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Bu banka hesabını silmek istediğinize emin misiniz?");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "İptal" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false }),
    );
    expect(await screen.findByText("Banka hesabı başarıyla silindi.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Pasifleri göster"));
    expect(await screen.findByText("Vakıfbank")).toBeTruthy();
  });
});

describe("BankAccountFormPage (ZTO BankAccounts/Add, Edit)", { timeout: 30_000 }, () => {
  it("Add: başlık, varsayılanlar, ikisinden biri kuralı, IBAN süzgeci, POST ve liste", async () => {
    fakeApi.on("POST", "/finance/accounts/a1/bank-accounts", ACTIVE);
    renderAt("/zto-finans/cari-kartlar/a1/banka-hesaplari/yeni", ROUTES);
    expect(await screen.findByText("Yeni Banka Hesabı", { selector: "h5" })).toBeTruthy();
    expect(screen.getByText("Ankara Lastik (Tedarikçi)")).toBeTruthy();
    expect(byId<HTMLSelectElement>("AccountType").value).toBe("DEMAND");
    expect(byId<HTMLSelectElement>("AccountCategory").value).toBe("SUB");
    expect(byId<HTMLInputElement>("IBAN").maxLength).toBe(34);
    fireEvent.change(byId("BankName"), { target: { value: "Ziraat" } });
    await screen.findByText("₺ - Türk Lirası", { selector: "option" });
    fireEvent.change(byId("CurrencyID"), { target: { value: "TRY" } });
    fireEvent.click(screen.getByRole("button", { name: /Yeni Banka Hesabı Oluştur/ }));
    expect(await screen.findByText("IBAN veya hesap numarası girilmelidir.")).toBeTruthy();
    expect(byId("AccountNumber").getAttribute("aria-describedby")).toBe("IBAN-error");
    fireEvent.change(byId("IBAN"), { target: { value: "tr33 0006 1005 1978 6457 8413 26" } });
    expect(byId<HTMLInputElement>("IBAN").value).toBe("TR330006100519786457841326");
    fireEvent.click(screen.getByRole("button", { name: /Yeni Banka Hesabı Oluştur/ }));
    await waitFor(() =>
      expect(where().textContent).toBe("/zto-finans/cari-kartlar/a1/banka-hesaplari"),
    );
    expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      bankName: "Ziraat",
      iban: "TR330006100519786457841326",
      currency: "TRY",
      accountKind: "DEMAND",
      category: "SUB",
    });
  });

  it("Edit: maskeli başlık, tam IBAN; IBAN tekrarında ZTO iletisi IBAN altında", async () => {
    fakeApi.on("PUT", "/finance/bank-accounts/bk1", () => {
      throw apiError(409, "IBAN_TAKEN", "Bu IBAN bilgisi kayıtlıdır, lütfen kontrol ediniz.");
    });
    renderAt("/zto-finans/banka-hesaplari/bk1/duzenle", ROUTES);
    expect(await screen.findByText("Banka Hesabı Düzenle", { selector: "h5" })).toBeTruthy();
    expect(screen.getByText("Ziraat Bankası · TR33 **** 1326")).toBeTruthy();
    expect(byId<HTMLInputElement>("IBAN").value).toBe("TR330006100519786457841326");
    expect(document.querySelector(".cst-wrap")?.className).toContain("cst-edit");
    fireEvent.click(screen.getByRole("button", { name: /Güncelle/ }));
    await waitFor(() =>
      expect(byId("IBAN-error").textContent).toBe(
        "Bu IBAN bilgisi kayıtlıdır, lütfen kontrol ediniz.",
      ),
    );
    expect(byId("IBAN").getAttribute("aria-invalid")).toBe("true");
  });
});
