// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoModal, ZtoModalProps } from "./ZtoModal";

afterEach(cleanup);

function root() {
  return document.querySelector(".zto-finans") as HTMLElement;
}

function renderModal(props: Partial<ZtoModalProps> = {}) {
  const onHide = vi.fn();
  const view = render(
    <ZtoFinansRoot>
      <p>sayfa</p>
      <ZtoModal show onHide={onHide} title="Başlık" animation={false} {...props}>
        <p>gövde</p>
      </ZtoModal>
    </ZtoFinansRoot>,
  );
  return { onHide, ...view };
}

describe("ZtoModal", () => {
  it("Bootstrap 4 markup'ını kök içine çizer", () => {
    renderModal({
      size: "lg",
      centered: true,
      scrollable: true,
      headerClassName: "bg-primary text-white",
      closeButtonClassName: "text-white",
      dialogClassName: "ozel-dialog",
      bodyClassName: "p-0",
      footer: <button className="btn btn-secondary">Kapat</button>,
      id: "ornekModal",
    });
    const modal = document.querySelector(".modal") as HTMLElement;
    expect(root().contains(modal)).toBe(true);
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("tabindex")).toBe("-1");
    expect(modal.style.overflowY).toBe("auto");

    const dialog = modal.querySelector(":scope > .modal-dialog") as HTMLElement;
    expect(dialog.className).toBe(
      "modal-dialog ozel-dialog modal-lg modal-dialog-centered modal-dialog-scrollable",
    );
    expect(dialog.id).toBe("ornekModal");
    expect(dialog.getAttribute("role")).toBe("document");

    const content = dialog.querySelector(":scope > .modal-content") as HTMLElement;
    const [header, body, footer] = Array.from(content.children) as HTMLElement[];
    expect(header.className).toBe("modal-header bg-primary text-white");
    const title = header.querySelector("h5.modal-title") as HTMLElement;
    expect(title.textContent).toBe("Başlık");
    expect(title.id).toBe("ornekModalLabel");
    expect(modal.getAttribute("aria-labelledby")).toBe("ornekModalLabel");

    const close = header.querySelector("button.close") as HTMLButtonElement;
    expect(close.className).toBe("close text-white");
    expect(close.getAttribute("data-dismiss")).toBe("modal");
    expect(close.getAttribute("aria-label")).toBe("Kapat");
    expect(close.querySelector("span[aria-hidden='true']")?.textContent).toBe("×");

    expect(body.className).toBe("modal-body p-0");
    expect(body.textContent).toBe("gövde");
    expect(footer.className).toBe("modal-footer");

    const backdrop = root().querySelector(":scope > .modal-backdrop") as HTMLElement;
    expect(backdrop.className).toBe("modal-backdrop show");
  });

  it("animasyonla fade show sınıflarını alır", async () => {
    renderModal({ animation: true });
    await waitFor(() => {
      const modal = document.querySelector(".modal") as HTMLElement;
      expect(Array.from(modal.classList).sort()).toEqual(["fade", "modal", "show"]);
    });
    const backdrop = document.querySelector(".modal-backdrop") as HTMLElement;
    expect(Array.from(backdrop.classList).sort()).toEqual(["fade", "modal-backdrop", "show"]);
  });

  it("başlıksız ve kapat düğmesiz, footer'sız çizilebilir", () => {
    renderModal({ title: undefined, closeButton: false, titleAs: "h6" });
    expect(document.querySelector(".modal-header")).toBeNull();
    expect(document.querySelector(".modal-footer")).toBeNull();
    expect(document.querySelector(".modal")?.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("başlık etiketi seçilebilir, kapat düğmesi kilitlenebilir", () => {
    const { onHide } = renderModal({ titleAs: "h6", closeDisabled: true });
    expect(document.querySelector("h6.modal-title")?.textContent).toBe("Başlık");
    const close = screen.getByRole("button", { name: "Kapat" });
    expect((close as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(close);
    expect(onHide).not.toHaveBeenCalled();
  });

  it("kapat düğmesi, ESC ve backdrop tıklaması onHide çağırır", () => {
    const { onHide } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onHide).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    expect(onHide).toHaveBeenCalledTimes(2);
    const modal = document.querySelector(".modal") as HTMLElement;
    fireEvent.mouseUp(modal);
    fireEvent.click(modal);
    expect(onHide).toHaveBeenCalledTimes(3);
  });

  it("static backdrop ve keyboard=false kapatmaz", () => {
    const { onHide } = renderModal({ backdrop: "static", keyboard: false });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    fireEvent.click(document.querySelector(".modal") as HTMLElement);
    expect(onHide).not.toHaveBeenCalled();
  });

  it("keyboard=false: backdrop varsayılan ya da false iken de ESC kapatmaz (Bootstrap 4)", () => {
    const { onHide } = renderModal({ keyboard: false });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    expect(onHide).not.toHaveBeenCalled();
    cleanup();
    const second = renderModal({ keyboard: false, backdrop: false });
    fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    expect(second.onHide).not.toHaveBeenCalled();
  });

  it("açıkken kök modal-open alır, body kilitlenir, kardeşler aria-hidden olur; kapanınca geri alınır", () => {
    document.body.style.overflow = "scroll";
    function Toggle() {
      const [show, setShow] = useState(true);
      return (
        <ZtoFinansRoot>
          <button onClick={() => setShow(false)}>dış kapat</button>
          <ZtoModal show={show} onHide={() => setShow(false)} title="T" animation={false}>
            içerik
          </ZtoModal>
        </ZtoFinansRoot>
      );
    }
    render(<Toggle />);
    expect(root().classList.contains("modal-open")).toBe(true);
    expect(document.body.classList.contains("modal-open")).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    // Kökün kendisi kırpılmaz.
    expect(root().style.overflow).toBe("");
    const outside = screen.getByText("dış kapat", { ignore: ".modal *" });
    expect(outside.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(document.querySelector(".modal")).toBeNull();
    expect(root().classList.contains("modal-open")).toBe(false);
    expect(document.body.style.overflow).toBe("scroll");
    expect(outside.hasAttribute("aria-hidden")).toBe(false);
    document.body.style.overflow = "";
  });

  it("üst üste modal: üstteki daha yüksek z-index alır, backdrop'lar kökte kalır", () => {
    function Stacked() {
      const [second, setSecond] = useState(false);
      return (
        <ZtoFinansRoot>
          <ZtoModal show onHide={() => undefined} title="Birinci" animation={false}>
            <button onClick={() => setSecond(true)}>ikinciyi aç</button>
          </ZtoModal>
          <ZtoModal show={second} onHide={() => setSecond(false)} title="İkinci" animation={false}>
            ikinci içerik
          </ZtoModal>
        </ZtoFinansRoot>
      );
    }
    render(<Stacked />);
    fireEvent.click(screen.getByText("ikinciyi aç"));
    const modals = Array.from(document.querySelectorAll<HTMLElement>(".modal"));
    const backdrops = Array.from(document.querySelectorAll<HTMLElement>(".modal-backdrop"));
    expect(modals).toHaveLength(2);
    expect(backdrops).toHaveLength(2);
    backdrops.forEach((backdrop) => expect(backdrop.parentElement).toBe(root()));
    expect(modals[0].style.zIndex).toBe("");
    expect(backdrops[0].style.zIndex).toBe("");
    expect(modals[1].style.zIndex).toBe("1410");
    expect(backdrops[1].style.zIndex).toBe("1405");
    // Alttaki modal ekran okuyucudan gizlenir.
    expect(modals[0].getAttribute("aria-hidden")).toBe("true");

    // ESC yalnız üstteki modalı kapatır.
    act(() => {
      fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
    });
    expect(document.querySelectorAll(".modal")).toHaveLength(1);
    expect(root().classList.contains("modal-open")).toBe(true);
    expect(modals[0].hasAttribute("aria-hidden")).toBe(false);
  });

  it("kök dışında hiçbir şey çizmez", () => {
    const { container } = render(
      <ZtoModal show onHide={() => undefined} title="T" animation={false}>
        x
      </ZtoModal>,
    );
    expect(container.innerHTML).toBe("");
    expect(document.querySelector(".modal")).toBeNull();
  });

  it("titlePrefix: başlık div > önek + h5.modal-title olarak sarılır", () => {
    renderModal({ titlePrefix: <span className="ust">ÜST</span>, title: "Ad" });
    const wrapper = root().querySelector(".modal-header > div") as HTMLElement;
    expect(wrapper.firstElementChild?.className).toBe("ust");
    expect(wrapper.querySelector("h5.modal-title")?.textContent).toBe("Ad");
  });
});
