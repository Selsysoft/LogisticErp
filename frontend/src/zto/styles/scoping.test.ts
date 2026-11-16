import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import {
  isZtoStyleFile,
  PAGE_SCOPE_ALIASES,
  scopeForFile,
  scopeSelectors,
  scopesForFile,
  SHARED_SCOPES,
  scopeSelector,
  transform,
  ZTO_SCOPE,
  ztoScopePlugin,
} from "./prefixTransform";

const ZTO_FILE = "F:/proje/frontend/src/zto/styles/zto-finans.css";

async function scope(css: string, from: string | null = ZTO_FILE) {
  const result = await postcss([ztoScopePlugin()]).process(css, { from: from ?? undefined });
  return result.css;
}

describe("scopeSelector", () => {
  it.each([
    ["html", ".zto-finans"],
    ["body", ".zto-finans"],
    [":root", ".zto-finans"],
    ["html body", ".zto-finans"],
    ["html body .x", ".zto-finans .x"],
    ["html .table", ".zto-finans .table"],
    ["body .modal", ".zto-finans .modal"],
    [":root .fa-rotate-90", ".zto-finans .fa-rotate-90"],
    ["body.modal-open", ".zto-finans.modal-open"],
    ["body.modal-open .modal", ".zto-finans.modal-open .modal"],
    ["body.sb-nav-fixed", ".zto-finans.sb-nav-fixed"],
    ["html[dir=rtl] .select2", ".zto-finans[dir=rtl] .select2"],
    [".btn-primary", ".zto-finans .btn-primary"],
    ["*", ".zto-finans *"],
    ["a:not([href])", ".zto-finans a:not([href])"],
    ["table.dataTable thead > tr > th", ".zto-finans table.dataTable thead > tr > th"],
    ["button", ".zto-finans button"],
    ["bodyx", ".zto-finans bodyx"],
    [".body-text", ".zto-finans .body-text"],
    [".zto-finans", ".zto-finans"],
    [".zto-finans .card", ".zto-finans .card"],
    [".zto-finans.modal-open", ".zto-finans.modal-open"],
    [".zto-finans-x", ".zto-finans .zto-finans-x"],
    ["  .row  ", ".zto-finans .row"],
  ])("%s → %s", (input, expected) => {
    expect(scopeSelector(input)).toBe(expected);
  });

  it("transform ön eki parametreden alır", () => {
    expect(transform(".kapsam", "body.x .y")).toBe(".kapsam.x .y");
    expect(scopeSelector(".a", ".b")).toBe(".b .a");
    expect(ZTO_SCOPE).toBe(".zto-finans");
  });
});

describe("isZtoStyleFile", () => {
  it("yalnız src/zto/styles altını kabul eder", () => {
    expect(isZtoStyleFile(ZTO_FILE)).toBe(true);
    expect(isZtoStyleFile("C:\\p\\frontend\\src\\zto\\styles\\vendor\\layout.css")).toBe(true);
    expect(isZtoStyleFile("F:/p/node_modules/@fontsource/open-sans/400.css")).toBe(false);
    expect(isZtoStyleFile("F:/p/frontend/src/zto/ZtoFinansRoot.tsx")).toBe(false);
    expect(isZtoStyleFile(undefined)).toBe(false);
  });
});

describe("ztoScopePlugin", () => {
  it("kuralları önekler, virgüllü seçicileri ayrı ayrı ele alır", async () => {
    const css = await scope("html, body { margin: 0 } .row, h5 > a { color: red }");
    expect(css).toContain(".zto-finans, .zto-finans { margin: 0 }");
    expect(css).toContain(".zto-finans .row, .zto-finans h5 > a { color: red }");
  });

  it("@media içini önekler, @keyframes ve @font-face içine dokunmaz", async () => {
    const css = await scope(
      "@media (min-width: 576px) { .modal-dialog { max-width: 500px } }" +
        "@keyframes spinner-border { to { transform: rotate(360deg) } }" +
        "@-webkit-keyframes x { from { opacity: 0 } 50% { opacity: 1 } }" +
        "@font-face { font-family: X; src: url(x.woff2) }",
    );
    expect(css).toContain(".zto-finans .modal-dialog");
    expect(css).toContain("to { transform: rotate(360deg) }");
    expect(css).toContain("from { opacity: 0 } 50% { opacity: 1 }");
    expect(css).toContain("@font-face { font-family: X; src: url(x.woff2) }");
    expect(css).not.toMatch(/\.zto-finans (to|from|50%)/);
  });

  it("@page kuralını çıkarır (global yazdırma ayarı sızmasın)", async () => {
    const css = await scope("@media print { @page { size: a3 } body { min-width: 992px } }");
    expect(css).not.toContain("@page");
    expect(css).toContain(".zto-finans { min-width: 992px }");
  });

  it("ZTO dışındaki ya da yolu bilinmeyen CSS'e dokunmaz", async () => {
    const source = "@page { size: a3 } body { margin: 0 } .btn { color: red }";
    expect(await scope(source, "F:/p/node_modules/@fontsource/open-sans/400.css")).toBe(source);
    expect(await scope(source, null)).toBe(source);
  });
});

