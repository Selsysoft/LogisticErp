# 04 — Uyarlama Karar Matrisi (Faz 1)

> Tarih: 2026-11-12, güncelleme 2026-11-13 (MX5–MX9: iş yeri/çoklu şirket, personel/bordro, ödeme/tahsilat/onay, kalan sayfalar, entegrasyon/e-belge/dil) · Durum: **§6.1 ve §6.2 kararlandı (2026-11-12/13); uygulama Faz 12.0 ile başlar**
> Kaynak: ZTO Fabrika finans modülü (`f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`, salt okunur)
> Hedef: LogisticErp "Blackrose" (`F:\visual studio zto\LogisticErp`, dal `zto-finans-eklemeleri`, push yok)
> Ayrıntılı ekler: [matris/MX1](matris/MX1_cari_rapor_bilanco.md) · [MX2](matris/MX2_banka_kasa_mevduat.md) · [MX3](matris/MX3_cek_senet_kredi_odeme_onayi.md) · [MX4](matris/MX4_masraf_ve_ui_kabugu.md) · [MX5](matris/MX5_isyeri_sube_coklu_sirket.md) · [MX6](matris/MX6_personel_bordro.md) · [MX7](matris/MX7_odeme_tahsilat_onay.md) · [MX8](matris/MX8_kalan_finans_sayfalari.md) · [MX9](matris/MX9_entegrasyon_edonusum_dil.md)
> Eklerdeki migration numaraları ajanların kendi önerisidir; **geçerli sıra §4'tür (Z-kimlikleri).**

---

## 0. Bu promptun kararlarını değiştiren kullanıcı kararları (2026-11-12)

| # | Karar | Etkisi |
|---|---|---|
| Y1 | Hedef repo `LogisticErp` (Java 21 / Spring Boot 3.5 + React 18 / MUI). Ayrı `.NET 8 MVC` projesi **açılmaz**. | `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` K1 (.NET) ve K2 (kodu kopyala) iptal. `01_ANA_PROMPT.md:8-10`'daki asıl karar ("Spring Boot; ZTO referanstır, kod kopyalanmaz") geçerli. |
| Y2 | LogisticErp'te olmayan ZTO finans özellikleri **eksiksiz** eklenir. | Kredi, vadeli mevduat, çek koçanı, döviz bozumu, bilanço, cari belge, devir vb. (§3). |
| Y3 | Ön yüz: **ZTO görünümü birebir.** Her sayfa ve modal aynı HTML yapısı, alan, sıra, etiket ve akışla React bileşeni olarak yazılır; ZTO CSS'i `.zto-finans` kapsamında kopyalanır. | Blackrose'un mevcut MUI finans ekranları korunur; iki ekran seti aynı arka ucu kullanır (§2). |
| Y4 | Git: yeni dal `zto-finans-eklemeleri`, commit/push yalnız kullanıcı isteyince. | Dal açıldı (2026-11-12). |

## 1. Temel ilke: tek finans motoru

ZTO'nun **ekranı** taşınır, **veri yazma mantığı taşınmaz.** Tüm kayıtlar Blackrose'un mevcut kurallarıyla yazılır:

| Kural | Blackrose | ZTO'daki karşılığı (taşınmaz) |
|---|---|---|
| Cari hareketin tek yazıcısı | `LedgerService` | Controller içinde doğrudan SQL |
| Banka/kasa hareketinin tek yazıcısı | `FundLedgerService` (satır kilidi + bakiye kontrolü) | Statik `CreateBankTransaction` / `CreateCashTransaction` |
| Bakiye | Hareketlerden hesaplanır | `ZT_BankIntroduction.Balance` kolonu da güncelleniyor (iki yöntem) |
| Düzeltme / silme | Ters kayıt; belge iptal + yeni belge | Fiziksel `DELETE`, yerinde `UPDATE` |
| Mükerrer kayıt | `source_type + source_id` UNIQUE | Sonradan "mükerrer cari temizle" uçları |
| Döviz | Hareket gününün kuru ve TL karşılığı sabitlenir | Karışık |
| Yetki | İzin matrisi + `@PreAuthorize`, iki kişi onayı | Tek metin rol; bazı sayfalarda yetki yok |

Sonuç: ZTO'da "sil" düğmesi olan her yerde düğme **aynı kalır**, arkada ters kayıt / iptal çalışır. Kullanıcının gördüğü ekran değişmez; yalnız §6'daki 4 nokta ekranda fark yaratır.

## 2. Ön yüz mimarisi (MX4 Bölüm B)

| Konu | Karar |
|---|---|
| CSS kaynağı | `wwwroot/Web/dist/css/styles.css` (SB Admin 6.0.0 — MIT — içine derlenmiş **Bootstrap 4.4.1**) + `wwwroot/css/*` içinden finans sayfalarının kullandıkları |
| Kapsamlama | Derleme anında `postcss-prefix-selector` ile tüm seçiciler `.zto-finans` altına alınır; `html`/`body` kuralları kök sınıfa çevrilir. ~~ek güvenlik için `@layer zto`~~ — **@layer uygulanmadı (2026-11-13):** katmansız CssBaseline'ın `*{box-sizing:inherit}` kuralı katmanlı Bootstrap'ı ezer; çok katmanlı düzende !important sırası da tersine döner. Önek tek başına yeterli; kazananı ZTO'daki gibi `@import` sırası belirler. `@keyframes` adları öneklenmez; aynı adın farklı gövdeyle iki kez tanımlanması `check:zto-css` ile yakalanır. Ayrıntı: `frontend/src/zto/styles/prefixTransform.ts` |
| Modal | `react-bootstrap` (BS4 uyumlu sürüm) + `container` = `.zto-finans` kökü; backdrop kapsam içinde kalır; z-index MUI AppBar (1201) üstüne alınır |
| Tablo | DataTables yerine `@tanstack/react-table`, **DataTables'ın ürettiği HTML/sınıflarla** (sayfalama, arama, sıralama görünümü aynı) |
| Arama kutulu select | select2 markup'ını üreten kendi bileşenimiz (ZTO tüm `select.form-control`'ü select2'ye çeviriyor) |
| Excel / PDF / Grafik | `xlsx` (SheetJS), `pdfmake`, `chart.js` + `react-chartjs-2` |
| İkon | Font Awesome 5 **CSS webfont** (ZTO'daki `all.min.js` React DOM'unu bozar) |
| Güvenlik başlıkları | Blackrose CSP `script-src 'self'`, `font-src 'self'` → **hiçbir CDN yok**, tüm paketler yerelde |
| Menü | Blackrose menüsüne "ZTO Finans" grubu; ZTO'nun `_SideMenu_FinanceItems` sırası korunur |
| Lisans | MIT/OFL/CC-BY — sorun yok. Highcharts ve FA Kit kopyalanmaz. ⚠ `animate.css` ve `ProductionExpenses/*.gif` kaynağı doğrulanacak |

