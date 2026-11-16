// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { Me, useAuthStore } from "../auth/authStore";
import { AppShell } from "./AppShell";

const me: Me = {
  id: "u1",
  email: "a@b.test",
  fullName: "Ayşe Yılmaz",
  tenant: "acme",
  permissions: ["FINANCE_VIEW"],
  roles: [],
  landingPath: "/",
  twoFactorEnabled: false,
};

/** Emotion'ın ürettiği `@media print` kuralları (seçici → bildirimler). */
function printRules(): Array<{ selector: string; style: CSSStyleDeclaration }> {
  const rules: Array<{ selector: string; style: CSSStyleDeclaration }> = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText.includes("print")) {
        for (const inner of Array.from(rule.cssRules)) {
          if (inner instanceof CSSStyleRule) {
            rules.push({ selector: inner.selectorText, style: inner.style });
          }
        }
      }
    }
  }
  return rules;
}

/** Öğenin kendi sınıfına bağlı yazdırma kuralındaki bildirim (yoksa ""). */
function printValue(element: Element, property: string): string {
  const classes = Array.from(element.classList).map((name) => `.${name}`);
  const rule = printRules().find(
    (candidate) =>
      classes.includes(candidate.selector) && candidate.style.getPropertyValue(property),
  );
  return rule?.style.getPropertyValue(property) ?? "";
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<div>pano içeriği</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Geniş ekran: kalıcı Drawer çizilir (useMediaQuery → matchMedia).
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
  useAuthStore.setState({ status: "authenticated", me });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell yazdırma (12.8 §5.3, OK-12.8-14)", () => {
  it("AppBar, kalıcı Drawer ve main içindeki Toolbar boşluğu yazdırmada gizlenir; main dolgusuz", () => {
    renderShell();
    expect(screen.getByText("pano içeriği")).toBeTruthy();

    const appBar = document.querySelector("header.MuiAppBar-root") as HTMLElement;
    expect(appBar).not.toBeNull();
    expect(printValue(appBar, "display")).toBe("none");

    const drawer = document.querySelector(".MuiDrawer-docked") as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(printValue(drawer, "display")).toBe("none");

    const main = screen.getByRole("main");
    const spacer = main.firstElementChild as HTMLElement;
    expect(spacer.classList.contains("MuiToolbar-root")).toBe(true);
    expect(printValue(spacer, "display")).toBe("none");
    expect(printValue(main, "padding")).toMatch(/^0(px)?$/);
    // Yazdırma dolgusu duyarlı (md) dolgudan sonra gelir; eşit özgüllükte sonraki kazanır.
    const mainClass = Array.from(main.classList).find((name) => name.startsWith("css-"));
    const order = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("")
      .replace(/\s+/g, "");
    const mdAt = order.indexOf(`@media(min-width:900px){.${mainClass}{padding:24px;}}`);
    const printAt = order.indexOf(`@mediaprint{.${mainClass}{padding:0px;}}`);
    expect(mdAt).toBeGreaterThanOrEqual(0);
    expect(printAt).toBeGreaterThan(mdAt);

    const outer = main.parentElement as HTMLElement;
    expect(printValue(outer, "display")).toBe("block");
  });

  it("ekranda (print dışı) kabuk görünür kalır: içerik bölgesi ve menü çizilir", () => {
    renderShell();
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Finans/ }).length).toBeGreaterThan(0);
  });
});
