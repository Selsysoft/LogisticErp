import { describe, expect, it } from "vitest";
import { availableActions, daysUntil, formatLimit, limitsNeedingAttention } from "./common";
import { LimitUsage } from "./types";

const row = (over: Partial<LimitUsage>): LimitUsage => ({
  resource: "USERS",
  used: 1,
  limit: 5,
  warning: false,
  reached: false,
  ...over,
});

describe("limitler", () => {
  it("boş sınırı sınırsız yazar", () => {
    expect(formatLimit(row({}), "∞")).toBe("1 / 5");
    expect(formatLimit(row({ limit: null }), "∞")).toBe("1 / ∞");
  });

  it("yalnız uyarıdaki sınırları seçer", () => {
    expect(
      limitsNeedingAttention([row({}), row({ warning: true }), row({ reached: true })]),
    ).toHaveLength(2);
  });
});

describe("daysUntil", () => {
  it("gün farkını verir", () => {
    expect(daysUntil("2026-11-19", "2026-11-05")).toBe(14);
    expect(daysUntil("2026-11-05", "2026-11-05")).toBe(0);
    expect(daysUntil("2026-11-04", "2026-11-05")).toBe(-1);
  });
});

describe("availableActions", () => {
  it("duruma göre işlem sunar", () => {
    expect(availableActions("ACTIVE", "TRIAL").activate).toBe(true);
    expect(availableActions("ACTIVE", "ACTIVE").activate).toBe(false);
    expect(availableActions("SUSPENDED", "SUSPENDED").resume).toBe(true);
    expect(availableActions("CLOSED", "CANCELLED").close).toBe(false);
    expect(availableActions("CLOSED", "CANCELLED").exportData).toBe(true);
    expect(availableActions("FAILED", null).exportData).toBe(false);
  });

  it("deneme bitince başlatma ve uzatma sunar, doğrudan açma sunmaz", () => {
    const can = availableActions("SUSPENDED", "SUSPENDED", "TRIAL_ENDED");
    expect(can.activate).toBe(true);
    expect(can.extendTrial).toBe(true);
    expect(can.resume).toBe(false);
    expect(availableActions("SUSPENDED", "SUSPENDED", "PAYMENT").extendTrial).toBe(false);
  });
});
