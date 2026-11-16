// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusSidebarToggleIfLost, restoreSidebarFocusLater } from "./sidebarFocus";

function mount(html: string) {
  document.body.innerHTML = html;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const SIDEBAR =
  '<div id="ztSidebar"><div class="zt-sidebar-arrow" role="button" tabindex="0"></div></div>';

describe("focusSidebarToggleIfLost", () => {
  it("odak body'deyse yan menü okuna verir", () => {
    mount(SIDEBAR);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(focusSidebarToggleIfLost()).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(".zt-sidebar-arrow"));
  });

  it("odak başka bir öğedeyse dokunmaz", () => {
    mount(`${SIDEBAR}<button id="other">x</button>`);
    const other = document.getElementById("other") as HTMLButtonElement;
    other.focus();
    expect(focusSidebarToggleIfLost()).toBe(false);
    expect(document.activeElement).toBe(other);
  });

  it("yan menü yoksa false", () => {
    mount("<div></div>");
    expect(focusSidebarToggleIfLost()).toBe(false);
  });
});

describe("restoreSidebarFocusLater", () => {
  it("gecikmeden sonra denetler", () => {
    vi.useFakeTimers();
    mount(SIDEBAR);
    restoreSidebarFocusLater(50);
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(document.querySelector(".zt-sidebar-arrow"));
  });
});
