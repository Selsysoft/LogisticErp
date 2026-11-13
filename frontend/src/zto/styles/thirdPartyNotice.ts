import type { Plugin } from "vite";

/**
 * ZTO CSS paketindeki üçüncü taraf bileşenlerin lisans bildirimi (MX4 B.4: "başlık korunmalı").
 * Vite'ın CSS küçültücüsü /*! *\/ yorumlarını da sildiği için bildirim, küçültmeden sonra çalışan
 * ztoLicensePlugin ile derlenmiş ZTO CSS paketinin başına eklenir; vendor dosyalarına dokunulmaz.
 */
export const ZTO_CSS_NOTICE = `/*!
 * ZTO Finans stil paketi — üçüncü taraf bildirimleri
 * Start Bootstrap - SB Admin v6.0.0 (https://startbootstrap.com/templates/sb-admin) — Copyright 2013-2020 Start Bootstrap — MIT
 * Bootstrap v4.4.1 (https://getbootstrap.com/) — Copyright 2011-2019 The Bootstrap Authors, Copyright 2011-2019 Twitter, Inc. — MIT
 * DataTables Bootstrap 4 1.10.x — Copyright SpryMedia Ltd — MIT (https://datatables.net/license)
 * DataTables Buttons 2.2.2 — Copyright SpryMedia Limited and other contributors — MIT (https://datatables.net/license)
 * Select2 4.1.0-rc.0 (https://select2.github.io) — Copyright (c) 2012-2017 Kevin Brown, Igor Vaynberg, and Select2 contributors — MIT
 * Select2 Bootstrap Theme v0.1.0-beta.10 — Copyright 2015-2017 Florian Kissling and contributors — MIT
 * Font Awesome Free 5.15.4 by @fontawesome - https://fontawesome.com
 * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)
 * Open Sans — SIL Open Font License 1.1
 *
 * MIT: Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions: The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
 * KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF
 * OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */`;

/** Derlenmiş paket ZTO CSS'i mi: kapsam sınıfını içerir ya da adı ZtoFinans ile başlar. */
export function isZtoCssAsset(fileName: string, source: string): boolean {
  if (!fileName.endsWith(".css")) {
    return false;
  }
  const base = fileName.split("/").pop() ?? fileName;
  return base.startsWith("ZtoFinans") || source.includes(".zto-finans");
}

/** Bildirimi bir kez ekler (yeniden çalıştırmada çift başlık olmasın). */
export function withZtoNotice(source: string): string {
  return source.startsWith(ZTO_CSS_NOTICE) ? source : `${ZTO_CSS_NOTICE}\n${source}`;
}

/** Derleme sonu: ZTO CSS paketlerinin başına lisans bildirimini ekler (küçültmeden sonra çalışır). */
export function ztoLicensePlugin(): Plugin {
  return {
    name: "zto-css-license",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset") {
          continue;
        }
        const source =
          typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
        if (isZtoCssAsset(asset.fileName, source)) {
          asset.source = withZtoNotice(source);
        }
      }
    },
  };
}
