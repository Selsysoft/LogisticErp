// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { fakeApi, renderAt, signIn } from "../definitions/definitionTestUtils";
import { CheckBooksPage } from "./CheckBooksPage";
import { MANAGER, POSTER, makeBook, makeLeaf, pageOf } from "./billsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const BANK = {
  id: "f1",
  kind: "BANK",
  name: "Ziraat TL",
  bankName: "Ziraat",
  bankBranchName: "Kadıköy",
  currency: "TRY",
  active: true,
};

function api() {
  fakeApi.on("GET", /^\/finance\/check-books/, [makeBook()]);
  fakeApi.on("GET", /^\/finance\/funds\?/, [BANK]);
  fakeApi.on(
    "GET",
    /^\/finance\/check-leaves\?/,
    pageOf([
      makeLeaf({ id: "l1", number: "0001234" }),
      makeLeaf({
        id: "l2",
        number: "0001235",
        leafNo: 2,
        status: "USED",
        usedDate: "2026-11-02T10:00:00",
      }),
      makeLeaf({ id: "l3", number: "0001236", leafNo: 3, status: "VOID" }),
    ]),
  );
}

const norm = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

beforeEach(() => fakeApi.reset());
afterEach(cleanup);

describe("CheckBooksPage", () => {
  it("çipler, yaprak satırları ve durum rozetleri", async () => {
    signIn(MANAGER);
    api();
    renderAt("/zto-finans/cekler/kocanlar", { "cekler/kocanlar": <CheckBooksPage /> });
    expect(await screen.findByRole("heading", { name: "Çek Koçanları Yönetimi" })).toBeTruthy();
    const row = (await screen.findByText("0001234")).closest("tr") as HTMLElement;
    expect(norm(row)).toContain("Kullanılmadı");
    expect(norm(row)).toContain("TR000000000000000000000001");
    expect(screen.getByText("1 Defter")).toBeTruthy();
    expect(screen.getByText("10 Yaprak")).toBeTruthy();
    expect(screen.getByText("7 Kullanılabilir")).toBeTruthy();
    // Kullanılmamış: İptal Et + Sil; kullanılmış: yalnız İptal Et; iptal: "-".
    expect(within(row).getAllByRole("button")).toHaveLength(2);
    const used = screen.getByText("0001235").closest("tr") as HTMLElement;
    expect(
      within(used)
        .getAllByRole("button")
        .map((b) => b.getAttribute("title")),
    ).toEqual(["İptal Et"]);
    const voided = screen.getByText("0001236").closest("tr") as HTMLElement;
    expect(within(voided).queryAllByRole("button")).toHaveLength(0);
  });

  it("yaprak iptali onayla gönderilir", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/check-leaves/l1/void", makeLeaf({ status: "VOID" }));
    renderAt("/zto-finans/cekler/kocanlar", { "cekler/kocanlar": <CheckBooksPage /> });
    const row = (await screen.findByText("0001234")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /İptal Et/ }));
    const dialog = await screen.findByRole("dialog");
    expect(norm(dialog)).toContain("İptal durumuna almak istediğinize emin misiniz?");
    fireEvent.click(within(dialog).getByRole("button", { name: /İptal Et/ }));
    await waitFor(() => expect(fakeApi.log("POST")).toContain("/finance/check-leaves/l1/void"));
  });

  it("FINANCE_MANAGE yoksa koçan ve yaprak eylemleri çizilmez", async () => {
    signIn(POSTER);
    api();
    renderAt("/zto-finans/cekler/kocanlar", { "cekler/kocanlar": <CheckBooksPage /> });
    const row = (await screen.findByText("0001234")).closest("tr") as HTMLElement;
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Yeni Defter/ })).toBeNull();
  });

  it("Yeni Çek Defteri: ZTO iletileri, yaprak sayısı ve gönderim", async () => {
    signIn(MANAGER);
    api();
    fakeApi.on("POST", "/finance/check-books", {
      book: makeBook(),
      createdCount: 49,
      skippedNumbers: ["1234567", "1234568"],
    });
    renderAt("/zto-finans/cekler/kocanlar", { "cekler/kocanlar": <CheckBooksPage /> });
    fireEvent.click(await screen.findByRole("button", { name: /Yeni Defter/ }));
    const dialog = await screen.findByRole("dialog", { name: /Yeni Çek Defteri Ekle/ });
    fireEvent.click(within(dialog).getByRole("button", { name: /Kaydet/ }));
    expect(await within(dialog).findByText("Lütfen banka hesabı seçiniz!")).toBeTruthy();
    expect(within(dialog).getByText("Lütfen defter seri no giriniz!")).toBeTruthy();
    expect(within(dialog).getByText("Başlangıç çek numarası hatalı!")).toBeTruthy();

    await within(dialog).findByRole("option", { name: /Ziraat - Kadıköy/ });
    fireEvent.change(within(dialog).getByLabelText(/Banka Hesabı/), { target: { value: "f1" } });
    fireEvent.change(within(dialog).getByLabelText(/Defter Seri No/), {
      target: { value: "ZB-001" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Başlangıç Çek No/), {
      target: { value: "12a34567" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Bitiş Çek No/), {
      target: { value: "1234617" },
    });
    expect(norm(dialog.querySelector("#checkCountInfo"))).toContain(
      "Toplam Yaprak: 51 adet çek oluşturulacak",
    );
    fireEvent.change(within(dialog).getByLabelText(/Banka Kodu/), { target: { value: "01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Kaydet/ }));
    expect(await within(dialog).findByText("Banka kodu hatalı!")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Banka Kodu/), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() =>
      expect(fakeApi.calls.find((c) => c.method === "POST")?.body).toEqual({
        fundAccountId: "f1",
        serialNo: "ZB-001",
        startNumber: "1234567",
        endNumber: "1234617",
      }),
    );
    expect(await screen.findByText(/2 numara zaten kayıtlı olduğu için atlandı/)).toBeTruthy();
  });
});
