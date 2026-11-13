// ZtoDataTable'ın saf mantığı: DataTables 1.10.20 (+ dataTables.bootstrap4) davranışının birebir karşılığı.
// Sayfalama algoritması, "_START_ - _END_" bilgisi, akıllı arama, "dom" ayrıştırıcısı ve sıralama burada;
// bileşen yalnız çizer.
import type { RowData } from "@tanstack/react-table";
import { cellText, toExportCell, type ExportCell } from "../export/cells";
import { formatDate, formatDateTime, formatN2 } from "../format";
import { searchKey } from "../searchKey";

// Sütun meta alanları (columnDef.meta). DataTables "columns" seçeneklerinin karşılığı.
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** th ve td sınıfı (DataTables columns.className). */
    className?: string;
    /** Yalnız th'ye eklenen sınıf. */
    headerClassName?: string;
    /** Arama dışı bırakmak için false (DataTables columns.searchable). */
    searchable?: boolean;
    /**
     * Arama metni; verilmezse dışa aktarım değeri ya da hücre değeri searchTextOf ile metne çevrilir:
     * sayılar hem ham hem N2 tr-TR ("1.250,5 1.250,50"), ISO tarih dizgeleri gg.aa.yyyy olarak da aranır.
     */
    searchValue?: (value: TValue, row: TData) => string;
    /** Dışa aktarım dışı bırakmak için false. */
    exportable?: boolean;
    /** Başlık JSX ise dışa aktarım ve aria-label metni. */
    exportHeader?: string;
    /**
     * Dışa aktarılacak değer (Excel'de sayı sayı olarak kalır); verilmezse hücre değeri. Sayı sütunları
     * biçimli metin değil ham sayı döndürmeli.
     */
    exportValue?: (row: TData) => ExportCell;
  }
}

// ---------------------------------------------------------------------------------------------
// "dom" seçeneği
// ---------------------------------------------------------------------------------------------

/** DataTables özellik harfleri: l uzunluk, f arama, r işleniyor, t tablo, i bilgi, p sayfalama, B düğmeler. */
export type DomFeature = "l" | "f" | "r" | "t" | "i" | "p" | "B";

export type DomNode =
  | { kind: "container"; className?: string; id?: string; children: DomNode[] }
  | { kind: "feature"; feature: DomFeature };

const FEATURES = new Set<string>(["l", "f", "r", "t", "i", "p", "B"]);

/** dataTables.bootstrap4.js'in varsayılan "dom" değeri (ZTO'da dom verilmeyen tablolar). */
export const BOOTSTRAP4_DOM =
  "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>>" +
  "<'row'<'col-sm-12'tr>>" +
  "<'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>";

/** ZTO görünümlerinde kullanılan "dom" değerleri. */
export const ZTO_DOM = {
  /** dom verilmeyen tablolar (dataTables.bootstrap4 varsayılanı). */
  bootstrap4: BOOTSTRAP4_DOM,
  /** DataTables çekirdek varsayılanı. */
  core: "lfrtip",
  /** Düğmeli listelerin çoğu (ör. Lines/Index, MaterialStockAll). */
  buttons: "Bfrtip",
  /** Masraf listeleri (ProductionExpenses/IndexExpenses, SalesTruckExpenses, AccountCredits). */
  lengthButtonsFilter: '<"row"<"col-sm-2"l><"col-sm-4"B><"col-sm-6 text-right"f>>rtip',
  /** Banka/kasa, çek, ödeme ve tahsilat listeleri (BankTransactions/Index, Checks/Checks). */
  finance:
    '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
} as const;

/**
 * DataTables _fnAddOptionsHtml ayrıştırıcısının karşılığı. `<"sınıf"` / `<"#kimlik"` /
 * `<"#kimlik.sınıf"` kapsayıcı açar, `>` kapatır; tanınmayan karakterler yok sayılır.
 */
export function parseDom(dom: string): DomNode[] {
  const root: DomNode = { kind: "container", children: [] };
  const stack: Array<Extract<DomNode, { kind: "container" }>> = [root];
  const chars = dom.split("");
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const current = stack[stack.length - 1];
    if (c === "<") {
      const node: Extract<DomNode, { kind: "container" }> = { kind: "container", children: [] };
      const next = chars[i + 1];
      if (next === "'" || next === '"') {
        let attr = "";
        let j = 2;
        while (i + j < chars.length && chars[i + j] !== next) {
          attr += chars[i + j];
          j++;
        }
        if (attr.indexOf(".") !== -1) {
          // DataTables yalnız ilk noktaya kadar kimlik, ikinci parçayı sınıf alır.
          const parts = attr.split(".");
          node.id = parts[0].substring(1) || undefined;
          node.className = parts[1] || undefined;
        } else if (attr.charAt(0) === "#") {
          node.id = attr.substring(1) || undefined;
        } else if (attr) {
          node.className = attr;
        }
        i += j;
      }
      current.children.push(node);
      stack.push(node);
    } else if (c === ">") {
      if (stack.length > 1) stack.pop();
    } else if (FEATURES.has(c)) {
      current.children.push({ kind: "feature", feature: c as DomFeature });
    }
  }
  return root.children;
}

