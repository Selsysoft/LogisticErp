import { afterEach, describe, expect, it, vi } from "vitest";
import { canCancel, canEditLegs, localDateTime, nextStatus, toInstant } from "./common";

describe("sefer durumları", () => {
  it("operasyon yalnız teslime kadar ilerletir", () => {
    expect(nextStatus("QUOTED")).toBe("PLANNED");
    expect(nextStatus("IN_TRANSIT")).toBe("DELIVERED");
    expect(nextStatus("DELIVERED")).toBeNull();
    expect(nextStatus("INVOICED")).toBeNull();
  });

  it("yola çıkan sefer iptal edilemez ve etabı değişmez", () => {
    expect(canCancel("LOADED")).toBe(true);
    expect(canCancel("IN_TRANSIT")).toBe(false);
    expect(canEditLegs("PLANNED")).toBe(true);
    expect(canEditLegs("LOADED")).toBe(false);
  });
});

describe("tarih ve saat", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("form saatini tarayıcının saat dilimiyle UTC anına çevirir", () => {
    // Saat diliminden bağımsız: aynı yerel saatin Date karşılığıyla karşılaştırılır.
    expect(toInstant("2026-11-10T09:30")).toBe(new Date(2026, 10, 10, 9, 30).toISOString());
  });

  it("yerel tarih-saat alanının değerini saniyesiz üretir ve gün ekler", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 23, 45, 37));

    expect(localDateTime()).toBe("2026-11-10T23:45");
    expect(localDateTime(1)).toBe("2026-11-11T23:45");
    // Forma yazılan değer geri çevrilince aynı dakikaya döner.
    expect(toInstant(localDateTime())).toBe(new Date(2026, 10, 10, 23, 45).toISOString());
  });
});
