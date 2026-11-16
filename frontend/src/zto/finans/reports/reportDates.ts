/*
 * 12.8 rapor tarihi yardımcıları (12.8_TASARIM §5.0 "Tarih"; MWG `capture-location-agnostic-data`,
 * `calculate-event-differentials`). Rapor tarihi, vade ve kur tarihi saat dilimsiz takvim tarihidir:
 * `"YYYY-MM-DD"` dizgisi olarak tutulur ve karşılaştırılır; `new Date("YYYY-MM-DD")` ile ASLA
 * ayrıştırılmaz. Kılavuzun önerdiği Temporal (`PlainDate.until`) Limited availability ve polyfill yeni
 * bağımlılık olacağından (§5.12 madde 4) gün farkı yalnız `Date.UTC(y, m − 1, d)` parçalarından,
 * UTC gece yarıları arasında hesaplanır: yaz saati geçişi ve yerel gece yarısı kayması sonuca girmez.
 * Bugün ve gün ekleme 12.7 `expenseDates.ts` yardımcılarından alınır (tek doğruluk kaynağı).
 */
import {
  addDaysIso,
  compareIsoDate,
  daysInMonth,
  formatIsoDate,
  isIsoDate,
  isoOf,
  isoParts,
  localToday,
} from "../pages/expenses/expenseDates";

export { addDaysIso, compareIsoDate, formatIsoDate, isIsoDate, localToday };

const DAY_MS = 86_400_000;

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Takvim tarihinin UTC gece yarısı (ms); geçersizde null. */
function utcMidnight(value: string | null | undefined): number | null {
  const parts = isoParts(value);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
}

/**
 * `a`'dan `b`'ye gün sayısı (`b − a`; `b` önceyse eksi). ZTO "Kalan Gün" = `daysBetween(bugün, vade)`.
 * Geçersiz tarihte null.
 */
export function daysBetween(a: string, b: string): number | null {
  const from = utcMidnight(a);
  const to = utcMidnight(b);
  if (from === null || to === null) return null;
  return Math.round((to - from) / DAY_MS);
}

/** Ayın son günü (`"2026-02-10"` → `"2026-02-28"`); geçersizde null. */
export function endOfMonthIso(value: string): string | null {
  const parts = isoParts(value);
  return parts ? isoOf(parts.year, parts.month, daysInMonth(parts.year, parts.month)) : null;
}

/** `"YYYY-MM-DD"` → `"dd.MM"` (Nakit Akış hafta etiketi parçası); geçersizde "". */
export function formatDayMonth(value: string | null | undefined): string {
  const parts = isoParts(value);
  return parts ? `${pad2(parts.day)}.${pad2(parts.month)}` : "";
}

/** `"YYYY-MM"` ay anahtarı → `"MM.yyyy"` (vade takvimi etiketi); biçim dışında aynen döner. */
export function formatMonthKey(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${match[2]}.${match[1]}` : value;
}
