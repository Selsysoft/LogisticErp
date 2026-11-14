import { searchKey } from "../searchKey";

/*
 * ZtoAccountSearch saf mantığı (12.1 §5.5 F4). Üç ZTO görünümü:
 * - "atcs": AllTransactions #atCariSearch (alltransactions.js:500-590) ve Transactions #txCariSearch
 *   (Transactions.cshtml:297-305);
 * - "qca": Hızlı Cari #qcaSearchInput (_ProductionLayout.cshtml:3848-3953);
 * - "listGroup": Cari Taşıma #ctTargetSearch (Transactions.cshtml:3566-3568, :3931-3958).
 */

export type AccountSearchVariant = "atcs" | "qca" | "listGroup";

export type AccountSearchIds = {
  input?: string;
  results?: string;
  clear?: string;
  wrap?: string;
};

export type VariantClasses = {
  /** Sarmalayıcı sınıfı; listGroup'ta sınıf yok (satır içi `position: relative`). */
  wrap: string | undefined;
  /** Arama simgesi + giriş + temizle kabı (yalnız atcs). */
  inputBox: string | undefined;
  icon: string | undefined;
  input: string;
  /** Temizle düğmesi (listGroup'ta yok). */
  clear: string | undefined;
  results: string;
  /** Sonuç kabı açıkken eklenen sınıf; listGroup `display` ile açılır. */
  resultsOpen: string | undefined;
  item: string;
  /** Klavyeyle seçili satır sınıfı (qca ZTO `.active`, list-group Bootstrap `.active`). */
  itemActive: string;
  empty: string;
};

export const VARIANT_CLASSES: Record<AccountSearchVariant, VariantClasses> = {
  atcs: {
    wrap: "atcs-wrap",
    inputBox: "atcs-inputbox",
    icon: "fas fa-search atcs-ic",
    input: "atcs-input",
    clear: "atcs-clear",
    results: "atcs-results",
    resultsOpen: "show",
    item: "atcs-item",
    itemActive: "active",
    empty: "atcs-empty",
  },
  qca: {
    wrap: "qca-search-wrap",
    inputBox: undefined,
    icon: "fas fa-search qca-search-icon",
    input: "qca-search-input",
    clear: "qca-clear",
    results: "qca-results",
    resultsOpen: "show",
    item: "qca-result-item",
    itemActive: "active",
    empty: "qca-results-empty",
  },
  listGroup: {
    wrap: undefined,
    inputBox: undefined,
    icon: undefined,
    input: "form-control form-control-sm",
    clear: undefined,
    results: "list-group",
    resultsOpen: undefined,
    item: "list-group-item list-group-item-action py-1 ct-target-item",
    itemActive: "active",
    empty: "list-group-item small text-muted",
  },
};

/** ZTO gecikmesi ve en kısa terim: atcs/qca 1 harf 220 ms, Cari Taşıma 2 harf 300 ms. */
export function variantDefaults(variant: AccountSearchVariant): {
  minLength: number;
  delayMs: number;
} {
  return variant === "listGroup" ? { minLength: 2, delayMs: 300 } : { minLength: 1, delayMs: 220 };
}

/** ZTO öğe kimlikleri (seçicileri kopyalanan CSS'te kullanılıyor). */
export const AT_HEADER_SEARCH_IDS: AccountSearchIds = {
  wrap: "atCariSearchWrap",
  input: "atCariSearch",
  clear: "atCariSearchClear",
  results: "atCariSearchResults",
};
export const AT_FILTER_SEARCH_IDS: AccountSearchIds = {
  wrap: "filterCariWrap",
  input: "filterCariSearchInput",
  clear: "filterCariClear",
  results: "filterCariResults",
};
export const TX_SEARCH_IDS: AccountSearchIds = {
  wrap: "txCariSearchWrap",
  input: "txCariSearch",
  clear: "txCariSearchClear",
  results: "txCariSearchResults",
};
export const QCA_SEARCH_IDS: AccountSearchIds = {
  input: "qcaSearchInput",
  clear: "qcaClearBtn",
  results: "qcaResults",
};
export const CT_TARGET_SEARCH_IDS: AccountSearchIds = {
  input: "ctTargetSearch",
  results: "ctTargetResults",
};

/** Verilen kimlikler; sonuç ve giriş kimliği yoksa üretilen (aria-controls için gerekli). */
export function resolveIds(
  ids: AccountSearchIds | undefined,
  generated: string,
): Required<Pick<AccountSearchIds, "input" | "results">> & AccountSearchIds {
  return {
    ...ids,
    input: ids?.input ?? `${generated}-input`,
    results: ids?.results ?? `${generated}-results`,
  };
}

/** Sonuç satırının kimliği (aria-activedescendant). */
export function optionId(resultsId: string, index: number): string {
  return `${resultsId}-option-${index}`;
}

