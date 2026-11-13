# ENV-F — Araç / CMR / Araç Takip / Dış Entegrasyon Analizi (ZTO Fabrika → ZTO LOGISTIC zemini)

> Salt okunur analiz. Proje kökü: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. Aşağıdaki yollar bu köke görelidir.
> Kural: yalnızca kodda görülen yazıldı; görülemeyen `⚠ BULUNAMADI` ile işaretlendi. Gizli değerler `__PLACEHOLDER__`.
>
> **Genel not — kolon tipleri:** `TransportCompany`, `TransportTruck`, `TransportChauffeur`, `SupplierTruck`, `SupplierChauffeur`, `SupplierTrader`, `ZT_Chauffeur`, `ZT_UsedPlate`, `ZT_SalesTruck`, `ZT_ExpertReportTruck*`, `ZT_CustomerCMR3/13`, `ZT_CustomerLocation`, `ZT_LocationPricing` tablolarının **`CREATE TABLE` DDL'i repoda yok** (`*.sql` ve `*.cs` içinde tarandı; yalnız `ZT_ExpertReportTruckOutOfUse` ve `ZT_ExpertReportTruckGardenRevision` DDL'i çıktı). Bu tablolarda verilen tipler **C# model sınıflarından** alınmıştır; gerçek PostgreSQL tipi `⚠ BULUNAMADI`. DDL'i repoda olan tablolar (`ZT_CasusCihaz`, `ZT_HksBildirim`, `ZT_RecipeShipment` ek kolonları, ZtoHal kolonları) için tipler gerçektir.
>
> **Genel not — çok kiracılılık:** Her müşteri (tenant) ayrı PostgreSQL veritabanıdır; web isteklerinde bağlantı dizesi `HttpContext.Session.GetString("userDatabase")` ile alınır (ör. `Controllers/AccountingPurchasesController.cs:1319`). Merkezî yönetim veritabanı `ZTO_ADMIN` (`GlobalVeriables.adminDatabase`) içinde `Customers` tablosu tenant kaydını tutar (`Controllers/Methods.cs:194-211`).

---

## 1. Araç bazlı rapor / finans ("sefer maliyetinin kalbi")

**ÖNEMLİ KAPSAM TESPİTİ:** `ExpertReportTruck` = **bahçeden/tedarikçiden fabrikaya gelen hasat aracı** (alım tarafı, "Eksper Raporu"na bağlı). Satış sevkiyatı aracı değildir; satış sevkiyatı `ZT_SalesTruck`'tır (bkz. §4). Yani "araç bazlı finans" iki ayrı yerde yaşar: alım (bu bölüm) ve satış (§4).

### 1.1 Action'lar — `Controllers/AccountingPurchasesController.cs`

| Action | Satır | Ne yapar |
|---|---|---|
| `ExpertReportTruck(int id)` | 129 | Bir eksper raporunun araçlarını listeler. `ZT_ExpertReportTruck` + `ContainerType` (kasa/palet) + `ZT_Chauffeur` JOIN, `ExpertReportID=@id AND Status=true` (189-216). Araç başına kesim çavuşları `ZT_UsedHarvestManager`→`ZT_HarvestManager` (229-236). |
| `AllTruck(days, branchId, workPlaceId)` | 820 | Tüm araçların finans özet listesi. `ZT_ExpertReportTruck.*` + `ZT_ExpertReportTruckFinance` (Net/UnitPrice/TotalPrice/Wastage) + `ZT_Purchases`, `Supplier`, `ZT_Expert`, `ZT_AccountDebts`, `ZT_DistributedPallet` (1017-1176). Nakliye firması **plaka üzerinden** bulunur: `TransportTruck.Plate = ZT_ExpertReportTruck.Plate` (1120-1129), cari hesap `ZT_CustomerAccounts.ReferenceID = TransportCompany.ID AND AccountGroup='Nakliye Firması'` (1134). |
| `GetTruckPallets(int truckId)` | 1317 | `ZT_ExpertReportTruck.NetAmount` + `ZT_DistributedPallet` (ID, PalletNo, NetAmount, GrossAmount, ContainerCount, Quality, Calibre, StockStatus, TrashType, CastingStatus) `WHERE ExpertReportTruckID=@truckId AND Status=true` (1326-1339). |
| `GetTruckFinance(int truckId)` | 1374 | Roller: Eksper, Admin, Eksper Şefi, Muhasebe (Alış), Finans(normal), Finans(super) (1372). Kayıt yoksa `CreateTruckFinanceRecord` ile oluşturur (1393-1396, 1488-1549). `ZT_ExpertReportTruckFinance f` + `ZT_ExpertReportTruck t` + `ZT_ExpertReport er` + `ZT_AccountDebts ad ON ad.ReferenceID = f.ID AND ad.AccountingType='Tedarikçi'` (1398-1419). |
| `UpdateTruckFinance([FromBody] ExpertReportTruckFinance)` | 1553 | Finans kaydını günceller (1605-1633), paletleri (Stok/İade/Çöp) günceller (1670-1698), tedarikçi carisine borç yazar/günceller (1702-1796). |
| `GetTruckDeleteInfo` / `DeleteTruck` | 1833 / 2015 | Silme öncesi bağlı borçları listeler (nakliye masrafları: 1895-1912) ve siler (`ZT_AccountDebts`, `ZT_UsedHarvestManager`, `ZT_ExpertReportTruckExpenses`, `ZT_ExpertReportTruckFinance`, `ZT_DistributedPallet`: 2038-2137). |
| `UpdateTruckArrivalDate` | 2180 | `ZT_ExpertReportTruck` geliş tarihi güncelleme (2202). |
| `ExpertReportTruckExpenses` (AccountingPurchasesController içinde) | — | `⚠ BULUNAMADI` — bu adla action bu controller'da yok. Masraf ekranı ayrı controller'dadır: `Controllers/ExpertReportTruckExpensesController.cs:28` (`Index(string id, string eid)`). |

### 1.2 Tablolar ve kolonlar

**`ZT_ExpertReportTruck`** (model `Models/ZT/ExpertReportTruck.cs:5-179`; INSERT `Controllers/ExpertReportTruckController.cs:~274`)
- INSERT'te görülen kolonlar: `Plate`, `ChauffeurID` (→`ZT_Chauffeur.ID`), `PalletCount`, `BoxCount`, `OutgoingPalletCount`, `OutgoingBoxCount`, `Reason`, `Status`, `ExpertReportID` (→`ZT_ExpertReport.ID`), `CreationDate`, `PalletID`, `ContainerID` (→`ContainerType.ID`), `WorkerCount`, `ServiceCount`, `TruckArrivalStatus` (ilk değer sabit: `'Eksper tarafından araziye yönlendirildi'`), `HarvestStart`, `HarvestEnd`.
- Diğer kullanımlardan görülen kolonlar: `NetAmount`, `GrossAmount`, `ArrivalDate`, `WastagePercentTruck`, `AccountingPurchasesApprove`, `AccountingPurchasesApproveDate` (`ExpertReportTruckExpensesController.cs:2105, 2114`), `PurchasesID` (`Services/ShipmentLedger/SlSql.cs:128`), `HKS_*` alanları (model 160-179; migration `SQL_Migrations/2026_07_10_ZT_ExpertReportTruck_HksFields.sql`).
- Durum: `TruckArrivalStatus` metin; görülen diğer değer `'Palet dağıtımı yapıldı'`. Tam değer kümesi `⚠ BULUNAMADI` (parametreyle yazılan yerler taranmadı).
- **Plaka serbest metin**; `TransportTruck` / `ZT_UsedPlate` ile FK yok, eşleşme yalnız metin eşitliğiyle.

**`ZT_ExpertReportTruckFinance`** (model `Models/ZT/ExpertReportTruckFinance.cs:6-45`; INSERT `AccountingPurchasesController.cs:1531-1535`; UPDATE 1605-1633)
- `ID`, `ExpertReportTruckID` (FK), `NetAmount` (double?), `UnitPrice` (double?), `TotalPrice` (double?), `WastagePercent` (decimal?), `FinanceStatus` ('Oluşturuldu' → 'Güncellendi'), `CreatedBy`, `CreationDate`, `Status`.
- Müstahsil makbuzu kesintileri: `IncomeTaxWithholdingRate/Amount` (stopaj), `PastureFundRate/Amount` (mera fonu), `SocialSecurityPremiumDeductionRate` / `SocialSecurityPremiumDeduction` (Bağ-Kur), `ExchangeRegistrationFeeRate` / `ExchangeRegistrationFee` (borsa tescil), **`CommissionRate` / `CommissionAmount` (komisyon)**, `OtherDeductionsAmount`.
- Fatura alanları: `TotalPriceExcludingVAT`, `VATRate`, `VATAmount`, `TotalPriceIncludingVAT`, `DiscountRate`, `DiscountAmount`, `WithholdingTaxAmount`, `OtherTaxesAmount`.
- Hesap: ilk kayıtta `TotalPrice = Net × (1 − Fire/100) × BirimFiyat` (1522-1528); fire önceliği `WastagePercentTruck` → `ZT_ExpertReport.WastagePercent` (1516-1517); güncellemede belge türü kesintisizse `(Net − İade/Çöp) × (1 − Fire/100) × BirimFiyat` sunucu tarafında (1590-1596), belge türü `Müstahsil Makbuzu / Alış Faturası / E-Fatura / Hizmet Faturası` ise frontend'in gönderdiği `TotalPrice` kullanılır (1570-1588).
- **Döviz kolonu yok**; cariye `CurrencyID=1`, `ExchangeRate=1.0000` sabit yazılır (1758-1759, 1786-1787).

