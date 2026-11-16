/*
 * Kartlı hızlı filtre saf mantığı (ZTO wwwroot/js/stat-filter.js `_internals` birebir; 12.8_TASARIM
 * §5.5 `ZtoStatFilterCards`). FinanceReport liste kipi ZTO'da `ztStatFilter.init({ items, multi: true })`
 * çağırır: kart içindeki seçili değerler VEYA, farklı kartlar VE ile birleşir. Bir değerin sayısı diğer
 * kartların seçimleri geçerliyken o değeri taşıyan kayıt sayısıdır (kartın kendi seçimi ve arama kutusu
 * sayılmaz). Sayısı sıfıra inen değer soluklaşır, seçilemez; çoklu kipte seçimden düşer.
 */

/** Boş değer kovası ("Seçim yok" = anahtarın seçimde hiç olmaması). */
export const BLANK = "";

/** Kart başına seçili değerler (tıklama sırasıyla); boş dizi tutulmaz. */
export type StatActive = Readonly<Record<string, readonly string[]>>;

/** Kayıt: kart anahtarı → değer. */
export type StatRow = Readonly<Record<string, string | null | undefined>>;

/** Her kart için değer → kayıt sayısı. */
export type StatCounts = Record<string, Record<string, number>>;

/** Nitelik değerini karşılaştırılabilir yapar: ardışık boşlukları teke indirir, kırpar. */
export function cleanValue(raw: string | null | undefined): string {
  return raw === null || raw === undefined ? BLANK : String(raw).replace(/\s+/g, " ").trim();
}

function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Değer kartın seçimini geçiyor mu (çoklu kip: kart içi VEYA). */
export function passes(value: string, selected: readonly string[]): boolean {
  return selected.indexOf(value) >= 0;
}

/** Kaydın temizlenmiş kart değerleri. */
export function rowValues(row: StatRow, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) values[key] = cleanValue(row[key]);
  return values;
}

/** Kayıt bütün seçimleri geçiyor mu (kartlar arası VE). Kartta olmayan anahtar yok sayılmaz. */
export function matches(row: Readonly<Record<string, string>>, active: StatActive): boolean {
  for (const key of Object.keys(active)) {
    if (!passes(row[key] ?? BLANK, active[key])) return false;
  }
  return true;
}

/**
 * Fasetli sayılar: bir kartın sayıları o kartın kendi seçimini yok sayar, diğerlerini uygular. İki ya
 * da daha fazla seçimi geçemeyen kayıt hiçbir kartta sayılmaz; tek seçimi geçemeyen kayıt yalnız o
 * seçimin kartında sayılır (stat-filter.js `facetCounts`).
 */
export function facetCounts(
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  keys: readonly string[],
  active: StatActive,
): StatCounts {
  const counts: StatCounts = {};
  for (const key of keys) counts[key] = {};
  for (const row of rows) {
    let failed: string | null = null;
    let failures = 0;
    for (const key of Object.keys(active)) {
      if (!passes(row[key] ?? BLANK, active[key])) {
        failures++;
        failed = key;
        if (failures > 1) break;
      }
    }
    if (failures > 1) continue;
    for (const key of keys) {
      if (failures === 1 && failed !== key) continue;
      const value = row[key] ?? BLANK;
      counts[key][value] = (counts[key][value] ?? 0) + 1;
    }
  }
  return counts;
}

const collator = new Intl.Collator("tr");
const numericCollator = new Intl.Collator("tr", { numeric: true });

/**
 * Kart içi sıra: çoktan aza, eşitlikte Türkçe alfabetik; `value-desc` ise değerin kendisine göre
 * azalan. Boş kova her durumda en sonda. Kurulumda bir kez sıralanır (sayılar değiştikçe yer değişmez).
 */
export function orderValues(countMap: Readonly<Record<string, number>>, order = ""): string[] {
  return Object.keys(countMap).sort((a, b) => {
    if (a === b) return 0;
    if (a === BLANK) return 1;
    if (b === BLANK) return -1;
    if (order === "value-desc") return numericCollator.compare(b, a);
    return countMap[b] - countMap[a] || collator.compare(a, b);
  });
}

