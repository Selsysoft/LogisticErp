# MX-4 — Masraf ekranları (ExpenseItems / ProductionExpenses / Investments) + ortak UI kabuğu ve CSS stratejisi

> **12.7 uygulandı (2026-11-16); uygulama belgesi [`docs/zto-finans/uygulama/12.7_TASARIM.md`](../../uygulama/12.7_TASARIM.md)** (bu matrisin §A.4–§A.5 masraf modelini düzeltir: kalem = cari deseni çıktı, borç tedarikçi carisine; tipli bağlam FK'ları, ayna kayıt yok). Çelişkide uygulama belgesi geçerlidir.

Kökler: ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` · BR = `F:\visual studio zto\LogisticErp`
Salt okunur analiz. Gizli değer yazılmadı. Bulunamayanlar `⚠ BULUNAMADI` ile işaretli.
Mevcut envanterle (01_FINANS_ENVANTER, D, E) **çelişen** yeni bulgular `🆕` ile işaretli.

---

## BÖLÜM A — Masraf ekranları

### A.0 Özet tablo (view → layout → satır)

| Route | View | Satır | Layout | Amaç |
|---|---|---|---|---|
| `/ExpenseItems/Index` | `Views/ExpenseItems/Index.cshtml` | 112 | `_Layout` (_ViewStart; yalnız Admin) | Masraf kalemi listesi |
| `/ExpenseItems/Add` | `Views/ExpenseItems/Add.cshtml` | 512 | `_Layout` | Kalem ekleme (+ otomatik cari `MSR-{ID}`) |
| `/ExpenseItems/Edit/{id}` → POST `/ExpenseItems/Update` | `Views/ExpenseItems/Edit.cshtml` | 492 | `_Layout` | Kalem düzenleme |
| `/productionexpenses/index` | `Views/ProductionExpenses/Index.cshtml` | 1287 | rol: `_ExpertLayout` / `_ProductionLayout` / `_Layout` (:13-33) | Takvim + gün detayı + son 6 ay yığılı grafik |
| `/productionexpenses/indexexpenses` | `Views/ProductionExpenses/IndexExpenses.cshtml` | 1666 | rol (:9-29) | Masraf kalemi (=cari) bazlı gruplu liste + para birimi özet kartları |
| `/productionexpenses/ExpenseGroupDetails/{id}` (id = ExpenseItemID) | `Views/ProductionExpenses/ExpenseGroupDetails.cshtml` | 950 | `_ExpertLayout` (:4) | Bir kalemin faturaları |
| `/productionexpenses/add` | `Views/ProductionExpenses/Add.cshtml` | 1243 | rol: `_ExpertLayout`/`_Layout` (:7-23) | Başlık + çok satırlı detay kartlı masraf faturası |
| `/productionexpenses/edit/{id}` | `Views/ProductionExpenses/Edit.cshtml` | 1213 | rol (:8-24) | Aynı form + mevcut belge kaldırma |
| `/Investments/Index` | `Views/Investments/Index.cshtml` | 696 | `_ProductionLayout` (:4) | Yatırım portföyü |
| `/Investments/Add?type=Fon` | `Views/Investments/Add.cshtml` | 415 | `_ExpertLayout` (:3) | Yeni yatırım |
| `/Investments/Details/{id}` | `Views/Investments/Details.cshtml` | 748 | `_ExpertLayout` (:3) | Yatırım detayı + tahsilatlar |

(Satır sayıları `Measure-Object -Line` ile; envanterdeki 1892/1063 değerleri boş satırlar dahil fiziksel satırdır.)

---

### A.1 ExpenseItems (Admin tanım ekranları)

Controller: `Controllers/ExpenseItemsController.cs` (656) — sınıf `[UserRoleAuthorize("Admin")]` (:12).

| Satır | Action | HTTP |
|---|---|---|
| 23 | `Index()` | GET |
| 83 | `Add()` | GET |
| 116 | `SearchExpenseItems(string term)` | GET JSON (autocomplete) |
| 153 | `CheckExpenseItemExists(string name)` | POST JSON |
| 197 | `Add(ExpenseItems)` | POST → `ZT_ExpenseItems` INSERT (:226) + `ZT_CustomerAccounts` INSERT (:260; `AccountGroup='Masraf Hesabı'`, `AccountCode='MSR-{ID}'`) |
| 355 | `Edit(string id)` | GET |
| 410 | `CheckExpenseItemExistsForEdit(name,id)` | POST JSON |
| 451 | `Update(ExpenseItems)` | POST (`UPDATE ZT_ExpenseItems` :473) |
| 549 | `Delete(int id)` | **GET** ile soft-delete + carinin `Status=false` (:591) |

**Index.cshtml** — tablo `#dataTable` (`table table-hover`, `section.card.custom-card > header.card-header.custom-card-header`):
kolonlar: Masraf Türü · Ad · Açıklama · Varsayılan Birim · Anahtar · Oluşturma Tarihi (`data-order` ISO) · İşlemler (:31-37).
İşlem butonları: `btn btn-info` "Masraf Hesapları" → `/BankAccounts/Index?referenceID=..&typeAccount=Masraf Hesabı&supplierName=..` (:59) · `btn btn-success` Düzenle (:65) · `btn btn-danger` Sil — yalnız `Key` boşsa, **native `confirm()`** (:68-71).
DataTables: `order [[5,'desc']]`, dil `"/js/datatable/tr.json"` (:103) — 🆕 `wwwroot/js/datatable/` **yok** → dil dosyası 404 ⚠.
Modal: **yok**. Yetkisiz kullanıcıya `~/factory2.jpg` + mesaj (:87-96).

**Add.cshtml form** (`POST /expenseitems/add`, `onsubmit=validateForm`) :

| name | Etiket | Tip | Doğrulama | Kaynak |
|---|---|---|---|---|
| ExpenseTypeID | Masraf Türü * | select | required | `ViewBag.ExpenseTypes` (DataTable) :21-30 |
| Name | Ad * | text + `.autocomplete` öneri kutusu `#suggestions` | required; anlık benzersizlik `CheckExpenseItemExists` (fetch :458); öneri `SearchExpenseItems` (fetch :244) → `#nameError`/`#nameSuccess`; submit butonu benzersiz olana kadar `disabled` (:61) | — |
| Description | Açıklama | textarea rows=3 | — | — |
| DefaultUnit | Varsayılan Birim | text | — | — |
| Key | (gizli) | hidden | — | — |
Buton: `#submitButton.btn.btn-primary.col-md-12` "Yeni Masraf Kalemi Oluştur". Sayfa içi CSS: `.autocomplete*`, `.is-invalid/.is-valid` (BS5 svg'leri), `.btn-disabled/.btn-enabled`, `.submit-btn-tooltip` (:80-179).
**Edit.cshtml**: aynı alanlar, `asp-action="update"`, `CheckExpenseItemExistsForEdit` (fetch :377), öneri (fetch :236).

---

### A.2 ProductionExpenses ("Genel Masraf Hesapları")

Controller: `Controllers/ProductionExpensesController.cs` (3150) — sınıf rolleri `Admin, Üretim Müdürü, Patron, Muhasebe (Alış), Finans(normal), Finans(super), Lojistik` (:21). `Add()` GET'e yanlışlıkla bağlanan öznitelik (:433 → :654) Finans rollerini dışarıda bırakıyor (envanter D ile aynı).
Uçlar: `Index` GET :31 · `Add` GET :654 · `GetExpenseTypes` GET :935 · `GetExpenseItemsByType` GET :977 (view'da çağıran yok) · `Add` POST :1019 · `Edit` GET :1358 · `Edit` POST :1674 · `GetExpenseDetails` GET :2064 · `Delete(int id)` GET :2254 (soft: `Status=false` başlık :2299 + detay :2309 + AccountDebts) · `IndexExpenses` GET :2391 · `ExpenseGroupDetails` GET :2900.

#### A.2.1 Index (takvim görünümü)
- Başlık "Genel Masraflar Paneli" (:483); rol menüsü partial'ları (:523-570) veya nav-tabs "Takvim Görünümü / Genel Masraf Hesapları" (:575-584).
- `.pe-toolbar`: lejant (Kayıt Var/Bugün/Seçili), `#branchFilterPE`, `#workPlaceFilterPE` (`.pe-filter-select`; kullanıcı kapsamı doluysa `disabled`) → `location.href=/productionexpenses/index?branchId=..&workPlaceId=..` (:1172-1177); butonlar `pe-btn pe-btn-success` "Yeni Masraf Kaydı", `pe-btn-primary` "Liste Görünümü"; gizli `#reportBtnHidden` (:643).
- Takvim kartı: `#prevMonth`, `#monthSelect`, `#yearSelect` (`.no-select2`), `#nextMonth` (:657-683).
- "Üretim Masraf Kayıtları" kartı: `#badge-date`, gizli toplu sil (:701-707), gün→kategori→kayıt grupları, alt bilgi `#selectedDateCount/Total/Discount/Tax/Invoice` (:968-994).
- "Son 6 Ay Masraf Grafiği" `canvas#stackedExpensesChart` (Chart.js, :1047, :1121).
- **Modal `#reportModal`** "Masraf Raporu" (:1053-1079): input `#reportDate` (`custom-input reportDateRange`, readonly, flatpickr range); buton `#generateReport` → `window.open('/productionexpenses/report?dateRange=..')` (:1425). 🆕 **`Report` action controller'da yok** → ölü uç ⚠; tetikleyici buton gizli.
- **Modal `#deleteConfirmModal`** "Silme Onayı" (:1082-1099): `#modal-date-display`, `#modal-message`; `a#confirm-delete-btn` → `/productionexpenses/delete?date=..` (:1447). 🆕 `Delete` yalnız `int id` alır → tarih ile silme ölü ⚠; tetikleyici gizli.
- 🆕 Sayfa kendi içinde **Bootstrap 5.1.3 bundle** + jQuery 3.6.0 + **flatpickr (sürümsüz) + tr l10n** + **Chart.js (sürümsüz → v4)** yükler (:1101-1106); layout zaten BS 4.3.1 + Chart 2.8.0 yükler → modal kodu karışık (`data-dismiss` BS4 + `new bootstrap.Modal` BS5 :1454 + `data-bs-dismiss` :1073). Envanter E'deki "flatpickr → 0" ifadesi bu dosya için yanlış.

#### A.2.2 IndexExpenses (liste görünümü — finans menüsünün hedefi)
- Başlık "Genel Masraf Hesapları Paneli" (:772); `animate.css 4.1.1` (:33).
- Filtreler `#branchFilterIE`, `#workPlaceFilterIE` (:901, :912) → `location.href` (:1357-1362); butonlar `pe-btn pe-btn-success` Yeni Masraf (:923), `pe-btn-primary` Takvim (:927).
- Tablo `#dataTable2` (`table table-hover`, font 11px) (:935): Cari Hesap · Cari Kod · Vergi No · Telefon · Şehir · Masraf Türü · İş Yeri · Toplam Fatura Sayısı · Toplam Tutar (çok para birimi → `showCurrencyTooltip` :1031) · Son Fatura Tarihi (`data-order yyyyMMdd`) · İşlemler ("Faturaları Gör" → `/productionexpenses/ExpenseGroupDetails/{ExpenseItemID}` :1058). Gruplanmamış kayıtlar ayrıca satır olarak (:1071).
- DataTables (:1810-1855): `dom '<"row"<"col-sm-2"l><"col-sm-4"B><"col-sm-6 text-right"f>>rtip'`, `lengthMenu [10,25,50,100,Tümü]`, `pageLength 50`, `order [[9,'desc']]`, butonlar copy (`btn btn-grey rounded`), excel (`btn-green`), print (`btn-blue`, başlık ekler), pdf (`btn-red`), son kolon hariç; dil `cdn.datatables.net/plug-ins/2.1.8/i18n/tr.json` (CDN!).
- "Masraf Kalemlerine Göre Özet" yatay kart şeridi `#categoryCards` + arama `#categorySearch`/`#clearSearch` + `#searchResultInfo` (:1135-1238); "Toplam Masraf" para birimi kartları (:1247-1273).
- Para birimi açılır kutusu: `#currencyTooltipOverlay`, `#currencyTooltipContainer` (:1296-1297; elle konumlanan özel popover).
- **Modal `#deleteConfirmModal`** (:1301-1331, BS4 `data-dismiss`): `#deleteExpenseDescription`, `#deleteExpenseAmount`; `a#confirmDeleteBtn` → `/productionexpenses/delete/{id}` (:1791-1797). Tetikleyen satır butonu bu view'da görünmüyor (gruplu liste) → fiilen kullanılmıyor olabilir ⚠.

#### A.2.3 ExpenseGroupDetails
- Breadcrumb (:289-293), `.group-header` "{Cari} - Masraf Cari Hesap Faturaları" (:296-301).
- `.summary-card` özetleri: Cari Kod · Toplam Fatura Sayısı · her para birimi için tutar kartı · Vergi No · Telefon/Şehir (:304-393).
- Para birimi filtresi `#currencyFilter` + `#clearFilter` + `#filterInfo/#filterCount` (istemci satır filtresi, `tr[data-currency-id]`) (:396-431).
- Kart başlığında `#branchFilterEGD`, `#workPlaceFilterEGD` (satır içi stil) → `location.href` (:733-738).
- Tablo `#dataTable2` (:474): # · Fatura No · Açıklama · Masraf Türü · Departman · İş Yeri · Para Birimi (badge) · Fatura Tutarı · Fatura Tarihi · Belge (`/MaterialStockAll/GetFile?token=..` + detay butonu `.view-details-btn`) · İşlem (Düzenle `/productionexpenses/edit/{id}`, Sil `/productionexpenses/delete/{id}`); `tfoot #footerTotalRow` (tek para biriminde toplam, aksi "Karışık").
- **Modal `#invoiceDetailsModal`** "Fatura Detayları | Belge No: `#modalInvoiceNumber`" (`modal-xl modal-dialog-centered modal-dialog-scrollable`, :598-674): spinner `#detailsLoadingSpinner`; tablo `#detailsTable` (# · Açıklama · Miktar · Birim · Birim Fiyat · Ara Toplam · İskonto % · İskonto Tutarı · Net Tutar · KDV % · KDV Tutarı · Tevkifat · Diğer Vergiler · Toplam) + `tfoot` toplamları; `#noDetailsAlert`, `#detailsErrorAlert`. AJAX: `$.ajax GET /productionexpenses/GetExpenseDetails?id=` (:940-941). Buton: Kapat.
- **Modal `#deleteConfirmationModal`** "Silme İşlemini Onayla" (:677-718): `#deleteWarningMessage`, `#deleteInvoiceInfo`, uyarı (cari borcundan da silinir), `#deleteDetails` (`#deleteInvoiceNumber/Amount/Date`); butonlar İptal, `#confirmDeleteBtn` → `location.href=deleteUrl` (GET) (:767-785).
- DataTables `#dataTable2` (:799) aynı buton seti.

#### A.2.4 Add / Edit (masraf faturası formu) — `POST /productionexpenses/add|edit`, `multipart/form-data`, `onsubmit=validateAndPrepareForm`
Bölümler (`.form-section`, `col-md-3` ×4 üst satır):

| Bölüm | name / id | Etiket | Tip | Doğrulama | Kaynak |
|---|---|---|---|---|---|
| Görsel | `#expenseTypeIcon` | tür gif'i (production/export/other) | img | — | `wwwroot/ProductionExpenses/*.gif` (:401-403) |
| Masraf Bilgileri | ExpenseTypeID `#ExpenseTypeSelect` | Masraf Türü | select (+info tooltip) | required | `ViewBag.ExpenseTypesList` (:416) |
| | ExpensesType (hidden) | — | seçili tür metni | — | JS |
| | ExpenseItemID `#ExpenseItemSelect` | Masraf Cari Hesap | select (türe bağlı) | required | `ViewBag.ExpenseItemsByType` JSON (:1018), JS `updateExpenseItems` (:1199) |
| | Category (hidden) | — | seçili kalem metni | — | JS |
| | InvoiceNumber | Fatura No | text (ph FTR-12345) | — | — |
| Doküman/Fatura | DocumentFile `#DocumentFileInput` | sürükle-bırak alanı `#DocumentUploadArea` + `#DocumentPreview` | file | ≤10 MB; pdf,jpg,jpeg,png,doc,docx,xls,xlsx (`alert` :1112, :1121) | — |
| Genel Bilgiler | CurrencyID | Para Birimi * | select (vars. ID=1) | required | `ViewBag.CurrencyList`; sembol haritası `ViewBag.CurrencySymbolMap` (:1021) → tüm `.currency-symbol` güncellenir |
| | Department | Departman | select (sabit 15 değer :508-522) | required | sabit |
| | WorkPlaceID | İş Yeri * | select (`data-branch`) | required | `ViewBag.WorkPlaceData` |
| | CreationDate | Fatura Tarihi | date | — | — |
| Üretim Bilgileri (`.production-only`, yalnız tür="Üretim") | OrdersID, BatchNumber (readonly, `orderBatchMap`), LineID, MaterialLossesID (+ LossAmount/LastUnitPrice/LastPurchaseDate readonly, LastPriceMaterialPurchasesID hidden; kalem adı "Fire" içeriyorsa) | Sipariş/Parti/Hat/Fire | select/text | — | `ViewBag.OrdersList/LineList/MaterialLossesList/MaterialLossesJson` |
| Masraf Detayları (tekrarlı `.expense-detail-card`) | DetailDescription · DetailQuantity* (vars.1) · DetailUnit · DetailUnitAmount* · DetailSubTotal(ro) · DetailDiscountRate · DetailDiscountAmount(ro) · DetailNetAmount(ro) · DetailKdvRate* (vars.20) · DetailTaxAmount(ro) · DetailWithholdingTaxAmount · DetailOtherTaxesAmount · DetailTotalAmount*(ro) | — | number step 0.01 | en az 1 kart (`alert` :1281, :1407) | JS hesap :1295-1365 |
| | butonlar | "Sil" (`btn-remove-detail`), "Yeni Detay Ekle" | | | |
| Genel Toplam | `#GrandNetAmount`, `#GrandTaxAmount`, `#GrandDiscountAmount`, `#GrandTotalAmount` | | readonly | | JS |
| Açıklama | Description | Açıklama | text | — | — |
| Belge türü | DocumentType (`.no-select2`) | Belge Türü | select (Alış Faturası vars., Kasa Fişi, SMM, Yurt Dışı, Proforma, Sevk İrsaliyesi, Hizmet, E-Fatura, Gider Pusulası, Diğer) (:844-860) | — | sabit |
| Gizli | DetailsJson, TotalAmount, InvoiceAmount, NetAmount, TaxAmount, DiscountAmount | | hidden | `prepareDetailsJson` (:1367) | |
Buton `#submitBtn` "Yeni Masraf Oluştur" (çift tıklama kilidi :1423). Modal **yok**. AJAX **yok** (tüm listeler ViewBag ile gömülü).
Edit farkı: hidden `ID`, `DocumentPath`, `RemoveDocument` (+ `removeExistingDocument()` native `confirm` :1125-1126), `DetailID` satır başına (:782); 🆕 `DiscountAmount` hidden iki kez (:698, :754 — yinelenen alan).
Model alanları ama formda yok: `InvoiceDate`, `DueDate` (controller'da var :1147/:1177, formda input ⚠ BULUNAMADI → hep NULL).

Muhasebe etkisi (envanter D :394-399): her kayıt `ZT_AccountDebts` (`AccountingType='Masraf Hesabı'`, `CustomerAccountID` = **kalemin carisi**, kur sabit 1.0000, tarih=şimdi). Yani ZTO'da "masraf kalemi" aynı zamanda **borçlu cari**; tedarikçi carisi yok.

---

### A.3 Investments

Controller `Controllers/InvestmentsController.cs` (1464) — `Patron, Admin, Finans(normal), Finans(super), Muhasebe (Alış)` (:13).
Uçlar: `Index(type,status)` GET :26 · `Add(type="Fon")` GET :226 · `Add(Investment)` POST :256 · `Details(id)` GET :401 · `UpdatePrice` POST JSON :567 · `SellInvestment` POST JSON :659 · `CollectDividend` POST JSON :823 · `GetInvestmentInfo` GET :922 · `GetPortfolioSummary` GET :968.
Yan etkiler: **`ZT_BankIntroduction`'a `AccountType='Yatirim'` banka hesabı INSERT eder** (`CreateInvestmentBankAccount` :1210-1240), `ZT_BankTransactions` INSERT (:1271), bakiye UPDATE (:1298), `ZT_FinIncomeExpense` (:1318, :1360), `ZT_InterestCollections` (:720, :846).
CSS: `~/css/zt/timedeposits/index.css` (Index :12, Add :35, Details :24).

| View | Modal | Alanlar | Butonlar / AJAX |
|---|---|---|---|
| Index | `#updatePriceModal` "Fiyat Güncelle" (:438) `modal-sm` | hidden `#updatePriceInvestmentId`; `#newPrice` number step .0001 min 0 required | İptal; Güncelle → `GetInvestmentInfo` (:594) + `UpdatePrice` (:624) |
| Index | `#sellModal` "Yatırım Sat" (:468) | hidden `#sellInvestmentId`; `#sellTargetBank` select required (banks); `#sellDate` date; `#sellPrice` number; komisyon/stopaj; özet | `GetInvestmentInfo` (:642), `SellInvestment` (:712) |
| Details | `#updatePriceModal` (:467) | `#newPrice` | `UpdatePrice` (:656) |
| Details | `#dividendModal` "Temettü / Kupon Tahsilatı" (:494) | `#dividendType` (Temettu/Kupon), `#dividendTargetBank` required, `#dividendDate`, `#dividendGross`, `#dividendWithholding` (%15 ro), `#dividendNet` | `CollectDividend` (:705) |
| Details | `#sellModal` "Yatırımı Sat" (:555) | `#sellTargetBank`, `#sellDate`, `#sellPrice`, `#sellCommission`, `#sellWithholding`, `#sellGross`, `#sellNet` | `SellInvestment` (:766) |
Index tablosu: Kod · Tip · Yatırım Adı · Miktar · Alış Fiyatı · Güncel Fiyat · Maliyet · Güncel Değer · Kar/Zarar · Durum · İşlem (:299-309) + "Portföy Dağılımı" grafiği (:215).
Add formu (`#investmentForm`): InvestmentType, BankAccountID (hidden), InvestmentName, ISIN, SourceBankID, CurrencyID, WorkPlaceID, BranchProvinceID, PurchaseDate, Quantity, PurchasePrice, PurchaseCommission, Description (:160-326).

---

### A.4 Eşleme tablosu (ZTO öğe → Blackrose)

Blackrose referansları:
- Şema: `backend/src/main/resources/db/migration/tenant/V3__create_finance.sql:79-102` (`expense_type`, `expense_item` = id, code, name, audit, deleted — **açıklama/birim/güncelleme/silme yok**), `:212-233` (`settlement.expense_item_id`), `:160-178` (`purchase_invoice` — satırsız, tedarikçi carisine).
- API: `finance/web/FinanceController.java:466-496` (yalnız GET/POST `expense-types`, `expense-items`), DTO `FinanceDtos.java:317-327`; `SettlementService.java:226` (kalem doğrulama).
- UI: `frontend/src/pages/finance/DefinitionsPage.tsx:185-279` (`ExpenseSection`), `SettlementsPage.tsx:169-171, :256-259, :300`.
- Operasyonel giderler: `V6__create_fleet.sql:58-83` (`vehicle_expense`, `ExpenseKind` MAINTENANCE/REPAIR/TIRE/FUEL `fleet/domain/FleetTypes.java:61`), `V13__create_driver_app.sql:30-48` (`driver_expense`, `shipment_id` zorunlu, `trip_cost_id`, `receipt_file_id`), `V7__create_shipment.sql:150-171` (`trip_cost.vehicle_expense_id`), `shipment/service/LinkableExpenseService.java`; dosya: `V5__create_crm_and_files.sql:1` (`stored_file`); depo: `V8__create_warehouse.sql:4` (`warehouse`).
- Son migration: tenant `V21__opening_invoice.sql` → yeni migration **V22+**.

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| ExpenseItems/Index tablo | `DefinitionsPage.tsx:185-279` (MUI liste) | **UI+API-genişlet** — `GET /finance/expense-items` var; açıklama/birim/oluşturma tarihi yok |
| ExpenseItems/Add (Ad, Tür, Açıklama, Varsayılan Birim) | `FinanceController.java:485-496` POST, `SaveExpenseItemRequest` `FinanceDtos.java:322` (code+name+type) | **UI+yeni-tablo (V22)**: `expense_item.description VARCHAR(500)`, `default_unit VARCHAR(30)` kolonları + DTO genişletme; `code` zorunlu → UI'da ad'dan otomatik kod üret |
| Ad autocomplete `SearchExpenseItems` | yok | **UI+yeni-API** (`GET /finance/expense-items?q=`) ya da istemci tarafı filtre (liste küçük) → tercih: istemci |
| Benzersizlik `CheckExpenseItemExists(ForEdit)` | `expense_item_code_active_uq` (yalnız code) `V3:102` | **UI+API-genişlet**: ad için de benzersiz indeks (V22) + 409 hata kodu; UI aynı `#nameError/#nameSuccess` akışını sunucu yanıtıyla gösterir |
| ExpenseItems/Edit→Update | yok | **UI+yeni-API** `PUT /finance/expense-items/{id}` |
| ExpenseItems/Delete (GET, Key boşsa) | yok | **UI+yeni-API** `DELETE /finance/expense-items/{id}` (soft; settlement/expense referansı varsa 409). `Key` kavramı ÇIKAR (ZTO personel anahtarı) |
| Kalem = cari `MSR-{ID}` + "Masraf Hesapları" butonu | Blackrose `AccountType` enum'unda EXPENSE yok (`FinanceTypes.java:8-15`) | **ÇIKAR** (otomatik cari açma). Gerekçe: K7 tek masraf modelinde borç **tedarikçi carisine** yazılır, kalem yalnız sınıflandırmadır; "Masraf Hesapları" butonu kalemin masraf listesine (ExpenseGroupDetails karşılığı) yönlenir |
| ExpenseTypes (tanım) | `FinanceController.java:466-477` (GET/POST) | **UI+API-genişlet** (PUT/DELETE) |
| ProductionExpenses/IndexExpenses | yok (gruplu gider listesi yok) | **UI+yeni-API** `GET /finance/expenses/summary?groupBy=item&branchId=` |
| ProductionExpenses/ExpenseGroupDetails | yok | **UI+yeni-API** `GET /finance/expenses?expenseItemId=&currency=` |
| `#invoiceDetailsModal` / `GetExpenseDetails` | yok | **UI+yeni-API** `GET /finance/expenses/{id}` (satırlarla) |
| `#deleteConfirmationModal` / Delete GET | yok | **UI+yeni-API** `POST /finance/expenses/{id}/reverse` (Blackrose deseni: ters kayıt, `FinanceController.java:323` settlement reverse gibi); GET ile silme **ÇIKAR** |
| ProductionExpenses/Add+Edit başlık + detay kartları | `purchase_invoice` satırsız, kalemsiz | **UI+yeni-tablo (V22)** `expense` + `expense_line` (aşağıda A.5) |
| Doküman yükleme (≤10 MB, uzantı listesi) | `stored_file` (`V5:1`), `driver_expense.receipt_file_id` deseni | **UI+API-genişlet**: `expense.document_file_id` → mevcut dosya servisi; `/MaterialStockAll/GetFile` → Blackrose dosya ucu |
| Departman (sabit 15 değer) | yok | **UI+yeni-tablo (V22)**: `expense.department VARCHAR(30)`; değer listesi lojistiğe uyarlanır (Operasyon, Filo, Depo, Gümrük, İdari, Muhasebe, Satış, BT, İK, Diğer) |
| İş Yeri / Şube filtreleri | `branch` (`V1__create_branch.sql`) | **UI-mevcut-API** (`useBranches` `common.tsx:75`); ZTO WorkPlace+BranchProvince ikilisi → tek `branch` |
| Para birimi + sembol | `GET /finance/currencies` (`FinanceController.java:501`), `useCurrencies` `common.tsx:98` | **UI-mevcut-API** |
| Belge Türü (10 değer) | yok | **UI+yeni-tablo (V22)** `expense.document_type` |
| Üretim Bilgileri (Sipariş/Parti/Hat/Fire) | — | **ÇIKAR** — üretim modülü; yerini **bağlam seçici** alır (A.5) |
| Index takvim görünümü + son 6 ay grafiği | yok | **UI+yeni-API** `GET /finance/expenses/calendar?month=` ve `/finance/expenses/monthly?months=6` |
| `#reportModal` + `/productionexpenses/report` | — | **ÇIKAR** (ZTO'da action yok ⚠, buton gizli) |
| Index `#deleteConfirmModal` (tarih ile toplu sil) | — | **ÇIKAR** (ZTO'da çalışmıyor ⚠, buton gizli) |
| IndexExpenses `#deleteConfirmModal` | — | **UI+yeni-API** (reverse ucu ile aynı); ZTO'da tetikleyici yok ⚠ — modal bileşeni ortak `ZtoConfirmModal` ile karşılanır |
| `ZT_AccountDebts` upsert (kalem carisine) | `LedgerService`/`account_transaction` | **UI+API-genişlet**: gider kaydı tedarikçi `account_id` doluysa DEBIT/CREDIT ledger + isteğe bağlı `purchase_invoice` + ödeme planı; kur sabit 1 hatası düzeltilir (`ExchangeRateService`) |
| Investments (Index/Add/Details + 4 modal) | yok (fund/instrument var, yatırım portföyü yok) | **ÇIKAR** (aşağıda gerekçe) |

---

### A.5 ZT_ProductionExpenses(+Detail) → tek masraf modeli önerisi (K7)

Kural (03_MEVCUT_DOKUMAN_BOSLUK_ANALIZI:86-89): "operasyonel kayıt ayrı kalır, gider satırı tek masraf modeline yazılır; bağlam alanı araç/sefer/sürücü/genel".

**V22__create_expense.sql (öneri)**
```
expense (
  id UUID PK, branch_id UUID NOT NULL → branch,
  expense_item_id UUID NOT NULL → expense_item,      -- ZTO ExpenseItemID (tür, item üzerinden)
  context_type VARCHAR(20) NOT NULL,                 -- GENERAL | VEHICLE | SHIPMENT | WAREHOUSE | DRIVER
  context_id UUID NULL,                              -- vehicle/shipment/warehouse/driver id (GENERAL'de NULL)
  supplier_account_id UUID NULL → account,           -- ZTO'da yoktu; borç buraya
  source_type VARCHAR(30) NULL, source_id UUID NULL, -- VEHICLE_EXPENSE | DRIVER_EXPENSE | TRIP_COST | MANUAL | IMPORT
  invoice_number VARCHAR(50), invoice_date DATE NOT NULL, due_date DATE,
  document_type VARCHAR(30), department VARCHAR(30), description VARCHAR(500),
  currency CHAR(3) NOT NULL, exchange_rate NUMERIC(19,6) NOT NULL,
  net_amount, discount_amount, vat_amount, withholding_amount, other_tax_amount, total_amount, tl_amount NUMERIC(19,4),
  document_file_id UUID NULL → stored_file,
  purchase_invoice_id UUID NULL → purchase_invoice, settlement_id UUID NULL → settlement,
  status VARCHAR(20) (POSTED/REVERSED), audit + deleted,
  CHECK ((context_type='GENERAL') = (context_id IS NULL)),
  UNIQUE (source_type, source_id) WHERE deleted=false  -- aynı operasyonel kayıt iki kez gider olmaz
)
expense_line (
  id, expense_id → expense, line_no, description, quantity NUMERIC(19,4), unit VARCHAR(20),
  unit_price, sub_total, discount_rate, discount_amount, net_amount, vat_rate, vat_amount,
  withholding_amount, other_tax_amount, total_amount, audit
)
```
Eşleme: `ZT_ProductionExpenses` → `expense` (TotalAmount→total_amount, KdvRate/TaxAmount→vat_*, Discount/DiscountRate/DiscountAmount→discount_*, WithholdingTaxAmount, OtherTaxesAmount, InvoiceNumber/InvoiceDate/DueDate, CurrencyID→currency, WorkPlaceID→branch_id, Department, DocumentPath→document_file_id, ExpensesType/Category metinleri **atılır** (item'dan türetilir), OrdersID/LineID/MaterialLossesID/BatchNumber/ExpenseFloors/Unit/Quantity/UnitAmount başlık alanları **atılır**). `ZT_ProductionExpensesDetail` → `expense_line` birebir.
Bağlam UI'si: ZTO formundaki "Üretim Bilgileri" bölümünün **aynı yerinde ve aynı `.form-section` kalıbında** "Bağlam Bilgileri" bölümü: `Bağlam` select (Genel/Araç/Sefer/Depo/Sürücü) + bağlama göre ikinci select (araç plakası / sefer no / depo / sürücü). ZTO'daki "tür=Üretim ise göster" davranışı → "bağlam≠Genel ise göster" olur; tür gif ikonları (production/export/other) yerine Araç/Sefer/Depo/Genel ikonları.
Operasyonel kayıtlarla bağ: `vehicle_expense` (VEHICLE), onaylanan `driver_expense` (DRIVER/SHIPMENT), `trip_cost` (SHIPMENT) kaydedilirken servis katmanı `expense` satırı üretir (`source_type/source_id`); sefer kârlılığı `expense where context_type='SHIPMENT'` okuyabilir. Varsayılan kalem eşlemesi: `V3:107` seed'indeki VEHICLE tipinin FUEL/TOLL… kalemleri ↔ `ExpenseKind`.

### A.6 Investments kararı: **ÇIKAR** (ilk sürümde)
Gerekçe: (1) Nakliye KOBİ'sinin çekirdek akışı değil (fon/hisse/altın/tahvil portföyü); (2) ZTO uygulaması başka modüllere yan etkili ve hatalı desende — yatırım başına `ZT_BankIntroduction`'a sahte banka hesabı açar (:1210-1240), bakiye kolonunu doğrudan günceller (:1298), `ZT_FinIncomeExpense` (Blackrose'da karşılığı yok) yazar; (3) Blackrose'da fund/instrument modeli yatırım enstrümanı (ISIN, birim fiyat, temettü stopajı) taşımıyor → yeni 2 tablo + değerleme servisi gerekir; (4) envanter 01'de ayrıntılı envanterlenmemiş (:594). İleride gerekirse `investment` + `investment_movement` (V2x) ile, fon hareketini `fund_transaction` üzerinden yapan ayrı faz olarak ele alınır. Menüde `/Investments/Index` linki (`_SideMenu_FinanceItems.cshtml:182`) React menüsüne **konmaz**.

---

## BÖLÜM B — Ortak UI kabuğu ve CSS stratejisi

### B.1 ZTO finans sayfalarının yüklediği layout, partial, CSS ve JS

Layout seçimi view içinde role göre (E §5.3). Masraf/yatırım sayfaları: `_ExpertLayout` (Add/Edit/ExpenseGroupDetails/Investments Add-Details, role göre Index'ler), `_ProductionLayout` (Investments/Index; Index/IndexExpenses rol dalları), `_Layout` (Admin; ExpenseItems).

**Gerçek CSS çekirdeği (🆕 kesinleşti):** `wwwroot/Web/dist/css/styles.css` = **Start Bootstrap SB Admin v6.0.0 (MIT)** içine derlenmiş **Bootstrap CSS v4.4.1** (dosya başlığı satır 3-11; 196.808 bayt). SCSS kaynağı da repoda: `wwwroot/Web/src/scss/styles.scss`, `_variables.scss`, `navigation/sidenav/*`, `layout/_dashboard-fixed.scss`; `wwwroot/Web/package.json` → `"bootstrap": "4.4.1"`.
**Bootstrap JS:** `stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.bundle.min.js` (`_ExpertLayout.cshtml:1161`, `_ProductionLayout.cshtml:2195`) → CSS 4.4.1 / JS 4.3.1 karışık. Ek olarak sayfa bazında BS 5.1.3 (`ProductionExpenses/Index.cshtml:1101`) ve 4.6.2 (`_DataTablesScriptsPartial`). `wwwroot/lib/bootstrap` = v5.1.0 (layout'larca kullanılmıyor).

`_ExpertLayout.cshtml` sırası (head → body sonu):
| Satır | Kaynak | Sürüm |
|---|---|---|
| 25 | `_PwaHead` partial | — |
| 27-28 | `~/lib/microsoft-signalr/signalr.js`, `~/js/live-screen-share.js` | yerel |
| 29 | `~/css/layout.css` (11 KB; `body.sb-nav-fixed` :8) | yerel |
| 30 | `~/Web/dist/css/styles.css` | SB Admin 6.0.0 / BS 4.4.1 |
| 31 | `~/lib/datatables/css/dataTables.bootstrap4.min.css` | yerel |
| 32-35 | `~/css/introduction-audit.css` (`:root` :1), `definition-list.css` (`:root` :1, `body.definition-list-page` …), `definition-form.css` (`body.definition-form-page`), `zto-admin.css` (44 KB, `body.za-page`) | yerel |
| 36 | Google Fonts Plus Jakarta Sans + JetBrains Mono | CDN |
| 37 | Font Awesome **5.11.2 `js/all.min.js`** (SVG değiştirici) | cdnjs |
| 38-41 | Google Fonts Open Sans, Material Icons, Material Symbols Outlined | CDN |
| 574 | `~/css/account-actions.css` | yerel |
| 581 | `<body class="sb-nav-fixed [za-page]">` | |
| 583-1060 | partial: `_SideMenu_UserSwitchModal`, `_SpecialDayNavBadge`, `_StaleProductionNotify`, `_UserNotifications`, `_PwaInstallMenuItem` | |
| 1111-1114 | `_SideMenu_Garden`, `RenderBody()` | |
| 1160 | jQuery **3.4.1** | code.jquery.com |
| 1161 | Bootstrap **4.3.1** bundle | stackpath |
| 1162-1166 | `~/js/layout-account-actions.js`, `introduction-details.js`, `introduction-audit-popover.js`, `~/Web/dist/js/scripts.js` (sidenav toggle) | yerel |
| 1163 | `_DefinitionDetailsModal` | |
| 1167-1169 | Chart.js **2.8.0** + SB Admin demo grafik betikleri | cdnjs / yerel |
| 1170-1172 | DataTables **1.10.20** + `dataTables.bootstrap4` + `datatables-demo.js` | cdn.datatables.net |
| 1176-1190 | Buttons **2.2.2** (css+js, html5, print), JSZip **3.1.3**, pdfmake **0.1.53** + vfs_fonts | CDN |
| 1192-1198 | select2 **4.1.0-rc.0** (css+js) + `select2-bootstrap-theme@0.1.0-beta.10` | jsDelivr |
| 1242-1275 | **Global select2**: `select.form-control:not(.no-select2):not(.select2-tags)` ve modal içindekiler otomatik select2 olur | inline |
| 1713-1717 | `_PasswordChangeModal`, `_LicenseWarning`, `_ConnectionMonitor`, `_ZtoAssistant`, `_AppUpdateNotifier` | |
| 1722 | `RenderSection("Scripts")` | |
`_ProductionLayout.cshtml` aynı küme (head :32-55, scripts :2194-2239) + `~/css/signalrchat.css` (:45), Roboto (:43), jQuery **3.6.4** (:2194), SignalR 6.0.0 CDN (:2239).
View'ların kendi yükledikleri: jQuery 3.6.0 (`ExpenseItems/Index:98`, `Add:181`, `ProductionExpenses/*`), animate.css 4.1.1 (`IndexExpenses:33`), BS 5.1.3 + flatpickr + Chart.js@latest (`Index:1101-1106`), `~/css/zt/timedeposits/index.css` (Investments).
Not: view sonunda yeniden yüklenen jQuery 3.6.0 RenderBody içinde, layout jQuery'sinden **önce** çalışır; DataTables eklentisi sonra yüklenen layout jQuery'sine bağlanır — `$(document).ready` geç çözüldüğü için tesadüfen çalışıyor. React tarafında bu zincir taşınmaz.

Masraf/yatırım view'larında **kullanılmayan**: `wwwroot/css/zt/*` (Investments hariç: `css/zt/timedeposits/index.css`), `wwwroot/js/zt/*` (yalnız `companyexpensedetails/` adı masrafa yakın, bu view'lardan çağrılmıyor), toastr/SweetAlert (bu üç modülde yok; native `alert/confirm`).

### B.2 Ortak JS davranışları → React karşılığı

| ZTO davranışı | Nerede | React karşılığı (öneri) |
|---|---|---|
| Sayı biçimi tr-TR (`ToString("N2")`, `toLocaleString`) | tüm view'lar | Mevcut `formatAmount/formatMoney` `frontend/src/pages/finance/common.tsx:52-63` (`Intl.NumberFormat("tr-TR")`) — yeniden kullan |
| Tutar girişleri `type=number step=0.01` (nokta ondalık) | ProductionExpenses Add/Edit | Aynı native input (görünüm birebir); `normalizeAmount` `common.tsx:48` ile sunucuya |
| Detay kartı hesapları (ara toplam/iskonto/KDV/tevkifat/genel toplam) | Add :1295-1365 | Saf TS modülü `expenseCalc.ts` (vitest ile test) + `useFieldArray` (react-hook-form) |
| Global select2 (her `select.form-control`) | `_ExpertLayout:1242-1275` | `ZtoSelect` bileşeni: select2 **DOM/sınıf yapısını** (`span.select2.select2-container.select2-container--bootstrap > .select2-selection--single`, açılır `.select2-dropdown` + `.select2-search__field` + `.select2-results__option--highlighted`) üreten headless bileşen (Downshift MIT veya elle); select2 4.1.0-rc.0 CSS + select2-bootstrap-theme CSS kapsamlı paket içine. `.no-select2` olanlar native select kalır |
| DataTables (sıralama, arama, sayfalama, `lengthMenu`, `dom`, dil tr) | tüm listeler | **TanStack Table (MIT, headless)** + DataTables'ın **aynı markup'ı**: `div.dataTables_wrapper.dt-bootstrap4 > .row > .dataTables_length / .dt-buttons / .dataTables_filter`, `table.dataTable`, `th.sorting/_asc/_desc`, `.dataTables_info`, `.dataTables_paginate > ul.pagination > li.paginate_button.page-item`. `dataTables.bootstrap4.min.css` + `buttons.dataTables.min.css` kapsamlı pakete. Türkçe metinler i18n'e (CDN json yok) |
| Buttons: Kopyala / Excel / Yazdır / PDF (son kolon hariç, başlık ekleme) | IndexExpenses :1815-1850, EGD | Kopyala: `navigator.clipboard` (TSV); Excel: **exceljs** (MIT) veya SheetJS CE (Apache-2.0, npm'deki 0.18.5 eski — cdn.sheetjs.com tarball'ı vendor edilmeli); PDF: **pdfmake 0.2.x** (MIT, vfs_fonts paketle; CSP uyumlu, eval yok); Yazdır: gizli print bileşeni + `window.print()` + `@media print` |
| Modal açma/kapama, `data-dismiss`, ESC, backdrop | tüm modallar | **react-bootstrap 1.6.x** (Bootstrap 4 işaretlemesi; MIT) `Modal` — `container={ztoRootRef}` ile backdrop'u `.zto-finans` köküne portal'la (B.3) — veya kendi `ZtoModal` (`div.modal.fade.show > .modal-dialog > .modal-content`) |
| Modal üstüne modal | (masrafta yok) | react-bootstrap ModalManager z-index artırımı; ZTO z-index'leri (1040/1050) MUI AppBar'ın (1201) altında kalır → kapsamda `.modal-backdrop{z-index:1390}` `.modal{z-index:1400}` (MUI modal 1300, snackbar 1400, tooltip 1500 arası) |
| Onay: native `confirm()` / `alert()` | ExpenseItems Index:71, PE Add :1112-1407, Edit :1126 | Akış birebir: native `window.confirm/alert` CSP'ye takılmaz; daha iyisi ortak `ZtoConfirmModal` (ZTO `#deleteConfirmationModal` görünümünde) |
| Tooltip (`data-toggle="tooltip"`, `data-bs-toggle`) | IndexExpenses :1857, Add :421 | react-bootstrap `OverlayTrigger`+`Tooltip` (BS4 `.tooltip.bs-tooltip-top` markup) |
| Para birimi popover (`#currencyTooltipContainer`) | IndexExpenses :1296 | Aynı DOM'u üreten küçük bileşen (konumlama `getBoundingClientRect`) |
| Takvim (elle yazılmış ay ızgarası) | PE Index | Aynı markup'la elle React bileşeni (kütüphane yok) |
| flatpickr tarih aralığı | yalnız `#reportModal` (ÇIKAR) | gerek yok; diğer tüm tarihler native `type=date` |
| Grafik Chart.js (layout 2.8.0, sayfa @latest) | PE Index yığılı bar, Investments pasta | **chart.js 4.x + react-chartjs-2** (MIT) — tek sürüm |
| Font Awesome `<i class="fas fa-...">` | her yerde | **@fortawesome/fontawesome-free 5.15.x CSS + webfonts** (yerel). ⚠ `all.min.js` (SVG değiştirici) React'te **kullanılmamalı**: `<i>`'yi `<svg>` ile değiştirip React reconciliation'ı bozar |
| animate.css sınıfları | IndexExpenses | Kullanılan birkaç keyframe kapsamlı CSS'e elle kopyalanır |
| Sürükle-bırak dosya alanı | PE Add `#DocumentUploadArea` | Native drag events + aynı markup; boyut/uzantı kuralı zod ile |
| Şube/iş yeri filtresi → sayfa yenileme | tüm masraf listeleri | URL search params (`useSearchParams`) + TanStack Query anahtarı |
| XSS yardımcıları (ScriptJson, esc) | tüm view'lar | React varsayılan kaçışı; `dangerouslySetInnerHTML` yasak |

### B.3 Blackrose frontend kabuğu ve kapsamlama tekniği

**Mevcut durum**
- `frontend/index.html`: yalnız `#root`, harici kaynak yok.
- `frontend/src/main.tsx`: `ThemeProvider(theme)` + **`<CssBaseline/>`** (global `html/body` reset) + fontlar `@fontsource` ile paketli (yorum: "CSP yalnız kendi alan adına izin verir").
- `frontend/src/theme.ts`: MUI teması (Plus Jakarta Sans gövde, Sora başlık, `MuiTableCell`, `MuiDialog` borderRadius 16 …).
- `frontend/src/components/AppShell.tsx:116-160`: `AppBar position=fixed zIndex drawer+1`, kalıcı `Drawer`, `<Box component="main" p={{xs:2,md:3}}>` + `SuspenseOutlet`.
- `frontend/src/pages/finance/FinanceLayout.tsx`: MUI `Tabs` + `SuspenseOutlet`; rotalar `App.tsx:224-245` (`/finance/*`, `RequirePermission FINANCE_VIEW`).
- `frontend/vite.config.ts`: yalnız `@vitejs/plugin-react`; **PostCSS yapılandırması yok**, global CSS dosyası yok (`*.css` importu yalnız fontsource).
- **CSP** `frontend/nginx/security-headers.conf:6`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'` + `X-Frame-Options DENY` (:14).
  Sonuçlar: (1) **hiçbir CDN** (Bootstrap, DataTables, Google Fonts, cdnjs FA, datatables i18n json) yüklenemez → hepsi npm/vendor + Vite paketine; (2) inline `<script>`/`eval` yok → jQuery eklentisi tarzı satır içi init yok; (3) satır içi `style=""` ve `<style>` **serbest** (`'unsafe-inline'`) → ZTO'daki satır içi stiller React `style` prop'u olarak taşınabilir; (4) `X-Frame-Options DENY` aynı kökenli **iframe'i de engeller** → iframe izolasyonu seçenek değil.

**Değerlendirilen teknikler**

| Teknik | Nasıl | Artı | Eksi |
|---|---|---|---|
| **1. Derleme anında önek sarma (PostCSS `postcss-prefix-selector`)** | Bootstrap 4.4.1/SB Admin CSS + dataTables.bootstrap4 + buttons + select2(+theme) + FA5 + ZTO `layout.css`/`zto-admin.css` gerekli kısımları + view'lardaki `<style>` blokları tek `zto-finans.css` olarak vendor edilir; her seçici `.zto-finans ` ile öneklenir; `transform` ile `html`, `body`, `:root` → `.zto-finans` (kökün kendisi), `body.modal-open X` → `.zto-finans.modal-open X` | Basit, CSP uyumlu (paketli CSS), MUI sayfalarına sızmaz, tarayıcı desteği tam, Vite'ta yalnız ZTO rota chunk'ı yüklenince eklenir | Özgüllük +1 sınıf artar (ZTO içi kendi aralarında tutarlı, sorun değil); `@font-face`/`@keyframes` adları global kalır (çakışma riski düşük, gerekirse `zto-` ad öneki); rem birimleri `html` font-size'a bağlı (MUI de 16px → aynı) |
| 2. Sass ile iç içe import (`.zto-finans { @import "bootstrap" }`) | SB Admin SCSS kaynağı (`wwwroot/Web/src/scss`) zaten repoda | Değişkenler korunur | `html/body` kuralları `.zto-finans body` olur (eşleşmez) → reboot kaybolur; ZTO view CSS'leri için yine PostCSS gerekir |
| 3. CSS Cascade Layers (`@layer zto`) tek başına | Bootstrap'ı alt katmana koy | MUI emotion (katmansız) her zaman kazanır | **Kapsamlamaz**: `.row`, `a`, `h5`, `.btn` kuralları MUI sayfalarına da uygulanır → tek başına reddedilir; 1 ile **birlikte** emniyet katmanı olarak kullanılabilir |
| 4. Native `@scope (.zto-finans)` | | Standart | Firefox desteği yeni (≥2025 sonu sürümleri) ⚠ doğrulanmalı; eski tarayıcıda tümden sızar; `body` kurallarını yine elle ele almak gerekir |
| 5. Shadow DOM | `.zto-finans` kökü `attachShadow`, CSS `adoptedStyleSheets` | Tam izolasyon (iki yönlü) | React portal/odak/olay retarget karmaşıklığı, `@font-face` belge düzeyinde olmalı, react-bootstrap Modal/Overlay'in container'ı shadow root'a ayarlanmalı, MUI Snackbar/i18n bileşenleri içeride emotion cache ister, Playwright seçicileri, yazdırma (print CSS shadow içinde sorunlu); maliyet yüksek |
| 6. iframe | | Tam izolasyon | `X-Frame-Options DENY` + `frame-ancestors 'none'` engeller → **elenir** |

**MUI/emotion ile etkileşim:** Emotion stilleri `<head>` içine çalışma anında eklenir (CSP `'unsafe-inline'` bunun için açık). ZTO kökü içinde MUI bileşeni **kullanılmaz** (aksi halde `.zto-finans button`, `.zto-finans a`, `.zto-finans table` öğe seçicileri MUI'yi bozar). Kökün dışındaki AppShell/Drawer/AppBar etkilenmez çünkü tüm kurallar `.zto-finans` torunu olmayı şart koşar. `CssBaseline` `body` font/arka planını ayarlar; ZTO'nun reboot `body` kuralları önek dönüşümüyle `.zto-finans`'a taşındığı için içeride ZTO fontu (Open Sans/Plus Jakarta, 1rem, #212529) geçerli olur.

**Bootstrap'ın body düzeyi davranışları:**
- `body.modal-open { overflow:hidden }` ve `.modal-backdrop` body'ye eklenir → react-bootstrap `Modal container={rootEl}` ile backdrop ve `.modal` `.zto-finans` kökü **içine** portal'lanır; ModalManager `modal-open` sınıfını container'a ekler → önekli kural `.zto-finans.modal-open` ile eşleşir. Kaydırma kilidi için ayrıca `document.body.style.overflow` (react-bootstrap zaten yapar).
- `position:fixed` backdrop, kökün atasında `transform/filter` yoksa viewport'u kaplar (AppShell `main` Box'ta yok ✓).
- z-index: BS4 backdrop 1040 / modal 1050 < MUI AppBar 1201 → kapsamda yükseltme (B.2).
- Tooltip/popover/dropdown (Popper) container'ı da kök olmalı.

**Önerilen düzen (karar):** **Teknik 1 (PostCSS önek sarma) + Teknik 3 (`@layer zto-vendor, zto-pages`) emniyet katmanı.**

> **Uygulama notu (2026-11-13, Faz 12.0):** Teknik 3 (`@layer`) ve 2. adımdaki "`@keyframes` adlarına `zto-` öneki" **uygulanmadı** — geçersiz. Katmansız CssBaseline'ın `*{box-sizing:inherit}` kuralı katmanlı Bootstrap'ı ezer; `zto-vendor, zto-pages` gibi çok katmanlı düzende !important sırası tersine döner. Yalnız Teknik 1 kullanılır; CSS `@import` sırası ZTO `_ExpertLayout` ile birebirdir (layout.css → styles.css → dataTables → layout satır içi stili → sayfa CSS'leri → buttons → select2 → select2-bootstrap). Aynı `@keyframes` adının farklı gövdeyle iki kez tanımlanması `npm run check:zto-css` ile yakalanır. Ayrıntı: `frontend/src/zto/styles/prefixTransform.ts`.
1. `frontend/src/zto/styles/vendor/` altına (lisans başlıklarıyla) Bootstrap 4.4.1 (SB Admin `styles.css` derlemesi veya `bootstrap@4.4.1/dist/css/bootstrap.css` + SB Admin sidenav SCSS çıktısı), `dataTables.bootstrap4.min.css`, `buttons.dataTables.min.css` (2.2.2), `select2.min.css` (4.1.0-rc.0) + `select2-bootstrap.min.css` (0.1.0-beta.10), FA Free 5.15.x CSS+webfonts, `layout.css`, ilgili `zto-admin.css` parçaları; `frontend/src/zto/styles/pages/` altına view `<style>` bloklarının kopyası (ör. `pe-*`, `.form-section`, `.material-*`, `.summary-card`, `.group-header`, `timedeposits/index.css`).
2. `vite.config.ts` `css.postcss.plugins`: `postcss-prefix-selector({ prefix: '.zto-finans', includeFiles: [/src\/zto\/styles/], transform })` — `html|body|:root` → `.zto-finans`, `body.x` → `.zto-finans.x`, `@keyframes` adlarına `zto-` öneki; `postcss-import` ile tek giriş.
3. `ZtoFinansRoot` bileşeni: `<div className="zto-finans sb-nav-fixed" ref={rootRef}>` + `ZtoPortalContext` (Modal/Overlay container'ı); `import "./styles/zto-finans.css"` yalnız bu bileşenin lazy chunk'ında.
4. Rotalar: `App.tsx` içinde `AppShell` altında ayrı ağaç (ör. `/finans/*` veya `/finance/*` içinde ZTO görünümlü sayfalar `FinanceLayout`'un MUI Tabs'i yerine ZTO `_NavMenu_Finance` nav-tabs karşılığı `ZtoFinanceNav` ile). Dış kabuk Blackrose AppShell kalır; ZTO'nun `_SideMenu_*` rol menüleri **taşınmaz** (Blackrose Drawer + izinler); sayfa içi nav-tabs/breadcrumb birebir taşınır.
5. Fontlar: Open Sans, Material Icons → `@fontsource/open-sans`, `@fontsource/material-icons` (CSP `font-src 'self'`); Plus Jakarta zaten var.
6. Sayfa içi kodda jQuery/Bootstrap JS **yok**; davranış React bileşenleriyle (B.2).
7. Görsel doğrulama: Playwright ekran görüntüsü karşılaştırması (ZTO ekran görüntüsü ↔ React sayfası) — `frontend/playwright.config.ts` mevcut.

### B.4 Lisans notları (kopyalanacak üçüncü taraf CSS/JS)

| Bileşen | Sürüm (ZTO) | Lisans | Not |
|---|---|---|---|
| Start Bootstrap SB Admin | 6.0.0 (`wwwroot/Web/LICENSE`, `styles.css:2-5`) | MIT | Başlık korunmalı |
| Bootstrap CSS / JS | 4.4.1 / 4.3.1 | MIT | |
| DataTables + bootstrap4 + Buttons | 1.10.20 / 2.2.2 (sayfalarda 1.13.7/2.4.2) | MIT | **DataTables Editor (ücretli) kullanımı yok** — `Views` ve `wwwroot/js` taramasında `dataTables.editor` bulunmadı. React'te yalnız CSS'i (MIT) alınacak |
| JSZip | 3.1.3 / 3.10.1 | MIT veya GPLv3 (çift) | MIT seçilir |
| pdfmake | 0.1.53 / 0.2.7 | MIT | `vfs_fonts` Roboto (Apache-2.0) |
| select2 / select2-bootstrap-theme | 4.1.0-rc.0 / 0.1.0-beta.10 | MIT / MIT | Yalnız CSS |
| Chart.js | 2.8.0 / 4.x | MIT | |
| Font Awesome Free | 5.11.2 (CDN js) | İkonlar CC BY 4.0, fontlar SIL OFL 1.1, kod MIT | Atıf CSS başlığında kalmalı. 🆕 `Views/Factory3D/Empty.cshtml:23` `kit.fontawesome` (Kit — hesap bağlı, Pro olabilir) finans dışında; kopyalanmaz |
| flatpickr | sürümsüz | MIT | Gerekmiyor (ÇIKAR) |
| animate.css | 4.1.1 | ⚠ doğrulanmalı (4.0.x Hippocratic License'a geçmişti; sonraki sürümlerin MIT'e dönüşü kontrol edilmeli) | Dosya kopyalamak yerine kullanılan 2-3 keyframe elle yazılsın → risk sıfır |
| Google Fonts (Open Sans, Plus Jakarta, JetBrains Mono, Roboto), Material Icons/Symbols | — | SIL OFL / Apache-2.0 | @fontsource ile paketle |
| jQuery | 3.4.1–3.6.4 | MIT | Kullanılmayacak |
| Highcharts | `Views/Device`, `Views/Lines` (finans dışı) | **Ticari** | Finans kapsamında yok; kopyalanmamalı |
| SheetJS | `wwwroot/lib/xlsx` | Apache-2.0 (CE) | Tercihen exceljs (MIT) |
| ZTO'nun kendi CSS'leri (`layout.css`, `zto-admin.css`, `css/zt/*`, view `<style>`) | — | Şirket içi | Aynı sahiplik; sorun yok |
| `wwwroot/ProductionExpenses/*.gif` (2.4 MB) | — | ⚠ kaynak/lisans BULUNAMADI | Animasyonlu gif'ler stok kaynaktan olabilir; yerine MUI-dışı yerel SVG ikon önerilir |

---

## Bilinmeyenler / doğrulanacaklar
- `/productionexpenses/report` action'ı ⚠ BULUNAMADI (ölü buton).
- `/productionexpenses/delete?date=` uç karşılığı ⚠ BULUNAMADI.
- `wwwroot/js/datatable/tr.json` ⚠ BULUNAMADI (ExpenseItems dil dosyası 404).
- `InvoiceDate`/`DueDate` form girişi ⚠ BULUNAMADI (hep NULL yazılıyor).
- IndexExpenses `#deleteConfirmModal` tetikleyicisi görünür listede ⚠ BULUNAMADI.
- animate.css 4.1.1 lisansı ve `ProductionExpenses/*.gif` kaynağı ⚠ doğrulanmalı.
- `@scope` Firefox desteği ⚠ doğrulanmalı (öneri buna dayanmıyor).

## 10 satır özet
1. ExpenseItems 3 view (Admin, modal yok); ProductionExpenses 5 view / 5 modal (2'si ölü uçlu: report, tarihle silme); Investments 3 view / 5 modal.
2. Blackrose'da yalnız `expense_type/expense_item` GET/POST + `settlement.expense_item_id` var; açıklama/birim, PUT/DELETE, gider başlık/satır tablosu yok.
3. Öneri V22: `expense` (+`expense_line`) — `context_type` GENERAL/VEHICLE/SHIPMENT/WAREHOUSE/DRIVER + `context_id`, `source_type/source_id` ile vehicle/driver/trip_cost bağlanır, borç tedarikçi carisine.
4. ZTO'nun "kalem = cari MSR-{ID}" deseni ve üretim alanları (sipariş/hat/fire) ÇIKAR; form aynı yerde "Bağlam Bilgileri" bölümüyle.
5. Investments ÇIKAR: çekirdek değil, banka tablosuna sahte hesap açıyor, Blackrose'da karşılık modeli yok.
6. ZTO'nun gerçek CSS'i SB Admin 6.0.0 içinde Bootstrap **4.4.1**; JS 4.3.1; sayfalarda 5.1.3/4.6.2 karışıklığı var — React'te tek BS4 işaretlemesi.
7. CSP (`script-src 'self'`, `font-src 'self'`, XFO DENY) tüm CDN'leri ve iframe'i engeller; her şey vendor/npm, stil inline serbest.
8. Kapsamlama: PostCSS `postcss-prefix-selector` ile `.zto-finans` önek + html/body→kök dönüşümü (`@layer` emniyeti uygulanmadı, bkz. B.3 uygulama notu); Shadow DOM/iframe reddedildi.
9. Modallar react-bootstrap 1.6 `container=.zto-finans`; z-index MUI AppBar (1201) üstüne çekilmeli; FA `all.min.js` değil CSS webfont; select2/DataTables markup'ı TanStack Table + headless select ile birebir.
10. Lisans: tümü MIT/OFL/CC-BY; DataTables Editor yok; Highcharts (ticari) ve FA Kit finans dışı, kopyalanmaz; animate.css ve gif'ler doğrulanmalı.