/** Arama yapılmalı mı: kırpılmış terim en az `minLength`. */
export function shouldSearch(term: string, minLength: number): boolean {
  const trimmed = term.trim();
  return trimmed.length > 0 && trimmed.length >= minLength;
}

/**
 * ↑/↓/Home/End ile etkin satır: -1 = yok. Aşağı ok sondan başa, yukarı ok baştan sona döner (liste
 * kutusu deseni); satır yoksa -1.
 */
export function nextIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  switch (key) {
    case "ArrowDown":
      return current < 0 || current >= count - 1 ? 0 : current + 1;
    case "ArrowUp":
      return current <= 0 ? count - 1 : current - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return Math.min(current, count - 1);
  }
}

/**
 * MWG `ime-safe-enter-submit`: IME ile harf birleştirilirken basılan Enter seçim yapmaz.
 * `isComposing` Safari'de güvenilmez olduğundan `keyCode 229` de denetlenir.
 */
export function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** Enter'da seçilecek satır: klavyeyle seçili olan, yoksa ilk (ZTO "ilk sonuç"). */
export function enterTarget(activeIndex: number, count: number): number {
  if (count <= 0) return -1;
  return activeIndex >= 0 && activeIndex < count ? activeIndex : 0;
}

/** Kaynak cari sonuçlardan çıkarılır (ZTO `if (a.id === CT_ACC) return;`). */
export function filterHits<T extends { id: string }>(hits: readonly T[], excludeId?: string): T[] {
  return excludeId ? hits.filter((hit) => hit.id !== excludeId) : [...hits];
}

/** atcs grup simgesi (alltransactions.js atGroupIcon: ad içinde arar). */
function atcsGroupIcon(group: string): string {
  const g = group.toLocaleLowerCase("tr");
  if (g.includes("müşteri")) return "fa-user-tie";
  if (g.includes("çavuş")) return "fa-user";
  if (g.includes("yeri")) return "fa-industry";
  if (g.includes("malzeme")) return "fa-boxes";
  if (g.includes("ilaç")) return "fa-flask";
  if (g.includes("nakliye")) return "fa-truck";
  if (g.includes("masraf")) return "fa-receipt";
  if (g.includes("analiz")) return "fa-microscope";
  if (g.includes("tedarikçi")) return "fa-truck-loading";
  return "fa-user-tie";
}

/** qca grup simgesi (_ProductionLayout qcaGroupIcon: tam ad). */
function qcaGroupIcon(group: string): string {
  switch (group) {
    case "Tedarikçi":
      return "fa-truck-loading";
    case "Müşteri":
      return "fa-user-tie";
    case "Malzeme Tedarikçisi":
      return "fa-boxes";
    case "İlaç Tedarikçisi":
      return "fa-flask";
    case "Nakliye Firması":
    case "Sevk Nakliye Firması":
      return "fa-shipping-fast";
    case "Analiz Firması":
      return "fa-microscope";
    case "İş Yeri Firması":
      return "fa-building";
    case "Masraf Hesabı":
      return "fa-receipt";
    case "Kesim Çavuşu":
    case "Üretim Çavuşu":
      return "fa-hard-hat";
    case "Personel":
      return "fa-id-badge";
    default:
      return "fa-tag";
  }
}

/** Satır simgesi (Font Awesome 5 adı, "fas" olmadan). */
export function groupIcon(variant: AccountSearchVariant, group: string | null | undefined): string {
  return variant === "qca" ? qcaGroupIcon(group ?? "") : atcsGroupIcon(group ?? "");
}

export type HighlightPart = { text: string; match: boolean };

/**
 * Metni terimle eşleşen ve eşleşmeyen parçalara böler; aksan ve büyük/küçük harf duyarsız (select2
 * katlaması: İ/I/ı/i ve ş/s eşleşir). Özgün harfler korunur.
 */
export function highlightParts(text: string, term: string): HighlightPart[] {
  const needle = searchKey(term.trim());
  if (needle === "" || text === "") return text === "" ? [] : [{ text, match: false }];
  // Her özgün harfin katlanmış karşılığı; katlanmış dizgedeki konumdan özgün konuma dönülür.
  const chars = Array.from(text);
  const folded: string[] = [];
  const owner: number[] = [];
  chars.forEach((ch, index) => {
    for (const f of Array.from(searchKey(ch))) {
      folded.push(f);
      owner.push(index);
    }
  });
  const haystack = folded.join("");
  const parts: HighlightPart[] = [];
  let cursor = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    const start = owner[at];
    const end = owner[at + needle.length - 1] + 1;
    if (start > cursor) parts.push({ text: chars.slice(cursor, start).join(""), match: false });
    parts.push({ text: chars.slice(start, end).join(""), match: true });
    cursor = end;
    from = at + needle.length;
  }
  if (cursor < chars.length) parts.push({ text: chars.slice(cursor).join(""), match: false });
  return parts;
}
