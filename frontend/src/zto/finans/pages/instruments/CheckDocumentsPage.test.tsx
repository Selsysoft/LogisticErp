// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { CheckDocumentsPage } from "./CheckDocumentsPage";
import { POSTER, VIEWER, makeInstrument } from "./billsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
  apiUpload: (path: string, body: unknown) => fakeApi.request("UPLOAD", path, body),
  apiBlobUrl: async () => "blob:x",
  apiDownload: async () => undefined,
}));

const FILE = {
  id: "file1",
  fileName: "on-yuz.jpg",
  sizeBytes: 100,
  createdBy: "u",
  createdAt: "2026-11-01T10:00:00",
};

function api(files = [FILE]) {
  fakeApi.on("GET", "/finance/instruments/c1", {
    item: makeInstrument({ id: "c1", kind: "CHECK", number: "1234567", bankName: "Ziraat" }),
    movements: [],
  });
  fakeApi.on("GET", /^\/files\?ownerType=INSTRUMENT&ownerId=c1/, files);
}

const ROUTES = { "cekler/:id/belgeler": <CheckDocumentsPage /> };

beforeEach(() => fakeApi.reset());
afterEach(cleanup);

describe("CheckDocumentsPage", () => {
  it("düz liste, başlık ve ZTO yükleme alanı (ilerleme ARIA)", async () => {
    signIn(POSTER);
    api();
    renderAt("/zto-finans/cekler/c1/belgeler", ROUTES);
    expect(await screen.findByText("on-yuz.jpg")).toBeTruthy();
    expect(screen.getByText("1234567 — Ziraat")).toBeTruthy();
    expect(screen.getByText("Maksimum dosya boyutu: 20MB")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { hidden: true });
    expect(bar.getAttribute("aria-label")).toBe("Yükleme ilerlemesi");
    expect(screen.queryByText("Paylaş")).toBeNull();
  });

  it("boş liste ve 20 MB sınırı; geçerli dosya yüklenir", async () => {
    signIn(POSTER);
    api([]);
    fakeApi.on("UPLOAD", /^\/files\?ownerType=INSTRUMENT&ownerId=c1/, FILE);
    renderAt("/zto-finans/cekler/c1/belgeler", ROUTES);
    expect(await screen.findByText("Henüz dosya bulunmamaktadır.")).toBeTruthy();
    const input = screen.getByLabelText("Dosya seç") as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));
    const big = new File(["x"], "buyuk.pdf");
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    const small = new File(["x"], "kucuk.pdf");
    fireEvent.change(input, { target: { files: [big, small] } });
    expect(await screen.findByText(/buyuk\.pdf 20MB sınırını aşıyor\./)).toBeTruthy();
    await waitFor(() => expect(fakeApi.log("UPLOAD")).toHaveLength(1));
    // Bildirim ve sr-only durum bölgesi aynı metni taşıyabilir (zamanlamaya bağlı).
    expect(
      (await screen.findAllByText(/Dosya kucuk\.pdf başarıyla yüklendi/)).length,
    ).toBeGreaterThan(0);
  });

  it("bağlam menüsü klavyeyle açılır; Sil onayı ve başarı modalı", async () => {
    signIn(POSTER);
    api();
    fakeApi.on("DELETE", "/files/file1", undefined);
    renderAt("/zto-finans/cekler/c1/belgeler", ROUTES);
    const file = await screen.findByText("on-yuz.jpg");
    fireEvent.keyDown(file, { key: "F10", shiftKey: true });
    const menu = await screen.findByRole("menu", { name: "Dosya işlemleri" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent?.trim())).toEqual(["Görüntüle", "İndir", "Sil"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "Enter" });
    const dialog = await screen.findByRole("dialog", { name: /Dosya Silme/ });
    expect(within(dialog).getByText("Dosya: on-yuz.jpg")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Evet, Sil/ }));
    expect(await screen.findByText("Dosya başarıyla silindi.")).toBeTruthy();
    expect(fakeApi.log("DELETE")).toEqual(["/files/file1"]);
  });

  it("Escape menüyü kapatır ve odak dosyaya döner; izinsizde Sil ve yükleme yok", async () => {
    signIn(VIEWER);
    api();
    renderAt("/zto-finans/cekler/c1/belgeler", ROUTES);
    const file = await screen.findByText("on-yuz.jpg");
    fireEvent.contextMenu(file);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(file);
    expect((screen.getByLabelText("Dosya seç") as HTMLInputElement).disabled).toBe(true);
  });
});
