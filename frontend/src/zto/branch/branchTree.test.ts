// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  BranchTree,
  branchesToTree,
  branchIdsOfCompany,
  branchIdsOfGroup,
  findBranch,
  flattenTree,
  isMultiCompany,
  OTHER_GROUP_NAME,
  useBranchTree,
} from "./branchTree";

const apiGet = vi.fn();
vi.mock("../../api/client", () => ({ apiGet: (path: string) => apiGet(path) }));

const BRANCHES = [
  { id: "b2", code: "IZM", name: "İzmir" },
  { id: "b1", code: "ANK", name: "Ankara", active: true },
  { id: "b3", code: "ADA", name: "Adana", active: false },
  { id: "b4", code: "CNK", name: "Çanakkale" },
];

describe("branchesToTree", () => {
  it("tek şirket ve 'Diğer' grubu altında etkin şubeleri Türkçe ada göre sıralar", () => {
    expect(branchesToTree(BRANCHES)).toEqual([
      {
        companyId: null,
        companyName: "",
        groups: [
          {
            groupId: null,
            groupName: OTHER_GROUP_NAME,
            branches: [
              { id: "b1", code: "ANK", name: "Ankara", active: true },
              { id: "b4", code: "CNK", name: "Çanakkale", active: true },
              { id: "b2", code: "IZM", name: "İzmir", active: true },
            ],
          },
        ],
      },
    ]);
    expect(OTHER_GROUP_NAME).toBe("Diğer");
  });

  it("includeInactive ile pasif şubeleri de alır", () => {
    const tree = branchesToTree(BRANCHES, true);
    expect(flattenTree(tree).map((branch) => [branch.id, branch.active])).toEqual([
      ["b3", false],
      ["b1", true],
      ["b4", true],
      ["b2", true],
    ]);
  });

  it("şube yoksa ya da hepsi pasifse boş ağaç döner", () => {
    expect(branchesToTree([])).toEqual([]);
    expect(branchesToTree([{ id: "x", code: "X", name: "X", active: false }])).toEqual([]);
  });
});

describe("ağaç yardımcıları", () => {
  const tree: BranchTree = [
    {
      companyId: "c1",
      companyName: "A Lojistik",
      groups: [
        {
          groupId: "g1",
          groupName: "Ege",
          branches: [
            { id: "b1", code: "IZM", name: "İzmir", active: true },
            { id: "b2", code: "MNS", name: "Manisa", active: true },
          ],
        },
        { groupId: null, groupName: "Diğer", branches: [] },
      ],
    },
    {
      companyId: "c2",
      companyName: "B Taşımacılık",
      groups: [
        {
          groupId: "g2",
          groupName: "İç Anadolu",
          branches: [{ id: "b3", code: "ANK", name: "Ankara", active: false }],
        },
      ],
    },
  ];

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

  it("findBranch ve isMultiCompany", () => {
    expect(findBranch(tree, "b3")?.name).toBe("Ankara");
    expect(findBranch(tree, "yok")).toBeUndefined();
    expect(isMultiCompany(tree)).toBe(true);
    expect(isMultiCompany(tree.slice(0, 1))).toBe(false);
    expect(isMultiCompany([])).toBe(false);
  });
});

describe("useBranchTree", () => {
  function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
  }

  it("şube listesi ucundan ağaç türetir; anahtar kapsam ve pasif seçeneğini içerir", async () => {
    apiGet.mockResolvedValue({
      content: BRANCHES,
      page: 0,
      size: 200,
      totalElements: 4,
      totalPages: 1,
    });
    const { result } = renderHook(() => useBranchTree(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledWith("/organization/branches?size=200&sort=name");
    expect(flattenTree(result.current.data!).map((branch) => branch.id)).toEqual([
      "b1",
      "b4",
      "b2",
    ]);

    const all = renderHook(() => useBranchTree("all", true), { wrapper: wrapper() });
    await waitFor(() => expect(all.result.current.isSuccess).toBe(true));
    expect(flattenTree(all.result.current.data!)).toHaveLength(4);
  });

  it("yeniden bağlanınca yeniden çeker (5 dk bayat önbellek yok; yeni şube hemen görünür)", async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({
      content: BRANCHES,
      page: 0,
      size: 200,
      totalElements: 4,
      totalPages: 1,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const first = renderHook(() => useBranchTree(), { wrapper: shared });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    expect(apiGet).toHaveBeenCalledTimes(1);
    const second = renderHook(() => useBranchTree(), { wrapper: shared });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    second.unmount();
  });
});