describe("sayfa kapsamı (12.1 §5.6)", () => {
  const SCOPED = "F:/proje/frontend/src/zto/styles/pages/scoped/foo.css";

  it("scoped klasöründeki dosya .zto-finans.zto-page-<ad>; diğerleri .zto-finans", () => {
    expect(scopeForFile(SCOPED)).toBe(".zto-finans.zto-page-foo");
    expect(
      scopeForFile("C:\\p\\frontend\\src\\zto\\styles\\pages\\scoped\\customer-accounts.css"),
    ).toBe(".zto-finans.zto-page-customer-accounts");
    expect(
      scopeForFile("F:/p/frontend/src/zto/styles/pages/scoped/all-transactions-page.css"),
    ).toBe(".zto-finans.zto-page-all-transactions");
    expect(PAGE_SCOPE_ALIASES["all-transactions-page"]).toBe("all-transactions");
    expect(scopeForFile("F:/p/frontend/src/zto/styles/pages/all-transactions.css")).toBe(
      ".zto-finans",
    );
    expect(scopeForFile("F:/p/frontend/src/zto/styles/pages/scoped/x/y.css")).toBe(".zto-finans");
    expect(scopeForFile(undefined)).toBe(".zto-finans");
  });

  it("scoped dosyadaki kurallar sayfa kökü altında; body sınıfı köke bağlanır", async () => {
    const css = await scope(
      ".card x { color: red } body.y x { margin: 0 } html, .card-header { padding: 0 }" +
        "@media print { .table th { color: #000 } }" +
        "@keyframes zto-foo-pulse { from { opacity: 0 } to { opacity: 1 } }",
      SCOPED,
    );
    expect(css).toContain(".zto-finans.zto-page-foo .card x { color: red }");
    expect(css).toContain(".zto-finans.zto-page-foo.y x { margin: 0 }");
    expect(css).toContain(".zto-finans.zto-page-foo, .zto-finans.zto-page-foo .card-header");
    expect(css).toContain("@media print { .zto-finans.zto-page-foo .table th");
    expect(css).toContain("@keyframes zto-foo-pulse { from { opacity: 0 } to { opacity: 1 } }");
  });

  it("scoped olmayan dosya değişmez (yalnız .zto-finans)", async () => {
    const css = await scope(".card x { color: red }", "F:/p/frontend/src/zto/styles/pages/a.css");
    expect(css).toBe(".zto-finans .card x { color: red }");
  });

  it("birleştirilmiş girişte kapsam kural kaynağından okunur", async () => {
    const root = postcss.parse(".card { color: red }", { from: SCOPED });
    const other = postcss.parse(".card { color: blue }", {
      from: "F:/p/frontend/src/zto/styles/vendor/layout.css",
    });
    root.append(other.nodes);
    const result = await postcss([ztoScopePlugin()]).process(root, { from: ZTO_FILE });
    expect(result.css).toContain(".zto-finans.zto-page-foo .card { color: red }");
    expect(result.css).toContain(".zto-finans .card { color: blue }");
  });
});

describe("12.1 sayfa CSS iskeletleri", () => {
  it("_index.css scoped dosyaları mevcut @import'lardan sonra sırayla içe aktarır", () => {
    const imports = Array.from(
      read("pages/_index.css").matchAll(/^@import "([^"]+)";/gm),
      (m) => m[1],
    );
    const start = imports.indexOf("./scoped/customer-accounts.css");
    expect(imports.slice(start, start + 8)).toEqual([
      "./scoped/customer-accounts.css",
      "./scoped/account-form.css",
      "./scoped/bank-accounts.css",
      "./scoped/bank-account-form.css",
      "./scoped/account-transactions.css",
      "./scoped/account-statement.css",
      "./scoped/all-transactions-page.css",
      "./quick-cari.css",
    ]);
    for (const file of imports.slice(start, start + 8)) {
      expect(read(`pages/${file.slice(2)}`)).toMatch(/Kaynak: /);
    }
  });
});

