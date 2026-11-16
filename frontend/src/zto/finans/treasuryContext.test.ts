// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  hasTreasuryParam,
  TREASURY_PARAM,
  TreasuryContext,
  useTreasuryModal,
  withoutTreasuryParam,
} from "./treasuryContext";

describe("treasuryContext", () => {
  it("?treasury=1 algılanır ve silinir; diğer parametreler kalır", () => {
    expect(TREASURY_PARAM).toBe("treasury");
    expect(hasTreasuryParam("?treasury=1")).toBe(true);
    expect(hasTreasuryParam("?x=2&treasury=1")).toBe(true);
    expect(hasTreasuryParam("?treasury=0")).toBe(false);
    expect(hasTreasuryParam("?quickcari=1")).toBe(false);
    expect(hasTreasuryParam("")).toBe(false);
    expect(withoutTreasuryParam("?treasury=1")).toBe("");
    expect(withoutTreasuryParam("?a=1&treasury=1&b=2")).toBe("?a=1&b=2");
    expect(withoutTreasuryParam("")).toBe("");
  });

  it("bağlam yoksa open etkisiz; varsa sağlayıcınınki", () => {
    expect(() => renderHook(() => useTreasuryModal()).result.current.open()).not.toThrow();
    const open = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(TreasuryContext.Provider, { value: { open } }, children);
    renderHook(() => useTreasuryModal(), { wrapper }).result.current.open();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
