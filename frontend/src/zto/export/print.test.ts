// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "../../i18n";
import { PRINT_CSS, buildPrintDocument, printTable } from "./print";

const options = {
  title: "Kasa <b>Hareketleri</b>",
  headers: ["Tarih", "Tutar"],
  rows: [
    ["13.11.2026", 1500.25],
    ["<script>alert(1)</script>", null],
  ],
};

describe("buildPrintDocument", () => {
  it("başlık, stil ve tabloyu yalnız metin olarak yazar", () => {
    const doc = document.implementation.createHTMLDocument("");
    buildPrintDocument(doc, options);
    expect(doc.title).toBe("Kasa <b>Hareketleri</b>");
    expect(doc.head.querySelector("style")?.textContent).toBe(PRINT_CSS);
    expect(doc.body.className).toBe("dt-print-view");
    expect(doc.querySelector("h1")?.textContent).toBe("Kasa <b>Hareketleri</b>");
    expect(doc.querySelector("b")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("table")?.className).toBe("table table-bordered dataTable");
    expect([...doc.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Tarih",
      "Tutar",
    ]);
    const cells = [...doc.querySelectorAll("tbody td")];
    expect(cells.map((td) => td.textContent)).toEqual([
      "13.11.2026",
      "1.500,25",
      "<script>alert(1)</script>",
      "",
    ]);
    expect(cells[1].className).toBe("dt-right");
  });

  it("başlıksız", () => {
    const doc = document.implementation.createHTMLDocument("x");
    buildPrintDocument(doc, { headers: ["A"], rows: [] });
    expect(doc.title).toBe("");
    expect(doc.querySelector("h1")).toBeNull();
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});

describe("printTable", () => {
  it("yeni pencere açar, yazdırır, yazdırma bitince kapatır", () => {
    const doc = document.implementation.createHTMLDocument("");
    const listeners: Record<string, () => void> = {};
    const fake = {
      document: doc,
      opener: {} as unknown,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((name: string, fn: () => void) => {
        listeners[name] = fn;
      }),
    };
    const open = vi.fn(() => fake as unknown as Window);
    expect(printTable(options, { open } as unknown as Window)).toBe(true);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(fake.opener).toBeNull();
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(fake.print).toHaveBeenCalled();
    expect(fake.close).not.toHaveBeenCalled();
    listeners.afterprint();
    expect(fake.close).toHaveBeenCalled();
  });

  it("opener salt okunursa yine yazdırır", () => {
    const fake = {
      document: document.implementation.createHTMLDocument(""),
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
    };
    Object.defineProperty(fake, "opener", {
      set() {
        throw new Error("salt okunur");
      },
    });
    const open = () => fake as unknown as Window;
    expect(printTable(options, { open } as unknown as Window)).toBe(true);
    expect(fake.print).toHaveBeenCalled();
  });

  it("açılır pencere engellenirse false", () => {
    const open = vi.fn(() => null);
    expect(printTable(options, { open } as unknown as Window)).toBe(false);
  });
});