describe("12.2 sayfa CSS iskeletleri ve paylaşılan kapsam (§5.4)", () => {
  const PAGES = [
    "banks",
    "bank-form",
    "bank-detail",
    "cashes",
    "cash-form",
    "bank-transactions",
    "cash-transactions",
    "fund-extract",
    "fund-activity-report",
    "transfer-center",
    "exchange-break-report",
  ];

  it("_index.css 12.1 bloğundan sonra on bir dosyayı sırayla içe aktarır; her dosyada kaynak", () => {
    const imports = Array.from(
      read("pages/_index.css").matchAll(/^@import "([^"]+)";/gm),
      (m) => m[1],
    );
    const start = imports.indexOf("./scoped/banks.css");
    expect(imports.slice(start, start + PAGES.length)).toEqual(
      PAGES.map((p) => `./scoped/${p}.css`),
    );
    expect(imports.indexOf("./quick-cari.css")).toBeLessThan(imports.indexOf("./scoped/banks.css"));
    for (const page of PAGES) {
      expect(read(`pages/scoped/${page}.css`)).toMatch(/Kaynak: ZtoFabrika\//);
    }
  });

  it("banks.css iki köke yazılır; diğer dosyalar tek kök", () => {
    expect(SHARED_SCOPES).toEqual({
      banks: ["banks", "cashes"],
      "settlement-modals": [
        "payments",
        "collections",
        "bank-transactions",
        "cash-transactions",
        "checks",
        "bills",
      ],
      "recipe-report-common": ["fx-report", "cash-flow"],
    });
    const banks = "F:/p/frontend/src/zto/styles/pages/scoped/banks.css";
    expect(scopesForFile(banks)).toEqual([
      ".zto-finans.zto-page-banks",
      ".zto-finans.zto-page-cashes",
    ]);
    expect(scopeForFile(banks)).toBe(".zto-finans.zto-page-banks");
    expect(scopesForFile("F:/p/frontend/src/zto/styles/pages/scoped/cashes.css")).toEqual([
      ".zto-finans.zto-page-cashes",
    ]);
    expect(scopesForFile(undefined)).toEqual([".zto-finans"]);
  });

  it("scopeSelectors: her kapsam için bir seçici; kapsamlı seçici bir kez", () => {
    const scopes = [".zto-finans.zto-page-banks", ".zto-finans.zto-page-cashes"];
    expect(scopeSelectors([".card", "body.x y", " .zto-finans .z "], scopes)).toEqual([
      ".zto-finans.zto-page-banks .card",
      ".zto-finans.zto-page-cashes .card",
      ".zto-finans.zto-page-banks.x y",
      ".zto-finans.zto-page-cashes.x y",
      ".zto-finans .z",
    ]);
    expect(scopeSelectors([".a", "html"], [".zto-finans"])).toEqual([
      ".zto-finans .a",
      ".zto-finans",
    ]);
  });

  it("paylaşılan dosyadaki kural iki köke yazılır ve yeniden ziyarette çoğalmaz", async () => {
    const css = await scope(
      ".account-card { color: red } @media print { .x { margin: 0 } }",
      "F:/p/frontend/src/zto/styles/pages/scoped/banks.css",
    );
    expect(css).toContain(
      ".zto-finans.zto-page-banks .account-card, .zto-finans.zto-page-cashes .account-card {",
    );
    expect(css).toContain(".zto-finans.zto-page-banks .x, .zto-finans.zto-page-cashes .x {");
    expect(css.match(/zto-page-banks \.account-card/g)).toHaveLength(1);
  });
});

