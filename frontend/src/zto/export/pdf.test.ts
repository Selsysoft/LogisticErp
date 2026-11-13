import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentTable, ContentText, DynamicContent } from "pdfmake/interfaces";
import "../../i18n";
import { downloadBlob } from "./download";
import { ROBOTO_FONTS, buildPdfDefinition, exportPdf } from "./pdf";

const createPdf = vi.fn();
vi.mock("pdfmake/build/pdfmake", () => ({ default: { createPdf } }));
vi.mock("pdfmake/build/vfs_fonts", () => ({ default: { "Roboto-Regular.ttf": "AAA" } }));
vi.mock("./download", async (original) => ({
  ...(await original<typeof import("./download")>()),
  downloadBlob: vi.fn(),
}));

beforeEach(() => {
  createPdf.mockReset();
  vi.mocked(downloadBlob).mockClear();
});

const options = {
  title: "Çek Listesi",
  headers: ["No", "Tutar", "Durum"],
  rows: [
    ["Ç-1", 1500.5, "Portföyde"],
    ["Ç-2", null, true],
  ],
};

describe("buildPdfDefinition", () => {
  it("Buttons pdfHtml5 stilleri: başlık, koyu başlık satırı, zebra, sayı sağda", () => {
    const def = buildPdfDefinition(options);
    expect(def.pageSize).toBe("A4");
    expect(def.pageOrientation).toBe("portrait");
    const content = def.content as Array<ContentText | ContentTable>;
    expect(content[0]).toEqual({ text: "Çek Listesi", style: "title" });
    const table = (content[1] as ContentTable).table;
    expect((content[1] as ContentTable).layout).toBe("noBorders");
    expect(table.headerRows).toBe(1);
    expect(table.body[0]).toEqual([
      { text: "No", style: "tableHeader" },
      { text: "Tutar", style: "tableHeader" },
      { text: "Durum", style: "tableHeader" },
    ]);
    expect(table.body[1]).toEqual([
      { text: "Ç-1", style: "tableBodyOdd" },
      { text: "1.500,5", style: "tableBodyOdd", alignment: "right" },
      { text: "Portföyde", style: "tableBodyOdd" },
    ]);
    expect(table.body[2]).toEqual([
      { text: "Ç-2", style: "tableBodyEven" },
      { text: "", style: "tableBodyEven" },
      { text: "Evet", style: "tableBodyEven" },
    ]);
    expect(def.styles?.tableHeader).toMatchObject({ fillColor: "#2d4154", color: "white" });
    expect(def.styles?.tableBodyOdd).toEqual({ fillColor: "#f3f3f3" });
    expect(def.defaultStyle).toEqual({ fontSize: 10, font: "Roboto" });
  });

  it("sayfa altbilgisi ve yatay sayfa; başlıksız içerik", () => {
    const def = buildPdfDefinition({ headers: ["A"], rows: [], orientation: "landscape" });
    expect(def.pageOrientation).toBe("landscape");
    expect((def.content as unknown[]).length).toBe(1);
    const footer = (def.footer as DynamicContent)(2, 5, { width: 0, height: 0 } as never);
    expect(footer).toMatchObject({ text: "Sayfa 2 / 5", alignment: "right" });
  });
});

describe("exportPdf", () => {
  it("pdfmake'i dinamik yükler; yazı tipi ve vfs açıkça verilir; blob indirilir", async () => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    createPdf.mockReturnValue({ getBlob: (cb: (b: Blob) => void) => cb(blob) });
    await exportPdf({ ...options, fileName: "cekler" });
    expect(createPdf).toHaveBeenCalledTimes(1);
    const [def, layouts, fonts, vfs] = createPdf.mock.calls[0];
    expect(def.content[0].text).toBe("Çek Listesi");
    expect(layouts).toEqual({});
    expect(fonts).toBe(ROBOTO_FONTS);
    expect(vfs).toEqual({ "Roboto-Regular.ttf": "AAA" });
    expect(downloadBlob).toHaveBeenCalledWith(blob, "cekler.pdf");
  });

  it("dosya adı başlıktan; pdfmake hata verirse reddedilir", async () => {
    createPdf.mockReturnValue({ getBlob: (cb: (b: Blob) => void) => cb(new Blob([])) });
    await exportPdf(options);
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe("Çek Listesi.pdf");

    createPdf.mockReturnValue({
      getBlob: () => {
        throw new Error("font yok");
      },
    });
    await expect(exportPdf(options)).rejects.toThrow("font yok");
  });
});