**`ZT_ExpertReportTruckExpenses`** — araç bazlı **nakliye/servis masrafı** (model `Models/ZT/ExpertReportTruckExpenses.cs:5-37`; INSERT `Controllers/ExpertReportTruckExpensesController.cs:969-980`)
- `ID`, `ExpertReportTruckID` (FK), `WorkPlaceID`, `LocationPricingID` (→`ZT_LocationPricing.ID`, nullable), `LocationPricingName`, `ServicePricing` (int), **`TransportLocationPricing` (int — mevki bazlı nakliye/navlun bedeli)**, `OtherPricing` (int), `CurrencyID`, `Description`, `Status`, `CreationDate`, `InvoiceAmount`, `KDVAmount`, `WithholdingTax`, `TotalAmount`, `AdvanceAmount`, `RemainingAmount`, `DeductionAmount`, `PaidAmount`, `BalanceAmount` (decimal; hepsi frontend'de hesaplanıp gönderilir — 994-1003).
- Model'de `DocumentType`, `DocumentNo` da var (33-34) ama INSERT kolon listesinde **yok**; yalnız cari borç kaydına yazılır (1071-1081, 1104-1111).

**`ZT_ExpertReportTruckBarcode`** (`Models/ZT/ExpertReportTruckBarcode.cs:5-58`), **`ZT_ExpertReportTruckMaterialTracking`** (`Models/ZT/ExpertReportTruckMaterialTracking.cs:5-20`: `ExpertReportTruckID`, `Description`, `MaterialDeliveryTruckPlate`, `DeliveryDate`, `Status`, `CreationDate`). Tablo adları model adından çıkarımdır; INSERT'leri taranmadı → tablo adı `⚠ DOĞRULANMADI`.

**`ZT_UsedHarvestManager`** (kesim çavuşu–araç bağı): `HarvestManagerID`, `ExpertReportID`, `ExpertReportTruckID`, `Status`, `CreationDate` (`ExpertReportTruckController.cs:~296`).

### 1.3 Cariye yansıma (ZT_AccountDebts)

Ortak desen: **`ZT_AccountDebts.ReferenceID` + `AccountingType`** çifti kaynağı gösterir; cari `ZT_CustomerAccounts.ReferenceID` + `AccountGroup` çiftiyle bulunur. Idempotency: önce `SELECT ID ... WHERE ReferenceID=@x AND AccountingType=@y`, varsa UPDATE yoksa INSERT.

| Kaynak | Cari bulma | Borç kaydı | Referans |
|---|---|---|---|
| Hammadde bedeli (araç finansı) | `Finance → ExpertReportTruck → ExpertReport.SupplierID = ZT_CustomerAccounts.ReferenceID AND AccountGroup='Tedarikçi'` | `AccountingType='Tedarikçi'`, `ReferenceID = ZT_ExpertReportTruckFinance.ID`, `Amount=TotalPrice`, `CurrencyID=1`, `ExchangeRate=1` + `DocumentNo/DocumentType/Description/WorkPlaceID` | `AccountingPurchasesController.cs:1710-1716, 1731-1796` |
| Bahçe nakliyesi (araç masrafı) | Plaka → `TransportTruck.Plate` → `TransportCompanyID` → `ZT_CustomerAccounts.ReferenceID AND AccountGroup='Nakliye Firması'` | `AccountingType='Nakliye Firması'`, `ReferenceID = ZT_ExpertReportTruckExpenses.ID`, **`Amount = BalanceAmount`**, `CurrencyID=1`, `ExchangeRate=1` | `ExpertReportTruckExpensesController.cs:1007-1120` |
| Kesim çavuşu ücreti | `ZT_CustomerAccounts.AccountGroup='Kesim Çavuşu'`, `ReferenceID = ZT_HarvestManager.ID` | `ZT_AccountDebts` INSERT | `ExpertReportTruckExpensesController.cs:1536, 1567, 2054`; `AccountingPurchasesController.cs:1136` |

Dikkat edilecekler (kodda görülen):
- Nakliye firması plaka ile bulunamazsa (`TransportTruck` kaydı yok / plaka yazımı farklı) **borç kaydı sessizce atlanır** (`ExpertReportTruckExpensesController.cs:1039-1058`: `if (transportCompanyId > 0)` / `if (customerAccountId > 0)`).
- Masraf tablosunda `CurrencyID` kolonu olmasına rağmen cari borç **her zaman `CurrencyID=1`** yazılır (1084, 1113).
- Nakliye firması bazında masraf özeti: `ExpenseSummaryByTransportCompany` (395), `CompanyExpenseDetails` (658), plaka→firma arama `GetTransportCompanyByPlate` (909-931).

### 1.4 Mobil API — `ApiController/ExpertReportTruckApiController.cs`

- Rota `api/ExpertReportTruckApi/...` (17). Uçlar: `GET expert` (21), `GET index` (62), `POST add` (184), `POST update` (325), `DELETE delete` (430), `GET chauffeur` (549), `GET harvestmanager` (614), `POST chauffeuradd` (656), `POST harvestmanageradd` (798).
- Kimlik doğrulama: query string parametreleri `database` + `token`; `Methods.Authorize(database, token)` → `ZTO_ADMIN.Customers` içinde `CustomerKey=@token AND DatabaseName=@database` (`Controllers/Methods.cs:194-211`). Bağlantı: `GlobalVeriables.customerApiDatabase + database` (24).
- **Bulgu:** `Methods.Authorize` çağrısı dosyada yalnız 4 yerde var (27, 70, 555, 620 → `expert`, `index`, `chauffeur`, `harvestmanager`). `add`, `update`, `delete`, `chauffeuradd`, `harvestmanageradd` uçlarında `Methods.Authorize` çağrısı **görülmedi**. Yeni entegrasyonda bu desen örnek alınmamalı.
- `chauffeuradd` şoförü `ZT_Chauffeur` (`Name, PhoneNumber, Address, TcNo, Status, CreationDate`) ve plakaları `ZT_UsedPlate` (`ChauffeurID, Plate, Status, CreationDate`) tablosuna yazar (712, 730).

---

## 2. CMR

**Tespit:** ZTO Fabrika'da **CMR belgesi üreten (CMR formu basan/PDF üreten) bir modül yoktur.** `CustomerCMR3` / `CustomerCMR13` yalnızca **müşteriye bağlı adres kütüğüdür** (CMR formunun 3 no'lu ve 13 no'lu kutularına yazılacak adres metinleri).

### 2.1 Tablolar
- **`ZT_CustomerCMR3`** — model `Models/ZT/CustomerCMR3.cs`: `ID` (int), `Address` (string), `Status` (bool), `CreationDate` (DateTime), `CustomerID` (int → `Customer.ID`). INSERT `Controllers/CustomerCMR3Controller.cs:166-169`. Silme = soft (`Status` UPDATE, 319).
- **`ZT_CustomerCMR13`** — model `Models/ZT/CustomerCMR13.cs`: aynı 5 alan. INSERT `Controllers/CustomerCMR13Controller.cs:165`.
- Roller (her ikisi): Admin, Satış Personeli, Lojistik, Finans(normal), Finans(super), Muhasebe (Alış), Sevkiyat, Mal Kabul (`CustomerCMR3Controller.cs:11`, `CustomerCMR13Controller.cs:11`).
- View'lar: `Views/CustomerCMR3/{Index,Add,Edit}.cshtml`, `Views/CustomerCMR13/{Index,Add,Edit}.cshtml`. Add/Edit view'larında **Google Maps** kullanılır (adres seçimi). Menüden erişim: `Views/Customer/Index.cshtml:306-310` ("CMR3 Adresleri", "CMR13 Adresleri").

### 2.2 Hangi kayda bağlı?
- Kütük **müşteriye** (`CustomerID`) bağlıdır; sevk aracına ya da siparişe FK'sı yoktur.
- Sipariş başlığına **metin kopyası** olarak taşınır: `ZT_OrderHeader.HighwayCmr3`, `HighwayCmr13`, `HighwayCmrSpecialNotes` (INSERT `Controllers/OrderHeaderController.cs:2015-2039`; UPDATE 2548-2550; model `Models/ViewModels/OrderHeaderAccordionViewModel.cs:186-198`). Seçim listesi: `OrderHeaderController.cs:835, 845`; modal ile yeni adres ekleme: 864-967 (`Views/Shared/_OrderHeaderPlaceModals.cshtml` — harita + elle adres, Leaflet).
- `SalesTruck` modelinde `HighwayCmr3` alanı vardır (`Models/ZT/SalesTruck.cs:103`) — sipariş başlığından JOIN ile okunan görüntü alanı; `ZT_SalesTruck` INSERT kolon listesinde **yok** (`SalesProductController.cs:2310-2320`).
- Sevk aracı formunda taşıma belgesi türü seçenekleri: `BillOfLadingType` = `"Karayolu-CMR"` vb., `InsuranceType` = `"CMR Sigorta"` vb. (`Views/SalesProduct/SalesTruckAdd.cshtml:1347-1358`).

### 2.3 Çıktı (yazdırma/PDF)
- CMR formunun kendisini basan bir view/PDF üretici: `⚠ BULUNAMADI`.
- En yakın çıktı: **reçeteli modül** "Sevk/Yükleme Formu (CMR benzeri) + çeki listesi" — `GET /recipesales/shipmentprint?id=` (`Controllers/RecipeSalesController.cs:5006-5020`), view `Views/RecipeSales/ShipmentPrint.cshtml`, yöntem **tarayıcı `window.print()`** (satır 218). Kaynak tablo `ZT_RecipeShipment` (5019-5027).
- CMR/Konşimento **dosya olarak yüklenir** (sevk evrak modülü): `UploadShipmentDocument(shipmentId, documentType, ...)` (`RecipeSalesController.cs:5126-5131`), evrak türleri arasında "CMR" (`Views/RecipeSales/ShipmentPrint.cshtml:170`), ihracat dosyasında "Konşimento (B/L) / CMR No" alanı (`Views/RecipeSales/ExportFile.cshtml:341-352`).
- Sunucu tarafı PDF kütüphanesi (QuestPDF/iText/Rotativa/DinkToPdf/PdfSharp) taraması: yalnız `Controllers/WeighbridgeController.cs` eşleşti; CMR ile ilgisi görülmedi.

---

## 3. Araç ve şoför kütükleri (ENTEGRASYON İÇİN KRİTİK)

### 3.1 Üç ayrı araç/şoför ailesi vardır

| Aile | Tablolar | Sahibi (FK) | Kullanıldığı yer |
|---|---|---|---|
| **Supplier\*** (tedarikçi aracı — "klasik" mal kabul) | `SupplierTruck`, `SupplierChauffeur`, `SupplierTrader` | `SupplierID` → `Supplier.ID` | `IncomingGoodsTruck` (`Models/IncomingGoodsTruck.cs:63-69`: `SupplierTruckID`, `SupplierID`, `SupplierChauffeurID`, `SupplierTraderID`) |
| **Transport\*** (nakliye firması, aracı, şoförü) | `TransportCompany`, `TransportTruck`, `TransportChauffeur` | `TransportCompanyID` → `TransportCompany.ID` | Satış sevkiyatı `ZT_SalesTruck` (`TransportCompanyID`, `ChauffeurID`→`TransportChauffeur`), `WorkOrderTruck` (`TransportCompanyID`, `TransportTruckID`, `TransportChauffeurID`), bahçe nakliyesi (plaka eşleşmesiyle `ZT_ExpertReportTruck`), reçeteli sevk `ZT_RecipeShipment.TransportCompanyID` |
| **ZT_Chauffeur / ZT_UsedPlate** (bahçe/hasat şoförü + kullandığı plakalar) | `ZT_Chauffeur`, `ZT_UsedPlate` | firma bağı yok | `ZT_ExpertReportTruck.ChauffeurID`, `ZT_RequestExpertTruck.ChauffeurID` (`AccountingPurchasesController.cs:213`) |

**Supplier\* ↔ Transport\* farkı:** Supplier\* = **tedarikçinin/müstahsilin kendi aracı, şoförü ve tüccarı** (tedarikçiye bağlı; yalnız `Admin` rolü yönetir). Transport\* = **nakliye firması ve onun araç/şoför havuzu**; hem bahçeden fabrikaya taşımada (`TransportType='Bahçe Nakliye'`) hem **satış sevkiyatında** (`TransportType='Sevk İhracat Nakliye'`) kullanılır. Satış sevkiyatı nakliyecisi = **Transport\***.

### 3.2 `TransportCompany` — "NAKLİYE FİRMASI" kavramının tutulduğu tablo
- Model `Models/TransportCompany.cs:5-43`; INSERT `Controllers/TransportCompanyController.cs:265-268`.
- Kolonlar (INSERT'ten): `ID` (int, PK), `Name` (string), `PhoneNumber`, `Address`, `Description`, `IdentityNo` (VKN/TCKN — cariye `TaxNumber` olarak kopyalanır, 345), `Email`, `AuthorizedPersonName`, `CompanyName`, `Status` (bool), `CreationDate`, `CreatedBy`, `CustomerID` (int), **`TransportType`** (string). Audit alanları modelde: `UpdatedDate`, `UpdatedBy`, `UpdateCount` (30-32). `TruckCount`, `ChauffeurCount`, `CustomerName` hesaplanan görüntü alanlarıdır (24, 42-43).
- `TransportType` değerleri (kodda görülen): `"Bahçe Nakliye"`, `"Sevk İhracat Nakliye"` (`TransportCompanyController.cs:296-306`). Sevk aracı formundaki firma listesi yalnız `TransportType='Sevk İhracat Nakliye'` olanları getirir (`Controllers/SalesProductController.cs:~1979`).
- `CustomerID`'nin iş anlamı (hangi müşteriye bağlı / neden): `⚠ DOĞRULANMADI` — kolon var ve menü etiketi "Müşteri-Nakliye Firmaları" (`Views/Shared/_Layout.cshtml:~1036`), ama semantik kodda incelenmedi.
- Roller: Admin, Patron, Muhasebe (Alış), Üretim Müdürü, Lojistik, Finans(normal), Finans(super), Satış Personeli, Mal Kabul, Sevkiyat, Satınalma (`TransportCompanyController.cs:13`).

**Cari hesapla bağı (`ZT_CustomerAccounts`):** firma eklenirken **aynı işlemde otomatik cari açılır** (`TransportCompanyController.cs:290-345`):
- `AccountGroup` = `'Nakliye Firması'` (TransportType = Bahçe Nakliye, kod öneki `BHN`) **veya** `'Sevk Nakliye Firması'` (TransportType = Sevk İhracat Nakliye, kod öneki `SVN`).
- `AccountCode` = `{önek}-{TransportCompany.ID}` (309); `AccountName` = `TransportCompany.Name`; `TaxNumber` = `IdentityNo`.
- **Bağ kolonu: `ZT_CustomerAccounts.ReferenceID = TransportCompany.ID`** (+ `AccountGroup` ayrımı). `TransportCompany` tarafında cari ID kolonu **yok**; bağ tek yönlüdür ve `ReferenceID + AccountGroup` çiftiyle sorgulanır.
- Firma pasife alınınca cari de pasiflenir: `UPDATE ZT_CustomerAccounts SET Status WHERE ReferenceID=@id AND AccountGroup=@grp` (793-795).
- Reçeteli sevkte cari yoksa çalışma anında `SVN-{firmaID}` koduyla açılır (`Controllers/RecipeSalesController.cs:3811-3829`).

### 3.3 `TransportTruck`
- Model `Models/TransportTruck.cs:5-28`; INSERT `Controllers/TransportTruckController.cs:275`.
- Kolonlar: `ID` (int), **`Plate`** (string), `Brand` (string), `TruckType` (string), `Color` (string), `Status` (bool), `CreationDate` (DateTime), `TransportCompanyID` (int, FK → `TransportCompany.ID`).
- **Plaka normalizasyonu: YOK.** INSERT, formdan geleni olduğu gibi yazar (275); controller'da `ToUpper` / `Trim` / boşluk temizleme / regex araması boş döndü. Plaka üzerinde UNIQUE kısıt olduğuna dair kanıt `⚠ BULUNAMADI`; aksine `AccountingPurchasesController.cs:1120-1126` aynı plakanın birden fazla `TransportTruck` satırı olabileceğini varsayıp `DISTINCT ON ("Plate")` ile tekilleştiriyor.
- Dorse plakası, ruhsat, kapasite, muayene/sigorta tarihi gibi alanlar bu tabloda **yok**.
- Güvenlik notu: INSERT string birleştirmeyle kuruluyor (275) — örnek alınmamalı.

### 3.4 `TransportChauffeur`
- Model `Models/TransportChauffeur.cs:5-32`; INSERT `Controllers/TransportChauffeurController.cs:261`.
- Kolonlar: `ID` (int), `Name` (string), `IdentityNo` (string), `PhoneNumber` (string), `Nationality` (string), `DrivingLicense` (string), `Status` (bool), `CreationDate` (DateTime), `TransportCompanyID` (int, FK).
- Şoför ↔ araç eşlemesi (hangi şoför hangi plakayı kullanıyor) Transport\* ailesinde **yok**.

### 3.5 `SupplierTruck` / `SupplierChauffeur` / `SupplierTrader`
- `SupplierTruck` (`Models/SupplierTruck.cs:5-29`; INSERT `Controllers/SupplierTruckController.cs:119`): `ID`, `Plate`, `Brand`, `TruckType`, `Color`, `Status`, `CreationDate`, `SupplierID` (FK → `Supplier.ID`). Plaka normalizasyonu **yok**.
- `SupplierChauffeur` (`Models/SupplierChauffeur.cs:5-32`; INSERT `Controllers/SupplierChauffeurController.cs:120`): `ID`, `Name`, `PhoneNumber`, `IdentityNo`, `Nationality`, `DrivingLicense`, `Status`, `CreationDate`, `SupplierID`.
- `SupplierTrader` (`Models/SupplierTrader.cs:5-29`; INSERT `Controllers/SupplierTraderController.cs:121`): `ID`, `Name`, `PhoneNumber`, `IdentityNo`, `Nationality`, `Status`, `CreationDate`, `SupplierID`.
- Üçü de yalnız `[UserRoleAuthorize("Admin")]` (satır 12).

### 3.6 `ZT_Chauffeur` + `ZT_UsedPlate` (`ChauffeurController`)
- `ZT_Chauffeur` (`Models/ZT/Chauffeur.cs:5-25`; INSERT `Controllers/ChauffeurController.cs:141`): `ID`, `Name`, `PhoneNumber`, `Address`, `TcNo`, `Status`, `CreationDate`.
- `ZT_UsedPlate` (INSERT `ChauffeurController.cs:156`): `ID`, `ChauffeurID` (FK), `Plate`, `Status`, `CreationDate`. Plaka pasifleme: `PlateDeactivate` (81). Normalizasyon **yok**.

### 3.7 Entegrasyon açısından özet riskler
1. Plaka hiçbir kütükte normalize edilmiyor, ama **iş mantığı plaka metin eşitliğine dayanıyor** (bahçe nakliye borcu: `ExpertReportTruckExpensesController.cs:1023-1031`). ZTO LOGISTIC ile plaka üzerinden eşleşme yapılacaksa normalizasyon iki tarafta da yeni yazılmalı.
2. `ZT_SalesTruck.Plate` ve `DorsePlate` **serbest metin**; `TransportTruck` FK'sı yok (§4).
3. Nakliye firmasının kalıcı dış kimliği yok: yalnız `ID` (tenant içi) ve `IdentityNo` (VKN/TCKN, zorunluluğu görülmedi).

---

## 4. Satış sevkiyatı ve nakliyeci seçimi

ZTO Fabrika'da **iki ayrı sevk modeli** vardır:
- **A) Yaş meyve/sebze modu:** `ZT_SalesTruck` ("Sevk aracı") — ana model.
- **B) Reçeteli (gıda üretim) modu:** `ZT_RecipeShipment` — ayrı tablo, daha yeni ve konum/navlun alanları daha düzenli.

