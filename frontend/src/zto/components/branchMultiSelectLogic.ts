import type { BranchTree, BranchTreeCompany, BranchTreeGroup } from "../branch/branchTree";
import { flattenTree } from "../branch/branchTree";
import { searchKey } from "../searchKey";

/*
 * ZtoBranchMultiSelect ve ZtoGroupStatChips'in saf mantığı (MX5 §1.7).
 * Kaynak: Payments.cshtml:1964-2047 (dpr*), CustomerAccounts/Index.cshtml:5999-6001, :6177-6220
 * (wp-multiselect), BankIntroductionController.cs:472-488 (BuildFilterGroups).
 * ZTO terimi → ağaç: "şube" (BranchProvince) = grup, "iş yeri" (WorkPlace) = branch.
 */

export type BranchMultiSelectVariant = "list" | "dropdown";

/** Grup/şirket kutusunun durumu (dprSyncBranch, Payments.cshtml:1971-1978). */
export interface CheckState {
  checked: boolean;
  indeterminate: boolean;
  /** "(seçili/toplam)" sayacı için. */
  selected: number;
  total: number;
}

export function checkState(ids: readonly string[], selected: ReadonlySet<string>): CheckState {
  const count = ids.filter((id) => selected.has(id)).length;
  return {
    checked: count > 0 && count === ids.length,
    indeterminate: count > 0 && count < ids.length,
    selected: count,
    total: ids.length,
  };
}

export function companyKey(company: BranchTreeCompany): string {
  return company.companyId ?? `~${company.companyName}`;
}

export function groupKey(company: BranchTreeCompany, group: BranchTreeGroup): string {
  return `${companyKey(company)}::${group.groupId ?? `~${group.groupName}`}`;
}

export function allBranchIds(tree: BranchTree): string[] {
  return flattenTree(tree).map((branch) => branch.id);
}

/** Hepsi seçili mi? Liste boşsa hayır (dprSyncToggleAllLabel, Payments.cshtml:1966-1967). */
export function isAllSelected(allIds: readonly string[], selected: ReadonlySet<string>): boolean {
  return allIds.length > 0 && allIds.every((id) => selected.has(id));
}

/** "Tümünü seç" ↔ "Temizle" (Payments.cshtml:1989-1994). */
export function toggleAll(allIds: readonly string[], selected: ReadonlySet<string>): Set<string> {
  return isAllSelected(allIds, selected) ? new Set() : new Set(allIds);
}

