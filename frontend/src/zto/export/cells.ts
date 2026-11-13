// Dışa aktarım hücre değerleri: metne çevirme (kopyala/PDF/yazdır) ve Excel değerine çevirme.
import i18next from "i18next";

/** Dışa aktarılan hücre: sayı Excel'de sayı, Date tarih hücresi olur. */
export type ExportCell = string | number | boolean | Date | null | undefined;

export type ExportRow = ExportCell[];

/** Sayının tr-TR görünümü: 1234.5 → "1.234,5". */
export function formatNumberTr(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 10 });
}

/** Tarih tr-TR (gg.aa.yyyy); saat varsa "gg.aa.yyyy SS:dd". */
export function formatDateTr(value: Date): string {
  if (Number.isNaN(value.getTime())) return "";
  const date = value.toLocaleDateString("tr-TR");
  if (value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0) return date;
  const time = value.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

/** Hücrenin düz metni (kopyala, PDF, yazdır). Metin kırpılır. */
export function cellText(value: ExportCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? formatNumberTr(value) : "";
  if (typeof value === "boolean") {
    return value
      ? i18next.t("ztoFinans:common.yes", { defaultValue: "Evet" })
      : i18next.t("ztoFinans:common.no", { defaultValue: "Hayır" });
  }
  return formatDateTr(value);
}

/** Bilinmeyen bir değeri ExportCell'e indirger (nesneler boş metin olur). */
export function toExportCell(value: unknown): ExportCell {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  return "";
}

// Buttons excelHtml5: "-12" / "12.5" sayıdır; "0" ile başlayan "05321" metin kalır (telefon, kod).
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
// tr-TR görünümü: "1.234", "1.234,56", "1.234.567", "12,5". Noktadan sonra tam üç hane binlik ayırıcıdır
// (formatNumber(1234, 0) → "1.234"); Buttons bunu ondalık sayardı, bilinçli sapma.
const TR_GROUPED = /^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/;
const TR_DECIMAL = /^-?(0|[1-9]\d*),\d+$/;
// Excel 15 haneden uzun sayıyı yuvarlar (IBAN, kart no): metin kalır.
const MAX_DIGITS = 15;

/** Sayı gibi görünen metni sayıya çevirir; çeviremezse null. */
export function parseNumericText(text: string): number | null {
  const s = text.trim();
  if (s.replace(/\D/g, "").length > MAX_DIGITS) return null;
  // Önce tr-TR: "1.234" / "12.345" / "1.234.567" / "1.234,56" — noktalar binlik ayırıcı.
  if (TR_GROUPED.test(s) || TR_DECIMAL.test(s)) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  // API'den ham ondalık ("1234.5000", "0.25", "-12.5", "1.2345").
  if (PLAIN_NUMBER.test(s)) return Number(s);
  return null;
}

/** Excel hücre değeri: sayı ve sayısal metin sayı, Date tarih, boş null. */
export function toExcelValue(value: ExportCell): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return cellText(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = parseNumericText(trimmed);
  return n === null ? trimmed : n;
}

/**
 * Buttons _excelColWidth: başlık ve hücrelerin en uzun satırı × 1,35; en az 6, 40 karakteri aşan
 * sütun 54.
 */
export function excelColumnWidth(header: string, column: ExportCell[]): number {
  let max = header.length;
  for (const cell of column) {
    const str = cellText(cell);
    const len = str.split("\n").reduce((m, line) => Math.max(m, line.length), 0);
    if (len > max) max = len;
    if (max > 40) return 54;
  }
  max *= 1.35;
  return max > 6 ? max : 6;
}
