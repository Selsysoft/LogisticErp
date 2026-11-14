import type { PluginCreator, Rule } from "postcss";

/**
 * ZTO CSS kapsamlama kuralları (MX4 B.3, teknik 1). vite.config.ts bu modülü içe aktarır; mantık
 * saf fonksiyonlarda olduğu için scoping.test.ts ile sınanır.
 *
 * "@layer zto" emniyet katmanı uygulanmadı (2026-11-13; 04 §2 ve MX4 B.3 notu): katman kuralları
 * dışarı sızmayı önlemez (bunu önek yapar), yalnız ZTO kurallarının önceliğini düşürür. Katmansız
 * CssBaseline'ın "*, *::before, *::after { box-sizing: inherit }" kuralı Bootstrap'ın evrensel
 * border-box kuralını kök içinde ezer, content-box öğelerin (hr, tablo hücreleri) altı bozulur. (ZTO
 * dosyaları ileride ayrı katmanlara bölünürse !important sırası da tersine döner.) Önek tek başına
 * yeterlidir. Kurallar katmansız ve önekten sonra eşit özgüllükte olduğu için kazananı ZTO'daki gibi
 * zto-finans.css'teki @import sırası belirler (layout.css → SB Admin/BS → ... ); yalnız !important
 * kuralları sıradan bağımsız kazanır.
 *
 * @keyframes adları öneklenmez (MX4 B.3 "zto- öneki" önerisi uygulanmadı): bugün ana uygulamanın CSS'iyle
 * çakışan ad yok (MUI/emotion adları özetlidir). Aynı adın ZTO paketinde farklı gövdeyle iki kez
 * tanımlanması check:zto-css ile yakalanır; 12.x sayfa CSS'lerinde böyle adlar zto-<sayfa>-<ad> yapılır.
 */
export const ZTO_SCOPE = ".zto-finans";

// Kök öğeyi gösteren seçici başı: "html body", ":root body", "html", "body", ":root".
const GLOBAL_HEAD = /^(?:(?:html|:root)\s+body|html|body|:root)(?![\w-])/;
const SCOPE_HEAD = /^\.zto-finans(?![\w-])/;

/**
 * Tek seçiciyi kapsam altına alır: html/body/:root kökün kendisi olur ("body.x y" → ".zto-finans.x y"),
 * zaten .zto-finans ile başlayan olduğu gibi kalır, diğerleri ".zto-finans " ile öneklenir.
 */
export function scopeSelector(selector: string, scope: string = ZTO_SCOPE): string {
  const trimmed = selector.trim();
  if (SCOPE_HEAD.test(trimmed)) {
    return trimmed;
  }
  if (GLOBAL_HEAD.test(trimmed)) {
    return trimmed.replace(GLOBAL_HEAD, scope);
  }
  return `${scope} ${trimmed}`;
}

/** postcss-prefix-selector'ın transform imzası. */
export function transform(prefix: string, selector: string): string {
  return scopeSelector(selector, prefix);
}

/** Yalnız src/zto/styles altındaki giriş dosyaları kapsamlanır (Windows ve POSIX yolları). */
export function isZtoStyleFile(file: string | undefined): boolean {
  return !!file && /[\\/]src[\\/]zto[\\/]styles[\\/]/.test(file);
}

/**
 * Sayfa kapsamı (12.1 §5.6): ZTO'da sayfa satır içi stilleri ve sayfa CSS'leri yalnız o sayfada
 * yüklenir; burada hepsi tek parçada olduğu için genel seçicileri (`.card-header`, `.table th`) diğer
 * ZTO sayfalarına sızar. `src/zto/styles/pages/scoped/<ad>.css`'ten gelen kurallar
 * `.zto-finans.zto-page-<ad>` altına alınır (sayfa bu sınıfı useZtoRootClass ile köke yazar).
 */
const SCOPED_PAGE = /[\\/]src[\\/]zto[\\/]styles[\\/]pages[\\/]scoped[\\/]([A-Za-z0-9_-]+)\.css$/;

/**
 * Dosya adı ile sayfa kök sınıfı farklı olanlar: `all-transactions-page.css` (12.0'ın kapsamsız
 * `pages/all-transactions.css`'inden ayırmak için) → `zto-page-all-transactions`.
 */
