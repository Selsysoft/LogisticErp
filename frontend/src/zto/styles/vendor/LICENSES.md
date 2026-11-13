# ZTO Finans — üçüncü taraf ve ZTO stil dosyaları

Bu klasördeki dosyalar **birebir kopyadır** (biçimlendirilmez, `.prettierignore`). Derlemede
`src/zto/styles/prefixTransform.ts` ile `.zto-finans` kapsamına alınır. Kaynak: ZTO Fabrika
(`ZtoFabrika2026/ZtoFabrika/wwwroot`, salt okunur) veya resmî npm paketi. Tarih: 2026-11-13.

| Dosya | Bileşen | Sürüm | Lisans | Kaynak |
|---|---|---|---|---|
| `sb-admin-6.0.0-styles.css` | Start Bootstrap SB Admin (içine derlenmiş Bootstrap CSS) | SB Admin 6.0.0 / Bootstrap 4.4.1 | MIT (başlıkta) | ZTO `wwwroot/Web/dist/css/styles.css` (196.808 bayt, değişmedi) |
| `dataTables.bootstrap4.min.css` | DataTables Bootstrap 4 entegrasyonu | 1.10.x (ZTO yerel kopyası; ZTO layout'u DataTables 1.10.20 yükler) | MIT — © SpryMedia Ltd, datatables.net/license | ZTO `wwwroot/lib/datatables/css/dataTables.bootstrap4.min.css` (değişmedi; dosyada başlık yok) |
| `buttons.dataTables.min.css` | DataTables Buttons | 2.2.2 | MIT — © SpryMedia Limited | npm `datatables.net-buttons-dt@2.2.2` `css/buttons.dataTables.min.css`; ZTO aynı sürümü CDN'den yükler. Başa lisans yorumu eklendi, içerik değişmedi |
| `select2.min.css` | Select2 | 4.1.0-rc.0 | MIT — © 2012-2017 Kevin Brown, Igor Vaynberg ve katkıda bulunanlar | npm `select2@4.1.0-rc.0` `dist/css/select2.min.css`; ZTO aynı sürümü jsDelivr'den yükler. Başa lisans yorumu eklendi, içerik değişmedi |
| `select2-bootstrap.min.css` | Select2 Bootstrap Theme | 0.1.0-beta.10 | MIT (başlıkta) — © 2015-2017 Florian Kissling ve katkıda bulunanlar | npm `select2-bootstrap-theme@0.1.0-beta.10` `dist/select2-bootstrap.min.css` (değişmedi) |
| `layout.css` | ZTO Fabrika ortak düzen stilleri | — | Şirket içi (ZTO, aynı sahiplik) | ZTO `wwwroot/css/layout.css` (11.148 bayt, değişmedi) |
| `layout-inline.css` | ZTO layout satır içi stili (kompakt nav-tabs, `.input-group .select2-container`) | — | Şirket içi (ZTO, aynı sahiplik) | ZTO `Views/Shared/_ExpertLayout.cshtml:43-201, :215-218, :493-496` (`@@` Razor kaçışı dışında değişmedi) |

Bu klasörde olmayan, paketten yüklenenler:

| Bileşen | Sürüm | Lisans | Yükleme |
|---|---|---|---|
| Font Awesome Free (CSS + webfont) | 5.15.4 | İkonlar CC BY 4.0, fontlar SIL OFL 1.1, kod MIT (CSS başlığında) | `@fortawesome/fontawesome-free/css/all.css`, `zto-finans.css` içinden; ZTO'daki 5.11.2 `all.min.js` (SVG değiştirici) kullanılmaz |
| Open Sans | @fontsource/open-sans 5.3.0 (400/600; ZTO gibi) | SIL OFL 1.1 | `ZtoFinansRoot.tsx`; ZTO'daki Google Fonts bağlantısının yerine |

Alınmayanlar: ZTO'nun Google Fonts (Plus Jakarta Sans, JetBrains Mono, Material Icons/Symbols) ve CDN
betikleri (jQuery, Bootstrap JS, DataTables JS, JSZip, pdfmake 0.1.53, select2 JS, Chart.js 2.8.0).
Davranışları React bileşenleriyle yeniden yazılır (MX4 B.2). `zto-admin.css` ve diğer ZTO sayfa CSS'leri
sayfa yazıldıkça `../pages/` altına eklenir.

Derlemede yapılan tek içerik değişikliği: Bootstrap'ın `@media print { @page { size: a3 } }` kuralı
global olduğu (kapsamlanamadığı) için paketten çıkarılır (`removePageRules`).

Lisans bildirimi: küçültücü (Vite CSS minify) `/*! */` yorumlarını da sildiği için başlıklar derlenmiş pakette
kalmaz. Bu yüzden derleme sonunda `src/zto/styles/thirdPartyNotice.ts` içindeki `ztoLicensePlugin`, ZTO CSS
paketinin başına tüm bileşenlerin telif/lisans bildirimini (MIT metni ve Font Awesome atfı dahil) ekler;
`npm run check:zto-css` bildirimin pakette olduğunu denetler.
