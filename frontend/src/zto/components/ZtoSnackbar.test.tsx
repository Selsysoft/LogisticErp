// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoSnackbarProvider, useZtoSnackbar } from "./ZtoSnackbar";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger() {
  const { show } = useZtoSnackbar();
  return (
    <>
      <button onClick={() => show("Kayıt başarıyla eklendi.", "success")}>ok</button>
      <button onClick={() => show("Hata <b>x</b>", "error")}>hata</button>
    </>
  );
}

function renderProvider() {
  render(
    <ZtoFinansRoot>
      <ZtoSnackbarProvider>
        <Trigger />
      </ZtoSnackbarProvider>
    </ZtoFinansRoot>,
  );
}

const region = () => screen.getByRole("region", { name: "Bildirimler" });

describe("ZtoSnackbar", () => {
  it("kök içinde tek bölge; ZTO DOM'u; canlı bölgeye yazılır; 4 sn sonra silinir", () => {
    renderProvider();
    expect(region().parentElement?.classList.contains("zto-finans")).toBe(true);
    const polite = region().querySelector("[aria-live='polite']") as HTMLElement;
    const assertive = region().querySelector("[aria-live='assertive']") as HTMLElement;
    expect(polite.className).toBe("sr-only");
    fireEvent.click(screen.getByText("ok"));
    const bar = region().querySelector(".snackbar") as HTMLElement;
    expect(bar.className).toBe("snackbar snackbar-success");
    expect(bar.style.width).toBe("100%");
    expect(bar.style.textAlign).toBe("center");
    expect(bar.style.bottom).toBe("-50px");
    expect(bar.firstElementChild?.className).toBe("fas fa-info-circle");
    expect(bar.textContent).toContain("Kayıt başarıyla eklendi.");
    const close = bar.querySelector("button") as HTMLButtonElement;
    expect(close.className).toBe("sr-only sr-only-focusable");
    expect(close.getAttribute("aria-label")).toBe("Kapat");
    act(() => vi.advanceTimersByTime(50));
    expect(bar.style.bottom).toBe("0px");
    expect(polite.textContent).toBe("Kayıt başarıyla eklendi.");
    expect(assertive.textContent).toBe("");
    act(() => vi.advanceTimersByTime(3450));
    expect(bar.style.bottom).toBe("-50px");
    act(() => vi.advanceTimersByTime(500));
    expect(region().querySelector(".snackbar")).toBeNull();
  });

  it("kuyruk yok: ikinci ileti hemen görünür; hata assertive ve HTML yorumlanmaz", () => {
    renderProvider();
    fireEvent.click(screen.getByText("ok"));
    fireEvent.click(screen.getByText("hata"));
    const bars = region().querySelectorAll(".snackbar");
    expect(bars).toHaveLength(2);
    expect(bars[1].className).toBe("snackbar snackbar-error");
    expect(bars[1].querySelector("b")).toBeNull();
    act(() => vi.advanceTimersByTime(50));
    expect(region().querySelector("[aria-live='assertive']")?.textContent).toBe("Hata <b>x</b>");
  });

  it("fare üzerindeyken kapanmaz; kapat düğmesi kapatır ve odağı geri verir", () => {
    renderProvider();
    const opener = screen.getByText("ok");
    fireEvent.click(opener);
    const bar = region().querySelector(".snackbar") as HTMLElement;
    fireEvent.mouseEnter(bar);
    act(() => vi.advanceTimersByTime(10_000));
    expect(region().querySelector(".snackbar")).not.toBeNull();
    fireEvent.mouseLeave(bar);
    const close = bar.querySelector("button") as HTMLButtonElement;
    fireEvent.focus(close, { relatedTarget: opener });
    act(() => vi.advanceTimersByTime(10_000));
    expect(region().querySelector(".snackbar")).not.toBeNull();
    fireEvent.click(close);
    expect(document.activeElement).toBe(opener);
    act(() => vi.advanceTimersByTime(500));
    expect(region().querySelector(".snackbar")).toBeNull();
  });

  it("sağlayıcı yoksa show etkisiz", () => {
    render(<Trigger />);
    fireEvent.click(screen.getByText("ok"));
    expect(document.querySelector(".snackbar")).toBeNull();
  });
});
