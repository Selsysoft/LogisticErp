# Envanter C — Ödeme / Tahsilat / Çek / Senet / Kredi grubu

Kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. Salt-okunur analiz; satır numaraları analiz anındaki dosya hâline göredir.
Yöntem: action imzaları, SQL stringleri, `url:`/`Url.Action` çağrıları, modal id'leri Grep/script ile tarandı; iş kuralı içeren bölümler aralık okunarak doğrulandı. Görülmeyen her şey `⚠ BULUNAMADI` olarak işaretlendi.

## 0. Tüm parçalar için ortak gözlemler

### Veri erişim biçimi
- Yedi controller'ın hepsinde veri erişimi **doğrudan controller içinde raw Npgsql** (`NpgsqlConnection` / `NpgsqlCommand` / `NpgsqlDataAdapter` + `DataTable`). Ayrı Warehouse/Repository sınıfı **yok**; EF yok.
- Tek DI bağımlılığı: `IDateTimeProvider` (`Services/IDateTimeProvider.cs`, `Services/DateTimeProvider.cs`; `Program.cs:63` singleton). `AccountCreditsController`'da constructor/DI hiç yok.
- `ITCMBExchangeRateService` bu yedi controller'da **kullanılmıyor**; kur değeri istemciden string olarak geliyor. İlgili view/JS dosyalarında TCMB/kur uç noktası çağrısı da bulunamadı (`⚠ BULUNAMADI`).
- `FinanceAccess`, `FinanceRoleHelper`, `SupplierCariHelper` bu yedi controller'da **çağrılmıyor**. `FinanceRoleHelper.IsSuperUser` yalnızca yan menü partial'ında (`Views/Shared/_CustomerSideMenus/_SideMenu_FinanceItems.cshtml:43`) geçiyor.

### Kiracı / DB bağlantısı
- Kiracı başına ayrı veritabanı. Bağlantı dizesinin tamamı oturumda tutulur: `HttpContext.Session.GetString("userDatabase")` (her action'da `new NpgsqlConnection(...)`).
- Oturuma yazıldığı yer: `Controllers/AccountController.cs:221, 1076, 1545`. `IntroductionAuditHelper.WithActor` (`Helpers/IntroductionAuditHelper.cs:40`) bağlantı dizesine `ApplicationName=ZtoFabrika` ve `Options=-c zto.audit_actor=<kullanıcı>` ekler; DB tarafında `fn_IntroductionAudit` trigger'ı bu değeri okur (`SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql:50-110`). Trigger uygulanan tablolar arasında bu grubun kullandığı `ZT_CashIntroduction`, `ZT_BankIntroduction`, `ZT_CustomerAccounts`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince`, `ZT_Boss`, `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_LogisticsPerson`, `ZT_ProductionManager`, `Customer`, `Product`, `SubProduct`, `Supplier` var.
- Admin DB: `GlobalVeriables.adminDatabase` (`Models/GlobalVeriables.cs`) — Payments/Collections'ta `conadmin` nesnesi oluşturuluyor; Checks ve CreditContracts belge sayfalarında `public."Customers"` tablosundan `QrKey` okunuyor (`ChecksController.cs:3395`, `CreditContractsController.cs:6481`).
- Kullanılan oturum anahtarları: `userDatabase`, `databaseName`, `factoryName`, `userRole`, `customerUserRole`, `customerUserKey`, `customerUserName`, `DocumentServerIP/Username/Password/FileName` (son dördü yalnız Checks + CreditContracts belge sayfaları).

### Yetki
- Rol filtresi: `UserRoleAuthorizeAttribute` (`Services/UserRoleAuthorizeAttribute.cs`) — kimliği doğrulanmamışsa `/Account/Login`, `ClaimTypes.Role` izinli listede değilse `/Auth/Permission` yönlendirmesi.
- Global filtre: yalnızca `SecurityAuditFilter` (`Program.cs:80`, `Services/AdminSystem/SecurityAuditFilter.cs`). **Global `AutoValidateAntiforgeryToken` yok**, global fallback authorization policy yok (`Program.cs:34` yalnız AdminSystem politikası).
- **`CheckBooksController` ve `AccountCreditsController` sınıflarında `[Authorize]` / `[UserRoleAuthorize]` YOK** (`CheckBooksController.cs:10`, `AccountCreditsController.cs:8`). Erişim yalnızca oturumdaki `userDatabase` değerinin varlığına dayanıyor.

### İş yeri (WorkPlace) filtresi
- Sunucu tarafında kullanıcıya göre zorunlu iş yeri kısıtı **uygulanmıyor**. İş yeri, istek parametresi olarak (`workPlaceId`, `workPlaceIds`) gelir ve `p."WorkPlaceID" = @WorkPlaceID` biçiminde opsiyonel filtre olur (örn. `CustomerAccountPaymentController.cs:914-916`).
- Sayfa GET action'larında role göre `ZT_Boss` / `ZT_FinancePerson` / `ZT_AccountingPurchases` / `ZT_LogisticsPerson` / `ZT_ProductionManager` tablosundan `Key = customerUserKey` ile kayıt okunur ve `ViewData["WorkPlaceID"]`, `WorkPlaceHeader`, `BranchProvinceHeader`, `FinanceID` vb. doldurulur (yalnız başlık/layout seçimi için). Bu sorgular **string birleştirme** ile kuruluyor (`CustomerAccountPaymentController.cs:68, 95, 123, 152, 181`; aynı kalıp Collections, Checks, Bills, AccountCredits'te).
- İş yeri ↔ cari eşlemesi: `ZT_CustomerAccounts` içinde `AccountGroup = 'İş Yeri Firması'` ve `ReferenceID = WorkPlaceID` (çek/senet keşideci-lehdar belirlemede kullanılır; `CustomerAccountCollectionController.cs:763-768`, `BillsController.cs:~410`, `ChecksController.cs:~1720`).