### 4.1 `ZT_SalesTruck` — sevk aracı oluşturma akışı
- Form: `GET SalesProduct/SalesTruckAdd` (`Controllers/SalesProductController.cs:1621`), `POST` (2238), view `Views/SalesProduct/SalesTruckAdd.cshtml`, düzenleme `SalesTruckEdit.cshtml`. Roller: Admin, Üretim Müdürü, Mal Kabul, Lojistik, Satış Personeli, Sevkiyat (2236).
- INSERT kolonları (`SalesProductController.cs:2310-2320`): `ChauffeurID`, `SalesID`, `Plate`, `DorsePlate`, `Description`, `Status`, `CreationDate`, `OrderID`, `CustomerID`, `City`, `District`, `Country`, `WarehouseID`, `SalesType`, `Location`, `Address`, `SpyTruckName`, `SpyTruckLink`, `SpyTruckNo`, `BatchNumber`, `BillOfLadingType`, `CustomsDirectorate`, `EmptyTruckAmount`, `EmptyTruckDate`, `ExitGateCustomsDirectorate`, `FillTruckAmount`, `FillTruckDate`, `InsuranceType`, `SecondTransportCompany`, `SecondTransportCompanyPrice`, `TransitDocumentType`, `TransportCompanyID`, `TransportCompany`, `TransportCompanyPrice`, `TransportTruckInfo`, `TransportType`, `TruckStatus`, `ScalaType`, `ScalaGraphic`, `ChauffeurNameOther`, `ChauffeurPhone`, `SpyTruckContainerTypeID`, `CurrencyID`, `CreatedRate`, `CreatedTotalPrice`, `CreatedTotalEquivalentTL`, `AnalysPrice`, `LaboratoryFirmsID`, `DeliveryNumber`, `ShipDepartureDate`, `WorkPlaceID`.
- Sonradan eklenen/başka yerde yazılan kolonlar: `DepartureDate`, `InvoiceNumber`, `InvoiceDate`, `TransportCompanyInvoiceDate`, `TransportCompanyInvoiceNumber`, `ShipTransportCompanyID`, `ShipTransportCompanyInvoiceNumber/InvoiceDate/DeliveryNumber/Description/CurrencyId/TotalPrice/CargoType` (`SalesProductLogisticController.cs:2306-2410`), `DeliveryStatus`, `DeliveryDate`, `DeliveryRate`, `DeliveryTotalEquivalentTL`, `DeliveryTotalPrice`, `DeliveryDescription` (6187-6194), `ZtoHalDataSharing`, `SalesTruckHalKey` (`SQL_Migrations/2026_08_07_ZT_SalesTruck_ZtoHalSharing.sql`), `Note/NoteDate/NoteBy`, `IncotermID`, `IncotermCountryID`, `IssusingBankID`, `DeclarationNumber/Date/Conclusion`, `AdditionalInfo` (model `Models/ZT/SalesTruck.cs`).
- Not (kod yorumu): `ZT_SalesTruck`'ta `ChauffeurName` ve `ContainerNumber` kolonu **yok**; şoför = `ChauffeurID → TransportChauffeur.Name` (elle giriş `ChauffeurNameOther`), konteyner no `ZT_SalesTruckBatchNumbers`'ta (`Services/ZtoHalIntegrationService.cs:309-311`).

**Nakliye firması / araç / şoför nerede seçiliyor (`Views/SalesProduct/SalesTruckAdd.cshtml`):**

| Alan | Satır | Kaynak |
|---|---|---|
| `TransportType` (taşıma tipi) | 747 | sabit seçenekler |
| `Plate` (çekici plakası) — **serbest metin, zorunlu** | 762 | `TransportTruck`'tan seçilmez |
| `DorsePlate` — serbest metin | 766 | — |
| `ContainerNumber` | 770 | `ZT_SalesTruckBatchNumbers`'a yazılır |
| `TransportCompanyID` (nakliye firması, dropdown) | 798 | `TransportCompany WHERE Status=true AND TransportType='Sevk İhracat Nakliye'` (`SalesProductController.cs:~1979`) |
| `TransportCompanyPrice` (navlun) + para birimi | 811-813 | `Currency` |
| `ChauffeurID` (şoför dropdown) | 899 | `TransportChauffeur WHERE Status=true` — **firmaya göre filtrelenmeden tümü** (`SalesProductController.cs:~1971`) |
| `ChauffeurPhone` (+ `ChauffeurNameOther` elle) | 918 | — |
| `SpyTruckNo` (casus cihaz kodu) | 1030 | serbest metin; sağlayıcı listesi `ZT_CasusCihaz` |
| `BillOfLadingType`, `InsuranceType`, `TransitDocumentType`, `CustomsDirectorate`, `ExitGateCustomsDirectorate` | 1298-1365 | sabit seçenekler |
| `customerLocation`, `Address`, `Location` (varış) | 1404-1433 | `ZT_CustomerLocation` + Google Maps; `Location` = `"lat,lng"` metni, readonly |

