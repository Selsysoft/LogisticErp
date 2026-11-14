import type { Me } from "../../auth/authStore";
import { isMultiCompany, type BranchTree } from "../branch/branchTree";
import { searchKey } from "../searchKey";

/**
 * select2 4.1.0-rc.0 davranışının saf karşılığı (ZtoSelect). Kaynak: select2 src/js/select2
 * defaults.js (matcher, stripDiacritics), results.js (vurgu gezinmesi), core.js (tuşlar),
 * dropdown/attachBody.js (konum), dropdown/minimumResultsForSearch.js, dropdown/hidePlaceholder.js.
 */

export interface ZtoSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ZtoSelectGroup {
  label: string;
  options: ZtoSelectOption[];
}

export type ZtoSelectItem = ZtoSelectOption | ZtoSelectGroup;

export function isGroup(item: ZtoSelectItem): item is ZtoSelectGroup {
  return "options" in item;
}

// select2 stripDiacritics + toUpperCase; tablo ve çoklu iş yeri araması da aynı anahtarı kullanır.
export { searchKey } from "../searchKey";

/** select2 matcher: boş/boşluk arama her şeyi döndürür; aksi halde metin içinde arar. */
export function matchesTerm(label: string, term: string): boolean {
  if (term.trim() === "") {
    return true;
  }
  return searchKey(label).includes(searchKey(term));
}

/**
 * Seçenekleri arama terimine göre süzer. Grup: eşleşen çocuklar kalır; hiçbir çocuk eşleşmez ama grup
 * adı eşleşirse grubun tüm seçenekleri döner (select2 bu durumda boş grup başlığı gösterir; burada
 * grup adıyla aramak işe yarasın diye çocuklar korunur). Boş kalan grup düşer.
 * hiddenValue: select2 HidePlaceholder — yer tutucu değerindeki üst düzey seçenek listede gösterilmez.
 */
export function filterItems(
  items: ZtoSelectItem[],
  term: string,
  hiddenValue?: string,
): ZtoSelectItem[] {
  const result: ZtoSelectItem[] = [];
  for (const item of items) {
    if (isGroup(item)) {
      const children = item.options.filter((option) => matchesTerm(option.label, term));
      if (children.length > 0) {
        result.push({ ...item, options: children });
      } else if (item.options.length > 0 && matchesTerm(item.label, term)) {
        result.push(item);
      }
    } else if (item.value !== hiddenValue && matchesTerm(item.label, term)) {
      result.push(item);
    }
  }
  return result;
}

/** Düz seçenek listesi (gruplar açılır), sırası korunur. */
export function flattenOptions(items: ZtoSelectItem[]): ZtoSelectOption[] {
  return items.flatMap((item) => (isGroup(item) ? item.options : [item]));
}

/** Klavyeyle gezilebilen (devre dışı olmayan) seçenek değerleri. */
export function selectableValues(items: ZtoSelectItem[]): string[] {
  return flattenOptions(items)
    .filter((option) => !option.disabled)
    .map((option) => option.value);
}

export function findOption(items: ZtoSelectItem[], value: string): ZtoSelectOption | undefined {
  return flattenOptions(items).find((option) => option.value === value);
}

/** select2 minimumResultsForSearch: seçenek sayısı (gruplar hariç) eşiğin altındaysa arama gizlenir. */
export function shouldShowSearch(items: ZtoSelectItem[], minimumResultsForSearch = 0): boolean {
  const min = minimumResultsForSearch < 0 ? Infinity : minimumResultsForSearch;
  return flattenOptions(items).length >= min;
}

export type SelectionDisplay =
  | { kind: "placeholder"; text: string }
  | { kind: "option"; option: ZtoSelectOption }
  | { kind: "empty" };

/**
 * Kapalı kutuda görünen metin. Değer "" ve yer tutucu varsa yer tutucu; değer eşleşirse o seçenek;
 * eşleşmezse yerel select gibi ilk etkin seçenek (React de aynısını seçili gösterir).
 */
export function resolveDisplay(
  items: ZtoSelectItem[],
  value: string,
  placeholder?: string,
): SelectionDisplay {
  if (placeholder !== undefined && value === "") {
    return { kind: "placeholder", text: placeholder };
  }
  const option = findOption(items, value);
  if (option) {
    return { kind: "option", option };
  }
  if (placeholder !== undefined) {
    return { kind: "placeholder", text: placeholder };
  }
  const first = flattenOptions(items).find((candidate) => !candidate.disabled);
  return first ? { kind: "option", option: first } : { kind: "empty" };
}

/** select2 highlightFirstItem: listede seçili öğe varsa o, yoksa ilk seçilebilir öğe. */
export function initialHighlight(selectable: string[], value: string): string | null {
  if (selectable.includes(value)) {
    return value;
  }
  return selectable.length > 0 ? selectable[0] : null;
}

/**
 * select2 results:next / results:previous. Uçlarda durur (sarmaz); vurgu yokken "next" ilk öğeye
 * gider, "previous" bir şey yapmaz.
 */
export function moveHighlight(
  selectable: string[],
  current: string | null,
  direction: "next" | "previous",
): string | null {
  const index = current === null ? -1 : selectable.indexOf(current);
  if (direction === "next") {
    return index + 1 < selectable.length ? selectable[index + 1] : current;
  }
  return index <= 0 ? current : selectable[index - 1];
}

export type SelectKeyAction = "open" | "close" | "select" | "next" | "previous" | "clear" | null;

export interface SelectKeyInput {
  key: string;
  altKey?: boolean;
  open: boolean;
  allowClear?: boolean;
}

