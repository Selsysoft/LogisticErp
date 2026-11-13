# Envanter D — Stok, Masraf, Kur, Şube / İş Yeri

Kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. Salt-okunur analiz; proje dosyalarına dokunulmadı.
Yöntem: action imzaları, SQL stringleri, `url:` / `fetch(` / `$.getJSON` çağrıları ve modal id'leri Grep ile tarandı; kritik aralıklar okundu. Tamamı satır satır okunmayan dosyalar (özellikle 8000 satırlık `MaterialStockAllController`) için tablo/kolon listeleri SQL stringlerinden otomatik çıkarıldı; görülmeyen şeyler `⚠ BULUNAMADI` ile işaretli.

Ortak notlar (tüm parçalar için geçerli):
- **Veri erişimi**: Kapsamdaki tüm controller'lar **raw Npgsql** kullanır (`NpgsqlConnection` / `NpgsqlDataAdapter` / `NpgsqlCommand`). Ayrı Warehouse/Repository sınıfı YOK. Tek istisna kur servisi (`TCMBExchangeRateService`, DI singleton).
- **Kiracı DB bağlantısı**: `new NpgsqlConnection(HttpContext.Session.GetString("userDatabase"))` (ör. `MaterialStockAllController.cs:61`). Yönetim DB'si: `GlobalVeriables.adminDatabase` (ör. `MaterialStockAllController.cs:1186`, `ProductionExpensesController.cs:1022`) — `public."Customers"` tablosundan `QrKey` okumak için (doküman klasörü). API controller'da: `GlobalVeriables.customerApiDatabase + database` (`CurrencyApiController.cs:28`). `Models/GlobalVeriables.cs` içinde bağlantı dizgileri sabit kodlu (değerler buraya yazılmadı).
- **Oturum anahtarları**: `userDatabase`, `databaseName`, `factoryName`, `customerUserKey`, `customerUserRole`, `customerUserName`, `userRole` (kısıt sorgusu için rol ID), `language`, `DocumentServerIP/Username/Password/FileName`.
- **Yetki**: `[Authorize]` (cookie auth, `Program.cs:138`) + özel `[UserRoleAuthorize(...)]` (`Services/UserRoleAuthorizeAttribute.cs:8`) — rol `ClaimTypes.Role` claim'inden okunur; yetkisizse `/Auth/Permission`, girişsizse `/Account/Login`. Global fallback auth policy `⚠ BULUNAMADI` (yalnız `AdminSystemPolicy` tanımlı, `Program.cs:34`).
- **Ortak yardımcılar**: `Methods.ConvertToList<T>(DataTable)`, `Methods.LogAdd(Log, con)`, `Methods.Authorize(database, token)` (API), `GlobalVeriables.restrictionQuery` (rol-kısıt sorgusu, `Restriction` tablosu), `NetworkConnection` (SMB doküman sunucusu), `ZtoFabrika.Helpers.FileTokenHelper`, `ZtoFabrika.Helpers.TenantFileAccess`, `IDateTimeProvider` (singleton, `Program.cs:63`), `IMenuDesignService` (view'lara inject).
- **Route**: yalnız konvansiyonel `{controller=Account}/{action=Login}/{id?}` (`Program.cs:826`). Attribute route yalnız API controller'da.
- **Yerel JS/CSS**: Kapsamdaki view'lar doğrudan `wwwroot` dosyası referans ETMİYOR (taramada `src="~/..."`/`href="~/..."` bulunmadı); yerel varlıklar layout'lardan gelir: `_Layout.cshtml`, `_ExpertLayout.cshtml`, `_ProductionLayout.cshtml`. View içi CDN'ler aşağıda parça parça listelendi.

---

## 1. MaterialStockAll (`/MaterialStockAll/Index`) + MaterialStockProduction

### 1.1 Route'lar — `Controllers/MaterialStockAllController.cs` (8018 satır)

Sınıf öznitelikleri (`:19-20`): `[Authorize]`, `[UserRoleAuthorize("Admin","Mal Kabul","Muhasebe (Alış)","Finans(normal)","Finans(super)","Patron","Satınalma","Üretim Müdürü","Kalite Kontrol")]`. Ctor: `IWebHostEnvironment`, `IDateTimeProvider`.

| Satır | Action | HTTP | Not |
|---|---|---|---|
| 56 | `Index(string id="0", string branchId="0")` | (öznitelik yok → GET) | Stok özeti; `id`=iş yeri, `branchId`=şube |
| 306 | `CriticalStocksJson()` | GET | Kritik stok modalı JSON (weighbridge/purchases da kullanır, `:301-304`) |
| 393 | `MaterialInvoiceAll(id, branchId)` | GET | Tedarikçi bazlı alış faturası grupları |
| 646 | `All(id, branchId)` | GET | Tüm alış kalemleri |
| 903 | `Add()` | GET | Alış faturası formu |
| 1184 | `Add(MaterialInvoice, IFormFile InvoiceDocumentFile, string returnUrl)` | POST | **`[HttpPost]` özniteliği 1167'de, araya `private bool MatInvoiceHasStockCols()` (1170) girmiş** — öznitelik derleyicide private metoda bağlanır; `Add` POST'u fiilen özniteliksiz (GET imzasıyla overload çakışması olmadığı için çalışıyor). `/recipegoods/add` formu da bu POST'u kullanır (`:1192`) |
| 2157 | `GetWorkPlacesByBranchProvince(int branchProvinceId)` | GET | JSON |
| 2195 | `GetFile(string filePath, string token)` | GET | Doküman indirme; ProductionExpenses view'ları da kullanır |
| 2262 | `Edit(int id, string path, int? supplierid)` | GET | |
| 2549 | `Update(MaterialInvoice, IFormFile)` | POST | |
| 3178 | `MaterialInvoice(int? supplierid, id, branchId)` | (GET) | Tedarikçinin faturaları |
| 3343 | `GetSalesMaterials(int id)` | GET | JSON |
| 3407 | `GetMaterials(int id, bool includeInvoiceInfo)` | GET | JSON |
| 3531 | `GetInvoiceUsageDetails(int id)` | GET | JSON — üretimde kullanım detayı |
| 3903 | `CheckInvoiceDeletable(int id)` | GET | JSON |
| 3994 | `DeleteInvoice(int id)` | POST | |
| 4167 | `DeleteSales(int id)` | POST | |
| 4380 | `CheckSalesInvoiceDeletable(int id)` | GET | |
| 4409 | `Losses()` | (GET) | Kayıp listesi |
| 4476 / 4708 | `AddLosses()` / `AddLosses(MaterialLosses)` | GET / POST | Eski (faturasız) kayıp |
| 4863 | `GetLossMaterialInvoices(int containerTypeId, int workPlaceId)` | GET | |
| 4949 | `SaveMaterialLoss([FromBody] MaterialLossSaveDto)` | POST | Fatura/seri-no bazlı kayıp |
| 5042 | `GetLossDetails(int lossId)` | GET | |
| 5066 | `RestoreMaterialLoss([FromBody] MaterialLossRestoreDto)` | POST | Kayıp geri alma |
| 5176 / 5184 | `SupplierAdd()` / `SupplierAdd(IndustrialSupplier)` | GET / POST | Hızlı tedarikçi + cari açma |
| 5376 | `GetPurchaseCountsByContainerTypes(int[] containerTypeIds, workPlaceId, branchId)` | GET | |
| 5435 | `GetPurchasesByContainerType(containerTypeId, workPlaceId, branchId)` | GET | |
| 5582 | `GetAllInvoicesUsageStatus(int? supplierid)` | GET | |
| 5661 | `MaterialSalesInvoiceAll(id, branchId)` | (GET) | |
| 5868 | `MaterialSalesInvoice(int? supplierid, id, branchId)` | (GET) | |
| 6026 | `SalesAll(id, branchId)` | (GET) | |
| 6281 / 6499 | `AddSales()` / `AddSales(MaterialSalesInvoice, IFormFile)` | GET / POST | Malzeme satış faturası |
| 7102 | `EditSales(int id, string path, int? supplierid)` | GET | |
| 7466 | `UpdateSales(MaterialSalesInvoice, IFormFile)` | POST | |
| 7956 | `GetAvailableStock(containerTypeId, workPlaceId?, branchProvinceId?)` | GET | JSON |

Private yardımcılar: `GetInvoiceAmountWithFallback` (31), `GetUserRoleScope` (1140), `MatInvoiceHasStockCols` (1170), `GetContentType` (2241), `MatUsedExpr` (3861), `GetLossUserScope` (4818), `MatSalesInvoiceHasStockCols` (6483).

İç sınıflar (controller dosyasında): `MaterialInvoiceGrouped` (625), `CurrencyTotalLine` (639), `MaterialPurchaseDto` (2522), `MaterialUsageInfo` (3868), `UsageDetail` (3883), `MaterialLossLineDto` / `MaterialLossSaveDto` / `MaterialLossRestoreDto` (4845-4859), `MaterialSalesInvoiceGrouped` (5854), `MaterialSalesItems` (7082).

### 1.2 `MaterialStockProductionController` ile ilişki — `Controllers/MaterialStockProductionController.cs` (169 satır)

- Öznitelik (`:12`): `[UserRoleAuthorize("Admin","Üretim Müdürü","Satış Personeli")]` (sınıfta ayrı `[Authorize]` yok; `UserRoleAuthorize` zaten `AuthorizeAttribute` türevi).
- Tek action: `Index(int wp = 0)` (`:16`) — **salt-okunur**; aynı `ZT_MaterialStockAll` tablosunu `ContainerType`, `ZT_WorkPlace`, `ZT_BranchProvince` ile JOIN'leyip listeler (`:87-101`), aynı `MaterialStockAll` modelini kullanır. Yazma yok.
- Fark: iş yeri kapsamı `GetPmScopeWorkPlaces` (`:119`) ile `ZT_ProductionManager` / `ZT_Boss` kaydından hesaplanır; şubesiz iş yerleri de dahil (`:~150` yorum). View: `Views/MaterialStockProduction/Index.cshtml` (300 satır, `_ProductionLayout`, modal yok, AJAX yok).
- Yani üretim menüsündeki "Malzeme Stokları" = MaterialStockAll'un salt-görüntüleme kopyası.

### 1.3 View + partial + modal — `Views/MaterialStockAll/` (14 dosya, ~19.000 satır)

| View | Satır | Layout | Modal id'leri | Partial'lar |
|---|---|---|---|---|
| Index.cshtml | 2017 | `_ProductionLayout` / `_Layout` (role göre) | `purchasesModal` | `_CustomerSideMenus/_SideMenu_{AcceptanceOfGoods,AccountingPurchases,Finance,Patron,Default}`, `_CustomerAccountNavMenus/_NavMenu_{...aynı}`, `_CriticalStockModal` |
| Add.cshtml | 2918 | `_ExpertLayout` | `emptyMaterialModal`, `supplierAddModal` | `_UyumsoftTransferModal`, `_WhSearchSelect` |
| Edit.cshtml | 2282 | `_ProductionLayout` / `_Layout` | `emptyMaterialModal`, `supplierAddModal` | `_WhSearchSelect` |
| AddSales.cshtml | 2261 | `_ExpertLayout` | `emptyMaterialModal`, `supplierAddModal` | `_UyumsoftTransferModal`, `_WhSearchSelect` |
| EditSales.cshtml | 2269 | `_ExpertLayout` | aynı | `_WhSearchSelect` |
| All.cshtml | 1122 | `_ProductionLayout` / `_Layout` | `materialsModal` | — |
| MaterialInvoice.cshtml | 1784 | `_ProductionLayout` | `deleteConfirmModal`, `materialsModal`, `usageDetailsModal` | `_UyumsoftInvoiceListTools` |
| MaterialInvoiceAll.cshtml | 732 | `_ProductionLayout` | — | — |
| MaterialSalesInvoice.cshtml | 946 | `_ExpertLayout` | `deleteModal`, `salesMaterialsModal` | `_UyumsoftSalesListTools` |
| MaterialSalesInvoiceAll.cshtml | 721 | `_ProductionLayout` | — | — |
| SalesAll.cshtml | 908 | `_ExpertLayout` | — | — |
| Losses.cshtml | 525 | `_ProductionLayout` / `_Layout` | `lossUndoModal` | — |
| AddLosses.cshtml | 442 | `_ExpertLayout` / `_Layout` | — | — |
| SupplierAdd.cshtml | 68 | `_ExpertLayout` | — | — |

### 1.4 JS/CSS
- **Yerel**: view içinde doğrudan referans yok (layout'tan gelir).
- **CDN**: `https://code.jquery.com/jquery-3.6.0.min.js` (Index, All, Losses, MaterialInvoice, MaterialInvoiceAll, SupplierAdd), `https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css` (Index, AddSales, EditSales).

### 1.5 AJAX uçları → Action

| View | Çağrı | Hedef |
|---|---|---|
| Index | `/MaterialStockAll/GetPurchasesByContainerType`, `/MaterialStockAll/GetPurchaseCountsByContainerTypes` | kendi |
| Index | `location.href='/pesticidestockall/index'` | **başka: PesticideStockAll** |
| Add | `fetch('/materialstockall/SupplierAdd')`, `fetch('/MaterialStockAll/GetWorkPlacesByBranchProvince')` | kendi |
| Add | `fetch('/Weighbridge/AddNewTransportCompanyOrTruck')`, `/weighbridge/HarvestManagerAdd`, `/weighbridge/GetTransportCompanies`, `/Weighbridge/GetTransportCompanyByPlate` | **başka: WeighbridgeController** (mal kabul nakliye) |
| Add / Edit | link `/containertype/add` | **başka: ContainerType** |
| AddSales / EditSales | `fetch('/materialstockall/SupplierAdd')`, `GetWorkPlacesByBranchProvince` | kendi |
| All / MaterialInvoice | `/MaterialStockAll/GetMaterials`, `GetInvoiceUsageDetails`, `GetAllInvoicesUsageStatus`, `DeleteInvoice`, `GetFile` | kendi |
| All / MaterialInvoice / MaterialInvoiceAll | link `/AccountTransaction/TransactionsByReference` | **başka: AccountTransaction (cari ekstre)** |
| MaterialSalesInvoice | `/MaterialStockAll/GetSalesMaterials`; form `action="/materialstockall/deletesales"` | kendi |
| Losses | `$.getJSON('/MaterialStockAll/GetLossDetails')`, `/MaterialStockAll/RestoreMaterialLoss` | kendi |
| AddLosses | `$.getJSON('/MaterialStockAll/GetLossMaterialInvoices')`, `/MaterialStockAll/SaveMaterialLoss` | kendi |
| Losses (menü linkleri) | `/weighbridge/purchases`, `/warehousesituation/index`, `/salesproduct/index`, `/productionexpenses/index`, `/productioncost/index`, `/expertreport/allreports`, `/accountingpurchases/index`, `/Report/index` | başka (navigasyon) |

Not: `GetAvailableStock` ve `CheckInvoiceDeletable` / `CheckSalesInvoiceDeletable` için view tarafında düz string URL eşleşmesi taramada çıkmadı (dinamik URL kurulumu olabilir) — `⚠ çağıran BULUNAMADI` (regex taraması sınırı).

### 1.6 Model / DTO

| Sınıf | Dosya |
|---|---|
| `MaterialStockAll` | `Models/ZT/MaterialStockAll.cs` |
| `MaterialInvoice` (+ `MaterialPurchases`, `PesticidePurchases` listeleri, QC alanları) | `Models/ZT/MaterialInvoice.cs` |
| `MaterialPurchases` | `Models/ZT/MaterialPurchases.cs` |
| `MaterialLosses` | `Models/ZT/MaterialLosses.cs` |
| `MaterialSalesInvoice`, `MaterialSalesItemDto` | `Models/ZT/MaterialSalesInvoice.cs` |
| `IndustrialSupplier` | `Models/ZT/IndustrialSupplier.cs` |
| `Warehouse` | `Models/ZT/Warehouse.cs` |
| `ContainerType` (`IAuditableIntroduction`) | `Models/ContainerType.cs` |
| `Currency`, `ExchangeRateKur` | `Models/Currency.cs` |
| `Log` | (Methods.LogAdd parametresi) |

### 1.7 SQL nesneleri (controller SQL stringlerinden)

| Tablo | Okuma | Yazma (satır örnekleri) |
|---|---|---|
| `ZT_MaterialStockAll` | evet | INSERT 1662, 2893, 4286; UPDATE 1654, 2044, 2743, 2884, 4067… (12 yer) |
| `ZT_MaterialInvoice` | evet | INSERT 1460; UPDATE 1901 (nakliye/konum), 1928 (PurchaseOrderID), 2760, 4106 (soft delete) |
| `ZT_MaterialPurchases` | evet | INSERT 1567, 2837; UPDATE 4097 (Status=false), 5005 (RemainingAmount düş), 5153 (iade); **DELETE 2752** (Update sırasında hard delete + yeniden insert) |
| `ZT_MaterialSalesInvoice` | evet | INSERT 6679; UPDATE 4316, 7641 |
| `ZT_MaterialSalesItems` | evet | INSERT 6823, 7737; UPDATE 4307; DELETE 7633 |
| `ZT_MaterialLosses` | evet | INSERT 4726, 4965; UPDATE 5101, 5163 |
| `ZT_MaterialLossDetail` | evet | INSERT 5009; UPDATE 5155 |
| `ZT_MaterialConsumption` | evet (3554, 3676) | — (yazan: ProductionConveyorController) |
| `ZT_AccountDebts` | evet | INSERT 1765, 2983; UPDATE 1701, 2943; DELETE 4115 |
| `ZT_AccountCredits` | evet | INSERT 6953, 7839; UPDATE 6897, 7808; DELETE 4327 |
| `ZT_CustomerAccounts` | evet | INSERT 1335 (reçeteli akış oto-cari), 5262 (SupplierAdd) |
| `ZT_IndustrialSupplier` | evet | INSERT 5220 |
| `ZT_PurchaseOrder` | — | UPDATE 1977 (OrderStatus) |
| `ZT_PurchaseOrderLine` | evet | UPDATE 1965 (ReceivedAmount, LineStatus) |
| `ZT_PoGoodsReceipt` | evet 2024 | UPDATE 2056 (StockInvoiced) |
| `ContainerType`, `Currency`, `ZT_Warehouse`, `ZT_WorkPlace`, `ZT_BranchProvince` | evet | — |
| `ZT_AcceptanceOfGoods`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_Boss` | evet (kullanıcı kapsamı) | — |
| `ZT_ProductionPlanning`, `ZT_ProductionConveyor`, `ZT_ProductionConveyorMaterials`, `Customer` | evet (kullanım detayı / layout chat) | — |
| `ZT_EInvoice` (7432), `ZT_Setting` (7417) | evet (Uyumsoft e-fatura durumu) | — |
| `Customers` (admin DB) | evet (QrKey) | — |

Kolon listeleri (INSERT ifadelerinden):
- `ZT_MaterialInvoice` (`:1460-1466`): `IndustrialSupplierID, InvoiceNumber, DeliveryInvoiceNumber, InvoiceDate, PaymentStatus, TotalAmountPriceIncludingKDV, Note, InvoiceDocumentPath, Status, CreationDate, WorkPlaceID, BranchProvinceID, CurrencyID, InvoiceCurrencyID, ExchangeRate, DocumentType` [+ opsiyonel `StockWorkPlaceID, StockBranchProvinceID`]. Sonradan kolon-güvenli UPDATE ile: `TransportCustomerAccountID, TransportFee, TransportCurrencyID, TransportExchangeRate, OriginLat, OriginLng, OriginAddress, RouteDistanceKm, RouteDurationMin` (`:1829-1905`), `PurchaseOrderID` (`:1928`). Migration'lardan ek: `QualityControlStatus/Note/Date/PersonID/DocumentPath` (`SQL_Migrations/2026_MaterialInvoice_QualityControl_Migration.sql`), `QualityControlResult/SuggestedResult/Attention/OverrideReason` (`SQL_Migrations/2026_09_25_MaterialLineQualityControl.sql:58-61`).
- `ZT_MaterialPurchases` (`:1567-1571`): `InvoiceID, ContainerTypeID, AmountReceived, InvoiceAmount, QuantityType, UnitPrice, TotalPriceExcludingKDV, KDVRate, KDVAmount, TotalPriceIncludingKDV, WarehouseID, CreationDate, Status, BatchNumber, DiscountRate, DiscountAmount, WithholdingTaxAmount, OtherTaxesAmount`. Migration'lardan: `RemainingAmount numeric` (`SQL_Migrations/2026_MaterialPurchases_RemainingAmount_Migration.sql:15`), `WarehouseLocationID integer` (`Docs/ReceteliUretim/2026_Faz53_DepoYonetimi.sql:43`).
- `ZT_MaterialStockAll` (`:1662-1664`): `ContainerTypeID, RemainingAmount, UsedAmount, LossesAmount, WorkPlaceID, BranchProvinceID`; ayrıca `SalesAmount` (`:6873` UPDATE; `:272` SELECT). Modelde ek: `PesticidesID, RemainingAmount2, UsedAmount2, Description` (CREATE TABLE ifadesi `⚠ BULUNAMADI`).
- `ZT_MaterialSalesInvoice` (`:6679-6682`): `IndustrialSupplierID, InvoiceNumber, InvoiceDate, PaymentStatus, TotalAmountPriceIncludingKDV, Note, InvoiceDocumentPath, Status, CreationDate, WorkPlaceID, BranchProvinceID, DocumentType` [+ `StockWorkPlaceID, StockBranchProvinceID`].
- `ZT_MaterialSalesItems` (`:6823-6827`): `SalesInvoiceID, ContainerTypeID, AmountSold, UnitPrice, TotalPriceExcludingKDV, KDVRate, KDVAmount, TotalPriceIncludingKDV, WarehouseID, CreationDate, Status, BatchNumber, DiscountRate, DiscountAmount, WithholdingTaxAmount, OtherTaxesAmount`.
- `ZT_MaterialLosses` (`:4726`, `:4965`): `ContainerTypeID, LossDate, LossAmount, LossReason, ReportedBy, Note, LosePlace, LoseAmountOfDamage, WorkPlaceID, BranchProvinceID` (+ `Status, RestoredDate, RestoredBy` — `Docs/MaterialLosses/2026_MaterialLosses_LegacyRestore.sql:12-18`).
- `ZT_MaterialLossDetail` (`:5009`; tam DDL `ZT_MaterialLossDetail.sql`): `ID, MaterialLossID, ContainerTypeID, BatchNumber, MaterialPurchaseID, InvoiceID, LossAmount, WorkPlaceID, BranchProvinceID, Status, RestoredDate, RestoredBy, CreationDate`; FK `MaterialLossID → ZT_MaterialLosses(ID) ON DELETE CASCADE`.
- `ZT_AccountDebts` (`:1765-1769`): `CustomerAccountID, TransactionDate, Amount, CurrencyID, ExchangeRate, DocumentNo, AccountingType, ReferenceID, CreationDate, CreatedBy, WorkPlaceID, Description, DocumentType`.
- `ZT_AccountCredits` (`:6953-6957`): aynı kolon seti.
- `ZT_CustomerAccounts` (`:1335-1337`): `AccountCode, AccountName, AccountGroup, Country, CurrencyID, CreditLimit, RiskLimit, ReferenceID, Status, CreationDate, CreatedBy`.

**Çalışma zamanı DDL**: Bu controller'da `CREATE TABLE` / `ADD COLUMN` YOK. Bunun yerine "kolon-güvenli" şema yoklamaları var (migration çalışmamış DB'de kırılmamak için):

| Satır | Yoklama |
|---|---|
| 1177 | `information_schema.columns` → `ZT_MaterialInvoice.StockWorkPlaceID` |
| 1838 | `ZT_MaterialInvoice.<nakliye/konum kolonu>` (parametreli) |
| 1923 | `ZT_MaterialInvoice.PurchaseOrderID` |
| 1941 | `to_regclass('public."ZT_PoGoodsReceipt"')` |
| 2000 | `ZT_PoGoodsReceipt.StockPosted` |
| 3546 | `to_regclass('public."ZT_MaterialConsumption"')` |
| 4450, 5095 | `ZT_MaterialLosses.Status` |
| 4884 | `to_regclass('public."ZT_MaterialLossDetail"')` |
| 6490 | `ZT_MaterialSalesInvoice.StockWorkPlaceID` |

### 1.8 İlgili SQL dosyaları

| Dosya | İçerik |
|---|---|
| `ZT_MaterialLossDetail.sql` (kök) | `CREATE TABLE IF NOT EXISTS ZT_MaterialLossDetail` + FK + 4 indeks |
| `ZT_MaterialUsageFormula_Create.sql` (kök) | `ZT_MaterialUsageFormula(ID, ContainerTypeID, UsageBasis 'Kasa'/'Palet'/'Sabit', Multiplier, Status, CreationDate)`; dosya yorumuna göre uygulama tabloyu ilk endpoint çağrısında da oluşturur (kullanan: `ProductionConveyorController`) |
| `Check_MaterialStock_vs_Invoices.sql` (kök, 221 satır) | Mutabakat sorguları: `ZT_MaterialStockAll` ↔ `SUM(ZT_MaterialPurchases)`; iş yeri eşlemesi `COALESCE(fatura.WorkPlaceID, depo.WorkPlaceID, 0)`; "aynı (tür, iş yeri) için birden çok StockAll satırı" ön kontrolü |
| `SQL/2026_10_23_MaterialStockCount_Audit.sql` | `ZT_MaterialStockCount` (sayım geçmişi): `ContainerTypeID, MaterialName, WarehouseID, WarehouseName, WarehouseLocationID, LocationText, OldTotal, NewTotal, Delta, QuantityType, CountDate, CreatedByUserID, CreatedByName, CreatedByRole, Note, Status`. Kullanan: `RecipeGoodsController.StockCount` (tabloyu yoksa oluşturur — dosya yorumu) |
| `SQL/2026_10_23_HammaddeSayimSeed.sql` (+ `_Rollback.sql`) | 24 hammaddeyi `ContainerType`'a (Type='Gıda Hammaddesi', UnitName='kg') ekler; `ZT_MaterialPurchases`'a fiyat 0 sayım lotu açar; `ZT_MaterialStockAll` bakiyesini sayıma eşitler (WorkPlaceID=101, BranchProvinceID=1 parametreli); yedek tablolar `zt_seed_hammadde_ct`, `zt_seed_hammadde_msa` |
| `SQL/2026_10_23_AmountType_Mukerrer_Birlestir.sql`, `..._Temizlik.sql` | Mükerrer `AmountType` kayıtlarını birleştirir/pasifleştirir; `AmountTypeID`/`AmountTypeID2` içeren tüm tabloları tarar (`RecipeDetail`, `Recipe`, `RecipeProduct`, `ZT_UsedComponents`…) |
| `SQL/2026_10_23_TenekeKutu_Birim_Adet_Fix.sql` | `RecipeDetail.AmountTypeID` ve `ContainerType.UnitName` düzeltmesi (reçete BOM birimi) |
| `SQL_Migrations/2026_MaterialPurchases_RemainingAmount_Migration.sql` | `ZT_MaterialPurchases.RemainingAmount` (fatura kırılımlı kalan) |
| `SQL_Migrations/2026_MaterialBatch_Lot_Migration.sql` | `ZT_ProductionConveyorMaterials.MaterialBatchNumber`, `ZT_ProductionConveyor.MaterialLotNumber` |
| `SQL_Migrations/2026_MaterialInvoice_DocumentType.sql`, `..._QualityControl_Migration.sql`, `2026_09_25_MaterialLineQualityControl.sql` | `ZT_MaterialInvoice` ek kolonları |
| `SQL_Migrations/2026_LotCategory_ContainerType_Migration.sql` | `ZT_LotCategory` + `ContainerType.LotNumber, MaterialCode` |
| `Docs/MaterialStockAll/2026_MaterialInvoice_StockWorkPlace.sql`, `2026_MaterialSalesInvoice_StockWorkPlace.sql` | `StockWorkPlaceID`, `StockBranchProvinceID` |
| `Docs/MaterialStockAll/2026_FazMC_MaterialConsumption.sql` | `ZT_MaterialConsumption` tüketim defteri (aşağıda) |
| `Docs/ReceteliUretim/2026_Faz53_DepoYonetimi.sql` | `ZT_Warehouse.IsColdStorage, UseLocations`; `ZT_WarehouseLocation(WarehouseID, BlockNo, FloorNo, RowCode)`; `ZT_WarehouseLocationTransfer`; `WarehouseLocationID` kolonları |
| `SQL/2026_10_27_Faz1_MalKabul_Sevk_Harita_QrTrace.sql` | `ZT_MaterialInvoice` nakliye + konum kolonları |

### 1.9 Finans bağlantısı (cariye yansıma)

- **Alış faturası** (`Add` POST, tek transaction `:1449-2079`): `ZT_MaterialInvoice` → `ZT_MaterialPurchases` (kalemler) → `ZT_MaterialStockAll` (+RemainingAmount) → **`ZT_AccountDebts`** (`AccountingType='Malzeme Tedarikçisi'`, `ReferenceID = MaterialInvoice.ID`, `CustomerAccountID` = tedarikçinin carisi; `:1684-1800`). Cari: `ZT_CustomerAccounts` `ReferenceID = IndustrialSupplierID AND AccountGroup IN ('Malzeme Tedarikçisi','İlaç Tedarikçisi')` (`:1309-1312`).
- **Satış faturası** (`AddSales` POST): `ZT_MaterialSalesInvoice` → `ZT_MaterialSalesItems` → `ZT_MaterialStockAll` (−RemainingAmount, +SalesAmount, `:6873`) → **`ZT_AccountCredits`** (`AccountingType='Malzeme Tedarikçisi'`, `ReferenceID = SalesInvoice.ID`; `:6886-6957`). Para birimi sabit `currencyId = 1` (`:6884`).
- **Fatura silme**: soft delete (`Status=false`) + `ZT_AccountDebts`/`ZT_AccountCredits` kaydı **hard DELETE** (`:4115`, `:4327`).
- Ödeme planı / banka / kasa tablolarına bu controller'dan doğrudan yazma YOK; yalnız cari borç/alacak kaydı oluşur. Ödeme tarafı `CustomerAccountPayment` vb. sayfalarda (bu envanterin kapsamı dışı).
- Bağlı finans sayfaları: `/AccountTransaction/TransactionsByReference` (All, MaterialInvoice, MaterialInvoiceAll linkleri). Ayrıca `AccountTransactionController.cs:7006` `ZT_MaterialStockAll`'u UPDATE ediyor (cari ekstre üzerinden fatura silme yolu).

### 1.10 Finans dışı bağımlılıklar (eksiksiz liste)

- **Üretim**: `ZT_ProductionConveyor` (`PalletID`, `ContainerID`, `MaterialPalletBatchNumber`, `MaterialContainerBatchNumber`, `ContainerCount`), `ZT_ProductionConveyorMaterials` (`Type`, `MaterialBatchNumber`, `Amount`), `ZT_MaterialConsumption`, `ZT_ProductionPlanning`, `Customer` — kullanım detayı ve "silinebilir mi" kontrolleri (`:3554-3770`, `:3903-3990`). Stoktan üretim düşümünü yazan asıl yer `ProductionConveyorController` (9 UPDATE), `ReadyStockController` (5), `ProductionPlanningController` (1), `RecipeProductionController` (2).
- **Reçeteli üretim / satınalma**: `/recipegoods/add` aynı `Add` POST'u kullanır; `ZT_PurchaseOrder`, `ZT_PurchaseOrderLine`, `ZT_PoGoodsReceipt`; `RecipeGoodsController`, `RecipePurchasingController` da `ZT_MaterialStockAll`'a yazar.
- **Satış/sevk**: `SalesProductController` `ZT_MaterialStockAll`'a yazar (2 yer) — palet/kasa sevk düşümü.
- **Kantar / mal kabul nakliye**: `WeighbridgeController` uçları (`GetTransportCompanies`, `GetTransportCompanyByPlate`, `AddNewTransportCompanyOrTruck`, `HarvestManagerAdd`).
- **Kalite kontrol**: `ZT_MaterialInvoice.QualityControl*` kolonları; `Services/MaterialLineQualityControl/*`.
- **e-Dönüşüm**: `ZT_EInvoice`, `ZT_Setting`, `_Uyumsoft*` partial'ları, `UyumsoftController`.
- **Tanımlar**: `ContainerType` (malzeme kartı), `ZT_Warehouse`, `ZT_IndustrialSupplier`, `ZT_LotCategory`.
- **Zirai ilaç**: modelde `PesticidesID` alanları; ayrı `PesticideStockAllController` (bu envanterde incelenmedi).
- **Kullanıcı/rol tabloları**: `ZT_AcceptanceOfGoods`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_Boss`.

### 1.11 Yetki / iş yeri filtresi
- Rol listesi yukarıda (`:20`). Fiyatsız mal kabul: yalnız `Üretim Müdürü` ve `Satınalma` toplam 0 ile kaydedebilir (`:1277-1283`).
- Kullanıcı kapsamı: role göre ilgili personel tablosundan `Key = session.customerUserKey` ile `WorkPlaceID` / `BranchProvinceID` okunur (`:86-200`; `GetUserRoleScope :1140-1165` — `ZT_Boss` / `ZT_FinancePerson` kaydı önceliklidir).
- Efektif filtre (`:228-236`): URL `id` (iş yeri) > URL `branchId` > kullanıcının iş yeri > kullanıcının şubesi. SQL filtresi `ZT_MaterialStockAll.WorkPlaceID` ya da `.BranchProvinceID` üzerinden (`:253-260`).

### 1.12 İş kuralları
- Stok havuzu anahtarı = **(ContainerTypeID, WorkPlaceID, BranchProvinceID)**; kayıt yoksa INSERT, varsa `RemainingAmount += AmountReceived` (`:1616-1675`). İş yeri/şube yoksa 0 yazılır (`:1639`, `:7965-7974`).
- "Stok çifti" faturadan ayrılabilir: `StockWorkPlaceID/StockBranchProvinceID` seçilirse stok o havuza yazılır; NULL = fatura çiftiyle aynı (`:1619`, `Docs/MaterialStockAll/2026_MaterialInvoice_StockWorkPlace.sql`).
- `QuantityType` boşsa `'Adet'`; `InvoiceAmount` NULL ise Adet→adet, Kg→`adet × Tare(gram) / 1000` (`:31-54`).
- Türkçe locale ondalık hatasına karşı toplam ve kur `InvariantCulture` ile yeniden parse edilir (`:1254-1272`).
- Cari borç tarihi = kullanıcının girdiği fatura tarihi (`:1691-1695`).
- Üretimde kullanılan miktar = `AmountReceived − RemainingAmount` (FIFO, `MatUsedExpr :3861-3866`); tüketim defteri varsa önce defter (`:3542-3556`).
- Kayıp: fatura seri no (BatchNumber) bazında FIFO düşüm; yetersiz stokta rollback + mesaj (`:4975-5005`). Faturasız eski kayıp geri alma stoklara dokunmaz (`:5071-5101`).
- Fatura silme: kullanım varsa engellenir (`:3999-4002`), yoksa stoktan düş + soft delete + cari borç sil (`:4023-4124`).
- Fatura güncelleme: eski stok çiftinden düş → kalemleri **hard DELETE** → yeniden INSERT (`:2725-2760`); stok kullanılmışsa stok şube/iş yeri kilitlenir (`:2462-2475`).
- PO eşleşmesi: `ZT_PoGoodsReceipt` varsa fatura miktar saymaz (çift sayım önleme, `:1935-1945`); "çift stok geri alımı" (`:1990-2062`).
- Dosya erişimi: `GetFile` token çözer ve `TenantFileAccess.TryResolve` ile kiracı klasörüne sınırlar (`:2199-2210`).
- Kritik stok modalı oturum başına 1 kez (`criticalStockShown` session bayrağı, `:286-289`).

---

## 2. SalesTruckExpenses (`/SalesTruckExpenses/Index`)

### 2.1 Route'lar — `Controllers/SalesTruckExpensesController.cs` (1199 satır)

**Sınıfta `[Authorize]` / `[UserRoleAuthorize]` YOK** (`:9`). Yalnız `Index` üzerinde `[Authorize]` var (`:11`). Diğer action'lar özniteliksiz.

| Satır | Action | HTTP | Öznitelik |
|---|---|---|---|
| 12 | `Index(int branchId=0, int workPlaceId=0, int days=150)` | (GET) | `[Authorize]` |
| 291 | `CompanySalesDetails(int transportCompanyId, string companyName, int days=150, int branchId=0, int workPlaceId=0)` | (GET) | **yok** |
| 659 | `GetTransportCompanies()` | GET | yok |
| 694 | `GetCurrencies()` | GET | yok |
| 731 | `UpdateSalesTruck([FromBody] SalesTruckUpdateModel)` | POST | yok |
| 1075 | `DeleteSalesTruckExpense([FromBody] DeleteSalesTruckExpenseModel)` | POST | yok |
| 1144 | `UpdateTransportInfo([FromBody] TransportUpdateModel)` | POST | yok |

Ctor yok (DI kullanmıyor; `DateTime.Now` doğrudan).

### 2.2 View / modal
| View | Satır | Layout | Modal id |
|---|---|---|---|
| `Views/SalesTruckExpenses/Index.cshtml` | 736 | `_ProductionLayout` | `companyInfoModal`, `detailModal` |
| `Views/SalesTruckExpenses/CompanySalesDetails.cshtml` | 2107 | `_ExpertLayout` / `_Layout` | `salesModal`, `shippingDetailModal` |

Partial'lar (Index): `_CustomerSideMenus/_SideMenu_{AccountingPurchases,Finance,Patron,Default}`, `_CustomerAccountNavMenus/_NavMenu_{...}`. Model: `@model DataTable`. JS/CSS: view içinde yerel/CDN referansı yok.

### 2.3 AJAX uçları
| View | Çağrı | Hedef |
|---|---|---|
| Index | `/SalesTruck/GetCompanySalesDetails`, `/SalesTruck/GetCompanyInfo` | **`SalesTruckController` projede YOK** (`Controllers/` altında `SalesTruck*` olarak yalnız `SalesTruckExpensesController.cs` var; bu action adları hiçbir controller'da geçmiyor) → ölü/kırık uç `⚠` |
| Index | `location.href='/SalesTruckExpenses/CompanySalesDetails'`, link `/AccountTransaction/Transactions/{caId}` | kendi / **AccountTransaction** |
| CompanySalesDetails | `/SalesTruckExpenses/UpdateSalesTruck`, `GetTransportCompanies`, `GetCurrencies`, `DeleteSalesTruckExpense` | kendi |
| CompanySalesDetails | `/AccountTransaction/GetTransactionDetails`, `/AccountTransaction/Transactions/{id}` | **AccountTransaction** |

`UpdateTransportInfo` için view çağrısı `⚠ BULUNAMADI`.

### 2.4 Model / DTO (hepsi controller içinde iç sınıf)
`SalesTruckUpdateModel` (`:1040`): `ID, TransportCompanyID, TransportCompanyPrice, CurrencyID, WorkPlaceID, TransportType, OtherPricing, LocationPricingName, TransportLocationPricing, InvoiceAmount, KDVAmount, WithholdingTax, TotalAmount, AdvanceAmount, RemainingAmount, DeductionAmount, BalanceAmount, PaidAmount, Description, DocumentType, DocumentNo`. `DeleteSalesTruckExpenseModel` (`:1137`): `ID, TransportType`. `TransportUpdateModel` (`:1189`): `ID, TransportCompanyID, TransportCompanyPrice, CurrencyID`.

### 2.5 SQL nesneleri
**Kendi masraf tablosu YOK.** Masraf verisi doğrudan sevk kaydının (`ZT_SalesTruck`) kolonlarında tutulur.

| Tablo | Okuma | Yazma |
|---|---|---|
| `ZT_SalesTruck` | 143, 157, 456, 516 | UPDATE 779 (gemi), 831 (sevk), 1105-1106 (temizle), 1152 |
| `ZT_AccountDebts` | 119, 128, 459, 519 | INSERT 959; UPDATE 925; DELETE 1093 |
| `ZT_CustomerAccounts` | 202, 308, 890 | — |
| `TransportCompany`, `TransportChauffeur`, `Currency`, `Customer`, `Factory` | evet | — |
| `ZT_SalesTruckBatchNumbers` | 442, 514 | — |
| `ZT_LocationPricing` | 613 | — |
| `ZT_WorkPlace`, `ZT_BranchProvince` | evet | — |
| `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_Boss` | evet (kapsam) | — |
| `ZT_ProductionPlanning` | 271 (layout chat) | — |

`ZT_SalesTruck` üzerinde bu controller'ın kullandığı kolonlar: `ID, Status, CreationDate, DepartureDate, CustomerID, ChauffeurID, Plate, DorsePlate, InvoiceNumber, NetAmount, GrossAmount, PalletCount, BoxCount, AnalysPrice` (okuma) ve masraf kolonları **`TransportCompanyID, TransportCompanyPrice, ShipTransportCompanyID (varchar), ShipTransportCompanyTotalPrice, CurrencyID, KDVAmount, WithholdingTax, TotalAmount, AdvanceAmount, RemainingAmount, DeductionAmount, PaidAmount, BalanceAmount, Description`** (yazma, `:779-793`, `:831-845`).

Çalışma zamanı DDL: yok.

### 2.6 Finans bağlantısı
- `UpdateSalesTruck` (`:731-1038`): (1) `ZT_SalesTruck` masraf kolonlarını günceller; (2) `ZT_CustomerAccounts` `ReferenceID = TransportCompanyID AND AccountGroup='Sevk Nakliye Firması'` ile cari bulunur (`:888-891`); (3) `ZT_AccountDebts` upsert — `AccountingType='Sevk Nakliye Firması'`, `ReferenceID = SalesTruck.ID`, ayrım kolonu **`TransportType`** ('Sevk Nakliye' / 'Gemi Nakliye'), `ExchangeRate` sabit `1.0000` (`:936`, `:965`), para birimi **carinin** `CurrencyID`'si (modelin değil, `:900`). Cari bulunamazsa borç kaydı yazılmaz, yalnız konsola log (`:~985`), kullanıcıya yine "başarılı" döner.
- **Transaction yok** (`UpdateSalesTruck` iki ayrı komut; `DeleteSalesTruckExpense` ise transaction'lı `:1088`).
- `DeleteSalesTruckExpense`: `ZT_AccountDebts` hard DELETE + `ZT_SalesTruck` nakliye alanlarını NULL/0 yapar; sevk kaydı silinmez (`:1071-1112`).
- Banka/kasa/ödeme planına doğrudan yazma yok.
- İş yeri filtresi `ZT_SalesTruck` üzerinde değil, **`ZT_AccountDebts.WorkPlaceID`** üzerinden alt sorguyla yapılır (`:116-131`) — yani cari borç kaydı olmayan sevk, şube/iş yeri filtresinde görünmez.

### 2.7 Finans dışı bağımlılıklar
`ZT_SalesTruck` (satış sevk aracı — sahibi `SalesProductController`), `ZT_SalesTruckBatchNumbers` (sevk parti numaraları), `Customer` (müşteri), `TransportCompany` (`TransportType='Sevk İhracat Nakliye'` filtresi `:231`), `TransportChauffeur`, `ZT_LocationPricing` (lokasyon fiyatlandırma), `Factory`, `ZT_ProductionPlanning` (yalnız layout chat widget).

### 2.8 İş kuralları
- Liste `TransportCompany`'den kurulur; nakliye kaydı olmayan 'Sevk İhracat Nakliye' firmaları da listelenir (`:204-207`).
- Varsayılan tarih filtresi son 150 gün (`:12`, `:110-112`).
- Sevk Nakliye ve Gemi Nakliye `UNION ALL` ile birleştirilir; gemi firması ID'si `ZT_SalesTruck`'ta **varchar** tutulur, `CAST(... AS INTEGER)` ile birleştirilir (`:156-166`).
- Zorunlu alanlar: `ID, TransportCompanyID, CurrencyID, TransportCompanyPrice > 0, WorkPlaceID > 0` (`:738-758`).
- `:907` `TransportType` SQL'e **string birleştirme** ile giriyor (`... ""TransportType""='" + model.TransportType + "'`) — enjeksiyon riski (kopyalarken parametreleştirilmeli).

---

## 3. ProductionExpenses (`/ProductionExpenses/IndexExpenses`)

### 3.1 Route'lar — `Controllers/ProductionExpensesController.cs` (3150 satır)

Sınıf (`:20-21`): `[Authorize]`, `[UserRoleAuthorize("Admin","Üretim Müdürü","Patron","Muhasebe (Alış)","Finans(normal)","Finans(super)","Lojistik")]`. Ctor: `IDateTimeProvider`.

| Satır | Action | HTTP | Not |
|---|---|---|---|
| 31 | `Index(int branchId=0, int workPlaceId=0)` | GET | Grafikli özet (12 ay, ExpensesType/Category kırılımı) |
| 654 | `Add()` | GET | `:433`'teki `[UserRoleAuthorize("Admin","Üretim Müdürü","Patron","Muhasebe (Alış)","Lojistik")]` ile bu action arasında yalnız yorum satırına alınmış eski kod var; öznitelik bu `Add()` GET'ine bağlanır → **Finans rolleri masraf ekleme formunu açamaz** |
| 935 | `GetExpenseTypes()` | GET | JSON |
| 977 | `GetExpenseItemsByType(int expenseTypeID)` | GET | JSON |
| 1019 | `Add(ProductionExpenses, IFormFile DocumentFile)` | POST | |
| 1358 | `Edit(int id)` | GET | |
| 1674 | `Edit(...)` | POST | `[ValidateAntiForgeryToken]`, async |
| 2064 | `GetExpenseDetails(int id)` | GET | JSON (detay satırları) |
| 2254 | `Delete(int id)` | **GET** | Silme GET ile |
| 2391 | `IndexExpenses(int branchId=0, int workPlaceId=0)` | GET | Masraf kalemi bazlı gruplar + para birimi özetleri |
| 2900 | `ExpenseGroupDetails(int id, int branchId=0, int workPlaceId=0)` | GET | `id` = ExpenseItemID |

Private: `UpdateAccountDebts(ProductionExpenses, NpgsqlConnection, decimal grandTotal)` (`:2151`).
İç sınıflar: `ProductionExpensesGroupedViewModel` (362), `StackedChartGroup`, `StackedMonthData`, `ExpenseGroupKey`, `ProductionExpensesDTO` (406), `ProductionExpensesGroup` (2856), `CurrencyAmount` (2873 — **`Services.CurrencyAmount` ile ad çakışması**), `ProductionExpensesSummaryByCurrency`, `ProductionExpensesSummaryWithCurrencies`, `ProductionExpensesSummary` (3142).

### 3.2 View / modal
| View | Satır | Layout | Modal id | CDN |
|---|---|---|---|---|
| IndexExpenses.cshtml | 1892 | `_ExpertLayout` (+ role göre) | `deleteConfirmModal` | jquery-3.6.0, animate.css 4.1.1 |
| Index.cshtml | 1457 | `_ExpertLayout` | `deleteConfirmModal`, `reportModal` | `cdn.jsdelivr.net/npm/chart.js`, `flatpickr` (js + css) |
| Add.cshtml | 1430 | `_ExpertLayout` | — | — |
| Edit.cshtml | 1408 | `_ExpertLayout` | — | — |
| ExpenseGroupDetails.cshtml | 1063 | `_ExpertLayout` | `deleteConfirmationModal`, `invoiceDetailsModal` | jquery-3.6.0 |

Partial'lar (Index, IndexExpenses): `_CustomerSideMenus/_SideMenu_{Finance,Patron,LogisticsPerson,ProductionManager,AccountingPurchases,Default}` ve `_CustomerAccountNavMenus/_NavMenu_{...}`.

### 3.3 AJAX uçları
| View | Çağrı | Hedef |
|---|---|---|
| ExpenseGroupDetails | `/productionexpenses/GetExpenseDetails` | kendi |
| ExpenseGroupDetails | `/MaterialStockAll/GetFile` | **başka: MaterialStockAll** (doküman indirme) |
| Edit | `Url.Action("GetFile","MaterialStockAll", new { filePath = Model.DocumentPath })` | **başka: MaterialStockAll** |
| Add / Edit | form `action="/productionexpenses/add|edit"` | kendi |
| IndexExpenses | link `/productionexpenses/ExpenseGroupDetails/{ExpenseItemID}`, `/productionexpenses/add` | kendi |
| ExpenseGroupDetails | `href="/productionexpenses/delete/{id}"` | kendi (GET ile silme) |

`Add.cshtml`'de `fetch/$.ajax` yok: masraf türü/kalemi listeleri sunucu tarafında `ViewBag.ExpenseTypesList` / kalem listesi olarak gömülür (`:706`, `:725`). `GetExpenseTypes` / `GetExpenseItemsByType` çağıranı view'larda `⚠ BULUNAMADI`.

### 3.4 Model
- `ProductionExpenses` — `Models/ZT/ProductionExpenses.cs`
- `ProductionExpensesDetail` — `Models/ZT/ProductionExpensesDetail.cs`
- `ExpenseTypes`, `ExpenseItems` — `Models/ZT/`

### 3.5 SQL nesneleri
| Tablo | Okuma | Yazma |
|---|---|---|
| `ZT_ProductionExpenses` | evet (12 yer) | INSERT 1143; UPDATE 1903, 2299 (Status=false) |
| `ZT_ProductionExpensesDetail` | 1458, 2097 | INSERT 1197, 1990; DELETE 1979 (edit'te sil-yeniden yaz); UPDATE 2309 (Status=false) |
| `ZT_AccountDebts` | 14 yer | INSERT 1286, 2216; UPDATE 1256, 2185; DELETE 2320 |
| `ZT_CustomerAccounts` | 1235, 1423, 2159, 2644 | — |
| `ZT_ExpenseTypes`, `ZT_ExpenseItems` | evet | — |
| `Currency` | evet | — |
| `ZT_Orders`, `Customer` | 263, 532, 816, 1619 | — |
| `Line` | 622, 882, 1645 | — |
| `ZT_MaterialLosses`, `ZT_MaterialPurchases`, `ContainerType` | 844-847, 572 | — |
| `ZT_WorkPlace`, `ZT_BranchProvince` | evet | — |
| `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_LogisticsPerson`, `ZT_Boss`, `ZT_ProductionManager` | evet (kapsam) | — |
| `ZT_ProductionPlanning` | 2841 (layout chat) | — |
| `Customers` (admin DB) | 1076, 1755, 1820 (QrKey) | — |

Kolonlar:
- `ZT_ProductionExpenses` (`:1143-1149`): `TotalAmount, Quantity, Category, Unit, Description, Status, CreationDate, Department, ExpensesType, BatchNumber, OrdersID, ExpenseFloors, UnitAmount, LineID, MaterialLossesID, ExpenseTypeID, ExpenseItemID, DocumentPath, InvoiceNumber, InvoiceDate, DueDate, KdvRate, TaxAmount, NetAmount, Discount, InvoiceAmount, CurrencyID, WorkPlaceID, DiscountRate, DiscountAmount, WithholdingTaxAmount, OtherTaxesAmount`.
- `ZT_ProductionExpensesDetail` (`:1197-1201`): `ProductionExpensesID, Description, Quantity, Unit, UnitAmount, SubTotal, DiscountRate, DiscountAmount, NetAmount, KdvRate, TaxAmount, WithholdingTaxAmount, OtherTaxesAmount, TotalAmount, CreationDate, Status`.
- `ZT_AccountDebts` (`:1286-1290`): `CustomerAccountID, TransactionDate, Amount, CurrencyID, ExchangeRate, AccountingType, ReferenceID, CreationDate, CreatedBy, WorkPlaceID, Description, DocumentNo, DocumentType`.

Çalışma zamanı DDL: yok. CREATE TABLE dosyası `⚠ BULUNAMADI` (bu kapsamda aranmadı; kolonlar INSERT'ten).

### 3.6 Finans bağlantısı
- Her **masraf kalemi (`ZT_ExpenseItems`) = bir cari hesap**: `ExpenseItemsController.Add` kalemle birlikte `ZT_CustomerAccounts`'a `AccountGroup='Masraf Hesabı'`, `AccountCode='MSR-{ID}'`, `ReferenceID = ExpenseItem.ID` kaydı açar (`ExpenseItemsController.cs:243-275`).
- Masraf kaydı: `ZT_ProductionExpenses` (başlık) + `ZT_ProductionExpensesDetail` (satırlar) → **`ZT_AccountDebts`** upsert: `AccountingType='Masraf Hesabı'`, `ReferenceID = ProductionExpenses.ID`, `CustomerAccountID` = kalemin carisi, `Amount = Σ detail.TotalAmount`, `ExchangeRate` **sabit 1.0000** (`:1273`, `:1302`, `:2206`, `:2232`), `TransactionDate = şimdi` (fatura tarihi değil, `:1270`, `:1299`).
- Cari bulunamazsa `customerAccountId = 0` ile borç yine yazılır (`:1228-1243` — kontrol yok).
- **Transaction yok** (`BeginTransaction` bu dosyada geçmiyor): başlık, detaylar ve cari borç ayrı komutlar.
- Silme (`:2254-2330`): başlık + detay soft delete (`Status=false`), `ZT_AccountDebts` **hard DELETE**.
- İş yeri/şube filtresi `ZT_ProductionExpenses.WorkPlaceID` üzerinden değil, **`ZT_AccountDebts.WorkPlaceID`** JOIN'i üzerinden (`:2560-2562`, `:2640-2646`, `:2660-2672`).
- Banka/kasa/ödeme planına doğrudan yazma yok.

### 3.7 Finans dışı bağımlılıklar
- **Sipariş**: `ZT_Orders` (`OrdersID`; `Name` = parti no, `CommercialProductType`), `Customer` (`:816-818`).
- **Üretim hattı**: `Line` (`LineID`, `:882`).
- **Malzeme firesi**: `ZT_MaterialLosses` (`MaterialLossesID`), `ContainerType`, `ZT_MaterialPurchases` (son birim fiyat; `:844-852`) — masrafa bağlanmamış fire kayıtları seçtirilir.
- Serbest metin alanlar: `Department` (Üretim, Bakım, Kalite Kontrol, Depo, İdari İşler, Planlama, BT, Satış, Muhasebe, Sevk, İK, Ar-Ge, Mal Kabul, Dış Kantar, Diğer — `Views/ProductionExpenses/Add.cshtml:508-522`), `ExpensesType`, `Category`, `BatchNumber`, `ExpenseFloors`.
- Belge türü seçenekleri: Alış Faturası, Kasa Fişi, Serbest Meslek Makbuzu, Yurt Dışı Fatura (`Add.cshtml:849-852`).

### 3.8 İş kuralları
- İş yeri zorunlu (`:1031-1035`); en az bir detay satırı zorunlu (`:1043-1047`).
- Doküman ≤ 10 MB, uzantılar `.pdf .jpg .jpeg .png .doc .docx .xls .xlsx` (`:1052-1064`); hedef `\\{DocumentServer}\{QrKey}\ProductionExpenses\`.
- Toplamlar detaylardan hesaplanır (`:1128-1134`).
- Kayıt sonrası yönlendirme role göre: `Muhasebe (Alış)`/`Finans` → `ExpenseGroupDetails`, diğer → `IndexExpenses` (`:1340-1344`).
- Kullanıcı kapsam önceliği: FinancePerson → AccountingPurchases → LogisticsPerson → Boss → ProductionManager (`:2416` yorum).

---

## 4. ExpenseTypes / ExpenseItems + diğer masraf controller'ları

### 4.1 `ExpenseTypesController` (501 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]`
| Satır | Action | HTTP |
|---|---|---|
| 23 | `Index()` | GET |
| 66 / 74 | `Add()` / `Add(ExpenseTypes)` | GET / POST |
| 160 | `SearchExpenseTypes(string term)` | GET (JSON) |
| 197 | `CheckExpenseTypeExists(string name)` | POST (JSON) |
| 239 | `CheckExpenseTypeExistsForEdit(string name, int id)` | POST |
| 279 | `Edit(string id)` | (GET) |
| 324 | `Update(ExpenseTypes)` | POST |
| 418 | `Delete(int id)` | GET — aslında **Status aç/kapa** (`:436-450`) |

Tablo: `ZT_ExpenseTypes` — `Name, Description, Key, Status, CreationDate` (`:98-99`). Model: `Models/ZT/ExpenseTypes.cs` (`ID, Name, Description, Status, CreationDate, Key`).
View'lar: `Views/ExpenseTypes/{Index,Add,Edit}.cshtml`; modal yok; CDN jquery-3.6.0; AJAX: `/ExpenseTypes/SearchExpenseTypes`, `CheckExpenseTypeExists`, `CheckExpenseTypeExistsForEdit`.

### 4.2 `ExpenseItemsController` (656 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]`
| Satır | Action | HTTP |
|---|---|---|
| 23 | `Index()` | GET |
| 83 / 197 | `Add()` / `Add(ExpenseItems)` | GET / POST |
| 116 | `SearchExpenseItems(string term)` | GET |
| 153 | `CheckExpenseItemExists(string name)` | POST |
| 355 | `Edit(string id)` | (GET) |
| 410 | `CheckExpenseItemExistsForEdit(string name, int id)` | POST |
| 451 | `Update(ExpenseItems)` | POST |
| 549 | `Delete(int id)` | GET — Status aç/kapa + cari Status eşitleme (`:570-596`) |

Tablolar: `ZT_ExpenseItems` — `ExpenseTypeID, Name, Description, DefaultUnit, Key, Status, CreationDate` (`:226-228`); `ZT_ExpenseTypes` (okuma); **`ZT_CustomerAccounts` INSERT** (`:260-272`: `AccountCode, AccountName, AccountGroup, TaxNumber, TaxOffice, CompanyType, Phone, Email, Website, Address, City, District, Country, PostalCode, CurrencyID, CreditLimit, RiskLimit, ContactPerson, ContactTitle, ContactMobile, ReferenceID, Status, PaymentTerms, Notes, CreationDate, CreatedBy`) ve UPDATE (`:591`).
Model: `Models/ZT/ExpenseItems.cs` (`ID, ExpenseTypeID, Name, Description, DefaultUnit, Status, CreationDate, Key`).
View'lar: `Views/ExpenseItems/{Index,Add,Edit}.cshtml`; modal yok; AJAX: `/ExpenseItems/SearchExpenseItems`, `CheckExpenseItemExists`, `CheckExpenseItemExistsForEdit`.

`ZT_ExpenseTypes` / `ZT_ExpenseItems`'e referans veren diğer dosyalar: `CustomerAccountsController`, `CustomerController`, `PersonnelReportsController`, `PersonnelSalaryController`, `RecipeFinanceController`, `RecipeSalesController`, `SalesProductLogisticController`, `Services/DefinitionAuditRegistry.cs`, `Docs/ReceteliUretim/2026_Faz38_SevkNakliye.sql`, `SQL_Migrations/2026_08_26_Introduction_Audit_Tenant.sql`, `..._09_04_Introduction_Audit_CreatedBy_Repair.sql`.

### 4.3 Diğer masraf controller'ları — ortak tablo mu?

**Yanıt: HAYIR. `ZT_ExpenseTypes` / `ZT_ExpenseItems`'i yalnız `ProductionExpenses` kullanır.** Diğer dört masraf controller'ının her biri kendi tablosuna (ya da kaynak belgenin kolonlarına) yazar; ortak nokta hepsinin sonunda `ZT_AccountDebts`'e cari borç yazmasıdır.

| Controller | Yetki | Masraf tablosu | Bağlam referansı | Cari grubu / `AccountingType` | ExpenseType/Item? |
|---|---|---|---|---|---|
| `ProductionExpensesController` | Authorize + 7 rol | `ZT_ProductionExpenses` + `ZT_ProductionExpensesDetail` | `OrdersID`, `LineID`, `MaterialLossesID`, `BatchNumber`, `WorkPlaceID` | `'Masraf Hesabı'` | **Evet** |
| `SalesTruckExpensesController` | yalnız `Index`'te Authorize | yok — `ZT_SalesTruck` kolonları | `ZT_SalesTruck.ID` | `'Sevk Nakliye Firması'` (+ `TransportType`) | Hayır |
| `OrderExpensesController` (615) | Authorize + `Satış Personeli, Admin, Üretim Müdürü, Finans(normal), Finans(super)` | `ZT_OrderExpenses` (`Amount, Status, CreationDate, Type, OrdersID, DocumentNumber, Description, DateOfPayment` — `:310-311`) | `OrdersID` → `ZT_Orders`, `ZT_OrderHeader` | cari `AccountGroup='Müşteri'`; `accountingType="Müşteri"`; borç INSERT'inde `DueDate, PaymentMethod, CashID, BankID` kolonları da var (`:364-375`); `WorkPlaceID` kolon-güvenli (`HasColumn :23`) | Hayır (`Type` serbest metin) |
| `HarvestManagerExpensesController` (904) | **sınıfta `[Authorize]` YOK** (`:9`) | yok — `ZT_UsedHarvestManager` kolonları (`HarvestManagerPricing, WorkerCount, ServiceCount, ServicePrice, CurrencyID` — `:676`) | `ExpertReportTruckID`, `ExpertReportID`, `HarvestManagerID` | `'Kesim Çavuşu'` | Hayır |
| `ProductionSergeantsExpensesController` (1775) | **sınıfta `[Authorize]` YOK** (`:13`); POST'larda `[ValidateAntiForgeryToken]` | `ZT_ProductionSergeantsExpenses` (`ProductionSergeantID, WorkPlaceID, WorkDescription, FemaleWorkerCount, MaleWorkerCount, OvertimeHours, BranchProvinceID, WorkerCount, ShiftWorkerCount, UnitPrice, TotalPricing, Status, …` — `:768`) + `ZT_ProductionSergeantExpenseBatches` (`ProductionSergeantExpenseID, ProductionSergeantID, ProductionNumber, ProductionPlanningID, CustomerID, ProductionWorkPlaceID, ExpenseWorkPlaceID, WorkerCount, ProducedPalletCount, AllocatedAmount, CurrencyID, LastProductionDate, Status, CreationDate, CreatedBy` — `:1634`) | `ZT_ProductionSergeants`, `ZT_ProductionPlanning`, `ZT_ProductionConveyor`, `Customer`, `Product`, `SubProduct` | `'Üretim Çavuşu'` | Hayır |
| `ExpertReportTruckExpensesController` (2223) | Authorize; action bazında `Eksper, Admin, Eksper Şefi, Muhasebe (Alış), Finans(normal), Finans(super)` | `ZT_ExpertReportTruckExpenses` (`ExpertReportTruckID, WorkPlaceID, LocationPricingID, LocationPricingName, ServicePricing, TransportLocationPricing, OtherPricing, CurrencyID, Description, Status, CreationDate, InvoiceAmount, KDVAmount, WithholdingTax, TotalAmount, AdvanceAmount, RemainingAmount, DeductionAmount, PaidAmount, BalanceAmount` — `:969-974`) + `ZT_UsedHarvestManager` INSERT (`:2015`) | `ZT_ExpertReportTruck`, `ZT_ExpertReport`, `Supplier`, `TransportTruck`, `TransportCompany`, `ZT_LocationPricing`, `ZT_HarvestManager`, `ZT_HarvestAndProductionWorkersPricing` | `'Nakliye Firması'` ve `'Kesim Çavuşu'` (ayrıca `'Tedarikçi'` cari okuma) | Hayır |

Action listeleri (kısa):
- **OrderExpenses**: `Index(int id)` GET :46; `Add(string id)` GET :148; `Add(OrderExpenses)` POST :201; `Delete(int id, string orderid)` GET :453. View'lar: `Views/OrderExpenses/{Index,Add}.cshtml`.
- **HarvestManagerExpenses**: `Index(branchId, workPlaceId)` GET :18; `Details(id, branchId, workPlaceId)` GET :269; `GetHarvestManagerData(int id)` GET :577; `HarvestManagerPricingAdd([FromBody] UsedHarvestManager, int id, int workPlaceID)` POST :662. View'lar: `{Index,Details}.cshtml`.
- **ProductionSergeantsExpenses**: `Index` :22; `ProductionDetails(id,…)` :226; `Add(int? productionSergeantId)` GET :619; `Add(model, returnProductionSergeantId)` POST :736; `Edit(int id)` GET :1063; `Edit(model)` POST :1180; `Delete(int id)` GET :1421; `GetRecentProducedBatches(workPlaceId, take, search)` GET :1673; `GetExpenseBatches(int expenseId)` GET :1737. View'lar: `{Index,Add,Edit,ProductionDetails}.cshtml`.
- **ExpertReportTruckExpenses**: `Index(string id, string eid)` :28; `ExpenseSummaryByTransportCompany(days, branchId)` :395; `CompanyExpenseDetails(transportCompanyId, companyName, days)` :658; `GetTransportCompanyByPlate(string plate)` GET :909; `Add([FromBody])` POST :948; `Update([FromBody])` POST :1214; `HarvestManagerPricingAdd` POST :1446; `Delete(int id, int eid)` GET :1693; `GetHarvestManagerData(string id)` GET :1840; `HarvestManagerAdd` POST :1985; `HarvestManagerDelete([FromQuery] int id)` POST :2131; `GetExpertReportLocation(int expertReportId)` GET :2187. View'lar: `{Index,ExpenseSummaryByTransportCompany,CompanyExpenseDetails}.cshtml`.

Bu dört controller'ın modal id'leri ve AJAX haritası ayrıntılı çıkarılmadı (görev "kısa özet" istedi) — `⚠ ayrıntı çıkarılmadı`.

---

## 5. TCMB kur altyapısı

### 5.1 `Services/ITCMBExchangeRateService.cs` (339 satır — arayüz + implementasyon + DTO'lar tek dosyada)

- Arayüz `ITCMBExchangeRateService` (`:15-20`): `GetExchangeRatesAsync()` → `Dictionary<string, ExchangeRate>`; `ConvertToTRYAsync(decimal amount, string currencySymbol)`; `GetExchangeRateSummaryAsync(List<CurrencyAmount>)`.
- DTO'lar: `ExchangeRate` (22), `CurrencyAmount` (35), `ExchangeRateSummary` (42), `CurrencyBreakdown` (50).
- Implementasyon `TCMBExchangeRateService` (`:60`): `IHttpClientFactory`, `IMemoryCache`, `ILogger`. Kaynak `https://www.tcmb.gov.tr/kurlar/today.xml` (`:66`), timeout 10 sn (`:137`).
- Önbellek: `IMemoryCache` anahtar `"TCMB_ExchangeRates"`, mutlak 1 saat + kayan 30 dk (`:~190`). **Tek-uçuş yok, negatif önbellek yok**; hata durumunda `GetFallbackRates()` sabit kurları döner ve **önbelleğe alınmaz** (USD 35.50, EUR 38.50, GBP 44.00, RUB 0.35, JPY 0.23, CHF 39.00, AED 9.67, SAR 9.47 — `:~325-338`) → TCMB erişilemezse sessizce eski sabit kurlarla hesap yapılır.
- Dönüşüm: `ForexSelling` (yoksa `ForexBuying`) `/ Unit` (`:~240`). Sembol↔kod eşlemesi `SymbolToCode` / `CodeToSymbol` sözlükleri (`:69-113`).
- DI kaydı: `Program.cs:104-106` (`AddHttpClient()`, `AddMemoryCache()`, `AddSingleton<ITCMBExchangeRateService, TCMBExchangeRateService>()`).
- Servisi enjekte eden controller'lar: `CustomerAccountsController` (`:23-25`; kullanım `GetExchangeRatesForHeatmap :1306`), `FinancialBalanceSheetController` (`:23-25`, `:173`), `SalesProductLogisticController` (`:22-28`; `GetTcmbRates :5366`).

### 5.2 `GetExchangeRates` adlı action'lar — kaç kopya?

**Tam olarak `GetExchangeRates` adında yalnız 1 action var**: `CustomerAccountsController.GetExchangeRates()` (`Controllers/CustomerAccountsController.cs:1050`). Çağıran view: yalnız `Views/CustomerAccounts/Index.cshtml`.

Ancak **kur çekme mantığının projede 8 ayrı implementasyonu** var:

| # | Yer | Kaynak | Önbellek |
|---|---|---|---|
| 1 | `Services/ITCMBExchangeRateService.cs:125` `GetExchangeRatesAsync` | TCMB today.xml | IMemoryCache 1 sa |
| 2 | `CustomerAccountsController.cs:1050` `GetExchangeRates` + `:1100` `FetchTcmbExchangeRatesAsync` | TCMB today.xml | static, tek-uçuş + negatif önbellek |
| 3 | `CustomerAccountsController.cs:~995` `GetTCMBExchangeRatesAsync(con)` (private) | TCMB today.xml, 15 sn | yok; hata → sabit fallback |
| 4 | `CustomerAccountsController.cs:1306` `GetExchangeRatesForHeatmap` | servis (#1) | servisin |
| 5 | `CurrencyController.cs:492` `GetExchangeRate(string symbol)` + `KurApi.GetKurBilgileri :524` | **üçüncü taraf** `http://hasanadiguzel.com.tr/api/kurgetir` (HTTP, `WebClient`) | yok |
| 6 | `RecipePurchasingController.cs:2917` `GetTcmbRate(symbol)` | TCMB today.xml (`WebClient`) | yok |
| 7 | `RecipeSalesController.cs:2099` `GetTcmbRate(symbol)` | TCMB today.xml | yok |
| 8 | `SalesProductController.cs:5536` `GetExchangeRateFromTCMB(code, date, out success)` (+ `GetRate`, `GetRateForDate` uçları) | TCMB **tarihli** `kurlar/{yyyyMM}/{ddMMyyyy}.xml` + today.xml; `GetFallbackRate :5629` | yok |
| (9) | `SalesProductLogisticController.cs:5366` `GetTcmbRates` | servis (#1) | servisin |

View → uç eşlemesi:
- `/currency/getexchangerate`: `IncomingGoods/{Add,Edit}`, `Purchases/Add`, `RecipeFinance/{FxReport,Index}`, `RecipeGoods/{Add,Edit}`, `RecipeProduction/{Add,Edit,Stocks}`, `RecipePurchasing/{Orders,PriceQuotes}`, `RecipeSales/{Quotes,Shipments}` (14 view). **Dikkat**: `CurrencyController` sınıfı `[UserRoleAuthorize("Admin")]` (`:15`) — Admin olmayan roller bu uca erişemez; `RecipePurchasingController.cs:2913-2915` yorumu bu yüzden ayrı `GetTcmbRate` ucunun eklendiğini söylüyor.
- `/recipepurchasing/gettcmbrate`: `RecipePurchasing/Orders`. `/recipesales/gettcmbrate`: `RecipeSales/{Index,Quotes,Shipments}`.
- `/salesproduct/getrate`: `SalesProduct/{SalesTruckAdd,SalesTruckEdit}`; `/salesproduct/getratefordate`: `OrderHeader/{AccordionIndex,Index}`, `SalesProduct/{DeliveryTracking,TruckTracking}`.
- `/salesproductlogistic/gettcmbrates`: `SalesProductLogistic/Index`.
- `getexchangeratesforheatmap`: `CustomerAccounts/Index`, `Shared/_AllTransactionsPaymentTools`.

**Kapsamımdaki stok/masraf sayfalarının hiçbiri kur ucu çağırmaz**: `MaterialStockAll/Add` kuru elle girilen `ExchangeRate` input'undan alır (`Views/MaterialStockAll/Add.cshtml:581-583`); `ProductionExpenses` ve `SalesTruckExpenses` cari borca `ExchangeRate = 1.0000` sabit yazar.

### 5.3 "Tek-uçuş + negatif önbellek" deseni — `CustomerAccountsController.cs:1035-1097`

- Static alanlar (`:1044-1048`): `_exRatesCache` (List<object>), `_exRatesCacheTime`, `_exRatesFailTime`, `_exRatesInFlight` (Task), `_exRatesLock`.
- Akış (`:1050-1096`): `lock` içinde → (a) önbellek < 30 dk ise dön; (b) uçuş yok ve son hata < 5 dk ise: bayat veri varsa onu, yoksa `success=false` dön (**negatif önbellek**); (c) uçuş yoksa `FetchTcmbExchangeRatesAsync()` başlat (**tek uçuş**), eşzamanlı istekler aynı `Task`'ı bekler. `await` sonrası `lock` içinde önbelleği yaz / hata zamanını işaretle; hata olursa bayat önbellek varsa onu döndür.
- `FetchTcmbExchangeRatesAsync` (`:1100`): `new HttpClient()` timeout 3 sn; XML'den `Kod`, `ForexSelling`, `Unit`, `CurrencyName`; sembol eşlemesi USD/EUR/GBP/RUB.
- Önbellek **süreç-global static** (tüm kiracılar ortak — yorum `:1035`). Gerekçe yorumu `:1036-1043`.
- Bu desen yalnız bu action'da var; servis sınıfında (#1) yok.

### 5.4 `CurrencyController` (538 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]`
| Satır | Action | HTTP |
|---|---|---|
| 25 | `Index()` (async) | GET |
| 70 / 111 | `Add()` / `Add(Currency)` | GET / POST |
| 219 / 293 | `Edit(string id)` / `Edit(Currency)` | GET / POST |
| 404 | `Delete(int id)` | GET (Status aç/kapa) |
| 492 | `GetExchangeRate(string symbol)` | GET (JSON) |

- Tablo `Currency`: `Name, Symbol, Status, CreationDate, ExchangeRate` (`:164`). **`Currency.ExchangeRate` kolonu sayısal kur DEĞİL, TCMB kur adı (`Isim`) metnidir**: `GetExchangeRate` bu metni dış API'nin `Isim` alanıyla eşleştirir (`:508-512`); model alanı `string ExchangeRate` (`Models/Currency.cs:21`).
- Kısıt kontrolü: `GlobalVeriables.restrictionQuery + userRoleID + " where Restriction.Name='Para Birimleri'"` (`:36`).
- Güvenlik notu: INSERT (`:164`) ve `GetExchangeRate` (`:508`) SQL'i **string birleştirme** ile kuruyor (parametresiz).
- View'lar: `Views/Currency/{Index,Add,Edit}.cshtml`; modal yok; CDN jquery-3.6.0.

### 5.5 `ApiController/CurrencyApiController.cs` (251 satır) — `[ApiController]`, `[Route("api/[controller]")]`; `[Authorize]` yok, kimlik `Methods.Authorize(database, token)` ile
| Satır | Route | Action |
|---|---|---|
| 25 | `GET api/CurrencyApi/currency` | `GetCurrencyRestriction(database, token, userrole)` |
| 60 | `GET api/CurrencyApi/index` | `GetCurrencies(database, token)` |
| 105 | `POST api/CurrencyApi/add` | `Add([FromBody] Currency, database, token)` |
| 146 | `POST api/CurrencyApi/update` | `Update(...)` |
| 187 | `POST api/CurrencyApi/delete` | `Delete(int id, database, token)` |

Tablo `Currency` (INSERT `:122`: `Name, Symbol, Status, CreationDate`). Bağlantı: `GlobalVeriables.customerApiDatabase + database`.

### 5.6 `Models/Currency.cs`
`Currency` (`ID, Name, Symbol, Status, CreationDate, ExchangeRate:string`), `ExchangeRateKur` (`Isim, CurrencyName, ForexBuying, ForexSelling` — dış API yanıt şekli).

### 5.7 `PaymentDensityCurrencies`
- Model `Models/ZT/PaymentDensityCurrencies.cs`: `ID, CurrencyID, Little=100000, Middle=1000000, Intensive=5000000, VeryIntense=10000000` (para birimi başına ödeme yoğunluğu eşikleri).
- Tablo `ZT_PaymentDensityCurrencies`; kullanım yalnız `CustomerAccountsController`: okuma `:6672` (`Currency` LEFT JOIN), `SavePaymentDensity(currencyID, little, middle, intensive, veryIntense)` UPDATE `:6711` / INSERT `:6724`. CREATE TABLE ifadesi `⚠ BULUNAMADI`.

### 5.8 `SQL_Migrations/2026_04_25_create_ExchangeBreakSource.sql`
`CREATE TABLE IF NOT EXISTS "ZT_ExchangeBreakSource"`: `ID SERIAL PK, ExchangeBreakId INT NOT NULL, SourceType VARCHAR(20) ('Tahsilat'/'Bozum'), SourceId INT NOT NULL, UsedAmount DECIMAL(18,2)`; FK yok (ilişki uygulama seviyesinde); 2 indeks. Amaç: döviz bozumunda çoklu kaynak. Kullanım yalnız `BankStatementController` (INSERT `:1222`, `:2471`; DELETE `:2461`, `:2708`; okuma `:1904`, `:2566`, `:2628`, `:5601`, `:5840`; DTO `ExchangeBreakSourceItem :6448`).

---

## 6. Şube / İş yeri

### 6.1 `BranchProvinceController` (397 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]`
| Satır | Action | HTTP |
|---|---|---|
| 21 | `Index()` | (GET) |
| 66 / 80 | `Add()` / `Add(BranchProvince)` | GET / POST |
| 170 / 216 | `Edit(int id)` / `Edit(BranchProvince)` | GET / POST |
| 298 | `Delete(int id)` | GET (Status aç/kapa) |

Tablo `ZT_BranchProvince`: `Name, Phone, Address, Email, BranchType, TaxNumber, TaxOffice, Status, CreationDate` (`:107`). `ZT_WorkPlace` okuma (`:70`). Model `Models/ZT/BranchProvince.cs`. View'lar `Views/BranchProvince/{Index,Add,Edit}.cshtml`; modal/AJAX yok.

### 6.2 `WorkPlaceController` (535 satır) — `[Authorize]`, `[UserRoleAuthorize("Admin")]`
| Satır | Action | HTTP |
|---|---|---|
| 23 | `Index()` | GET |
| 96 / 122 | `Add()` / `Add(WorkPlace)` | GET / POST |
| 279 | `Edit(string id)` | (GET) |
| 345 | `Update(WorkPlace)` | (öznitelik görülmedi) |
| 424 | `Delete(int id)` | GET (Status aç/kapa) |

- Tablo `ZT_WorkPlace`: `Name, PhoneNumber, BranchProvinceID, Address, Location, Status, CreationDate` (`:151`). Model `Models/ZT/WorkPlace.cs` (+ `BranchProvinceName`).
- **İş yeri = cari hesap**: `Add` POST iş yerini ekledikten sonra `ZT_CustomerAccounts`'a `AccountGroup='İş Yeri Firması'`, `AccountCode='ISY-{ID}'`, `ReferenceID = WorkPlace.ID`, `CurrencyID=1`, `Country='Türkiye'` kaydı açar (`:165-215`). `Delete` (pasifleştirme) carinin `Status`'unu da eşitler (`:465-472`; `:463` yorumundaki `"ISYERI_"` kodu kullanılmayan artık değişken — gerçek kod `ISY-`).
- Hiyerarşi: **Şube (`ZT_BranchProvince`) 1—N İş Yeri (`ZT_WorkPlace.BranchProvinceID`)**; depo iş yerine bağlı (`ZT_Warehouse.WorkPlaceID`).
- View'lar `Views/WorkPlace/{Index,Add,Edit}.cshtml`; modal/AJAX yok.

### 6.3 "WorkPlaceGroups" deseni (şube gruplu iş yeri seçimi)

`ViewBag.WorkPlaceGroups` kapsamımdaki stok/masraf sayfalarında KULLANILMIYOR; **finans (tahsilat/ödeme/çek/banka/kasa) sayfalarının** desenidir:

| Controller (kurulum) | View (tüketim) |
|---|---|
| `CustomerAccountPaymentController.cs:292-331` (+ rapor VM `:3890`, `:4764`) | `Views/CustomerAccountPayment/Payments.cshtml:330-345` (optgroup'lu tekli select `#filterWorkPlace`), `:478-520` (çoklu seçim listesi `#dprWpList`), `DailyPaymentReport.cshtml`, `Views/Shared/_AddPaymentModal.cshtml:283, 964`, `_EditPaymentModal.cshtml` |
| `CustomerAccountCollectionController.cs:328` (+ `:4461`, `:4897`) | `Collections.cshtml` (JS `dcr*` fonksiyonları `:705-794`), `DailyCollectionReport.cshtml`, `_CollectionModalsPartial.cshtml` |
| `ChecksController.cs:482` (+ `:751`, `:3071`) | `Checks/Checks.cshtml`, `CheckDetailedReport.cshtml` |
| `BankTransactionsController.cs:334`, `CashTransactionsController.cs:272` | ilgili Index view'ları |
| `BankIntroductionController.cs:229` (`BuildFilterGroups :472` — **farklı tip**: `List<StatisticGroupViewModel>{Name, Count}`) | `BankIntroduction/Index.cshtml:35, 1102`; `CashIntroduction/Index.cshtml:89, 1270` (view içinde LINQ ile kurulur) |

Kurulum (referans: `CustomerAccountPaymentController.cs:292-331`):
1. SQL: `SELECT wp.ID, wp.Name, COALESCE(bp.Name,'Diğer') FROM ZT_WorkPlace wp LEFT JOIN ZT_BranchProvince bp ON bp.ID = wp.BranchProvinceID WHERE wp.Status = true ORDER BY bp.Name, wp.Name` (tüm aktif iş yerleri — kullanıcı kapsamına göre daraltma bu sorguda YOK).
2. `SortedDictionary<string, List<SelectListItem>>` — anahtar şube adı, değer iş yeri listesi → `ViewBag.WorkPlaceGroups`; düz liste `ViewBag.WorkPlaces`.
3. View: (a) `<optgroup label="@group.Key">` ile tekli filtre; (b) çoklu seçim UX'i — her şube `.dpr-branch[data-branch-name]`, başlıkta `.dpr-branch-check` (şubenin tümünü seç), gövdede `.dpr-wp-check` kutuları, arama kutusu `#dprWpSearch`, "Tümünü seç" `#dprWpToggleAll`, aç/kapa `dprToggleBranch(this)`.
4. JS **view içinde inline** (ayrı wwwroot dosyası yok): `dprSyncToggleAllLabel`, `dprSyncBranch`, `dprSyncAll`, `dprLockScroll`, `dprCleanupBackdrop` (`Payments.cshtml:1964-2060`); seçim `&workPlaceIds=1,2,3` olarak rapor URL'sine eklenir (`:2056-2060`) → `DailyPaymentReport(...)` (`CustomerAccountPaymentController.cs:3221`). Boş seçim = tüm iş yerleri (`Payments.cshtml:467` yorumu). Tahsilat tarafında aynı kod `dcr` önekiyle kopyalanmış.
5. Ayrıca `Views/CustomerAccounts/Index.cshtml:3885+`'da üçüncü bir varyant: `.wp-multiselect-container/btn/dropdown/actions` CSS sınıflı dropdown.

Kapsamımdaki sayfalarda şube→iş yeri seçimi daha basit: şube select'i + iş yeri select'i; `MaterialStockAll/Add` şube değişince `fetch('/MaterialStockAll/GetWorkPlacesByBranchProvince')` ile iş yerlerini yeniler; listelerde `location.href='/MaterialStockAll/Index?id=..&branchId=..'` ile sayfa yeniden yüklenir.

### 6.4 Kullanıcının yetkili iş yerleri nasıl belirleniyor
- Merkezi bir "kullanıcı—iş yeri yetki" tablosu / servisi **yok** (`⚠ BULUNAMADI`). Her controller kendi içinde çözer.
- Mekanizma: oturumdaki `customerUserKey`, kullanıcının **rolüne karşılık gelen personel tablosunda** `"Key"` kolonuyla aranır; o satırdaki **tek** `WorkPlaceID` ve `BranchProvinceID` kullanıcının kapsamıdır. Rol tabloları: `ZT_AcceptanceOfGoods` (Mal Kabul), `ZT_AccountingPurchases` (Muhasebe Alış), `ZT_FinancePerson` (Finans), `ZT_Boss` (Patron), `ZT_ProductionManager` (Üretim Müdürü), `ZT_LogisticsPerson` (Lojistik), `ZT_SalesPerson` (Satış), `ZT_Expert`, `ZT_ExpertChef`.
  - Örnekler: `MaterialStockAllController.cs:86-200` (rol if-zinciri), `:1140-1165` (`GetUserRoleScope`), `:4818` (`GetLossUserScope`); `MaterialStockProductionController.cs:119` (`GetPmScopeWorkPlaces` — bir `HashSet<int>` iş yeri kümesi döndüren tek yer; şube verilmişse şubenin iş yerleri + şubesiz iş yerleri); `ProductionExpensesController.cs:2416+`; `SalesTruckExpensesController.cs:26-106`.
- Kural: kullanıcının iş yeri/şubesi doluysa filtre **zorlanır**, boşsa (0) URL parametresi geçerli olur ve kullanıcı tüm iş yerlerini görür (Admin için kayıt bulunmaz → filtresiz).
- Bazı sorgular `userkey`'i SQL'e string birleştirme ile koyar (`MaterialStockAllController.cs:89`).

---

## 7. AmountType / TransactionType

### 7.1 `AmountTypeController` (339 satır)
- `[Authorize]`, `[UserRoleAuthorize("Admin","Patron","Üretim Müdürü","Kalite Kontrol","Satış Personeli","Lojistik","Muhasebe (Alış)","Finans(normal)","Finans(super)","Satınalma","Mal Kabul","Sevkiyat","Operatör")]` (`:11-12`).
- Action'lar: `Index()` GET :22; `Add()` GET :61; `Add(AmountType)` POST :67; `Edit(string id)` :142; `Update(AmountType)` :182; `Delete(int id)` GET :253.
- Tablo `AmountType` (ZT_ öneksiz): `Name, Status, CreationDate` (`:87` — string birleştirme ile INSERT). Model `Models/AmountType.cs`.
- View'lar `Views/AmountType/{Index,Add,Edit}.cshtml` (`_ExpertLayout`, partial `_DefinitionNav`).
- **Finans sayfaları buna bağlı DEĞİL.** `AmountType` tablosunu kullananlar: `Recipe`, `RecipeProduction`, `RecipeOperator`, `RecipeQr`, `RecipeSales`, `ProductionConveyor`, `ProductionPlanning`, `Purchases`, `AccountingPurchases`, `ExpertReport`, `Pesticides`, `Qr`, `QualityAndAnalys`, `ReadyStock`, `Report`, `SalesProduct`, `SalesProductLogistic`, `SpecialReport`, `WarehouseSituation`, `Weighbridge`, `WeighingEmptyFull` + API controller'ları + `Services/Drencher`, `IncomingMaterials`, `QualityControlReport`. **`MaterialStockAllController`, `ProductionExpensesController`, `SalesTruckExpensesController` içinde `AmountType` geçmiyor** — malzeme stoğunda birim `ZT_MaterialPurchases.QuantityType` (metin: Adet/Kg) ve `ContainerType.UnitName` (metin: Adet, Kg, Litre, Metre, Paket, Koli, Rulo, Ton — `Views/ContainerType/Add.cshtml:210-212`); masrafta `ZT_ProductionExpensesDetail.Unit` / `ZT_ExpenseItems.DefaultUnit` (metin).

### 7.2 `TransactionTypeController` (228 satır)
- `[Authorize]`, `[UserRoleAuthorize("Admin")]`.
- Action'lar: `Index()` GET :21; `Add()` GET :68; `Add(TransactionType)` POST :74; `Edit(string id)` :110; `Update(TransactionType)` :150; `Delete(int id)` GET :181.
- Tablo `TransactionType`: `Name, Status, CreationDate` (`:95`). Model `Models/TransactionType.cs`. Kısıt adı `'Silo İşlemleri'` (`:39`).
- View'lar `Views/TransactionType/{Index,Add,Edit}.cshtml`.
- **Finans sayfaları buna BAĞLI**: `"TransactionType"` SQL'de geçen dosyalar — `BankStatementController` (48), `BankTransactionsController` (20), `CustomerAccountCollectionController` (18), `CustomerAccountPaymentController` (16), `BankIntroductionController` (12), `CreditContractsController` (7), `CustomerAccountsController` (4), `FinancialBalanceSheetController` (4), `AccountTransactionController` (2), `ChecksController` (1), `PaymentApprovalController` (1), `SiloOrderController` (2), `ApiController/TransactionApiController` (2). Not: bu sayım tablo adı ile aynı adlı **kolon** kullanımını ayırmaz (ör. banka hareketlerinde `"TransactionType"` kolonu) — tablo mu kolon mu olduğu finans envanterinde doğrulanmalı `⚠`.

---

## Özel soru (a) — MaterialStockAll gerçekte ne stoğu tutuyor?

### Ne tutuyor
`ZT_MaterialStockAll` **`ContainerType` kartlarının** stoğunu tutar. `ContainerType.Type` seçenekleri (`Views/ContainerType/Add.cshtml:173-183`): **Gıda Hammaddesi, Ambalaj, Sarf Malzemeler, Palet, Kasa, Ek Malzeme, Bahçe Malzemesi, Casus, Kimyasal, Diğer**. Yani asıl olarak **ambalaj / kasa / palet / sarf malzeme** deposudur; reçeteli üretim senaryosunda **gıda hammaddesi** de aynı tabloya girer (`SQL/2026_10_23_HammaddeSayimSeed.sql`). Yaş meyve-sebze hammaddesi (bahçeden gelen ürün) BURADA DEĞİL (o akış `Purchases` / `ZT_Warehouse` / `WarehouseSituation` tarafında; bu envanterin kapsamı dışı). Zirai ilaç için ayrı `PesticideStockAllController` var (modelde `PesticidesID` izleri).

### Yapı
- **Özet (bakiye) tablosu**: `ZT_MaterialStockAll` — hareket defteri değil, **sayaç tablosu**: `RemainingAmount` (kalan), `UsedAmount` (üretimde kullanılan), `SalesAmount` (satılan), `LossesAmount` (kayıp). Anahtar (uygulama seviyesinde; DB kısıtı `⚠ BULUNAMADI`): `(ContainerTypeID, WorkPlaceID, BranchProvinceID)`.
- **Lot / fatura kırılımı**: `ZT_MaterialPurchases` — her alış satırı bir lot: `BatchNumber` ("fatura seri no"), `AmountReceived` (değişmez), `RemainingAmount` (kalan, FIFO düşülür), `WarehouseID`, `WarehouseLocationID`, `UnitPrice`…
- **Giriş hareketleri**: alış faturası (`ZT_MaterialInvoice` + `ZT_MaterialPurchases`; `DocumentType` metni — Alış Faturası / Satış İade Faturası vb., `:1483`); PO teslim alma (`ZT_PoGoodsReceipt`, `StockPosted`); sayım düzeltmesi (`ZT_MaterialStockCount`, RecipeGoods); kayıp geri alma.
- **Çıkış hareketleri**: üretim tüketimi (`ProductionConveyor`/`ReadyStock`/`RecipeProduction`; defter `ZT_MaterialConsumption`), malzeme satış faturası (`ZT_MaterialSalesInvoice` + `ZT_MaterialSalesItems`), kayıp/fire (`ZT_MaterialLosses` + `ZT_MaterialLossDetail`), sevk (SalesProduct).
- **Hareket tipi kolonu yok**: tip, hangi tabloya yazıldığıyla belirlenir; tek bir "stok hareketleri" tablosu `⚠ BULUNAMADI`.
- **Fatura bağı**: zorunlu — stok girişi fatura üzerinden; cari borç otomatik (`ZT_AccountDebts`).
- **Sayım**: `ZT_MaterialStockCount` (OldTotal/NewTotal/Delta, depo + konum, kullanıcı) — yalnız reçeteli akışta (`RecipeGoodsController.StockCount`); MaterialStockAll ekranında sayım action'ı yok.
- **Lot**: `ZT_MaterialPurchases.BatchNumber` + `ContainerType.LotNumber` + `ZT_LotCategory` ağacı. Seri no ve SKT yok (aşağıda).
- **Depo / iş yeri kırılımı**: bakiye **iş yeri + şube** kırılımında; depo (`WarehouseID`) ve raf konumu (`WarehouseLocationID` → `ZT_WarehouseLocation` Blok/Kat/Sıra) yalnız lot satırında — **bakiye tablosunda depo kırılımı yok**.
- **Birim**: `AmountType` FK'sı YOK. `ZT_MaterialPurchases.QuantityType` (metin 'Adet'/'Kg'), `ContainerType.UnitName` (metin), `ContainerType.Tare` (gram; Adet↔Kg dönüşümü `:31-54`). C# modelinde `RemainingAmount/UsedAmount/SalesAmount/LossesAmount` **int**, `AmountReceived` **int** (`Models/ZT/MaterialStockAll.cs:11-16`, `MaterialPurchases.cs:12`); DB kolon tipleri `⚠ BULUNAMADI` (yalnız `ZT_MaterialPurchases.RemainingAmount numeric` migration'da görüldü).

### (i) Nakliye firması yakıt / yedek parça / lastik sarf deposu için

| İhtiyaç | Durum | Mevcut tablo / alan | Eksik |
|---|---|---|---|
| Malzeme kartı (ad, tür, kod, birim, min/max) | **Mevcut** | `ContainerType`: `Name, Type ('Sarf Malzemeler','Kimyasal','Diğer'…), MaterialCode, UnitName, MinStockCount, MaxStockCount, MinStockLevel, ImagePath, Status` | Tür listesi view'da sabit kodlu; "Yakıt / Yedek Parça / Lastik" seçenekleri yok. Tablo adı ("ContainerType") ve `Tare`, `Color` alanları alana yabancı |
| Tedarikçi + alış faturası + cari borç | **Mevcut** | `ZT_IndustrialSupplier`, `ZT_MaterialInvoice`, `ZT_MaterialPurchases`, `ZT_AccountDebts ('Malzeme Tedarikçisi')`, dövizli (`InvoiceCurrencyID`, `ExchangeRate`), KDV/iskonto/tevkifat | — |
| İş yeri / şube bazlı bakiye | **Mevcut** | `ZT_MaterialStockAll (WorkPlaceID, BranchProvinceID, RemainingAmount…)` | Depo bazlı bakiye yok |
| Depo ve raf konumu | **Kısmen** | `ZT_Warehouse (Name, WarehouseTypeStock, Capacity, CapacityUnit, WorkPlaceID, IsColdStorage, UseLocations)`, `ZT_WarehouseLocation (BlockNo, FloorNo, RowCode)`, `ZT_MaterialPurchases.WarehouseID/WarehouseLocationID` | Konum yalnız reçeteli sayfalarda kullanılıyor |
| Lot / parti, FIFO maliyet izleme | **Mevcut** | `ZT_MaterialPurchases.BatchNumber, RemainingAmount, UnitPrice` | — |
| Kritik stok uyarısı | **Mevcut** | `CriticalStocksJson`, `_CriticalStockModal` | — |
| Kayıp / fire + geri alma | **Mevcut** | `ZT_MaterialLosses`, `ZT_MaterialLossDetail` | — |
| Sayım | **Kısmen** | `ZT_MaterialStockCount` | Yalnız RecipeGoods akışında |
| **Araca / iş emrine sarf çıkışı** | **EKSİK** | Çıkış yalnız üretim paletine: `ZT_MaterialConsumption.ProductionConveyorID` | Araç (plaka/`VehicleID`), sürücü, iş emri/bakım emri, sefer referanslı tüketim tablosu; km/sayaç; masraf merkezi |
| Yakıt (litre, ondalık miktar) | **RİSK / EKSİK** | — | Modelde miktarlar `int`; ondalık litre için tip uyumu doğrulanmalı. Yakıt fişi / istasyon / depo dolum-tüketim hareketi yok |
| Lastik / parça seri no takibi | **EKSİK** | — | Seri no, takılı olduğu araç/pozisyon, söküm-takım geçmişi, diş derinliği vb. |
| Depolar arası transfer belgesi | **EKSİK** | Yalnız fatura düzenlemede "stok çifti" değiştirme (`:2731`) ve `ZT_WarehouseLocationTransfer` (konum transferi) | İş yeri→iş yeri transfer fişi |
| Faturasız giriş/çıkış (irsaliye, devir, iç tüketim fişi) | **EKSİK** | `DocumentType` metni ve `DeliveryInvoiceNumber` var; fiyatsız giriş yalnız 2 role (`:1277`) | Bağımsız stok fişi tipi |
| Birleşik stok hareket defteri | **EKSİK** | Sayaç tablosu + dağınık kaynak tabloları | Tek `StockMovement` tablosu (tip, yön, miktar, referans) |
| Birim tanımı | **Kısmen** | Metin alanlar | `AmountType` FK'sı / birim çevrimi |

### (ii) 3PL müşteri-sahipli mal stoğu için

| İhtiyaç | Durum | Mevcut tablo / alan | Eksik |
|---|---|---|---|
| **Mal sahibi (müşteri) kırılımı** | **EKSİK** | `ZT_MaterialStockAll`, `ZT_MaterialPurchases`, `ContainerType`'ta sahip/müşteri kolonu yok. Tek taraf bilgisi faturadaki `IndustrialSupplierID` (tedarikçi) | `OwnerCustomerID` (bakiye, lot ve kart seviyesinde); bakiye anahtarına sahip eklenmesi |
| SKU kartı | **Kısmen** | `ContainerType (Name, MaterialCode, UnitName, ImagePath)` | Müşteriye özel SKU kodu, barkod/GTIN, ebat/ağırlık/hacim, koli içi adet, palet tipi (`⚠ BULUNAMADI`) |
| Raf / göz adresleme | **Kısmen** | `ZT_WarehouseLocation (WarehouseID, BlockNo, FloorNo, RowCode)`, lot satırında `WarehouseLocationID`, `ZT_WarehouseLocationTransfer` (neden + tarih) | "Göz/bin" seviyesi yok (Blok→Kat→Sıra üç seviye); konum kapasitesi/doluluk kısıtı, konum bazlı bakiye tablosu yok; bir lot tek konuma bağlı (lot bölme yok) |
| Lot | **Mevcut** | `ZT_MaterialPurchases.BatchNumber`, `RemainingAmount` | — |
| Seri no | **EKSİK** | — | Seri tablosu |
| SKT / üretim tarihi | **EKSİK** (malzeme tarafında) | `ExpiryDate`/`ShelfLifeDays` yalnız **mamul** tarafında: `ZT_StockedProduct.ExpiryDate`, `RecipeProduct.ShelfLifeDays` (`Docs/ReceteliUretim/2026_ReceteliUretim_Migration.sql:28, 79`) | `ZT_MaterialPurchases`'ta SKT; FEFO |
| Giriş (mal kabul) belgesi | **Uyumsuz** | Giriş = **alış faturası**, otomatik `ZT_AccountDebts` borç kaydı (`:1678-1800`) | Müşteri malı kabulü fatura/borç doğurmamalı: finansal etkisiz irsaliye/ASN girişi |
| Çıkış (sevk) belgesi | **Uyumsuz** | Çıkış = **satış faturası** (`ZT_AccountCredits`), kayıp ya da üretim tüketimi | Müşteri talimatlı çıkış/sevk emri, toplama (picking), sevk irsaliyesi |
| Depo / iş yeri kırılımı | **Kısmen** | bakiye iş yeri+şube; depo lot satırında | Depo + konum + sahip bazlı bakiye |
| Sayım | **Kısmen** | `ZT_MaterialStockCount` (depo, konum, eski/yeni/delta) | Sahip bazlı sayım; yalnız reçeteli akışta |
| Depolama hizmet bedeli faturalama (palet-gün, elleçleme) | **EKSİK** | — | Hizmet tarifesi, dönemsel hakediş (`⚠ BULUNAMADI`) |
| Kalite / hasar kabul | **Kısmen** | `ZT_MaterialInvoice.QualityControl*`, `Services/MaterialLineQualityControl` | Fatura başlığına bağlı |
| Soğuk zincir bayrağı | **Mevcut** | `ZT_Warehouse.IsColdStorage` | Sıcaklık kaydı yok |

**Özet**: (i) sarf deposu için kart + tedarikçi faturası + iş yeri bakiyesi + lot/FIFO + kayıp + kritik stok **hazır**; eksik olan çıkış tarafı (araca/iş emrine tüketim), seri no, transfer ve faturasız fişler. (ii) 3PL için yapı **temelden uygun değil**: sahiplik kavramı hiç yok ve her giriş/çıkış cari borç/alacak üreten faturaya bağlı; yalnız `ZT_Warehouse` + `ZT_WarehouseLocation` (+ transfer revizyonu) ve lot satırı deseni yeniden kullanılabilir.

---

## Özel soru (b) — SalesTruckExpenses ↔ ProductionExpenses veri modeli karşılaştırması

Temel fark: **ProductionExpenses kendi başlık+detay tablolarına sahip gerçek bir masraf modülü; SalesTruckExpenses'in tablosu yok — sevk kaydının (`ZT_SalesTruck`) üzerindeki nakliye kolonlarının düzenleme ekranı.** İkisi de cariye `ZT_AccountDebts` ile bağlanır.

| Kavram | SalesTruckExpenses | ProductionExpenses |
|---|---|---|
| Ana tablo | `ZT_SalesTruck` (paylaşımlı — sahibi SalesProduct) | `ZT_ProductionExpenses` |
| Detay tablosu | yok (sevk başına en çok 2 masraf: Sevk Nakliye + Gemi Nakliye) | `ZT_ProductionExpensesDetail` (N satır) |
| Birincil anahtar | `ZT_SalesTruck.ID` | `ZT_ProductionExpenses.ID` |
| Masraf sınıflaması | sabit 2 tür — `ZT_AccountDebts.TransportType` ('Sevk Nakliye' / 'Gemi Nakliye') | `ExpenseTypeID` → `ZT_ExpenseTypes`, `ExpenseItemID` → `ZT_ExpenseItems`; ayrıca metin `ExpensesType`, `Category`, `Department` |
| Karşı taraf (kime borç) | `TransportCompanyID` (int) / `ShipTransportCompanyID` (**varchar**) → `TransportCompany` | masraf kalemi (`ExpenseItemID`) — ayrı tedarikçi kolonu yok |
| Cari eşleme | `ZT_CustomerAccounts.ReferenceID = TransportCompany.ID`, `AccountGroup='Sevk Nakliye Firması'` | `ZT_CustomerAccounts.ReferenceID = ExpenseItem.ID`, `AccountGroup='Masraf Hesabı'` |
| Cari borç | `ZT_AccountDebts`: `AccountingType='Sevk Nakliye Firması'`, `ReferenceID=SalesTruck.ID`, `TransportType` | `ZT_AccountDebts`: `AccountingType='Masraf Hesabı'`, `ReferenceID=ProductionExpenses.ID` |
| Tutar (ana) | `TransportCompanyPrice` / `ShipTransportCompanyTotalPrice` | `TotalAmount` (= Σ detay) |
| Para birimi | `CurrencyID` (sevk kaydında **tek** kolon, iki nakliye türü paylaşır); borca carinin para birimi yazılır | `CurrencyID` (başlıkta) |
| Kur | borçta sabit `1.0000` | borçta sabit `1.0000` |
| KDV | `KDVAmount` | `KdvRate`, `TaxAmount` (başlık + detay) |
| Tevkifat | `WithholdingTax` | `WithholdingTaxAmount` |
| İskonto | — | `Discount`, `DiscountRate`, `DiscountAmount` |
| Diğer vergiler | — | `OtherTaxesAmount` |
| Net / ara toplam | — | `NetAmount`, `InvoiceAmount`; detayda `SubTotal` |
| Toplam | `TotalAmount` | `TotalAmount` |
| Avans / kalan / kesinti / ödenen / bakiye | `AdvanceAmount`, `RemainingAmount`, `DeductionAmount`, `PaidAmount`, `BalanceAmount` | **yok** |
| Miktar / birim / birim fiyat | — | `Quantity`, `Unit`, `UnitAmount` (başlık + detay), `ExpenseFloors` |
| Belge no / türü | `ZT_AccountDebts.DocumentNo`, `.DocumentType` (masraf kaydında tutulmaz); `ZT_SalesTruck.InvoiceNumber` (satış faturası no) | başlıkta `InvoiceNumber`; borçta `DocumentNo`, `DocumentType` |
| Belge / vade tarihi | — (`CreationDate`, `DepartureDate` sevkin) | `InvoiceDate`, `DueDate` |
| Doküman eki | — | `DocumentPath` |
| Açıklama | `Description` (sevkte + borçta) | `Description` (başlık + detay) |
| İş yeri | sevk kaydında yok — yalnız `ZT_AccountDebts.WorkPlaceID` | `ZT_ProductionExpenses.WorkPlaceID` **ve** `ZT_AccountDebts.WorkPlaceID` (filtre borç üzerinden) |
| Durum / silme | `Status` (sevkin); masraf silme = kolonları NULL/0 + borç hard DELETE | `Status` soft delete (başlık + detay) + borç hard DELETE |
| Oluşturma tarihi | `CreationDate` (sevkin) | `CreationDate` |
| **Bağlam referansı** | **sevk aracı**: satırın kendisi (`ZT_SalesTruck.ID`); `CustomerID` (müşteri), `ChauffeurID`, `Plate`, `DorsePlate`, parti no `ZT_SalesTruckBatchNumbers.SalesTruckID`; lokasyon fiyatı `ZT_LocationPricing` (yalnız okunur; `LocationPricingName`/`TransportLocationPricing` modelde var ama UPDATE'e girmiyor) | **sipariş**: `OrdersID` → `ZT_Orders`; **üretim hattı**: `LineID` → `Line`; **fire**: `MaterialLossesID` → `ZT_MaterialLosses`; **parti**: `BatchNumber` (metin); **departman**: `Department` (metin). Üretim planı / iş emri FK'sı yok |
| Transaction | Update: yok; Delete: var | yok |
| Yetki | sınıfta yok (yalnız `Index` `[Authorize]`) | `[Authorize]` + 7 rol |
| Veri erişimi | raw Npgsql | raw Npgsql |

**Ortak alanlar** (ad farkıyla): toplam tutar, KDV tutarı, tevkifat, para birimi, açıklama, durum, oluşturma tarihi; cari borçta `CustomerAccountID, TransactionDate, Amount, CurrencyID, ExchangeRate, AccountingType, ReferenceID, CreationDate, CreatedBy, WorkPlaceID, Description, DocumentNo, DocumentType`.
**Yalnız SalesTruck**: avans/kalan/kesinti/ödenen/bakiye beşlisi, `TransportType` ayrımı, karşı taraf FK'sı. (Aynı beşli + `InvoiceAmount/KDVAmount/WithholdingTax/TotalAmount` kalıbı `ZT_ExpertReportTruckExpenses`'te de var — nakliye masrafı için ortak "hakediş" şablonu.)
**Yalnız Production**: tür/kalem sınıflaması, detay satırları, miktar/birim, iskonto, fatura/vade tarihi, doküman eki.

---

## Grup özeti — tabloların tekil listesi

| Tablo | Okuyan / yazan controller'lar (bu kapsamda) | Finans mı? |
|---|---|---|
| `ZT_AccountDebts` | **Yazan**: MaterialStockAll, SalesTruckExpenses, ProductionExpenses, OrderExpenses, HarvestManagerExpenses, ProductionSergeantsExpenses, ExpertReportTruckExpenses | **Finans** (cari borç) |
| `ZT_AccountCredits` | Yazan: MaterialStockAll (malzeme satışı) | **Finans** (cari alacak) |
| `ZT_CustomerAccounts` | Yazan: MaterialStockAll (tedarikçi carisi), ExpenseItems ('Masraf Hesabı'), WorkPlace ('İş Yeri Firması'); okuyan: tüm masraf controller'ları | **Finans** (cari kart) |
| `Currency` | Yazan: Currency, CurrencyApi; okuyan: hepsi | **Finans** (tanım) |
| `ZT_PaymentDensityCurrencies` | CustomerAccounts (R/W) | **Finans** |
| `ZT_ExchangeBreakSource` | BankStatement (R/W) | **Finans** |
| `TransactionType` | Yazan: TransactionType; okuyan: banka/kasa/tahsilat/ödeme controller'ları | **Finans** (tanım) |
| `ZT_ExpenseTypes` | Yazan: ExpenseTypes; okuyan: ProductionExpenses, ExpenseItems (+ CustomerAccounts, Personnel*, RecipeFinance…) | **Finans** (masraf tanımı) |
| `ZT_ExpenseItems` | Yazan: ExpenseItems; okuyan: ProductionExpenses | **Finans** (masraf tanımı) |
| `ZT_ProductionExpenses` | ProductionExpenses (R/W) | **Finans** (masraf) — `OrdersID/LineID/MaterialLossesID` ile finans-dışına bağlı |
| `ZT_ProductionExpensesDetail` | ProductionExpenses (R/W) | **Finans** |
| `ZT_OrderExpenses` | OrderExpenses (R/W) | Finans (masraf) — siparişe bağlı |
| `ZT_ProductionSergeantsExpenses`, `ZT_ProductionSergeantExpenseBatches` | ProductionSergeantsExpenses (R/W) | Finans (masraf) — üretime bağlı |
| `ZT_ExpertReportTruckExpenses` | ExpertReportTruckExpenses (R/W) | Finans (masraf) — eksper/alım aracına bağlı |
| `ZT_BranchProvince` | Yazan: BranchProvince; okuyan: hepsi | Ortak altyapı (finans + finans-dışı) |
| `ZT_WorkPlace` | Yazan: WorkPlace; okuyan: hepsi | Ortak altyapı |
| `ZT_MaterialStockAll` | Yazan: MaterialStockAll (+ kapsam dışı: ProductionConveyor, ReadyStock, ProductionPlanning, RecipeGoods, RecipeProduction, RecipePurchasing, SalesProduct, AccountTransaction); okuyan: MaterialStockProduction | **Finans-dışı** (stok) |
| `ZT_MaterialInvoice` | MaterialStockAll (R/W) | Karma: stok belgesi + cari borcun kaynağı |
| `ZT_MaterialPurchases` | MaterialStockAll (R/W); ProductionExpenses (R) | **Finans-dışı** (stok lotu) |
| `ZT_MaterialSalesInvoice`, `ZT_MaterialSalesItems` | MaterialStockAll (R/W) | Karma: stok çıkışı + cari alacağın kaynağı |
| `ZT_MaterialLosses` | MaterialStockAll (R/W); ProductionExpenses (R) | Finans-dışı (stok) |
| `ZT_MaterialLossDetail` | MaterialStockAll (R/W) | Finans-dışı |
| `ZT_MaterialConsumption` | MaterialStockAll (R) | Finans-dışı (üretim tüketim defteri) |
| `ZT_MaterialStockCount` | (RecipeGoods) — yalnız SQL dosyası | Finans-dışı (sayım) |
| `ZT_MaterialUsageFormula` | (ProductionConveyor) — yalnız SQL dosyası | Finans-dışı (üretim) |
| `ContainerType` | MaterialStockAll, MaterialStockProduction, ProductionExpenses (R) | Finans-dışı (malzeme kartı) |
| `ZT_Warehouse`, `ZT_WarehouseLocation`, `ZT_WarehouseLocationTransfer` | MaterialStockAll (R: `ZT_Warehouse`) | Finans-dışı (depo) |
| `ZT_IndustrialSupplier` | MaterialStockAll (R/W) | Finans-dışı tanım (cariyle eşlenir) |
| `ZT_PurchaseOrder`, `ZT_PurchaseOrderLine`, `ZT_PoGoodsReceipt` | MaterialStockAll (R/W) | Finans-dışı (satınalma) |
| `ZT_SalesTruck` | SalesTruckExpenses (R/W — yalnız nakliye kolonları) | **Finans-dışı** (satış sevk aracı) — masraf kolonları taşır |
| `ZT_SalesTruckBatchNumbers` | SalesTruckExpenses (R) | Finans-dışı (sevk) |
| `TransportCompany`, `TransportChauffeur`, `TransportTruck` | SalesTruckExpenses, ExpertReportTruckExpenses (R) | Finans-dışı (nakliye tanımı) |
| `ZT_LocationPricing` | SalesTruckExpenses, ExpertReportTruckExpenses (R) | Finans-dışı (lokasyon fiyat tanımı) |
| `ZT_Orders`, `ZT_OrderHeader` | ProductionExpenses, OrderExpenses (R) | Finans-dışı (sipariş) |
| `Customer` | MaterialStockAll, SalesTruckExpenses, ProductionExpenses, OrderExpenses, ProductionSergeantsExpenses (R) | Finans-dışı (müşteri) |
| `Line` | ProductionExpenses (R) | Finans-dışı (üretim hattı) |
| `ZT_ProductionPlanning` | hepsi (R — çoğunda yalnız layout chat widget) | Finans-dışı (üretim) |
| `ZT_ProductionConveyor`, `ZT_ProductionConveyorMaterials` | MaterialStockAll, ProductionSergeantsExpenses (R) | Finans-dışı (üretim) |
| `ZT_ProductionSergeants`, `Product`, `SubProduct` | ProductionSergeantsExpenses (R) | Finans-dışı |
| `ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_UsedHarvestManager`, `ZT_HarvestManager`, `ZT_HarvestAndProductionWorkersPricing`, `Supplier` | HarvestManagerExpenses, ExpertReportTruckExpenses (R/W) | Finans-dışı (bahçe / eksper / kesim) |
| `ZT_AcceptanceOfGoods`, `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_Boss`, `ZT_ProductionManager`, `ZT_LogisticsPerson`, `ZT_SalesPerson`, `ZT_Expert`, `ZT_ExpertChef` | hepsi (R — kullanıcı iş yeri kapsamı) | Ortak altyapı (rol/personel) |
| `AmountType` | Yazan: AmountType; bu kapsamdaki finans/stok/masraf sayfaları OKUMUYOR | Finans-dışı (üretim/reçete birimi) |
| `ZT_EInvoice`, `ZT_Setting` | MaterialStockAll (R) | e-Dönüşüm altyapısı |
| `Factory` | SalesTruckExpenses, ExpertReportTruckExpenses (R) | Ortak altyapı |
| `Restriction` (via `restrictionQuery`) | Currency, TransactionType, ProductionExpenses, CurrencyApi | Ortak altyapı (yetki kısıtı) |
| `Customers` (admin DB) | MaterialStockAll, ProductionExpenses (R — QrKey) | Platform altyapısı (kiracı kaydı) |
| `ZT_LotCategory` | — (yalnız migration dosyası) | Finans-dışı |

### Kopyalama için dikkat edilecek çapraz bulgular
1. Tüm masraf modülleri cariye **`ZT_AccountDebts.AccountingType` + `ReferenceID`** (polimorfik referans) ve **`ZT_CustomerAccounts.AccountGroup` + `ReferenceID`** ile bağlanır; FK yok. Görülen değerler: `Malzeme Tedarikçisi`, `İlaç Tedarikçisi`, `Masraf Hesabı`, `Sevk Nakliye Firması`, `Nakliye Firması`, `Kesim Çavuşu`, `Üretim Çavuşu`, `Müşteri`, `Tedarikçi`, `İş Yeri Firması`.
2. Masraf silmede cari borç **hard DELETE** edilir (iz kalmaz); masraf kaydı soft delete.
3. Masraf modüllerinde cari borca **kur 1.0000 sabit** yazılır (dövizli masrafın TL karşılığı saklanmaz).
4. `SalesTruckExpenses` ve `ProductionExpenses` yazma işlemleri transaction'sız.
5. Yetki eksikleri: `SalesTruckExpensesController` (Index dışı action'lar), `HarvestManagerExpensesController`, `ProductionSergeantsExpensesController` sınıflarında `[Authorize]` yok.
6. SQL string birleştirme noktaları: `CurrencyController.cs:164, 508`; `AmountTypeController.cs:87`; `TransactionTypeController.cs:95`; `SalesTruckExpensesController.cs:907`; `MaterialStockAllController.cs:89` (userkey); Status toggle'ları (`id.ToString()` — int olduğu için düşük risk).
7. Kur altyapısı dağınık (8 implementasyon, biri üçüncü taraf HTTP API); yeni projede tek servise indirgenmeli — "tek-uçuş + negatif önbellek" mantığı servise değil tek bir action'a gömülü.
