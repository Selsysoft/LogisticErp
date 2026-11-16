import { describe, expect, it } from "vitest";
import {
  MAX_FILE_SIZE,
  fileIcon,
  nextMenuIndex,
  oversize,
  pickedLabel,
  progressPercent,
  splitFiles,
} from "./checkDocumentsLogic";

describe("20 MB sınırı", () => {
  it("sınır dahil geçerli, üstü reddedilir", () => {
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
    expect(oversize({ size: MAX_FILE_SIZE })).toBe(false);
    expect(oversize({ size: MAX_FILE_SIZE + 1 })).toBe(true);
    const { valid, oversized } = splitFiles([
      { name: "a.pdf", size: 10 },
      { name: "b.jpg", size: MAX_FILE_SIZE + 1 },
    ]);
    expect(valid.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(oversized.map((f) => f.name)).toEqual(["b.jpg"]);
  });
});

describe("yardımcılar", () => {
  it("uzantı simgeleri (GetFileExtensionIcon)", () => {
    expect(fileIcon("Çek.PDF")).toBe("far fa-file-pdf");
    expect(fileIcon("a.docx")).toBe("fas fa-file-word");
    expect(fileIcon("a.xls")).toBe("fas fa-file-excel");
    expect(fileIcon("a.pptx")).toBe("fas fa-file-powerpoint");
    expect(fileIcon("a.rar")).toBe("fas fa-book");
    expect(fileIcon("a.txt")).toBe("fas fa-align-left");
    expect(fileIcon("a.png")).toBe("far fa-image");
    expect(fileIcon("dosya")).toBe("fas fa-file");
  });

  it("etiket, ilerleme ve menü gezinmesi", () => {
    expect(pickedLabel([])).toEqual({ kind: "none" });
    expect(pickedLabel([{ name: "a" }])).toEqual({ kind: "one", name: "a" });
    expect(pickedLabel([{ name: "a" }, { name: "b" }])).toEqual({ kind: "many", count: 2 });
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(3, 3)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
    expect(nextMenuIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextMenuIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextMenuIndex(1, "Home", 3)).toBe(0);
    expect(nextMenuIndex(0, "End", 3)).toBe(2);
    expect(nextMenuIndex(1, "x", 3)).toBe(1);
    expect(nextMenuIndex(0, "ArrowDown", 0)).toBe(-1);
  });
});
