// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import {
  ZtoConfirmModal,
  ZtoConfirmModalProps,
  ZtoConfirmOptions,
  useZtoConfirm,
} from "./ZtoConfirmModal";

afterEach(cleanup);

function renderConfirm(props: Partial<ZtoConfirmModalProps> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <ZtoFinansRoot>
      <ZtoConfirmModal
        show
        animation={false}
        {...props}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ZtoFinansRoot>,
  );
  return { onConfirm, onCancel };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ZtoConfirmModal", () => {
  it("varsayılan danger görünümü ZTO silme modalını birebir üretir", () => {
    renderConfirm();
    const header = document.querySelector(".modal-header") as HTMLElement;
    expect(header.className).toBe("modal-header bg-danger text-white");
    const title = header.querySelector("h5.modal-title") as HTMLElement;
    expect(title.querySelector("i")?.className).toBe("fas fa-exclamation-triangle");
    expect(title.textContent).toBe(" Silme Onayı");
    expect(header.querySelector("button.close")?.className).toBe("close text-white");

    const body = document.querySelector(".modal-body") as HTMLElement;
    const [question, note] = Array.from(body.children) as HTMLElement[];
    expect(question.tagName).toBe("P");
    expect(question.textContent).toBe("Bu kaydı silmek istediğinize emin misiniz?");
    expect(note.className).toBe("text-muted");
    expect(note.querySelector("small")?.textContent).toBe("Bu işlem geri alınamaz.");

    const [cancel, confirm] = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".modal-footer > button"),
    );
    expect(cancel.className).toBe("btn btn-secondary");
    expect(cancel.querySelector("i")?.className).toBe("fas fa-times");
    expect(cancel.textContent).toBe(" İptal");
    expect(confirm.className).toBe("btn btn-danger");
    expect(confirm.querySelector("i")?.className).toBe("fas fa-trash");
    expect(confirm.textContent).toBe(" Sil");
  });

  it("primary ve warning varyantları", () => {
    renderConfirm({ variant: "primary", message: "Ödeme onaylansın mı?" });
    expect(document.querySelector(".modal-header")?.className).toBe(
      "modal-header bg-primary text-white",
    );
    expect(document.querySelector(".modal-title")?.textContent).toBe(" Onay");
    expect(document.querySelector(".modal-title i")?.className).toBe("fas fa-question-circle");
    expect(document.querySelector(".modal-body")?.textContent).toBe("Ödeme onaylansın mı?");
    expect(screen.getByRole("button", { name: "Onayla" }).className).toBe("btn btn-primary");
    cleanup();

    renderConfirm({ variant: "warning" });
    expect(document.querySelector(".modal-header")?.className).toBe(
      "modal-header bg-warning text-dark",
    );
    expect(document.querySelector("button.close")?.className).toBe("close");
    expect(document.querySelector(".modal-title")?.textContent).toBe(" Uyarı");
    expect(screen.getByRole("button", { name: "Onayla" }).className).toBe("btn btn-warning");
  });

  it("metinler ve not değiştirilebilir, null not gizler", () => {
    renderConfirm({
      title: "Masrafı Sil",
      message: "Bu masrafı silmek istediğinizden emin misiniz?",
      note: null,
      confirmText: "Evet, Sil",
      cancelText: "Vazgeç",
    });
    expect(document.querySelector(".modal-title")?.textContent).toBe(" Masrafı Sil");
    expect(document.querySelectorAll(".modal-body p")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Evet, Sil" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vazgeç" })).toBeTruthy();
  });

  it("senkron onay ve iptal çağrılır", () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("async onayda spinner gösterir, düğmeleri ve kapatmayı kilitler", async () => {
    const pending = deferred();
    const onConfirm = vi.fn(() => pending.promise);
    const { onCancel } = renderConfirm({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));

    const confirm = document.querySelector(".modal-footer .btn-danger") as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(true));
    const spinner = confirm.querySelector("span.spinner-border.spinner-border-sm") as HTMLElement;
    expect(spinner.getAttribute("role")).toBe("status");
    expect(spinner.getAttribute("aria-hidden")).toBe("true");
    expect(confirm.textContent).toBe(" Siliniyor...");
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(
      (document.querySelector(".modal-footer .btn-secondary") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((document.querySelector("button.close") as HTMLButtonElement).disabled).toBe(true);

    // Beklerken ikinci tıklama ve ESC etkisiz.
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toBe(" Sil");
  });

  it("primary varyantta bekleme metni İşleniyor...", async () => {
    const pending = deferred();
    renderConfirm({ variant: "primary", onConfirm: () => pending.promise });
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() =>
      expect(document.querySelector(".modal-footer .btn-primary")?.textContent).toBe(
        " İşleniyor...",
      ),
    );
    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });

  it("async hata kilidi açar ve onError'a iletir", async () => {
    const pending = deferred();
    const onError = vi.fn();
    renderConfirm({ onConfirm: () => pending.promise, onError });
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    const failure = new Error("sunucu");
    await act(async () => {
      pending.reject(failure);
      await pending.promise.catch(() => undefined);
    });
    expect(onError).toHaveBeenCalledWith(failure);
    expect(
      (document.querySelector(".modal-footer .btn-danger") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("senkron hata onError'a iletilir", () => {
    const onError = vi.fn();
    const failure = new Error("hemen");
    renderConfirm({
      onConfirm: () => {
        throw failure;
      },
      onError,
    });
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("onError yoksa async hata yutulur ve kilit açılır", async () => {
    const pending = deferred();
    renderConfirm({ onConfirm: () => pending.promise });
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await act(async () => {
      pending.reject(new Error("x"));
      await pending.promise.catch(() => undefined);
    });
    expect(
      (document.querySelector(".modal-footer .btn-danger") as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("ZtoConfirmModal ilk odak (MWG dialog)", () => {
  function Opener({ props }: { props: Partial<ZtoConfirmModalProps> }) {
    const [show, setShow] = useState(false);
    return (
      <ZtoFinansRoot>
        <button onClick={() => setShow(true)}>Sil aç</button>
        <ZtoConfirmModal
          show={show}
          animation={false}
          {...props}
          onConfirm={() => setShow(false)}
          onCancel={() => setShow(false)}
        />
      </ZtoFinansRoot>
    );
  }

  it("danger: açılışta güvenli düğme (İptal) odakta; kapanınca odak açan düğmeye döner", () => {
    render(<Opener props={{}} />);
    const opener = screen.getByText("Sil aç");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement?.textContent?.trim()).toBe("İptal");
    fireEvent.click(document.activeElement as HTMLElement);
    expect(document.querySelector(".modal")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("initialFocus='confirm' onay düğmesini; primary varsayılanı düğme odaklamaz", () => {
    render(<Opener props={{ variant: "warning", initialFocus: "confirm" }} />);
    fireEvent.click(screen.getByText("Sil aç"));
    expect(document.activeElement?.textContent?.trim()).toBe("Onayla");
    cleanup();
    render(<Opener props={{ variant: "primary" }} />);
    fireEvent.click(screen.getByText("Sil aç"));
    expect(document.activeElement?.tagName).not.toBe("BUTTON");
  });
});

describe("useZtoConfirm", () => {
  function Harness({
    options,
    onResult,
  }: {
    options?: ZtoConfirmOptions;
    onResult: (value: boolean) => void;
  }) {
    const { confirm, confirmModal } = useZtoConfirm();
    return (
      <>
        <button onClick={() => void confirm(options).then(onResult)}>sor</button>
        {confirmModal}
      </>
    );
  }

  function renderHarness(options?: ZtoConfirmOptions) {
    const onResult = vi.fn();
    const view = render(
      <ZtoFinansRoot>
        <Harness options={{ animation: false, ...options }} onResult={onResult} />
      </ZtoFinansRoot>,
    );
    return { onResult, ...view };
  }

  it("başta modal çizmez; onayda true döner ve kapanır", async () => {
    const { onResult } = renderHarness({ message: "Silinsin mi?" });
    expect(document.querySelector(".modal")).toBeNull();
    fireEvent.click(screen.getByText("sor"));
    expect(document.querySelector(".modal-body")?.textContent).toContain("Silinsin mi?");
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(document.querySelector(".modal")).toBeNull();
  });

  it("iptalde false döner", async () => {
    const { onResult } = renderHarness();
    fireEvent.click(screen.getByText("sor"));
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("yeni çağrı bekleyeni false ile kapatır", async () => {
    const { onResult } = renderHarness();
    fireEvent.click(screen.getByText("sor"));
    fireEvent.click(screen.getByText("sor", { ignore: ".modal *" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it("bileşen kaldırılınca bekleyen çağrı false döner", async () => {
    const { onResult, unmount } = renderHarness();
    fireEvent.click(screen.getByText("sor"));
    unmount();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("seçenekler modala geçer", () => {
    renderHarness({ variant: "primary", title: "Plan Onayı" });
    fireEvent.click(screen.getByText("sor"));
    expect(document.querySelector(".modal-title")?.textContent).toBe(" Plan Onayı");
  });

  it("varsayılan seçeneklerle de çalışır", async () => {
    function Bare({ onResult }: { onResult: (value: boolean) => void }) {
      const { confirm, confirmModal } = useZtoConfirm();
      const [asked, setAsked] = useState(false);
      return (
        <>
          <button
            onClick={() => {
              setAsked(true);
              void confirm().then(onResult);
            }}
          >
            {asked ? "soruldu" : "sor"}
          </button>
          {confirmModal}
        </>
      );
    }
    const onResult = vi.fn();
    render(
      <ZtoFinansRoot>
        <Bare onResult={onResult} />
      </ZtoFinansRoot>,
    );
    fireEvent.click(screen.getByText("sor"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "İptal" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
