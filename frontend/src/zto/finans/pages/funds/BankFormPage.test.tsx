// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import {
  TWO_COMPANIES,
  apiError,
  fakeApi,
  renderAt,
  signIn,
} from "../definitions/definitionTestUtils";
import { BankFormPage } from "./BankFormPage";
import { CashFormPage } from "./CashFormPage";
import { MANAGER, makeDetail, makeFund, mockFundCommon } from "./fundsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const ROUTES = {
  "bankalar/yeni": <BankFormPage mode="add" />,
  "bankalar/:id/duzenle": <BankFormPage mode="edit" />,
  "kasalar/yeni": <CashFormPage mode="add" />,
  "kasalar/:id/duzenle": <CashFormPage mode="edit" />,
  bankalar: <div>BANKALAR</div>,
  kasalar: <div>KASALAR</div>,
};

beforeEach(() => {
  fakeApi.reset();
  signIn(MANAGER);
  mockFundCommon();
});

afterEach(cleanup);

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const where = () => screen.getByTestId("where");

async function choose(id: string, text: string) {
  const container = byId(id).parentElement as HTMLElement;
  await waitFor(() => expect(container.querySelector(".select2-selection")).toBeTruthy());
  fireEvent.mouseDown(container.querySelector(".select2-selection") as Element, { button: 0 });
  fireEvent.mouseUp(await screen.findByText(text, { selector: "li" }));
}

