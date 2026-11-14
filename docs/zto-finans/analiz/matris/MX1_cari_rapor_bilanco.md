# MX-1 — Cari grubu: ZTO → Blackrose eşleme matrisi

> **12.1 uygulandı (2026-11-14); uygulama belgesi [`docs/zto-finans/uygulama/12.1_TASARIM.md`](../../uygulama/12.1_TASARIM.md).** CustomerAccounts (liste/yeni/düzenle), AccountTransaction (Transactions, AllTransactions, Statement) ve cari IBAN'ları bu ekin tamamı üzerinden yazıldı. Bu ekin uygulamada değişen noktaları (migration adları tenant V27–V30, `MUSTERI`+`ACENTE` alt grupları, `sub_group NOT NULL`, adres/IBAN/TCKN şifreli + hash + maskeli, `account_document_type` tohum tablosu, taşımada virman çifti + çeklerin taşınması (K3), limit etiketleri, sekme tablolarında dışa aktarım yok, "Sil" = pasifleştir vb.) uygulama belgesi §0.4'te (S-1…S-24) listelidir; çelişkide uygulama belgesi geçerlidir. CustomerAccountReport, FinanceReport ve FinancialBalanceSheet bölümleri 12.8'de uygulanacak.

Kapsam: AccountTransaction, CustomerAccounts, CustomerAccountReport, FinanceReport (Services/FinanceReport), FinancialBalanceSheet.
Yöntem: View'lar betikle tarandı (modal başlangıcı `class="modal`, içindeki input/select/textarea/label/button, `Url.Action`/`url:`/`$.get|post`/`fetch`), kritik JS akışları ve Blackrose kaynakları satır satır okundu. Mevcut envanter (`analiz/envanter/A_cari.md`, `B_banka_kasa.md`, `01_FINANS_ENVANTER.md`) tekrar üretilmedi; controller action satırları oradan alındı ve örnekleme ile doğrulandı. Gizli değer yazılmadı.

