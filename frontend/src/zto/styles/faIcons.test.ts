// @vitest-environment node
/// <reference types="node" />
/**
 * 12.8 Font Awesome sürüm denetimi (12.8_TASARIM §5.3, Rev 1 FE-FA6-ICONS): ZTO `_ReportLayout`
 * FA 6.4.0 yükler, Blackrose ZTO kabuğu FA 5.15.4 (`@fortawesome/fontawesome-free`). 12.8 sayfa ve
 * bileşen kaynaklarındaki her `fa-*` sınıfı FA5 `all.css`'te tanımlı olmalı (ikon `.fa-x:before` ya da
 * yardımcı sınıf `.fa-spin`, `.fa-fw` …); FA6 adı (`fa-scale-balanced` gibi) boş kutu çizer.
 * Yorumlar taranmaz (eşleme notları FA6 adını anabilir).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FA_CSS = resolve(SRC, "../node_modules/@fortawesome/fontawesome-free/css/all.css");

/** 12.8 kaynakları: rapor sayfaları klasörü, Para Birimleri, hazine modalı, ZtoRcpTable, menü kaydı. */
const ROOTS = [
  "zto/finans/pages/reports",
  "zto/finans/pages/definitions/CurrenciesPage.tsx",
  "zto/finans/pages/definitions/currenciesLogic.ts",
  "zto/finans/TreasuryModal.tsx",
  "zto/finans/treasuryLogic.ts",
  "zto/components/ZtoRcpTable.tsx",
  "zto/finans/navItems.ts",
];

function sourceFiles(path: string): string[] {
  const full = join(SRC, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isDirectory()) {
    return readdirSync(full).flatMap((name) => sourceFiles(join(path, name)));
  }
  return /\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full) ? [full] : [];
}

/** Blok (`/* … *\/`, JSX `{/* … *\/}` dahil) ve satır yorumlarını atar; dizgelerdeki `//` korunur. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Kaynaktaki `fa-*` sınıf adları (şablon parçası `fa-${x}` sayılmaz). */
function faClasses(code: string): string[] {
  return [...new Set(stripComments(code).match(/(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [])];
}

const faCss = readFileSync(FA_CSS, "utf8");

function definedInFa5(name: string): boolean {
  return new RegExp(`\\.${name}(?![\\w-])`).test(faCss);
}

describe("12.8 kaynaklarında yalnız FA 5.15.4 sınıfları", () => {
  it("denetim kendini doğrular: FA6 adları yok, FA5 karşılıkları ve yardımcılar var", () => {
    for (const fa6 of [
      "fa-scale-balanced",
      "fa-rotate-left",
      "fa-circle-info",
      "fa-triangle-exclamation",
    ]) {
      expect(definedInFa5(fa6), fa6).toBe(false);
    }
    for (const fa5 of [
      "fa-balance-scale",
      "fa-undo-alt",
      "fa-info-circle",
      "fa-exclamation-triangle",
      "fa-spin",
      "fa-fw",
    ]) {
      expect(definedInFa5(fa5), fa5).toBe(true);
    }
    expect(
      faClasses(
        'const a = "fas fa-cut"; // fa-scale-balanced\n/* fa-rotate-left */ `fa-${x}` "fa-x-y"',
      ),
    ).toEqual(["fa-cut", "fa-x-y"]);
  });

  it("taranan her fa-* sınıfı all.css'te tanımlı", () => {
    const files = ROOTS.flatMap(sourceFiles);
    // En az menü kaydı ve ZtoRcpTable taranır (sayfalar sahiplerince doldurulur).
    expect(files.length).toBeGreaterThanOrEqual(2);
    const missing = files.flatMap((file) =>
      faClasses(readFileSync(file, "utf8"))
        .filter((name) => !definedInFa5(name))
        .map((name) => `${relative(SRC, file).replace(/\\/g, "/")}: ${name}`),
    );
    expect(missing).toEqual([]);
  });
});