describe(
  "BankFormPage / CashFormPage (ZTO BankIntroduction|CashIntroduction Add, Edit)",
  { timeout: 40_000 },
  () => {
    it("Yeni Banka: ZTO düzeni, doğrulama, IBAN süzgeci, gövde ve flash", async () => {
      fakeApi.on("POST", "/finance/funds", makeFund());
      renderAt("/zto-finans/bankalar/yeni", ROUTES);
      expect(await screen.findByText("Yeni Banka", { selector: "h5" })).toBeTruthy();
      expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-bank-form");
      const labels = Array.from(document.querySelectorAll("form label"), (l) =>
        (l.textContent ?? "").replace(/\s*\*$/, ""),
      );
      expect(labels.slice(0, 13)).toEqual([
        "Banka:",
        "Banka Kodu:",
        "Hesap Adı:",
        "Şube Adı:",
        "Para Birimi:",
        "Hesap Numarası:",
        "IBAN:",
        "İş Yeri:",
        "Şube İli:",
        "Başlangıç Bakiyesi:",
        "Güncel Bakiye:",
        "Açıklama:",
        "Başlangıç Tarihi:",
      ]);
      expect(byId<HTMLInputElement>("BankCode").getAttribute("aria-invalid")).toBe("false");

      fireEvent.click(screen.getByRole("button", { name: /Yeni Banka Oluştur/ }));
      await waitFor(() => expect(byId("BankCode-error").textContent).toBe("Bu alan zorunludur."));
      expect(byId("BankCode").getAttribute("aria-describedby")).toBe("BankCode-error");
      expect(fakeApi.log("POST")).toEqual([]);

      await choose("Bank", "Akbank T.A.Ş.");
      fireEvent.change(byId("BankCode"), { target: { value: "AKB-1" } });
      fireEvent.change(byId("BankName"), { target: { value: "Akbank Vadesiz" } });
      fireEvent.change(byId("CurrencyID"), { target: { value: "TRY" } });
      const iban = byId<HTMLInputElement>("Iban");
      fireEvent.change(iban, { target: { value: "tr33 0006 1005 1978 6457 8413 27" } });
      expect(iban.value).toBe("TR330006100519786457841327");
      fireEvent.blur(iban);
      await waitFor(() =>
        expect(byId("Iban-error").textContent).toBe("Geçerli bir TR IBAN giriniz."),
      );
      fireEvent.change(iban, { target: { value: "TR330006100519786457841326" } });
      await choose("WorkPlaceID", "Merkez");
      await waitFor(() => expect(byId<HTMLInputElement>("BranchProvinceID").value).toBe("İzmir"));
      fireEvent.change(byId("InitialBalance"), { target: { value: "1000" } });
      fireEvent.click(screen.getByRole("button", { name: /Yeni Banka Oluştur/ }));
      await waitFor(() => expect(where().textContent).toBe("/zto-finans/bankalar"));
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
        code: "AKB-1",
        name: "Akbank Vadesiz",
        kind: "BANK",
        currency: "TRY",
        branchId: "b1",
        bankName: "Akbank T.A.Ş.",
        iban: "TR330006100519786457841326",
        accountType: "DEMAND",
        openingBalance: 1000,
        active: true,
        allowNegative: false,
      });
      expect(JSON.parse(where().getAttribute("data-state") ?? "{}").flash.message).toBe(
        "Vadesiz hesap başarıyla oluşturuldu.",
      );
    });

    it("eksi açılış 409 → alan hatası; kod çakışması alan hatası", async () => {
      let attempt = 0;
      fakeApi.on("POST", "/finance/funds", () => {
        attempt += 1;
        throw attempt === 1
          ? apiError(409, "INSUFFICIENT_FUNDS", "yetersiz")
          : apiError(409, "FUND_CODE_TAKEN", "kod");
      });
      renderAt("/zto-finans/kasalar/yeni", ROUTES);
      expect(await screen.findByText("Yeni Kasa", { selector: "h5" })).toBeTruthy();
      expect(document.querySelector(".zto-finans")?.className).toContain("zto-page-cash-form");
      expect(screen.queryByLabelText(/^Banka:/)).toBeNull();
      fireEvent.change(byId("CashCode"), { target: { value: "K1" } });
      fireEvent.change(byId("CashName"), { target: { value: "Merkez Kasa" } });
      fireEvent.change(byId("CurrencyID"), { target: { value: "TRY" } });
      await choose("WorkPlaceID", "Merkez");
      fireEvent.change(byId("InitialBalance"), { target: { value: "-50" } });
      fireEvent.click(screen.getByRole("button", { name: /Yeni Kasa Oluştur/ }));
      await waitFor(() =>
        expect(byId("InitialBalance-error").textContent).toBe(
          "Eksi açılış için 'Eksi bakiyeye izin ver' seçilmelidir.",
        ),
      );
      fireEvent.click(byId("AllowNegative"));
      fireEvent.click(screen.getByRole("button", { name: /Yeni Kasa Oluştur/ }));
      await waitFor(() =>
        expect(byId("CashCode-error").textContent).toBe("Bu kod başka bir hesapta kullanılıyor."),
      );
      expect(fakeApi.calls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({
        kind: "CASH",
        allowNegative: true,
        openingBalance: -50,
        bankName: undefined,
      });
    });

    it("Banka Düzenle: 'Banka Adı' etiketi, kod salt okunur, para birimi kilitli, açılış değişmezse null", async () => {
      signIn(MANAGER, TWO_COMPANIES);
      fakeApi.on("GET", "/finance/funds/f1", makeDetail({ bankName: "Eski Banka" }));
      fakeApi.on("PUT", "/finance/funds/f1", makeFund());
      renderAt("/zto-finans/bankalar/f1/duzenle", ROUTES);
      expect(await screen.findByText("Banka Düzenle", { selector: "h5" })).toBeTruthy();
      expect(screen.getByText("Banka Adı:", { exact: false, selector: "label" })).toBeTruthy();
      expect(byId<HTMLInputElement>("BankCode").readOnly).toBe(true);
      expect(byId<HTMLSelectElement>("CurrencyID").disabled).toBe(true);
      expect(byId<HTMLInputElement>("Balance").value).toBe("1.500,00");
      expect(byId<HTMLInputElement>("AccountNumber").value).toBe("12345678");
      expect(screen.getByText("Şirket: Acme")).toBeTruthy();
      fireEvent.change(byId("BankName"), { target: { value: "Ziraat Yeni Ad" } });
      fireEvent.click(screen.getByRole("button", { name: /Banka Güncelle/ }));
      await waitFor(() => expect(where().textContent).toBe("/zto-finans/bankalar"));
      expect(fakeApi.calls.find((c) => c.method === "PUT")?.body).toMatchObject({
        name: "Ziraat Yeni Ad",
        bankName: "Eski Banka",
        openingBalance: null,
        accountNo: "12345678",
      });
    });

    it("döviz kasada açılış kuru: alan yalnız TRY dışı + açılış ≠ 0 iken; RATE_MISSING alan hatası", async () => {
      let attempt = 0;
      fakeApi.on("POST", "/finance/funds", () => {
        attempt += 1;
        if (attempt === 1) throw apiError(422, "RATE_MISSING", "kur yok");
        return makeFund();
      });
      renderAt("/zto-finans/kasalar/yeni", ROUTES);
      await screen.findByText("Yeni Kasa", { selector: "h5" });
      fireEvent.change(byId("CashCode"), { target: { value: "K-USD" } });
      fireEvent.change(byId("CashName"), { target: { value: "Döviz Kasa" } });
      await waitFor(() =>
        expect(byId("CurrencyID").querySelector('option[value="USD"]')).toBeTruthy(),
      );
      fireEvent.change(byId("CurrencyID"), { target: { value: "USD" } });
      await choose("WorkPlaceID", "Merkez");
      expect(byId("OpeningRate")).toBeNull();
      fireEvent.change(byId("InitialBalance"), { target: { value: "5000" } });
      await waitFor(() => expect(byId("OpeningRate")).toBeTruthy());
      expect(byId("OpeningRate").getAttribute("aria-describedby")).toBe("OpeningRateHint");

      fireEvent.click(screen.getByRole("button", { name: /Yeni Kasa Oluştur/ }));
      await waitFor(() =>
        expect(byId("OpeningRate-error").textContent).toBe(
          "Başlangıç tarihi için kur bulunamadı; açılış kurunu giriniz.",
        ),
      );
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
        currency: "USD",
        openingBalance: 5000,
        openingRate: undefined,
      });
      fireEvent.change(byId("OpeningRate"), { target: { value: "35" } });
      fireEvent.click(screen.getByRole("button", { name: /Yeni Kasa Oluştur/ }));
      await waitFor(() => expect(where().textContent).toBe("/zto-finans/kasalar"));
      expect(fakeApi.calls.filter((c) => c.method === "POST").at(-1)?.body).toMatchObject({
        currency: "USD",
        openingBalance: 5000,
        openingRate: 35,
      });
    });

    it("Kredi hesabı düzenlenemez; yüklenemeyen hesap hata", async () => {
      fakeApi.on("GET", "/finance/funds/f3", makeDetail({ id: "f3", accountType: "CREDIT" }));
      fakeApi.on("GET", "/finance/funds/yok", () => {
        throw apiError(404, "FUND_NOT_FOUND", "Hesap bulunamadı");
      });
      renderAt("/zto-finans/bankalar/f3/duzenle", ROUTES);
      expect(await screen.findByText("Bu hesap tipi düzenlenemez.")).toBeTruthy();
      cleanup();
      renderAt("/zto-finans/kasalar/yok/duzenle", ROUTES);
      expect(await screen.findByText("Hesap bulunamadı")).toBeTruthy();
    });

    it("yalnız klavyeyle gönderim: Enter formu gönderir, ilk hatalı alana odak", async () => {
      renderAt("/zto-finans/kasalar/yeni", ROUTES);
      await screen.findByText("Yeni Kasa", { selector: "h5" });
      const code = byId<HTMLInputElement>("CashCode");
      fireEvent.submit(code.closest("form") as HTMLFormElement);
      await waitFor(() => expect(document.activeElement).toBe(code));
    });
  },
);
