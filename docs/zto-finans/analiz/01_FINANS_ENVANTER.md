# Analiz 01 — ZTO Fabrika Finans Envanteri

> **LogisticErp notu (2026-11-13):** Bu dosya ZTO Fabrika reposunda, `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` için yazıldı ve buraya kopyalandı. O prompttaki K1 (.NET 8 MVC) ve K2 (kodu kopyala) kararları **geçersizdir**; geçerli yön `../00_README.md` ve `04_UYARLAMA_KARAR_MATRISI.md` §0. ZTO bulguları (tablolar, ekranlar, iş kuralları, satır referansları) geçerlidir; `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` kaynağına göredir.

> **Kapsam:** `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` Faz 0.1 (solution keşfi) ve Faz 0.2 (bağımlılık envanteri).
> **Yöntem:** ZTO Fabrika kaynak kodu salt okunur tarandı. Büyük controller dosyaları satır satır okunmadı; action imzaları, SQL metinleri, AJAX adresleri ve modal kimlikleri taranarak, iş kuralları için ilgili aralıklar okunarak çıkarıldı. Tablo ve kolon adları yalnızca kodda görülenlerdir; bulunamayanlar `⚠` ile işaretlidir.
> **Gizli bilgi:** Sunucu adresi, şifre ve anahtarlar bu dokümanlarda `__PLACEHOLDER__` olarak geçer.

## Bu dosya nasıl okunur

