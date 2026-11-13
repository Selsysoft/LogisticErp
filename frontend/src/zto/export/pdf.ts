// PDF dışa aktarımı (Buttons pdfHtml5 karşılığı). pdfmake 0.2.x ve Roboto yazı tipleri (vfs_fonts)
// yalnız düğmeye basılınca yüklenir. pdfmake 0.2 tarayıcı paketi eval/new Function kullanmaz
// (CSP script-src 'self' ile çalışır); yazı tipleri ve tablo yerleşimleri açıkça verilir, böylece
// window.pdfMake global'ine hiç bakılmaz.
import i18next from "i18next";
import type { Content, TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import { cellText, type ExportCell } from "./cells";
import { buildFileName, downloadBlob } from "./download";

export type PdfOrientation = "portrait" | "landscape";

export interface PdfExportOptions {
  title?: string;
  headers: string[];
  rows: ExportCell[][];
  fileName?: string;
  /** Varsayılan dikey (Buttons gibi). */
  orientation?: PdfOrientation;
}

/** vfs_fonts.js içindeki Roboto dosyaları (Türkçe harfleri içerir). */
export const ROBOTO_FONTS: TFontDictionary = {
  Roboto: {
    normal: "Roboto-Regular.ttf",
    bold: "Roboto-Medium.ttf",
    italics: "Roboto-Italic.ttf",
    bolditalics: "Roboto-MediumItalic.ttf",
  },
};

/** Belge tanımı: Buttons pdfHtml5 varsayılan stilleri + sayfa numarası. */
export function buildPdfDefinition(options: PdfExportOptions): TDocumentDefinitions {
  const { title, headers, rows } = options;
  const body = [
    headers.map((h) => ({ text: h, style: "tableHeader" })),
    ...rows.map((row, r) =>
      headers.map((_, c) => {
        const value = row[c];
        return {
          text: cellText(value),
          style: r % 2 ? "tableBodyEven" : "tableBodyOdd",
          ...(typeof value === "number" ? { alignment: "right" as const } : {}),
        };
      }),
    ),
  ];
  const content: Content[] = [];
  if (title) content.push({ text: title, style: "title" });
  content.push({ table: { headerRows: 1, body }, layout: "noBorders" });
  return {
    pageSize: "A4",
    pageOrientation: options.orientation ?? "portrait",
    content,
    footer: (currentPage: number, pageCount: number) => ({
      text: i18next.t("ztoFinans:export.pageOf", {
        page: currentPage,
        pages: pageCount,
        defaultValue: `${currentPage} / ${pageCount}`,
      }),
      alignment: "right",
      fontSize: 8,
      margin: [0, 10, 40, 0],
    }),
    styles: {
      tableHeader: {
        bold: true,
        fontSize: 11,
        color: "white",
        fillColor: "#2d4154",
        alignment: "center",
      },
      tableBodyEven: {},
      tableBodyOdd: { fillColor: "#f3f3f3" },
      title: { alignment: "center", fontSize: 15, margin: [0, 0, 0, 8] },
    },
    defaultStyle: { fontSize: 10, font: "Roboto" },
  };
}

interface PdfMakeModule {
  createPdf: (
    doc: TDocumentDefinitions,
    tableLayouts?: object,
    fonts?: TFontDictionary,
    vfs?: Record<string, string>,
  ) => { getBlob: (cb: (blob: Blob) => void) => void };
}

function interop<T>(mod: unknown): T {
  const m = mod as { default?: T };
  return (m.default ?? mod) as T;
}

/** pdfmake ve Roboto vfs'ini yükler. */
export async function loadPdfMake(): Promise<{
  pdfMake: PdfMakeModule;
  vfs: Record<string, string>;
}> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  return {
    pdfMake: interop<PdfMakeModule>(pdfMakeMod),
    vfs: interop<Record<string, string>>(vfsMod),
  };
}

/** PDF'i oluşturup indirir. */
export async function exportPdf(options: PdfExportOptions): Promise<void> {
  const { pdfMake, vfs } = await loadPdfMake();
  const doc = pdfMake.createPdf(buildPdfDefinition(options), {}, ROBOTO_FONTS, vfs);
  const blob = await new Promise<Blob>((resolve, reject) => {
    try {
      doc.getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
  const fallback = i18next.t("ztoFinans:export.defaultFileName", { defaultValue: "rapor" });
  downloadBlob(blob, buildFileName(options.fileName ?? options.title, ".pdf", fallback));
}
