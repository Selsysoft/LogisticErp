// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFormErrorAnnouncer, type FormErrorAnnouncer } from "./useFormErrorAnnouncer";

let api: FormErrorAnnouncer;

function Host() {
  api = useFormErrorAnnouncer();
  return <>{api.region}</>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useFormErrorAnnouncer", () => {
  it("tek polite bölge; yeni hata 500 ms sonra '{etiket}: {hata}' okunur, aynısı tekrar okunmaz", () => {
    const { container } = render(<Host />);
    const region = container.querySelector("[aria-live='polite']") as HTMLElement;
    expect(region.className).toBe("sr-only");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    act(() => api.announceFieldError("name", "Cari Adı *", "Zorunlu alan"));
    act(() => vi.advanceTimersByTime(499));
    expect(region.textContent).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(region.textContent).toBe("Cari Adı: Zorunlu alan");
    act(() => api.announceFieldError("name", "Cari Adı *", "Zorunlu alan"));
    act(() => vi.advanceTimersByTime(600));
    expect(region.textContent).toBe("Cari Adı: Zorunlu alan");
    act(() => api.announceFieldError("name", "Cari Adı", null));
    act(() => api.announceFieldError("tax", "Vergi No", "Hatalı"));
    expect(region.textContent).toBe("");
    act(() => vi.advanceTimersByTime(500));
    expect(region.textContent).toBe("Vergi No: Hatalı");
    act(() => api.clear());
    expect(region.textContent).toBe("");
  });
});