Bu dosya özet ve dizindir. Her sayfanın tam ayrıntısı (tüm action'lar, modallar, AJAX uçları, tablo ve kolon listeleri, iş kuralları, dosya:satır referansları) `envanter/` altındaki altı dosyadadır:

| Dosya | İçerik |
|---|---|
| [envanter/A_cari.md](envanter/A_cari.md) | Cari hesaplar, cari hareketler, ödeme planlama ve onay, cari raporu |
| [envanter/B_banka_kasa.md](envanter/B_banka_kasa.md) | Banka ve kasa tanıtımı, hareketleri, transfer merkezi, bilanço, vadeli mevduat, finans raporu |
| [envanter/C_odeme_cek_kredi.md](envanter/C_odeme_cek_kredi.md) | Ödeme, tahsilat, çek, senet, kredi sözleşmeleri, cari alacak kayıtları |
| [envanter/D_stok_masraf_kur_sube.md](envanter/D_stok_masraf_kur_sube.md) | Malzeme stoğu, masraf ekranları, kur altyapısı, şube ve iş yeri |
| [envanter/E_ortak_altyapi.md](envanter/E_ortak_altyapi.md) | Kiracılık, kimlik doğrulama, yetki, layout ve menü, yardımcılar, migration, lokalizasyon, testler |
| [envanter/F_arac_cmr_takip_entegrasyon.md](envanter/F_arac_cmr_takip_entegrasyon.md) | Kopyalanmayacak referans parçalar: araç ve şoför kütükleri, satış sevkiyatı, CMR, araç takip, mevcut dış entegrasyonlar |

---

## 1. Solution keşfi (Faz 0.1)

### 1.1 Proje yapısı

| Konu | Bulgu |
|---|---|
| Solution | `ZtoFabrika.sln` içinde **tek proje**: `ZtoFabrika.csproj` (`Microsoft.NET.Sdk.Web`, `net8.0`, `Nullable` ve `ImplicitUsings` açık). Katmanlara ayrılmış ayrı projeler yok. |
| Konum | Git kökü `ZtoFabrika2026/`; proje `ZtoFabrika2026/ZtoFabrika/`; testler `ZtoFabrika2026/tests/`. |
| Klasörler | `Controllers/` (221 dosya, yaklaşık 282.000 satır), `ApiController/` (42), `Services/` (191 dosya, 28 alt klasör), `Models/` (253; finans modelleri `Models/ZT/`, 141 dosya), `Views/` (918 dosya, 209 klasör), `Helpers/` (33), `Hubs/` (2), `Resources/` (3.483 `.resx`), `wwwroot/`. |
| Namespace | Kök `ZtoFabrika`; alt namespace'ler klasör adını izler (`ZtoFabrika.Controllers`, `ZtoFabrika.Services.FinanceReport`, `ZtoFabrika.Helpers`…). |
| Derleme ayarları | `EnableDefaultContentItems=false` (içerik elle eklenir: `wwwroot\**`, `Views\**`, `appsettings*.json`, `web.config`). `RazorCompileOnBuild=false` ve `AddRazorRuntimeCompilation()`: view'lar çalışma zamanında derlenir, bu yüzden `dotnet build` view hatalarını **yakalamaz**. |
| Başlıca paketler | Npgsql (EF Core sağlayıcısı üzerinden), Newtonsoft.Json, DocumentFormat.OpenXml, QRCoder, GoogleAuthenticator, Swashbuckle (ekli ama etkin değil), AspNetCoreRateLimit (kayıtları yorumda), `System.ServiceModel.*` (HKS SOAP), Microsoft.ML, OpenAI. |

### 1.2 Mimari desen — hedeflenen ile gerçek durum

Promptun K1 kararı katmanları "Controller → Service → Warehouse" olarak tanımlıyor. **Finans sayfalarında bu katmanlar yoktur.**

| Konu | Gerçek durum |
|---|---|
| Veri erişimi | Tamamı ham `NpgsqlConnection` / `NpgsqlCommand` / `NpgsqlDataAdapter` + `DataTable`. Dapper yok. EF Core `Context` kayıtlı ama boş (tüm `DbSet`'ler yorumda) ve hiçbir yerde kullanılmıyor. |
| SQL'in yeri | Doğrudan controller action'larının içinde. En büyük finans controller'ları: `AccountTransactionController` 9.420, `CreditContractsController` 7.018, `CustomerAccountsController` 6.753, `BankStatementController` 6.484, `CustomerAccountCollectionController` 5.046, `CustomerAccountPaymentController` 4.913 satır. |
| Service / Warehouse | Yalnızca yeni rapor modüllerinde (`Services/FinanceReport/`: `FrService` → `FrWarehouse` → `FrSql`; ayrıca `QualityControlReport`, `GeneralSummaryReport` vb.). Finans işlem sayfalarında yok. |
| Ortak taban sınıf | Yok. Ortak işlevler statik `Controllers/Methods.cs` (log, yetki, yardımcılar) ve `Models/GlobalVeriables.cs` üzerinden. |
| Controller'lar arası çağrı | Banka ve kasa hareketi, `BankTransactionsController.CreateBankTransaction` ve `CashTransactionsController.CreateCashTransaction` **statik metotlarıyla** yazılır; bunları 10 ve 7 ayrı controller çağırır. |
| DI kayıtları (`Program.cs`) | Finansla ilgili tek servis `ITCMBExchangeRateService` (singleton). Diğer kayıtlar: `IDateTimeProvider`, `SecurityAuditFilter` (global filtre), `IMenuDesignService`, rapor servisleri, HKS, Uyumsoft, ZTO Hal, iki adımlı doğrulama, yapay zekâ asistanı, teşhis servisleri. |

### 1.3 Migration yöntemi (K1'in "keşfet" maddesi)

- EF migrations **yok**; `.sql` dosyalarını çalıştıran otomatik bir araç **yok**. Script'ler elle uygulanır.
- Ana klasör `SQL_Migrations/` (64 dosya, `YYYY_AA_GG_Konu.sql`; hedef veritabanı adın içinde `ZTO_ADMIN` ya da `Tenant` ekiyle belirtilir). Ayrıca `SQL/` (17), `Migrations/` (2), `_migrations/` (1), `Docs/` (152 `.sql`) ve proje kökünde dağınık script'ler var.
- Kod, script'i uygulanmamış veritabanına karşı toleranslı yazılmıştır: `42P01` / `42703` hata kodlarını yakalama deseni 28 dosyada, çalışma zamanında `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` çalıştıran kod 17 dosyada bulunur (finansta iki yer: `ZT_AccountDebtsDeleteLog`, `ZT_SalesTruckDebtLog`).
- **Sonuç:** K1'deki "hiçbir yöntem yoksa sürümlü .sql script'leri öner" koşulu geçerlidir. ZTO LOGISTIC için öneri: numaralı, idempotent `.sql` script'leri (Faz 2'deki `sql/001…900` düzeni) ve uygulanan script'leri kaydeden bir sürüm tablosu.
- **Tam şema dökümü repoda yoktur.** Çekirdek finans tablolarının (`ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_CashTransactions`, `ZT_Checks`, `ZT_Bills`, `Currency` …) `CREATE TABLE` ifadesi hiçbir dosyada bulunmuyor. Kolon adları INSERT/UPDATE ifadelerinden ve `Models/ZT/*.cs` sınıflarından çıkarılabildi; **kolon tipleri, kısıtlar, indeksler, sequence'ler ve tetikleyiciler için canlı bir kiracı veritabanından `pg_dump --schema-only` gerekir** (Faz 2 önkoşulu; onay gerektirir). En yakın kısmi kaynak: `tests/FinanceReportChecks/fixture/01_schema.sql` (17 tablo).

### 1.4 Kimlik doğrulama ve yetki

| Konu | Bulgu |
|---|---|
| Yöntem | **Cookie** kimlik doğrulama (`.ZtoFabrika.Auth`, 30 gün, kayan süre yok) + **Session** (`.ZtoFabrika.Session`, 24 saat). JWT yok. |
| Claim'ler | Dört adet: `NameIdentifier` (kullanıcı adı), `Role`, `zto:tenant-id`, `zto:account-kind` (`master` / `sub-user`). |
| Hesap türleri | *Ana hesap*: admin veritabanındaki `Customers` satırının kendi kullanıcı adı ve şifresi; rol sabit `Admin`. *Alt kullanıcı*: `Users` satırı; `Users.Key`, kiracı veritabanındaki rol-personel tablosunun (`ZT_FinancePerson`, `ZT_Boss`…) `Key` kolonuna bağlanır. |
| Şifre | Düz metin karşılaştırılır (özetleme yok). |
| İki adımlı doğrulama | Yalnızca alt kullanıcılarda (TOTP; `Users.TwoFactorEnabled`, `TwoFactorSecretKey`). |
| "Beni hatırla" | 30 günlük, AES ile şifreli `enc_*` çerezleri; `enc_userDatabase` kiracının tam bağlantı dizesini taşır. Session boşaldığında bu çerezlerden yeniden kurulur. |
| Yetki | `[Authorize]` + `[UserRoleAuthorize("rol1", "rol2"…)]`. Rol tek bir metindir; izin tablosu yoktur. `Finans` rolü girişte `ZT_FinancePerson.SuperStatus` değerine göre `Finans(super)` / `Finans(normal)` claim'ine çevrilir. Toplam 23 rol değeri vardır (liste: [envanter/E_ortak_altyapi.md](envanter/E_ortak_altyapi.md) §4). |
| Eksikler | `AccountCreditsController`, `CheckBooksController` ve `CustomerAccountReportController` sınıf düzeyinde yetki özniteliği taşımıyor. Antiforgery yalnızca beş finans controller'ında var; genel filtre yok. İş yeri kapsamı sunucuda zorlanmıyor (istemciden gelen `workPlaceId` parametresi). |
| Açılış sayfası | Finans rolleri girişte `/AccountTransaction/AllTransactions` sayfasına yönlenir. |

### 1.5 Kiracı çözümleme mekanizması

- **Model: kiracı başına ayrı PostgreSQL veritabanı + merkezi admin veritabanı (`ZTO_ADMIN`).** Tablolarda kiracı kolonu yoktur.
- Kiracı kataloğu admin veritabanındaki `Customers` tablosudur (`DatabaseName`, `Status`, `EndingDate` lisans bitişi, isteğe bağlı kendi sunucusu için `IPAddress` / `Port` / `DbPassword`, belge sunucusu alanları, `QrKey`, `CustomerKey`).
- Girişte kiracının bağlantı dizesi üretilir: `Customers.IPAddress` doluysa kiracının kendi sunucusu, boşsa ortak sunucu + veritabanı adı. Sonuç tam bağlantı dizesi olarak Session'daki `userDatabase` anahtarına yazılır.
- Her controller `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` ile bağlanır. Bazı controller'lar ayrıca `GlobalVeriables.adminDatabase` ile admin veritabanına gider (`Users`, `UserRoles`, `Customers`).
- Admin veritabanı bağlantısı, ortak sunucu adresi ve şifreleri `Models/GlobalVeriables.cs` içinde **kaynak kodda sabittir**; `appsettings.json` içindeki `Default_Connection` yalnızca kullanılmayan EF `Context` içindir.
- Bağlantı dizesine `IntroductionAuditHelper.WithActor` ile kullanıcı adı eklenir (`options=-c zto.audit_actor=…`); `trg_IntroductionAudit` tetikleyicisi işlemi yapan kişiyi buradan okur. Yan etkisi: Npgsql her kullanıcı için ayrı bağlantı havuzu açar.
- **Yeni kiracı açan kod bu repoda yoktur** (`CREATE DATABASE` ya da şablon hiçbir yerde geçmiyor). Kiracı ve `Customers` satırı ayrı bir yönetim panelinde açılıyor görünüyor.
- Mobil ve dış API (`ApiController/`) Session kullanmaz; istemcinin gönderdiği `database` + `token` parametreleriyle doğrular (`Methods.Authorize` → `Customers.CustomerKey`).

### 1.6 Arayüz altyapısı

| Konu | Bulgu |
|---|---|
| Layout | Finans view'ları layout'u view içinde role göre seçer: çoğunlukla `_ProductionLayout`, Admin için `_Layout`, form ve detay için `_ExpertLayout`, rapor için `_ReportLayout`. |
| Menü | Rol başına sabit HTML partial. Finans menüsü `Views/Shared/_CustomerSideMenus/_SideMenu_FinanceItems.cshtml` (35 bağlantı). |
| Üretim bağımlılığı | `_ProductionLayout` içindeki sohbet bileşeni `ViewBag.ProductionPlanningChat` bekler; bu yüzden **her finans sayfası açılışında `ZT_ProductionPlanning` tablosu okunur.** Menü ve layout'lar ayrıca sohbet (ChatHub), asistan, bildirim ve PWA partial'larına bağlıdır. |
| Kütüphaneler | CDN'den ve karışık sürümlerle: layout'larda jQuery 3.4.1 / 3.6.4, Bootstrap 4.3.1, DataTables 1.10.20; finans view'ları kendi içinde jQuery 3.6.0, DataTables 1.13.7, Bootstrap 4.6.2 yükler. Tarih girişi tarayıcının yerel `<input type="date">` alanıdır. |
| JavaScript | Çoğunlukla view içinde satır içi. Ayrı dosyalar `wwwroot/js/zt/` altında (21 dosya, yaklaşık 2,9 MB; neredeyse tamamı finans). `formatCurrency` 18 ayrı dosyada yeniden tanımlı; ortak yardımcı yok. |
| Çıktı | Sunucu tarafı PDF yok (tarayıcı yazdırma + istemci tarafı pdfmake). Excel çoğunlukla istemcide (SheetJS, CSV). |
| AJAX yanıtı | Fiilî standart `{ success, message }` ya da `{ success, data }`. Hata mesajlarında `ex.Message` istemciye gider. Doğrulama elle `if` kontrolleriyle yapılır (FluentValidation yok). |
| Belge numarası | Controller başına özel metot (`KRD-`, `VMD-`, `EFT-`… önekleri, `MAX+1` ya da `COUNT+1`, kilit yok). Yalnızca ödeme onay kodu sequence kullanır. |
| Lokalizasyon | Dört kültür: `tr`, `en`, `fr`, `ar`. View başına ve kültür başına `.resx`; anahtar Türkçe metnin kendisidir. 33 finans controller klasöründe 395 `.resx`. Controller'lardaki JSON mesajları sabit Türkçedir. |
| Kiracı dosyaları | `wwwroot/Documents/<QrKey>/` kiracı verisidir; **kopyalanmamalıdır.** |

### 1.7 Testler

`ZtoFabrika2026/tests/` altındaki testler xUnit değildir; konsol uygulaması ya da Node betiğidir ve tek tek çalıştırılır (`dotnet run --project tests/<Ad>`). Finansla ilgili olanlar: `FinanceAccessChecks`, `FinanceReportChecks` (tek kullanımlık yerel PostgreSQL ile), `BankCashXssChecks`, `BankTransactionsAccessChecks`, `CustomerAccountPaymentAccessChecks`, `PaymentApprovalAccessChecks`, `PaymentManagementAccessChecks`. Son üçünün içeriği dosya adlarından çıkarılmıştır; kaynakları tek tek okunmamıştır (⚠).

---

## 2. Ana envanter tablosu — kullanıcının verdiği 19 sayfa

Okuma kılavuzu:

- Bu bölüm iki katmanlıdır: önce özet tablo, ardından her route için aynı içeriğin madde listesi. 19 satırın on sütunlu tek tabloya sığmaması nedeniyle bu biçim seçildi; tam listeler ayrıntı dosyalarındadır.
- "Action sayısı" ve "modal sayısı" değerleri, ayrıntı dosyalarındaki route ve modal listelerinin satırları sayılarak yazıldı (parçalarda hazır toplam olarak verilmiyor). Statik yardımcı metotlar action sayılmadı.
- Veri erişimi 19 sayfanın tamamında aynıdır: ayrı Warehouse/Repository sınıfı yok, SQL doğrudan controller içinde ham Npgsql ile çalışır. Aşağıdaki "Service/yardımcı" satırları yalnızca buna ek olarak kullanılan yardımcıları sayar.
- "…(+N)" = hücrede gösterilmeyen öğe sayısı.

### 2.0 Özet tablo

| Route | Controller satır sayısı | View / modal | Başka controller bağımlılıkları | Finans dışı bağımlılık düzeyi | Ayrıntı |
|---|---|---|---|---|---|
| /AccountTransaction/AllTransactions | 9420 | 5 view/partial + `_AllTransactionsPaymentTools`; AllTransactions'ta 4 modal (partial üzerinden), Transactions'ta 32 modal + 2 dinamik | CustomerAccounts, BankTransactions, CashTransactions, CustomerAccountCollection, CustomerAccountPayment, CreditContracts, Checks; finans dışı: SalesProductLogistic, ProductionExpenses, MaterialStockAll, PesticideStockAll, Product | **Yüksek** — detay modalları, `AccountTransactionQueries` sorguları ve borç silme kuralları üretim, satış ve stok tablolarına doğrudan bağlı. | [ayrıntı](envanter/A_cari.md) |
| /CustomerAccounts/Index | 6753 | 4 view/partial; Index'te 10 modal | AccountTransaction, CustomerAccountPayment, CustomerAccountCollection, PaymentApproval, BankStatement, Checks, Bills, BankTransactions, CashTransactions, BankAccounts, CreditContracts, TimeDeposits, Investments (bağlantı); finans dışı: Personnel, ProductionSergeantsExpenses, HarvestManagerExpenses, SalesTruckExpenses | **Yüksek** — cari eklerken hesap grubuna göre üretim/satış ana veri tablolarına INSERT yapıyor (polimorfik referans). | [ayrıntı](envanter/A_cari.md) |
| /BankIntroduction/Index | 1604 | 5 view/partial; Index'te 2 modal | CustomerAccounts (statik `GetApprovalStatusCounts`); bağlantılar: BankTransactions, BankStatement, CashIntroduction, PaymentApproval, CreditContracts, Investments, TimeDeposits, Checks | **Düşük** — yalnız layout sohbeti için `ZT_ProductionPlanning` ve ölü rol dalları. | [ayrıntı](envanter/B_banka_kasa.md) |
| /BankTransactions/Index | 2214 | 2 view; Index'te 4 kendi modalı + partial'lardan 4 modal | CustomerAccountCollection, CustomerAccountPayment, CustomerAccounts, PaymentApproval, AccountTransaction, PaymentManagement (AJAX); tahsilat modal partial'ı CustomerAccountCollection klasöründen | **Orta** — ödünç alınan ödeme/tahsilat modalları bahçe ve sipariş uçlarını taşıyor; üst menüde üretim linkleri var. | [ayrıntı](envanter/B_banka_kasa.md) |
| /CashIntroduction/Index | 1161 | 5 view/partial; Index'te 2 modal | Yok (yalnız finans bağlantıları) | **Düşük** — yalnız `ZT_ProductionPlanning` ve ölü rol dalları. | [ayrıntı](envanter/B_banka_kasa.md) |
| /CashTransactions/Index | 1536 | 3 view; Index'te 2 kendi modalı + partial modalları | CustomerAccountCollection, CustomerAccountPayment, CustomerAccounts, AccountTransaction, PaymentManagement, BankTransactions (AJAX) | **Orta** — BankTransactions ile aynı gerekçe. | [ayrıntı](envanter/B_banka_kasa.md) |
| /BankStatement/Index | 6484 | 3 view; Index'te 12 modal | Yalnız bağlantı: AccountTransaction, BankTransactions, CashTransactions | **Orta** — döviz bozumu sipariş bazlı (`ZT_AccountCollectionOrders` → `ZT_Orders` → ürün/müşteri). | [ayrıntı](envanter/B_banka_kasa.md) |
| /CustomerAccountPayment/Payments | 4913 | 2 view + 5 paylaşılan partial; view'da 4 modal + partial modalları + JS içinde 2 modal | CustomerAccounts, CustomerAccountCollection, BankTransactions, PaymentManagement, AccountTransaction, Checks (AJAX); CreditContracts (statik `PayWithCredit`) | **Orta** — bahçe/müstahsil ödeme paylaştırma bloğu eksper raporu tablolarına bağlı. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /CustomerAccountCollection/Collections | 5046 | 3 view/partial; view'da 1 modal + partial'da 2 + JS içinde 2 | CustomerAccounts, AccountTransaction (AJAX) | **Orta** — tahsilatın siparişe tahsisi `ZT_Orders`, `Customer`, `Product` tablolarına bağlı. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /Checks/Checks | 3725 (+ CheckBooks 550) | 4 view + CheckBooks/Index; Checks'te 8 modal | CustomerAccountPayment, CustomerAccountCollection, CustomerAccounts, BankTransactions, PaymentManagement, AccountTransaction (AJAX) | **Düşük-Orta** — iş mantığı saf finans; gömülü ödeme modali bahçe şablonlarını taşıyor. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /Bills/Bills | 1485 | 2 view; Bills'te 4 modal | CustomerAccountPayment, CustomerAccounts, CustomerAccountCollection, BankTransactions, PaymentManagement, AccountTransaction (AJAX) | **Düşük-Orta** — Checks ile aynı gerekçe. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /PaymentApproval/Index | 1653 | 1 view; 4 modal | BankTransactions (yönlendirme + Session `PendingInstructionData`), CustomerAccounts (bağlantı) | **Düşük** — yalnız `ZT_ProductionPlanning`. | [ayrıntı](envanter/A_cari.md) |
| /FinancialBalanceSheet/Index | 1776 | 1 view; 2 modal | AccountTransaction (bağlantı) | **Yüksek** — stok değerleme ve iş yerleri arası ticari borç blokları tamamen stok/üretim tablolarından okuyor. | [ayrıntı](envanter/B_banka_kasa.md) |
| /TimeDeposits/Index | 1492 | 3 view; Index'te 2 modal, Details'te 2 modal | CreditContracts (derleme bağımlılığı: açılır liste DTO'ları o dosyada) | **Düşük** — iş mantığı saf finans; yalnız `ZT_ProductionPlanning`. | [ayrıntı](envanter/B_banka_kasa.md) |
| /CreditContracts/Index | 7018 | 5 view + 1 paylaşılan partial; Index'te 8 modal, Details'te 12 modal | BankTransactions (statik `CreateBankTransaction`); bağlantılar: AccountTransaction, CustomerAccounts | **Düşük** — grubun en temiz parçası; yalnız `ZT_ProductionPlanning` ve belge klasörü adları. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /AccountCredits/Index | 430 | 2 view; Index'te 1 modal, Detail'de 1 modal | CustomerAccountCollection (bağlantı) | **Orta** — `Customer` ile INNER JOIN ve `ZT_Orders` bağı; satış müşterisi olmayan cari listelenmiyor. | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| /MaterialStockAll/Index | 8018 | 14 view; Index'te 1 modal + `_CriticalStockModal` | Weighbridge, ContainerType, PesticideStockAll; AccountTransaction (bağlantı) | **Yüksek** — sayfanın kendisi stok modülü; üretim tüketimi, satınalma, kalite kontrol ve e-Dönüşüm bağları var. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |
| /SalesTruckExpenses/Index | 1199 | 2 view; Index'te 2 modal | AccountTransaction (AJAX + bağlantı); `/SalesTruck/*` uçları (projede olmayan controller) | **Yüksek** — kendi tablosu yok; masraf verisi satış sevk kaydı `ZT_SalesTruck` kolonlarında. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |
| /ProductionExpenses/IndexExpenses | 3150 | 5 view; IndexExpenses'te 1 modal | MaterialStockAll (`GetFile`) | **Orta** — başlık kaydı sipariş, üretim hattı ve malzeme firesine referans veriyor; çekirdek masraf modeli taşınabilir. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |

### /AccountTransaction/AllTransactions

- **View + partial + modal**: `AllTransactions.cshtml`, `Transactions.cshtml`, `_TransactionsPartial.cshtml`, `Statement.cshtml` (Layout=null), `_CurrencyStatementPartial.cshtml`, `Views/Shared/_AllTransactionsPaymentTools.cshtml`. AllTransactions modalları (partial üzerinden): `planActionConfirmModal`, `financeDashboardModal`, `paymentHeatmapModal`, `densitySettingsModal`. Transactions: `addCreditModal`, `addDebtModal`, `cariTasimaModal`, `cariDevirModal`, `editLimitsModal`, `invoicesModal`, `saleEditModal`, `productionDetailModal` …(+24) ve JS içinde `paymentDetailModal`, `collectionDetailModal`.
- **JS/CSS**: `js/zt/accounttransaction/alltransactions.js`, `transactions.js` (12 790 satır); `css/zt/accounttransaction/transactions.css`, `css/zt/bankstatement/index.css`, `collections.css`, `payments.css`. CDN: OpenLayers, chart.js, jQuery, Bootstrap, DataTables, jszip, pdfmake.
- **AJAX uçları**: kendi controller'ında 51 action. Başka controller: `BankTransactions/GetBankList`, `CashTransactions/GetCashList`, `CustomerAccountCollection/GetCollectionDetail`, `CustomerAccountPayment/GetPaymentDetail`, `CustomerAccounts/SearchAccountsForQuickAction`, `GetUpcomingPaymentPlansForDashboard`, `PostponePaymentPlan`, `DeleteDashboardPlan`, `MarkDashboardPlanPaid`, `GetPaymentDensities`, `SavePaymentDensity`, `GetPaymentHeatmapData`, `GetExchangeRatesForHeatmap`; finans dışı: `SalesProductLogistic/GetCurrencies`, `GetWithoutOrderDetails`, `SaveOfficialInfoComprehensive`, `productionexpenses/GetExpenseDetails`, `MaterialStockAll/GetMaterials`, `GetSalesMaterials`, `PesticideStockAll/GetMaterials`, `GetSalesMaterials`, `Product/…`.
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `GlobalVeriables.adminDatabase`, `IDateTimeProvider`, `PaymentPlanHelper.SyncCheckPaymentPlan`, `FileTokenHelper.Protect`, `OfficialSalesCreditRemover.RemoveByTruck`, `Models/ZT/AccountTransactionQueries.cs` (sorgu sabitleri); statik `BankTransactionsController.CreateBankTransaction`, `CashTransactionsController.CreateCashTransaction`.
- **Model/DTO**: `CustomerAccountTransactionsViewModel`, `AccountDebts`, `AccountCredits`, `AccountCreditsInvoice`, `Log`; controller içi `AddDebtRequestWithInvoice`, `AddCreditRequestWithInvoice`, `UpdateDebtRequest`, `CariTransferRequest`, `StatementViewModel` …(+10).
- **SQL nesneleri (finans)**: `ZT_CustomerAccounts` (R,U), `ZT_AccountDebts` (R,I,U,D), `ZT_AccountDebtsInvoice`, `ZT_AccountCredits` (R,I,U,D), `ZT_AccountCreditsInvoice`, `ZT_AccountPayments` (R,D), `ZT_AccountCollections` (R,I,D), `ZT_AccountRollover`, `ZT_AccountTransferHistory`, `ZT_Checks`, `ZT_Bills`, `ZT_BankTransactions` (U), `ZT_CashTransactions` (U); okuma: `ZT_BankIntroduction`, `ZT_CashIntroduction`, `ZT_CreditContracts`, `ZT_CreditInstallments`. Çalışma zamanı DDL: `ZT_SalesTruckDebtLog`.
- **Bağlı finans sayfaları**: `/CustomerAccounts/Index`, `/CustomerAccounts/Add`, `/CustomerAccounts/Edit/{id}`, `/AccountTransaction/Transactions/{id}`, `/AccountTransaction/Statement/{id}`, Collections, Payments, `/CreditContracts/Details`, `/Checks/Checks`.
- **Finans dışı bağımlılıklar**: üretim (`ZT_ProductionPlanning`, `ZT_ProductionConveyor*`, `ZT_ProductionExpenses*`, `ZT_ProductionSergeants*`), eksper/bahçe (`ZT_ExpertReport*`, `Supplier`, `ZT_UsedHarvestManager`), satış (`ZT_SalesTruck` R/U, `ZT_Orders`, `Customer`), stok/ilaç (`ZT_MaterialInvoice` U, `ZT_MaterialPurchases` U, `ZT_MaterialStockAll` U, `ZT_Pesticide*`), nakliye (`TransportCompany`, `TransportTruck`, `ZT_Chauffeur`). `GetDebtRedirectInfo` on ayrı finans dışı sayfaya URL üretir. Borç silme: malzeme tedarikçisi borcu silinince stok geri alınır; sevk nakliye borcu silinince `ZT_SalesTruck` nakliye alanları temizlenir.
- [ayrıntı](envanter/A_cari.md)

### /CustomerAccounts/Index

- **View + partial + modal**: `Index.cshtml` (13 220 satır), `_AccountsTableBody.cshtml`, `Add.cshtml`, `Edit.cshtml`; yan/üst menü partial'ları `_SideMenu_{Finance,AccountingPurchases,Patron,LogisticsPerson,ProductionManager,Default}`, `_NavMenu_{…}`. 10 modal: `currencyDetailModal`, `planDetailModal`, `planActionConfirmModal`, `financeDashboardModal`, `paymentPlanningModal`, `densitySettingsModal`, `approvalSelectionModal`, `deletionSelectionModal`, `treasuryModal`, `paymentHeatmapModal`.
- **JS/CSS**: yerel yalnız `css/zt/customeraccounts/index.css`; sayfaya özel harici JS yok (≈396 KB inline). CDN: chart.js, font-awesome.
- **AJAX uçları**: kendi controller'ında 43 action. Başka controller'lara AJAX yok; bağlantı/yönlendirme olarak yukarıdaki özet tablodaki finans sayfaları ve finans dışı `Personnel/Index`, `/ProductionSergeantsExpenses/ProductionDetails`, `/HarvestManagerExpenses/Details`, `/SalesTruckExpenses/CompanySalesDetails`.
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `ITCMBExchangeRateService` (+ controller içinde iki ayrı doğrudan TCMB çağrısı), `IntroductionAuditHelper.GetActor` / `ExecuteSuppressed`, `Methods.LogAdd`, `IDateTimeProvider`; süreç genelinde statik önbellekler (`_accountsQuickCache`, `_lastStatusUpdate`, `_exRatesCache`).
- **Model/DTO**: `Models/ZT/CustomerAccount.cs` (`CustomerAccount`, `CustomerAccountViewModel`, `CustomerAccountPaymentPlan`, `PaymentPlanningListDto`, `PaymentPlanItemDto`, `CustomerAccountSummaryDTO`, `PaymentPlanningDto` …), `CustomerAccountBankItemDto`, `WorkPlace`, `PaymentPlan`; controller içi `BulkPlanRequest`, `CaBankStoredMeta`.
- **SQL nesneleri (finans)**: `ZT_CustomerAccounts` (R,I,U), `ZT_CustomerAccountPaymentPlans` (R,I,U,D), `ZT_PaymentDensityCurrencies` (R,I,U), `ZT_BankAccounts` (R,I,U,D); okuma: `ZT_AccountDebts/Credits/Payments/Collections`, banka/kasa tanım ve hareketleri, `ZT_Checks`, `ZT_Bills`, `ZT_PaymentPlans`, `ZT_PaymentApprovals`. Trigger: `trg_IntroductionAudit`.
- **Bağlı finans sayfaları**: AccountTransaction (Transactions, Statement, AllTransactions), Payments, Collections, PaymentApproval, BankStatement, Checks, Bills, BankTransactions, CashTransactions, BankAccounts, CreditContracts, TimeDeposits, Investments.
- **Finans dışı bağımlılıklar**: `InsertReferenceRecord` hesap grubuna göre `Supplier`, `Customer`, `ZT_IndustrialSupplier`, `ZT_HarvestManager`, `ZT_ProductionSergeants`, `TransportCompany`, `ZT_LaboratoryFirms`, `ZT_ExpenseItems`, `ZT_WorkPlace`, `ZT_Personnel` tablolarına yazar; liste sorgusu aynı tablolara LEFT JOIN yapar; rol başlıkları için `ZT_ProductionManager`, `ZT_LogisticsPerson`.
- [ayrıntı](envanter/A_cari.md)

### /BankIntroduction/Index

- **View + partial + modal**: `Index.cshtml`, `_AccountCardsListPartial.cshtml`, `Add.cshtml`, `Edit.cshtml`, `Details.cshtml`; ViewComponent `IntroductionAudit`. Index modalları: `deleteModal`, `bankInstructionModal`.
- **JS/CSS**: `css/zt/timedeposits/index.css`, `css/introduction-audit.css`; ayrı JS yok (inline). CDN: select2, jQuery.
- **AJAX uçları**: kendi controller'ında 14 action; başka controller'a AJAX yok.
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `IDefinitionAuditService` + `DefinitionAuditRegistry`, `IntroductionAuditHelper.GetActor`, statik `CustomerAccountsController.GetApprovalStatusCounts`.
- **Model/DTO**: `BankIntroduction`, `BankCurrencyStatViewModel`, `StatisticGroupViewModel`, `BankPaymentInstruction` ailesi, `BankInstitutionList`; controller içi `BankStatsDto`, `TransactionCheckResult`, `BankTransactionDto`.
- **SQL nesneleri (finans)**: `ZT_BankIntroduction` (R/W), `ZT_BankAccounts` (R/W), `ZT_BankPaymentInstructions` (W), `ZT_BankPaymentInstructionDetails` (W), `ZT_CustomerAccountPaymentPlans` (W); okuma: `ZT_BankTransactions`, `ZT_CustomerAccounts`, `ZT_CreditContracts`, `ZT_TimeDeposits`, `ZT_Investments`, `ZT_AccountPayments`, `ZT_AccountCollections`.
- **Bağlı finans sayfaları**: BankTransactions, BankStatement (Index, BankExtract), CashIntroduction, CustomerAccounts, PaymentApproval, CreditContracts, Investments, TimeDeposits, Checks.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning` (layout sohbeti); `ZT_LogisticsPerson`, `ZT_ProductionManager` rol dalları.
- [ayrıntı](envanter/B_banka_kasa.md)

### /BankTransactions/Index

- **View + partial + modal**: `Index.cshtml` (5680 satır), `ActivityReport.cshtml`; partial'lar `Views/Shared/_AddPaymentModal.cshtml` (içinde `_CheckLeafGuard`), `_PostPaymentPlanningModal.cshtml`, `Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml`. Kendi modalları: `allPaymentsCompletedModal`, `transactionDetailModal`, `activityReportModal`, `instructionPaymentSelectionModal`; partial'lardan `addPaymentModal`, `postPaymentPlanningModal`, `addCollectionModal`, `editCollectionModal`.
- **JS/CSS**: `js/zt/payments/payments.js`, `js/zt/banktransactions/BankTransactionsPayments.js` (iki kez yükleniyor), `BankTransactionsCollections.js`, `js/zt/payments/searchable-select.js`, `js/zt/collections/searchable-select.js`; `css/zt/banktransaction/index.css`, `collections.css`, `payments.css`. CDN: DataTables, JSZip.
- **AJAX uçları**: kendi controller'ında 17 action. Başka controller: CustomerAccountCollection (14 uç adı; `AddCollection`, `UpdateCollection`, `GetCollectionList`, `GetCustomerOrders` …), CustomerAccountPayment (`AddPayment`, `GetPaymentList`, `SaveQuickPaymentPlanning`, `GetEndorsableChecks`, `GetSupplierGardens`, `MatchPaymentWithCheck` …), CustomerAccounts (`GetAccountBalancesByCurrency`, `GetAllCurrenciesForPlan`, `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning`), PaymentApproval (`UpdateInstructionStatusToCompleted`), AccountTransaction (`Transactions`, `GetAvailableCurrencies`, `GetWorkPlaceBalances`), PaymentManagement (`GetCustomerDebtSummary`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `ScriptJson.Serialize`, `GlobalVeriables.adminDatabase`. Bu controller'ın statik `CreateBankTransaction` metodu başka controller'ların ortak banka hareketi yazıcısıdır.
- **Model/DTO**: controller içi `FIFOEntry`, `UsedEntry`, `FIFOMatch`, `PostponeMultipleRequest`, `FilteredTransactionsRequest`, `TransactionItem`; view modeli yok.
- **SQL nesneleri (finans)**: `ZT_BankTransactions` (R/W), `ZT_AccountCollectionOrders` (DELETE), `ZT_AccountCollections` (R + kalıcı DELETE), `ZT_CustomerAccountPaymentPlans` (UPDATE); okuma: `ZT_BankIntroduction`, `ZT_AccountPayments`, `ZT_CustomerAccounts`, `ZT_CashIntroduction`.
- **Bağlı finans sayfaları**: BankIntroduction, CashIntroduction, CashTransactions, CustomerAccounts, AccountTransaction/Transactions, Payments, BankStatement.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; üst menüde üretim/satış sayfalarına sabit linkler; JS'te `GetCustomerOrders`, `GetGardenPaymentHistory`, `GetSupplierGardens`; maaş muhasebe tipleri (personel modülü).
- [ayrıntı](envanter/B_banka_kasa.md)

### /CashIntroduction/Index

- **View + partial + modal**: `Index.cshtml`, `_CashCardsListPartial.cshtml`, `_CashDetailPartial.cshtml`, `Add.cshtml`, `Edit.cshtml`. Modallar: `cashDetailModal`, `deleteModal`.
- **JS/CSS**: `css/zt/timedeposits/index.css`; inline script. CDN: jQuery.
- **AJAX uçları**: kendi controller'ında 10 action; başka controller yok.
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `IDefinitionAuditService` (`"cash"`), `GlobalVeriables.adminDatabase`.
- **Model/DTO**: `CashIntroduction`, `CashDetailViewModel` (`CashDetailDto`, `CashTransactionDto`), controller içi `CashTransactionCheckResult`.
- **SQL nesneleri (finans)**: `ZT_CashIntroduction` (R/W); okuma: `ZT_CashTransactions`, `ZT_AccountPayments`, `ZT_AccountCollections`.
- **Bağlı finans sayfaları**: CashTransactions (Index, CashExtract), BankStatement, BankIntroduction, BankTransactions, CustomerAccounts.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; `ZT_LogisticsPerson`, `ZT_ProductionManager` rol dalları.
- [ayrıntı](envanter/B_banka_kasa.md)

### /CashTransactions/Index

- **View + partial + modal**: `Index.cshtml`, `ActivityReport.cshtml`, `CashExtract.cshtml` (Layout=null); partial'lar `_AddPaymentModal`, `Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml`. Kendi modalları: `transactionDetailModal`, `cashActivityReportModal` + partial modalları.
- **JS/CSS**: `js/zt/cashtransactions/cashtransactionspayments.js`, `cashtransactionscollections.js`, `js/zt/collections/searchable-select.js`; `css/zt/cashtransaction/index.css`, `collections.css`, `payments.css`. CDN: DataTables.
- **AJAX uçları**: kendi controller'ında 10 action. Başka controller: CustomerAccountCollection, CustomerAccountPayment, CustomerAccounts (BankTransactions ile aynı uç kümeleri), AccountTransaction (`Transactions`, `GetAvailableCurrencies`, `GetWorkPlaceBalances`), PaymentManagement (`GetCustomerDebtSummary`), BankTransactions (`CheckInstructionSessionExists`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`. Statik `CreateCashTransaction` başka controller'ların ortak kasa hareketi yazıcısıdır.
- **Model/DTO**: `CashExtractViewModel`, `CashExtractRowViewModel`; controller içi `FIFOMatch`, `FIFOEntry`, `UsedEntry`.
- **SQL nesneleri (finans)**: `ZT_CashTransactions` (R/W); okuma: `ZT_CashIntroduction`, `ZT_CustomerAccounts`.
- **Bağlı finans sayfaları**: CashIntroduction, BankIntroduction, BankTransactions, BankStatement, CustomerAccounts, AccountTransaction/Transactions, Payments.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; üst menü üretim/satış linkleri; JS'te bahçe ve sipariş uçları.
- [ayrıntı](envanter/B_banka_kasa.md)

### /BankStatement/Index

- **View + partial + modal**: `Index.cshtml`, `BankExtract.cshtml` (Layout=null), `ExchangeBreakReport.cshtml`. 12 modal: `exchangeBreakReportModal`, `bulkSyncCariModal`, `editDovizBozumModal`, `editVirmanModal`, `editEftModal`, `editHavaleModal`, `editBankToCashModal`, `editCashToBankModal` …(+4).
- **JS/CSS**: `js/zt/bankstatement/index.js` (4659 satır; sayfanın tüm mantığı), `css/zt/bankstatement/index.css`.
- **AJAX uçları**: kendi controller'ında 28 action; başka controller'a yalnız bağlantı (`/AccountTransaction/Transactions`, `/BankTransactions/Index`, `/CashTransactions/Index`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `IntroductionAuditHelper.GetActor`; banka/kasa hareketini kendi private `InsertBankTransaction` / `InsertCashTransaction` metotlarıyla yazar.
- **Model/DTO**: `BankTransferDto`, `BankTransferEditDto`, `BankTransferDeleteDto`, `CollectionOrderExchange`, `ExchangeBreakSourceItem`, `SyncTransferCariDto`, `BankExtractViewModel`; `Models/ZT/BankTransferDto.cs` içinde aynı adlı ikinci tanım.
- **SQL nesneleri (finans)**: `ZT_BankTransfers` (R/W), `ZT_BankTransactions` (R/W), `ZT_CashTransactions` (R/W), `ZT_ExchangeBreakSource` (R/W/D), `ZT_AccountPayments` (R/W/D), `ZT_AccountCollections` (R/W/D), `ZT_AccountCollectionOrders` (R/W); okuma: `ZT_CustomerAccounts`, `ZT_BankIntroduction`, `ZT_CashIntroduction`.
- **Bağlı finans sayfaları**: BankIntroduction, BankTransactions, CashIntroduction, CashTransactions, CustomerAccounts, AccountTransaction/Transactions.
- **Finans dışı bağımlılıklar**: sipariş bazlı döviz bozumu (`ZT_Orders`, `Product`, `SubProduct`, `Customer`); `ZT_ProductionPlanning`.
- [ayrıntı](envanter/B_banka_kasa.md)

### /CustomerAccountPayment/Payments

- **View + partial + modal**: `Payments.cshtml`, `DailyPaymentReport.cshtml`; paylaşılan partial'lar `_AddPaymentModal`, `_EditPaymentModal`, `_PostPaymentPlanningModal`, `_PaymentManagementMenu`, `_CheckLeafGuard`. View modalları: `dailyPaymentReportModal`, `checkMatchModal`, `addPaymentModal`, `gardenPaymentHistoryModal`; partial'lardan `addPaymentModal`, `editPaymentModal`, `postPaymentPlanningModal`; JS içinde `confirmDeleteModal`, `paymentDetailModal`.
- **JS/CSS**: `js/zt/payments/payments.js`, `js/zt/payments/searchable-select.js`, `css/zt/customeraccountpayment/payments.css`. CDN: jQuery, Bootstrap, DataTables, JSZip, pdfmake.
- **AJAX uçları**: kendi controller'ında 20 action. Başka controller: CustomerAccounts (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning`, `GetAllCurrenciesForPlan`, `GetAccountBalancesByCurrency`), CustomerAccountCollection (`GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`), BankTransactions (`CheckInstructionSessionExists`), PaymentManagement (`GetCustomerDebtSummary`), AccountTransaction (`GetWorkPlaceBalances`, `GetAvailableCurrencies`, `Transactions`), Checks (`CheckLeafLookup`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `PaymentPlanHelper.SyncCheckPaymentPlan`, statik `CreditContractsController.PayWithCredit`, `BankTransactionsController.CreateBankTransaction`, `CashTransactionsController.CreateCashTransaction`, `Methods.LogAdd`, `ScriptJson.Serialize`; `using static` ile `BillsController` ve `ChecksController` iç sınıfları.
- **Model/DTO**: tamamı controller içinde: `PaymentRequestModel`, `GardenPaymentShareDto`, `QuickPaymentPlanningDto`, `PaymentViewModel`, `DailyPaymentReportViewModel` ve alt sınıfları.
- **SQL nesneleri (finans)**: `ZT_AccountPayments` (R/I/U/D), `ZT_Checks` (R/I/U), `ZT_CheckMovements` (I), `ZT_CheckBooks` (R/U), `ZT_Bills` (R/I), `ZT_BankTransactions` (R/U), `ZT_CashTransactions` (R/U), `ZT_CustomerAccounts` (R/U), `ZT_CustomerAccountPaymentPlans` (R/I/U), `ZT_BankPaymentInstructionDetails` (U) …(+okuma).
- **Bağlı finans sayfaları**: CustomerAccounts/Index, Checks, Bills, Collections, AccountTransaction/Transactions, PaymentManagement sayfaları, DailyPaymentReport.
- **Finans dışı bağımlılıklar**: bahçe/müstahsil ödeme paylaştırma (`ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `Supplier`, `Product`, `SubProduct`, `ZT_CustomerAccountSupplierPaymentsShares`); view içinden `ZT_Setting` ("Reçeteli Üretim"); `ZT_ProductionPlanning`; üst menü üretim/satış linkleri.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /CustomerAccountCollection/Collections

- **View + partial + modal**: `Collections.cshtml`, `_CollectionModalsPartial.cshtml`, `DailyCollectionReport.cshtml`. Modallar: `dailyCollectionReportModal`; partial'da `addCollectionModal`, `editCollectionModal`; JS içinde `confirmDeleteModal`, `collectionDetailModal`.
- **JS/CSS**: `js/zt/collections/collections.js`, `js/zt/collections/searchable-select.js`, `css/zt/customeraccountcollection/collections.css`, `css/zt/accounttransaction/transactions.css`. CDN: Payments ile aynı küme.
- **AJAX uçları**: kendi controller'ında 19 action. Başka controller: CustomerAccounts (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`), AccountTransaction (`Transactions`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `PaymentPlanHelper.SyncCheckPaymentPlan` / `CancelCheckPaymentPlan`, statik `CreateBankTransaction` / `CreateCashTransaction`, `Methods.LogAdd`, `ScriptJson.Serialize`.
- **Model/DTO**: controller içinde `CollectionRequestModel`, `OrderAllocation`, `CollectionViewModel`, `DailyCollectionReportViewModel`; aynı dosyada `LegacyCheckSummary`, `PaymentDateCheckRow`.
- **SQL nesneleri (finans)**: `ZT_AccountCollections` (R/I/U/D), `ZT_AccountCollectionOrders` (R/I/D), `ZT_Checks` (R/I/U/D), `ZT_CheckMovements` (I), `ZT_CheckBooks` (R/U), `ZT_Bills` (R/I/U/D), `ZT_BankTransactions` (R/U/D), `ZT_CashTransactions` (R/U) …(+okuma).
- **Bağlı finans sayfaları**: CustomerAccounts/Index, Payments, Checks, Bills, AccountTransaction/Transactions, DailyCollectionReport.
- **Finans dışı bağımlılıklar**: sipariş tahsisi (`ZT_Orders`, `Customer`, `Product`); `ZT_Setting`; `ZT_ProductionPlanning`; üst menü linkleri.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /Checks/Checks

- **View + partial + modal**: `Checks.cshtml` (5534 satır), `EditCheck.cshtml`, `CheckDetailedReport.cshtml`, `CheckDocuments.cshtml`, `Views/CheckBooks/Index.cshtml`; partial `_CheckLeafGuard`. `Checks.cshtml.bak2` yedek dosyadır, taşınmamalı. 8 modal: `ciroChecksModal`, `checkMovementsModal`, `updateStatusModal`, `checkLeafModal`, `addCheckModal`, `addPaymentModal`, `checkDetailedReportModal`, `confirmModal`.
- **JS/CSS**: `css/zt/checks/checks.css`, `css/zt/customeraccountpayment/payments.css`, `js/zt/payments/payments.js`, `searchable-select.js`, `css/zt/checkbooks/index.css`; çeke özel ayrı JS yok (inline). CDN: jQuery (iki sürüm birlikte), Bootstrap, DataTables, JSZip.
- **AJAX uçları**: ChecksController'da 17, CheckBooksController'da 5 action. Başka controller: CustomerAccountPayment (`GetEndorsableChecks`, `AddPayment`, `GetPaymentList`, `SaveQuickPaymentPlanning` …), CustomerAccountCollection (`GetBanksByWorkPlaceCustomer`, `GetCustomerCreditSummary`, `GetCashByWorkPlaceCustomer`), CustomerAccounts (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`), BankTransactions (`GetBankList`), PaymentManagement (`GetCustomerDebtSummary`), AccountTransaction (`GetWorkPlaceBalances`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `PaymentPlanHelper.SyncCheckPaymentPlan` / `CancelCheckPaymentPlan`, statik `BankTransactionsController.CreateBankTransaction`, `IntroductionAuditHelper.GetActor`, `Methods.LogAdd`, `Methods.GetDirectories`, `NetworkConnection`, `TenantFileAccess.TryResolve`, `ScriptJson.Serialize`.
- **Model/DTO**: controller içinde `CheckInfoViewModel`, `CheckDetailedReportViewModel` ailesi, `CheckViewModel`, `CheckEditViewModel`, `DeleteFileModel`; CheckBooks'ta `CheckBookViewModel`, `CheckBookAddViewModel`.
- **SQL nesneleri (finans)**: `ZT_Checks` (R/U), `ZT_CheckMovements` (yalnız R), `ZT_CheckBooks` (R/U; CheckBooks'ta I/U/D), `ZT_CashTransactions` (R/I/U/D), `ZT_BankTransactions` (R/U/D), `ZT_AccountPayments` (R/I/U/D); okuma: `ZT_AccountCollections`, `ZT_CustomerAccounts`, banka/kasa tanımları.
- **Bağlı finans sayfaları**: CustomerAccounts/Index, CheckBooks/Index, Payments, Bills, BankTransactions/Index, AccountTransaction/Transactions.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; gömülü ödeme modali üzerinden bahçe şablonları; belge klasörü adları; üst menü linkleri.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /Bills/Bills

- **View + partial + modal**: `Bills.cshtml`, `EditBill.cshtml`. Modallar: `billDetailModal`, `addBillModal`, `addPaymentModal`, `updateStatusModal`.
- **JS/CSS**: `css/zt/bills/bills.css`, `css/zt/customeraccountpayment/payments.css`, `js/zt/payments/payments.js`, `searchable-select.js`; senete özel JS yok. CDN: jQuery, Bootstrap, DataTables, JSZip.
- **AJAX uçları**: kendi controller'ında 10 action. Başka controller: CustomerAccountPayment (`AddPayment`, `GetPaymentList`, `SaveQuickPaymentPlanning` …), CustomerAccounts (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`), CustomerAccountCollection (`GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`), BankTransactions (`GetBankList`), PaymentManagement (`GetCustomerDebtSummary`), AccountTransaction (`GetWorkPlaceBalances`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: statik `BankTransactionsController.CreateBankTransaction`, `Methods.LogAdd`, `ScriptJson.Serialize`. `PaymentPlanHelper` kullanılmıyor.
- **Model/DTO**: controller içinde `BillInfoViewModel`, `BillViewModel`, `BillEditViewModel`.
- **SQL nesneleri (finans)**: `ZT_Bills` (R/I/U), `ZT_BankTransactions` (R/U); okuma: `ZT_CustomerAccounts`.
- **Bağlı finans sayfaları**: CustomerAccounts/Index, Payments, Checks.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; gömülü ödeme modali üzerinden bahçe bağımlılıkları; üst menü linkleri.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /PaymentApproval/Index

- **View + partial + modal**: `Views/PaymentApproval/Index.cshtml` (4300 satır). Modallar: `notesModal`, `orderDetailModal`, `confirmModal`, `instructionProcessModal`.
- **JS/CSS**: `css/zt/paymentapproval/index.css`; harici sayfa JS'i yok (≈132 KB inline). CDN: SheetJS, select2.
- **AJAX uçları**: kendi controller'ında 17 action. Başka controller: `BankTransactions/Index` (talimat sonrası yönlendirme; veri Session `PendingInstructionData` anahtarında), `CustomerAccounts/Index` (bağlantı).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `IntroductionAuditHelper.GetActor`, `Methods.LogAdd`, `IDateTimeProvider`.
- **Model/DTO**: controller içinde `PaymentPlanHierarchyViewModel`, `BankGroupViewModel`, `DateGroupViewModel`, `PaymentPlanItemViewModel`, `BulkOrderRequest`, `BulkOrderWithSessionRequest`; `Models/ZT/BankPaymentInstruction.cs`.
- **SQL nesneleri (finans)**: `ZT_CustomerAccountPaymentPlans` (R/U), `ZT_BankPaymentInstructionDetails` (R/U); okuma: `ZT_BankAccounts`, `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_CustomerAccounts`.
- **Bağlı finans sayfaları**: BankTransactions/Index, CustomerAccounts/Index.
- **Finans dışı bağımlılıklar**: yalnız `ZT_ProductionPlanning`.
- **İlgili ek parçalar**: `PaymentApprovalApiController`, `PaymentManagementController`, `PaymentPlanHelper` (bölüm 3).
- [ayrıntı](envanter/A_cari.md)

### /FinancialBalanceSheet/Index

- **View + partial + modal**: `Views/FinancialBalanceSheet/Index.cshtml`. Modallar: `fbsStockModal`, `fbsTradeDebtModal`.
- **JS/CSS**: harici dosya yok (inline).
- **AJAX uçları**: kendi controller'ında 2 action (`Index`, `GetInterWorkplaceTradeDebt`); başka controller'a yalnız bağlantı (`/AccountTransaction/Transactions`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `ITCMBExchangeRateService.GetExchangeRatesAsync`.
- **Model/DTO**: `Models/ZT/FinancialBalanceSheetViewModels.cs` (`FinancialBalanceSheetViewModel`, `WorkplaceBalanceCardDto`, `StockBlockDto`, `CurrencyBlockDto`, `CariBalanceDto`, `CariCurrencyBalanceDto`, `InterWorkplaceBalanceDto`).
- **SQL nesneleri (finans)**: tamamı okuma: `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_CustomerAccounts`, `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_CashIntroduction`, `ZT_CashTransactions`, `ZT_Checks`.
- **Bağlı finans sayfaları**: AccountTransaction/Transactions.
- **Finans dışı bağımlılıklar**: `LoadStockValuesByWorkPlace` (malzeme, ilaç, hammadde aracı, eksper raporu, palet, üretim konveyörü tabloları) ve `GetInterWorkplaceTradeDebt` (parti, palet, stok hareketi, üretim çavuşu) — iki blok da lojistikte çıkarılmalı ya da eşdeğere dönüştürülmeli.
- [ayrıntı](envanter/B_banka_kasa.md)

### /TimeDeposits/Index

- **View + partial + modal**: `Index.cshtml`, `Add.cshtml`, `Details.cshtml`. Modallar: `collectModal`, `breakModal` (Index ve Details'te).
- **JS/CSS**: `css/zt/timedeposits/index.css` (BankIntroduction ve CashIntroduction da kullanıyor); harici JS yok.
- **AJAX uçları**: kendi controller'ında 11 action; başka controller yok.
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`; banka hareketini kendi private `CreateBankTransaction` metoduyla yazar.
- **Model/DTO**: `TimeDeposit`, `TimeDepositViewModel`, `InterestCollection`; controller içi `TimeDepositStatsDto`, `CollectInterestDto`, `BreakDepositDto`. `BankDropdownDto`, `CurrencyDropdownDto`, `SimpleDropdownDto` sınıfları `CreditContractsController.cs` dosyasında tanımlı.
- **SQL nesneleri (finans)**: `ZT_TimeDeposits` (R/W), `ZT_InterestCollections` (R/W), `ZT_FinIncomeExpense` (W), `ZT_BankIntroduction` (R/W; `Balance` güncellemesi dahil), `ZT_BankTransactions` (W).
- **Bağlı finans sayfaları**: CustomerAccounts/Index, Investments/Index, BankIntroduction.
- **Finans dışı bağımlılıklar**: yalnız `ZT_ProductionPlanning`.
- [ayrıntı](envanter/B_banka_kasa.md)

### /CreditContracts/Index

- **View + partial + modal**: `Index.cshtml`, `Add.cshtml`, `Details.cshtml`, `Dashboard.cshtml`, `CreditDocuments.cshtml`, `Views/Shared/_CreditDashboardWidget.cshtml`. Index'te 8 modal (`forceDeleteCreditModal`, `assignCariModal`, `payInstallmentModal`, `useInstallmentCreditModal`, `useRevolvingModal`, `repayRevolvingModal`, `ccConfirmModal`, `ccNoticeModal`); Details'te 12 modal.
- **JS/CSS**: `css/zt/creditcontracts/index.css`, `details.css`; ayrı JS yok (inline). CDN: DataTables, JSZip, pdfmake, Chart.js.
- **AJAX uçları**: kendi controller'ında 38 action (+ statik `PayWithCredit`); başka controller'a yalnız bağlantı (`/BankTransactions/Index`, `/AccountTransaction/Transactions/{id}`, `CustomerAccounts/Index`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `PaymentPlanHelper.SyncCreditPaymentPlan`, statik `BankTransactionsController.CreateBankTransaction` (yalnız bir yerde) + kendi private banka hareketi metotları, `IntroductionAuditHelper.GetActor`, `Methods.LogAdd`, `Methods.GetDirectories`, `NetworkConnection`.
- **Model/DTO**: `CreditContract`, `CreditContractViewModel`, `CreditInstallment`, `CreditDrawdown`, `FinIncomeExpense`, `CreditDashboardViewModel`; controller dosyasında istek/yanıt DTO'ları (`InstallmentPaymentDto`, `RevolvingDrawdownDto`, `AssignBankCariRequest`, `CreditPaymentResult` …).
- **SQL nesneleri (finans)**: `ZT_CreditContracts` (R/I/U), `ZT_CreditInstallments` (R/I/U/D), `ZT_CreditDrawdowns` (R/I/D), `ZT_BankIntroduction` (R/I/U), `ZT_BankTransactions` (R/I/U), `ZT_AccountDebts` (R/I/U/D), `ZT_AccountPayments` (R/I/U/D), `ZT_CustomerAccountPaymentPlans` (I/U/D), `ZT_FinIncomeExpense` (R/I).
- **Bağlı finans sayfaları**: CustomerAccounts/Index, BankTransactions/Index, AccountTransaction/Transactions, kendi Dashboard/Add/Details/CreditDocuments sayfaları; hata yolunda Finance/Index.
- **Finans dışı bağımlılıklar**: `ZT_ProductionPlanning`; admin DB `Customers.QrKey`; belge alt klasör adları.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /AccountCredits/Index

- **View + partial + modal**: `Index.cshtml` (`deleteModal`), `Detail.cshtml` (`editCreditModal`). Bu sayfa banka kredisi değil, müşteri cari alacak kayıtlarıdır.
- **JS/CSS**: yerel dosya yok (inline). CDN: jQuery, animate.css.
- **AJAX uçları**: kendi controller'ında 4 action; başka controller'a yalnız bağlantı (`/CustomerAccountCollection/Collections`).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.ConvertToList<T>`.
- **Model/DTO**: `Models/ZT/AccountCredits.cs`; controller içi `CustomerCreditSummary`, `UpdateCreditModel`.
- **SQL nesneleri (finans)**: `ZT_AccountCredits` (R/U); okuma: `ZT_AccountCollections`, `ZT_CustomerAccounts`.
- **Bağlı finans sayfaları**: Collections.
- **Finans dışı bağımlılıklar**: `Customer` (INNER JOIN), `ZT_Orders` (`OrdersID`), `ZT_ProductionPlanning`.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### /MaterialStockAll/Index

- **View + partial + modal**: 14 view (`Index`, `Add`, `Edit`, `AddSales`, `EditSales`, `All`, `MaterialInvoice`, `MaterialInvoiceAll` …(+6)); partial'lar `_CriticalStockModal`, `_UyumsoftTransferModal`, `_WhSearchSelect`, `_UyumsoftInvoiceListTools`, `_UyumsoftSalesListTools`. Index modalı: `purchasesModal`.
- **JS/CSS**: view içinde yerel dosya referansı yok (layout'tan gelir). CDN: jQuery, animate.css.
- **AJAX uçları**: kendi controller'ında 38 action. Başka controller: Weighbridge (`AddNewTransportCompanyOrTruck`, `HarvestManagerAdd`, `GetTransportCompanies`, `GetTransportCompanyByPlate`), ContainerType (`/containertype/add` bağlantısı), PesticideStockAll (bağlantı), AccountTransaction (`TransactionsByReference` bağlantısı).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `Methods.LogAdd`, `FileTokenHelper`, `TenantFileAccess`, `NetworkConnection`, `IDateTimeProvider`, `IWebHostEnvironment`.
- **Model/DTO**: `MaterialStockAll`, `MaterialInvoice`, `MaterialPurchases`, `MaterialLosses`, `MaterialSalesInvoice`, `IndustrialSupplier`, `Warehouse`, `ContainerType` …(+2); controller içi DTO'lar.
- **SQL nesneleri (finans)**: `ZT_AccountDebts` (R/I/U/D), `ZT_AccountCredits` (R/I/U/D), `ZT_CustomerAccounts` (R/I). Stok tabloları: `ZT_MaterialStockAll`, `ZT_MaterialInvoice`, `ZT_MaterialPurchases`, `ZT_MaterialSalesInvoice`, `ZT_MaterialSalesItems`, `ZT_MaterialLosses`, `ZT_MaterialLossDetail`.
- **Bağlı finans sayfaları**: `/AccountTransaction/TransactionsByReference`.
- **Finans dışı bağımlılıklar**: üretim tüketimi (`ZT_ProductionConveyor*`, `ZT_MaterialConsumption`), satınalma (`ZT_PurchaseOrder*`, `ZT_PoGoodsReceipt`), kantar/mal kabul nakliye (Weighbridge), kalite kontrol kolonları, e-Dönüşüm (`ZT_EInvoice`, Uyumsoft partial'ları), tanımlar (`ContainerType`, `ZT_Warehouse`, `ZT_IndustrialSupplier`). `MaterialStockProductionController` aynı tablonun salt okunur görünümüdür.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)

### /SalesTruckExpenses/Index

- **View + partial + modal**: `Index.cshtml` (`companyInfoModal`, `detailModal`), `CompanySalesDetails.cshtml` (`salesModal`, `shippingDetailModal`).
- **JS/CSS**: view içinde yerel ya da CDN referansı yok.
- **AJAX uçları**: kendi controller'ında 7 action. Başka controller: AccountTransaction (`GetTransactionDetails`, `Transactions`); `/SalesTruck/GetCompanySalesDetails` ve `/SalesTruck/GetCompanyInfo` çağrıları projede olmayan bir controller'a gidiyor.
- **Service/yardımcı**: yok — SQL controller içinde; bağımlılık enjeksiyonu kullanmıyor.
- **Model/DTO**: controller içinde `SalesTruckUpdateModel`, `DeleteSalesTruckExpenseModel`, `TransportUpdateModel`.
- **SQL nesneleri (finans)**: `ZT_AccountDebts` (R/I/U/D), `ZT_CustomerAccounts` (R). Kendi masraf tablosu yok.
- **Bağlı finans sayfaları**: AccountTransaction/Transactions.
- **Finans dışı bağımlılıklar**: `ZT_SalesTruck` (R/U — masraf kolonları), `ZT_SalesTruckBatchNumbers`, `Customer`, `TransportCompany`, `TransportChauffeur`, `ZT_LocationPricing`, `Factory`, `ZT_ProductionPlanning`.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)

### /ProductionExpenses/IndexExpenses

- **View + partial + modal**: `IndexExpenses.cshtml` (`deleteConfirmModal`), `Index.cshtml`, `Add.cshtml`, `Edit.cshtml`, `ExpenseGroupDetails.cshtml`.
- **JS/CSS**: view içinde yerel dosya yok. CDN: jQuery, animate.css; Index'te chart.js, flatpickr.
- **AJAX uçları**: kendi controller'ında 11 action. Başka controller: MaterialStockAll (`GetFile` — belge indirme).
- **Service/yardımcı**: yok — SQL controller içinde. Ek: `IDateTimeProvider`, `GlobalVeriables.adminDatabase`, `GlobalVeriables.restrictionQuery`.
- **Model/DTO**: `ProductionExpenses`, `ProductionExpensesDetail`, `ExpenseTypes`, `ExpenseItems`; controller içi görünüm modelleri.
- **SQL nesneleri (finans)**: `ZT_ProductionExpenses` (R/I/U), `ZT_ProductionExpensesDetail` (R/I/U/D), `ZT_AccountDebts` (R/I/U/D), `ZT_CustomerAccounts` (R), `ZT_ExpenseTypes` (R), `ZT_ExpenseItems` (R).
- **Bağlı finans sayfaları**: doğrudan bağlantı yok; cariye `ZT_AccountDebts` üzerinden yansır.
- **Finans dışı bağımlılıklar**: sipariş (`ZT_Orders`, `Customer`), üretim hattı (`Line`), malzeme firesi (`ZT_MaterialLosses`, `ZT_MaterialPurchases`, `ContainerType`), `ZT_ProductionPlanning`.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)


---

## 3. Ana envanter tablosu — dokümanların referans verdiği ek parçalar (kopyalama kapsamında)

Bölüm 2 ile aynı kurallar geçerlidir: veri erişimi (aksi yazılmadıkça) controller içinde ham Npgsql'dir.

### 3.0 Özet tablo

| Parça | Controller satır sayısı | View / modal | Başka controller bağımlılıkları | Finans dışı bağımlılık düzeyi | Ayrıntı |
|---|---|---|---|---|---|
| CustomerCurrentAccountsController | 490 | 1 view; 2 modal | AccountTransaction (`TransactionsPartial`) | **Yüksek** — özünde satış modülünün cari görünümü (yalnız "Müşteri" grubu, siparişler). | [ayrıntı](envanter/A_cari.md) |
| BankAccountsController | 718 | 3 view; 1 modal | Yok | **Orta** — `GetReferenceName` hesap türüne göre üretici/müşteri/nakliye tablolarından ad okuyor. | [ayrıntı](envanter/B_banka_kasa.md) |
| CustomerAccounts: ödeme planlama, ısı haritası, onaya gönderme, yoğunluk | (CustomerAccounts içinde) | `Index.cshtml` ve `_AllTransactionsPaymentTools.cshtml` modalları | AllTransactions ve başka sayfalar bu uçları çağırıyor | **Düşük** — akış saf finans; "Maaş" kaynak tipi personel modülüne bağlı. | [ayrıntı](envanter/A_cari.md) |
| Checks: UpdateCheckStatus, GetCheckMovements, çek yaprağı | (Checks içinde) | `updateStatusModal`, `checkMovementsModal`, `checkLeafModal` | BankTransactions (statik), PaymentPlanHelper | **Düşük** | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| CheckBooksController | 550 | 1 view; 1 modal | Yok | **Düşük** | [ayrıntı](envanter/C_odeme_cek_kredi.md) |
| PaymentManagementController | 2059 | 4 view; 7 modal | BankTransactions, CashTransactions (statik) | **Düşük** — finans dışı tablo yok. | [ayrıntı](envanter/A_cari.md) |
| ExpenseTypes / ExpenseItems | 501 / 656 | 3'er view; modal yok | Yok | **Düşük** — tanım ekranları; kalem eklenince cari açılıyor. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |
| TCMB kur altyapısı | servis 339; CurrencyController 538; CurrencyApiController 251 | `Views/Currency/{Index,Add,Edit}` | CustomerAccounts, FinancialBalanceSheet (servis enjekte eder) | **Orta** — kur çekme mantığının çoğu kopyası finans dışı controller'larda. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |
| BranchProvince / WorkPlace / WorkPlaceGroups deseni | 397 / 535 | 3'er view; modal yok | Yok | **Düşük** — organizasyon tanımı; iş yeri eklenince cari açılıyor. | [ayrıntı](envanter/D_stok_masraf_kur_sube.md) |
| CustomerAccountReportController | 527 | 1 view; modal yok | Yok | **Düşük** — yalnız hesap grubu sabit listesi ve layout. | [ayrıntı](envanter/A_cari.md) |
| FinanceReportController + Services/FinanceReport | 61 (+ servis katmanı) | 1 view + 3 paylaşılan partial; modal yok | Report (`GetNetworkImage`), AccountTransaction (`Statement` bağlantısı) | **Orta** — rapor türleri ve belge tarihi alt sorguları sektöre özgü tablolara bağlı. | [ayrıntı](envanter/B_banka_kasa.md) |
| FinanceController | 211 | 1 view; modal yok | Yok | **Düşük** — eski/ikincil ana sayfa. | [ayrıntı](envanter/B_banka_kasa.md) |
| FinanceMaintenanceController | 645 | 1 view; 1 modal | AccountTransaction (`GetDebtRedirectInfo`) | **Yüksek** — `RefMappings` tümüyle üretim/satış tabloları; `ZT_SalesTruck` güncelliyor. | [ayrıntı](envanter/B_banka_kasa.md) |
| FinancePersonController | 555 | 3 view; modal yok | Expert (`GetAllWorkPlaces`, `GetBranchProvincesByWorkPlace`) | **Düşük** — yalnız ExpertController uçlarına bağımlı. | [ayrıntı](envanter/B_banka_kasa.md) |
| PurchaseCurrentAccountController | 2562 | 1 view; 7 modal | Payment (`/Payment/SavePayment`) | **Yüksek** — cari altyapısına hiç dokunmuyor; eksper raporu ve hasat aracı bazlı eski ekran. | [ayrıntı](envanter/A_cari.md) |

### CustomerCurrentAccountsController

- **View + modal**: `Views/CustomerCurrentAccounts/Index.cshtml`; modallar `transactionsModal`, `salesPartiesModal`.
- **JS/CSS**: yerel dosya yok (inline). CDN: jQuery, DataTables dil dosyası.
- **AJAX uçları**: kendi controller'ında 2 action (`Index`, `GetCustomerOrders`). Başka controller: `AccountTransaction/TransactionsPartial` (modal içine cari hareket partial'ı).
- **Service/yardımcı**: `GlobalVeriables.adminDatabase`, `GlobalVeriables.restrictionQuery`, `IntroductionAuditHelper.ExecuteSuppressed`.
- **Model/DTO**: `CustomerAccountViewModel`.
- **SQL nesneleri (finans)**: `ZT_CustomerAccounts` (R, U `PlanningStatus`/`PaymentPlanDate`), okuma: `ZT_AccountDebts/Credits/Payments/Collections`, `ZT_BankIntroduction`.
- **Finans dışı bağımlılıklar**: `Customer`, `Product`, `ZT_Orders`, `ZT_OrderHeader`, `ZT_SalesPerson`, "Sipariş İşlemleri" kısıtı, satış menü linkleri.
- [ayrıntı](envanter/A_cari.md)

### BankAccountsController

- **Ne olduğu**: cari/tedarikçi/müşteri karşı taraf IBAN kartları (şirketin kendi banka hesabı değil).
- **View + modal**: `Views/BankAccounts/Index.cshtml` (`confirmationModal`), `Add.cshtml`, `Edit.cshtml`.
- **AJAX uçları**: kendi controller'ında 6 action; başka controller yok.
- **Service/yardımcı**: `Methods.ConvertToList<BankAccounts>`, `Methods.LogAdd`, `GlobalVeriables.adminDatabase`.
- **Model/DTO**: `Models/ZT/BankAccounts.cs`.
- **SQL nesneleri (finans)**: `ZT_BankAccounts` (R/W), `Currency` (R), `ZT_Currency` (R — ⚠ varlığı doğrulanamadı).
- **Finans dışı bağımlılıklar**: `GetReferenceName` içinde dinamik `ZT_Supplier`, `ZT_Customer`, `ZT_Transport`, `ZT_CuttingChief`, `ZT_TransportCompany` (⚠ bu adlarla tabloların varlığı doğrulanmadı).
- [ayrıntı](envanter/B_banka_kasa.md)

### CustomerAccounts içindeki ödeme planlama, ısı haritası, onay ve yoğunluk akışları

- **Uçlar**: `SavePaymentPlanning`, `DeletePaymentPlanning`, `BulkDeletePlans`, `GetAllPlansForCustomer`, `GetPaymentPlanningDetails`, `PaymentPlannings` (yalnız `Index`'e yönlendirir); ısı haritası `GetPaymentHeatmapData`, `GetExchangeRatesForHeatmap`; onay `SendToApproval`, `BulkSendToApproval`, `ApprovePaymentPlanning` (⚠ view/JS çağıranı BULUNAMADI); pano `GetUpcomingPaymentPlansForDashboard`, `PostponePaymentPlan`, `DeleteDashboardPlan`, `MarkDashboardPlanPaid`; yoğunluk `GetPaymentDensities`, `SavePaymentDensity`; eski sistem okuması `GetPaymentPlans`.
- **View + modal**: `Views/CustomerAccounts/Index.cshtml` (`paymentPlanningModal`, `planDetailModal`, `planActionConfirmModal`, `financeDashboardModal`, `densitySettingsModal`, `approvalSelectionModal`, `deletionSelectionModal`, `paymentHeatmapModal`) ve `Views/Shared/_AllTransactionsPaymentTools.cshtml`.
- **Service/yardımcı**: `PaymentPlanHelper` (çek/kredi kaynaklı planlar), `ITCMBExchangeRateService`, `IntroductionAuditHelper.ExecuteSuppressed`.
- **Model/DTO**: `CustomerAccountPaymentPlan`, `PaymentPlanningListDto`, `PaymentPlanItemDto`, `PaymentPlanningDto`, `BulkPlanRequest`, `PaymentDensityCurrencies`.
- **SQL nesneleri (finans)**: `ZT_CustomerAccountPaymentPlans` (R/I/U/D), `ZT_CustomerAccounts` üzerindeki düz plan kolonları (geriye uyum için birlikte güncellenir), `ZT_PaymentDensityCurrencies`, `ZT_Checks` (ısı haritası).
- **Not**: iki paralel planlama modeli var; plan kaynak tipleri `Manuel`, `Çek`, `Kredi`, `Maaş`, `Talimatlı Plan`.
- [ayrıntı](envanter/A_cari.md)

### Checks içindeki UpdateCheckStatus, GetCheckMovements ve çek yaprağı

- **UpdateCheckStatus** (POST): sabit geçiş matrisi yok; her hedef durumu kabul eder ve kural kümesini tek transaction içinde uygular. Kasa hareketi (`ZT_CashTransactions` I/U/D), banka hareketi (statik `CreateBankTransaction`, U/D), cari ödeme (`ZT_AccountPayments` I/U/D), koçan yaprağı (`ZT_CheckBooks` U) ve ödeme planı (`PaymentPlanHelper.SyncCheckPaymentPlan`) yansımaları burada. `ZT_CheckMovements` tablosuna kayıt yazmaz.
- **GetCheckMovements** (GET): `ZT_CheckMovements` tablosundan `Status=true` satırları okur; hareket satırlarını yalnız ödeme ve tahsilat akışları yazar.
- **Çek yaprağı**: ayrı bir `CheckLeaf` action'ı yok. Üç boyutlu çek yaprağı tamamen istemci tarafında (`checkLeafModal`, saf CSS 3D + inline JS, üç boyut kütüphanesi yok); sunucuda yalnız `CheckLeafLookup` (koçan yaprağı doğrulama) ve `_CheckLeafGuard` partial'ı var.
- **Not**: `LastBankID` kolonu çalışma zamanında `information_schema.columns` ile yoklanır; betiği `Docs/2026_Faz61H_Checks_LastBankID.sql`.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### CheckBooksController

- **View + modal**: `Views/CheckBooks/Index.cshtml` (`addCheckBookModal`).
- **AJAX uçları**: 5 action (`Index`, `AddCheckBook`, `DeleteCheck`, `UpdateCheckStatus`, `GetAvailableChecksByBank`). `GetAvailableChecksByBank` çağıranı ⚠ BULUNAMADI.
- **SQL nesneleri (finans)**: `ZT_CheckBooks` (R/I/U/D), okuma: `ZT_BankIntroduction`, `ZT_WorkPlace`.
- **Not**: sınıfta `[Authorize]` ve rol özniteliği yok.
- [ayrıntı](envanter/C_odeme_cek_kredi.md)

### PaymentManagementController (eski, borç bazlı onay akışı) + PaymentApprovalApiController + PaymentPlanHelper

- **View + modal**: `PaymentPlanning.cshtml` (`planModal`), `PaymentApprovalRequest.cshtml` (`approvalModal`), `PaymentApprovals.cshtml` (`detailModal`, `approveModal`, `rejectModal`), `ProcessPaymentOrders.cshtml` (`processPaymentModal`, `paymentOrderDetailsModal`); partial `_PaymentManagementMenu.cshtml`.
- **JS/CSS**: `js/zt/paymentmanagement/{payment-planning.js, payment-approval-request.js, payment-approvals.js, process-payment-orders.js}`, `css/zt/paymentmanagement/payment-management.css`.
- **AJAX uçları**: 19 action, tamamı kendi controller'ına. Dışarıdan yoğun kullanılan tek uç `GetCustomerDebtSummary` (Bills, Checks, banka/kasa hareketleri ve ödeme JS dosyaları çağırır).
- **Service/yardımcı**: `Methods.LogAdd`; statik `BankTransactionsController.CreateBankTransaction`, `CashTransactionsController.CreateCashTransaction`.
- **Model/DTO**: controller içi `PaymentPlanRequest`, `ApprovalRequest`, `PaymentExecutionRequest`; `Models/ZT/PaymentPlan.cs`.
- **SQL nesneleri (finans)**: `ZT_PaymentPlans` (R/I/U), `ZT_PaymentApprovals` (R/I/U), `ZT_PaymentApprovalDetails` (R/I/U), `ZT_AccountPayments` (I/R), `ZT_AccountDebts` (R/U); sequence `ZT_PaymentApprovalCode_seq`.
- **PaymentApprovalApiController**: tek uç `POST Api/PaymentApprovalApi/CheckCompletedInstructions`; ⚠ çağıranı BULUNAMADI.
- **PaymentPlanHelper** (`Services/PaymentPlanHelper.cs`): statik sınıf; `SyncCheckPaymentPlan`, `CancelCheckPaymentPlan`, `SyncCreditPaymentPlan`, `CancelCreditPaymentPlan`, `CancelAllCreditPaymentPlans`, `CancelSalaryPaymentPlan`. Çağıranlar: AccountTransaction, Checks, CreditContracts, CustomerAccountCollection, CustomerAccountPayment.
- **Finans dışı bağımlılıklar**: yok (yalnız `CancelSalaryPaymentPlan` personel modülüne özgü).
- [ayrıntı](envanter/A_cari.md)

### ExpenseTypes / ExpenseItems

- **View + modal**: `Views/ExpenseTypes/{Index,Add,Edit}.cshtml`, `Views/ExpenseItems/{Index,Add,Edit}.cshtml`; modal yok.
- **AJAX uçları**: ExpenseTypes: `SearchExpenseTypes`, `CheckExpenseTypeExists`, `CheckExpenseTypeExistsForEdit`; ExpenseItems: `SearchExpenseItems`, `CheckExpenseItemExists`, `CheckExpenseItemExistsForEdit`. Başka controller yok.
- **Model/DTO**: `Models/ZT/ExpenseTypes.cs`, `Models/ZT/ExpenseItems.cs`.
- **SQL nesneleri (finans)**: `ZT_ExpenseTypes` (R/W), `ZT_ExpenseItems` (R/W), `ZT_CustomerAccounts` (ExpenseItems: INSERT + UPDATE — her masraf kalemi `Masraf Hesabı` grubunda bir caridir, kod `MSR-{ID}`).
- **Not**: iki tabloyu masraf kaydında yalnız ProductionExpenses kullanır; diğer masraf controller'ları kendi tablolarına yazar. Yalnız `Admin` rolü.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)

### TCMB kur altyapısı

- **Servis**: `Services/ITCMBExchangeRateService.cs` (arayüz + `TCMBExchangeRateService` + DTO'lar tek dosyada); `IHttpClientFactory`, `IMemoryCache`; hata durumunda sabit yedek kurlar döner ve önbelleğe alınmaz.
- **Uçlar**: `CustomerAccountsController.GetExchangeRates` (tek-uçuş + negatif önbellek deseni yalnız burada), `GetExchangeRatesForHeatmap`; `CurrencyController.GetExchangeRate` (üçüncü taraf bir HTTP servisine gider); `CurrencyApiController` (5 uç, `Methods.Authorize` ile).
- **Kopya sayısı**: kur çekme mantığının projede 8 ayrı uygulaması var; bunların çoğu finans dışı controller'larda (RecipePurchasing, RecipeSales, SalesProduct, SalesProductLogistic).
- **Model/DTO**: `Models/Currency.cs` (`Currency`, `ExchangeRateKur`), `Models/ZT/PaymentDensityCurrencies.cs`.
- **SQL nesneleri (finans)**: `Currency` (`ExchangeRate` kolonu sayısal kur değil, kur adı metnidir), `ZT_PaymentDensityCurrencies`, `ZT_ExchangeBreakSource`.
- **Not**: ödeme, tahsilat, çek, senet ve kredi sayfaları kur servisi çağırmaz; kur istemciden metin olarak gelir. Stok ve masraf sayfaları cari borca kuru sabit 1.0000 yazar.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)

### BranchProvince / WorkPlace / WorkPlaceGroups

- **View + modal**: `Views/BranchProvince/{Index,Add,Edit}.cshtml`, `Views/WorkPlace/{Index,Add,Edit}.cshtml`; modal ve AJAX yok.
- **Model/DTO**: `Models/ZT/BranchProvince.cs`, `Models/ZT/WorkPlace.cs`.
- **SQL nesneleri**: `ZT_BranchProvince` (R/W), `ZT_WorkPlace` (R/W), `ZT_CustomerAccounts` (WorkPlace: INSERT + UPDATE — her iş yeri `İş Yeri Firması` grubunda bir caridir, kod `ISY-{ID}`).
- **Hiyerarşi**: şube 1—N iş yeri; depo iş yerine bağlı.
- **WorkPlaceGroups deseni**: şube gruplu iş yeri seçimi; ayrı bir controller değil, finans sayfalarının ortak desenidir. Kurulum CustomerAccountPayment, CustomerAccountCollection, Checks, BankTransactions, CashTransactions controller'larında (`ViewBag.WorkPlaceGroups`), BankIntroduction'da farklı tipte (`BuildFilterGroups`). JS view içinde inline; ayrı `wwwroot` dosyası yok. Sorgu tüm aktif iş yerlerini getirir, kullanıcı kapsamına göre daraltmaz.
- **Kullanıcı kapsamı**: merkezi bir kullanıcı—iş yeri yetki tablosu ya da servisi ⚠ BULUNAMADI; her controller rol personel tablosundan kendisi çözer.
- [ayrıntı](envanter/D_stok_masraf_kur_sube.md)

### CustomerAccountReportController

- **View + modal**: `Views/CustomerAccountReport/Reports.cshtml`; modal yok.
- **AJAX uçları**: kendi 5 JSON ucu (`GetAgingReport`, `GetCheckMaturityReport`, `GetBillMaturityReport`, `GetPaymentPerformanceReport`, `GetCurrencyPositionReport`). `EditCheck` / `EditBill` bağlantıları bu controller'da olmayan action'lara gider.
- **SQL nesneleri (finans)**: yalnız okuma: `ZT_CustomerAccounts`, `ZT_AccountDebts/Credits/Payments/Collections`, `ZT_Checks`, `ZT_Bills`, `Currency`.
- **Not**: sınıfta `[Authorize]` ve rol özniteliği yok; ⚠ menüden ya da başka view'dan bağlantı BULUNAMADI (muhtemelen atıl sayfa).
- [ayrıntı](envanter/A_cari.md)

### FinanceReportController + Services/FinanceReport + Services/ReportKit

- **View + partial**: `Views/FinanceReport/Index.cshtml` (`_ReportLayout`); partial'lar `_ReportFilterBar`, `_ReportHeader`, `_StatFilterCards`.
- **JS/CSS**: `js/finance-report.js`, `js/report-page.js`, `js/stat-filter.js`, `lib/xlsx/xlsx.full.min.js`, `css/report-page.css`, `css/stat-filter.css`.
- **AJAX uçları**: AJAX yok (tam sayfa GET, tek action `Index`). Dış referans: `Report/GetNetworkImage` (logo), `/AccountTransaction/Statement` (bağlantı).
- **Service/Warehouse**: grubun tek katmanlı yapısı — `FrService`, `FrWarehouse`, `FrSql`, `FrLedger`, `FrTypes`, `FrAccess`, `SalesFinance`; `Services/ReportKit/ReportLookups.cs`; `Helpers/ReportScope.cs`, `Helpers/ReportErrorLog.cs`.
- **Model/DTO**: `Models/Report/FinanceReport.cs` (`FrFilter`, `FrModel`, `FrContext` …), `ReportDateRange.cs`, `ReportLookupItem.cs`, `SalesFinance.cs`.
- **SQL nesneleri (finans)**: yalnız okuma: `ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`.
- **Finans dışı bağımlılıklar**: rapor türleri sektöre özgü cari gruplarına bağlı; `FrSql.Movements` alt sorguları (hasat aracı, kesim çavuşu, üretim masrafı, satış aracı, sipariş); `FrSql.Unbooked` tamamen bahçe/kantar akışı.
- **Not**: iş yeri kapsamını sunucu tarafında gerçekten zorlayan tek finans sayfası budur.
- [ayrıntı](envanter/B_banka_kasa.md)

### FinanceController / FinanceMaintenanceController / FinancePersonController

- **FinanceController** (`/Finance/Index`): eski finans ana sayfası; kasa ve banka tanım listelerini `FinanceViewClass` modelinde gösterir. Yalnız `Finans(normal)`, `Finans(super)` rolleri. Finans rolünün açılış sayfası bu değildir (açılış `/AccountTransaction/AllTransactions`).
- **FinanceMaintenanceController** (`/FinanceMaintenance/OrphanDebts`): menüde olmayan bakım ekranı; referanssız ya da kopuk referanslı `ZT_AccountDebts` kayıtlarını listeler ve kalıcı olarak siler. Modal `odcConfirmModal`. Çalışma zamanında `ZT_AccountDebtsDeleteLog` tablosunu oluşturur. `AccountTransaction/GetDebtRedirectInfo` ucunu çağırır. `RefMappings` ve `ZT_SalesTruck` güncellemesi finans dışıdır.
- **FinancePersonController** (`/FinancePerson/Index`): finans personeli tanımı (yalnız `Admin`). `ZT_FinancePerson` satırı kullanıcının iş yeri/şube kapsamını ve süper durumunu belirler; tabloda en az bir satır olması Patron'un finans sayfalarını görmesinin ön koşuludur. `Key` ve `SuperStatus` kolonlarını yazan kod ⚠ BULUNAMADI. `Expert/GetAllWorkPlaces` ve `Expert/GetBranchProvincesByWorkPlace` uçlarına bağımlı.
- [ayrıntı](envanter/B_banka_kasa.md)

### PurchaseCurrentAccountController

- **Değerlendirme**: `ZT_CustomerAccounts` / `ZT_Account*` cari altyapısına hiç dokunmuyor. Eksper raporu ve hasat aracı bazlı eski "alış cari" ekranı; lojistik kopyasına alınmaması ya da tamamen yeniden yazılması gerekir.
- **View + modal**: `Views/PurchaseCurrentAccount/Index.cshtml`; 7 modal (`odemelerModal`, `odemeModal`, `kesimCavusuOdemeModal`, `nakliyeOdemeModal`, `malzemeOdemeModal`, `firmaModal`, `silmeOnayModal`).
- **AJAX uçları**: 14 action; başka controller: `/Payment/SavePayment`.
- **Finans bağı**: `ZT_BankIntroduction` ve `ZT_CashIntroduction` üzerinde `Balance` güncellemesi; `ZT_` öneksiz eski `BankTransactions` / `CashTransactions` tablolarına INSERT; `ZT_InstallmentPayments`.
- **Finans dışı bağımlılıklar**: `ZT_ExpertReport*`, `Supplier`, `TransportCompany`, `TransportTruck`, `ZT_HarvestManager`, `ZT_UsedHarvestManager`, `ZT_MaterialInvoice`, `ZT_PesticideInvoice`, `ZT_Setting`, admin DB `Customers`.
- [ayrıntı](envanter/A_cari.md)

## 4. Yalnızca analiz edilen parçalar (kopyalanmaz)

| Parça | Ne olduğu | Tablolar | Finansla temas noktası | Lojistik/entegrasyon için önemi | Ayrıntı |
|---|---|---|---|---|---|
| AccountingPurchases — hasat aracı listesi ve araç finansı | Bahçeden/tedarikçiden fabrikaya gelen hasat aracının (satış sevk aracı değil) finans özeti, palet ve hammadde bedeli ekranları. `ExpertReportTruckExpenses` adlı action bu controller'da yok (⚠ BULUNAMADI); masraf ekranı ayrı controller'da. | `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `ZT_DistributedPallet`, `ZT_Purchases`, `Supplier`, `ZT_Expert`, `ZT_UsedHarvestManager` | `ZT_AccountDebts.ReferenceID = ZT_ExpertReportTruckFinance.ID`, `AccountingType='Tedarikçi'`; cariye para birimi ve kur sabit yazılır. | "Araç bazlı finans"ın alım tarafı; sefer maliyeti modeli için referans. Müstahsil makbuzu kesintileri tarıma özgü. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| ExpertReportTruckExpenses | Hasat aracı bazlı nakliye/servis masrafı; avans, kalan, kesinti, ödenen, bakiye alanlı hakediş şablonu. | `ZT_ExpertReportTruckExpenses`, `ZT_LocationPricing`, `TransportTruck`, `TransportCompany`, `ZT_HarvestManager` | `ZT_AccountDebts.ReferenceID = ZT_ExpertReportTruckExpenses.ID`, `AccountingType='Nakliye Firması'`; kesim çavuşu için ayrı borç. | Nakliye firması plaka metin eşleşmesiyle bulunur; bulunamazsa borç sessizce atlanır. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| CMR3 / CMR13 | CMR belgesi üreten bir modül yok; yalnız müşteriye bağlı adres kütüğü (formun 3 ve 13 numaralı kutuları). | `ZT_CustomerCMR3`, `ZT_CustomerCMR13`; metin kopyası `ZT_OrderHeader.HighwayCmr3/13` | Yok | CMR formunu basan çıktı ⚠ BULUNAMADI; en yakın örnek reçeteli modüldeki sevk/yükleme formu (tarayıcı yazdırma). | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| SupplierTruck / SupplierChauffeur / SupplierTrader | Tedarikçinin kendi aracı, şoförü ve tüccarı; klasik mal kabulde kullanılır. Yalnız `Admin` yönetir. | `SupplierTruck`, `SupplierChauffeur`, `SupplierTrader` | Yok | Plaka normalizasyonu yok. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| TransportCompany / TransportTruck / TransportChauffeur | Nakliye firması ve onun araç/şoför havuzu; hem bahçe nakliyesinde hem satış sevkiyatında kullanılır. | `TransportCompany`, `TransportTruck`, `TransportChauffeur` | Firma eklenirken otomatik cari açılır: `ZT_CustomerAccounts.ReferenceID = TransportCompany.ID`, hesap grubu `Nakliye Firması` (kod `BHN`) ya da `Sevk Nakliye Firması` (kod `SVN`). | Lojistikte çekirdek ana veri adayı. Plaka normalize edilmiyor; şoför—araç eşlemesi yok; firmanın kalıcı dış kimliği yok. `CustomerID` kolonunun anlamı ⚠ DOĞRULANMADI. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| ZT_Chauffeur / ZT_UsedPlate | Bahçe/hasat şoförü ve kullandığı plakalar; firma bağı yok. | `ZT_Chauffeur`, `ZT_UsedPlate` | Yok (cari hareket sorgularında okunur) | Üçüncü araç/şoför ailesi. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Satış sevkiyatı — sevk aracı | Yaş meyve/sebze modunun sevk aracı kaydı; plaka ve dorse serbest metin, durumlar elle girilir. | `ZT_SalesTruck`, `ZT_SalesTruckBatchNumbers`, `ZT_PalletsLoadedTruck`, `ZT_SalesTruckPalletLoad`, `ZT_SalesTruckForklift`, `ZT_CustomerLocation` | Navlun: `ZT_AccountDebts.ReferenceID = ZT_SalesTruck.ID`, `AccountingType='Sevk Nakliye Firması'`, ayrım kolonu `TransportType` (kara / gemi); silme izi `ZT_SalesTruckDebtLog`. | "Yük talebi / sefer emri" karşılığı; SalesTruckExpenses sayfası bu tablonun kolonlarını düzenler. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Satış sevkiyatı — reçeteli sevk | Reçeteli (gıda üretim) modunun ayrı sevk tablosu; konum ve navlun alanları daha düzenli. | `ZT_RecipeShipment`, `ZT_RecipeShipmentLine`, `ZT_RecipeShipmentExport`, `ZT_RecipeShipmentExportContainer` | Navlun borcu `Sevk Nakliye Firması` carisine; borçtaki `ReferenceID` değeri ⚠ doğrulanmadı. | Araç tipi, dorse, soğutma, varış koordinatı ve rota mesafesi kolonları var. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| WorkOrderTruck | Klasik iş emri modülünün sevk tablosu; araç ve şoförün yabancı anahtarla seçildiği tek sevk tablosu. | `WorkOrderTruck` | Görülmedi | Yabancı anahtarlı seçim deseni için örnek. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Araç takip | Kendi başına bir GPS filo takip sistemi yok. Sevkiyata konan tek kullanımlık veri kaydedicinin verisi üçüncü taraf buluttan ekran açıldığında anlık çekilir, saklanmaz. | Konum saklayan tablo yok; eşleme `ZT_SalesTruck.SpyTruckNo`; sağlayıcı tanımı `ZT_CasusCihaz` | Cihaz stok kartı kullanımında `ZT_MaterialStockAll` bir azaltılır. | Plaka—cihaz kalıcı eşlemesi yok; teslim durumu elle. Harita: konum seçimi Google Maps, rota Leaflet + OpenStreetMap. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Mevki fiyat tarifesi | Bahçe bölgesi bazlı nakliye fiyat tarifesi. | `ZT_LocationPricing` | Hasat aracı masrafına referans verir. | Satış sevkiyatı için güzergâh bazlı navlun tarifesi ⚠ BULUNAMADI. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Entegrasyon — ZtoHal | Fabrika istemci, Hal sunucu; sevk aracını iter, durumu kullanıcı tetiklemeli sorgular. | Admin `Customers.WebUrl`, `FactoryApiKey`; kiracı `Customer.ZtoHalCustomerID`, `ZT_SalesTruck.SalesTruckHalKey` | Resmî fiyat satırları yükle birlikte gider. | En yakın örnek: başlıkta paylaşılan anahtar, HTTPS zorunlu, dış referansla tekrar güvenliği, iki depo arasında altın JSON sözleşme testi. Otomatik yeniden deneme yok. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Entegrasyon — Uyumsoft | e-Fatura, e-Arşiv, e-İrsaliye ve gelen kutusu; 30 dakikalık arka plan çekimi. | `ZT_UyumsoftSetting`, `ZT_EInvoice`, `ZT_EDespatch`, `ZT_EInboxInvoice`, `ZT_UyumsoftLog` | `ZT_EInvoice` ve `ZT_EDespatch` kaynak belgeye `ReferenceTable` + `ReferenceID` ile bağlanır; gelen faturanın cariye eşleştirme kolonları ⚠ BULUNAMADI (incelenmedi). | e-İrsaliye `ZT_SalesTruck` kaydına bağlı üretilebiliyor; finans menüsünde yer alır. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Entegrasyon — HKS | Hal Kayıt Sistemi bildirimi; kuyruk tablosu + arka plan işçisi + yeniden deneme. | `ZT_HksBildirim`, `ZT_HksReferenceData` | Yok | Kuyruk + işçi + yeniden deneme + durum tablosu deseni; lojistiğe yük talebi/durum itmek için model. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Entegrasyon — Frigga | Sevkiyat veri kaydedicisinin bulut servisi; yalnız çekme yönlü, oturumlu iç uç üzerinden. | Telemetri yazılmaz; yalnız `Log` tanı satırı | Yok | Erişim anahtarları kaynak kodda sabit; örnek alınmamalı. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| Çok kiracılık ve admin | Kiracı başına ayrı PostgreSQL veritabanı; katalog admin veritabanındaki `Customers`. Kiracı bağlantı dizesi girişte üretilip Session `userDatabase` anahtarına yazılır; tablolarda kiracı kimliği kolonu yok. | Admin: `Customers`, `Users`, `UserRoles`, `CustomerRoles` …; kiracı: `Factory`, `ZT_Setting`, `Restriction`, `UserRestriction` | Tüm finans controller'ları bağlantıyı Session'dan alır; denetim tetikleyicisi bağlantı dizesindeki aktör değerini okur. | Yeni kiracı açılışı (veritabanı oluşturma/şablon) ⚠ BULUNAMADI; tam şema dökümü ⚠ BULUNAMADI. Sunucu bilgileri ve şifreler kaynak kodda sabit. | [ayrıntı](envanter/E_ortak_altyapi.md) |
| Rol yönlendirme | Rol tek bir metin claim'idir; girişten sonra role göre açılış sayfasına yönlendirilir. Finans rolü `/AccountTransaction/AllTransactions`, Lojistik rolü `/SalesProductLogistic/Index` sayfasına gider. | Admin `UserRoles`; kiracı rol personel tabloları (`ZT_FinancePerson`, `ZT_Boss`, `ZT_LogisticsPerson` …) | `Finans` rolü girişte `ZT_FinancePerson.SuperStatus` değerine göre `Finans(super)` / `Finans(normal)` olur. | Lojistik projesinde rol listesi ve yönlendirme tablosu yeniden tanımlanmalı; "Lojistik" ve "Sevkiyat" iki ayrı roldür. | [ayrıntı](envanter/E_ortak_altyapi.md) |
| OrderHeader / Orders | Sipariş başlığı ve sipariş kalemi/partisi. | `ZT_OrderHeader`, `ZT_Orders` | Tahsilatın siparişe tahsisi (`ZT_AccountCollectionOrders`), alacakta `OrdersID`, masrafta `OrdersID`. | Sevk aracı siparişe `OrderID` ve parti adı eşleşmesiyle bağlanır; lojistikte "sefer/iş emri" karşılığı gerekir. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| SalesProductLogistic | Lojistik rolünün ana ekranı: sevk araçları, navlun, fatura/irsaliye, teslim tamamlama, takip modalları, ZtoHal paylaşımı. | `ZT_SalesTruck` ve bağlı tablolar | Navlun borcunu günceller/siler (`UpdateAccountDebts`), `ZT_SalesTruckDebtLog` yazar; cari hareket sayfasındaki satış düzenleme modali bu controller'ın uçlarını çağırır. Resmî satış alacağı ayrıntısı ⚠ incelenmedi. | Lojistik operasyon ekranının işlev kapsamı için referans. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |
| AcceptanceOfGood | Adına rağmen mal kabul işlemi değil; "Mal Kabul" rolündeki personel kütüğü. | `ZT_AcceptanceOfGoods` | Kullanıcı iş yeri kapsamı için okunur. | Reçeteli mal kabulde nakliyeci doğrudan cari kimliğiyle tutulur (`ZT_MaterialInvoice.TransportCustomerAccountID`) — üçüncü bir bağlama biçimi. | [ayrıntı](envanter/F_arac_cmr_takip_entegrasyon.md) |


---

## 5. Tablo kataloğu

A, B, C ve D parçalarının "Grup özeti" tablolarının birleştirilmiş, tekilleştirilmiş hâlidir.

Okuma kılavuzu:

- İşlem harfleri: R = SELECT, I = INSERT, U = UPDATE, D = kalıcı DELETE, W = yazma (parça ayrıntı vermemişse).
- Controller kısaltmaları — A parçası: **AT** AccountTransaction, **CA** CustomerAccounts, **CCA** CustomerCurrentAccounts, **PA** PaymentApproval, **PAApi** PaymentApprovalApi, **PM** PaymentManagement, **CAR** CustomerAccountReport, **PCA** PurchaseCurrentAccount, **PPH** PaymentPlanHelper, **ATQ** AccountTransactionQueries, **OSCR** OfficialSalesCreditRemover. B parçası: **BI** BankIntroduction, **BT** BankTransactions, **BA** BankAccounts, **BS** BankStatement, **CI** CashIntroduction, **CT** CashTransactions, **FBS** FinancialBalanceSheet, **TD** TimeDeposits, **FR** FinanceReport, **F** Finance, **FM** FinanceMaintenance, **FP** FinancePerson. C parçası: **Pay** CustomerAccountPayment, **Col** CustomerAccountCollection, **Chk** Checks, **CB** CheckBooks, **Bil** Bills, **Crd** CreditContracts, **AC** AccountCredits. D parçası: **MSA** MaterialStockAll, **MSP** MaterialStockProduction, **STE** SalesTruckExpenses, **PE** ProductionExpenses, **ET** ExpenseTypes, **EI** ExpenseItems, **OE** OrderExpenses, **HME** HarvestManagerExpenses, **PSE** ProductionSergeantsExpenses, **ERTE** ExpertReportTruckExpenses, **Cur** Currency, **WP** WorkPlace, **BP** BranchProvince, **TT** TransactionType.
- "DDL repoda var mı": yalnızca parçalarda belirtilen betikler yazıldı. "yok — canlı şema gerekir" = temel `CREATE TABLE` betiği repoda bulunamadı; şema canlı bir kiracı veritabanından `pg_dump --schema-only` ile alınmalı.
- Parçalar arasında sınıflandırma farkı olan tablolar Not sütununda belirtildi.

### 5.1 Finans çekirdek

| Tablo | Okuyan | Yazan | DDL repoda var mı | Not |
|---|---|---|---|---|
| `TransactionType` | D'ye göre banka/kasa/tahsilat/ödeme controller'ları | TT | yok — canlı şema gerekir | ⚠ D parçası SQL'de geçen `"TransactionType"` ifadesinin tablo mu kolon mu olduğunu ayıramadı; B ve C parçalarında bu ad `ZT_BankTransactions` / `ZT_CashTransactions` kolonu olarak geçiyor. |
| `ZT_AccountCollectionOrders` | BS, Col | BS (U), BT (D), Col (I, D) | yok — canlı şema gerekir | Finans ↔ sipariş köprüsü; `ZT_Orders` tablosuna bağlı, dönüştürülecek. |
| `ZT_AccountCollections` | AT, CA, CCA, PM, CAR, BI, BT, BS, CI, FBS, FR, Col, Chk, AC | AT (I, D), BS (I, U, D), BT (D), Col (I, U, D) | yok — canlı şema gerekir | Kalıcı silme. |
| `ZT_AccountCredits` | AT, CA, CCA, PM, CAR, OSCR, FBS, FR, Col, AC | AT (I, U, D), OSCR (D), AC (U), MSA (I, U, D) | yok — canlı şema gerekir | `SalesTruckID` ve `OrdersID` kolonları finans dışı bağ. |
| `ZT_AccountCreditsInvoice` | AT | AT (I, U), OSCR (D) | yok — canlı şema gerekir | `IsDeleted` ile yumuşak silme. |
| `ZT_AccountDebts` | AT, CA, CCA, PM, CAR, ATQ, FBS, FR, FM, Pay, Col, Crd, MSA, STE, PE | AT (I, U, D), PM (U), FM (D), Crd (I, U, D), MSA (I, U, D), STE (I, U, D), PE (I, U, D), OE, HME, PSE, ERTE; F parçasına göre ayrıca AccountingPurchases, SalesProduct, SalesProductLogistic, RecipeSales | yok — canlı şema gerekir; ek kolon betiği `Docs/ReceteliUretim/2026_Faz50_MasrafCokluBag.sql` | Polimorfik kaynak referansı: `AccountingType` + `ReferenceID` (+ `TransportType`). Kalıcı silme. |
| `ZT_AccountDebtsDeleteLog` | — | FM (çalışma zamanında `CREATE TABLE IF NOT EXISTS` + I) | kod içinde (`FinanceMaintenanceController.cs:574`) | Silinen borçların yedeği. |
| `ZT_AccountDebtsInvoice` | AT, FM | AT (I, U) | yok — canlı şema gerekir | Kolonlar tarıma özgü müstahsil makbuzu kesintileri içerir. |
| `ZT_AccountPayments` | AT, CA, CCA, PM, CAR, BI, BT, BS, CI, FBS, FR, Pay, Col, Chk, Crd | AT (D), PM (I), BS (I, U, D), Pay (I, U, D), Chk (I, U, D), Crd (I, U, D) | yok — canlı şema gerekir; ek kolonlar `SQL/KrediBankaCari_Migration.sql` | Kalıcı silme. |
| `ZT_AccountRollover` | AT | AT (I, U) | **var** — `SQL_Migrations/2026_08_10_ZT_AccountRollover.sql` (+ `…_SoftDelete.sql`) | Devir/sezon sınırı; bakiye kaydı oluşturmaz. |
| `ZT_AccountTransferHistory` | AT | AT (I) | **var** — `SQL_Migrations/2026_08_10_ZT_AccountTransferHistory.sql` | Cari taşıma günlüğü. |
| `ZT_BankAccounts` | CA, PA, BA, BI, Pay, Col | CA (I, U, D), BA (I, U), BI (I) | yok — canlı şema gerekir | Karşı taraf IBAN kartları; cariye `TypeAccount` + `ReferenceID` ile bağlanır. |
| `ZT_BankIntroduction` | AT, CA, CCA, PA, PM, PCA, BI, BT, BS, FBS, TD, F, Pay, Col, Chk, CB, Crd | BI (I, U), TD (I, U `Balance`), Crd (I, U `Balance`, `UsedCredit`), PCA (U `Balance`) | yok — canlı şema gerekir | Denetim tetikleyicisi var. `Balance` kolonu tutarsız güncelleniyor (bölüm 7 ve çelişki notları). |
| `ZT_BankPaymentInstructionDetails` | PA | PA (U), BI (I), Pay (U) | yok — canlı şema gerekir | Banka ödeme talimatı satırları. |
| `ZT_BankPaymentInstructions` | — | BI (I) | yok — canlı şema gerekir | |
| `ZT_BankTransactions` | CA, PA, BI, BT, BS, FBS, Pay, Col, Chk, Bil, Crd | AT (U), BT (I, U), BS (I, U), TD (I), Pay (U), Col (U, D), Chk (U, D), Bil (U), Crd (I, U) + statik `BankTransactionsController.CreateBankTransaction` üzerinden başka controller'lar | yok — canlı şema gerekir | Denetim tetikleyicisi var. |
| `ZT_BankTransfers` | BS | BS (I, U) | yok — canlı şema gerekir | Virman, EFT, havale, döviz bozum, banka↔kasa transferleri. |
| `ZT_Bills` | AT, CA, CAR, Pay, Col, Bil | AT (I, U), Pay (I), Col (I, U, D), Bil (I, U) | yok — canlı şema gerekir | |
| `ZT_CashIntroduction` | AT, CA, PM, PCA, CI, CT, BT, BS, FBS, F, Pay, Col, Chk | CI (I, U), PCA (U `Balance`) | yok — canlı şema gerekir | Denetim tetikleyicisi var. |
| `ZT_CashTransactions` | CA, CI, CT, BS, FBS, Pay, Col, Chk | AT (U), CT (I, U), BS (I, U), Pay (U), Col (U), Chk (I, U, D) + statik `CashTransactionsController.CreateCashTransaction` üzerinden başka controller'lar | yok — canlı şema gerekir | Denetim tetikleyicisi var. |
| `ZT_CheckBooks` | Pay, Col, Chk, CB | Pay (U), Col (U), Chk (U), CB (I, U, D) | yok — canlı şema gerekir | |
| `ZT_CheckMovements` | Chk | Pay (I), Col (I) | yok — canlı şema gerekir | `UpdateCheckStatus` bu tabloya yazmaz. |
| `ZT_Checks` | AT, CA, CAR, PPH, FBS, Pay, Col, Chk | AT (I, U), Pay (I, U), Col (I, U, D), Chk (U) | yok — canlı şema gerekir; ek kolon `Docs/2026_Faz61H_Checks_LastBankID.sql` | |
| `ZT_CreditContracts` | AT, BI, Crd | Crd (I, U) | yok — canlı şema gerekir; ek kolon `SQL/KrediBankaCari_Migration.sql` | |
| `ZT_CreditDrawdowns` | Crd | Crd (I, D) | yok — canlı şema gerekir | |
| `ZT_CreditInstallments` | AT, PPH, Crd | Crd (I, U, D) | yok — canlı şema gerekir | |
| `ZT_Currency` | BA | — | ⚠ varlığı doğrulanamadı | Başka her yerde `Currency` kullanılıyor; tutarsız ad. |
| `ZT_CustomerAccountPaymentPlans` | CA, PA, PAApi, PPH, Pay | CA (I, U, D), PA (U), PPH (I, U), BI (I), BT (U), Pay (I, U), Crd (I, U, D) | yok — canlı şema gerekir | Yeni ödeme planı modeli. |
| `ZT_CustomerAccounts` | AT, CA, CCA, PA, PM, CAR, ATQ, OSCR, BI, BT, BS, CT, FBS, FR, FM, Pay, Col, Chk, Bil, Crd, AC, MSA, STE, PE ve diğer masraf controller'ları | AT (U), CA (I, U), CCA (U), Pay (U), MSA (I), EI (I, U), WP (I, U) | yok — canlı şema gerekir; ek kolonlar `Docs/CustomerAccounts/2026_CustomerAccounts_Audit.sql`, `SQL/KrediBankaCari_Migration.sql` | Polimorfik ana veri referansı: `AccountGroup` + `ReferenceID`. Denetim tetikleyicisi var. F parçasına göre TransportCompany controller'ı da cari açar. |
| `ZT_ExchangeBreakSource` | BS | BS (I, D) | **var** — `SQL_Migrations/2026_04_25_create_ExchangeBreakSource.sql` | Döviz bozumunda çoklu kaynak. |
| `ZT_ExpenseItems` | PE, CA | EI, CA (I, U) | yok — canlı şema gerekir | Sınıflandırma farkı: A parçası finans dışı (masraf kalemi), D parçası finans (masraf tanımı) diyor. Kopyalama kapsamında olduğu için burada. Denetim tetikleyicisi var. |
| `ZT_ExpenseTypes` | PE, EI, CA ve D'de sayılan başka controller'lar | ET | yok — canlı şema gerekir | Denetim tetikleyicisi var. |
| `ZT_FinIncomeExpense` | Crd | TD (I), Crd (I) | yok — canlı şema gerekir | Faiz geliri, faiz ve vergi gideri. |
| `ZT_InterestCollections` | TD | TD (I) | yok — canlı şema gerekir | E parçasına göre Investments controller'ı da aynı kod üretecini kullanıyor. |
| `ZT_Investments` | BI | — (bu parçalarda yazan görülmedi) | yok — canlı şema gerekir | Investments controller'ı hiçbir parçada ayrıntılı envanterlenmedi. |
| `ZT_PaymentApprovalDetails` | PM, FM | PM (I, U) | yok — canlı şema gerekir | Eski akış. |
| `ZT_PaymentApprovals` | PM, CA | PM (I, U) | yok — canlı şema gerekir | Eski akış. |
| `ZT_PaymentDensityCurrencies` | CA | CA (I, U) | yok — canlı şema gerekir | Para birimi başına ödeme yoğunluğu eşikleri. |
| `ZT_PaymentPlans` | PM, CA, FM | PM (I, U) | yok — canlı şema gerekir | Eski akış. |
| `ZT_ProductionExpenses` | AT, ATQ, FR, FM, PE | PE (I, U) | yok — canlı şema gerekir (D'de aranmadı) | Sınıflandırma farkı: A ve B parçaları finans dışı (üretim masrafı), D parçası finans (masraf) diyor. `OrdersID`, `LineID`, `MaterialLossesID` ile finans dışına bağlı. |
| `ZT_ProductionExpensesDetail` | AT, PE | PE (I, U, D) | yok — canlı şema gerekir | |
| `ZT_TimeDeposits` | TD, BI | TD (I, U) | yok — canlı şema gerekir | |

### 5.2 Organizasyon

| Tablo | Okuyan | Yazan | DDL repoda var mı | Not |
|---|---|---|---|---|
| `ZT_AcceptanceOfGoods` | MSA, `ReportScope` | — (bu parçalarda) | yok — canlı şema gerekir | "Mal Kabul" rolü personel kütüğü. |
| `ZT_AccountingPurchases` | AT, CA, BI, BT, BA, CI, CT, FBS, F, Pay, Col, Chk, Bil, AC, MSA, STE, PE | — (bu parçalarda) | yok — canlı şema gerekir | "Muhasebe (Alış)" rolü personel kütüğü. Denetim tetikleyicisi var. |
| `ZT_Boss` | CA, CCA, BI, BT, BA, CI, CT, FBS, F, Pay, Col, Chk, Bil, AC, MSA, MSP, STE, PE | — (bu parçalarda) | yok — canlı şema gerekir | "Patron" rolü; `SuperStatus` kolonu. Denetim tetikleyicisi var. |
| `ZT_BranchProvince` | hemen hepsi | BP | yok — canlı şema gerekir | Şube. Denetim tetikleyicisi var. |
| `ZT_Expert`, `ZT_ExpertChef` | ATQ, FBS (`ZT_Expert`); D'ye göre kullanıcı kapsamı | — (bu parçalarda) | yok — canlı şema gerekir | Rol personel tablosu; aynı zamanda eksper ana verisi olarak okunuyor. |
| `ZT_FinancePerson` | AT, CA, CCA, PCA, BI, BT, BA, BS, CI, CT, FBS, F, FP, Pay, Col, Chk, Bil, AC, MSA, STE, PE, `FinanceAccess`, `FinanceRoleHelper`, `ReportScope` | FP | yok — canlı şema gerekir | `SuperStatus`, `Key`, `WorkPlaceID`. ⚠ `Key` ve `SuperStatus` kolonlarını yazan kod bulunamadı. Denetim tetikleyicisi var. |
| `ZT_LogisticsPerson` | CA, BI, CI, Pay, Col, Chk, Bil, PE, `ReportScope` | — (bu parçalarda) | yok — canlı şema gerekir | "Lojistik" rolü personel kütüğü. |
| `ZT_ProductionManager` | CA, BI, CI, Pay, Col, Chk, Bil, MSP, PE, `ReportScope` | — (bu parçalarda) | yok — canlı şema gerekir | "Üretim Müdürü" rolü; lojistikte çıkarılacak rol. |
| `ZT_PurchasingPerson`, `ZT_QualityControlPerson` | `ReportScope.UserScopeTables` | — | yok — canlı şema gerekir | Finans dışı roller. |
| `ZT_SalesPerson` | CCA | — (bu parçalarda) | yok — canlı şema gerekir | "Satış Personeli" rolü. |
| `ZT_WorkPlace` | hemen hepsi | WP, CA (I, U) | yok — canlı şema gerekir | İş yeri; her iş yeri aynı zamanda `İş Yeri Firması` carisidir. Denetim tetikleyicisi var. |

### 5.3 Ortak altyapı

| Tablo | Okuyan | Yazan | DDL repoda var mı | Not |
|---|---|---|---|---|
| `Currency` | hemen hepsi | Cur, CurrencyApi | yok — canlı şema gerekir | `ExchangeRate` kolonu sayısal kur değil, kur adı metnidir. D parçası "finans (tanım)" olarak sınıflıyor. Denetim tetikleyicisi var. |
| `Customers` (admin veritabanı) | PCA, Chk, Crd, MSA, PE | — | yok — canlı şema gerekir (admin şeması da repoda yok) | Kiracı kaydı; `QrKey` belge klasörü için okunur. |
| `Factory` | STE, ERTE | — | yok — canlı şema gerekir | Girişte de okunur. |
| `information_schema.columns` | AT, CA, FM, Chk, MSA | — | sistem kataloğu | Çalışma zamanı kolon varlığı yoklaması. |
| `Log` | — | AT, CA, PA, PM, BI, BT, BA, BS, CI, CT, TD, FP, Pay, Col, Chk, CB, Bil, Crd (`Methods.LogAdd`) | yok — canlı şema gerekir | İşlem günlüğü; her yazma işlemi günlüklenmiyor. |
| `Restriction`, `UserRestriction` | CCA, Cur, TT, PE, CurrencyApi (`GlobalVeriables.restrictionQuery`) | — | yok — canlı şema gerekir | Rol bazlı ekran kısıtı; kiracı veritabanında. |
| `Users`, `UserRoles` (admin veritabanı) | AT, BT, BA, BS, CT, F | — | yok — canlı şema gerekir | Rol okuma. |
| `ZT_EInvoice` | MSA | — (bu parçalarda) | F'ye göre `Docs/Uyumsoft/Faz_UY1…` | e-Dönüşüm altyapısı. |
| `ZT_IntroductionAccessSummary` | `DefinitionAuditService` | `DefinitionAuditService` | **var** — `SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql` | Tanım erişim özeti. |
| `ZT_Setting` | PCA, MSA, yan menü ve ödeme/tahsilat modal partial'ları | PCA (U) | yok — canlı şema gerekir | `Reçeteli Üretim` bayrağı finans dışı anlam taşır. |

### 5.4 Finans dışı

| Tablo | Okuyan | Yazan | DDL repoda var mı | Not |
|---|---|---|---|---|
| `AmountType` | — (finans/stok/masraf sayfaları okumuyor) | AmountType controller'ı | yok — canlı şema gerekir | Üretim/reçete birimi. |
| `BankTransactions`, `CashTransactions` (`ZT_` öneksiz, eski) | — | PCA (I) | yok — canlı şema gerekir | Eski hareket tabloları; finans kodunun geri kalanı `ZT_` önekli tabloları kullanır. |
| `ContainerType` | AT, ATQ, FBS, PCA, MSA, MSP, PE | — (bu parçalarda) | yok — canlı şema gerekir | Malzeme kartı. |
| `Customer` | AT, CA, CCA, ATQ, BS, FBS, Col, AC, MSA, STE, PE, OE, PSE | CA (I, U) | yok — canlı şema gerekir | Satış müşterisi ana verisi. |
| `Line` | PE | — | yok — canlı şema gerekir | Üretim hattı. |
| `Product`, `SubProduct` | AT, CCA, ATQ, PCA, BS, FBS, Pay, Col, PSE | — | yok — canlı şema gerekir | Ürün. |
| `Supplier` | CA, ATQ, PCA, FBS, Pay, HME, ERTE | CA (I, U) | yok — canlı şema gerekir | Tedarikçi (üretici). |
| `TransportChauffeur` | STE, ERTE | — (bu parçalarda) | yok — canlı şema gerekir | Nakliye firması şoförü. |
| `TransportCompany` | CA, ATQ, PCA, STE, ERTE | CA (I, U) | yok — canlı şema gerekir | Nakliye firması; lojistikte çekirdek olabilir. |
| `TransportTruck` | ATQ, PCA, ERTE | PCA (I) | yok — canlı şema gerekir | Araç. |
| `ZT_Chauffeur` | ATQ | — (bu parçalarda) | yok — canlı şema gerekir | Bahçe/hasat şoförü. |
| `ZT_CustomerAccountSupplierPaymentsShares` | Pay | Pay (I) | yok — canlı şema gerekir | Bahçe ödeme payı; finansa bağlı ama finans dışı. |
| `ZT_DistributedPallet` | FBS | — | yok — canlı şema gerekir | Palet. |
| `ZT_ExpertReport` | AT, ATQ, PCA, FBS, FR, Pay, HME, ERTE | HME, ERTE (D'ye göre R/W) | yok — canlı şema gerekir | Eksper raporu. |
| `ZT_ExpertReportTruck` | AT, ATQ, PCA, FBS, FR, Pay, HME, ERTE | HME, ERTE (D'ye göre R/W) | yok — canlı şema gerekir | Hasat aracı. |
| `ZT_ExpertReportTruckExpenses` | ATQ, PCA, FM, ERTE | PCA (U), ERTE (I, U) | yok — canlı şema gerekir | D parçası "finans (masraf), eksper aracına bağlı" diyor. |
| `ZT_ExpertReportTruckFinance` | AT, ATQ, FBS, FR, FM, Pay | — (bu parçalarda) | yok — canlı şema gerekir | |
| `ZT_HarvestAndProductionWorkersPricing` | ERTE | — | yok — canlı şema gerekir | |
| `ZT_HarvestManager` | CA, PCA, ERTE | CA (I, U) | yok — canlı şema gerekir | Kesim çavuşu. |
| `ZT_IndustrialSupplier` | CA, AT, ATQ, PCA, MSA | CA (I, U), MSA (I) | yok — canlı şema gerekir | Malzeme/ilaç tedarikçisi. |
| `ZT_InstallmentPayments` | PCA | PCA (I, U) | yok — canlı şema gerekir | Eksper raporu taksit ödemesi. |
| `ZT_LaboratoryFirms` | CA, ATQ | CA (I, U) | yok — canlı şema gerekir | Analiz firması. |
| `ZT_LocationPricing` | STE, ERTE | — (bu parçalarda) | yok — canlı şema gerekir | Mevki bazlı fiyat tarifesi. |
| `ZT_LotCategory` | — | — | **var** — `SQL_Migrations/2026_LotCategory_ContainerType_Migration.sql` | Yalnız betikte geçiyor. |
| `ZT_MaterialConsumption` | MSA | — (yazan ProductionConveyor) | **var** — `Docs/MaterialStockAll/2026_FazMC_MaterialConsumption.sql` | Üretim tüketim defteri. |
| `ZT_MaterialInvoice` | AT, ATQ, PCA, FBS, FM, MSA | AT (U), PCA (U), MSA (I, U) | yok — canlı şema gerekir; ek kolon betikleri D'de listeli | Karma: stok belgesi + cari borcun kaynağı. |
| `ZT_MaterialLossDetail` | MSA | MSA (I, U) | **var** — `ZT_MaterialLossDetail.sql` (proje kökü) | |
| `ZT_MaterialLosses` | MSA, PE | MSA (I, U) | yok — canlı şema gerekir | |
| `ZT_MaterialPurchases` | AT, ATQ, FBS, MSA, PE | AT (U), MSA (I, U, D) | yok — canlı şema gerekir; ek kolon betikleri D'de listeli | Stok lotu. |
| `ZT_MaterialSalesInvoice`, `ZT_MaterialSalesItems` | AT (`ZT_MaterialSalesInvoice`), MSA | MSA (I, U, D) | yok — canlı şema gerekir | Karma: stok çıkışı + cari alacağın kaynağı. |
| `ZT_MaterialStockAll` | FBS, MSA, MSP | AT (U), MSA (I, U); kapsam dışı: ProductionConveyor, ReadyStock, ProductionPlanning, RecipeGoods, RecipeProduction, RecipePurchasing, SalesProduct | yok — canlı şema gerekir | Sayaç tablosu; anahtar (malzeme türü, iş yeri, şube) — veritabanı kısıtı ⚠ BULUNAMADI. |
| `ZT_MaterialStockCount` | — | — (RecipeGoods) | **var** — `SQL/2026_10_23_MaterialStockCount_Audit.sql` | Sayım geçmişi. |
| `ZT_MaterialUsageFormula` | — | — (ProductionConveyor) | **var** — `ZT_MaterialUsageFormula_Create.sql` (proje kökü) | |
| `ZT_MergedOrderProductPrices` | — | OSCR (D, varlık kontrolüyle) | yok — canlı şema gerekir | |
| `ZT_OrderClaims` | ATQ, FM | — | yok — canlı şema gerekir | |
| `ZT_OrderExpenses` | ATQ, FM, OE | OE | yok — canlı şema gerekir | D parçası "finans (masraf), siparişe bağlı" diyor. |
| `ZT_OrderHeader` | CCA, OE | — (bu parçalarda) | yok — canlı şema gerekir | Sipariş başlığı. |
| `ZT_Orders` | AT, CCA, ATQ, BS, FR, Col, AC, PE, OE | OSCR (U) | yok — canlı şema gerekir | Sipariş. |
| `ZT_PalletsLoadedTruck` | FBS | — | yok — canlı şema gerekir | |
| `ZT_Personnel` | CA | CA (I, U) | yok — canlı şema gerekir | Personel. |
| `ZT_PesticideInvoice` | AT, ATQ, PCA, FBS, FM | PCA (U) | yok — canlı şema gerekir | İlaç. |
| `ZT_PesticidePurchases`, `ZT_Pesticides`, `ZT_PesticideSalesInvoice`, `ZT_PesticideStockAll` | AT, ATQ, FBS | — | yok — canlı şema gerekir | İlaç stoğu. |
| `ZT_PoGoodsReceipt`, `ZT_PurchaseOrder`, `ZT_PurchaseOrderLine` | MSA | MSA (U) | yok — canlı şema gerekir | Satınalma. |
| `ZT_ProductionConveyor`, `ZT_ProductionConveyorMaterials` | AT, FBS, MSA, PSE | — | yok — canlı şema gerekir; ek kolon `SQL_Migrations/2026_MaterialBatch_Lot_Migration.sql` | Üretim. |
| `ZT_ProductionConveyorCost` | FBS | — | yok — canlı şema gerekir | |
| `ZT_ProductionPlanning` | hemen tüm finans sayfaları (layout sohbeti); FBS (ticari borç) | — | yok — canlı şema gerekir | Layout'un dayattığı bağımlılık. |
| `ZT_ProductionSergeantExpenseBatches` | FBS, PSE | PSE | yok — canlı şema gerekir | |
| `ZT_ProductionSergeants` | CA, ATQ, FBS, PSE | CA (I, U) | yok — canlı şema gerekir | Üretim çavuşu. |
| `ZT_ProductionSergeantsExpenses` | ATQ, FR, FM, PSE | PSE | yok — canlı şema gerekir | D parçası "finans (masraf), üretime bağlı" diyor. |
| `ZT_Purchases` | FBS, FR | — | yok — canlı şema gerekir | Bahçe alımı. |
| `ZT_SalesTruck` | AT, ATQ, FR, FM, STE | AT (U), OSCR (U), FM (U), STE (U) | yok — canlı şema gerekir | Satış sevk aracı; nakliye masrafı kolonlarını taşır. |
| `ZT_SalesTruckBatchNumbers` | AT, OSCR, STE | — | yok — canlı şema gerekir | |
| `ZT_SalesTruckDebtLog` | — | AT (çalışma zamanında `CREATE TABLE IF NOT EXISTS` + I) | **var** — `Docs/2026_SalesTruckDebtLog.sql` (+ kod içinde) | |
| `ZT_StockMovementLog` | FBS | — | yok — canlı şema gerekir | |
| `ZT_Supplier`, `ZT_Customer`, `ZT_Transport`, `ZT_CuttingChief`, `ZT_TransportCompany` | BA (`GetReferenceName`, dinamik) | — | ⚠ bu adlarla tabloların varlığı doğrulanmadı | Hata yutuluyor. |
| `ZT_UsedHarvestManager` | AT, ATQ, PCA, FR, FM, HME, ERTE | PCA (U), ERTE (I), HME | yok — canlı şema gerekir | |
| `ZT_Warehouse` | AT, ATQ, MSA | — | yok — canlı şema gerekir; ek kolonlar `Docs/ReceteliUretim/2026_Faz53_DepoYonetimi.sql` | Depo. |
| `ZT_WarehouseLocation`, `ZT_WarehouseLocationTransfer` | — (bu parçalarda) | — | **var** — `Docs/ReceteliUretim/2026_Faz53_DepoYonetimi.sql` | Raf konumu. |
| `ZT_WorkplaceContacts` | ATQ | — | yok — canlı şema gerekir | |

### 5.5 Tablo dışı SQL nesneleri

| Nesne | Tür | Nerede kullanılıyor | DDL repoda var mı | Not |
|---|---|---|---|---|
| `ZT_PaymentApprovalCode_seq` | Sequence | PM (`nextval`, onay kodu üretimi) | ⚠ BULUNAMADI | Projede sequence kullanan tek numara üreteci. |
| `trg_IntroductionAudit` | Trigger (BEFORE INSERT OR UPDATE) | `ZT_CashIntroduction`, `ZT_BankIntroduction`, `ZT_FinancePerson`, `ZT_CashTransactions`, `ZT_BankTransactions`, `ZT_CustomerAccounts`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince`, `ZT_ExpenseTypes`, `ZT_ExpenseItems` ve rol tabloları | **var** — `SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql` (+ `2026_09_03_…_Change_Guard.sql`, `2026_09_06_…_System_Columns.sql`, `2026_09_06_CustomerAccounts_Audit_Rebuild.sql`) | Denetim kolonlarını doldurur. |
| `public."fn_IntroductionAudit"()` | Function | Yukarıdaki tetikleyicinin gövdesi | **var** — aynı betikler | Aktörü bağlantı ayarından okur. |
| `zto.audit_actor`, `zto.audit_suppress` | Oturum ayarı (GUC) | `IntroductionAuditHelper.WithActor` bağlantı dizesine aktörü koyar; `ExecuteSuppressed` toplu sistem güncellemesinde damgalamayı bastırır (CA, CCA) | betik: `2026_09_02_…_Actor_Guc.sql` | Kopyada bu bağ korunmazsa denetim kolonları boş kalır. |
| `information_schema.columns` yoklamaları | Sistem kataloğu sorgusu | AT (`ZT_SalesTruck` kolonları), CA (`DeletedAt`, `UpdatedNote`), FM, Chk (`LastBankID`), MSA (çeşitli kolonlar) | — | Betik uygulanmamış veritabanına tolerans. |
| `to_regclass(...)` yoklamaları | Sistem fonksiyonu | OSCR (`ZT_MergedOrderProductPrices`), MSA (`ZT_PoGoodsReceipt`, `ZT_MaterialConsumption`, `ZT_MaterialLossDetail`) | — | Tablo varlık kontrolü. |
| Çalışma zamanı `CREATE TABLE IF NOT EXISTS` | Kod içi DDL | AT (`ZT_SalesTruckDebtLog`), FM (`ZT_AccountDebtsDeleteLog`) | kod içinde | Finans controller'larındaki yalnız iki örnek. |
| İndeksler | Index | `ZT_AccountRollover` (4), `ZT_AccountTransferHistory` (3), `ZT_ExchangeBreakSource` (2), kredi kolonları (4) | **var** — ilgili betiklerde; ayrıca `Docs/2026_PERF_CariHesaplarIndeksleri.sql` | Çekirdek tabloların özgün indeksleri repoda yok. |
| View / stored function çağrısı | — | Finans controller'larının SQL'inde görülmedi | — | Kimlikler `serial` + `RETURNING "ID"` ile alınıyor. |


---

## 6. Controller'lar arası bağımlılık matrisi

Okuma kılavuzu: "Çağıran" sütunu çağrının yapıldığı controller'ı ya da onun view/JS dosyasını gösterir. Tür değerleri: **AJAX** (view/JS'ten başka controller'ın ucuna istek), **statik metot** (C# içinden başka controller'ın ya da yardımcının statik metodu), **paylaşılan partial** (başka controller'ın klasöründeki ya da ortak bir partial'ın gömülmesi), **Session üzerinden veri** (bir controller'ın yazdığı Session anahtarını diğerinin okuması), **bağlantı** (yalnız link/yönlendirme; veri alışverişi yok). Yalnız bağlantı olan çağrılar tablonun sonunda toplu verildi.

### 6.1 Finans controller'ları arasında

| Çağıran | Çağrılan | Ne | Tür |
|---|---|---|---|
| AccountTransaction | BankTransactions | `CreateBankTransaction` (tahsilatta) | statik metot |
| AccountTransaction | CashTransactions | `CreateCashTransaction` (tahsilatta) | statik metot |
| AccountTransaction | PaymentPlanHelper | `SyncCheckPaymentPlan` | statik metot |
| AccountTransaction (Transactions view) | BankTransactions | `GetBankList` | AJAX |
| AccountTransaction (Transactions view) | CashTransactions | `GetCashList` | AJAX |
| AccountTransaction (Transactions view) | CustomerAccountCollection | `GetCollectionDetail` | AJAX |
| AccountTransaction (Transactions view) | CustomerAccountPayment | `GetPaymentDetail` | AJAX |
| AccountTransaction (Transactions view, alltransactions.js) | CustomerAccounts | `SearchAccountsForQuickAction` | AJAX |
| AccountTransaction (`_AllTransactionsPaymentTools`) | CustomerAccounts | `GetUpcomingPaymentPlansForDashboard`, `PostponePaymentPlan`, `DeleteDashboardPlan`, `MarkDashboardPlanPaid`, `GetPaymentDensities`, `SavePaymentDensity`, `GetPaymentHeatmapData`, `GetExchangeRatesForHeatmap` | AJAX + paylaşılan partial |
| CustomerCurrentAccounts | AccountTransaction | `TransactionsPartial` (modal içine) | AJAX |
| BankIntroduction | CustomerAccounts | `GetApprovalStatusCounts` | statik metot |
| BankTransactions (view/JS) | CustomerAccountCollection | `AddCollection`, `UpdateCollection`, `DeleteCollection`, `ConfirmDeleteCollection`, `GetCollectionList`, `GetCollectionDetail`, `GetCollectionForUpdate`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `GetAvailableCurrenciesForCollection`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`, `GetCustomerCreditSummary`, `GetCustomerOrders` | AJAX |
| BankTransactions (view) | CustomerAccountCollection | `_CollectionModalsPartial.cshtml` | paylaşılan partial |
| BankTransactions (view/JS) | CustomerAccountPayment | `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `SaveQuickPaymentPlanning`, `GetEndorsableChecks`, `GetGardenPaymentHistory`, `GetSupplierGardens`, `GetMatchingChecks`, `MatchPaymentWithCheck` | AJAX |
| BankTransactions (view) | ortak | `_AddPaymentModal` (+ `_CheckLeafGuard`), `_PostPaymentPlanningModal` | paylaşılan partial |
| BankTransactions (view/JS) | CustomerAccounts | `GetAccountBalancesByCurrency`, `GetAllCurrenciesForPlan`, `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning` | AJAX |
| BankTransactions (view) | PaymentApproval | `UpdateInstructionStatusToCompleted` | AJAX |
| BankTransactions (view/JS) | AccountTransaction | `GetAvailableCurrencies`, `GetWorkPlaceBalances` | AJAX |
| BankTransactions (view/JS) | PaymentManagement | `GetCustomerDebtSummary` | AJAX |
| PaymentApproval | BankTransactions | `PendingInstructionData` (+ `InstructionTimestamp`) — PaymentApproval yazar, BankTransactions okur | Session üzerinden veri |
| CashTransactions (view/JS) | CustomerAccountCollection | BankTransactions ile aynı 14 uç | AJAX |
| CashTransactions (view) | CustomerAccountCollection | `_CollectionModalsPartial.cshtml` | paylaşılan partial |
| CashTransactions (view/JS) | CustomerAccountPayment | `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `GetSupplierGardens`, `SaveQuickPaymentPlanning`, `GetEndorsableChecks`, `GetGardenPaymentHistory` | AJAX |
| CashTransactions (view) | ortak | `_AddPaymentModal` | paylaşılan partial |
| CashTransactions (view/JS) | CustomerAccounts | BankTransactions ile aynı 6 uç | AJAX |
| CashTransactions (view/JS) | AccountTransaction | `GetAvailableCurrencies`, `GetWorkPlaceBalances` | AJAX |
| CashTransactions (view/JS) | PaymentManagement | `GetCustomerDebtSummary` | AJAX |
| CashTransactions (view/JS) | BankTransactions | `CheckInstructionSessionExists` | AJAX |
| CustomerAccountPayment | BankTransactions | `CreateBankTransaction` | statik metot |
| CustomerAccountPayment | CashTransactions | `CreateCashTransaction` | statik metot |
| CustomerAccountPayment | CreditContracts | `PayWithCredit` | statik metot |
| CustomerAccountPayment | PaymentPlanHelper | `SyncCheckPaymentPlan` | statik metot |
| CustomerAccountPayment | Bills, Checks | iç sınıflar `using static` ile içe aktarılıyor | derleme bağımlılığı (statik) |
| CustomerAccountPayment (view/JS) | CustomerAccounts | `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning`, `GetAllCurrenciesForPlan`, `GetAccountBalancesByCurrency` | AJAX |
| CustomerAccountPayment (view/JS) | CustomerAccountCollection | `GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer` | AJAX |
| CustomerAccountPayment (JS) | BankTransactions | `CheckInstructionSessionExists` | AJAX |
| CustomerAccountPayment (JS) | PaymentManagement | `GetCustomerDebtSummary` | AJAX |
| CustomerAccountPayment (JS) | AccountTransaction | `GetWorkPlaceBalances`, `GetAvailableCurrencies` | AJAX |
| CustomerAccountPayment (`_CheckLeafGuard`) | Checks | `CheckLeafLookup` | AJAX + paylaşılan partial |
| CustomerAccountCollection | BankTransactions | `CreateBankTransaction` | statik metot |
| CustomerAccountCollection | CashTransactions | `CreateCashTransaction` | statik metot |
| CustomerAccountCollection | PaymentPlanHelper | `SyncCheckPaymentPlan`, `CancelCheckPaymentPlan` | statik metot |
| CustomerAccountCollection (view/JS) | CustomerAccounts | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | AJAX |
| Checks | BankTransactions | `CreateBankTransaction` | statik metot |
| Checks | PaymentPlanHelper | `SyncCheckPaymentPlan`, `CancelCheckPaymentPlan` | statik metot |
| Checks (view) | CustomerAccountPayment | `GetEndorsableChecks`, `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetCustomerBankAccounts`, `GetAvailableCheckBooks`, `SaveQuickPaymentPlanning`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch` | AJAX |
| Checks (view) | CustomerAccountPayment | `payments.js` + `_AddPaymentModal` ödeme modali gömülü | paylaşılan partial |
| Checks (view) | CustomerAccountCollection | `GetBanksByWorkPlaceCustomer`, `GetCustomerCreditSummary`, `GetCashByWorkPlaceCustomer` | AJAX |
| Checks (view) | CustomerAccounts | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | AJAX |
| Checks (view) | BankTransactions | `GetBankList` | AJAX |
| Checks (view) | PaymentManagement | `GetCustomerDebtSummary` | AJAX |
| Checks (view) | AccountTransaction | `GetWorkPlaceBalances` | AJAX |
| Bills | BankTransactions | `CreateBankTransaction` | statik metot |
| Bills (view) | CustomerAccountPayment | `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `SaveQuickPaymentPlanning`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch` | AJAX |
| Bills (view) | CustomerAccountPayment | `payments.js` + ödeme modali gömülü | paylaşılan partial |
| Bills (view) | CustomerAccounts | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | AJAX |
| Bills (view) | CustomerAccountCollection | `GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer` | AJAX |
| Bills (view) | BankTransactions | `GetBankList` | AJAX |
| Bills (view) | PaymentManagement | `GetCustomerDebtSummary` | AJAX |
| Bills (view) | AccountTransaction | `GetWorkPlaceBalances` | AJAX |
| CreditContracts | BankTransactions | `CreateBankTransaction` (yalnız `CreateCreditUsageTransaction` içinde) | statik metot |
| CreditContracts | PaymentPlanHelper | `SyncCreditPaymentPlan` | statik metot |
| TimeDeposits | CreditContracts | `BankDropdownDto`, `CurrencyDropdownDto`, `SimpleDropdownDto` sınıfları o dosyada | derleme bağımlılığı (statik) |
| PaymentManagement | BankTransactions | `CreateBankTransaction` | statik metot |
| PaymentManagement | CashTransactions | `CreateCashTransaction` | statik metot |
| FinanceMaintenance (view) | AccountTransaction | `GetDebtRedirectInfo` | AJAX |
| SalesTruckExpenses (view) | AccountTransaction | `GetTransactionDetails` | AJAX |
| ProductionExpenses (view) | MaterialStockAll | `GetFile` | AJAX / bağlantı |

### 6.2 Finans dışına giden çağrılar ve finans dışından gelen çağrılar

| Çağıran | Çağrılan | Ne | Tür |
|---|---|---|---|
| AccountTransaction (Transactions view) | SalesProductLogistic | `GetCurrencies`, `GetWithoutOrderDetails`, `SaveOfficialInfoComprehensive` | AJAX |
| AccountTransaction (transactions.js) | ProductionExpenses | `GetExpenseDetails` | AJAX |
| AccountTransaction (transactions.js) | MaterialStockAll | `GetMaterials`, `GetSalesMaterials` | AJAX |
| AccountTransaction (transactions.js) | PesticideStockAll | `GetMaterials`, `GetSalesMaterials` | AJAX |
| AccountTransaction (Transactions view) | Product | `/Product/…` | AJAX |
| AccountTransaction | OfficialSalesCreditRemover | `RemoveByTruck` | statik metot |
| MaterialStockAll (Add view) | Weighbridge | `AddNewTransportCompanyOrTruck`, `HarvestManagerAdd`, `GetTransportCompanies`, `GetTransportCompanyByPlate` | AJAX |
| FinancePerson (view) | Expert | `GetAllWorkPlaces`, `GetBranchProvincesByWorkPlace` | AJAX |
| FinanceReport (view) | Report | `GetNetworkImage` | AJAX |
| PurchaseCurrentAccount (view) | Payment | `SavePayment` | AJAX |
| SalesTruckExpenses (view) | SalesTruck | `GetCompanySalesDetails`, `GetCompanyInfo` — ⚠ controller projede yok | AJAX (kırık) |
| PersonnelAdditionalPayment, PersonnelAdvance, PersonnelSalary | BankTransactions, CashTransactions | `CreateBankTransaction`, `CreateCashTransaction` | statik metot (gelen) |
| PersonnelSalary (view) | CustomerAccounts | uçları çağırıyor (uç adları parçada yok) | AJAX (gelen) |
| `_ProductionLayout` | CustomerAccounts | uçları çağırıyor (uç adları parçada yok) | AJAX (gelen) |
| MaterialStockAll, PesticideStockAll view'ları | AccountTransaction | `TransactionsByReference` | bağlantı (gelen) |
| Bütün `_ProductionLayout` sayfaları | ProductionPlanning verisi | `ViewBag.ProductionPlanningChat` için `ZT_ProductionPlanning` sorgusu | layout bağımlılığı |

### 6.3 Yalnız bağlantı / yönlendirme

- AccountTransaction → CustomerAccounts, CustomerAccountCollection/Collections, CustomerAccountPayment/Payments, CreditContracts/Details, Checks/Checks; `GetDebtRedirectInfo` finans dışı sayfalara URL üretir.
- CustomerAccounts → AccountTransaction, Payments, Collections, PaymentApproval, BankStatement, Checks, Bills, BankTransactions, CashTransactions, BankAccounts, CreditContracts, TimeDeposits, Investments; finans dışı Personnel, ProductionSergeantsExpenses, HarvestManagerExpenses, SalesTruckExpenses.
- PaymentApproval → BankTransactions/Index (talimat sonrası), CustomerAccounts/Index.
- BankStatement → AccountTransaction/Transactions, BankTransactions/Index, CashTransactions/Index.
- CreditContracts → BankTransactions/Index, AccountTransaction/Transactions, CustomerAccounts/Index, Finance/Index (hata yolu).
- FinancialBalanceSheet, SalesTruckExpenses, FinanceReport → AccountTransaction (Transactions ya da Statement).
- AccountCredits → CustomerAccountCollection/Collections.
- Finance → BankAccounts, BankIntroduction, BankTransactions, CashIntroduction, CashTransactions, CustomerCurrentAccounts, PurchaseCurrentAccount.
- Hemen tüm finans controller'ları → Home (Error, Closed), Auth/Permission, Account/Login.

## 7. Bulunamayan / doğrulanamayan öğeler

| Öğe | Hangi parçada | Neden önemli |
|---|---|---|
| Çekirdek finans tablolarının temel `CREATE TABLE` betikleri (`ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_AccountDebtsInvoice`, `ZT_AccountCreditsInvoice`, `ZT_CustomerAccountPaymentPlans`, `ZT_PaymentPlans`, `ZT_PaymentApprovals`, `ZT_PaymentApprovalDetails`, `ZT_PaymentDensityCurrencies`, `ZT_BankPaymentInstructions`, `ZT_BankPaymentInstructionDetails`, `ZT_BankAccounts`, `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_BankTransfers`, `ZT_CashIntroduction`, `ZT_CashTransactions`, `ZT_TimeDeposits`, `ZT_InterestCollections`, `ZT_FinIncomeExpense`, `ZT_Checks`, `ZT_Bills`, `ZT_CreditContracts`, `ZT_FinancePerson`, `ZT_InstallmentPayments`, `Currency`, `Log` …) | A, B, C, D, E | Kopya projede şema kurulamaz; tip, kısıt ve indeksler için canlı kiracı veritabanından `pg_dump --schema-only` gerekir. |
| `ZT_PaymentApprovalCode_seq` sequence betiği | A | Eski onay akışının kod üreteci çalışmaz. |
| Kiracı veritabanının tam şema dökümü | E | Kopyalamanın ön koşulu. |
| Admin veritabanı (`Customers`, `Users`, `UserRoles`) tam şeması | E | Kimlik doğrulama ve kiracı çözümleme kopyalanırken gerekir. |
| Yeni kiracı açılışı (veritabanı oluşturma/şablon) | E | Lojistik projesinde kiracı açma süreci sıfırdan tasarlanmalı; muhtemelen repoda olmayan ayrı bir yönetim panelinde. |
| `Api/PaymentApprovalApi/CheckCompletedInstructions` çağıranı ve `InstructionStatus` kolonuna yazan kod | A | Ölü uç olabilir; kopyalanıp kopyalanmayacağına karar verilmeli. |
| `AccountTransaction/AddCollection` çağıranı | A | Ölü uç olabilir. |
| `CustomerAccounts/ApprovePaymentPlanning` çağıranı | A | Onay akışının hangi uçtan yürüdüğü belirsiz. |
| `PaymentPlanHelper.CancelSalaryPaymentPlan` çağıranı | A, C | Maaş planı personel modülüne bağlı; lojistikte gerekip gerekmediği. |
| `CustomerAccountReport` sayfasına menü/bağlantı; `EditCheck` / `EditBill` action'ları bu controller'da yok | A | Atıl sayfa ve kırık bağlantı; kopyalama dışı bırakılabilir. |
| `/PaymentManagement/*` sayfalarına ana menüden bağlantı | A | Eski akış menüden erişilmiyor; kopyalanıp kopyalanmayacağı. |
| Kullanıcıyı kendi iş yeriyle sınırlayan sunucu taraflı zorunlu kısıt / merkezi kullanıcı—iş yeri yetki tablosu | A, B, C, D | Çok iş yerli lojistik firmada veri sızıntısı riski; FinanceReport dışında yok. |
| Banka ekstresi dosya içe aktarma / otomatik eşleştirme | B | Beklenen bir finans özelliği kodda yok. |
| Sunucu tarafı Excel/PDF üretimi ve dosya yükleme (banka/kasa grubu) | B, C, E | Çıktılar istemci tarafında; lojistik belgeleri (fatura, CMR) için altyapı yok. |
| `ZT_FinancePerson.Key` ve `SuperStatus` kolonlarını yazan kod | B | Finans süper kullanıcı kuralı ve Patron erişimi bu kolonlara dayanıyor. |
| `ZT_Currency` tablosunun varlığı | B | BankAccounts sayfası hata yoluna düşüyor olabilir. |
| `GetReferenceName` içindeki `ZT_Supplier`, `ZT_Customer`, `ZT_Transport`, `ZT_CuttingChief`, `ZT_TransportCompany` tablolarının varlığı | B | Hata yutuluyor; ad gösterimi sessizce bozuk olabilir. |
| Çağrısı bulunamayan action'lar: BT `AddTransaction`, `DeleteTransaction`; BS `CreateVirman`, `GetWorkPlacesByBranch`, `GetCollectionOrders`; TD `CalculateInterestPreview`, `GetMaturedDeposits`; BI `GetAccountCards`; CI `GetCashCards` | B | Ölü kod adayı; son ikisi regex taramasında yakalanmamış olabilir. |
| Banka/kasa grubu tablo listesinin eksiksizliği (regex tabanlı) | B | Büyük dosyalarda nadir yazımlar kaçmış olabilir; kopyalamadan önce `"ZT_` araması önerilmiş. |
| `_ProductionLayout` içinde select2 yüklemesi | B | BankStatement sayfası select2'ye layout'tan bağımlı. |
| `Models/Report/FinanceReport.cs` tam sınıf listesi | B | Bir kısmı kullanım yerinden çıkarıldı. |
| Ödeme/tahsilat sayfalarında TCMB/kur ucu çağrısı | C | Kur istemciden elle geliyor; otomatik kur yok. |
| Ödeme/tahsilat makbuz numarası üreteci | C, E | Belge numarası kullanıcı girişi; otomatik numaralandırma tasarlanmalı. |
| `AddPayment` içindeki `Kredi` dalını tetikleyen istemci kodu | C | Krediyle ödeme yolu arayüzden kullanılmıyor olabilir. |
| `CustomerAccountCollection/GetAvailableCheckBooks` action'ı; `urls.getCustomerCurrency` yapılandırma anahtarı | C | Ölü/kırık URL. |
| `BillsController.Index` action'ı | C | Hata yolunda 404 üretir. |
| `AccountCredits/Index` içindeki `deleteModal` için silme action'ı | C | Arayüzde çalışmayan bir işlem var. |
| `_CreditDashboardWidget.cshtml`'i dahil eden view | C | Atıl partial olabilir. |
| Çağrı yeri bulunamayan uçlar: `GetActiveCreditsForPayment`, `GetCreditSummary`, `DeleteCreditContract`, `MarkBillAsPaid`, `GetAvailableChecksByBank` | C | Ölü kod adayı. |
| `ZT_BankIntroduction.Balance` kolonunu güncelleyen veritabanı tetikleyicisi | C | Bakiye kolonu bazı modüllerce güncelleniyor, bazılarınca güncellenmiyor; tutarsızlık. |
| `ForceDeleteCreditContract` kapatılmış kredi kontrolü (ilk 20 satırda görülmedi) | C | Kapatılmış kredinin zorla silinmesi riski. |
| `AccountCredits` içindeki `customerUserRole` oturum değerinin yazımı (`Finans` mı `Finans(normal)` mı) | C | Rol dalı hiç çalışmıyor olabilir. |
| Global fallback yetki politikası | D | Özniteliksiz controller'lar korumasız. |
| MaterialStockAll: `GetAvailableStock`, `CheckInvoiceDeletable`, `CheckSalesInvoiceDeletable` çağıranı | D | Regex sınırı; dinamik URL olabilir. |
| `ZT_MaterialStockAll` CREATE TABLE ifadesi, (malzeme türü, iş yeri, şube) anahtarı için veritabanı kısıtı, kolon tipleri | D | Ondalık miktar (yakıt litresi) desteği belirsiz; mükerrer bakiye satırı riski. |
| Birleşik stok hareket defteri tablosu | D | Lojistik sarf deposu için hareket defteri yeniden tasarlanmalı. |
| 3PL için SKU barkod/ebat alanları ve depolama hizmet faturalama | D | Müşteri malı depolama ihtiyacı karşılanmıyor. |
| SalesTruckExpenses: `/SalesTruck/*` uçlarının hedef controller'ı; `UpdateTransportInfo` çağıranı | D | Kırık AJAX; sayfanın iki modalı çalışmıyor olabilir. |
| ProductionExpenses: `GetExpenseTypes` / `GetExpenseItemsByType` çağıranı; masraf tablolarının CREATE TABLE ifadesi (aranmadı) | D | Ölü uç adayı; şema eksik. |
| OrderExpenses, HarvestManagerExpenses, ProductionSergeantsExpenses, ExpertReportTruckExpenses modal ve AJAX haritası (ayrıntı çıkarılmadı) | D | Bu dört masraf controller'ı yalnız özet düzeyinde envanterlendi. |
| `TransactionType` adının SQL'de tablo mu kolon mu olduğu | D | Finans sayfalarının `TransactionType` tanım tablosuna bağımlı olup olmadığı belirsiz. |
| `ExpertReportTruckExpenses` adlı action'ın AccountingPurchasesController içinde varlığı | F | Masraf ekranı ayrı controller'da. |
| `TruckArrivalStatus` tam değer kümesi | F | Hasat aracı durum makinesi bilinmiyor. |
| `ZT_ExpertReportTruckBarcode`, `ZT_ExpertReportTruckMaterialTracking` tablo adları | F | Model adından çıkarıldı. |
| CMR formunu basan view/PDF üretici | F | Lojistikte CMR çıktısı sıfırdan yazılmalı. |
| `TransportCompany.CustomerID` kolonunun iş anlamı | F | Nakliye firması—müşteri ilişkisi lojistik ana verisinde önemli. |
| `TransportTruck.Plate` üzerinde benzersizlik kısıtı | F | Plaka eşleşmesine dayanan borç yazımı mükerrer kayıtla bozulabilir. |
| İş yeri koordinat kolonu adı | F | Yükleme noktası konumu için gerekli. |
| Satış sevkiyatı için güzergâh bazlı navlun tarifesi | F | Lojistik fiyatlandırması için yok. |
| Uyumsoft gelen faturanın cariye eşleştirme kolonları; e-İrsaliye UBL içindeki taşıyıcı bilgisi (incelenmedi) | F | Gelen nakliye faturalarının cariye aktarımı ve irsaliye içeriği. |
| `ZT_SalesTruck` resmî satış alacağı ve benzeri borç kayıtlarının ayrıntısı (incelenmedi) | F | Satış sevkiyatının finans izinin tam resmi eksik. |
| `ZT_RecipeShipment` navlun borcundaki `ReferenceID` değeri | F | Polimorfik referans eşlemesi doğrulanmalı. |
| ExpertReportTruckApi yazma uçlarında `Methods.Authorize` çağrısı (görülmedi) | F | Kimlik doğrulamasız yazma uçları; örnek alınmamalı. |

---

## 8. Kodun kendi içindeki tutarsızlıklar

Envanter parçaları birleştirilirken aynı konunun farklı sayfalarda farklı uygulandığı görüldü. Bunlar analiz hatası değil, ZTO Fabrika kodundaki gerçek farklardır. Kopyalanan kodla birlikte taşınırlar; her biri için Faz 1 matrisinde "hangisi esas alınacak" kararı gerekir.

| # | Konu | Farklı uygulamalar | Kaynak |
|---|---|---|---|
| 1 | **Cari bakiye işareti** | `FinancialBalanceSheet`: (Borç − Ödeme) − (Alacak − Tahsilat). `AccountTransaction` ve `FinanceReport`: (Alacak − Tahsilat) − (Borç − Ödeme). İşaret ters. | B, A |
| 2 | **İptal ödemeler** | `AccountTransaction` liste sorguları, `FinanceReport` ve `AccountCredits` `PaymentStatus = 'İptal'` kayıtlarını dışlıyor; `FinancialBalanceSheet` ve `AccountTransaction` kart toplamı dışlamıyor. | A, B, C |
| 3 | **"İş Yeri Firması" carisi eşlemesi** | `FinancialBalanceSheet` iş yerini cariye **ada** göre, `BankStatement` ve ödeme/tahsilat grubu `ReferenceID = WorkPlaceID` ile eşliyor. | B, C |
| 4 | **Banka bakiyesi** | Banka tanıtım sayfası bakiyeyi hareketlerden hesaplıyor (`InitialBalance + Σgiriş − Σçıkış`). `TimeDeposits`, `CreditContracts` ve `PurchaseCurrentAccount` saklı `ZT_BankIntroduction.Balance` kolonunu güncelliyor; ortak `CreateBankTransaction` güncellemiyor. İki yöntem birbirinden habersiz. | A, B, C |
| 5 | **Kur önbelleği** | `TCMBExchangeRateService` kendi önbelleğini kullanıyor; `CustomerAccounts` içindeki `GetExchangeRates` action'ı ayrı bir statik önbellek tutuyor (30 dk başarılı + 5 dk başarısız sonuç). Servis hata durumunda sabit kurlara dönüyor. | A, B, D |
| 6 | **Finans rolünün açılış sayfası** | `AccountController` finans rolünü `/AccountTransaction/AllTransactions`'a, `LanguageController` `/CustomerAccounts/Index`'e yönlendiriyor. | E |
| 7 | **Rol karşılaştırması** | `BankIntroduction`, `CashIntroduction` ve `AccountCredits` rolü `"Finans"` metniyle karşılaştırıyor, oysa oturumdaki değer `Finans(normal)` / `Finans(super)`; bu dallar fiilen çalışmıyor. `FinancialBalanceSheet` doğru çözüyor. | B, C |
| 8 | **Çek durum metni** | Çek sayfası `Bankada`, tahsilat sayfası `Bankaya Yatırıldı` yazıyor. Tahsilat silme çeki/senedi `Bekliyor` yapıyor; bu değer senet durum listesinde yok. | C |
| 9 | **Silme** | Banka/kasa hareketi `Status = false` (yumuşak); borç, alacak, ödeme ve tahsilat fiziksel `DELETE`. Masraf kaydı yumuşak, bağlı cari borcu fiziksel siliniyor. | A, C, D |

### Parçalar arasında doğrulanamayan iki nokta

| Konu | Durum |
|---|---|
| `PaymentApprovalApiController` yetkisi | A parçası "sınıfta yalnız `[Authorize]`, rol özniteliği yok", E parçası "6 rollük `[UserRoleAuthorize]` var" diyor. ⚠ Faz 1 öncesi kaynaktan teyit edilecek. |
| `TransactionType` | D parçası ayrı bir tablo mu olduğunu ayıramadı; B ve C'de banka ve kasa hareketi tablolarında **kolon** olarak geçiyor. ⚠ Şema dökümüyle teyit edilecek. |
| Tablo sınıflandırması | `ZT_ExpenseItems` ve `ZT_ProductionExpenses` bu dosyada "finans çekirdek" sayıldı (K7 tek masraf modelinin temeli). `ZT_OrderExpenses`, `ZT_ProductionSergeantsExpenses`, `ZT_ExpertReportTruckExpenses` "finans dışı" sayıldı. |
