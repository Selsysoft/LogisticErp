/*
 * ZtoRcpTable saf mantığı (12.8 §5.3a; ZTO wwwroot/js/recipe-table.js `rcpDtPaint`). Arama satırın
 * metninde (ZTO `textContent.toLowerCase().indexOf(q)`), sayfa boyutu 10/25/50/Tümü (0), numaralı
 * sayfalama penceresi 1, son ve etkin ±2 (aralarda "…").
 */

/** ZTO "Sayfada göster" seçenekleri; 0 = Tümü. */
export const RCP_PAGE_SIZES = [10, 25, 50, 0] as const;
export type RcpPageSize = (typeof RCP_PAGE_SIZES)[number];

/** Arama için küçük harf (ZTO `toLowerCase`; Türkçe İ/ı yerel kuralıyla). */
export function normalizeRcpQuery(value: string): string {
  return value.toLocaleLowerCase("tr");
}

/** Metni aramayı içeren satırlar (boş arama → hepsi; sıra korunur). */
export function filterRows<T extends { text: string }>(rows: readonly T[], query: string): T[] {
  const q = normalizeRcpQuery(query);
  if (q === "") return [...rows];
  return rows.filter((row) => normalizeRcpQuery(row.text).includes(q));
}

/** Etkin sayfa boyutu: Tümü (0) → toplam (boşsa 1). */
export function effectiveSize(total: number, size: number): number {
  return size > 0 ? size : total || 1;
}

/** Sayfa sayısı (en az 1). */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / effectiveSize(total, size)));
}

/** Sayfayı 1…pages aralığına sıkıştırır (ZTO: `page > pages` → son sayfa). */
export function clampPage(page: number, pages: number): number {
  const last = Math.max(1, Math.trunc(pages));
  if (!Number.isFinite(page)) return 1;
  return Math.min(last, Math.max(1, Math.trunc(page)));
}

/** Sayfadaki satırlar. */
export function pageRows<T>(rows: readonly T[], page: number, size: number): T[] {
  const per = effectiveSize(rows.length, size);
  const start = (clampPage(page, pageCount(rows.length, size)) - 1) * per;
  return rows.slice(start, start + per);
}

/** "Toplam n kayıttan a-b arası" aralığı (1 tabanlı; boşta 0-0). */
export function infoRange(
  total: number,
  page: number,
  size: number,
): { start: number; end: number } {
  if (total <= 0) return { start: 0, end: 0 };
  const per = effectiveSize(total, size);
  const begin = (clampPage(page, pageCount(total, size)) - 1) * per;
  return { start: Math.min(begin + 1, total), end: Math.min(begin + per, total) };
}

/** Numaralı sayfa penceresi: 1, son ve etkin ±2; aralıktaki boşluklar "dots". */
export type RcpPageItem = number | "dots";

export function pageWindow(page: number, pages: number): RcpPageItem[] {
  const active = clampPage(page, pages);
  const out: RcpPageItem[] = [];
  let last = 0;
  for (let p = 1; p <= pages; p++) {
    if (p !== 1 && p !== pages && Math.abs(p - active) > 2) continue;
    if (last && p - last > 1) out.push("dots");
    out.push(p);
    last = p;
  }
  return out;
}

/** Sayfa boyutu seçimi (select değeri metin): geçersizde 10. */
export function parsePageSize(value: string): RcpPageSize {
  const n = Number(value);
  return (RCP_PAGE_SIZES as readonly number[]).includes(n) ? (n as RcpPageSize) : 10;
}
