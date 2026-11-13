import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { downloadBlob } from "./download";
import {
  XLSX_MIME,
  buildWorkbook,
  columnLetter,
  defaultNumberFormat,
  exportExcel,
  loadExcelJs,
  sanitizeSheetName,
} from "./excel";

vi.mock("./download", async (original) => ({
  ...(await original<typeof import("./download")>()),
  downloadBlob: vi.fn(),
}));

beforeEach(() => vi.mocked(downloadBlob).mockClear());

const headers = ["Tarih", "Cari", "Tutar", "Adet"];
const rows = [
  [new Date(2026, 10, 13), "Ali Tarım", "1.234,50", 3],
  [new Date(2026, 10, 14), "05321234567", 99.9, "12"],
  [null, "Uzun ".repeat(10), undefined, 1],
];

describe("yardımcılar", () => {
  it("sayfa adı", () => {
    expect(sanitizeSheetName("Cari [2026]: A/B?")).toBe("Cari  2026   A B");
    expect(sanitizeSheetName("x".repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName("***")).toBe("Rapor");
  });

  it("sütun harfi", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
    expect(columnLetter(703)).toBe("AAA");
  });

  it("ondalıklı sütuna biçim", () => {
    expect(defaultNumberFormat([1, 2, null])).toBeUndefined();
    expect(defaultNumberFormat([1, 2.5, "x"])).toBe("#,##0.00");
  });
});

describe("buildWorkbook", () => {
  it("başlık satırı birleşik ve kalın, başlıklar kalın, sayılar sayı, tarih tarih", () => {
    const wb = buildWorkbook(ExcelJS, { title: "Cari Hareketler", headers, rows });
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("Rapor");
    expect(ws.getCell("A1").value).toBe("Cari Hareketler");
    expect(ws.getCell("A1").font?.bold).toBe(true);
    expect(ws.getCell("A1").alignment?.horizontal).toBe("center");
    expect(ws.getCell("D1").isMerged).toBe(true);
    expect(ws.getRow(2).values).toEqual([undefined, ...headers]);
    expect(ws.getCell("B2").font?.bold).toBe(true);

    expect(ws.getCell("A3").value).toEqual(new Date(2026, 10, 13));
    expect(ws.getCell("A3").numFmt).toBe("dd.mm.yyyy");
    expect(ws.getCell("C3").value).toBe(1234.5);
    expect(ws.getCell("C3").numFmt).toBe("#,##0.00");
    expect(ws.getCell("C4").value).toBe(99.9);
    // Baştaki sıfır: telefon metin kalır.
    expect(ws.getCell("B4").value).toBe("05321234567");
    expect(ws.getCell("D4").value).toBe(12);
    expect(ws.getCell("D3").numFmt).toBeUndefined();
    expect(ws.getCell("A5").value).toBeNull();

    expect(ws.getColumn(1).width).toBeCloseTo(10 * 1.35);
    expect(ws.getColumn(2).width).toBe(54);
    expect(ws.getColumn(4).width).toBe(6);
  });

  it("başlıksız, tek sütun, verilen sayfa adı ve sayı biçimi", () => {
    const wb = buildWorkbook(ExcelJS, {
      headers: ["Tutar"],
      rows: [[5], [7]],
      sheetName: "Kasa",
      numberFormats: ["0.000"],
    });
    const ws = wb.getWorksheet("Kasa")!;
    expect(ws.getCell("A1").value).toBe("Tutar");
    expect(ws.getCell("A2").value).toBe(5);
    expect(ws.getCell("A2").numFmt).toBe("0.000");
  });

  it("tek sütunda başlık birleştirilmez", () => {
    const ws = buildWorkbook(ExcelJS, { title: "T", headers: ["A"], rows: [] }).worksheets[0];
    expect(ws.getCell("A1").isMerged).toBe(false);
    expect(ws.rowCount).toBe(2);
  });
});

describe("exportExcel", () => {
  it("exceljs'i dinamik yükler, xlsx üretir ve indirir; dosya geri okunabilir", async () => {
    await exportExcel({ title: "Kasa: Ana", headers, rows });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(name).toBe("Kasa_ Ana.xlsx");
    expect(blob.type).toBe(XLSX_MIME);

    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await blob.arrayBuffer());
    const ws = back.worksheets[0];
    expect(ws.getCell("A1").value).toBe("Kasa: Ana");
    expect(ws.getCell("C3").value).toBe(1234.5);
    expect(typeof ws.getCell("C3").value).toBe("number");
    expect(ws.getCell("B3").value).toBe("Ali Tarım");
  });

  it("dosya adı önceliği: fileName > başlık > varsayılan", async () => {
    await exportExcel({ headers: ["A"], rows: [], fileName: "liste" });
    await exportExcel({ headers: ["A"], rows: [] });
    const names = vi.mocked(downloadBlob).mock.calls.map((c) => c[1]);
    expect(names).toEqual(["liste.xlsx", "rapor.xlsx"]);
  });

  it("modül default altında gelirse de çözülür", async () => {
    const mod = await loadExcelJs();
    expect(typeof mod.Workbook).toBe("function");
  });
});
