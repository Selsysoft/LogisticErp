// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useAuthStore } from "../../auth/authStore";
import { ZtoAccessDenied } from "./ZtoAccessDenied";
import { ZtoAlert } from "./ZtoAlert";
import { ZtoDefinitionBreadcrumb } from "./ZtoDefinitionBreadcrumb";
import { ZtoRequirePermission } from "./ZtoRequirePermission";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ZtoAlert", () => {
  it("Bootstrap kapatılabilir uyarı; başarı 4 sn sonra kapanır", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<ZtoAlert variant="success" message="İş yeri oluşturuldu." onClose={onClose} />);
    const alert = screen.getByRole("status");
    expect(alert.className).toBe("alert alert-success alert-dismissible");
    expect(alert.textContent).toContain("İş yeri oluşturuldu.");
    const close = screen.getByRole("button", { name: "Kapat" });
    expect(close.className).toBe("close");
    expect(close.querySelector("span[aria-hidden='true']")?.textContent).toBe("×");
    act(() => vi.advanceTimersByTime(3999));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hata kendiliğinden kapanmaz (autoHideMs verilmedikçe); × kapatır", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const view = render(<ZtoAlert variant="danger" message="Hata" onClose={onClose} />);
    expect(screen.getByRole("alert").className).toBe("alert alert-danger alert-dismissible");
    act(() => vi.advanceTimersByTime(60_000));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    view.rerender(<ZtoAlert variant="danger" message="Hata" onClose={onClose} autoHideMs={10} />);
    act(() => vi.advanceTimersByTime(10));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("ZtoAccessDenied / ZtoRequirePermission", () => {
  it("izin yoksa ZTO iskeleti (görsel ve Admin metni yok)", () => {
    useAuthStore.setState({ me: { permissions: ["BRANCH_VIEW"] } as never });
    render(
      <>
        <ZtoRequirePermission permission="BRANCH_VIEW">
          <p>liste</p>
        </ZtoRequirePermission>
        <ZtoRequirePermission permission="BRANCH_MANAGE">
          <p>form</p>
        </ZtoRequirePermission>
      </>,
    );
    expect(screen.getByText("liste")).toBeTruthy();
    expect(screen.queryByText("form")).toBeNull();
    const text = screen.getByText("Bu sayfaya erişim yetkiniz bulunmuyor.");
    expect(text.tagName).toBe("P");
    expect(text.parentElement?.className).toBe("col-xl-12 text-center");
    expect(text.parentElement?.parentElement?.className).toBe("row");
    expect(document.querySelector("img")).toBeNull();
    cleanup();
    render(<ZtoAccessDenied />);
    expect(screen.getByText(/erişim yetkiniz/)).toBeTruthy();
  });
});

describe("ZtoDefinitionBreadcrumb", () => {
  it("ol.breadcrumb + h4.definition-form-title; hr isteğe bağlı", () => {
    const view = render(
      <MemoryRouter>
        <ZtoDefinitionBreadcrumb
          items={[{ label: "İş Yeri", to: "/liste" }, { label: "Ara" }, { label: "Ekleme" }]}
          title="Yeni İş Yeri"
          icon="fas fa-building"
          showHr
        />
      </MemoryRouter>,
    );
    const items = Array.from(document.querySelectorAll("ol.breadcrumb > li"));
    expect(items.map((li) => [li.className, li.textContent])).toEqual([
      ["", "İş Yeri"],
      ["divider", ""],
      ["", "Ara"],
      ["divider", ""],
      ["active", "Ekleme"],
    ]);
    expect(items[0].querySelector("a")?.getAttribute("href")).toBe("/liste");
    expect(items[2].querySelector("a")).toBeNull();
    const title = document.querySelector("h4.definition-form-title") as HTMLElement;
    expect(title.textContent).toBe("Yeni İş Yeri");
    expect(title.firstElementChild?.className).toBe("definition-form-title__icon");
    expect(title.querySelector("i")?.className).toBe("fas fa-building");
    expect(document.querySelector("h4 + hr")).not.toBeNull();
    view.rerender(
      <MemoryRouter>
        <ZtoDefinitionBreadcrumb items={[{ label: "x" }]} title="Düzenle" icon="fas fa-city" />
      </MemoryRouter>,
    );
    expect(document.querySelector("hr")).toBeNull();
  });
});
