# ENV-E — ZTO Fabrika ORTAK ALTYAPI Keşfi (salt okunur analiz)

Kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` — tek proje `ZtoFabrika.csproj` (net8.0).
Tüm yollar bu köke görelidir. Gizli değerler `__PLACEHOLDER__` ile maskelenmiştir.
"Finans controller'ları" bu belgede şu 33 controller'ı ifade eder: AccountCredits, AccountTransaction, AccountingPurchases, BankAccounts, BankIntroduction, BankStatement, BankTransactions, Bills, CashIntroduction, CashTransactions, CheckBooks, Checks, CreditContracts, Currency, CustomerAccountCollection, CustomerAccountPayment, CustomerAccountReport, CustomerAccounts, CustomerCurrentAccounts, ExpenseItems, ExpenseTypes, Finance, FinanceMaintenance, FinancePerson, FinanceReport, FinancialBalanceSheet, Investments, PaymentApproval, PaymentManagement, PurchaseCurrentAccount, RecipeFinance, TimeDeposits, TransactionType.

NuGet paketleri (`ZtoFabrika.csproj`): AspNetCoreRateLimit 5.0.0, DocumentFormat.OpenXml 2.19.0, DotNetEnv 3.1.1, Extended.Wpf.Toolkit 4.5.0, GoogleAuthenticator 3.2.0, Microsoft.AspNetCore.Mvc.Razor.RuntimeCompilation 8.0.0, Microsoft.EntityFrameworkCore 8.0.0, Microsoft.ML 2.0.1, Microsoft.TypeScript.MSBuild 4.9.5, Newtonsoft.Json 13.0.2, Npgsql.EntityFrameworkCore.PostgreSQL 8.0.0, OpenAI 1.3.0, QRCoder 1.6.0, Swashbuckle.AspNetCore 6.5.0, System.Configuration.ConfigurationManager 7.0.0, System.ServiceModel.* 4.8.x. (Dapper YOK, FluentValidation YOK, sunucu tarafı PDF paketi YOK.)

---

## 1. Kiracı (tenant) mekanizması

### 1.1 `Models/GlobalVeriables.cs` (104 satır, `public static class GlobalVeriables`)

Yorum satırına alınmış eski sunucu varyantları (AWS / OFİS / LOCAL / MAKDOS) dışında AKTİF üyeler:

| Satır | Üye | İçerik (maskeli) |
|---|---|---|
| 24 | `adminDatabase` | `"Server=__PLACEHOLDER__;Port=3333;User Id=postgres;Password=__PLACEHOLDER__;Pooling=true;Timeout=15;Keepalive=30;database=ZTO_ADMIN;Application Name=ZtoFabrika-App;Minimum Pool Size=0;Connection Idle Lifetime=30;Connection Pruning Interval=10"` |
| 26 | `adminServerPostgrePort` | `"3333"` |
| 28 | `adminServerIP` | `__PLACEHOLDER__` (doküman sunucusu varsayılan IP'si) |
| 29 | `adminServerUsername` | `__PLACEHOLDER__` (SMB kullanıcı adı) |
| 30 | `adminServerPassword` | `__PLACEHOLDER__` (SMB şifresi — kaynak kodda düz metin) |
| 31 | `adminServerFileName` | `"FileStorage"` (SMB paylaşım adı) |
| 62-74 | `customerApiDatabase` | `"Server=__PLACEHOLDER__;Port=3333;User Id=postgres;Password=__PLACEHOLDER__;Pooling=true;Maximum Pool Size=20;Minimum Pool Size=0;Connection Lifetime=180;Connection Idle Lifetime=30;Connection Pruning Interval=10;Timeout=15;Command Timeout=60;Keepalive=30;No Reset On Close=true;Enlist=false;database="` — **sonu `database=` ile biter; kiracı DB adı string birleştirme ile eklenir** |
| 78 | `publicDatabase` | `"Server=__PLACEHOLDER__;...;database=ZTO_PUBLIC"` |
| 81 | `restrictionQuery` | `Restriction` LEFT JOIN `UserRestriction` üzerinden rol bazlı kısıt sorgusu şablonu (sonuna `UserRoleID` değeri eklenir) |
| 87 | `qrlink` | `"http://__PLACEHOLDER__/qr/report/"` |
| 94-98 | `RealTime_Data_Input/Output/Garbage` | `Dictionary<int, List<Datas>>` (bellek içi canlı hat verisi) |
| 100, 102 | `status`, `lastRequestTime` | statik durum alanları |

Not: sunucu adresi, DB şifresi ve SMB şifresi **kaynak kodda sabit**; `appsettings.json` içindeki `Default_Connection` yalnız (boş) EF `Context` için kullanılıyor. Yorum bloğu (satır 57-61) önemli bir tasarım notu içerir: `WithActor` kullanıcı adını connection string'e eklediği için Npgsql **her kullanıcıya ayrı havuz** açar.

### 1.2 Kiracı connection string'inin üretimi

`Controllers/AccountController.cs:1032-1034` (master) ve `:1412-1414` (alt kullanıcı):

```csharp
string connStr = !string.IsNullOrEmpty(server)
    ? $"Server={server};Port={port};User Id=postgres;Password={dbPassword};Pooling=true;Database={dbName};"
    : GlobalVeriables.customerApiDatabase + <Customers.DatabaseName>.ToLower();
```

- `Customers.IPAddress` doluysa kiracının **kendi sunucusu** (IPAddress/Port/DbPassword/DatabaseName) kullanılır; boşsa ortak sunucu + `database=<küçük harfli DatabaseName>`.
- Ardından `IntroductionAuditHelper.WithActor(connStr, username)` (`Helpers/IntroductionAuditHelper.cs:41-65`) çağrılır: `ApplicationName="ZtoFabrika"` ve `Options="-c zto.audit_actor=<kullanıcı>"` eklenir, `ConnectionIdleLifetime` 300 ise 60 yapılır. Sonuç **Session `userDatabase`** anahtarına tam connection string olarak yazılır (`:1075-1076`, `:1544-1545`).
- Her istekte `Program.cs:714-722` ara katmanı `userDatabase`'i yeniden `WithActor` ile damgalar.
- Controller'lar `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` ile bağlanır (bkz. Bölüm 2).
- Mobil/harici API tarafı session kullanmaz: `GlobalVeriables.customerApiDatabase + database` (istemcinin gönderdiği `database` parametresi) + `Methods.Authorize(database, token)` (Bölüm 10).

### 1.3 Login akışı (`AccountController`)

**Login GET** (`:100-360`)
1. `TempData["ValidateMessage"]` / `?osBlocked` mesajı gösterilir (`:103-108`).
2. Session `userDatabase` boşsa ve `rememberMe` çerezi `"true"` ise tüm `enc_*` çerezleri `EncryptionService.Decrypt` ile çözülüp session'a geri yazılır (`:111-228`); `CryptographicException` → `DeleteAllCookies()` (`:230-236`).
3. Kullanıcı authenticated + `databaseName` doluysa rol switch'i ile açılış sayfasına yönlendirilir (`:239-356`, bkz. 4.6).

**Login POST** `Login(string username, string password, bool status)` (`:912-1233`)
1. `ClearPending2FASession()` (`:918`); boşluk ve basit karakter filtresi (`'`, `"`, `;`, `--`, `/*`, `xp_`) (`:921-933`).
2. Admin DB'ye bağlan (`:935`).
3. **Master (müşteri) girişi denemesi** (`:965-973`):
   `SELECT "DatabaseName","Language","FactoryName","ID","HKS_Username","HKS_Password","IPAddress","Port","Path","DbPassword","DocumentServerIP","DocumentServerUsername","DocumentServerPassword","DocumentServerFileName","QrKey","Status","EndingDate" FROM public."Customers" WHERE "Username"=@Username AND "Password"=@Password`
   → **şifre düz metin karşılaştırılır** (hash yok; `AccountController`/`UserController` içinde BCrypt/SHA/PasswordHasher izi bulunamadı).
4. Satır varsa: `Status == True` değilse "Sistem tarafından engellendiniz" (`:1125`); `EndingDate` geçmişse "Lisans süreniz … bitmiştir" (`:986-993`); işletim sistemi kısıtı `OperatingSystemAccessService` (`:997-1003`).
5. Claim'ler (`:1005-1011`), 30 günlük persistent auth çerezi (`:1015-1020`), kiracı connStr üretimi (`:1022-1034`), kiracı DB'den `SELECT "Name","Location" FROM public."Factory"` (`:1036`), `SignInAsync` (`:1048`), session (`:1052-1077`), 30 günlük şifreli `enc_*` çerezleri (`:1079-1107`), `userGender` çerezi (`:1110`), `RedirectToAction("Index","Home")` (`:1120`).
6. **Alt kullanıcı girişi** (master satırı yoksa, `:1133-1216`):
   `SELECT "Users"."CustomersID","Users"."UserRoleID","UserRoles"."Role","Users"."Key","Users"."ID","Users"."CookieStatus","Users"."Gender","Users"."PasswordChangeDate" FROM public."Users" LEFT JOIN "UserRoles" ON "Users"."UserRoleID"="UserRoles"."ID" WHERE "Users"."Username"=@Username AND "Users"."Password"=@Password` (`:1135-1138`)
   ardından `SELECT "Status","EndingDate","DatabaseName","Language","FactoryName","IPAddress","Port","Path","DbPassword","DocumentServer*","QrKey" FROM public."Customers" WHERE "ID"=@CustomerID` (`:1148-1150`).
   Status/lisans/OS kontrolleri → **2FA çatalı** (`:1186-1200`) → yoksa `CompleteSubUserLogin(subUserId)` (`:1203`).
7. Hata: `NpgsqlException/TimeoutException/SocketException` → "Veritabanı sunucusuna ulaşılamıyor…" (`:1220-1232`).

**`CompleteSubUserLogin(int userId)`** (`:1344-1751`) — normal ve 2FA sonrası ortak yol:
- `Users`+`UserRoles` ve `Customers` ID ile yeniden okunur, Status/lisans tekrar kontrol edilir (`:1351-1403`).
- Rol `"Finans"` ise kiracı DB'de `SELECT * FROM public."ZT_FinancePerson" WHERE "Key"=@Key` → `SuperStatus == "süper"` ise claim rolü `"Finans(super)"`, değilse `"Finans(normal)"` (`:1417-1435`).
- Rol `"Patron"` ise `ZT_Boss.SuperStatus` → session `bossSuperStatus` (`"süper"`/`"normal"`) (`:1440-1458`); rol adı `"Patron"` kalır.
- `"Kalite Kontrol"` için `ZT_QualityControlPerson.Name` → `factoryName`, `userFullName` (`:1548-1570`).
- Claim, session, çerez, rol bazlı yönlendirme (`:1471-1745`).

**Master / sub-user ayrımı**
- Master = `Customers` satırının kendi `Username/Password`'ü; rol sabit `"Admin"`, `userRole="0"`, `userID="0"`, `customerUserKey=""`.
- Sub-user = `Users` satırı; `Users.Key` kiracı DB'deki rol-personel tablosundaki (`ZT_FinancePerson`, `ZT_Boss`, `ZT_QualityControlPerson`, …) `"Key"` kolonuyla eşleşir (bağlantı anahtarı).

**Claim tiplerinin tam listesi** (`:1005-1011`, `:1471-1477`)

| Claim | Master | Sub-user |
|---|---|---|
| `ClaimTypes.NameIdentifier` | username | username |
| `ClaimTypes.Role` | `"Admin"` | `UserRoles.Role` (Finans → `Finans(super)`/`Finans(normal)`) |
| `"zto:tenant-id"` | `Customers.ID` | `Users.CustomersID` |
| `"zto:account-kind"` | `"master"` | `"sub-user"` |

**Session anahtarlarının tam listesi** (proje genelinde `Session.SetString` taraması)

- Login'de yazılanlar: `IsFirstLoad`, `LicenseEndDate`, `databaseName`, `language`, `factoryName`, `factoryLocation`, `customerID`, `HKS_Username`, `HKS_Password`, `IPAddress`, `Port`, `Path`, `DbPassword`, `DocumentServerIP`, `DocumentServerUsername`, `DocumentServerPassword`, `DocumentServerFileName`, `customerUserName`, `customerUserRole`, `customerUserKey`, `userRole` (= UserRoleID; master "0"), `userID` (= Users.ID; master "0"), `cookie`, `userDatabase`, `customerQrKey`, `redirectPath`; yalnız sub-user: `bossSuperStatus`, `PasswordChangeDate`, `userFullName` (yalnız Kalite Kontrol).
- 2FA: `Pending2FA_UserID`, `Pending2FA_IssuedAt`, `Pending2FA_Username`, `Pending2FA_AuditTenant`, `Pending2FA_AuditTenantName`, `Pending2FA_SetupKey`, `Pending2FA_SetupUserID`, `Pending2FA_IsAccountSwitch`, `Pending2FA_ReturnUrl`.
- Diğer: `assistantStatus`, `customerLogoUrl`, `ledgerQrKey`, `criticalStockShown`, `LicenseWarnDone`, `PaymentInstructionCreated`, `status`, `lastRequestTime`, `VerificationCode`, `TempUsername`, `TempPassword`, `TempEmail`, `TempPhone`.

Dikkat: `customerID` master'da `Customers.ID`, sub-user'da `Users.CustomersID`'dir (`:1058`, `:1530`). `factoryName` sub-user'da `"<username> (<rol>)"` olarak yazılır (`:1524`).

**2FA** (`Services/TwoFactor/*`, paket GoogleAuthenticator 3.2.0)
- Yalnız alt kullanıcılar için; durum `Users.TwoFactorEnabled` / `Users.TwoFactorSecretKey` (`SQL_Migrations/2026_08_20_ZTO_ADMIN_Users_TwoFactor.sql`).
- `Enabled && SecretKey boş` → `ForceSetup2FA` (QR kurulumu), `Enabled && SecretKey dolu` → `Verify2FA` (`:1199`). Bekleyen giriş 15 dk geçerli (`PendingTwoFactorMinutes`, `:1976`). Kolonlar migrate edilmemişse 42703 fallback ile 2FA'sız devam eder (`:1184-1185` yorumu).
- `TwoFactorService`: TOTP doğrulama + `IMemoryCache` tabanlı brute-force kilidi ve replay koruması (`Services/TwoFactor/ITwoFactorService.cs:22-27`).
- Yönetim: `UserController.UpdateTwoFactorStatus` / `UpdateTwoFactorStatusBulk` (`Controllers/UserController.cs:50`, `:101`).

