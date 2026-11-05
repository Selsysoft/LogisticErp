import { describe, expect, it } from "vitest";
import { canIssue } from "./common";

describe("depo çıkışı", () => {
  it("antrepo rejimindeki mal çıkarılamaz", () => {
    expect(canIssue("UNDER_BOND")).toBe(false);
    expect(canIssue("CLEARED")).toBe(true);
    expect(canIssue("NONE")).toBe(true);
  });
});