describe("12.2a sayfa CSS iskeletleri ve modal kapsamı (12.2a §5.4)", () => {
  const PAGES_12_2A = ["payments", "collections", "settlement-modals", "daily-settlement-report"];
  /** 12.3 §5.3 (FE-0 iskelet; FE-1/FE-2 doldurur). */
  const PAGES_12_3 = [
    "checks",
    "check-detailed-report",
    "bills",
    "check-books",
    "edit-instrument",
    "check-documents",
  ];
  /** 12.7 §5.3 (FE-0 kopyası; FE-1/FE-2/FE-3 sayfaları kullanır). */
  const PAGES_12_7 = [
    "expense-items",
    "general-expenses",
    "expense-calendar",
    "expense-group-details",
    "expense-form",
    "sales-truck-expenses",
    "sales-truck-details",
  ];
  const PAGES_12_2 = [
    "banks",
    "bank-form",
    "bank-detail",
    "cashes",
    "cash-form",
    "bank-transactions",
    "cash-transactions",
    "fund-extract",
    "fund-activity-report",
    "transfer-center",
    "exchange-break-report",
  ];
  /** 12.8 §5.3 (FE-0 kopyası; FE-1/FE-2/FE-3 sayfaları kullanır). */
  const PAGES_12_8 = [
    "customer-account-report",
    "finance-report",
    "financial-balance-sheet",
    "recipe-report-common",
    "fx-report",
    "cash-flow",
  ];

  it("_index.css: 12.2, 12.2a, 12.3, 12.7 ve 12.8 blokları sıralı; her dosyada kaynak", () => {
    const imports = Array.from(
      read("pages/_index.css").matchAll(/^@import "([^"]+)";/gm),
      (m) => m[1],
    );
    const start = imports.indexOf("./scoped/banks.css");
    expect(start).toBeGreaterThan(imports.indexOf("./quick-cari.css"));
    expect(imports.slice(start)).toEqual([
      ...[...PAGES_12_2, ...PAGES_12_2A, ...PAGES_12_3, ...PAGES_12_7, ...PAGES_12_8].map(
        (p) => `./scoped/${p}.css`,
      ),
      // 12.8 §5.3: Hızlı Bakiye Özeti modalı kapsamsız (quick-cari.css deseni).
      "./treasury-modal.css",
    ]);
    for (const page of [...PAGES_12_2A, ...PAGES_12_3, ...PAGES_12_7]) {
      expect(read(`pages/scoped/${page}.css`)).toMatch(/Kaynak: ZtoFabrika\//);
    }
    for (const page of [...PAGES_12_3, ...PAGES_12_7]) {
      expect(scopesForFile(`F:/p/frontend/src/zto/styles/pages/scoped/${page}.css`)).toEqual([
        `.zto-finans.zto-page-${page}`,
      ]);
    }
  });

  it("settlement-modals.css altı köke yazılır (12.3: checks, bills); liste ve rapor dosyaları tek kök", () => {
    const modals = "F:/p/frontend/src/zto/styles/pages/scoped/settlement-modals.css";
    expect(scopesForFile(modals)).toEqual([
      ".zto-finans.zto-page-payments",
      ".zto-finans.zto-page-collections",
      ".zto-finans.zto-page-bank-transactions",
      ".zto-finans.zto-page-cash-transactions",
      ".zto-finans.zto-page-checks",
      ".zto-finans.zto-page-bills",
    ]);
    expect(scopeForFile(modals)).toBe(".zto-finans.zto-page-payments");
    for (const page of ["payments", "collections", "daily-settlement-report"]) {
      expect(scopesForFile(`F:/p/frontend/src/zto/styles/pages/scoped/${page}.css`)).toEqual([
        `.zto-finans.zto-page-${page}`,
      ]);
    }
  });

  it("modal kuralı altı kökte bir kez; #id seçicisi ve @media korunur", async () => {
    const css = await scope(
      "#addPaymentModal .modal-dialog { width: 80vw } @media (max-width: 768px) { .erp-modal .x { margin: 0 } }",
      "C:\\p\\frontend\\src\\zto\\styles\\pages\\scoped\\settlement-modals.css",
    );
    expect(css).toContain(
      ".zto-finans.zto-page-payments #addPaymentModal .modal-dialog, " +
        ".zto-finans.zto-page-collections #addPaymentModal .modal-dialog, " +
        ".zto-finans.zto-page-bank-transactions #addPaymentModal .modal-dialog, " +
        ".zto-finans.zto-page-cash-transactions #addPaymentModal .modal-dialog, " +
        ".zto-finans.zto-page-checks #addPaymentModal .modal-dialog, " +
        ".zto-finans.zto-page-bills #addPaymentModal .modal-dialog {",
    );
    expect(css.match(/zto-page-cash-transactions \.erp-modal \.x/g)).toHaveLength(1);
    expect(css).toContain("@media (max-width: 768px)");
  });
});

const STYLES_DIR = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(STYLES_DIR, file), "utf8");

