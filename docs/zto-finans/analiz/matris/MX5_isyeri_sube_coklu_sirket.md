# MX-5 — İş Yeri / Şube Yapısı ve Çoklu Şirket (Faz 12, adım 12.1a): ZTO → Blackrose eşleme matrisi

> Tarih: 2026-11-13 · Durum: **taslak, kullanıcı kararı bekleyen 6 soru var (§6)**
> **12.1a uygulandı (2026-11-13); uygulama belgesi [`docs/zto-finans/uygulama/12.1a_TASARIM.md`](../../uygulama/12.1a_TASARIM.md).** §6 S1–S6 soruları (a) seçenekleriyle kapandı. Bu ekin uygulamada değişen noktaları (migration adları V22–V26 + admin V8, varsayılan şirket göçü, `represents_company_id`'nin V24'te eklenmesi, logo biçimi, `branch_group_id`'nin API'de isteğe bağlı olması, `branch-tree` izni, e-belge serileri, token sürümünün artırılmaması vb.) uygulama belgesi §0.3'te (S-1…S-14) listelidir; çelişkide uygulama belgesi geçerlidir.
> Kapsam: ZTO `WorkPlace` (İş Yerleri), `BranchProvince` (Şubeler), finans sayfalarındaki "şube gruplu iş yeri seçimi" (`WorkPlaceGroups`), kullanıcı–iş yeri kısıtı ve **yeni gereksinim:** bir Blackrose kiracısının (lojistik firması) 2–3 ayrı tüzel kişi (şirket) adına alış, satış, navlun faturası, personel tanımı ve maaş ödemesi yapabilmesi.
> Bağlam: [04 §0–§4](../04_UYARLAMA_KARAR_MATRISI.md) (tek finans motoru, `.zto-finans` kapsamlı ZTO görünümü, tenant V22–V34). Personel/bordro ekranları ayrı ektedir (MX6, adım 12.9); burada yalnız veri modeli kancaları verilir.
> **Migration adları (V22a…V22g) geçicidir; son numarayı koordinatör verir.** Flyway sürümü sayısal olmalıdır (`V22a` geçersiz); öneri `V22_1__…`, `V22_2__…` ya da 04 §4 tablosunun yeniden numaralanması.

Kökler:
- ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (salt okunur)
- BR-BE = `F:\visual studio zto\LogisticErp\backend\src\main\java\org\ece\blackrose`
- BR-MIG = `F:\visual studio zto\LogisticErp\backend\src\main\resources\db\migration\tenant`
- BR-FE = `F:\visual studio zto\LogisticErp\frontend\src`

Kısaltmalar: WPC = `ZTO\Controllers\WorkPlaceController.cs` · BPC = `ZTO\Controllers\BranchProvinceController.cs` · CAPC = `ZTO\Controllers\CustomerAccountPaymentController.cs` · PAY = `ZTO\Views\CustomerAccountPayment\Payments.cshtml` · CAI = `ZTO\Views\CustomerAccounts\Index.cshtml`.

Gizli değer notu: ZTO view'larında Google Maps API anahtarı açık metin olarak duruyor (`Views/WorkPlace/Add.cshtml:106`, `Edit.cshtml:87`). Bu belgede `__PLACEHOLDER__` olarak geçer; Blackrose'a taşınmaz.

---

## 0. Özet bulgu

| Soru | Cevap |
|---|---|
| ZTO'da hiyerarşi | **Şube (`ZT_BranchProvince`) 1—N İş Yeri (`ZT_WorkPlace.BranchProvinceID`)**. Finans, personel, depo ve satış kayıtları `WorkPlaceID` taşır. |
| ZTO'da iş yeri bir tüzel kişi mi? | **Hayır.** `ZT_WorkPlace`'te VKN/unvan/SGK yok (model `Models/ZT/WorkPlace.cs:5-26`). `ZT_BranchProvince`'ta `TaxNumber`/`TaxOffice` var (BPC:107) ama **hiçbir yerde okunmuyor** (grep: yalnız BPC ve `Services/DefinitionAuditRegistry.cs:62`, o da vergi alanlarını içermez). |
| ZTO'nun tüzel kimlik kaynağı | Kiracı başına tek: e-belgede `ZT_UyumsoftSetting` tablosunun **tek aktif satırı** (`SenderVkn`, `SenderTitle`; `UyumsoftController.cs:106, :144, :168-179`; UBL'e yazım `Services/Uyumsoft/UyumsoftEInvoiceService.cs:176-177, :372-373`). Logo ve kiracı bilgisi `ZTO_ADMIN` `public."Customers"` (`LogoUrl`, `QrKey`, `DatabaseName`, HKS kimlikleri; `RecipeProductionController.cs:12419-12442`, `SettingController.cs:376-400`). |
| ZTO çoklu tüzel kişi destekliyor mu? | **Hayır.** Bir veritabanı = bir gönderici VKN. İş yerleri yalnız iç maliyet/raporlama birimi. Yeni gereksinim ZTO'nun ötesindedir → "Şirketler" ekranı ZTO görünümünde **yeni** yazılır (UI+YENİ/UI+TABLO). |
| Blackrose'da karşılık | `branch` yalnız `code`, `name` (BR-MIG `V1__create_branch.sql:1-12`). Tüzel kimlik: kiracı adı (`admin.tenant.name`) + tek satırlı `edocument_settings` (V10:2-14). Kullanıcı–şube kısıtı **yok**. |
| Öneri | Yeni `company` (tüzel kişi) → `branch_group` (= ZTO Şube) → `branch` (= ZTO İş Yeri) ağacı; para ve yasal belge tablolarına `company_id` + bileşik FK `(branch_id, company_id) → branch(id, company_id)`; şirket başına e-belge ayarı ve fatura serisi; `user_branch` kapsamı; ortak "şube gruplu çoklu seçim" React bileşeni. |

---

## 1. ZTO tarafı (salt okunur kaynak)

### 1.1 Tablolar (DDL repoda yok; kolonlar koddan çıkarıldı)