**"Beni hatırla" çerezleri**
- `CookieOptions`: 30 gün, `HttpOnly`, `Secure`, `SameSite=Strict`, `IsEssential` (`:1079-1086`, `:1586-1593`).
- AES şifreli (`Services/EncryptionService.cs` — anahtarlar kaynak kodda sabit, `__PLACEHOLDER__`) çerezler: `enc_databaseName`, `enc_language`, `enc_factoryName`, `enc_factoryLocation`, `enc_customerID`, `enc_HKS_Username`, `enc_HKS_Password`, `enc_IPAddress`, `enc_Port`, `enc_DbPassword`, `enc_DocumentServerIP`, `enc_DocumentServerUsername`, `enc_DocumentServerPassword`, `enc_DocumentServerFileName`, `enc_customerUserName`, `enc_customerUserRole`, `enc_userDatabase` (**tam kiracı connection string'i**), `enc_customerQrKey`; sub-user'da ek: `enc_customerUserKey`, `enc_bossSuperStatus`, `enc_userRole`, `enc_userID`. Düz: `rememberMe="true"`, `userGender`.
- `Login(…, bool status)` parametresi çerez yazımını koşullamıyor; çerezler her başarılı girişte yazılıyor (kodda `status`'a bağlı dal görülmedi).
- Session boş + auth çerezi geçerliyse `Program.cs:647-737` ara katmanı `/Account/Login`'e yönlendirir; Login GET session'ı çerezlerden doldurur.

**SwitchAccount** (`:1239-1314`) — `[HttpPost][Authorize][ValidateAntiForgeryToken]`; içeride `Login(username, password, false)` çağırır, sonucu JSON'a çevirir: `{ success=false, message }` (400) veya `{ success=true, redirectUrl }`. 2FA gerekiyorsa `Pending2FA_IsAccountSwitch` + `Pending2FA_ReturnUrl` yazar. `CancelAccountSwitch` (`:1316-1335`). UI: `Views/Shared/_CustomerSideMenus/_SideMenu_UserSwitchMenuItem.cshtml`, `_SideMenu_UserSwitchModal.cshtml`, `wwwroot/js/layout-account-actions.js`.

**Logout** (`:2130-2163`): `OnlineUsers.Remove`, `Session.Clear()`, `SignOutAsync`, `DeleteAllCookies()`.

### 1.4 Yeni kiracı açılışı (DB oluşturma / şablon)

- **⚠ BULUNAMADI** — kodda, `.sql` ve `.md` dosyalarında `CREATE DATABASE` / `TEMPLATE` ifadesi yok (bin/obj hariç tam tarama).
- `Controllers/OnboardingController.cs` (582 satır) kiracı açılışı DEĞİL; **personel işe giriş/çıkış kontrol listesi**dir (`ZT_Personnel`, `ZT_OnboardingChecklist`, `ZT_OffboardingChecklist`).
- `Controllers/AdminPanelApiController.cs` (61 satır) yalnız `OnlineUsers` ucu sunar (Bölüm 10); kiracı oluşturmaz.
- `AdminPanelApiController` yorumu (`:9-10`) ayrı bir "ZtoAdmin yönetim paneli" uygulamasına işaret eder; kiracı/`Customers` satırı oluşturma muhtemelen o harici panelde — bu repoda yok.
- Kiracı için kodda yapılan tek "ilk kurulum": `HomeController` içinde `wwwroot/Documents/<QrKey>` klasörünün oluşturulması (`Controllers/HomeController.cs:205-221`).

### 1.5 Admin DB (ZTO_ADMIN) tabloları (kodda / SQL'de geçenler)

| Tablo | Kaynak | Görülen kolonlar |
|---|---|---|
| `Customers` | `AccountController.cs:966`, `Methods.cs:198`, `Hubs/ChatIdentity.cs`, `HomeController.cs:209` | `ID`, `Username`, `Password`, `DatabaseName`, `Language`, `FactoryName`, `Status`, `EndingDate`, `HKS_Username`, `HKS_Password`, `IPAddress`, `Port`, `Path`, `DbPassword`, `DocumentServerIP`, `DocumentServerUsername`, `DocumentServerPassword`, `DocumentServerFileName`, `QrKey`, `CustomerKey` (API token), `LogoUrl` (`Helpers/CustomerLogoHelper.cs`), `WebUrl`, `FactoryApiKey` (`SQL_Migrations/2026_08_07_ZTO_ADMIN_Customers_HalIntegration.sql`) |
| `Users` | `AccountController.cs:1136`, `UserController.cs:438,631` | `ID`, `Username`, `Password`, `Key`, `CustomersID`, `UserRoleID`, `CookieStatus`, `Gender`, `PasswordChangeDate`, `Email`, `PhoneNumber`, `TwoFactorEnabled`, `TwoFactorSecretKey`, `CreationDate`, `CreatedBy`, `UpdatedDate`, `UpdatedBy`, `UpdateCount`, `AssistantStatus` (model: `Models/User.cs`) |
| `UserRoles` | `AccountController.cs:1137` | `ID`, `Role`, `CustomerType` (`'ztofabrika'`) |
| `CustomerRoles` | `SQL_Migrations/2026_08_13_CustomerRoles.sql` | `ID`, `CustomersID`, `UserRoleID`, `Status` |
| `Demands` | `AccountController.cs:409` | `Name`, `Surname`, `Email`, `PhoneNumber`, `Status`, `CreationDate` |
| `ZT_AppUpdate` | `AppUpdateStatusWorker.cs`, `HomeController.cs:104-170` | `Version`, `Status` … |
| `ZT_SystemSecurityEvent`, `ZT_SystemHealthSnapshot` | `SQL_Migrations/2026_08_31_ZTO_ADMIN_System_Observability.sql`, `Services/AdminSystem/SystemAuditStore.cs` | güvenlik olayı / sağlık anlık görüntüsü |
| `ZT_OperatingSystem`, `ZT_CustomerOperatingSystem` | `SQL_Migrations/2026_10_07_ZTO_ADMIN_OperatingSystem.sql` | müşteri bazlı OS giriş kısıtı |
| `ZT_RecipeQrTokenMap` | `SQL/2026_10_28_Faz5a_QrTokenMap_ADMIN.sql`, `Helpers/RecipeQrTokenHelper.cs` | kısa UUID → kiracı eşlemesi |
| Destek talepleri / AI tabloları | `Controllers/SupportDemandsController.cs`, `Services/AI/*`, `SQL_Migrations/2026_SupportDemands_Migration.sql`, `SQL_Migrations/AI_Agent_Tables.sql` | hangi DB'de durdukları ayrıca doğrulanmadı |

`Restriction` / `UserRestriction` tabloları **kiracı DB'sindedir** (`HomeController.cs:200`, `:284` — sorgu `userDatabase` bağlantısıyla çalışır), `UserRoleID` ise admin DB'deki `UserRoles.ID`'ye mantıksal referanstır. Kiracı DB'sinde ayrıca `Factory` (`Name`, `Location`) ve `ZT_Setting` (`Name`, `Status`) login sırasında okunur.

ZTO_ADMIN'in tam şeması (CREATE TABLE Customers/Users/UserRoles) repoda **⚠ BULUNAMADI** — yalnız sonradan eklenen kolon/tablo script'leri var.

---

## 2. Veri erişim deseni

- **Ham ADO.NET**: `NpgsqlConnection` + `NpgsqlCommand` / `NpgsqlDataAdapter` + `DataTable`. SQL metni controller action'larının içinde string olarak yazılır.
- **Dapper: yok** (`using Dapper` 0 dosya).
- **EF Core fiilen kullanılmıyor**: `Models/Context.cs` (22 satır) — `DbContext` türevi, **tüm DbSet'ler yorum satırında** (`Admins`, `Customers`, `Demands`; `:15-19`). `Program.cs:218`'de DI'a kaydediliyor ama hiçbir controller/servis `Context` enjekte etmiyor (tek metin geçişi `AccountController.cs:2302`'de bir string.Replace içinde). EF migrations da yok.
- Bağlantı kaynağı: kiracı için `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` (ör. `Controllers/BankTransactionsController.cs:1495`); admin DB için `new NpgsqlConnection(GlobalVeriables.adminDatabase)` (**110 .cs dosyasında**).
- DataTable → model dönüşümü: `Methods.ConvertToList<T>(DataTable)` (reflection ile kolon adı = property adı).
- Transaction: elle `con.BeginTransaction()` + `Commit/Rollback` (ör. `BankTransactionsController.cs:1578`).

### "Warehouse" sınıfları (veri erişim katmanı adlandırması)

Yalnız **yeni yazılan rapor/servis modüllerinde** var, hepsi `Services/` altında:
`Services/Compliance/ComplianceWarehouse.cs`, `Services/FinanceReport/FrWarehouse.cs`, `Services/GeneralSummaryReport/GeneralSummaryReportWarehouse.cs`, `Services/Hks/HksBildirimWarehouse.cs`, `Services/Hks/HksReferenceWarehouse.cs`, `Services/IncomingMaterials/ImWarehouse.cs`, `Services/MaterialLineQualityControl/MaterialLineQcWarehouse.cs`, `Services/NonconformityReport/NcrWarehouse*.cs` (4 partial), `Services/PackagingControlReport/PcrWarehouse.cs`, `Services/PatronPanel/PpWarehouse.cs`, `Services/ProductionReport/ProductionReportWarehouse.cs`, `Services/QualityControlReport/QualityControlReportWarehouse.cs`, `Services/ShipmentLedger/SlWarehouse.cs`, `Services/TwoFactor/UserTwoFactorWarehouse.cs` (+ `IUserTwoFactorWarehouse.cs`).
(Adında Warehouse geçen diğer dosyalar depo modülüdür: `Controllers/WarehouseController.cs`, `Models/ZT/Warehouse.cs` vb.)

**Finans controller'larında Warehouse katmanı YOK** — tek istisna `FinanceReportController` (61 satır): `new FrService(new FrWarehouse()).BuildAsync(con, filter, new FrContext(...), …)` (`Controllers/FinanceReportController.cs:48`). Diğer 32 finans controller'ında SQL doğrudan controller içinde. Büyüklükler (satır / `new NpgsqlConnection` adedi):

| Controller | Satır | Bağlantı | | Controller | Satır | Bağlantı |
|---|---|---|---|---|---|---|
| AccountTransaction | 9420 | 52 | | CashTransactions | 1536 | 11 |
| CreditContracts | 7018 | 33 | | TimeDeposits | 1492 | 10 |
| CustomerAccounts | 6753 | 40 | | Bills | 1485 | 10 |
| BankStatement | 6484 | 27 | | Investments | 1464 | 9 |
| CustomerAccountCollection | 5046 | 19 | | CashIntroduction | 1161 | 11 |
| CustomerAccountPayment | 4913 | 21 | | RecipeFinance | 970 | 11 |
| Checks | 3725 | 12 | | BankAccounts | 718 | 7 |
| PurchaseCurrentAccount | 2562 | 16 | | ExpenseItems | 656 | 9 |
| AccountingPurchases | 2245 | 17 | | FinanceMaintenance | 645 | 2 |
| BankTransactions | 2214 | 16 | | FinancePerson | 555 | 6 |
| PaymentManagement | 2059 | 18 | | CheckBooks | 550 | 5 |
| FinancialBalanceSheet | 1776 | 3 | | Currency | 538 | 7 |
| PaymentApproval | 1653 | 16 | | CustomerAccountReport | 527 | 6 |
| BankIntroduction | 1604 | 15 | | ExpenseTypes | 501 | 8 |
| | | | | CustomerCurrentAccounts | 490 | 3 |
| | | | | AccountCredits | 430 | 4 |
| | | | | TransactionType | 228 | 5 |
| | | | | Finance | 211 | 2 |

Finansla ilgili yardımcı servisler: `Services/FinanceReport/*` (FrAccess, FrLedger, FrService, FrSql, FrTypes, FrWarehouse, SalesFinance), `Services/PaymentPlanHelper.cs`, `Services/ITCMBExchangeRateService.cs`, `Helpers/OfficialSalesCreditRemover.cs`, `Models/ZT/AccountTransactionQueries.cs`.

### `Controllers/Methods.cs` (499 satır, `static class Methods`)

| Satır | Metot | Açıklama |
|---|---|---|
| 12-13 | `Key`, `IV` sabitleri | AES anahtar/IV kaynak kodda sabit (`__PLACEHOLDER__`) |
| 15 | `ConvertToList<T>(DataTable)` | DataTable satırlarını reflection ile `List<T>`'ye çevirir |
| 66 | `ConvertToListParallel<T>(DataTable)` | Aynısının paralel sürümü |
| 194 | `Authorize(string database, string token)` | API yetkilendirme: admin DB'de `Customers` `CustomerKey=@token AND DatabaseName=@database` |
| 212 | `GetDirectories(string path)` | Klasör ağacı listesi (`DirectoryItem`) |
| 274 / 298 | `Encrypt` / `Decrypt` | AES şifreleme (hex) |
| 323 | `ConvertHexStringToByteArray` | yardımcı |
| 334 | `LogAdd(Log log, NpgsqlConnection con)` | Kiracı `Log` tablosuna parametreli INSERT (Bölüm 7) |
| 404 | `LogProcessClass(process)` | Log işlem metnini add/edit/del/other sınıfına indirger |
| 437 | `LogRoleAccent(userRole)` | Rol → vurgu adı |
| 465 | `LogPlatformClass(platform)` | Platform sınıfı |
| 477 | `LogInitial(value)` | Baş harf |
| 493 | `NormalizeSpyDeviceNo(value)` | Casus cihaz no normalizasyonu |

### Ortak base controller

**Yok.** `Controllers/` ve `ApiController/` altındaki tüm sınıflar doğrudan `Controller` / `ControllerBase`'ten türer; `abstract class` bulunamadı. Ortak davranış öznitelikler (`[Authorize]`, `[UserRoleAuthorize]`, `[RequireFinancePersonnel]`), global filtre (`SecurityAuditFilter`) ve statik yardımcılarla sağlanıyor. Sonuç: her action kendi `try/catch` + bağlantı açma + rol/kapsam okuma kodunu tekrarlar.

---

## 3. Migration yöntemi

- **EF migrations: yok** (`MigrationBuilder`, `ModelSnapshot` taraması boş).
- **Otomatik runner: yok.** `.sql` dosyalarını okuyup çalıştıran kod bulunamadı; script'ler **elle** uygulanır. Kanıt: `Services/OperatingSystemAccess/OperatingSystemAccessService.cs:9` "ZTO_ADMIN DDL'i elle uygulandığı için…"; script başlıklarındaki "ADMIN veritabanında çalıştırılır — tenant DB'de DEĞİL" (`SQL_Migrations/2026_08_13_CustomerRoles.sql:3`), "Veritabanı: Her ZTO Fabrika tenant veritabanı … Additive + idempotent" (`SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql:3-4`).
- Kod, script uygulanmamış DB'ye karşı **toleranslı** yazılıyor: `42P01` / `42703` (UndefinedTable/UndefinedColumn) yakalama deseni **28 .cs dosyasında**.

### Klasörler

| Klasör | İçerik | Rol / adlandırma |
|---|---|---|
| `SQL_Migrations/` | 64 .sql | Ana migration klasörü. `YYYY_MM_DD_<Konu>.sql`; hedef DB ad içinde: `…_ZTO_ADMIN_…` (admin), `…_Tenant` (kiracı). Eski dosyalar `2026_<Konu>_Migration.sql`. Seed/Doğrulama/Backfill ekleri (`_Seed`, `_Dogrulama`, `_SoftDelete`). |
| `SQL/` | 17 .sql | Daha yeni tarihli (2026_10_23 → 2026_10_28) migration + seed + rollback + indeks script'leri; `…_ADMIN` / `…_TENANT` eki. `KrediBankaCari_Migration.sql` burada. |
| `Migrations/` | 2 .sql | `2026_09_08_ZT_CasusCihaz.sql`, `2026_09_09_SpyTruckNo_Normalize.sql` (EF değil, düz SQL). |
| `_migrations/` | 1 .sql + 1 .md | `ZT_ExpertReportTruckGardenRevision.sql`, `BAHCE_URUN_GIRISI_DEGISTIR.md`. |
| `Docs/` | 152 .sql / 217 dosya | Faz bazlı migration, DEMO seed, düzeltme ve teşhis script'leri + .md tasarım notları. Alt klasörler: `Bahce`, `CustomerAccounts`, `Drencher…`, `ForkliftCasting`, `MaterialLosses`, `MaterialStockAll`, `OutOfUse`, `PesticideStockAll`, `ProductionLedger`, `QrSurvey`, `ReceteliUretim`, `SalesProduct`, `Uyumsoft`, `Warehouse`. Finansla ilgili: `Docs/CustomerAccounts/`, `Docs/2026_PERF_CariHesaplarIndeksleri.sql`, `Docs/2026_Faz61H_Checks_LastBankID.sql`, `Docs/2026_SalesTruckDebtLog.sql`. |
| Proje kökü | 5 .sql | `Check_AccountDebts_WorkPlace_Mismatch.sql`, `Check_MaterialStock_vs_Invoices.sql`, `db_performance_indexes.sql`, `ProductMovementsReport_Index_Optimizasyon.sql`, `ZT_MaterialLossDetail.sql`, `ZT_MaterialUsageFormula_Create.sql`. |
| `plesk-deploy/` | 1 dosya | `web.config.MAINTENANCE_TEMPLATE` (SQL yok). |

### Çalışma zamanında DDL çalıştıran kod

`CREATE TABLE IF NOT EXISTS` → **16 .cs dosyası**; `ADD COLUMN IF NOT EXISTS` → **8 .cs dosyası**; ikisinden en az biri → **17 .cs dosyası** (.cshtml'de 0). Dosya bazında eşleşme sayıları (CREATE TABLE/ADD COLUMN/CREATE INDEX IF NOT EXISTS):
`Controllers/UyumsoftController.cs` 28, `Controllers/GardenController.cs` 25, `Controllers/RecipeProductionController.cs` 12, `Services/MaterialLineQualityControl/MaterialLineQcSchema.cs` 8, `Helpers/QualitySchema.cs` 7, `Helpers/ComplianceSchema.cs` 7, `Services/Uyumsoft/UyumsoftInboxService.cs` 4, `Controllers/RecipeSalesController.cs` 3, `Services/ProductionQc/PqcSchema.cs` 2, `Controllers/SalesProductLogisticController.cs` 2, `Controllers/RecipeGoodsController.cs` 2, ve birer adet: `Services/DrencherTracking/ReportDocumentStore.cs`, `WeighbridgeController`, `ProductionConveyorController`, `OrderHeaderController`, `FinanceMaintenanceController`, `AccountTransactionController`.

Finans controller'larındaki örnekler (yalnız 2 adet):
- `Controllers/FinanceMaintenanceController.cs:574` — `CREATE TABLE IF NOT EXISTS public."ZT_AccountDebtsDeleteLog" (…)`
- `Controllers/AccountTransactionController.cs:7281` — `CREATE TABLE IF NOT EXISTS public."ZT_SalesTruckDebtLog" (…)`

Yeni modüllerde desen "`*Schema.EnsureAsync`" sınıfıdır (`Helpers/QualitySchema.cs`, `Helpers/ComplianceSchema.cs`, `Services/ProductionQc/PqcSchema.cs`) ve aynı ifadeler `SQL_Migrations/` içinde de tutulur.

### Tenant DB'nin tam şema dökümü

**⚠ BULUNAMADI.** Repoda `pg_dump` çıktısı / tek dosyalık tam şema yok (`Docs/`, `plesk-deploy/`, kök, `tests/`, repo kökü `docs/` tarandı; 100 KB üstü .sql dosyası yok; `pg_dump` kelimesi yalnız 3 demo veri temizlik script'inde ve prompt .md'sinde geçiyor).
- Tüm .sql dosyalarındaki ayrık `CREATE TABLE` adı sayısı ≈ 210; bunlar yalnız 2026 içinde eklenen tablolardır. Çekirdek finans tabloları (`ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_CashIntroduction`, `ZT_CashTransactions`, `ZT_Checks`, `ZT_Bills`, `ZT_FinancePerson`, `Currency` …) için CREATE TABLE repoda yok.
- En yakın kısmi kaynaklar: `tests/FinanceReportChecks/fixture/01_schema.sql` (52 satır, 17 CREATE TABLE — rapor için asgari şema), `tests/PatronPanelChecks/fixture/10_panel_schema.sql` (168 satır), model sınıfları (`Models/ZT/*.cs`, 141 dosya) ve controller'lardaki INSERT/SELECT kolon listeleri.
- **Sonuç: kopyalama için şemanın canlı bir kiracı DB'sinden `pg_dump --schema-only` ile alınması gerekir.**

---

## 4. Yetki / rol

### 4.1 Rol modeli

- `Models/UserRoles.cs` — `ID`, `Role` (admin DB `UserRoles`; SQL'de ayrıca `CustomerType` kolonu, değer `'ztofabrika'`).
- `Models/User.cs` — admin DB `Users`: `Username`, `Password`, `Key`, `CustomerID`, `UserRoleID`, `Role`, `Email`, `PhoneNumber`, doğrulama alanları, `Gender`, `PasswordChangeDate`, `TwoFactorEnabled`, `TwoFactorSecretKey`, audit alanları (`IAuditableIntroduction`).
- `Models/Security.cs` — yalnız şifre değiştirme formu (`OldPassword`, `NewPassword`, `NewPassword2`); rol modeli değil.
- `SQL_Migrations/2026_08_13_CustomerRoles.sql` — admin DB `CustomerRoles(CustomersID, UserRoleID, Status)`: müşteriye hangi rollerin "tanıtıldığı"; user/add ve user/edit rol dropdown'u `Status=true` olanlarla sınırlanır. Seed: `CustomerType='ztofabrika'` tüm roller × tüm müşteriler.
- Rol **tek string claim**'dir (`ClaimTypes.Role`); izin (permission) tablosu yok. Ek ince ayar: kiracı `Restriction`/`UserRestriction` (rol bazlı ekran/kart kısıtı, `GlobalVeriables.restrictionQuery`) ve kiracı `ZT_Setting`.
- Her rolün kiracı DB'sinde bir "personel" tablosu vardır ve `Users.Key` ↔ `<tablo>.Key` ile bağlanır: `ZT_FinancePerson` (+`SuperStatus`, `WorkPlaceID`, `BranchProvinceID`), `ZT_Boss` (+`SuperStatus`), `ZT_AccountingPurchases`, `ZT_LogisticsPerson`, `ZT_ProductionManager`, `ZT_AcceptanceOfGoods`, `ZT_QualityControlPerson`, `ZT_PurchasingPerson`, `ZT_SalesPerson`, `ZT_ShipmentPerson`, `ZT_Expert`, `ZT_ExpertChef`, `ZT_EntranceWeigher`, `ZT_ForkliftOperator`, `ZT_CastingOperator`, `Operator`.

### 4.2 Rollerin tam listesi (`[UserRoleAuthorize(...)]` içinde geçen değerler, kullanım adedi)

`Admin` 496, `Patron` 298, `Üretim Müdürü` 248, `Mal Kabul` 151, `Kalite Kontrol` 141, `Finans(super)` 125, `Muhasebe (Alış)` 119, `Finans(normal)` 116, `Satış Personeli` 101, `Sevkiyat` 89, `Lojistik` 83, `Operatör` 50, `Eksper` 39, `Eksper Şefi` 30, `Satınalma` 26, `Dış Kantar` 14, `Ziraat Mühendisi` 4, `Bahçe Yönetim` 4, `Bahçe Operasyon` 4, `Finans` 3, `Forklift Operatörü` 1, `Döküm Operatörü` 1, `Satışa Aç` 1.

Notlar: DB'deki rol adı `Finans`'tır; login'de `Finans(super)` / `Finans(normal)` olarak claim'e yazılır (`AccountController.cs:1432`). `Admin` rolü DB'de satır değil, master hesabın sabit rolüdür.

### 4.3 Yetki bileşenleri

| Dosya | Ne yapar | Finans tarafında kullanım |
|---|---|---|
| `Services/UserRoleAuthorizeAttribute.cs` (global namespace) | `AuthorizeAttribute + IAuthorizationFilter`. Authenticated değilse `/Account/Login`; rol claim'i listede yoksa `/Auth/Permission`. `AllowedRoles`, statik `Allows(Type controller, string action, string? role)` (menü için yansıma ile sorgu). Karşılaştırma birebir (ordinal). | 33 finans controller'ının 30'unda sınıf düzeyinde. **Sınıf düzeyinde `[Authorize]`/`[UserRoleAuthorize]` OLMAYANLAR: `AccountCreditsController`, `CheckBooksController`, `CustomerAccountReportController`**. Action düzeyi ek kullanım: PaymentManagement (19), PurchaseCurrentAccount (11), AccountingPurchases (4). |
| `Services/RequireFinancePersonnelAttribute.cs` | `FinanceAccess.MaySeeFinance(HttpContext)` false ise `/Auth/Permission`. Yalnız Patron'u daraltır. | `BankIntroductionController`, `CashIntroductionController`, `CustomerAccountsController`, `FinanceReportController` (sınıf düzeyi). |
| `Helpers/FinanceAccess.cs` | Kural: `Finans*` ve `Admin` her zaman; `Patron` yalnız kiracıda `ZT_FinancePerson` satırı varsa; diğer roller `MaySeeFinance`=true (controller listesi sınırlar), `MaySeeFinanceMenu`=false. `HasFinancePersonnel` istek başına `HttpContext.Items` önbellekli. | `FinanceReportController`, `Services/FinanceReport/FrAccess.cs`, `Views/CustomerAccounts/Index.cshtml`, `Views/Shared/_Layout.cshtml:23`, ayrıca `PatronActivityController`, `ReportController`. |
| `Helpers/FinanceRoleHelper.cs` | `IsSuperUser(ctx)`: `Finans(super)` → true; `Finans(normal)`/`Finans` → `ZT_FinancePerson.SuperStatus=='süper'`; diğer tüm roller → true; hata → false. (Süper olmayan finans kullanıcısı "Personel" cari grubunu göremez.) | `FinanceReportController`, `Services/FinanceReport/FrTypes.cs`, `_SideMenu_FinanceItems.cshtml`, `_SideMenu_Finance_Financial.cshtml`. `CustomerAccountsController.Index` aynı mantığı kendi içinde tekrar eder. |
| `Helpers/PersonnelScope.cs` | Saf yardımcı: `Id(object)` (WorkPlaceID/BranchProvinceID → int; 0 = tümü), `Filter(branchId, workPlaceId, wpColumn, branchColumn)` SQL WHERE eki. | Finans controller'larında **kullanılmıyor** (kullananlar: ExpertChef, ProductionConveyor, User, Weighbridge). Finans controller'ları iş yeri/şube kapsamını `ZT_FinancePerson` satırından elle okuyup SQL'e kendisi ekliyor (ör. `BankTransactionsController.cs:98-139`). |
| `Helpers/ReportScope.cs` | `Condition(wpColumnExpr, roleWp, roleBp)` rapor kapsam koşulu; `ResolveUserScope(con, userKey)` rol tablolarını sırayla tarar (`UserScopeTables`: ProductionManager, AcceptanceOfGoods, AccountingPurchases, QualityControlPerson, LogisticsPerson, **FinancePerson**, PurchasingPerson, Boss); `ForQualityReport`. | `FinanceReportController`, `Services/FinanceReport/FrSql.cs`, `FrWarehouse.cs`. |
| `Controllers/AuthController.cs` (12 satır) | Tek action `Permission()` → `Views/Auth/Permission.cshtml` ("yetkiniz yok" sayfası). `AccountController.AccessDenied` de buraya yönlendirir (`:51-54`). | Tüm yetki reddi yönlendirmelerinin hedefi. |

Finans controller'larında **kapsam (WorkPlace/Branch) deseni**: Index action'ı `customerUserKey` ile rol tablosunu (Finance/AccountingPurchases/Logistics/Patron) sorgular, `ViewData["FinanceID"]`, `["AccountingPurchasesID"]`, `["LogisticsPersonID"]`, `["PatronID"]` ("0" = değil) doldurur; view bunlara göre layout ve menü partial'ı seçer (bkz. Bölüm 5).

### 4.4 Finans controller'larının rol listeleri (sınıf düzeyi)

- `Admin`: Currency, ExpenseItems, ExpenseTypes, FinancePerson, TransactionType.
- `Finans(normal)`, `Finans(super)`: Finance.
- `Patron, Admin, Finans(normal), Finans(super)`: BankIntroduction (+RFP), CashIntroduction (+RFP), FinanceMaintenance, FinanceReport (+RFP).
- `… + Muhasebe (Alış)`: BankAccounts, BankStatement, CreditContracts, Investments, PaymentApproval, PurchaseCurrentAccount, TimeDeposits, AccountingPurchases; FinancialBalanceSheet (+`Finans`).
- `… + Muhasebe (Alış) + Satış Personeli`: AccountTransaction, BankTransactions, Bills, CashTransactions, Checks, CustomerAccountCollection, CustomerAccountPayment, PaymentManagement.
- CustomerAccounts: `Patron, Admin, Muhasebe (Alış), Finans(normal), Finans(super), Lojistik, Üretim Müdürü` (+RFP).
- CustomerCurrentAccounts: `Satış Personeli, Admin, Patron, Finans(normal), Finans(super)`.
- RecipeFinance: `Admin, Patron, Muhasebe (Alış), Finans(normal), Finans(super), Lojistik`.
(RFP = `[RequireFinancePersonnel]`)

### 4.5 Giriş sonrası rol bazlı yönlendirme

`AccountController` — Login GET (`:245-356`) ve `CompleteSubUserLogin` (`:1637-1745`) aynı tablo:

| Rol | Hedef |
|---|---|
| Admin | `/Home/Index` |
| Eksper | `/ExpertReport/Index` |
| Satış Personeli | `/OrderHeader/Index` |
| Üretim Müdürü | `/ProductionPlanning/Index` |
| Patron | `/PatronActivity/Index` |
| Mal Kabul | `/Weighbridge/Purchases` |
| Dış Kantar | `/WeighingEmptyFull/Index` |
| Eksper Şefi | `/ExpertChef/Index` |
| Kalite Kontrol | `/QualityAndAnalys/ExpertReport` |
| Muhasebe (Alış) | `/AccountingPurchases/AllTruck` |
| **Finans(super) / Finans(normal)** | **`/AccountTransaction/AllTransactions`** |
| Lojistik | `/SalesProductLogistic/Index` |
| Forklift Operatörü | `/ForkliftPanel/Index` |
| Döküm Operatörü | `/CastingPanel/Index` |
| Sevkiyat | `/SalesProduct/Index` |
| Operatör | `/RecipeOperator/Index` |
| Ziraat Mühendisi / Bahçe Operasyon / Bahçe Yönetim | `/Garden/Index` |
| diğer | `/Home/Index` |

Seçilen yol session `redirectPath`'e de yazılır. **Reçeteli mod override** (`RecipeRedirectOverride`, `:62-96`): kiracı `ZT_Setting` `Name='Reçeteli Üretim'` `Status=true` ise Satış Personeli → `/recipesales/index`, Kalite Kontrol → `/recipegoods/index`, Lojistik/Sevkiyat → `/recipesales/shipments`, Mal Kabul → `/recipepurchasing/receiving`, Muhasebe (Alış) → `/AccountTransaction/AllTransactions`, Üretim Müdürü → `/recipeproduction/index`, Patron → `/receiptpatronactivity/index`, Satınalma → `/recipepurchasing/orders`, Operatör → `/recipeoperator/index`.

`LanguageController.ChangeLanguage(culture)` (`Controllers/LanguageController.cs:16-130`): kültür çerezini yazar (`CookieRequestCultureProvider`, 1 yıl), rolü admin DB'den `Users`+`UserRoles` ile okur (dolayısıyla ham `"Finans"` adını görür), reçeteli mod override'ı (`:48-73`), sonra rol switch'i: Muhasebe (Alış) → `AccountingPurchases/AllTruck` (`:113`), **`Finans` → `CustomerAccounts/Index`** (`:115-117`, Account'taki hedeften farklı), Lojistik → `SalesProductLogistic/Index`, diğerleri AccountController ile aynı; varsayılan `Home/Index`.

`HomeController.Index` (`Controllers/HomeController.cs:83-91`): `[UserRoleAuthorize("Admin","Patron")]`; Patron → `PatronActivity/Index`; `AdminSystemPolicy.Allows` → `View("SystemAdmin")`; aksi halde üretim genel görünümü. Controller sınıf düzeyi `[Authorize]` (`:23`); `Error` action'ı `[AllowAnonymous]` (`:497-501`).

### 4.6 AdminSystem / Diagnostics / ChatHub (kısa özet)

- **`AdminSystemPolicy`** (`Services/AdminSystem/AdminSystemModels.cs:5-17`): `Name="SystemAdmin"`. Kural: authenticated + `NameIdentifier == "ztodemo"` (büyük/küçük harf duyarsız) + `IsInRole("Admin")` + `zto:account-kind` null/boş/`master` + session `userID=="0"` ve `userRole=="0"`. Yani yalnız ZTO'nun kendi master hesabı. `Program.cs:632-640` `/AdminSystem` yolunu ayrıca 401/403 ile keser.
- **`AdminSystemController`** (151 satır, `[Authorize(Policy=…)]`, `[Route("AdminSystem/[action]")]`): JSON uçları `Overview`, `Tenants`, `History`, `SecurityEvents`, `Incidents`, `OnlineUsers`, `LocalizationCoverage`.
- **`Services/AdminSystem/*`**: `SecurityAuditFilter` (global `IAsyncActionFilter`; giriş/2FA olaylarını sabit kodlara çevirip `SystemAuditStore`'a yazar), `SystemAuditStore` (admin DB `ZT_SystemSecurityEvent`/`ZT_SystemHealthSnapshot`; startup DDL yok), `SystemMetrics` (bellek içi istek/DB ölçümleri), `SystemMonitorWorker` (10 sn'lik BackgroundService, sağlık skoru), `LocalizationCoverage` (view'lardaki Localizer anahtarlarını resx ile karşılaştırır; `Cultures` dizisi burada).
- **`Services/Diagnostics/RuntimeDiagnostics.cs`** (668 satır): `DiagnosticsLog` (dosya logu), `DiagContext`, `OnlineUsers`, `SystemMetricsMiddleware`, `GlobalExceptionLoggingMiddleware` (`:447`), `ClosedRedirectDiagnosticsMiddleware`, `DbSaturationDiagnosticsWorker` (`:607`, 30 sn). Okuma ucu: `GET /admin-system/diagnostics?n=` (`Program.cs:819-821`, AdminSystemPolicy).
- **`Hubs/ChatHub.cs`** (1693 satır, `[Authorize]`, `/chatHub`): sohbet (lot bazlı oda + genel sohbet), yazıyor bildirimi, mesaj silme, WebRTC sinyalleşme (CallUser/AcceptCall…), bildirim zili grubu (`UserNotificationService.GroupFor`), canlı ekran izleme (`[Authorize(Roles="Admin,Patron")]` JoinLiveMonitorGroup/StartWatching…). SignalR `MaximumReceiveMessageSize` 12 MB.
- **`Hubs/ChatIdentity.cs`** (106 satır): `IChatTenantDirectory` / `AdminChatTenantDirectory` — hub kimliği session'dan değil **claim'lerden** (`zto:tenant-id`, NameIdentifier, Role) + admin DB (`Customers.DatabaseName`, `Users.ID`) çözülür, 10 dk `IMemoryCache`. `ChatCaller` kaydı.

---

## 5. Layout ve menü

### 5.1 `Views/Shared/` içeriği

**Layout'lar:** `_Layout.cshtml` (2909 satır, Admin/master), `_ProductionLayout.cshtml` (4005), `_ExpertLayout.cshtml` (1934), `_OrdersLayout.cshtml` (1726), `_OldLayout.cshtml` (1515), `_ReportLayout.cshtml` (30), `_ModalFrameLayout.cshtml` (24); `_Layout.cshtml.css`.

**Sayfalar:** `Error.cshtml`, `LanguageSelection.cshtml`.

**Partial'lar:** `_AddAbsenceModal`, `_AddAssetModal`, `_AddPaymentModal`, `_AddTruckCompleteModal`, `_AllTransactionsPaymentTools`, `_AnalysResultsModal`, `_AppUpdateNotifier`, `_CheckLeafGuard`, `_ConnectionMonitor`, `_CreditDashboardWidget`, `_CriticalStockModal`, `_DataTablesScriptsPartial`, `_DefinitionDetailsModal`, `_DefinitionHubLink`, `_DefinitionNav`, `_DefinitionNavMenu`, `_DefinitionRoleMenu`, `_EditPaymentModal`, `_HKSStatusBadge`, `_IntroductionAuditCell`, `_IntroductionAuditCellCompact`, `_IntroductionAuditPanel`, `_LicenseWarning`, `_OrderHeaderPlaceModals`, `_OrderStatusModal`, `_PalletDetailsModal`, `_PalletMergeModals`, `_PasswordChangeModal`, `_PaymentManagementMenu`, `_PlateEditModal`, `_PostPaymentPlanningModal`, `_PwaHead`, `_PwaInstallMenuItem`, `_QcRangePrintModal`, `_QualityControlPageKit`, `_RcpLocPicker`, `_ReportFilterBar`, `_ReportHeader`, `_SidebarModeMenuItem`, `_SidebarModeScripts`, `_SpecialDayNavBadge`, `_SpyDeviceModal`, `_StaleProductionNotify`, `_StatFilterCards`, `_SupportDemandsModal`, `_SystemAdminLiveWatch`, `_TicketNoModal`, `_Truck3DModal`, `_UserNotifications`, `_UyumsoftInvoiceListTools`, `_UyumsoftSalesListTools`, `_UyumsoftTransferModal`, `_ValidationScriptsPartial`, `_WhSearchSelect`, `_ZtBackButton`, `_ZtoAssistant`.

**Alt klasörler:**
- `Components/IntroductionAudit/Default.cshtml`
- `_CustomerSideMenus/` (33 dosya): `_SideMenu_{AcceptanceOfGoods, AccountingPurchases, Assets, BahceOperasyon, BahceYonetim, CastingOperator, Default, EntranceWeigher, ExpertChef, Finance, FinanceItems, Finance_Financial, ForkliftOperator, Garden, LogisticsPerson, Operator, Patron, ProductionManager, Purchasing, QualityControl, SalesPerson, Shipment, ZiraatMuhendisi}`, reçeteli varyantlar `_SideMenu_Recipe_{AcceptanceOfGoods, AccountingPurchases, Finance, LogisticsPerson, ProductionManager, QualityControl, SalesPerson, Shipment}`, `_SideMenu_UserSwitchMenuItem`, `_SideMenu_UserSwitchModal`.
- `_CustomerAccountNavMenus/` (12 dosya): `_NavMenu_{AcceptanceOfGoods, AccountingPurchases, Default, EntranceWeigher, ExpertChef, Finance, Finance_Financial, LogisticsPerson, Patron, ProductionManager, QualityControl, SalesPerson}`.

### 5.2 `_ViewStart` / `_ViewImports`

- `Views/_ViewStart.cshtml`: `Layout = "_Layout";` (varsayılan).
- `Views/_ViewImports.cshtml`: `@using ZtoFabrika`, `@using ZtoFabrika.Models`, `@using Microsoft.AspNetCore.Http`, `@using Microsoft.AspNetCore.Mvc.ViewFeatures`, `@namespace ZtoFabrika.Views`, `@addTagHelper *, Microsoft.AspNetCore.Mvc.TagHelpers`, `@using Microsoft.AspNetCore.Mvc.Localization`, **`@inject IViewLocalizer Localizer`** (tüm view'larda `Localizer["…"]` hazır).

### 5.3 Finans sayfalarının layout'ları

Layout **view içinde, role göre koşullu** seçilir. Örnek `Views/BankTransactions/Index.cshtml:1-26`:

```cshtml
@inject ZtoFabrika.Services.IMenuDesignService _menuDesignService
if (ViewData["FinanceID"] != "0")                 Layout = "~/Views/Shared/_ProductionLayout.cshtml";
else if (ViewData["AccountingPurchasesID"] != "0") Layout = "~/Views/Shared/_ProductionLayout.cshtml";
else if (ViewData["LogisticsPersonID"] != "0")     Layout = "~/Views/Shared/_ProductionLayout.cshtml";
else if (ViewData["PatronID"] != "0")              Layout = "~/Views/Shared/_ProductionLayout.cshtml";
else                                               Layout = "~/Views/Shared/_Layout.cshtml";   // Admin
```

Finans view'larında (93 view) görülen layout'lar:
- **`_ProductionLayout.cshtml`** — rol kullanıcıları (Finans, Muhasebe, Patron, Lojistik) için baskın layout (AccountTransaction, BankTransactions, CashTransactions, Bills, Checks, CreditContracts, CustomerAccountCollection/Payment, CustomerAccounts, BankIntroduction, CashIntroduction, FinancialBalanceSheet, PaymentApproval, FinanceMaintenance, CustomerAccountReport …).
- **`_Layout.cshtml`** — Admin (master) görünümü; ayrıca Layout atamayan tanım sayfaları (`Currency`, `ExpenseItems`, `ExpenseTypes`, `FinancePerson`, `TransactionType`) `_ViewStart` üzerinden bunu kullanır.
- **`_ExpertLayout.cshtml`** — `PaymentManagement` (4/4), `RecipeFinance` (4/4), `PurchaseCurrentAccount`, `CheckBooks`, ve BankIntroduction/CashIntroduction/BankAccounts/Investments/TimeDeposits/CustomerAccounts'ın Add/Edit/Detail sayfaları.
- **`_ModalFrameLayout.cshtml`** — `CustomerAccounts` modal modu (`_isModalMode ? _ModalFrameLayout : _ExpertLayout`).
- **`_ReportLayout`** — `FinanceReport/Index` (menüsüz, yazdırılabilir, jQuery/Bootstrap/DataTables içermez).
- **`Layout = null`** — yazdırma çıktıları (AccountTransaction, BankStatement, CashTransactions içinde birer view).

### 5.4 Menü üretimi

- Merkezi/veri tabanlı bir menü sistemi **yok**; menü **rol başına ayrı partial** dosyalarıyla, sabit HTML olarak üretilir.
- **Admin menüsü** `_Layout.cshtml` içine gömülüdür (finans tanım linkleri: `:795` customercurrentaccounts, `:918` AccountingPurchases/AccountingIndex, `:922` FinancePerson, `:1166` cashintroduction, `:1174` bankintroduction, `:1195` ExpenseTypes, `:1201` ExpenseItems, `:1212` customeraccounts, `:1229` transactiontype, `:1268` currency). `showCustomerAccountsLink = FinanceAccess.MaySeeFinanceMenu(Context)` (`:23`). `CompactAdminSidebarHelper.IsEnabled(Context)` (`:16`) yalnız master Admin'e ikonlu "rail" sidebar açar.
- **Rol menüleri**: her finans view'ı rolüne göre partial çağırır; ör. `BankTransactions/Index.cshtml:93` `@await Html.PartialAsync("~/Views/Shared/_CustomerSideMenus/_SideMenu_Finance.cshtml", "banktransactions/index")` (model = aktif sayfa kimliği), `:97` `_SideMenu_Patron.cshtml`.
- **`MenuDesignService`** (`Services/MenuDesignService.cs`): kiracı `ZT_Setting` `'Menü Tasarımı'` ayarını okur → `IsSidebarMenuAsync(connStr)`: true = sol sidebar (`_CustomerSideMenus/*`), false = üst nav-tabs (`_CustomerAccountNavMenus/*`). View'lara `@inject` edilir.
- **Reçeteli mod**: `_SideMenu_Finance.cshtml:6-26` kiracı `ZT_Setting` `'Reçeteli Üretim'` açıksa `_SideMenu_Recipe_Finance.cshtml`'e delege eder (partial içinde doğrudan Npgsql sorgusu var).
- `UyumsoftMenuHelper` e-Dönüşüm menü öğelerini `ZT_Setting`'e göre gizler.

### 5.5 Finans menüsünün tanımlandığı dosya ve linkler

Zincir: `_SideMenu_Finance.cshtml` (57 satır, kabuk + başlık "FİNANS İŞLEMLERİ") → **`_SideMenu_FinanceItems.cshtml`** (333 satır, asıl öğe listesi) → `_SideMenu_UserSwitchMenuItem.cshtml`. Varyantlar: `_SideMenu_Finance_Financial.cshtml` (339), `_SideMenu_Recipe_Finance.cshtml` (195), üst-nav: `_NavMenu_Finance.cshtml` (81), `_NavMenu_Finance_Financial.cshtml` (51); ödeme yönetimi alt menüsü `_PaymentManagementMenu.cshtml` (216, `Url.Action` ile).

`_SideMenu_FinanceItems.cshtml` içindeki tüm linkler (satır):
`/FinanceReport/Index` (12), `/AccountTransaction/AllTransactions` (18), `/customeraccounts/index` (30), `/CustomerAccounts/Add` (36), `/Personnel/Index` (48), `/bankintroduction/index` (63), `/banktransactions/index` (69), `/cashintroduction/index` (75), `/cashtransactions/index` (81), `/BankStatement/Index` (87), `/CustomerAccountPayment/Payments` (100), `/CustomerAccountCollection/Collections` (106), `/Checks/Checks` (112), `/Bills/Bills` (118), `/CustomerAccounts/Index` (132), `/PaymentApproval/Index` (138), `/FinancialBalanceSheet/Index` (157), `/CreditContracts/Index` (170), `/TimeDeposits/Index` (176), `/Investments/Index` (182), `/materialstockall/index` (196), `/pesticidestockall/index` (202), `/accountingpurchases/alltruck` (215), `/expertreport/allreports?...` (221), `/expertreporttruckexpenses/expensesummarybytransportcompany` (234), `/salestruckexpenses/index` (240), `/harvestmanagerexpenses/index` (253), `/ProductionSergeantsExpenses/index` (259), `/productionexpenses/indexexpenses` (265), `/AccountCredits/index` (278), `/Report/index` (291), `/orderdefinitions/index` (297), `/Uyumsoft/Dashboard` (313), `/Uyumsoft/Inbox` (319), `/Uyumsoft/Settings` (327).

Reçeteli finans menüsünde ek: `/recipefinance/index`, `/recipefinance/aging`, `/recipefinance/cashflow`, `/recipefinance/fxreport`, `/recipegoods/*`, `/recipeproduction/*`, `/recipepurchasing/*`.

Menüde görünen ama **finans dışı** modüllere giden linkler (kopyalamada kesilecek bağımlılıklar): Personnel, materialstockall, pesticidestockall, expertreport, expertreporttruckexpenses, salestruckexpenses, harvestmanagerexpenses, ProductionSergeantsExpenses, productionexpenses, Report, orderdefinitions, Uyumsoft.

### 5.6 Layout'ların yüklediği ortak JS/CSS

**CDN'ler — `_Layout`, `_ProductionLayout`, `_ExpertLayout` (ortak küme):**
- jQuery: `code.jquery.com/jquery-3.4.1.min.js` (`_Layout`, `_ExpertLayout`), **`jquery-3.6.4.min.js` (`_ProductionLayout`)**
- Bootstrap: `stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.bundle.min.js` (CSS, sb-admin temasının `~/Web/dist/css/styles.css` dosyasından gelir)
- DataTables 1.10.20: `jquery.dataTables.min.js`, `dataTables.bootstrap4.min.js`; Buttons 2.2.2: `dataTables.buttons`, `buttons.html5`, `buttons.print` (+ `buttons.dataTables.min.css`)
- JSZip 3.1.3, pdfmake 0.1.53 (+ `vfs_fonts.js`)
- select2 4.1.0-rc.0 (js+css) + `select2-bootstrap-theme@0.1.0-beta.10`
- Chart.js 2.8.0 (cdnjs)
- Font Awesome 5.11.2 (`js/all.min.js`)
- `_ProductionLayout` ek: `cdnjs …/microsoft-signalr/6.0.0/signalr.min.js`

**Yerel (wwwroot) — ortak küme:** `~/Web/dist/css/styles.css`, `~/Web/dist/js/scripts.js`, `~/Web/dist/assets/demo/{chart-area-demo,chart-bar-demo,datatables-demo}.js`, `~/css/layout.css`, `~/css/account-actions.css`, `~/css/definition-form.css`, `~/css/definition-list.css`, `~/css/introduction-audit.css`, `~/css/zto-admin.css` (`_Layout`, `_ExpertLayout`), `~/css/signalrchat.css` (`_ProductionLayout`), `~/lib/datatables/css/dataTables.bootstrap4.min.css`, `~/lib/microsoft-signalr/signalr.js`, `~/js/introduction-audit-popover.js`, `~/js/introduction-details.js`, `~/js/layout-account-actions.js`, `~/js/live-screen-share.js`.

**`_ReportLayout`:** Font Awesome 6.4.0 (css, CDN), `~/css/report-page.css`, `~/lib/xlsx/xlsx.full.min.js` (SheetJS), `~/js/report-page.js`.
**`_ModalFrameLayout`:** jQuery 3.4.1, Bootstrap 4.3.1 (css+js), Font Awesome 5.11.2.

**Layout'ların gömdüğü partial'lar (kopyalamada bağımlılık):** `_AppUpdateNotifier`, `_ConnectionMonitor`, `_DefinitionDetailsModal`, `_PwaHead`, `_PwaInstallMenuItem`, `_SidebarModeMenuItem`, `_SidebarModeScripts`, `_SupportDemandsModal`, `_ZtoAssistant`, `_SideMenu_UserSwitchModal`, `_SpecialDayNavBadge`, `_StaleProductionNotify`, `_UserNotifications`; `_ProductionLayout`/`_ExpertLayout` ek: `_LicenseWarning`, `_PasswordChangeModal`; `_ExpertLayout` ek: `_SideMenu_Garden`.

**Finans view'larının KENDİ yüklediği ek kütüphaneler** (layout'takilerle sürüm çakışması var):
jQuery 3.6.0 (32 kez) ve 3.6.4 (9), DataTables **1.13.7** (12) + Responsive 2.5.0 + Buttons **2.4.2**, Bootstrap **4.6.2** bundle (jsDelivr, 10), JSZip 3.10.1, pdfmake 0.2.7, Chart.js (sürümsüz `cdn.jsdelivr.net/npm/chart.js` 3 kez; `chart.js@4.4.1` 2 kez), OpenLayers `ol@v7.3.0`, animate.css 4.1.1, Font Awesome 5.15.1 / 6.0.0-beta3. `_DataTablesScriptsPartial.cshtml` bu "yeni" seti (jQuery 3.6.4, Bootstrap 4.6.2, DataTables 1.13.7, Buttons 2.4.2, JSZip 3.10.1, pdfmake 0.2.7) tek partial'da toplar.

**Diğer UI kütüphaneleri (finans view'ları + `wwwroot/js/zt` taraması):** toastr → 4 dosya; SweetAlert (`Swal.`) → 1 dosya; moment → 0; flatpickr / bootstrap-datepicker → 0 (**tarih girişi native `<input type="date">`, 48 dosya**); inputmask/autoNumeric/cleave → 0.

`wwwroot/lib` yerel kopyaları (layout'lar çoğunlukla CDN kullanıyor): `bootstrap` (v5.1.0), `jquery` (v3.5.1), `jquery-validation`, `jquery-validation-unobtrusive`, `datatables` (yalnız css), `chartjs`, `htmx`, `microsoft-signalr`, `xlsx`.

### 5.7 `wwwroot/` üst düzey yapı ve boyutlar

| Yol | Boyut | Not |
|---|---|---|
| `Product/` | 137 MB | ürün görselleri (ad bazlı png) — finansla ilgisiz |
| `Content/` | 83 MB | |
| `EducationVideos/` | 55 MB | `.gitignore`'da |
| `lib/` | 11 MB | yerel kütüphaneler (yukarıda) |
| `js/` | 3.6 MB | içinde `js/zt/` 2.9 MB |
| `models/`, `Models3D/` | 2.6 MB / 1 MB | 3D modeller |
| `ProductionExpenses/` | 2.4 MB | |
| `Web/` | 744 KB | sb-admin teması (`Web/dist/css/styles.css`, `js/scripts.js`) — **layout'lar buna bağımlı** |
| `css/` | 737 KB | `css/zt/<modül>/*.css` dahil |
| `Templates/`, `Login/`, `images/`, `receiptdocuments/`, `qrview/`, `scala/` | küçük | |
| `Documents/` | ~0 | içinde `<QrKey>` adlı kiracı klasörü |
| kökte çok sayıda görsel (`factory*.png`, `traceability.png` 4.6 MB vb.) | | |

- **`wwwroot/js/zt/`** (21 dosya) alt klasörleri — tamamı finans/personel: `accounttransaction/` (`alltransactions.js`, `transactions.js`), `bankstatement/` (`index.js`), `banktransactions/` (`BankTransactionsPayments.js`, `BankTransactionsCollections.js`), `cashtransactions/` (`cashtransactionspayments.js`, `cashtransactionscollections.js`), `collections/` (`collections.js`, `searchable-select.js`), `paymentmanagement/` (`payment-planning.js`, `payment-approvals.js`, `payment-approval-request.js`, `process-payment-orders.js`), `payments/` (`payments.js`, `searchable-select.js`), `companyexpensedetails/`, `personnel/`. Ayrıca `wwwroot/js/finance-report.js`, `report-page.js`, `searchable-select.js`, `stat-filter.js`.
- **`wwwroot/css/zt/`** finans alt klasörleri: `accounttransaction`, `bankstatement`, `banktransaction`, `bills`, `cashtransaction`, `checkbooks`, `checks`, `creditcontracts`, `customeraccountcollection`, `customeraccountpayment`, `customeraccounts`, `paymentapproval`, `paymentmanagement`, `timedeposits`.
- **`wwwroot/Documents`**: **kiracı verisidir, kopyalanmamalı.** `HomeController.cs:205-221` her kiracı için `Documents/<Customers.QrKey>` klasörü oluşturur; mevcut tek alt klasör bir QrKey adıdır. Asıl belge depolama SMB doküman sunucusudur (`\\{DocumentServerIP}\FileStorage\…`, `Helpers/DocumentStorageHelper.cs`, `Services/NetworkConnection.cs`).

---

## 6. Ortak yardımcılar

### 6.1 `Helpers/` (33 dosya) — tek satır açıklama + finans kullanımı

| Dosya | Açıklama | Finans sayfalarınca kullanım |
|---|---|---|
| `CompactAdminSidebarHelper.cs` | Master Admin için ikonlu tanım sidebar'ı açık mı | `Views/CustomerAccounts/Index.cshtml`, `_Layout` |
| `ComplianceSchema.cs` | Uygunluk pazarı tablolarını çalışma zamanında garanti eder (DDL) | Hayır |
| `CustomerLogoHelper.cs` | Belge başlıkları için müşteri logosu (admin `Customers.LogoUrl`, session `customerQrKey`) | Hayır (11 başka dosya) |
| `DocumentAccessPath.cs` | Dosya uçlarının istediği yolun kiracı klasöründe olduğunu doğrular | Dolaylı (TenantFileAccess üzerinden) |
| `DocumentStorageHelper.cs` | SMB FileStorage'a ortak doküman kaydı | Hayır (14 başka dosya; reçeteli modül) |
| `ExcelBuilder.cs` | "Döküm ve Üretim Parti Notları" xlsx üreticisi (OpenXml) | Hayır (yalnız `ProductionLedgerController`) |
| `FileTokenHelper.cs` | Dosya yolunu DataProtection ile opak token'a çevirir (GetFile linkleri) | **Evet** — `AccountTransactionController`, `PurchaseCurrentAccountController` |
| `FinanceAccess.cs` | Finans görme kuralı (Patron ↔ finans personeli) | **Evet** (Bölüm 4.3) |
| `FinanceRoleHelper.cs` | Finans süper kullanıcı tespiti | **Evet** (Bölüm 4.3) |
| `Fr23ExcelBuilder.cs` | FR.23 Proses Başlangıç/Bitiş formu xlsx | Hayır ("Fr" = form no, finans değil) |
| `IntroductionAuditHelper.cs` | `GetActor`, `WithActor` (connStr'e aktör), `ExecuteSuppressed`, `IsSystemImport` | **Evet** — BankIntroduction, BankStatement, Checks, CreditContracts, CustomerAccounts, CustomerCurrentAccounts, PaymentApproval controller'ları + AccountController + Program.cs |
| `OfficialSalesCreditRemover.cs` | Resmi satışla cariye yazılan müşteri alacağını tek noktadan geri alır | **Evet** — `AccountTransactionController` |
| `PersonnelScope.cs` | WorkPlace/Branch kapsam kuralları (saf) | Hayır |
| `PrintCulture.cs` | Yazdırılabilir belgelerin `<html lang dir>` ayarı | Hayır (10 başka dosya) |
| `ProductImage.cs` | Ürün görsel yolu | Hayır |
| `ProductStatusBadge.cs` | Mal kabul ürün statüsü rozeti | Hayır |
| `ProductStatusSuggestion.cs` | Ürün statüsü önerisi | Hayır |
| `QrLabel.cs` | Palet etiketi QR adresi | Hayır |
| `QrPalletProcesses.cs` | QR palet "Uygulanan İşlemler" kuralları | Hayır |
| `QualitySchema.cs` | Kantar fişi/ürün statüsü şeması (çalışma zamanı DDL) | Hayır |
| `RecipeQrTokenHelper.cs` | Kısa UUID QR eşlemesi (admin `ZT_RecipeQrTokenMap`) | Hayır |
| `ReportErrorLog.cs` | Rapor catch bloklarında istisnayı loglar | **Evet** — `FinanceReportController` |
| `ReportHtml.cs` | Rapor view'larında DB metnini güvenli HTML'e yazar | Hayır (2 dosya) |
| `ReportScope.cs` | Rapor şube/iş yeri kapsam koşulu | **Evet** — FinanceReport (controller + FrSql + FrWarehouse) |
| `RequestDate.cs` | İstekten gelen tarih metnini (yalnız ISO) DateTime'a çevirir → parametre | **Evet** — CustomerAccounts, PaymentManagement, RecipeFinance |
| `RichHtml.cs` | TempData mesajlarını güvenli HTML'e yazar | **Evet** — `Views/Checks/EditCheck.cshtml` |
| `ScriptJson.cs` | Sunucu JSON'unu `<script>` içine güvenle gömer (XSS) | **Evet, yaygın** — 334 dosya; neredeyse tüm finans view'ları |
| `StockLockRegistry.cs` | Üretim planlama ↔ fason stok kilidi heartbeat defteri | Hayır |
| `SupplierCariHelper.cs` | Cari hesabı olan tedarikçi ID kümesi | Finans controller'larında hayır (15 başka dosya — tedarikçi view'ları cari bağlantısı için) |
| `TenantFileAccess.cs` | Dosya uçlarının tek giriş noktası (kiracı klasörü dışını reddeder) | **Evet** — Checks, CreditContracts, PurchaseCurrentAccount |
| `TenantFilePath.cs` | TenantFileAccess'in saf yol kuralları | Dolaylı |
| `UyumsoftMenuHelper.cs` | Uyumsoft modülü açık mı (`ZT_Setting`) | Dolaylı (finans menüsü Uyumsoft öğeleri) |
| `ZtXlsxExport.cs` | Genel xlsx dışa aktarım (`XlsxCell`, OpenXml) | Hayır (RecipeSales, QualityAndAnalys) |

### 6.2 PDF çıktısı

- **Sunucu tarafı PDF kütüphanesi yok** (csproj'da iTextSharp/QuestPDF/DinkToPdf/SelectPdf yok; `WeighbridgeController.cs:7682,7748`'deki geçişler yorum/metin).
- Çıktı yolları: (a) **tarayıcı yazdırma** — `Layout = null` yazdırma view'ları + `window.print()` (finans view/JS'lerinde 19 dosya); (b) **DataTables Buttons + pdfmake** (istemci, CDN; 3 finans dosyasında doğrudan `pdfMake`); (c) rapor sayfaları `_ReportLayout` + `report-page.js` (yazdır + SheetJS Excel).
- **Excel**: istemci — DataTables `buttons.html5` + JSZip, SheetJS `~/lib/xlsx` (`XLSX.` 2 finans dosyası, `finance-report.js`); sunucu — DocumentFormat.OpenXml (`ExcelBuilder`, `Fr23ExcelBuilder`, `ZtXlsxExport`) finans dışında.

### 6.3 Belge / fiş numarası üretimi

Ortak bir numara servisi **yok**; her controller kendi private metodunu yazar:

| Metot | Dosya:satır | Biçim / yöntem |
|---|---|---|
| `GenerateTransferCode(con, tx, transferType)` | `BankStatementController.cs:3692` | `EFT/HVL/DBZ/BKY/KBY/KKY/VRM-<yıl>-…`; `COUNT(*)+1` (`ZT_BankTransfers.TransferCode LIKE`) |
| `GenerateContractCode(con)` | `CreditContractsController.cs:1437` | `KRD-<yıl>-0001`; `MAX(sayı)+1` (`ZT_CreditContracts.ContractCode`) |
| `GenerateDepositCode(con)` | `TimeDepositsController.cs:1207` | `VMD-<yıl>-0001` (`ZT_TimeDeposits.DepositCode`) |
| `GenerateCollectionCode(con)` | `TimeDepositsController.cs:1225`, `InvestmentsController.cs:1181` | `FTH-<yıl>-0001` (`ZT_InterestCollections.CollectionCode`) |
| `GenerateInvestmentCode(con)` | `InvestmentsController.cs:1151` | (aynı MAX+1 deseni) |
| `GenerateApprovalCode(con, tx)` | `PaymentManagementController.cs:779` | `OD-<yıl>-0001`; **PostgreSQL sequence** `nextval('"ZT_PaymentApprovalCode_seq"')` (tek sequence kullanan) |
| `GenerateTraceabilityCode(length)` | `CustomerAccountsController.cs:4337` | rastgele A-Z0-9 dizgi (`System.Random`) |

`DocumentNo` alanı (14+ modelde `public string DocumentNo`) kullanıcı girişidir; otomatik üretilmez. MAX+1 / COUNT+1 desenleri eşzamanlılıkta çakışmaya açıktır (kilit yok).

### 6.4 Para / tarih biçimlendirme için ortak JS yardımcıları

**Ortak tek bir JS yardımcı dosyası yok.** `wwwroot/js` ve `wwwroot/js/zt` taramasında aynı fonksiyonlar dosya başına yeniden tanımlanıyor: `formatCurrency` 18 kez, `formatDate` 15, `formatNumber` 6, `formatNumberForServer` 6, `formatDecimalInput` 6, `escapeHtml` 5, `formatPercent` 4, `formatMoneyForServer` 3, `formatDateFromISO` 3, `formatDateForInput` 3, `esc` 3, `parseAmount`/`parseAmountInput` birer. Biçimlendirme `toLocaleString` (37 finans dosyası) / `Intl.NumberFormat` (2) ile yapılır. Yeniden kullanılabilir küçük modüller: `wwwroot/js/searchable-select.js`, `report-page.js`, `stat-filter.js`, `form-draft.js`, `finance-report.js` (`_internals` ile test edilebilir saf fonksiyonlar). Sunucu tarafında ortak tarih ayrıştırma `Helpers/RequestDate.cs`, saat sağlayıcı `Services/IDateTimeProvider.cs` / `DateTimeProvider.cs` (singleton; yalnız bazı controller'lar kullanıyor, çoğu `DateTime.Now`).

---

## 7. Audit ve soft-delete deseni

### 7.1 Audit kolon adları (finans modellerinden örnekler)

Standart **tutarlı değil**; üç kuşak bir arada:

| Model (dosya) | Audit / durum alanları |
|---|---|
| `Models/ZT/BankTransactions.cs:19-20` | `Status` (bool), `CreationDate` — CreatedBy YOK |
| `Models/ZT/CashTransactions.cs:18-19` | `Status`, `CreationDate` |
| `Models/ZT/BankIntroduction.cs:28-32` | `Status = true`, `CreationDate`, `WorkPlaceID`, `BranchProvinceID` (DB'de trigger ile `CreatedBy/UpdatedDate/UpdatedBy/UpdateCount` eklenmiş) |
| `Models/ZT/CashIntroduction.cs:15-18` | `Status`, `CreationDate`, `WorkPlaceID`, `BranchProvinceID` |
| `Models/ZT/FinancePerson.cs:19-27` | `Status`, `CreationDate`, `WorkPlaceID`, `BranchProvinceID?` |
| `Models/ZT/AccountDebts.cs:44-48` | `WorkPlaceID?`, `CreationDate`, `CreatedBy?` — `Status` yok |
| `Models/ZT/CreditContract.cs:89-93` | `Status`, `CreationDate`, `CreatedBy`, `UpdatedDate?`, `UpdatedBy` |
| `Models/ZT/CustomerAccount.cs:29-38` (`CustomerAccountPaymentPlan`) | `Status`, `CreationDate`, `CreatedBy`, **`UpdatedAt?`**, `UpdatedBy`, `UpdatedNote`, **`DeletedAt?`**, `DeletedBy` |
| `Models/User.cs:16-20` (admin `Users`) | `CreationDate`, `CreatedBy`, `UpdatedDate?`, `UpdatedBy`, `UpdateCount` |

Özet: oluşturma tarihi her yerde **`CreationDate`** (`CreatedDate` DEĞİL); güncelleme çoğunlukla `UpdatedDate`/`UpdatedBy`/`UpdateCount`, ödeme planında `UpdatedAt`/`DeletedAt`. `CreatedBy` yalnız yeni tablolarda ve trigger'lı tanım tablolarında. Çok kiracılı kapsam kolonları: `WorkPlaceID` (0 = tüm iş yerleri) ve `BranchProvinceID` (NULL = tüm şubeler).

### 7.2 Soft-delete

- Değer: **`"Status" boolean`; aktif = `true`, silinmiş/pasif = `false`**. Sorgular `WHERE "Status" = true` (taranan 8 finans controller'ında ~294 geçiş), silme `SET "Status" = false` (~38 geçiş).
- **Hard delete de var**: `DELETE FROM` geçişleri — CreditContracts 11, AccountTransaction 9, BankStatement 8, CustomerAccountCollection 5, Checks 4, BankTransactions 3, CustomerAccounts 2, CustomerAccountPayment 1 (cascade/alt satır temizliği). Silinen cari borç kayıtları için `ZT_AccountDebtsDeleteLog` (runtime DDL, `FinanceMaintenanceController.cs:574`).
- Ödeme planında ek olarak `DeletedAt`/`DeletedBy`.

### 7.3 Tanım (Introduction) audit altyapısı — DB trigger tabanlı

- **`Models/IAuditableIntroduction.cs`**: `CreationDate`, `CreatedBy`, `UpdatedDate?`, `UpdatedBy`, `UpdateCount`. Uygulayanlar: `ContainerType`, `Customer`, `Product`, `SubProduct`, `TransportCompany`, `User`, `IntroductionAuditRecord`.
- **`Models/IntroductionAuditRecord.cs`**: yukarıdakiler + `LastAccessedBy`, `LastAccessedDate?`, `AccessCount`.
- **`SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql`** (kiracı): ~55 tanım tablosuna (finanstan: `ZT_CashIntroduction`, `ZT_BankIntroduction`, `ZT_ExpenseTypes`, `ZT_ExpenseItems`, `ZT_CustomerAccounts`, `Currency`, `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_Boss` …) `ADD COLUMN IF NOT EXISTS` ile 5 audit kolonu (`:39-43`), `fn_IntroductionAudit()` fonksiyonu (`:50`) ve `trg_IntroductionAudit BEFORE INSERT OR UPDATE` trigger'ı (`:110`), ayrıca `ZT_IntroductionAccessSummary` tablosu (`:115`). Devam script'leri: `2026_09_02_…_Actor_Guc.sql` (aktörü `zto.audit_actor` GUC'undan okur), `2026_09_03_…_Change_Guard.sql`, `2026_09_04_…_CreatedBy_Repair.sql`, `2026_09_06_…_System_Columns.sql`, `2026_09_06_CustomerAccounts_Audit_Rebuild.sql`, admin için `2026_08_26_ZTO_ADMIN_Users_Audit.sql`.
- **Aktör aktarımı**: uygulama audit kolonlarını SQL'de elle yazmaz; `IntroductionAuditHelper.WithActor` connection string'e `options=-c zto.audit_actor=<kullanıcı>` koyar, trigger bunu okur. Toplu sistem yazımlarında `ExecuteSuppressed` (`SET LOCAL zto.audit_suppress='on'`). Backfill literali `"Sistem aktarımı"`.
- **`ViewComponents/IntroductionAuditViewComponent.cs`** (92 satır): `InvokeAsync(string table, int id, bool panel=false, bool compact=false)`; beyaz liste tablolar (`:11-18`, içinde `ZT_FinancePerson`, `ZT_CustomerAccounts`, `ZT_CashIntroduction`, `ZT_BankIntroduction`, `ZT_BranchProvince`), tabloyu `ZT_IntroductionAccessSummary` ile LEFT JOIN eder (`:56-57`); view `Views/Shared/Components/IntroductionAudit/Default.cshtml` + `_IntroductionAuditCell*`, `_IntroductionAuditPanel`.
- **`Services/DefinitionAuditService.cs`** (297 satır) + `DefinitionAuditRegistry.cs` (111) + `IDefinitionAuditService.cs`: `OpenDetailsAsync` (tanım detayını açar, erişimi `ZT_IntroductionAccessSummary`'ye UPSERT eder: `AccessCount+1`, `:159-167`), `GetListSummariesAsync` (liste için toplu özet). Registry tanım anahtarı → tablo + alan etiketleri eşler; finans girişleri (`:54-59`): `cash`→`ZT_CashIntroduction`, `bank`→`ZT_BankIntroduction`, `expense-type`→`ZT_ExpenseTypes`, `expense-item`→`ZT_ExpenseItems`, `customer-account`→`ZT_CustomerAccounts`, `currency`→`Currency`. Kasa/banka/cari için `FinancialTransactionTable` üzerinden hareket özeti de çeker (`:232`). UI: `DefinitionDetailsController`, `_DefinitionDetailsModal`, `wwwroot/js/introduction-details.js`, `introduction-audit-popover.js`.

### 7.4 İşlem logu (`Log` tablosu)

- **`Models/Log.cs`** (kiracı DB `public."Log"`): `ID`, `User` (50), `UserRole` (50), `Description` (1000), `CreationDate`, `TableName` (50), `TableDataID` (int), `Process` (30), `Platform` (30); `StartDate`/`EndDate` yalnız filtre alanı.
- **Yazım**: `Methods.LogAdd(Log log, NpgsqlConnection con)` (`Controllers/Methods.cs:334-394`) — parametreli INSERT; hata yutulur (yalnız `Console.WriteLine`). Controller'lar her ekle/güncelle/sil sonrası **elle** çağırır; `Process` serbest metindir (~80 farklı yazım, iki dil — `Methods.cs:399-402` yorumu). Finans controller'larında çağrı adedi: CreditContracts 15, CustomerAccounts 6, AccountTransaction 6, Bills 5, BankIntroduction 4, PaymentApproval 4, BankTransactions 3, Checks 3, CustomerAccountPayment 3, CashTransactions 2, CustomerAccountCollection 2, BankStatement 2 — yani **her yazma işlemi loglanmıyor**.
- **Okuma**: `Controllers/LogController.cs` (212 satır, `[Authorize][UserRoleAuthorize("Admin")]`): `Index(startdate, enddate)` ve `Recent(afterId, startdate, count=60)` (canlı akış JSON). Sınıflandırıcılar `Methods.LogProcessClass/LogRoleAccent/LogPlatformClass/LogInitial`.
- Ek özel loglar: `ZT_SalesTruckDebtLog`, `ZT_AccountDebtsDeleteLog`, `ZT_AccountTransferHistory` (`SQL_Migrations/2026_08_10_*`), `Services/DefinitionActivity/DefinitionActivityReader.cs`, `Services/PatronActivity/*`.

---

## 8. Validasyon ve hata yönetimi

### 8.1 Validasyon

- **FluentValidation yok.** DataAnnotations yalnız birkaç modelde (`[MaxLength]`, `[Required]`, `[EmailAddress]`, `[Phone]` — ör. `Models/User.cs`, `Models/Log.cs`).
- `Configuration/MvcValidationSetup.cs`: `Configure(MvcOptions)` → `SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true` (Nullable açık olduğu için örtük `[Required]` kapatılır); `IgnoreBindingErrorsFor(modelState, prefixes…)` → elle SQL ile kaydedilen parametrelerin bağlama hatalarını ModelState'ten çıkarır. `Program.cs:78-88`'de çağrılır.
- Fiiliyat: `ModelState.IsValid` yalnız **1 controller dosyasında** geçiyor. Doğrulama **action içinde elle `if`** ile yapılır ve JSON/TempData mesajı döner (ör. `BankTransactionsController.cs:1501-1511` "Geçersiz banka seçimi."). İstemci tarafı `_ValidationScriptsPartial` (jquery-validation) mevcut ama finans akışı AJAX + elle kontrol.
- `AddDataAnnotationsLocalization()` etkin (`Program.cs:227`).

### 8.2 Global hata yönetimi

- `Program.cs:288-292`: Development dışı ortamda `app.UseExceptionHandler("/Home/Error")` + `UseHsts()`. `HomeController.Error` `[AllowAnonymous]` (`:497-501`) → `Views/Shared/Error.cshtml`.
- `GlobalExceptionLoggingMiddleware` (`Services/Diagnostics/RuntimeDiagnostics.cs:447-…`, `Program.cs:815`): yakalanmayan istisnayı `DiagnosticsLog.Write("EXCEPTION", method+path+kim+tip+mesaj+stack[2000])` ile loglar, havuz tükenmesini olay olarak işaretler ve **yeniden fırlatır** (yanıt biçimini değiştirmez).
- `ClosedRedirectDiagnosticsMiddleware` (`Program.cs:816`): `/Home/Closed`'a yönlenen istekleri loglar.
- Session/çerez ara katmanları kendi hatalarında `/Account/Login`'e yönlendirir (`Program.cs:727-736`).
- **Controller içi desen**: her action `try { … } catch (Exception ex) { … }`. Sayfa action'ları `RedirectToAction("Error","Home")` (15) veya `RedirectToAction("Closed","Home")` (7); AJAX action'ları `Json(new { success = false, message = "…" + ex.Message })` — taranan 8 finans controller'ında `ex.Message` 164 kez geçiyor (**istisna metni istemciye sızabiliyor**; `tests/ErrorLeakChecks`, `tests/StackTraceLeakChecks` bu sınıfı denetliyor). Sayfa mesajları `TempData["ErrorMessage"]` / `TempData["SuccessMessage"]` (64 geçiş), view'da `RichHtml` ile yazılır.
- Global bir API exception filter'ı / `ProblemDetails` standardı yok.

### 8.3 AJAX JSON yanıt biçimi

Yazılı tek bir sözleşme/sarmalayıcı sınıf yok; fiili standart **`{ success: bool, message: string }`**, veri dönerken **`{ success, data }`**. 5 finans controller'ında (`BankTransactions`, `CustomerAccountPayment`, `Checks`, `PaymentApproval`, `CustomerAccounts`) `Json(new { … })` şekil dağılımı:

| Şekil | Adet |
|---|---|
| `{ success, message }` | 117 |
| `{ error }` | 19 |
| `{ success, data }` | 10 |
| `{ exists, items }` / `{ exists, message }` / `{ exists }` | ~7 |
| `{ success, message, transactionId }`, `{ success, html }`, `{ success, data, count }`, `{ success, rates }`, `{ success, plans }` … | birer |

Örnek: `BankTransactionsController.AddTransaction` (`:1490-…`) `[HttpPost][ValidateAntiForgeryToken] public JsonResult …` → `Json(new { success = false, message = "Geçersiz banka seçimi." })`. HTTP durum kodu çoğunlukla 200 (hata `success=false` ile bildirilir); `BadRequest(...)` 10, `StatusCode(500, …)` 4 geçiş. `SwitchAccount` 400 + `{ success=false, message }` döner. JSON serileştirici varsayılan (camelCase); controller'lar anonim nesneyi zaten küçük harfle yazar.

### 8.4 Antiforgery

- Global `AutoValidateAntiforgeryToken` **yok**; öznitelik bazlı. `[ValidateAntiForgeryToken]` tüm `Controllers/` altında **24 dosyada 70 kez**.
- Finans controller'larında yalnız 5'inde var: `PaymentApproval` 13, `PaymentManagement` 8, `BankTransactions` 7, `CustomerAccountPayment` 6, `AccountCredits` 1. Diğer 28 finans controller'ının POST'ları (AccountTransaction, CustomerAccounts, Checks, Bills, CashTransactions, CreditContracts, BankStatement, CustomerAccountCollection …) **korumasız**.
- `[IgnoreAntiforgeryToken]`: `CheckBooksController.cs:168` (+ SalesProduct, SupportDemands).
- İstemci deseni: view'da `@Html.AntiForgeryToken()` (`Views/BankTransactions/Index.cshtml:29`), JS belirteci `RequestVerificationToken` **başlığı** ile gönderir (`PaymentManagementController.cs:16` yorumu, `Views/BankTransactions/Index.cshtml:27-28`).
- CORS: `AllowAnyOrigin/AnyHeader/AnyMethod` (`Program.cs:94-103`, `:805-808`).

---

## 9. Lokalizasyon

- **Desteklenen kültürler**: `LocalizationCoverage.Cultures = { "tr", "en", "fr", "ar" }` (`Services/AdminSystem/LocalizationCoverage.cs:21`); varsayılan ilk eleman `tr` (`Program.cs:739-745`). `ar` için RTL: `_ReportLayout` ve `PrintCulture` `<html dir>`'i kültürden üretir.
- **Kayıt**: `AddLocalization(ResourcesPath="Resources")` (`Program.cs:221`), `IStringLocalizerFactory` → `CaseInsensitiveStringLocalizerFactory` (`:222`; `ResourceManager.IgnoreCase=true` — MSB3568 nedeniyle yalnız harf büyüklüğü farklı anahtarlar için), `AddViewLocalization(LanguageViewLocationExpanderFormat.Suffix)` + `AddDataAnnotationsLocalization()` (`:226-227`).
- **Kültür seçimi**: `LanguageController.ChangeLanguage` `CookieRequestCultureProvider` çerezi yazar (1 yıl). Session `language` (`Customers.Language`) login'de yazılır.
- **.resx organizasyonu**: `Resources/Views/<Controller>/<View>.<kültür>.resx` — **view başına, kültür başına ayrı dosya**; `Resources/` altında yalnız `Views/` klasörü var (207 controller klasörü). Toplam 3482 .resx: `en` 814, `ar` 814, `fr` 808, `tr` 683, kültürsüz (nötr) ~361, `ru` 1, `es` 1. Paylaşılan partial'lar `Resources/Views/Shared/` altında (386 dosya). Ortak (SharedResource) sözlük **yok** — aynı metin her view'ın resx'inde tekrar eder.
- **Anahtar deseni**: anahtar = **Türkçe metnin kendisi** (`Localizer["Banka Hareketleri"]`, `Localizer["FİNANS İŞLEMLERİ"]`). `tr` resx eksikse anahtar aynen gösterilir.
- **View kullanımı**: `_ViewImports.cshtml` üzerinden `@inject IViewLocalizer Localizer` → `@Localizer["…"]`. Controller tarafında `IStringLocalizer` yalnız 2 dosyada; **controller'lardaki JSON/TempData mesajları sabit Türkçe**dir (lokalize değil). JS içindeki metinler view'da `Localizer` + `ScriptJson` ile gömülür.
- **Finans view'ları için resx sayısı**: 33 finans controller klasöründe **395 dosya** — AccountingPurchases 26, CashIntroduction 23, AccountTransaction 22, BankIntroduction 22, CreditContracts 20, CustomerAccounts 20, RecipeFinance 18, Checks 17, PaymentManagement 16, TimeDeposits 15, CashTransactions 13, Currency 13, CustomerAccountCollection 13, ExpenseItems 13, ExpenseTypes 13, FinancePerson 13, BankAccounts 12, BankStatement 12, Investments 12, TransactionType 12, AccountCredits 9, BankTransactions 9, CustomerAccountPayment 9, Bills 8, FinanceReport 5, FinancialBalanceSheet 5, PaymentApproval 5, CheckBooks 4, CustomerAccountReport 4, CustomerCurrentAccounts 4, Finance 4, PurchaseCurrentAccount 4, FinanceMaintenance 0. Buna `Resources/Views/Shared/` içindeki layout/menü/modal resx'leri eklenmelidir (386 dosyanın finans/ödeme adlı olanları ≈ 56; layout ve `_SideMenu_*` resx'leri ayrıca gerekir).
- Kapsam denetimi: `AdminSystemController.LocalizationCoverage` ucu + `tests/localizer-missing`, `tests/PrintLocalizationChecks`.

---

## 10. Arka plan servisleri ve dış entegrasyonlar

### 10.1 `BackgroundService` sınıfları

| Sınıf (dosya) | Kayıt (`Program.cs`) | İşlev |
|---|---|---|
| `SystemMonitorWorker` (`Services/AdminSystem/SystemMonitorWorker.cs`) | `:32` | 10 sn'de bir sağlık nabzı/skoru, kiracı kataloğu, `SystemAuditStore`'a anlık görüntü |
| `DbSaturationDiagnosticsWorker` (`Services/Diagnostics/RuntimeDiagnostics.cs:607`) | `:33` | 30 sn'de bir DB doygunluk / uzun sorgu / kilit teşhisi |
| `RestartService` (`Services/RestartService.cs`) | `:53` | Bellek izleme; eşik aşımında uygulamayı yeniden başlatma |
| `ScheduledRestartService` (`Services/ScheduledRestartService.cs`) | `:54` **yorumda (kapalı)** | Her gün 03:00 restart |
| `ApplicationPoolKeepAliveService` (`Services/ApplicationPoolKeepAliveService.cs`) | `:56` | 2-3 dk'da bir kendine ping (IIS app pool'u canlı tutar) |
| `NotificationBackgroundService` (`NotificationBackgroundService.cs`, proje kökü) | `:75` | 5 dk'da bir: boşta DB bağlantı temizliği, kısıt kontrolü, sevk bildirimi (OneSignal push) |
| `AppUpdateStatusWorker` (`AppUpdateStatusWorker.cs`, proje kökü) | `:77` | Admin DB `ZT_AppUpdate` aktif duyurusunu sürüm yayınlanınca pasife çeker |
| `UyumsoftInboxWorker` (`Services/Uyumsoft/UyumsoftInboxWorker.cs`) | `:116` | 30 dk'da bir Uyumsoft gelen e-Fatura çekimi (tüm kiracılar) |
| `AIDailyTrainingHostedService` (`Services/AI/AIDailyTrainingHostedService.cs`) | `:137` | Günlük AI eğitim işi (tüm aktif kiracı DB'leri) |
| `HksBildirimQueueWorker` (`Services/Hks/HksBildirimQueueWorker.cs`) | `:200` | HKS (Hal Kayıt Sistemi) bildirim kuyruğu; tüm aktif kiracıları dolaşır |

Çok-kiracılı worker deseni: admin DB'den aktif `Customers` listesini okur, her kiracı için `customerApiDatabase + DatabaseName` ile bağlanır, kiracı başına try/catch (kalıp: `AIDailyTrainingHostedService`).

### 10.2 Dış entegrasyonlar

- **TCMB döviz kuru**: `Services/ITCMBExchangeRateService.cs` (singleton, `Program.cs:106`) — finansla doğrudan ilgili.
- **Uyumsoft e-Dönüşüm** (e-Fatura/e-Arşiv/e-İrsaliye/gelen kutusu): `Services/Uyumsoft/*`, `Controllers/UyumsoftController.cs`; ayar `Uyumsoft:CryptoKey` (`appsettings.json`) — finans menüsünde yer alır.
- **HKS** (SOAP/WCF, `System.ServiceModel.*`): `Services/Hks/*`, `Connected Services/`; ayar `Hks:*`.
- **ZTO HAL**: `Services/ZtoHalIntegrationService.cs`; ayar `ZtoHal:*`, admin `Customers.WebUrl`/`FactoryApiKey`.
- **OneSignal** push: `Services/OneSignal.cs`. **OpenAI / Claude** AI asistan: `Services/OpenAIApiClient.cs`, `Services/AI/*`, `ZtoAsistan/`; ayar `OpenAI:ApiKey`, `AIAgent:*`.
- **Friggatech** (soğuk depo/IoT): `Services/Friggatech/*`, `ApiController/FriggatechController.cs`; ayar `Frigga:*`.
- **SMB doküman sunucusu**: `Services/NetworkConnection.cs`, `Helpers/DocumentStorageHelper.cs`.
- **SMS / e-posta doğrulama**: `UserController.SendVerificationEmail` (`:1098`), `SendVerificationSms` (`:1146`).
- **Google Authenticator (TOTP)**: `Services/TwoFactor/*`; ayar `TwoFactor:Issuer`.

`appsettings.json` üst düzey bölümleri: `AdminPanelApi`, `Logging`, `ConnectionStrings` (`Default_Connection`), `AllowedHosts`, `TwoFactor`, `Frigga`, `OpenAI`, `AIAgent`, `ZtoHal`, `Uyumsoft`, `Hks`, `IpRateLimiting` (değerler yazılmadı).

### 10.3 `ApiController/` — kimlik doğrulama

- 42 dosya, `[ApiController]`, rota `[Route("api/[controller]")]` (41) / `Api/[controller]` (1).
- **Yöntem: API key başlık DEĞİL — sorgu/form parametresi.** Her action imzasında `string database, string token` bulunur ve `Methods.Authorize(database, token)` çağrılır (**186 çağrı, 38 dosya**). Örnek: `ApiController/AccountApiController.cs:199-206` — `[HttpGet("account")] GetAccountIndex(string database, string token)`.
- `Methods.Authorize` (`Controllers/Methods.cs:194-211`): admin DB'de `SELECT * FROM public."Customers" WHERE "CustomerKey"=@token AND "DatabaseName"=@database` → satır varsa yetkili. Yani **kiracı başına tek statik anahtar** (`Customers.CustomerKey`); kullanıcı/rol ayrımı yok. Bağlantı `GlobalVeriables.customerApiDatabase + database`.
- İstisnalar: 1 action'da `[FromHeader] string token`; `[Authorize]` (çerez) kullanan 2 controller — bunlardan **`ApiController/PaymentApprovalApiController.cs:14-15`** `[Authorize][UserRoleAuthorize("Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli","Patron")]` (web oturumu ile çalışan finans API'si).
- `/api/` yolları session-kurtarma ara katmanından muaf (`Program.cs:659`).
- Rate limit: `AspNetCoreRateLimit` paketi var ama servis kayıtları yorum bloğunda (`Program.cs:46-51`, `*/` ile biter); `HomeController.TooManyRequests` action'ı mevcut.

### 10.4 `AdminPanelApi:Key`

`Controllers/AdminPanelApiController.cs` (`[AllowAnonymous]`, `[Route("api/adminpanel/[action]")]`, `[ResponseCache(NoStore=true)]`): **`X-Zto-Admin-Key`** başlığı `appsettings.json` `AdminPanelApi:Key` ile `CryptographicOperations.FixedTimeEquals` karşılaştırılır (`:21-30`); anahtar boş veya 24 karakterden kısaysa uç tamamen kapalı (404). Tek uç: `OnlineUsers(int minutes = 10)` — harici "ZtoAdmin yönetim paneli" için canlı çevrimiçi kullanıcı verisi.

### 10.5 Swagger

`Swashbuckle.AspNetCore 6.5.0` paketi referanslı ancak **etkin değil**: `Program.cs` ve diğer .cs dosyalarında `AddSwaggerGen` / `UseSwagger` / `UseSwaggerUI` çağrısı bulunamadı.

---

## 11. Test projeleri (`f:\visual studio zto\ZtoFabrika2026\tests\`)

Genel yapı: xUnit/NUnit/MSTest **yok**. Her klasör ya küçük bir **.NET konsol uygulaması** (kendi `Check(bool, name)` yardımcıları, hata varsa exit code 1) ya da **Node.js betiği**dir. Çözüm dosyasına (`ZtoFabrika.sln`) dahil değiller; tek tek çalıştırılır. Toplam ~47 .NET kontrol klasörü + ~13 küçük harfli Node klasörü (`definition-hub`, `finance-report`, `form-draft`, `localizer-missing`, `ncr-*`, `patron-panel`, `pqc-*`, `production-report`, `qr-label`, `stat-filter`).

| Klasör | Tür | İçerik | Çalıştırma | Ana projeye bağ |
|---|---|---|---|---|
| `FinanceAccessChecks/` (`Program.cs`, `.csproj`) | .NET konsol, **saf fonksiyon testi** | `FinanceAccess.MaySeeFinance(role, hasFinancePersonnel)` karar tablosu (Finans*, Admin, Patron, diğer, boş/null, boşluk, büyük-küçük harf) | `dotnet run --project tests/FinanceAccessChecks` | `Sdk="Microsoft.NET.Sdk.Web"` + **`<ProjectReference Include="../../ZtoFabrika/ZtoFabrika.csproj" />`** (ana projeyi derleyip `ZtoFabrika.Helpers`'ı doğrudan çağırır) |
| `BankTransactionsAccessChecks/` (`Program.cs`, `Checks.cs`, `Src.cs`, `BankTransactionsChecks.cs`) | .NET konsol, **kaynak metin (statik) testi** | `BankTransactionsController`'daki 7 POST'un `[ValidateAntiForgeryToken]` taşıdığı + view/JS'nin belirteci başlık/form alanı olarak gönderdiği | `dotnet run --project tests/BankTransactionsAccessChecks` | `Sdk="Microsoft.NET.Sdk"`, **ProjectReference YOK**; `Src.cs` repo kökünü (`ZtoFabrika/ZtoFabrika.csproj` arayarak) bulur ve .cs/.cshtml/.js dosyalarını **metin olarak okur** (controller derlenmez). İlk hatada durmaz, tüm kırıkları listeler. |
| `CustomerAccountPaymentAccessChecks/` | aynı desen | `CustomerAccountPaymentController` POST antiforgery + istemci tarafı | `dotnet run --project tests/CustomerAccountPaymentAccessChecks` | kaynak metin |
| `PaymentApprovalAccessChecks/` | aynı desen | `PaymentApprovalController` (13 antiforgery) erişim/antiforgery | `dotnet run --project tests/PaymentApprovalAccessChecks` | kaynak metin |
| `PaymentManagementAccessChecks/` | aynı desen | `PaymentManagementController` rol öznitelikleri + antiforgery | `dotnet run --project tests/PaymentManagementAccessChecks` | kaynak metin |
| `FinanceReportChecks/` (`Program.cs`, `AccessChecks`, `DbChecks`, `FilterChecks`, `KitChecks`, `LedgerChecks`, `LocalizationChecks`, `SalesDbChecks`, `SalesFinanceChecks` + `fixture/01_schema.sql` (52 satır, 17 CREATE TABLE), `02_seed.sql` (70 satır)) | .NET konsol, **birim + entegrasyon (gerçek PostgreSQL)** | `Services/FinanceReport` (FrService/FrWarehouse/FrLedger/FrSql/SalesFinance): tip, filtre, defter toplamları, SQL metni, DB sonuçları, erişim, rapor kiti, lokalizasyon | `dotnet run --project tests/FinanceReportChecks`. DB kontrolleri canlıya bağlanmaz: tek kullanımlık yerel PostgreSQL 15 cluster'ı (`initdb … -A trust`), fixture yüklenir, bağlantı **`ZTO_FR_TEST_DB`** ortam değişkeniyle verilir (`Program.cs:5-9`) | `Sdk.Web`, **ProjectReference YOK**; üretim dosyaları **`<Compile Include … Link>` ile doğrudan derlenir**: `Helpers/ReportScope.cs`, `Models/Report/ReportDateRange.cs`, `Models/Report/FinanceReport.cs`, `Models/Report/SalesFinance.cs`, `Models/ZT/AccountTransactionQueries.cs` (kanonik bakiye sorgusu `BalanceQuery` — doğruluk ölçüsü), `Services/FinanceReport/*.cs`; ortak `../QualityControlReportChecks/Checks.cs`, `../ProductionReportChecks/Repo.cs`. `Npgsql 8.0.0` paketi; `Npgsql.EnableLegacyTimestampBehavior` anahtarı testte de açılır. (Bu yüzden `Services/FinanceReport` başka ZtoFabrika tiplerine bağımlı olmamalı — csproj yorumu.) |
| `BankCashXssChecks/` (`run.cjs`, `jshtmllint.cjs`, `selftest.cjs`, `vendor/acorn.js`) | **Node.js statik analiz** | Banka/kasa hareketleri, banka ekstresi, ödeme/tahsilat/cari JS ve .cshtml `<script>` gövdelerinde HTML üreten şablonları AST (acorn) ile tarar; kodlanmadan DOM'a giren her dinamik parça (kayıtlı XSS) kırık sayılır; yardımcılar düşman girdilerle de çalıştırılır | `node tests/BankCashXssChecks/run.cjs` | dosyaları yoldan okur (`path.resolve(__dirname,'../..')`) |
| `finance-report/` (`run.js`) | Node.js birim testi | `wwwroot/js/finance-report.js` saf yardımcıları (`_internals`): para birimi toplamları, Excel satırları, sıralama | `node tests/finance-report/run.js` | `require('../../ZtoFabrika/wwwroot/js/finance-report.js')` |

İlgili diğer klasörler (ortak altyapı): `AdminSystemChecks`, `ApiConnectionChecks`, `ChatHubAccessChecks`, `DiagnosticEndpointAccessChecks`, `ErrorLeakChecks`, `StackTraceLeakChecks`, `MobileApiSqlInjectionChecks`, `OperatingSystemAccessChecks`, `OrderValidationChecks` (MvcValidationSetup), `PersonnelScopeChecks`, `ScriptJsonChecks`, `TenantFileAccessChecks`, `TwoFactorChecks`, `ReportHardeningChecks`, `PrintLocalizationChecks`, `LogLabelChecks`, `LogRecordIdChecks`.

Kopyalama açısından üç bağlama biçimi var: (1) ProjectReference (`FinanceAccessChecks`) tüm ana projeyi derler; (2) `Compile Include` ile tek tek üretim dosyası bağlama (`FinanceReportChecks`); (3) kaynak metin okuma (`*AccessChecks`, Node betikleri) — controller dosya adlarına ve repo düzenine (`ZtoFabrika/ZtoFabrika.csproj` konumu) sabit bağlıdır.

---

## Ek — Kopyalama için kritik bulguların özeti

1. Kiracılık = **kiracı başına ayrı PostgreSQL veritabanı**; katalog `ZTO_ADMIN.Customers`; kiracı connection string'i login'de üretilip **Session `userDatabase`**'e yazılır; tabloların hiçbirinde `TenantId` kolonu yok.
2. Sunucu adresi, DB şifresi, SMB şifresi, AES anahtarları **kaynak kodda sabit** (`GlobalVeriables.cs`, `EncryptionService.cs`, `Methods.cs`); kullanıcı şifreleri düz metin karşılaştırılıyor.
3. Veri erişimi tamamen ham Npgsql; EF `Context` boş; finans controller'larında katman yok (FinanceReport hariç).
4. Migration elle; runner yok; tam şema dökümü repoda yok → canlı DB'den alınmalı.
5. Audit: DB trigger (`fn_IntroductionAudit`) + connection string'deki `zto.audit_actor` GUC'u — kopyada bu bağ korunmazsa `CreatedBy/UpdatedBy` boş kalır.
6. Finans menüsü ve view'ları finans dışı modüllere (Personnel, stok, eksper, masraf, Uyumsoft, reçeteli modül), layout'lar ise ChatHub/SignalR, ZtoAssistant, bildirim, PWA, destek talebi partial'larına bağımlı.
