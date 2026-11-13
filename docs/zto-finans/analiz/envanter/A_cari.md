# Envanter A — Cari hesap ve hareketler grubu (ZTO Fabrika → ZTO LOGISTIC kopyalama hazırlığı)

Kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. Yöntem: action imzaları, SQL stringleri, `Url.Action`/`url:`/`$.get`/`fetch` çağrıları, modal id'leri ve INSERT/UPDATE kolon listeleri betikle tarandı; iş kuralları için ilgili aralıklar okundu. Satır numaraları tarama anındaki dosya durumuna aittir. Gizli bilgi yazılmadı.

Kısaltmalar: **AT** = AccountTransactionController, **CA** = CustomerAccountsController, **CCA** = CustomerCurrentAccountsController, **PA** = PaymentApprovalController, **PAApi** = PaymentApprovalApiController, **PM** = PaymentManagementController, **CAR** = CustomerAccountReportController, **PCA** = PurchaseCurrentAccountController, **PPH** = Services/PaymentPlanHelper, **ATQ** = Models/ZT/AccountTransactionQueries, **OSCR** = Helpers/OfficialSalesCreditRemover. Tablo işlemleri: R=SELECT, I=INSERT, U=UPDATE, D=DELETE.

## Tüm gruba ortak gözlemler (önce okuyun)

