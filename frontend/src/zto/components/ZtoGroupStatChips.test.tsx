// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoGroupStatChips } from "./ZtoGroupStatChips";

const groups = [
  { name: "Merkez", count: 4 },
  { name: "Tanımsız", count: 1 },
];

afterEach(cleanup);

describe("ZtoGroupStatChips (Varyant D)", () => {
  it("BankIntroduction/Index.cshtml:1095-1111 işaretlemesi", () => {
    render(<ZtoGroupStatChips groups={groups} onSelect={vi.fn()} />);
    const card = document.querySelector(".stat-main-card")!;
    const header = card.querySelector(":scope > .stat-main-header")!;
    expect(header.querySelector("i")!.className).toBe("fas fa-building text-success");
    expect(header.querySelector("span")!.textContent).toBe("İş Yerleri");
    const items = card.querySelectorAll<HTMLElement>(".stat-items-wrapper > .stat-item");
    expect(items).toHaveLength(2);
    expect(items[0].dataset.filterType).toBe("workplacename");
    expect(items[0].dataset.filterValue).toBe("Merkez");
    expect(items[0].querySelector(".stat-item-label")!.textContent).toBe("Merkez");
    expect(items[0].querySelector(".stat-item-value")!.textContent).toBe("4");
    expect(items[0].className).toBe("stat-item");
    expect(items[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("etkin çip .active; tıklama seçer, etkine tıklama kaldırır", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<ZtoGroupStatChips groups={groups} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Merkez/ }));
    expect(onSelect).toHaveBeenLastCalledWith("Merkez");
    rerender(<ZtoGroupStatChips groups={groups} active="Merkez" onSelect={onSelect} />);
    const merkez = screen.getByRole("button", { name: /Merkez/ });
    expect(merkez.className).toBe("stat-item active");
    expect(merkez.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(merkez);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole("button", { name: /Tanımsız/ }));
    expect(onSelect).toHaveBeenLastCalledWith("Tanımsız");
  });

  it("klavye: Enter ve Boşluk seçer, diğer tuşlar yok sayılır", () => {
    const onSelect = vi.fn();
    render(<ZtoGroupStatChips groups={groups} onSelect={onSelect} />);
    const chip = screen.getByRole("button", { name: /Tanımsız/ });
    expect(chip.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(chip, { key: "Enter" });
    fireEvent.keyDown(chip, { key: " " });
    fireEvent.keyDown(chip, { key: "x" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("başlık, simge ve filtre tipi özelleştirilir", () => {
    render(
      <ZtoGroupStatChips
        groups={[{ name: "TRY", count: 2 }]}
        onSelect={vi.fn()}
        title="Para Birimleri"
        iconClassName="fas fa-coins text-warning"
        filterType="currencysymbol"
      />,
    );
    expect(document.querySelector(".stat-main-header span")!.textContent).toBe("Para Birimleri");
    expect(document.querySelector(".stat-main-header i")!.className).toBe(
      "fas fa-coins text-warning",
    );
    expect(document.querySelector<HTMLElement>(".stat-item")!.dataset.filterType).toBe(
      "currencysymbol",
    );
  });
});
