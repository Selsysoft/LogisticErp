// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Me, useAuthStore } from "../../auth/authStore";
import {
  BranchTree,
  branchIdsOfCompany,
  branchIdsOfGroup,
  filterTreeByCompany,
  findBranch,
  flattenTree,
  isMultiCompany,
  OTHER_GROUP_NAME,
  subtree,
  useBranchTree,
} from "./branchTree";

const apiGet = vi.fn();
vi.mock("../../api/client", async (original) => ({
  ...(await original<typeof import("../../api/client")>()),
  apiGet: (path: string) => apiGet(path),
  onSessionExpired: vi.fn(),
}));

const tree: BranchTree = [
  {
    companyId: "c1",
    companyName: "A Lojistik",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "Ege",
        groupActive: true,
        branches: [
          { id: "b1", code: "IZM", name: "İzmir", active: true },
          { id: "b2", code: "MNS", name: "Manisa", active: true },
        ],
      },
      { groupId: null, groupName: "Diğer", groupActive: true, branches: [] },
    ],
  },
  {
    companyId: "c2",
    companyName: "B Taşımacılık",
    companyActive: true,
    groups: [
      {
        groupId: "g2",
        groupName: "İç Anadolu",
        groupActive: true,
        branches: [{ id: "b3", code: "ANK", name: "Ankara", active: false }],
      },
    ],
  },
];

describe("ağaç yardımcıları", () => {
  it("flattenTree ağaç sırasını korur", () => {
    expect(flattenTree(tree).map((branch) => branch.id)).toEqual(["b1", "b2", "b3"]);
    expect(flattenTree([])).toEqual([]);
  });

  it("grup ve şirket şube kimlikleri", () => {
    expect(branchIdsOfGroup(tree[0].groups[0])).toEqual(["b1", "b2"]);
    expect(branchIdsOfGroup(tree[0].groups[1])).toEqual([]);
    expect(branchIdsOfCompany(tree[0])).toEqual(["b1", "b2"]);
    expect(branchIdsOfCompany(tree[1])).toEqual(["b3"]);
  });

  it("findBranch ve isMultiCompany (şubesiz şirket sayılmaz)", () => {
    expect(findBranch(tree, "b3")?.name).toBe("Ankara");
    expect(findBranch(tree, "yok")).toBeUndefined();
    expect(isMultiCompany(tree)).toBe(true);
    expect(isMultiCompany(tree.slice(0, 1))).toBe(false);
    expect(isMultiCompany([])).toBe(false);
    const emptySecond: BranchTree = [
      tree[0],
      { companyId: "c3", companyName: "Boş", companyActive: true, groups: [] },
      {
        companyId: "c4",
        companyName: "Boş grup",
        companyActive: true,
        groups: [{ groupId: "g9", groupName: "X", groupActive: true, branches: [] }],
      },
    ];
    expect(isMultiCompany(emptySecond)).toBe(false);
  });

  it("filterTreeByCompany: null tüm ağaç, id yalnız o şirket", () => {
    expect(filterTreeByCompany(tree, null)).toBe(tree);
    expect(filterTreeByCompany(tree, "c2").map((company) => company.companyId)).toEqual(["c2"]);
    expect(filterTreeByCompany(tree, "yok")).toEqual([]);
  });

  it("subtree yalnız verilen şubeleri tutar, boş düğümleri atar", () => {
    const result = subtree(tree, ["b2"]);
    expect(result).toHaveLength(1);
    expect(result[0].companyId).toBe("c1");
    expect(result[0].groups.map((group) => group.groupId)).toEqual(["g1"]);
    expect(flattenTree(result).map((branch) => branch.id)).toEqual(["b2"]);
    expect(subtree(tree, [])).toEqual([]);
    expect(flattenTree(subtree(tree, ["b3", "b1"])).map((branch) => branch.id)).toEqual([
      "b1",
      "b3",
    ]);
  });
});

describe("useBranchTree", () => {
  const me = (id: string, tenant = "acme"): Me => ({
    id,
    email: `${id}@x.com`,
    fullName: id,
    tenant,
    permissions: [],
    roles: [],
    landingPath: "/",
    twoFactorEnabled: false,
  });

  function sharedWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
  }

  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue(tree);
    useAuthStore.setState({ me: me("u1") });
  });

  // Önceki testin bağlı kancası oturum değişince yeniden çekmesin.
  afterEach(cleanup);

  it("branch-tree ucunu kapsam ve pasif seçeneğiyle çağırır", async () => {
    const { result } = renderHook(() => useBranchTree(), { wrapper: sharedWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledWith(
      "/organization/branch-tree?scope=mine&includeInactive=false",
    );
    expect(result.current.data).toEqual(tree);

    const all = renderHook(() => useBranchTree("all", true), { wrapper: sharedWrapper() });
    await waitFor(() => expect(all.result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenLastCalledWith(
      "/organization/branch-tree?scope=all&includeInactive=true",
    );
  });

  it("oturum yokken istek atmaz", () => {
    useAuthStore.setState({ me: null });
    const { result } = renderHook(() => useBranchTree(), { wrapper: sharedWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("anahtar kiracı ve kullanıcıyı içerir: kullanıcı değişince yeniden çeker", async () => {
    const wrapper = sharedWrapper();
    const { result } = renderHook(() => useBranchTree(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledTimes(1);

    // Aynı kullanıcıyla 60 sn içinde yeniden açılışta önbellek kullanılır.
    const again = renderHook(() => useBranchTree(), { wrapper });
    expect(again.result.current.isSuccess).toBe(true);
    expect(apiGet).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState({ me: me("u2") }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));

    act(() => useAuthStore.setState({ me: me("u2", "other") }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(3));
  });

  it("grupsuz iş yerlerinin boş grup adı 'Diğer' olur", async () => {
    apiGet.mockResolvedValue([
      {
        companyId: "c1",
        companyName: "A",
        companyActive: true,
        groups: [
          {
            groupId: null,
            groupName: "",
            groupActive: true,
            branches: [{ id: "b1", code: "X", name: "X", active: true }],
          },
          {
            groupId: "g1",
            groupName: "",
            groupActive: true,
            branches: [{ id: "b2", code: "Y", name: "Y", active: true }],
          },
        ],
      },
    ]);
    const { result } = renderHook(() => useBranchTree(), { wrapper: sharedWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].groups.map((group) => group.groupName)).toEqual([
      OTHER_GROUP_NAME,
      "",
    ]);
    expect(OTHER_GROUP_NAME).toBe("Diğer");
  });
});
