import type {
  ExpenseCalendar,
  ExpenseCalendarEntry,
  ExpenseCurrencyTotal,
  ExpenseMonthly,
} from "../../../../pages/finance/types";
import { toNumber } from "../../../format";
import { daysInMonth, isoOf, isoParts, monthKey, shiftMonth } from "./expenseDates";
import { mergeCurrencyTotals } from "./expenseListLogic";

/*
 * Genel Masraf takvimi (PEI) saf mantığı (12.7_TASARIM §5.5). Tarihler yalnız "YYYY-MM-DD" dizgisidir
 * (MWG capture-location-agnostic-data): ZTO'nun UTC+3 kaydırma hileleri yerine haftanın günü
 * `Date.UTC` ile hesaplanır, yerel saat dilimi sonuca girmez.
 */

export const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** Pazartesi başlangıçlı gün başlıkları. */
export const WEEKDAY_HEADERS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"] as const;

export type CalendarCell =
  | { kind: "blank"; key: string }
  | { kind: "day"; key: string; iso: string; day: number; weekend: boolean };

/** 0 = Pazartesi … 6 = Pazar (saat diliminden bağımsız). */
export function weekdayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Ay ızgarası: ayın ilk gününe kadar boş hücreler (Pazartesi başlangıcı), ardından ayın günleri.
 * Son haftanın kalanı ZTO'daki gibi boş bırakılmaz (hücre çizilmez).
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const leading = weekdayIndex(year, month, 1);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < leading; i += 1) cells.push({ kind: "blank", key: `b${i}` });
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const weekday = weekdayIndex(year, month, day);
    cells.push({
      kind: "day",
      key: `d${day}`,
      iso: isoOf(year, month, day),
      day,
      weekend: weekday >= 5,
    });
  }
  return cells;
}

/** "Kasım 2026". */
export function monthTitle(year: number, month: number): string {
  return `${TR_MONTHS[month - 1]} ${year}`;
}

/** "16 Kasım 2026" (ZTO `toLocaleDateString('tr-TR', {day, month:'long', year})`). */
export function longDate(iso: string): string {
  const parts = isoParts(iso);
  return parts ? `${parts.day} ${TR_MONTHS[parts.month - 1]} ${parts.year}` : "";
}

/** Yıl seçenekleri: bugünün yılı ±5 (ZTO). */
export function yearOptions(currentYear: number): number[] {
  return Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);
}

/** Gün → kayıtlar. */
export function entriesByDay(
  calendar: ExpenseCalendar | undefined,
): Map<string, ExpenseCalendarEntry[]> {
  const map = new Map<string, ExpenseCalendarEntry[]>();
  for (const day of calendar?.days ?? []) {
    if (day.expenses.length > 0) map.set(day.date, day.expenses);
  }
  return map;
}

export type CalendarGroup = {
  key: string;
  expenseTypeName: string;
  expenseItemName: string;
  entries: ExpenseCalendarEntry[];
  totals: ExpenseCurrencyTotal[];
};

/** Günün kayıtları "Tür - Kategori" kartlarına (ZTO category-card2), sıra korunur. */
export function groupDayEntries(entries: readonly ExpenseCalendarEntry[]): CalendarGroup[] {
  const groups = new Map<string, CalendarGroup>();
  for (const entry of entries) {
    const key = `${entry.expenseTypeName}-${entry.expenseItemId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        expenseTypeName: entry.expenseTypeName ?? "-",
        expenseItemName: entry.expenseItemName ?? "-",
        entries: [],
        totals: [],
      };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  for (const group of groups.values()) group.totals = entryTotals(group.entries);
  return [...groups.values()];
}

/** Kayıtların para birimi kırılımlı toplamı. */
export function entryTotals(entries: readonly ExpenseCalendarEntry[]): ExpenseCurrencyTotal[] {
  return mergeCurrencyTotals(
    entries.map((entry) => [
      { currency: entry.currency, count: 1, totalAmount: entry.totalAmount },
    ]),
  );
}

/** Son `count` ayın anahtarları ("YYYY-MM"), eskiden yeniye; bugünün ayı dahil. */
export function lastMonthKeys(todayIso: string, count: number): string[] {
  const parts = isoParts(todayIso);
  if (!parts) return [];
  return Array.from({ length: count }, (_, index) => {
    const shifted = shiftMonth(parts.year, parts.month, index - (count - 1));
    return monthKey(shifted.year, shifted.month);
  });
}

/** "2026-11" → "Kasım 2026". */
export function monthKeyLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month >= 1 && month <= 12 ? monthTitle(year, month) : key;
}

export type MonthlySeries = { label: string; data: number[] };

/**
 * Yığılı çubuk verisi: seri = masraf türü, değer = ₺ karşılığı (`tlAmount`). Eksik aylar 0 ile
 * doldurulur; `months` dışındaki aylar atılır. Seri sırası ilk görünüş sırasıdır.
 */
export function fillMonths(
  rows: readonly ExpenseMonthly[],
  months: readonly string[],
): { labels: string[]; series: MonthlySeries[] } {
  const index = new Map(months.map((month, position) => [month, position]));
  const series = new Map<string, MonthlySeries>();
  for (const row of rows) {
    const position = index.get(row.month);
    if (position === undefined) continue;
    const typeKey = row.expenseTypeId ?? "";
    let entry = series.get(typeKey);
    if (!entry) {
      entry = { label: row.expenseTypeName ?? "-", data: months.map(() => 0) };
      series.set(typeKey, entry);
    }
    entry.data[position] += toNumber(row.tlAmount) ?? 0;
  }
  return { labels: months.map(monthKeyLabel), series: [...series.values()] };
}

/** ZTO grafik renkleri (Index.cshtml getColor). */
export const CHART_COLORS = [
  "#5b86e5",
  "#11998e",
  "#f6c453",
  "#e74c3c",
  "#7c3aed",
  "#36d1dc",
  "#fd7e14",
] as const;

/** Gün hücresi ekran okuyucu etiketi: "16 Kasım 2026, 2 kayıt". */
export function dayAriaLabel(iso: string, count: number): string {
  return `${longDate(iso)}, ${count} kayıt`;
}
