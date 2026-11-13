# Envanter B — Banka, Kasa ve Finans Raporları grubu

Kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. Salt okunur analiz; yalnızca kodda görülenler yazıldı. Bulunamayanlar `⚠ BULUNAMADI` ile işaretli.
Yöntem notu: büyük dosyalar Grep/regex ile tarandı (action imzaları, `FROM/JOIN/INTO/UPDATE "Tablo"` kalıpları, `url:`/`Url.Action`/`'/X/Y'` literal'leri, `class="modal"` id'leri), kritik aralıklar okundu. Tablo listesi regex tabanlıdır: çok satırlı/virgüllü `FROM a, b` yazımları kaçmış olabilir (`⚠` — kopyalamadan önce her controller'da `"ZT_` araması ile doğrulayın).

## 0. Tüm grupta ortak olan altyapı (her parçada tekrar etmemek için)

### Yetki zinciri
| Katman | Dosya | Ne yapar |
|---|---|---|
| `[Authorize]` | ASP.NET Core cookie auth | Tüm controller'larda sınıf düzeyinde |
| `[UserRoleAuthorize(...)]` | `Services/UserRoleAuthorizeAttribute.cs:8-49` (global namespace) | `ClaimTypes.Role` claim'i izinli listede değilse `/Auth/Permission`; kimlik yoksa `/Account/Login`. Rol adı birebir karşılaştırılır |
| `[RequireFinancePersonnel]` | `Services/RequireFinancePersonnelAttribute.cs:11-28` | `FinanceAccess.MaySeeFinance(HttpContext)` false ise `/Auth/Permission`. Yalnız Patron'u daraltır: tenant'ta `ZT_FinancePerson` satırı yoksa Patron giremez |
| `FinanceAccess` | `Helpers/FinanceAccess.cs` | `MaySeeFinance`, `MaySeeFinanceMenu`, `HasFinancePersonnel` (`SELECT EXISTS (SELECT 1 FROM "ZT_FinancePerson")`, satır 139-141; `HttpContext.Items` önbelleği) |
| `FinanceRoleHelper.IsSuperUser` | `Helpers/FinanceRoleHelper.cs:22-67` | `Finans(super)` → süper; `Finans(normal)`/`Finans` → `ZT_FinancePerson.SuperStatus='süper'` ise süper; diğer roller → süper |
| `FrAccess.Allowed` | `Services/FinanceReport/FrAccess.cs` | Yalnız FinanceReport: Patron ise `Session["bossSuperStatus"]=="süper"` şartı |

Rol adları (kodda geçen): `Admin`, `Patron`, `Finans(normal)`, `Finans(super)`, `Finans` (ham rol; login'de `ZT_FinancePerson.SuperStatus`'a göre `Finans(super)`/`Finans(normal)`'a çevrilir — `Controllers/AccountController.cs:1417-1432`), `Muhasebe (Alış)`, `Satış Personeli`, `Lojistik`, `Üretim Müdürü`.

### Kiracı / DB bağlantısı
- Her action `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` ile kiracı DB'sine bağlanır (connection string Session'da tutulur; login'de `IntroductionAuditHelper.WithActor(...)` ile sarılır — `AccountController.cs:221`, `Helpers/IntroductionAuditHelper.cs:40-52`: `ApplicationName="ZtoFabrika"`, `Options="-c zto.audit_actor=<kullanıcı>"`).
- Merkezi (admin) DB: `GlobalVeriables.adminDatabase` (`Models/GlobalVeriables.cs`) — yalnız `Users` + `UserRoles` tablolarından rol okumak için (BankTransactions, BankAccounts, BankStatement, CashTransactions, Finance).
- Kullanılan Session anahtarları: `userDatabase`, `customerUserRole`, `customerUserKey`, `customerUserName`, `userRole`, `factoryName`, `databaseName`, `language`, `bossSuperStatus`, `customerQrKey`, `PaymentInstructionCreated`, `PendingInstructionData`. Session `IdleTimeout` 24 saat (`Program.cs:67-70`).
- DB açılamazsa `RedirectToAction("Closed","Home")`, genel hata `RedirectToAction("Error","Home")`.

### Veri erişim biçimi
Grubun tamamında **doğrudan controller içinde raw Npgsql** (`NpgsqlCommand` / `NpgsqlDataAdapter` + `DataTable`). Ayrı Warehouse/Repository sınıfı YOK. Tek istisna: FinanceReport (`FrService` + `FrWarehouse` + `FrSql`). ORM yok. Bazı eski sorgularda string birleştirme ile `userkey`/`id` SQL'e gömülüyor (ör. `BankIntroductionController.cs:56`, `BankAccountsController.cs:54,84,448,582`, `FinancePersonController.cs:483-508`).

### Ortak statik/servis bağımlılıkları
| Bağımlılık | Dosya | Kullanım |
|---|---|---|
| `Methods.LogAdd(Log, con)` | `Controllers/Methods.cs:334` → `INSERT INTO public."Log"("User","UserRole","Description","TableName","TableDataID","Process","Platform","CreationDate")` (satır 361-367) | Tüm yazma action'larında işlem logu |
| `Methods.ConvertToList<T>(DataTable)` | `Controllers/Methods.cs:15` | BankAccounts, Finance |
| `Log` modeli | `Models/Log.cs` | |
| `IDateTimeProvider` (`.Now`) | `Services/IDateTimeProvider.cs`, `Services/DateTimeProvider.cs`; DI singleton `Program.cs:63` | CreationDate vb. |
| `IDefinitionAuditService` + `DefinitionAuditRegistry` | `Services/IDefinitionAuditService.cs`, `Services/DefinitionAuditService.cs`, `Services/DefinitionAuditRegistry.cs:54-55,91` (`"cash"`, `"bank"`, `"finance-person"` tanımları) | BankIntroduction.Details, CashIntroduction.GetCashDetails; `ZT_IntroductionAccessSummary` tablosu |
| `IntroductionAuditHelper.GetActor` | `Helpers/IntroductionAuditHelper.cs:22` | `CreatedBy` değerleri (BankStatement, BankIntroduction) |
| `IntroductionAudit` ViewComponent | `Views/Shared/Components/IntroductionAudit/Default.cshtml` + `_IntroductionAuditCell*.cshtml`, `wwwroot/css/introduction-audit.css` | Kart/detaylarda "kim ekledi/güncelledi" |
| `ITCMBExchangeRateService` | `Services/ITCMBExchangeRateService.cs` (TCMB `today.xml`, `IMemoryCache` 1 saat; DI singleton `Program.cs:106`) | Yalnız FinancialBalanceSheet |
| `IMenuDesignService` | `Services/MenuDesignService.cs` (`@inject` ile view'larda) | Index view'larında menü tasarımı |
| `ScriptJson.Serialize` | `Helpers/ScriptJson.cs` | View'a gömülen JSON |
| `Localizer[...]` | view'larda yoğun | Çok dilli metinler |
| `CustomerAccountsController.GetApprovalStatusCounts(con)` | başka controller (statik) | BankIntroduction.Index rozet sayıları |

### Çalışma zamanı DB tetikleyicisi (kod dışı ama kritik)
`SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql` (+ `2026_09_03_..._Change_Guard.sql`, `2026_09_06_..._System_Columns.sql`): `ZT_CashIntroduction`, `ZT_BankIntroduction`, `ZT_FinancePerson`, `ZT_CashTransactions`, `ZT_BankTransactions` üzerinde `trg_IntroductionAudit` (BEFORE INSERT OR UPDATE → `public."fn_IntroductionAudit"()`), `CreatedBy/UpdatedDate/UpdatedBy/UpdateCount` kolonları `ADD COLUMN IF NOT EXISTS` ile eklenir; aktör `current_setting('zto.audit_actor')`'dan okunur (satır 39-43, 50-56, 110, 133-141, 181).

### Layout'lar ve layout'un dayattığı finans-dışı bağımlılık
- `_ProductionLayout.cshtml` (4005 satır), `_ExpertLayout.cshtml` (1934), `_Layout.cshtml` (2909), `_ReportLayout.cshtml` (31). `Views/_ViewStart.cshtml` varsayılanı `_Layout`.
- Index view'ları `ViewData["FinanceID"|"AccountingPurchasesID"|"LogisticsPersonID"|"ProductionManagerID"|"PatronID"] != "0"` ise `_ProductionLayout`, aksi halde `_Layout` seçer (ör. `Views/BankIntroduction/Index.cshtml:4-28`).
- **`_ProductionLayout` sohbet bileşeni `ViewBag.ProductionPlanningChat` bekler** → her finans Index action'ı `select * from "ZT_ProductionPlanning" order by "ID" desc` çalıştırır (üretim tablosu; lojistikte çıkarılmalı).
- Yan menü partial'ları: `Views/Shared/_CustomerSideMenus/_SideMenu_Finance.cshtml` (içinde `ZT_Setting` tablosundan `Name='Reçeteli Üretim'` okuyan raw Npgsql var, satır 5-25), `_SideMenu_FinanceItems.cshtml`, `_SideMenu_Patron.cshtml`, `_SideMenu_AccountingPurchases.cshtml`, `_SideMenu_Default.cshtml`, `_CustomerAccountNavMenus/_NavMenu_Patron.cshtml`.

### Şema kaynağı durumu
`SQL/` (17 dosya) ve `SQL_Migrations/` (64 dosya) içinde bu grubun ana tabloları için `CREATE TABLE` **yok**: `ZT_BankIntroduction`, `ZT_BankTransactions`, `ZT_BankTransfers`, `ZT_BankAccounts`, `ZT_CashIntroduction`, `ZT_CashTransactions`, `ZT_TimeDeposits`, `ZT_InterestCollections`, `ZT_FinIncomeExpense`, `ZT_BankPaymentInstructions`, `ZT_BankPaymentInstructionDetails`, `ZT_FinancePerson`, `Currency`, `Log` → `⚠ BULUNAMADI` (şema canlı DB'den `pg_dump --schema-only` ile alınmalı). Bulunanlar: `ZT_ExchangeBreakSource` (`SQL_Migrations/2026_04_25_create_ExchangeBreakSource.sql`), `ZT_AccountDebtsDeleteLog` (çalışma zamanı DDL, aşağıda), kredi kolonları (`SQL/KrediBankaCari_Migration.sql`: `ZT_CustomerAccounts.IsCreditBankAccount`, `ZT_CreditContracts.BankCustomerAccountID`, `ZT_AccountPayments.CreditInstallmentID/CreditContractID`).

---

## /BankIntroduction/Index

Dosya: `Controllers/BankIntroductionController.cs` (1604 satır) + `Models/BankInstitutionList.cs`.

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)")]`, `[RequireFinancePersonnel]` (satır 13-15). Hiçbir action'da `[ValidateAntiForgeryToken]` yok.

| Action | HTTP | Satır | Not |
|---|---|---|---|
| `Index(string type="")` | GET | 31 | Liste + istatistik; `type` = AccountType süzgeci |
| `GetAccountCards(string type="")` | GET | 270 | `PartialView("_AccountCardsListPartial")` |
| `Add()` | GET | 495 | |
| `Add(BankIntroduction model)` | POST | 515 | Yalnız `AccountType='Vadesiz'` oluşturur |
| `Edit(int id)` | GET | 588 | |
| `Update(BankIntroduction model)` | POST | 629 | Yalnız Vadesiz düzenlenir (646-668) |
| `Delete(int id)` | **GET** | 720 | Soft-delete; durum değiştiren GET |
| `CheckCanDelete(int id)` | GET (JSON) | 781 | |
| `Details(int id, CancellationToken)` | GET | 910 | |
| `Sparklines(string ids)` | GET (JSON) | 986 | Banka başına son 20 hareket delta'sı |
| `GetBankInstructionData(int bankId)` | GET (JSON) | 1199 | |
| `GetCustomerAccountsForInstruction()` | GET (JSON) | 1246 | |
| `GetCustomerIbans(int customerAccountId, int? currencyId)` | GET (JSON) | 1283 | |
| `SaveBankInstruction([FromBody] BankInstructionViewModel)` | POST (JSON) | 1342 | Banka ödeme talimatı |

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/BankIntroduction/Index.cshtml` (3347 satır) | `_ProductionLayout` / `_Layout` (ViewData ID'lerine göre) | `deleteModal` (1208), `bankInstructionModal` (1244) |
| `_AccountCardsListPartial.cshtml` (367) | — | — (ViewComponent `IntroductionAudit`) |
| `Add.cshtml` (253), `Edit.cshtml` (334) | `_ExpertLayout` | — |
| `Details.cshtml` (538) | `_ExpertLayout` | `deleteModal` (509) |

Index'in çağırdığı partial'lar: `_AccountCardsListPartial`, `_CustomerSideMenus/_SideMenu_Finance.cshtml`, `_CustomerSideMenus/_SideMenu_Patron.cshtml`, `_CustomerAccountNavMenus/_NavMenu_Patron.cshtml`.

### JS/CSS
- Yerel: `~/css/zt/timedeposits/index.css` (Index, Details), `~/css/introduction-audit.css` (Details).
- CDN: select2 4.1.0-rc.0 (js+css, jsdelivr), select2-bootstrap-5-theme 1.3.0 (Index); jQuery 3.6.0 (code.jquery.com — Add/Edit).
- Inline script ağırlıklı (Index: 3 `<script>` + 2 `<style>` bloğu; ayrı .js dosyası yok).

### AJAX uçları → Action
| URL | Hedef |
|---|---|
| `/BankIntroduction/Sparklines` | kendi |
| `Url.Action("CheckCanDelete")`, `/BankIntroduction/Delete` | kendi |
| `GetBankInstructionData`, `GetCustomerAccountsForInstruction`, `GetCustomerIbans`, `SaveBankInstruction` | kendi |
| `GetAccountCards` | kendi (`⚠` view'da literal olarak yakalanmadı; action mevcut — çağıran JS'i doğrulayın) |

### Service / Warehouse
Raw Npgsql controller içinde. `Methods.LogAdd` (4 yer), `_definitionAuditService.OpenDetailsAsync` (937), `DefinitionAuditRegistry.TryGet("bank")` (935), `IntroductionAuditHelper.GetActor` (1348), `CustomerAccountsController.GetApprovalStatusCounts` (223), `GlobalVeriables.adminDatabase` (bağlantı nesnesi oluşturulur, 36).

### Model / DTO / ViewModel
`Models/ZT/BankIntroduction.cs` (ID, BankCode, BankName, BranchName, AccountNumber, Iban, CurrencyID, Balance, InitialBalance, Description, Bank, Status, CreationDate, WorkPlaceID, BranchProvinceID, AccountType, LinkedCreditID, CreditLimit, UsedCredit + görüntü alanları), `Models/ViewModels/BankCurrencyStatViewModel.cs`, `Models/ViewModels/StatisticGroupViewModel.cs`, `Models/ZT/BankPaymentInstruction.cs` (`BankPaymentInstruction`, `BankPaymentInstructionDetail`, `BankInstructionViewModel`, `PaymentPlanRow`), controller dosyası sonunda `BankStatsDto` (1574), `TransactionCheckResult` (1587), `BankTransactionDto` (1593). `Models/BankInstitutionList.cs`: 25 Türk bankasının sabit adı (`BankInstitutionList.All`) — `Bank` alanı seçim listesi.

### SQL nesneleri
| Tablo | R/W | Satır | Kolonlar (INSERT/UPDATE'ten) |
|---|---|---|---|
| `ZT_BankIntroduction` | R/W | 357, 527, 655, 747, 1047, 1209 | INSERT: BankCode, BankName, BranchName, AccountNumber, Iban, CurrencyID, Balance, InitialBalance, Description, Status, CreationDate, WorkPlaceID, BranchProvinceID, AccountType, Bank. Okunan ek: LinkedCreditID, CreditLimit, UsedCredit |
| `ZT_BankTransactions` | R | 321-355, 820, 1012 | BankID, Amount, TransactionType, AccountingType, TransactionDate, Status |
| `ZT_BankAccounts` | R/W | 1292, 1362, 1405 | INSERT: AccountHolderName, AccountNumber, IBAN, BankName, BranchName, AccountType, CurrencyID, AccountOpenDate, LastTransactionDate, Status, CreationDate, TypeAccount, ReferenceID, Description, AccountCategory |
| `ZT_BankPaymentInstructions` | W | 1440 | BankID, InstructionDate, TotalAmount, CurrencyID, InstructionStatus, BranchProvinceID, WorkPlaceID, Description, RemainingBankBalance, Status, CreationDate, CreatedBy |
| `ZT_BankPaymentInstructionDetails` | W | 1467 | InstructionID, CustomerAccountID, CustomerIban, PaymentDate, Amount, CurrencyID, Description, PaymentStatus, Status, CreationDate |
| `ZT_CustomerAccountPaymentPlans` | W | 1478 | CustomerAccountID, SourceType, SourceID, PaymentPlanDate, PaymentAmount, PaymentPlanCurrencyID, PaymentDescription, PaymentBranchProvinceID, PaymentWorkPlaceID, PaymentBankID, PaymentStatus, PlanningStatus, ApprovalStatus, Status, CreationDate, CreatedBy |
| `ZT_CustomerAccounts` | R | 1254, 1293, 1392 | ID, AccountCode, AccountName, ReferenceID, AccountGroup, Status |
| `ZT_CreditContracts` | R | 307, 859, 1051 | ContractCode, BankID, Status |
| `ZT_TimeDeposits` | R | 309, 872 | DepositCode, BankAccountID, SourceBankID, Status |
| `ZT_Investments` | R | 311, 885 | InvestmentCode, BankAccountID, SourceBankID, Status |
| `ZT_AccountPayments`, `ZT_AccountCollections` | R | 833, 846 | BankID (silme kontrolü) |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | 358-360, 1101-1124 | |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R | 56-172 | Rol başlığı (Key ile) |
| `ZT_ProductionPlanning` | R | 253 | Layout sohbet bileşeni |
| `Log` | W | LogAdd | |
Çalışma zamanı DDL: yok. View/function/sequence çağrısı: yok (`RETURNING "ID"` kullanılır).

### Bağlı finans sayfaları
`/BankTransactions/Index`, `/BankStatement/Index`, `/BankStatement/BankExtract`, `/CashIntroduction/Index`, `/CustomerAccounts/Index`, `/PaymentApproval/Index`, `/CreditContracts/Index|Details`, `/Investments/Index`, `/TimeDeposits/Index`, `/Checks/Checks`.

### Finans dışı bağımlılıklar
- `ZT_ProductionPlanning` (253) — layout sohbeti.
- Rol tabloları `ZT_LogisticsPerson`, `ZT_ProductionManager`, `ZT_AccountingPurchases`, `ZT_Boss` (rol başlığı; izinli roller arasında Lojistik/Üretim Müdürü olmadığı halde dalları duruyor — ölü dal).
- `CustomerAccountsController.GetApprovalStatusCounts` (başka controller'a statik bağımlılık).

### Yetki / iş yeri
- Giriş: Patron (yalnız tenant'ta finans personeli varsa), Admin, Finans(normal), Finans(super).
- **İş yeri filtresi uygulanmıyor**: `GetBankAccounts` (289-433) tüm aktif bankaları döndürür; `ViewData["WorkPlaceID"]` yalnız başlık içindir.
- **Sürpriz**: rol dalı `== "Finans"` ile karşılaştırıyor (111) ama claim/Session rolü `Finans(normal)`/`Finans(super)` olduğundan bu dal çalışmaz → `else` dalına düşer, `FinanceID="0"`, `WorkPlaceID="0"` (192-208) → view `_Layout` seçer.

### İş kuralları
- Güncel bakiye = `InitialBalance + TotalIncome − TotalExpense`; saklı `Balance` kolonu kullanılmaz (393-398). Giriş: `AccountingType='Çek Tahsil'` veya `TransactionType='Giriş'` veya (tür boş ve Amount>0); çıkış simetrik (`Çek Ödeme`/`Çıkış`) (314-335).
- İleri tarihli (yarın ve sonrası) hareketler bakiyeye dahil değil; `FutureCount`/`FutureNet` ayrı gösterilir (336-356).
- Fan-out düzeltmesi: mevduat/yatırım/kredi bağlantıları skaler alt sorgu (291-299).
- Sıralama: Vadesiz, Kredi, Mevduat, Yatirim (371-379). Hesap türleri: `Vadesiz`, `Kredi`, `Mevduat`, `Yatirim`.
- Silme = soft-delete `Status=false`; önce 6 bağımlılık kontrolü (banka işlemi, ödeme, tahsilat, kredi sözleşmesi, vadeli mevduat, yatırım) (814-902).
- Banka talimatı: manuel IBAN mükerrer kontrolü → `ZT_BankAccounts`'a ekle → talimat (`'Onay Bekliyor'`) → detay (`'Beklemede'`) → ödeme planı (`SourceType='Talimatlı Plan'`, `PlanningStatus='Planlama Yapıldı'`, `ApprovalStatus='Onay Bekliyor'`; tarih geçmişse `'Gecikmiş'`) — tek transaction (1379-1529).

### Dosya yükleme / Excel / PDF
Yok.

---

## /BankTransactions/Index

Dosya: `Controllers/BankTransactionsController.cs` (2214 satır).

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli","Patron")]` (15-16). `[RequireFinancePersonnel]` YOK.

| Action | HTTP | Satır | Antiforgery |
|---|---|---|---|
| `Index(int? bankId, int? workPlaceId, int? currencyId, bool openModal, bool fromInstruction)` | GET | 31 | |
| `GetBanksByAccountType(string accountType)` | GET | 402 | |
| `ActivityReport(int bankId, DateTime? startDate, DateTime? endDate)` | GET (View) | 464 | |
| `GetTransactions(bankId, workPlaceId, transactionType, accountingType, startDate, endDate)` | GET | 990 | |
| `GetTransactionDetail(int id)` | GET | 1140 | |
| `GetBankBalances(startDate, endDate)` | GET | 1232 | |
| `GetBankDetailInfo(int bankId, startDate, endDate)` | GET | 1352 | |
| `AddTransaction(...)` | POST | 1492 | `[ValidateAntiForgeryToken]` |
| `DeleteTransactionCascade(int id)` | POST | 1571 | `[ValidateAntiForgeryToken]` |
| `DeleteTransaction(int id)` | POST | 1671 | `[ValidateAntiForgeryToken]` |
| `GetBankList()` | GET | 1780 | |
| `GetSingleBankBalance(int bankId)` | GET | 1846 | |
| `PostponeInstructionPayment(int paymentPlanId)` | POST | 1987 | `[ValidateAntiForgeryToken]` |
| `PostponeMultipleInstructionPayments([FromBody])` | POST | 2044 | `[ValidateAntiForgeryToken]` |
| `CalculateFilteredSummary([FromBody])` | POST | 2110 | `[ValidateAntiForgeryToken]` |
| `ClearInstructionSession()` | POST | 2178 | `[ValidateAntiForgeryToken]` |
| `CheckInstructionSessionExists()` | GET | 2197 | |
| `public static bool CreateBankTransaction(con, bankId, transactionType, accountingType, referenceId, amount, currencyId, transactionDate, description, IDateTimeProvider)` | — (statik yardımcı, 1740) | action değil ama public: MVC bunu route'a açar mı — statik olduğu için action sayılmaz |

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/BankTransactions/Index.cshtml` (5680 satır, 322 KB) | `_ProductionLayout` / `_Layout` | `allPaymentsCompletedModal` (487), `transactionDetailModal` (532), `activityReportModal` (576), `instructionPaymentSelectionModal` (661) + partial'lardan `addPaymentModal`, `postPaymentPlanningModal`, `addCollectionModal`, `editCollectionModal` |
| `ActivityReport.cshtml` (942) | `_ProductionLayout` / `_Layout` | — |

Partial'lar: `Views/Shared/_AddPaymentModal.cshtml` (1197 satır; içinde `_CheckLeafGuard` partial'ı), `Views/Shared/_PostPaymentPlanningModal.cshtml`, **`~/Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml`** (1533 satır, başka controller'ın klasörü), `_SideMenu_Finance`, `_SideMenu_Patron`. Sayfa başında `@Html.AntiForgeryToken()` (29).

### JS/CSS
- Yerel JS: `~/js/zt/payments/payments.js` (7644 satır), `~/js/zt/banktransactions/BankTransactionsPayments.js` (7582; **iki kez** include: 3941 ve 5620), `~/js/zt/banktransactions/BankTransactionsCollections.js` (7035), `~/js/zt/payments/searchable-select.js` (424), `~/js/zt/collections/searchable-select.js` (463).
- Yerel CSS: `~/css/zt/banktransaction/index.css`, `~/css/zt/customeraccountcollection/collections.css`, `~/css/zt/customeraccountpayment/payments.css`.
- CDN: DataTables 1.13.7 (+bootstrap4, responsive 2.5.0, buttons 2.4.2 + html5), JSZip 3.10.1 (cdnjs).
- 8 inline `<script>` + 3 `<style>` bloğu; hem inline hem harici JS ağır.

### AJAX uçları → Action
| URL | Hedef controller |
|---|---|
| `GetTransactions`, `GetTransactionDetail`, `GetBankBalances`, `GetBankDetailInfo`, `GetBanksByAccountType`, `GetSingleBankBalance`, `DeleteTransactionCascade`, `ActivityReport`, `PostponeInstructionPayment`, `PostponeMultipleInstructionPayments`, `ClearInstructionSession`, `CheckInstructionSessionExists` | BankTransactions (kendi) |
| `AddCollection`, `UpdateCollection`, `DeleteCollection`, `ConfirmDeleteCollection`, `GetCollectionList`, `GetCollectionDetail`, `GetCollectionForUpdate`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `GetAvailableCurrenciesForCollection`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`, `GetCustomerCreditSummary`, `GetCustomerOrders` | **CustomerAccountCollection** (başka controller) |
| `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `SaveQuickPaymentPlanning`, `GetEndorsableChecks`, `GetGardenPaymentHistory`, `GetSupplierGardens`, `GetMatchingChecks`, `MatchPaymentWithCheck`, `/CustomerAccountPayment/Payments` | **CustomerAccountPayment** (başka controller) |
| `GetAccountBalancesByCurrency`, `GetAllCurrenciesForPlan`, `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning` | **CustomerAccounts** |
| `UpdateInstructionStatusToCompleted` | **PaymentApproval** |
| `/AccountTransaction/Transactions`, `GetAvailableCurrencies`, `GetWorkPlaceBalances` | **AccountTransaction** |
| `/PaymentManagement/GetCustomerDebtSummary` | **PaymentManagement** |
`AddTransaction` ve `DeleteTransaction` action'ları mevcut ancak view/JS taramasında çağrı bulunmadı (`⚠` — ölü olabilir).

### Service / Warehouse
Raw Npgsql. `Methods.LogAdd` (3), `ScriptJson.Serialize` (298), `GlobalVeriables.adminDatabase` (38), `IsCurrentUserSuperStatus()` (1820; `ZT_FinancePerson.SuperStatus`). Statik `CreateBankTransaction` **başka 11 controller tarafından çağrılır**: AccountTransaction (6702), Bills (1206,1248), Checks (1614), CreditContracts (1647), CustomerAccountCollection (951,1080,1290,2690,2972), CustomerAccountPayment (1885,2465), PaymentManagement (1381), PersonnelAdditionalPayment (402), PersonnelAdvance (325), PersonnelSalary (2558,3237).

### Model / DTO
Controller içi: `FIFOEntry` (946), `UsedEntry` (959), `FIFOMatch` (970), `PostponeMultipleRequest` (2099), `FilteredTransactionsRequest` (2157), `TransactionItem` (2163). View modeli yok (ViewBag/ViewData).

### SQL nesneleri
| Tablo | R/W | Satır | Kolonlar |
|---|---|---|---|
| `ZT_BankTransactions` | R/W | 568, 1023, 1169, 1424, 1515, 1583, 1610, 1696, 1747 | INSERT: BankID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, TransactionKind, Status, CreationDate |
| `ZT_BankIntroduction` | R | 196, 355, 419, 502, 1277, ... | |
| `ZT_AccountCollectionOrders` | **DELETE** | 1624 | AccountCollectionID |
| `ZT_AccountCollections` | R + **DELETE (hard)** | 1028, 1632 | |
| `ZT_AccountPayments` | R | 1027 | |
| `ZT_CustomerAccounts` | R | 260, 1029 | AccountGroup listesi (263-265) |
| `ZT_CustomerAccountPaymentPlans` | W (UPDATE ApprovalStatus) | 1997, 2061 | |
| `ZT_BankPaymentInstructionDetails` | (yorum satırı) | 2011 | |
| `ZT_CashIntroduction` | R | 338 | |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | | |
| `ZT_FinancePerson`, `ZT_Boss` | R | 100, 126, 154, 1830 | |
| admin DB: `Users`, `UserRoles` | R | 86-88 | |
| `ZT_ProductionPlanning` | R | 78 | layout sohbeti |
| `Log` | W | | |
Çalışma zamanı DDL: yok.

### Bağlı finans sayfaları
`/BankIntroduction/Index`, `/CashIntroduction/Index`, `/CashTransactions/Index`, `/CustomerAccounts/Index`, `/AccountTransaction/Transactions`, `/CustomerAccountPayment/Payments`, `/BankStatement/Index`.

### Finans dışı bağımlılıklar
- `ZT_ProductionPlanning` (78).
- View üst menüsünde üretim/satış sayfalarına sabit linkler: `/Boss/LiveMonitor`, `/SalesProductLogistic/index`, `/expertchef/index`, `/expertreport/allreports`, `/orderheader/index`, `/productioncost/index`, `/productionplanning/index`, `/readystock/index`, `/specialReport/index`, `/warehousesituation/index` (Index ve ActivityReport).
- Cari grup sabitleri (263-265): `'Tedarikçi','Müşteri','Nakliye Firması','Sevk Nakliye Firması','Kesim Çavuşu','Üretim Çavuşu','Malzeme Tedarikçisi','İlaç Tedarikçisi','Analiz Firması','İş Yeri Firması','Masraf Hesabı','Personel'` — sektöre özgü.
- JS: `GetCustomerOrders` (sipariş), `GetGardenPaymentHistory`, `GetSupplierGardens` (bahçe) uçları.
- Maaş muhasebe tipleri (`Net Maaş`, `elden maaş`) — personel modülü.

### Yetki / iş yeri
- Rol tespiti admin DB'den (`Users`→`UserRoles`), `Role=="Finans"` ise `ZT_FinancePerson` okunur (95-121); Patron için `ZT_Boss` (149-157).
- İş yeri filtresi **isteğe bağlı parametre**: `GetTransactions` `workPlaceId` verilirse `b."WorkPlaceID" = @WorkPlaceID` (1039-1041); sunucu kullanıcıyı kendi iş yerine zorlamaz.
- Süper olmayan kullanıcıya maaş hareketlerinin tutarı `"***"` olarak maskelenir (1097-1114, 1182-1198).

### İş kuralları
- Banka listesi: `Status=true AND (AccountType='Vadesiz' OR ID=@SelectedBankId)` (194-199).
- İşlem türleri `Giriş`/`Çıkış`; muhasebe tipleri sabit liste (216-234).
- `DeleteTransactionCascade`: banka hareketi soft-delete; `AccountingType='Cari Tahsilat'` ise bağlı `ZT_AccountCollectionOrders` ve `ZT_AccountCollections` **hard delete** (1608-1637). `Cari Ödeme` için eşdeğer temizlik yok.
- `DeleteTransaction`: yalnız soft-delete (1696).
- `ApplyFIFOMatching` (747-945): başlangıç bakiyesi + girişler FIFO kuyruğu, çıkışlar en eski girişten düşer (ActivityReport).
- Talimat akışı: `Session["PendingInstructionData"]` (PaymentApprovalController yazar, `PaymentApprovalController.cs:18`), `fromInstruction=true` ile okunur (43-60); erteleme `ApprovalStatus='Talimat Verildi'` (1996-1999).
- `CreateBankTransaction` statik: transaction parametresi almaz, `bool` döner (1740-1776).

### Dosya yükleme / Excel / PDF
Sunucu tarafı yok. İstemci: `exportToExcel()` aslında `;` ayraçlı CSV (BOM'lu) üretir (`Index.cshtml:5146-5190`); `window.print()`. DataTables Buttons + JSZip yüklü.

---

## BankAccountsController

Dosya: `Controllers/BankAccountsController.cs` (718 satır). Cari/tedarikçi/müşteri **karşı taraf IBAN kartları** (şirketin kendi banka hesabı değil).

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]` (12-13).

| Action | HTTP | Satır |
|---|---|---|
| `Index(int referenceID=0, string typeAccount="", string supplierName="")` | GET | 23 |
| `Add(referenceID, typeAccount, supplierName)` | GET | 241 |
| `Add(BankAccounts, referenceID, typeAccount, supplierName)` | POST | 286 |
| `Edit(string id, ...)` | (öznitelik yok → her fiil) | 406 |
| `Update(BankAccounts, ...)` | (öznitelik yok) | 488 |
| `Delete(int id, ...)` | GET | 568 (Status toggle) |
Controller'da `[ValidateAntiForgeryToken]` yok; view'lar token gönderiyor (`Add.cshtml:122`, `Edit.cshtml:97`, `Index.cshtml:673-679`) ama sunucu doğrulamıyor.

### View + modal
`Views/BankAccounts/Index.cshtml` (707; `_ProductionLayout`/`_Layout`; modal `confirmationModal` @604), `Add.cshtml` (308), `Edit.cshtml` (295) (`_ExpertLayout`). `@model List<ZtoFabrika.Models.ZT.BankAccounts>`.

### JS/CSS
CDN jQuery 3.6.0; inline script. Yerel dosya yok.

### AJAX uçları
`/BankAccounts/Delete`, `/BankAccounts/Index`, `/bankaccounts/add`, `/bankaccounts/edit` (kendi).

### Service
Raw Npgsql; `Methods.ConvertToList<BankAccounts>` (206), `Methods.LogAdd` (388, 554, 634), `GlobalVeriables.adminDatabase` (26).

### Model
`Models/ZT/BankAccounts.cs`: ID, AccountHolderName, AccountNumber, IBAN, BankName, BranchName, AccountType, CurrencyID, AccountOpenDate, LastTransactionDate, Status, CreationDate, TypeAccount, ReferenceID, Description, AccountCategory.

### SQL nesneleri
| Tablo | R/W | Satır |
|---|---|---|
| `ZT_BankAccounts` | R/W | 180, 313, 329 (INSERT), 353, 448, 502 (UPDATE), 582-596 |
| `Currency` | R | 213 |
| **`ZT_Currency`** | R | 251, 431 — başka yerde `Currency` kullanılıyor; iki ayrı tablo adı (`⚠` `ZT_Currency` tablosunun varlığı doğrulanamadı; hata durumunda `CreateDefaultCurrencyTable()` 702'ye düşüyor olabilir) |
| `ZT_Boss`, `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | 54-124 |
| admin: `Users`, `UserRoles` | R | 84 |
| dinamik: `ZT_Supplier`, `ZT_Customer`, `ZT_Transport`, `ZT_CuttingChief`, `ZT_TransportCompany` | R | 648-683 (`GetReferenceName`) |
| `Log` | W | |

### Bağlı finans sayfaları
`/customeraccounts/index`. `ZT_BankAccounts` ayrıca BankIntroduction talimat akışı tarafından okunur/yazılır.

### Finans dışı bağımlılıklar
`GetReferenceName` (648-697): `TypeAccount`'a göre `ZT_Supplier`/`ZT_Customer`/`ZT_Transport`/`ZT_CuttingChief`/`ZT_TransportCompany` adlarını okur (üretici, kesim çavuşu → bahçe/üretim). Hata yutulur (`catch` → metin). View menüsünde üretim linkleri (Boss/LiveMonitor vb.).

### Yetki / iş yeri
İş yeri filtresi yok; liste `Status=true` + (`referenceID`/`typeAccount` süzgeci).

### İş kuralları
IBAN tekilliği `SELECT COUNT(*) ... WHERE "IBAN"=@IBAN` (313); `Delete` aslında aktif/pasif toggle (582-596); kayıt `TypeAccount`+`ReferenceID` ile cariye bağlanır (BankIntroduction `GetCustomerIbans` eşlemesi: `ca.ReferenceID = ba.ReferenceID AND ca.AccountGroup = ba.TypeAccount`, 1293-1295).

### Dosya / Excel / PDF
Yok.

---

## /BankStatement/Index

Dosya: `Controllers/BankStatementController.cs` (6484 satır). Adı "ekstre" ama asıl işlevi **transfer merkezi**: Virman / EFT / Havale / Döviz Bozum / Banka↔Kasa / Kasa↔Kasa + banka ve kasa ekstresi.
**Banka ekstresi dosyası içe aktarma / eşleştirme (MT940, Excel upload vb.) YOK** — `IFormFile` kullanımı sıfır.

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Patron")]` (15-16). Hiçbir POST'ta `[ValidateAntiForgeryToken]` yok (JS bir çağrıda token başlığı gönderiyor: `index.js:3608`).

| Action | HTTP | Satır |
|---|---|---|
| `Index()` | GET | 27 |
| `GetBanksByWorkPlace(int workPlaceId)` | GET | 188 |
| `GetWorkPlacesByBranch(int branchProvinceId)` | GET | 287 |
| `GetCashesByWorkPlace(int workPlaceId)` | GET | 329 |
| `CreateTransfer([FromBody] BankTransferDto)` | POST | 392 |
| `CreateVirman(...)` | POST | 1297 (eski, geriye uyum) |
| `GetTransfers(workPlaceId, bankId, transferType, ...)` | GET | 1329 |
| `GetTransferSummary(workPlaceId, startDate, endDate)` | GET | 1592 |
| `GetTransferForEdit(int transferId)` | GET | 1798 |
| `UpdateTransfer([FromBody] BankTransferEditDto)` | POST | 1985 |
| `CheckExchangeBreakDependencies(int transferId)` | GET | 2548 |
| `DeleteTransfer([FromBody] BankTransferDeleteDto)` | POST | 2608 |
| `CleanupDuplicateCariRecords()` | POST | 2773 |
| `SyncTransferToCari([FromBody] SyncTransferCariDto)` | POST | 2927 |
| `GetStatementCount`, `GetCashStatementCount` | GET | 3188, 3220 |
| `GetStatement(workPlaceId, bankId, currencyId, startDate, endDate, textSearch...)` | GET | 3252 |
| `GetCashStatement(...)` | GET | 3430 |
| `GetSummaryCards(...)` | GET | 3496 |
| `GetBankBalances()` | GET | 3575 |
| `GetCollectionsForExchange(customerAccountId, currencyId, sourceBankId)` | GET | 4767 |
| `GetCollectionOrders(int collectionId)` | GET | 4987 |
| `GetCollectionDetailForExchange(int collectionId)` | GET | 4997 |
| `GetCustomerAccountsWithForeignCollections(currencyId, sourceBankId)` | GET | 5082 |
| `BankExtract(int bankId, string? startDate, string? endDate)` | GET (View) | 5407 |
| `GetPreviousBreaksForSource(int sourceBankId, int currencyId)` | GET | 5574 |
| `ExchangeBreakReport(startDate, endDate)` | GET (View) | 5657 |
| `GetExchangeBreakData(startDate, endDate)` | GET | 5676 |

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/BankStatement/Index.cshtml` (2843) | `_ProductionLayout` | `exchangeBreakReportModal` (855), `bulkSyncCariModal` (1211), `editDovizBozumModal` (1869), `editVirmanModal` (2120), `editEftModal` (2221), `editHavaleModal` (2322), `editBankToCashModal` (2423), `editCashToBankModal` (2524), `editCashToCashModal` (2625), `deleteTransferModal` (2722), `transferResultModal` (2777), `negativeBalanceConfirmModal` (2800) |
| `BankExtract.cshtml` (782) | `Layout = null` (yazdırılabilir tek sayfa) — `@model ZtoFabrika.Models.ViewModels.BankExtractViewModel` | — |
| `ExchangeBreakReport.cshtml` (1578) | `_ExpertLayout` | — |
Partial: `_SideMenu_Finance.cshtml`.

### JS/CSS
- Yerel: `~/js/zt/bankstatement/index.js` (4659 satır — sayfanın tüm mantığı burada; Index'te inline script yok), `~/css/zt/bankstatement/index.css`.
- select2 kullanımı yoğun (view'da 171 referans) ama view içinde CDN etiketi yok → layout'tan geliyor (`⚠` `_ProductionLayout`'ta select2 yüklemesi ayrıca doğrulanmadı).

### AJAX uçları → Action (index.js)
Tamamı `/BankStatement/*`: `CreateTransfer`, `UpdateTransfer`, `DeleteTransfer`, `GetTransferForEdit`, `GetTransfers`, `GetTransferSummary`, `GetStatement`, `GetStatementCount`, `GetCashStatement`, `GetCashStatementCount`, `GetSummaryCards`, `GetBankBalances`, `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetCollectionsForExchange`, `GetCollectionDetailForExchange`, `GetCustomerAccountsWithForeignCollections`, `GetPreviousBreaksForSource`, `CheckExchangeBreakDependencies`, `CleanupDuplicateCariRecords`, `SyncTransferToCari`, `ExchangeBreakReport`. `ExchangeBreakReport.cshtml` → `/BankStatement/GetExchangeBreakData`.
Başka controller'a giden yalnız link: `/AccountTransaction/Transactions`, `/BankTransactions/Index`, `/CashTransactions/Index`.
View/JS'te çağrısı bulunmayan action'lar: `CreateVirman`, `GetWorkPlacesByBranch`, `GetCollectionOrders` (`⚠` ölü olabilir).

### Service / Warehouse
Raw Npgsql, tek transaction'lı uzun metotlar. `Methods.LogAdd` (2), `IntroductionAuditHelper.GetActor` (6), `GlobalVeriables.adminDatabase`. Banka/kasa hareketlerini **kendi private** `InsertBankTransaction` (4158) / `InsertCashTransaction` (4131) ile yazar (BankTransactionsController'ın statik metodunu kullanmaz).

### Model / DTO
- Controller dosyası sonunda (namespace `ZtoFabrika.Controllers`): `BankTransferDto` (6396), `CollectionOrderExchange` (6442), `ExchangeBreakSourceItem` (6448), `BankTransferEditDto` (6455), `BankTransferDeleteDto` (6479); iç sınıf `SyncTransferCariDto` (2921).
- Private iç sınıflar: `BankInfo` (5196), `StatementEntry` (5209), `CashInfo` (5226), `CashStatementEntry` (5239), `BankTransferRecord` (5256), `CostCalculationResult` (5308), `CollectionOrderInfo` (5383).
- **Çift tanım**: `Models/ZT/BankTransferDto.cs` içinde de `BankTransferDto` (8), `BankTransferRecord` (99), `BankInfo` (135) var (namespace `ZtoFabrika.Models.ZT`). Controller hangisini bağladığı namespace çözümüne bağlı — kopyalamada ikisi de taşınmalı/temizlenmeli.
- `Models/ViewModels/BankExtractViewModel.cs` (`BankExtractViewModel`, `BankExtractRowViewModel`).

### SQL nesneleri
| Tablo | R/W | Satır (örnek) | Kolonlar |
|---|---|---|---|
| `ZT_BankTransfers` | R/W | INSERT 3721; UPDATE 1149, 2225, 2723, 3812 | TransferCode, TransferType, TransferDate, SourceBankID, SourceWorkPlaceID, SourceBranchProvinceID, SourceCurrencyID, SourceAmount, TargetBankID, TargetWorkPlaceID, TargetBranchProvinceID, TargetCurrencyID, TargetAmount, ExchangeRate1, ExchangeRate2, IsCrossRate, EffectiveRate, SourceRate, CalculationOperation, CostBankID, CostCurrencyID, KMVBankID, CommissionAmount, CommissionCurrencyID, CommissionAmountTRY, CommissionExchangeRate, TransferFee, TransferFeeCurrencyID, TransferFeeTRY, TransferFeeExchangeRate, KMVAmount, KMVRate, KMVBaseAmount, BankCharges, BankChargesTRY, BankChargesExchangeRate, TotalCost, TotalCostTRY, TotalCostOriginal, TotalCostCurrencyID, ReferenceID, Description, DocumentNo, Status, ApprovalStatus, CreatedBy, CreationDate (3721-3747) + CollectionID (1150), SourceTransactionID, TargetTransactionID, CostTransactionID, KMVTransactionID (3808-3813) |
| `ZT_BankTransactions` | R/W | INSERT 4162; UPDATE 2285, 2296, 3834, 3883 | BankID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, Status, CreationDate |
| `ZT_CashTransactions` | R/W | INSERT 4135; UPDATE 2312, 2326, 2691, 3858 | CashID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, Status, CreationDate |
| `ZT_ExchangeBreakSource` | R/W/DELETE | 1222, 2471, 2708 | ExchangeBreakId, SourceType, SourceId, UsedAmount |
| `ZT_AccountPayments` | R/W/DELETE | INSERT 6310; UPDATE 2352, 6205; DELETE 2833, 2841 | CustomerAccountID, PaymentDate, PaymentMethod, WorkPlaceID, CashID, BankID, Amount, CurrencyID, ExchangeRate, PaymentDocumentNo, Description, CheckID, BillID, CreationDate, CreatedBy, PaymentStatus, IsReconciled |
| `ZT_AccountCollections` | R/W/DELETE | INSERT 6360; UPDATE 1195, 2147, 2371, 4011, 6228; DELETE 2873, 2880 | CustomerAccountID, CollectionDate, CollectionMethod, WorkPlaceID, CashID, BankID, Amount, CurrencyID, ExchangeRate, CollectionDocumentNo, Description, CheckID, BillID, CollectionType, CollectionStatus, IsReconciled, CreationDate, CreatedBy + ExchangedAmount, RemainingExchangeAmount, ExchangeStatus (1196-1201) |
| `ZT_AccountCollectionOrders` | R/W | UPDATE 1168, 2110, 3997, 4107 | IsExchanged, ExchangeDate, ExchangeTransferID, ExchangedAmount, AccountCollectionID, OrdersID, Amount |
| `ZT_CustomerAccounts` | R | 5965 ... | AccountGroup='İş Yeri Firması', ReferenceID=WorkPlaceID |
| `ZT_BankIntroduction`, `ZT_CashIntroduction` | R | | |
| `ZT_Orders`, `Product`, `SubProduct`, `Customer` | R | 1347, 4926-4929, 5727, 5899 | sipariş adı/ürün/müşteri |
| `Currency` (`Code` kolonu dahil), `ZT_WorkPlace`, `ZT_BranchProvince` | R | | |
| `ZT_FinancePerson`; admin `Users`, `UserRoles` | R | 61-78 | |
| `ZT_ProductionPlanning` | R | 54 | layout |
| `Log` | W | | |
CTE adları (tablo değil): `CariSourceDescs`, `CariTargetDescs`, `OrderParts`, `OpeningBalance`, `filtered_collections`.
Çalışma zamanı DDL: yok. `ZT_ExchangeBreakSource` DDL'i ayrı migration dosyasında.

### Bağlı finans sayfaları
`/BankIntroduction/Index`, `/BankTransactions/Index`, `/CashIntroduction/Index`, `/CashTransactions/Index`, `/CustomerAccounts/Index`, `/AccountTransaction/Transactions`.

### Finans dışı bağımlılıklar
- **Sipariş bazlı döviz bozumu**: `ZT_AccountCollectionOrders` → `ZT_Orders` → `Product`, `SubProduct`, `Customer` (4908-4931, 5723-5730, 1346-1347, 5899). Tahsilatın hangi siparişe ait olduğu ve sipariş bazında "bozuldu" işareti tutuluyor. Lojistikte "sipariş" yerine "sefer/iş emri" eşlemesi gerekir ya da bu kısım çıkarılır.
- `ZT_ProductionPlanning` (54).
- `/customeraccounts/index` dışında üretim linki yok.

### Yetki / iş yeri
- Rol başlığı: admin DB `Users/UserRoles`, `Role=="Finans"` → `ZT_FinancePerson` (61-91).
- İş yeri filtresi **istemci parametresi**: `GetBanksByWorkPlace` (224: `b."WorkPlaceID"=@WorkPlaceID AND b."AccountType"='Vadesiz'`), `GetCashesByWorkPlace` (351), `GetTransfers`/`GetTransferSummary` (`SourceWorkPlaceID=@wp OR TargetWorkPlaceID=@wp`, 1433-1435, 1609-1611), `GetStatement`/`GetCashStatement` `workPlaceId` parametresi. Sunucu kullanıcının kendi iş yerini zorlamaz.

### İş kuralları
- Transfer türleri ve kod önekleri: Virman `VRM`, EFT `EFT`, Havale `HVL`, Döviz Bozum `DBZ`, Bankadan Kasaya `BKY`, Kasadan Bankaya `KBY`, Kasadan Kasaya `KKY`; kod `{önek}-{yıl}-{COUNT(*)+1:D6}` (3692-3715) — `COUNT+1` yarış koşuluna açık, sequence yok.
- `ReferenceID` rastgele 6 haneli sayı, `ZT_BankTransactions`'ta 10 deneme ile tekillik kontrolü (4186-4203).
- Tür çözümü: para birimleri aynıysa istenen tür (Virman/EFT/Havale/Banka↔Kasa), farklıysa zorunlu `Döviz Bozum` (3680-3689).
- Kur: `SourceRate` yoksa `ExchangeRate1`; çapraz kurda `ExchangeRate1 × ExchangeRate2`; `CalculationOperation="/"` ise `effectiveRate = 1/sourceRate`; `targetAmount = SourceAmount × effectiveRate` (872-895).
- `IsTryCurrency`: kod `TRY`/`TL` veya **CurrencyID=="1"** (4640-4644) — TL'nin `Currency.ID=1` olduğu varsayımı gömülü.
- Masraflar: KMV yalnız TL içeren işlemde ve TL cinsinden (`KmvRate` varsayılan 0.002; 4661-4672, DTO 6396+); komisyon/havale ücreti/banka masrafı masraf bankasının para biriminde, TL karşılığı ayrıca saklanır (4682-4700). Masraf ve KMV ayrı banka hareketleri (996-1028).
- Banka↔Kasa ve Kasa↔Kasa: para birimi aynı olmalı (501, 619, 738).
- **İş yerleri arası cari yansıma**: her transfer, `AccountGroup='İş Yeri Firması'` carileri üzerinden kaynak için `ZT_AccountPayments`, hedef için `ZT_AccountCollections` satırı yazar (`PaymentStatus/CollectionStatus='Tamamlandı'`); Virman/EFT/Havale'de `TransferReasonType` seçilmişse, Döviz Bozum'da iş yerleri farklıysa otomatik (568-590, 686-707, 805-825, 1034-1140; yardımcılar 5961-6391). Eşleştirme anahtarı transfer kodu (`CariRecordsExistForTransferCode` 6027, `...ByTransferCode` 6189/6251).
- Bakım uçları: `CleanupDuplicateCariRecords` (mükerrer ödeme/tahsilat hard delete, 2773-2905), `SyncTransferToCari` (eksik cari yansımayı tamamlar, 2927-3180).
- Döviz bozum kaynağı: tahsilat (`CollectionId` + sipariş dağılımı) veya önceki bozumlar (`ZT_ExchangeBreakSource`, `SourceType` `'Tahsilat'|'Bozum'`); tahsilatta `ExchangeStatus` `'Tamamlandı'`/`'Kısmi Bozum'` (1145-1232). Bağımlı bozum varsa silme engellenir (2626-2640).
- Silme: transfer soft-delete (`Status=false`, açıklamaya not eklenir, 2722-2726); bağlı banka hareketleri soft-delete + `' [Transfer silindi]'` (3880-3890); cari yansımalar silinir; tahsilat bozum tutarları geri alınır (`RollbackCollectionExchange` 3978).
- Bakiye: `InitialBalance + Σgiriş − Σçıkış` (BankIntroduction ile aynı CASE; 4218-4230); negatif bakiye için istemci tarafı onay modalı (`negativeBalanceConfirmModal`).
- `BankExtract` varsayılan aralık son 7 gün (5414-5419); `ExchangeBreakReport` son 90 gün (5661-5688).

### Dosya yükleme / Excel / PDF
Sunucu tarafı yok. `BankExtract.cshtml` ve `ExchangeBreakReport.cshtml` `window.print()` ile yazdırılır.

---

## /CashIntroduction/Index

Dosya: `Controllers/CashIntroductionController.cs` (1161 satır).

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)")]`, `[RequireFinancePersonnel]` (12-14). Antiforgery yok.

| Action | HTTP | Satır |
|---|---|---|
| `Index()` | GET | 27 |
| `GetCashCards()` | GET (`_CashCardsListPartial`) | 324 |
| `Add()` | GET | 432 |
| `Add(CashIntroduction)` | POST | 491 |
| `Edit(string id)` | (öznitelik yok) | 570 |
| `Update(CashIntroduction)` | (öznitelik yok) | 657 |
| `Delete(int id)` | **GET** | 731 |
| `CheckCanDelete(int id)` | GET | 791 |
| `GetCashDetails(int id, CancellationToken)` | GET (`_CashDetailPartial`) | 921 |
| `Sparklines(string ids)` | GET | 1116 |

### View + partial + modal
`Views/CashIntroduction/Index.cshtml` (2131; `_ProductionLayout`/`_Layout`; modallar `cashDetailModal` @1357, `deleteModal` @1378), `_CashCardsListPartial.cshtml` (222), `_CashDetailPartial.cshtml` (224; `@model CashDetailViewModel`), `Add.cshtml` (195), `Edit.cshtml` (274) (`_ExpertLayout`). Partial'lar: `_SideMenu_Finance`, `_SideMenu_Patron`, `_NavMenu_Patron`, ViewComponent `IntroductionAudit`.

### JS/CSS
Yerel: `~/css/zt/timedeposits/index.css`. CDN: jQuery 3.6.0 (Add/Edit). Inline script (Index 2 blok).

### AJAX uçları
`/CashIntroduction/Sparklines`, `CheckCanDelete`, `GetCashDetails`, `/CashIntroduction/Delete`, `/cashintroduction/add` (kendi). `GetCashCards` çağrısı literal olarak yakalanmadı (`⚠`).

### Service
Raw Npgsql; `Methods.LogAdd` (3), `_definitionAuditService.OpenDetailsAsync` (`"cash"`), `GlobalVeriables.adminDatabase`.

### Model
`Models/ZT/CashIntroduction.cs` (ID, CashCode, CashName, CurrencyID, Balance, InitialBalance, Description, Status, CreationDate, WorkPlaceID, BranchProvinceID, FutureCount, FutureNet), `Models/ViewModels/CashDetailViewModel.cs` (`CashDetailViewModel`, `CashDetailDto`, `CashTransactionDto`), controller içi `CashTransactionCheckResult` (1107).

### SQL nesneleri
| Tablo | R/W | Satır | Kolonlar |
|---|---|---|---|
| `ZT_CashIntroduction` | R/W | 248, 505 (INSERT), 671 (UPDATE), 757 (soft-delete) | CashCode, CashName, CurrencyID, Balance, InitialBalance, Description, Status, CreationDate, WorkPlaceID, BranchProvinceID |
| `ZT_CashTransactions` | R | 234-249, 829, 993 | CashID, TransactionType, Amount, TransactionDate, Status |
| `ZT_AccountPayments`, `ZT_AccountCollections` | R | 842, 855 | CashID (silme kontrolü) |
| `ZT_Expenses` | (yalnız yorum satırı) | 868 | kullanılmıyor |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | 289-301 | |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R | 55-171 | |
| `ZT_ProductionPlanning` | R | 308 | layout |
| `Log` | W | | |

### Bağlı finans sayfaları
`/CashTransactions/Index`, `/CashTransactions/CashExtract`, `/BankStatement/Index`, `/BankIntroduction/Index`, `/BankTransactions/Index`, `/CustomerAccounts/Index`.

### Finans dışı bağımlılıklar
`ZT_ProductionPlanning` (308); rol tabloları `ZT_LogisticsPerson`, `ZT_ProductionManager` (ölü dallar).

### Yetki / iş yeri
BankIntroduction ile aynı (rol dalı `=="Finans"` → gerçek rolde çalışmaz, 110). İş yeri filtresi yok: tüm `Status=true` kasalar listelenir (251).

### İş kuralları
- Bakiye = `InitialBalance + Σ(Giriş) − Σ|Çıkış|`; karşılaştırma `TRIM("TransactionType") ILIKE 'Giriş'|'Çıkış'` (225-231, 275). Bankadaki `Çek Tahsil/Çek Ödeme` ve "tür boş + işaret" kuralları kasada YOK.
- İleri tarihli hareketler bakiyeye dahil değil (232-250).
- Silme soft-delete; kontroller: kasa işlemi, ödeme, tahsilat (823-865).

### Dosya / Excel / PDF
Yok.

---

## /CashTransactions/Index

Dosya: `Controllers/CashTransactionsController.cs` (1536 satır).

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]` (13-14). **Hiçbir POST'ta `[ValidateAntiForgeryToken]` yok** (BankTransactions'tan farklı).

| Action | HTTP | Satır |
|---|---|---|
| `Index(int? cashId, int? workPlaceId, int? currencyId, bool openModal)` | GET | 28 |
| `GetCashDetailInfo(int cashId, startDate, endDate)` | GET | 322 |
| `GetTransactionDetail(int id)` | GET | 445 |
| `GetTransactions(cashId, workPlaceId, transactionType, ...)` | GET | 527 |
| `GetCashBalances()` | GET | 655 |
| `AddTransaction(...)` | POST | 719 |
| `DeleteTransaction(int id)` | POST | 794 |
| `GetCashList()` | GET | 904 |
| `CashExtract(int cashId, string? startDate, string? endDate)` | GET (View) | 947 |
| `ActivityReport(int cashId, startDate, endDate)` | GET (View) | 1129 |
| `public static bool CreateCashTransaction(...)` | statik yardımcı | 863 |

### View + partial + modal
`Views/CashTransactions/Index.cshtml` (2207; `_ProductionLayout`/`_Layout`; modallar `transactionDetailModal` @448, `cashActivityReportModal` @534 + partial modalları), `ActivityReport.cshtml` (946; `@using ZtoFabrika.Controllers`), `CashExtract.cshtml` (623; `Layout=null`; `@model CashExtractViewModel`). Partial'lar: `_AddPaymentModal`, `~/Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml`, `_SideMenu_Finance`, `_SideMenu_Patron`. `@Html.AntiForgeryToken()` (32).

### JS/CSS
Yerel JS: `~/js/zt/cashtransactions/cashtransactionspayments.js` (7915), `~/js/zt/cashtransactions/cashtransactionscollections.js` (7077), `~/js/zt/collections/searchable-select.js`. Yerel CSS: `~/css/zt/cashtransaction/index.css`, `collections.css`, `payments.css`. CDN: DataTables 1.13.7 + responsive 2.5.0. 7 inline script bloğu.
Not: `banktransactions/*.js` ile `cashtransactions/*.js` ve `payments/payments.js`, `collections/collections.js` büyük ölçüde aynı kodun kopyaları (her biri ~7-8 bin satır).

### AJAX uçları → Action
Kendi: `GetCashBalances`, `GetCashDetailInfo`, `GetTransactionDetail`, `GetTransactions`, `ActivityReport`.
Başka controller: **CustomerAccountCollection** (AddCollection, UpdateCollection, DeleteCollection, ConfirmDeleteCollection, GetCollectionList, GetCollectionDetail, GetCollectionForUpdate, GetAvailableCheckBooks, GetCustomerBankAccounts, GetAvailableCurrenciesForCollection, GetBanksByWorkPlaceCustomer, GetCashByWorkPlaceCustomer, GetCustomerCreditSummary, GetCustomerOrders), **CustomerAccountPayment** (AddPayment, DeletePayment, ConfirmDeletePayment, GetPaymentList, GetPaymentDetail, GetAllBranchProvinces, GetWorkPlacesByBranch, GetBanksByWorkPlaceAndBranch, GetAvailableCheckBooks, GetCustomerBankAccounts, GetSupplierGardens, SaveQuickPaymentPlanning, GetEndorsableChecks, GetGardenPaymentHistory), **CustomerAccounts** (GetAccountBalancesByCurrency, GetAllCurrenciesForPlan, GetBanksByWorkPlace, GetCashesByWorkPlace, GetPaymentPlanningDetails, SavePaymentPlanning), **AccountTransaction** (Transactions, GetAvailableCurrencies, GetWorkPlaceBalances), **PaymentManagement** (GetCustomerDebtSummary), **BankTransactions** (CheckInstructionSessionExists).

### Service
Raw Npgsql; `Methods.LogAdd` (2). Statik `CreateCashTransaction` başka controller'lardan çağrılır: AccountTransaction (6724), CustomerAccountCollection (1314, 3034), CustomerAccountPayment (1903, 2529), PaymentManagement (1390), PersonnelAdditionalPayment (379), PersonnelAdvance (348), PersonnelSalary (2575, 3252).

### Model
`Models/ViewModels/CashExtractViewModel.cs` (`CashExtractViewModel`, `CashExtractRowViewModel`); controller içi `FIFOMatch` (1502), `FIFOEntry` (1516), `UsedEntry` (1527).

### SQL nesneleri
| Tablo | R/W | Satır | Kolonlar |
|---|---|---|---|
| `ZT_CashTransactions` | R/W | 390, 475, 552, 742 (INSERT), 803, 819 (soft-delete), 870 (INSERT), 997 | CashID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, Status, CreationDate |
| `ZT_CashIntroduction` | R | 145, 285, 342, 676, 730 | |
| `ZT_CustomerAccounts` | R | 202 | |
| `Currency` (`Code` dahil), `ZT_WorkPlace`, `ZT_BranchProvince` | R | | |
| `ZT_FinancePerson`, `ZT_Boss`; admin `Users`, `UserRoles` | R | 62-106 | |
| `ZT_ProductionPlanning` | R | 54 | layout |
| `Log` | W | | |

### Bağlı finans sayfaları
`/CashIntroduction/Index`, `/BankIntroduction/Index`, `/BankTransactions/Index`, `/BankStatement/Index`, `/CustomerAccounts/Index`, `/AccountTransaction/Transactions`, `/CustomerAccountPayment/Payments`.

### Finans dışı bağımlılıklar
`ZT_ProductionPlanning` (54); view menüsünde üretim/satış linkleri (BankTransactions ile aynı liste); JS'te `GetSupplierGardens`, `GetGardenPaymentHistory`, `GetCustomerOrders`.

### Yetki / iş yeri
BankTransactions ile aynı desen (admin DB rol okuma `=="Finans"`, 71). `GetTransactions` `workPlaceId` isteğe bağlı parametre. `GetCashBalances` (663-682) iş yeri ve tarih filtresi olmadan tüm kasaları döndürür (ileri tarihliler dahil).

### İş kuralları
- Bakiye kuralı kasa tanımıyla aynı (671-675).
- `DeleteTransaction` yalnız soft-delete; bağlı tahsilat/ödeme temizliği yok (818-819).
- FIFO eşleştirme `ApplyFIFOMatching` (1380-1500) — ActivityReport.
- `CashExtract`: açılış + tarih sıralı hareketler (`TransactionDate ASC, ID ASC`, 993-1002).

### Dosya / Excel / PDF
İstemci tarafı CSV (`exportToExcel`, `Index.cshtml:1906+`), `window.print()`. Sunucu tarafı yok.

---

## /FinancialBalanceSheet/Index

Dosya: `Controllers/FinancialBalanceSheetController.cs` (1776 satır). "Finansal Varlıklar / Finansal Durum": iş yeri kartları halinde bilanço.

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Muhasebe (Alış)","Finans(normal)","Finans(super)","Finans")]` (19-20).

| Action | HTTP | Satır |
|---|---|---|
| `Index()` (async) | GET | 31 |
| `GetInterWorkplaceTradeDebt(int workPlaceId, string startDate, string endDate)` | GET (JSON) | 1355 |

### View + modal
`Views/FinancialBalanceSheet/Index.cshtml` (1334; `_ProductionLayout`/`_Layout`; `@model ZtoFabrika.Models.ZT.FinancialBalanceSheetViewModel`; modallar `fbsStockModal` @864, `fbsTradeDebtModal` @891). Partial'lar: `_SideMenu_AccountingPurchases`, `_SideMenu_Default`, `_SideMenu_Finance`, `_SideMenu_Patron`.

### JS/CSS
Harici dosya yok; 2 inline script + 1 style bloğu.

### AJAX uçları
`/FinancialBalanceSheet/GetInterWorkplaceTradeDebt` (kendi); link `/AccountTransaction/Transactions`.

### Service
Raw Npgsql + `ITCMBExchangeRateService.GetExchangeRatesAsync()` (173). `Methods`/`LogAdd` kullanılmaz (salt okunur sayfa). `IDateTimeProvider` enjekte edilmez.

### Model
`Models/ZT/FinancialBalanceSheetViewModels.cs`: `FinancialBalanceSheetViewModel` (14), `WorkplaceBalanceCardDto` (30), `StockBlockDto` (59), `CurrencyBlockDto` (102), `CariBalanceDto` (134), `CariCurrencyBalanceDto` (146), `InterWorkplaceBalanceDto` (161). Controller içi: `DcInfo`, `BalanceInfo`, `CheckInfo`, `FbsRawLine`, `FbsCostLine`, `FbsLaborLine`, `FbsBatch`. Servis tipleri: `ExchangeRate` vb. (`Services/ITCMBExchangeRateService.cs:22-57`).

### SQL nesneleri (tamamı okuma)
| Tablo | Satır | Amaç |
|---|---|---|
| `ZT_WorkPlace`, `ZT_BranchProvince` | 107-108 | kart listesi |
| `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_CustomerAccounts` | 357-382, 637-660, 1160-1188 | borç/alacak/ödeme/tahsilat toplamları |
| `ZT_BankIntroduction`, `ZT_BankTransactions` | 443-461 | banka bakiyesi |
| `ZT_CashIntroduction`, `ZT_CashTransactions` | 496-506 | kasa bakiyesi |
| `ZT_Checks` | 562-574 | çekler |
| `Currency` | çeşitli | |
| `ZT_Boss` / `ZT_AccountingPurchases` / `ZT_FinancePerson` | 61-75 (dinamik tablo adı) | rol başlığı |
| **Stok/üretim**: `ZT_MaterialPurchases`, `ZT_MaterialInvoice`, `ZT_MaterialStockAll` | 741-753 | malzeme stoğu FIFO değeri |
| `ZT_PesticidePurchases`, `ZT_PesticideInvoice`, `ZT_PesticideStockAll` | 820-831 | ilaç stoğu |
| `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `ZT_ExpertReport`, `ZT_Purchases`, `ZT_DistributedPallet` | 895-917 | hammadde değeri |
| `ZT_ProductionConveyor`, `ZT_ProductionConveyorCost`, `ZT_PalletsLoadedTruck` | 976-1004 | hazır stok |
| `ZT_ProductionPlanning`, `Product`, `SubProduct`, `Customer`, `Supplier`, `ZT_Expert`, `ZT_StockMovementLog`, `ContainerType`, `ZT_ProductionSergeantExpenseBatches`, `ZT_ProductionSergeants` | 1382-1595 | iş yerleri arası ticari borç |
Çalışma zamanı DDL: yok. `wpIdsCsv` (int listesi) SQL'e string olarak gömülür (`IN ({wpIdsCsv})`).

### Bağlı finans sayfaları
`/AccountTransaction/Transactions`. Menüden erişim: `_SideMenu_FinanceItems.cshtml:157`, `_SideMenu_Finance_Financial.cshtml:188`.

### Finans dışı bağımlılıklar (en ağır parça)
- `LoadStockValuesByWorkPlace` (717-1125) tamamen stok/üretim/MES: malzeme, ilaç (pestisit), bahçeden gelen hammadde kamyonları, eksper raporu, dağıtılmış paletler, üretim konveyörü, yüklenen paletler.
- `GetInterWorkplaceTradeDebt` (1355-1756) tamamen üretim: parti (`ProductionNumber`), palet, hammadde kamyonu/tedarikçi, ambalaj/kasa stok hareketi, üretim çavuşu işçilik partileri.
- View'daki `fbsStockModal`, `fbsTradeDebtModal` bu veriye bağlı.
- Lojistiğe uyarlamada bu iki blok çıkarılmalı ya da "araç/yakıt/yedek parça stoğu" gibi bir eşdeğere dönüştürülmeli; geri kalan (cari, banka, kasa, çek, iş yerleri arası cari, kur) saf finanstır.

### Yetki / iş yeri
- Rol tablosu `userRole` switch ile seçilir; `StartsWith("Finans")` → `ZT_FinancePerson` (61-67) — bu controller rol dalını doğru çözer.
- **Kullanıcı iş yeri filtresi YOK**: tüm aktif iş yerleri kart olarak gösterilir (105-110). İş yeri bazlı ayrım yalnız veri gruplama içindir.

### İş kuralları
- Net bakiye (para birimi bloğu) = `(Borç − Ödeme) − (Alacak − Tahsilat)`; yorum: "pozitif: cariler bize borçlu" (256-258). **Dikkat**: FinanceReport'taki kanonik formül `N = (Alacak − Tahsilat) − (Borç − Ödeme)`, `N>0 karşı taraf bize borçlu` (`FrLedger.cs:11-12`). İki modülde işaret kuralı/terim adlandırması ters görünüyor — taşımadan önce netleştirilmeli.
- Bu controller'da `ZT_AccountPayments` toplamında `PaymentStatus <> 'İptal'` filtresi **yok** (dosyada `PaymentStatus` hiç geçmiyor); FinanceReport iptal ödemeleri dışlar (`FrSql.cs:85`).
- "İş Yeri Firması" carisi kendi adıyla eşleşen iş yerinde hariç tutulur: eşleşme **ad üzerinden** `TRIM(wp."Name") = TRIM(ca."AccountName")` (359-360) — BankStatement ise `ca."ReferenceID" = WorkPlaceID` kullanır (5966-5967). İki farklı eşleme yöntemi.
- Banka: yalnız `AccountType IS NULL OR IN ('Vadesiz','Kredi')` (461); mevduat/yatırım hesapları bilanço bankasına dahil değil. İleri tarih filtresi yok.
- Çekler: `CheckType IN ('Kendi Çekimiz','Tahsil Edilen Çek')`, `CheckStatus NOT IN ('Tahsil Edildi','Ödendi','Ciro Edildi','İptal')`; `ZT_Checks`'te WorkPlaceID yok → `DrawerCustomerID → ZT_CustomerAccounts(İş Yeri Firması).ReferenceID → ZT_WorkPlace` (534-574).
- Döviz çevirimi: TCMB `ForexSelling` (yoksa `ForexBuying`) / `Unit` (176-181); sembol→kod eşlemesi `LookupRate` (1759-1774: ₺/TL, $, €, £, ₽, ¥); kur bulunamazsa 1.
- TRY toplamları: varlık = banka + kasa + tahsil edilecek çek + pozitif net bakiye + stok; borç = ödenecek çek + negatif net bakiye; net değer = varlık − borç (291-317).
- Stok değerleme FIFO (722-768); hammadde için kg fiyatı = `SUM(TotalPrice)/NetAmount`, taşma korumaları (880-886); `SafeDec` overflow'da 0 döner (1281).

### Dosya / Excel / PDF
Yok.

---

## /TimeDeposits/Index

Dosya: `Controllers/TimeDepositsController.cs` (1492 satır). Vadeli mevduat.

### Route'lar
Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]` (12-13). Antiforgery yok.

| Action | HTTP | Satır |
|---|---|---|
| `Index(string status="")` | GET | 26 |
| `Add()` | GET | 197 |
| `Add(TimeDeposit model)` | POST | 229 |
| `Details(int id)` | GET | 369 |
| `CollectInterest([FromBody] CollectInterestDto)` | POST | 526 |
| `BreakDeposit([FromBody] BreakDepositDto)` | POST | 707 |
| `CalculateInterestPreview(principal, annualRate, days, withholdingRate=15)` | GET | 858 |
| `GetDepositInfo(int id)` | GET | 888 |
| `GetWorkPlacesByProvince(int branchProvinceId)` | GET | 929 |
| `GetFilteredBanks(int? branchProvinceId, int? workPlaceId, int? currencyId)` | GET | 962 |
| `GetMaturedDeposits()` | GET | 1027 |

### View + modal
`Views/TimeDeposits/Index.cshtml` (665; `_ProductionLayout`; `@model List<TimeDepositViewModel>`; modallar `collectModal` @316, `breakModal` @399), `Add.cshtml` (559; `_ExpertLayout`; `@model TimeDeposit`), `Details.cshtml` (1009; `_ExpertLayout`; modallar `collectModal` @678, `breakModal` @733). Partial: `_SideMenu_Finance`.

### JS/CSS
Yerel: `~/css/zt/timedeposits/index.css` (bu CSS BankIntroduction ve CashIntroduction tarafından da kullanılıyor). Inline script; harici JS yok.

### AJAX uçları
Kendi: `Add`, `Details`, `CollectInterest`, `BreakDeposit`, `GetDepositInfo`, `GetFilteredBanks`, `GetWorkPlacesByProvince`. `CalculateInterestPreview` ve `GetMaturedDeposits` için view çağrısı bulunmadı (`⚠`).

### Service
Raw Npgsql; `Methods.LogAdd` (2). Banka hareketini **kendi private** `CreateBankTransaction` (1321) ile yazar.

### Model
`Models/ZT/TimeDeposit.cs` (`TimeDeposit`, `TimeDepositViewModel`), `Models/ZT/InterestCollection.cs`; controller dosyası: `TimeDepositStatsDto` (1458), `CollectInterestDto` (1470), `BreakDepositDto` (1483). **`BankDropdownDto`, `CurrencyDropdownDto`, `SimpleDropdownDto` `Controllers/CreditContractsController.cs:6987-7012` içinde tanımlı** — TimeDeposits bu dosyaya derleme bağımlı.

### SQL nesneleri
| Tablo | R/W | Satır | Kolonlar |
|---|---|---|---|
| `ZT_TimeDeposits` | R/W | INSERT 265; UPDATE 614, 643, 796 | DepositCode, BankAccountID, SourceBankID, WorkPlaceID, BranchProvinceID, CurrencyID, DepositType, Principal, AnnualRate, NetRate, WithholdingRate, StartDate, MaturityDate, DurationDays, DurationMonths, GrossInterest, WithholdingTax, NetInterest, MaturityAmount, MaturityAction, AutoRenewalDays, DepositStatus, Description, Notes, Status, CreationDate, CreatedBy + IsInterestCollected, InterestCollectionDate, CollectedInterest, ClosedDate, ClosedBy, UpdatedDate, EarlyBreakPenalty |
| `ZT_InterestCollections` | R/W | INSERT 560, 750 | CollectionCode, SourceType, SourceID, BankAccountID, TargetBankID, WorkPlaceID, BranchProvinceID, CurrencyID, CollectionType, CollectionDate, GrossAmount, WithholdingTax, Commission, NetAmount, Description, Status, CreationDate, CreatedBy |
| `ZT_FinIncomeExpense` | W | 1380, 1423 | WorkPlaceID, BranchProvinceID, Direction, Category, SourceModule, ReferenceTable, ReferenceID, TransactionDate, Amount, CurrencyID, BankID, Description, Period, Status, CreationDate, CreatedBy |
| `ZT_BankIntroduction` | R/W | INSERT 1292 (`AccountType='Mevduat'`); UPDATE 1361-1362 (`Balance ± @Amount`) | |
| `ZT_BankTransactions` | W | 1334 | |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | | |
| `ZT_ProductionPlanning` | R | 40 | layout |
| `Log` | W | | |

### Bağlı finans sayfaları
`/CustomerAccounts/Index` (hata durumunda da buraya yönlenir, 65), `/Investments/Index`, BankIntroduction (mevduat hesabı kartı).

### Finans dışı bağımlılıklar
Yalnız `ZT_ProductionPlanning` (40). İş mantığı saf finans.

### Yetki / iş yeri
`SetViewDataForUser` sabit değer atar: `FinanceID="1"`, `PatronID="0"` (1080-1087) → her zaman `_ProductionLayout`. İş yeri filtresi yok; `GetFilteredBanks` isteğe bağlı parametreyle süzer.

### İş kuralları
- Faiz: `Brüt = Anapara × (YıllıkOran/100) × Gün / 365`; `Stopaj = Brüt × (StopajOranı/100)`; `Net = Brüt − Stopaj`; `NetOran = YıllıkOran × (1 − Stopaj/100)`; `VadeSonu = Anapara + Net`; 2 haneye yuvarlama (1243-1257; önizleme 862-866, varsayılan stopaj %15).
- Kodlar: `VMD-{yıl}-{D4}`, `FTH-{yıl}-{D4}` — `MAX(sondaki sayı)+1` (1207-1240); transaction dışında okunur.
- Açılış: kaynak hesapta yeterli bakiye kontrolü **saklı `Balance` kolonundan** (`GetBankBalance` 1262) — diğer modüller bakiyeyi hareketlerden hesaplar; mevduat hesabı yoksa otomatik `Mevduat` tipi banka kartı açılır; kaynak `Çıkış` + mevduat `Giriş` hareketi (`AccountingType='Vadeli Mevduat'`) (250-326).
- `CreateBankTransaction` her harekette `ZT_BankIntroduction.Balance`'ı da günceller (1359-1368) — **yalnız bu controller `Balance` kolonunu günceller**; BankTransactions/BankStatement güncellemez → `Balance` kolonu tutarsız kalır.
- Faiz tahsilatı: `CollectionType='VadeSonu'` ise anapara+net faiz hedefe aktarılır, mevduat `'Kapatildi'`; aksi halde yalnız faiz (600-655). Gelir kaydı `ZT_FinIncomeExpense` (`Direction='Gelir'`, `Category='Faiz'`, `SourceModule='VadeliMevduat'`).
- Erken bozma: kullanıcı oranı ile `actualDays` üzerinden faiz, `Toplam = Anapara + Net − Ceza`, durum `'Bozuldu'`; gelir = net − ceza (≤0 ise kayıt yok) (736-817, 1419-1420).
- Hedef hesap para birimi mevduatla aynı olmalı (`ValidateTargetBankCurrency` 1098).
- Durumlar: `Aktif`, `Kapatildi`, `Bozuldu`. Vadesi gelenler: `MaturityDate <= CURRENT_DATE` (1040-1042).

### Dosya / Excel / PDF
Yok.

---

## FinanceReportController + Services/FinanceReport/* + Services/ReportKit/*

"Patron Finans Raporları": 7 rapor türü, tek sayfa, üç kip (giriş / liste / ekstre).

### Route'lar
`Controllers/FinanceReportController.cs` (61 satır). Sınıf: `[Authorize]`, `[UserRoleAuthorize("Admin","Patron","Finans(normal)","Finans(super)")]`, `[RequireFinancePersonnel]` (20-22).

| Action | HTTP | Satır |
|---|---|---|
| `Index(string? type, range, from, to, cur, wp, account, bp)` | GET | 33 |
Ek kontrol: `FrAccess.Allowed(role, Session["bossSuperStatus"])` (36) — Patron yalnız `süper` ise.

### View + partial
`Views/FinanceReport/Index.cshtml` (471; `Layout="_ReportLayout"`; `@model ZtoFabrika.Models.Report.FrModel`). Partial'lar: `_ReportFilterBar`, `_ReportHeader`, `_StatFilterCards` (hepsi `Views/Shared`). Modal yok.

### JS/CSS
Yerel: `~/js/finance-report.js` (193), layout'tan `~/js/report-page.js`, `~/lib/xlsx/xlsx.full.min.js`, `~/css/report-page.css`; `_StatFilterCards`'tan `~/js/stat-filter.js`, `~/css/stat-filter.css`. CDN: Font Awesome 6.4.0 (cdnjs). 1 inline script (`frLabels` JSON).

### AJAX uçları
AJAX yok (tam sayfa GET, `/FinanceReport/Index?...`). Dış referanslar: `Url.Action("GetNetworkImage","Report")` (**ReportController** — logo, `Index.cshtml:75`), link `/AccountTransaction/Statement?id=` (377).

### Service / Warehouse (gerçek katmanlı yapı)
| Dosya | İçerik |
|---|---|
| `Services/FinanceReport/FrService.cs` | `BuildAsync(con, FrFilter, FrContext, ct)` — kip seçimi ve birleştirme; HttpContext'e dayanmaz |
| `Services/FinanceReport/FrWarehouse.cs` | `TotalsAsync` (26), `LastSettlementsAsync` (45), `OpeningsAsync` (56), `StatementRowsAsync` (65), `SalesLedgerAsync` (83), `SalesAccountsAsync` (99), `AccountAsync` (113), `OrphansAsync` (124), `UnbookedAsync` (135), `LookupsAsync` (145); `MaxStatementRows = 60000`; kayıt tipleri `FrQuery`, `FrTotalRow`, `FrLookup` |
| `Services/FinanceReport/FrSql.cs` | Sabit SQL metinleri: `Movements` (CTE), `Totals`, `LastSettlements`, `Openings`, `StatementRows`, `SalesLedger`, `SalesAccounts`, `Account`, `Orphans`, `Unbooked`; `WithScope(...)` |
| `Services/FinanceReport/FrLedger.cs` | Saf kurallar: `Effect`, `Display`, `State`, `BalanceSide`, `Totals`, `Statement`; `ClosedTolerance = 0.005` |
| `Services/FinanceReport/FrTypes.cs` | 7 tür tanımı + `FrSide`, `HiddenGroups` |
| `Services/FinanceReport/FrAccess.cs` | erişim kuralı |
| `Services/FinanceReport/SalesFinance.cs` | Satış raporu için FIFO yaşlandırma (`Build`, `Bucket`, `AgeDays`) — FinanceReport sayfası değil, Satış Raporu kullanır; `FrWarehouse.SalesLedgerAsync/SalesAccountsAsync` ile bağlı |
| `Services/ReportKit/ReportLookups.cs` | `ActiveAsync`, `NameAsync` — beyaz liste tabloları `Customer`, `Product`, `Supplier`, `ContainerType`, `ZT_WorkPlace`, `ZT_BranchProvince`. **FinanceReport akışında çağrısı görülmedi** (`FrWarehouse.LookupsAsync` kendi sorgusunu yazıyor); `Services/ReportKit` klasöründe başka dosya yok |
| `Helpers/ReportScope.cs` | `Condition(wpExpr, roleWp, roleBp)`, `ResolveUserScope(con, userKey)`; `UserScopeTables` = `ZT_ProductionManager, ZT_AcceptanceOfGoods, ZT_AccountingPurchases, ZT_QualityControlPerson, ZT_LogisticsPerson, ZT_FinancePerson, ZT_PurchasingPerson, ZT_Boss` |
| `Helpers/ReportErrorLog.cs` | `Write("FinanceReport", ex, ...)` |
| `Helpers/FinanceRoleHelper.cs`, `Helpers/FinanceAccess.cs` | süper kullanıcı / Patron sabiti |

### Model / DTO
`Models/Report/FinanceReport.cs` (`FrFilter`, `FrAccountRow`, `FrMovement`, `FrContext`, `FrModel`, `FrMode`, `FrCurrencyTotal`, `FrStatementBlock`, `FrStatementRow`, `FrMethodTotal`, `FrTypeSummary`, `FrAccountHeader`, `FrOrphan`, `FrUnbooked`, `FrLastSettlement` — bir kısmı dosyadan adıyla doğrulandı, kalanı kullanım yerinden; `⚠` tam liste için dosyayı açın), `Models/Report/ReportDateRange.cs`, `Models/Report/ReportLookupItem.cs`, `Models/Report/SalesFinance.cs` (`SfResult`, `SfCustomer`, `SfOrder`, `SfAccount`, `SfMove`, `SfStatus`).

### SQL nesneleri (tamamı okuma; `FrSql.cs`)
| Tablo | Satır | Not |
|---|---|---|
| `ZT_CustomerAccounts` | 29, 168, 178, 187+ | AccountCode, AccountName, AccountGroup, Status, IsCreditBankAccount, ReferenceID, CurrencyID, CreditLimit, TaxNumber, TaxOffice, Address |
| `ZT_AccountDebts` | 41, 186, 234 | CustomerAccountID, CurrencyID, WorkPlaceID, TransactionDate, CreationDate, Amount, DocumentNo, DocumentType, Description, PaymentMethod, AccountingType, ReferenceID |
| `ZT_AccountCredits` | 68, 190 | + SalesTruckID, OrdersID |
| `ZT_AccountPayments` | 83, 194 | PaymentDate, PaymentDocumentNo, PaymentMethod, PaymentStatus |
| `ZT_AccountCollections` | 91, 199 | CollectionDate, CollectionDocumentNo, CollectionMethod |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | | |
| **Finans dışı**: `ZT_ExpertReportTruckFinance`, `ZT_ExpertReportTruck`, `ZT_UsedHarvestManager`, `ZT_ProductionSergeantsExpenses`, `ZT_ProductionExpenses` | 46-59 | borç belge tarihini kaynaktan okuma |
| `ZT_SalesTruck`, `ZT_Orders` | 72-74 | alacak belge tarihi (teslim) |
| `ZT_ExpertReport`, `ZT_Purchases` | 215-221 | "Bekleyen (tahmini)" tartılmış ama borca işlenmemiş bahçe araçları |
Çalışma zamanı DDL: yok.

### Bağlı finans sayfaları
`/AccountTransaction/Statement`. Menü: `_SideMenu_FinanceItems.cshtml:10-12`.

### Finans dışı bağımlılıklar
- Rapor türleri sektöre özgü cari gruplarına bağlı (`FrTypes.cs:32-38`): `sales` (Müşteri, İlaç Müşterisi, Customer), `garden` (Tedarikçi — bahçe), `material` (Malzeme/İlaç Tedarikçisi), `harvest` (Kesim Çavuşu), `labor` (Üretim Çavuşu — ardiye yövmiyecileri), `other` (Masraf Hesabı, Nakliye Firması, Sevk Nakliye Firması, Analiz Firması), `personnel` (Personel; yalnız süper). Lojistik için tür/grup listesi yeniden tanımlanmalı.
- `FrSql.Movements` LATERAL alt sorguları (43-76): bahçe kamyonu, kesim çavuşu, üretim çavuşu masrafı, üretim masrafı, satış kamyonu, sipariş tabloları — belge tarihi için. Çıkarılırsa tarih `TransactionDate/CreationDate`'e düşer (kod zaten `COALESCE` ile geri düşüyor).
- `FrSql.Unbooked` (213-237) tamamen bahçe/kantar akışı.
- `ReportScope.UserScopeTables` üretim/kalite rol tablolarını içerir (olmayan tablo `catch` ile atlanır).
- `SalesFinance.Groups` = `Müşteri`, `Customer`; `OrdersID` bazlı sipariş durumu.

### Yetki / iş yeri
- Patron: kapsam `(0,0)` — iş yerine bağlı değil (45). Diğer roller: `ReportScope.ResolveUserScope(con, customerUserKey)` → `(WorkPlaceID, BranchProvinceID)`; SQL'e `ReportScope.Condition("mv.\"Wp\"", wp, bp)` olarak eklenir; iş yeri NULL satırlar görünür kalır (`ReportScope.cs:17-25`).
- Bu grupta **sunucu tarafında iş yeri kapsamını gerçekten zorlayan tek sayfa budur.**
- Süper olmayan kullanıcıdan `Personel` grubu gizlenir (`FrTypes.HiddenGroups`); ekstrede gizli grup → `Denied` (`FrService.cs:86-87`).

### İş kuralları
- Kanonik bakiye `N = (Alacak − Tahsilat) − (Borç − Ödeme)`; hareket etkisi: `C`,`P` → +, `D`,`T` → − (`FrLedger.cs:31-36`, `FrSql.cs:97`).
- İptal ödemeler hariç (`PaymentStatus <> 'İptal'`; NULL durumlu ödeme de dışarıda kalır), tutarı 0 satır alınmaz (`FrSql.cs:8-9, 62, 85`).
- Para birimleri birbirine çevrilmez; para birimi boş satır `0`/"?" kovası (`FrSql.cs:14`).
- Kredi hesapları (`IsCreditBankAccount` + `Masraf Hesabı`) ve `İş Yeri Firması` hiçbir türe girmez → "rapor dışı" satırı (`FrTypes.cs:22-23, 48-53`).
- Kapalı cari toleransı 0.005; borç/alacak toplamları yalnız açık carilerden ayrı ayrı (`FrLedger.cs:29, 51-63`).
- Dönem "Tümü" ise aralık 0001–9999 (devir oluşmaz) (`FrService.cs:25-26`). Ekstre üst sınırı 60.000 satır, aşarsa `Truncated`.
- Cariye bağlanmamış hareketler (`Orphans`) giriş sayfasında uyarı.

### Dosya / Excel / PDF
Excel: istemci tarafı SheetJS (`~/lib/xlsx/xlsx.full.min.js`) — `finance-report.js:163-182` `data-fr-sheet` işaretli tabloları `window.ztReportPage.xlsx({...})` ile dışa aktarır (`report-page.js`). Yazdırma: `window.ztReportPage.print()`. Sunucu tarafı üretim yok.

---

## FinanceController, FinanceMaintenanceController, FinancePersonController

### FinanceController — `/Finance/Index`
`Controllers/FinanceController.cs` (211 satır).
- **Ne işe yarar**: Eski "Finans ana sayfası": kasa + banka tanım listelerini ve para birimi/iş yeri/şube tablolarını tek modelde (`FinanceViewClass`) gösterir, Chart.js ile grafik çizer.
- Route: sınıf `[Authorize]`, `[UserRoleAuthorize("Finans(normal)","Finans(super)")]` (11-12); tek action `Index()` (25; HTTP özniteliği yok). Admin/Patron giremez.
- View: `Views/Finance/Index.cshtml` (768; `_ProductionLayout`/`_Layout`; `@model FinanceViewClass`; modal yok). CDN: Chart.js (jsdelivr, sürümsüz), Font Awesome 5.15.4 ve 6.0.0-beta3 (cdnjs).
- Linkler: `/bankaccounts/index`, `/bankintroduction/index`, `/banktransactions/index`, `/cashintroduction/index`, `/cashtransactions/index`, `/customercurrentaccounts/index`, `/purchasecurrentaccount/index`, `/salesproduct/salesindex`, `/finance/index`.
- Servis: raw Npgsql, `Methods.ConvertToList<CashIntroduction/BankIntroduction>` (137, 143), `GlobalVeriables.adminDatabase`.
- Model: `Models/ZT/FinanceViewClass.cs`; iç sınıf `IntroductionViewModel` (15, kullanılmıyor görünüyor).
- SQL (okuma): `ZT_CashIntroduction` (134), `ZT_BankIntroduction` (140), `Currency` (149), `ZT_WorkPlace` (162), `ZT_BranchProvince` (175), `ZT_FinancePerson` (57), `ZT_Boss` (92), admin `Users`/`UserRoles` (52).
- Bakiye hesabı yapmaz (ham `select *`).
- Finans dışı: view'da `/purchasecurrentaccount/index`, `/salesproduct/salesindex` linkleri.
- **Finans rolünün açılış sayfası bu DEĞİL.** Login yönlendirmesi: `Finans(super)` ve `Finans(normal)` → `/accounttransaction/alltransactions` (`AccountController.cs:257-258`, `320-327`, `1646-1647`, `1709-1716`). `/finance/index`'e yalnız `_CustomerAccountNavMenus/_NavMenu_Finance_Financial.cshtml:7` ve `Views/PurchaseCurrentAccount/Index.cshtml:516` link veriyor → eski/ikincil sayfa.

### FinanceMaintenanceController — `/FinanceMaintenance/OrphanDebts`
`Controllers/FinanceMaintenanceController.cs` (645 satır).
- **Ne işe yarar**: Menüde gösterilmeyen bakım ekranı (yalnız URL ile, 14-16). Referanssız ya da kopuk referanslı `ZT_AccountDebts` kayıtlarını cari bazında listeler ve toplu siler.
- Route: sınıf `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)")]` (26-27).
  | Action | HTTP | Satır |
  |---|---|---|
  | `OrphanDebts(string q, int currencyId, int workPlaceId, ...)` | GET | 227 |
  | `DeleteOrphanDebts([FromBody] DeleteRequest)` | POST (antiforgery yok) | 463 |
- View: `Views/FinanceMaintenance/OrphanDebts.cshtml` (470; `_ProductionLayout`; `@model List<FinanceMaintenanceController.OrphanDebtGroup>`; modal `odcConfirmModal` @312). Inline script.
- AJAX: `FinanceMaintenance/DeleteOrphanDebts` (kendi), **`AccountTransaction/GetDebtRedirectInfo`** (başka controller).
- Model: iç sınıflar `OrphanDebtRow` (50), `OrphanDebtGroup` (79), `DeleteRequest` (639).
- SQL:
  | Tablo | R/W | Satır |
  |---|---|---|
  | `ZT_AccountDebts` | R + **hard DELETE** | 289, 429, 488, 531, 601, 613 |
  | `ZT_AccountDebtsDeleteLog` | **CREATE TABLE IF NOT EXISTS** + INSERT | **574-585 (çalışma zamanı DDL)**, 591-602 |
  | `ZT_CustomerAccounts`, `Currency`, `ZT_WorkPlace` | R | 290-292, 415, 421 |
  | `ZT_AccountDebtsInvoice`, `ZT_PaymentPlans`, `ZT_PaymentApprovalDetails` | R (kilit kontrolü) | 119-128 |
  | `ZT_SalesTruck` | R + **UPDATE** | 181, 564 |
  | `information_schema.columns` | R | 94, 104 (kolon var mı / nullable mı) |
  | `ZT_ProductionPlanning` | R | 215 |
  | `RefMappings` ile dinamik: `ZT_ExpertReportTruckFinance`, `ZT_ExpertReportTruckExpenses`, `ZT_SalesTruck`, `ZT_UsedHarvestManager`, `ZT_ProductionSergeantsExpenses`, `ZT_MaterialInvoice`, `ZT_PesticideInvoice`, `ZT_ProductionExpenses`, `ZT_OrderClaims`, `ZT_OrderExpenses` | R (EXISTS) | 35-47 |
- `ZT_AccountDebtsDeleteLog` kolonları (574-584): ID serial PK, DebtID, CustomerAccountID, TransactionDate, DueDate, DocumentNo, DocumentType, Amount, CurrencyID, ExchangeRate, PaymentMethod, CashID, BankID, ReferenceID, AccountingType, WorkPlaceID, OriginalCreationDate, OriginalCreatedBy, DeletedBy, DeletedByRole, DeletedAt (default now()), Reason.
- İş kuralları: silinebilir = kilitli değil (fatura / ödeme planı / onay bağlantısı yok) VE (ReferenceID boş VEYA eşlemesi tanımlı ama hedef satır yok VEYA `AccountingType='Sevk Nakliye Firması'`) (486-495); `Sevk Nakliye Firması` borcu silinirken `ZT_SalesTruck`'ın nakliye firması/fiyat alanları temizlenir (`Gemi Nakliye` → `ShipTransportCompany*`, aksi `TransportCompany*`) (515-570); silinenler önce log tablosuna yedeklenir, sonra **hard delete** (590-616). Kolon/tablonun varlığı `information_schema` ile çalışma zamanında sınanır.
- Finans dışı: `RefMappings` tümüyle üretim/satış tabloları; `ZT_SalesTruck` güncellemesi; `ZT_ProductionPlanning`. Lojistikte `RefMappings` yeniden yazılmalı.
- Yetki: iş yeri filtresi yalnız GET parametresi (`workPlaceId`).

### FinancePersonController — `/FinancePerson/Index`
`Controllers/FinancePersonController.cs` (555 satır).
- **Ne işe yarar**: Finans personeli tanımı (Admin ekranı). `ZT_FinancePerson` satırı; kullanıcının iş yeri/şube kapsamı ve süper durumu bu tablodan okunur. Tabloda en az bir satır olması Patron'un finans sayfalarını görmesinin ön koşuludur (`FinanceAccess.HasFinancePersonnel`).
- Route: sınıf `[Authorize]`, `[UserRoleAuthorize("Admin")]` (12-13).
  | Action | HTTP | Satır |
  |---|---|---|
  | `Index()` | GET | 23 |
  | `Add()` | GET | 100 |
  | `Add(FinancePerson)` | POST | 176 |
  | `Edit(string id)` | (öznitelik yok) | 274 |
  | `Update(FinancePerson)` | POST | 379 |
  | `Delete(int id)` | GET (Status toggle) | 469 |
- View: `Views/FinancePerson/Index.cshtml` (110), `Add.cshtml` (206), `Edit.cshtml` (205) — `Layout` atanmamış → `_ViewStart` varsayılanı `_Layout`. Modal yok. CDN jQuery 3.6.0; ViewComponent `IntroductionAudit` (Index, Edit).
- AJAX: **`/Expert/GetAllWorkPlaces`, `/Expert/GetBranchProvincesByWorkPlace`** (ExpertController — başka controller; Add/Edit), `/FinancePerson/Add|Edit|Delete|Index`.
- Model: `Models/ZT/FinancePerson.cs` (ID, Name, PhoneNumber, Address, Status, CreationDate, WorkPlaceID, WorkPlaceName, SuperStatus, BranchProvinceID, BranchProvinceName).
- SQL: `ZT_FinancePerson` R/W (48, INSERT 201: Name, PhoneNumber, BranchProvinceID, WorkPlaceID, Address, Status, CreationDate; UPDATE 394; toggle 490/498), `ZT_WorkPlace`, `ZT_BranchProvince` (R), `Log` (W).
- **Dikkat**: `Key` ve `SuperStatus` kolonları başka kodda okunuyor (`FinanceRoleHelper.cs:48`, `BankTransactionsController.cs:1830`, `AccountController.cs:1420-1432`) ama bu controller'da **yazılmıyor** → nerede yazıldığı bu kapsamda `⚠ BULUNAMADI` (muhtemelen kullanıcı oluşturma akışı; `ReportScope.cs` yorumu `UserController.CreateUser`'a işaret ediyor — doğrulanmadı).
- Finans dışı: `ExpertController` uçlarına bağımlılık.
- Menü: `_Layout.cshtml:922`, `2326` (Admin menüsü).

---

## Grup özeti

### Kullanılan tabloların tekil listesi
Kısaltmalar: BI=BankIntroduction, BT=BankTransactions, BA=BankAccounts, BS=BankStatement, CI=CashIntroduction, CT=CashTransactions, FBS=FinancialBalanceSheet, TD=TimeDeposits, FR=FinanceReport(+FrSql/FrWarehouse), F=Finance, FM=FinanceMaintenance, FP=FinancePerson.

| Tablo | Okuyan | Yazan | Sınıf |
|---|---|---|---|
| `ZT_BankIntroduction` | BI, BT, BS, FBS, TD, F | BI, TD | Finans |
| `ZT_BankTransactions` | BI, BT, BS, FBS | BT, BS, TD (+ statik `CreateBankTransaction` üzerinden 11 dış controller) | Finans |
| `ZT_BankTransfers` | BS | BS | Finans |
| `ZT_ExchangeBreakSource` | BS | BS | Finans |
| `ZT_BankAccounts` | BA, BI | BA, BI | Finans |
| `ZT_BankPaymentInstructions` | — | BI | Finans |
| `ZT_BankPaymentInstructionDetails` | — | BI | Finans |
| `ZT_CustomerAccountPaymentPlans` | — | BI, BT | Finans (ödeme planı) |
| `ZT_CashIntroduction` | CI, CT, BT, BS, FBS, F | CI | Finans |
| `ZT_CashTransactions` | CI, CT, BS, FBS | CT, BS (+ statik `CreateCashTransaction` üzerinden dış controller'lar) | Finans |
| `ZT_TimeDeposits` | TD, BI | TD | Finans |
| `ZT_InterestCollections` | TD | TD | Finans |
| `ZT_FinIncomeExpense` | — | TD | Finans |
| `ZT_Investments` | BI | — | Finans (kapsam dışı modül) |
| `ZT_CreditContracts` | BI | — | Finans (kapsam dışı modül) |
| `ZT_Checks` | FBS | — | Finans (kapsam dışı modül) |
| `ZT_CustomerAccounts` | BI, BT, BS, CT, FBS, FR, FM | — | Finans (cari) |
| `ZT_AccountDebts` | FBS, FR, FM | FM (hard delete) | Finans (cari) |
| `ZT_AccountCredits` | FBS, FR | — | Finans (cari) |
| `ZT_AccountPayments` | BI, BT, BS, CI, FBS, FR | BS (insert/update/delete) | Finans (cari) |
| `ZT_AccountCollections` | BI, BT, BS, CI, FBS, FR | BS (insert/update/delete), BT (hard delete) | Finans (cari) |
| `ZT_AccountCollectionOrders` | BS | BS (update), BT (delete) | Finans↔Sipariş köprüsü (dönüştürülecek) |
| `ZT_AccountDebtsDeleteLog` | — | FM (**runtime CREATE TABLE IF NOT EXISTS**, `FinanceMaintenanceController.cs:574`) | Finans |
| `ZT_AccountDebtsInvoice`, `ZT_PaymentPlans`, `ZT_PaymentApprovalDetails` | FM | — | Finans |
| `ZT_FinancePerson` | BI, BT, BA, BS, CI, CT, FBS, F, FP, `FinanceAccess`, `FinanceRoleHelper`, `ReportScope` | FP | Finans (rol) |
| `Currency` | hepsi | — | Ortak tanım |
| `ZT_Currency` | BA (251, 431) | — | Ortak tanım (`⚠` `Currency` ile tutarsız ad) |
| `ZT_WorkPlace`, `ZT_BranchProvince` | hepsi | — | Ortak tanım |
| `Log` | — | BI, BT, BA, BS, CI, CT, TD, FP (`Methods.LogAdd`) | Ortak |
| `ZT_IntroductionAccessSummary` | `DefinitionAuditService` | `DefinitionAuditService` | Ortak (audit) |
| `ZT_Setting` | `_SideMenu_Finance.cshtml` | — | Ortak ayar (`Name='Reçeteli Üretim'` → finans dışı anlam) |
| admin DB `Users`, `UserRoles` | BT, BA, BS, CT, F | — | Merkezi kimlik |
| `ZT_Boss`, `ZT_AccountingPurchases` | BI, BT, BA, CI, CT, FBS, F | — | Rol tabloları |
| `ZT_LogisticsPerson`, `ZT_ProductionManager` | BI, CI, `ReportScope` | — | **Finans dışı** rol |
| `ZT_AcceptanceOfGoods`, `ZT_QualityControlPerson`, `ZT_PurchasingPerson` | `ReportScope.UserScopeTables` | — | **Finans dışı** rol |
| `ZT_ProductionPlanning` | BI, BT, BS, CI, CT, TD, FM (layout sohbeti), FBS (ticari borç) | — | **Finans dışı (üretim)** |
| `ZT_Orders`, `Product`, `SubProduct`, `Customer` | BS, FBS, FR (`ZT_Orders`) | — | **Finans dışı (satış/sipariş)** |
| `Supplier`, `ContainerType`, `ZT_Expert` | FBS, `ReportLookups` | — | **Finans dışı** |
| `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `ZT_ExpertReport`, `ZT_Purchases` | FBS, FR | — | **Finans dışı (bahçe/alım)** |
| `ZT_UsedHarvestManager`, `ZT_ProductionSergeantsExpenses`, `ZT_ProductionExpenses` | FR, FM | — | **Finans dışı** |
| `ZT_SalesTruck` | FR, FM | FM (**UPDATE**) | **Finans dışı (sevkiyat)** |
| `ZT_ExpertReportTruckExpenses`, `ZT_OrderClaims`, `ZT_OrderExpenses` | FM (`RefMappings`) | — | **Finans dışı** |
| `ZT_MaterialPurchases`, `ZT_MaterialInvoice`, `ZT_MaterialStockAll`, `ZT_PesticidePurchases`, `ZT_PesticideInvoice`, `ZT_PesticideStockAll` | FBS (+FM `RefMappings`) | — | **Finans dışı (stok)** |
| `ZT_DistributedPallet`, `ZT_ProductionConveyor`, `ZT_ProductionConveyorCost`, `ZT_PalletsLoadedTruck`, `ZT_StockMovementLog`, `ZT_ProductionSergeantExpenseBatches`, `ZT_ProductionSergeants` | FBS | — | **Finans dışı (üretim/MES)** |
| `ZT_Supplier`, `ZT_Customer`, `ZT_Transport`, `ZT_CuttingChief`, `ZT_TransportCompany` | BA (`GetReferenceName`, dinamik) | — | **Finans dışı** (`⚠` bu adlarla tabloların varlığı doğrulanmadı; hata yutuluyor) |
| `information_schema.columns` | FM | — | Sistem kataloğu |

DB nesneleri (tablo dışı): tetikleyici `trg_IntroductionAudit` + fonksiyon `public."fn_IntroductionAudit"()` (5 finans tablosunda); GUC `zto.audit_actor`. Sequence/view/stored function çağrısı bu grubun C# kodunda yok (ID'ler `serial` + `RETURNING "ID"` / `MAX("ID")`).

### Ortak bağımlılıkların tekil listesi
**C# (taşınması gereken dosyalar)**
- Yetki: `Services/UserRoleAuthorizeAttribute.cs`, `Services/RequireFinancePersonnelAttribute.cs`, `Helpers/FinanceAccess.cs`, `Helpers/FinanceRoleHelper.cs`, `Services/FinanceReport/FrAccess.cs`.
- Ortak yardımcılar: `Controllers/Methods.cs` (`LogAdd`, `ConvertToList`), `Models/Log.cs`, `Models/GlobalVeriables.cs`, `Services/IDateTimeProvider.cs` + `DateTimeProvider.cs`, `Helpers/ScriptJson.cs`, `Helpers/IntroductionAuditHelper.cs`, `Services/IDefinitionAuditService.cs` + `DefinitionAuditService.cs` + `DefinitionAuditRegistry.cs`, `Services/MenuDesignService.cs` (`IMenuDesignService`), `Services/ITCMBExchangeRateService.cs`, `Helpers/ReportScope.cs`, `Helpers/ReportErrorLog.cs`.
- Rapor katmanı: `Services/FinanceReport/*` (7 dosya), `Services/ReportKit/ReportLookups.cs`, `Models/Report/FinanceReport.cs`, `ReportDateRange.cs`, `ReportLookupItem.cs`, `SalesFinance.cs`.
- Modeller: `Models/ZT/{BankIntroduction, BankAccounts, CashIntroduction, TimeDeposit, InterestCollection, BankPaymentInstruction, BankTransferDto, FinancialBalanceSheetViewModels, FinancePerson, FinanceViewClass}.cs`, `Models/ViewModels/{BankCurrencyStatViewModel, StatisticGroupViewModel, CashDetailViewModel, BankExtractViewModel, CashExtractViewModel}.cs`, `Models/BankInstitutionList.cs`.
- Gizli derleme bağımlılıkları: `BankDropdownDto/CurrencyDropdownDto/SimpleDropdownDto` → `Controllers/CreditContractsController.cs:6987-7012`; `CustomerAccountsController.GetApprovalStatusCounts`; `BankStatsDto` vb. controller dosyalarının sonunda.
- DI (`Program.cs`): `IMenuDesignService` scoped (38), `IDefinitionAuditService` scoped (39), `IDateTimeProvider` singleton (63), `AddSession` (67), `AddHttpClient` (104), `ITCMBExchangeRateService` singleton (106), `IMemoryCache` (TCMB servisi için); varsayılan route `{controller=Account}/{action=Login}/{id?}` (826-828).

**Başka controller'lara çalışma zamanı bağımlılığı (AJAX/partial)**
`CustomerAccountCollection`, `CustomerAccountPayment`, `CustomerAccounts`, `AccountTransaction`, `PaymentApproval`, `PaymentManagement`, `Report` (logo), `Expert` (iş yeri/şube listesi), `Home` (Error/Closed), `Auth` (Permission), `Account` (Login). Banka/kasa işlem sayfaları ödeme ve tahsilat modallarını bu controller'lardan ödünç alır; onlar olmadan sayfalar çalışmaz.

**View / statik dosyalar**
- Layout: `_ProductionLayout`, `_ExpertLayout`, `_Layout`, `_ReportLayout`, `_ViewStart`.
- Shared partial: `_AddPaymentModal` (+`_CheckLeafGuard`), `_PostPaymentPlanningModal`, `_ReportFilterBar`, `_ReportHeader`, `_StatFilterCards`, `_CustomerSideMenus/{_SideMenu_Finance, _SideMenu_FinanceItems, _SideMenu_Patron, _SideMenu_AccountingPurchases, _SideMenu_Default}`, `_CustomerAccountNavMenus/_NavMenu_Patron`, `Components/IntroductionAudit/Default`, `_IntroductionAuditCell*`, `Views/CustomerAccountCollection/_CollectionModalsPartial`.
- Yerel JS: `wwwroot/js/zt/bankstatement/index.js`, `js/zt/banktransactions/{BankTransactionsPayments, BankTransactionsCollections}.js`, `js/zt/cashtransactions/{cashtransactionspayments, cashtransactionscollections}.js`, `js/zt/payments/{payments, searchable-select}.js`, `js/zt/collections/searchable-select.js`, `js/finance-report.js`, `js/report-page.js`, `js/stat-filter.js`, `lib/xlsx/xlsx.full.min.js`.
- Yerel CSS: `css/zt/{bankstatement, banktransaction, cashtransaction, timedeposits}/index.css`, `css/zt/customeraccountcollection/collections.css`, `css/zt/customeraccountpayment/payments.css`, `css/introduction-audit.css`, `css/report-page.css`, `css/stat-filter.css`.
- CDN: jQuery 3.6.0 (code.jquery.com), select2 4.1.0-rc.0 + select2-bootstrap-5-theme 1.3.0 (jsdelivr), DataTables 1.13.7 / responsive 2.5.0 / buttons 2.4.2 (cdn.datatables.net), JSZip 3.10.1, Font Awesome 5.15.4 / 6.0.0-beta3 / 6.4.0 (cdnjs), Chart.js (jsdelivr, sürümsüz). Dış servis: TCMB `today.xml`.

### Bulunamayanlar / doğrulanamayanlar (toplu)
- `⚠ BULUNAMADI` Ana finans tablolarının `CREATE TABLE` betikleri (repo'da yok; şema canlı DB'den alınmalı).
- `⚠ BULUNAMADI` Banka ekstresi dosya içe aktarma / otomatik eşleştirme — kodda yok.
- `⚠ BULUNAMADI` Sunucu tarafı Excel/PDF üretimi ve dosya yükleme — grubun hiçbir controller'ında yok (yalnız istemci CSV / SheetJS / `window.print`).
- `⚠ BULUNAMADI` `ZT_FinancePerson.Key` ve `SuperStatus` kolonlarını yazan kod (bu kapsamda).
- `⚠` `ZT_Currency` (BankAccounts) ve `GetReferenceName`'deki `ZT_Supplier/ZT_Customer/ZT_Transport/ZT_CuttingChief/ZT_TransportCompany` tablolarının gerçekten var olup olmadığı.
- `⚠` Çağrısı bulunamayan action'lar: BT `AddTransaction`, `DeleteTransaction`; BS `CreateVirman`, `GetWorkPlacesByBranch`, `GetCollectionOrders`; TD `CalculateInterestPreview`, `GetMaturedDeposits`; BI `GetAccountCards`, CI `GetCashCards` (literal taramada yakalanmadı).
- `⚠` Tablo listesi regex tabanlıdır; BankStatement gibi çok büyük dosyalarda nadir yazım biçimleri kaçmış olabilir.