- `SpyTruckNo` yazılırken `Methods.NormalizeSpyDeviceNo` (Trim + ToUpperInvariant) uygulanır (`SalesProductController.cs:~2378`; `Controllers/Methods.cs:493-496`). **Plakaya aynı işlem uygulanmaz.**
- Parti bağları: `ZT_SalesTruckBatchNumbers` (`SalesTruckID`, `BatchNumber`, `ContainerNumber`) (`SalesProductController.cs:2406`). `BatchNumber = ZT_Orders.Name` eşleşmesi (`SalesProductLogisticController.cs:1811-1818`).

**Durum alanları:**
- `TruckStatus` (yükleme/tartım akışı) — görülen değerler: `"Araç bekleniyor"` (ilk değer, `SalesProductController.cs:~2372`), `"Araç boş tartımı yapıldı"`, `"Araç dolu tartımı yapıldı"`, `"Tartım bilgileri sıfırlandı"`, `"Sevk işlemi tamamlandı"`; view/karşılaştırmalarda ayrıca `"Boş tartım yapıldı"`, `"Dolu tartım yapıldı"`, `"Sevk Edildi"`, `"Waiting"` (proje genelinde literal taraması). Sabit/enum tanımı yok, serbest metin.
- `DeliveryStatus` (teslim) — değerler: `"Bekliyor"`, `"Teslim Edildi"`, `"İptal"`. `CompleteDelivery` (`SalesProductLogisticController.cs:6116`): `DeliveryStatus='Teslim Edildi'` + `DeliveryDate`, `DeliveryRate`, `DeliveryTotalEquivalentTL`, `DeliveryTotalPrice`, `DeliveryDescription` (6187-6194) ve bağlı `ZT_Orders.OrderStatus='Teslimat Tamamlandı'` (6227-6228). `CancelDelivery` (6276), `UpdateDeliveryStatus` (6768; geçiş kuralı: Teslim Edildi → yalnız İptal, 6796-6798).
- **Teslim durumu tamamen elle girilir**; GPS/cihaz verisinden otomatik teslim tespiti yoktur.

**Navlun / nakliye bedeli alanları ve cariye yansıma:**
- Kara: `TransportCompanyID`, `TransportCompanyPrice`, `CurrencyID`, `TransportCompanyInvoiceNumber`, `TransportCompanyInvoiceDate`; ikinci nakliyeci `SecondTransportCompany` (metin), `SecondTransportCompanyPrice`.
- Gemi: `ShipTransportCompanyID`, `ShipTransportCompanyTotalPrice`, `ShipTransportCompanyCurrencyId`, `ShipTransportCompanyInvoiceNumber/Date`, `ShipTransportCompanyDeliveryNumber`, `ShipTransportCompanyCargoType`, `ShipTransportCompanyDescription`.
- Araç oluşturulurken: `TransportCompanyID>0 && TransportCompanyPrice>0` ise `ZT_AccountDebts` kaydı — cari `ZT_CustomerAccounts.ReferenceID=@TransportCompanyID AND AccountGroup='Sevk Nakliye Firması'`, borç `AccountingType='Sevk Nakliye Firması'`, **`ReferenceID = ZT_SalesTruck.ID`**, `ExchangeRate=1.0000` (`SalesProductController.cs:2418-2490`).
- Lojistik ekranından güncelleme: `SaveSalesInfo` (`SalesProductLogisticController.cs:2264`) → `UpdateAccountDebts(...)` (2489) kara ve gemi için ayrı ayrı çağrılır (2443-2472). Ayrım kolonu: **`ZT_AccountDebts.TransportType`** = `"Sevk Nakliye"` (kara) / `"Gemi Nakliye"` (2503). Firma/fiyat boşaltılırsa borç silinir ve `ZT_SalesTruckDebtLog`'a yazılır (2517-2521, 2641, 2710). İlgili uçlar: `GetLogisticsDebtInfo` (2731), `DeleteLogisticsTransport` (2813), `GetTransportCompanies` (2968).

**Yükleme/boşaltma noktası:**
- Yükleme (çıkış): `WarehouseID` (→`ZT_Warehouse`), `WorkPlaceID` (→`ZT_WorkPlace`). İş yeri koordinatı `Views/WorkPlace/Add.cshtml` Google Maps ile girilir; kolon adı `⚠ BULUNAMADI` (taranmadı).
- Boşaltma (varış): `CustomerID`, `Address`, `Country`, `City`, `District`, `Location` (`"lat,lng"` metni). Kaynak kütük `ZT_CustomerLocation` (`Location`, `Address`, `City`, `District`, `Country`, `Status`, `CreationDate`, `CustomerID` — `Controllers/CustomerLocationController.cs:166-168`). Sonradan düzenleme: `GetTruckDestination` (1889) / `UpdateTruckDestination` (1938-1957).

**Palet bilgisi:**
- `ZT_PalletsLoadedTruck` (`SalesTruckID`, `ProductionConveyorID`, `LoadingOrder`, ... — `Controllers/ForkliftPanelController.cs:977`, `SalesProductController.cs:5964`; model `Models/ZT/PalletLoadedTruck.cs`).
- `ZT_SalesTruckPalletLoad` (forklift yükleme olayları; `ForkliftOperatorID`, `UnloadedByOperatorID` — `ForkliftPanelController.cs:991`, `Services/ShipmentLedger/SlSql.cs:77-84`), `ZT_SalesTruckForklift` (`SalesProductController.cs:6596`).
- Tartım: `EmptyTruckAmount/Date`, `FillTruckAmount/Date`; sıfırlama `ResetTruckWeighing` (6008). Detay: `GetLoadedPalletDetails` (5664).

### 4.2 `ZT_RecipeShipment` (reçeteli sevk) — `Controllers/RecipeSalesController.cs`
- INSERT (3100-3104): `RecipeOrderID`, `CustomerID`, `Plate`, `DriverName`, `ShipmentDate`, `Notes`, `ShipmentStatus` (varsayılan `'Hazırlanıyor'`, 5022), `Status`, `CreationDate` + koşullu (kolon varsa): `TransportCompanyID`, `FreightAmount`, `FreightCurrencyID`, `FreightExchangeRate` (Faz 38A) · `VehicleType` (TIR/Konteyner/Kamyon/Frigo/Diğer), `TrailerPlate`, `DriverPhone`, `DriverIdNo`, `ReeferRequired`, `ReeferSetTemp`, `ReeferMeasuredTemp` (Faz 49; DTO 1951-1957) · `DestLat`, `DestLng`, `DestAddress`, `RouteDistanceKm`, `RouteDurationMin` (Faz 3; DDL `SQL/2026_10_27_Faz1_MalKabul_Sevk_Harita_QrTrace.sql:27-34` — `double precision`, `text`, `numeric(10,2)`, `integer`).
- Navlun borcu: `'Sevk Nakliye Firması'` carisine yazılır, cari yoksa `SVN-{firmaID}` ile açılır (3784-3829).
- Alt tablolar: `ZT_RecipeShipmentLine`, `ZT_RecipeShipmentExport`, `ZT_RecipeShipmentExportContainer`. View'lar: `Views/RecipeSales/{Shipments,ShipmentEdit,ShipmentPrint,ShipmentFormF023,ExportFile}.cshtml` (Google Maps: `ShipmentEdit.cshtml:458`).
- Burada da araç/şoför **serbest metin** (`Plate`, `DriverName`); `TransportTruck`/`TransportChauffeur` FK'sı yok.

### 4.3 `WorkOrderTruck` (`Controllers/WorkOrderTruckController.cs`; yalnız Admin, 13)
- Tablo `WorkOrderTruck` (INSERT 190): `Amount`, `DepartureDate`, `Destination`, `DestinationLocation`, `ContainerCount`, `Description`, `Status`, `CreationDate`, `WorkOrderID`, `CustomerID`, **`TransportCompanyID`, `TransportTruckID`, `TransportChauffeurID`**, `ContainerTypeID`, `ReceiptNumber`, `OutputOrGarbage`, `CargoStatus`, `CargoNumber`. Projede **araç ve şoförün FK ile seçildiği tek sevk tablosu** budur (klasik iş emri modülü).

### 4.4 Sevkiyat Hareket Defteri — `ShipmentLedgerController` + `Services/ShipmentLedger/*`
- `GET /shipmentledger/index?truck={ZT_SalesTruck.ID}` (`Controllers/ShipmentLedgerController.cs:25-53`); roller Admin, Üretim Müdürü, Patron, Mal Kabul, Lojistik, Satış Personeli (22).
- Salt okunur rapor: sevk aracının partilerine ait paletlerin kantar girişi → hammadde depo → döküm → üretim → depolama → transfer → araca yükleme → tartım → çıkış zaman çizelgesi (10-20). Kaynaklar: `ZT_SalesTruck`, `ZT_SalesTruckBatchNumbers`, `ZT_ProductionConveyor`, `ZT_PalletsLoadedTruck`, `ZT_SalesTruckPalletLoad`, `ZT_WarehouseTransferRevision`, `ZT_StockMovementLog`, `ZT_ProductionUsedProducts`, `ZT_DistributedPallet`, `ZT_ExpertReportTruck`, `ZT_UsedWarehouse` (`Services/ShipmentLedger/SlSql.cs:18-145`).
- **Konum/GPS verisi içermez** — fabrika içi hareket defteridir.

### 4.5 Sipariş başlığı ve sevkiyatla bağı (kısa)
- `ZT_OrderHeader` (INSERT `Controllers/OrderHeaderController.cs:2015`): `OrderHeadNumber`, `Name`, `Type`, `ProductionDate`, `PlannedCompletion`, `Status`, `CreationDate`, `SalesPersonID`, `CustomerOrderNumber`, `BatchNumber`, `Seller`, `CustomerRecipientName`, `AgentName`, `NotificationName`, `DesiredShipmentDate`, `DesiredDeliveryDate`, `Incoterm`, `IncotermCountry`, `IncotermCity`, `HighwayCmr3`, `HighwayCmr13`, `HighwayCmrSpecialNotes`, `CustomerID`, `LastDeliveryDate`, `WorkPlaceID`, `BranchProvinceID`, `LoadingCountry`.
- `ZT_Orders` (sipariş kalemi/partisi): `OrderHeaderID → ZT_OrderHeader.ID` (`Controllers/OrdersController.cs:162`); INSERT `OrdersController.cs:1473, 1826`, `OrderHeaderController.cs:2081, 2695`. Alanlar arasında `Name` (parti adı), `DeliveryDate`, `OrderStatus`.
- Sevkiyat bağı: `ZT_SalesTruck.OrderID → ZT_Orders.ID` (tekil) **ve** çoklu parti için `ZT_SalesTruckBatchNumbers.BatchNumber = ZT_Orders.Name` (`SalesProductLogisticController.cs:1811-1818`). Siparişsiz araç da mümkündür (`TruckType = "WithOrder"/"WithoutOrder"`, `Models/ZT/SalesTruck.cs:114, 173`).

### 4.6 `AcceptanceOfGoodController` (kısa)
- Adına rağmen **mal kabul işlemi değil, "Mal Kabul" rolündeki personel kütüğüdür**: tablo `ZT_AcceptanceOfGoods` (`Name`, `PhoneNumber`, `BranchProvinceID`, `WorkPlaceID`, `Address`, `Status`, `CreationDate` — `Controllers/AcceptanceOfGoodController.cs:228`). `ZT_LogisticsPerson` ve `ZT_ShipmentPerson` ile aynı kalıp.
- Reçeteli mal kabulde nakliye alanları ayrıdır: `ZT_MaterialInvoice.OriginLat/OriginLng/OriginAddress/RouteDistanceKm/RouteDurationMin` ve **`TransportCustomerAccountID` (doğrudan `ZT_CustomerAccounts.ID`)**, `TransportFee`, `TransportCurrencyID`, `TransportExchangeRate` (`SQL/2026_10_27_Faz1_MalKabul_Sevk_Harita_QrTrace.sql:16-25`). Dikkat: burada nakliyeci `TransportCompany` üzerinden değil **doğrudan cari ID** ile tutulur — üçüncü bir bağlama biçimi.

