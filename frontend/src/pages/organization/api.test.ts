import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../../auth/authStore";
import {
  branchGroupListPath,
  branchListPath,
  companyListPath,
  invalidateOrganization,
  ORGANIZATION_KEYS,
} from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("organization uç yolları", () => {
  it("liste yolları: size=200, ada göre; active/companyId isteğe bağlı", () => {
    expect(branchListPath()).toBe("/organization/branches?size=200&sort=name");
    expect(branchListPath({ active: true, companyId: "c 1" })).toBe(
      "/organization/branches?size=200&sort=name&active=true&companyId=c%201",
    );
    expect(branchListPath({ active: false, companyId: null })).toBe(
      "/organization/branches?size=200&sort=name&active=false",
    );
    expect(branchGroupListPath({ active: true, companyId: "c1" })).toBe(
      "/organization/branch-groups?size=200&sort=name&active=true&companyId=c1",
    );
    expect(companyListPath()).toBe("/organization/companies?size=200");
    expect(companyListPath({ active: true })).toBe("/organization/companies?size=200&active=true");
  });
});

describe("invalidateOrganization", () => {
  it("şube, ağaç, grup ve şirket sorgularını geçersizler; istenirse /auth/me yenilenir", async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);
    const reloadMe = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ reloadMe });

    await invalidateOrganization(client);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["branches"],
      ["branch-tree"],
      ["branch-groups"],
      ["companies"],
    ]);
    expect(reloadMe).not.toHaveBeenCalled();

    await invalidateOrganization(client, { reloadMe: true });
    expect(reloadMe).toHaveBeenCalledTimes(1);
    expect(Object.keys(ORGANIZATION_KEYS)).toEqual([
      "branches",
      "branchTree",
      "branchGroups",
      "companies",
    ]);
  });
});
