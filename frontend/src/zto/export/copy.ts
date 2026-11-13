// Panoya kopyalama (Buttons copyHtml5 karşılığı): sekmeyle ayrılmış metin.
import { cellText, parseNumericText, type ExportCell } from "./cells";

export interface TsvOptions {
  /** Verilirse en üste başlık ve boş satır eklenir (Buttons gibi). */
  title?: string;
  /** Satır sonu; varsayılan Windows'ta "\r\n", diğerlerinde "\n" (Buttons _newLine). */
  newline?: string;
}

/** Buttons _newLine: Windows'ta CRLF. */
export function defaultNewline(userAgent: string): string {
  return /Windows/.test(userAgent) ? "\r\n" : "\n";
}

// Excel'e yapışınca formül olarak değerlendirilen ilk karakterler (OWASP CSV injection).
const FORMULA_START = /^[=+\-@]/;

function field(value: ExportCell): string {
  // Sekme ve satır sonu hücre sınırını bozmasın (Buttons stripNewlines).
  const text = cellText(value).replace(/[\t\r\n]+/g, " ");
  // Formül enjeksiyonu: başa ' eklenir (Buttons copyHtml5 kaçış yapmaz; bilinçli sapma). Sayı hücresi
  // ve sayı gibi görünen metin ("-12", "-1.234,56") olduğu gibi kalır. Denetim kırpmadan sonradır.
  if (typeof value === "number" || !FORMULA_START.test(text) || parseNumericText(text) !== null) {
    return text;
  }
  return "'" + text;
}

/** Başlık + satırları TSV metnine çevirir. */
export function toTsv(headers: string[], rows: ExportCell[][], options: TsvOptions = {}): string {
  const newline =
    options.newline ?? defaultNewline(typeof navigator === "undefined" ? "" : navigator.userAgent);
  const lines = [headers.map(field).join("\t"), ...rows.map((row) => row.map(field).join("\t"))];
  const body = lines.join(newline);
  return options.title ? field(options.title) + newline + newline + body : body;
}

/** Metni panoya yazar; Clipboard API yoksa ya da reddederse gizli textarea + execCommand. */
export async function copyText(text: string, doc: Document = document): Promise<void> {
  const clipboard = doc.defaultView?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Güvenli bağlam ya da izin yok: eski yönteme düş.
    }
  }
  const area = doc.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  // Açık bir modalın odak tuzağı dışına çıkmamak için etkin öğenin yanına eklenir.
  const previous = doc.activeElement as HTMLElement | null;
  const host = previous && previous !== doc.body ? (previous.parentElement ?? doc.body) : doc.body;
  host.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = doc.execCommand("copy");
  } finally {
    area.remove();
    previous?.focus?.();
  }
  if (!ok) throw new Error("copy failed");
}

/** Satırları TSV olarak panoya kopyalar. Başarısızsa hata fırlatır. */
export async function copyRowsAsTsv(
  headers: string[],
  rows: ExportCell[][],
  options: TsvOptions = {},
): Promise<void> {
  await copyText(toTsv(headers, rows, options));
}