/** Grup/şirket kutusu → altındaki tüm iş yerleri (Payments.cshtml:1996-2001). */
export function setMany(
  selected: ReadonlySet<string>,
  ids: readonly string[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of ids) {
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  return setMany(selected, [id], !selected.has(id));
}

/**
 * Seçimden onChange değeri: ağaç sırasıyla kimlikler; ağaçta olmayan kimlik atılır. emptyMeansAll
 * iken hiçbiri ya da hepsi seçiliyse [] (sunucuya parametre gönderilmez; boş = tüm iş yerleri;
 * CustomerAccounts/Index.cshtml:5999-6001, Payments.cshtml:2056-2059).
 */
export function normalizeSelection(
  selected: ReadonlySet<string>,
  allIds: readonly string[],
  emptyMeansAll: boolean,
): string[] {
  const ids = allIds.filter((id) => selected.has(id));
  if (emptyMeansAll && (ids.length === 0 || ids.length === allIds.length)) {
    return [];
  }
  return ids;
}

/**
 * Dışarıdan gelen değerin ekrandaki karşılığı. Boş değer emptyMeansAll iken listede hiçbir kutu
 * işaretsiz (Payments.cshtml:497 açılış hali), açılır listede hepsi işaretli
 * (CustomerAccounts/Index.cshtml:4278 checked="checked") gösterilir.
 */
export function selectionFromValue(
  value: readonly string[],
  allIds: readonly string[],
  variant: BranchMultiSelectVariant,
  emptyMeansAll: boolean,
): Set<string> {
  if (value.length === 0 && emptyMeansAll && variant === "dropdown") {
    return new Set(allIds);
  }
  return new Set(value);
}

/** Sırası önemsiz küme eşitliği. */
export function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/**
 * Arama metni: kırpılır, select2 searchKey ile katlanır (aksan ve büyük/küçük harf duyarsız). ZTO
 * toLowerCase ile "ISPARTA" ↔ "isparta" eşleşir; tr-TR küçük harf (I→ı) bunu bozardı.
 */
export function normalizeSearch(text: string): string {
  return searchKey(text.trim());
}

export interface SearchResult {
  /** Görünür iş yerleri; diğerleri .hidden alır. */
  visibleBranchIds: Set<string>;
  /** En az bir görünür iş yeri olan gruplar; diğerleri .hidden alır. */
  visibleGroupKeys: Set<string>;
  visibleCompanyKeys: Set<string>;
  /** Arama doluyken eşleşen ve açılması gereken grup/şirket anahtarları. */
  expandKeys: Set<string>;
}

/**
 * İş yeri adında VE grup adında arar (Payments.cshtml:2008-2023); Blackrose eki olarak şirket adında
 * da. ZTO toLowerCase kullanır; burada ZtoSelect/ZtoDataTable ile aynı searchKey katlaması kullanılır.
 */
export function searchTree(tree: BranchTree, rawTerm: string): SearchResult {
  const term = normalizeSearch(rawTerm);
  const result: SearchResult = {
    visibleBranchIds: new Set(),
    visibleGroupKeys: new Set(),
    visibleCompanyKeys: new Set(),
    expandKeys: new Set(),
  };
  const matches = (name: string) => !term || searchKey(name).includes(term);
  for (const company of tree) {
    const companyMatch = term !== "" && matches(company.companyName);
    let companyVisible = false;
    for (const group of company.groups) {
      const groupMatch = companyMatch || matches(group.groupName);
      let anyVisible = false;
      for (const branch of group.branches) {
        if (groupMatch || matches(branch.name)) {
          result.visibleBranchIds.add(branch.id);
          anyVisible = true;
        }
      }
      if (anyVisible) {
        const key = groupKey(company, group);
        result.visibleGroupKeys.add(key);
        companyVisible = true;
        if (term) {
          result.expandKeys.add(key);
        }
      }
    }
    if (companyVisible) {
      result.visibleCompanyKeys.add(companyKey(company));
      if (term) {
        result.expandKeys.add(companyKey(company));
      }
    }
  }
  return result;
}

/** Eşleşen grupları açar; ZTO'daki gibi arama silinince yeniden daraltılmaz. */
export function expandMatched(
  collapsed: ReadonlySet<string>,
  expandKeys: ReadonlySet<string>,
): Set<string> {
  return new Set([...collapsed].filter((key) => !expandKeys.has(key)));
}

export function toggleKey(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

/** Açılır liste düğme etiketi (updateWpLabel, CustomerAccounts/Index.cshtml:6209-6220). */
export type DropdownLabel =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "one"; name: string }
  | { kind: "many"; count: number };

export function dropdownLabel(tree: BranchTree, selected: ReadonlySet<string>): DropdownLabel {
  const branches = flattenTree(tree);
  const chosen = branches.filter((branch) => selected.has(branch.id));
  if (branches.length === 0 || chosen.length === branches.length) {
    return { kind: "all" };
  }
  if (chosen.length === 0) {
    return { kind: "none" };
  }
  if (chosen.length === 1) {
    return { kind: "one", name: chosen[0].name };
  }
  return { kind: "many", count: chosen.length };
}

/** Varyant D istatistik grubu (StatisticGroupViewModel). */
export interface StatGroup {
  name: string;
  count: number;
}

/**
 * BuildFilterGroups karşılığı (BankIntroductionController.cs:472-488): boş ad → undefinedLabel, ad
 * kırpılır, adet azalan, sonra ad (tr) artan.
 */
export function buildStatGroups<T>(
  items: readonly T[],
  selector: (item: T) => string | null | undefined,
  undefinedLabel: string,
): StatGroup[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const raw = selector(item)?.trim();
    const name = raw ? raw : undefinedLabel;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
}

/** Çipe tıklama: etkin olana yeniden tıklamak süzgeci kaldırır (toggleDynamicFilter, :2372-2387). */
export function toggleStatSelection(
  active: string | null | undefined,
  name: string,
): string | null {
  return active === name ? null : name;
}