describe("zto-finans.css giriş sırası (ZTO _ExpertLayout ile birebir)", () => {
  it("layout.css önce, Bootstrap/SB Admin sonra; sayfa CSS'leri buttons/select2'den önce; ek en sonda", () => {
    const imports = Array.from(
      read("zto-finans.css").matchAll(/^@import "([^"]+)";/gm),
      (m) => m[1],
    );
    expect(imports).toEqual([
      "./pages/introduction-audit.css",
      "./pages/definition-list.css",
      "./pages/definition-form.css",
      "./vendor/layout.css",
      "./vendor/sb-admin-6.0.0-styles.css",
      "./vendor/dataTables.bootstrap4.min.css",
      "./vendor/layout-inline.css",
      "@fortawesome/fontawesome-free/css/all.css",
      "./pages/_index.css",
      "./vendor/buttons.dataTables.min.css",
      "./vendor/select2.min.css",
      "./vendor/select2-bootstrap.min.css",
      "./zto-overrides.css",
    ]);
  });

  it("tanım CSS'leri ZTO _Layout.cshtml:31-33 sırasıyla vendor/layout.css'ten önce", () => {
    const imports = Array.from(
      read("zto-finans.css").matchAll(/^@import "([^"]+)";/gm),
      (m) => m[1],
    );
    const at = (name: string) => imports.findIndex((i) => i.includes(name));
    expect(at("introduction-audit")).toBeGreaterThanOrEqual(0);
    expect(at("introduction-audit")).toBeLessThan(at("definition-list"));
    expect(at("definition-list")).toBeLessThan(at("definition-form"));
    expect(at("definition-form")).toBeLessThan(at("vendor/layout.css"));
    // Uyumsoft ayar stili ZTO'da gövde içi <style>: sayfa stilleriyle _index.css'te.
    expect(read("pages/_index.css")).toContain('@import "./uyumsoft-settings.css";');
    expect(read("pages/_index.css")).not.toMatch(/@import "[^"]*definition-/);
  });

  it("sayfa CSS'lerinde Razor kaçışı (@@) kalmadı", () => {
    const files = readdirSync(join(STYLES_DIR, "pages")).filter((f) => f.endsWith(".css"));
    expect(files).toEqual(expect.arrayContaining(["uyumsoft-settings.css", "definition-list.css"]));
    const withEscape = files.filter((f) => read(`pages/${f}`).includes("@@"));
    expect(withEscape).toEqual([]);
    expect(read("pages/uyumsoft-settings.css")).toMatch(/@media \(max-width: 640px\)/);
  });

  it("tanım CSS'i kapsamlanır: body.definition-list-page kökün kendisine bağlanır", async () => {
    const css = await scope(read("pages/definition-list.css"));
    expect(css).toContain(".zto-finans.definition-list-page main");
    expect(css).toContain(".zto-finans .definition-list-page table.definition-list-table");
    const overrides = await scope(read("zto-overrides.css"));
    expect(overrides).toContain(".zto-finans .definition-row--inactive td");
    expect(overrides).toContain(".zto-finans.definition-list-page .zto-finans-content");
  });

  it("layout satır içi stili kapsamlanır: input-group içinde select2 ve kompakt nav-tabs", async () => {
    const css = await scope(read("vendor/layout-inline.css"));
    expect(css).toContain(".zto-finans .input-group .select2-container");
    expect(css).toContain(".zto-finans .nav-tabs .nav-link.active");
    expect(css).toContain("@keyframes tabGlow");
    expect(css).not.toContain("@@");
    // JS'e bağlı kart animasyonu alınmadı (kartlar görünmez kalırdı).
    expect(css).not.toMatch(/\.card\s*\{[^}]*opacity:\s*0/);
  });
});

