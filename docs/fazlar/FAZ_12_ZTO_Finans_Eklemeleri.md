# FAZ 12 — ZTO Fabrika Finans Eklemeleri (ZTO görünümlü ekranlar, eksik finans modülleri, çoklu şirket, personel/bordro, e-belge, ZTO entegrasyonu)

> **Durum (2026-11-13): 12.0 tamam, 12.1a sırada.** Analiz ve karar matrisi tamam (`docs/zto-finans/`, MX1–MX9). §6.1 ve §6.2 kararları (Y1–Y9) alındı (2026-11-13). Dal: `zto-finans-eklemeleri` (push yok, commit kullanıcı isteyince).
> **Önkoşul:** JDK 21, Maven 3.9, Docker Desktop — 2026-11-13'te kuruldu (Maven: `%USERPROFILE%\tools\apache-maven-3.9.16`).
>
> **Uygulama Notu 12.0 (2026-11-13) — Ön yüz altyapısı tamam; `zto-finans-eklemeleri` dalında, push yok.**
>
> **Yapılanlar:** ZTO CSS'i (SB Admin 6.0.0 / Bootstrap 4.4.1, DataTables 1.10.20 + Buttons 2.2.2, select2 4.1.0-rc.0 + bootstrap teması, ZTO `layout.css` ve `_ExpertLayout` satır içi stili) `frontend/src/zto/styles/vendor/` altına birebir kopyalandı; `postcss-prefix-selector` ile `.zto-finans` altına alınır (`html/body/:root` → kök sınıf), ZTO'daki yükleme sırasıyla tek tembel CSS parçasında yüklenir (~370 KB, gzip ~66 KB). Font Awesome 5.15.4 ve Open Sans 400/600 yerelden (CSP: CDN yok). Lisans bildirimi derlenmiş paketin başına eklenir (`thirdPartyNotice.ts`), `npm run check:zto-css` kapsam dışı seçiciyi, lisans bildirimini ve çakışan `@keyframes` adını denetler (CI adımı). Ortak bileşenler (`frontend/src/zto/components/`): DataTables görünümlü `ZtoDataTable` (`@tanstack/react-table`; sayfalama/arama/sıralama, Kopyala/Excel/PDF/Yazdır), select2 görünümlü `ZtoSelect`, `ZtoBranchSelect` / `ZtoBranchMultiSelect` (MX5 §5 varyantları; şirket › grup optgroup), react-bootstrap 1.6.8 `ZtoModal` / `ZtoConfirmModal` (portal = kapsam kökü, modal içi açılır listeler `.modal` içinde), `ZtoTooltip`, `ZtoChart` (chart.js, tembel), `ZtoPageHeader`; tr-TR biçimler (`format.ts`), dışa aktarım (`export/`: exceljs, pdfmake — dinamik import; formül enjeksiyonuna karşı `'` öneki). Şube ağacı `useBranchTree` 12.1a'ya kadar `/organization/branches`'tan türetilir (şirket yok, grup "Diğer"). Menü: Blackrose Drawer'da Finans altında "ZTO Finans" (`/zto-finans/*`, FINANCE_VIEW); sayfa içinde ZTO `zt-sidebar` (27 öğe, `_SideMenu_FinanceItems` sırası, 04 §3'te ÇIKAR olan 10 öğe yok, uygulanmamışlar pasif + "Faz 12.x"). Varsayılan sayfa Cari Hareketler: AllTransactions iskeleti + "Faz 12.1 ile gelecek"; DEV'de `/zto-finans/vitrin` bileşen vitrini (üretim paketinde yok). `i18n.ts` ad alanlarına bölündü: `translation` 27 modül dosyası (`frontend/src/locales/tr/`, eski 1274 anahtar birebir), yeni `ztoFinans` ad alanı. **Backend:** cari/fon bakiye, dönem başı bakiye, ekstre (+ sayım), açılış denetimi, banka mutabakatı adayları/elle eşleme ve çek geçmişi sorgularına `deleted = false` (04 §8); elle eşlemede silinmiş hareket artık 404.
>
> **Kararlar / sapmalar:** Excel için SheetJS yerine **exceljs** (SheetJS npm sürümünde CVE-2023-30533, CVE-2024-22363). 04 §2'deki `@layer zto` emniyet katmanı **uygulanmadı** (CssBaseline katmansız olduğu için kök içinde Bootstrap'ı ezerdi; katmanda `!important` sırası tersine döner) — sızmayı önek önler, e2e sızma testi doğrular. `@keyframes` adlarına `zto-` öneki verilmedi; çakışma `check:zto-css` ile yakalanır. Bootstrap'ın global `@page { size: a3 }` kuralı paketten çıkarıldı. DataTables düğmeleri ZTO'nun yüklediği Buttons 2.2.2 (`dt-button`) işaretlemesiyle; Bootstrap 4 düğme düzeni seçenekle.
>
> **Doğrulama:** Frontend lint, biçim, 451 vitest testi (`src/**/*.ts` kapsamı satır %93,5 / dal %96,6), build, `check:zto-css`. Playwright `e2e/zto-finans.spec.ts`: yönlendirme, yan menü, ZTO ziyaretinden önce/sonra /finance, /operations, /fleet'te MUI ve düz HTML öğelerinin hesaplanmış stilleri birebir aynı (CSS sızma testi), kök içinde Bootstrap/FA/Open Sans/modal stilleri. Backend `mvn clean verify -Pcoverage`: 80 birim + 215 entegrasyon testi, kapsam satır %95,4 / dal %82,3; `DeletedTransactionFilterIT` silinmiş hareketin bakiye, ekstre, yaşlandırma, rapor, bakiye yeterliliği, mutabakat, çek geçmişi ve açılış denetiminde sayılmadığını doğrular (düzeltme geri alınınca 5/5 kırılır). Aynı commit'te mevcut modüllere (CRM, finans, filo, entegrasyon, SaaS, sefer, açılış stoku/faturası) hata yolu testleri eklendi. İnceleme: 4 mercek (CSS kapsamı, ZTO sadakati, doğruluk/erişilebilirlik, güvenlik/bağımlılık/backend) 31 bulgu, şüpheci doğrulamada 24'ü gerçek — hepsi düzeltildi ve testlendi.
>
> **Açık kalanlar:** Vitrindeki sayfaya özgü stiller (`.stat-main-card`, `.filter-field`) sayfa CSS'leriyle 12.1/12.2'de gelecek. Menüde rol bazlı gizleme (ZTO'da Personel/Uyumsoft ayarları yalnız süper kullanıcı) ekranlar geldikçe. react-bootstrap 1.6 (Bootstrap 4 hattı) React 19'a geçişte yeniden değerlendirilmeli (findDOMNode). Sunucu taraflı tablo modunda dışa aktarım yalnız geçerli sayfayı kapsar.

**Amaç:** ZTO Fabrika'nın (`.NET 8 MVC`) finans ve personel ekranlarını **aynı görünüm ve akışla** Blackrose'a eklemek; Blackrose'da olmayan modülleri (çoklu şirket, kredi, vadeli mevduat, çek koçanı, döviz bozumu, cari belge, sezon devri, cari transfer, bilanço, tek masraf modeli, personel/bordro, Uyumsoft e-Dönüşüm, ZTO Fabrika canlı entegrasyonu) **Blackrose'un mevcut finans motoru üzerinde** yazmak.

**İş gereksinimi (2026-11-13):** Bir kiracı (lojistik firması) kendisine ait 2–3 ayrı şirket adına alış, satış, nakliye faturası, personel tanımı ve maaş ödemesi yapabilmelidir.

**Bağımlılık:** Faz 0–7 (tamam). Faz 8'in e-belge portu ve Faz 4'ün navlun faturası bu fazda genişletilir.
**Çıktı:** Menüde "ZTO Finans" ve "Personel" grupları; ZTO kullanıcısının tanıdığı ekranlar; aynı verinin Blackrose MUI ekranlarında da görünmesi; şirket bazında belge, rapor ve bordro.

**Referans belgeler (önce okunmalı):**
1. `docs/zto-finans/00_README.md` — devir notu, okuma sırası
2. `docs/zto-finans/analiz/04_UYARLAMA_KARAR_MATRISI.md` — **tek yetkili karar belgesi**: §3 sayfa kararları (§3.3 2026-11-13 eklemeleri), §4 migration sırası (Z-kimlikleri), §6.1/§6.2 iş kuralı kararları, §7 taşınmayacak ZTO hataları
3. `docs/zto-finans/analiz/matris/MX1…MX9` — her modalın alanları, doğrulamaları, ZTO uçları (dosya:satır), Blackrose eşlemesi

---

## Temel kurallar (bu faza özel)

1. **Kod kopyalanmaz (01_ANA_PROMPT §0 geçerli).** ZTO'nun Razor/jQuery/C# kodu taşınmaz; her ekran React/TypeScript ile, her iş kuralı Java ile yeniden yazılır. **Tek istisna:** ZTO'nun CSS'i (SB Admin 6 + Bootstrap 4.4.1, MIT) ve ZTO'ya ait görsel varlıklar `.zto-finans` kapsamında olduğu gibi kopyalanır.
2. **Ekran birebir:** Her sayfa ve modal ZTO'daki HTML yapısı, alan sırası, etiketler, doğrulama mesajları ve akışla yazılır. Fark yalnız 04 §6'daki kararlarda ve 04 §7'deki ZTO hatalarının düzeltilmesindedir. ZTO'da olmayan ekranlar (Şirketler, entegrasyon yönetimi) ZTO görünümünde yeni tasarlanır.
3. **Tek finans motoru:** Cari hareketi yalnız `LedgerService`, banka/kasa hareketi yalnız `FundLedgerService` yazar; ödeme/tahsilat `SettlementService` üzerinden. Her kayıt `source_type/source_id` ile kaynağına bağlıdır. Silme/düzeltme = ters kayıt veya belge iptali + yeni belge (ekrandaki düğme aynı kalır). Saklı bakiye kolonu yok.
4. **Şirket kapsamı:** Para ve yasal belge tablolarında `company_id` + bileşik FK `(branch_id, company_id)`; fon transferi yalnız aynı şirket içinde; şirketler arası işlem intercompany cari ile (MX5).
5. **Blackrose MUI finans ekranları kaldırılmaz;** iki ekran seti aynı API'yi kullanır.
6. **Migration numaraları:** 04 §4'teki Z-kimlikleri sırayı verir; gerçek `V` numarası yazıldığı anda sıradaki boş numaradır.
7. Her alt adım: Flyway migration + servis + entegrasyon testi (Testcontainers) + ekran + vitest testi; CI eşikleri (satır %93, dal %76) korunur; OpenAPI sözleşme testi güncellenir (`docs/api/openapi.json`).
8. **Kişisel veri:** TCKN, IBAN, adres şifreli + hash + maskeli; sağlık bilgisi serbest metin tutulmaz; `docs/KVKK_VERI_ISLEME_KAYDI.md` güncellenir.

## Kapsam / Görevler

| Adım | İş | Migration (04 §4) | ZTO ekranları | Ek | Bağımlı |
|---|---|---|---|---|---|
| 12.0 | Ön yüz altyapısı: ZTO CSS'in `postcss-prefix-selector` ile `.zto-finans` altına alınması; `react-bootstrap` modal (container = kapsam kökü, z-index MUI AppBar üstü); DataTables görünümlü `@tanstack/react-table`; select2 görünümlü arama kutulu select; ortak `ZtoBranchMultiSelect` / `ZtoBranchSelect`; Font Awesome 5 CSS webfont; `xlsx`/`pdfmake`/`chart.js`; tr-TR biçimler; `i18n.ts` ad alanlarına bölünür (TR + anlamsal anahtar); "ZTO Finans" menüsü, varsayılan sayfa Cari Hareketler. **Blackrose düzeltmesi:** bakiye/ekstre sorgularına `deleted = false` | — | — | MX4 B, MX5 §5, MX9 C | — |
| 12.1a | **İş yeri / şube / çoklu şirket:** Şirket (tüzel kişi) → Şube (il/grup) → İş Yeri ağacı; şirket başına unvan, VKN, vergi dairesi, SGK sicili, logo, belge serisi; varsayılan şirket göçü; kullanıcı iş yeri kısıtı; `GET /organization/branch-tree`; şirket seçici + konsolide görünüm; plan limitleri | Z01–Z05, ZA1 | BranchProvince, WorkPlace (Index/Add/Edit), yeni "Şirketler" ekranı | MX5 | 12.0 |
| 12.1 | Cari: profil/limit/alt grup, cari IBAN'ları, Borç/Alacak Ekle (vergi, ceza türleri), sezon devri, cari transfer (+ tüm çek/senet) | Z06, Z10–Z12 | CustomerAccounts (Index/Add/Edit), AccountTransaction (Transactions, AllTransactions, Statement), BankAccounts | MX1, MX8 §3 | 12.1a |
| 12.2 | Banka / kasa / transfer merkezi / döviz bozumu | Z07, Z13, Z14 | BankIntroduction, CashIntroduction, BankTransactions, CashTransactions, BankStatement | MX2 | 12.1 |
| 12.2a | **Ödemeler ve tahsilatlar** (2026-11-13): ödeme/tahsilat listeleri, ortak modallar (ekle/düzenle/plan sonrası), günlük ödeme ve tahsilat raporları; yöntemler Nakit/Banka/Çek/Senet/Kredi Kartı; düzeltme = `POST /settlements/{id}/correct`; faturayla eşleştirme | Z15, Z16 | CustomerAccountPayment (Payments, DailyPaymentReport), CustomerAccountCollection (Collections, DailyCollectionReport, `_CollectionModalsPartial`), `Views/Shared/_AddPaymentModal`, `_PostPaymentPlanningModal` | MX7 | 12.2 |
| 12.3 | Çek / senet / koçan | Z08, Z09 | Checks, Bills, CheckBooks, EditCheck, CheckDocuments | MX3 | 12.2a |
| 12.4 | Ödeme planı ve onay: plan modalları, 5 seviyeli ısı haritası, **PaymentApproval/Index** (sekmeler, onay panosu, toplu onay/red/talimat), PaymentManagement ekranları; "Ödendi"/"Ödemeyi Kaydet" banka/kasa seçimli | Z19 | PaymentApproval/Index, PaymentManagement, Transactions plan modalları | MX3 §2.7, MX7 §1.12 | 12.3 |
| 12.5 | Kredi sözleşmeleri (geçmiş krediler için açılış borcu içe aktarma) | Z18 | CreditContracts (Index/Add/Details/Dashboard/Documents), AccountCredits | MX3 §2.6, MX7 §5 | 12.4 |
| 12.6 | Vadeli mevduat | Z17 | TimeDeposits | MX2 §2.5 | 12.2 |
| 12.7 | Tek masraf modeli + **taşeron (sevkiyat araç) gideri** | Z20, Z21 | ExpenseItems, ProductionExpenses ("Genel Masraf"), SalesTruckExpenses | MX4 A, MX8 §1 | 12.1 |
| 12.8 | Raporlar: yaşlandırma/performans, FinanceReport, bilanço, **kur farkı raporu ve kaydı** (Y8'e bağlı), **8 haftalık nakit akışı**, kur ekranı | (Z10) | CustomerAccountReport, FinanceReport, FinancialBalanceSheet, RecipeFinance (FxReport, CashFlow), Currency | MX1, MX8 §6 | 12.1–12.7 |
| 12.9 | **Personel ve bordro:** personel kartı, şirket/iş yeri/SGK bazında istihdam, yasal kurallara göre bordro motoru (yıllık parametre tablosu), dört göz onay, toplu ödeme, avans, ek ödeme, devamsızlık, izin, zimmet, pano, raporlar, SGK bildirimi takibi; sürücü = personel (`driver.personnel_id`); net ücret personel carisine, SGK/GV/DV şirket başına kamu carilerine | Z22–Z30, ZA2 | Personnel, PersonnelSalary, PersonnelAdvance, PersonnelAdditionalPayment, PersonnelAbsence, PersonnelLeave, PersonnelAsset, PersonnelDashboard, PersonnelReports, SGKDeclaration | MX6 | 12.1a, 12.2 |
| 12.10 | **Uyumsoft e-Dönüşüm** (2026-11-13): `UyumsoftEDocumentProvider` (WSDL + test hesabı gelince), şirket başına ayar, gönderim işlem dışında, gelen kutusu → alış faturası (ETTN tekil), GİB uyumlu e-İrsaliye UBL'i, `EDocumentInboxJob`, zamanlayıcı havuzu + ShedLock | Z31–Z34 | Uyumsoft pano, ayarlar, gelen kutusu, giden belgeler (7 ekran/parça) | MX9 B, D | 12.1a |
| 12.11 | **ZTO Fabrika ↔ Blackrose canlı entegrasyon** (eski prompt K5): taşıma talebi → sefer, araç/sürücü/plaka, durum olayları, POD, navlun faturası → fabrika carisi, konum; OAuth2 client credentials + HMAC webhook; `externalRef` idempotency; transactional outbox; aşamalar E0–E6. ZTO tarafındaki 12 değişiklik ayrı iş | Z35–Z39, ZA3 | ZTO tarafı: satış sevkiyatı / nakliyeci seçimi (yalnız referans) | MX9 A | 12.1a, 12.2a, 12.10 |

## İş kuralları

**Kararlaştırılan (04 §6.1, 2026-11-12):**
- "Ödendi": onay modalına zorunlu banka/kasa seçimi; gerçek ödeme `PaymentPlanService.pay` ile.
- Ceza/kesinti: iki belge türü — "Ceza (bize kesilen)" Borç Ekle, "Ceza / Kesinti (karşı tarafa kesilen)" Alacak Ekle.
- Cari transfer: bağlı **tüm** çek/senetler yeni cariye geçer; her biri için `instrument_movement` (TRANSFERRED).
- Yoğunluk eşikleri: 4 eşik / 5 seviye (ZTO), karşılaştırma `<`.
- Plan ödemesi: tam tutar, yalnız banka/kasa. Investments kapsam dışı.
- Cari grupları ve çek durum eşlemesi: 04 §3.1, §3.2.

**Kararlaştırılan (04 §6.2, 2026-11-13):** cari kart şirketler arasında ortak, bakiye/ekstre şirket kırılımlı; bordro motoru yasal kurallara göre yeniden (ZTO hesabı taşınmaz, yıllık parametre tablosu); Şirket → Şube → İş Yeri katı ağacı; şirket başına belge serisi; tahsilat/ödeme faturayla bilgi amaçlı eşleşir (FIFO yaşlandırma kalır); taşeron gideri girildiği anda cariye; ZTO entegrasyonu OAuth2 client credentials + HMAC webhook; kur farkı = rapor + kullanıcı onaylı elle "Kur Farkı" belgesi; şirket seçici + konsolide; çapraz kur ve "Diğer" ödeme yöntemi ÇIKAR, kredi kartı = BANK + kanal; sarf deposu bu fazda yok; ikinci dil EN sonra.

## Kabul kriterleri

- [ ] 04 §3'teki her "UI…" kararlı sayfa ve modal, ZTO ile yan yana karşılaştırıldığında aynı yerleşim, alan, etiket ve akışa sahip (ekran görüntüsü karşılaştırması, sayfa başına).
- [ ] ZTO CSS'i Blackrose MUI sayfalarına sızmıyor (Playwright ile en az finans, sevkiyat, filo sayfaları).
- [ ] Z01–Z39 ve ZA1–ZA3 temiz bir şemada ve mevcut veriye sahip bir şemada hatasız çalışıyor; varsayılan şirket göçü mevcut kiracıları bozmadan geçiyor.
- [ ] İki şirketli bir kiracıda: her şirketin kendi fatura serisi, e-belge göndericisi, logosu, bakiyesi ve bordrosu ayrı; konsolide görünüm toplamları tutuyor; kullanıcı yalnız yetkili olduğu iş yerlerini görüyor.
- [ ] Her yeni defter yazan akış için entegrasyon testi: kayıt, ters kayıt, idempotent tekrar, yetki reddi, kiracı ve şirket izolasyonu.
- [ ] Kredi: eşit taksit / eşit anapara / balon / rotatif ödeme tabloları bilinen örneklerle doğrulanmış (gün sayımı, BSMV, KKDF).
- [ ] Vadeli mevduat ve döviz bozumu bakiyeleri fon ekstresiyle tutarlı; kur farkı `fin_income_expense`'te.
- [ ] Bordro: resmî örnek hesaplarla (kümülatif matrah, asgari ücret istisnası, SGK tavanı, işveren payı) birebir; parametreler yıl bazında tablodan; onaysız bordro ödenemiyor.
- [ ] e-Belge: aynı fatura gelen kutusundan iki kez alış faturası olamıyor (ETTN); gönderim veritabanı işlemi dışında.
- [ ] Entegrasyon: aynı `externalRef` iki sefer üretmiyor; imzasız/yanlış imzalı webhook reddediliyor; outbox yeniden denemeyle tüm olayları teslim ediyor.
- [ ] `mvn verify` ve frontend `npm run lint && npm test && npm run build` yeşil; kapsam eşikleri korunuyor; `docs/api/openapi.json` güncel.

## ERP referansı

ZTO kaynağı: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (salt okunur). Controller/View/dosya:satır referansları MX1–MX9'da. ZTO'nun kendi hataları (04 §7) taşınmaz. ZTO'da ayrıca düzeltilmesi önerilenler: Uyumsoft şifreleme anahtarının koda gömülü varsayılanı (`UyumsoftController.cs:36`), view'larda açık Google Maps anahtarı (`Views/WorkPlace/Add.cshtml:106`, `Edit.cshtml:87`), bordro hesabı (MX6 R1–R23).

## Açık sorular

- Kiracı/şirket logosu rapor ve ekstre başlıklarında; şirket logosu Z01'de — eski kiracı logosu göçü.
- ZTO `PurchaseCurrentAccountController.cs:1251, :1297` öneksiz `BankTransactions`/`CashTransactions` tabloları canlıda var mı?
- `animate.css` ve `ProductionExpenses/*.gif` lisans/kaynak doğrulaması.
- Vadeli mevduat otomatik yenileme/aktarma zamanlanmış işi ilk sürümde olacak mı?
- Uyumsoft WSDL ve test hesabı ne zaman sağlanacak (12.10 önkoşulu)?
- ZTO Fabrika tarafındaki entegrasyon değişiklikleri (MX9 A, 12 madde) hangi fazda yapılacak?
