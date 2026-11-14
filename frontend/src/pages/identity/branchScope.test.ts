import { describe, expect, it } from "vitest";
import { toScopeBody, validateScope, withScope, withSelection } from "./branchScope";

const draft = { scope: "LIMITED" as const, branchIds: ["a", "b"], defaultBranchId: "b" };

describe("iş yeri yetkisi taslağı", () => {
  it("seçimden çıkan varsayılan iş yeri düşer, kalan korunur", () => {
    expect(withSelection(draft, ["a"])).toEqual({
      ...draft,
      branchIds: ["a"],
      defaultBranchId: null,
    });
    expect(withSelection(draft, ["b", "c"]).defaultBranchId).toBe("b");
    expect(withSelection({ ...draft, defaultBranchId: null }, ["a"]).defaultBranchId).toBeNull();
  });

  it("ALL'a geçişte varsayılan korunur; LIMITED'e dönüşte seçim dışıysa düşer", () => {
    const all = withScope({ scope: "ALL", branchIds: [], defaultBranchId: "x" }, "ALL");
    expect(all.defaultBranchId).toBe("x");
    expect(withScope(all, "LIMITED")).toEqual({
      scope: "LIMITED",
      branchIds: [],
      defaultBranchId: null,
    });
    expect(withScope(draft, "ALL")).toEqual({ ...draft, scope: "ALL" });
  });

  it("boş LIMITED seçim istemcide reddedilir", () => {
    expect(validateScope({ ...draft, branchIds: [] })).toBe("selectAtLeastOneBranch");
    expect(validateScope(draft)).toBeNull();
    expect(validateScope({ scope: "ALL", branchIds: [], defaultBranchId: null })).toBeNull();
  });

  it("ALL gövdesi iş yeri listesi taşımaz", () => {
    expect(toScopeBody({ ...draft, scope: "ALL" })).toEqual({
      scope: "ALL",
      branchIds: [],
      defaultBranchId: "b",
    });
    expect(toScopeBody(draft)).toEqual(draft);
  });
});