## 3. Sayfa bazında karar özeti

Karar kodları: **UI-API** = ekran yazılır, Blackrose API'si olduğu gibi yeterli · **UI+GEN** = API genişletilir · **UI+YENİ** = yeni uç · **UI+TABLO** = yeni migration · **ÇIKAR** = taşınmaz.

| ZTO sayfası | Farklı modal | Karar | Blackrose dayanağı / eksik | Ek |
|---|---|---|---|---|
| CustomerAccounts (liste, ekle, düzenle) | 10 | UI+TABLO | `account` + profil alanları, limitler, alt grup, IBAN'lar (V22) | MX1 §2.4-2.5 |
| AccountTransaction / Transactions | 32 + 2 dinamik | UI+TABLO | Cari belge (V26), devir (V27), cari transfer (V28), plan genişletme (V33) | MX1 §2.2 |
| AllTransactions, Statement | (kopyalar) | UI+GEN / UI+YENİ | Çapraz cari hareket listesi, ekstre filtreleri | MX1 §2.1, 2.3 |
| CustomerAccountReport (yaşlandırma, performans) | 0 | UI+GEN | `/reports/aging`, `/reports/settlement-performance` | MX1 §2.6 |
| FinanceReport | 0 | UI+YENİ | `/reports/ledger-summary`, `/reports/ledger-accounts` | MX1 §2.7 |
| FinancialBalanceSheet | 2 | UI+YENİ | `/reports/balance-sheet`; stok ve iş yerleri arası ticaret modalları ÇIKAR | MX1 §2.8 |
| BankIntroduction, CashIntroduction | 2 + 2 | UI+TABLO | `fund_account` ek alanlar + açılış hareketi (V23) | MX2 §2.1-2.2 |
| BankTransactions, CashTransactions | 4 + 2 | UI+GEN | Çok hesaplı hareket araması, hareket detayı | MX2 §2.3 |
| BankStatement (transfer merkezi, döviz bozumu) | 12 | UI+TABLO | `fund_transfer`, maliyet, kaynak (V29); cari onarım uçları ÇIKAR | MX2 §2.4 |
| TimeDeposits | 2 | UI+TABLO | `time_deposit`, `time_deposit_event` (V31), gelir defteri (V30) | MX2 §2.5 |
| PurchaseCurrentAccount | 7 | Çoğu ÇIKAR | Bahçe/hasat/kesim çavuşu ÇIKAR; nakliye → taşeron ödemesi, malzeme → alış faturası ödemesi | MX2 §2.6 |
| Checks + Bills (senet) | ~18 | UI+TABLO | `instrument` ek alanlar + 4 yeni durum (V24) | MX3 §2.1-2.4 |
| CheckBooks | 1 | UI+TABLO | `check_book`, `check_leaf` (V25) | MX3 §2.3 |
| AccountCredits | 2 | UI+GEN | Cari alacak görünümü (banka kredisi değil) | MX3 §2.5 |
| CreditContracts | 23 | UI+TABLO | `credit_contract`, taksit, hareket (V32) | MX3 §2.6 |
| PaymentManagement (eski akış) | 8 | UI+GEN | Ekranlar ZTO görünümünde, motor Blackrose `payment_plan` (V33); eski `ZT_PaymentPlans` ÇIKAR | MX3 §2.7 |
| PaymentApprovalApi | — | ÇIKAR | Tek ucunu çağıran kod yok (ölü uç) | MX3 §1.13 |
| ExpenseItems | 0 | UI+GEN | `expense_type/item` PUT/DELETE, açıklama/birim; "kalem = cari" deseni ÇIKAR | MX4 §A.4 |
| ProductionExpenses ("Genel Masraf") | 5 (2 ölü) | UI+TABLO | Tek masraf modeli `expense`, `expense_line` (V34); "Üretim Bilgileri" → "Bağlam Bilgileri" | MX4 §A.5 |
| Investments | 5 | ÇIKAR | Çekirdek iş değil; sahte banka hesabı açıyor. İleride ayrı faz. | MX4 §A.6 |

**Toplam:** yaklaşık 145 farklı modal (kopyalar hariç) incelendi; tarım/üretime özgü yaklaşık 25 modal ÇIKAR, geri kalanı ZTO görünümünde yazılacak.

### 3.1 Cari grupları → Blackrose cari türü (MX1 §2.0)

| ZTO grubu | Blackrose `type` / `sub_group` |
|---|---|
| Müşteri | CUSTOMER |
| Nakliye, Sevk Nakliye | CARRIER |
| Tedarikçi, Malzeme, İlaç, Analiz | SUPPLIER / GENEL, YEDEK_PARCA_SERVIS, AKARYAKIT, HIZMET |
| Üretim Çavuşu | SUPPLIER / ELLECLEME_TASERON |
| Personel | EMPLOYEE (+ yeni izin `FINANCE_EMPLOYEE_VIEW`) |
| Kredi banka hesabı | BANK |
| Masraf Hesabı | Cari değil → masraf kalemi |
| Kesim Çavuşu | ÇIKAR |
| İş Yeri Firması | ÇIKAR → Blackrose şubesi; **şirketler arası** yansıma `account.represents_company_id` (MX5; eski öneri `represents_branch_id` geçersiz) |

### 3.2 Çek/senet durumları → `InstrumentStatus` (MX3 §2.2)

Portföyde→PORTFOLIO · Bankada / Bankaya Yatırıldı→AT_BANK · Tahsil Edildi→COLLECTED veya COLLECTED_TO_CASH · Ciro Edildi→ENDORSED · Karşılıksız→BOUNCED · Kullanıldı→ISSUED · Çek Ödendi→PAID · "Kasaya Al (Ciro)"→PORTFOLIO + `custody_fund_id` · **Bekliyor ve geri sarma geçişleri ÇIKAR** · Yeni: CANCELLED, RETURNED, COLLATERAL (teminat), PROTESTED (senet).

### 3.3 2026-11-13 eklemeleri (kapsam taraması sonrası)

Faz 0 envanter promptları (A, B, C) ve ana promptun §4.1 sayfa listesi matrislerle karşılaştırıldı; eşlenmemiş kalan sayfalar MX5–MX9 ile kapatıldı.