/** select2 core.js keypress + AllowClear._handleKeyboardClear. */
export function selectKeyAction({
  key,
  altKey,
  open,
  allowClear,
}: SelectKeyInput): SelectKeyAction {
  if (open) {
    if (key === "Escape" || (key === "ArrowUp" && altKey)) {
      return "close";
    }
    if (key === "Enter" || key === "Tab") {
      return "select";
    }
    if (key === "ArrowUp") {
      return "previous";
    }
    if (key === "ArrowDown") {
      return "next";
    }
    return null;
  }
  if (key === "Enter" || key === " " || (key === "ArrowDown" && altKey)) {
    return "open";
  }
  if (allowClear && (key === "Delete" || key === "Backspace")) {
    return "clear";
  }
  return null;
}

export type DropdownDirection = "above" | "below";

export interface DropdownPositionInput {
  /** Kapsayıcının (span.select2) görünüm alanına göre kutusu. */
  trigger: { top: number; bottom: number; left: number; width: number };
  dropdownHeight: number;
  viewportHeight: number;
  /** Mutlak konumun başlangıcı, görünüm alanı koordinatında (offsetParent içerik kökü). */
  origin: { top: number; left: number };
  current: DropdownDirection | null;
}

export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  direction: DropdownDirection;
}

/** select2 AttachBody._positionDropdown + _resizeDropdown. */
export function computeDropdownPosition({
  trigger,
  dropdownHeight,
  viewportHeight,
  origin,
  current,
}: DropdownPositionInput): DropdownPosition {
  const enoughRoomAbove = trigger.top - dropdownHeight > 0;
  const enoughRoomBelow = viewportHeight > trigger.bottom + dropdownHeight;
  let direction: DropdownDirection = current ?? "below";
  if (!enoughRoomBelow && enoughRoomAbove && current !== "above") {
    direction = "above";
  } else if (!enoughRoomAbove && enoughRoomBelow && current === "above") {
    direction = "below";
  }
  const top = direction === "above" ? trigger.top - dropdownHeight : trigger.bottom;
  return {
    top: top - origin.top,
    left: trigger.left - origin.left,
    width: trigger.width,
    direction,
  };
}

/**
 * Vurgulu öğeyi liste kutusunda görünür kılacak yeni scrollTop; zaten görünürse null.
 * itemTop: öğenin liste içeriğinin başına göre konumu.
 */
export function scrollTopToReveal(
  scrollTop: number,
  listHeight: number,
  itemTop: number,
  itemHeight: number,
): number | null {
  if (itemTop < scrollTop) {
    return itemTop;
  }
  if (itemTop + itemHeight > scrollTop + listHeight) {
    return itemTop + itemHeight - listHeight;
  }
  return null;
}

/** select2 _generateId: "select2-" + id; id yoksa name; ":.[]," karakterleri atılır. */
export function containerIdFor(id: string | undefined, name: string | undefined, fallback: string) {
  const base = id ? id : name ? `${name}-${fallback}` : fallback;
  return `select2-${base}`.replace(/[:.[\],\s]/g, "");
}

/** Şirket ile grup adı arasındaki ayırıcı: ≥2 şirkette optgroup etiketi "Şirket › Grup" (MX5 §4.4). */
export const COMPANY_GROUP_SEPARATOR = " › ";

export interface BranchSelectItemsOptions {
  /** "Tüm İş Yerleri" gibi boş değerli ilk seçenek; verilmezse eklenmez. */
  allLabel?: string;
  /** Pasif şube etiketine eklenen ek ("(Pasif)"). */
  inactiveSuffix: string;
}

/**
 * Şube ağacı → ZtoSelect seçenekleri (MX5 §1.7 Varyant A). Optgroup = şube grubu; ≥2 şirkette etiket
 * "Şirket › Grup" (şubesi olan şirketler sayılır, isMultiCompany). ZTO her iş yerini
 * COALESCE(şube,'Diğer') ile bir gruba koyar (CustomerAccountPaymentController.cs:293-331); grupsuz
 * şubeler "Diğer" optgroup'unda görünür.
 * Pasif şubeler (includeInactive) seçilemez.
 */
export function branchTreeToSelectItems(
  tree: BranchTree,
  { allLabel, inactiveSuffix }: BranchSelectItemsOptions,
): ZtoSelectItem[] {
  const items: ZtoSelectItem[] = allLabel === undefined ? [] : [{ value: "", label: allLabel }];
  const multiCompany = isMultiCompany(tree);
  const groups = tree.flatMap((company) =>
    company.groups
      .filter((group) => group.branches.length > 0)
      .map((group) => ({ company, group })),
  );
  const toOption = (branch: { id: string; name: string; active: boolean }): ZtoSelectOption =>
    branch.active
      ? { value: branch.id, label: branch.name }
      : { value: branch.id, label: `${branch.name} ${inactiveSuffix}`, disabled: true };
  for (const { company, group } of groups) {
    items.push({
      label: multiCompany
        ? `${company.companyName}${COMPANY_GROUP_SEPARATOR}${group.groupName}`
        : group.groupName,
      options: group.branches.map(toOption),
    });
  }
  return items;
}

/**
 * Kullanıcının varsayılan şubesi (`Me.defaultBranchId`, 12.1a §5.3). Önbellekteki eski oturum
 * bilgisinde alan yoksa ya da geçersizse undefined.
 */
export function readDefaultBranchId(me: Me | null | undefined): string | undefined {
  const value: unknown = me?.defaultBranchId;
  return typeof value === "string" && value !== "" ? value : undefined;
}
