// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoAuditCell, ZtoAuditCellProps } from "./ZtoAuditCell";

afterEach(cleanup);

const base: ZtoAuditCellProps = {
  createdBy: "ayse@acme.com",
  createdAt: "2026-03-04T08:05:00",
  updatedBy: "ali@acme.com",
  updatedAt: "2026-04-05T09:06:00",
  updateCount: 2,
};

function renderCell(props: Partial<ZtoAuditCellProps> = {}) {
  render(
    <ZtoFinansRoot>
      <p>dışarı</p>
      <ZtoAuditCell {...base} {...props} />
      <ZtoAuditCell {...base} createdBy="ikinci@acme.com" updateCount={0} />
    </ZtoFinansRoot>,
  );
  return screen.getAllByRole("button", { name: "Kayıt bilgilerini görüntüle" });
}

const popover = () => document.querySelector("aside.intro-audit-popover") as HTMLElement | null;

describe("ZtoAuditCell", () => {
  it("tetikleyici: fa-history ve güncelleme sayısı rozeti (yalnız > 0)", () => {
    const [first, second] = renderCell();
    expect(first.className).toBe("intro-audit-trigger");
    expect(first.title).toBe("Kayıt bilgilerini görüntüle");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.querySelector("i.fas.fa-history")).not.toBeNull();
    expect(first.querySelector(".intro-audit-trigger__count")?.textContent).toBe("2");
    expect(second.querySelector(".intro-audit-trigger__count")).toBeNull();
  });

  it("açılır kutu: başlık, sayaç, üç satır; köke portal'lanır", () => {
    const [first] = renderCell();
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe("true");
    const box = popover()!;
    expect(box.parentElement?.className).toContain("zto-finans");
    expect(box.getAttribute("role")).toBe("dialog");
    expect(box.getAttribute("aria-label")).toBe("Kayıt Geçmişi");
    expect(box.querySelector(".intro-audit-popover__header strong")?.textContent).toBe(
      "Kayıt Geçmişi",
    );
    expect(box.querySelector(".intro-audit-popover__total")?.textContent).toBe(
      "Güncelleme Sayısı: 2",
    );
    const rows = Array.from(box.querySelectorAll(".intro-audit-popover__row"), (row) => [
      row.querySelector(".intro-audit-popover__icon i")?.className,
      row.querySelector("small")?.textContent,
      row.querySelector("strong")?.textContent,
      row.querySelector("time")?.textContent,
    ]);
    expect(rows).toEqual([
      ["fas fa-user-plus", "Oluşturan", "ayse@acme.com", "04.03.2026 08:05"],
      ["fas fa-user-edit", "Son Güncelleyen", "ali@acme.com", "05.04.2026 09:06"],
      ["fas fa-user-clock", "Son İşlem Yapan", "ali@acme.com", "05.04.2026 09:06"],
    ]);
    expect(box.style.width).toBe("286px");
    // Aynı tetikleyici kapatır.
    fireEvent.click(first);
    expect(popover()).toBeNull();
  });

  it("güncellenmemiş kayıt: '-' / 'Henüz güncellenmedi', son işlem oluşturan; boş kişi = Sistem aktarımı", () => {
    const [, second] = renderCell();
    fireEvent.click(second);
    const rows = Array.from(popover()!.querySelectorAll(".intro-audit-popover__row"), (row) =>
      Array.from(row.querySelectorAll("strong, time"), (e) => e.textContent),
    );
    expect(rows).toEqual([
      ["ikinci@acme.com", "04.03.2026 08:05"],
      ["-", "Henüz güncellenmedi"],
      ["ikinci@acme.com", "04.03.2026 08:05"],
    ]);
    cleanup();
    const [first] = renderCell({ createdBy: "", updateCount: 0, createdAt: "" });
    fireEvent.click(first);
    const strong = popover()!.querySelector(".intro-audit-popover__row strong");
    expect(strong?.textContent).toBe("Sistem aktarımı");
    expect(popover()!.querySelector(".intro-audit-popover__row time")?.textContent).toBe("-");
  });

  it("dışarı tıklama, Escape (odak tetikleyiciye), kaydırma ve pencere boyutu kapatır", () => {
    const [first, second] = renderCell();
    fireEvent.click(first);
    fireEvent.click(popover()!);
    expect(popover()).not.toBeNull();
    fireEvent.click(screen.getByText("dışarı"));
    expect(popover()).toBeNull();

    fireEvent.click(first);
    fireEvent.keyDown(document, { key: "a" });
    expect(popover()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(first);

    fireEvent.click(first);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(popover()).toBeNull();
    fireEvent.click(first);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(popover()).toBeNull();

    // Başka bir tetikleyici öncekini kapatır (tek kutu).
    fireEvent.click(first);
    fireEvent.click(second);
    expect(document.querySelectorAll("aside.intro-audit-popover")).toHaveLength(1);
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });

  it("kök dışında yerinde çizilir", () => {
    render(<ZtoAuditCell {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Kayıt bilgilerini görüntüle" }));
    expect(popover()).not.toBeNull();
  });
});
