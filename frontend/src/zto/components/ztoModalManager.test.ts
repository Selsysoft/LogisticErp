// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { stackedZIndex, ZtoModalManager } from "./ztoModalManager";

function modalInstance(container: HTMLElement) {
  const backdrop = document.createElement("div");
  const dialog = document.createElement("div");
  container.append(backdrop, dialog);
  return { backdrop, dialog };
}

function managerWithScrollbar(size: number) {
  const manager = new ZtoModalManager();
  Object.defineProperty(manager, "scrollbarSize", { value: size });
  return manager;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

describe("stackedZIndex", () => {
  it("0. seviye CSS'e bırakılır", () => {
    expect(stackedZIndex(0)).toBeNull();
    expect(stackedZIndex(-1)).toBeNull();
  });

  it("üst seviyeler adım adım yükselir, backdrop alttaki modal ile kendi modalı arasında", () => {
    expect(stackedZIndex(1)).toEqual({ modal: 1410, backdrop: 1405 });
    expect(stackedZIndex(2)).toEqual({ modal: 1420, backdrop: 1415 });
  });
});

describe("ZtoModalManager", () => {
  it("kapsayıcıya modal-open ekler, body'yi kilitler ve sabit öğelere kaydırma çubuğu boşluğu verir", () => {
    const container = document.createElement("div");
    const appBar = document.createElement("header");
    appBar.className = "mui-fixed";
    appBar.style.paddingRight = "4px";
    document.body.append(appBar, container);
    document.body.style.overflow = "auto";
    const manager = managerWithScrollbar(15);

    const first = modalInstance(container);
    manager.add(first, container, "modal-open");
    expect(container.classList.contains("modal-open")).toBe(true);
    expect(container.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("15px");
    expect(appBar.style.paddingRight).toBe("19px");
    expect(manager.isContainerOverflowing(first)).toBe(true);
    expect(first.dialog.style.zIndex).toBe("");

    const second = modalInstance(container);
    manager.add(second, container, "modal-open");
    expect(second.dialog.style.zIndex).toBe("1410");
    expect(second.backdrop.style.zIndex).toBe("1405");
    // İkinci modal kilidi yeniden uygulamaz.
    expect(appBar.style.paddingRight).toBe("19px");

    manager.remove(second);
    expect(document.body.style.overflow).toBe("hidden");
    manager.remove(first);
    expect(container.classList.contains("modal-open")).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.paddingRight).toBe("");
    expect(appBar.style.paddingRight).toBe("4px");
    expect(appBar.dataset.ztoModalPaddingRight).toBeUndefined();
  });

  it("body taşmıyorsa sağ boşluk eklenmez", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const manager = managerWithScrollbar(15);
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 0 });
    try {
      const modal = modalInstance(container);
      manager.add(modal, container, "modal-open");
      expect(document.body.style.paddingRight).toBe("");
      expect(document.body.style.overflow).toBe("hidden");
      expect(manager.isContainerOverflowing(modal)).toBe(false);
      manager.remove(modal);
      expect(document.body.style.overflow).toBe("");
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
    }
  });

  it("aynı modal iki kez eklenince ikinci çağrı yok sayılır", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const manager = new ZtoModalManager();
    const modal = modalInstance(container);
    expect(manager.add(modal, container, "modal-open")).toBe(0);
    expect(manager.add(modal, container, "modal-open")).toBe(0);
    expect(modal.dialog.style.zIndex).toBe("");
    manager.remove(modal);
  });
});
