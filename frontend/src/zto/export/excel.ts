// Excel dışa aktarımı (Buttons excelHtml5 karşılığı). exceljs yalnız düğmeye basılınca yüklenir
// (dinamik import; ana pakete girmez). SheetJS/xlsx kullanılmaz.
import i18next from "i18next";
import type { Workbook } from "exceljs";
import { excelColumnWidth, toExcelValue, type ExportCell } from "./cells";
import { buildFileName, downloadBlob } from "./download";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ExcelExportOptions {
  /** Verilirse 1. satıra birleştirilmiş, kalın başlık yazılır. */
  title?: string;
  headers: string[];
  rows: ExportCell[][];
  /** Uzantısız ya da uzantılı; verilmezse başlık, o da yoksa varsayılan ad. */
  fileName?: string;
  /** Sayfa adı (en çok 31 karakter). */
  sheetName?: string;
  /** Sütun başına sayı biçimi; verilmezse ondalıklı sütunda "#,##0.00". */
  numberFormats?: Array<string | undefined>;
}

interface ExcelJsModule {
  Workbook: new () => Workbook;
}

/** Excel sayfa adı kuralı: []:*?/\ yasak, en çok 31 karakter. */
export function sanitizeSheetName(name: string, fallback = "Rapor"): string {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, " ")
    .trim()
    .slice(0, 31)
    .trim();
  return cleaned || fallback;
}

/** A, B, …, Z, AA … sütun harfi (1 tabanlı). */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Sütundaki sayılardan biri ondalıklıysa "#,##0.00", değilse genel biçim. */
export function defaultNumberFormat(
  values: Array<ReturnType<typeof toExcelValue>>,
): string | undefined {
  return values.some((v) => typeof v === "number" && !Number.isInteger(v)) ? "#,##0.00" : undefined;
}

type SheetOptions = Pick<ExcelExportOptions, "title" | "headers" | "rows" | "numberFormats">;

/** Bir çalışma sayfasını (başlık, başlık satırı, veri, sütun genişlik/biçimleri) kitaba ekler. */
function addSheet(workbook: Workbook, sheetName: string, options: SheetOptions): void {
  const { title, headers, rows } = options;
  const sheet = workbook.addWorksheet(sheetName);
  const columnCount = Math.max(headers.length, 1);

  if (title) {
    const titleRow = sheet.addRow([title]);
    titleRow.font = { bold: true, size: 14 };
    titleRow.alignment = { horizontal: "center" };
    if (columnCount > 1) sheet.mergeCells(1, 1, 1, columnCount);
  }

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };

  const values = rows.map((row) => headers.map((_, c) => toExcelValue(row[c])));
  for (const row of values) sheet.addRow(row);

  headers.forEach((header, c) => {
    const column = sheet.getColumn(c + 1);
    column.width = excelColumnWidth(
      header,
      rows.map((row) => row[c]),
    );
    const colValues = values.map((row) => row[c]);
    const numFmt = options.numberFormats?.[c] ?? defaultNumberFormat(colValues);
    const hasDate = colValues.some((v) => v instanceof Date);
    if (numFmt || hasDate) {
      const firstDataRow = (title ? 2 : 1) + 1;
      colValues.forEach((v, r) => {
        const cell = sheet.getCell(firstDataRow + r, c + 1);
        if (v instanceof Date) cell.numFmt = "dd.mm.yyyy";
        else if (numFmt && typeof v === "number") cell.numFmt = numFmt;
      });
    }
  });
}

/** Çalışma kitabını kurar (saf; test edilebilir). */
export function buildWorkbook(ExcelJS: ExcelJsModule, options: ExcelExportOptions): Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  addSheet(
    workbook,
    sanitizeSheetName(
      options.sheetName ?? i18next.t("ztoFinans:export.sheetName", { defaultValue: "Rapor" }),
    ),
    options,
  );
  return workbook;
}

// ---------------------------------------------------------------------------------------------
// 12.8 (§5.2): çok sayfalı çalışma kitabı (FinanceReport, Hızlı Bakiye Özeti; ZTO
// wwwroot/js/report-page.js `ztReportPage.xlsx({ fileName, sheets })`).
// ---------------------------------------------------------------------------------------------