| ZTO sayfası / konu | Modal | Karar | Blackrose dayanağı | Ek | Adım |
|---|---|---|---|---|---|
| BranchProvince (Şube/il), WorkPlace (İş Yeri) | 0 | UI+TABLO | Z01–Z05; ZTO'da iş yeri tüzel kişi **değil** — çoklu şirket ZTO'nun ötesinde, "Şirketler" ekranı ZTO görünümünde yeni tasarlanır | MX5 §1, §4 | 12.1a |
| Şube gruplu çoklu seçim (4 kopya desen) | — | UI+YENİ | Ortak `ZtoBranchMultiSelect` / `ZtoBranchSelect`, `GET /organization/branch-tree`; referans `Payments.cshtml:430-534` | MX5 §5 | 12.0 / 12.1a |
| CustomerAccountPayment/Payments + Günlük Ödeme Raporu | 4 + ortak | UI+TABLO | `settlement` + Z15; yöntemler Nakit/Banka/Çek/Senet/Kredi Kartı (BANK + kanal); "Diğer" ve çapraz kur ÇIKAR | MX7 §1–2 | 12.2a |
| CustomerAccountCollection/Collections + Günlük Tahsilat Raporu | 3 + partial | UI+TABLO | `settlement` + Z15, Z16; siparişe tahsis → fatura eşleştirme; bahçe paylaştırması ÇIKAR | MX7 | 12.2a |
| Ortak modallar `addPaymentModal`, `editPaymentModal`, `postPaymentPlanningModal`, `addCollectionModal`, `editCollectionModal` | 5 | UI+GEN | Düzeltme = `POST /settlements/{id}/correct` (ters + yeni, tek işlem) | MX7 §1 | 12.2a |
| PaymentApproval/Index (aktif onay ekranı) | 4 | UI+GEN | `payment_plan` sekme eşlemesi, `approval-board`, toplu `order`; "Tamamla" ÇIKAR → banka/kasa seçimli ödeme | MX7 §1.12, §2 | 12.4 |
| CustomerCurrentAccounts | 2 | ÇIKAR | Satış paneli; cari listesinde "Müşteri" ön ayarı yeterli | MX7 | — |
| `SQL/KrediBankaCari_Migration.sql` | — | Z18'de karşılandı | Geçmiş kredilerin açılış borcu `OpeningBalanceImportService` ile | MX7 §5 | 12.5 |
| SalesTruckExpenses (sevkiyat araç masrafı) | 2 (kırık) | UI+TABLO | `trip_cost` SUBCONTRACTOR + Z20; taşeron gideri hemen cariye (§6.2-Y6) | MX8 §1 | 12.7 |
| BankAccounts (cari IBAN ekranları) | — | UI+TABLO | Z06 `account_bank_account` | MX8 §3 | 12.1 |
| MaterialStockAll, MaterialStockProduction | — | ÇIKAR | Üretim ambalaj/hammadde stoğu; yakıt/lastik `vehicle_expense` + Z21 | MX8 §2 | — |
| Finance/Index, FinanceMaintenance, FinancePerson | — | ÇIKAR | Eski sayfa / Blackrose kuralları gereksiz kılıyor / yerine roller + `user_branch` | MX8 §4 | — |
| AmountType, TransactionType | — | ÇIKAR | Finansta yalnız `'Giriş'/'Çıkış'` kolonu → `FundDirection` | MX8 §5 | — |
| Currency (kur ekranı) | — | UI-API | `/currencies`, `/exchange-rates` | MX8 §6 | 12.8 ✅ (salt okunur, OK-12.8-13) |
| RecipeFinance: FxReport + kur farkı kaydı kesimi | — | UI+YENİ (§6.2-Y8) | Dövizli hareketin güncel kura göre farkı → `account_document` "Kur Farkı"; Blackrose FAZ_02 kararı "kur farkı kaydı yok" ile **çelişir** | bu belge | 12.8 ✅ (`POST /finance/fx-differences`, `uygulama/12.8_TASARIM.md` §3.2) |
| RecipeFinance: CashFlow (8 hafta nakit projeksiyonu) | — | UI+GEN | Blackrose tahmin/dashboard genişletilir (cari vadeleri, alınan/verilen çek, senet) | bu belge | 12.8 ✅ (`/finance/reports/cash-flow`, OK-12.8-9) |
| RecipeFinance: Index, masraf–sevkiyat bağları | — | ÇIKAR | Reçete/ihracat sevkiyatı, üretim ve stok tablolarına bağlı | bu belge | — |
| Personel modülü (11 ekran: kart, maaş, avans, ek ödeme, devamsızlık, izin, zimmet, pano, raporlar, SGK) | ~8 | UI+TABLO | Z22–Z30, ZA2; bordro motoru **yasal kurallara göre yeniden** (§6.2-Y2) | MX6 | 12.9 |
| Uyumsoft e-Dönüşüm (ZTO canlı ekranlar; SOAP katmanı `TODO(WSDL)` iskeleti) | — | UI+TABLO | `UyumsoftEDocumentProvider`, şirket başına ayar, gelen kutusu → alış faturası, GİB uyumlu irsaliye UBL'i; Z31–Z34 | MX9 B | 12.10 |
| ZTO Fabrika ↔ Blackrose canlı entegrasyon (eski prompt K5) | — | UI+YENİ | 14 dış uç `/api/v1/integrations/zto/...`, OAuth2 client credentials, HMAC webhook, outbox; Z35–Z39, ZA3 | MX9 A | 12.11 |
| Lokalizasyon (ZTO tr/en/fr/ar) | — | 12.0 kararı | ZTO ekranları TR + anlamsal anahtar; `i18n.ts` ad alanlarına bölünür; ikinci dil EN sonra | MX9 C | 12.0 |
| Arka plan işleri | — | UI+GEN | `EDocumentInboxJob`, `IntegrationOutboxDispatcher`; zamanlayıcı havuzu + ShedLock | MX9 D | 12.10–12.11 |
| Finans rolünün açılış sayfası | — | 12.0 kararı | ZTO'da iki farklı açılış (01 §8 #6); "ZTO Finans" menüsünün varsayılanı Cari Hareketler (`AllTransactions`) | 01 §8 | 12.0 |

**Güncel toplam:** ~21 ZTO finans sayfası + 11 personel ekranı + iş yeri/şube + Uyumsoft ekranları; yaklaşık 175 farklı modal incelendi. Tarım, üretim ve satışa özgü olanlar ÇIKAR.

## 4. Birleştirilmiş migration sırası (2026-11-13, MX1–MX9)

> **Numaralandırma kuralı:** Aşağıdaki **Z-kimlikleri** mantıksal sıradır ve bağımlılığı gösterir. Gerçek Flyway sürümü, migration yazıldığı anda tenant klasöründeki **sıradaki boş numara** olur (bugün V22). Bir adım atlanır ya da sonraya kalırsa numaralar kaymaz; FK yalnız daha önce çalışmış tablolara kurulur. Eklerdeki (MX1–MX9) `V22…`, `V2xP…`, `V22a…` adları geçersizdir; karşılıkları bu tablodadır. 2026-11-12 sürümündeki V22–V34 sırası bu tabloyla **değiştirildi**.

### 4.1 Tenant şeması