// ---------------------------------------------------------------------------------------------
// Sayfalama
// ---------------------------------------------------------------------------------------------

export type PagingType =
  "simple" | "simple_numbers" | "full" | "full_numbers" | "numbers" | "first_last_numbers";

export type PageButton = "first" | "previous" | "next" | "last" | "ellipsis" | number;

/** DataTables ext.pager.numbers_length. */
export const NUMBERS_LENGTH = 7;

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

/** DataTables _numbers(page, pages): sayfa numaraları ve üç nokta (sayfalar 0 tabanlı). */
export function pagingNumbers(
  page: number,
  pages: number,
  buttons: number = NUMBERS_LENGTH,
): Array<number | "ellipsis"> {
  const half = Math.floor(buttons / 2);
  if (pages <= buttons) return range(0, pages);
  if (page <= half) return [...range(0, buttons - 2), "ellipsis", pages - 1];
  if (page >= pages - 1 - half) return [0, "ellipsis", ...range(pages - (buttons - 2), pages)];
  return [0, "ellipsis", ...range(page - half + 2, page + half - 1), "ellipsis", pages - 1];
}

/** DataTables ext.pager[type] sonucunun düzleştirilmiş hali. */
export function pagingButtons(type: PagingType, page: number, pages: number): PageButton[] {
  const numbers = () => pagingNumbers(page, pages);
  switch (type) {
    case "simple":
      return ["previous", "next"];
    case "full":
      return ["first", "previous", "next", "last"];
    case "numbers":
      return numbers();
    case "full_numbers":
      return ["first", "previous", ...numbers(), "next", "last"];
    case "first_last_numbers":
      return ["first", ...numbers(), "last"];
    case "simple_numbers":
    default:
      return ["previous", ...numbers(), "next"];
  }
}

export interface PageButtonView {
  /** React anahtarı (üç nokta iki kez çıkabilir). */
  key: string;
  button: PageButton;
  /** li sınıfı: "paginate_button page-item previous disabled" vb. */
  className: string;
  disabled: boolean;
  active: boolean;
  /** Tıklanınca gidilecek sayfa (0 tabanlı); devre dışı ya da etkin düğmede null. */
  target: number | null;
}

/** dataTables.bootstrap4 pageButton.bootstrap renderer'ının sınıf ve hedef hesabı. */
export function pageButtonViews(type: PagingType, page: number, pages: number): PageButtonView[] {
  return pagingButtons(type, page, pages).map((button, index) => {
    let cls: string;
    let disabled = false;
    let active = false;
    let target: number | null = null;
    switch (button) {
      case "ellipsis":
        cls = "disabled";
        disabled = true;
        break;
      case "first":
      case "previous":
        disabled = !(page > 0);
        cls = button + (disabled ? " disabled" : "");
        target = disabled ? null : button === "first" ? 0 : page - 1;
        break;
      case "next":
      case "last":
        disabled = !(page < pages - 1);
        cls = button + (disabled ? " disabled" : "");
        target = disabled ? null : button === "last" ? pages - 1 : page + 1;
        break;
      default:
        active = page === button;
        cls = active ? "active" : "";
        target = active ? null : button;
    }
    return {
      key: `${typeof button === "number" ? "n" : button}-${index}`,
      button,
      className: `paginate_button page-item ${cls}`.trim(),
      disabled,
      active,
      target,
    };
  });
}

export interface PageInfo {
  /** Geçerli sayfa (0 tabanlı). */
  page: number;
  /** Sayfa sayısı (kayıt yoksa 0; "Tümü" seçiliyse 1). */
  pages: number;
  /** Gösterilen ilk kaydın 0 tabanlı indeksi. */
  start: number;
  /** Gösterilen son kaydın bir sonrası (fnDisplayEnd). */
  end: number;
}

/** DataTables fnUpdate (pager) ve fnDisplayEnd hesapları. length -1: tümü. */
export function pageInfo(start: number, length: number, total: number): PageInfo {
  const all = length === -1;
  return {
    page: all ? 0 : Math.ceil(start / length),
    pages: all ? 1 : Math.ceil(total / length),
    start,
    end: all ? total : Math.min(start + length, total),
  };
}

