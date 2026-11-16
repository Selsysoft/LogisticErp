import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { downloadBlob } from "./download";
import {
  XLSX_MIME,
  buildMultiSheetWorkbook,
  buildWorkbook,
  columnLetter,
  defaultNumberFormat,
  exportExcel,
  exportExcelWorkbook,
  loadExcelJs,
  sanitizeSheetName,
  uniqueSheetName,
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

describe("uniqueSheetName (12.8; report-page.js sheetName kuralı)", () => {
  it("yasak karakter, 31 karakter, boşsa varsayılan; sonuç used'a eklenir", () => {
    const used: string[] = [];
    expect(uniqueSheetName("Cari [A]: B/C", used)).toBe("Cari  A   B C");
    expect(uniqueSheetName("x".repeat(40), used)).toHaveLength(31);
    expect(uniqueSheetName("***", used, "Rapor")).toBe("Rapor");
    expect(used).toEqual(["Cari  A   B C", "x".repeat(31), "Rapor"]);
  });

  it("büyük/küçük harf farksız tekilleştirme (2), (3); toplam 31'i geçmez", () => {
    const used: string[] = [];
    expect(uniqueSheetName("Bankalar", used)).toBe("Bankalar");
    expect(uniqueSheetName("bankalar", used)).toBe("bankalar (2)");
    expect(uniqueSheetName("BANKALAR", used)).toBe("BANKALAR (3)");
    const long = "y".repeat(31);
    expect(uniqueSheetName(long, used)).toBe(long);
    const second = uniqueSheetName(long, used);
    expect(second).toBe(`${"y".repeat(27)} (2)`);
    expect(second).toHaveLength(31);
  });

  it("History ayrılmış ad; kesme işareti başta/sonda olmaz", () => {
    const used: string[] = [];
    expect(uniqueSheetName("History", used)).toBe("History (2)");
    expect(uniqueSheetName("history", used)).toBe("history (3)");
    expect(uniqueSheetName("'Özet'", used)).toBe("-Özet-");
  });
});

describe("buildMultiSheetWorkbook / exportExcelWorkbook (12.8 §5.2)", () => {
  it("her sayfa tek sayfa kuralıyla; adlar tekil", () => {
    const wb = buildMultiSheetWorkbook(ExcelJS, {
      fileName: "x",
      sheets: [
        { name: "Bankalar", title: "Bankalar", headers, rows },
        { name: "bankalar", headers: ["Tutar"], rows: [[5]], numberFormats: ["0.000"] },
        { name: "History", headers: ["A"], rows: [] },
      ],
    });
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Bankalar", "bankalar (2)", "History (2)"]);
    const first = wb.worksheets[0];
    expect(first.getCell("A1").value).toBe("Bankalar");
    expect(first.getCell("D1").isMerged).toBe(true);
    expect(first.getCell("C3").numFmt).toBe("#,##0.00");
    const second = wb.worksheets[1];
    expect(second.getCell("A1").value).toBe("Tutar");
    expect(second.getCell("A2").numFmt).toBe("0.000");
  });

  it("sayfasız istekte tek boş sayfa", () => {
    const wb = buildMultiSheetWorkbook(ExcelJS, { fileName: "x", sheets: [] });
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["Rapor"]);
  });

  it("xlsx üretir ve indirir; dosya geri okunur", async () => {
    await exportExcelWorkbook({
      fileName: "Finans Raporu",
      sheets: [
        { name: "Genel", headers: ["A"], rows: [["1"]] },
        { name: "Liste", headers: ["B"], rows: [[2.5]] },
      ],
    });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0];
    expect(name).toBe("Finans Raporu.xlsx");
    expect(blob.type).toBe(XLSX_MIME);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await blob.arrayBuffer());
    expect(back.worksheets.map((ws) => ws.name)).toEqual(["Genel", "Liste"]);
    expect(back.getWorksheet("Liste")!.getCell("A2").value).toBe(2.5);
  });
});