- **Veri erişimi**: Ayrı Warehouse/Repository katmanı YOK. Tüm controller'lar action içinde doğrudan `NpgsqlConnection` + `NpgsqlCommand`/`NpgsqlDataAdapter` ile ham SQL çalıştırıyor. EF/Dapper yok.
- **Kiracı (tenant) bağlantısı**: `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` (AT'de 51, CA'da 41, PM'de 18, PA'da 16 kez). Session değeri girişte `Controllers/AccountController.cs:221`'de `IntroductionAuditHelper.WithActor(...)` ile sarılarak yazılıyor (bağlantıya `zto.audit_actor` GUC'u ekleniyor — `Helpers/IntroductionAuditHelper.cs:38-55`).
- **Admin DB**: `GlobalVeriables.adminDatabase` (`Models/GlobalVeriables.cs:24`, sabit kodlanmış bağlantı dizesi) — AT.AllTransactions (`AccountTransactionController.cs:31`), CCA.Index (`:17`), PCA (4 yer) kullanıyor. Admin DB tabloları: `Users`, `UserRoles`, `Customers`.
- **Session anahtarları**: `userDatabase`, `customerUserRole`, `customerUserName`, `customerUserKey`, `userRole`, `factoryName`, `databaseName`, `language`, `username`; PA ayrıca `PendingInstructionData` / `InstructionTimestamp` yazıyor; PCA `DocumentServerIP/FileName/Username/Password` okuyup yazıyor.
- **Yetki mekanizması**: `[Authorize]` (cookie auth, `Program.cs:138-140`, LoginPath `/Account/Login`) + özel `UserRoleAuthorizeAttribute` (`Services/UserRoleAuthorizeAttribute.cs:8`; rol claim'i `ClaimTypes.Role` ile birebir string karşılaştırma, yetkisizse `/Auth/Permission`). CA'da ek olarak `[RequireFinancePersonnel]` (`Services/RequireFinancePersonnelAttribute.cs:11` → `Helpers/FinanceAccess.cs:15` `MaySeeFinance`: Patron ancak tenant'ta `ZT_FinancePerson` kaydı varsa girer).
- **Global antiforgery filtresi YOK** (`Program.cs`'de `AutoValidateAntiforgery` bulunamadı; global filtre yalnız `SecurityAuditFilter`, `Program.cs:80`). `[ValidateAntiForgeryToken]` yalnız PA ve PM POST'larında var; AT ve CA POST'larında yok.
- **Loglama**: `Methods.LogAdd(Log, con)` (`Controllers/Methods.cs:334`) → tenant DB `"Log"` tablosuna INSERT (`User, UserRole, Description, TableName, TableDataID, Process, Platform, CreationDate`). Model: `Models/Log.cs`.
- **Zaman**: `IDateTimeProvider` (`Services/IDateTimeProvider.cs`, `Services/DateTimeProvider.cs`; DI singleton `Program.cs:63`).
- **Layout'un finans-dışı bağı**: `_ProductionLayout.cshtml` sohbet bileşeni için `ViewBag.ProductionPlanningChat` bekliyor (`Views/Shared/_ProductionLayout.cshtml:18`); bu yüzden AT, CA, CCA, PA sayfa action'ları her açılışta `select * from "ZT_ProductionPlanning"` çalıştırıyor (AT:52,317; CA:71; CCA:39; PA:74).
- **Yerelleştirme**: View'lar `IViewLocalizer` kullanıyor; `Resources/Views/<Controller>/*.{tr,en,ar,fr}.resx` dosyaları mevcut (kopyalanmalı). Menü için `IMenuDesignService` inject ediliyor (`Program.cs:38`).
- **JS'e güvenli URL gömme**: `ScriptJson.HtmlText(Url.Action(...))` (`Helpers/ScriptJson.cs:31`).
- **Hesap grubu (AccountGroup) sabit değerleri** tüm grupta string olarak gömülü: `Tedarikçi, Müşteri, Malzeme Tedarikçisi, İlaç Tedarikçisi, Kesim Çavuşu, Üretim Çavuşu, Nakliye Firması, Sevk Nakliye Firması, Analiz Firması, İş Yeri Firması, Masraf Hesabı, Personel` (ör. `CustomerAccountsController.cs:4012-4030`, `CustomerAccountReportController.cs:35-48`). Lojistiğe uyarlamada en çok dönüşecek nokta budur.

---

## /AccountTransaction/AllTransactions (AccountTransactionController — 9420 satır)

Dosya: `Controllers/AccountTransactionController.cs`. Sınıf öznitelikleri (`:12-14`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]` (yorum: 'Lojistik' rolü bilinçli çıkarılmış). Hiçbir action'da antiforgery yok; action bazında ek rol özniteliği yok.

### Route'lar

| Satır | Action | HTTP | Not |
|---|---|---|---|
| 24 | AllTransactions | GET | Sayfa — "Günlük Cari İşlemleri" |
| 180 | TransactionsByName(accountName, accountGroup) | GET | Ad+grup ile cari bulup Transactions'a redirect |
| 252 | TransactionsByReference(referenceId, accountGroup) | GET | ReferenceID ile cari bulup redirect |
| 293 | Transactions(id, currencyId?, rolloverId?) | GET | Cari hareket detay sayfası |
| 1007 | GetWorkPlaceBalances | GET | JSON |
| 1198 | GetAccountInvoices | GET | JSON |
| 1363 | GetReferencedInvoices | GET | JSON (malzeme/ilaç/masraf faturaları) |
| 1635 | GetInvoiceDetail | GET | JSON |
| 1785 | DeleteInvoice | POST | |
| 1862 | GetReferencedSalesInvoices | GET | |
| 1977 | GetAccountSalesInvoices | GET | |
| 2075 | GetSalesInvoiceDetail | GET | |
| 2182 | DeleteSalesInvoice | POST | |
| 2251 | AddDebt `[Route("AddDebt")]` | POST | `[FromBody] AddDebtRequestWithInvoice` |
| 2511 | AddCredit `[Route("AddCredit")]` | POST | `[FromBody] AddCreditRequestWithInvoice` |
| 2904 | GetCreditById `[Route("GetCreditById")]` | GET | |
| 3065 | UpdateCredit `[Route("UpdateCredit")]` | POST | |
| 3344 | GetTransactionDetails | POST | async; hesap grubuna göre ATQ sorgusu seçer |
| 4409 | GetCreditFullDetail | GET | |
| 4494 | GetCustomerTrucks | GET | Satış TIR'ları |
| 4629 | GetAvailableCurrencies | GET | |
| 4696 | GetAccountDebts | GET | |
| 4826 | GetCreditDebtInfo | GET | Kredi sözleşmesi/taksit |
| 4912 | GetAccountCredits | GET | |
| 5013 | GetAccountPayments | GET | |
| 5112 | GetAccountCollections | GET | |
| 5200 | GetAllTransactions | GET | Tek cari, 4 tür birleşik |
| 5477 | GetAllCustomerTransactions | GET | AllTransactions sayfasının veri kaynağı |
| 5768 | GetCustomerAccountsForSelect2 | GET | |
| 5826 | GetTransactionsForTransfer | GET | |
| 5922 | TransferTransactions | POST | Cari taşıma |
| 6092 | GetTransferHistory | GET | |
| 6162 | CreateDevir | POST | |
| 6221 | GetDevirs | (öznitelik yok) | |
| 6269 | UpdateDevir | POST | |
| 6315 | SetActiveDevir | POST | |
| 6354 | DeleteDevir | POST | soft delete |
| 6425 | GetDeletedDevirs | (öznitelik yok) | |
| 6468 | RestoreDevir | POST | |
| 6499 | GetDevirBalances | (öznitelik yok) | |
| 6558 | AddCollection | POST | ⚠ Bu grubun view/JS'inde çağıran BULUNAMADI (diğer sayfalar `CustomerAccountCollection/AddCollection` kullanıyor) |
| 6791 | DeleteDebt | POST | |
| 7309 | DeleteCollection | POST | |
| 7427 | DeleteCredit | POST | |
| 7564 | DeletePayment | POST | |
| 7738 | GetDebtById | GET | |
| 7884 | UpdateDebt | POST | `[FromBody] UpdateDebtRequest` |
| 8151 | GetDebtRedirectInfo | GET | Borcun kaynak modül sayfasına URL üretir |
| 8366 | Statement(id) | GET | Ekstre (Layout=null) |
| 8928 | TransactionsPartial(id, currencyId?) | GET | PartialView — CCA modalı kullanıyor |
| 9394 | UpdateCreditRiskLimits | POST | |

Dikkat: `[Route("AddDebt")]` gibi mutlak-olmayan öznitelik route'ları controller prefix'i olmadan tanımlı (`:2250, 2510, 2903, 3064`); view `Url.Action("AddDebt","AccountTransaction")` ile çözüyor.

### View + partial + modal

| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/AccountTransaction/AllTransactions.cshtml` (1416 satır) | `_ProductionLayout` (`:5`) | Kendi modalı yok; `Views/Shared/_AllTransactionsPaymentTools.cshtml` (2684 satır) partial'ı ile: `planActionConfirmModal`, `financeDashboardModal`, `paymentHeatmapModal`, `densitySettingsModal` |
| `Views/AccountTransaction/Transactions.cshtml` (5209 satır) | Role göre `_ProductionLayout` / `_Layout` (`:10-23`) | `addCreditModal, addDebtModal, productionDetailModal, shippingDetailModal, supplierDetailModal, normalDetailModal, creditDetailModal, transportDetailModal, customerClaimModal, expenseDetailModal, creditDebtDetailModal, pesticideSupplierDetailModal, analysisDetailModal, materialSupplierDetailModal, invoicesModal, referencedInvoiceDetailModal, salesInvoicesModal, salesInvoiceDetailModal, deleteSalesInvoiceConfirmModal, invoiceDetailModal, deleteInvoiceConfirmModal, deleteTransactionConfirmModal, editLimitsModal, cariTasimaModal, cariTasimaHistoryModal, ctConfirmModal, cariDevirModal, cariDevirDeletedModal, cdActiveDeleteModal, cdConfirmModal, cdAlertModal, saleEditModal`; JS içinde dinamik: `paymentDetailModal` (transactions.js:3053), `collectionDetailModal` (:3357) |
| `Views/AccountTransaction/_TransactionsPartial.cshtml` (2558 satır) | yok (partial) | Transactions'ın 19 modallık alt kümesi (addCredit/addDebt/…/deleteTransactionConfirmModal) |
| `Views/AccountTransaction/Statement.cshtml` (1515 satır) | `Layout = null` (`:9`) | yok |
| `Views/AccountTransaction/_CurrencyStatementPartial.cshtml` (487 satır) | partial; model `Tuple<StatementViewModel, CurrencyStatementData, int>` | yok |

Ortak partial'lar: `_DataTablesScriptsPartial`, `_CustomerSideMenus/_SideMenu_Finance.cshtml`, `_SideMenu_AccountingPurchases.cshtml`, `_SideMenu_Patron.cshtml`.

### JS/CSS

- Yerel JS: `wwwroot/js/zt/accounttransaction/alltransactions.js` (604 satır), `wwwroot/js/zt/accounttransaction/transactions.js` (12 790 satır, ~600 KB — asıl mantık burada; URL'ler view'da `Url.Action` ile kurulan `appUrls`/`urls` nesnesinden geliyor).
- Yerel CSS: `~/css/zt/accounttransaction/transactions.css`, `~/css/zt/bankstatement/index.css` (AllTransactions), `~/css/zt/customeraccountcollection/collections.css`, `~/css/zt/customeraccountpayment/payments.css`, `~/lib/datatables/css/dataTables.bootstrap4.min.css`.
- CDN: OpenLayers `ol@v7.3.0` (js+css), `chart.js@4.4.1`, jQuery 3.6.4, bootstrap 4.6.2 bundle, DataTables 1.13.7 (+responsive 2.5.0, buttons 2.4.2), jszip 3.10.1, pdfmake 0.2.7, DataTables i18n `cdn.datatables.net/plug-ins/2.1.8/i18n/` (transactions.js:907).
- Inline: AllTransactions neredeyse tamamen harici JS; Transactions.cshtml'de ~73 KB inline script + 9 `<style>` bloğu; `_AllTransactionsPaymentTools.cshtml`'de ~99 KB inline script.

### AJAX uçları → Action

Kendi controller'ına (AT): GetAllCustomerTransactions, GetCustomerAccountsForSelect2, AddCredit, AddDebt, UpdateCredit, UpdateDebt, CreateDevir, UpdateDevir, DeleteDevir, SetActiveDevir, RestoreDevir, GetDevirs, GetDeletedDevirs, GetDevirBalances (transactions.js:1073), DeleteInvoice, DeleteSalesInvoice, GetAccountInvoices, GetAccountSalesInvoices, GetInvoiceDetail, GetSalesInvoiceDetail, GetReferencedInvoices, GetReferencedSalesInvoices, GetAccountDebts/Credits/Payments/Collections, GetAllTransactions, GetCreditById, GetCreditDebtInfo, GetCreditFullDetail (js:4605), GetCustomerTrucks, GetDebtById, GetDebtRedirectInfo, GetTransactionDetails, GetTransactionsForTransfer, GetTransferHistory, TransferTransactions, UpdateCreditRiskLimits, GetAvailableCurrencies (js:12582), GetWorkPlaceBalances (js:10653), DeleteDebt/DeleteCredit/DeletePayment/DeleteCollection (action adı JS'te seçiliyor, js:2576-2579).

**Başka controller'lara giden çağrılar (taşımada işaretli):**

| URL | Kaynak | Hedef | Tür |
|---|---|---|---|
| `BankTransactions/GetBankList` | Transactions.cshtml, _TransactionsPartial | BankTransactionsController | finans |
| `CashTransactions/GetCashList` | aynı | CashTransactionsController | finans |
| `CustomerAccountCollection/GetCollectionDetail`, `/Collections` | Transactions.cshtml | CustomerAccountCollectionController | finans |
| `CustomerAccountPayment/GetPaymentDetail`, `/Payments` | Transactions.cshtml | CustomerAccountPaymentController | finans |
| `/CustomerAccounts/SearchAccountsForQuickAction` | Transactions.cshtml:4900, alltransactions.js:460 | CA | finans |
| `/CustomerAccounts/GetUpcomingPaymentPlansForDashboard`, `PostponePaymentPlan`, `DeleteDashboardPlan`, `MarkDashboardPlanPaid`, `GetPaymentDensities`, `SavePaymentDensity`, `GetPaymentHeatmapData`, `GetExchangeRatesForHeatmap` | `_AllTransactionsPaymentTools.cshtml` (:970-1430, :2053) | CA | finans |
| `/CreditContracts/Details` | transactions.js:4011 | CreditContractsController | finans |
| `/Checks/Checks` | _AllTransactionsPaymentTools:1034 | ChecksController | finans |
| `/SalesProductLogistic/GetCurrencies`, `GetWithoutOrderDetails`, `SaveOfficialInfoComprehensive` | Transactions.cshtml:4978, 4990, 5186 (`saleEditModal`) | SalesProductLogisticController | **FİNANS DIŞI (satış/sevk)** |
| `/productionexpenses/GetExpenseDetails` | transactions.js:7052, 11404 | ProductionExpensesController | **FİNANS DIŞI (üretim masrafı)** |
| `/MaterialStockAll/GetMaterials`, `GetSalesMaterials` | transactions.js:11210, 12144 | MaterialStockAllController | **FİNANS DIŞI (stok)** |
| `/PesticideStockAll/GetMaterials`, `GetSalesMaterials` | transactions.js:11308, 12161 | PesticideStockAllController | **FİNANS DIŞI (ilaç stok)** |
| `/Product/…` | Transactions.cshtml:5008 | ProductController | **FİNANS DIŞI** |

### Service/Warehouse metotları

- Ham Npgsql (controller içinde). Yardımcılar: `Methods.LogAdd` (6 yer), `GlobalVeriables.adminDatabase` (:31), `_dateTimeProvider.Now` (16), `PaymentPlanHelper.SyncCheckPaymentPlan` (AddCollection içinde, ~:6615), `FileTokenHelper.Protect` (`Helpers/FileTokenHelper.cs`, :4796), `OfficialSalesCreditRemover.RemoveByTruck` (`Helpers/OfficialSalesCreditRemover.cs:16`, :7487).
- **Statik controller-arası çağrı**: `BankTransactionsController.CreateBankTransaction(...)` (:6702) ve `CashTransactionsController.CreateCashTransaction(...)` (:6724) — tahsilatta banka/kasa hareketi bu statik metotlarla yazılıyor.
- Sorgu deposu: `Models/ZT/AccountTransactionQueries.cs` (statik SQL sabitleri: `TedarikciQuery, MusteriQuery, MalzemeTedarikciQuery, IlacTedarikciQuery, KesimCavusuQuery, UretimCavusuQuery, NakliyeFirmasiQuery, SevkNakliyeFirmasiQuery, AnalizFirmasiQuery, IsYeriFirmasiQuery, MasrafHesabiQuery, DefaultQuery`; AT:3873-3884). Tamamı finans-dışı tablolara JOIN yapıyor.
- `FinanceAccess` / `FinanceRoleHelper` bu controller'da doğrudan KULLANILMIYOR.
- Bu controller'ı dosya olarak referans alanlar: `Services/FinanceReport/FrLedger.cs`, `Services/PatronPanel/PpSql.Actors.cs` (yorum/başvuru).

### Model/DTO/ViewModel

- `Models/ZT/CustomerAccountTransactionsViewModel.cs` (`CustomerAccountTransactionsViewModel`:7, `AccountDebtViewModel`:29, `AccountCreditViewModel`:52)
- `Models/ZT/AccountDebts.cs`, `Models/ZT/AccountCredits.cs`, `Models/ZT/AccountCreditsInvoice.cs`, `Models/Log.cs`
- Controller içine gömülü sınıflar: `AddDebtRequestWithInvoice` (:2459), `InvoiceDataModel` (:2477), `UpdateCreditRequest` (:3271), `AddCreditRequest` (:3289), `AddCreditRequestWithInvoice` (:3305), `SalesTruckCreditItem` (:3323), `CreditInvoiceDataModel` (:3329), `TransactionDetailResult` (:4483), `CariTransferItem`/`CariTransferRequest` (:5908-5909), `UpdateDebtRequest` (:8345), `StatementViewModel` (:8857), `WorkplaceStatementData` (:8874), `CurrencyStatementData` (:8881), `DebtDetailItem` (:8890). Statement view'ları bunlara `@using static ZtoFabrika.Controllers.AccountTransactionController` ile bağlı.

### SQL nesneleri

| Tablo | İşlem | Örnek satır | Not |
|---|---|---|---|
| ZT_CustomerAccounts | R, U | 147, 394; U:9405 | U: `CreditLimit, RiskLimit` |
| ZT_AccountDebts | R, I, U, D | I:2352; U:7970; D:1828, 6855, 7042, 7128 | **hard delete** |
| ZT_AccountDebtsInvoice | R, I, U | I:2392, 8076; U:1817, 6844, 8021 | `IsDeleted` soft delete |
| ZT_AccountCredits | R, I, U, D | I:2637, 2809; U:2660, 3138; D:2221, 7515 | hard delete |
| ZT_AccountCreditsInvoice | R, I, U | I:2732, 2851, 3222; U:2212, 3191 | `IsDeleted` |
| ZT_AccountPayments | R, D | D:7646 | hard delete |
| ZT_AccountCollections | R, I, D | I:6658; D:7385 | hard delete |
| ZT_AccountRollover | R, I, U | I:6194; U:6188…6477 | soft delete |
| ZT_AccountTransferHistory | I, R | I:6054; R:6112 | |
| ZT_Checks | R, I, U | I:6585; U:6015 (`DrawerCustomerID`) | |
| ZT_Bills | R, I, U | I:6627; U:6034 (`DrawerID`) | |
| ZT_BankTransactions | U | 7357, 7611 (`Status=false`) | INSERT dolaylı (BankTransactionsController statik) |
| ZT_CashTransactions | U | 7371, 7630 | INSERT dolaylı |
| ZT_BankIntroduction, ZT_CashIntroduction | R | 954, 947 | |
| ZT_CreditContracts, ZT_CreditInstallments | R | 4853, 4851 | |
| Currency | R | 138 … (44 yer) | |
| ZT_WorkPlace, ZT_BranchProvince, ZT_FinancePerson, ZT_AccountingPurchases | R | 76-102, 325, 356, 968 | |
| Users, UserRoles (ADMIN DB) | R | 60-61 | |
| Finans dışı tablolar | aşağıdaki bölümde | | |

Kolon listeleri (INSERT/UPDATE'lerden):
- **ZT_AccountDebts** (:2352): `CustomerAccountID, TransactionDate, DueDate, DocumentNo, DocumentType, Amount, CurrencyID, ExchangeRate, PaymentMethod, CashID, BankID, ReferenceID, AccountingType, CreationDate, CreatedBy, Description, WorkPlaceID`. Ek gözlenen: `TransportType` (:7116), PM'in güncelledikleri `PaidAmount, RemainingAmount, PlannedAmount, ApprovalPendingAmount, IsInApproval, PaymentStatus`; `UpdatedBy, UpdatedDate` (`Docs/ReceteliUretim/2026_Faz50_MasrafCokluBag.sql:28-29`).
- **ZT_AccountDebtsInvoice** (:2392): `AccountDebtsID, InvoiceAmount, DebtReflectionStatus, IncomeTaxWithholdingRate, IncomeTaxWithholdingAmount, PastureFundRate, PastureFundAmount, SocialSecurityPremiumDeductionRate, SocialSecurityPremiumDeduction, ExchangeRegistrationFeeRate, ExchangeRegistrationFee, CommissionRate, CommissionAmount, OtherDeductionsAmount, TotalPriceExcludingVAT, VATRate, VATAmount, TotalPriceIncludingVAT, DiscountRate, DiscountAmount, WithholdingTaxAmount, OtherTaxesAmount, CreatedDate, CreatedBy, IsDeleted` (müstahsil makbuzu kesintileri — tarıma özgü: mera fonu, borsa tescil, SGK prim kesintisi).
- **ZT_AccountCredits** (:2637): Debts ile aynı + `SalesTruckID`.
- **ZT_AccountCreditsInvoice** (:2732): `AccountCreditsID, InvoiceAmount, DebtReflectionStatus, TotalPriceExcludingVAT, VATRate, VATAmount, TotalPriceIncludingVAT, DiscountRate, DiscountAmount, WithholdingTaxAmount, OtherTaxesAmount, CreatedDate, CreatedBy, IsDeleted`.
- **ZT_AccountCollections** (:6658): `CustomerAccountID, CollectionDate, CollectionMethod, CashID, BankID, Amount, CurrencyID, ExchangeRate, CollectionDocumentNo, Description, CreationDate, CreatedBy` (ayrıca `WorkPlaceID` filtrelerde kullanılıyor; bu INSERT'te yok).
- **ZT_Checks** (:6585): `CheckNumber, BankName, BranchName, Amount, CurrencyID, ExchangeRate, IssueDate, DueDate, DrawerCustomerID, PayeeCustomerID, CheckStatus, CheckType, Description, Status, CreationDate, CreatedBy`.
- **ZT_Bills** (:6627): `BillNumber, BillType, Amount, CurrencyID, ExchangeRate, IssueDate, DueDate, DrawerID, PayeeID, BillStatus, Description, Status, CreationDate, CreatedBy`.
- **ZT_AccountRollover** — tam DDL: `SQL_Migrations/2026_08_10_ZT_AccountRollover.sql:12` (+ `…_SoftDelete.sql:8`): `ID, CustomerAccountID, RolloverDate, SeasonName, RolloverByKey, RolloverByName, IsActive, CreationDate, IsDeleted, DeletedByKey, DeletedByName, DeletedDate, UpdatedByKey, UpdatedByName, UpdatedDate` + 4 indeks.
- **ZT_AccountTransferHistory** — tam DDL: `SQL_Migrations/2026_08_10_ZT_AccountTransferHistory.sql:9`: `ID, FromCustomerAccountID, ToCustomerAccountID, TransactionType, TransactionID, CurrencyID, Amount, CheckMoved, CheckID, TransferredByKey, TransferredByName, TransferDate, Description` + 3 indeks.
- **ZT_AccountPayments** ek kolonlar: `CreditInstallmentID, CreditContractID` (`SQL/KrediBankaCari_Migration.sql:20-27`).

**Çalışma zamanı DDL / şema sorgusu:**
- `AccountTransactionController.cs:7281` — `CREATE TABLE IF NOT EXISTS public."ZT_SalesTruckDebtLog"` (`ID serial PK, SalesTruckID, TransportType, Action, CustomerAccountID, CompanyName, Amount numeric, CurrencyID, Description, PerformedBy, PerformedByRole, PerformedAt`), hemen ardından INSERT (:7289). Aynı DDL `Controllers/SalesProductLogisticController.cs:2686` ve `Docs/2026_SalesTruckDebtLog.sql:11`'de de var.
- `:7236` — `information_schema.columns` sorgusu (`SalesTruckColMeta`): `ZT_SalesTruck` kolonlarının varlığı/tipi çalışma zamanında sorgulanıp dinamik UPDATE kuruluyor (:7246-7272).
- View/function/trigger çağrısı: bu controller'da doğrudan yok. Sequence yok.
- ⚠ BULUNAMADI: `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_AccountDebtsInvoice`, `ZT_AccountCreditsInvoice`, `ZT_CustomerAccounts` için temel `CREATE TABLE` betiği repoda yok (yalnız sonradan eklenen ALTER'lar var). Şema canlı DB'den `pg_dump` ile alınmalı.

### Bağlı finans sayfaları

`/CustomerAccounts/Index` (hata/bulunamadı durumunda redirect — :184, 241, 1002, 8389…), `/CustomerAccounts/Add`, `/CustomerAccounts/Edit/{id}`, `/AccountTransaction/Transactions/{id}`, `/AccountTransaction/Statement/{id}`, `CustomerAccountCollection/Collections`, `CustomerAccountPayment/Payments`, `/CreditContracts/Details`, `/Checks/Checks`, `Home/Closed` (DB açılamazsa).

### FİNANS DIŞI BAĞIMLILIKLAR

Tablolar (AT + ATQ + OSCR):
- **Üretim**: `ZT_ProductionPlanning` (layout sohbeti, :52, 317), `ZT_ProductionConveyor`, `ZT_ProductionConveyorMaterials` (DeleteDebt kullanım kontrolü :6897-6913), `ZT_ProductionExpenses` (:1490), `ZT_ProductionExpensesDetail` (:8763), `ZT_ProductionSergeants`, `ZT_ProductionSergeantsExpenses` (ATQ:260-262).
- **Mal kabul / eksper / bahçe**: `ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `ZT_ExpertReportTruckExpenses`, `ZT_Expert`, `Supplier`, `ZT_UsedHarvestManager` (:8220), `Product`, `SubProduct`.
- **Satış / sipariş**: `ZT_SalesTruck` (R; U:2709 `InvoiceDate, InvoiceNumber`; U:7269 nakliye alanları), `ZT_SalesTruckBatchNumbers`, `ZT_Orders`, `ZT_OrderClaims`, `ZT_OrderExpenses`, `Customer`, `ZT_SalesTruckDebtLog` (DDL+I), `ZT_MergedOrderProductPrices` (OSCR:89-94, `to_regclass` ile varlık kontrolü), `ContainerType`.
- **Stok / malzeme / ilaç**: `ZT_MaterialInvoice` (R; U:7033 Status=false), `ZT_MaterialPurchases` (R; U:7024), `ZT_MaterialStockAll` (U:7006 `RemainingAmount` düşülüyor), `ZT_MaterialSalesInvoice`, `ZT_PesticideInvoice`, `ZT_PesticidePurchases`, `ZT_PesticideSalesInvoice`, `ZT_Pesticides`, `ZT_IndustrialSupplier`, `ZT_Warehouse`.
- **Nakliye**: `TransportCompany`, `TransportTruck`, `ZT_Chauffeur`.
- **Diğer**: `ZT_LaboratoryFirms`, `ZT_WorkplaceContacts`.

Controller/sayfa bağımlılıkları: `SalesProductLogistic`, `productionexpenses`, `MaterialStockAll`, `PesticideStockAll`, `Product` (AJAX — yukarıdaki tablo). `GetDebtRedirectInfo` (:8183-8322) hesap grubuna göre şu sayfalara URL üretir: `/expertreport/detail/{id}`, `/materialstockall/edit/{id}`, `/pesticidestockall/edit/{id}`, `/harvestmanagerexpenses/details`, `/productionsergeantsexpenses/edit`, `/expertreporttruckexpenses/CompanyExpenseDetails`, `/SalesTruckExpenses/CompanySalesDetails`, `/sales/index`, `/productionexpenses/edit/{id}`, `/orders/index`.

Gelen bağlantılar (finans dışından bu controller'a): `Views/MaterialStockAll/{All,MaterialInvoice,MaterialInvoiceAll}.cshtml` ve `Views/PesticideStockAll/{All,PesticideInvoice,PesticideSalesInvoice,PesticideSalesInvoiceAll,SalesAll}.cshtml` → `/AccountTransaction/TransactionsByReference`.

Detay modalları da üretime özgü: `productionDetailModal, shippingDetailModal, supplierDetailModal, transportDetailModal, customerClaimModal, expenseDetailModal, pesticideSupplierDetailModal, analysisDetailModal, materialSupplierDetailModal, saleEditModal`; `GetTransactionDetails` (:3344) + `ExtractJoinedTableData` (:3887-4267, ~380 satır) tamamen bu modalları besliyor.

### Yetki

- Sınıf seviyesinde 6 rol (yukarıda). Action bazında tek ek kontrol: `TransferTransactions` içinde session rolü kontrolü (:5925-5928; yorum: "Finans + Patron + Admin").
- Personel carileri: `Transactions` içinde `ZT_FinancePerson."SuperStatus" = 'süper'` değilse cari değiştirici listesinden `AccountGroup = 'Personel'` hariç tutulur (:961-986). ⚠ Bu kontrol yalnız dropdown listesi için; `Transactions(id)` action'ının kendisinde Personel carisine doğrudan erişimi engelleyen bir kontrol görülmedi.
- Header/yan menü: AllTransactions admin DB'den `Users`⋈`UserRoles` ile rolü okuyup "Finans" ise `ZT_FinancePerson`, "Muhasebe (Alış)" ise `ZT_AccountingPurchases` kaydından `WorkPlaceID`/şube başlığı dolduruyor (:57-118).
- İş yeri (WorkPlace) filtresi: **kullanıcıya zorunlu kısıt değil, sorgu parametresi** (`workPlaceId` → `AND d."WorkPlaceID" = @WorkPlaceID`, :5498-5500). Kullanıcının kendi iş yeri yalnız `ViewData["WorkPlaceID"]` olarak view'a veriliyor.

### Dikkat çeken iş kuralları

- **Bakiye formülü**: `currentBalance = (Alacak − Tahsilat) − (Borç − Ödeme)`; >0 "Borçlu", <0 "Alacaklı", 0 "Dengede" (`AccountTransactionController.cs:794`; TransactionsPartial'da aynı formül `:9200`). Kart toplamları devir öncesi/sonrası/genel olarak `@Split` tarihiyle ayrılır (:695-701).
- **Para birimi**: Her para birimi ayrı bakiye (CurrencyID filtresi); TL'ye otomatik çevirme yok, `ExchangeRate` satırda saklanıyor.
- **"İş Yeri Firması" carisi**: kendi adıyla eşleşen iş yerinin kayıtları toplamlardan hariç tutulur (:580-760 yorumları; CA'da `WpSelfMap` CTE, CA:447-456).
- **Devir/sezon (rollover)**: sezon = `[RolloverDate, sonraki RolloverDate)`; `rolloverId`: null=aktif, −1=Tümü, 0=Açılış, >0=devir ID (:530-580). Cari başına tek aktif devir; aynı tarihte mükerrer devir engeli (:6172-6178); aktif devir silinirken yeni aktif seçimi zorunlu (:6374-6385); soft delete + audit; `ZT_AccountRollover` tablosu yoksa sayfa "Tümü" gibi davranır (try/catch, :556). Devir bakiye kaydı OLUŞTURMAZ — yalnız tarih sınırı; bakiyeler filtreyle hesaplanır.
- **Cari taşıma**: yalnız aynı hesap grubu içinde (:5952-5972); kaynak cariye ait olmayan satır atlanır (:5998); bağlı çek/senedin cari alanı da hedefe çevrilir (:6009-6034); her kayıt `ZT_AccountTransferHistory`'ye loglanır.
- **Borç/alacak tutarı**: Belge türü fatura/müstahsil ise "borca/alacağa yansıt" işaretliyse net tutar, değilse 0 yazılır (yalnız fatura kaydı tutulur, bakiyeye yansımaz); diğer belge türlerinde brüt (:2299-2346, :2578-2597).
- **Silme**: Borç/Alacak/Ödeme/Tahsilat **hard delete**; bağlı banka/kasa hareketi `Status=false` (soft) (:7351-7385, 7607-7646). `ReferenceID` dolu (otomatik) borçlar hesap grubuna göre reddedilir (:7072-7214); istisnalar: "Malzeme Tedarikçisi" (stok geri alınıp fatura soft-delete edilir, üretimde kullanılmışsa red — :6883-7070) ve "Sevk Nakliye Firması" (SalesTruck nakliye alanları temizlenir + log — :7112-7145). Otomatik "Müşteri" alacağı silinirse resmi satış fiyat verisi de temizlenir (:7484-7502).
- **Tahsilat**: çek/senet ise önce `ZT_Checks`/`ZT_Bills` kaydı + ödeme planı senkronu; "Nakit/Banka/Kredi Kartı" ise banka veya kasa hareketi (:6581-6745).
- **Tutarsızlık (gözlem)**: Liste sorguları `"PaymentStatus" != 'İptal'` filtresi uyguluyor (:5064, 5341, 5603, 5858, 6518, 8512) ama Transactions kart toplamındaki ödeme sorgusunda bu filtre yok (:695-701).
- **Kredi/risk limiti**: `UpdateCreditRiskLimits` (:9394) doğrudan `ZT_CustomerAccounts` günceller.

---

## /CustomerAccounts/Index (CustomerAccountsController — 6753 satır)

Dosya: `Controllers/CustomerAccountsController.cs`. Sınıf öznitelikleri (`:17-19`): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Muhasebe (Alış)","Finans(normal)","Finans(super)","Lojistik","Üretim Müdürü")]`, `[RequireFinancePersonnel]`. Antiforgery yok. Constructor: `IDateTimeProvider`, `ITCMBExchangeRateService` (:25).

### Route'lar

| Satır | Action | HTTP | Akış |
|---|---|---|---|
| 45 | Index(planFilter) | GET | Sayfa (async) |
| 319 | GetAccountsTableBody(planFilter, workPlaceIds, maxCaris) | GET | Tablo gövdesi HTML (partial → string, minify) |
| 1050 | GetExchangeRates | (öznitelik yok) | TCMB, 30 dk statik önbellek |
| 1146 | GetPaymentHeatmapData(year, customerAccountId) | GET | Isı haritası |
| 1306 | GetExchangeRatesForHeatmap | GET | |
| 1735 | SavePaymentPlanning `[FromBody] PaymentPlanningListDto` | POST | PaymentPlanning |
| 1937 | SendToApproval(customerAccountId) | POST | Onay |
| 2013 | ApprovePaymentPlanning(customerAccountId, action, notes) | POST | Onay — ⚠ view/JS çağıranı BULUNAMADI |
| 2086 | DeletePaymentPlanning(customerAccountId, planId?) | POST | |
| 2160 | BulkSendToApproval `[FromBody] BulkPlanRequest` | POST | |
| 2210 | BulkDeletePlans `[FromBody] BulkPlanRequest` | POST | |
| 2259 | GetWorkPlacesByBranch | GET | |
| 2304 | GetBanksByWorkPlaceAndBranch | GET | |
| 2364 | GetCurrencyDetailByWorkPlace | GET | |
| 2544 | GetAllPlansForCustomer | GET | |
| 2731 | GetUpcomingPaymentPlansForDashboard | GET | |
| 2876 | PostponePaymentPlan | POST | |
| 2932 | DeleteDashboardPlan | POST | **hard DELETE** (:2947) |
| 2981 | MarkDashboardPlanPaid | POST | |
| 3034 | GetPaymentPlanningDetails | GET + POST (iki öznitelik, :3032-3033) | |
| 3097 | GetBanksByWorkPlaceAndCurrency | GET | |
| 3155 | GetAllBranchProvinces | GET | |
| 3197 | GetAllCurrenciesForPlan | GET | |
| 3227 | GetAccountBalancesByCurrency | GET | |
| 3292 | PaymentPlannings(planFilter) | GET | Yalnız `Index`'e redirect (:3294) |
| 3302 | GetPaymentPlans | GET | Eski sistem (`ZT_PaymentPlans`, `ZT_PaymentApprovals`) |
| 3435 | GetCustomerAccountSelectList | GET (öznitelik çift yazılmış :3430, 3434) | |
| 3472 | SearchAccountsForQuickAction(q) | GET | |
| 3556 | Add(modal) | (GET, öznitelik yok) | Form |
| 3703 | GetReferencesByAccountGroup | GET | |
| 3834 | Add(CustomerAccount, modal) | POST | |
| 4346 | Edit(id) | GET | |
| 4579 | Delete(id, referansId, accountGroup) | **GET** | Durum değiştiren işlem GET ile |
| 4786 | GetCashesByWorkPlace | GET | |
| 4837 | GetBanksByWorkPlace | GET | |
| 4922 | ExportToExcel | GET | **Sahte/örnek CSV** döndürüyor (:4928-4929); hata durumunda var olmayan `Reports` action'ına redirect (:4938) |
| 4946 | Update(CustomerAccount) | POST | |
| 5870 | GetExpenseTypeByReferenceId | GET | |
| 5894 | GetBranchProvinceByReferenceId | GET | |
| 5919 | GetTreasuryOverview | GET | Hazine özeti |
| 6628 | GetAllWorkPlaces | GET | |
| 6656 | GetPaymentDensities | GET | PaymentDensity |
| 6705 | SavePaymentDensity(currencyID, little, middle, intensive, veryIntense) | POST | PaymentDensity |

`internal static GetApprovalStatusCounts(NpgsqlConnection)` (:914) — `BankIntroductionController` tarafından çağrılıyor. `UpdatePlanningStatuses` (:1352) private.

### View + partial + modal

| Dosya | Layout | Modal id'leri |
|---|---|---|
| `Views/CustomerAccounts/Index.cshtml` (13 220 satır, ~620 KB) | Role göre `_ProductionLayout` / `_Layout` (`:5-27`; `ViewData["FinanceID"|"AccountingPurchasesID"|"LogisticsPersonID"|"ProductionManagerID"|"PatronID"]`) | `currencyDetailModal, planDetailModal, planActionConfirmModal, financeDashboardModal, paymentPlanningModal, densitySettingsModal, approvalSelectionModal, deletionSelectionModal, treasuryModal, paymentHeatmapModal` |
| `Views/CustomerAccounts/_AccountsTableBody.cshtml` (667 satır) | partial | yok |
| `Views/CustomerAccounts/Add.cshtml` (811) | `_ModalFrameLayout` (modal=true) / `_ExpertLayout` (`:7`) | yok |
| `Views/CustomerAccounts/Edit.cshtml` (800) | `_ExpertLayout` | yok |

Partial'lar (Index): `_CustomerSideMenus/_SideMenu_{Finance,AccountingPurchases,Patron,LogisticsPerson,ProductionManager,Default}.cshtml`, `_CustomerAccountNavMenus/_NavMenu_{Finance,AccountingPurchases,Patron,LogisticsPerson,ProductionManager,Default}.cshtml`.

### JS/CSS

- Yerel: yalnız CSS `~/css/zt/customeraccounts/index.css`. **Sayfaya özel harici JS dosyası YOK** — ~396 KB inline script (4 blok) + 3 `<style>` bloğu Index.cshtml içinde.
- CDN: `chart.js` (sürümsüz, :5533), font-awesome 5.11.2 (:1857).
- Add/Edit: tamamen inline (~20 KB).

### AJAX uçları → Action

Kendi controller'ına: GetAccountsTableBody (:6012), GetUpcomingPaymentPlansForDashboard, PostponePaymentPlan, DeleteDashboardPlan, MarkDashboardPlanPaid, GetCurrencyDetailByWorkPlace (:12330), GetAllPlansForCustomer (:12884), GetPaymentDensities (:8332), SavePaymentDensity (:11242), SavePaymentPlanning, SendToApproval, BulkSendToApproval, BulkDeletePlans, DeletePaymentPlanning, GetPaymentPlanningDetails, GetAllBranchProvinces, GetAllCurrenciesForPlan, GetAllWorkPlaces, GetBanksByWorkPlaceAndBranch, GetBanksByWorkPlaceAndCurrency, GetWorkPlacesByBranch, GetExchangeRates, GetExchangeRatesForHeatmap, GetPaymentHeatmapData, GetTreasuryOverview; Add/Edit: GetReferencesByAccountGroup, SearchAccountsForQuickAction.

Başka controller'lara (link/redirect ağırlıklı): `AccountTransaction/Transactions`, `AccountTransaction/Statement`, `AccountTransaction/AllTransactions`, `CustomerAccountPayment/Payments`, `CustomerAccountCollection/Collections`, `PaymentApproval/Index`, `BankStatement/Index`, `Checks/Checks`, `Bills/Bills`, `/BankTransactions/Index`, `/CashTransactions/Index`, `/BankAccounts/Index`, `/CreditContracts/Index`, `/TimeDeposits/Index`, `/Investments/Index` — finans. **Finans dışı**: `Personnel/Index` (:4024, 4134; _AccountsTableBody:116), `/ProductionSergeantsExpenses/ProductionDetails` (_AccountsTableBody:86), `/HarvestManagerExpenses/Details` (:101), `/SalesTruckExpenses/CompanySalesDetails` (:121).

Bu controller'ın uçlarını çağıran dış sayfalar (grep): `Views/BankTransactions/Index.cshtml`, `Views/CashTransactions/Index.cshtml`, `Views/Bills/Bills.cshtml`, `Views/Checks/Checks.cshtml`, `Views/CustomerAccountCollection/Collections.cshtml`, `Views/CustomerAccountPayment/Payments.cshtml`, `Views/PersonnelSalary/Index.cshtml`, `Views/PaymentManagement/PaymentPlanning.cshtml`, `Views/Shared/_ProductionLayout.cshtml`, `wwwroot/js/zt/bankstatement/index.js` (GetCustomerAccountSelectList, GetCashesByWorkPlace, GetBanksByWorkPlace vb.).

### Service/Warehouse metotları

- Ham Npgsql. `Methods.LogAdd` (6), `IntroductionAuditHelper.GetActor` (8), `IntroductionAuditHelper.ExecuteSuppressed` (1, :1378), `_dateTimeProvider.Now` (33).
- **TCMB**: `_exchangeRateService.GetExchangeRatesAsync()` yalnız 1 yerde; bunun yanında controller içinde servisten bağımsız **iki ayrı doğrudan TCMB HTTP çağrısı** var: `GetTCMBExchangeRatesAsync` (:993, `new HttpClient()`, 15 sn) ve `FetchTcmbExchangeRatesAsync` (:1099, 3 sn) — URL `https://www.tcmb.gov.tr/kurlar/today.xml`. Servis: `Services/ITCMBExchangeRateService.cs` (arayüz :15, sınıf :60; `IHttpClientFactory` + `IMemoryCache`; DI `Program.cs:104-106`).
- **Statik durum (çok kiracılı ortamda dikkat)**: `_accountsQuickCache` (ConcurrentDictionary, :39; anahtar bağlantı dizesi + filtreler, :397-400), `_lastStatusUpdate` (2 dk'da bir arka planda `Task.Run` ile `UpdatePlanningStatuses`, :381-392 — tüm kiracılar için tek sayaç), `_exRatesCache` (:1050-1062).
- Render: `RenderPartialToStringAsync` (:873) + `MinifyRenderedHtml` (:900).

### Model/DTO/ViewModel

`Models/ZT/CustomerAccount.cs`: `CustomerAccountPaymentPlan` (:6), `CustomerAccountPaymentPlanViewModel` (:42), `PaymentPlanningListDto` (:69), `PaymentPlanItemDto` (:78), `CustomerAccount` (:91), `CustomerAccountViewModel` (:140), `CustomerAccountSummaryDTO` (:319), `PaymentPlanningDto` (:362). `Models/ZT/CustomerAccountBankItemDto.cs` (:8). `Models/ZT/WorkPlace.cs`. `Models/ZT/PaymentPlan.cs`. Controller içinde: `CaBankStoredMeta` (private sealed, :5271), `BulkPlanRequest` (:6749).

### SQL nesneleri

| Tablo | İşlem | Satır | Not |
|---|---|---|---|
| ZT_CustomerAccounts | R, I, U | I:3889; U:1357, 1845, 1883, 1970, 2045, 2130, 4630, 5103 | soft delete (`Status`) |
| ZT_CustomerAccountPaymentPlans | R, I, U, D | I:1754; U:1394…2996 (12 yer); D:2947 | |
| ZT_PaymentDensityCurrencies | R, I, U | R:6672; U:6711; I:6724 | |
| ZT_BankAccounts | R, I, U, D | R:5436; U:5523; I:5571; D:5612 | cari banka hesapları (IBAN) |
| ZT_AccountDebts / Credits / Payments / Collections | R | 453-477, 1500-1554, 2429-2447 | bakiye |
| ZT_BankIntroduction, ZT_CashIntroduction, ZT_BankTransactions, ZT_CashTransactions, ZT_Checks, ZT_Bills | R | 6007-6578 | hazine özeti |
| ZT_PaymentPlans, ZT_PaymentApprovals | R | 3347, 3325 | eski sistem |
| Currency | R | 535… | |
| ZT_WorkPlace | R, **I, U** | I:4270; U:4730, 5835 | "İş Yeri Firması" carisi eklenince iş yeri kaydı oluşturuluyor |
| ZT_BranchProvince, ZT_FinancePerson, ZT_AccountingPurchases, ZT_Boss, ZT_LogisticsPerson, ZT_ProductionManager | R | 82-198 | header/rol |
| Finans dışı referans tabloları | R, I, U | aşağıda | |

Kolonlar:
- **ZT_CustomerAccounts** INSERT (:3889): `AccountCode, AccountName, AccountGroup, TaxNumber, TaxOffice, CompanyType, Phone, Email, Website, Address, City, District, Country, PostalCode, CurrencyID, CreditLimit, RiskLimit, ContactPerson, ContactTitle, ContactMobile, ReferenceID, Status, PaymentTerms, Notes, CreationDate, CreatedBy, PlanningStatus, ApprovalStatus, WorkPlaceID, IsCreditBankAccount`. UPDATE'lerde ek: `PaymentPlanDate, PaymentAmount, PaymentPlanCurrencyID, PaymentDescription, PaymentBranchProvinceID, PaymentWorkPlaceID, PaymentBankID, ApprovalSentBy, ApprovalSentDate, ApprovalBy, ApprovalDate, ApprovalNotes, PaymentOrderBy, PaymentOrderDate, UpdatedAt, UpdatedBy, UpdatedNote, DeletedAt, DeletedBy` (son beşi `Docs/CustomerAccounts/2026_CustomerAccounts_Audit.sql:15-27`; `IsCreditBankAccount` `SQL/KrediBankaCari_Migration.sql:11`).
- **ZT_CustomerAccountPaymentPlans** INSERT (:1754): `CustomerAccountID, SourceType, SourceID, PaymentPlanDate, PaymentAmount, PaymentPlanCurrencyID, PaymentDescription, PaymentBranchProvinceID, PaymentWorkPlaceID, PaymentBankID, PaymentStatus, PlanningStatus, ApprovalStatus, Status, CreationDate, CreatedBy`. UPDATE'lerde ek (CA+PA): `ApprovalBy, ApprovalDate, ApprovalNotes, ApprovalSentBy, ApprovalSentDate, PaymentOrderBy, PaymentOrderDate, PaymentCompletedBy, PaymentCompletedDate, LastChangedBy, LastChangedDate, UpdatedBy, UpdatedDate`; okunan: `InstructionStatus` (PAApi:40). ⚠ CREATE TABLE betiği BULUNAMADI.
- **ZT_BankAccounts** INSERT (:5571): `AccountHolderName, AccountNumber, IBAN, BankName, BranchName, AccountType, CurrencyID, AccountOpenDate, LastTransactionDate, Status, CreationDate, TypeAccount, ReferenceID, Description, AccountCategory`.
- **ZT_PaymentDensityCurrencies** (:6724): `CurrencyID, Little, Middle, Intensive, VeryIntense`. ⚠ CREATE TABLE BULUNAMADI.

**Çalışma zamanı şema sorguları** (DDL değil, varlık kontrolü): `:4625` (`information_schema.columns` → `ZT_CustomerAccounts.DeletedAt` var mı) ve `:5049` (`UpdatedNote` var mı) — kolon varsa audit alanları yazılıyor, yoksa eski davranış.

**Trigger/GUC bağımlılığı**: `ZT_CustomerAccounts` üzerinde `trg_IntroductionAudit` trigger'ı var (`SQL_Migrations/2026_09_03_Introduction_Audit_Change_Guard.sql`, `2026_09_06_CustomerAccounts_Audit_Rebuild.sql:225-262`). Kod, sistem kaynaklı toplu UPDATE'te `SET LOCAL zto.audit_suppress = 'on'` ile damgalamayı bastırıyor (`IntroductionAuditHelper.cs:77-86`; CA:1378, CCA).

### Bağlı finans sayfaları

AccountTransaction (Transactions, Statement, AllTransactions), CustomerAccountPayment/Payments, CustomerAccountCollection/Collections, PaymentApproval/Index, BankStatement/Index, Checks, Bills, BankTransactions, CashTransactions, BankAccounts, CreditContracts, TimeDeposits, Investments. Hata: `Home/Error`, `Home/Closed`.

### FİNANS DIŞI BAĞIMLILIKLAR

**En kritik nokta — cari kart ↔ "referans kayıt" eşlemesi.** Cari eklenirken `InsertReferenceRecord` (:4032-4335) hesap grubuna göre **üretim/satış ana veri tablolarına INSERT** yapıyor; `UpdateReferenceRecord` (:5673), `UpdateReferenceStatus` (:4700), `DeactivateReferenceRecord` (:5640) aynı tabloları güncelliyor:

| AccountGroup | Kod öneki (:4012-4030) | Referans tablo | INSERT satırı / kolonlar |
|---|---|---|---|
| Tedarikçi | MST | `Supplier` | :4040 — `Name, Code, IdentityNo, PhoneNumber, Email, Status, CreationDate, CertificateStatus, CompanyName, AuthorizedPersonName, CertificateDocumentPath, CertificateNumber, CertificateStartDate, CertificateEndDate, TotalTonnage, TraceabilityStatus` |
| Müşteri | MUS | `Customer` | :4098 — `Name, Code, IdentityNo, Address, PhoneNumber, QrTemplate, Email, Status, CustomerMarket, TraceabilityStatus, TraceabilityCode, CreationDate, StickerLanguage, WebSite, ContactPerson, TaxNumber` (+ `GenerateTraceabilityCode` :4337) |
| Malzeme Tedarikçisi / İlaç Tedarikçisi | MZT / ILT | `ZT_IndustrialSupplier` | :4131 |
| Kesim Çavuşu | KSC | `ZT_HarvestManager` | :4153 |
| Üretim Çavuşu | URC | `ZT_ProductionSergeants` | :4175 |
| Nakliye Firması / Sevk Nakliye Firması | BHN / SVN | `TransportCompany` | :4204 (`…, CustomerID, TransportType`) |
| Analiz Firması | ANL | `ZT_LaboratoryFirms` | :4229 |
| Masraf Hesabı | MSR | `ZT_ExpenseItems` (+ `ZT_ExpenseTypes` R) | :4252 |
| İş Yeri Firması | ISY | `ZT_WorkPlace` | :4270 |
| Personel | PER | `ZT_Personnel` | :4287 (`PersonnelCode, Name, Surname, PhoneNumber, Email, StartDate, MonthlySalary, CurrencyID, Status, CreationDate, CreatedBy`) |
| (diğer) | CAR | — | |

Liste sorgusu da aynı tablolara LEFT JOIN yapıyor (:701-710). Ayrıca: `ZT_ProductionPlanning` (:71), `ZT_ProductionManager` (:198), `ZT_LogisticsPerson` (:169), `ZT_Boss` (:82); roller "Lojistik" ve "Üretim Müdürü" sınıf özniteliğinde; view'da `_SideMenu_ProductionManager`, `_SideMenu_LogisticsPerson`, `_NavMenu_*`; `_AccountsTableBody` içindeki `ProductionSergeantsExpenses`, `HarvestManagerExpenses`, `SalesTruckExpenses`, `Personnel` linkleri.

### Yetki

- 7 rol + `RequireFinancePersonnel` (Patron için `ZT_FinancePerson` kaydı şartı).
- **Süper kullanıcı kuralı** (:260-290 Index; :352-378 GetAccountsTableBody): `Finans(super)` → süper; `Finans(normal)`/`Finans` → `ZT_FinancePerson."SuperStatus" = 'süper'` ise süper; diğer tüm roller → süper. Süper değilse `AccountGroup = 'Personel'` carileri gizlenir (:717-718).
- Kredi banka carileri (`IsCreditBankAccount = true`) listede hiç gösterilmez (:714).
- İş yeri filtresi: istemciden gelen `workPlaceIds` (CSV → `int[]` parse, :328-340) → `IN (…)`; int'e çevrildiği için enjeksiyon riski yok. Kullanıcı bazlı zorunlu iş yeri kısıtı görülmedi. Seçili iş yerleri verildiğinde `WorkPlaceID` NULL/0 kayıtlar toplamdan hariç (:414-431).
- Header: role göre `ZT_Boss` / `ZT_AccountingPurchases` / `ZT_FinancePerson` / `ZT_LogisticsPerson` / `ZT_ProductionManager` kaydından iş yeri/şube başlığı (:82-218).

### Dikkat çeken iş kuralları

- **İki paralel planlama modeli**: yeni tablo `ZT_CustomerAccountPaymentPlans` + "geriye uyumluluk" için `ZT_CustomerAccounts` üzerindeki düz kolonlar (`PaymentPlanDate, PaymentAmount, PlanningStatus, ApprovalStatus…`) birlikte güncelleniyor (:1840-1891, 1968-1971, 2043-2046, 2128-2138).
- **Plan kaynak tipleri (`SourceType`)**: `Manuel, Çek, Kredi, Maaş, Talimatlı Plan` (:1239-1243). Yalnız Manuel planlar silinebilir (:2097, 2224).
- **Durum geçişleri (ApprovalStatus)**: `Beklemede`/NULL/`Planlama Yapıldı` → `Onay Bekliyor` (:1952-1960, 2177-2184) → `Onaylandı` | `Reddedildi` | `Talimat Verildi` (:2015-2068). `PaymentStatus`: `Beklemede` → `Gecikmiş` (vade geçince otomatik, :1389-1400) → `İşlemde` → `Tamamlandı` / `İptal`.
- **Cari PlanningStatus otomatiği** (:1352-1370): `Planlama Yok / Gecikmiş Ödeme / Ödeme Günü / Planlama Yapıldı` — `PaymentPlanDate`'e göre toplu UPDATE, audit bastırılarak.
- **Isı haritası**: `PaymentStatus NOT IN ('Tamamlandı','İptal')`; çeklerde `CheckStatus NOT IN ('Ciro Edildi','Tahsil Edildi')` (:1198-1201); yoğunluk eşikleri `ZT_PaymentDensityCurrencies` (para birimi başına Little/Middle/Intensive/VeryIntense).
- **Döviz**: TCMB `ForexSelling`; 30 dk pozitif + 5 dk negatif önbellek (:1052-1062).
- **Cari silme**: soft (`Status=false` + `DeletedAt/DeletedBy`), referans kayıt da pasiflenir (:4579-4700); GET ile tetikleniyor.
- **Banka hesabı meta verisi** `ZT_BankAccounts.Description` içine gömülü saklanıp parse ediliyor (`ParseCaBankDescription` :5280, `BuildCaBankDescription` :5322).
- `DeleteDashboardPlan` hard DELETE (:2947), diğer plan silmeleri soft.

---

## CustomerCurrentAccountsController (490 satır)

Dosya: `Controllers/CustomerCurrentAccountsController.cs`. `[Authorize]`, `[UserRoleAuthorize("Satış Personeli","Admin","Patron","Finans(normal)","Finans(super)")]` (:11-12).

### Route'lar
| Satır | Action | HTTP |
|---|---|---|
| 15 | Index | (öznitelik yok → GET) |
| 340 | GetCustomerOrders(customerId) | GET |

### View + partial + modal
`Views/CustomerCurrentAccounts/Index.cshtml` (538 satır). Layout role göre `_ProductionLayout` / `_Layout` (:5-17). Modallar: `transactionsModal`, `salesPartiesModal`. Partial: `_CustomerAccountNavMenus/_NavMenu_{Patron,Finance_Financial,Default}.cshtml`.

### JS/CSS
Yerel JS/CSS yok; inline ~9 KB. CDN: jQuery 3.6.0, DataTables i18n `plug-ins/2.1.8/i18n/tr.json`.

### AJAX uçları → Action
- `/CustomerCurrentAccounts/GetCustomerOrders` (:482) → kendi.
- `AccountTransaction/TransactionsPartial` (:398) → **AT** (modal içine cari hareket partial'ı yüklüyor).
- Menü linkleri (finans dışı): `/orderheader/index, /orders/index, /salesproduct/salesindex, /commercialproduct/index, /readystock/index, /SalesProductLogistic/index, /orderdefinitions/index`.

### Service/Warehouse metotları
Ham Npgsql. `GlobalVeriables.adminDatabase` (:17), `GlobalVeriables.restrictionQuery` (:152 — `Restriction`⋈`UserRestriction`; `userRoleID` stringe **birleştirilerek** ekleniyor, `'Sipariş İşlemleri'` kısıtı), `IntroductionAuditHelper.ExecuteSuppressed`. `CustomerAccountsController.UpdatePlanningStatuses` ile aynı mantığın kopyası (:397).

### Model/DTO/ViewModel
`CustomerAccountViewModel` (`Models/ZT/CustomerAccount.cs:140`).

### SQL nesneleri
R: `ZT_CustomerAccounts` (U:402 `PlanningStatus, PaymentPlanDate`), `ZT_AccountDebts/Credits/Payments/Collections`, `Currency`, `ZT_BankIntroduction`, `ZT_WorkPlace`, `ZT_BranchProvince`, `ZT_FinancePerson`, `ZT_Boss`, `ZT_SalesPerson`, `Restriction`, `UserRestriction`; finans dışı: `ZT_ProductionPlanning`, `Customer`, `Product`, `ZT_Orders`, `ZT_OrderHeader`. DDL yok.

### Bağlı finans sayfaları
AT.TransactionsPartial; menüden `/customercurrentaccounts/index`, `/purchasecurrentaccount/index`.

### FİNANS DIŞI BAĞIMLILIKLAR
Sayfa özünde **satış modülünün** cari görünümü: yalnız `AccountGroup = 'Müşteri'` (:217) carileri; `GetCustomerOrders` → `ZT_Orders`, `ZT_OrderHeader`, `Product` (:358-361); `ZT_SalesPerson` (:78); "Sipariş İşlemleri" kısıtı; satış menü linkleri. Gelen linkler: `Views/{OrderHeader,Orders,Product,SalesProduct,CommercialProduct,Finance}/…`, `_Layout.cshtml`.

### Yetki
5 rol. Header role göre `ZT_Boss` / `ZT_SalesPerson` / `ZT_FinancePerson`. İş yeri filtresi uygulanmıyor (görülmedi).

### İş kuralları
`TotalDebt > 0` olan (cari × para birimi) satırları (:221); bakiye 4 tablodan alt sorgularla.

---

## /PaymentApproval/Index (PaymentApprovalController + PaymentApprovalApiController + PaymentManagementController + PaymentPlanHelper)

### A) PaymentApprovalController (1653 satır) — aktif onay ekranı

`[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]` (:13-14). Tüm POST'larda `[ValidateAntiForgeryToken]`.

#### Route'lar
| Satır | Action | HTTP | Geçiş |
|---|---|---|---|
| 60 | Index(statusFilter="pending", workPlaceId?, bankId?, …) | GET | |
| 381 | GetBanksByWorkPlaceAjax | GET | |
| 401 | GetWorkPlacesByBranchProvinceAjax | GET | |
| 583 | Approve(id, notes) | POST+AF | Onay Bekliyor → Onaylandı |
| 644 | SendToApproval(id) | POST+AF | Beklemede/NULL/'' → Onay Bekliyor |
| 703 | BulkSendToApproval `[FromBody] List<int>` | POST+AF | |
| 757 | Reject(id, notes) | POST+AF | Onay Bekliyor → Reddedildi |
| 818 | GiveOrder(id, notes) | POST+AF | Onaylandı → Talimat Verildi (+PaymentStatus=İşlemde) |
| 885 | BulkApprove | POST+AF | Onay Bekliyor **veya Reddedildi** → Onaylandı (:906) |
| 939 | BulkReject | POST+AF | |
| 993 | BulkGiveOrder `[FromBody] List<BulkOrderRequest>` | POST+AF | + `ZT_BankPaymentInstructionDetails` güncelle |
| 1132 | BulkGiveOrderAndStoreSession | POST+AF | + Session'a talimat verisi |
| 1199 | BulkReturnToPending | POST+AF | Reddedildi → Onay Bekliyor |
| 1251 | UpdateInstructionStatusToCompleted | POST+AF | PaymentStatus=Tamamlandı — çağıran bu grubun dışında: `Views/BankTransactions/Index.cshtml:3561` |
| 1318 | BulkCompleteInstructions | POST+AF | Talimat Verildi → Tamamlandı |
| 1386 | GetBankAccountsByReference | GET | |
| 1532 | GetInstructionDetails `[FromBody] List<int>` | POST+AF | |

#### View + modal
`Views/PaymentApproval/Index.cshtml` (4300 satır), Layout `_ProductionLayout` (:5), model `PaymentApprovalController.PaymentPlanHierarchyViewModel`. Modallar: `notesModal, orderDetailModal, confirmModal, instructionProcessModal`. Partial: `_SideMenu_Finance`. `@Html.AntiForgeryToken()` (:31); AJAX'ta `RequestVerificationToken` başlığı.

#### JS/CSS
Yerel CSS `~/css/zt/paymentapproval/index.css`; harici sayfa JS'i yok, ~132 KB inline. CDN: SheetJS `xlsx-0.20.1` (cdn.sheetjs.com), select2 4.1.0-rc.0.

#### AJAX → Action
Kendi: Approve, Reject, GiveOrder, SendToApproval, BulkApprove, BulkReject, BulkGiveOrder, BulkGiveOrderAndStoreSession, BulkReturnToPending, BulkSendToApproval, BulkCompleteInstructions, GetBankAccountsByReference, GetBanksByWorkPlaceAjax, GetWorkPlacesByBranchProvinceAjax, GetInstructionDetails. **Başka controller**: `BankTransactions/Index` (:4083 — talimat sonrası yönlendirme; veri URL'de değil Session'da `PendingInstructionData`, `BankTransactionsController.cs:20` aynı anahtarı okuyor), `CustomerAccounts/Index` (:805).

#### Servis/yardımcı
Ham Npgsql; `IntroductionAuditHelper.GetActor` (22), `Methods.LogAdd` (4), `_dateTimeProvider.Now` (29), `System.Text.Json` (session serileştirme).

#### Model
Controller içi: `BulkOrderRequest` (:1118), `BulkOrderWithSessionRequest` (:1188), `PaymentPlanHierarchyViewModel` (:1456), `BankGroupViewModel` (:1469), `DateGroupViewModel` (:1485), `PaymentPlanItemViewModel` (:1492). İlgili: `Models/ZT/BankPaymentInstruction.cs` (`PaymentPlanRow` :68).

#### SQL
`ZT_CustomerAccountPaymentPlans` (R:153, 553, 1008, 1555; U: 11 yer :592…1337), `ZT_BankPaymentInstructionDetails` (R:159, 1557; U:1072 `CustomerIban, Description, UpdatedBy, UpdatedDate`), `ZT_BankAccounts` (R), `ZT_BankIntroduction` (R), `ZT_BankTransactions` (R:1635 — `GetBankBalance`), `ZT_CustomerAccounts` (R), `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince` (R). Finans dışı: yalnız `ZT_ProductionPlanning` (:74, layout). DDL yok.

#### Yetki / filtre
5 rol; **action bazında rol ayrımı yok** — sayfaya giren her rol onaylayabilir/talimat verebilir. İş yeri filtresi kullanıcı seçimli (şube → iş yeri → banka; iş yeri bankanın `WorkPlaceID`'sinden türetiliyor, :157). Yalnız `SourceType IN ('Manuel','Talimatlı Plan')` ve `PaymentBankID IS NOT NULL` planlar listelenir (:160-162). Varsayılan tarih aralığı: 3 ay önce – 9 ay sonra (:78).

#### İş kuralları
Hiyerarşi Banka → Tarih → Hesap (:276-340). Durum filtreleri `awaiting/pending/approved/rejected/ordered/completed/all` (:164-190). Geçişler `WHERE "ApprovalStatus" = …` koşuluyla korunuyor (yukarıdaki tablo). Talimat verilince "Talimatlı Plan" ise `ZT_BankPaymentInstructionDetails` IBAN/açıklaması güncellenir (:1068-1100).

### B) ApiController/PaymentApprovalApiController.cs (≈70 satır)

`[Route("Api/[controller]")]`, `[ApiController]`, `[Authorize]` (:12-14) — **rol özniteliği yok**. Tek uç: `POST Api/PaymentApprovalApi/CheckCompletedInstructions` (:21) → `ZT_CustomerAccountPaymentPlans` R (`"InstructionStatus" IN ('Ödendi','Tamamlandı')`, :38-40). ⚠ Projede (Views, wwwroot/js, *.cs) bu ucu çağıran BULUNAMADI; `InstructionStatus` kolonuna bu grupta yazan kod da BULUNAMADI (yalnız `BankIntroductionController.cs:1442`'de adı geçiyor).

### C) PaymentManagementController (2059 satır) — eski/alternatif borç bazlı onay akışı

Sınıf: `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]` (:18-19). `GetCustomerDebtSummary` dışındaki her action ayrıca 5 rollük `[UserRoleAuthorize]` taşıyor (Satış Personeli yalnız borç özetini okur — sınıf yorumu :10-17). POST'lar `[ValidateAntiForgeryToken]`.

#### Route'lar
PaymentPlanning (GET, :34), GetUnpaidDebts (GET, :83), CreatePaymentPlan (POST+AF, :188), GetPaymentPlans (GET, :333), DeletePaymentPlan (POST+AF, :410), PaymentApprovalRequest (GET, :492), GetDebtsForApproval (GET, :527), SendForApproval (POST+AF, :614), PaymentApprovals(status) (GET, :794), GetPaymentApprovalList (GET, :803), GetApprovalDetails (GET, :880), ApprovePayment (POST+AF, :941), RejectPayment (POST+AF, :1015), GivePaymentOrder (POST+AF, :1106), ProcessPaymentOrders (GET, :1182), ProcessPaymentOrder (POST+AF, :1222), GetPaymentOrders (GET, :1613), **GetCustomerDebtSummary (GET, :1726 — yalnız sınıf rolü)**, SearchApprovals (GET, :1937).

#### View + modal
`Views/PaymentManagement/PaymentPlanning.cshtml` (`planModal`), `PaymentApprovalRequest.cshtml` (`approvalModal`), `PaymentApprovals.cshtml` (`detailModal, approveModal, rejectModal`), `ProcessPaymentOrders.cshtml` (`processPaymentModal, paymentOrderDetailsModal`). Hepsi Layout `_ExpertLayout`, partial `Views/Shared/_PaymentManagementMenu.cshtml` (+ `Resources/Views/Shared/_PaymentManagementMenu.*.resx`).

#### JS/CSS
Yerel JS: `wwwroot/js/zt/paymentmanagement/{payment-planning.js, payment-approval-request.js, payment-approvals.js, process-payment-orders.js}`; CSS `~/css/zt/paymentmanagement/payment-management.css`. CDN: jQuery 3.6.4, bootstrap 4.6.2, DataTables 1.13.7 (+responsive css). Inline yok denecek kadar az.

#### AJAX → Action
Hepsi kendi controller'ına (view'da `Url.Action` ile). Menüye giriş: yalnız `_PaymentManagementMenu` ve kendi sayfaları; ⚠ ana yan menülerde (`_CustomerSideMenus`) `/PaymentManagement/*` sayfalarına link BULUNAMADI — sayfalar erişilebilir ama menüden bağlı görünmüyor.
**Dışarıdan yoğun kullanılan tek uç**: `GetCustomerDebtSummary` ← `Views/Bills/Bills.cshtml`, `Views/Checks/Checks.cshtml`, `wwwroot/js/zt/banktransactions/BankTransactionsPayments.js`, `wwwroot/js/zt/cashtransactions/cashtransactionspayments.js`, `wwwroot/js/zt/payments/payments.js`.

#### Servis/yardımcı
Ham Npgsql; `Methods.LogAdd` (5); **`BankTransactionsController.CreateBankTransaction` (:1381), `CashTransactionsController.CreateCashTransaction` (:1390)** statik çağrıları.

#### Model
Controller içi: `PaymentPlanRequest` (:2019), `ApprovalRequest` (:2034), `PaymentExecutionRequest` (:2043). `Models/ZT/PaymentPlan.cs`.

#### SQL
| Tablo | İşlem | Kolonlar (INSERT/UPDATE'ten) |
|---|---|---|
| ZT_PaymentPlans | R, I (:258), U (:442) | `DebtID, CustomerAccountID, PlannedPaymentDate, PlannedAmount, PlannedPaymentMethod, PlannedBankID, PlannedCashID, Priority, Status, Notes, CreationDate, CreatedBy` (+`UpdatedBy, UpdatedDate`) |
| ZT_PaymentApprovals | R, I (:647), U (:955, 1029, 1132, 1520) | `ApprovalCode, CustomerAccountID, TotalAmount, TotalDebtCount, Status, RequestedBy, RequestDate, Notes, Priority` (+`ApprovalDate, ApprovedBy, RejectedBy, RejectionDate, RejectionReason, PaymentOrderBy, PaymentOrderDate, PaymentCompletedDate`) |
| ZT_PaymentApprovalDetails | R, I (:709), U (:1473) | `ApprovalID, DebtID, DebtAmount, PaymentAmount, Status` (+`ActualPaidAmount, ActualPaymentID, BankID, CashID, PaymentMethod`) |
| ZT_AccountPayments | I (:1339), R | `CustomerAccountID, PaymentDate, PaymentMethod, WorkPlaceID, CashID, BankID, Amount, CurrencyID, ExchangeRate, PaymentDocumentNo, Description, PaymentStatus, ApprovalID, CreationDate, CreatedBy` |
| ZT_AccountDebts | R, U (:292, 458, 726, 1047, 1443) | U: `PlannedAmount, ApprovalPendingAmount, IsInApproval, PaidAmount, RemainingAmount, PaymentStatus` |
| ZT_AccountCredits, ZT_AccountCollections, ZT_CustomerAccounts, ZT_BankIntroduction, ZT_CashIntroduction, Currency, ZT_WorkPlace, ZT_BranchProvince | R | |

**Sequence**: `SELECT nextval('"ZT_PaymentApprovalCode_seq"')` (:781). ⚠ Bu sequence'in ve `ZT_PaymentPlans / ZT_PaymentApprovals / ZT_PaymentApprovalDetails` tablolarının CREATE betiği repoda BULUNAMADI. Çalışma zamanı DDL yok. Finans dışı tablo yok.

#### İş kuralları
Akış: plan (`ZT_PaymentPlans`) → onay talebi (`Onay Bekliyor`) → `Onaylandı` | `Reddedildi` (borçlar serbest bırakılır, :1045) → `Ödeme Talimatı Verildi` (yalnız onaylıdan, :1127) → `ProcessPaymentOrder`: talimat tutarını aşamaz (:1286), **kısmi ödeme FIFO** — `ORDER BY DueDate, TransactionDate` (:1316) ile borçlara dağıtım (:1400-1445), `ZT_AccountPayments` kaydı + banka/kasa hareketi (:1374-1395).

### D) Services/PaymentPlanHelper.cs (295 satır)

Statik sınıf (:10); DI yok, bağlantı ve opsiyonel transaction parametreyle gelir. Metotlar: `SyncCheckPaymentPlan` (:33), `CancelCheckPaymentPlan` (:173), `SyncCreditPaymentPlan` (:197), `CancelCreditPaymentPlan` (:228), `CancelAllCreditPaymentPlans` (:248), `CancelSalaryPaymentPlan` (:278).
- Tablolar: `ZT_CustomerAccountPaymentPlans` (R:65; I:85; U: 8 yer), `ZT_Checks` (R:45 — `PayeeCustomerID`), `ZT_CreditInstallments` (R:260).
- INSERT kolonları (:85): `CustomerAccountID, SourceType, SourceID, PaymentPlanDate, PaymentAmount, PaymentPlanCurrencyID, PaymentDescription, PaymentBankID, PaymentStatus, PlanningStatus, ApprovalStatus, Status, CreationDate, CreatedBy`.
- Kurallar: plan carisi = çekin **ilk lehdarı (Payee)**, yoksa parametre (:40-42); vade geçmişse `Gecikmiş` (:106); çek tamamlanınca `Tamamlandı` (:139); iptalde `PaymentStatus='İptal', Status=false` (:156, 179, 234).
- Çağıranlar: `AccountTransactionController`, `ChecksController`, `CreditContractsController`, `CustomerAccountCollectionController`, `CustomerAccountPaymentController`. `CancelSalaryPaymentPlan` çağıranı: ⚠ Controllers/Services/Views içinde BULUNAMADI (Maaş planı personel modülüne bağlı — finans dışı).

---

## CustomerAccountReportController (527 satır)

Dosya: `Controllers/CustomerAccountReportController.cs`.

### Route'lar
Reports (GET, :15), GetAgingReport (GET, :63), GetCheckMaturityReport (GET, :172), GetBillMaturityReport (GET, :268), GetPaymentPerformanceReport (GET, :365), GetCurrencyPositionReport (GET, :458).

**Sınıfta `[Authorize]` ve `[UserRoleAuthorize]` YOK** (:8). Oturumsuz istekte `Session.GetString("userDatabase")` null olacağından bağlantı kurulamaz, ancak öznitelik düzeyinde koruma tanımlı değil.

### View + modal
`Views/CustomerAccountReport/Reports.cshtml` (1062 satır), Layout `_ProductionLayout` (:3). Modal yok. ⚠ Bu action `ViewBag.ProductionPlanningChat` doldurmuyor (diğer _ProductionLayout sayfalarının aksine).

### JS/CSS
CDN `chart.js@3.9.1`; ~26 KB inline; yerel dosya yok.

### AJAX → Action
Kendi 5 JSON ucu. Ayrıca `Url.Action("EditCheck")` (:743) ve `Url.Action("EditBill")` (:844) — controller adı verilmediği için `CustomerAccountReport/EditCheck|EditBill` üretir; **bu action'lar bu controller'da YOK** (kırık link).

### Servis / Model
Ham Npgsql; yardımcı sınıf kullanımı yok; özel model yok (DataTable/anonim JSON). Session: `userDatabase`, `userRole`.

### SQL
Yalnız R: `ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_Checks` (:205), `ZT_Bills` (:301), `Currency`. DDL yok. Finans dışı tablo yok.

### Bağlı sayfalar / gelen linkler
⚠ Views ve wwwroot/js içinde bu controller'a link BULUNAMADI (yalnız `Services/FinanceReport/FrSql.cs`'de adı geçiyor) — menüden bağlı olmayan, muhtemelen atıl sayfa.

### FİNANS DIŞI BAĞIMLILIKLAR
Yalnız hesap grubu sabit listesi (:35-48) ve `_ProductionLayout`.

### İş kuralları
Yaşlandırma: `DueDate`'e göre `Current / 0-30 / 31-60 / 61-90 / 90+` kovaları, yalnız `ZT_AccountDebts.Amount` üzerinden (ödeme mahsubu sorgunun bu kısmında yok, :108-112). İş yeri filtresi yok.

---

## PurchaseCurrentAccountController (2562 satır) — kısa

Dosya: `Controllers/PurchaseCurrentAccountController.cs`. `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Muhasebe (Alış)","Finans(normal)","Finans(super)")]` (:14-15). Antiforgery yok.

**Değerlendirme: Bu controller `ZT_CustomerAccounts` / `ZT_Account*` cari altyapısına HİÇ dokunmuyor** (grep: 0 eşleşme). Eksper raporu/TIR bazlı eski "alış cari" ekranı; lojistik kopyasına alınmaması ya da tamamen yeniden yazılması gerekir.

### Route'lar
Index(cariAdi, cariTuru, durum, plaka) (:27), FirmaTanimla (POST, :938), GetBakiyeGosterSetting (POST, :985), UpdateBakiyeGosterSetting (POST, :1012), DownloadFile (GET, :1041), GetFile (GET, :1085), OdemeKaydet (POST, :1192), KesimCavusuOdemeYap (POST, :1366), NakliyeOdemeYap (POST, :1539), GetNakliyeDetails (POST, :1747), GetOdemeGecmisi (POST, :1871), OdemeSil (POST, :2111), MalzemeOdemeYap (POST, :2212), PesticideOdemeYap (POST, :2385).

### View
`Views/PurchaseCurrentAccount/Index.cshtml` (3577 satır), `_ExpertLayout`, model `DataTable`. Modallar: `odemelerModal, odemeModal, kesimCavusuOdemeModal, nakliyeOdemeModal, malzemeOdemeModal, firmaModal, silmeOnayModal`. ~76 KB inline JS; CDN jQuery 3.6.0. Başka controller AJAX: `/Payment/SavePayment` (:2558).

### Finans bağı (yalnız bunlar)
- `ZT_BankIntroduction` R + **U `Balance = Balance − @Amount`** (:1285), `ZT_CashIntroduction` R + U `Balance` (:1330).
- **Eski, `ZT_` öneksiz tablolar**: `"BankTransactions"` I (:1256 — `BankID, TransactionType, AccountingType, ReferenceID, Amount, CurrencyID, TransactionDate, Description, DocumentPath, TransactionKind, Status, CreationDate`), `"CashTransactions"` I (:1302). Diğer finans kodu `ZT_BankTransactions`/`ZT_CashTransactions` kullanıyor — iki ayrı hareket tablosu.
- `ZT_InstallmentPayments` R/I/U (:1213 — `ExpertReportID, Amount, PaymentDate, Description, PaymentMethod, ReferenceNo, InvoicePath, Status, CreationDate, CurrencyID`).
- Menü linkleri: `/finance/index, /cashintroduction/index, /cashtransactions/index, /bankintroduction/index, /banktransactions/index, /bankaccounts/index, /customeraccounts/index, /AccountCredits/index`.

### Finans dışı (neredeyse tamamı)
`ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckExpenses` (U), `Supplier`, `Product`, `SubProduct`, `TransportCompany`, `TransportTruck` (I:961), `ZT_HarvestManager`, `ZT_UsedHarvestManager` (U), `ZT_IndustrialSupplier`, `ZT_MaterialInvoice` (U), `ZT_PesticideInvoice` (U), `ZT_Setting` (R/U), admin DB `Customers` (`QrKey`; `databaseName` SQL'e **string birleştirme** ile ekleniyor, :1421, 1616, 2266, 2440). Dosya sunucusu: `GlobalVeriables.adminServerIP/FileName/Username/Password`, Session `DocumentServer*`, `TenantFileAccess.TryResolve` (:1046), `FileTokenHelper.Unprotect` (:1091), `IWebHostEnvironment`.

### Yetki
5 rol; `FirmaTanimla`, `OdemeKaydet`, `DownloadFile`, `GetFile` action'larında ek öznitelik yok (sınıf özniteliği geçerli). Header `ZT_FinancePerson` (:38).

---

## Grup özeti

### Tabloların tekil listesi

**Finans çekirdeği (kopyalanacak)**

| Tablo | Okuyan / yazan | Sınıf |
|---|---|---|
| ZT_CustomerAccounts | AT (R,U), CA (R,I,U), CCA (R,U), PA (R), PM (R), CAR (R), ATQ (R), OSCR (R) | Finans |
| ZT_AccountDebts | AT (R,I,U,D), CA (R), CCA (R), PM (R,U), CAR (R), ATQ (R) | Finans |
| ZT_AccountDebtsInvoice | AT (R,I,U) | Finans (kolonlar tarıma özgü kesintiler içerir) |
| ZT_AccountCredits | AT (R,I,U,D), CA (R), CCA (R), PM (R), CAR (R), OSCR (R,D) | Finans (`SalesTruckID` kolonu finans dışı bağ) |
| ZT_AccountCreditsInvoice | AT (R,I,U), OSCR (D) | Finans |
| ZT_AccountPayments | AT (R,D), CA (R), CCA (R), PM (R,I), CAR (R) | Finans |
| ZT_AccountCollections | AT (R,I,D), CA (R), CCA (R), PM (R), CAR (R) | Finans |
| ZT_AccountRollover | AT (R,I,U) | Finans — DDL mevcut |
| ZT_AccountTransferHistory | AT (R,I) | Finans — DDL mevcut |
| ZT_CustomerAccountPaymentPlans | CA (R,I,U,D), PA (R,U), PAApi (R), PPH (R,I,U) | Finans — ⚠ DDL yok |
| ZT_PaymentDensityCurrencies | CA (R,I,U) | Finans — ⚠ DDL yok |
| ZT_BankPaymentInstructionDetails | PA (R,U) | Finans |
| ZT_BankAccounts | CA (R,I,U,D), PA (R) | Finans |
| ZT_PaymentPlans | PM (R,I,U), CA (R) | Finans (eski akış) — ⚠ DDL yok |
| ZT_PaymentApprovals | PM (R,I,U), CA (R) | Finans (eski akış) — ⚠ DDL yok |
| ZT_PaymentApprovalDetails | PM (R,I,U) | Finans (eski akış) — ⚠ DDL yok |
| ZT_PaymentApprovalCode_seq (sequence) | PM (nextval, :781) | Finans — ⚠ DDL yok |
| ZT_BankIntroduction | AT, CA, CCA, PA, PM (R); PCA (R,U Balance) | Finans |
| ZT_CashIntroduction | AT, CA, PM (R); PCA (R,U Balance) | Finans |
| ZT_BankTransactions | AT (U), CA (R), PA (R); INSERT dolaylı (BankTransactionsController statik) | Finans |
| ZT_CashTransactions | AT (U), CA (R); INSERT dolaylı | Finans |
| ZT_Checks | AT (R,I,U), CA (R), CAR (R), PPH (R) | Finans |
| ZT_Bills | AT (R,I,U), CA (R), CAR (R) | Finans |
| ZT_CreditContracts | AT (R) | Finans |
| ZT_CreditInstallments | AT (R), PPH (R) | Finans |
| Currency | hepsi (R) | Ortak ana veri |
| Log | AT, CA, PA, PM (I — Methods.LogAdd) | Ortak |

**Organizasyon / kullanıcı (ortak — taşınacak ya da eşlenecek)**

| Tablo | Okuyan / yazan | Not |
|---|---|---|
| ZT_WorkPlace | hepsi (R); CA (I,U) | İş yeri |
| ZT_BranchProvince | AT, CA, CCA, PA, PM, PCA (R) | Şube/il |
| ZT_FinancePerson | AT, CA, CCA, PCA (R); FinanceAccess (R) | `SuperStatus`, `Key`, `WorkPlaceID` |
| ZT_AccountingPurchases | AT, CA (R) | Muhasebe (Alış) kullanıcıları |
| ZT_Boss | CA, CCA (R) | Patron |
| ZT_LogisticsPerson, ZT_ProductionManager | CA (R) | rol başlıkları |
| ZT_SalesPerson | CCA (R) | |
| ZT_Setting | PCA (R,U) | |
| Restriction, UserRestriction | CCA (R, GlobalVeriables.restrictionQuery) | |
| Users, UserRoles (ADMIN DB) | AT (R) | |
| Customers (ADMIN DB) | PCA (R) | kiracı kaydı |

**Finans dışı (çıkarılacak / dönüştürülecek)**

| Tablo | Okuyan / yazan | Alan |
|---|---|---|
| ZT_ProductionPlanning | AT, CA, CCA, PA (R) | Üretim (layout sohbeti) |
| ZT_ProductionConveyor, ZT_ProductionConveyorMaterials | AT (R) | Üretim |
| ZT_ProductionExpenses, ZT_ProductionExpensesDetail | AT, ATQ (R) | Üretim masrafı |
| ZT_ProductionSergeants | CA (R,I,U), ATQ (R) | Üretim çavuşu |
| ZT_ProductionSergeantsExpenses | ATQ (R) | |
| ZT_HarvestManager | CA (R,I,U), PCA (R) | Kesim çavuşu |
| ZT_UsedHarvestManager | AT (R), ATQ (R), PCA (R,U) | |
| Supplier | CA (R,I,U), ATQ (R), PCA (R) | Tedarikçi (üretici) |
| Customer | CA (R,I,U), AT (R), CCA (R), ATQ (R) | Müşteri ana verisi |
| ZT_IndustrialSupplier | CA (R,I,U), AT (R), ATQ (R), PCA (R) | Malzeme/ilaç tedarikçisi |
| TransportCompany | CA (R,I,U), ATQ (R), PCA (R) | Nakliye firması (**lojistikte çekirdek olabilir**) |
| TransportTruck | ATQ (R), PCA (R,I) | Araç |
| ZT_Chauffeur | ATQ (R) | Şoför |
| ZT_LaboratoryFirms | CA (R,I,U), ATQ (R) | Analiz firması |
| ZT_ExpenseItems | CA (R,I,U) | Masraf kalemi (Masraf Hesabı carisi) |
| ZT_ExpenseTypes | CA (R) | |
| ZT_Personnel | CA (R,I,U) | Personel |
| ZT_Orders | AT (R), CCA (R), ATQ (R), OSCR (U) | Sipariş |
| ZT_OrderHeader | CCA (R) | |
| ZT_OrderClaims, ZT_OrderExpenses | ATQ (R) | |
| ZT_MergedOrderProductPrices | OSCR (D, to_regclass kontrolüyle) | |
| ZT_SalesTruck | AT (R,U), ATQ (R), OSCR (U) | Satış TIR'ı |
| ZT_SalesTruckBatchNumbers | AT (R), OSCR (R) | |
| ZT_SalesTruckDebtLog | AT (çalışma zamanı CREATE + I) | |
| ZT_MaterialInvoice | AT (R,U), ATQ (R), PCA (R,U) | Stok |
| ZT_MaterialPurchases | AT (R,U), ATQ (R) | |
| ZT_MaterialStockAll | AT (U) | |
| ZT_MaterialSalesInvoice | AT (R) | |
| ZT_PesticideInvoice | AT (R), ATQ (R), PCA (R,U) | İlaç |
| ZT_PesticidePurchases, ZT_Pesticides, ZT_PesticideSalesInvoice | AT / ATQ (R) | |
| ZT_Warehouse | AT, ATQ (R) | Depo |
| ZT_ExpertReport, ZT_ExpertReportTruck | AT, ATQ, PCA (R) | Eksper/mal kabul |
| ZT_ExpertReportTruckFinance | AT, ATQ (R) | |
| ZT_ExpertReportTruckExpenses | ATQ (R), PCA (R,U) | |
| ZT_Expert | ATQ (R) | |
| ZT_InstallmentPayments | PCA (R,I,U) | Eksper raporu taksit ödemesi |
| BankTransactions, CashTransactions (ZT_ öneksiz, eski) | PCA (I) | Eski hareket tabloları |
| Product, SubProduct, ContainerType | AT, CCA, ATQ, PCA (R) | Ürün |
| ZT_WorkplaceContacts | ATQ (R) | |

### Ortak bağımlılıkların tekil listesi

**C# sınıfları / servisler**
- `Controllers/Methods.cs` (`Methods.LogAdd`) + `Models/Log.cs`
- `Models/GlobalVeriables.cs` (`adminDatabase`, `restrictionQuery`, `adminServer*`) — sabit kodlu bağlantı bilgisi içerir
- `Services/UserRoleAuthorizeAttribute.cs`, `Services/RequireFinancePersonnelAttribute.cs`, `Helpers/FinanceAccess.cs` (`Helpers/FinanceRoleHelper.cs` bu gruptaki controller'larda doğrudan çağrılmıyor; `FinanceAccess` yorumlarında desen olarak anılıyor ve `CustomerAccountsController.Index`'e referans veriyor)
- `Services/IDateTimeProvider.cs`, `Services/DateTimeProvider.cs`
- `Services/ITCMBExchangeRateService.cs` (arayüz + `TCMBExchangeRateService`; `IHttpClientFactory`, `IMemoryCache`)
- `Services/PaymentPlanHelper.cs`
- `Helpers/IntroductionAuditHelper.cs` (`GetActor`, `WithActor`, `ExecuteSuppressed`) + DB tarafında `trg_IntroductionAudit` trigger'ı ve `zto.audit_actor` / `zto.audit_suppress` GUC'ları
- `Helpers/ScriptJson.cs`, `Helpers/FileTokenHelper.cs`, `Helpers/TenantFileAccess.cs` (PCA), `Helpers/OfficialSalesCreditRemover.cs` (finans dışı)
- `Models/ZT/AccountTransactionQueries.cs` (finans dışı JOIN sorguları)
- `Services/IMenuDesignService` (view inject), `SecurityAuditFilter` (global filtre)
- Statik controller metotları: `BankTransactionsController.CreateBankTransaction`, `CashTransactionsController.CreateCashTransaction` (AT:6702/6724, PM:1381/1390); `CustomerAccountsController.GetApprovalStatusCounts` (BankIntroductionController kullanıyor)
- Modeller: `Models/ZT/CustomerAccount.cs`, `CustomerAccountBankItemDto.cs`, `CustomerAccountTransactionsViewModel.cs`, `AccountDebts.cs`, `AccountCredits.cs`, `AccountCreditsInvoice.cs`, `PaymentPlan.cs`, `BankPaymentInstruction.cs`, `WorkPlace.cs`

**View altyapısı**
- Layout'lar: `Views/Shared/_ProductionLayout.cshtml` (181 KB; `ViewBag.ProductionPlanningChat` ve `ViewData["FinanceID"|"PatronID"|"AccountingPurchasesID"|…]` bekler), `_Layout.cshtml`, `_ExpertLayout.cshtml`, `_ModalFrameLayout.cshtml`
- Partial'lar: `_DataTablesScriptsPartial.cshtml`, `_AllTransactionsPaymentTools.cshtml`, `_PaymentManagementMenu.cshtml`, `_CustomerSideMenus/*` (Finance, FinanceItems, Finance_Financial, AccountingPurchases, Patron, LogisticsPerson, ProductionManager, Default), `_CustomerAccountNavMenus/*`
- Yerelleştirme: `Resources/Views/{AccountTransaction,CustomerAccounts,CustomerCurrentAccounts,PaymentApproval,PaymentManagement,CustomerAccountReport,PurchaseCurrentAccount}/*.resx`, `Resources/Views/Shared/_PaymentManagementMenu.*.resx`

**wwwroot**
- JS: `js/zt/accounttransaction/{alltransactions.js, transactions.js}`, `js/zt/paymentmanagement/{payment-planning.js, payment-approval-request.js, payment-approvals.js, process-payment-orders.js}`
- CSS: `css/zt/accounttransaction/transactions.css`, `css/zt/bankstatement/index.css`, `css/zt/customeraccountcollection/collections.css`, `css/zt/customeraccountpayment/payments.css`, `css/zt/customeraccounts/index.css`, `css/zt/paymentapproval/index.css`, `css/zt/paymentmanagement/payment-management.css`, `lib/datatables/css/dataTables.bootstrap4.min.css`
- CDN: jQuery 3.6.4 / 3.6.0, bootstrap 4.6.2, DataTables 1.13.7 (+responsive 2.5.0, buttons 2.4.2, i18n 2.1.8), jszip 3.10.1, pdfmake 0.2.7, chart.js (4.4.1 / 3.9.1 / sürümsüz), OpenLayers 7.3.0, select2 4.1.0-rc.0, SheetJS xlsx 0.20.1, font-awesome 5.11.2

**Bu grubun bağlandığı diğer finans controller'ları** (başka envanter gruplarında ele alınmalı): `BankTransactions`, `CashTransactions`, `CustomerAccountCollection`, `CustomerAccountPayment`, `Checks`, `Bills`, `BankStatement`, `BankAccounts`, `BankIntroduction`, `CreditContracts`, `TimeDeposits`, `Investments`, `AccountCredits`, `Finance`, `Home` (`Closed`, `Error`), `Auth/Permission`, `Account/Login`.

**Bu grubun bağlandığı finans dışı controller'lar**: `SalesProductLogistic`, `ProductionExpenses`, `MaterialStockAll`, `PesticideStockAll`, `Product`, `Personnel`, `ProductionSergeantsExpenses`, `HarvestManagerExpenses`, `SalesTruckExpenses`, `ExpertReport`, `ExpertReportTruckExpenses`, `Sales`, `Orders`, `OrderHeader`, `SalesProduct`, `CommercialProduct`, `ReadyStock`, `OrderDefinitions`, `AccountingPurchases`, `Payment`, `Report`.

### Bulunamayanlar (toplu)

- ⚠ Temel `CREATE TABLE` betikleri: `ZT_CustomerAccounts`, `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_AccountPayments`, `ZT_AccountCollections`, `ZT_AccountDebtsInvoice`, `ZT_AccountCreditsInvoice`, `ZT_CustomerAccountPaymentPlans`, `ZT_PaymentPlans`, `ZT_PaymentApprovals`, `ZT_PaymentApprovalDetails`, `ZT_PaymentDensityCurrencies`, `ZT_BankPaymentInstructionDetails`, `ZT_BankAccounts`, `ZT_InstallmentPayments` ve `ZT_PaymentApprovalCode_seq`. Repoda yalnız `ZT_AccountRollover`, `ZT_AccountTransferHistory`, `ZT_SalesTruckDebtLog` için tam DDL var. Kolon listeleri yukarıda INSERT/UPDATE'lerden türetildi; tipler/kısıtlar/indeksler için canlı şema dökümü gerekir.
- ⚠ `Api/PaymentApprovalApi/CheckCompletedInstructions` çağıranı ve `InstructionStatus` kolonuna yazan kod.
- ⚠ `AccountTransaction/AddCollection` çağıranı (bu grubun view/JS'inde).
- ⚠ `CustomerAccounts/ApprovePaymentPlanning` çağıranı.
- ⚠ `PaymentPlanHelper.CancelSalaryPaymentPlan` çağıranı.
- ⚠ `CustomerAccountReport` sayfasına menü/link; `EditCheck`/`EditBill` action'ları.
- ⚠ `/PaymentManagement/*` sayfalarına ana menüden link.
- ⚠ Kullanıcıyı kendi iş yeriyle zorunlu sınırlayan sunucu taraflı WorkPlace kısıtı (bu gruptaki hiçbir controller'da görülmedi; filtre her yerde istemci parametresi).
