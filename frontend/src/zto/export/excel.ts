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

/** Çalışma kitabını kurar (saf; test edilebilir). */
export function buildWorkbook(ExcelJS: ExcelJsModule, options: ExcelExportOptions): Workbook {
  const { title, headers, rows } = options;
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(
    sanitizeSheetName(
      options.sheetName ?? i18next.t("ztoFinans:export.sheetName", { defaultValue: "Rapor" }),
    ),
  );
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
