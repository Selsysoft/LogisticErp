// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZtoSearchableSelect } from "./ZtoSearchableSelect";

const OPTIONS = [
  { value: "f1", label: "Ziraat | Merkez (ZRT-1) [Vadesiz]" },
  { value: "f2", label: "Türkiye İş Bankası | Şişli (ISB-2) [Vadesiz]" },
];

function Harness({ onChange = () => undefined }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <label id="bankLabel">Banka</label>
      <ZtoSearchableSelect
        id="filterBank"
        ariaLabelledBy="bankLabel"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        options={OPTIONS}
        placeholder="Tüm Bankalar"
        searchPlaceholder="Banka ara..."
        noResultsText="Banka bulunamadı"
      />
      <button type="button">dışarı</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const trigger = () => document.getElementById("filterBank") as HTMLElement;
const dropdown = () => document.querySelector(".ss-dropdown") as HTMLElement;

describe("ZtoSearchableSelect (ZTO SearchableSelect)", () => {
  it("ZTO DOM'u ve metinleri; tıklayınca açılır, arama süzer, seçince kapanır", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(trigger().className).toBe("ss-trigger ss-placeholder");
    expect(trigger().querySelector(".ss-trigger-text")?.textContent).toBe("Tüm Bankalar");
    expect(trigger().getAttribute("role")).toBe("combobox");
    expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(dropdown().className).toBe("ss-dropdown");

    fireEvent.click(trigger());
    act(() => vi.advanceTimersByTime(40));
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(dropdown().className).toBe("ss-dropdown ss-open");
    const search = screen.getByPlaceholderText("Banka ara...");
    expect(document.activeElement).toBe(search);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Tüm Bankalar",
      ...OPTIONS.map((o) => o.label),
    ]);

    fireEvent.change(search, { target: { value: "sisli" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([OPTIONS[1].label]);
    expect(document.querySelector(".ss-highlight")?.textContent).toBe("Şişli");

    fireEvent.change(search, { target: { value: "garanti" } });
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(document.querySelector(".ss-no-result")?.textContent).toBe("Banka bulunamadı");

    fireEvent.change(search, { target: { value: "ziraat" } });
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).toHaveBeenCalledWith("f1");
    expect(trigger().className).toBe("ss-trigger");
    expect(trigger().textContent).toBe(OPTIONS[0].label);
    expect(document.activeElement).toBe(trigger());
    expect(dropdown().className).toBe("ss-dropdown");
  });

  it("klavye: ↓ açar, arama kutusundan ↓ ilk seçeneğe, ↑ sarar, Enter seçer, Esc kapatır", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    act(() => vi.advanceTimersByTime(40));
    const search = screen.getByPlaceholderText("Banka ara...");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(options[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(options[2]);
    fireEvent.keyDown(options[2], { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("f2");
    expect(document.activeElement).toBe(trigger());

    fireEvent.keyDown(trigger(), { key: "Enter" });
    act(() => vi.advanceTimersByTime(40));
    expect(screen.getAllByRole("option")[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByPlaceholderText("Banka ara..."), { key: "Escape" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());

    // "Tüm Bankalar" (boş değer) seçimi
    fireEvent.keyDown(trigger(), { key: " " });
    fireEvent.keyDown(screen.getAllByRole("option")[0], { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("Esc tetikleyicide kapatır; dışarı tıklamak kapatır; devre dışıyken açılmaz", () => {
    const { rerender } = render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText("dışarı"));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    rerender(
      <ZtoSearchableSelect
        id="filterBank"
        value=""
        onChange={() => undefined}
        options={OPTIONS}
        placeholder="Tüm Kasalar"
        searchPlaceholder="Kasa ara..."
        noResultsText="Kasa bulunamadı"
        disabled
        includeEmptyOption={false}
      />,
    );
    expect(trigger().className).toContain("ss-disabled");
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab ile listeden çıkınca kapanır", () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByPlaceholderText("Banka ara..."), { key: "Tab" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getAllByRole("option")[1], { key: "Tab" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getAllByRole("option")[1], { key: "Escape" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});
