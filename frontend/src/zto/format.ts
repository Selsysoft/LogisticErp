// ZTO ekranlarının tr-TR biçim yardımcıları. ZTO kalıpları: tutar ToString("N2") → "1.234,56",
// para "1.234,56 ₺" (tutar + boşluk + simge), tarih "dd.MM.yyyy", tarih-saat "dd.MM.yyyy HH:mm".
import { formatAmount, normalizeAmount } from "../pages/finance/common";
import type { Money } from "../pages/finance/types";

/** 2–4 basamaklı Blackrose tutar biçimi (kur, miktar); MUI finans ekranlarıyla aynı fonksiyon. */
export { formatAmount };

export type NumericInput = number | string | null | undefined;

const numberFormats = new Map<number, Intl.NumberFormat>();

function numberFormat(digits: number): Intl.NumberFormat {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(digits, format);
  }
  return format;
}

/** API tutarı ("1234.5000") ya da sayı → sonlu sayı; boş/geçersizde null. */
export function toNumber(value: NumericInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

/** Sabit basamaklı tr-TR sayı ("1.234,56"). Boş/geçersizde "". Yuvarlanınca sıfır olan eksi "-0,00" yazılmaz. */
export function formatNumber(value: NumericInput, digits = 2): string {
  const number = toNumber(value);
  if (number === null) {
    return "";
  }
  const safeDigits = Math.min(Math.max(Math.trunc(digits), 0), 20);
  const text = numberFormat(safeDigits).format(number);
  return /^-0(,0+)?$/.test(text) ? text.slice(1) : text;
}

/** ZTO ToString("N2") karşılığı. */
export function formatN2(value: NumericInput): string {
  return formatNumber(value, 2);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: "₺",
  TL: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** Para birimi kodunu ZTO'nun gösterdiği simgeye çevirir (TRY → ₺); bilinmeyen kod olduğu gibi kalır. */
export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency ?? "").trim();
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? code;
}

/** ZTO para gösterimi: "1.234,56 ₺". Para birimi verilmezse TRY. Boş/geçersiz tutarda "". */
export function formatMoney(amount: NumericInput, currency: string | null = "TRY"): string {
  const text = formatN2(amount);
  if (!text) {
    return "";
  }
  const symbol = currencySymbol(currency);
  return symbol ? `${text} ${symbol}` : text;
}

/** API'nin Money nesnesi ({amount, currency}) için formatMoney. */
export function formatMoneyValue(money: Money | null | undefined): string {
  return money ? formatMoney(money.amount, money.currency) : "";
}

// tr-TR sayı dilbilgisi: isteğe bağlı işaret, üçlü gruplu ya da grupsuz tam kısım, virgülle ondalık.
const TR_NUMBER = /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/**
 * "1.234,56" → 1234.56. Nokta yalnız binlik ayırıcı, virgül ondalıktır; "12.5" gibi tr-TR'de geçersiz
 * yazım ve boş giriş null döner. Sayı verilirse sonluysa olduğu gibi döner.
 */
export function parseTrNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const compact = value.replace(/[\s\u00a0\u202f]/g, "");
  if (!TR_NUMBER.test(compact)) {
    return null;
  }
  // Binlik noktalar atılır; virgülü noktaya çevirmek MUI finans ekranlarının normalizeAmount'u.
  return Number(normalizeAmount(compact.replace(/\./g, "")));
}

export type DateInput = string | Date | null | undefined;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// "gg.aa.yyyy" ve "gg.aa.yyyy SS:dd" (new Date bunu ABD sırasıyla okur; gün ile ay yer değiştirirdi).
const TR_DATE_TIME = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
const ISO_DATE_TIME_PREFIX = /^\d{4}-\d{2}-\d{2}[T ]/;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Tarih-yalnız ISO dizgesi ("2026-03-01") saat dilimi kaydırılmadan parçalarına ayrılır (new Date
 * onu UTC gece yarısı sayar; UTC-x'te bir önceki güne kayar). "gg.aa.yyyy [SS:dd]" elle ayrıştırılır.
 * Yalnız ISO tarih-saat dizgesi ve Date yerel saatle okunur; yerel ayara bağlı diğer biçimler geçersiz.
 */
function dateParts(value: DateInput): DateParts | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const iso = ISO_DATE.exec(trimmed);
    if (iso) {
      const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
      return validCalendarDate(year, month, day)
        ? { year, month, day, hours: 0, minutes: 0 }
        : null;
    }
    const tr = TR_DATE_TIME.exec(trimmed);
    if (tr) {
      const [day, month, year] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
      const hours = tr[4] ? Number(tr[4]) : 0;
      const minutes = tr[5] ? Number(tr[5]) : 0;
      return validCalendarDate(year, month, day) && hours < 24 && minutes < 60
        ? { year, month, day, hours, minutes }
        : null;
    }
    if (!ISO_DATE_TIME_PREFIX.test(trimmed)) {
      return null;
    }
  }
  const date = typeof value === "string" ? new Date(value.trim()) : value;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** "dd.MM.yyyy". Boş/geçersizde "". */
export function formatDate(value: DateInput): string {
  const parts = dateParts(value);
  return parts ? `${pad(parts.day)}.${pad(parts.month)}.${pad(parts.year, 4)}` : "";
}

/** "dd.MM.yyyy HH:mm" (24 saat). Tarih-yalnız girişte saat 00:00. Boş/geçersizde "". */
export function formatDateTime(value: DateInput): string {
  const parts = dateParts(value);
  return parts
    ? `${pad(parts.day)}.${pad(parts.month)}.${pad(parts.year, 4)} ${pad(parts.hours)}:${pad(parts.minutes)}`
    : "";
}

/**
 * API'nin beklediği "yyyy-MM-dd". Date yerel takvim gününe göre (toISOString'in UTC kayması yok);
 * "dd.MM.yyyy [HH:mm]", ISO tarih ve ISO tarih-saat dizgeleri de kabul edilir. Geçersizde null.
 */
export function toIsoDate(value: DateInput): string | null {
  const parts = dateParts(value);
  return parts ? `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}` : null;
}