---

## 5. ARAÇ TAKİP SİSTEMİ (ENTEGRASYON İÇİN KRİTİK)

### 5.1 AÇIK SONUÇ

**ZTO Fabrika'da kendi başına bir GPS araç/filo takip sistemi YOKTUR.** Var olan şey:

1. Sevk aracının **içine konan, tek kullanımlık/seferlik "casus" veri kaydedici** (Frigga marka datalogger: sıcaklık + nem/ışık + LBS/GPS konum + pil) — cihaz **araca değil sevkiyata (yüke)** aittir, kodu her seferde değişir.
2. Bu cihazın verisi **üçüncü taraf Frigga bulut API'sinden, kullanıcı ekranı açtığında anlık (on-demand) çekilir**; ZTO Fabrika'da **saklanmaz**.
3. Bunun dışındaki "takip" ekranları (`ShipmentTracking`, `TruckTracking`, `DeliveryTracking`) **elle girilen durumlara** ve fabrika içi palet yükleme verisine dayanır.

Kanıtlar:
- Konum saklayan tablo yok: `latitude|longitude` taraması yalnız `Views/LocationPricing/*`, `Views/Weighbridge/Add.cshtml` ve tema/vendor JS dosyalarında; `geofence` yalnız vendor `wwwroot/Content/porto/vendor/gmaps/gmaps.js`'te; `gps` yalnız `Views/SalesProductLogistic/Index.cshtml` (istemci JS yorumu) ve bir vendor dosyasında.
- Arka plan servisi yok: `Program.cs` içindeki `AddHostedService` kayıtları (32, 33, 53, 56, 75, 77, 116, 137, 200) arasında Frigga/GPS/konum toplayan bir worker **bulunmuyor**.
- `Services/Friggatech/` altında tek dosya var: `FriggaPublicPayload.cs` (saf normalleştirici; DB/HTTP bağımlılığı yok — dosya başı yorumu 9-10).
- Push/webhook alıcı ucu yok: Frigga'dan veri **alan** bir endpoint bulunmadı; akış tamamen **pull**.

### 5.2 Veri kaynağı ve akış

```
Tarayıcı (modal açılır) ──GET /api/friggatech/device/{SpyTruckNo}?hours=N──▶ FriggatechController
                                                                              │ 1) Public takip yolu (config: Frigga:PublicBaseUrl + Frigga:PublicSalt)
                                                                              │ 2) başarısızsa OAuth yolu (access-key/secret → token → devices/{id}/data)
                                                                              ▼
                                                              Frigga bulutu (__PLACEHOLDER__)
```

- Controller: `ApiController/FriggatechController.cs` — `[Route("api/[controller]")]` (19), `[Authorize]` (22: **çerez/oturum** kimlik doğrulaması, API anahtarı değil), uç `GET device/{deviceId}?hours=` (70-71).
- Pencere: varsayılan 24 saat, azami 720 saat (30 gün) (~36-41, 78).
- Cihaz kodu normalizasyonu: `Methods.NormalizeSpyDeviceNo` → `Trim().ToUpperInvariant()` (`Controllers/Methods.cs:493-496`). Gerekçe: Frigga cihaz ID'leri büyük/küçük harfe duyarlı (`Migrations/2026_09_09_SpyTruckNo_Normalize.sql:5-12`; mevcut kayıtları `upper(trim())` ile düzelten idempotent betik 30-34).
- Yol 1 — public takip (87-98, 283-374): imza `MD5(değer + salt)`; salt `appsettings.json` → `Frigga:PublicSalt` = `__PLACEHOLDER__`, taban adres `Frigga:PublicBaseUrl` = `__PLACEHOLDER__`. Yanıt `FriggaPublicPayload.Normalize` ile modal şekline çevrilir.
- Yol 2 — OAuth (106-166): token ucu + `devices/{deviceId}/data?start=&end=` (unix saniye); `Authorization: Bearer` + `token` başlığı (142-145).
- **Güvenlik bulgusu:** OAuth `AccessKey` / `AccessSecret` kaynak kodda **sabit (`private const string`) olarak gömülü** (`ApiController/FriggatechController.cs:~32-35`), ayrıca sınıf başında yorum satırı olarak iki uzun hex dizgi duruyor (~23-24). Değerler = `__PLACEHOLDER__`. `appsettings.json` "Frigga" bölümünde yalnız `PublicBaseUrl` ve `PublicSalt` anahtarları var. Yeni entegrasyonda bu desen örnek alınmamalı.
- Yanıt zarfı: `{ success, code, message, data, diagnostics{ deviceId, windowHours, sensorCount, lbsCount, elapsedMs, queriedAt } }` (224-247).
- Normalleştirilmiş veri (`Services/Friggatech/FriggaPublicPayload.cs:12-27, 60-107, 176-190`):
  - `data.sensor[]` = `{ time (unix sn), lbstime, t0 (°C×10), h0 }`
  - `data.lbs[]` = `{ time (unix sn), vol (pil), signal, location{ lnglat: "lng,lat", desc } }`
  - `owner` (cihazın kayıtlı olduğu Frigga hesabı adı), `portalUrl` (Frigga resmî takip sayfası).
- Kalıcılık: telemetri **yazılmıyor**; yalnız tanı satırı tenant `Log` tablosuna (`TableName='Casus Takip'`, `Process='Sorgulama'`) (376-403).
- Bilinen kısıt (kod yorumu): cihaz başka bir Frigga hesabına kayıtlıysa telemetri boş dönebilir (346-357).

### 5.3 Cihaz ↔ araç eşlemesi
- Eşleme **`ZT_SalesTruck` satırı üzerindedir**: `SpyTruckNo` (cihaz kodu, serbest metin, normalize), `SpyTruckName` (sağlayıcı/marka), `SpyTruckLink` (sağlayıcı portal linki), `SpyTruckContainerTypeID` (casus cihazın stok kartı → `ContainerType`; kullanımda `ZT_MaterialStockAll.RemainingAmount − 1`: `SalesProductController.cs:~2393-2399`).
- Sonradan giriş: `UpdateSpyInfo` (`SalesProductLogisticController.cs:1849-1887`), sağlayıcı listesi `SpyProvidersJson` (1778-1797).
- **`ZT_CasusCihaz`** = yalnız **sağlayıcı tanımı** (cihaz envanteri değil): `ID serial PK`, `Marka varchar(100)`, `Link varchar(500)`, `Status boolean`, `CreationDate timestamp`, `CreatedBy varchar(100)`, `UpdatedBy varchar(100)`, `UpdatedDate timestamp`, `UpdateCount integer` (`Migrations/2026_09_08_ZT_CasusCihaz.sql:10-21`; model `Models/CasusCihaz.cs:9-23`). "Cihaz kodu her sevkiyatta değiştiği için burada DEĞİL, `ZT_SalesTruck.SpyTruckNo` üzerinde saklanır" (model yorumu 5-8).
- Yönetim: `Controllers/CasusCihazController.cs` (roller Admin, Patron, Üretim Müdürü, Lojistik, Sevkiyat — 13; `Services/CasusCihazRoles.cs:12-15`); view'lar `Views/CasusCihaz/{Index,Add,Edit}.cshtml`.
- **Plaka ↔ cihaz kalıcı eşlemesi YOK**; `TransportTruck` tablosunda cihaz alanı yok. Eşleme sefer bazlıdır.

### 5.4 Harita ekranları