/**
 * Sayısı kalmayan seçimleri bırakır (`counts[anahtar][değer] > 0` kalır); dizi boşalırsa anahtar
 * düşer. `except` anahtarının seçimine dokunulmaz.
 */
export function pruneActive(active: StatActive, counts: StatCounts, except?: string): StatActive {
  const kept: Record<string, readonly string[]> = {};
  for (const key of Object.keys(active)) {
    const selected = active[key];
    if (key === except) {
      kept[key] = selected.slice();
      continue;
    }
    const card = counts[key];
    const values = card ? selected.filter((value) => (card[value] ?? 0) > 0) : [];
    if (values.length > 0) kept[key] = values;
  }
  return kept;
}

/** Değeri anahtarın seçim kümesine ekler ya da (seçiliyse) çıkarır; yeni seçim döner. */
export function toggleMember(active: StatActive, key: string, value: string): StatActive {
  const next: Record<string, readonly string[]> = { ...active };
  const list = has(next, key) ? [...next[key]] : [];
  const at = list.indexOf(value);
  if (at >= 0) list.splice(at, 1);
  else list.push(value);
  if (list.length > 0) next[key] = list;
  else delete next[key];
  return next;
}

/**
 * Çoklu kip tıklaması (stat-filter.js `toggleMulti`): değer eklenir/çıkarılır, sonra DİĞER kartların
 * seçiminden yeni seçim altında sayısı sıfıra inen değerler bırakılır. Kartta olmayan anahtar yok sayılır.
 */
export function toggleMulti(
  active: StatActive,
  key: string,
  value: string,
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  keys: readonly string[],
): StatActive {
  if (!keys.includes(key)) return active;
  const next = toggleMember(active, key, cleanValue(value));
  return pruneActive(next, facetCounts(rows, keys, next), key);
}

/**
 * Veri değişince (yeniden kurulum, stat-filter.js `rebuild`): değeri artık olmayan seçimler, ardından
 * çoklu kipte diğer kartların seçimiyle sayısı sıfıra inen değerler düşer.
 */
export function rebuildActive(
  active: StatActive,
  rows: ReadonlyArray<Readonly<Record<string, string>>>,
  keys: readonly string[],
): StatActive {
  const kept = pruneActive(active, facetCounts(rows, keys, {}));
  return pruneActive(kept, facetCounts(rows, keys, kept));
}

/** Seçim var mı (kapsayıcı `is-filtered`, alt şerit sonuç metni). */
export function isFiltered(active: StatActive): boolean {
  return Object.keys(active).length > 0;
}

/** "{0} / {1} satır" biçimini doldurur. */
export function formatResult(template: string, shown: number, total: number): string {
  return String(template || "{0} / {1}")
    .split("{0}")
    .join(String(shown))
    .split("{1}")
    .join(String(total));
}

export type StatItemView = {
  value: string;
  /** Görünen etiket (boş kovada `emptyLabel`). */
  label: string;
  count: number;
  selected: boolean;
  /** Sayı 0 ve seçili değil: soluk, seçilemez (`stat-item-empty`, `aria-disabled`, tabindex −1). */
  empty: boolean;
  blank: boolean;
};

/**
 * Kartın çizilecek öğeleri: sıra kurulum sayılarından (`order`), sayılar güncel seçim altındaki fasetli
 * sayılardan. Boş kova yalnız `emptyLabel` verilmişse listelenir.
 */
export function cardItems(
  key: string,
  order: readonly string[],
  counts: StatCounts,
  active: StatActive,
  emptyLabel: string,
): StatItemView[] {
  return order
    .filter((value) => value !== BLANK || emptyLabel !== "")
    .map((value) => {
      const selected = has(active, key) && passes(value, active[key]);
      const count = counts[key]?.[value] ?? 0;
      return {
        value,
        label: value === BLANK ? emptyLabel : value,
        count,
        selected,
        empty: count === 0 && !selected,
        blank: value === BLANK,
      };
    });
}
