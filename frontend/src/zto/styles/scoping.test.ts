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
    expect(imports.slice(-PAGES.length)).toEqual(PAGES.map((p) => `./scoped/${p}.css`));
    expect(imports.indexOf("./quick-cari.css")).toBeLessThan(imports.indexOf("./scoped/banks.css"));
    for (const page of PAGES) {
      expect(read(`pages/scoped/${page}.css`)).toMatch(/Kaynak: ZtoFabrika\//);
    }
  });

  it("banks.css iki köke yazılır; diğer dosyalar tek kök", () => {
    expect(SHARED_SCOPES).toEqual({ banks: ["banks", "cashes"] });
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