| Tablo | Kolonlar | Kanıt |
|---|---|---|
| `ZT_WorkPlace` | `ID` (serial), `Name` (MaxLength 50), `Status` bool (sıra 2 — Edit `ItemArray[2]` atlanıyor), `CreationDate`, `Address` (MaxLength 100), `Location` (metin `"lat,lng"`), `PhoneNumber` (MaxLength 11), `BranchProvinceID` int | INSERT WPC:150-153; Edit sıra indeksleri WPC:303-309; model `Models/ZT/WorkPlace.cs:7-25` (+ görünüm alanı `BranchProvinceName`) |
| `ZT_BranchProvince` | `ID`, `Name` (50), `Phone` (11), `Address` (100), `Email`, `ManagerName` (yalnız Index SELECT'inde, modelde yok), `BranchType` ('Ana Şube' / 'Şube'), `TaxNumber`, `TaxOffice`, `Status`, `CreationDate` | SELECT BPC:41; INSERT BPC:107; model `Models/ZT/BranchProvince.cs:7-24` |
| `ZT_CustomerAccounts` (iş yeri carisi) | `AccountCode='ISY-{WorkPlace.ID}'`, `AccountGroup='İş Yeri Firması'`, `ReferenceID=WorkPlace.ID`, `CurrencyID=1`, `Country='Türkiye'`, `CreatedBy='Admin'` (sabit) | WPC:166-227 |
| `Log` | `Methods.LogAdd` ile "İş yeri ve cari kart eklendi" vb. | WPC:229-260, :380-412, :485-516; BPC:129-159, :256-286, :347-378 |

### 1.2 `WorkPlaceController` (535 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]` (WPC:12-13)

| Satır | Aksiyon | HTTP | Yaptığı | Not / hata |
|---|---|---|---|---|
| :22-69 | `Index()` | GET | `ZT_WorkPlace LEFT JOIN ZT_BranchProvince` → `BranchProvinceName`, **yalnız `Status=true`** (:44-48) | Pasifleştirilen iş yeri listeden kaybolur; `Delete` bir aç/kapa olduğu halde tekrar aktifleştirme UI'dan **erişilemez** |
| :72-93 | `ConvertDataTableToWorkPlaceList` | — | Şube adı yoksa "Belirtilmemiş" (:87) | |
| :95-119 | `Add()` | GET | Aktif şubeleri `ViewBag.BranchProvinces` (:100-115) | |
| :121-277 | `Add(WorkPlace)` | POST | (1) `ZT_WorkPlace` INSERT `RETURNING ID` (:150-165); (2) `ISY-{id}` cari kodu var mı (:168-180); (3) `ZT_CustomerAccounts` INSERT, grup **İş Yeri Firması** (:183-227); (4) log; TempData mesajı | **Transaction yok** — cari INSERT hata verirse iş yeri kalır. Formdaki `CreationDate` yok sayılır, sunucu saati yazılır (:136, :161) |
| :279-343 | `Edit(string id)` | GET | **SQL birleştirme** `"…where ID="+id` (:297); kolonlar `ItemArray[n]` sıra indeksiyle (:303-309) | SQL injection; kolon sırası değişirse bozulur |
| :345-421 | `Update(WorkPlace)` | (öznitelik yok) | `Name, PhoneNumber, Location, BranchProvinceID, Address` UPDATE (:360-371) | Antiforgery yok; carinin `AccountName`'i **güncellenmez** → ad değişince `WpSelfMap` ad eşleşmesi (§1.9) bozulur |
| :423-533 | `Delete(int id)` | GET | `Status` aç/kapa (:439-462); bağlı carinin `Status`'ü eşitlenir (`ReferenceID` + grup ile, :468-474) | :466'daki `"ISYERI_"` değişkeni kullanılmıyor (gerçek kod `ISY-`). Bağımlılık kontrolü yok |

### 1.3 `Views/WorkPlace/*`

Rol kapısı: üç view'da da `ViewData["UserRoleID"] == "0"` (Admin) değilse "Admin kullanıcısı olmadığınız için…" + `factory2.jpg` (Index:6, :73-83; Add:10, :75-85; Edit:6, :66-76).

**Index.cshtml (liste)** — kart başlığı "İş Yerleri Listesi" + `fa-list-ul` (:15-17), "Yeni Kayıt" düğmesi `/workplace/Add` (:21-23), DataTables (`tr.json` CDN, :86-91).

| # | Kolon | İçerik | Satır |
|---|---|---|---|
| 1 | Ad | `Name` | :31, :44 |
| 2 | Telefon Numarası | `PhoneNumber` | :32, :45 |
| 3 | Adres | `Address` | :33, :46 |
| 4 | Lokasyon | Google Maps arama bağlantısı (`material-symbols-outlined pin_drop`), `target=_blank` | :34, :47-54 |
| 5 | Şube | `BranchProvinceName` | :35, :55 |
| 6 | Oluşturma Tarihi | `ToShortDateString()` | :36, :56 |
| 7 | İşlemler | Düzenle `btn-success fa-edit` → `/workplace/Edit/{id}`; Sil `btn-danger fa-trash-alt` → `/workplace/Delete/{id}` + `confirm("Silmek istediğinize emin misiniz?")` | :37, :58-60 |

**Add.cshtml (form, "Yeni İş Yeri")** — breadcrumb İş Yeri › Ekleme (:12-16), `<h4>` (:17), POST `/workplace/add` (:19).

| # | Alan | Etiket | Tip | Doğrulama | Satır |
|---|---|---|---|---|---|
| 1 | `Name` | Ad * | text, `col-md-12` | required | :22-23 |
| 2 | `PhoneNumber` | Telefon Numarası * | text `.number-input` | required (model MaxLength 11; Add'de rakam süzgeci yok) | :29-30 |
| 3 | `BranchProvinceID` | Şube * | select ("Lütfen seçiniz") | required | :36-39 |
| 4 | `Address` | Adres: | text, `col-md-6` | required (etikette yıldız yok) | :45-47 |
| 5 | `Location` | Konum: | text **readonly** (haritadan dolar) | required | :51-53 |
| 6 | (harita) | — | `#map` 400px Google Maps; tıklayınca işaretçi + reverse geocode ile Adres ve `lat,lng` doldurulur; merkez Türkiye (38.96, 35.24, zoom 6) | — | :57, :106 (anahtar `__PLACEHOLDER__`), :112-158 |
| 7 | `CreationDate` | Oluşturma Tarihi * | datetime-local (şimdi) | required — sunucu yok sayar | :63-64 |
| — | submit | "Yeni İş Yeri Oluştur" (`fa-plus`, `col-md-12`); tıklanınca disable + spinner "Yeni İş Yeri Oluşturuluyor" | | | :70, :89-96 |

Ölü kod: `validateInput()` var olmayan `#inputText`'i okur (:99-103).

**Edit.cshtml ("İş Yeri Düzenle")** — `Html.BeginForm("Update")` (:15).

| # | Alan | Etiket | Not | Satır |
|---|---|---|---|---|
| 1 | `ID` | ID | readonly | :19-20 |
| 2 | `Name` | **"Ad Soyad"** (ZTO etiket hatası) | required | :22-24 |
| 3 | `PhoneNumber` | Telefon Numarası | required | :26-28 |
| 4 | `BranchProvinceID` | Şube * | required | :32-35 |
| 5 | `Address` / `Location` | Adres / Konum | Konum readonly | :39-50 |
| 6 | harita | mevcut `Location` ile ilk işaretçi | `placeMarker` `Address`'e `getAddress()`'in `undefined` dönüşünü yazar, sonra async düzeltir (hata) | :54, :99-111, :135 |
| 7 | `CreationDate` | Oluşturma Tarihi | readonly | :58-59 |
| — | submit | "Güncelle" (`btn-info`), spinner "Güncelleniyor" | | :63, :79-86 |

### 1.4 `BranchProvinceController` (397 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]` (BPC:11-12)

| Satır | Aksiyon | HTTP | Yaptığı | Not / hata |
|---|---|---|---|---|
| :21-62 | `Index()` | GET | `ID, Name, Address, Phone, Email, ManagerName, BranchType, TaxNumber, TaxOffice, Status, CreationDate` — **yalnız `Status=true`** (:41) | `ManagerName` modelde yok, yok sayılır |
| :65-77 | `Add()` | GET | `ZT_WorkPlace` listesini `ViewBag.WorkPlace`'e koyar (:70-73) | View kullanmıyor (ölü sorgu) |
| :79-167 | `Add(BranchProvince)` | POST | INSERT (:107-121); `Status` formdan bağımsız **true** (:94); `CreationDate` sunucu saati (:117); log için `SELECT MAX(ID)` (:124) | Yarış koşulu (MAX) |
| :169-213 | `Edit(int id)` | GET | Parametreli SELECT (:176-180) | |
| :215-295 | `Edit(BranchProvince)` | POST | `Name, Phone, Address, Email, BranchType, TaxNumber, TaxOffice, Status` UPDATE (:230-254) | Edit'te `Status` checkbox'la pasifleştirilebilir |
| :297-395 | `Delete(int id)` | GET | `Status` aç/kapa (:313-336) | Bağlı iş yeri kontrolü yok; iş yerleri "Diğer" grubuna düşmez, adı görünmeye devam eder (JOIN Status'a bakmaz) |

### 1.5 `Views/BranchProvince/*`

**Index.cshtml ("Şube Listesi")** — başlık + `fa-list-ul` (:15-17), "Yeni Kayıt" (:21-23). DataTables: dil dosyası kültüre göre CDN (:92-96), `columnDefs` 4=tarih, 5=sıralanamaz (:102-112), `pageLength 10`, `order [[4,"desc"]]` (:113-115).

| # | Kolon başlığı | Hücre (yığın, `definition-cell-stack`) | Satır |
|---|---|---|---|
| 1 | Şube Adı / Şube Tipi / Durum | `<strong>Name</strong>`, `<small>BranchType</small>`, `<small>Aktif/Pasif</small>`; `data-search` ad+tip | :31, :43-49 |
| 2 | Telefon Numarası / E-posta | span + small | :32, :50 |
| 3 | Adres | | :33, :51 |
| 4 | Vergi Numarası / Vergi Dairesi | span + small | :34, :52 |
| 5 | Kayıt Bilgileri | `IntroductionAudit` ViewComponent (`table="ZT_BranchProvince"`, `compact=true`) — oluşturan/düzenleyen/tarih | :35, :53-55 |
| 6 | İşlemler | `btn-group`: Düzenle (`btn-success`), Sil (`btn-danger` + confirm) | :36, :56-66 |

**Add.cshtml ("Yeni Şube")** — breadcrumb Şubeler › Ekleme (:13-17), POST `/branchprovince/add` (:20).

| # | Alan | Etiket | Tip | Doğrulama | Satır |
|---|---|---|---|---|---|
| 1 | `Name` | Şube Adı * | text `col-md-6` | required, maxlength 50 | :23-24 |
| 2 | `Phone` | Telefon Numarası | text `.number-input` | maxlength 11, JS yalnız rakam (:111-120) | :28-29 |
| 3 | `Address` | Adres | text `col-md-12` | maxlength 100 | :33-34 |
| 4 | `Email` | E-posta | email | tarayıcı e-posta biçimi | :38-39 |
| 5 | `BranchType` | Şube Tipi | select: "Lütfen seçiniz" / `Ana Şube` / `Şube` (etiketi "Yan Şube") | — | :43-48 |
| 6 | `TaxNumber` | Vergi Numarası | text | JS rakam süzgeci **çalışmaz** (seçici `input[asp-for=…]`, render sonrası öznitelik yok, :123-129) | :52-53 |
| 7 | `TaxOffice` | Vergi Dairesi | text | — | :57-58 |
| 8 | `CreationDate` | Oluşturma Tarihi * | datetime-local | required (sunucu yok sayar) | :62-63 |
| 9 | `Status` | Aktif | checkbox (işaretli) | sunucu yok sayar (her zaman true) | :67-72 |
| — | submit | "Yeni Şube Oluştur" (`col-md-12`), spinner "Yeni Şube Oluşturuluyor" | | | :78-80, :98-105 |

**Edit.cshtml ("Şube Düzenle")** — iki sütun (:18-76): sol ID (readonly), Şube Adı * (50), Telefon (11), Adres (100), E-posta; sağ Şube Tipi, Vergi No, Vergi Dairesi, Oluşturma Tarihi (readonly), **Aktif** checkbox (`CheckBoxFor`, :71-74). Düğme "Güncelle" `btn-info btn-block` (:81-83). Vergi no süzgeci burada doğru seçiciyle çalışır (`input[name="TaxNumber"]`, :125-131).

### 1.6 Menü

`Views/Shared/_Layout.cshtml:1284-1291` — tanımlar grubunda "İş Yerleri" (`fa-building`, `/workplace/index`) ve "Şubeler" (`fa-code-branch`, `/BranchProvince/index`), Para Birimleri / Miktarlar / Ürün Renkleri ile aynı listede; yalnız Admin.

### 1.7 "WorkPlaceGroups" — şube gruplu iş yeri seçimi (finans sayfalarının ortak deseni)

Ortak paylaşılan bir partial ya da JS dosyası **yok**; desen her view'a kopyalanmıştır. Üç (+1) varyant var:

| Varyant | Kurulum (controller) | Tüketim (view) | Görünüm |
|---|---|---|---|
| **A. Tekli select + optgroup** | CAPC:293-331 — `SELECT wp.ID, wp.Name, COALESCE(bp.Name,'Diğer') … WHERE wp.Status=true ORDER BY bp.Name, wp.Name` → `SortedDictionary<string, List<SelectListItem>>` (anahtar şube adı) `ViewBag.WorkPlaceGroups` + düz `ViewBag.WorkPlaces` (ilk öğe "İş Yeri Seçiniz") | PAY:325-355 `#filterWorkPlace` ("Tüm İş Yerleri" + `<optgroup label=şube>`; grup yoksa düz liste); aynı desen `Views/Shared/_AddPaymentModal.cshtml:283, :964`, `_EditPaymentModal.cshtml:283, :976`, `Collections.cshtml:286, :504`, `Checks.cshtml:1512, :1845`, `_CollectionModalsPartial.cshtml:39` | select2 görünümlü tekli seçim |
| **A'. Kaynak = İş Yeri Firması carisi** | `ChecksController.cs:438-482` — iş yeri listesini `ZT_CustomerAccounts` (`AccountGroup='İş Yeri Firması'`, `ReferenceID`→`ZT_WorkPlace`) üzerinden kurar | `Checks.cshtml` | A ile aynı; pasif carisi olan iş yeri görünmez (veri kaynağı farkı) |
| **B. Şube gruplu çoklu seçim listesi ("dpr"/"dcr")** | A ile aynı ViewBag | PAY:430-449 (CSS), :450-534 (`#dailyPaymentReportModal`), :1956-2069 (JS); tahsilat tarafında `dcr` önekiyle kopya (`Collections.cshtml`, JS ≈:705-794) | Aşağıda |
| **C. Açılır çoklu seçim ("wp-multiselect")** | `CustomerAccountsController.cs:413-432` (`selectedWorkPlaceIds` → `IN (…)` filtresi; Tanımsız/NULL iş yeri hariç) | CAI:3885-3899 (CSS), :4258-4277 (düğme + açılır liste, etiket "Tüm İş Yerleri Toplamı"), JS :5665, :5758-5759 (dışarı tıklayınca kapan), :5999-6001 (hepsi seçiliyse parametre gönderme), :6177-6213 (aç/kapa, tümü, hiçbiri, uygula, etiket) | Gruplama yok, düz liste |
| **D. İstatistik grupları** | `BankIntroductionController.cs:228-230` `BuildFilterGroups(x => x.WorkPlaceName)` → `List<StatisticGroupViewModel{Name, Count}>` | `BankIntroduction/Index.cshtml:35`, `CashIntroduction/Index.cshtml:89` | Kart filtresi çipleri (iş yeri adı + adet) |

**Varyant B ayrıntısı (Günlük Ödeme Raporu modalı — React bileşeninin referansı):**
- Markup (PAY:468-523): başlık satırı "İş Yeri (çoklu seçim)" + sağda `a#dprWpToggleAll` "Tümünü seç"; arama `div.dpr-wp-search > i.fa-search + input#dprWpSearch` (ph "İş yeri / şube ara..."); liste `#dprWpList.dpr-wp-list`; her şube `div.dpr-branch[data-branch-name]` → `div.dpr-branch-head[onclick=dprToggleBranch(this)]` içinde `label.dpr-branch-label` (`input.dpr-branch-check`, `i.fa-code-branch`, `span.dpr-branch-name`, `span.dpr-branch-count`) + `i.fa-chevron-down.dpr-chev`; gövde `div.dpr-branch-body` içinde `label.dpr-wp-item[data-wp-name] > input.dpr-wp-check[value=ID] + span`. Grup yoksa düz `dpr-wp-item` listesi (:508-520). Alt yazı "Birden fazla iş yeri seçebilirsiniz. Hiçbiri seçilmezse tüm iş yerleri raporlanır." (:522).
- CSS (PAY:430-449): liste `max-height:260px`, şube başlığı `#eef2ff` / hover `#e0e7ff`, gövde `grid-template-columns: repeat(auto-fill, minmax(150px,1fr))`, `.collapsed` ile gövde gizlenir ve ok −90° döner, `.hidden` arama süzgeci.
- Davranış (PAY:1964-2069): `dprSyncBranch` şube kutusunu `checked` / `indeterminate` yapar ve "(seçili/toplam)" sayacını yazar; şube kutusu → altındaki tüm iş yerleri; "Tümünü seç" ↔ "Temizle" etiket değişimi; arama hem iş yeri hem şube adında arar, eşleşen şubeyi açar; modal açılışında scroll kilidi, kapanışta backdrop temizliği; seçim `&workPlaceIds=1,2,3` olarak `DailyPaymentReport` URL'sine eklenir (:2056-2061) → CAPC:3221-3244 (CSV ayrıştırılır). **Boş seçim = tüm iş yerleri.**

### 1.8 Kullanıcının iş yeri kapsamı

- Oturumda iş yeri/şirket yok: `AccountController.cs:202-221` yalnız `customerUserKey`, `userRole`, `userDatabase` yazar.
- Kapsam her controller'da ayrı çözülür: kullanıcının rolüne karşılık gelen personel tablosunda (`ZT_Boss`, `ZT_FinancePerson`, `ZT_SalesPerson`, `ZT_LogisticsPerson`, …) `Key` ile satır bulunur, o satırdaki **tek** `WorkPlaceID`/`BranchProvinceID` `ViewData`'ya konur (ör. `CustomerAccountsController.cs:82-99`, :139-157 — `userkey` SQL'e birleştirilir). Doluysa filtre zorlanır, 0 ise tüm iş yerleri (envanter `NakliyeLojistik_SaaS_Promptlar/analiz/envanter/D_stok_masraf_kur_sube.md` §6.4).
- **Finans sayfaları (Varyant A/B) kapsamı uygulamaz** — tüm aktif iş yerlerini listeler (CAPC:293-301).

### 1.9 İş yeri hangi kayıtlarda kullanılıyor? (tüzel kişi testi)

`"WorkPlaceID"` 90 controller'da 1751 kez geçer. Finans ve ilgili örnekler:

| Alan | Tablo / kolon | Kanıt |
|---|---|---|
| Cari hareketleri | `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections` `.WorkPlaceID`; plan `ZT_CustomerAccountPaymentPlans.PaymentWorkPlaceID` | `CustomerAccountsController.cs:421-432, :452-480` |
| Cari kartı | `ZT_CustomerAccounts.WorkPlaceID` = "Varsayılan İş Yeri" (cari **tüm iş yerlerinde ortaktır**; bakiye cari × para birimi × iş yeri kırılımında) | MX1:118; `AccountTransactionController.cs:1007` `GetWorkPlaceBalances` |
| Banka / kasa | `ZT_BankIntroduction`, `ZT_CashIntroduction` `.WorkPlaceID` + `.BranchProvinceID` (ikisi de zorunlu) | MX2 §1.1 (Add:136, :149), §1.2 (Add:83, :99) |
| İş yerleri arası transfer | `ZT_BankTransfers.SourceWorkPlaceID/TargetWorkPlaceID`; karşı kayıtlar İş Yeri Firması carilerine ödeme/tahsilat | `BankStatementController.cs:1435, :2811-2815`; onarım/silme uçları :2817-2894 |
| Personel | `ZT_Personnel.WorkPlaceID` **zorunlu** (`PersonnelController.cs:178, :208-241`); personel carisi de `WorkPlaceID` alır (:825-840) | |
| Maaş | plan `PaymentWorkPlaceID` (`PersonnelSalaryController.cs:1520-1538`), borç (:2031-2051), ödeme (:2497-2514) | |
| Alış / satış | `AccountingPurchasesController` (27), `SalesProductController` (62), `RawMaterialSalesController` (22) | grep sayımı |
| e-Belge | **iş yeri yok** — tek `ZT_UyumsoftSetting` satırı, tek `SenderVkn` | §0 |

Sonuç: ZTO'da iş yeri **maliyet/raporlama birimidir**, tüzel kişi değildir. Faturanın kimin adına kesildiği iş yerine göre değişmez.

### 1.10 "İş Yeri Firması" carisi ve kendi-eşleşme dışlaması

- Her iş yeri için otomatik cari (WPC:166-227). Kullanım: iş yerleri arası transferin cari yansıması (`BankStatementController.cs:2811-2894`), çek/senet karşı tarafı (`BillsController.cs:257`, `ChecksController.cs:1716, :2590`), cari listesi grup filtreleri.
- Bakiye toplamlarında "iş yeri firması kendi iş yerinde" satırları dışlanır: `WpSelfMap` = `TRIM(wp.Name) = TRIM(ca.AccountName)` (**ad eşleşmesi**, `CustomerAccountsController.cs:445-456`), `AccountTransactionController.cs:626-740, :1071-1075`. İş yeri adı değişirse (WPC:360 cariyi güncellemez) kural sessizce bozulur.

### 1.11 Taşınmayacak ZTO hataları (birebir kopyalanmaz)

1. WPC:297, :439, :449, :457 ve BPC:313-345 SQL birleştirme; GET ile durum değiştirme; antiforgery yok.
2. WPC `Add` transaction'sız (iş yeri + cari); cari kodu çakışmasında iş yeri yine eklenmiş olur.
3. Pasifleştirilen iş yeri/şube listeden kaybolur, yeniden aktifleştirme yolu yok (Index `Status=true`).
4. Edit "Ad Soyad" etiketi; Edit `placeMarker` `Address=undefined` ara yazımı.
5. BranchProvince Add: `Status` checkbox ve `CreationDate` yok sayılır; vergi no süzgeci çalışmaz; ölü `ViewBag.WorkPlace`; `MAX(ID)` yarışı.
6. `WpSelfMap` ad eşleşmesi; iş yeri adı değişince cari adı güncellenmez.
7. Finans sayfalarında kullanıcı kapsamı yok; kapsam başka sayfalarda tek iş yerine indirgenmiş ve rol tablosuna gömülü.
8. Google Maps anahtarı view'da açık (Blackrose CSP `img-src 'self'`, `connect-src 'self'` — `frontend/nginx/security-headers.conf:5` — zaten harici harita yüklemeye izin vermez).

---

## 2. Blackrose tarafı (mevcut durum)

### 2.1 `organization/`

| Öğe | Yer | Not |
|---|---|---|
| Entity | BR-BE `organization/Branch.java:10-37` | `id`, `code`, `name`; `@SQLRestriction("deleted = false")`; setter/update yok |
| Tablo | BR-MIG `V1__create_branch.sql:1-12` | `code VARCHAR(50)`, `name VARCHAR(200)`, audit, `deleted`; `branch_code_active_uq` |
| REST | `organization/BranchController.java:29-31` GET `/api/v1/organization/branches` (`BRANCH_VIEW`), :35-39 POST (`BRANCH_MANAGE`) | **PUT/DELETE/detay yok** |
| DTO | `organization/BranchDtos.java:11-14` | `CreateBranchRequest(code ≤50, name ≤200)`, `BranchResponse(id, code, name)` |
| İzin | `identity/domain/Permission.java:9-10`; tohum `V2__create_identity.sql:112-130` (FINANCE_SUPER, FINANCE, ACCOUNTING, OPERATIONS, SALES, FLEET_MANAGER, WAREHOUSE → BRANCH_VIEW) | |
| Kiracı açılışı | `tenant/service/TenantMigrator.java:17-24` yalnız migration çalıştırır; **varsayılan şube oluşturulmaz** | İlk şube Tanımlar ekranından eklenir |
| FE | `pages/finance/common.tsx:75-78` `useBranches()` (`?size=200&sort=name`); `pages/finance/DefinitionsPage.tsx:33-77` `BranchesSection` (kod/ad tablosu + ekle diyaloğu) | Şube seçimi: Accounts:178, Funds:32, Invoices, Settlements:163-193, Fleet, Warehouse, Shipments |
| Mevcut çoklu şube seçimi | `pages/finance/ReportsPage.tsx:39-95` (onay kutulu çipler, `&branchIds=` tekrarı) → `finance/web/FinanceController.java:331-337` `GET /finance/reports/daily?branchIds` → `SettlementService.java:173-177` → `FinanceRepositories.java:368-374` | ZTO DailyPaymentReport `workPlaceIds`'in birebir karşılığı; boş = tümü |

### 2.2 `branch_id` taşıyan tablolar

| Tablo | Satır | Zorunlu | Sınıf (öneri §3.2-D2) |
|---|---|---|---|
| `account` | V3:7 | hayır (varsayılan şube) | Ana kart — şirketler arası ortak |
| `account_transaction` | V3:19 | evet | **Defter** → `company_id` |
| `fund_account` | V3:45 | evet | **Defter sahibi** → `company_id` |
| `fund_transaction` | (yok; fon üzerinden) | — | **Defter** → `company_id` |
| `instrument` | V3:129 | evet | **Yasal belge** → `company_id` |
| `purchase_invoice` | V3:163 (`UNIQUE(account_id, number)` :179) | evet | **Yasal belge** → `company_id` |
| `payment_plan` | V3:184 | evet | Finans → `company_id` |
| `settlement` | V3:217 (indeks :234) | evet | **Defter** → `company_id` |
| `opening_invoice` | V21:6 | evet | Yasal belge → `company_id` |
| `vehicle`, `driver` | V6:14, V6:32 | hayır | Operasyonel — yalnız `branch_id` |
| `vehicle_expense` | V6:68 | evet | Masraf → `company_id` (V34 `expense` ile birleşir) |
| `shipment` | V7:10 | evet | Operasyonel — yalnız `branch_id` |
| `freight_invoice` | V7:131 (`number UNIQUE` :128) | evet | **Yasal belge** → `company_id` |
| `warehouse` | V8:8 | evet | Operasyonel |
| `warehouse_invoice` | V8:164 (`number UNIQUE` :161) | evet | **Yasal belge** → `company_id` |
| `import_batch` | V10:44 | evet | Teknik — dokunulmaz |
| `branch_id` **olmayan** yasal belgeler | `quote` (V5:142), `contract` (V5:191), `edocument` (V10:16), `customs_declaration` (V9:13), `shipment_document` (CMR/irsaliye, V7:111 — sefer üzerinden) | — | `quote`, `contract`, `edocument` → doğrudan `company_id`; diğerleri sefer/şube üzerinden türetilir |

### 2.3 Kiracının tüzel kimliği nerede?

| Kullanım | Kaynak | Kanıt |
|---|---|---|
| Navlun faturası PDF başlığı | `admin.tenant.name` | `shipment/service/TripFinanceService.java:157-165` → `ShipmentPdf.java:73-75, :216-220` |
| Teklif PDF başlığı | `admin.tenant.name` | `crm/service/QuoteService.java:293-297` → `QuotePdf.java:39, :50` |
| e-Fatura / e-İrsaliye gönderici | ad = `tenant.name` (`EDocumentService.java:285-287`); VKN/vergi dairesi/adres = `edocument_settings` id=1 (`:91-100`, `:114-122`; yoksa 409 `COMPANY_TAX_REQUIRED`) | tablo V10:2-14 (`CHECK (id = 1)` — **tek satır**); uç `IntegrationController.java:160` GET, :166 PUT `/integration/e-document-settings`; FE `pages/integrations/EDocumentsPage.tsx:25-27` |
| Teslim bildirimi e-postası / takip sayfası | `tenant.name` | `shipment/service/DeliveryNotifier.java:103`, `ShipmentTrackingService.java:232` |
| Logo | **yok** | (dosya altyapısı var: `stored_file` V5:1-15, `files/FileController.java:26`) |
| Kiracı tablosu | `admin.tenant`: `code, name, schema_name, default_currency, time_zone, money_scale, rounding_mode` — VKN/adres yok | admin `V1__create_tenant.sql:1-16`; admin şema adı `admin` (`application.yml:27-30`) |
| SaaS limitleri | `admin.plan.max_users, max_vehicles, max_shipments_month` — şirket/şube limiti yok | admin `V4__create_saas_billing.sql:7-9` |

### 2.4 Belge numaraları

| Belge | Biçim | Sayaç | Kanıt |
|---|---|---|---|
| Navlun faturası | `NF-{yıl}-{000000}` | global `freight_invoice_number_seq` | V7:4; `ShipmentRepositories.java:85-86`; `TripFinanceService.java:111-112` |
| Depo faturası | `DF-{yıl}-{000000}` | global `warehouse_invoice_number_seq` | V8:1; `WarehouseRepositories.java:209`; `WarehouseBillingService.java:213` |
| Sefer, CMR, irsaliye, teklif, sözleşme, gümrük, sayım | global sequence | | `ShipmentRepositories.java:76-82`, `CrmRepositories.java:162, :189`, `CustomsRepositories.java:26`, `WarehouseRepositories.java:136` |

Yıl sequence'ta sıfırlanmaz (yalnız önek değişir). Şirket başına seri yok.

### 2.5 Kullanıcı → şube kapsamı

**Yok.** `app_user` (V2:21-39) ve `UserAccount.java:30-50` şube alanı taşımaz; `user_role` dışında ilişki yok; `branchScope/allowedBranch` araması boş. Tüm şube filtreleri istemci parametresidir.

### 2.6 Defter servisleri ve şube

- `LedgerService.Posting(accountId, branchId, …)` (`finance/service/LedgerService.java:24-26`, yazım :67, ters kayıt :101) — bakiye sorguları şube/şirket kırılımı vermez.
- `FundService` şubeyi yalnız hesap oluştururken alır (`FundService.java:75, :87`); transferde iki fonun şubesi karşılaştırılmaz (:146 civarı; MX2 §0).
- `settlement.branch_id` ile ödenen fonun şubesi arasında tutarlılık kuralı yok.

---

## 3. Tasarım önerisi: çoklu şirket + ZTO iş yeri/şube yapısı

### 3.1 Model

```
company (Tüzel kişi — YENİ, ZTO'da yok)
  └── branch_group (= ZTO "Şube" / ZT_BranchProvince)      [company_id NOT NULL]
        └── branch (= ZTO "İş Yeri" / ZT_WorkPlace)          [company_id NOT NULL, branch_group_id NULL → "Diğer"]
              ├── operasyon: shipment, vehicle, driver, warehouse  (yalnız branch_id; şirket türetilir)
              └── para/yasal belge: account_transaction, fund_account, settlement, instrument,
                  purchase/freight/warehouse/opening invoice, payment_plan, vehicle_expense,
                  V22–V34 yeni tablolar       (branch_id + company_id, bileşik FK)
account (cari) — kiracı geneli, şirketler arası ORTAK (ZTO davranışı); isteğe bağlı company_id kısıtı
app_user ── user_branch (kapsam) ── branch
```

- **Tek şirketli kiracıda** (çoğunluk) şirket katmanı ekranlarda gizlenir; ekranlar ZTO ile birebir kalır (iki seviye: Şube → İş Yeri).
- Şirket sayısı ≥2 olduğunda: iş yeri formunda "Şirket *" alanı, seçim bileşenlerinde üçüncü (en üst) grup seviyesi, üst çubukta aktif şirket seçici (§6-S5).

### 3.2 Kararlar

| # | Konu | Karar | Gerekçe / ZTO karşılaştırması |
|---|---|---|---|
| D1 | Tüzel kimliğin yeri | Yeni `company` tablosu: unvan, kısa ad, VKN/TCKN, vergi dairesi, MERSİS, ticaret sicil, SGK işveren/işyeri sicil (varsayılan), adres, il/ilçe, telefon, e-posta, KEP, web, logo (`stored_file`), varsayılan IBAN (fon hesabı). `admin.tenant.name` artık yalnız SaaS müşteri adıdır | ZTO'da kiracı = tek tüzel kişi; gereksinim 2–3 şirket |
| D2 | `company_id` nerede saklanır? | **Karma:** operasyonel tablolar yalnız `branch_id` (şirket türetilir). **Para ve yasal belge tabloları** `company_id NOT NULL` + bileşik FK `(branch_id, company_id) REFERENCES branch (id, company_id)`; `fund_transaction` için `(fund_account_id, company_id) REFERENCES fund_account (id, company_id)`. `branch` ve `fund_account` üzerinde `UNIQUE (id, company_id)` | (a) Şirket bazlı bakiye/rapor sorgusu JOIN'siz ve indekslenebilir; (b) bileşik FK veritabanı düzeyinde tutarlılık sağlar (tetikleyici gerekmez); (c) `ON UPDATE RESTRICT` sayesinde kullanılmış bir şubenin şirketi değiştirilemez → geçmiş belgeler şirket değiştirmez |
| D3 | Şube grubu (ZTO Şube) | `branch_group` tablosu, **`branch.branch_group_id` FK (1—N, ZTO birebir)**; `branch_group.company_id NOT NULL` ve `(branch_group_id, company_id)` bileşik FK → katı ağaç. Grup boşsa seçim bileşeninde "Diğer" (CAPC:297 `COALESCE(bp.Name,'Diğer')`) | Görevde önerilen `branch_group_member` (N—N) ZTO'da yok; ZTO `WorkPlace.BranchProvinceID` tekildir. Çapraz bölge raporu gerekirse ileride N—N eklenir (§6-S2) |
| D4 | ZTO Şube'nin vergi alanları | `branch_group.tax_number/tax_office/group_type/manager_name` **ekranda birebir tutulur**, ancak "bilgi amaçlı"dır; hiçbir belgeye yazılmaz (ZTO'da da okunmuyor, §0). Yasal kaynak yalnız `company` | Birebir görünüm kuralı + yanlış VKN ile fatura kesme riskini önler |
| D5 | İş yeri carisi (İş Yeri Firması) | **Şirket başına** otomatik cari: şirket oluşturulurken `account(type=… , represents_company_id = şirket)` açılır (ZTO WPC:166-227'nin şirket düzeyindeki karşılığı). Aynı şirketin iş yerleri arası para hareketi cari üretmez, yalnız `fund_transfer` (MX1 §2.0 kararı korunur). **04 §4 V22'deki `account.represents_branch_id` → `represents_company_id` olarak değiştirilir** (§6-S3) | Şirketler arası alacak/borç yasal olarak gerçektir (cari mutabakat, fatura); şube arası değildir |
| D6 | Cari paylaşımı | `account` kiracı genelidir, tüm şirketlerde kullanılır (ZTO: cari ortak, hareket iş yeri bazlı — §1.9). İsteğe bağlı `account.company_id` (NULL = tüm şirketler; dolu = yalnız o şirket, ör. personel carisi, şirket içi cari). Bakiye, ekstre, yaşlandırma, limit **şirket kırılımında** hesaplanır; konsolide görünüm ayrı | Aynı müşteri iki şirketten hizmet alabilir; kartı iki kez açmak mükerrer veri üretir |
| D7 | Cari limiti / risk | `credit_limit`, `risk_limit` (V22) şirketler arası toplam üzerinden kontrol edilir; şirket bazlı limit gerekirse `account_company_limit` ileride | Basit başlangıç; ZTO'da da limit tek |
| D8 | Banka/kasa | `fund_account.company_id NOT NULL` (şubeden). `fund_transfer` (V29) **yalnız aynı şirket** içinde (servis + `CHECK`). Şirketler arası para: A şirketi B-carisine ödeme (`settlement` PAYMENT) + B şirketi A-carisinden tahsilat (`settlement` COLLECTION), tek `intercompany_transfer` belgesiyle aynı transaction'da, `source_type='INTERCOMPANY'` | ZTO'da `ZT_BankTransfers` iş yerleri arası serbest + sonradan onarım uçları (§1.10); Blackrose tek motor + idempotency |
| D9 | `settlement` tutarlılığı | `settlement.company_id = fund_account.company_id = account_transaction.company_id` (servis kontrolü, 422 `COMPANY_MISMATCH`) | Bir şirketin tahsilatı diğerinin kasasına giremez |
| D10 | Çek/senet | `instrument.company_id` (portföy sahibi / keşideci şirket). Ciro başka şirkete yapılamaz; şirketler arası ciro = intercompany cariye ciro | Yasal sahiplik |
| D11 | Fatura numarası | Yeni `document_series (company_id, doc_type, year, prefix, next_value, padding)`; satır kilidiyle (`SELECT … FOR UPDATE`) artırılır. `freight_invoice`, `warehouse_invoice` için `UNIQUE(number)` → `UNIQUE(company_id, number)`. Varsayılan şirket `NF`/`DF` öneklerini ve mevcut sequence değerini devralır; yeni şirketler kendi önekini alır (ör. `B-NF`). Sefer/CMR/teklif/sözleşme numaraları global kalır (iç numara) | ZTO'da seri e-belge ayarında tekil (`DefaultInvoiceSeries`); şirket başına seri yasal zorunluluk |
| D12 | e-Belge | `company_edocument_settings (company_id PK, …)`; gönderici = kaynak belgenin şirketi. `edocument.company_id NOT NULL`. `edocument_settings` (id=1) varsayılan şirkete taşınır, uç geriye uyumlu cephe olarak 1 sürüm kalır, sonra kaldırılır. e-Fatura/e-Arşiv/e-İrsaliye 3 karakterli GİB serileri şirket başına | ZTO `ZT_UyumsoftSetting` tek satır (`UyumsoftController.cs:106`) |
| D13 | PDF / e-posta / takip sayfası | Başlıkta `company.title` + logo + VKN/vergi dairesi/adres; şirket = belgenin (fatura, teklif) ya da seferin şubesinin şirketi. `EDocumentService.companyName()` (:285), `TripFinanceService:160`, `QuoteService:294`, `DeliveryNotifier:103`, `ShipmentTrackingService:232` tek `CompanyIdentityService.of(companyId)` çağrısına iner | 04 §10 "kiracı logosu" açık noktası kapanır |
| D14 | Teklif / sözleşme | `quote.company_id`, `contract.company_id` NOT NULL (varsayılan şirket ile doldurulur); teklif PDF'i o şirket adına | Teklifin hangi şirket adına verildiği sefer→fatura zincirine taşınır: `shipment.branch_id` seçimi teklifin şirketiyle sınırlanır |
| D15 | Personel / maaş (MX6) | Personel kartı `branch_id NOT NULL` (ZTO `PersonnelController.cs:178` zorunlu) → şirket türetilir; personel carisi `account.company_id` = o şirket; maaş tahakkuku ve ödemesi `company_id` taşır; SGK işyeri sicil no **iş yerinde** (`branch.sgk_workplace_no`; boşsa `company.sgk_workplace_no`) — bir şirketin birden çok SGK işyeri olabilir. `driver.branch_id` (V6:32) zorunluya yükseltilir (MX6 kararı) | Gereksinim: "personel tanımları ve maaş ödemeleri her şirket adına" |
| D16 | Raporlar | Tüm finans raporları `companyId` (tekil, boş = konsolide) + `branchIds[]` alır. Konsolide görünümde intercompany cariler (`represents_company_id IS NOT NULL`) varsayılan **hariç** (`excludeIntercompany=true`) — ZTO `WpSelfMap` dışlamasının (CustomerAccountsController.cs:445-456) doğru karşılığı (ad değil kimlik eşleşmesi) | Konsolide bakiye şirketler arası iç borcu iki kez saymaz |
| D17 | Kullanıcı kapsamı | `app_user.branch_scope` (`ALL`/`LIMITED`, varsayılan `ALL` → mevcut kullanıcılar etkilenmez) + `user_branch (user_id, branch_id)` + `app_user.default_branch_id` (formlarda ön seçim — ZTO'nun rol-personel tablosundaki tek `WorkPlaceID`'sinin karşılığı). Sunucu `BranchScopeService.allowedBranchIds()` (null = tümü) tüm liste sorgularına ve oluşturma doğrulamalarına uygulanır (403 `BRANCH_OUT_OF_SCOPE`). Kapsam değişince `token_version` artırılır | ZTO'da merkezî kapsam yok (§1.8); Blackrose'da hiç yok (§2.5) |
| D18 | Pasif / silme | `branch.active`, `branch_group.active`, `company.active`. Pasif → yeni kayıtta seçilemez, listelerde ve raporlarda görünür. Silme (`deleted=true`) yalnız hiç referans yoksa (409). ZTO "Sil" düğmesi = pasifleştir; listede "Pasifleri göster" onay kutusu (ZTO hata #3'ün düzeltmesi) | |
| D19 | Konum | `branch.latitude/longitude NUMERIC(9,6)`; formda "Konum" metin kutusu (`lat,lng`) + "Haritada Göster" dış bağlantısı (Google Maps arama URL'si, yeni sekme — CSP'ye takılmaz). Gömülü harita ve reverse geocode **ÇIKAR** (CSP + anahtar) | §1.11-8 |
| D20 | SaaS | admin `plan.max_companies INT NULL`, `plan.max_branches INT NULL` (NULL = sınırsız); şirket/iş yeri eklemede kontrol (§6-S6) | 04 "admin migration gerekmiyor" notu bu adım için değişir |

### 3.3 Migration önerileri (tenant; ad ve numara koordinatörde)

#### V22a `company`
```sql
CREATE TABLE company (
  id                UUID PRIMARY KEY,
  code              VARCHAR(20)  NOT NULL,
  title             VARCHAR(300) NOT NULL,          -- ticari unvan (faturada)
  short_name        VARCHAR(100) NOT NULL,          -- ekran/menü adı
  tax_id_type       VARCHAR(4)   NOT NULL DEFAULT 'VKN' CHECK (tax_id_type IN ('VKN','TCKN')),
  tax_number        VARCHAR(11),                    -- VKN 10 / TCKN 11 hane; e-belge/fatura için servis zorunlu kılar
  tax_office        VARCHAR(100),
  mersis_no         VARCHAR(16),
  trade_registry_no VARCHAR(50),
  sgk_workplace_no  VARCHAR(26),                    -- varsayılan; iş yeri bazında ezilebilir
  address           VARCHAR(500),
  city              VARCHAR(100),
  district          VARCHAR(100),
  postal_code       VARCHAR(10),
  country           CHAR(2)      NOT NULL DEFAULT 'TR',
  phone             VARCHAR(30),
  email             VARCHAR(254),
  kep_address       VARCHAR(254),
  website           VARCHAR(200),
  logo_file_id      UUID REFERENCES stored_file (id),
  default_fund_account_id UUID,                     -- FK V22c'de (fund_account.company_id sonrası)
  is_default        BOOLEAN      NOT NULL DEFAULT FALSE,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (tax_number IS NULL OR tax_number ~ '^[0-9]{10,11}$')
);
CREATE UNIQUE INDEX company_code_uq    ON company (code)       WHERE deleted = FALSE;
CREATE UNIQUE INDEX company_tax_uq     ON company (tax_number) WHERE deleted = FALSE AND tax_number IS NOT NULL;
CREATE UNIQUE INDEX company_default_uq ON company ((TRUE))     WHERE is_default AND deleted = FALSE;

CREATE TABLE company_edocument_settings (
  company_id        UUID PRIMARY KEY REFERENCES company (id),
  provider          VARCHAR(30)  NOT NULL DEFAULT 'TEST',
  enabled           BOOLEAN      NOT NULL DEFAULT FALSE,
  test_mode         BOOLEAN      NOT NULL DEFAULT TRUE,
  service_url       VARCHAR(300),
  username          VARCHAR(100),
  password_enc      VARCHAR(500),                   -- şifreli; değer belgelerde __PLACEHOLDER__
  sender_alias      VARCHAR(200),                   -- GB etiketi
  receiver_alias    VARCHAR(200),                   -- PK etiketi
  default_profile   VARCHAR(30)  NOT NULL DEFAULT 'TICARIFATURA',
  efatura_series    CHAR(3),
  earsiv_series     CHAR(3),
  eirsaliye_series  CHAR(3),
  despatch_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
  inbox_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
  inbox_last_sync   TIMESTAMPTZ,
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE document_series (
  id          UUID PRIMARY KEY,
  company_id  UUID        NOT NULL REFERENCES company (id),
  doc_type    VARCHAR(30) NOT NULL,   -- FREIGHT_INVOICE, WAREHOUSE_INVOICE (+ ileride PAYROLL_SLIP vb.)
  year        INTEGER,                -- NULL = yıllık sıfırlanmaz
  prefix      VARCHAR(10) NOT NULL,
  next_value  BIGINT      NOT NULL DEFAULT 1 CHECK (next_value > 0),
  padding     INTEGER     NOT NULL DEFAULT 6,
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (company_id, doc_type, year)
);
```
Ayrıca: izin `COMPANY_MANAGE` (Permission enum + `role_permission` tohumu: PATRON otomatik, FINANCE_SUPER). Görüntüleme `BRANCH_VIEW` ile.

#### V22b `branch_group_and_branch_details` + varsayılan şirket göçü
```sql
CREATE TABLE branch_group (                         -- ZTO ZT_BranchProvince
  id           UUID PRIMARY KEY,
  company_id   UUID         NOT NULL REFERENCES company (id),
  name         VARCHAR(50)  NOT NULL,
  group_type   VARCHAR(10)  CHECK (group_type IN ('MAIN','SUB')),  -- Ana Şube / Yan Şube
  phone        VARCHAR(30),
  email        VARCHAR(254),
  address      VARCHAR(500),
  manager_name VARCHAR(200),
  tax_number   VARCHAR(11),                         -- bilgi amaçlı (D4)
  tax_office   VARCHAR(100),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX branch_group_name_uq ON branch_group (company_id, lower(name)) WHERE deleted = FALSE;

ALTER TABLE branch
  ADD COLUMN company_id       UUID REFERENCES company (id),
  ADD COLUMN branch_group_id  UUID,
  ADD COLUMN phone            VARCHAR(30),
  ADD COLUMN address          VARCHAR(500),
  ADD COLUMN city             VARCHAR(100),
  ADD COLUMN district         VARCHAR(100),
  ADD COLUMN latitude         NUMERIC(9,6),
  ADD COLUMN longitude        NUMERIC(9,6),
  ADD COLUMN sgk_workplace_no VARCHAR(26),
  ADD COLUMN active           BOOLEAN NOT NULL DEFAULT TRUE;

-- Varsayılan şirket: ad admin.tenant'tan, vergi bilgisi edocument_settings(id=1)'den.
-- Testcontainers/tek şema ortamında admin.tenant olmayabilir → to_regclass ile korunur.
DO $$
DECLARE v_name TEXT; v_id UUID := gen_random_uuid();
BEGIN
  IF to_regclass('admin.tenant') IS NOT NULL THEN
    EXECUTE 'SELECT name FROM admin.tenant WHERE schema_name = current_schema()' INTO v_name;
  END IF;
  INSERT INTO company (id, code, title, short_name, tax_number, tax_office, address, is_default,
                       created_by, created_at, updated_by, updated_at)
  SELECT v_id, 'SIRKET1', COALESCE(v_name, 'Şirket'), LEFT(COALESCE(v_name, 'Şirket'), 100),
         e.tax_number, e.tax_office, e.address, TRUE, 'system', now(), 'system', now()
  FROM edocument_settings e WHERE e.id = 1;
  UPDATE branch SET company_id = v_id;
  INSERT INTO company_edocument_settings (company_id, created_by, created_at, updated_by, updated_at)
  VALUES (v_id, 'system', now(), 'system', now());
END $$;

ALTER TABLE branch ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE branch ADD CONSTRAINT branch_company_uq UNIQUE (id, company_id);
ALTER TABLE branch ADD CONSTRAINT branch_group_fk
  FOREIGN KEY (branch_group_id, company_id) REFERENCES branch_group (id, company_id);
```
(Not: `gen_random_uuid()` PostgreSQL 13+ çekirdektedir; PG 16 kullanılıyor. `tax_number` biçimi geçersizse `CHECK` göçü bozar → göç öncesi `regexp_replace(tax_number,'\D','','g')` ve uzunluk dışındaysa NULL.)

#### V22c `company_scope_columns` (para ve yasal belge tablolarına `company_id`)
Her tablo için aynı kalıp — örnek `account_transaction`:
```sql
ALTER TABLE account_transaction ADD COLUMN company_id UUID;
UPDATE account_transaction t SET company_id = b.company_id FROM branch b WHERE b.id = t.branch_id;
ALTER TABLE account_transaction ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT account_transaction_branch_company_fk
      FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
CREATE INDEX account_transaction_company_idx ON account_transaction (company_id, account_id);
```
| Tablo | Kaynak | Ek kısıt / indeks |
|---|---|---|
| `account_transaction` | `branch_id` | `(company_id, account_id)` |
| `fund_account` | `branch_id` | `UNIQUE (id, company_id)`; `company.default_fund_account_id` FK burada eklenir |
| `fund_transaction` | `fund_account.company_id` | FK `(fund_account_id, company_id) → fund_account (id, company_id)` |
| `instrument` | `branch_id` | `(company_id, status)` |
| `purchase_invoice` | `branch_id` | `UNIQUE(account_id, number)` korunur (tedarikçi numarası tedarikçiye özgü) |
| `opening_invoice` | `branch_id` | |
| `payment_plan` | `branch_id` | `(company_id, due_date)` |
| `settlement` | `branch_id` | `settlement_daily_idx` → `(type, settlement_date, company_id, branch_id)` |
| `vehicle_expense` | `branch_id` | V34 ile `expense`'e taşınacak |
| `freight_invoice` | `branch_id` | `number UNIQUE` → `UNIQUE (company_id, number)` |
| `warehouse_invoice` | `branch_id` | aynı |
| `quote`, `contract` | varsayılan şirket | `company_id NOT NULL REFERENCES company` |
| `edocument` | kaynak belgenin şirketi (`freight_invoice` / `shipment_document → shipment → branch`) | `(company_id, status)` |

Ayrıca `account`:
```sql
ALTER TABLE account ADD COLUMN company_id UUID REFERENCES company (id);            -- NULL = tüm şirketler (D6)
-- 04 §4 V22'deki represents_branch_id yerine (D5, §6-S3):
ALTER TABLE account ADD COLUMN represents_company_id UUID REFERENCES company (id);
CREATE UNIQUE INDEX account_represents_company_uq ON account (represents_company_id)
  WHERE represents_company_id IS NOT NULL AND deleted = FALSE;
```
Bu iki kolon 04 §4 V22 `account_profile` içine de yazılabilir; V22c'den önce V22 çalışacaksa ad çakışmasına dikkat.

#### V22d `document_series_seed`
Varsayılan şirkete `FREIGHT_INVOICE` (önek `NF`, `year` = içinde bulunulan yıl) ve `WAREHOUSE_INVOICE` (`DF`) satırları; `next_value` = ilgili sequence'in `last_value + 1` (`is_called` false ise `last_value`). Eski sequence'ler bir sürüm daha tutulur, sonra kaldırılır. (Yıllık sıfırlama getirilirse aynı yıl içinde mükerrer numara oluşmaması için mevcut yılın satırı doğru tohumlanmalı; geçmiş yıllar sayaca gerek duymaz.)

#### V22e `user_branch_scope`
```sql
ALTER TABLE app_user
  ADD COLUMN branch_scope      VARCHAR(10) NOT NULL DEFAULT 'ALL' CHECK (branch_scope IN ('ALL','LIMITED')),
  ADD COLUMN default_branch_id UUID REFERENCES branch (id);
CREATE TABLE user_branch (
  user_id   UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branch (id),
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX user_branch_branch_idx ON user_branch (branch_id);
```

#### V22f `edocument_settings_retire` (bir sürüm sonra)
`edocument_settings` tablosunun kaldırılması; o zamana kadar `GET/PUT /integration/e-document-settings` varsayılan şirketin alanlarını okur/yazar.

#### Admin A8 `plan_company_limits`
`ALTER TABLE plan ADD COLUMN max_companies INTEGER, ADD COLUMN max_branches INTEGER;` (NULL = sınırsız).

### 3.4 04 §4 (V22–V34) üzerindeki etkiler

| 04 §4 | Değişiklik |
|---|---|
| V22 `account_profile` | `represents_branch_id` → `represents_company_id`; `account.company_id` (D6). V22a–e'den **sonra** çalışmalı |
| V23 `fund_account_details` | Yeni kolon yok; `fund_opening.company_id` (fondan) |
| V24/V25 çek-senet, koçan | `check_book.company_id` (koçan şirketin banka hesabına ait); `instrument_movement` şirketten türetilir |
| V26 `account_document` | `company_id NOT NULL` + bileşik FK; belge serisi gerekirse `document_series` |
| V27 `account_rollover` | Devir **şirket bazında** (her şirket kendi açılışını yapar) → `company_id` |
| V28 `account_transfer` | Kaynak ve hedef hareketler aynı şirkette; şirketler arası cari virmanı yalnız intercompany cari üzerinden |
| V29 `fund_transfer` | `company_id` + iki fonun aynı şirkette olması (`CHECK` + servis). Şirketler arası para → yeni `intercompany_transfer` (D8; V29'a eklenebilir) |
| V30–V32 | `company_id` (gelir/gider defteri, mevduat, kredi sözleşmesi şirkete ait) |
| V33 `payment_plan_extensions` | `planned_fund_account_id` şirket uyumu kontrolü |
| V34 `expense` | `company_id` + bileşik FK |
| MX6 (personel/bordro) | `employee`/`driver.branch_id NOT NULL`, bordro tabloları `company_id`, SGK sicil `branch.sgk_workplace_no` |

### 3.5 Servis katmanı

- `organization/CompanyService` (CRUD, varsayılan şirket tekilliği, şirket açılınca intercompany cari + `company_edocument_settings` + `document_series` tohumu, plan limiti).
- `organization/BranchScopeService` — `allowedBranchIds()`, `requireBranch(branchId)`, `companyOf(branchId)` (önbellekli).
- `LedgerService`/`FundLedgerService`: çağıran imzaları değişmez; `company_id` şubeden/fondan türetilir ve belge şirketiyle karşılaştırılır (`COMPANY_MISMATCH`). Bakiye sorguları `companyId` parametresi alır.
- `DocumentNumberService.next(companyId, docType, date)` — `TripFinanceService:111-112` ve `WarehouseBillingService:213` buna geçer.
- `CompanyIdentityService.of(companyId)` — PDF/e-belge/e-posta başlıkları (D13).

---

## 4. Eşleme tablosu (`ZTO öğe | Blackrose karşılığı | Karar`)

Karar kodları 04 §3 ile aynı: **UI-API**, **UI+GEN**, **UI+YENİ**, **UI+TABLO**, **ÇIKAR**.

### 4.1 İş Yerleri (WorkPlace)

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Menü "İş Yerleri" (`_Layout.cshtml:1284-1287`) | "ZTO Finans › Tanımlar › İş Yerleri" (`/zto/tanimlar/is-yerleri`) | UI+YENİ (menü) |
| Admin rol kapısı ve "erişiminiz yoktur" bloğu (Index:6, :73-83) | `BRANCH_VIEW` (liste), `BRANCH_MANAGE` (ekle/düzenle/pasifleştir); yetkisizde aynı uyarı bloğu (resim `factory2.jpg` yerine ZTO CSS'li boş kutu) | UI-API |
| Liste başlığı + "Yeni Kayıt" (Index:15-23) | `ZtoWorkPlacesPage` | UI+GEN |
| Kolon Ad / Telefon / Adres | `branch.name`, `phone`, `address` | UI+TABLO (V22b) |
| Kolon Lokasyon (Google Maps bağlantısı) | `latitude,longitude` → aynı dış bağlantı ikonu | UI+TABLO |
| Kolon Şube | `branch_group.name` ("Belirtilmemiş" boşsa) | UI+TABLO |
| Kolon Oluşturma Tarihi | `created_at` | UI-API |
| (yeni) Kolon Şirket | yalnız ≥2 şirkette görünür | UI+YENİ |
| İşlemler: Düzenle / Sil (confirm) | Düzenle → form; Sil → `POST /organization/branches/{id}/deactivate` (pasifleştir), referanssızsa gerçek silme seçeneği yok (ZTO'da da yok) | UI+YENİ |
| Yalnız aktifleri listeleme (WPC:48) | Varsayılan aktif; "Pasifleri göster" onay kutusu + "Aktifleştir" düğmesi | UI+GEN (ZTO hatası #3 düzeltmesi) |
| Liste uç noktası | `GET /organization/branches` + `companyId, groupId, active, q` filtreleri ve şirket/grup adları | UI+GEN |
| Form Ad * | `name` (≤200; ZTO 50 — UI maxlength 50 korunur) | UI-API |
| Form Telefon Numarası * | `phone` (UI: rakam, ≤11, zorunlu) | UI+TABLO |
| Form Şube * | `branch_group_id` (ZTO'da zorunlu; Blackrose'da da zorunlu yapılır, "Diğer" yalnız göç verisi için) | UI+TABLO |
| (yeni) Form Şirket * | `company_id`; tek şirkette gizli ve otomatik | UI+YENİ |
| (Blackrose zorunlu) Kod | `code` NOT NULL — formda yok; sunucu boşsa `IY-0001` üretir; Edit'te salt okunur gösterilir | UI+GEN |
| Form Adres * | `address` | UI+TABLO |
| Form Konum * (readonly, haritadan) | `lat,lng` metin kutusu (yazılabilir, biçim doğrulamalı) + "Haritada Göster" | UI+TABLO; gömülü harita ÇIKAR |
| Google Maps harita + reverse geocode (Add:57, :106-158) | — | ÇIKAR (CSP, anahtar) |
| Form Oluşturma Tarihi (yok sayılan) | salt okunur gösterim (`created_at`) | UI-API |
| Submit "Yeni İş Yeri Oluştur" + spinner | aynı metin, `isPending` ile disable | UI-API |
| Edit ID (readonly), "Ad Soyad" etiketi | ID gizli; etiket "Ad" (ZTO hatası #4) | UI-API |
| Edit "Güncelle" (`Update`) | `PUT /organization/branches/{id}` | UI+YENİ |
| Otomatik İş Yeri Firması carisi (WPC:166-227) | Şirket düzeyinde intercompany cari (D5); iş yeri için cari açılmaz | ÇIKAR (iş yeri düzeyi) / UI+TABLO (şirket düzeyi) |
| Pasifleştirmede cari durum eşitleme (WPC:468-474) | Şirket pasifleşince intercompany carisi `active=false` | UI+GEN |
| Log tablosu yazımı | `audit_log` (mevcut denetim) | UI-API |

### 4.2 Şubeler (BranchProvince)

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Menü "Şubeler" (`_Layout.cshtml:1288-1291`) | "ZTO Finans › Tanımlar › Şubeler" | UI+YENİ |
| Liste (Index) | `ZtoBranchGroupsPage`, `GET /organization/branch-groups` | UI+YENİ + UI+TABLO (V22b) |
| Kolon Şube Adı / Şube Tipi / Durum (yığın) | `name`, `group_type` (Ana Şube / Yan Şube), `active` | UI+TABLO |
| Kolon Telefon / E-posta | `phone`, `email` | UI+TABLO |
| Kolon Adres | `address` | UI+TABLO |
| Kolon Vergi Numarası / Vergi Dairesi | `tax_number`, `tax_office` (bilgi amaçlı, D4) | UI+TABLO |
| Kolon Kayıt Bilgileri (`IntroductionAudit` VC) | `created_by/at`, `updated_by/at` (+ `audit_log` sayısı) → `ZtoAuditCell` ortak bileşeni (MX2'deki BankIntroduction audit'iyle aynı) | UI+GEN |
| DataTables ayarı (sıra tarih desc, sayfa 10) | `ZtoDataTable` aynı varsayılanlar | UI-API |
| İşlemler Düzenle / Sil | `PUT …/branch-groups/{id}`; Sil → pasifleştir; bağlı aktif iş yeri varsa 409 ("Önce iş yerlerini taşıyın") | UI+YENİ (ZTO'da kontrol yok) |
| Form Şube Adı * (50) | `name`, `(company_id, lower(name))` tekil | UI+TABLO |
| Form Telefon (11, rakam) | `phone` | UI+TABLO |
| Form Adres (100) | `address` | UI+TABLO |
| Form E-posta | `email` (`@Email`) | UI+TABLO |
| Form Şube Tipi (Ana Şube / Yan Şube) | `group_type` MAIN/SUB | UI+TABLO |
| Form Vergi Numarası (rakam) | `tax_number` (rakam süzgeci her iki formda çalışır — ZTO hatası #5) | UI+TABLO |
| Form Vergi Dairesi | `tax_office` | UI+TABLO |
| Form Oluşturma Tarihi | salt okunur | UI-API |
| Form Aktif (Add'de yok sayılan) | Add'de gerçekten `active` olarak kaydedilir | UI+TABLO |
| (yeni) Form Şirket * | `company_id`; tek şirkette gizli | UI+YENİ |
| `ManagerName` (yalnız SELECT'te) | `manager_name` kolonu var, formda gösterilmez (ZTO'da da yok) | UI+TABLO (gizli) |

### 4.3 Şirketler (ZTO'da yok)

| Öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Şirket listesi | `ZtoCompaniesPage` — BranchProvince Index düzeninde: Unvan / Kısa Ad / Durum · VKN-TCKN / Vergi Dairesi · Telefon / E-posta · Adres · e-Belge (Açık/Kapalı, Test/Canlı) · Kayıt Bilgileri · İşlemler | UI+YENİ + UI+TABLO (V22a) |
| Şirket formu | BranchProvince Edit'in iki sütun düzeni: Kod*, Unvan*, Kısa Ad*, Kimlik Türü (VKN/TCKN)*, VKN/TCKN, Vergi Dairesi, MERSİS, Ticaret Sicil, SGK İşyeri Sicil, Adres, İl, İlçe, Posta Kodu, Telefon, E-posta, KEP, Web, Varsayılan Banka Hesabı (fon select'i, yalnız bu şirketin), Logo (yükle/önizle), Varsayılan, Aktif | UI+YENİ |
| e-Belge ayarları sekmesi | `company_edocument_settings` (şifre alanı yazılabilir, okunmaz; "kayıtlı" rozeti — ZTO `UyumsoftController.cs:591-616` deseni) | UI+YENİ |
| Belge serileri sekmesi | `document_series` listesi (tür, yıl, önek, sıradaki no) — yalnız ileri alınabilir | UI+YENİ |
| ZTO `ZT_UyumsoftSetting` ekranı | Şirket formundaki e-Belge sekmesi | UI+GEN |
| ZTO admin `Customers.LogoUrl` | `company.logo_file_id` | UI+TABLO |
| Blackrose `edocument_settings` formu (`EDocumentsPage`) | Şirket formuna taşınır; eski ekran "Şirketler'e taşındı" bağlantısı | UI+GEN |

### 4.4 Şube gruplu seçim ve kapsam

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Varyant A: optgroup'lu tekli select (`#filterWorkPlace`, modallardaki İş Yeri select'leri) | `ZtoBranchSelect` (select2 görünümlü, optgroup = şube; ≥2 şirkette optgroup etiketi "Şirket › Şube") | UI+YENİ (bileşen) |
| Varyant A' (İş Yeri Firması carisinden liste, Checks) | Aynı `ZtoBranchSelect` — veri her yerde `branch-tree` | UI+GEN (tek kaynak) |
| Varyant B: dpr/dcr çoklu seçim listesi | `ZtoBranchMultiSelect variant="list"` | UI+YENİ (bileşen) |
| Varyant C: wp-multiselect açılır liste (CustomerAccounts) | `ZtoBranchMultiSelect variant="dropdown"` (etiket "Tüm İş Yerleri Toplamı" / "n iş yeri seçili") | UI+YENİ (bileşen) |
| Varyant D: istatistik çipleri (BankIntroduction) | `ZtoGroupStatChips` (ad + adet); veri sayfanın kendi listesinden | UI-API |
| Veri kurulumu (CAPC:293-331, her controller'da kopya) | `GET /organization/branch-tree?scope=mine&includeInactive=false` | UI+YENİ |
| `workPlaceIds=1,2,3` CSV | `branchIds=a&branchIds=b` (Spring `List<UUID>`, ReportsPage:48 ile aynı) | UI-API |
| Boş seçim = tüm iş yerleri | Boş = kullanıcının izinli tüm şubeleri (kapsam sunucuda uygulanır) | UI+GEN |
| `DailyPaymentReport(reportDate, workPlaceIds)` (CAPC:3221) | `GET /finance/reports/daily?type&date&branchIds` (FinanceController:331-337) | UI-API |
| `GetWorkPlaceBalances` (AT:1007) | `GET /finance/accounts/{id}/balances?groupBy=branch|company` (MX1 GENİŞLET) | UI+GEN |
| `WpSelfMap` ad eşleşmesi dışlaması | `excludeIntercompany` + `represents_company_id` (kimlik eşleşmesi) | UI+GEN |
| Rol-personel tablosundaki tek `WorkPlaceID` kapsamı (§1.8) | `user_branch` + `branch_scope` + `default_branch_id` | UI+TABLO (V22e) |
| Kullanıcı kapsamı tanım ekranı (ZTO'da personel kartı içinde dağınık) | Mevcut MUI kullanıcı düzenleme diyaloğuna "İş Yeri Yetkisi" sekmesi (ZTO'da karşılık ekran olmadığından MUI) | UI+YENİ |
| `ZT_BankTransfers` iş yerleri arası transfer | Aynı şirket: `fund_transfer` (V29). Farklı şirket: `intercompany_transfer` (D8) | UI+TABLO |
| İş yerleri arası cari onarım/temizlik uçları (BankStatement:2817-2894) | — | ÇIKAR (04 §7, MX2 C9) |
| "İş Yerleri Arası Ticari Hesap" (FBS `fbsTradeDebtModal`) | — | ÇIKAR (04 §3; şirketler arası karşılığı intercompany cari ekstresi) |

---

## 5. Uçlar ve React bileşenleri

### 5.1 Backend uçları

| Uç | Durum | Ayrıntı |
|---|---|---|
| `GET /api/v1/organization/companies` | YENİ | `active`, `q`; `BRANCH_VIEW` |
| `GET /organization/companies/{id}` · `POST` · `PUT /{id}` | YENİ | `COMPANY_MANAGE`; VKN 10 hane / TCKN 11 hane + kontrol hanesi doğrulaması; plan `max_companies` |
| `POST /organization/companies/{id}/deactivate` · `/activate` | YENİ | Varsayılan şirket pasifleştirilemez; açık fatura/plan varsa uyarı |
| `PUT /organization/companies/{id}/logo` (multipart) · `GET …/logo` | YENİ | `stored_file(owner_type='COMPANY_LOGO')`; PNG/JPEG/SVG ≤ 1 MB |
| `GET/PUT /organization/companies/{id}/edocument-settings` | YENİ | Parola yalnız yazılır; yanıtta `passwordSet: true/false` |
| `GET /organization/companies/{id}/document-series` · `PUT …/{seriesId}` | YENİ | `next_value` yalnız artırılabilir |
| `GET /organization/branch-groups` · `POST` · `PUT /{id}` · `POST /{id}/deactivate|activate` | YENİ | `companyId`, `active` filtreleri |
| `GET /organization/branches` | GENİŞLET | Yanıta `phone, address, city, district, latitude, longitude, active, companyId, companyName, branchGroupId, branchGroupName`; filtreler `companyId, groupId, active, q`; **kapsam uygulanır** |
| `GET /organization/branches/{id}` · `PUT /{id}` · `POST /{id}/deactivate|activate` | YENİ | Şirket değişikliği referans varsa 409 (bileşik FK ile de korunur) |
| `POST /organization/branches` | GENİŞLET | `code` opsiyonel (otomatik), yeni alanlar, plan `max_branches` |
| `GET /organization/branch-tree?scope=mine|all&includeInactive` | YENİ | `[{companyId, companyName, groups:[{groupId|null, groupName|"Diğer", branches:[{id, code, name, active}]}]}]` — tüm seçim bileşenlerinin tek kaynağı |
| `GET /api/v1/auth/me` (mevcut profil ucu, `identity/web/AuthController.java:99`) | GENİŞLET | `branchScope`, `allowedBranchIds`, `defaultBranchId`, `companies[]` |
| `GET/PUT /identity/users/{id}/branch-scope` | YENİ | `USER_MANAGE`; `{scope, branchIds[], defaultBranchId}`; `token_version++` |
| `GET /finance/accounts`, `/accounts/{id}`, `/accounts/{id}/statement`, `/reports/*`, `/funds`, `/instruments`, `/payment-plans`, `/settlements` | GENİŞLET | `companyId` (+ mevcut/planlanan `branchIds`); kapsam süzgeci; konsolidede `excludeIntercompany` |
| `POST /finance/intercompany-transfers` · `GET` · `POST /{id}/reverse` | YENİ | D8 (V29 ile birlikte) |
| `POST /shipments/{id}/invoice`, warehouse fatura kesme | GENİŞLET | Numara `DocumentNumberService` (şirket serisi); şirket = sefer/sözleşme şubesinin şirketi |
| `POST /integration/e-documents` (gönder) | GENİŞLET | Gönderici = kaynak belgenin şirketi; `company_edocument_settings` |
| `GET/PUT /integration/e-document-settings` | KORU → KALDIR | Bir sürüm varsayılan şirkete cephe (D12) |
| Quote/Contract oluşturma | GENİŞLET | `companyId` (zorunlu, ≥2 şirkette formda) |

### 5.2 React bileşenleri (ZTO görünümlü, `.zto-finans` kapsamında)

| Bileşen / sayfa | Karşılık | Not |
|---|---|---|
| `ZtoWorkPlacesPage` + `ZtoWorkPlaceForm` (Add/Edit) | `Views/WorkPlace/*` | Bölüm §1.3 alan sırası; breadcrumb, `<h4>`, `<hr />`, `col-md-*` düzeni, spinnerlı submit |
| `ZtoBranchGroupsPage` + `ZtoBranchGroupForm` | `Views/BranchProvince/*` | Add tek sütun ızgara, Edit iki sütun — ZTO'daki fark korunur |
| `ZtoCompaniesPage` + `ZtoCompanyForm` (sekmeler: Genel / e-Belge / Seriler) | — | BranchProvince Edit düzeninden türetilir; sekmeler BS4 `nav-tabs` |
| **`ZtoBranchMultiSelect`** (ortak) | PAY:430-534 + :1956-2069 (B), CAI:3885-3899 + :4258-4277 + :6177-6213 (C) | Props: `value: string[]`, `onChange`, `variant: "list" | "dropdown"`, `scope: "mine" | "all"`, `includeInactive?`, `emptyMeansAll = true`, `label?`. Markup ve sınıflar birebir (`dpr-wp-search`, `dpr-wp-list`, `dpr-branch`, `dpr-branch-head`, `dpr-branch-label`, `dpr-branch-check`, `dpr-branch-count`, `dpr-chev`, `dpr-branch-body`, `dpr-wp-item`, `.collapsed`, `.hidden`; dropdown için `wp-multiselect-*`). Davranış: şube kutusu `checked/indeterminate`, "(seçili/toplam)" sayacı, "Tümünü seç ↔ Temizle", ad + şube adında arama ve eşleşen grubu açma, başlığa tıklayınca daralt. ≥2 şirkette en üstte şirket başlığı (aynı stil, `fa-building`), tek şirkette gizli. Sayfa CSS'i (`dpr-*`) ZTO view'unda inline olduğundan `zto-finans` CSS paketine ayrı dosya olarak alınır |
| `ZtoBranchSelect` (ortak) | Varyant A | select2 görünümlü arama kutulu tekli select (04 §2) + optgroup; `allowAll` ("Tüm İş Yerleri"), `required`; `default_branch_id` ön seçimi |
| `ZtoGroupStatChips` | Varyant D | Ad + adet çipleri |
| `useBranchTree(scope)` hook | CAPC:293-331 | TanStack Query anahtarı `["branch-tree", scope]`; şube/şirket CRUD sonrası invalidate |
| `ActiveCompanySwitcher` (MUI AppBar, ≥2 şirkette) | — | "Tüm şirketler (konsolide)" + şirketler; seçim `localStorage` + context; ZTO sayfaları varsayılan `companyId`'yi buradan alır (§6-S5) |
| `UserBranchScopeTab` (MUI kullanıcı diyaloğu) | — | "Tüm iş yerleri / Seçili iş yerleri" + `ZtoBranchMultiSelect` (MUI kabuğunda `.zto-finans` sarmalayıcıyla) + varsayılan iş yeri |
| `ZtoAuditCell` | `IntroductionAudit` VC | MX2 ile ortak |

Kullanım listesi (12.1–12.9'da `ZtoBranchSelect` / `ZtoBranchMultiSelect`'i kullanacak ekranlar): Payments, Collections, `_AddPaymentModal`, `_EditPaymentModal`, Checks, Bills, CheckDetailedReport, DailyPaymentReport, DailyCollectionReport, BankIntroduction, CashIntroduction, BankTransactions, CashTransactions, BankStatement (kaynak/hedef iş yeri), CustomerAccounts (liste filtresi), AccountTransaction (iş yeri filtresi, Borç/Alacak Ekle `workPlaceID`), Statement, FinancialBalanceSheet, CreditContracts, TimeDeposits, ProductionExpenses → `expense`, Personnel/PersonnelSalary (MX6).

---

## 6. Kullanıcı kararı bekleyen sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| S1 | **Cari kartı şirketler arasında ortak mı?** | (a) Ortak kart, bakiye şirket kırılımında; isteğe bağlı `account.company_id` ile tek şirkete kısıtlama · (b) Her şirket kendi cari kartını açar | **(a)** — ZTO davranışı (cari ortak, hareket iş yeri bazlı); mükerrer kart yok; yasal ayrım hareket/belge düzeyinde `company_id` ile sağlanır |
| S2 | **Şube (ZTO BranchProvince) bir şirkete mi bağlı?** | (a) Katı ağaç: Şirket → Şube → İş Yeri (`branch_group.company_id NOT NULL`) · (b) Şube şirketten bağımsız bölge; bir iş yeri birden çok gruba (N—N `branch_group_member`) | **(a)** — ZTO'daki 1—N yapı birebir; seçim bileşeni üç seviyeli basit ağaç kalır. Çapraz bölge raporu ileride eklenebilir |
| S3 | **Şirketler arası işlem modeli** | (a) Şirket başına otomatik intercompany cari (`represents_company_id`); aynı şirketin iş yerleri arası yalnız fon transferi (cari yok) · (b) ZTO gibi her iş yerine cari (`represents_branch_id`, 04 §4 V22) · (c) ikisi birden | **(a)** — 04 §4 V22'deki `represents_branch_id` → `represents_company_id`. İş yeri carisi ZTO'da onarım uçları gerektiren mükerrer kayıtlara yol açıyor (§1.10) |
| S4 | **Fatura numara serisi** | (a) Şirket başına önek + yıl + sıra (`B-NF-2026-000001`), `UNIQUE(company_id, number)`; mevcut `NF`/`DF` varsayılan şirkette kalır · (b) Tek global seri | **(a)** — her tüzel kişinin kendi kesintisiz serisi olmalı; e-belge GİB serileri de şirket başına |
| S5 | **Aktif şirket seçici ve konsolide görünüm** | (a) Üst çubukta şirket seçici (≥2 şirkette), listeler ve formlar varsayılan olarak seçili şirkete süzülür; "Tüm şirketler (konsolide)" seçeneği raporlarda intercompany carileri hariç tutar · (b) Seçici yok; her ekranda şirket filtresi ayrı | **(a)** — 2–3 şirketle günlük çalışmada yanlış şirket adına fatura kesme riskini azaltır; ZTO ekranları değişmez, yalnız varsayılan filtre gelir |
| S6 | **SaaS: şirket ve iş yeri sayısı plan limiti** | (a) admin `plan.max_companies`, `plan.max_branches` (NULL = sınırsız), ek şirket ücretli · (b) Limit yok | **(a)** — kolonlar eklenir, mevcut planlarda NULL; fiyatlandırma kararı ticari ekipte |

---

## 7. Uygulama sırası (12.1a içinde)

1. V22a–V22e migration'ları + Testcontainers göç testi (boş kiracı, tek şubeli kiracı, `admin.tenant` olmayan şema, geçersiz VKN'li `edocument_settings`).
2. `CompanyService`, `BranchScopeService`, `DocumentNumberService`, `CompanyIdentityService`; `LedgerService`/`FundLedgerService` şirket türetimi + `COMPANY_MISMATCH`; PDF/e-belge/e-posta başlıkları.
3. Organization uçları (§5.1) + `/auth/me` genişletmesi + kullanıcı kapsam ucu; kapsam süzgecinin mevcut liste uçlarına eklenmesi.
4. `useBranchTree`, `ZtoBranchSelect`, `ZtoBranchMultiSelect`, `ZtoGroupStatChips` (birim testleri: indeterminate, arama, boş = tümü, tek şirkette şirket seviyesi gizli).
5. `ZtoWorkPlacesPage`, `ZtoBranchGroupsPage`, `ZtoCompaniesPage`, `ActiveCompanySwitcher`, `UserBranchScopeTab`; mevcut MUI `BranchesSection` (DefinitionsPage:33-77) yeni uçlara bağlanır.
6. Ardından 12.1 (V22 `account_profile` — `represents_company_id` ile).

---

## 8. Doğrulanamayan / açık noktalar

- ZTO canlı DB'de `ZT_WorkPlace` kolon sırası (Edit `ItemArray[2]`'nin `Status` olduğu varsayıldı) ve `ManagerName`'in gerçekten var olduğu — şema dökümüyle doğrulanmalı.
- ZTO'da birden çok `ZT_UyumsoftSetting` satırı olan kiracı var mı (kod `ORDER BY ID DESC LIMIT 1` ile sonuncuyu alıyor).
- Blackrose `quote`/`contract` → sefer → fatura zincirinde teklifin şirketi ile seferin şubesinin şirketi farklıysa ne olacağı: öneri 422 (`COMPANY_MISMATCH`), iş tarafı teyidi gerekir.
- `admin.tenant`'tan tenant migration içinde okuma: üretimde aynı veritabanı ve `admin` şeması varsayıldı (`application.yml:27-30`); ayrı veritabanı senaryosu yok.
- MX6 (personel/bordro) kesinleşince `branch.sgk_workplace_no` ↔ `company.sgk_workplace_no` önceliği ve SGK bildirgesinin şirket mi iş yeri mi bazında verileceği teyit edilmeli.

---

## 9. 10 satırlık özet

1. ZTO hiyerarşisi Şube (`ZT_BranchProvince`) 1—N İş Yeri (`ZT_WorkPlace`); finans, personel ve maaş kayıtları `WorkPlaceID` taşır.
2. ZTO'da iş yeri tüzel kişi değildir; Şube'deki VKN/vergi dairesi hiçbir yerde okunmaz; e-belge gönderici VKN'si kiracı başına tek satırdır → ZTO çoklu şirketi desteklemez.
3. "Şube gruplu çoklu seçim" ortak bir dosya değil, 4 varyantlı kopya desendir (optgroup select, dpr/dcr liste, wp-multiselect açılır liste, istatistik çipleri); boş seçim = tümü.
4. ZTO'da finans sayfalarında kullanıcı–iş yeri kısıtı yoktur; Blackrose'da da hiç yoktur.
5. Blackrose `branch` yalnız kod/ad; tüzel kimlik `tenant.name` + tek satırlı `edocument_settings`; fatura numaraları global sequence.
6. Öneri: `company` → `branch_group` (= ZTO Şube) → `branch` (= ZTO İş Yeri) katı ağacı; tek şirkette şirket katmanı gizli, ekranlar ZTO ile birebir.
7. Para ve yasal belge tablolarına `company_id` + bileşik FK `(branch_id, company_id)`; operasyonel tablolar yalnız `branch_id`; cari ortak, bakiye şirket kırılımında.
8. Şirket başına e-belge ayarı, belge serisi, logo; şirketler arası işlem intercompany cari (`represents_company_id`, 04 V22'deki `represents_branch_id` yerine) ile; fon transferi yalnız şirket içinde.
9. Migration önerileri V22a–V22f + admin A8; `user_branch` kapsamı; ortak `ZtoBranchMultiSelect`/`ZtoBranchSelect` bileşenleri ve `GET /organization/branch-tree` tek veri kaynağı.
10. Kullanıcı kararı gereken 6 soru: cari paylaşımı, şube–şirket bağı, şirketler arası model, seri biçimi, aktif şirket seçici, plan limiti.
