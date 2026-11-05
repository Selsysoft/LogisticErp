import { describe, expect, it } from "vitest";
import { nextDeclarationStatuses } from "./common";

describe("gümrük beyanı durumları", () => {
  it("taslak tescil edilir veya iptal olur, sonuçlanan beyan değişmez", () => {
    expect(nextDeclarationStatuses("DRAFT")).toEqual(["SUBMITTED", "CANCELLED"]);
    expect(nextDeclarationStatuses("SUBMITTED")).toEqual(["CLEARED", "REJECTED"]);
    expect(nextDeclarationStatuses("CLEARED")).toEqual([]);
    expect(nextDeclarationStatuses("REJECTED")).toEqual([]);
  });
});