Kısaltmalar
- ZTO kök: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`. **AT** `Controllers/AccountTransactionController.cs` (9420 sat.), **CA** `Controllers/CustomerAccountsController.cs` (6753), **CAR** `Controllers/CustomerAccountReportController.cs` (527), **FRC** `Controllers/FinanceReportController.cs` (61), **FBS** `Controllers/FinancialBalanceSheetController.cs` (1776). **TR** `Views/AccountTransaction/Transactions.cshtml`, **TP** `Views/AccountTransaction/_TransactionsPartial.cshtml`, **CAI** `Views/CustomerAccounts/Index.cshtml`, **PT** `Views/Shared/_AllTransactionsPaymentTools.cshtml`, **tjs** `wwwroot/js/zt/accounttransaction/transactions.js` (12 790), **ajs** `wwwroot/js/zt/accounttransaction/alltransactions.js`.
- Blackrose kök: `F:\visual studio zto\LogisticErp`. **FC** `backend/src/main/java/org/ece/blackrose/finance/web/FinanceController.java`, **DTO** `…/finance/web/FinanceDtos.java`, **AS** `…/finance/service/AccountService.java`, **LS** `…/finance/service/LedgerService.java`, **PPS** `…/finance/service/PaymentPlanService.java`, **SS** `…/finance/service/SettlementService.java`, **FR** `…/finance/repository/FinanceRepositories.java`, **FT** `…/finance/domain/FinanceTypes.java`, **RC** `…/reporting/web/ReportController.java`, **V3** `backend/src/main/resources/db/migration/tenant/V3__create_finance.sql`. Tüm FC uçları `/api/v1/finance` önekli.
- Karar kodları: **MEVCUT** = UI-mevcut-API, **GENİŞLET** = UI+API-genişlet, **YENİ-API** = UI+yeni-API, **YENİ-TABLO** = UI+yeni-tablo (V22+), **ÇIKAR**.

---

## 0. Sayımlar

| Kaynak | Modal (aktif) | Yorum içinde (`@* *@`) | Not |
|---|---|---|---|
| TR | 32 | 1 (`normalDetailModal` TR:2277) | |
| TP | 19 | 1 (`normalDetailModal` TP:1646) | TR'nin alt kümesi; `AT.TransactionsPartial` (AT:8928) üzerinden CustomerCurrentAccounts modalına yükleniyor |
| tjs (dinamik HTML) | 2 | — | `paymentDetailModal` tjs:3053, `collectionDetailModal` tjs:3357 |
| CAI | 10 | — | |
| PT (AllTransactions'a gömülü) | 4 | — | CAI'deki `planActionConfirmModal, financeDashboardModal, paymentHeatmapModal, densitySettingsModal` kopyası |
| FBS view | 2 | — | |
| AllTransactions, Statement, _CurrencyStatementPartial, CA Add/Edit, _AccountsTableBody, CAR Reports, FR Index | 0 | — | Add.cshtml `modal=true` ile `_ModalFrameLayout` içinde iframe-modal olarak açılabiliyor (Add.cshtml:7) |
| **Toplam benzersiz modal davranışı** | **TR 32 + dinamik 2 + CAI 10 + FBS 2 = 46** (TP ve PT kopya) | | Brief'teki "~53" = TR 33 + TP 20 (yorumlular dahil) |

---

## 1. Sayfa ve modal envanteri

### 1.1 Sayfalar

| View | Satır | Route (action) | Amaç | Layout / JS |
|---|---|---|---|---|
| `Views/AccountTransaction/AllTransactions.cshtml` | 1415 | GET `/AccountTransaction/AllTransactions` (AT:24) | "Günlük Cari İşlemleri": tüm carilerin 4 tür hareketi tek tabloda; hızlı aralık (Bugün/Dün/7/14/30/90/180 gün), tarih, cari arama (`filterCariSearchInput`), para birimi düğmeleri, dinamik filtre kartları (İş Yerleri / Hesap Grupları / İşlem Türleri). Kolonlar: Tarih, İş Yeri, Cari Kodu, Cari Adı, Hesap Grubu, İşlem Türü, Belge No, Tutar, Açıklama, Oluşturan, İşlem (AllTransactions:1322-1340). Veri `GetAllCustomerTransactions` (AT:5477), arama `GetCustomerAccountsForSelect2` (AT:5768), `/CustomerAccounts/SearchAccountsForQuickAction` (CA:3472). PT partial (AllTransactions:1413). | `_ProductionLayout`; ajs (604), `_DataTablesScriptsPartial` |
| `Views/AccountTransaction/Transactions.cshtml` | 5208 | GET `/AccountTransaction/Transactions/{id}?currencyId&rolloverId` (AT:293) | Tek cari detay: başlık + cari değiştirici arama (`txCariSearch`), sezon seçici (`ctSeasonSelect`), limit grafiği (10/30/Maks., `openEditLimitsModal`), iş yeri filtresi (`workPlaceFilter`), 7 aksiyon düğmesi (Alacak Ekle, Tahsilat Ekle → Collections sayfası, Borç Ekle, Ödeme Ekle → Payments sayfası, Ekstre, Alış Faturaları, Satış Faturaları), 5 sekme (Tümü/Borçlar/Ödemeler/Alacaklar/Tahsilatlar → `allTransactionsTable, debtsTable, creditsTable, paymentsTable, collectionsTable`), Cari Devir ve Cari Taşıma düğmeleri. Excel/PDF düğmeleri `display:none` (TR:313,319); `exportToExcel/exportToPDF` fonksiyonu ⚠ BULUNAMADI (DataTables `buttons: copy/excel/pdf/print` tjs:975,994 aktif). | Role göre `_ProductionLayout`/`_Layout` (TR:10-23); tjs; OpenLayers 7.3.0 (TR:2274-2275), Chart.js 4.4.1 (TR:3453) |
| `Views/AccountTransaction/_TransactionsPartial.cshtml` | 2558 | GET `/AccountTransaction/TransactionsPartial/{id}` (AT:8928) | TR'nin modal içi sade kopyası (devir/taşıma/limit/satış düzenleme yok) | partial |
| `Views/AccountTransaction/Statement.cshtml` | 1515 | GET `/AccountTransaction/Statement/{id}` (AT:8366) | Yazdırılabilir cari ekstre: tarih aralığı (`stmtStartDate/stmtEndDate`), bakiye hesap kipi (`balanceCalcMode`: tx=İşlem Tarihi / inv=Fatura Tarihi, Statement:953), iş yeri filtresi (`workplaceFilter`), para birimi onay kutuları, detay görünümü (`detailToggle`), `window.print` | `Layout = null` |
| `Views/AccountTransaction/_CurrencyStatementPartial.cshtml` | 487 | partial (Statement içinde) | Para birimi başına ekstre bloğu; model `Tuple<StatementViewModel, CurrencyStatementData, int>` | partial |
| `Views/CustomerAccounts/Index.cshtml` | 13 220 | GET `/CustomerAccounts/Index?planFilter` (CA:45) | Cari kartlar listesi + ödeme planlama merkezi. Filtreler: `planStatusFilter` (''/overdue/today/noplan/future/pending/approved), `accountGroupFilter` (12 grup), iş yeri çoklu seçimi (`wpMultiselectBtn`), sıfır bakiye gizle (`toggleZeroDebt`), müşterileri gizle (`toggleCustomers`), arama (`searchInputAccount`); istatistik kartları (filterByPlan); ısı haritası, hatırlatıcı, kart gizle düğmeleri. Tablo `customerAccountsTable`: PLAN TARİHİ, HESAP KODU, CARİ HESAP & İŞ YERİ/ŞUBE, HESAP GRUBU, TOPLAM BORÇ/TOPLAM ÖDENEN, TOPLAM ALACAK/TOPLAM TAHSİLAT, BAKİYE/PLANLANAN, DURUM, İŞLEMLER. Gövde `GetAccountsTableBody` (CA:319, CAI:6012). | Role göre `_ProductionLayout`/`_Layout` (CAI:5-27); ~396 KB inline JS; Chart.js sürümsüz (CAI:5533) |
| `Views/CustomerAccounts/_AccountsTableBody.cshtml` | 666 | partial | Satır aksiyonları: Transactions linki (:199,562), `openPaymentPlanningModal` (:540), `editPaymentPlanning` (:546), `openApprovalSelectionModal` (:551), `openDeletionSelectionModal` (:555), `/BankAccounts/Index?referenceID…` (:565), Payments `openModal=true` (:573), Statement (:580), gruba özel sayfa `accountActionUrl` (:587), Edit (:593), Delete **GET** + confirm (:596-597) | partial |
| `Views/CustomerAccounts/Add.cshtml` | 810 | GET/POST `/CustomerAccounts/Add` (CA:3556 / CA:3834) | Cari kart ekleme formu + cari banka hesapları alt formu | `_ModalFrameLayout` (modal=true) / `_ExpertLayout` |
| `Views/CustomerAccounts/Edit.cshtml` | 799 | GET `/CustomerAccounts/Edit/{id}` (CA:4346), POST `Update` (CA:4946) | Aynı form + Hesap Kodu + denetim alanları | `_ExpertLayout` |
| `Views/CustomerAccountReport/Reports.cshtml` | 1062 | GET `/CustomerAccountReport/Reports` (CAR:15) | 5 sekmeli rapor: Yaşlandırma, Çek Vade, Senet Vade, Ödeme Performansı, Döviz Pozisyonu. Menüden bağlantısı ⚠ BULUNAMADI (A_cari:559) | `_ProductionLayout`; Chart.js 3.9.1 |
| `Views/FinanceReport/Index.cshtml` | 470 | GET `/FinanceReport/Index?type&range&from&to&cur&wp&account&bp` (FRC:33) | Patron finans raporu, 3 kip: Genel Bakış (tür × para birimi), Liste (türün carileri, `frSearch`), Ekstre (cari, para birimi blokları + yöntem kırılımı). Mantık `Services/FinanceReport/*` (FrTypes 7 tür, FrLedger kurallar, FrSql CTE, FrWarehouse sorgular). | `_ReportLayout`; `~/js/finance-report.js`, `report-page.js`, SheetJS xlsx |
| `Views/FinancialBalanceSheet/Index.cshtml` | 1333 | GET `/FinancialBalanceSheet/Index` (FBS:31) | İş yeri kartları halinde "Finansal Bilanço": banka/kasa, çek, cari alacak/borç, stok değeri, iş yerleri arası ticari hesap | Role göre layout (FBS view:6-18); inline JS |

### 1.2 Modallar — Transactions.cshtml (TR)

Ortak: AJAX `appUrls`/`urls` nesnesi TR:4714-4744; silme düğmesi `deleteTransaction(action,id,typeName)` tjs:10515 → `$.post(baseAction + action, {id})` tjs:10541.

| # | id (satır) | Başlık | Alanlar (id · tip · etiket · doğrulama · kaynak) | Düğmeler | AJAX → action | DB (Y=yaz, O=oku) |
|---|---|---|---|---|---|---|
| 1 | `addCreditModal` (TR:1310-1682) | Yeni Alacak Ekle (düzenleme kipinde "Güncelle", tjs:5049) | `creditDate` date *Tarih* REQ · `creditDocumentNo` text *Belge No/Fatura No* REQ (ph "Örn: IRS-2024-001") · `creditDocumentType` select REQ: Satış Faturası, İade Faturası, Sevk İrsaliyesi, Hizmet Faturası, E-Fatura, E-Arşiv Fatura, Proforma Fatura, Ön Tahsilat Fişi, Diğer · `creditDueDate` date *Vade Tarihi* · `creditAmount` number REQ min 0.01 step 0.01 *Tutar* · `creditCurrencyID` select REQ (Currency tablosu, Razor `@row["Name"] (@row["Symbol"])`) · `creditPaymentMethod` select REQ: Nakit, Banka(Havale/EFT), Çek, Senet, Kredi Kartı, Diğer · `creditWorkPlaceID` select REQ *İş Yeri* (ZT_WorkPlace + BranchProvince adı) · `creditDescription` textarea · **Araç seçimi** (`btnLoadTrucks` → `loadCustomerTrucks()` tjs:1727; tablo `truckSelectionTable`: seçim, ID, Parti No, Plaka, Tarih, Teslimat, Satış Tipi, Sipariş Tutarı, Alacak Tutarı(girdi); `selectAllTrucksCheckbox`) · **Fatura bölümü** (`creditFaturaSection`, belge türü fatura ise): `creditReflectionStatus` checkbox *Alacağa yansıt* · `creditDiscountRate` 0-100 · `creditDiscountAmount` RO · `creditVatRate` 0-100 · `creditTotalPriceExcludingVAT` RO · `creditVatAmount` RO · `creditTotalPriceIncludingVAT` RO · `creditWithholdingTaxAmount` ≥0 · `creditOtherTaxesAmount` ≥0 · `creditNetPayableAmount` hidden · `creditFooterNetPayable` RO *Net Tahsil Edilecek Tutar*. JS doğrulama: para birimi >0; Tarih+BelgeNo+Yöntem zorunlu; araç seçilmediyse Tutar>0 (tjs:2055-2110) | İptal, Kaydet (`saveCreditBtn`) | Yeni: `AddCredit` (AT:2511, `[FromBody] AddCreditRequestWithInvoice`, payload tjs:2083-2095 `CustomerAccountID, CurrencyID, Date, DueDate, DocumentNo, DocumentType, Amount, PaymentMethod, Description, WorkPlaceID, InvoiceData{…}, SalesTrucks[]`). Düzenle: `GetCreditById` (AT:2904, tjs:5033) + `UpdateCredit` (AT:3065, tjs:2122). Araçlar: `GetCustomerTrucks` (AT:4494) | Y: ZT_AccountCredits (I AT:2637/2809, U:2660,3138), ZT_AccountCreditsInvoice (I:2732,2851,3222), ZT_SalesTruck U (InvoiceDate/InvoiceNumber AT:2709). O: ZT_SalesTruck, ZT_Orders, Currency, ZT_WorkPlace |
| 2 | `addDebtModal` (TR:1683-2070) | Yeni Borç Ekle | `debtDate` REQ · `debtDocumentNo` REQ (ph "Örn: FTR-2024-001") · `debtDocumentType` REQ (varsayılan **Müstahsil Makbuzu**): Ceza Faturası, Kalite Kesintisi, Fire Kesintisi, Geç Teslimat Cezası, Eksik Teslimat Cezası, Hasar Bedeli, Masraf Yansıtması, Diğer Kesintiler, Müstahsil Makbuzu, Alış Faturası, Kasa Fişi, Serbest Meslek Makbuzu, Yurt Dışı Fatura, Proforma Fatura, Sevk İrsaliyesi, Hizmet Faturası, E-Fatura, Gider Pusulası, Diğer · `debtDueDate` *Borç Vade Tarihi* · `debtAmount` REQ min 0.01 *Mal Hizmet Toplam Tutar* · `debtCurrencyID` REQ · `debtPaymentMethod` REQ (değerler `Nakit, Banka, Çek, Senet, Kredi Kartı, Diğer`) · `workPlaceID` REQ · `debtReflectionStatus` *Borca yansıt* · **Müstahsil bölümü** (`mustahsilMakbuzuSection`): `incomeTaxWithholdingRate/Amount(RO)`, `pastureFundRate/Amount(RO)` (Mera Fonu), `socialSecurityPremiumDeductionRate`/`socialSecurityPremiumDeduction(RO)` (SGK), `exchangeRegistrationFeeRate`/`exchangeRegistrationFee(RO)` (Borsa Tescil), `commissionRate/Amount(RO)`, `otherDeductionsAmount`, `netPayableAmount` RO · **Fatura bölümü** (`faturaAlisSection`, Alış Faturası/E-Fatura/Hizmet Faturası): `discountRate/Amount`, `vatRate`, `totalPriceExcludingVAT` RO, `vatAmount` RO, `totalPriceIncludingVAT` RO, `withholdingTaxAmount`, `otherTaxesAmount`, `netPayableAmountFatura` RO · `debtDescription`. JS: para birimi>0, Tarih+BelgeNo+Tutar+Yöntem+İşYeri zorunlu, Tutar>0 (tjs:1444-1525). Payload `CashID/BankID` `#debtCashID/#debtBankID`'den okunuyor ama bu id'ler view'da **yok** (grep 0) → daima null | İptal, Kaydet (`saveDebtBtn`) | Yeni: `AddDebt` (AT:2251, tjs:2319). Düzenle: `GetDebtById` (AT:7738, tjs:4846) + `UpdateDebt` (AT:7884, tjs:1439). Kaynak sayfa yönlendirme `GetDebtRedirectInfo` (AT:8151, tjs:4820) | Y: ZT_AccountDebts (I AT:2352, U:7970), ZT_AccountDebtsInvoice (I:2392,8076; U:8021). Fatura+yansıtma kapalıysa **Amount=0** satırı (AT:2336-2345) |
| 3 | `productionDetailModal` (TR:2071) | Üretim Çavuşu Detayları | salt-okunur, JS doldurur | Kapat | `GetTransactionDetails` (AT:3344; tjs:4043/4397/4663) — ATQ `UretimCavusuQuery` | O: ZT_ProductionSergeants(Expenses) |
| 4 | `shippingDetailModal` (TR:2112) | Sevk Nakliye Firması Detayları | salt-okunur | Kapat | `GetTransactionDetails` (SevkNakliyeFirmasiQuery) | O: ZT_SalesTruck, TransportCompany, TransportTruck |
| 5 | `supplierDetailModal` (TR:2164) | Tedarikçi Borç Detayları | salt-okunur + OpenLayers harita (`supplierMapDiv`, tjs:6380-6410) | Kapat | `GetTransactionDetails` (TedarikciQuery) | O: ZT_ExpertReport*, Supplier, Product |
| 6 | `normalDetailModal` (TR:2322) | İşlem Detayları | salt-okunur | Kapat | `GetTransactionDetails` (DefaultQuery) | O: ZT_AccountDebts/Credits |
| 7 | `creditDetailModal` (TR:2358) | Alacak Detayları | salt-okunur | Kapat | `GetTransactionDetails` / `GetCreditFullDetail` (AT:4409, tjs:4605) | O: ZT_AccountCredits, ZT_AccountCreditsInvoice |
| 8 | `transportDetailModal` (TR:2384) | Nakliye Detayları | salt-okunur | Kapat | `GetTransactionDetails` (NakliyeFirmasiQuery) | O: TransportCompany/Truck, ZT_Chauffeur |
| 9 | `customerClaimModal` (TR:2424) | Müşteri Borç Detayları | salt-okunur | Kapat, Yazdır (`printClaimDetails()`) | `GetTransactionDetails` (MusteriQuery) | O: ZT_OrderClaims, ZT_Orders |
| 10 | `expenseDetailModal` (TR:2457) | Masraf Hesabı Detayları | salt-okunur | Kapat | `/productionexpenses/GetExpenseDetails` (tjs:7052, 11404) | O: ZT_ProductionExpenses(Detail) |
| 11 | `creditDebtDetailModal` (TR:2546) | Kredi Borç Detayları | salt-okunur | Kapat | `GetCreditDebtInfo` (AT:4826, tjs:3993) | O: ZT_CreditContracts, ZT_CreditInstallments |
| 12 | `pesticideSupplierDetailModal` (TR:2608) | İlaç Tedarikçi Borç Detayları | salt-okunur | Kapat | `/PesticideStockAll/GetMaterials` (tjs:11308) | O: ZT_Pesticide* |
| 13 | `analysisDetailModal` (TR:2690) | Analiz Firması Detayları | salt-okunur | Kapat | `GetTransactionDetails` (AnalizFirmasiQuery) | O: ZT_LaboratoryFirms |
| 14 | `materialSupplierDetailModal` (TR:2826) | Malzeme Tedarikçi Borç Detayları | salt-okunur | Kapat | `/MaterialStockAll/GetMaterials` (tjs:11210) | O: ZT_Material* |
| 15 | `invoicesModal` (TR:2919) | Alış Fatura Listesi – {cari} | Filtre: `invoiceDocTypeFilter` (Tümü, Müstahsil Makbuzu, Alış Faturası, E-Fatura, Hizmet Faturası, Diğer), `invoiceReflectionFilter` (Tümü/Borca Yansıyan/Yansımayan), `invoiceStartDate`, `invoiceEndDate`; tablo | Kapat; satırda detay/sil | `GetAccountInvoices` (AT:1198), `GetReferencedInvoices` (AT:1363) — tjs:10972 | O: ZT_AccountDebts⋈ZT_AccountDebtsInvoice; referanslı: ZT_MaterialInvoice, ZT_PesticideInvoice, ZT_ProductionExpenses |
| 16 | `referencedInvoiceDetailModal` (TR:3077) | Referanslı Fatura Detayı | salt-okunur | Kapat | `GetReferencedInvoices` + `/MaterialStockAll/GetMaterials`, `/PesticideStockAll/GetMaterials` | O: aynı |
| 17 | `salesInvoicesModal` (TR:3104) | Satış Fatura Listesi | Filtre: `salesInvoiceDocTypeFilter` (Tümü, Satış Faturası, İade Faturası, Sevk İrsaliyesi, Hizmet Faturası, E-Fatura, E-Arşiv Fatura), `salesInvoiceReflectionFilter` (Alacağa Yansıyan/Yansımayan), `salesInvoiceStartDate/EndDate` | Kapat | `GetAccountSalesInvoices` (AT:1977), `GetReferencedSalesInvoices` (AT:1862, tjs:12043), `/MaterialStockAll/GetSalesMaterials` (tjs:12144), `/PesticideStockAll/GetSalesMaterials` (tjs:12161) | O: ZT_AccountCredits⋈ZT_AccountCreditsInvoice, ZT_MaterialSalesInvoice, ZT_PesticideSalesInvoice |
| 18 | `salesInvoiceDetailModal` (TR:3259) | Satış Fatura Detayı | salt-okunur | Kapat | `GetSalesInvoiceDetail` (AT:2075, tjs:12320) | O |
| 19 | `deleteSalesInvoiceConfirmModal` (TR:3283) | Satış Fatura Silme Onayı | — | İptal, Evet Sil (`confirmDeleteSalesInvoiceBtn`) | `DeleteSalesInvoice` (AT:2182, tjs:12518-12525) | Y: ZT_AccountCreditsInvoice U IsDeleted (AT:2212), ZT_AccountCredits **D** (AT:2221) |
| 20 | `invoiceDetailModal` (TR:3337) | Fatura Detayı | salt-okunur | Kapat | `GetInvoiceDetail` (AT:1635, tjs:11599) | O |
| 21 | `deleteInvoiceConfirmModal` (TR:3361) | Fatura Silme Onayı | — | İptal, Evet Sil (`confirmDeleteInvoiceBtn`) | `DeleteInvoice` (AT:1785, tjs:11909-11916) | Y: ZT_AccountDebtsInvoice U (AT:1817), ZT_AccountDebts **D** (AT:1828) |
| 22 | `deleteTransactionConfirmModal` (TR:3417) | Silme Onayı (`deleteTransactionType` metni) | — | İptal, Evet Sil (`confirmDeleteTransactionBtn`) | `DeleteDebt` (AT:6791) / `DeleteCredit` (AT:7427) / `DeletePayment` (AT:7564) / `DeleteCollection` (AT:7309) — tjs:10532-10541 | Y: ilgili tabloda **hard DELETE** (AT:6855,7042,7128 / 7515 / 7646 / 7385); bağlı ZT_BankTransactions/ZT_CashTransactions `Status=false` (AT:7357,7371,7611,7630); Malzeme Tedarikçisi'nde stok geri alma (AT:6883-7070), Sevk Nakliye'de ZT_SalesTruck temizleme + `ZT_SalesTruckDebtLog` çalışma-zamanı DDL (AT:7281) |
| 23 | `editLimitsModal` (TR:3456) | Risk & Borç Limiti Düzenle | `editCreditLimitInput` number min 0 step 0.01 etiket **"Risk Limiti"**; `editRiskLimitInput` etiket **"Borç Limiti"** (adlar çapraz!) | İptal, Kaydet (`saveLimits()` tjs:586) | `UpdateCreditRiskLimits` (AT:9394) `{customerAccountId, creditLimit, riskLimit}` | Y: ZT_CustomerAccounts U CreditLimit, RiskLimit (AT:9405) |
| 24 | `cariTasimaModal` (TR:3550) | Cari Taşıma | `ctTargetSearch` text (ph "Cari adı / kodu ara...", etiket "Hedef Cari (yalnız aynı hesap grubu: …)") + `ctTargetId` hidden; `ctDescription` text *Açıklama (opsiyonel)*; gruplama düğmeleri "Para Birimi"/"İş Yeri"; `ctTxnGroups` hareket seçim listesi, `ctSelectedCount` | Geçmiş Taşımalar (`btnCtHistory`), Kapat, Taşı (`btnCtTransfer`) | `GetTransactionsForTransfer` (AT:5826), `GetCustomerAccountsForSelect2` (AT:5768), `TransferTransactions` (AT:5922) — URL'ler TR:3716-3719 | Y: ZT_AccountDebts/Credits/Payments/Collections U CustomerAccountID; ZT_Checks U DrawerCustomerID (AT:6015); ZT_Bills U DrawerID (AT:6034); ZT_AccountTransferHistory I (AT:6054) |
| 25 | `cariTasimaHistoryModal` (TR:3605) | Geçmiş Cari Taşıma İşlemleri | `ctHistStart`, `ctHistEnd` date | Filtrele (`ctHistFilter`), Son 6 Ay (`ctHistReset`), Kapat | `GetTransferHistory` (AT:6092) | O: ZT_AccountTransferHistory |
| 26 | `ctConfirmModal` (TR:3657) | Cari Taşıma Onayı | — | Vazgeç, Evet Taşı (`ctConfirmYes`) | → TransferTransactions | — |
| 27 | `cariDevirModal` (TR:4063) | Cari Devir / Sezon | `cdDevirDate` date *Devir Tarihi* * · `cdSeasonName` text *Sezon Adı* * (ph "Örn. 2026 Sezonu"); tablo `cdDevirTable`: Sezon Adı, Devir Tarihi, Yapan, Oluşturma, Düzenleme, Durum, İşlem | Devir Oluştur (`btnCdCreate`), Vazgeç (`btnCdCancelEdit`), Silinenler (`btnCdShowDeleted`), Kapat | `CreateDevir` (AT:6162), `UpdateDevir` (6269), `SetActiveDevir` (6315), `GetDevirs` (6221), `GetDevirBalances` (6499, tjs:1073) — URL'ler TR:4369-4375 | Y: ZT_AccountRollover I (AT:6194), U (6188…) |
| 28 | `cariDevirDeletedModal` (TR:4122) | Silinmiş Devirler / Sezonlar | tablo: Sezon Adı, Devir Tarihi, Oluşturan, Silen, Silme Tarihi, İşlem(geri al) | Kapat | `GetDeletedDevirs` (AT:6425), `RestoreDevir` (AT:6468) | Y: ZT_AccountRollover U IsDeleted=false |
| 29 | `cdActiveDeleteModal` (TR:4156) | Aktif Sezon Siliniyor | `cdNewActiveSelect` select * *Yeni Aktif Sezon* (kaynak: GetDevirs) | Vazgeç, Sil ve Aktif Yap (`btnCdConfirmActiveDelete`) | `DeleteDevir` (AT:6354; aktif silinirken yeni aktif zorunlu AT:6374-6385) | Y: ZT_AccountRollover soft delete + yeni aktif |
| 30 | `cdConfirmModal` (TR:4177) | Onay | — | Vazgeç, Evet (`cdConfirmYes`) | genel onay (devir sil/aktif yap) | — |
| 31 | `cdAlertModal` (TR:4196) | Bilgi | — | Tamam | — | — |
| 32 | `saleEditModal` (TR:4214) | Satış Bilgileri (Alacak) — Düzenle | `seTruckId` hidden, `seCustomer` RO, `seTruckNo` RO, `seTotalNet` RO (kg), `seCurrency` select; ürün bazlı fiyat tablosu `seTableBody` (Parti, Ürün, Cins, Net kg, Birim Fiyat, Toplam), `seGrandTotal`; palet akordeonu (Parti, Ürün, Cins, Palet, Kasa, Brüt, Net) | Kapat, Kaydet (`seSaveBtn`) | `/SalesProductLogistic/GetCurrencies` (TR:4978), `GetWithoutOrderDetails` (TR:4990), `SaveOfficialInfoComprehensive` (TR:5186); `/Product/…` (TR:5008) | Y: satış modülü tabloları (finans dışı) |
| D1 | `paymentDetailModal` (tjs:3053, dinamik) | Ödeme detayı | salt-okunur; düzenle → Payments sayfası `openEditPayment=true` (tjs:2916) | Kapat | `CustomerAccountPayment/GetPaymentDetail` (tjs:2935) | O: ZT_AccountPayments |
| D2 | `collectionDetailModal` (tjs:3357, dinamik) | Tahsilat detayı | salt-okunur; düzenle → Collections `openEditCollection=true` (tjs:2925) | Kapat | `CustomerAccountCollection/GetCollectionDetail` (tjs:2957) | O: ZT_AccountCollections |

Sayfa (modal dışı) AJAX'ları: `GetAllTransactions` (AT:5200, tjs:2487), `GetAccountDebts/Credits/Payments/Collections` (AT:4696/4912/5013/5112; tjs:3560/3664/3768/3821), `GetWorkPlaceBalances` (AT:1007, tjs:10653), `GetAvailableCurrencies` (AT:4629, tjs:12582), `CashTransactions/GetCashList`, `BankTransactions/GetBankList` (tjs:2447/2458), `/CustomerAccounts/SearchAccountsForQuickAction` (TR:4900). Tahsilat/Ödeme Ekle düğmeleri **modal değil**, başka sayfaya `openModal=true` ile gider (tjs:2425-2435).

### 1.3 Modallar — _TransactionsPartial (TP) farkları

19 modal TR #1-6, 8-10, 12-15, 17-22 ile aynı id/alan. Farklar: `addCreditModal` (TP:772) araç seçimi yok, etiket "Belge No/**İrsaliye** No", `creditNetPayableAmount` görünür RO (TP:1012), yansıtma onay kutusu en altta (TP:1025); `supplierDetailModal` başlığı "Tedarikçi Detayları"; `creditDetailModal`, `creditDebtDetailModal`, `referencedInvoiceDetailModal`, limit/taşıma/devir/satış modalları yok. React'te TR bileşenleri `variant="partial"` ile yeniden kullanılmalı.

### 1.4 Modallar — CustomerAccounts/Index (CAI) ve PT

| # | id (satır) | Başlık | Alanlar | Düğmeler | AJAX → action | DB |
|---|---|---|---|---|---|---|
| 1 | `currencyDetailModal` (CAI:4627) | (dinamik) | salt-okunur: para birimi × iş yeri bakiyesi | — | `GetCurrencyDetailByWorkPlace` (CA:2364, CAI:12330) | O: ZT_Account* (CA:2429-2447) |
| 2 | `planDetailModal` (CAI:4645) | Ödeme Planları | salt-okunur plan listesi | Cari Hareketlerini İncele (`goToAccountTransactions()`), Kapat | `GetAllPlansForCustomer` (CA:2544, CAI:12658/12884) | O: ZT_CustomerAccountPaymentPlans |
| 3 | `planActionConfirmModal` (CAI:4678; PT:583) | (dinamik, `showPlanActionConfirm` CAI:8746) | — | İptal, (onay dinamik) | Erteleme `PostponePaymentPlan` (CA:2876; `{planId,newDate}` CAI:8662), Sil `DeleteDashboardPlan` (CA:2932, CAI:8684), Ödendi `MarkDashboardPlanPaid` (CA:2981, CAI:8702) | Y: plans U PaymentPlanDate; **D** (CA:2947, yalnız Manuel/Maaş); U PaymentStatus='Ödendi' (ödeme kaydı **yaratmadan**) |
| 4 | `financeDashboardModal` (CAI:4694; PT:600) | Ödeme Planı Hatırlatıcısı | plan kartları; satır içi erteleme formu (`postpone-form-{id}`, yeni tarih) | Bir Daha Gösterme (`snoozePaymentReminder()`, localStorage CAI:8423), Tekrar Hatırlat (`btnReminderRemindLater`) | `GetUpcomingPaymentPlansForDashboard` (CA:2731; CAI:8433,8445,8721) + #3 uçları | O/Y: ZT_CustomerAccountPaymentPlans |
| 5 | `paymentPlanningModal` (CAI:4756) | Ödeme Planlaması | Üst: `planCurrencyDropdown` (onPlanCurrencyChange, kaynak `GetAllCurrenciesForPlan` CA:3197), `heatmapRangeSelect` (Haftalık/Bu Ay/3/6/12 Ay), `weeklyAggregateToggle`; gizli `planCustomerAccountID`, `planCurrencySymbol`, `planPaymentPlanCurrencyID`. **Satır** (`addPaymentRow` CAI:6795): `.plan-date` date (bugün), `.plan-amount` number min 0 step 0.01, `.plan-currency` select (PB), `.plan-desc` text, `.plan-branch` select (Şube; `GetAllBranchProvinces` CA:3155) → `.plan-workplace` (`GetWorkPlacesByBranch` CA:2259) → `.plan-bank` (`GetBanksByWorkPlaceAndCurrency` CA:3097, vadesiz + para birimi eşleşmeli), kaynak rozeti (Manuel/Çek/Kredi/Maaş), sil. Manuel olmayan satırlar salt-okunur + kilit. Doğrulama: Manuel satırda Tarih, Tutar>0, Şube, İş Yeri, Banka zorunlu (CAI:7008); en az bir Manuel satır veya iptal (CAI:7028-7040). Para birimine göre toplam alt satırı | Satır Ekle, Yoğunluk Ayarları, İptal, Kaydet (`savePaymentPlanning()` CAI:6989) | Yükle: `GetPaymentPlanningDetails` (CA:3034; CAI:6754/7104/7147). Kaydet: `SavePaymentPlanning` (CA:1735, JSON `{customerAccountID, plans[{id,paymentPlanDate,paymentAmount,paymentPlanCurrencyID,paymentDescription,paymentBranchProvinceID,paymentWorkPlaceID,paymentBankID}], cancelledPlanIds[]}` CAI:7043) | Y: ZT_CustomerAccountPaymentPlans I (CA:1754)/U; ZT_CustomerAccounts düz plan kolonları U (CA:1840-1891) |
| 6 | `densitySettingsModal` (CAI:4937; PT:856) | Ödeme Yoğunluğu Eşik Değerleri | Para birimi başına dinamik satır (CAI:11195-11225): `den_little_{cur}`, `den_middle_{cur}`, `den_intensive_{cur}`, `den_veryIntense_{cur}` number min 1; doğrulama küçük<orta<yoğun<çok yoğun (CAI:11236); satır Kaydet `den_save_{cur}` | Kapat | `GetPaymentDensities` (CA:6656, CAI:8332), `SavePaymentDensity` (CA:6705, CAI:11242) | Y: ZT_PaymentDensityCurrencies I/U |
| 7 | `approvalSelectionModal` (CAI:4966) | Onaya Gönderilecek Planları Seçin | `selectAllApprovalPlans` + satır onay kutuları | İptal, Seçilenleri Onaya Gönder (`confirmBulkSendToApproval()` CAI:7219) | `BulkSendToApproval` (CA:2160, CAI:7237); tekil `SendToApproval` (CA:1937, CAI:7060) | Y: plans ApprovalStatus='Onay Bekliyor' |
| 8 | `deletionSelectionModal` (CAI:5007) | Silinecek Planları Seçin | `selectAllDeletionPlans` + satırlar | İptal, Seçilenleri Sil (`confirmBulkDeletePlans()` CAI:7259) | `BulkDeletePlans` (CA:2210, CAI:7277); tekil `DeletePaymentPlanning` (CA:2086, CAI:7069) | Y: plans soft (yalnız Manuel, CA:2097,2224) |
| 9 | `treasuryModal` (CAI:5048) | Finansal Varlık Durumları — Banka, Kasa ve Finansal Varlıklar | `treasuryBranchFilter` (Tüm Şubeler; GetAllBranchProvinces), `treasuryWorkPlaceFilter` (GetAllWorkPlaces CA:6628); 4 grafik (banka, kasa, varlık dağılımı, vade — CAI:8116-8276) | Excel (`exportTreasuryToExcel()` → **yalnız alert**, CAI:8324-8327), Yazdır, Kapat | `GetTreasuryOverview` (CA:5919, CAI:7343) | O: ZT_BankIntroduction, ZT_CashIntroduction, ZT_BankTransactions, ZT_CashTransactions, ZT_Checks, ZT_Bills (CA:6007-6578) |
| 10 | `paymentHeatmapModal` (CAI:5329; PT:657) | Ödeme Planlama Isı Haritası | `heatmapViewMode` (Haftalık/Günlük), `heatmapCurrencySelect` (₺/$/€), `heatmapYearSelect` (y–y+1); kaynak filtreleri `srcFilter_Manuel/Cek/Kredi/Maas` | Yoğunluk Ayarları, Kapat | `GetPaymentHeatmapData(year, customerAccountId)` (CA:1146, CAI:8903/10407), `GetExchangeRatesForHeatmap` (CA:1306, CAI:9558); seviye 5 kademe `getPlanningHeatmapLevel` (CAI:10200-10212) | O: plans (`PaymentStatus NOT IN ('Tamamlandı','İptal')`), ZT_Checks |

### 1.5 Modallar — FinancialBalanceSheet

| id (satır) | Başlık | Alanlar | Düğmeler | AJAX | DB |
|---|---|---|---|---|---|
| `fbsStockModal` (FBS view:864) | Stoklar ve Kaynaklar — {iş yeri} | salt-okunur (işçilik/hammadde/maliyet tabloları, FBS view:1087-1117); açılış `fbsOpenStockModal(wpId)` | Kapat | yok — Index modelinden (`LoadStockValuesByWorkPlace`) | O: ZT_MaterialStockAll, ZT_PesticideStockAll, ZT_ExpertReportTruck, ZT_PalletsLoadedTruck, ZT_DistributedPallet, ZT_ProductionConveyor(Cost), ZT_StockMovementLog … |
| `fbsTradeDebtModal` (FBS view:891) | İş Yerleri Arası Ticari Hesap — {iş yeri} | Borçlar/Alacaklar sekmesi (`fbsTdSetMode`), `fbsTdSearch` (parti/müşteri/ürün/plaka…), `fbsTdStart`, `fbsTdEnd` (FBS view:966-969) | Borçlar, Alacaklar | `GetInterWorkplaceTradeDebt(workPlaceId,startDate,endDate)` (FBS:1355; view:988) | O: ZT_ExpertReportTruck, ZT_ProductionSergeant*, ZT_StockMovementLog, ZT_Purchases |

### 1.6 Sayfa formları (modal değil ama birebir kopyalanacak)

**CustomerAccounts/Add.cshtml** (asp-for alanları, sıra korunmalı): AccountGroup select REQ (:179) · ExpenseTypeID *Masraf Türü* (:188, yalnız Masraf Hesabı) · BranchProvinceID *Şube* (:201) · ReferenceID *Referans Hesap* (:221, `GetReferencesByAccountGroup` CA:3703) · WorkPlaceID *Varsayılan İş Yeri* REQ (:228) · AccountName REQ (:261) · Phone (:273) · TaxNumber *Vergi No* (:287, etiket yıldızlı ama `required` yok) · TaxOffice (:291) · CompanyType (Bireysel/Kurumsal, :295) · CurrencyID REQ (:305) · CreditLimit (:315) · RiskLimit (:319) · IsCreditBankAccount checkbox (:326) · Email (:345) · Website (:349) · ContactPerson (:355) · ContactTitle (:359) · ContactMobile (:363) · Address (:377) · City (:383) · District (:387) · Country (:391) · PostalCode (:395) · PaymentTerms (:409) · Notes (:413) · **Banka Ekle** alt formu (`BankAccounts[i].*` :550-581): Bank, BranchName, AccountNumber, IBAN, AccountHolderName, CurrencyID, AccountType (Vadeli/Vadesiz/Birikim/Kurumsal), AccountCategory (Ana/Yan Hesap), AccountOpenDate, LastTransactionDate, Description (+gizli ID, BankCode, WorkPlaceID, BranchProvinceID, InitialBalance, Balance) · Kaydet. Yazar: ZT_CustomerAccounts I (CA:3889), referans tablolara I (`InsertReferenceRecord` CA:4032-4335), ZT_BankAccounts I (CA:5571), "İş Yeri Firması" ise ZT_WorkPlace I (CA:4270). Kod öneki gruba göre (CA:4012-4030).
**Edit.cshtml**: aynı + `AccountCode` REQ (:243), ReferenceID REQ (:203), denetim salt-okunur: Oluşturma Tarihi, Oluşturan, Son Güncelleme, Güncelleyen, Değişiklik Geçmişi (:434-450) · Güncelle → `Update` (CA:4946). **Delete** GET (CA:4579): soft (`Status=false, DeletedAt/By`), referans kayıt pasif.

### 1.7 CustomerAccountReport / FinanceReport sayfa kontrolleri

- CAR Reports: Yaşlandırma (`agingCustomerId`, `agingAccountGroup`, `agingDate`; `GetAgingReport` CAR:63), Çek Vade (`checkStartDate`, `checkEndDate`, `checkStatus`; CAR:172; satır linki `EditCheck` **kırık**, Reports:743), Senet Vade (`billStartDate/EndDate/billStatus`; CAR:268; `EditBill` kırık, :844), Ödeme Performansı (`perfStartDate/EndDate/perfCustomerId`; CAR:365), Döviz Pozisyonu (CAR:458). Sınıfta `[Authorize]` yok (A_cari:541). Okur: ZT_CustomerAccounts, ZT_Account*, ZT_Checks, ZT_Bills, Currency.
- FinanceReport: filtre çubuğu `_ReportFilterBar` (type, range, from, to, cur, wp, bp, account), `frSearch`, Excel (data-fr-sheet → SheetJS). Bakiye N=(Alacak−Tahsilat)−(Borç−Ödeme), ödeme `PaymentStatus<>'İptal'`, Amount=0 hariç (FrSql.cs:7-9,62); türler FrTypes.cs:30-39; ekstre sıralaması D,C,P,T (FrLedger.cs:55); ekstrede alacak+ödeme BORÇ sütununa (FrLedger.cs:13).

---

## 2. Eşleme tabloları

### 2.0 Hesap grubu → Blackrose `AccountType` (FT:8-15: CUSTOMER, CARRIER, SUPPLIER, EMPLOYEE, BANK, LEAD)

Öneri: `AccountType` 6 değerle **kalsın** (tüm uçlar, aging FC:195 ve AS:183-188 buna bağlı); ZTO'daki ince ayrım için `account.sub_group` + `account_group` arama tablosu (V22) eklensin. ZTO "Hesap Grubu" filtresi/select'i bu tablodan dolar (etiket aynı kalır).

| ZTO AccountGroup (kod öneki CA:4012-4030) | Blackrose type | sub_group önerisi (lojistik) | Karar / gerekçe |
|---|---|---|---|
| Müşteri (MUS) | CUSTOMER | KURUMSAL / BIREYSEL / ACENTE | MEVCUT (tip) + YENİ-TABLO (sub_group) |
| Tedarikçi (MST, bahçe üreticisi) | SUPPLIER | GENEL | Kavram ÇIKAR (bahçe), mevcut veriler SUPPLIER/GENEL'e |
| Malzeme Tedarikçisi (MZT) | SUPPLIER | YEDEK_PARCA_SERVIS | YENİ-TABLO |
| İlaç Tedarikçisi (ILT) | SUPPLIER | AKARYAKIT (lojistikte en yakın sarf tedarikçisi) | Kavram ÇIKAR (zirai ilaç); grup yeniden kullanılır |
| Kesim Çavuşu (KSC) | — | — | ÇIKAR (hasat işçiliği; lojistik karşılığı yok) |
| Üretim Çavuşu (URC, "ardiye yövmiyecisi") | SUPPLIER | ELLECLEME_TASERON (depo elleçleme işçiliği) | Dönüştür — depo modülündeki handling ile anlamlı |
| Nakliye Firması (BHN) | CARRIER | TASERON_NAKLIYECI | MEVCUT |
| Sevk Nakliye Firması (SVN) | CARRIER | SEVK_NAKLIYECI (ya da TASERON_NAKLIYECI ile birleştir) | MEVCUT |
| Analiz Firması (ANL) | SUPPLIER | HIZMET (gümrük müşaviri, sigorta, sörvey, liman/terminal) | Dönüştür |
| İş Yeri Firması (ISY) | — | — | ÇIKAR: Blackrose'da iş yeri = `branch` (V1); şubeler arası para hareketi `POST /funds/transfers` (FC:246). Cari olarak tutulmaz; ZTO'daki "kendi iş yerini toplamdan çıkar" kuralı (AT:580-760, CA:447-456) gereksizleşir |
| Masraf Hesabı (MSR) | — (cari değil) | — | Blackrose'da gider = `expense_type/expense_item` (V3:79-119) + `settlement.expense_item_id` (SS). ZTO masraf carisi → gider kalemi. Kredi banka carisi (`IsCreditBankAccount`) → **BANK** |
| Personel (PER) | EMPLOYEE | SURUCU / OFIS | MEVCUT + yeni yetki `FINANCE_EMPLOYEE_VIEW` (Personel gizleme kuralı, CA:717-718) |
| (diğer, CAR öneki) | SUPPLIER | GENEL | |
| — | LEAD | — | CRM adayı; finans listelerinde varsayılan gizli (ZTO'da karşılığı yok) |

FinanceReport 7 türü (FrTypes.cs:32-38) önerisi: sales→CUSTOMER; garden→SUPPLIER(GENEL) "Tedarikçiler"; material→SUPPLIER(YEDEK_PARCA_SERVIS, AKARYAKIT); harvest→ÇIKAR; labor→SUPPLIER(ELLECLEME_TASERON) "Elleçleme Taşeronları"; other→CARRIER + SUPPLIER(HIZMET) "Taşeron Nakliye ve Hizmet"; personnel→EMPLOYEE (yalnız `FINANCE_EMPLOYEE_VIEW`). Tür tanımı sabit kodda değil `account_group.report_type` kolonunda tutulsun.

### 2.1 AllTransactions

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sayfa veri kaynağı `GetAllCustomerTransactions` (AT:5477) | Cari-üstü hareket listesi yok; yalnız tek cari ekstresi FC:184 | YENİ-API `GET /finance/account-transactions?from&to&accountId&currency&branchIds&accountTypes&subGroups&kinds&page` (kinds: INVOICE_DEBIT, INVOICE_CREDIT, PAYMENT, COLLECTION, MANUAL, REVERSAL… `source_type`+`direction`'dan türetilir) |
| Hızlı aralık, tarih, para birimi düğmeleri | `GET /currencies` FC:501 | MEVCUT (para birimi listesi) |
| Cari arama `GetCustomerAccountsForSelect2` / `SearchAccountsForQuickAction` | `GET /accounts?search=` FC:135 | MEVCUT |
| Filtre kartları (İş Yerleri / Hesap Grupları / İşlem Türleri) sayımlı | — | YENİ-API (yukarıdaki uç `facets=true` ile kırılım dönsün) |
| Satır "İşlem" → Transactions sayfası | React route | MEVCUT |
| PT modalları (§2.4 #3,#4,#6,#10) | §2.4 | §2.4 |

### 2.2 Transactions sayfası ve modalları

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sayfa başlığı/cari kartı, bakiye kartları (devir öncesi/sonrası/genel, AT:695-801) | `GET /accounts/{id}` FC:142 → `balances[]` (debit, credit, balance, tlBalance; AS:208-225) | GENİŞLET: kırılım (fatura borcu/alacağı ↔ ödeme/tahsilat ayrı toplamlar), `asOf`/`rolloverId`, `branchId` parametreleri |
| Cari değiştirici `txCariSearch` | FC:135 | MEVCUT; Personel gizleme için GENİŞLET (yetkiye göre EMPLOYEE süzgeci sunucuda) |
| Sezon seçici `ctSeasonSelect` | — | YENİ-TABLO (`account_rollover`, V24) |
| Limit grafiği + limit kutuları | — | YENİ-TABLO (`account.credit_limit/risk_limit`, V22) + grafik verisi için ekstre ucu |
| İş yeri filtresi `workPlaceFilter` / `GetWorkPlaceBalances` (AT:1007) | `branch` (V1); ekstrede şube filtresi yok (FR:178-203) | GENİŞLET: `GET /accounts/{id}/balances?groupBy=branch` |
| Sekmeler Borçlar/Alacaklar/Ödemeler/Tahsilatlar/Tümü (AT:4696/4912/5013/5112/5200) | FC:184 statement (tek para birimi, sayfalı) | GENİŞLET: `GET /account-transactions?accountId=…&kinds=` (§2.1 ucu), belge no/tür/vade/yöntem/oluşturan kolonları için `account_document` join |
| Tahsilat Ekle / Ödeme Ekle düğmeleri (sayfaya gider) | `POST /collections`, `POST /payments` FC:296/313 | MEVCUT (MX'in C grubu sayfaları; bu grupta yalnız yönlendirme) |
| Ekstre düğmesi | §2.3 | — |
| #1 `addCreditModal` | Fatura türleri için Blackrose satış faturası yalnız sefer/depo faturası (`freight_invoice` V7:126, `warehouse_invoice` V8:159) — elle cari alacağı: `POST /accounts/{id}/transactions` FC:169 (direction DEBIT, yalnız tutar+açıklama, DTO:56-62) | YENİ-TABLO: `account_document` + `account_document_tax` (V23), uç `POST /accounts/{id}/documents` (side=RECEIVABLE → LedgerService.post DEBIT, source_type `ACCOUNT_DOCUMENT`). Belge No/Türü/Vade/Yöntem/İş yeri/İndirim/KDV/Stopaj/Diğer vergi aynen. **Araç seçimi bölümü ÇIKAR** (satış TIR'ı; lojistikte sefer faturası sefer ekranından kesilir — ShipmentController.java:271) |
| #1 düzenleme kipi (`GetCreditById`/`UpdateCredit`) | Ledger değişmez (LS:17) | YENİ-API `POST /account-documents/{id}/revise` (eski belgeyi iptal→ters kayıt, yenisini kaydet; aynı modal) |
| #2 `addDebtModal` | `POST /purchase-invoices` FC:347 (yalnız net+KDV, due zorunlu, DTO:238-247) veya manuel CREDIT FC:169 | YENİ-TABLO (aynı `account_document`, side=PAYABLE → CREDIT). **Müstahsil bölümü ÇIKAR** (gelir vergisi stopajı hariç: genel "Stopaj" alanı korunur; Mera Fonu/SGK/Borsa Tescil/Komisyon tarıma özgü). Belge türü listesinden Müstahsil Makbuzu ÇIKAR; varsayılan "Alış Faturası" |
| #2 `GetDebtRedirectInfo` (kaynak modüle git) | `source_type` → kaynak ekran (FREIGHT_INVOICE, TRIP_COST, VEHICLE_EXPENSE, WAREHOUSE_INVOICE, PURCHASE_INVOICE, SETTLEMENT…; LS çağıranları: TripFinanceService.java:117/290, VehicleExpenseService.java:85, WarehouseBillingService.java:230, PurchaseInvoiceService.java:70, SS:113) | YENİ-API `GET /accounts/transactions/{id}/source` (kaynak tür+id+özet+route) |
| #3 production, #4 shipping, #5 supplier(+harita), #12 pesticide, #13 analysis, #14 materialSupplier, #9 customerClaim | — | ÇIKAR (üretim/bahçe/ilaç/sipariş tabloları; OpenLayers haritası dahil). #9 yazdır davranışı #6'ya taşınır |
| #6 `normalDetailModal`, #7 `creditDetailModal` | `AccountTransactionResponse` DTO:66-78 (tek kayıt GET yok) | YENİ-API `GET /accounts/transactions/{id}` (+ bağlı `account_document` ve vergi kırılımı) |
| #8 `transportDetailModal` | Taşeron nakliyeci borcu = `trip_cost` (V7:150) → TripFinanceService.java:290 CREDIT | YENİ-API (kaynak çözücü ucu `source` → sefer/leg/araç özeti) |
| #10 `expenseDetailModal` | `vehicle_expense` (V6:58) / `settlement.expense_item_id` | YENİ-API (kaynak çözücü) |
| #11 `creditDebtDetailModal` | Kredi sözleşmesi Blackrose'da yok | ÇIKAR (kredi modülü C grubu kararına bağlı; ⚠ C grubu belirleyecek) |
| #15 `invoicesModal` (alış) | `GET /purchase-invoices` FC:341 (cari filtresi yok) | GENİŞLET: `accountId`, `documentType`, `reflected`, `from/to` filtreleri; liste = purchase_invoice ∪ account_document(PAYABLE, fatura türleri) |
| #16 `referencedInvoiceDetailModal` | — | ÇIKAR (malzeme/ilaç stok faturası) |
| #17 `salesInvoicesModal` | freight_invoice / warehouse_invoice (yalnız sefer/sözleşme bazlı uç: ShipmentController.java:262, WarehouseController.java:412) | YENİ-API `GET /finance/accounts/{id}/sales-invoices?docType&reflected&from&to` (freight ∪ warehouse ∪ account_document RECEIVABLE) |
| #18 `salesInvoiceDetailModal`, #20 `invoiceDetailModal` | — | YENİ-API `GET /account-documents/{id}`; sefer/depo faturası için mevcut PDF uçları (ShipmentController.java:286, WarehouseController.java:435) |
| #19 `deleteSalesInvoiceConfirmModal`, #21 `deleteInvoiceConfirmModal` | `POST /purchase-invoices/{id}/cancel` FC:354; sefer `POST /shipment/invoices/{id}/cancel` (ShipmentController.java:279), depo (WarehouseController.java:428) | GENİŞLET/YENİ-API: `POST /account-documents/{id}/cancel`; mevcut iptal uçları MEVCUT. "Sil" metni korunur, işlem iptal+ters kayıt |
| #22 `deleteTransactionConfirmModal` | Manuel: `POST /accounts/transactions/{id}/reverse` FC:177 (AS:123-144); ödeme/tahsilat: `POST /settlements/{id}/reverse` FC:323; belgeli hareket kendi belgesinden (AS:136-142) | GENİŞLET: tek "sil" ucu `POST /accounts/transactions/{id}/void` → source_type'a göre doğru iptale yönlendirir (ACCOUNT_DOCUMENT → documents/cancel, SETTLEMENT → settlement reverse, MANUAL → reverse). ReverseRequest `date` zorunlu (DTO:64): modal alan eklemeden bugünün tarihi gönderilir |
| #23 `editLimitsModal` | — | YENİ-TABLO (V22 kolonları) + YENİ-API `PUT /accounts/{id}/limits` |
| #24 `cariTasimaModal`, #26 `ctConfirmModal` | Hareketin `account_id`'si değiştirilemez (ledger tek yazıcı) | YENİ-TABLO `account_transfer` (V25) + YENİ-API `GET /accounts/{id}/transferable-transactions`, `POST /account-transfers` (virman: kaynak cariye ters yön, hedef cariye aynı yön; source_type `ACCOUNT_TRANSFER_OUT/IN`) |
| #25 `cariTasimaHistoryModal` | — | YENİ-API `GET /account-transfers?accountId&from&to` |
| #27-#31 devir/sezon modalları | Açılış bakiyesi içe aktarma var (`/opening-balances` OpeningBalanceController.java:19) ama sezon sınırı yok | YENİ-TABLO `account_rollover` (V24) + YENİ-API (CRUD, activate, delete?newActiveId, deleted list, restore, balances). Devir **hareket üretmez** (ZTO kuralıyla aynı) |
| #32 `saleEditModal` | — | ÇIKAR (satış TIR'ı ürün/palet fiyatlaması) |
| D1 `paymentDetailModal`, D2 `collectionDetailModal` | `SettlementResponse` DTO:215; tek kayıt GET yok, liste `GET /payments` FC:289 cari filtresiz | YENİ-API `GET /settlements/{id}`; GENİŞLET liste `accountId` |
| `GetAvailableCurrencies` (AT:4629) | balances[] para birimleri | MEVCUT |
| `GetCustomerTrucks` (AT:4494) | — | ÇIKAR |

### 2.3 Statement (Ekstre) + _CurrencyStatementPartial

| ZTO öğe | Blackrose | Karar |
|---|---|---|
| Ekstre verisi (AT:8366) çok para birimli, iş yeri bloklu | `GET /accounts/{id}/statement?currency&from&to` FC:184 (tek para birimi, açılış + yürüyen bakiye, FR:178-203) | GENİŞLET: `currency` opsiyonel (hepsi), `branchId`, belge no/tür/vade kolonları, yöntem kırılımı (FrLedger.cs:79-84 eşdeğeri) |
| `balanceCalcMode` İşlem/Fatura tarihi | `transaction_date` tek tarih | GENİŞLET: `dateBasis=DOCUMENT` → `account_document.document_date` |
| `detailToggle` (fatura vergi kırılımı) | — | YENİ-TABLO (account_document_tax) |
| Yazdır | tarayıcı yazdırma | MEVCUT (UI) |

### 2.4 CustomerAccounts/Index + PT

| ZTO öğe | Blackrose | Karar |
|---|---|---|
| Liste + `GetAccountsTableBody` (borç/ödenen, alacak/tahsilat, bakiye/planlanan, plan tarihi, durum) | `GET /accounts?search` FC:135 (balances debit/credit, AS:56-63) | GENİŞLET: `types[]`, `subGroups[]`, `branchIds[]`, `hideZero`, `planFilter` (overdue/today/noplan/future/pending/approved), `includePlanSummary` (en yakın plan tarihi, planlanan tutar, plan durumu), kırılımlı toplamlar |
| İstatistik kartları (filterByPlan sayıları) | `GET /dashboard` FC:429 (overdue/dueToday/dueThisWeek/pendingApproval) | GENİŞLET: cari sayısı bazında (noplan, future, approved) |
| `accountGroupFilter` (12 grup) | AccountType + sub_group | YENİ-TABLO (V22 `account_group`) |
| İş yeri çoklu seçimi | `GET /organization/branches` (BranchController.java:29) | MEVCUT |
| Satır: BankAccounts linki (cari IBAN'ları) | fund_account yalnız firmanın kendi banka/kasası (V3:39) | YENİ-TABLO `account_bank_account` (V22) + YENİ-API |
| Satır: gruba özel sayfa (`accountActionUrl`: ProductionSergeantsExpenses, HarvestManagerExpenses, SalesTruckExpenses, Personnel) | Lojistik: CARRIER → sefer maliyetleri, EMPLOYEE → sürücü kartı (fleet `driver` V6:24) | GENİŞLET (UI linki; uç gerekmez), tarım hedefleri ÇIKAR |
| Satır: Delete (GET) | `DELETE /accounts/{id}` FC:162 — hareketi varsa 409 (AS:96-103) | GENİŞLET: hareketli cari için `PATCH /accounts/{id}/active=false` (V22 `active`); GET ile silme ÇIKAR |
| #1 `currencyDetailModal` | balances[] | GENİŞLET (`groupBy=branch`) |
| #2 `planDetailModal` | `GET /payment-plans?status` FC:363 (cari filtresi yok) | GENİŞLET: `accountId`, `statuses[]`, `from/to` |
| #3 `planActionConfirmModal`: Ertele | `POST /payment-plans/{id}/postpone` FC:407 (yeni tarih > eski tarih, PPS:180-185) | MEVCUT |
| #3: Sil (DeleteDashboardPlan, hard) | `POST /payment-plans/{id}/cancel` FC:401 | MEVCUT (davranış farkı §3) |
| #3: Ödendi işaretle | `POST /payment-plans/{id}/pay` FC:414 (APPROVED şart, fon zorunlu, settlement yaratır PPS:192-224) | GENİŞLET (UI): onay modalı fon (banka/kasa) seçimi ister — alan eklemesi kaçınılmaz, §3 |
| #4 `financeDashboardModal` | `GET /dashboard?today` FC:429 (upcoming yalnız 7 gün, sınırlı adet PPS:259-275) | GENİŞLET: `days`/`limit` parametresi; "Bir daha gösterme" localStorage (UI) |
| #5 `paymentPlanningModal` satırları | `POST /payment-plans` FC:370 (accountId, branchId, money, dueDate, description; DTO:262-267) | YENİ-TABLO: `payment_plan.fund_account_id` (Banka sütunu), `source_kind` (V26); YENİ-API `PUT /accounts/{id}/payment-plans` (toplu kaydet: yeni/güncel satırlar + `cancelledPlanIds` → cancel). Şube→İş yeri→Banka zinciri: Blackrose'da il/şube katmanı yok → "Şube" select = `branch`, "İş Yeri" select ÇIKAR yerine aynı branch'ı gösteren salt-okunur hücre (⚠ birebir alan kuralıyla çelişki, §3), "Banka" = `GET /funds?branchId&currency&kind=BANK` (GENİŞLET FC:205 filtresiz) |
| #5 Çek/Kredi/Maaş salt-okunur satırlar | Çek: verilen çekler `GET /instruments?status=ISSUED` FC:267; Kredi, Maaş: modül yok | GENİŞLET (instruments `direction`, `accountId`, `dueFrom/dueTo`); Kredi/Maaş ÇIKAR |
| #5 düzenle (`editPaymentPlanning`) | plan güncelleme ucu yok | YENİ-API `PUT /payment-plans/{id}` (yalnız DRAFT/REJECTED; değişince olay kaydı) |
| #6 `densitySettingsModal` | `GET/PUT /density-thresholds` FC:436/442 (low, medium, high — 3 eşik) | YENİ-TABLO: `density_threshold.very_high` + `DensityLevel.EXTREME` (V26); ZTO 4 eşik/5 kademe |
| #7 `approvalSelectionModal` | `POST /payment-plans/{id}/submit` FC:383 | MEVCUT (istemci döngüsü) — tercihen YENİ-API `POST /payment-plans/bulk-submit` (tek işlem, kısmi hata listesi) |
| #8 `deletionSelectionModal` | `POST /payment-plans/{id}/cancel` FC:401 | MEVCUT (döngü) / YENİ-API `bulk-cancel` |
| #9 `treasuryModal` | `GET /funds` FC:205 (bakiye dahil), `GET /instruments` FC:267, `GET /reports/position` RC:129 | YENİ-API `GET /finance/treasury?branchIds` (banka/kasa/çek/senet özet + 4 grafik serisi); Excel düğmesi ZTO'da işlevsiz (alert) → SheetJS ile gerçek dışa aktarım (ZTO davranışını düzeltir) |
| #10 `paymentHeatmapModal` | `GET /payment-plans/heatmap?from&to&period=DAY|MONTH` FC:420 (yalnız plan, PPS:227-256) | GENİŞLET: `period=WEEK`, `accountId`, `currency`, `sources[]` (MANUAL, INSTRUMENT); kur için `GET /exchange-rates?date` FC:508 MEVCUT |

### 2.5 CustomerAccounts Add/Edit

| ZTO alan | Blackrose | Karar |
|---|---|---|
| AccountName, TaxNumber, WorkPlaceID→branchId, AccountGroup→type | `SaveAccountRequest` DTO:33-38, `account` V3:1-13 | MEVCUT |
| AccountCode (Edit) / otomatik önek (Add) | `code` zorunlu, benzersiz (AS:73-76) | GENİŞLET: create'te `code` opsiyonel → tip/sub_group önekiyle sunucu üretir |
| AccountGroup alt türü | — | YENİ-TABLO `sub_group` |
| ExpenseTypeID | expense_type (V3:79) | ÇIKAR (Masraf Hesabı cari değil) |
| BranchProvinceID (Şube/il) | — | ÇIKAR (branch tek seviye) |
| ReferenceID (+ `GetReferencesByAccountGroup`) | — | ÇIKAR (üretim/satış ana verileri). CARRIER için ileride fleet taşeron kartı bağlanabilir ⚠ |
| CurrencyID, CreditLimit, RiskLimit, TaxOffice, CompanyType, Phone, Email, Website, Address, City, District, Country, PostalCode, PaymentTerms, Notes | — | YENİ-TABLO (V22 kolonları) |
| IsCreditBankAccount | type=BANK | MEVCUT (dönüşüm) |
| ContactPerson / ContactTitle / ContactMobile | CRM `contact` (V5:33; `GET/POST /crm/customers/{id}/contacts` CrmController.java:133/139, `PUT /crm/contacts/{id}` :158) | MEVCUT (birincil kişi = ilk contact; yalnız CUSTOMER için CRM uçları — diğer tipler için ⚠ yetki `CRM_*` gerekebilir) |
| Banka hesapları alt formu | — | YENİ-TABLO `account_bank_account` + YENİ-API |
| Denetim alanları (Oluşturma/Güncelleme kim-ne zaman) | AuditableEntity kolonları (V3) | GENİŞLET: AccountResponse'a created/updated alanları |
| Değişiklik Geçmişi | `GET /identity/audit-logs` (IdentityAdminController.java:162) | GENİŞLET ⚠ (varlık bazlı filtre olup olmadığı doğrulanmadı) |

### 2.6 CustomerAccountReport

| ZTO sekme | Blackrose | Karar |
|---|---|---|
| Yaşlandırma (DueDate kovaları, cari/grup/tarih filtresi) | `GET /reports/aging?type&asOf` FC:195 (FIFO mahsup, işlem tarihi, 0-30/31-60/61-90/90+; FR:209-242) | GENİŞLET: `basis=DUE|TRANSACTION`, `accountId`, `types[]/subGroups[]`; "Current" (vadesi gelmemiş) kovası DUE tabanında eklenir |
| Çek Vade | `GET /instruments?status` FC:267 | GENİŞLET: `kind=CHECK`, `dueFrom/dueTo`, `direction` |
| Senet Vade | aynı | GENİŞLET: `kind=NOTE` |
| EditCheck/EditBill linkleri (kırık) | Instruments sayfası | ÇIKAR (kırık); yerine Çek/Senet ekranına link |
| Ödeme Performansı | `GET /reports/settlement-performance?from&to` RC:141 | GENİŞLET: `accountId` (ZTO `perfCustomerId`) ⚠ kolon eşdeğerliği doğrulanmadı |
| Döviz Pozisyonu | `GET /reports/position` RC:129 | MEVCUT ⚠ (kolonlar karşılaştırılmadı) |

### 2.7 FinanceReport

| ZTO öğe | Blackrose | Karar |
|---|---|---|
| Genel Bakış (tür × para birimi: borcumuz/alacağımız/net/açık cari) | — (AS balances cari bazlı) | YENİ-API `GET /finance/reports/ledger-summary?from&to&currency&branchId` (tür = `account_group.report_type`) |
| Liste (türün carileri, açılış/hareket/kapanış, son tahsilat/ödeme `LastSettlements`) | FC:135 kısmen | YENİ-API `GET /finance/reports/ledger-accounts?reportType&…` |
| Ekstre kipi + yöntem kırılımı | FC:184 | GENİŞLET (§2.3) |
| "Bekleyen (tahmini)" sütunu (`Unbooked`, tartılmış araç) | — | ÇIKAR (bahçe) |
| "Ceza" sütunu (`DocumentType='Order Claim'`) | account_document.document_type ∈ ceza türleri | GENİŞLET (lojistik: Hasar Bedeli / Geç Teslimat Cezası) |
| "Rapor dışı" satırı (`Orphans`) | tipi raporlanmayan cariler | YENİ-API (ledger-summary içinde) |
| Kaynak belge tarihine göre tarihleme (LATERAL, FrSql.cs:43-61) | `transaction_date` zaten belge tarihi (LS:73) | ÇIKAR (gerek yok) |
| Logo `Report/GetNetworkImage` | tenant logosu ⚠ BULUNAMADI (Blackrose'da karşılığı aranmadı) | ⚠ |
| Excel (SheetJS) | `GET /reports/export` RC:200 (rapor adı bazlı) | GENİŞLET (yeni rapor adları) ya da istemci SheetJS |

### 2.8 FinancialBalanceSheet

| ZTO öğe | Blackrose | Karar |
|---|---|---|
| İş yeri kartları: banka/kasa bakiyesi | `GET /funds` FC:205 (`balance`) | GENİŞLET (branch gruplaması) |
| Çekler | `GET /instruments` FC:267 | GENİŞLET |
| Cari alacak/borç (işaret ters: (Borç−Ödeme)−(Alacak−Tahsilat)) | AS balances (DEBIT−CREDIT) | YENİ-API `GET /finance/reports/balance-sheet?branchIds&asOf` (tek uçta banka+kasa+çek+cari) |
| TCMB kurla TL toplam | `tl_amount` (V3:25) + `GET /exchange-rates` FC:508 | MEVCUT |
| `fbsStockModal` (stok değeri) | — | ÇIKAR (lojistik depoda stok müşteriye ait; firma stoku değerlenmez) |
| `fbsTradeDebtModal` (iş yerleri arası parti/palet ticareti) | — | ÇIKAR |

---

## 3. Davranış çatışmaları ve çözüm (varsayılan: Blackrose kuralı kazanır)

| # | Konu | ZTO | Blackrose | Çözüm |
|---|---|---|---|---|
| 1 | Silme | Borç/Alacak/Ödeme/Tahsilat ve plan (`DeleteDashboardPlan`) **fiziksel DELETE** (AT:6855,7515,7646,7385; CA:2947); banka/kasa hareketi `Status=false` | Ters kayıt (LS:88-111, SS:165), soft delete, belgeli hareket yalnız belgesinden iptal (AS:136-142) | Blackrose. "Evet, Sil" düğmesi aynı kalır; arka planda void/cancel/reverse. ReverseRequest `date` zorunlu → bugünün tarihi + açıklama "ZTO ekranından silindi: {tür}" otomatik. Ters kayıtlar listede "İptal" rozetiyle görünür (yeni kolon değil, satır stili) |
| 2 | Düzenleme | `UpdateDebt` (AT:7884), `UpdateCredit` (AT:3065) satırı yerinde günceller | Hareket değişmez | `revise` = eski belgeyi iptal (ters kayıt) + yeni belge; UI aynı modal, aynı "Güncelle" düğmesi |
| 3 | Sıfır tutarlı satır | Fatura "borca/alacağa yansıt" kapalıysa Amount=0 satır yazılır (AT:2336-2345, 2578-2597) | `amount > 0` CHECK (V3:21), LS:59-62 | Belge `account_document.reflect_to_ledger=false` olarak saklanır, ledger'a **yazılmaz**; fatura listelerinde görünür, bakiyeye girmez (ZTO'nun görünür sonucu korunur) |
| 4 | Bakiye işareti | AT ve FR: N=(Alacak−Tahsilat)−(Borç−Ödeme), N>0 cari borçlu (AT:794, FrLedger.cs:11). FBS ters işaret (01_FINANS_ENVANTER.md:891) | Pozitif = cari bize borçlu (FT:17; AS:222 debit−credit) | AT/FR ile birebir uyumlu (ZTO Alacak→DEBIT, Borç→CREDIT, Ödeme→DEBIT SS:117, Tahsilat→CREDIT). FBS ekranı Blackrose işaretini kullanır; borç tarafı gösterimde FrLedger.Display gibi işaret çevrilir (yalnız görünüm) |
| 5 | İptal ödemeler | Liste sorguları `PaymentStatus<>'İptal'` süzer (AT:5064…), kart toplamı ve FBS süzmez | İptal = REVERSED settlement + ters ledger kaydı; toplamlar kendiliğinden net | Blackrose. Tüm toplamlar ledger'dan; "iptal hariç" filtresine gerek yok, ZTO'daki tutarsızlık ortadan kalkar |
| 6 | Kur / TL | Satırda `CurrencyID` (int) + `ExchangeRate`; TL'ye çevrim yok | ISO para kodu, `tl_amount` kur tarihinde sabit (V3:22-25), manuel kur opsiyonel (DTO:62) | Blackrose. Modal "Para Birimi" select'i `GET /currencies` kodlarını gösterir; kur alanı ZTO modalında yok → otomatik TCMB; veri taşımada CurrencyID→kod eşleme tablosu gerekir |
| 7 | Personel carileri | Süper değilse yalnız listede gizlenir; `Transactions(id)` doğrudan erişimi engellemiyor (A_cari:206) | Yetki tabanlı (`FINANCE_*`) | Yeni yetki `FINANCE_EMPLOYEE_VIEW` — EMPLOYEE cariler tüm uçlarda **sunucuda** süzülür (ZTO açığı kapanır) |
| 8 | İş yeri kapsamı | İstemci parametresi, zorunlu kısıt yok (A_cari:208,370) | `branch_id` her harekette zorunlu (V3:19); kullanıcı-şube kapsamı ⚠ doğrulanmadı | Blackrose'da şube kapsamı varsa uygulanır; yoksa ZTO gibi filtre. ⚠ |
| 9 | Plan durumları | ApprovalStatus Beklemede/Onay Bekliyor/Onaylandı/Reddedildi/Talimat Verildi; PaymentStatus Beklemede/Gecikmiş/İşlemde/Tamamlandı/İptal/Ödendi; "Gecikmiş" arka planda toplu UPDATE (CA:1352-1400) | DRAFT→PENDING→APPROVED/REJECTED→PAID, CANCELLED (FT:83-90); gecikme türetilir | Eşleme: Beklemede=DRAFT, Onay Bekliyor=PENDING, Onaylandı=APPROVED, Reddedildi=REJECTED, Tamamlandı/Ödendi=PAID, İptal=CANCELLED, Gecikmiş=APPROVED/PENDING/DRAFT ∧ dueDate<bugün (UI rozeti), Talimat Verildi → ⚠ banka talimatı (PaymentApproval, başka grup). Reddedilen plan ZTO'da doğrudan onaylanabiliyor (PA BulkApprove) → Blackrose'da önce submit |
| 10 | "Ödendi" işaretleme | `MarkDashboardPlanPaid` yalnız durum yazar, ödeme kaydı yok (CA:2996-2997) | `pay` APPROVED şartı + fon + settlement (PPS:192-224) | Blackrose. Onay modalına fon seçimi eklenir (birebir alan kuralına zorunlu istisna: para çıkışı fonsuz kaydedilemez) |
| 11 | Öz-onay | Yok | `PLAN_SELF_APPROVAL` (PPS:315-319), ayar `allowSelfApproval` | Blackrose |
| 12 | Plan bankası | Her plan satırında şube/iş yeri/banka zorunlu (CAI:7008) | `payment_plan`'da fon yok; fon ödeme anında seçilir | V26 `fund_account_id` (opsiyonel kolon, ZTO doğrulaması UI'da zorunlu); `pay` çağrısında varsayılan fon olarak kullanılır |
| 13 | Yoğunluk eşikleri | 4 eşik, 5 kademe, `<` (CAI:10200-10212), tamsayı min 1 | 3 eşik, 4 kademe, `<=` (DensityThreshold.java:33-41), NUMERIC | V26 `very_high` + EXTREME; sınır karşılaştırması Blackrose (`<=`) kazanır — eşik değerinde kademe ZTO'dan 1 farklı olabilir (kabul) |
| 14 | Cari taşıma | Satırların `CustomerAccountID`'si ve çek/senet keşidecisi güncellenir (AT:5998-6054) | ledger değişmez; `instrument.account_id` | Virman kayıt çifti (`ACCOUNT_TRANSFER_OUT/IN`; `UNIQUE(source_type, source_id)` V3:35 nedeniyle iki farklı source_type). Çek/senet kaydı **taşınmaz**, yalnız transfer geçmişinde not edilir ⚠ iş kararı gerekir. "Aynı hesap grubu" kuralı → aynı `type` (+sub_group) |
| 15 | Devir/sezon | Yalnız tarih sınırı, bakiye kaydı yok (AT:530-580) | Açılış bakiyesi = `OPENING` hareketi (FR:139-145) | Uyumlu: `account_rollover` hiçbir ledger kaydı üretmez; açılış içe aktarma ile karıştırılmaz |
| 16 | Cari silme | Soft + GET + hareketli cari silinebilir (CA:4579-4700) | Hareketi olan cari silinemez (AS:96-103) | Blackrose. Hareketli cari için "Pasif" (V22 `active`); Sil düğmesi hareketliyse pasifleştirir, mesaj ZTO metniyle |
| 17 | Cari kodu | Gruba göre önek + otomatik | `code` zorunlu, benzersiz | Sunucu kod üretimi (GENİŞLET) |
| 18 | Belge türü anlamı | "Borç Ekle" listesinde kesinti/ceza türleri (Kalite Kesintisi, Fire, Geç Teslimat Cezası…) firmanın borcunu **artırır** (N azalır) | — | ⚠ İş teyidi gerekli: lojistikte "Hasar Bedeli/Geç Teslimat Cezası" genellikle carinin borcudur → Alacak tarafına taşınması önerilir; teyide kadar ZTO yönü korunur |
| 19 | Yaşlandırma | CAR: DueDate kovası, yalnız brüt borç, mahsupsuz (A_cari:565) | FIFO mahsuplu, işlem tarihi (FR:205-242) | Blackrose; `basis=DUE` seçeneği eklenir (vade = account_document.due_date ya da fatura due_date) |
| 20 | Limit alan adları | `editCreditLimitInput` "Risk Limiti", `editRiskLimitInput` "Borç Limiti" etiketli (TR:3471-3477); Add/Edit'te "Kredi Limiti"/"Risk Limiti" | — | Etiketler birebir kopyalanır; kolon eşlemesi açıkça belgelenir: ZTO CreditLimit→`credit_limit`, RiskLimit→`risk_limit` (ekran etiketi değil kolon adı esas) |
| 21 | Ödeme yöntemi + kasa/banka | Borç/Alacak modalında yöntem seçilir; CashID/BankID UI'da yok (ölü kod) | Belge fon hareketi yaratmaz; fon yalnız settlement'ta | Yöntem `account_document.payment_method` bilgi alanı; fon hareketi yok (ZTO fiili davranışıyla aynı) |
| 22 | Native sorgularda silinmiş kayıt | — | `balances`/`statement`/`balanceBefore` native sorguları `deleted=false` süzmüyor (FR:149-203; aging süzüyor FR:221) | Blackrose iç tutarsızlığı — yeni uçlarda `deleted=false` eklenmeli; mevcut uçlar için ayrı düzeltme önerisi |
| 23 | Antiforgery / GET ile durum değiştirme | Delete GET, AT/CA POST'larında antiforgery yok | JWT + `@PreAuthorize` | Blackrose (ÇIKAR) |
| 24 | Statik önbellek | `_accountsQuickCache` çok kiracılı statik sözlük (CA:39) | tenant bağlamı | ÇIKAR |

---

## 4. Gerekli backend eklemeleri

### 4.1 Migration'lar (tenant, V22+)

| Migration | İçerik |
|---|---|
| `V22__account_profile.sql` | `ALTER TABLE account ADD`: `sub_group VARCHAR(50)`, `default_currency CHAR(3)`, `credit_limit NUMERIC(19,4)`, `risk_limit NUMERIC(19,4)`, `tax_office VARCHAR(100)`, `company_type VARCHAR(20)`, `phone VARCHAR(30)`, `email VARCHAR(254)`, `website VARCHAR(200)`, `address VARCHAR(500)`, `city VARCHAR(100)`, `district VARCHAR(100)`, `country VARCHAR(100)`, `postal_code VARCHAR(20)`, `payment_terms VARCHAR(1000)`, `notes VARCHAR(2000)`, `active BOOLEAN NOT NULL DEFAULT TRUE`. Yeni `account_group (code VARCHAR(50) PK, name VARCHAR(100), account_type VARCHAR(20), report_type VARCHAR(30), code_prefix VARCHAR(5), sort_order INT, audit kolonları, deleted)` + §2.0 tohum satırları. Yeni `account_bank_account (id UUID PK, account_id FK account, bank_name VARCHAR(100), branch_name VARCHAR(100), account_number VARCHAR(50), iban VARCHAR(34), holder_name VARCHAR(200), currency CHAR(3), account_kind VARCHAR(20) /*TIME,DEMAND,SAVINGS,CORPORATE*/, category VARCHAR(10) /*MAIN,SUB*/, opened_on DATE, last_transaction_on DATE, description VARCHAR(500), audit, deleted)` + `(account_id)` indeksi. Yetki: `INSERT role_permission … 'FINANCE_EMPLOYEE_VIEW'` → FINANCE_SUPER |
| `V23__account_document.sql` | `account_document (id UUID PK, account_id FK, branch_id FK, side VARCHAR(10) /*RECEIVABLE,PAYABLE*/, document_no VARCHAR(50) NOT NULL, document_type VARCHAR(40) NOT NULL, document_date DATE NOT NULL, due_date DATE, amount NUMERIC(19,4) NOT NULL CHECK (amount>0), currency CHAR(3), payment_method VARCHAR(20), description VARCHAR(500), reflect_to_ledger BOOLEAN NOT NULL, status VARCHAR(20) /*OPEN,CANCELLED*/, revised_from_id UUID NULL REFERENCES account_document, audit, deleted)`; `account_document_tax (document_id UUID PK FK, gross_amount, discount_rate NUMERIC(7,4), discount_amount, net_excl_vat, vat_rate NUMERIC(7,4), vat_amount, total_incl_vat, withholding_amount, other_taxes_amount, net_payable — tutarlar NUMERIC(19,4))`. İndeks `(account_id, side, document_date)`. Ledger: `source_type='ACCOUNT_DOCUMENT'`, `source_id=document.id` (yalnız reflect_to_ledger) |
| `V24__account_rollover.sql` | `account_rollover (id UUID PK, account_id FK, rollover_date DATE NOT NULL, season_name VARCHAR(100) NOT NULL, active BOOLEAN NOT NULL, deleted_by VARCHAR(254), deleted_at TIMESTAMPTZ, audit, deleted)`; `UNIQUE (account_id, rollover_date) WHERE deleted=false`; `UNIQUE (account_id) WHERE active AND deleted=false` (ZTO AT:6172-6178, 6374-6385 kuralları) |
| `V25__account_transfer.sql` | `account_transfer (id UUID PK, from_account_id FK, to_account_id FK, account_transaction_id FK account_transaction, currency CHAR(3), amount NUMERIC(19,4), instrument_id UUID NULL, transfer_date DATE, description VARCHAR(500), audit, deleted)` + `(from_account_id)`, `(to_account_id)`, `(transfer_date)` indeksleri |
| `V26__payment_plan_extend.sql` | `ALTER TABLE payment_plan ADD fund_account_id UUID REFERENCES fund_account(id)`, `ADD source_kind VARCHAR(20) NOT NULL DEFAULT 'MANUAL'`, `ADD instrument_id UUID REFERENCES instrument(id)`; `ALTER TABLE density_threshold ADD very_high NUMERIC(19,4)`; Java: `DensityLevel.EXTREME` |

### 4.2 Uçlar (tümü `/api/v1/finance` altında, aksi belirtilmedikçe)

| Uç | Tür | Kullanan ZTO öğesi |
|---|---|---|
| `GET /accounts` + `types, subGroups, branchIds, hideZero, planFilter, includePlanSummary, active` | GENİŞLET FC:135 | CAI liste, filtreler, AllTransactions arama |
| `POST/PUT /accounts` profil alanları, `code` opsiyonel | GENİŞLET FC:148/155 | Add/Edit |
| `PATCH /accounts/{id}/active` | YENİ | Delete (hareketli) |
| `PUT /accounts/{id}/limits` | YENİ | editLimitsModal |
| `GET /accounts/{id}/balances?groupBy=branch|currency&asOf&rolloverId` (kırılımlı: invoiceDebit, invoiceCredit, payments, collections) | YENİ | TR kartları, currencyDetailModal, GetWorkPlaceBalances, GetDevirBalances |
| `GET /account-transactions?accountId&from&to&currency&branchIds&accountTypes&subGroups&kinds&facets&page` | YENİ | AllTransactions, TR sekmeleri |
| `GET /accounts/transactions/{id}` ve `/{id}/source` | YENİ | normal/credit/transport/expense detay, GetDebtRedirectInfo |
| `POST /accounts/transactions/{id}/void` | YENİ (yönlendirici) | deleteTransactionConfirmModal |
| `POST /accounts/{id}/documents`, `GET /accounts/{id}/documents?side&docType&reflected&from&to`, `GET /account-documents/{id}`, `POST /account-documents/{id}/cancel`, `POST /account-documents/{id}/revise` | YENİ | addDebt/addCredit, invoices/salesInvoices, detay ve silme modalları |
| `GET /accounts/{id}/sales-invoices` (freight ∪ warehouse ∪ document) | YENİ | salesInvoicesModal |
| `GET /purchase-invoices?accountId&from&to` | GENİŞLET FC:341 | invoicesModal |
| `GET /settlements/{id}`; `GET /payments|collections?accountId` | YENİ / GENİŞLET FC:289,306 | D1/D2 detay modalları, TR Ödemeler/Tahsilatlar |
| Rollover: `GET/POST /accounts/{id}/rollovers`, `PUT /rollovers/{id}`, `POST /rollovers/{id}/activate`, `DELETE /rollovers/{id}?newActiveId`, `GET /accounts/{id}/rollovers?deleted=true`, `POST /rollovers/{id}/restore` | YENİ | #27-#31 |
| `GET /accounts/{id}/transferable-transactions`, `POST /account-transfers`, `GET /account-transfers?accountId&from&to` | YENİ | #24-#26 |
| `GET/POST/PUT/DELETE /accounts/{id}/bank-accounts` | YENİ | Add/Edit banka alt formu, BankAccounts linki |
| `GET /payment-plans?accountId&statuses&from&to`, `PUT /payment-plans/{id}`, `PUT /accounts/{id}/payment-plans` (toplu), `POST /payment-plans/bulk-submit`, `POST /payment-plans/bulk-cancel` | GENİŞLET FC:363 / YENİ | paymentPlanningModal, planDetail, approval/deletion selection |
| `GET /payment-plans/heatmap` + `period=WEEK, accountId, currency, sources` | GENİŞLET FC:420 | paymentHeatmapModal |
| `GET /dashboard?today&days&limit` | GENİŞLET FC:429 | financeDashboardModal, istatistik kartları |
| `PUT /density-thresholds/{currency}` + `veryHigh` | GENİŞLET FC:442 | densitySettingsModal |
| `GET /funds?branchId&currency&kind` | GENİŞLET FC:205 | plan satırı banka select'i |
| `GET /instruments?kind&direction&accountId&dueFrom&dueTo` | GENİŞLET FC:267 | Çek/Senet vade, plan Çek satırları |
| `GET /treasury?branchIds` | YENİ | treasuryModal |
| `GET /accounts/{id}/statement` + `currency` opsiyonel, `branchId`, `dateBasis`, `withMethods` | GENİŞLET FC:184 | Statement, FinanceReport ekstre |
| `GET /reports/aging` + `basis, accountId, types, subGroups` | GENİŞLET FC:195 | CAR yaşlandırma |
| `GET /reports/ledger-summary`, `GET /reports/ledger-accounts` | YENİ | FinanceReport genel bakış/liste |
| `GET /reports/balance-sheet?branchIds&asOf` | YENİ | FinancialBalanceSheet |
| `GET /api/v1/reports/settlement-performance?accountId` | GENİŞLET RC:141 | CAR performans |
| `GET /account-groups` | YENİ (V22 tablosu) | Hesap Grubu select/filtreleri |

---

## 5. ZTO JS kütüphaneleri → React karşılığı

Blackrose frontend bağımlılıkları: React 18, MUI 6, react-hook-form + zod, @tanstack/react-query, i18next (`frontend/package.json`). Grafik/tablo/dışa aktarım kütüphanesi **yok**.

| ZTO kütüphane (kaynak) | Bu gruptaki kullanım | React önerisi |
|---|---|---|
| jQuery 3.6.4 / 3.4.1 (`_ProductionLayout.cshtml:2194`, `_Layout.cshtml:1622`, `_DataTablesScriptsPartial.cshtml:8`) | Tüm AJAX/DOM | react-query + fetch istemcisi (mevcut) |
| Bootstrap 4.3.1 / 4.6.2 JS (layout:2195, DataTablesPartial:11) — modal, tab, dropdown, collapse, popover (TR 3, TP 2 `.popover(`) | 46 modal, sekmeler, akordeon | Bootstrap 4.6 **CSS** kapsamlı sarmalayıcıda (`.zto-scope` önekli derleme); davranışlar React bileşenleri (Modal/Tabs/Dropdown/Collapse); popover → MUI Popper |
| DataTables 1.10.20 (layout) + 1.13.7, Responsive 2.5.0, Buttons 2.2.2/2.4.2 (copy/excel/pdf/print, tjs:975,994), jszip, pdfmake (DataTablesPartial:14-24) | `.DataTable(` tjs 26, TR 2, CAI 4, ajs 3 | Headless `@tanstack/react-table` (ZTO tablo markup/sınıfları korunur) + SheetJS `xlsx` (Excel) + `pdfmake` ya da yazdırma CSS'i (PDF); DataTables TR dil dosyası (`cdn.datatables.net/plug-ins/2.1.8/i18n/`, tjs:907) → i18next anahtarları |
| select2 4.1.0-rc.0 (+bootstrap tema, layout:2229-2235) | `.select2(` TR 2, tjs 3; çoğu select `no-select2` | MUI Autocomplete (ZTO görünümü için sade stil) ya da `react-select` |
| Chart.js 2.8.0 (layout), 4.4.1 (TR:3453), sürümsüz (CAI:5533), 3.9.1 (Reports:557) | limit grafiği (tjs 2), hazine 4 grafik (CAI:8116-8276), CAR 1 | `chart.js` 4 + `react-chartjs-2` (tek sürüm) |
| OpenLayers 7.3.0 (TR:2274) | tedarikçi konum haritası (tjs:6380-6410) | ÇIKAR (modal ÇIKAR) |
| SheetJS xlsx (`_ReportLayout.cshtml:26`, finance-report.js) | FR Excel | `xlsx` paketi |
| Font Awesome 5.11.2 (layout:51) / 6.4.0 (ReportLayout:20), Material Icons/Symbols | ikonlar | `@fortawesome/fontawesome-free` CSS kapsam içinde (ikon sınıfları birebir) |
| SignalR (layout:2239), canlı ekran paylaşımı | layout sohbeti | ÇIKAR |
| Özel `showSnackbar` (tjs 57, TR 4) | bildirim | MUI Snackbar (ZTO sınıflarıyla) |
| `localStorage` hatırlatıcı erteleme (CAI:8423) | financeDashboardModal | try/catch'li localStorage |
| `window.print` (Statement, CAI treasury) | yazdırma | aynı + print CSS |
| `confirm()/alert()` (CAI:7023,7059,7068) | onay/uyarı | ZTO modal görünümlü onay bileşeni (davranış aynı) |
| SweetAlert, toastr, daterangepicker, moment, flatpickr, jsPDF, html2canvas | **Kullanılmıyor** (grep 0) | — |

---

## 6. Bilinmeyenler (⚠ BULUNAMADI / doğrulanmadı)

- `exportToExcel()` / `exportToPDF()` (TR:313,319 düğmeleri gizli) tanımı ⚠ BULUNAMADI.
- `debtCashID` / `debtBankID` elemanları view'da ⚠ BULUNAMADI (payload'da okunuyor, tjs:1498-1499).
- Blackrose kullanıcı-şube kapsam kuralı ⚠ doğrulanmadı.
- `identity/audit-logs` varlık bazlı filtre ⚠ doğrulanmadı.
- `reports/position` ve `settlement-performance` kolonlarının ZTO Döviz Pozisyonu / Ödeme Performansı ile eşdeğerliği ⚠ karşılaştırılmadı.
- Tenant logosu (FR başlığı) Blackrose karşılığı ⚠ aranmadı.
- Borç Ekle'deki ceza/kesinti türlerinin yönü ⚠ iş teyidi gerekir (§3 #18).
- Cari taşımada çek/senet carisinin taşınıp taşınmayacağı ⚠ iş kararı (§3 #14).
- Kredi sözleşmesi detayı (`creditDebtDetailModal`) ⚠ C grubunun kredi kararına bağlı.

---

## 7. Özet (10 satır)

1. Kapsamda 12 view, 46 benzersiz modal davranışı (TR 32 + JS dinamik 2 + CAI 10 + FBS 2; TP 19 ve PT 4 kopya) envanterlendi.
2. Blackrose cari motoru (account/account_transaction, LedgerService) bakiye işaretinde ZTO AccountTransaction/FinanceReport ile birebir uyumlu; FBS'nin ters işareti görünüm katmanında çevrilecek.
3. En büyük boşluk "Borç/Alacak Ekle" belgesi: Blackrose'da belge no/tür/vade/KDV/stopaj taşıyan genel cari belgesi yok → `account_document(+_tax)` (V23).
4. Cari kartı yalnız 5 alan taşıyor; ZTO'nun 20+ alanı, limitler, alt grup ve cari IBAN'ları için V22 gerekli.
5. Hesap grupları 6'lı AccountType'a + yeni `sub_group`/`account_group` tablosuna eşlendi; Kesim Çavuşu ve İş Yeri Firması ÇIKAR, Masraf Hesabı gider kalemine, kredi carisi BANK'a gider.
6. Fiziksel silme/yerinde güncelleme, Blackrose ters kayıt ve "iptal + yeni belge" ile değişir; UI düğmeleri aynı kalır.
7. Devir/sezon (V24) ve cari taşıma (V25, virman kayıt çifti) yeni tablo ister; ödeme planına fon ve kaynak türü, yoğunluk eşiğine 4. değer (V26) eklenir.
8. Yaklaşık 30 uç gerekiyor: ~13 genişletme (liste filtreleri, ekstre, aging, heatmap, dashboard, funds, instruments), ~17 yeni (belge, hareket listesi/detay, devir, taşıma, hazine, bilanço, ledger-summary).
9. Tarıma/üretime özgü 11 detay modalı, satış düzenleme, araç seçimi, müstahsil kesintileri, stok ve iş yerleri arası ticaret modalları ÇIKAR.
10. JS tarafında DataTables/select2/Chart.js/SheetJS için React karşılıkları gerekiyor; Bootstrap 4.6 CSS kapsamlı sarmalayıcıda kalır, sweetalert/daterangepicker/moment kullanılmıyor.