describe("12.7 sayfa CSS'leri (12.7 §5.3)", () => {
  it("ZTO @keyframes pulse önekli; Razor kaçışı kalmaz; kurallar sayfa kökü altında", async () => {
    const general = read("pages/scoped/general-expenses.css");
    expect(general).toContain("@keyframes zto-gex-pulse");
    expect(general).not.toMatch(/@keyframes pulse\s*\{/);
    for (const page of ["expense-items", "expense-form", "sales-truck-details"]) {
      expect(read(`pages/scoped/${page}.css`)).not.toMatch(/@@(media|keyframes)/);
    }
    const css = await scope(
      "@media (max-width: 768px) { .expense-card { padding: 0 } }",
      "F:/p/frontend/src/zto/styles/pages/scoped/expense-form.css",
    );
    expect(css).toContain(".zto-finans.zto-page-expense-form .expense-card");
  });
});

describe("12.8 sayfa CSS'leri (12.8 §5.3)", () => {
  const SCOPED_DIR = "F:/p/frontend/src/zto/styles/pages/scoped";

  it("kaynak başlıkları; tek kök (recipe-report-common iki kök); Razor kaçışı kalmaz", () => {
    for (const page of [
      "customer-account-report",
      "finance-report",
      "financial-balance-sheet",
      "fx-report",
      "cash-flow",
      "recipe-report-common",
    ]) {
      const css = read(`pages/scoped/${page}.css`);
      expect(css, page).toMatch(/Kaynak: ZtoFabrika\//);
      expect(css, page).not.toMatch(/@@(media|keyframes)/);
    }
    for (const page of [
      "customer-account-report",
      "finance-report",
      "financial-balance-sheet",
      "fx-report",
      "cash-flow",
    ]) {
      expect(scopesForFile(`${SCOPED_DIR}/${page}.css`)).toEqual([`.zto-finans.zto-page-${page}`]);
    }
    expect(scopesForFile(`${SCOPED_DIR}/recipe-report-common.css`)).toEqual([
      ".zto-finans.zto-page-fx-report",
      ".zto-finans.zto-page-cash-flow",
    ]);
    expect(read("pages/treasury-modal.css")).toMatch(/Kaynak: ZtoFabrika\//);
  });

  it("rp-page sarmalayıcı altında: body.rp-page köke bağlanmaz (Rev 1 FE-ROOT-CLASS)", async () => {
    const css = await scope(
      read("pages/scoped/finance-report.css"),
      `${SCOPED_DIR}/finance-report.css`,
    );
    expect(css).toContain(".zto-finans.zto-page-finance-report .rp-page {");
    expect(css).toContain(".zto-finans.zto-page-finance-report .rp-page *,");
    expect(css).toContain(".zto-finans.zto-page-finance-report .rp-page [hidden]");
    expect(css).not.toContain(".zto-finans.zto-page-finance-report.rp-page");
    expect(css).not.toMatch(/(^|[\s,}])body\.rp-page\s*\{/);
    // stat-filter.css aynı dosyada; @page çıkarılır; yazdırmada kabuk yan menüsü gizlenir.
    expect(css).toContain(".zto-finans.zto-page-finance-report .stat-filter");
    expect(css).not.toMatch(/@page\s*\{/);
    expect(css).toContain(".zto-finans.zto-page-finance-report .zt-sidebar {");
  });

  it("reçeteli tema iki köke yazılır; :root değişkenleri köke bağlanır; rcpdt kuralları var", async () => {
    const css = await scope(
      read("pages/scoped/recipe-report-common.css"),
      `${SCOPED_DIR}/recipe-report-common.css`,
    );
    expect(css).toContain(
      ".zto-finans.zto-page-fx-report .rcpdt-bar, .zto-finans.zto-page-cash-flow .rcpdt-bar {",
    );
    expect(css).toMatch(
      /\.zto-finans\.zto-page-fx-report, \.zto-finans\.zto-page-cash-flow \{\s*--rcp-primary: #007bff;/,
    );
    for (const selector of [
      ".rcpdt-foot",
      ".rcpdt-pg",
      ".rcpdt-btn.rcpdt-active",
      ".rcp-page",
      ".rcp-breadcrumb",
      ".rcp-hero",
    ]) {
      expect(css, selector).toContain(`.zto-finans.zto-page-cash-flow ${selector}`);
    }
    expect(css).not.toMatch(/\.rcp-pimg\s*\{/);
    expect(css).not.toMatch(/\.rcp-welcome\s*\{/);
    expect(css).not.toContain("dataTables_wrapper");
  });

  it("bilanço alt şerit eki ve hazine modalı genişliği (kapsamsız)", async () => {
    const fbs = await scope(
      read("pages/scoped/financial-balance-sheet.css"),
      `${SCOPED_DIR}/financial-balance-sheet.css`,
    );
    expect(fbs).toMatch(
      /@media \(min-width: 1025px\) \{\s*\.zto-finans\.zto-page-financial-balance-sheet \.fbs-wp-footer \{\s*grid-template-columns: repeat\(3, 1fr\);/,
    );
    const treasury = await scope(
      read("pages/treasury-modal.css"),
      "F:/p/frontend/src/zto/styles/pages/treasury-modal.css",
    );
    expect(treasury).toContain(".zto-finans #treasuryModal .modal-dialog.zto-treasury-dialog {");
  });
});
