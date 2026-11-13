import type { Plugin, PluginCreator } from "postcss";
import prefixSelector from "postcss-prefix-selector";

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

const prefixer = prefixSelector({ prefix: ZTO_SCOPE, transform }) as Plugin;

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
    return {
      ...prefixer.prepare?.(result),
      AtRule: {
        page: (atRule) => {
          atRule.remove();
        },
      },
    };
  },
});
ztoScopePlugin.postcss = true;
