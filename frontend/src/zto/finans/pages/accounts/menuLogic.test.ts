import { describe, expect, it } from "vitest";
import { menuPlacement, nextMenuIndex } from "./menuLogic";

const VIEW = { width: 1000, height: 800 };
const MENU = { width: 200, height: 150 };

describe("menuPlacement", () => {
  it("altına, sola hizalı", () => {
    expect(menuPlacement({ top: 100, bottom: 130, left: 50, right: 90 }, MENU, VIEW)).toEqual({
      top: 132,
      left: 50,
      above: false,
    });
  });

  it("sağa hizalı (dropdown-menu-right) ve görünüme sıkıştırılmış", () => {
    expect(
      menuPlacement({ top: 100, bottom: 130, left: 900, right: 990 }, MENU, VIEW, "right"),
    ).toMatchObject({ left: 790 });
    expect(
      menuPlacement({ top: 100, bottom: 130, left: 100, right: 150 }, MENU, VIEW, "right"),
    ).toMatchObject({ left: 4 });
    expect(
      menuPlacement({ top: 100, bottom: 130, left: 950, right: 990 }, MENU, VIEW),
    ).toMatchObject({
      left: 796,
    });
  });

  it("altta yer yoksa üstüne açılır; hiçbirine sığmazsa sıkıştırılır", () => {
    expect(menuPlacement({ top: 700, bottom: 730, left: 10, right: 50 }, MENU, VIEW)).toEqual({
      top: 548,
      left: 10,
      above: true,
    });
    expect(
      menuPlacement(
        { top: 100, bottom: 130, left: 10, right: 50 },
        { width: 100, height: 790 },
        VIEW,
      ),
    ).toEqual({ top: 6, left: 10, above: false });
  });
});

describe("nextMenuIndex", () => {
  it("↑/↓ döngüsel, Home/End, odak dışından ilk/son", () => {
    expect(nextMenuIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextMenuIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextMenuIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextMenuIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextMenuIndex(-1, "ArrowUp", 3)).toBe(2);
    expect(nextMenuIndex(1, "Home", 3)).toBe(0);
    expect(nextMenuIndex(1, "End", 3)).toBe(2);
    expect(nextMenuIndex(1, "Enter", 3)).toBeNull();
    expect(nextMenuIndex(0, "ArrowDown", 0)).toBeNull();
  });
});
