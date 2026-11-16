// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { EditInstrumentPage } from "./EditInstrumentPage";
import { POSTER, makeInstrument } from "./billsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const check = makeInstrument({
  id: "c1",
  kind: "CHECK",
  number: "1234567",
  bankName: "Ziraat",
  noteType: null,
  allowedTransitions: ["RETURNED", "AT_BANK"],
});

const ROUTES = {
  "cekler/:id/duzenle": <EditInstrumentPage kind="CHECK" />,
  "senetler/:id/duzenle": <EditInstrumentPage kind="NOTE" />,
};

beforeEach(() => fakeApi.reset());
afterEach(cleanup);

describe("EditInstrumentPage", () => {
  it("çek: ZTO kartları, salt okunur tutar, numara iletileri ve yalnız değişenlerle PATCH", async () => {
    signIn(POSTER);
    fakeApi.on("GET", "/finance/instruments/c1", { item: check, movements: [] });
    fakeApi.on("PATCH", "/finance/instruments/c1", { ...check, bankName: "Halkbank" });
    renderAt("/zto-finans/cekler/c1/duzenle", ROUTES);
    expect(await screen.findByText(/Çek Düzenle - 1234567/)).toBeTruthy();
    // Başlık formdan önce çizilebilir (yük altında); alanı ayrıca bekle.
    const amount = (await screen.findByLabelText(
      "Tutar *",
      {},
      { timeout: 10_000 },
    )) as HTMLInputElement;
    expect(amount.readOnly).toBe(true);
    expect(screen.getByRole("link", { name: /Düzelt \(ters kayıt \+ yeni\)/ })).toBeTruthy();

    const number = screen.getByLabelText(/Çek Numarası/) as HTMLInputElement;
    fireEvent.change(number, { target: { value: "12a3" } });
    expect(number.value).toBe("123");
    fireEvent.blur(number);
    expect(await screen.findByText("Çek numarası tam 7 haneli olmalıdır")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Değişiklikleri Kaydet/ }));
    expect(
      await screen.findByText("Lütfen geçerli bir çek numarası giriniz (7 haneli sayısal değer)."),
    ).toBeTruthy();
    expect(fakeApi.log("PATCH")).toEqual([]);

    fireEvent.change(number, { target: { value: "1234567" } });
    fireEvent.change(screen.getByLabelText("Banka Adı *"), { target: { value: "Halkbank" } });
    fireEvent.click(screen.getByRole("button", { name: /Değişiklikleri Kaydet/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "PATCH")?.body).toEqual({
        bankName: "Halkbank",
      }),
    );
    expect(await screen.findByText("Değişiklikler kaydedildi.")).toBeTruthy();
  }, 20_000);

  it("numara çakışması (excludeId) ve tarih sırası", async () => {
    signIn(POSTER);
    fakeApi.on("GET", "/finance/instruments/c1", { item: check, movements: [] });
    fakeApi.on("GET", /^\/finance\/instruments\/check-number\?/, {
      valid: true,
      available: false,
      conflictId: "c9",
      conflictStatus: "PORTFOLIO",
      conflictAccountName: "Güney",
    });
    renderAt("/zto-finans/cekler/c1/duzenle", ROUTES);
    const number = (await screen.findByLabelText(/Çek Numarası/)) as HTMLInputElement;
    fireEvent.change(number, { target: { value: "7654321" } });
    expect(
      await screen.findByText(
        "Bu çek numarası zaten kullanılıyor! (Güney - Portföyde)",
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    const query = fakeApi.log("GET").find((p) => p.includes("check-number")) ?? "";
    expect(query).toContain("excludeId=c1");
    expect(query).toContain("companyId=co1");

    fireEvent.change(screen.getByLabelText("Keşide Tarihi *"), { target: { value: "2027-02-01" } });
    fireEvent.change(screen.getByLabelText("Vade Tarihi *"), { target: { value: "2027-01-01" } });
    expect(await screen.findByText("Vade tarihi, keşide tarihinden önce olamaz!")).toBeTruthy();
  });

  it("alınan çekte İptal Et: iade onayı RETURNED gönderir", async () => {
    signIn(POSTER);
    fakeApi.on("GET", "/finance/instruments/c1", { item: check, movements: [] });
    fakeApi.on("POST", "/finance/instruments/c1/transition", { ...check, status: "RETURNED" });
    renderAt("/zto-finans/cekler/c1/duzenle", ROUTES);
    fireEvent.click(await screen.findByRole("button", { name: /İptal Et/ }));
    const dialog = await screen.findByRole("dialog", { name: /İşlemi Onaylayın/ });
    fireEvent.click(screen.getByRole("button", { name: /Onayla ve Devam Et/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toMatchObject({
        toStatus: "RETURNED",
      }),
    );
    expect(dialog).toBeTruthy();
  });

  it("senet: EBL düzeni, teminat devre dışı, koçan kilidi yok; bulunamazsa ileti", async () => {
    signIn(POSTER);
    const note = makeInstrument({ id: "n1", status: "PAID", allowedTransitions: [] });
    fakeApi.on("GET", "/finance/instruments/n1", { item: note, movements: [] });
    renderAt("/zto-finans/senetler/n1/duzenle", ROUTES);
    expect(await screen.findByText(/Senet Düzenle - SEN-001/)).toBeTruthy();
    expect((screen.getByLabelText(/Teminat Senedi/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Vade Tarihi *") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Keşideci senedi düzenleyen/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /İptal Et/ })).toBeNull();
    cleanup();
    fakeApi.on("GET", "/finance/instruments/x", () => {
      throw Object.assign(new Error("yok"), {
        status: 404,
        body: { code: "INSTRUMENT_NOT_FOUND" },
      });
    });
    renderAt("/zto-finans/senetler/x/duzenle", ROUTES);
    expect(await screen.findByText("Kayıt bulunamadı.")).toBeTruthy();
  });
});