export const PAGE_SCOPE_ALIASES: Readonly<Record<string, string>> = {
  "all-transactions-page": "all-transactions",
};

/**
 * Birden çok sayfanın paylaştığı sayfa CSS'leri (12.2 §5.4): ZTO Kasalar sayfası bankalarınkiyle aynı
 * `css/zt/timedeposits/index.css`'i yükler; dosya bir kez kopyalanır (`banks.css`) ve her kuralı iki
 * kök sınıfa yazılır (`.zto-page-banks` ve `.zto-page-cashes`). Anahtar dosya adı, değer kök adları.
 */
export const SHARED_SCOPES: Readonly<Record<string, readonly string[]>> = {
  banks: ["banks", "cashes"],
};

/**
 * Dosyanın kapsamları: sayfa kapsamlı dosyada `.zto-finans.zto-page-<ad>` (paylaşılan dosyada her kök
 * için bir tane), diğerlerinde `.zto-finans`.
 */
export function scopesForFile(file: string | undefined): string[] {
  const match = file ? SCOPED_PAGE.exec(file) : null;
  if (!match) return [ZTO_SCOPE];
  const pages = SHARED_SCOPES[match[1]] ?? [PAGE_SCOPE_ALIASES[match[1]] ?? match[1]];
  return pages.map((page) => `${ZTO_SCOPE}.zto-page-${page}`);
}

/** Dosyanın (ilk) kapsamı: sayfa kapsamlı dosyada `.zto-finans.zto-page-<ad>`, diğerlerinde `.zto-finans`. */
export function scopeForFile(file: string | undefined): string {
  return scopesForFile(file)[0];
}

/**
 * Seçicileri kapsamların her biri altına alır. Zaten `.zto-finans` ile başlayan seçici bir kez kalır
 * (PostCSS değişen kuralı yeniden ziyaret ettiğinde paylaşılan kapsamda çoğalmasın); tek kapsamda
 * sonuç `scopeSelector` eşlemesiyle birebir aynıdır.
 */
export function scopeSelectors(selectors: readonly string[], scopes: readonly string[]): string[] {
  return selectors.flatMap((selector) =>
    SCOPE_HEAD.test(selector.trim())
      ? [selector.trim()]
      : scopes.map((scope) => scopeSelector(selector, scope)),
  );
}

const KEYFRAMES = /keyframes$/i;

/**
 * Kuralın seçicilerini kapsamlar; kaynak dosya kural düzeyinde okunur (Vite @import'ları birleştirse
 * de `rule.source.input.file` özgün dosyadır). @keyframes adımları seçici değildir, atlanır.
 * scopeSelector tekrar uygulanırsa değişmez (PostCSS değişen düğümü yeniden ziyaret eder).
 */
function scopeRule(rule: Rule, fallbackFile: string | undefined) {
  const parent = rule.parent;
  if (parent?.type === "atrule" && KEYFRAMES.test((parent as { name: string }).name)) {
    return;
  }
  const scopes = scopesForFile(rule.source?.input.file ?? fallbackFile);
  rule.selectors = scopeSelectors(rule.selectors, scopes);
}

/**
 * Giriş dosyası src/zto/styles altındaysa, Vite'ın @import ile birleştirdiği tüm CSS (vendor, Font
 * Awesome) kapsamlanır; ziyaretçiler birleştirmeden sonra çalışır. Dosya yolu bilinmeyen CSS'e
 * dokunulmaz (postcss-prefix-selector'ın includeFiles'ı yol yoksa her şeyi önekler).
 * @page global bir kuraldır, seçiciyle kapsamlanamaz; Bootstrap'ın yazdırma kuralı (size: a3) ZTO
 * paketi yüklendikten sonra MUI ekranlarının çıktısını da etkileyeceği için çıkarılır.
 */
export const ztoScopePlugin: PluginCreator<void> = () => ({
  postcssPlugin: "zto-finans-scope",
  prepare(result) {
    if (!isZtoStyleFile(result.root.source?.input.file)) {
      return {};
    }
    const entry = result.root.source?.input.file;
    return {
      Rule: (rule) => scopeRule(rule, entry),
      AtRule: {
        page: (atRule) => {
          atRule.remove();
        },
      },
    };
  },
});
ztoScopePlugin.postcss = true;