| Z | Ad | İçerik | Kaynak | Adım |
|---|---|---|---|---|
| Z01 | `company` | Tüzel kişi: unvan, kısa ad, VKN/TCKN, vergi dairesi, MERSİS, SGK işyeri sicili, adres, iletişim, logo, varsayılan IBAN | MX5 §3.3 V22a | 12.1a — **uygulandı: `V22__company`** |
| Z02 | `branch_group_and_branch_details` | `branch_group` (ZTO Şube/il), `branch` +`company_id`, il, telefon, adres, konum, aktif; **varsayılan şirket göçü** (mevcut kiracı bilgisinden) | MX5 V22b | 12.1a — **uygulandı: `V23__branch_group_and_branch_details`** |
| Z03 | `company_scope_columns` | Para ve yasal belge tablolarına `company_id` + bileşik FK `(branch_id, company_id) → branch(id, company_id)` | MX5 V22c | 12.1a — **uygulandı: `V24__company_scope_columns`** |
| Z04 | `document_series` | Şirket başına belge serisi (önek + yıl + sıra), `UNIQUE(company_id, number)`; navlun/depo faturası numaraları buraya taşınır | MX5 V22d | 12.1a — **uygulandı: `V25__document_series`** |
| Z05 | `user_branch_scope` | `user_branch`, kullanıcı başına iş yeri kısıtı | MX5 V22e | 12.1a — **uygulandı: `V26__user_branch_scope`** |
| Z06 | `account_profile` | `account` +17 kolon (profil, limit, `sub_group`, `active`; **`represents_company_id` ve `company_id` Z06'ya girmez, 12.1a'da V24'te (Z03) eklendi**, bkz. `uygulama/12.1a_TASARIM.md` §0.3 S-8); `account_group` + tohum; `account_bank_account` (IBAN **veya** hesap no zorunlu CHECK; aktif kartlarda IBAN tekil; son işlem tarihi hesaplanır); izin `FINANCE_EMPLOYEE_VIEW` | MX1 + MX2 + MX5 D-kararı + MX8 §1.9 | 12.1 — **uygulandı: tenant `V27__account_profile`** (bireysel carinin TCKN'si şifreli kolonlar dahil; `uygulama/12.1_TASARIM.md` §1.1) |
| Z07 | `fund_account_details` | `fund_account` ek alanlar, `fund_transaction.category`, `fund_opening` | MX2 | 12.2 — **uygulandı: tenant `V31__fund_account_details`** (hesap türü, şifreli + maskeli hesap no, banka şube adı, açıklama, aktif, güncelleme sayacı; `fund_opening`; `uygulama/12.2_TASARIM.md` §1.1) |
| Z08 | `instrument_extensions` | Çek/senet ek alanları, 4 yeni durum | MX3 | 12.3 — **uygulandı: `V37__instrument_extensions`** (keşide tarihi, şube, keşideci, açıklama, emanet kasası, senet türü, `is_collateral`, `settled_date`, hareket `fund_account_id`, CANCELLED/RETURNED hariç tekil numara indeksi; `uygulama/12.3_TASARIM.md` §1.1) |
| Z09 | `check_book` | `check_book`, `check_leaf` | MX3 | 12.3 — **uygulandı: `V38__check_book`** (koçan + yaprak, `instrument.check_leaf_id` tekil; `uygulama/12.3_TASARIM.md` §1.2) |
| Z10 | `account_document` | Borç/Alacak Ekle belgesi + vergi satırı; belge türlerine "Ceza (bize kesilen)", "Ceza / Kesinti (karşı tarafa kesilen)", **"Kur Farkı"** (§6.2-Y8'e bağlı) | MX1 + §6.1-K2 | 12.1 — **uygulandı: `V28__account_document`** ("Kur Farkı" tohumlu). 12.8 — **uygulandı:** tür `selectable = FALSE` kalır, yalnız Kur Farkı Raporu "Kes" akışıyla yazılır (OK-12.8-1); kesim kuru/tarihi ve kaynak bileşik FK'si Z42 → `V41` (`uygulama/12.8_TASARIM.md` §1.1) |
| Z11 | `account_rollover` | Sezon devri | MX1 | 12.1 — **uygulandı: `V29__account_rollover`** |
| Z12 | `account_transfer` | Cari transfer + `account_transfer_instrument` | MX1 + §6.1-K3 | 12.1 — **uygulandı: `V30__account_transfer`** (+ `account_transfer_line`, `instrument_movement.movement_type`) |
| Z13 | `fund_transfer` | Transfer merkezi, döviz bozumu, maliyet, kaynak; **yalnız aynı şirket içinde** (MX5) | MX2 | 12.2 — **uygulandı: `V32__fund_transfer`** (+ `fund_transfer_cost`, `fund_transfer_source`, şirketler arası virman `intercompany_transfer` (MX5 D8), şirket başına `FUND_TRANSFER` (VRM) / `INTERCOMPANY_TRANSFER` (SVR) serileri; §1.2) |
| Z14 | `fin_income_expense` | Faiz geliri, kur farkı, banka masrafı defteri | MX2 | 12.2 — **uygulandı: `V33__fin_income_expense`** (tek yazıcı `IncomeExpenseService`; döviz bozumu kur farkı FX_DIFF, transfer masrafı BANK_CHARGE; §1.3) |
| Z15 | `settlement_details` | Belge no, kanal (`CREDIT_CARD` dahil), karşı tarafın IBAN'ı (`account_bank_account` FK), düzeltme zinciri, iptal gerekçesi | MX7 V2xQ1 | 12.2a — **uygulandı: `V35__settlement_details`** (belge no, kanal TRANSFER/CREDIT_CARD, `counterparty_bank_account_id` bileşik FK, `corrects_settlement_id` tekil zincir, `reverse_reason`, `reversed_on` + geri doldurma; `uygulama/12.2a_TASARIM.md` §1.1) |
| Z16 | `settlement_allocation` | Tahsilat/ödemenin navlun, depo, açılış ve alış faturalarıyla bilgi amaçlı eşleşmesi (yaşlandırma FIFO kalır). **§6.2-Y5'e bağlı** | MX7 V2xQ2 | 12.2a — **uygulandı: `V36__settlement_allocation`** (tür başına hedef kolonu + bileşik FK `(x_id, company_id)`, beş hedef tabloya `UNIQUE (id, company_id)`; defter/FIFO/eksik fatura değişmez; §1.2) |
| Z17 | `time_deposit` | Vadeli mevduat + olaylar | MX2 | 12.6 |
| Z18 | `credit` | Kredi sözleşmesi, taksit, hareket, `settlement.origin_*`, FINANCE gider kalemleri; KrediBankaCari betiği burada karşılanır (MX7 §5) | MX3 | 12.5 |
| Z19 | `payment_plan_extensions` | Plan genişletmesi, `payment_instruction`, 5 seviyeli yoğunluk | MX1+MX2+MX3 + §6.1-K4 | 12.4 |
| Z20 | `trip_cost_subcontract` | `trip_cost` (SUBCONTRACTOR): KDV, tevkifat, kesinti, belge no/türü, `cost_date`, `status`, `replaced_by_id`; `shipment_leg.transport_mode` | MX8 V2xR1 | 12.7 — **uygulandı: `V39__trip_cost_subcontract`** (ödenecek = net + KDV − tevkifat − kesinti; ayrıntı `uygulama/12.7_TASARIM.md` §1.1) |
| Z21 | `expense` | Tek masraf modeli + bağlam | MX4 | 12.7 — **uygulandı: `V40__expense`** (`expense` + `expense_line`, tipli bağlam FK'ları + CHECK, `expense_item` ek alanları, GENERAL/OPERATION türleri; `uygulama/12.7_TASARIM.md` §1.2). 12.8: ayna kayıt **yok** (OK-12.8-12); SHIPMENT bağlamlı masraf sefer kârlılığına, VEHICLE bağlamlı araç maliyetine okunarak girer, migration yok |
| Z22 | `personnel_core` | Personel kartı (TCKN, IBAN, adres şifreli + hash + maskeli) | MX6 P1 | 12.9 |
| Z23 | `personnel_employment` | Şirket/iş yeri/SGK sicili bazında istihdam dönemi | MX6 P2 | 12.9 |
| Z24 | `payroll_run` | Bordro çalışması, satır, kalem, olay (dondurulmuş bileşenler, dört göz onay) | MX6 P4 | 12.9 |
| Z25 | `personnel_advance` | Avans (gerçek ödemeye bağlı) | MX6 P5 | 12.9 |
| Z26 | `additional_payment` | Ek ödeme türü + kayıt | MX6 P6 | 12.9 |
| Z27 | `absence_leave` | İzin türü, devamsızlık, izin | MX6 P7 | 12.9 |
| Z28 | `personnel_asset` | Zimmet | MX6 P8 | 12.9 |
| Z29 | `sgk_notification` | SGK giriş/çıkış/ücret değişikliği takibi | MX6 P9 | 12.9 |
| Z30 | `driver_personnel_link` | `driver.personnel_id`, mevcut sürücülerden personel kaydı, İK/bordro izinleri | MX6 P10 | 12.9 |
| Z31 | `edocument_extensions` | e-belge profil, GİB durumu, deneme sayısı, hata ayrıntısı | MX9 S6 | 12.10 |
| Z32 | `edocument_inbox` | Gelen kutusu (şirket başına) | MX9 S7 | 12.10 |
| Z33 | `purchase_invoice_edocument` | `purchase_invoice.ettn` tekil (çift navlun kaydını önler) | MX9 S8 | 12.10 |
| Z34 | `company_edocument_settings` | Şirket başına e-belge ayarı + `auto_kind`; eski tek satırlı `edocument_settings` bir sürüm sonra kaldırılır | MX5 V22f + MX9 | 12.10 |
| Z35 | `zto_partner` | ZTO Fabrika ortak kaydı (cari, şirket, iş yeri) | MX9 S1 | 12.11 |
| Z36 | `zto_transport_request` | Gelen taşıma talebi kuyruğu | MX9 S2 | 12.11 |
| Z37 | `integration_outbox` | Giden olaylar (transactional outbox) | MX9 S3 | 12.11 |
| Z38 | `partner_vehicle` | Ortağa atanan araç/dorse/sürücü | MX9 S4 | 12.11 |
| Z39 | `driver_identity` | Sürücü kimlik no (şifreli), uyruk — yalnız izinli ortağa ve e-İrsaliye UBL'ine | MX9 S5 | 12.11 |
| Z40 | `legacy_edocument_cleanup` | `edocument_settings` tablosu ve `freight_invoice_number_seq` / `warehouse_invoice_number_seq` DROP (SQL `uygulama/12.1_TASARIM.md` §1.6'da hazır) | 12.1a §1.2 | **Ertelendi** (12.1 OK-21): 12.1a + 12.1 üretime çıktıktan sonraki ilk backend adımında (12.2+), o adımın sıradaki boş V numarasıyla. 12.1'de yalnız ölü `EDocumentSettings` entity/repository silindi |
| Z41 | `account_document_invoice_flag` | `account_document_type.counts_as_invoice` (eksik fatura hesabında "fatura sayılan" belge türü; Sevk İrsaliyesi hayır, Yurt Dışı Fatura evet) | 12.2 K-12.2-4 (yeni, 2026-11-14) | 12.2 — **uygulandı: `V34__account_document_invoice_flag`** (§1.4). Z40 12.2'de de ertelendi (koşul: 12.1a + 12.1 üretimde) |
| Z42 | `account_document_fx_details` | Kur farkı belgesinin kesim kuru ve kur tarihi (`fx_rate`, `fx_rate_date` + CHECK), `account_transaction (id, company_id)` tekil anahtarı, belge ↔ kaynak hareket bileşik FK'si, kur farkı/rapor indeksleri | 12.8 OK-12.8-23 (yeni, 2026-11-16) | 12.8 — **uygulandı: `V41__account_document_fx_details`** (yalnız ADD COLUMN + kısıt + 4 indeks, dolu kiracıda güvenli; `uygulama/12.8_TASARIM.md` §1.1). Z40 12.8'de de ertelendi |

### 4.2 Admin şeması

2026-11-12'deki "admin migration gerekmiyor" notu geçersiz.

| Z | Ad | İçerik | Kaynak | Adım |
|---|---|---|---|---|
| ZA1 | `plan_company_limits` | `plan.max_companies`, `plan.max_branches` (NULL = sınırsız) | MX5 A8 | 12.1a — **uygulandı: admin `V8__plan_company_limits`** |
| ZA2 | `payroll_parameters` | Yıllık yasal parametreler (gelir vergisi dilimleri, SGK oran/tavan, asgari ücret, istisnalar, damga) | MX6 P3 | 12.9 |
| ZA3 | `integration_client` | ZTO → Blackrose OAuth2 istemci kaydı (gizli değer hash'li, döndürme) | MX9 A-xS1 | 12.11 |

## 5. Uç (endpoint) özeti

| Grup | Genişletilecek | Yeni |
|---|---|---|
| Cari (MX1 §4.2) | ~13 (liste filtreleri, ekstre, yaşlandırma, ısı haritası, dashboard, fon/çek listeleri, alış faturası) | ~17 (belge, çapraz hareket, devir, transfer, IBAN, hazine, bilanço, defter özeti) |
| Banka/kasa (MX2 §4) | `/funds` filtreleri, `/funds/transfers` | ~20 (fon detayı, özet, sparkline, transfer merkezi, mevduat, talimat) |
| Çek/kredi/plan (MX3 §4) | `/instruments`, `/payment-plans` | ~15 (çek detayı/düzenleme/emanet, koçan, kredi yaşam döngüsü, toplu onay talebi) |
| Masraf (MX4 §A.4) | `/expense-types`, `/expense-items` PUT/DELETE | `/expenses` CRUD + satırlar |

## 6. Kullanıcıdan karar bekleyen iş kuralları

| # | Konu | ZTO | Blackrose | Öneri |
|---|---|---|---|---|
| K1 | Plan "Ödendi" | Ödeme kaydı oluşturmadan durum değiştirir | Ödeme için onaylı plan + banka/kasa seçimi zorunlu | Onay modalına **banka/kasa seçimi** eklenir (ekranda tek fark). Aksi halde nakit bakiyesi tutmaz. |
| K2 | Ceza ve kesinti belgeleri | "Borç Ekle" altında (cariye borcumuzu artırır) | — | Ceza/kesinti karşı tarafa kesiliyorsa "Alacak Ekle"ye taşınmalı. İş tarafı teyidi gerekir. |
| K3 | Cari transferde bağlı çek/senet | Çekler de yeni cariye taşınır | Belirsiz | Taşınsın (ZTO davranışı), ama yalnız PORTFOLIO durumundaki çekler. |
| K4 | Ödeme yoğunluk eşikleri | 4 eşik, 5 seviye, `<` | 3 eşik, 4 seviye, `<=` | ZTO'nunki (4 eşik); Blackrose'un eski ekranı da 5 seviyeye uyarlanır. |
| K5 | Kısmi plan ödemesi, çek/senetle plan ödeme | Var | Yok (tam tutar, yalnız banka/kasa) | Blackrose kuralı kalsın (MX3 önerisi). |
| K6 | Investments | Var | Yok | ÇIKAR, ileride ayrı faz. |

### 6.1 Kullanıcı kararları (2026-11-12)

| # | Karar | Uygulama |
|---|---|---|
| K1 | **Banka/kasa seçimi eklenir.** | "Ödendi" onay modalına zorunlu banka/kasa select'i; `PaymentPlanService.pay` ile gerçek ödeme kaydı. |
| K2 | **İkisi de olsun.** | Ayrı belge türleri: "Ceza (bize kesilen)" → Borç Ekle (PAYABLE); "Ceza / Kesinti (karşı tarafa kesilen)" → Alacak Ekle (RECEIVABLE). `account_document.document_type` tohumuna ikisi de girer. |
| K3 | **Hepsi taşınsın (ZTO birebir).** | Cari transferde bağlı tüm çek/senetlerin `account_id`'si yeni cariye geçer, durumdan bağımsız. Her biri için `instrument_movement` satırı (`TRANSFERRED`, eski/yeni cari) yazılır; geçmiş kaybolmaz. `account_transfer.instrument_id` yerine `account_transfer_instrument` ara tablosu (V28). |
| K4 | **ZTO: 4 eşik, 5 seviye.** | V33: `density_threshold.very_high`; `DensityLevel.EXTREME`; karşılaştırma `<` (ZTO). Blackrose'un mevcut MUI ısı haritası da 5 seviyeye uyarlanır. |
| K5, K6 | Öneri geçerli (kullanıcı itiraz etmedi). | Kısmi/çekle plan ödemesi yok; Investments ÇIKAR. |

### 6.2 MX5–MX9'dan gelen kararlar (2026-11-13)

Kullanıcı gereksinimi (2026-11-13): bir kiracı (lojistik firması) kendisine ait 2–3 ayrı şirket adına alış, satış, nakliye, personel tanımı ve maaş ödemesi yapabilir.

| # | Konu | Öneri | Kaynak | Durum |
|---|---|---|---|---|
| Y1 | Cari kartı şirketler arasında ortak mı? | Ortak kart (ZTO davranışı), bakiye ve ekstre şirket kırılımında | MX5 S1 | ✅ kabul (2026-11-13) |
| Y2 | Bordro motoru | **Yasal kurallara göre yeniden yazılır** (kümülatif matrah, asgari ücret istisnası, işveren payı, SGK tavanı, yıllık parametre tablosu); ZTO'nun hesabı taşınmaz (MX6 R1–R23) | MX6 | ✅ kabul (2026-11-13) |
| Y3 | Şirket ağacı | Katı ağaç: Şirket → Şube (il/grup) → İş Yeri | MX5 S2 | ✅ kabul (2026-11-13) |
| Y4 | Fatura/belge numarası | Şirket başına önek + yıl + sıra | MX5 S4 | ✅ kabul (2026-11-13) |
| Y5 | Tahsilatın siparişe dağıtımı | Lojistikte sipariş yok → navlun/depo/alış faturasıyla bilgi amaçlı eşleştirme (Z16) | MX7 S1 | ✅ kabul (2026-11-13) |
| Y6 | Taşeron (SalesTruckExpenses) gideri cariye ne zaman? | Girildiği anda; sefer kapanışı yazılmış satırı atlar | MX8 S1 | ✅ kabul (2026-11-13) |
| Y7 | ZTO Fabrika entegrasyonu kimlik doğrulama | ZTO → Blackrose OAuth2 client credentials; Blackrose → ZTO HMAC imzalı webhook | MX9 A | ✅ kabul (2026-11-13) |
| Y8 | Kur farkı kaydı (ZTO RecipeFinance) | **Rapor + kullanıcı onayıyla elle "Kur Farkı" belgesi** (Z10 belge türü, kaynak hareket başına tek kesim, otomatik kayıt yok). Blackrose FAZ_02 "kur farkı kaydı yok" kararı bu ölçüde değişir; işlem günü TL karşılığı sabit kalır, fark ayrı belgedir | bu belge | ✅ kabul (2026-11-13) |
| Y9 | Diğer öneriler (topluca) | Şirket seçici + konsolide görünüm (MX5 S5); plan limitleri (S6); intercompany cari (S3); çapraz kur ÇIKAR, "Diğer" yöntemi → cari belge, kredi kartı = BANK + kanal, "Tamamla" ÇIKAR (MX7 S2–S5); taşeron avansı gerçek ödeme, kesinti `trip_cost` kolonu, ZTO etiketleri aynen (MX8 S2, S4, S5); firma sarf deposu bu fazda ÇIKAR (MX8 S3); e-Bildirge önce yok, sonra dosya üretimi (MX6); ikinci dil EN sonra (MX9 C) | MX5–MX9 | ✅ kabul (2026-11-13) |

## 7. Taşınırken düzeltilecek ZTO hataları (birebir kopyalanmaz)

1. ProductionExpenses: `#reportModal` var olmayan uca gidiyor; silme modalı tarih gönderiyor ama uç `id` bekliyor; fatura/vade tarihi girişi yok.
2. ProcessPaymentOrders: `processPaymentModal` ve alan id'leri iki kez tanımlı.
3. Çek no doğrulaması iki modalda farklı (tam 7 hane / 1-7 hane) → tek kural.
4. Kredi: PMT her periyotta aylık oranı kullanıyor, `DayCount` yok sayılıyor; `Add` transaction'sız; komisyon/sigorta hiç işlenmiyor; BSMV sabit %5; KKDF ve gecikme faizi hesabı yok.
5. Limit modalında "Kredi Limiti" alanı "Risk Limiti" etiketini taşıyor.
6. ExpenseItems DataTables dil dosyası `/js/datatable/tr.json` 404.
7. `01_FINANS_ENVANTER.md` §8'deki 9 tutarsızlık (bakiye işareti, iptal ödemeler, rol metni vb.) Blackrose kurallarıyla tek tipe iner.
8. Ödeme/tahsilat (MX7 §6, 20 madde): döviz kuru alanı yorum satırında (kur 1 yazılıyor); `UpdatePayment` transaction'sız; tahsilat POST'larında antiforgery yok; "Bankaya Yatırıldı" çek vadesiz banka girişi yazıyor; kalan borç tüm para birimlerini topluyor; CustomerCurrentAccounts GET içinde UPDATE ve string birleştirmeli SQL.
9. SalesTruckExpenses (MX8, 12 madde): `Index` dışında `[Authorize]` yok; cariye yalnız net tutar; kur sabit 1; iki modal var olmayan uca gidiyor; aynı borcu üç controller yazıyor.
10. Bordro (MX6 R1–R23): onay uçlarını hiçbir ekran çağırmıyor; gelir vergisi aylık×12/12; ek ödemede çift ödeme; avans kesilmeden "kesildi"; bozuk transaction commit; `DeleteWithDebts` GET ile fiziksel silme.
11. BankAccounts (MX8): güncellemede IBAN tekillik kontrolü yok; `maxlength` 26 yabancı IBAN'ı engelliyor.
12. Uyumsoft (MX9): SOAP katmanı doğrulanmamış iskelet (16 `TODO(WSDL)`); **şifreleme anahtarı için koda gömülü varsayılan** (`UyumsoftController.cs:36`) — ZTO Fabrika'da da düzeltilmeli. Blackrose'da anahtar yoksa uygulama açılmaz.
13. WorkPlace (MX5): Google Maps API anahtarı view'larda açık (`Views/WorkPlace/Add.cshtml:106`, `Edit.cshtml:87`) — ZTO Fabrika'da da kısıtlanmalı/taşınmalı.
14. Banka / kasa / transfer merkezi (12.2 keşfi; ayrıntı `uygulama/12.2_TASARIM.md` §3.2, §5.5–§5.11): bakiye ve hesap sayısı kartları tür süzgecine bağlı (B1); para birimi simgesi sabit (B3); ileri tarihli hareket uyarısı hiç görünmüyor (B5); "FİLTRELENEN" dönem başını içermiyor (B6); CSV iş yeri/şirket süzgecini yok sayıyor (B7); "Temizle" ilk varsayılanlara dönmüyor (B8); hareket tablosu sırası yanlış (B9); yürüyen bakiye istemcide ve süzgeçten sonra hesaplanıyor (B10); şirketler arası neden satırı ölü kod (B11); transfer özeti Virman/EFT/Havale'yi ayrı sayıyor (B12); KMV TL yerine kaynak para biriminde (B13); çapraz kur arayüzü ulaşılamaz ve ekstre sekmeleri sayfasız (B14); arama temizliği tek sekmeyi yeniliyor (B15); "Önceki Döviz Bozum Kaynakları" colspan hatası (B16); son hareketlerde ileri tarihliler (B18); "Dönem Başı Bakiyesi" etiketi başlangıç bakiyesini gösteriyor (B20, etiket birebir, not). Blackrose'da hepsi düzeltilmiş olarak yazıldı; ZTO'da tür başına 7 transfer öneki yerine şirket başına tek seri (OK-12.2-6).
15. Ödemeler / tahsilatlar / günlük raporlar (12.2a keşfi; ayrıntı `uygulama/12.2a_TASARIM.md` §0.4, §5): ödeme düzenleme yerinde ve transaction'sız güncelleme, silme fiziksel → düzeltme = ters kayıt + yeni kayıt tek işlemde (`POST /settlements/{id}/correct`), silme = ters kayıt (iptal tarihi + gerekçe saklanır); döviz kuru alanı devre dışı (kur 1) → TCMB kuru, düzenlemede kaydın kuru korunur; silme onayında "TL" sabiti → kaydın para birimi; sabit konumlu bildirimler kapanmıyor → başarı 3 sn / hata 5 sn, modal açıkken kuyrukta; tablo hücrelerinde `data-label` yok → eklendi; Günlük rapor İş Yeri çoklu seçimi ilk "Filtrele"de kayboluyor → çoklu seçim korunur; "Temizle" açılış varsayılanına (bugün−7…bugün) dönmüyor → döner; çek no iki modalda farklı → tek kural `^\d{7}$` (madde 3); cari banka hesabı seçilince açıklamaya tam IBAN + hesap sahibi yazılıyor → maskeli IBAN, personel carisinde cümle yok (KVKK); DCR grup başlığı farklı para birimlerini topluyor → rozet çizilmez; rapor süzgeç seçenekleri yalnız ekrandaki satırlardan → görünür fon/para birimi listesinden; "KESİDECİ" yazımı → "KEŞİDECİ".
16. Çek / senet / koçan (12.3 keşfi; ayrıntı `uygulama/12.3_TASARIM.md` §7): (a) "Bankaya Yatır" menüsü seçenekte olmayan değeri gönderir, seçici boş açılır; (b) `orderable:false` yanlış sütunda; (c) Excel düğmesi çalışmaz; (d) durum süzgecinde Kullanıldı/Ciro Edildi/İptal yok; (e) Bills "Portföydeki" kartı genel toplamı gösterir → portföy toplamı (OK-12.3-21); (f) "Teminata Verildi" banka çıkışı yazar → defter etkisiz; (g) senet "Ödendi" yönden bağımsız banka çıkışı yazar, cari değişmez → yöne göre fon hareketi; (h) Protestolu/İptal yalnız banka hareketini pasifler, cari ters kaydı yok → ters kayıt; (i) Ödendi→Protestolu ve İptal→Yeniden Aktif geri sarmaları → yok (OK-12.3-4); (j) DeleteBill/DeleteCheck ters kayıtsız soft delete → iptal = köken kaydın ters kaydı; (k) koçan numaraları baştaki sıfırı düşürür → `%07d`.
17. Masraf / taşeron gideri (12.7 keşfi; ayrıntı `uygulama/12.7_TASARIM.md` §0, §5): (a) Genel Masraf'ta "Diğer Vergiler" toplamdan düşülüyor → toplama eklenir (OK-12.7-14); (b) farklı para birimleri ₺ ile toplanıyor → para birimi kırılımı; (c) STI TOPLAM satırı `tbody` içinde → `tfoot`; (d) silme sonrası yanlış tablo id'si yenileniyor; (e) gün varsayılanı 90/150 tutarsız → 150 (1–365); ayrıca taşeron borcu cariye yalnız net yazılıyordu → ödenecek tutar (OK-12.7-3).
18. Finans raporları / kur farkı (12.8 keşfi; ayrıntı `uygulama/12.8_TASARIM.md` §0.4, §5): CAR'da `[Authorize]` yok; yaşlandırma/performans LEFT JOIN kartezyen çoğalması; `item.iD` + kırık EditCheck/EditBill bağlantıları; 4 Excel düğmesi yalnız `alert`; `parseFloat(replace('.', ''))` binlik hatası; döviz pozisyonu cari para birimine ve "Müşteri" grup adına göre; FBS'de cari net işareti ters ve borçlar varlık, "Müşteri" grubunda ters etiket, çekler keşideci grubuyla bağlanıyor, kur yoksa 1; FxReport kur ucu yalnız Admin + SQL enjeksiyonu + istemci kuru + `LIKE` ile mükerrer denetimi + transaction'sız + 500 satır sınırı + kesilmiş satır görünmüyor; CashFlow tahsil edilmiş alacakları ilk haftaya yığıyor ve para birimlerini TL'de karıştırıyor; TRM Excel `alert`; Currency silme GET ile ve dizgi birleştirmeli SQL. Hepsi Blackrose'da düzeltildi (sunucu kuru + `expectedDifference` 409, FIFO açık kalan, brüt sınıflama, kapsam/izin, para birimi kırılımı, çalışan Excel).

## 8. Blackrose'da ayrıca düzeltilecek hata

Blackrose'un kendi bakiye ve ekstre sorguları (native SQL) `deleted = false` filtresi uygulamıyor (MX1 §3). ZTO işinden bağımsız; ilk adımda testle birlikte düzeltilir.

Ek olarak (MX9): e-belge sağlayıcısı veritabanı işlemi içinde çağrılıyor (`EDocumentService.java:193-207`); irsaliye UBL'inde plaka/şoför GİB yapısında değil (`UblWriter.java:94-100`); zamanlayıcı tek iş parçacıklı ve dağıtık kilit yok; `EDocumentStatusJob` tüm belgeleri tek işlemde sorguluyor. Bunlar 12.10'da düzeltilir.

## 9. Uygulama sırası (Faz 3, matris onayından sonra)

Her adım: migration + servis + entegrasyon testi (Testcontainers) + ZTO görünümlü ekran + birim test. CI eşikleri korunur (satır %93, dal %76).

| Adım | İş | Bağımlılık |
|---|---|---|
Adım numaraları `docs/fazlar/FAZ_12_ZTO_Finans_Eklemeleri.md` ile aynıdır (2026-11-13'te 3.x → 12.x).

| Adım | İş | Migration | Bağımlılık |
|---|---|---|---|
| 12.0 | Ön yüz altyapısı: kapsamlı ZTO CSS, modal/tablo/select, ortak şube seçim bileşeni, i18n ad alanları, "ZTO Finans" menüsü ve açılış sayfası; §8 düzeltmesi | — | — |
| 12.1a | İş yeri / şube / çoklu şirket; "Şirketler" ekranı; kullanıcı iş yeri kısıtı | Z01–Z05, ZA1 | 12.0 |
| 12.1 | Cari (+ cari IBAN ekranları) | Z06, Z10–Z12 | 12.1a |
| 12.2 | Banka/kasa, transfer merkezi (✅ 2026-11-14; V31–V34, `uygulama/12.2_TASARIM.md`) | Z07, Z13, Z14 (+ Z41) | 12.1 |
| 12.2a | Ödemeler, Tahsilatlar, günlük raporlar, ortak ödeme/tahsilat modalları (✅ 2026-11-15; V35–V36, `uygulama/12.2a_TASARIM.md`) | Z15, Z16 | 12.2 |
| 12.3 | Çek/senet/koçan (✅ 2026-11-16; V37–V38, `uygulama/12.3_TASARIM.md`) | Z08, Z09 | 12.2a |
| 12.4 | Ödeme planı + PaymentApproval/Index + PaymentManagement ekranları | Z19 | 12.3 |
| 12.5 | Kredi | Z18 | 12.4 |
| 12.6 | Vadeli mevduat | Z17 | 12.2 |
| 12.7 | Masraf + taşeron (SalesTruckExpenses) gideri | Z20, Z21 | 12.1 |
| 12.8 | Raporlar: yaşlandırma, FinanceReport, bilanço, kur farkı (Y8), nakit akışı, kur ekranı (✅ 2026-11-16; V41, `uygulama/12.8_TASARIM.md`) | (Z10) + Z42 | 12.1–12.7 (12.4–12.6 atlandı) |
| 12.9 | Personel ve bordro | Z22–Z30, ZA2 | 12.1a, 12.2 |
| 12.10 | Uyumsoft e-Dönüşüm (WSDL ve test hesabı gelince) | Z31–Z34 | 12.1a |
| 12.11 | ZTO Fabrika ↔ Blackrose canlı entegrasyon (E0–E6) | Z35–Z39, ZA3 | 12.1a, 12.2a, 12.10 |

**Önkoşul:** JDK 21, Maven 3.9.16 ve Docker Desktop 2026-11-13'te kuruldu; Docker yeniden başlatmadan sonra çalışır.

## 10. Açık / doğrulanamayan noktalar

- ZTO'da öneksiz `BankTransactions`/`CashTransactions` tablolarına yazan kod (`PurchaseCurrentAccountController.cs:1251, :1297`): canlı DB'de var mı? (Faz 2 şema dökümüyle bakılacak.)
- ~~`exportToExcel`/`exportToPDF` fonksiyonları ZTO'da tanımlı değil~~ → çözüldü (12.2a): `exportToExcel` ödemelerde `payments.js:3951`, tahsilatlarda `collections.js:6601`'de tanımlı; Blackrose'da Excel dışa aktarımı sunucu sayfalarıyla (4 × 500 satır).
- ~~ZTO Şube İli (`BranchProvince`) karşılığı~~ → çözüldü: `branch_group` (Z02), MX5.
- ~~Blackrose'da kullanıcı başına şube kısıtı~~ → yok; `user_branch` (Z05) eklenecek. Denetim kaydının varlık bazında filtrelenmesi hâlâ doğrulanmadı.
- ZTO "2026" vergi dilimleri ve asgari ücret değerinin resmî tarifeyle karşılaştırılması (MX6); avansın cari bakiyede iki kez düşüp düşmediği ve zimmet borcunun yönü canlı veriyle doğrulanmalı.
- Uyumsoft WSDL'i ve test hesabı (12.10 önkoşulu).
- ZTO Fabrika tarafında entegrasyon için gereken 12 maddelik değişiklik listesi (MX9 A) — ZTO şimdi değiştirilmez.
- Kiracı logosu (rapor başlıkları) Blackrose karşılığı.