### Layout
- Liste sayfaları role göre `_ProductionLayout.cshtml` ya da `_Layout.cshtml` seçer (`Payments.cshtml:9-33`, aynı blok Collections/Checks/Bills'te). Rapor ve bazı sayfalar `_ExpertLayout.cshtml` kullanır.
- **`_ProductionLayout` üretim tablosuna bağımlı**: her sayfa GET'i `select * from public."ZT_ProductionPlanning" order by "ID" desc` çalıştırıp `ViewBag.ProductionPlanningChat`'e koyar (chat widget; `_ProductionLayout.cshtml:18`). Bu sorgu finans sayfalarının hepsinde var (aşağıda her parçada satır verildi).

### Excel / PDF / yazdırma / dosya
- Sunucu tarafı Excel/PDF üretimi **yok** (ClosedXML/EPPlus/iText/QuestPDF/`ExcelBuilder`/`ZtXlsxExport` çağrısı bu controller'larda bulunamadı).
- Dışa aktarma istemci tarafında: DataTables Buttons + JSZip + pdfmake (CDN). Yazdırma: `window.print()`.
- Dosya yükleme yalnız Checks ve CreditContracts belge sayfalarında: ağ paylaşımı + `Services/NetworkConnection.cs` + `System.Net.NetworkCredential` + `Methods.GetDirectories` + `Helpers/TenantFileAccess.TryResolve`.

### Log
- `Methods.LogAdd(Log, con)` (`Controllers/Methods.cs:334`) → `INSERT INTO public."Log" ("User","UserRole","Description","TableName","TableDataID","Process","Platform","CreationDate")` (`Methods.cs:362`). Model: `Models/Log.cs`. Çoğu yerde `transaction.Commit()` sonrasında çağrılır.

### Çalışma zamanı DDL
- Bu yedi controller'da ve `PaymentPlanHelper`'da `CREATE TABLE` / `ALTER TABLE` **yok**.
- Tek şema yoklaması: `ChecksController.cs:1092` — `information_schema.columns` üzerinden `ZT_Checks.LastBankID` kolonu var mı diye bakar; yoksa ilgili mantığı sessizce atlar. Kolonun betiği: `Docs/2026_Faz61H_Checks_LastBankID.sql` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS "LastBankID" integer NULL` + backfill).
- Bu grubun çekirdek tablolarının (`ZT_Checks`, `ZT_Bills`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_CreditContracts` …) `CREATE TABLE` betikleri depoda **`⚠ BULUNAMADI`**. Aşağıdaki kolon listeleri INSERT/UPDATE/SELECT ifadelerinden çıkarılmıştır; tam şema için canlı DB'den `pg_dump --schema-only` gerekir.
- Depoda bu tablolara dokunan betikler: `SQL/KrediBankaCari_Migration.sql`, `Docs/2026_Faz61H_Checks_LastBankID.sql`, `Docs/ReceteliUretim/2026_Faz50_MasrafCokluBag.sql:28-29` (`ZT_AccountDebts` + `UpdatedBy`, `UpdatedDate`).

### Banka / kasa hareketi yazan ortak statik metotlar (kapsam dışı controller'larda)
| Metot | Dosya:satır | Yazdığı tablo | Not |
|---|---|---|---|
| `BankTransactionsController.CreateBankTransaction(con, bankId, transactionType, accountingType, referenceId, amount, currencyId, transactionDate, description, dateTimeProvider)` | `Controllers/BankTransactionsController.cs:1740` | `ZT_BankTransactions` (`BankID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, Status, CreationDate`) | `NpgsqlTransaction` parametresi yok; hata olursa `false` döner (exception yutulur). `ZT_BankIntroduction.Balance` **güncellemez**. |
| `CashTransactionsController.CreateCashTransaction(...)` aynı imza | `Controllers/CashTransactionsController.cs:863` | `ZT_CashTransactions` (`CashID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, Status, CreationDate`) | Aynı davranış. |

Bu iki controller lojistik projesine birlikte taşınmak zorunda (ya da metotlar ortak bir servise çıkarılmalı).

---

## /CustomerAccountPayment/Payments

Controller: `Controllers/CustomerAccountPaymentController.cs` (4913 satır).

### Route'lar
Sınıf öznitelikleri (`:15-16`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]`.

| Action | HTTP | Satır | Antiforgery | Dönüş |
|---|---|---|---|---|
| `Payments(id, openModal, bankId, workPlaceId, currencyId, cashId, paymentMethod)` | GET | 26 | — | View |
| `GetSupplierGardens(customerAccountId)` | GET | 435 | — | Json |
| `GetGardenPaymentHistory(expertReportId)` | GET | 631 | — | Json |
| `GetAvailableCheckBooks(bankId)` | GET | 741 | — | Json |
| `GetPaymentList(customerAccountId, workPlaceId, startDate, endDate, paymentMethod)` | GET | 827 | — | Json |
| `AddPayment(... ~45 parametre)` | POST | 1043 | `[ValidateAntiForgeryToken]` | Json |
| `UpdatePayment(...)` | POST | 2120 | `[ValidateAntiForgeryToken]` | Json |
| `SaveQuickPaymentPlanning([FromBody] QuickPaymentPlanningDto)` | POST | 2620 | `[ValidateAntiForgeryToken]` | Json |
| `GetAllBranchProvinces()` | GET | 2717 | — | Json |
| `GetWorkPlacesByBranch(branchProvinceId)` | GET | 2757 | — | Json |
| `GetBanksByWorkPlaceAndBranch(workPlaceId, branchProvinceId)` | GET | 2800 | — | Json |
| `DeletePayment(id)` (silme öncesi bilgi) | POST | 2861 | `[ValidateAntiForgeryToken]` | Json |
| `ConfirmDeletePayment(id)` | POST | 2945 | `[ValidateAntiForgeryToken]` | Json |
| `GetPayments(customerAccountId, startDate, endDate)` | GET | 3117 | — | Json |
| `DailyPaymentReport(reportDate, workPlaceId, workPlaceIds, bankId, currencyId, paymentMethod, sortBy)` | GET | 3220 | — | View |
| `GetCustomerBankAccounts(customerId, typeAccount)` | GET | 4198 | — | Json |
| `GetPaymentDetail(id)` | GET | 4311 | — | Json |
| `GetEndorsableChecks(cashId)` | GET | 4461 | — | Json |
| `GetMatchingChecks(paymentId, documentNo)` | GET | 4596 | — | Json |
| `MatchPaymentWithCheck(paymentId, checkId)` | POST | 4714 | `[ValidateAntiForgeryToken]` | Json |

Private yardımcılar: `SaveSupplierPaymentShares` (2067), `BuildCurrencyTotalText` (3965), `BuildPaymentReportBankBalanceSummaries` (3976), `BuildPaymentReportCashBalanceSummaries` (4046), `GetCurrencies` (4112).

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/CustomerAccountPayment/Payments.cshtml` (2112 satır) | role göre `_ProductionLayout` / `_Layout` (`:9-33`) | `dailyPaymentReportModal` (450), `checkMatchModal` (538), `addPaymentModal` (598), `gardenPaymentHistoryModal` (1621) |
| `Views/CustomerAccountPayment/DailyPaymentReport.cshtml` (1714) | `_ExpertLayout` | — |
| `Views/Shared/_AddPaymentModal.cshtml` (1197) | partial (`Payments.cshtml:425`) | `addPaymentModal` (157) |
| `Views/Shared/_EditPaymentModal.cshtml` (1150) | partial (`:427`) | `editPaymentModal` (157) |
| `Views/Shared/_PostPaymentPlanningModal.cshtml` (177) | partial (`:1495`) | `postPaymentPlanningModal` (4) |
| `Views/Shared/_PaymentManagementMenu.cshtml` (217) | partial (`:131`) | — |
| `Views/Shared/_CheckLeafGuard.cshtml` (182) | `_AddPaymentModal.cshtml:1196` içinden | — |
| Yan menüler | `_CustomerSideMenus/_SideMenu_Finance.cshtml` (198), `_SideMenu_AccountingPurchases.cshtml` (202), `_SideMenu_Patron.cshtml` (206) | — |
| JS içinde üretilen modallar | `payments.js` | `confirmDeleteModal` (3694), `paymentDetailModal` (3805) |

Not: `Payments.cshtml` hem `_AddPaymentModal` partial'ını hem de `:598`'de ayrı bir `addPaymentModal` id'li blok içeriyor (aynı id iki kez görünüyor).
Not: `_AddPaymentModal.cshtml:1-20` ve `_EditPaymentModal.cshtml:1-20` **view içinde doğrudan Npgsql ile** `ZT_Setting` (`Name='Reçeteli Üretim'`) okuyor; bahçe bölümünü buna göre gizliyor.

### JS/CSS
Yerel:
- `wwwroot/js/zt/payments/payments.js` (7645 satır, 328 KB) — sayfanın asıl mantığı burada
- `wwwroot/js/zt/payments/searchable-select.js` (425 satır)
- `wwwroot/css/zt/customeraccountpayment/payments.css`

CDN: jQuery 3.6.4 (code.jquery.com), Bootstrap 4.6.2 bundle (jsdelivr), DataTables 1.13.7 + Responsive 2.5.0 + Buttons 2.4.2 (cdn.datatables.net, i18n eklentisi dahil), JSZip 3.10.1, pdfmake 0.2.7 + vfs_fonts (cdnjs). Select2 `_AddPaymentModal` içinde kullanılıyor (kaynağı layout'tan; bu view'da `<script src>` yok).
Inline script: 5 blok; ağırlık harici `payments.js`'te. URL'ler `window.PaymentConfig.urls` nesnesiyle view'dan aktarılıyor (`Payments.cshtml:1844-1871`).

### AJAX uçları → Action
| Çağrı yeri | URL | Hedef |
|---|---|---|
| `Payments.cshtml:1845-1859` / `payments.js:2760, 2859, 3540, 3567, 2924, 3595, 1337, 1747` | AddPayment, UpdatePayment, DeletePayment, ConfirmDeletePayment, GetPaymentList, GetPaymentDetail, GetAvailableCheckBooks, GetCustomerBankAccounts, SaveQuickPaymentPlanning, GetAllBranchProvinces, GetWorkPlacesByBranch, GetBanksByWorkPlaceAndBranch, GetMatchingChecks, MatchPaymentWithCheck | `CustomerAccountPayment` (kendi) |
| `payments.js:6524` | `/CustomerAccountPayment/GetSupplierGardens` | kendi (bahçe) |
| `payments.js:6869` | `/CustomerAccountPayment/GetGardenPaymentHistory` | kendi (bahçe) |
| `payments.js:7254` | `/CustomerAccountPayment/GetEndorsableChecks` | kendi |
| `Payments.cshtml:1853-1854` | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | **`CustomerAccounts`** |
| `Payments.cshtml:1861-1864`, `payments.js:6341` | `GetPaymentPlanningDetails`, `SavePaymentPlanning`, `GetAllCurrenciesForPlan`, `GetAccountBalancesByCurrency` | **`CustomerAccounts`** |
| `Payments.cshtml:1865-1867`, `payments.js:1491, 1594, 1682, 4385, 4468` | `/CustomerAccountCollection/GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer` | **`CustomerAccountCollection`** |
| `payments.js:2744` | `/BankTransactions/CheckInstructionSessionExists` | **`BankTransactions`** |
| `payments.js:4174, 4289` | `/PaymentManagement/GetCustomerDebtSummary` | **`PaymentManagement`** |
| `payments.js:4797, 4841` | `/AccountTransaction/GetWorkPlaceBalances`, `/AccountTransaction/GetAvailableCurrencies` | **`AccountTransaction`** |
| `payments.js:3177` | `window.open('/AccountTransaction/Transactions/' + accountId)` | **`AccountTransaction`** |
| `_CheckLeafGuard.cshtml:97` | `/Checks/CheckLeafLookup` | **`Checks`** |

`payments.js` ve `_AddPaymentModal` ayrıca `Checks.cshtml` ve `Bills.cshtml` tarafından da yükleniyor (ödeme modali o sayfalara gömülü).

### Service/Warehouse metotları
- Raw Npgsql, controller içinde.
- `PaymentPlanHelper.SyncCheckPaymentPlan` (`Services/PaymentPlanHelper.cs:33`) — 2 çağrı (`:1465`, `:1577`).
- `CreditContractsController.PayWithCredit` (statik; `:1636`).
- `BankTransactionsController.CreateBankTransaction` (`:1885`, `:2465`), `CashTransactionsController.CreateCashTransaction` (`:1903`, `:2529`).
- `Methods.LogAdd` (3 çağrı), `ScriptJson.Serialize` (`Helpers/ScriptJson.cs`; `:286`), `GlobalVeriables.adminDatabase` (`:53`).
- `using static` ile `BillsController` ve `ChecksController` iç sınıfları içe aktarılıyor (`:10-11`).

### Model/DTO/ViewModel
Hepsi controller dosyasının içinde iç sınıf: `PaymentRequestModel` (1017), `GardenPaymentShareDto` (2610), `QuickPaymentPlanningDto` (2848), `PaymentViewModel` (4155), `DailyPaymentReportViewModel` (4748) ve alt sınıfları `...FilterCardViewModel`, `...WorkPlaceGroupViewModel`, `...BankGroupViewModel`, `...GroupTotalViewModel`, `...LegacyCheckSummaryViewModel`, `...BankBalanceSummaryViewModel`, `...RowViewModel`, `...CashBalanceSummaryViewModel` (4785-4904). Ayrıca `Models/Log.cs`, `CreditPaymentResult` (`CreditContractsController.cs:6962`).
`Models/ZT/PaymentPlan.cs`, `AccountDebts.cs` vb. POCO'lar bu controller'da doğrudan kullanılmıyor (DataTable/reader ile çalışıyor).

### SQL nesneleri
| Tablo | Erişim | Örnek satırlar |
|---|---|---|
| `ZT_AccountPayments` | R / INSERT (1264, 1661, 1722) / UPDATE (2234, 2354, 4724) / **DELETE** (3029) | — |
| `ZT_Checks` | R / INSERT (1390, 1515, 2316) / UPDATE (1215, 2294) | — |
| `ZT_CheckMovements` | INSERT (1240, 1441, 1554, 2367) | — |
| `ZT_CheckBooks` | R (762, 1324) / UPDATE (1429) | — |
| `ZT_Bills` | R / INSERT (1593) | UPDATE 3066 yorum satırında |
| `ZT_BankTransactions` | R (877, 3312, 3504, 4008) / UPDATE (2439, 2489, 2553, 2994) + statik metot ile INSERT | — |
| `ZT_CashTransactions` | R (878, 4077) / UPDATE (2425, 2503, 2566, 3013) + statik metot ile INSERT | — |
| `ZT_CustomerAccounts` | R / UPDATE (1852 plan sıfırlama, 2636 hızlı plan) | — |
| `ZT_CustomerAccountPaymentPlans` | R (1956) / INSERT (2662) / UPDATE (1934) + helper | — |
| `ZT_BankPaymentInstructionDetails` | UPDATE (1952) | — |
| `ZT_AccountDebts` | R (1805) | — |
| `ZT_BankIntroduction`, `ZT_CashIntroduction`, `ZT_BankAccounts` (4245), `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | — |
| `ZT_CustomerAccountSupplierPaymentsShares` | R (506, 515, 545, 683) / INSERT (2092) | finans-dışı bağlı |
| `ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `Supplier`, `Product`, `SubProduct` | R (497-653) | finans-dışı |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R (68-181) | personel |
| `ZT_ProductionPlanning` | R (60) | üretim |
| `ZT_Setting` | R (view içinde; `_AddPaymentModal.cshtml:14`, `_EditPaymentModal.cshtml:14`) | ayar |
| `Log` | INSERT (`Methods.LogAdd`) | — |

View / function / sequence / trigger çağrısı: SQL stringlerinde bulunamadı (yalnız `RETURNING "ID"`, `SUBSTRING`, `ILIKE`).

Kolonlar (INSERT/UPDATE'ten):
- `ZT_AccountPayments`: `ID, CustomerAccountID, PaymentDate, PaymentMethod, WorkPlaceID, CashID, BankID, Amount, CurrencyID, ExchangeRate, PaymentDocumentNo, Description, CheckID, BillID, EndorsedCheckID, PaymentType, CrossExchangeRate, CrossRateOperator, CreationDate, CreatedBy, PaymentStatus, IsReconciled` (1264-1275, 1661-1676, 1722-1727) + kredi tarafından `CreditInstallmentID, CreditContractID` (`SQL/KrediBankaCari_Migration.sql:20-26`).
- `ZT_Checks`: `CheckNumber, BankID, BankName, BranchName, Amount, CurrencyID, ExchangeRate, IssueDate, DueDate, DrawerCustomerID, PayeeCustomerID, CheckStatus, CheckType, CheckOwnership, Description, Status, CreationDate, CreatedBy` (1390-1400) + UPDATE'te `CurrentHolderID, OriginalPayeeID, UsedDate, UpdatedDate, UpdatedBy` (1215-1225).
- `ZT_CheckMovements`: `CheckID, MovementType, FromCustomerID, ToCustomerID, MovementDate, Description, CreatedBy, CreationDate` (+ okumada `Status`).
- `ZT_Bills`: `BillNumber, BillType, BankID, BankName, BranchName, Amount, CurrencyID, ExchangeRate, IssueDate, DueDate, DrawerID, DraweeID, PayeeID, BillStatus, Description, Status, CreationDate, CreatedBy` (1593-1604).
- `ZT_CustomerAccountSupplierPaymentsShares`: `PaymentID, ExpertReportID, Amount, Description, Status, CreationDate, PaymentType` (2092-2098).
- `ZT_CustomerAccountPaymentPlans`: `CustomerAccountID, SourceType, SourceID, PaymentPlanDate, PaymentAmount, PaymentPlanCurrencyID, PaymentDescription, PaymentBranchProvinceID, PaymentWorkPlaceID, PaymentBankID, PaymentStatus, PlanningStatus, ApprovalStatus, PaymentCompletedDate, PaymentCompletedBy, Status, CreationDate, CreatedBy, UpdatedDate, UpdatedBy` (2662-2672, 1934-1940, `PaymentPlanHelper.cs:85-93`).
- `ZT_CustomerAccounts` (plan alanları): `PaymentPlanDate, PaymentAmount, PaymentDescription, PaymentBranchProvinceID, PaymentWorkPlaceID, PaymentBankID, PlanningStatus, ApprovalStatus, ApprovalSentDate, ApprovalSentBy, ApprovalDate, ApprovalBy, ApprovalNotes, PaymentOrderDate, PaymentOrderBy` (1852-1868) + `AccountCode, AccountName, AccountGroup, ReferenceID, CurrencyID, Status`.
- `ZT_BankPaymentInstructionDetails`: `ID, PaymentStatus, CompletedDate` (1952-1955).

### Bağlı finans sayfaları
`CustomerAccounts/Index` (`Payments.cshtml:218`), `Checks/Checks` (262), `Bills/Bills` (268), `CustomerAccountCollection/Collections` (273), `AccountTransaction/Transactions/{id}` (`payments.js:3177`), `PaymentManagement/PaymentPlanning | PaymentApprovalRequest | PaymentApprovals | ProcessPaymentOrders` (`_PaymentManagementMenu.cshtml:142-160`), `CustomerAccountPayment/DailyPaymentReport`. Hata durumunda `Home/Error` (`:56`).

### Finans dışı bağımlılıklar
- **Bahçe/müstahsil ödeme paylaştırma**: `GetSupplierGardens` (435-630), `GetGardenPaymentHistory` (631-740), `SaveSupplierPaymentShares` (2067-2117), `AddPayment` parametresi `gardenPaymentShares` (1077, 1924-1925). Tablolar: `ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `Supplier`, `Product`, `SubProduct`, `ZT_CustomerAccountSupplierPaymentsShares`. UI: `payments.js:6470-7250` civarı (`supplierGardensSection`, `gardenPaymentHistoryModal`), `_AddPaymentModal`/`_EditPaymentModal` içindeki bahçe bölümü, `Checks.cshtml:2709` garden-card şablonu.
- `ZT_Setting` → `'Reçeteli Üretim'` bayrağı (view'da).
- `ZT_ProductionPlanning` (60) — layout chat widget.
- Personel tabloları: `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager`.
- Cari grup listesi üretim terimleri içeriyor (`:237`, tam liste): `'Tedarikçi','Müşteri','Nakliye Firması','Sevk Nakliye Firması','Kesim Çavuşu','Üretim Çavuşu','Malzeme Tedarikçisi','İlaç Tedarikçisi','Analiz Firması','İş Yeri Firması','Masraf Hesabı','Personel'`.
- Üst menü linkleri (`Payments.cshtml:138-180`): `/specialReport/index`, `/Boss/LiveMonitor`, `/productioncost/index`, `/readystock/index`, `/warehousesituation/index`, `/expertreport/allreports`, `/expertchef/index`, `/productionplanning/index`, `/orderheader/index`, `/SalesProductLogistic/index`.
- `IMenuDesignService` (`@inject`, `Payments.cshtml:5`, `IsSidebarMenuAsync` `:192`).

### Yetki
- Sınıf düzeyi rol listesi yukarıda; action bazında ek rol kontrolü **yok**.
- Sayfa GET'i role göre personel kaydını okur, layout'u seçer; veri kısıtlamaz.
- DB bağlantısı: `Session["userDatabase"]`. İş yeri filtresi: yalnız istek parametresi.

### İş kuralları
- **Ödeme yöntemleri** (`:330-337`): `Nakit`, `Banka` (etiket "Banka Havalesi/Eft"), `Çek`, `Senet`, `Kredi Kartı`, `Diğer`. Sunucuda ayrıca `Kredi` dalı var (`:1634`) ancak `creditContractId` gönderen istemci kodu `payments.js` / `_AddPaymentModal` içinde **`⚠ BULUNAMADI`**.
- **AddPayment tek transaction** (`:1092` → Commit `:1969`). Sıra:
  1. Çek ciro (`endorsedCheckId`; 1176-1315): çek `Portföyde` ya da (`Tahsil Edildi` ve `CashID` dolu), türü müşteri çeki, `CurrentHolderID` boş olmalı (1179-1188). Çek `CheckStatus='Ciro Edildi'`, `CheckOwnership='Ciro Edildi'`, `CurrentHolderID`/`PayeeCustomerID` = yeni cari, `OriginalPayeeID` = eski lehdar (1215-1225). `ZT_CheckMovements`'a `MovementType='Ciro'` (1240). Ödeme kaydı `PaymentType='Çek Ciro'`, belge no = çek no (1264-1301). Tutar çek tutarından farklıysa çek tutarına zorlanır (1210-1211).
  2. Koçandan kendi çekimiz (`checkBookId`; 1320-1470): koçan yaprağı kullanılmış mı ve aynı numaralı aktif çek var mı kontrolü; `ZT_Checks` INSERT `CheckStatus='Kullanıldı'`, `CheckType='Kendi Çekimiz'`, `CheckOwnership='Kendi Çekimiz'` (1390-1400); `ZT_CheckBooks.Status='Kullanıldı'` (1429); hareket `MovementType='Ödeme'` (1441); `PaymentPlanHelper.SyncCheckPaymentPlan(...,"Kullanıldı",...)` (1465).
  3. Manuel çek no (1475-1585): aynı, koçan güncellemesi olmadan.
  4. Senet (1590-1627): `ZT_Bills` INSERT `BillStatus='Ödendi'`.
  5. Kredi (1634-1650): `CreditContractsController.PayWithCredit`.
  6. Ödeme kaydı (1656-1790): çapraz kurda `PaymentType='Çapraz Kur'`, tutar = borç para birimindeki tutar, `ExchangeRate=1`, `CrossExchangeRate`/`CrossRateOperator` saklanır; normalde `PaymentStatus='Tamamlandı'`, `IsReconciled=false`. Çek ise belge no = çek no, açıklamaya `[Çek No: X]` eklenir.
  7. Cari üzerindeki ödeme planı alanları sıfırlanır (1852-1868).
  8. Banka/kasa hareketi yalnız `Nakit` / `Banka` / `Kredi Kartı` için (1880-1919): `TransactionType='Çıkış'`, `AccountingType='Cari Ödeme'`, `ReferenceID=paymentId`; çapraz kurda gerçek ödeme tutarı/para birimi. Çek/Senet ödemelerinde bu aşamada banka/kasa hareketi **oluşmaz** (çek için `Checks/UpdateCheckStatus`'ta oluşur).
  9. Bahçe payları (1924).
  10. Talimat kapama (`instructionPlanId`; 1930-1967): `ZT_CustomerAccountPaymentPlans` ve `SourceType='Talimatlı Plan'` ile bağlı `ZT_BankPaymentInstructionDetails` `'Tamamlandı'`.
- **Cari bakiye**: ayrı bakiye kolonu güncellenmez; borç = `SUM(ZT_AccountDebts.Amount)`, ödeme = `SUM(ZT_AccountPayments.Amount)` (1805-1815).
- **ConfirmDeletePayment** (2985-3084): `Banka`/`Kredi Kartı` ise `ZT_BankTransactions.Status=false WHERE ReferenceID=@PaymentID` (**`AccountingType` filtresi yok**, 2993-2996); `Nakit` ise `ZT_CashTransactions` aynı şekilde (3012-3015); ödeme **fiziksel DELETE** (3029). Çek/senet durumunu geri alma blokları yorum satırı (3040-3080).
- **Çek-ödeme eşleştirme**: `GetMatchingChecks` (4596-4712) — tam eşleşme `CheckNumber = DocumentNo` veya çek numarasının 5 karakterlik pencereleri belge no içinde aranır; cari = çekin `PayeeCustomerID`'si, kısmi eşleşmede banka da eşleşmeli. `MatchPaymentWithCheck` (4714-4746) yalnız `ZT_AccountPayments.CheckID` günceller (transaction yok).
- **Ciro edilebilir çekler**: `GetEndorsableChecks` (4461-4594) — `Portföyde` veya (`Tahsil Edildi` ve `CashID` dolu).
- **Hızlı ödeme planı**: `SaveQuickPaymentPlanning` (2620-2714) — `ZT_CustomerAccounts` plan alanları + `ZT_CustomerAccountPaymentPlans` INSERT (`PaymentStatus='Beklemede'`, `PlanningStatus='Planlama Yapıldı'`, `ApprovalStatus='Beklemede'`).
- **Günlük ödeme raporu** (3220-3963): üç sorgu — (a) ana liste (3250-3345), çekli ödemelerde rapor tarihi `ZT_BankTransactions` içindeki `'Çek Tahsil'/'Çek Ödeme'` hareketinin `TransactionDate`'i, çek durumu `'Tahsil Edildi'` (3312-3340); (b) "legacy" çek özeti (3491-3516); (c) ödeme tarihine göre çek satırları (3642-3654). Banka/kasa bakiye özeti hareketlerden hesaplanır: `Giriş` − `Çıkış`, `Status=true` (3976-4110). Çoklu iş yeri filtresi virgüllü `workPlaceIds` (3240-3247).
- **Belge/makbuz numarası üretimi**: yok — `paymentDocumentNo` kullanıcıdan gelir veya çek numarası atanır (1707-1708). Otomatik numara üreteci `⚠ BULUNAMADI`.

### Dosya yükleme / Excel / PDF / yazdırma
Sunucu helper'ı yok. DataTables Buttons (html5/print) + JSZip + pdfmake; `window.print()` (`Payments.cshtml:292`, `DailyPaymentReport.cshtml:680`).

---

## /CustomerAccountCollection/Collections

Controller: `Controllers/CustomerAccountCollectionController.cs` (5046 satır).

### Route'lar
Sınıf (`:17-18`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]`.
**Hiçbir POST action'da `[ValidateAntiForgeryToken]` yok.**

| Action | HTTP | Satır |
|---|---|---|
| `Collections(...)` | GET | 29 |
| `GetCollectionList(customerAccountId, ...)` | GET | 407 |
| `AddCollection(... ~40 parametre)` | POST | 637 |
| `GetCustomerCreditSummary(customerAccountId, currencyId)` | GET | 1563 |
| `GetAvailableCurrenciesForCollection(customerAccountId)` | GET | 1865 |
| `GetCustomerCurrency(customerAccountId)` | GET | 1950 |
| `GetCustomerOrders(customerAccountId)` | GET | 2024 |
| `GetBanksByWorkPlaceCustomer(workPlaceId, currencyId)` | (fiil özniteliği yok) | 2180 |
| `GetCashByWorkPlaceCustomer(workPlaceId, currencyId)` | (fiil özniteliği yok) | 2239 |
| `GetCustomerCreditDetails(customerAccountId)` | GET | 2316 |
| `GetCustomerCreditSummarySimple(customerAccountId)` | GET | 2396 |
| `UpdateCollection(...)` | POST | 2446 |
| `GetCollectionForUpdate(id)` | GET | 3227 |
| `DeleteCollection(id)` (silme öncesi bilgi) | POST | 3574 |
| `ConfirmDeleteCollection(id)` | POST | 3657 |
| `GetCollections(customerAccountId, startDate, endDate)` | GET | 3827 |
| `GetCustomerBankAccounts(customerId, typeAccount)` | GET | 4017 |
| `DailyCollectionReport(...)` | GET | 4127 |
| `GetCollectionDetail(id)` | GET | 4679 |

Private: `GetCurrencies` (3931), `BuildCollectionCurrencyTotalText` (4530), `BuildCollectionReportBankBalanceSummaries` (4541), `BuildCollectionReportCashBalanceSummaries` (4611).

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/CustomerAccountCollection/Collections.cshtml` (806) | role göre `_ProductionLayout` / `_Layout` | `dailyCollectionReportModal` (476) |
| `Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml` (1533) | partial (`Collections.cshtml:453`) | `addCollectionModal` (47), `editCollectionModal` (854) |
| `Views/CustomerAccountCollection/DailyCollectionReport.cshtml` (1608) | `_ExpertLayout` | — |
| JS içinde üretilen | `collections.js` | `confirmDeleteModal` (6262), `collectionDetailModal` (6453) |
| Yan menüler | `_SideMenu_Finance.cshtml` (136), `_SideMenu_Patron.cshtml` (140) | — |

`_CollectionModalsPartial.cshtml:1-14` de view içinde Npgsql ile `ZT_Setting` ('Reçeteli Üretim') okuyor.

### JS/CSS
Yerel: `wwwroot/js/zt/collections/collections.js` (307 KB), `wwwroot/js/zt/collections/searchable-select.js` (payments'takinden ayrı kopya), `wwwroot/css/zt/customeraccountcollection/collections.css`, `wwwroot/css/zt/accounttransaction/transactions.css` (`Collections.cshtml:563`).
CDN: Payments ile aynı set (jQuery 3.6.4, Bootstrap 4.6.2, DataTables 1.13.7 + Responsive + Buttons, JSZip, pdfmake).
Inline script: 3 blok; mantık `collections.js`'te. URL'ler `window.CollectionConfig.urls` (`Collections.cshtml:579-593`).

### AJAX uçları → Action
| Çağrı yeri | URL | Hedef |
|---|---|---|
| `Collections.cshtml:579-587`, `collections.js:3373, 6133, 6212, 6235, 4053, 3449, 6300, 2503, 4553` | AddCollection, UpdateCollection, DeleteCollection, ConfirmDeleteCollection, GetCollectionForUpdate, GetCollectionList, GetCollectionDetail, GetCustomerBankAccounts | kendi |
| `collections.js:1330, 4508, 5419` | `/CustomerAccountCollection/GetCustomerOrders` | kendi (**sipariş**) |
| `collections.js:1729` | `/CustomerAccountCollection/GetAvailableCurrenciesForCollection` | kendi |
| `collections.js:1871, 4367, 6735, 6770` | `GetCustomerCreditSummary` | kendi |
| `collections.js:1023, 1084, 4877 / 2272, 2344, 2417, 5034` | `GetCashByWorkPlaceCustomer`, `GetBanksByWorkPlaceCustomer` | kendi |
| `Collections.cshtml:588-589`, `collections.js:4928, 4959, 4995` | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | **`CustomerAccounts`** |
| `collections.js:3855` | `/AccountTransaction/Transactions/{id}` | **`AccountTransaction`** |
| `Collections.cshtml:586` | `Url.Action("GetAvailableCheckBooks","CustomerAccountCollection")` | **Hedef action controller'da yok** (`⚠ BULUNAMADI` — ölü URL) |
| `collections.js:2082` | `urls.getCustomerCurrency` | Config nesnesinde bu anahtar tanımlı değil (`Collections.cshtml:579-593`); action `GetCustomerCurrency` (1950) mevcut ama URL `undefined` kalıyor |

Ayrıca bu controller'ın uçları `Payments.cshtml`, `Checks.cshtml` ve `Bills.cshtml` tarafından da çağrılıyor (`GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`).

### Service/Warehouse metotları
Raw Npgsql. `PaymentPlanHelper.SyncCheckPaymentPlan` (939, 1069, 2702, 2745), `PaymentPlanHelper.CancelCheckPaymentPlan` (2763), `BankTransactionsController.CreateBankTransaction` (951, 1080, 1290, 2690, 2972), `CashTransactionsController.CreateCashTransaction` (1314, 3034), `Methods.LogAdd` (1529, 3204), `ScriptJson.Serialize` (288), `GlobalVeriables.adminDatabase`. `System.Text.RegularExpressions` kullanılıyor (`:8`).

### Model/DTO/ViewModel
Controller içinde: `CollectionRequestModel` (609), `OrderAllocation` (1555), `CollectionViewModel` (3974), `DailyCollectionReportViewModel` (4874) + alt sınıflar (4912-5017). Namespace düzeyinde aynı dosyada: `LegacyCheckSummary` (5028), `PaymentDateCheckRow` (5035).

### SQL nesneleri
| Tablo | Erişim |
|---|---|
| `ZT_AccountCollections` | R / INSERT (1145, 1199) / UPDATE (2882) / **DELETE** (3736) |
| `ZT_AccountCollectionOrders` | R / INSERT (1430, 3162) / DELETE (3086) |
| `ZT_Checks` | R / INSERT (856, 1002, 2712) / UPDATE (2641, 3751) / **DELETE** (2755) |
| `ZT_CheckMovements` | INSERT (913, 1044) |
| `ZT_CheckBooks` | R (788) / UPDATE (898) |
| `ZT_Bills` | R / INSERT (1097, 2823) / UPDATE (2778, 3774) / **DELETE** (2861) |
| `ZT_BankTransactions` | R (460, 4573) / UPDATE (2946, 2995, 3057, 3702) / **DELETE** (2683) + statik INSERT |
| `ZT_CashTransactions` | R (461, 4642) / UPDATE (2933, 3008, 3070, 3719) + statik INSERT |
| `ZT_AccountCredits` | R (1631, 1879, 2339) |
| `ZT_AccountDebts` | R (1746, 1883) |
| `ZT_AccountPayments` | R (1776, 1885) |
| `ZT_CustomerAccounts`, `ZT_BankIntroduction`, `ZT_CashIntroduction`, `ZT_BankAccounts` (3337, 4064), `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R |
| `ZT_CustomerAccountPaymentPlans` | helper üzerinden INSERT/UPDATE |
| `ZT_Orders` | R (1383, 2110, 2343, 3123, 3420 …) — **satış** |
| `Customer` | R (2039) — **satış** |
| `Product` | R (2111, 3422, 4764) — **ürün** |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R (71-184) |
| `ZT_ProductionPlanning` | R (63) |
| `ZT_Setting` | R (view içinde) |
| `Log` | INSERT |

Kolonlar:
- `ZT_AccountCollections`: `ID, CustomerAccountID, CollectionDate, CollectionMethod, WorkPlaceID, CashID, BankID, Amount, CurrencyID, ExchangeRate, CollectionDocumentNo, Description, CheckID, BillID, CollectionType, EndorsedCheckID, CrossExchangeRate, CrossRateOperator, CollectionStatus, IsReconciled, CreationDate, CreatedBy` (1145-1160, 1199-1206).
- `ZT_AccountCollectionOrders`: `AccountCollectionID, OrdersID, Amount` (1430-1432).
- `ZT_Checks` (tahsilat): yukarıdakilere ek `CashID`; `CheckType='Tahsil Edilen Çek'` (856-868); silmede `CollectionID`, `UsedDate`, `UpdatedDate` (3751-3757).
- `ZT_Bills`: silmede `CollectionID, UsedDate, UpdatedDate` (3774-3780).
- `ZT_Orders` (okunan): `ID, Name, DeliveryDate, ProductID, TotalOrderPrice, CurrencyID, CustomerID, Status, OrderStatus` (2090-2121).

### Bağlı finans sayfaları
`CustomerAccounts/Index` (`Collections.cshtml:152`), `CustomerAccountPayment/Payments` (195), `Checks/Checks` (200), `Bills/Bills` (206), `AccountTransaction/Transactions/{id}`, `DailyCollectionReport`. `AccountCredits/Index` bu sayfaya link veriyor (`Views/AccountCredits/Index.cshtml:291`).

### Finans dışı bağımlılıklar
- **Sipariş tahsis**: `GetCustomerOrders` (2024-2178), `AddCollection` içindeki tahsis bloğu (1338-1466), `UpdateCollection` (3083-3187), parametre `orderAllocationsJson`. Tablolar `ZT_Orders`, `Customer`, `Product`, `ZT_AccountCollectionOrders`. Kural: sipariş `OrderStatus NOT IN ('Tamamlandı','İptal Edildi')`, kalan = `TotalOrderPrice − SUM(tahsis)`; para birimi tahsilatla aynı olmalı; tahsis kalan tutarı ve toplam tahsilatı aşamaz (1376-1452).
- `ZT_ProductionPlanning` (63), personel tabloları (71-184), `ZT_Setting` ('Reçeteli Üretim').
- Üst menü linkleri (`Collections.cshtml:76-118`): Payments ile aynı üretim/satış sayfaları.

### Yetki
Sınıf düzeyi rol listesi; action bazında ek kontrol yok; POST'larda antiforgery yok. DB: `Session["userDatabase"]`. İş yeri: istek parametresi.

### İş kuralları
- **Tek transaction** (`:687` → Commit `:1468`).
- **Çek tarafları** (756-780, 882-884): keşideci (`DrawerCustomerID`) = tahsilat yapılan cari; lehdar (`PayeeCustomerID`) = iş yerinin `'İş Yeri Firması'` carisi. (Değişken adları kodda ters; parametre atamaları yorumlarla düzeltilmiş.)
- **Tahsilat çeki başlangıç durumu** (816-852, 981-1000): istekteki `checkStatus` → `Portföyde` (+`CashID`), `Bankada`/`Bankaya Yatırıldı` → `Bankaya Yatırıldı`, `KasayaCiro`/`Kasaya Al` → `Tahsil Edildi` + `CashID` (ciro edilebilir; parasal kasa hareketi yok). `checkStatus` boşsa: `checkBankId` varsa `Bankaya Yatırıldı`, `checkCashId` varsa `Portföyde`, aksi hâlde varsayılan `Tahsil Edildi`.
- `Bankaya Yatırıldı` ise aynı anda banka hareketi: `Giriş` / `'Çek Tahsil'` / `ReferenceID = çek ID` (947-960, 1077-1090). Portföyde ve Kasaya Al durumlarında parasal hareket yok.
- Koçan seçildiyse `ZT_CheckBooks.Status='Kullanıldı'` (898-900); `ZT_CheckMovements` INSERT (913, 1044); `PaymentPlanHelper.SyncCheckPaymentPlan` (939, 1069).
- **Senet**: `ZT_Bills` INSERT `BillStatus='Tahsil Edildi'` (1097-1106).
- **Tahsilat kaydı**: çapraz kurda `CollectionType='Çapraz Kur'` (1145-1160); normalde `CollectionStatus='Tamamlandı'`, `IsReconciled=false` (1199).
- **Banka/kasa hareketi** yalnız `Nakit` / `Banka` / `Kredi Kartı` (1285-1335): `Giriş` / `'Cari Tahsilat'` / `ReferenceID = collectionId`, gerçek tahsilat tutarı ve para birimiyle.
- **Güncelleme** (2446-3225): çek için önce o çeke ait `'Çek Tahsil'` banka hareketleri **DELETE**, sonra yeniden oluşturma (2681-2697); çek/senet kaldırılırsa `ZT_Checks` / `ZT_Bills` **fiziksel DELETE** (2755, 2861) + `CancelCheckPaymentPlan` (2763); sipariş tahsisleri silinip yeniden yazılır (3086, 3162).
- **Silme** (3695-3793): banka hareketi `Status=false` (`AccountingType='Cari Tahsilat'` ve `TransactionType='Giriş'` filtresiyle; 3702-3706), kasa hareketi `Status=false` (3719), tahsilat **fiziksel DELETE** (3736), bağlı çek `CheckStatus='Bekliyor'`, `CollectionID=NULL` (3751-3757), bağlı senet `BillStatus='Bekliyor'` (3774-3780). `'Bekliyor'` senet durum listesinde (Portföyde/Teminata Verildi/Ödendi/Protestolu/İptal) yer almıyor.
- **Cari alacak özeti** `GetCustomerCreditSummary` (1563-1863): alacak = `ZT_AccountCredits`, tahsilat = `ZT_AccountCollections` (tamamlanan / onay bekleyen / planlanan ayrı), borç = `ZT_AccountDebts`, ödeme = `ZT_AccountPayments`; para birimine göre filtre ve mahsuplaşma hesabı (1802+).
- **Günlük tahsilat raporu** (4127-4528) + banka/kasa bakiye özetleri (4541-4677); Payments raporuyla aynı yapı.
- Belge numarası üretimi: yok (kullanıcı girişi / çek no). `⚠ BULUNAMADI`.

### Dosya yükleme / Excel / PDF / yazdırma
İstemci tarafı DataTables Buttons + JSZip + pdfmake; `window.print()` (`Collections.cshtml:223`, `DailyCollectionReport.cshtml:637`).

---

## /Checks/Checks (+ CheckBooks)

Controller'lar: `Controllers/ChecksController.cs` (3725), `Controllers/CheckBooksController.cs` (550).

### Route'lar
**ChecksController** — sınıf (`:15-16`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]`. **Hiçbir POST'ta `[ValidateAntiForgeryToken]` yok.**

| Action | HTTP | Satır |
|---|---|---|
| `Checks(status, customerId, checkBookSerialNo, checkOwnership, startDate, endDate)` | GET | 25 |
| `CheckDetailedReport(startDate, endDate, workPlaceId, bankId, currencyId, sortBy)` | GET | 561 |
| `GetCheckMovements(checkId)` | GET | 874 |
| `GetAllCashes()` | GET | 932 |
| `UpdateCheckStatus(id, status, bankId, cashId, depositDate, cashEndorse, cashCollect)` | POST | 974 |
| `GetCheckDetail(id)` | GET | 1974 |
| `EditCheck(id)` | GET | 2124 |
| `EditCheck(CheckEditViewModel)` | POST | 2262 |
| `CheckLeafLookup(checkNumber)` | GET | 2776 |
| `CheckDuplicateCheckNumber(checkNumber, currentCheckId)` | GET | 2830 |
| `DeleteCheck(id)` | POST | 2882 |
| `HealthCheck()` | GET | 3334 |
| `CheckDocuments(id)` | GET | 3377 |
| `CheckDosyaYukle(files, folder, qrkey)` | POST | 3459 |
| `GetCheckFile(filePath)` | GET | 3512 |
| `DownloadCheckFile(filePath)` | GET | 3553 |
| `DeleteCheckFile([FromBody] DeleteFileModel)` | POST | 3596 |

Private: `GetStatusNote` (1900), `GetCurrencies` (2216), `GetNetworkCredentials` (3639), `RefreshSessionCredentials` (3670), `EnsureCheckDirectoryStructure` (3675), `GetContentType` (3698).

**CheckBooksController** — **sınıfta `[Authorize]` ve rol özniteliği YOK** (`:10`).

| Action | HTTP | Satır | Not |
|---|---|---|---|
| `Index(bankIntroductionId, serialNo, status)` | GET | 22 | |
| `AddCheckBook(CheckBookAddViewModel)` | POST | 167 | `[IgnoreAntiforgeryToken]` |
| `DeleteCheck(id)` | POST | 312 | fiziksel DELETE (353) |
| `UpdateCheckStatus(id, status)` | POST | 387 | |
| `GetAvailableChecksByBank(bankIntroductionId)` | GET | 468 | |

"CheckLeaf (3B koçan)": ayrı bir `CheckLeaf` action'ı **yok**. 3B çek yaprağı tamamen istemci tarafında (`Checks.cshtml` içindeki `checkLeafModal`); sunucuda yalnız `CheckLeafLookup` (koçan yaprağı doğrulama) var.

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/Checks/Checks.cshtml` (5534 satır, 340 KB) | role göre `_ProductionLayout` / `_Layout` | `ciroChecksModal` (1140), `checkMovementsModal` (1179), `updateStatusModal` (1225), `checkLeafModal` (1366), `addCheckModal` (1400), `addPaymentModal` (1736), `checkDetailedReportModal` (2648), `confirmModal` (2682) |
| `Views/Checks/EditCheck.cshtml` (576) | `_ProductionLayout` | — |
| `Views/Checks/CheckDetailedReport.cshtml` (995) | `_ExpertLayout` | — |
| `Views/Checks/CheckDocuments.cshtml` (827) | `_ProductionLayout` | `deleteConfirmModal` (457), `deleteSuccessModal` (485), `deleteErrorModal` (509) |
| `Views/Checks/Checks.cshtml.bak2` (4870 satır) | yedek dosya — taşınmamalı | — |
| `Views/CheckBooks/Index.cshtml` (1073) | `_ExpertLayout` | `addCheckBookModal` (254) |
| Partial'lar (Checks.cshtml) | `_SideMenu_Finance` (175), `_SideMenu_AccountingPurchases` (179), `_SideMenu_Patron` (183), `_CheckLeafGuard` (5532) | — |

### JS/CSS
Yerel: `wwwroot/css/zt/checks/checks.css`, `wwwroot/css/zt/customeraccountpayment/payments.css`, `wwwroot/js/zt/payments/payments.js` + `searchable-select.js` (`Checks.cshtml:5477-5478` — ödeme modali için), `wwwroot/css/zt/checkbooks/index.css`. Checks'e özel ayrı JS dosyası **yok**; sayfa mantığı inline (4 `<script>` bloğu, ~2700 satır).
CDN: jQuery **3.6.0 ve 3.6.4 birlikte** (`Checks.cshtml:66, 69`), Bootstrap 4.6.2 bundle (iki kez: 67, 72), DataTables 1.13.7 + Responsive 2.5.0 + Buttons 2.4.2, JSZip 3.10.1. `CheckDocuments.cshtml`: jQuery 3.6.0, Font Awesome 5.15.1 (cdnjs). `CheckBooks/Index`: jQuery 3.6.4, Bootstrap 4.6.2, DataTables + Responsive.
**3B kütüphane yok**: three.js vb. kullanılmıyor. 3B çek yaprağı saf CSS 3D (`perspective`, `transform-style: preserve-3d`, `rotateY(180deg)`; `Checks.cshtml:1317-1366`) + inline JS (`showCheckLeaf`, fare eğimi; `:4273-4490`). Veri sunucuda `CHK3D` JSON haritasına gömülür (`:4308`), AJAX yapılmaz.

### AJAX uçları → Action
`Checks.cshtml`:
| Satır | URL | Hedef |
|---|---|---|
| 4242 | `UpdateCheckStatus` | kendi |
| 5258 | `GetCheckMovements` | kendi |
| 3975 | `DeleteCheck` | kendi |
| 4783 | `EditCheck` | kendi |
| 4132 | `/checks/GetAllCashes` | kendi |
| 5515 | `CheckDetailedReport` | kendi |
| 1043 | `/checks/CheckDocuments?id=` | kendi |
| 4502, 4516 | `/CustomerAccountPayment/GetEndorsableChecks` | **CustomerAccountPayment** |
| 5099, 5421-5432, 4924 | `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetCustomerBankAccounts`, `GetAvailableCheckBooks`, `SaveQuickPaymentPlanning`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch` | **CustomerAccountPayment** |
| 3564, 5433-5435 | `GetBanksByWorkPlaceCustomer`, `GetCustomerCreditSummary`, `GetCashByWorkPlaceCustomer` | **CustomerAccountCollection** |
| 4839, 5428 | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | **CustomerAccounts** |
| 3996 | `GetBankList` | **BankTransactions** |
| 2902 | `GetCustomerDebtSummary` | **PaymentManagement** |
| 3463 | `/AccountTransaction/GetWorkPlaceBalances` | **AccountTransaction** |
| 565 | `/BankTransactions/Index?bankId=` (link) | **BankTransactions** |
| 584, 605 | `/AccountTransaction/Transactions?id=` (link) | **AccountTransaction** |
| `_CheckLeafGuard.cshtml:97` | `/Checks/CheckLeafLookup` | kendi |

`EditCheck.cshtml`: `CheckDuplicateCheckNumber` (381), `DeleteCheck` (517), form POST `EditCheck` (47).
`CheckDocuments.cshtml`: `/Checks/DeleteCheckFile` (684), `/Checks/CheckDosyaYukle` (752), `/Checks/HealthCheck` (817), `/Checks/GetCheckFile` (635, 643), `/Checks/DownloadCheckFile` (647).
`CheckBooks/Index.cshtml`: `AddCheckBook` (845), `DeleteCheck` (934), `UpdateCheckStatus` (961), `Index` (987), link `Checks/Checks` (38, 86).
`CheckBooksController.GetAvailableChecksByBank` için bu view'larda çağrı bulunamadı (`⚠ BULUNAMADI`; başka sayfadan çağrılıyor olabilir).

### Service/Warehouse metotları
Raw Npgsql. `PaymentPlanHelper.SyncCheckPaymentPlan` (3 çağrı: UpdateCheckStatus ~1865, EditCheck 2574 …), `PaymentPlanHelper.CancelCheckPaymentPlan` (2993), `BankTransactionsController.CreateBankTransaction` (1614), `IntroductionAuditHelper.GetActor` (~1869), `Methods.LogAdd` (3), `Methods.GetDirectories` (belgeler), `Services/NetworkConnection` + `NetworkCredential`, `Helpers/TenantFileAccess.TryResolve`, `GlobalVeriables.adminDatabase / adminServerIP / adminServerUsername / adminServerPassword / adminServerFileName`, `ScriptJson.Serialize` (541). CheckBooks: yalnız `Methods.LogAdd`.

### Model/DTO/ViewModel
`ChecksController` içinde: `CheckInfoViewModel` (3036), `CheckDetailedReportViewModel` (3054) + `...FilterCardViewModel` (3074), `...WorkPlaceGroupViewModel` (3083), `...BankGroupViewModel` (3093), `...RowViewModel` (3106), `CheckViewModel` (3130), `CheckEditViewModel` (3306), `DeleteFileModel` (3719). `CheckBooksController` içinde: `CheckBookViewModel` (521), `CheckBookAddViewModel` (541). `Models/DirectoryItem.cs`, `Models/Log.cs`.

### SQL nesneleri
**ChecksController**
| Tablo | Erişim |
|---|---|
| `ZT_Checks` | R / UPDATE (1253 durum, 2535 düzenleme, 2946 soft delete) — bu controller'da INSERT yok |
| `ZT_CheckMovements` | **yalnız R** (227, 229, 888) |
| `ZT_CheckBooks` | R / UPDATE (1371, 1379, 2392, 2429, 2966) |
| `ZT_CashTransactions` | R (1469) / INSERT (1406, 1437, 1511) / UPDATE (1487) / **DELETE** (1541, 1559) |
| `ZT_BankTransactions` | R (1577) / UPDATE (1638, 1674, 2652, 2980) / **DELETE** (1657) + statik INSERT |
| `ZT_AccountPayments` | R (1220, 1999, 2605) / INSERT (1765, 2689) / UPDATE (1735, 2627, 2669) / **DELETE** (1698) |
| `ZT_AccountCollections` | R (2000) |
| `ZT_CustomerAccounts`, `ZT_BankIntroduction`, `ZT_CashIntroduction`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R |
| `ZT_CustomerAccountPaymentPlans` | helper üzerinden |
| `information_schema.columns` | R (1092) |
| `Customers` (admin DB) | R (3395) |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R (42-158) |
| `ZT_ProductionPlanning` | R (206) |
| `Log` | INSERT |

**CheckBooksController**: `ZT_CheckBooks` R / INSERT (237) / UPDATE (429) / **DELETE** (353); `ZT_BankIntroduction` R (65, 125); `ZT_WorkPlace` R (66, 126); `Log`.

Kolonlar:
- `ZT_Checks` (bu controller'ın dokunduğu ek kolonlar): `DepositDate`, `CollectionDate`, `LastBankID` (opsiyonel), `CashID`, `BankID`, `Description` (durum günlüğü birikimli yazılır). Kodda not: `ReturnDate` ve `CancelDate` kolonları tabloda yok (1271, ~1330).
- `ZT_CheckBooks`: `ID, BankIntroductionID, CheckBookSerialNo, CheckLeafNo, CheckNumber, BankSerialCode, Status, CreatedDate, UsedDate` (`CheckBooksController.cs:237-251`).
- `ZT_CashTransactions` (çek): ortak kolonlara ek `CreatedBy` (1406-1415).
- Fonksiyon: `regexp_replace` (2799); view/trigger/sequence çağrısı yok.

### Bağlı finans sayfaları
`CustomerAccounts/Index` (196), `CheckBooks/Index` (245), `CustomerAccountPayment/Payments` (250), `Bills/Bills` (256), `BankTransactions/Index?bankId=` (565), `AccountTransaction/Transactions?id=` (584, 605), `Checks/CheckDocuments`, `Checks/CheckDetailedReport`. Yönlendirmeler: `Home/Error` (2211), `Account/Login` (3385).

### Finans dışı bağımlılıklar
- `ZT_ProductionPlanning` (206), personel tabloları (42-158).
- Ödeme modali gömülü olduğu için `Checks.cshtml` bahçe ödeme şablonlarını (`garden-card`, `:2709`) ve `payments.js` üzerinden `GetSupplierGardens` çağrılarını taşıyor.
- Belge klasör yapısında `"İzlenebilirlik"`, `"Özel"`, `"Diğer"` alt klasörleri (3675-3695) — üretim modülünden kopyalanmış adlandırma.
- Admin DB `Customers.QrKey` (belge yolu için).
- Üst menü linkleri: Payments ile aynı üretim/satış sayfaları.

### Yetki
- Checks: sınıf düzeyi rol listesi; action bazında rol kontrolü yok; `CheckDocuments` ek olarak `customerUserKey` oturum kontrolü yapar (3381-3385).
- CheckBooks: yetki özniteliği yok.
- DB: `Session["userDatabase"]`; belge sayfası için admin DB.

### İş kuralları
**Çek durum kodları (kodda görülen tam liste)**
| Değer | Nerede |
|---|---|
| `Bekliyor` | durum modali (`Checks.cshtml:1249`), `GetStatusNote` (1957), tahsilat silmede geri dönüş (`CustomerAccountCollectionController.cs:3753`) |
| `Kullanıldı` | kendi çekimiz ödeme çıkışı (`CustomerAccountPaymentController.cs:1397`) |
| `Portföyde` | tahsilat çeki / kasada |
| `Bankada` | DB'ye yazılan değer; `Bankaya Yatırıldı` ile eş anlamlı (`ChecksController.cs:979-984`) |
| `Bankaya Yatırıldı` | motor içi kural adı; tahsilat INSERT'lerinde DB'ye bu hâliyle de yazılıyor (`CustomerAccountCollectionController.cs:829, 844`) → **DB'de iki farklı yazım birlikte bulunabilir** |
| `Tahsil Edildi` | kendi çekimizde "ödendi" anlamında da kullanılır |
| `Ciro Edildi` | yalnız ödeme ciro akışında yazılır (`CustomerAccountPaymentController.cs:1217`) |
| `Karşılıksız`, `İptal` | |
| İstemci sözde değerleri | `TahsilKasa` → `Tahsil Edildi` + `cashCollect=true`; `TahsilKasaCiro` → `Tahsil Edildi` + `cashEndorse=true` (`Checks.cshtml:1255-1256`, JS `:4060`) |

`CheckType` / `CheckOwnership` değerleri: `Kendi Çekimiz`, `Müşteri Çeki`, `Tahsil Edilen Çek`, `Tedarikçi Çeki` (1946), `Alınan Çek` (varsayılan, 1063), `Ciro Edildi` (ownership).
Koçan yaprağı durumları (`ZT_CheckBooks.Status`): `Kullanılmadı`, `Kullanıldı`, `İptal`.

**İzinli geçişler**: sabit bir geçiş matrisi **yok**; `UpdateCheckStatus` herhangi bir hedef durumu kabul eder, aşağıdaki kuralları uygular (hepsi tek transaction; `:990` → Commit `~1871`):
- KURAL 1 (1113-1126): çek kasadaysa (`CashID` dolu) ve hedef `Bankaya Yatırıldı` ise banka zorunlu.
- KURAL 2 (1133-1142): çek bankadaysa (eski durum `Bankada`/`Bankaya Yatırıldı`), kasası yoksa, hedef `Portföyde` ve çek `Kendi Çekimiz` değilse kasa zorunlu.
- KURAL 3B: `Kendi Çekimiz` kasaya tahsil/ciro edilemez; `cashCollect` için kasa zorunlu.
- KURAL 3: `Tahsil Edildi` (kasa yolu değilse) banka zorunlu; boşsa eski `BankID`, o da yoksa `LastBankID` kullanılır.
- KURAL 4: `Kendi Çekimiz` için `ZT_AccountPayments`'ta `CheckID` ile kayıt var mı bakılır.
- Çek güncellemesi (1253-1340): `CheckStatus`, birikimli `Description`, `BankID`, `CashID`, duruma göre `DepositDate` / `CollectionDate`, varsa `LastBankID`.
- Koçan (1366-1392): `Kullanıldı`/`Portföyde`/`Bankaya Yatırıldı` → yaprak `Kullanıldı`; `Bekliyor`/`İptal`/`Karşılıksız` → yaprak `Kullanılmadı`.
- Kasa hareketleri (1400-1570): kasadan bankaya → `Çıkış` / `'Çek Bankaya Yatırma'`; bankadan kasaya (müşteri çeki) → `Giriş` / `'Çek Kasaya Alma'`; kasaya tahsil → `Giriş` / `'Çek Kasaya Tahsil'` (varsa mevcut kayıt güncellenir); `İptal`/`Karşılıksız` → bu üç tipteki kasa hareketleri **DELETE**; kasaya-tahsil dışına çıkışta `'Çek Kasaya Tahsil'` **DELETE**.
- Banka hareketleri (1572-1690): `Tahsil Edildi` (banka yolu) → kayıt yoksa oluştur: `Kendi Çekimiz` ise `Çıkış` / `'Çek Ödeme'` (tutar negatif yapılır, 1606), değilse `Giriş` / `'Çek Tahsil'`; varsa `BankID`/`TransactionDate` güncelle. `İptal`/`Karşılıksız` → **DELETE**. Diğer geçişlerde `Status=false`.
- Cari yansıma (1692-1855): `Karşılıksız`/`İptal` → çeke bağlı `ZT_AccountPayments` **DELETE**; `Kendi Çekimiz` için ödeme kaydı varsa güncelle (cari, iş yeri, belge no, kasa/banka, açıklama eki), yoksa `Kullanıldı`/`Portföyde`/`Bankaya Yatırıldı` durumunda yeni ödeme kaydı oluştur (cari = keşideci).
- Ödeme planı: `PaymentPlanHelper.SyncCheckPaymentPlan` — `Portföyde`/`Kullanıldı`/`Bankaya Yatırıldı` → plan ekle/güncelle; `Tahsil Edildi` → `'Tamamlandı'`; `Karşılıksız`/`İptal` → `'İptal'` + `Status=false` (`PaymentPlanHelper.cs:76-168`).
- **`UpdateCheckStatus` `ZT_CheckMovements`'a kayıt yazmaz**; hareket satırları yalnız ödeme/tahsilat akışlarında oluşur. `GetCheckMovements` (874-930) bu tablodan `Status=true` satırları okur.

**EditCheck POST** (2262-2768): çek no tam 7 haneli ve sayısal olmalı (2275-2293); tekillik kontrolü (2296-2365); koçan yaprağı değişimi (2392, 2429); tutar > 0, vade ≥ keşide (2452-2459); `CheckType` değiştirilemez (2512-2516); `Tahsil Edildi`, `Bankada`, `Bankaya Yatırıldı`, `İptal`, `Karşılıksız` durumlarına giren/çıkan geçişler bu sayfadan engellenir (2517-2527); tutar değişirse bağlı `ZT_AccountPayments` ve `ZT_BankTransactions` tutarı güncellenir (2627, 2652). **Transaction kullanmıyor** (`PaymentPlanHelper` yorumunda da belirtilmiş).
**DeleteCheck** (2882-3030): soft delete (`Status=false` + açıklama eki), koçan yaprağı serbest, bağlı banka hareketleri pasif, `CancelCheckPaymentPlan`.
**CheckLeafLookup** (2776-2823): baştaki sıfırlar yok sayılarak `ZT_CheckBooks`'ta arama (en fazla 5 sonuç); hata olursa girişi engellemez.
**CheckBooks**: `AddCheckBook` başlangıç–bitiş aralığını yaprak yaprak ekler, en fazla 1000, aynı banka + numara atlanır, opsiyonel MICR kodu `c{BankCode}{BranchCode}{8 haneli no}` (167-310). `UpdateCheckStatus`: `Kullanıldı` yaprak yalnız `İptal`'e çevrilebilir (~420).
**Çek detay raporu** (561-872): tarih / iş yeri / banka / para birimi filtreli, iş yeri → banka gruplu.

### Dosya yükleme / Excel / PDF / yazdırma
- Belgeler: `CheckDocuments` / `CheckDosyaYukle` / `GetCheckFile` / `DownloadCheckFile` / `DeleteCheckFile`. Yol: `<ağ paylaşımı>\<QrKey>\Check\Check\<çek id>\<klasör>\<dosya>` (3403, 3439). Kimlik bilgileri oturumdan, yoksa `GlobalVeriables.adminServer*` (3639-3668). `NetworkConnection` ile bağlanılır. Yüklemede dosya adı/uzantı doğrulaması görülmedi (`file.FileName` doğrudan `Path.Combine`'a giriyor, 3439); okuma/indirme tarafında `TenantFileAccess.TryResolve` var (3455).
- Excel/yazdırma: DataTables Buttons + JSZip (Checks sayfasında pdfmake yüklü değil); `window.print()` (`Checks.cshtml:274`, `CheckDetailedReport.cshtml:535`).

---

## /Bills/Bills

Controller: `Controllers/BillsController.cs` (1485 satır).

### Route'lar
Sınıf (`:14-15`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]`. **POST'larda antiforgery yok.**

| Action | HTTP | Satır |
|---|---|---|
| `Bills(status, customerId)` | GET | 27 |
| `AddBill(customerAccountId, paymentDate, workPlaceId, amount, currencyId, exchangeRate, paymentDocumentNo, description, billNumber, billType, billIssueDate, billDueDate, billDescription, isCollateral)` | POST | 355 |
| `GetBillsList(status, customerId, billType)` | GET | 514 |
| `GetBillDetail(id)` | GET | 660 |
| `MarkBillAsPaid(id)` | POST | 745 |
| `EditBill(id)` | GET | 793 |
| `EditBill(BillEditViewModel)` | POST | 935 |
| `GetBillsSummary()` | GET | 1022 |
| `UpdateBillStatus(id, status, bankId, transactionDate)` | POST | 1075 |
| `DeleteBill(id)` | POST | 1323 |

Private: `GetCurrencies` (889).

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/Bills/Bills.cshtml` (3724) | role göre `_ProductionLayout` / `_Layout` | `billDetailModal` (467), `addBillModal` (488), `addPaymentModal` (771), `updateStatusModal` (1669) |
| `Views/Bills/EditBill.cshtml` (331) | `_ProductionLayout` | — |
| Partial'lar | `_SideMenu_Finance` (221), `_SideMenu_AccountingPurchases` (225), `_SideMenu_Patron` (229) | — |

### JS/CSS
Yerel: `wwwroot/css/zt/bills/bills.css`, `wwwroot/css/zt/customeraccountpayment/payments.css`, `wwwroot/js/zt/payments/payments.js` + `searchable-select.js` (`Bills.cshtml:3713-3714`). Senete özel ayrı JS yok; inline 4 blok.
CDN: jQuery 3.6.4, Bootstrap 4.6.2, DataTables 1.13.7 + Responsive + Buttons, JSZip (pdfmake yok).

### AJAX uçları → Action
| Satır | URL | Hedef |
|---|---|---|
| 3121 | `AddBill` | kendi |
| 3247 | `GetBillsList` | kendi |
| 3210 | `GetBillsSummary` | kendi |
| 3454 | `GetBillDetail` | kendi |
| 3009 | `UpdateBillStatus` | kendi |
| 3519 | `DeleteBill` | kendi |
| 3381 | `EditBill` | kendi |
| 3656-3668 | `AddPayment`, `DeletePayment`, `ConfirmDeletePayment`, `GetPaymentList`, `GetPaymentDetail`, `GetAvailableCheckBooks`, `GetCustomerBankAccounts`, `SaveQuickPaymentPlanning`, `GetAllBranchProvinces`, `GetWorkPlacesByBranch`, `GetBanksByWorkPlaceAndBranch` | **CustomerAccountPayment** |
| 3663-3664 | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` | **CustomerAccounts** |
| 3669-3671 | `GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer` | **CustomerAccountCollection** |
| 3167 | `GetBankList` | **BankTransactions** |
| 1930 | `GetCustomerDebtSummary` | **PaymentManagement** |
| 2476 | `/AccountTransaction/GetWorkPlaceBalances` | **AccountTransaction** |

`MarkBillAsPaid` için view'da çağrı bulunamadı (`⚠ BULUNAMADI`).
`EditBill.cshtml`: form POST `EditBill` (36), `DeleteBill` (264).

### Service/Warehouse metotları
Raw Npgsql. `BankTransactionsController.CreateBankTransaction` (1206, 1248), `Methods.LogAdd` (5), `ScriptJson.Serialize` (339). `PaymentPlanHelper` **kullanılmıyor** (senet için ödeme planı senkronu yok). Gereksiz `using Microsoft.IdentityModel.Protocols.WsTrust` (`:4`) — taşımada paket bağımlılığı yaratır.

### Model/DTO/ViewModel
Controller içinde: `BillInfoViewModel` (1394), `BillViewModel` (1409), `BillEditViewModel` (1454).

### SQL nesneleri
| Tablo | Erişim |
|---|---|
| `ZT_Bills` | R / INSERT (436) / UPDATE (755, 958, 1133, 1345 soft delete) |
| `ZT_BankTransactions` | R (1189, 1232) / UPDATE (1274) + statik INSERT |
| `ZT_CustomerAccounts`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R |
| `ZT_Boss`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_LogisticsPerson`, `ZT_ProductionManager` | R (47-163) |
| `ZT_ProductionPlanning` | R (211) |
| `Log` | INSERT |

`ZT_Bills` kolonları (tüm controller'lardan birleşik): `ID, BillNumber, BillType, BankID, BankName, BranchName, Amount, CurrencyID, ExchangeRate, IssueDate, DueDate, DrawerID, DraweeID, PayeeID, BillStatus, IsCollateral, Description, Status, CreationDate, CreatedBy, UpdatedDate, UpdatedBy, UsedDate, CollateralDate, ProtestDate, CollectionID, ModificationDate, ModifiedBy` (`BillsController.cs:436-447, 958-970, 1133-1145, 1345-1349`; `CustomerAccountCollectionController.cs:3774-3780`).

### Bağlı finans sayfaları
`CustomerAccounts/Index` (242), `CustomerAccountPayment/Payments` (292), `Checks/Checks` (298). Hata: `Home/Error` (884). **`:348`'de `RedirectToAction("Index")` var; `BillsController`'da `Index` action'ı yok** (hata yolunda 404 üretir).

### Finans dışı bağımlılıklar
`ZT_ProductionPlanning` (211), personel tabloları, gömülü ödeme modali üzerinden bahçe ödeme bağımlılıkları, üst menü üretim/satış linkleri.

### Yetki
Sınıf düzeyi rol listesi; ek kontrol yok. DB: `Session["userDatabase"]`.

### İş kuralları
- **Senet durumları** (226-230; `Bills.cshtml:1669+`): `Portföyde`, `Teminata Verildi`, `Ödendi`, `Protestolu`, `İptal`. Ek olarak başka controller'lar `Tahsil Edildi` (tahsilatla oluşturma; `CustomerAccountCollectionController.cs:1106`) ve `Bekliyor` (tahsilat silme; `:3776`) yazıyor — bu iki değer senet filtre listesinde yok.
- **Senet türleri** (234-240): `Adi Senet` (varsayılan, 454), `Emre Yazılı Senet`, `Bono`.
- **İzinli geçişler**: matris yok; `UpdateBillStatus` her hedefi kabul eder.
- `AddBill` (355-512, transaction'lı): numara tekilliği (`Status=true` içinde, 382-386); keşideci = iş yerinin `'İş Yeri Firması'` carisi, bulunamazsa hata (405-431); `BillStatus='Portföyde'`, `IsCollateral` (436-447). **Cari borç/ödeme ya da banka hareketi yazmaz** — yalnız `ZT_Bills`.
- `UpdateBillStatus` (1075-1320, transaction'lı): duruma göre `UsedDate` / `CollateralDate` / `ProtestDate`; `Ödendi` ve teminat değilse ve banka seçiliyse banka hareketi `Çıkış` / `'Senet Ödeme'` (mükerrer kontrolüyle, 1186-1222); `Teminata Verildi` + banka → `Çıkış` / `'Senet Teminat'` (1226-1264); `Protestolu` / `İptal` → bu iki tipteki banka hareketleri `Status=false` (1270-1278).
- `MarkBillAsPaid` (745-790): yalnız `BillStatus='Ödendi'` + açıklama eki; banka hareketi yok, transaction yok.
- `DeleteBill` (1323-1390): soft delete (`Status=false`, `ModificationDate`, `ModifiedBy`); bağlı banka hareketlerine dokunmaz.
- Senet no üretimi: yok (kullanıcı girişi).

### Dosya yükleme / Excel / PDF / yazdırma
Dosya yükleme yok. DataTables Buttons + JSZip; `window.print()` (`Bills.cshtml:310`).

---

## /CreditContracts/Index

Controller: `Controllers/CreditContractsController.cs` (7018 satır).

### Route'lar
Sınıf (`:14-15`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]` — **`Satış Personeli` bu modülde yok**. POST'larda antiforgery yok (çoğu `[FromBody]` JSON).

| Action | HTTP | Satır |
|---|---|---|
| `Index(status, bankId, creditType)` | GET | 27 |
| `Dashboard()` | GET | 321 |
| `Add()` | GET | 487 |
| `Add(CreditContract)` | POST | 521 |
| `AssignBankCari([FromBody] AssignBankCariRequest)` | POST | 760 |
| `ChangeBankCari([FromBody] AssignBankCariRequest)` | POST | 933 |
| `TransferInstallmentToCari([FromBody] TransferInstallmentToCariRequest)` | POST | 1069 |
| `Details(id)` | GET | 1714 |
| `UpdateContractInfo([FromBody] UpdateCreditContractRequest)` | POST | 2041 |
| `UpdateInstallments([FromBody] BulkInstallmentUpdateDto)` | POST | 2447 |
| `RecalculateInstallments([FromBody] RecalculateInstallmentsRequest)` | POST | 2773 |
| `UpdateScheduleInfo([FromBody] UpdateCreditScheduleRequest)` | POST | 3011 |
| `UpdateNotes([FromBody] UpdateCreditNotesRequest)` | POST | 3213 |
| `DeleteCreditWithInstallments([FromBody] DeleteCreditContractRequest)` | POST | 3272 |
| `ForceDeleteCreditContract([FromBody] DeleteCreditContractRequest)` | POST | 3462 |
| `GetBankRecentTransactions(bankId, limit)` | GET | 3750 |
| `PayInstallment([FromBody] InstallmentPaymentDto)` | POST | 3830 |
| `GetReconcileCandidates(installmentId)` | GET | 4060 |
| `ReconcileInstallmentPayment([FromBody] ReconcilePaymentDto)` | POST | 4153 |
| `AutoMatchCreditPayments(creditId)` | GET | 4178 |
| `ApplyAutoMatchCreditPayments([FromBody] ApplyAutoMatchDto)` | POST | 4276 |
| `UseRevolvingCredit([FromBody] RevolvingDrawdownDto)` | POST | 4752 |
| `RepayRevolvingCredit([FromBody] RevolvingDrawdownDto)` | POST | 4942 |
| `UseInstallmentCredit([FromBody] InstallmentCreditUseDto)` | POST | 5203 |
| `GetDashboardWidgetData()` | GET | 5333 |
| `PayWithCredit(...)` | **public static, HTTP değil** | 5485 |
| `GetCreditInfo(id)` | GET | 5641 |
| `GetInstallmentPaymentInfo(installmentId, creditId)` | GET | 5683 |
| `GetActiveCreditsForPayment(bankId)` | GET | 5782 |
| `GetUpcomingInstallments(days)` | GET | 5858 |
| `GetCreditSummary()` | GET | 5934 |
| `GetRevolvingInterestEstimate(creditContractId, fromDate, toDate, baseAmount)` | GET | 5985 |
| `DeleteCreditContract([FromBody] DeleteCreditContractRequest)` | POST | 6043 |
| `HealthCheck()` | GET | 6420 |
| `CreditDocuments(id)` | GET | 6463 |
| `CreditDosyaYukle(files, folder, qrkey)` | POST | 6545 |
| `GetCreditFile(filePath)` | GET | 6598 |
| `DownloadCreditFile(filePath)` | GET | 6639 |
| `DeleteCreditFile([FromBody] DeleteFileModel)` | POST | 6682 |

`ReconcilePaymentDto` ve `ApplyAutoMatchDto` controller'ın **iç sınıfı** olarak tanımlı (`CreditContractsController.cs:4452-4453`); diğer DTO'lar dosya sonunda namespace düzeyinde (6813-7012).

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/CreditContracts/Index.cshtml` (1758) | `_ProductionLayout` | `forceDeleteCreditModal` (600), `assignCariModal` (681), `payInstallmentModal` (722), `useInstallmentCreditModal` (775), `useRevolvingModal` (808), `repayRevolvingModal` (855), `ccConfirmModal` (956), `ccNoticeModal` (973) |
| `Views/CreditContracts/Add.cshtml` (1147) | `_ProductionLayout` | — |
| `Views/CreditContracts/Details.cshtml` (2774) | `_ProductionLayout` | `editContractModal` (1020), `paymentModal` (1109), `reconcileModal` (1158), `autoMatchModal` (1226), `drawdownModal` (1281), `repaymentModal` (1332), `editScheduleModal` (1434), `editNotesModal` (1500), `ccConfirmModal` (1530), `ccNoticeModal` (1549), `deleteWithInstallmentsModal` (1567), `deleteCreditModal` (1602) |
| `Views/CreditContracts/Dashboard.cshtml` (480) | `_ProductionLayout` / `_ExpertLayout` | — |
| `Views/CreditContracts/CreditDocuments.cshtml` (827) | `_ProductionLayout` | `deleteConfirmModal`, `deleteSuccessModal`, `deleteErrorModal` |
| `Views/Shared/_CreditDashboardWidget.cshtml` (346) | partial | — (hangi view'ın dahil ettiği taramada bulunamadı: `⚠ BULUNAMADI`) |
| Partial | `_SideMenu_Finance.cshtml` (`Index.cshtml:26`) | — |

### JS/CSS
Yerel: `wwwroot/css/zt/creditcontracts/index.css`, `wwwroot/css/zt/creditcontracts/details.css`. Kredi için ayrı JS dosyası **yok**; tamamı inline (Index 2 blok, Details 1 büyük blok, Add 1 blok).
CDN: DataTables 1.13.7 + Responsive 2.5.0 + Buttons 2.4.2, JSZip 3.10.1, pdfmake 0.2.7 (Index); Chart.js (`Dashboard.cshtml:19`, sürümsüz `cdn.jsdelivr.net/npm/chart.js`; Index'te `Chart(` kullanımı `:1727` — script kaynağı layout'tan); jQuery 3.6.0 + Font Awesome 5.15.1 (CreditDocuments).

### AJAX uçları → Action
`Index.cshtml` (hepsi kendi controller'ı): `ForceDeleteCreditContract` (1121), `ChangeBankCari` (1244), `AssignBankCari` (1245), `GetCreditInfo` (1307), `UseInstallmentCredit` (1341), `GetInstallmentPaymentInfo` (1375), `PayInstallment` (1422), `UseRevolvingCredit` (1481), `GetRevolvingInterestEstimate` (1558), `RepayRevolvingCredit` (1614), `GetUpcomingInstallments` (1644).
`Details.cshtml` (hepsi kendi): `GetBankRecentTransactions` (1759), `UpdateContractInfo` (1850), `UpdateInstallments` (2027), `TransferInstallmentToCari` (2118), `GetReconcileCandidates` (2158), `AssignBankCari` (2208), `ReconcileInstallmentPayment` (2225), `AutoMatchCreditPayments` (2255), `ApplyAutoMatchCreditPayments` (2307), `PayInstallment` (2341), `UseRevolvingCredit` (2378), `GetRevolvingInterestEstimate` (2430), `RepayRevolvingCredit` (2479), `ForceDeleteCreditContract` (2508), `RecalculateInstallments` (2593), `UpdateScheduleInfo` (2662), `UpdateNotes` (2705), `DeleteCreditWithInstallments` (2749).
Başka controller'lara linkler: `/BankTransactions/Index?bankId=` (`Index.cshtml:272, 430, 528, 572`; `Details.cshtml:309, 987`), `/AccountTransaction/Transactions/{BankCustomerAccountID}` (`Index.cshtml:393`, `Details.cshtml:345`), `CustomerAccounts/Index` (`Index.cshtml:39`).
`CreditDocuments.cshtml`: `/CreditContracts/DeleteCreditFile`, `CreditDosyaYukle`, `HealthCheck`, `GetCreditFile`, `DownloadCreditFile`.
`_CreditDashboardWidget.cshtml`: `/creditcontracts/GetDashboardWidgetData` (240), `/creditcontracts/index`, `/creditcontracts/details/{id}`.
View'larda çağrısı bulunamayan uçlar: `GetActiveCreditsForPayment`, `GetCreditSummary`, `DeleteCreditContract` (`⚠ BULUNAMADI` — başka sayfalardan çağrılıyor olabilir).

### Service/Warehouse metotları
Raw Npgsql. `PaymentPlanHelper.SyncCreditPaymentPlan` (2 çağrı; `PaymentPlanHelper.cs:197`), `BankTransactionsController.CreateBankTransaction` (yalnız `CreateCreditUsageTransaction` içinde, 1647), kendi private `CreateBankTransaction` (1387) ve `CreateBankTransactionWithTransaction` (4458), `IntroductionAuditHelper.GetActor` (21 çağrı), `Methods.LogAdd` (15), `Methods.GetDirectories`, `NetworkConnection`, `GlobalVeriables.admin*`.

### Model/DTO/ViewModel
- `Models/ZT/CreditContract.cs` — `CreditContract` + `CreditContractViewModel` (63 özellik)
- `Models/ZT/CreditInstallment.cs` (27 özellik)
- `Models/ZT/CreditDrawdown.cs` (23 özellik)
- `Models/ZT/FinIncomeExpense.cs`
- `Models/ViewModels/CreditDashboardViewModel.cs`
- Controller dosyasında namespace düzeyinde (6813-7012): `UpdateCreditContractRequest`, `DashboardCreditWidgetDto`, `UpcomingInstallmentDto`, `OverdueInstallmentDto`, `InstallmentUpdateItemDto`, `BulkInstallmentUpdateDto`, `InstallmentPaymentDto`, `DeleteCreditContractRequest`, `AssignBankCariRequest`, `TransferInstallmentToCariRequest`, `RecalculateInstallmentsRequest`, `UpdateCreditScheduleRequest`, `UpdateCreditNotesRequest`, `RevolvingDrawdownDto`, `InstallmentCreditUseDto`, `CreditPaymentResult`, `CreditStatsDto`, `BankDropdownDto`, `CreditBankAccountDto`, `CurrencyDropdownDto`, `SimpleDropdownDto`; iç sınıf `DeleteFileModel` (6805).
- `Models/ZT/PaymentPlan.cs`, `AccountDebts.cs` mevcut ama bu controller'da tip olarak kullanıldığı görülmedi.

### SQL nesneleri
| Tablo | Erişim |
|---|---|
| `ZT_CreditContracts` | R / INSERT (609) / UPDATE (18 yer) |
| `ZT_CreditInstallments` | R / INSERT (1542) / UPDATE (2525, 2924, 3913, 4357, 6175) / DELETE (2186, 3090, 3335, 3562) |
| `ZT_CreditDrawdowns` | R / INSERT (4799, 4993, 5566) / DELETE (3630) |
| `ZT_BankIntroduction` | R / **INSERT (1328 — kredi hesabı açar)** / UPDATE (25 yer: `Balance`, `UsedCredit` …) |
| `ZT_BankTransactions` | R / INSERT (1399, 4471, 4586) / UPDATE (9 yer) |
| `ZT_AccountDebts` | R (873) / INSERT (861, 1198, 4874) / UPDATE (993, 2677, 3136) / DELETE (1276) |
| `ZT_AccountPayments` | R / INSERT (1141, 1238, 5134) / UPDATE (1007, 4383) / DELETE (1288) |
| `ZT_CustomerAccountPaymentPlans` | INSERT (1575) / UPDATE (3977, 4420, 6184) / DELETE (2173, 3077, 3323, 3550) |
| `ZT_FinIncomeExpense` | R (2008) / INSERT (4636, 4678, 5059, 5094) |
| `ZT_CustomerAccounts` | R (`IsCreditBankAccount`) |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R |
| `Customers` (admin DB) | R (6481) |
| `ZT_ProductionPlanning` | R (42) |
| `Log` | INSERT |

Kolonlar:
- `ZT_CreditContracts` (609-618): `ID, ContractCode, WorkPlaceID, BranchProvinceID, BankID, CurrencyID, CreditType, CreditPurpose, RateType, AnnualRate, MonthlyRate, DayCount, SpreadRate, ApplicationDate, ApprovalDate, StartDate, FirstPaymentDate, EndDate, Principal, CreditLimit, UsedAmount, RemainingPrincipal, PaymentFrequency, TotalInstallments, PaidInstallments, InstallmentAmount, Commission, CommissionRate, InsuranceFee, OtherFees, CollateralType, CollateralDescription, CollateralAmount, ContractStatus, Description, Notes, Status, CreationDate, CreatedBy, BankCustomerAccountID` + `CreditAccountID` (1368), `UpdatedDate`.
- `ZT_CreditInstallments` (1542-1552, 3913-3922): `ID, CreditContractID, InstallmentNo, DueDate, PrincipalAmount, InterestAmount, TaxAmount, TotalAmount, RemainingPrincipal, InstallmentStatus, Status, CreationDate, CreatedBy, PaymentDate, PaidPrincipal, PaidInterest, PaidTax, PaidTotal, PaidLateFee, LateFee, UpdatedDate`.
- `ZT_CreditDrawdowns` (4799-4806): `ID, WorkPlaceID, CreditContractID, DrawType, DrawDate, Amount, CurrencyID, ExchangeRate, UsedAmountAfter, AvailableAmountAfter, RelatedEntityTable, RelatedEntityID, Description, ReferenceNo, Status, CreationDate, CreatedBy`.
- `ZT_BankIntroduction` (kredi hesabı; 1328-1337): `BankName, BranchName, AccountNumber, Iban, CurrencyID, Balance, AccountType, LinkedCreditID, CreditLimit, UsedCredit, Status, CreationDate`.
- `ZT_AccountDebts` (1198-1206): `CustomerAccountID, TransactionDate, Amount, CurrencyID, ExchangeRate, AccountingType, ReferenceID, CreationDate, CreatedBy, WorkPlaceID, DocumentNo, DocumentType, Description`.
- `ZT_FinIncomeExpense` (4636-4645): `WorkPlaceID, BranchProvinceID, Direction, Category, SourceModule, ReferenceTable, ReferenceID, CreditContractID, InstallmentID, TransactionDate, Amount, CurrencyID, BankID, Description, Period, Status, CreationDate, CreatedBy`.
- Göç betiği `SQL/KrediBankaCari_Migration.sql`: `ZT_CustomerAccounts.IsCreditBankAccount boolean NOT NULL DEFAULT false` (11-12), `ZT_CreditContracts.BankCustomerAccountID integer` (15-16), `ZT_AccountPayments.CreditInstallmentID integer` (20-21), `ZT_AccountPayments.CreditContractID integer` (25-26), dört indeks (29-46), açıklama etiketlerinden kolona taşıma UPDATE'leri (50-67), mevcut krediler için idempotent açılış borcu backfill'i (86-138). Betik başlığı: uygulama bu kolonların var olduğunu varsayar.

### Bağlı finans sayfaları
`CustomerAccounts/Index`, `BankTransactions/Index?bankId=`, `AccountTransaction/Transactions/{cari}`, `CreditContracts/Dashboard | Add | Details | CreditDocuments`. Index hata yolunda `RedirectToAction("Index","Finance")` (`:83`); `Account/Login` (6471).

### Finans dışı bağımlılıklar
- `ZT_ProductionPlanning` (42) — layout chat widget.
- Admin DB `Customers.QrKey`; belge alt klasör adları (Checks ile aynı kalıp, `EnsureCreditDirectoryStructure` 6761).
- Bunların dışında üretim/satış/stok tablosu referansı **yok**; bu grubun en temiz parçası.

### Yetki
Sınıf düzeyi rol listesi (Satış Personeli hariç). Silme varyantlarında (`DeleteCreditContract`, `DeleteCreditWithInstallments`, `ForceDeleteCreditContract`) ek rol kontrolü kodda görülmedi. DB: `Session["userDatabase"]`.

### İş kuralları
- **Kredi tipleri** (537): `EsitTaksit`, `EsitAnapara`, `Bullet`, `Revolving`.
- **Sözleşme durumu** (`ContractStatus`): `Aktif`, `Kapatildi`, `Iptal` (ASCII yazım). **Taksit durumu** (`InstallmentStatus`): `Bekliyor`, `Kismi`, `Odendi`, `Gecikti`. **Kullandırım tipi** (`DrawType`): `Kullanim` (4808, 5578), `GeriOdeme` (~5000).
- **Ödeme sıklığı** (1618-1630): `Aylik`, `3Aylik`, `6Aylik`, `Yillik`, `Gunluk`, `Haftalik` (varsayılan aylık).
- **Sözleşme no** (1437-1453): `KRD-{yıl}-{4 hane}`; aynı ön ekli kayıtlardaki sondaki sayının `MAX + 1`'i. Kullanıcı elle de girebilir; tekillik `Status=true` içinde kontrol edilir (1455). Sequence/kilit yok (eşzamanlı eklemede çakışma mümkün).
- **Add POST** (521-757) — **transaction kullanmıyor**; sırayla: sözleşme INSERT → `CreateCreditBankAccount` (`ZT_BankIntroduction`'a `AccountType='Kredi'`, `LinkedCreditID` ile pasif kredi hesabı; 1302-1363) → `CreditAccountID` güncelle → taksit planı → `UseImmediately` ise iki banka hareketi (`'Kredi Kullanım'` `Giriş`: kredi hesabı + vadesiz hesap; 700-710) → kredi banka carisine açılış borcu `ZT_AccountDebts` (`AccountingType='Kredi'`, `DocumentType='Kredi Sözleşmesi'`, tutar = anapara; 717-720, 1193-1228). Kredi Banka Cari Hesabı zorunlu (545-549). Rotatifte limit zorunlu, açılışta borç yazılmaz.
- **Taksit tutarı** (1470-1482): PMT = P·r(1+r)^n / ((1+r)^n − 1), r = yıllık oran / 100 / 12; r = 0 ise P / n.
- **Taksit planı** (1484-1616): faiz ACT/365 → `kalan anapara × (yıllık oran/100/365) × iki ödeme arası gün`; `EsitTaksit`: anapara = taksit − faiz; `EsitAnapara`: anapara = P / n; `Bullet`: anapara yalnız son taksitte. **BSMV = faiz × %5 sabit** (1525), toplam tutara eklenir. Her taksit için `ZT_CustomerAccountPaymentPlans`'a `SourceType='Kredi'`, `SourceID = taksit ID` kaydı (1573-1590); buradaki `CustomerAccountID` alanına **`CreditAccountID` (ZT_BankIntroduction.ID)** yazılıyor (1571-1572) — cari ID değil.
- **Taksit ödeme** `PayInstallment` (3830-4040, transaction'lı): dağıtım sırası gecikme faizi → BSMV → faiz → anapara (3855-3868); durum `Odendi` (toplam ödenen ≥ taksit) ya da `Kismi`; banka hareketleri: vadesiz hesaptan `Çıkış` / `'Kredi Taksit Ödeme'` (toplam), kredi hesabından `Çıkış` / `'Kredi Anapara Ödeme'` (yalnız anapara); kredi banka carisine `ZT_AccountPayments` (yalnız anapara, `CreditInstallmentID` + `CreditContractID` dolu; 1230-1270); taksit ve sözleşme güncelleme; tüm taksitler ödendiyse `ContractStatus='Kapatildi'` (4711-4748); faiz ve BSMV için `ZT_FinIncomeExpense` (`Direction='Gider'`, `Category='Faiz'` / `'BSMV'`, `SourceModule='Kredi'`); ödeme planı durumu güncellenir.
- **Kredi modülünün kendi banka hareketi metotları `ZT_BankIntroduction.Balance`'ı artırır/azaltır** (1420-1432, 4498-4499) ve kredi hesabında `UsedCredit`'i günceller (4508-4522). Ortak `BankTransactionsController.CreateBankTransaction` ise bakiye kolonuna dokunmuyor → iki farklı bakiye tutma yaklaşımı bir arada.
- **Mutabakat** (4040-4456): elle girilmiş (taksite bağlı olmayan) cari ödemeleri taksitle eşleştirir; tolerans hedef tutarın %1'i veya 10 birim (büyük olan; 4048-4058); yeni banka hareketi/cari ödemesi oluşturmaz, mevcut ödemeyi taksite bağlar. `AutoMatchCreditPayments` / `ApplyAutoMatchCreditPayments` toplu sürüm.
- **Rotatif kullanım** `UseRevolvingCredit` (4752-4940): sözleşme `Aktif` ve tip `Revolving` olmalı; tutar ≤ limit − kullanılan; `ZT_CreditDrawdowns` INSERT (`DrawType='Kullanim'`); `UsedAmount` ve `RemainingPrincipal` güncellenir; banka hareketleri kredi hesabı `Giriş` / `'Rotatif Kullanım'` + vadesiz `Giriş` / `'Kredi Kullanım'`; kredi banka carisine `ZT_AccountDebts`.
- **Rotatif geri ödeme** `RepayRevolvingCredit` (4942-5200): kullanılan tutardan fazla ödenemez; faiz ve BSMV tutarları **istekten gelir** (kullanıcı girer; negatif olamaz, 4973); faiz için banka hareketi `'Kredi Faiz Ödeme'` + `ZT_FinIncomeExpense` (Faiz, BSMV); anapara için kredi banka carisine `ZT_AccountPayments`.
- **Rotatif faiz tahmini** `GetRevolvingInterestEstimate` (5985-6040): gün = (bitiş − başlangıç) + 1; faiz = taban × (yıllık oran/100/365) × gün; BSMV = faiz × %5; yalnız öneri hesaplar, kayıt yazmaz.
- **Taksitli kredi sonradan kullandırım** `UseInstallmentCredit` (5203-5320): rotatif olmayan, aktif ve henüz kullanılmamış kredi için tarih girilerek iki banka hareketi + sözleşme güncellemesi.
- **Cari ödemeyi krediyle yapma** `PayWithCredit` (5485-5637, statik; `CustomerAccountPaymentController.AddPayment`'tan çağrılır): yalnız `ZT_CreditDrawdowns` INSERT (`RelatedEntityTable='ZT_AccountPayments'`) + sözleşme `UsedAmount` güncellemesi yapar; **banka hareketi ve cari borç kaydı yazmaz** (UseRevolvingCredit'ten farklı).
- **Banka carisi atama/değiştirme**: `AssignBankCari` (760-925) yalnız boş olan krediye, `IsCreditBankAccount=true` cari (811-812) + idempotent açılış borcu; `ChangeBankCari` (933-1060) borç ve ödeme kayıtlarını yeni cariye taşır; `TransferInstallmentToCari` (1069-1185) geçmişte ödenmiş taksiti cariye ödeme olarak aktarır (idempotent).
- **Silme**: `DeleteCreditContract` (6043) ve `DeleteCreditWithInstallments` (3272) kapatılmış krediyi silmez; `ForceDeleteCreditContract` (3462) bu kontrolü yapmaz (ilk 20 satırda görülmedi) — taksit, drawdown, plan, cari kayıt temizliği `CleanupCreditCariRecords` (1272-1296) ile.

### Dosya yükleme / Excel / PDF / yazdırma
- Belgeler: `CreditDocuments` / `CreditDosyaYukle` / `GetCreditFile` / `DownloadCreditFile` / `DeleteCreditFile` — Checks ile aynı kod kalıbı; yol `<ağ paylaşımı>\<QrKey>\Credit\Credit\<kredi id>\...` (6506, 6573).
- Excel/PDF: DataTables Buttons + JSZip + pdfmake (Index); `window.print()` (`Index.cshtml:111`, `Details.cshtml:111`); grafik Chart.js.

---

## /AccountCredits/Index

Controller: `Controllers/AccountCreditsController.cs` (430 satır). **Bu sayfa banka kredisi değil, müşteri cari alacak kayıtlarıdır** (`ZT_AccountCredits`).

### Route'lar
**Sınıfta `[Authorize]` / `[UserRoleAuthorize]` YOK** (`:8`).

| Action | HTTP | Satır | Not |
|---|---|---|---|
| `Index()` | GET | 10 | async |
| `Detail(id)` — id = CustomerAccountID | GET | 202 | |
| `GetCreditDetails(id)` | GET | 317 | Json |
| `UpdateCredit(UpdateCreditModel)` | POST | 363 | `[ValidateAntiForgeryToken]` |

### View + partial + modal
| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/AccountCredits/Index.cshtml` (608) | `_ProductionLayout` | `deleteModal` (380) |
| `Views/AccountCredits/Detail.cshtml` (626) | `_ExpertLayout` | `editCreditModal` (282) |
| Partial'lar (Index) | `_CustomerSideMenus/_SideMenu_AccountingPurchases | _Finance | _Patron | _Default` (243-255), `_CustomerAccountNavMenus/_NavMenu_AccountingPurchases | _Finance | _Patron | _Default` (262-274) | — |

### JS/CSS
Yerel dosya yok; inline. CDN: jQuery 3.6.0, animate.css 4.1.1 (cdnjs). DataTables kullanılıyor (kaynağı layout'tan).

### AJAX uçları → Action
`/AccountCredits/GetCreditDetails/{id}` (`Detail.cshtml:404`), `/AccountCredits/UpdateCredit` (448), linkler `/accountcredits/detail/{CustomerAccountID}` (`Index.cshtml:363`), `/AccountCredits/Index` (`Detail.cshtml:206`), **`/CustomerAccountCollection/Collections`** (`Index.cshtml:291`).
`deleteModal` var ama controller'da silme action'ı **yok** (`⚠ BULUNAMADI`).

### Service/Warehouse metotları
Raw Npgsql; `Methods.ConvertToList<T>` (2 çağrı; `Controllers/Methods.cs:15`). DI yok.

### Model/DTO/ViewModel
`Models/ZT/AccountCredits.cs` (`ID, CustomerAccountID, TransactionDate, DueDate, DocumentNo, DocumentType, Amount, CurrencyID, ExchangeRate, PaymentMethod, CashID, BankID, ReferenceID, AccountingType, CreationDate, CreatedBy, Description, WorkPlaceID, OrdersID` + görüntü alanları `CurrencySymbol, CustomerName, WorkPlaceName, OrderName`). İlgili: `Models/ZT/AccountCreditsInvoice.cs` (bu controller'da kullanılmıyor). Controller içinde: `CustomerCreditSummary` (189), `UpdateCreditModel` (420).

### SQL nesneleri
| Tablo | Erişim |
|---|---|
| `ZT_AccountCredits` | R (119, 278, 332) / UPDATE (374: `DocumentNo, Amount, PaymentMethod, DueDate, Description`) — INSERT bu controller'da yok |
| `ZT_AccountCollections` | R (115; `CollectionStatus='Tamamlandı'` toplamı) |
| `ZT_CustomerAccounts` | R (`AccountGroup='Müşteri'`) |
| `Customer` | R (122, 253, 281) — **satış** |
| `ZT_Orders` | R (283; `OrdersID` → `Name`) — **satış** |
| `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` | R |
| `ZT_Boss`, `ZT_FinancePerson`, `ZT_AccountingPurchases` | R (38, 46, 75, 222) |
| `ZT_ProductionPlanning` | R (148) |

### Bağlı finans sayfaları
`CustomerAccountCollection/Collections`. Yönlendirmeler: `Home/Closed` (30), `Home/Error` (184).

### Finans dışı bağımlılıklar
`Customer` (INNER JOIN — müşteri kaydı olmayan cari listelenmez; 120-122), `ZT_Orders` (alacak ↔ sipariş bağı `OrdersID`), `ZT_ProductionPlanning`, personel tabloları.

### Yetki
Öznitelik yok. Rol yalnız görüntü için okunuyor; `UserRole == "Finans"` karşılaştırması (`:43`) yapılıyor; diğer controller'ların rol listesindeki adlar `Finans(normal)` / `Finans(super)` — oturumdaki `customerUserRole` değerinin hangi yazımı taşıdığı doğrulanmadı. DB: `Session["userDatabase"]`.

### İş kuralları
- Index: müşteri carisi başına alacak toplamı (`ZT_AccountCredits`) ve tamamlanmış tahsilat toplamı (101-126).
- Detail: seçilen carinin tüm alacak satırları (270-287).
- `UpdateCredit`: beş alanı doğrudan günceller; transaction, log, cari/banka yansıması yok (363-415).
- SQL'de string birleştirme: `userkey` (`:~36`), `{customerId}` ve `{id}` enterpolasyonu (253, 285) — `id` int olduğu için tip güvenli, ama parametreli değil.

### Dosya yükleme / Excel / PDF / yazdırma
Yok (yalnız DataTables).

---

## Grup özeti

### Tabloların tekil listesi
R = okuma, W = INSERT/UPDATE, D = fiziksel DELETE. Controller kısaltmaları: **Pay** = CustomerAccountPayment, **Col** = CustomerAccountCollection, **Chk** = Checks, **CB** = CheckBooks, **Bil** = Bills, **Crd** = CreditContracts, **AC** = AccountCredits, **PPH** = PaymentPlanHelper.

| Tablo | Okuyan / yazan | Sınıf |
|---|---|---|
| `ZT_AccountPayments` | Pay R/W/D · Col R · Chk R/W/D · Crd R/W/D | Finans |
| `ZT_AccountCollections` | Col R/W/D · Chk R · AC R | Finans |
| `ZT_AccountCollectionOrders` | Col R/W/D | Finans — ama `ZT_Orders`'a bağlı (dönüştürülecek) |
| `ZT_AccountCredits` | Col R · AC R/W | Finans (alacak; `OrdersID` kolonu satışa bağlı) |
| `ZT_AccountDebts` | Pay R · Col R · Crd R/W/D | Finans |
| `ZT_Checks` | Pay R/W · Col R/W/D · Chk R/W · PPH R | Finans |
| `ZT_CheckMovements` | Pay W · Col W · Chk R | Finans |
| `ZT_CheckBooks` | Pay R/W · Col R/W · Chk R/W · CB R/W/D | Finans |
| `ZT_Bills` | Pay R/W · Col R/W/D · Bil R/W | Finans |
| `ZT_BankTransactions` | Pay R/W · Col R/W/D · Chk R/W/D · Bil R/W · Crd R/W (+ `BankTransactionsController.CreateBankTransaction` W) | Finans |
| `ZT_CashTransactions` | Pay R/W · Col R/W · Chk R/W/D (+ `CashTransactionsController.CreateCashTransaction` W) | Finans |
| `ZT_BankIntroduction` | Pay R · Col R · Chk R · CB R · Crd R/W | Finans (tanım) |
| `ZT_CashIntroduction` | Pay R · Col R · Chk R | Finans (tanım) |
| `ZT_BankAccounts` | Pay R · Col R | Finans (cari banka hesapları) |
| `ZT_CustomerAccounts` | Pay R/W · Col R · Chk R · Bil R · Crd R · AC R | Finans (cari) |
| `ZT_CustomerAccountPaymentPlans` | Pay R/W · Crd W/D · PPH R/W | Finans |
| `ZT_BankPaymentInstructionDetails` | Pay W | Finans (talimat) |
| `ZT_CreditContracts` | Crd R/W | Finans |
| `ZT_CreditInstallments` | Crd R/W/D · PPH R | Finans |
| `ZT_CreditDrawdowns` | Crd R/W/D | Finans |
| `ZT_FinIncomeExpense` | Crd R/W | Finans |
| `Currency` | Pay, Col, Chk, Bil, Crd, AC (R) | Ortak tanım |
| `ZT_WorkPlace` | hepsi (R) | Ortak tanım |
| `ZT_BranchProvince` | Pay, Col, Chk, Bil, Crd, AC (R) | Ortak tanım |
| `Log` | Pay, Col, Chk, CB, Bil, Crd (W; `Methods.LogAdd`) | Ortak altyapı |
| `ZT_Setting` | `_AddPaymentModal`, `_EditPaymentModal`, `_CollectionModalsPartial` view'ları (R) | Ortak ayar — `'Reçeteli Üretim'` bayrağı üretime özgü |
| `Customers` (admin DB) | Chk R · Crd R | Platform (kiracı kaydı) |
| `information_schema.columns` | Chk R | Sistem |
| `ZT_CustomerAccountSupplierPaymentsShares` | Pay R/W | **Finans-dışı bağlı** (bahçe ödeme payı) |
| `ZT_ExpertReport` | Pay R | **Finans-dışı** (ekspertiz/bahçe) |
| `ZT_ExpertReportTruck` | Pay R | **Finans-dışı** |
| `ZT_ExpertReportTruckFinance` | Pay R | **Finans-dışı** |
| `Supplier` | Pay R | **Finans-dışı** (müstahsil/tedarikçi) |
| `Product` | Pay R · Col R | **Finans-dışı** (ürün) |
| `SubProduct` | Pay R | **Finans-dışı** |
| `ZT_Orders` | Col R · AC R | **Finans-dışı** (satış siparişi) |
| `Customer` | Col R · AC R | **Finans-dışı** (satış müşterisi) |
| `ZT_ProductionPlanning` | Pay, Col, Chk, Bil, Crd, AC (R; layout chat widget) | **Finans-dışı** (üretim) |
| `ZT_Boss` | Pay, Col, Chk, Bil, AC (R) | Personel |
| `ZT_FinancePerson` | Pay, Col, Chk, Bil, AC (R) | Personel |
| `ZT_AccountingPurchases` | Pay, Col, Chk, Bil, AC (R) | Personel |
| `ZT_LogisticsPerson` | Pay, Col, Chk, Bil (R) | Personel |
| `ZT_ProductionManager` | Pay, Col, Chk, Bil (R) | Personel (üretim) |

### Ortak bağımlılıkların tekil listesi
**Controller'lar (kapsam dışı ama zorunlu)**
- `BankTransactionsController` — statik `CreateBankTransaction`; uçlar `GetBankList`, `CheckInstructionSessionExists`, `Index`
- `CashTransactionsController` — statik `CreateCashTransaction`
- `CustomerAccountsController` — `GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning`, `GetAllCurrenciesForPlan`, `GetAccountBalancesByCurrency`, `Index`
- `AccountTransactionController` — `Transactions`, `GetWorkPlaceBalances`, `GetAvailableCurrencies`
- `PaymentManagementController` — `GetCustomerDebtSummary`, `PaymentPlanning`, `PaymentApprovalRequest`, `PaymentApprovals`, `ProcessPaymentOrders`
- `AccountController` (Login), `HomeController` (Error, Closed), `AuthController` (Permission), `FinanceController` (Index)
- Grup içi çapraz bağlar: Pay ↔ Col ↔ Chk ↔ Bil ↔ Crd (`PayWithCredit`, `GetEndorsableChecks`, `CheckLeafLookup`, `GetCustomerCreditSummary` vb.); Pay ve Col dosyaları `using static` ile `BillsController` ve `ChecksController` iç sınıflarını içe aktarıyor.

**Servis / helper / statik sınıflar**
- `Services/IDateTimeProvider.cs`, `Services/DateTimeProvider.cs`
- `Services/PaymentPlanHelper.cs` (`SyncCheckPaymentPlan`, `CancelCheckPaymentPlan`, `SyncCreditPaymentPlan`, `CancelCreditPaymentPlan`, `CancelAllCreditPaymentPlans`, `CancelSalaryPaymentPlan` — sonuncusu personel/maaşa özgü)
- `Services/UserRoleAuthorizeAttribute.cs`
- `Services/AdminSystem/SecurityAuditFilter.cs` (global filtre)
- `Services/NetworkConnection.cs`
- `Services/IMenuDesignService` (view `@inject`)
- `Controllers/Methods.cs` (`LogAdd`, `GetDirectories`, `ConvertToList`)
- `Models/GlobalVeriables.cs` (`adminDatabase`, `adminServer*`)
- `Helpers/IntroductionAuditHelper.cs` (`GetActor`, `WithActor`)
- `Helpers/ScriptJson.cs` (`Serialize`, `HtmlText`)
- `Helpers/TenantFileAccess.cs`
- `Helpers/FinanceRoleHelper.cs` (yalnız yan menü partial'ı üzerinden)
- `Models/Log.cs`, `Models/DirectoryItem.cs`
- Yerelleştirme: view'larda `Localizer[...]`

**View / partial**
- Layout'lar: `_ProductionLayout.cshtml` (üretim chat widget'ı içerir), `_Layout.cshtml`, `_ExpertLayout.cshtml`
- `_AddPaymentModal`, `_EditPaymentModal`, `_PostPaymentPlanningModal`, `_PaymentManagementMenu`, `_CheckLeafGuard`, `_CreditDashboardWidget`
- `_CustomerSideMenus/_SideMenu_Finance | _FinanceItems | _Finance_Financial | _AccountingPurchases | _Patron | _Default`
- `_CustomerAccountNavMenus/_NavMenu_AccountingPurchases | _Finance | _Patron | _Default`

**Yerel statik dosyalar**
- `wwwroot/js/zt/payments/payments.js`, `wwwroot/js/zt/payments/searchable-select.js`
- `wwwroot/js/zt/collections/collections.js`, `wwwroot/js/zt/collections/searchable-select.js`
- `wwwroot/css/zt/customeraccountpayment/payments.css`, `customeraccountcollection/collections.css`, `accounttransaction/transactions.css`, `checks/checks.css`, `checkbooks/index.css`, `bills/bills.css`, `creditcontracts/index.css`, `creditcontracts/details.css`

**CDN**
- jQuery 3.6.0 / 3.6.4 (code.jquery.com), Bootstrap 4.6.2 bundle (jsdelivr)
- DataTables 1.13.7, Responsive 2.5.0, Buttons 2.4.2, i18n eklentisi (cdn.datatables.net)
- JSZip 3.10.1, pdfmake 0.2.7 + vfs_fonts, Font Awesome 5.15.1, animate.css 4.1.1 (cdnjs)
- Chart.js (jsdelivr, sürümsüz)
- Select2, toastr, Font Awesome ikonları layout üzerinden geliyor (bu view'larda kaynak etiketi yok)

**SQL betikleri**
- `SQL/KrediBankaCari_Migration.sql`
- `Docs/2026_Faz61H_Checks_LastBankID.sql`
- `SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql` (+ betik başlığında anılan `2026_09_03_Introduction_Audit_Change_Guard.sql`) — tanım tablolarındaki audit trigger'ı
- Çekirdek tabloların `CREATE TABLE` betikleri: `⚠ BULUNAMADI`

### Bulunamayanlar / doğrulanamayanlar
- Çekirdek finans tablolarının DDL'i (CREATE TABLE, FK, indeks, varsa trigger) depoda yok.
- `ITCMBExchangeRateService` kullanımı bu grupta yok; kur otomatik çekme uç noktası bulunamadı.
- Ödeme/tahsilat makbuz numarası üreteci yok.
- `AddPayment` içindeki `Kredi` dalını tetikleyen istemci kodu bulunamadı.
- `CustomerAccountCollection/GetAvailableCheckBooks` action'ı yok (view URL üretiyor); `urls.getCustomerCurrency` config'te tanımsız.
- `BillsController`'da `Index` action'ı yok (`:348` yönlendirmesi).
- `AccountCredits/Index` içindeki `deleteModal` için silme action'ı yok.
- `_CreditDashboardWidget.cshtml`'i dahil eden view bulunamadı.
- `GetActiveCreditsForPayment`, `GetCreditSummary`, `DeleteCreditContract`, `MarkBillAsPaid`, `GetAvailableChecksByBank` uçlarının çağrı yeri bu grubun view'larında bulunamadı.
- `ZT_BankIntroduction.Balance`'ı güncelleyen DB trigger'ı depodaki SQL dosyalarında bulunamadı; ortak banka hareketi metodu bakiye güncellemiyor, kredi modülü güncelliyor.
