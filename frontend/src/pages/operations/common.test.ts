import { describe, expect, it } from "vitest";
import { canCancel, canEditLegs, nextStatus } from "./common";

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
