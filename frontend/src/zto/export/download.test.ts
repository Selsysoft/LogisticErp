// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFileName, downloadBlob, ensureExtension, sanitizeFileName } from "./download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("dosya adı", () => {
  it("geçersiz karakterler, boşluk, baştaki nokta, uzunluk", () => {
    expect(sanitizeFileName('Cari: "Ali/Veli" <2026>')).toBe("Cari_ _Ali_Veli_ _2026_");
    expect(sanitizeFileName("  çok   boşluk  ")).toBe("çok boşluk");
    expect(sanitizeFileName("..gizli")).toBe("gizli");
    expect(sanitizeFileName("a\u0001b")).toBe("a_b");
    expect(sanitizeFileName("x".repeat(200))).toHaveLength(150);
    expect(sanitizeFileName("   ")).toBe("rapor");
    expect(sanitizeFileName("", "dosya")).toBe("dosya");
  });

  it("uzantı tamamlama", () => {
    expect(ensureExtension("rapor", ".xlsx")).toBe("rapor.xlsx");
    expect(ensureExtension("rapor.XLSX", ".xlsx")).toBe("rapor.XLSX");
    expect(buildFileName("Banka Hareketleri", ".pdf")).toBe("Banka Hareketleri.pdf");
    expect(buildFileName(undefined, ".pdf", "liste")).toBe("liste.pdf");
  });
});

describe("downloadBlob", () => {
  it("blob bağlantısını tıklar, kaldırır ve URL'yi sonra serbest bırakır", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    const blob = new Blob(["x"], { type: "text/plain" });
    downloadBlob(blob, "rapor.txt");

    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("rapor.txt");
    expect(clicked[0].getAttribute("href")).toBe("blob:test");
    expect(clicked[0].rel).toBe("noopener");
    expect(document.querySelector("a")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40_000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
