/*
 * 12.7 takvim tarihi yardımcıları (12.7_TASARIM §5.0 "Tarih"; MWG `capture-location-agnostic-data`).
 * `invoiceDate`, `dueDate`, `costDate`, `loadingDate` saat dilimsiz takvim tarihidir: `"YYYY-MM-DD"`
 * dizgisi olarak tutulur, karşılaştırılır ve `<input type="date">`'e verilir. `new Date("YYYY-MM-DD")`
 * ile ASLA ayrıştırılmaz (UTC gece yarısı sayılır; UTC'nin batısında bir gün geri kayar). Temporal
 * kullanılmaz (Limited availability; polyfill yeni bağımlılık olur, §5.10). Gün ekleme gibi aritmetik
 * yalnız `Date.UTC` üzerinde yapılır ve sonuç yine UTC parçalarından okunur (dilim dönüşümü yok).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number) => String(value).padStart(2, "0");
const pad4 = (value: number) => String(value).padStart(4, "0");

/** Yıl/ay/gün → `"YYYY-MM-DD"` (ay 1–12). */
export function isoOf(year: number, month: number, day: number): string {
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Kullanıcının yerel takvimindeki bugün (`"YYYY-MM-DD"`); `toISOString` kullanılmaz (UTC kayması). */
export function localToday(now: Date = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Ayın gün sayısı (ay 1–12; Şubat artık yılda 29). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Geçerli bir takvim tarihi mi (`"2026-02-30"` geçersiz). */
export function isIsoDate(value: string | null | undefined): value is string {
  const match = ISO_DATE.exec(value ?? "");
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** Parçalar (geçersizse null). */
export function isoParts(
  value: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/** `"YYYY-MM-DD"` → `"dd.MM.yyyy"` (parçalardan; geçersiz/boş → ""). */
export function formatIsoDate(value: string | null | undefined): string {
  const parts = isoParts(value);
  return parts ? `${pad2(parts.day)}.${pad2(parts.month)}.${pad4(parts.year)}` : "";
}

/** `"YYYY-MM-DD"` karşılaştırması (sözlük sırası = takvim sırası): -1 / 0 / 1. */
export function compareIsoDate(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Gün ekler/çıkarır (UTC parçalarıyla; ay/yıl taşması doğru). Geçersiz girdide RangeError. */
export function addDaysIso(value: string, days: number): string {
  const parts = isoParts(value);
  if (!parts) throw new RangeError(`Geçersiz tarih: ${value}`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Math.trunc(days)));
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Ay anahtarı `"YYYY-MM"` (`ExpenseMonthly.month` ile aynı biçim). */
export function monthKey(year: number, month: number): string {
  return `${pad4(year)}-${pad2(month)}`;
}

/** Ayın ilk ve son günü (`from`/`to` süzgeçleri için). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: isoOf(year, month, 1), to: isoOf(year, month, daysInMonth(year, month)) };
}

/** Ay kaydırma (ay 1–12; yıl taşması doğru). */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + Math.trunc(delta);
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}
