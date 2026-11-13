import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import type { Branch, Page } from "../../pages/finance/types";

/**
 * Şirket → şube grubu → iş yeri (Blackrose "branch") ağacı; ZTO'nun "WorkPlaceGroups" deseni
 * (MX5 §1.7, §5.2). Tüm şube seçim bileşenlerinin tek veri kaynağı.
 */
export interface BranchTreeBranch {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface BranchTreeGroup {
  groupId: string | null;
  groupName: string;
  branches: BranchTreeBranch[];
}

export interface BranchTreeCompany {
  companyId: string | null;
  companyName: string;
  groups: BranchTreeGroup[];
}

export type BranchTree = BranchTreeCompany[];

export type BranchScope = "mine" | "all";

/** Grubu olmayan şubelerin toplandığı grup adı (sunucu ağacıyla aynı). */
export const OTHER_GROUP_NAME = "Diğer";

/** Şube listesi ucunun öğesi; "active" 12.1a'da gelecek, yoksa etkin sayılır. */
export type BranchListItem = Branch & { active?: boolean };

const byName = (a: BranchTreeBranch, b: BranchTreeBranch) => a.name.localeCompare(b.name, "tr");

/**
 * Düz şube listesinden tek şirket + tek grup ("Diğer") ağacı türetir. GET /organization/branch-tree
 * gelene kadar kullanılır (12.1a). Şube yoksa boş ağaç döner.
 */
export function branchesToTree(branches: BranchListItem[], includeInactive = false): BranchTree {
  const items = branches
    .map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      active: branch.active ?? true,
    }))
    .filter((branch) => includeInactive || branch.active)
    .sort(byName);
  if (items.length === 0) {
    return [];
  }
  return [
    {
      companyId: null,
      companyName: "",
      groups: [{ groupId: null, groupName: OTHER_GROUP_NAME, branches: items }],
    },
  ];
}

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

/** ≥2 şirkette seçim bileşenleri şirket başlığını gösterir (MX5 §4.4). */
export function isMultiCompany(tree: BranchTree): boolean {
  return tree.length > 1;
}

/**
 * Şube ağacı. scope sunucuda uygulanır (12.1a); o zamana kadar mevcut şube listesi ucu kullanıcının
 * görebildiği şubeleri döndürdüğü için scope yalnız sorgu anahtarındadır.
 */
export function useBranchTree(scope: BranchScope = "mine", includeInactive = false) {
  return useQuery({
    queryKey: ["branch-tree", scope, includeInactive],
    queryFn: async () => {
      const page = await apiGet<Page<BranchListItem>>("/organization/branches?size=200&sort=name");
      return branchesToTree(page.content, includeInactive);
    },
    // staleTime yok (useBranches gibi): şube MUI Tanımlar ekranında ["branches"] ile geçersizlenir;
    // ağaç her açılışta yeniden çekilir. 12.1a'da şube/şirket mutasyonları ["branch-tree"]'yi geçersizleyince
    // önbellek uzatılabilir.
  });
}