/** Excel'in ayırdığı sayfa adı (report-page.js: "History" alınmış sayılır). */
const RESERVED_SHEET_NAME = "history";
const MAX_SHEET_NAME = 31;

/** Excel adın başında/sonunda kesme işaretine izin vermez (report-page.js `trimApostrophes`). */
function trimApostrophes(text: string): string {
  let out = text;
  if (out.startsWith("'")) out = `-${out.slice(1)}`;
  if (out.endsWith("'")) out = `${out.slice(0, -1)}-`;
  return out;
}

/** En çok `max` UTF-16 birimi; vekil çiftini ortadan bölmez. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return text.slice(0, end);
}

/**
 * Tekil sayfa adı (report-page.js `sheetName` kuralı): `sanitizeSheetName` (yasak karakter, 31
 * karakter, boşsa varsayılan), kesme işareti kırpması; `used` içinde büyük/küçük harf farksız varsa ya
 * da "History" ise ` (2)`, ` (3)` … eklenir ve toplam 31'i geçmez. Sonuç `used`'a eklenir.
 */
export function uniqueSheetName(name: string, used: string[], fallback = "Rapor"): string {
  const base = trimApostrophes(sanitizeSheetName(name, fallback));
  const taken = new Set(used.map((item) => item.toLowerCase()));
  const isTaken = (candidate: string) =>
    taken.has(candidate.toLowerCase()) || candidate.toLowerCase() === RESERVED_SHEET_NAME;
  let candidate = base;
  let counter = 1;
  while (isTaken(candidate)) {
    counter++;
    const suffix = ` (${counter})`;
    candidate = cut(base, MAX_SHEET_NAME - suffix.length).replace(/\s+$/, "") + suffix;
  }
  used.push(candidate);
  return candidate;
}

export interface ExcelWorkbookSheet {
  /** Sayfa adı (tekilleştirilir; en çok 31 karakter). */
  name: string;
  title?: string;
  headers: string[];
  rows: ExportCell[][];
  numberFormats?: Array<string | undefined>;
}

export interface ExcelWorkbookOptions {
  fileName: string;
  sheets: ExcelWorkbookSheet[];
}

/** Çok sayfalı çalışma kitabı (saf; her sayfa `buildWorkbook`'taki tek sayfa kuralıyla). */
export function buildMultiSheetWorkbook(
  ExcelJS: ExcelJsModule,
  options: ExcelWorkbookOptions,
): Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const fallback = i18next.t("ztoFinans:export.sheetName", { defaultValue: "Rapor" });
  const used: string[] = [];
  const sheets =
    options.sheets.length > 0 ? options.sheets : [{ name: fallback, headers: [], rows: [] }];
  for (const sheet of sheets) {
    addSheet(workbook, uniqueSheetName(sheet.name, used, fallback), sheet);
  }
  return workbook;
}

/** exceljs'i yükler (tarayıcıda dist/exceljs.min.js; CJS/ESM birlikte çalışması için default'a bakar). */
export async function loadExcelJs(): Promise<ExcelJsModule> {
  const mod = (await import("exceljs")) as unknown as ExcelJsModule & { default?: ExcelJsModule };
  return mod.Workbook ? mod : (mod.default as ExcelJsModule);
}

/** Excel dosyasını oluşturup indirir. */
export async function exportExcel(options: ExcelExportOptions): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const workbook = buildWorkbook(ExcelJS, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const fallback = i18next.t("ztoFinans:export.defaultFileName", { defaultValue: "rapor" });
  downloadBlob(
    new Blob([buffer], { type: XLSX_MIME }),
    buildFileName(options.fileName ?? options.title, ".xlsx", fallback),
  );
}

/** Çok sayfalı Excel dosyasını oluşturup indirir (12.8 §5.2; mevcut `exportExcel` değişmez). */
export async function exportExcelWorkbook(options: ExcelWorkbookOptions): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const workbook = buildMultiSheetWorkbook(ExcelJS, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const fallback = i18next.t("ztoFinans:export.defaultFileName", { defaultValue: "rapor" });
  downloadBlob(
    new Blob([buffer], { type: XLSX_MIME }),
    buildFileName(options.fileName, ".xlsx", fallback),
  );
}