/** Sayfa uzunluğu değişince başlangıç (DataTables _fnLengthOverflow). */
export function startAfterLengthChange(start: number, newLength: number, total: number): number {
  if (newLength === -1) return 0;
  let s = start;
  const end = Math.min(s + newLength, total);
  if (s >= end) s = end - newLength;
  s -= s % newLength;
  return s < 0 ? 0 : s;
}

/** Veri azalınca (silme, yeniden yükleme) başlangıcı son sayfaya çeker. */
export function clampStart(start: number, length: number, total: number): number {
  if (length === -1 || total <= 0) return 0;
  if (start < total) return start;
  return Math.max(0, (Math.ceil(total / length) - 1) * length);
}

// ---------------------------------------------------------------------------------------------
// Bilgi metni
// ---------------------------------------------------------------------------------------------

/** DataTables fnFormatNumber: binlik ayırıcı "." (tr.json "thousands"). */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface InfoParts {
  /** "info" ya da "infoEmpty" (table.* anahtarı). */
  key: "info" | "infoEmpty";
  /** Arama süzdüyse "infoFiltered" eklenir. */
  filtered: boolean;
  values: { start: string; end: string; total: string; max: string };
}

/**
 * DataTables _fnUpdateInfo: total = süzülmüş kayıt sayısı, max = tüm kayıt sayısı.
 * start/end PageInfo'dan (0 tabanlı start, end hariç).
 */
export function infoParts(start: number, end: number, total: number, max: number): InfoParts {
  return {
    key: total ? "info" : "infoEmpty",
    filtered: total !== max,
    values: {
      start: formatCount(start + 1),
      end: formatCount(end),
      total: formatCount(total),
      max: formatCount(max),
    },
  };
}

export type Translate = (key: string, values?: Record<string, string>) => string;

/** Bilgi satırı metni; t "ztoFinans:table.*" anahtarlarını çözer (ad alanı önekli). */
export function infoText(parts: InfoParts, t: Translate): string {
  let out = t(`ztoFinans:table.${parts.key}`, parts.values);
  if (parts.filtered) out += " " + t("ztoFinans:table.infoFiltered", parts.values);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Arama
// ---------------------------------------------------------------------------------------------

/**
 * Arama katlaması: aksan ve büyük/küçük harf duyarsız (select2 searchKey ile aynı). DataTables /…/i ile
 * arar ("isparta" ↔ "ISPARTA"); tr-TR küçük harf (I→ı) bunu bozardı. ZtoSelect'te bulunan kayıt tabloda
 * da bulunur.
 */
export const searchFold = searchKey;

/**
 * DataTables "akıllı arama" (_fnFilterCreateSearch, smart=true, regex=false): boşlukla ayrılan her
 * sözcük satırda bir yerde geçmeli; "tırnaklı ifade" tek sözcük sayılır. Sonuç searchFold ile katlanmış.
 */
export function smartSearchTerms(query: string): string[] {
  const words = query.match(/"[^"]+"|[^ ]+/g) ?? [];
  return words
    .map((word) => {
      let w = word;
      if (w.charAt(0) === '"') {
        const m = w.match(/^"(.*)"$/);
        w = m ? m[1] : w;
      }
      return searchFold(w.replace('"', ""));
    })
    .filter((w) => w.length > 0);
}

/** Satır arama metni sözcüklerin hepsini içeriyor mu (terms smartSearchTerms çıktısı). */
export function matchesSearch(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const text = searchFold(haystack.replace(/[\r\n]/g, " "));
  return terms.every((term) => text.includes(term));
}

/** Arama için hücre değerinin metni (sayı/tarih tr-TR görünümünde; nesneler boş). */
export function valueText(value: unknown): string {
  return cellText(toExportCell(value));
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(T|$)/;

/**
 * Görünen metinle aranabilsin diye hücre değerinin arama metni (ZTO'da DataTables Razor'un ürettiği
 * hücre metninde arar). Sonlu sayı: ham tr-TR + N2 ("1.250,5 1.250,50"); Date: gg.aa.yyyy [SS:dd];
 * ISO tarih dizgesi: kendisi + gg.aa.yyyy (saat varsa gg.aa.yyyy SS:dd); diğerleri valueText.
 */
export function searchTextOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const raw = valueText(value);
    const n2 = formatN2(value);
    return raw === n2 ? raw : `${raw} ${n2}`;
  }
  if (typeof value === "string" && ISO_DATE_PREFIX.test(value)) {
    const shown = value.length > 10 ? formatDateTime(value) : formatDate(value);
    return shown ? `${value} ${shown}` : value;
  }
  return valueText(value);
}

