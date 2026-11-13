// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoPopover, ZtoTooltip } from "./ZtoTooltip";

afterEach(cleanup);

function root() {
  return document.querySelector(".zto-finans") as HTMLElement;
}

describe("ZtoTooltip", () => {
  it("odaklanınca Bootstrap 4 ipucunu kök içine çizer ve tetikleyiciyi bağlar", async () => {
    render(
      <ZtoFinansRoot>
        <button className="btn btn-sm btn-info">i</button>
        <ZtoTooltip content="Bakiye bilgisi" id="ipucu" className="ozel">
          <button className="btn btn-sm btn-info">Bilgi</button>
        </ZtoTooltip>
      </ZtoFinansRoot>,
    );
    const trigger = screen.getByText("Bilgi");
    fireEvent.focus(trigger);
    const tooltip = await screen.findByRole("tooltip");
    expect(root().contains(tooltip)).toBe(true);
    expect(tooltip.id).toBe("ipucu");
    expect(tooltip.classList.contains("tooltip")).toBe(true);
    expect(tooltip.classList.contains("ozel")).toBe(true);
    expect(tooltip.className).toMatch(/bs-tooltip-(top|bottom|left|right)/);
    expect(tooltip.getAttribute("x-placement")).toBe("top");
    const [arrow, inner] = Array.from(tooltip.children);
    expect(arrow.className).toBe("arrow");
    expect(inner.className).toBe("tooltip-inner");
    expect(inner.textContent).toBe("Bakiye bilgisi");
    expect(trigger.getAttribute("aria-describedby")).toBe("ipucu");

    fireEvent.blur(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("üzerine gelince açılır, yerleşim verilebilir", async () => {
    render(
      <ZtoFinansRoot>
        <ZtoTooltip content="Sağda" placement="right">
          <span>hedef</span>
        </ZtoTooltip>
      </ZtoFinansRoot>,
    );
    fireEvent.mouseOver(screen.getByText("hedef"));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.getAttribute("x-placement")).toBe("right");
    expect(tooltip.id).not.toBe("");
  });

  it("kök dışında, devre dışıyken ve içerik boşken yalnız çocuğu çizer", () => {
    const { container } = render(
      <>
        <ZtoTooltip content="x">
          <button>dış</button>
        </ZtoTooltip>
        <ZtoFinansRoot>
          <ZtoTooltip content="x" disabled>
            <button>kapalı</button>
          </ZtoTooltip>
          <ZtoTooltip content="">
            <button>boş</button>
          </ZtoTooltip>
        </ZtoFinansRoot>
      </>,
    );
    expect(container.querySelector("button")?.outerHTML).toBe("<button>dış</button>");
    for (const name of ["dış", "kapalı", "boş"]) {
      fireEvent.focus(screen.getByText(name));
      fireEvent.mouseOver(screen.getByText(name));
    }
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("ZtoPopover", () => {
  it("tıklayınca başlıklı popover açar, dışarı tıklayınca kapanır", async () => {
    render(
      <ZtoFinansRoot>
        <p>dışarısı</p>
        <ZtoPopover
          title="Döviz Dağılımı"
          content={<span>1.234,56 ₺</span>}
          className="invoice-popover"
          bodyClassName="p-2"
          placement="bottom"
          id="doviz"
        >
          <button>Dövizler</button>
        </ZtoPopover>
      </ZtoFinansRoot>,
    );
    fireEvent.click(screen.getByText("Dövizler"));
    const popover = await screen.findByRole("tooltip");
    expect(root().contains(popover)).toBe(true);
    expect(popover.id).toBe("doviz");
    expect(popover.classList.contains("popover")).toBe(true);
    expect(popover.classList.contains("invoice-popover")).toBe(true);
    expect(popover.className).toMatch(/bs-popover-(top|bottom|left|right)/);
    const [arrow, header, body] = Array.from(popover.children) as HTMLElement[];
    expect(arrow.className).toBe("arrow");
    expect(header.tagName).toBe("H3");
    expect(header.className).toBe("popover-header");
    expect(header.textContent).toBe("Döviz Dağılımı");
    expect(Array.from(body.classList).sort()).toEqual(["p-2", "popover-body"]);
    expect(body.textContent).toBe("1.234,56 ₺");

    fireEvent.click(screen.getByText("dışarısı"));
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("başlıksız popover (ZTO invoice-popover şablonu) ve tekrar tıklayınca kapanma", async () => {
    render(
      <ZtoFinansRoot>
        <ZtoPopover content="Fatura">
          <button>aç</button>
        </ZtoPopover>
      </ZtoFinansRoot>,
    );
    const trigger = screen.getByText("aç");
    fireEvent.click(trigger);
    const popover = await screen.findByRole("tooltip");
    expect(popover.querySelector(".popover-header")).toBeNull();
    expect(popover.getAttribute("x-placement")).toBe("right");
    expect(popover.querySelector(".popover-body")?.textContent).toBe("Fatura");
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("denetimli kullanım", async () => {
    function Controlled() {
      const [show, setShow] = useState(true);
      return (
        <ZtoFinansRoot>
          <span data-testid="durum">{show ? "açık" : "kapalı"}</span>
          <ZtoPopover content="içerik" show={show} onToggle={setShow} rootClose={false}>
            <button>tetik</button>
          </ZtoPopover>
        </ZtoFinansRoot>
      );
    }
    render(<Controlled />);
    expect(await screen.findByRole("tooltip")).toBeTruthy();
    fireEvent.click(screen.getByText("tetik"));
    await waitFor(() => expect(screen.getByTestId("durum").textContent).toBe("kapalı"));
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("kök dışında yalnız çocuğu çizer", () => {
    const { container } = render(
      <ZtoPopover content="x">
        <button>tek</button>
      </ZtoPopover>,
    );
    fireEvent.click(screen.getByText("tek"));
    expect(container.innerHTML).toBe("<button>tek</button>");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
