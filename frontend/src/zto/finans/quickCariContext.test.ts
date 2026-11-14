// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  hasQuickCariParam,
  QUICK_CARI_PARAM,
  QuickCariContext,
  useQuickCari,
  withoutQuickCariParam,
} from "./quickCariContext";

describe("quickCariContext", () => {
  it("?quickcari=1 algılanır ve silinir; diğer parametreler kalır", () => {
    expect(QUICK_CARI_PARAM).toBe("quickcari");
    expect(hasQuickCariParam("?quickcari=1")).toBe(true);
    expect(hasQuickCariParam("?x=2&quickcari=1")).toBe(true);
    expect(hasQuickCariParam("?quickcari=0")).toBe(false);
    expect(hasQuickCariParam("")).toBe(false);
    expect(withoutQuickCariParam("?quickcari=1")).toBe("");
    expect(withoutQuickCariParam("?a=1&quickcari=1&b=2")).toBe("?a=1&b=2");
  });

  it("bağlam yoksa open etkisiz; varsa sağlayıcınınki", () => {
    expect(() => renderHook(() => useQuickCari()).result.current.open()).not.toThrow();
    const open = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QuickCariContext.Provider, { value: { open } }, children);
    renderHook(() => useQuickCari(), { wrapper }).result.current.open();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