/** Bir satırın arama metni: DataTables sütun değerlerini iki boşlukla birleştirir. */
export function rowSearchText(values: unknown[]): string {
  return values.map(searchTextOf).join("  ");
}

// ---------------------------------------------------------------------------------------------
// Sıralama
// ---------------------------------------------------------------------------------------------

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Artan sıralama karşılaştırması: boş değerler en başta (DataTables'ta boş metin en küçüktür),
 * sayı ve tarih sayısal, metinler Türkçe harf sırasıyla ("ç" "c"den, "ı" "i"den önce).
 */
export function compareValues(a: unknown, b: unknown): number {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea === eb ? 0 : ea ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(valueText(a), valueText(b));
}

// ---------------------------------------------------------------------------------------------
// Durum ve sunucu taraflı istek
// ---------------------------------------------------------------------------------------------

export interface SortItem {
  id: string;
  desc: boolean;
}

/** Tablonun durum bilgisi (sunucu taraflı modda onStateChange ile bildirilir). */
export interface DataTableState {
  /** Gösterilen ilk kaydın 0 tabanlı indeksi. */
  start: number;
  /** Sayfa uzunluğu; -1 tümü. */
  length: number;
  /** Uygulanmış arama metni. */
  search: string;
  sorting: SortItem[];
}

export interface PageRequest {
  page: number;
  size: number;
  /** Spring Data biçimi: "alan,asc" / "alan,desc". */
  sort: string[];
  search: string;
}

/** Durumu Blackrose Page<T> uçlarının sorgusuna çevirir; -1 (tümü) maxSize olur. */
export function toPageRequest(state: DataTableState, maxSize = 1000): PageRequest {
  const all = state.length === -1;
  const size = all ? maxSize : state.length;
  return {
    page: all ? 0 : Math.floor(state.start / state.length),
    size,
    sort: state.sorting.map((s) => `${s.id},${s.desc ? "desc" : "asc"}`),
    search: state.search.trim(),
  };
}

/** PageRequest'i URL sorgu metnine çevirir (boş arama ve sıralama eklenmez). */
export function pageRequestQuery(request: PageRequest, searchParam = "q"): string {
  const params = new URLSearchParams();
  params.set("page", String(request.page));
  params.set("size", String(request.size));
  for (const s of request.sort) params.append("sort", s);
  if (request.search) params.set(searchParam, request.search);
  return params.toString();
}

/** Dışa aktarılacak sütunlar: ':not(:last-child)' seçeneği son sütunu, exportable=false olanları atar. */
export function pickExportColumns<C>(
  columns: C[],
  excludeLast: boolean,
  isExportable: (column: C) => boolean,
): C[] {
  const list = excludeLast ? columns.slice(0, -1) : columns;
  return list.filter(isExportable);
}

/** Sütun başlığının düz metni: exportHeader > dize başlık > sütun kimliği. */
export function headerText(header: unknown, exportHeader: string | undefined, id: string): string {
  if (exportHeader !== undefined) return exportHeader;
  if (typeof header === "string") return header;
  return id;
}

/** ColumnDef'in yapısal alt kümesi (TanStack'e bağımlı olmadan kimlik ve sıralama hesabı için). */
export interface ColumnDefLike {
  id?: string;
  accessorKey?: unknown;
  accessorFn?: unknown;
  header?: unknown;
  enableSorting?: boolean;
  columns?: ColumnDefLike[];
}

/** TanStack'in sütun kimliği kuralı: id > accessorKey ("." → "_") > dize başlık. */
export function columnDefId(def: ColumnDefLike): string | undefined {
  if (def.id) return def.id;
  if (typeof def.accessorKey === "string") return def.accessorKey.replace(/\./g, "_");
  return typeof def.header === "string" ? def.header : undefined;
}

/**
 * DataTables varsayılan "order: [[0, 'asc']]": ilk yaprak sütun artan. İlk sütun sıralanamıyorsa
 * (erişimcisi yok ya da enableSorting=false) sıralama yok.
 */
export function defaultOrder(defs: ColumnDefLike[]): SortItem[] {
  let first: ColumnDefLike | undefined = defs[0];
  while (first?.columns?.length) first = first.columns[0];
  if (!first || first.enableSorting === false) return [];
  if (first.accessorKey === undefined && first.accessorFn === undefined) return [];
  const id = columnDefId(first);
  return id ? [{ id, desc: false }] : [];
}
