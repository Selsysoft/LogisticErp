// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../i18n";
import { fakeApi, page, renderAt, signIn } from "../definitions/definitionTestUtils";
import { CariTransferModal } from "./CariTransferModal";
import { commonApi, makeAccount, transferable } from "./transactionsTestUtils";

vi.mock("../../../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../api/client")>()),
  apiGet: (path: string) => fakeApi.request("GET", path),
  apiRequest: (method: string, path: string, body?: unknown) => fakeApi.request(method, path, body),
}));

const check = {
  id: "i1",
  kind: "CHECK" as const,
  number: "C-77",
  status: "PORTFOLIO",
  role: "DRAWER" as const,
};

beforeEach(() => {
  fakeApi.reset();
  signIn(["FINANCE_VIEW", "FINANCE_MANAGE"]);
  commonApi();
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/transferable-transactions/, [
    transferable("t1"),
    transferable("t2", { instruments: [check], instrumentGroup: "g1" }),
    transferable("t3", { instruments: [check], instrumentGroup: "g1", kind: "PAYMENT" }),
    transferable("t4", { blockedReason: "OPEN_PLAN" }),
    transferable("t5", { blockedReason: "FX_DOCUMENT_OPEN" }),
    transferable("t6", { blockedReason: "FX_DOCUMENT" }),
  ]);
  fakeApi.on(
    "GET",
    /^\/finance\/accounts\?/,
    page([makeAccount({ id: "a2", code: "TED-002", name: "Yıldız Tedarik" })]),
  );
  fakeApi.on("GET", /^\/finance\/account-transfers\?/, page([]));
});
afterEach(cleanup);

function open() {
  return renderAt("/zto-finans/test", {
    test: <CariTransferModal show onHide={() => undefined} account={makeAccount()} />,
  });
}

describe("CariTransferModal", () => {
  it(".modal#cariTasimaModal kökü, ct-modal-90 ve iş yeri gruplaması", async () => {
    open();
    await screen.findByText("B-t1");
    expect(
      document.querySelector(".modal#cariTasimaModal .modal-dialog.ct-modal-90"),
    ).not.toBeNull();
    expect(document.querySelector(".modal-dialog#cariTasimaModal")).toBeNull();
    expect(document.querySelectorAll(".ct-wp-group")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Para Birimi/ }));
    expect(document.querySelectorAll(".ct-wp-group")).toHaveLength(0);
    expect(document.querySelectorAll(".ct-cur-group")).toHaveLength(1);
  });

  it("aynı çeke bağlı satırlar birlikte seçilir, açık planlı satır pasif", async () => {
    open();
    await screen.findByText("B-t2");
    const box = (id: string) => document.getElementById(`ct-chk-${id}`) as HTMLInputElement;
    fireEvent.click(box("t2"));
    expect(box("t3").checked).toBe(true);
    expect(box("t4").disabled).toBe(true);
    expect(screen.getByRole("status", { name: "" }).textContent).toBe("2 seçili");
    const groupBox = document.querySelector(".ct-wp-selall") as HTMLInputElement;
    expect(groupBox.getAttribute("aria-checked")).toBe("mixed");
    expect(groupBox.indeterminate).toBe(true);
  });

  it("hedef yoksa uyarı; onay metni ve çek uyarısı; Evet, Taşı → POST", async () => {
    fakeApi.on("POST", "/finance/account-transfers", {
      id: "tr1",
      lines: [{ id: "l1" }, { id: "l2" }],
      checkCount: 1,
      noteCount: 0,
    });
    open();
    await screen.findByText("B-t2");
    fireEvent.click(screen.getByRole("button", { name: /^Taşı$/ }));
    expect(await screen.findByText("Lütfen hedef cari seçiniz.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tamam" }));

    const input = screen.getByPlaceholderText("Cari adı / kodu ara...");
    fireEvent.change(input, { target: { value: "Yıl" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    fireEvent.click(await screen.findByText("TED-002 - Yıldız Tedarik"));
    fireEvent.click(document.getElementById("ct-chk-t2")!);
    fireEvent.click(screen.getByRole("button", { name: /^Taşı$/ }));

    const confirm = (await screen.findByText("Cari Taşıma Onayı")).closest(".modal") as HTMLElement;
    expect(confirm.id).toBe("ctConfirmModal");
    expect(within(confirm).getByText(/2 hareket/).textContent).toBe(
      "2 hareket TED-002 - Yıldız Tedarik cariye taşınacak.",
    );
    expect(
      within(confirm).getByText("Seçtiğiniz cari hareketlerden 2 tanesi çek içermektedir."),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Vazgeç"));
    fireEvent.click(within(confirm).getByRole("button", { name: /Evet, Taşı/ }));
    await waitFor(() => expect(fakeApi.log("POST")).toEqual(["/finance/account-transfers"]));
    const body = fakeApi.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      fromAccountId: "a1",
      toAccountId: "a2",
      transactionIds: ["t2", "t3"],
    });
  });

  it("12.8: engel nedenine göre başlık (plan, açık kur farkı kaynağı, kur farkı belgesi)", async () => {
    open();
    await screen.findByText("B-t5");
    const row = (id: string) => document.getElementById(`ct-chk-${id}`)?.closest("tr");
    expect(row("t4")?.getAttribute("title")).toBe(
      "Açık ödeme planı var; önce planı ödeyin ya da iptal edin.",
    );
    expect(row("t5")?.getAttribute("title")).toBe(
      "Açık kur farkı belgesi var; önce kur farkı belgesini iptal edin.",
    );
    expect(row("t6")?.getAttribute("title")).toBe(
      "Kur farkı belgesi taşınamaz; kaynağıyla birlikte iptal edip yeniden kesin.",
    );
    const box = document.getElementById("ct-chk-t6") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(document.getElementById("ct-chk-t6-blocked")?.textContent).toBe(
      "Kur farkı belgesi taşınamaz; kaynağıyla birlikte iptal edip yeniden kesin.",
    );
  });
});
