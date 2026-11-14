import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import type {
  BranchTree,
  BranchTreeBranch,
  BranchTreeCompany,
  BranchTreeGroup,
} from "../../pages/organization/types";

/**
 * Şirket → şube grubu → iş yeri (Blackrose "branch") ağacı; ZTO'nun "WorkPlaceGroups" deseni
 * (MX5 §1.7, §5.2). Tüm şube seçim bileşenlerinin tek veri kaynağı: GET /organization/branch-tree
 * (12.1a §5.1). Tipler API tipleri olarak pages/organization/types.ts'tedir.
 */
export type { BranchTree, BranchTreeBranch, BranchTreeCompany, BranchTreeGroup };

/** Sunucu kapsamı uygular; iki değer de bugün çağıranın görebildiği iş yerlerini döndürür (§5.1). */
export type BranchScope = "mine" | "all";

/** Grubu olmayan şubelerin grup adı; yalnız sunucu adı boş gelirse yedek olarak kullanılır. */
export const OTHER_GROUP_NAME = "Diğer";

/** Ağaçtaki tüm şubeler, ağaç sırasıyla. */
export function flattenTree(tree: BranchTree): BranchTreeBranch[] {
  return tree.flatMap((company) => company.groups.flatMap((group) => group.branches));
}

export function branchIdsOfGroup(group: BranchTreeGroup): string[] {
  return group.branches.map((branch) => branch.id);
}

export function branchIdsOfCompany(company: BranchTreeCompany): string[] {
  return company.groups.flatMap(branchIdsOfGroup);
}

export function findBranch(tree: BranchTree, id: string): BranchTreeBranch | undefined {
  return flattenTree(tree).find((branch) => branch.id === id);
}

/** ≥2 şirkette seçim bileşenleri şirket başlığını gösterir (MX5 §4.4); şubesiz şirket sayılmaz. */
export function isMultiCompany(tree: BranchTree): boolean {
  return tree.filter((company) => branchIdsOfCompany(company).length > 0).length >= 2;
}

/** Yalnız verilen şirketin dalı; null = tüm ağaç. */
export function filterTreeByCompany(tree: BranchTree, companyId: string | null): BranchTree {
  return companyId === null ? tree : tree.filter((company) => company.companyId === companyId);
}

/** Yalnız verilen şubeler; boş kalan grup ve şirketler atılır. */
export function subtree(tree: BranchTree, ids: string[]): BranchTree {
  const wanted = new Set(ids);
  return tree
    .map((company) => ({
      ...company,
      groups: company.groups
        .map((group) => ({
          ...group,
          branches: group.branches.filter((branch) => wanted.has(branch.id)),
        }))
        .filter((group) => group.branches.length > 0),
    }))
    .filter((company) => company.groups.length > 0);
}

/** Sunucu grupsuz iş yerlerinin adını boş gönderirse "Diğer" yazılır. */
function withGroupNames(tree: BranchTree): BranchTree {
  return tree.map((company) => ({
    ...company,
    groups: company.groups.map((group) =>
      group.groupId === null && !group.groupName
        ? { ...group, groupName: OTHER_GROUP_NAME }
        : group,
    ),
  }));
}

export function branchTreePath(scope: BranchScope, includeInactive: boolean): string {
  return `/organization/branch-tree?scope=${scope}&includeInactive=${includeInactive}`;
}

/**
 * Şube ağacı. Ağaç kullanıcıya özgüdür (LIMITED kapsam sunucuda uygulanır), bu yüzden anahtar kiracı
 * ve kullanıcıyı içerir: aynı SPA'da başka kullanıcıyla girildiğinde önceki kullanıcının ağacı
 * görünmez. Şube/şirket mutasyonları ["branch-tree"] önekini geçersizler.
 */
export function useBranchTree(scope: BranchScope = "mine", includeInactive = false) {
  const me = useAuthStore((state) => state.me);
  return useQuery({
    queryKey: ["branch-tree", me?.tenant, me?.id, scope, includeInactive],
    enabled: !!me,
    queryFn: async () =>
      withGroupNames(await apiGet<BranchTree>(branchTreePath(scope, includeInactive))),
    staleTime: 60_000,
  });
}