| Ekran | Dosya:satır | Kütüphane | Veri |
|---|---|---|---|
| Casus cihaz modalı (sıcaklık grafiği + rota) | `Views/Shared/_SpyDeviceModal.cshtml:474` (fetch), 854-1024 (harita) | **Leaflet 1.9.4** (CDN, 934-940) + **OpenStreetMap** karo (1006) | Frigga `lbs[]` → polyline (1024); hedef işaretçisi `spyParseDest` (742-751, `"lat,lng"`) |
| Lojistik listesi — "Araç Takip" modalı | `Views/SalesProductLogistic/Index.cshtml:11526-11613` | Leaflet + OSM (11613) | Son 24 saat casus verisi (11560): sıcaklık, nem, pil, sinyal, konum, son veri zamanı + varış noktası |
| Lojistik listesi — "Yaklaşan Araçlar / ETA" | `Views/SalesProductLogistic/Index.cshtml:~12480-12600` | (istemci JS) | Casusu olan en yeni **en çok 10** araç için 168 saatlik rota çekilir (12513); eşik `ARR_KM=50`; ETA = kuş uçuşu × 1.25 / hız (ölçülen ya da 60 km/sa varsayılan, 20-90'a kırpılır) (12530-12560). Sipariş teslim tarihi `SpyOrderDeliveryJson` (`SalesProductLogisticController.cs:1800-1846`). **Tümü tarayıcıda hesaplanır, saklanmaz.** |
| Varış noktasını düzenle modalı | `Views/SalesProductLogistic/Index.cshtml:12212-12372` | Leaflet + OSM + **Nominatim** (ters/ileri geocode, 12357, 12372) | `ZT_SalesTruck.Address/Country/City/District/Location` |
| Sipariş başlığı yer seçimi | `Views/Shared/_OrderHeaderPlaceModals.cshtml` | Leaflet + OSM | CMR3/CMR13/müşteri konumu adresleri |
| Sevk aracı ekleme/düzenleme (varış seçimi) | `Views/SalesProduct/SalesTruckAdd.cshtml:1714`, `SalesTruckEdit.cshtml` | **Google Maps JS API** (places, marker) — anahtar view içinde gömülü = `__PLACEHOLDER__` | `ZT_CustomerLocation` |
| Müşteri konumu, CMR3/13, mevki fiyat, iş yeri, eksper raporu, bahçe, mal kabul, reçeteli sevk | `Views/CustomerLocation/*`, `Views/CustomerCMR3|13/*`, `Views/LocationPricing/*`, `Views/WorkPlace/*`, `Views/ExpertReport/*`, `Views/Garden/*`, `Views/RecipeGoods/*`, `Views/RecipeSales/ShipmentEdit.cshtml:458` | Google Maps | Statik konum seçimi (canlı takip değil) |
| Satış — "Tır Takip" listesi | `Views/SalesProduct/TruckTracking.cshtml:588-597, 772, 900-904`; action `SalesProductController.cs:5643` | Leaflet (CDN) + `_SpyDeviceModal` | `ZT_SalesTruck` listesi + casus butonu |
| Tır Takip Raporu | `SalesProductLogisticController.cs:1590` → `Views/Reports/TruckTrackingReport.cshtml` | — | `ZT_SalesTruck` tarih aralığı; plaka, şoför, casus, tartım, teslim |

İki ayrı harita yığını kullanılıyor: **konum seçimi = Google Maps**, **canlı/casus rota = Leaflet + OpenStreetMap**.

### 5.5 Durum alanları ve konumun sevk aracıyla ilişkisi
- Sevk aracı konumu **hiçbir tabloda tutulmaz**; ilişki yalnız `ZT_SalesTruck.SpyTruckNo` üzerinden çalışma anında kurulur.
- Varış konumu: `ZT_SalesTruck.Location` (`"lat,lng"` tek metin kolon) / `ZT_RecipeShipment.DestLat, DestLng` (ayrı sayısal kolonlar).
- Çıkış (fabrika) konumu için ayrı bir sevk kolonu görülmedi; rota mesafesi yalnız reçeteli sevkte `RouteDistanceKm` / `RouteDurationMin` olarak saklanır.
- Durumlar elle: `TruckStatus`, `DeliveryStatus` (§4.1).

### 5.6 İstenen diğer dosyalar — takip ile ilgileri
- **`Controllers/ShipmentTrackingController.cs`** (21 satır): "Yüklemeyi Bekleyen Partiler" sayfası; roller Admin, Sevkiyat (11). Veri `/forkliftpanel/shipmentboard` (6-9). **Fabrika içi yükleme takibi; GPS değil.**
- **`Controllers/DrencherTrackingController.cs`**: "Drencher Takip Formu" (hasat sonrası ilaçlama kalite formu, FR.107) — roller Admin, Patron, Üretim Müdürü, Kalite Kontrol (15-25). **Araç takibiyle ilgisi yok.**
- **`Controllers/DeviceController.cs`**: fabrika IoT cihazları (`Device`, `Data`, `DataType` tabloları; 31, 69, 105), yalnız Admin (10). **Araç cihazı değil.**
- **`Controllers/ShipmentAnalysisReportController.cs`**: sevk kalite kontrol soru-cevap formu (`salesTruckId` bazlı; 77, 174), roller Admin, Kalite Kontrol, Sevkiyat (12). Konum içermez.
- **`Controllers/CustomerLocationController.cs`**: `ZT_CustomerLocation` kütüğü (§4.1).
- **`Controllers/LocationPricingController.cs`**: `ZT_LocationPricing` — **mevki (bahçe bölgesi) bazlı nakliye fiyat tarifesi**: `Name`, `Price` (int), `Description`, `Status`, `CreationDate`, `CurrencyID`, `Address`, `Location` (`"lat,lng"`), `City`, `District` (INSERT 114; model `Models/ZT/LocationPricing.cs:5-22`); yalnız Admin (12). `ZT_ExpertReportTruckExpenses.LocationPricingID` buraya bağlanır. Satış sevkiyatı için güzergâh bazlı navlun tarifesi `⚠ BULUNAMADI`.
- **`SQL/2026_10_27_Faz1_MalKabul_Sevk_Harita_QrTrace.sql`**: yalnız statik konum/rota kolonları ekler (`ZT_MaterialInvoice.Origin*`, `ZT_RecipeShipment.Dest*`, `Route*`) + `ZT_RecipeQrTraceHide`; canlı takip tablosu yok.
- **`tests/FriggatechChecks`** (repo kökü `tests/`): `FriggaPublicPayload` ve harita rota kurucusunu DB'siz doğrular (`FriggaPublicPayload.cs:9-10`, `_SpyDeviceModal.cshtml:857`).

---

## 6. Mevcut dış entegrasyon desenleri (yeni entegrasyona örnek)

### 6.1 ZTO Hal entegrasyonu — `Services/ZtoHalIntegrationService.cs` (EN YAKIN ÖRNEK)

**Yön ve uçlar (Fabrika = istemci, Hal = sunucu):**

| Çağrı | HTTP | Yol | Satır |
|---|---|---|---|
| Sevk aracını it | `POST` | `{WebUrl}/api/endsales/receive-truck` | 588-594 |
| Kabul durumunu oku | `GET` | `{WebUrl}/api/endsales/truck-status?halKey=` | 632-635 |
| Pazar satışını oku | `GET` | `{WebUrl}/api/endsales/market-sales?halKey=` | 673-676 |

- Hal'den Fabrika'ya gelen (inbound) bir uç **yoktur**; durum Fabrika tarafından **sorgulanır (polling, kullanıcı tetiklemeli)**.
- HttpClient: adlandırılmış `"ZtoHal"`, zaman aşımı 15 sn (`Program.cs:108`); servis `Scoped` (109).

**Kimlik doğrulama:**
- Başlık: **`X-Factory-ApiKey: <anahtar>`** her istekte (594, 635, 676). Anahtar = hedef Hal kurulumunun `ZTO_ADMIN.Customers.FactoryApiKey` değeri (`varchar(100)`).
- **HTTPS zorunlu**: `NormalizeWebUrl` yalnız `https` kabul eder; tek istisna Development ortamında loopback `http` (170-178). Gerekçe: anahtar her istekte gittiği için (165-169).
- Anahtar `Trim()` edilir (kolona kopyalarken satır sonu kalmasın) (~288).
- İmza/HMAC, zaman damgası, nonce, mTLS **yok** — yalnız paylaşılan statik anahtar.

**Firma bağlama (çoklu kiracı eşlemesi):**
1. `ZTO_ADMIN.public."Customers"` (merkezî): `WebUrl varchar(200)`, `FactoryApiKey varchar(100)` (`SQL_Migrations/2026_08_07_ZTO_ADMIN_Customers_HalIntegration.sql:9-10`). Hal müşterisi satırı `CustomerType='ztohal'` (`SQL_Migrations/2026_10_08_ZtoAdminHalBaglantiDurumu.sql:8-11`).
2. Fabrika tenant DB `public."Customer"` (fabrikanın alıcı müşterisi): `ZtoHalCustomerID integer` (= `ZTO_ADMIN.Customers.ID`), `ZtoHalDataSharing boolean NOT NULL DEFAULT false` (`SQL_Migrations/2026_10_08_Customer_ZtoHalLink.sql:11-12`).
3. Fabrika tenant DB `public."ZT_SalesTruck"`: `ZtoHalDataSharing boolean NOT NULL DEFAULT false`, `SalesTruckHalKey varchar(64)` (`SQL_Migrations/2026_08_07_ZT_SalesTruck_ZtoHalSharing.sql:8-9`).
4. Çözümleme zinciri: `ZT_SalesTruck.CustomerID → Customer.ZtoHalCustomerID → ZTO_ADMIN.Customers.(WebUrl, FactoryApiKey)` (`ResolveEndpointAsync` 238-289; başlık sorgusu 312-323).
5. Fallback: admin satırı boşsa `appsettings.json` → `ZtoHal:DefaultWebUrl` / `ZtoHal:DefaultApiKey` = `__PLACEHOLDER__` (259-273), uyarı loglanır.
6. Doğrulama betikleri (salt okunur): `2026_10_08_ZtoAdminHalBaglantiDurumu.sql` (anahtarın değerini göstermeden dolu mu), `2026_10_08_ZtoHalLinkDogrulama.sql` (tenant kolon sayımı).

**Tetikleme, retry, idempotency:**
- Tek tetik: kullanıcı sevk aracında paylaşımı açar → `SetSalesTruckSharing(truckId, enabled)` (`Controllers/SalesProductLogisticController.cs:5179-5237`). Açılırken `SalesTruckHalKey` yoksa 30 karakterlik rastgele anahtar üretilir (`GenerateRandomKey(30)`, 5387), bayrak+anahtar DB'ye yazılır, **ardından** `PushSalesTruckAsync` çağrılır (5223 — projedeki tek çağrı yeri).
- **Otomatik retry / kuyruk / outbox / arka plan worker YOK.** Push başarısız olsa da bayrak+anahtar kayıtlı kalır; yeniden deneme = kullanıcının toggle'ı kapatıp açması (5172-5176).
- **Idempotency VAR**: `externalRef = "ZTF:{databaseName}:{truckId}"` (~585); Hal tarafı bu anahtarla upsert eder (arayüz yorumu 19-20).
- Hata sınıflaması (market-sales): 403 = "müşteri paylaşım onayı vermemiş" → `ConsentClosed` (geçerli cevap); ağ/timeout/5xx/401 → `Unreachable` (26-32).
- Durum okuma: `GetZtoHalTruckStatus(truckId)` (5247) → durumlar: none · notSent · awaitingAcceptance · accepted · unreachable (5241-5244). Hal yanıt alanları: `found`, `state` ("received" | "imported"), `imported`, `importedTruckId`, `importedAt`, `sharingEnabled`, `plaka` (132-141, 640-651). Ters arama: `FindTruckByHalKey(halKey)` (5305).

**Payload (receive-truck; camelCase JSON, ISO tarih — `BuildPayload` 204-233):**
`plaka`, `soforAdi`, `kapasiteKg` (toplam net), `toleransKg` (0), `transportCompany`, `gelisTarihi` (DepartureDate), `externalRef`, `faturaNo`, `faturaTarihi`, `irsaliyeNo`, `konteynerNo`, `partiNo`, `salesTruckHalKey`, `dorsePlaka`, `firmaAdi`, `firmaKodu`, `urunler[]` (ürün kırılımı; satırda `urunAdi`, `altUrunAdi`, `marka`, `birimMaliyet`…), `paletler[]`, `resmiFiyat { satirlar[] }` (null = fiyat okunamadı → Hal mevcut fiyatı korur; boş liste = fiyat yok → Hal siler).
- Başlık DTO'su `ReceiveTruckHeader` (181-198); sonuç DTO'ları `ZtoHalEndpoint` (119), `ZtoHalPushResult` (125), `ZtoHalTruckStatus` (132), `ZtoHalMarketSalesResult/Row/SummaryRow/Total` (34-116).
- Şoför adı çözümü: `COALESCE(TransportChauffeur.Name, ZT_SalesTruck.ChauffeurNameOther)`; nakliyeci: `COALESCE(ZT_SalesTruck.TransportCompany, TransportCompany.Name)` (312-323) — **nakliyeci Hal'e yalnız ad olarak gider, kimlik (VKN/ID) gitmez.**

### 6.2 `tests/ZtoHalIntegrationChecks` (repo kökü `f:\visual studio zto\ZtoFabrika2026\tests\ZtoHalIntegrationChecks`)
Konsol tabanlı kontrol projesi (`Program.cs`, `ZtoHalIntegrationChecks.csproj`, `golden/`); DB'siz ve ağsız, sahte HTTP handler ile (13-16). Doğruladıkları:
1. **WebUrl politikası** (55-64): https kabul; canlıda http ve localhost reddi; Development'ta yalnız loopback http; şemasız/ftp reddi; boşluk ve sondaki `/` temizliği.
2. **Servis davranışı** (66-131): `truck-status` alan eşlemesi; `X-Factory-ApiKey` başlığının boşluksuz gitmesi (93); güvensiz fallback'te **hiç istek atılmaması** (95-100); fallback boşken endpoint null (104); `market-sales` durum haritası (403→ConsentClosed, 401/5xx/ağ hatası/bozuk gövde→Unreachable, 200→Ok).
3. **Resmî fiyat hesabı** (133-188): satır tutarı = birim fiyat × net kg; para birimi bazında toplam (farklı para birimleri toplanmaz); ağırlıklı ortalama `birimMaliyet`; para birimi kod çevirisi (`$`→USD, `₺`→TL).
4. **Sözleşme (altın dosya) testleri** (190-243): `golden/receive-truck.json` giden payload ile birebir karşılaştırılır; aynı dosya Hal deposunda da durur ve Hal kendi DTO'sundan geçirir. `golden/truck-status.json`, `golden/market-sales.json` Hal'in gerçek yanıtlarıdır; Fabrika okuyucusu bunları okur. **İki depo arasında paylaşılan altın JSON = sözleşme testi deseni.**

### 6.3 Dışa açık API'lerin kimlik doğrulama desenleri

| Desen | Nerede | Mekanizma |
|---|---|---|
| Mobil API (eski) | `ApiController/*ApiController.cs` (ör. `ExpertReportTruckApiController.cs:22-27`) | Query string `database` + `token`; `Methods.Authorize` → `ZTO_ADMIN.Customers.CustomerKey = token AND DatabaseName = database` (`Controllers/Methods.cs:194-211`). Başlık tabanlı değil; bazı yazma uçlarında çağrı görülmedi (§1.4). |
| Yönetim paneli API | `Controllers/AdminPanelApiController.cs` | `[AllowAnonymous]` (13) + `[Route("api/adminpanel/[action]")]` (14); başlık **`X-Zto-Admin-Key`** = `appsettings.json` → `AdminPanelApi:Key` (`__PLACEHOLDER__`), sabit zamanlı karşılaştırma `CryptographicOperations.FixedTimeEquals` (21-29); yetkisizse **404** döner (36). |
| Oturumlu iç API | `ApiController/FriggatechController.cs:22` | `[Authorize]` çerez oturumu. Not: `/api/` yolları oturum onarım middleware'ini atlar (376-386). |
| Giden: ZTO Hal | §6.1 | `X-Factory-ApiKey` + https zorunlu. |

`ApiController/` altında `AdminPanelApiController` **yoktur**; dosya `Controllers/AdminPanelApiController.cs`'tedir.

### 6.4 `Services/Uyumsoft/*` — e-Dönüşüm (kısa)
- Servis arayüzü `IUyumsoftEInvoiceService.cs:6-33`: bağlantı testi, GİB mükellef sorgusu (e-Fatura ↔ e-Arşiv kararı), `SendInvoiceAsync`, `QueryStatusAsync`, **`SendDespatchAdviceAsync` (e-İrsaliye, UBL-TR DespatchAdvice)**, `QueryDespatchStatusAsync`, `GetInboxInvoicesAsync`, `DownloadInboxUblAsync`. HttpClient `"Uyumsoft"` 60 sn (`Program.cs:111`).
- Tablolar (DDL `Docs/Uyumsoft/Faz_UY1..UY4*.sql`): `ZT_UyumsoftSetting` (tenant ayarı), **`ZT_EInvoice`** (giden; `ReferenceTable varchar(60)` + `ReferenceID integer` polimorfik bağ — `Faz_UY1:43-44, 52`), **`ZT_EDespatch`** (giden irsaliye; `ReferenceTable='ZT_SalesTruck'`, `ReferenceID` — `Faz_UY2:3, 18-19, 36`), **`ZT_EInboxInvoice`** (gelen; `Ettn`, `Uuid`, `InvoiceNumber`, `IssueDate`, `SupplierVkn`, `SupplierTitle`, `ProfileId`, `InvoiceType`, `Currency`, `TotalWithoutVat`, `TotalVat`, `TotalWithVat`, `GibStatus`, `UblXml`, `ProcessStatus='Yeni'`, `EnvironmentMode`, `CreatedBy`, `CreationDate` — `UyumsoftInboxService.cs:117-120`), `ZT_UyumsoftLog` (`Operation`, `ResponseBody`, `Success`, `Message` — 198).
- Gelen kutusu: `UyumsoftInboxWorker` (BackgroundService; ilk gecikme 2 dk, periyot **30 dk** — `UyumsoftInboxWorker.cs:17, 25, 32`; kayıt `Program.cs:116`).
- Kimlik bilgisi tenant ayar tablosunda, şifreleme `UyumsoftCrypto.cs` + `appsettings.json` → `Uyumsoft:CryptoKey` (`__PLACEHOLDER__`).
- Cariyle bağı: gelen faturanın cari/alış kaydına aktarımı `Docs/Uyumsoft/Faz_UY4_Aktar_Eslestir.sql` kapsamındadır; eşleştirme kolonları bu analizde **okunmadı** → `⚠ BULUNAMADI (incelenmedi)`. Görülen tek ipucu: gelen faturada `SupplierVkn` saklanıyor.
- ZTO LOGISTIC için anlamı: **e-İrsaliye zaten `ZT_SalesTruck` kaydına bağlı** üretilebiliyor; taşıyıcı bilgisi (plaka/şoför) UBL içeriği `⚠ incelenmedi`.

### 6.5 `Services/Hks/*` — kuyruk + worker + retry deseni (kısa)
- Kuyruk tablosu **`ZT_HksBildirim`** (her tenant DB; `SQL_Migrations/2026_07_08_ZT_HksBildirim.sql:9-27`): `ID serial`, `UniqueId uuid` (idempotency anahtarı), `SourceType varchar(40)` (`ExpertReportTruck` | `IncomingGoods`), `SourceRecordID integer`, `BildirimTuru`, `SendStatus integer` (0 Bekliyor, 1 Gönderiliyor, 2 Başarılı, 3 Hatalı, 4 Retry), `RequestXml`, `ResponseXml`, `YeniKunyeNo`, `RusumMiktari`, `HataKodu`, `HataMesaj`, `RetryCount`, `CreationDate`, `LastTryDate`, `SentDate`, `SubmissionUser`.
- Idempotency: `UNIQUE(UniqueId)` ve `UNIQUE(SourceType, SourceRecordID)` (30-35); tarama indeksi `(SendStatus, RetryCount)` (38-39).
- Worker `HksBildirimQueueWorker` (kayıt `Program.cs:200`): ilk gecikme 1 dk, sonra `max(15, Hks:QueuePollSeconds)` sn'de bir **tüm aktif tenant'ları dolaşır**; tenant başına try/catch, tablo yoksa atlar (`HksBildirimQueueWorker.cs:7-12, 33, 47`).
- İşlenebilir kayıt: `Bekliyor` veya `Retry AND RetryCount < Hks:MaxRetryCount` (`HksBildirimWarehouse.cs:93-107`); **iyimser kilit**: yalnız Bekliyor/Retry ise "Gönderiliyor"a çekilir (121-124); sonuç yazımında hata türüne göre Retry/Hatalı + `RetryCount` artışı (137-163); kaynak kayda geri yansıtma `ZT_ExpertReportTruck.HKS_*` (~200-213).
- Bileşenler: `HksBildirimCoordinator` (orkestrasyon), `HksBildirimMapper`, `HksBildirimSender` (SOAP), `HksClientFactory`, `HksConfigProvider`, `HksTenantDatabaseProvider`, `HksValidationService`, `HksReferenceSyncService` + `HksReferenceWarehouse` (`ZT_HksReferenceData`).
- **ZTO Hal push'unda eksik olan (kuyruk + retry + durum tablosu) burada tam olarak var** → ZTO LOGISTIC'e yük talebi/durum itme için model alınabilecek desen budur.

---

## 7. Lojistik rolü (kısa)

İki ayrı rol vardır: **"Lojistik"** ve **"Sevkiyat"**.

**Lojistik** (personel kütüğü `ZT_LogisticsPerson`: `Name`, `PhoneNumber`, `BranchProvinceID`, `WorkPlaceID`, `Address`, `Status`, `CreationDate` — `Controllers/LogisticsPersonController.cs:198`; kullanıcı eşlemesi `Key` kolonu ile, ör. `CustomerCMR3Controller.cs:46`)
- Giriş sonrası açılış: `/salesproductlogistic/index` (`Controllers/AccountController.cs:259, 328-330`); reçeteli modda `/recipesales/shipments` (75).
- Yan menü `Views/Shared/_CustomerSideMenus/_SideMenu_LogisticsPerson.cshtml`: `/SalesProductLogistic/index` (49), `/orders/index` (55), `/salesproduct/salesindex` (61), `/productioncost/index` (67), `/rawmaterialsales/index` (73), `/readystock/index` (79), `/warehousesituation/index?id=0` (85), `/productionexpenses/indexexpenses` (91), `/orderdefinitions/index` (97 — Tanımlar hub'ı), `/Report/index` (103).
- Görebildiği/yazabildiği veriler: sevk araçları listesi ve lojistik detayları (nakliye firması, navlun, fatura/irsaliye, beyanname, konteyner, incoterm, gemi nakliyesi), casus takip + varış noktası, teslim tamamlama/iptal, ZTO Hal paylaşımı, nakliye firması/araç/şoför kütükleri (`TransportCompanyController.cs:13`), müşteri konumu ve CMR adresleri, Sevkiyat Hareket Defteri, casus sağlayıcı tanımları. **Sipariş açamaz** (`RecipeSalesController.cs:~1967` yorumu).

**Sevkiyat** (personel kütüğü `ZT_ShipmentPerson`, aynı kolonlar — `Controllers/ShipmentPersonController.cs:233`)
- Açılış: `/salesproduct/index` (`AccountController.cs:262, 340-342`).
- Yan menü `_SideMenu_Shipment.cshtml`: `/salesproduct/index` (49), `/shipmenttracking/index` (55 — yüklemeyi bekleyen partiler), `/shipmentanalysisreport/index` (61 — sevk kalite kontrol), `/warehousesituation/index?id=0` (67), `/readystock/index` (73), `/Report/index` (79), `/orderdefinitions/index` (85). Üst menü karşılığı yok, her modda yan menü (`Views/Shared/_DefinitionRoleMenu.cshtml:27, 35-39`).
- Sevk aracı oluşturabilir, casus bilgisi girebilir; lojistik finans uçlarının çoğunda (`SaveSalesInfo` grubu, `CompleteDelivery`) rol listesinde **yoktur**.

**Personel kütüğü ekranları** (`Views/LogisticsPerson/{Index,Add,Edit}.cshtml`, `Views/ShipmentPerson/{Index,Add,Edit}.cshtml`): yalnız personel tanımıdır (ad, telefon, şube, iş yeri, adres); `ShipmentPersonController` yalnız Admin (13). Operasyon ekranı değildir.

---

## Entegrasyon için varlık haritası

| ZTO Fabrika tarafındaki varlık | Tablo | Anahtar alanlar | ZTO LOGISTIC'te muhtemel karşılık |
|---|---|---|---|
| Nakliye firması | `TransportCompany` (+ cari `ZT_CustomerAccounts`, `ReferenceID=TransportCompany.ID`, `AccountGroup` = 'Nakliye Firması' / 'Sevk Nakliye Firması') | `ID`, `Name`, `IdentityNo` (VKN/TCKN), `TransportType`, `Status`, `CustomerID` | **ÖNERİ:** ZTO LOGISTIC'te tenant'ın kendisi (nakliye firması = uygulamanın sahibi). Fabrika tarafına ZtoHal desenindeki gibi bağ kolonları eklenir: `TransportCompany.ZtoLogisticCustomerID` (→ `ZTO_ADMIN.Customers.ID`) + `ZtoLogisticDataSharing`. Eşleşme anahtarı adayı `IdentityNo`; şu an zorunlu/benzersiz değil. |
| Araç | `TransportTruck` (kütük) · sevkte **serbest metin** `ZT_SalesTruck.Plate`, `DorsePlate` · `ZT_RecipeShipment.Plate`, `TrailerPlate`, `VehicleType` | `Plate` (normalize edilmiyor), `Brand`, `TruckType`, `Color`, `TransportCompanyID` | **ÖNERİ:** ZTO LOGISTIC'te araç ana kütüğü (çekici + dorse ayrı varlık). Sözleşmede plaka **normalize** (büyük harf, boşluksuz) taşınmalı; Fabrika tarafına ortak `NormalizePlate` + sevk aracına `ExternalVehicleRef` gerekir. Mevcut FK yokluğu nedeniyle eşleme plaka metniyle yapılacaktır. |
| Şoför | `TransportChauffeur` (kütük) · sevkte `ZT_SalesTruck.ChauffeurID` veya elle `ChauffeurNameOther` + `ChauffeurPhone` · `ZT_RecipeShipment.DriverName`, `DriverPhone`, `DriverIdNo` | `Name`, `IdentityNo`, `PhoneNumber`, `Nationality`, `DrivingLicense`, `TransportCompanyID` | **ÖNERİ:** ZTO LOGISTIC'te sürücü kütüğü; atama ZTO LOGISTIC'te yapılıp Fabrika'ya ad + telefon + kimlik no olarak geri yazılır. Eşleşme anahtarı adayı `IdentityNo`. |
| Sevk aracı (yük talebi) | `ZT_SalesTruck` (+ `ZT_SalesTruckBatchNumbers`, `ZT_PalletsLoadedTruck`) · reçeteli: `ZT_RecipeShipment` (+ `ZT_RecipeShipmentLine`) | `ID`, `CustomerID`, `OrderID`, `WorkPlaceID`, `WarehouseID`, `TransportCompanyID`, `Plate`, `DorsePlate`, `ChauffeurID`, `DepartureDate`, `ShipDepartureDate`, `TransportType`, `BillOfLadingType`, `PalletCount`/`BoxCount`, `EmptyTruckAmount`/`FillTruckAmount`, `Address`/`City`/`District`/`Country`/`Location`, `TruckStatus`, `SalesTruckHalKey` (desen) | **ÖNERİ:** ZTO LOGISTIC'te "yük talebi / sefer emri". Idempotency anahtarı ZtoHal'deki gibi `externalRef = "ZTF:{databaseName}:{truckId}"` (reçeteli için ayrı önek). Paylaşım anahtarı için `SalesTruckHalKey` benzeri ayrı bir kolon. Gönderim, ZtoHal'in senkron toggle deseni yerine HKS'deki **kuyruk + worker + retry** deseniyle yapılmalı. |
| Konum | Kalıcı tablo **YOK**. Anlık kaynak: Frigga API (`ZT_SalesTruck.SpyTruckNo`). Statik: `ZT_SalesTruck.Location` (`"lat,lng"` metin), `ZT_CustomerLocation.Location`, `ZT_RecipeShipment.DestLat/DestLng/RouteDistanceKm/RouteDurationMin`, `ZT_LocationPricing.Location` | `SpyTruckNo`, `SpyTruckName`, `SpyTruckLink`; sağlayıcı tanımı `ZT_CasusCihaz` (`Marka`, `Link`) | **ÖNERİ:** Araç konumunun asıl sahibi ZTO LOGISTIC olmalı (araca bağlı telematik). Fabrika yalnız "son konum + ETA" okur (pull uç ya da durum webhook'u). Casus (yük datalogger'ı) Fabrika'da kalır; ikisi aynı Leaflet haritasında birleştirilebilir. Fabrika'da konum geçmişi tablosu açılması bu analizde gerekçelendirilmedi. |
| Navlun bedeli | `ZT_SalesTruck.TransportCompanyPrice` + `CurrencyID` (kara), `ShipTransportCompanyTotalPrice` + `ShipTransportCompanyCurrencyId` (gemi), `SecondTransportCompanyPrice`; reçeteli `ZT_RecipeShipment.FreightAmount/FreightCurrencyID/FreightExchangeRate`; bahçe `ZT_ExpertReportTruckExpenses.TransportLocationPricing/TotalAmount/BalanceAmount`; mal kabul `ZT_MaterialInvoice.TransportFee/TransportCurrencyID/TransportExchangeRate`; tarife `ZT_LocationPricing.Price` | + fatura alanları `TransportCompanyInvoiceNumber/Date`; cari `ZT_AccountDebts` (`AccountingType`, `TransportType`, `ReferenceID`) | **ÖNERİ:** ZTO LOGISTIC'te navlun teklifi/sefer geliri (alacak). Fabrika'da aynı tutar borçtur; mutabakat için sefer başına tek ortak referans (externalRef) + fatura no taşınmalı. Para birimi ve kur sözleşmede açık alan olmalı (Fabrika'da kur çoğu yerde 1.0 sabit yazılıyor). |
| Teslim durumu | `ZT_SalesTruck.DeliveryStatus` ('Bekliyor' / 'Teslim Edildi' / 'İptal'), `DeliveryDate`, `DeliveryDescription`; bağlı `ZT_Orders.OrderStatus='Teslimat Tamamlandı'`; yükleme tarafı `TruckStatus`; reçeteli `ZT_RecipeShipment.ShipmentStatus` | elle giriş (`CompleteDelivery`, `UpdateDeliveryStatus`) | **ÖNERİ:** ZTO LOGISTIC'teki sefer durumu (atandı / yüklemede / yolda / teslim edildi / iptal) → Fabrika `DeliveryStatus`'a eşlenir. ZtoHal'deki `truck-status` okuma uç deseni yeniden kullanılabilir; `CompleteDelivery` kur/tutar alanları istediği için otomatik teslim yalnız durum + tarihi doldurmalı. Teslim belgesi (imzalı CMR/POD) için karşılık Fabrika'da yalnız reçeteli sevk evrak yüklemesinde var. |

---

## Kopyalanmayacak ama finansın dokunduğu tablolar

Finans kayıtları (cari hareket/borç) operasyon tablolarına **`ZT_AccountDebts.ReferenceID` + `AccountingType` (+ bazı durumlarda `TransportType`)** ile, cari hesaplar ise **`ZT_CustomerAccounts.ReferenceID` + `AccountGroup`** ile referans verir. Gerçek FK kısıtı görülmedi (polimorfik, uygulama düzeyinde).

| Operasyon tablosu | Finans tarafındaki referans | Ayırt edici | Kaynak (dosya:satır) |
|---|---|---|---|
| `ZT_ExpertReportTruckFinance` (hasat aracı hammadde bedeli) | `ZT_AccountDebts.ReferenceID = ZT_ExpertReportTruckFinance.ID` | `AccountingType='Tedarikçi'` | `AccountingPurchasesController.cs:1417-1418, 1731-1796` |
| `ZT_ExpertReportTruckExpenses` (bahçe nakliye/servis masrafı) | `ZT_AccountDebts.ReferenceID = ZT_ExpertReportTruckExpenses.ID` | `AccountingType='Nakliye Firması'` | `ExpertReportTruckExpensesController.cs:1061-1120`; `AccountingPurchasesController.cs:1902-1903` |
| `ZT_UsedHarvestManager` (kesim çavuşu ücreti) | `ZT_AccountDebts` (ReferenceID = kullanım kaydı) | cari `AccountGroup='Kesim Çavuşu'` | `ExpertReportTruckExpensesController.cs:1536-1567, 2054`; `AccountingPurchasesController.cs:1136` |
| `ZT_SalesTruck` (sevk aracı — kara navlunu) | `ZT_AccountDebts.ReferenceID = ZT_SalesTruck.ID` | `AccountingType='Sevk Nakliye Firması'`, `TransportType='Sevk Nakliye'` | `SalesProductController.cs:2418-2490`; `SalesProductLogisticController.cs:2443-2456, 2489-2640` |
| `ZT_SalesTruck` (sevk aracı — gemi navlunu) | `ZT_AccountDebts.ReferenceID = ZT_SalesTruck.ID` | `AccountingType='Sevk Nakliye Firması'`, `TransportType='Gemi Nakliye'` | `SalesProductLogisticController.cs:2460-2472, 2503` |
| `ZT_SalesTruck` (borç silme izi) | `ZT_SalesTruckDebtLog` | — | `SalesProductLogisticController.cs:2641, 2710`; `AccountTransactionController.cs:7289` |
| `ZT_SalesTruck` (resmî satış alacağı, "rüşvet" borcu vb.) | `ZT_AccountDebts` / alacak kayıtları, `truckId` ile | ⚠ ayrıntı incelenmedi | `SalesProductLogisticController.cs:3837, 4655, 6369-6620` |
| `ZT_RecipeShipment` (reçeteli sevk navlunu) | `ZT_AccountDebts` (cari 'Sevk Nakliye Firması', `SVN-{firmaID}`) | ReferenceID değeri ⚠ doğrulanmadı | `RecipeSalesController.cs:3784-3829` |
| `ZT_MaterialInvoice` (reçeteli mal kabul nakliyesi) | kolon `TransportCustomerAccountID` → **doğrudan** `ZT_CustomerAccounts.ID` | `TransportFee`, `TransportCurrencyID`, `TransportExchangeRate` | `SQL/2026_10_27_Faz1_MalKabul_Sevk_Harita_QrTrace.sql:21-25` |
| `TransportCompany` (nakliye firması) | `ZT_CustomerAccounts.ReferenceID = TransportCompany.ID` | `AccountGroup='Nakliye Firması'` (kod `BHN-{ID}`) veya `'Sevk Nakliye Firması'` (kod `SVN-{ID}`) | `TransportCompanyController.cs:290-345, 793-795` |
| `Supplier` (tedarikçi) | `ZT_CustomerAccounts.ReferenceID = Supplier.ID` | `AccountGroup='Tedarikçi'` | `AccountingPurchasesController.cs:1132, 1715-1716` |
| `ZT_HarvestManager` (kesim çavuşu) | `ZT_CustomerAccounts.ReferenceID = ZT_HarvestManager.ID` | `AccountGroup='Kesim Çavuşu'` | `AccountingPurchasesController.cs:1136` |
| `ZT_SalesTruck` (e-İrsaliye) | `ZT_EDespatch.ReferenceTable='ZT_SalesTruck'`, `ReferenceID` | — | `Docs/Uyumsoft/Faz_UY2_EIrsaliye.sql:18-19, 36` |
| Fatura kaynağı (çeşitli) | `ZT_EInvoice.ReferenceTable` + `ReferenceID` | ör. `ZT_MaterialSalesInvoice` | `Docs/Uyumsoft/Faz_UY1_EFatura_EArsiv.sql:43-44, 52` |
| `ZT_ExpertReportTruck` / `IncomingGoods` (HKS bildirimi) | `ZT_HksBildirim.SourceType` + `SourceRecordID` | — | `SQL_Migrations/2026_07_08_ZT_HksBildirim.sql:12-13, 34-35` |

**`ZT_AccountDebts` üzerinde görülen kolonlar:** `ID`, `CustomerAccountID`, `TransactionDate`, `Amount`, `CurrencyID`, `ExchangeRate`, `AccountingType`, `ReferenceID`, `CreationDate`, `CreatedBy`, `WorkPlaceID`, `DocumentNo`, `DocumentType`, `Description`, `TransportType` (`AccountingPurchasesController.cs:1773-1781`; `SalesProductLogisticController.cs:~2784-2830`).

**Finans kopyalanırken dikkat (kodda görülen):**
1. `ReferenceID` tek başına benzersiz değildir; **`AccountingType` ile birlikte** anlam taşır (aynı sayı hem bir `ZT_SalesTruck.ID` hem bir `ZT_ExpertReportTruckExpenses.ID` olabilir).
2. `ZT_SalesTruck` için aynı `ReferenceID + AccountingType` altında **iki borç** (kara + gemi) olabilir; ayrım yalnız `TransportType` ile.
3. Nakliye carisi iki ayrı `AccountGroup` altında açılır; aynı gerçek firma hem bahçe hem sevk nakliyesi yapıyorsa `TransportCompany`'de iki satır + iki cari olması gerekir (tek `TransportType` kolonu).
4. Bahçe nakliyesinde borcun doğru cariye yazılması **plaka metin eşleşmesine** bağlıdır.
