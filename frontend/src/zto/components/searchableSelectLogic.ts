import { searchKey } from "../searchKey";

/*
 * ZTO SearchableSelect (wwwroot/js/zt/collections/searchable-select.js; payments/searchable-select.js
 * aynı DOM) mantığı — 12.2 §5.9. Arama ZTO `_normalize` yerine ortak `searchKey` katlamasıyla yapılır
 * (ı/i/İ, ş/s, ğ/g … eşleşir; ZtoSelect ve ZtoDataTable ile aynı). Liste satırları: boş değerli
 * "Tümü" seçeneği (`ss-option-reset`), optgroup başlıkları (`ss-optgroup-label`), seçenekler ve
 * eşleşme yoksa "bulunamadı" satırı (`ss-no-result`).
 */

export type SearchableOption = { value: string; label: string };
export type SearchableGroup = { label: string; options: SearchableOption[] };
export type SearchableItem = SearchableOption | SearchableGroup;

export type HighlightPart = { text: string; match: boolean };

export type SearchableRow =
  | { kind: "reset"; value: ""; label: string; parts: HighlightPart[] }
  | { kind: "group"; label: string }
  | { kind: "option"; value: string; label: string; parts: HighlightPart[] }
  | { kind: "empty"; label: string };

export function isGroup(item: SearchableItem): item is SearchableGroup {
  return (item as SearchableGroup).options !== undefined;
}

/** Tüm seçenekler (gruplar açılmış, sıra korunur). */
export function flattenOptions(items: readonly SearchableItem[]): SearchableOption[] {
  return items.flatMap((item) => (isGroup(item) ? item.options : [item]));
}

/** Aramanın katlanmış anahtarı (boşluklar kırpılır). */
export function queryKey(query: string): string {
  return searchKey(query.trim());
}

/** Etiket aramayla eşleşiyor mu (boş arama her şeyi eşler). */
export function matches(label: string, query: string): boolean {
  const key = queryKey(query);
  return key === "" || searchKey(label).includes(key);
}

/**
 * ZTO `_highlight`: etikette ilk eşleşen bölüm işaretlenir. Katlama karakter başına yapılır; böylece
 * "ş" → "S" gibi dönüşümlerde konumlar özgün metne eşlenir.
 */
export function highlightParts(label: string, query: string): HighlightPart[] {
  const key = queryKey(query);
  if (key === "") return [{ text: label, match: false }];
  const chars = Array.from(label);
  const folded = chars.map((ch) => searchKey(ch));
  const joined = folded.join("");
  const at = joined.indexOf(key);
  if (at < 0) return [{ text: label, match: false }];
  // Katlanmış konumu karakter dizinine çevir.
  let pos = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < chars.length; i++) {
    const next = pos + folded[i].length;
    if (start < 0 && next > at) start = i;
    if (start >= 0 && next >= at + key.length) {
      end = i + 1;
      break;
    }
    pos = next;
  }
  if (start < 0 || end < 0) return [{ text: label, match: false }];
  const parts: HighlightPart[] = [];
  const before = chars.slice(0, start).join("");
  const hit = chars.slice(start, end).join("");
  const after = chars.slice(end).join("");
  if (before) parts.push({ text: before, match: false });
  parts.push({ text: hit, match: true });
  if (after) parts.push({ text: after, match: false });
  return parts;
}

/**
 * Açılır listenin satırları (ZTO `_filter`): boş seçenek arama boşken ya da etiketi eşleşirken başta;
 * grup başlığı yalnız eşleşen seçeneği varsa; hiç seçenek eşleşmezse "bulunamadı" satırı.
 */
export function buildRows(
  items: readonly SearchableItem[],
  query: string,
  emptyLabel: string | null,
  noResultsText: string,
): SearchableRow[] {
  const rows: SearchableRow[] = [];
  if (emptyLabel !== null && matches(emptyLabel, query)) {
    rows.push({
      kind: "reset",
      value: "",
      label: emptyLabel,
      parts: highlightParts(emptyLabel, query),
    });
  }
  let count = 0;
  const pushOption = (option: SearchableOption) => {
    count += 1;
    rows.push({
      kind: "option",
      value: option.value,
      label: option.label,
      parts: highlightParts(option.label, query),
    });
  };
  for (const item of items) {
    if (isGroup(item)) {
      const hits = item.options.filter((o) => o.value !== "" && matches(o.label, query));
      if (hits.length === 0) continue;
      rows.push({ kind: "group", label: item.label });
      hits.forEach(pushOption);
    } else if (item.value !== "" && matches(item.label, query)) {
      pushOption(item);
    }
  }
  if (count === 0) rows.push({ kind: "empty", label: noResultsText });
  return rows;
}

/** Seçilebilir satırlar (boş seçenek ve seçenekler; başlık ve "bulunamadı" hariç). */
export function selectableRows(rows: readonly SearchableRow[]) {
  return rows.filter(
    (row): row is Extract<SearchableRow, { kind: "reset" | "option" }> =>
      row.kind === "reset" || row.kind === "option",
  );
}

/** Tetikleyici metni (ZTO `_updateTrigger`): seçili etiket ya da boş seçeneğin metni (yer tutucu). */
export function triggerState(
  items: readonly SearchableItem[],
  value: string,
  emptyLabel: string | null,
  fallback: string,
): { text: string; placeholder: boolean } {
  const selected = value === "" ? undefined : flattenOptions(items).find((o) => o.value === value);
  if (selected) return { text: selected.label, placeholder: false };
  return { text: emptyLabel ?? fallback, placeholder: true };
}

/** Ok tuşu gezinmesi (ZTO `_arrows`): sona/başa sarar; -1 (odak arama kutusunda) ↓ ilkine gider. */
export function nextIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

export type DropdownPlacement = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
};

/**
 * ZTO `_open` konumu (position: fixed): tetikleyicinin altına; altta 250 px'ten az yer varsa ve üstte
 * daha çok yer varsa yukarı açılır.
 */
export function dropdownPlacement(
  rect: { top: number; bottom: number; left: number; width: number },
  viewportHeight: number,
): DropdownPlacement {
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;
  if (spaceBelow < 250 && spaceAbove > spaceBelow) {
    return { bottom: viewportHeight - rect.top + 4, left: rect.left, width: rect.width };
  }
  return { top: rect.bottom + 4, left: rect.left, width: rect.width };
}
