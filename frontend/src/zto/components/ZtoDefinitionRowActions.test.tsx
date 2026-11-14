// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoDefinitionRowActions, ZtoDefinitionRowActionsProps } from "./ZtoDefinitionRowActions";

afterEach(cleanup);

function renderActions(props: Partial<ZtoDefinitionRowActionsProps> = {}) {
  const handlers = { detail: vi.fn(), onDeactivate: vi.fn(), onActivate: vi.fn() };
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <tr>
            <td className="definition-list-actions-cell">
              <ZtoDefinitionRowActions
                detail={handlers.detail}
                edit="/kayit/1"
                toggle={{
                  active: true,
                  onDeactivate: handlers.onDeactivate,
                  onActivate: handlers.onActivate,
                }}
                {...props}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return handlers;
}

const wrapper = () => document.querySelector("td > .definition-row-actions") as HTMLElement;

describe("ZtoDefinitionRowActions (Şablon B)", () => {
  it("WorkPlace: düğmeler doğrudan; Detay en sonda; ikon düğmeleri definition-icon-action + aria-label", () => {
    const handlers = renderActions();
    const children = Array.from(wrapper().children);
    expect(children.map((c) => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
      "a.btn btn-success definition-icon-action",
      "button.btn btn-danger demo definition-icon-action",
      "button.btn btn-sm definition-detail-button",
    ]);
    const edit = children[0] as HTMLAnchorElement;
    expect(edit.getAttribute("href")).toBe("/kayit/1");
    expect(edit.title).toBe("Düzenle");
    expect(edit.getAttribute("aria-label")).toBe("Düzenle");
    expect(edit.querySelector("i.fas.fa-edit")).not.toBeNull();
    const del = screen.getByRole("button", { name: "Sil" });
    expect(del.title).toBe("Sil");
    expect(del.querySelector("i.fas.fa-trash-alt")).not.toBeNull();
    expect(del.id).toBe("");
    const detail = children[2] as HTMLButtonElement;
    expect(detail.title).toBe("Kayıt detayını görüntüle");
    expect(detail.getAttribute("aria-label")).toBe("Kayıt detayını görüntüle");
    expect(detail.querySelector("i.fas.fa-eye + span")?.textContent).toBe("Detay");
    expect(wrapper().lastElementChild).toBe(detail);
    fireEvent.click(del);
    fireEvent.click(detail);
    expect(handlers.onDeactivate).toHaveBeenCalledTimes(1);
    expect(handlers.detail).toHaveBeenCalledTimes(1);
  });

  it("BranchProvince: Düzenle/Sil div.btn-group içinde, Detay dışında ve en sonda", () => {
    renderActions({ grouped: true });
    const children = Array.from(wrapper().children);
    expect(children.map((c) => c.className)).toEqual([
      "btn-group",
      "btn btn-sm definition-detail-button",
    ]);
    expect(Array.from(children[0].children, (c) => c.getAttribute("aria-label"))).toEqual([
      "Düzenle",
      "Sil",
    ]);
  });

  it("pasif satırda Sil yerine Aktifleştir (fa-undo); yetki yoksa yalnız Detay", () => {
    const handlers = renderActions({
      toggle: { active: false, onActivate: vi.fn(), onDeactivate: vi.fn(), disabled: true },
    });
    const activate = screen.getByRole("button", { name: "Aktifleştir" });
    expect(activate.className).toBe("btn btn-warning definition-icon-action");
    expect(activate.querySelector("i.fas.fa-undo")).not.toBeNull();
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
    expect(handlers.onActivate).not.toHaveBeenCalled();
    cleanup();

    renderActions({ edit: undefined, toggle: undefined, grouped: true });
    expect(Array.from(wrapper().children, (c) => c.className)).toEqual([
      "btn btn-sm definition-detail-button",
    ]);
  });

  it("Aktifleştir tıklanınca onActivate", () => {
    const onActivate = vi.fn();
    renderActions({ toggle: { active: false, onActivate, onDeactivate: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "Aktifleştir" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
