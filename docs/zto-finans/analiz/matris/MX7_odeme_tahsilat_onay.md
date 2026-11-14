# MX-7 — Ödemeler / Tahsilatlar / Günlük Raporlar / Ödeme Onay Yönetimi / Müşteri Cari Hesapları: ZTO → Blackrose eşleme matrisi

> **§1 `#remainingDebtInfo` kural tarafı 12.2'de uygulandı (2026-11-14); uygulama belgesi [`docs/zto-finans/uygulama/12.2_TASARIM.md`](../../uygulama/12.2_TASARIM.md) §3.6–§3.7, §5.13.** Şirket dağılımı uyarısı sunucuda (`SettlementWarningService`; `POST /settlements/check` önizleme, onaysız ödemede 409 `CONFIRMATION_REQUIRED`, `confirmWarnings=true` ile kayıt) ve eksik fatura (`InvoiceCoverageService`, `GET /accounts/invoice-gaps`). MUI ödeme/tahsilat penceresi uyarıyı gösterir; ZTO ödeme/tahsilat modalları 12.2a'da aynı kuralı ve saf mantığı (`settlementWarnings.ts`) kullanır.

Kökler: ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (salt okunur) · BR = `F:\visual studio zto\LogisticErp` (backend `backend/src/main/java/org/ece/blackrose/` → kısaltma `BRJ/`; frontend `frontend/src/` → `BRF/`; tenant migration `backend/src/main/resources/db/migration/tenant/` → `MIG/`).
Kısaltmalar: **CAPC** = `Controllers/CustomerAccountPaymentController.cs` (4913 satır) · **CACC** = `Controllers/CustomerAccountCollectionController.cs` (5046) · **PAC** = `Controllers/PaymentApprovalController.cs` (1653) · **CCAC** = `Controllers/CustomerCurrentAccountsController.cs` (490) · **PPH** = `Services/PaymentPlanHelper.cs` (295) · **PAY** = `Views/CustomerAccountPayment/Payments.cshtml` (2112) · **DPR** = `Views/CustomerAccountPayment/DailyPaymentReport.cshtml` (1714) · **COL** = `Views/CustomerAccountCollection/Collections.cshtml` (806) · **CMP** = `Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml` (1533) · **DCR** = `Views/CustomerAccountCollection/DailyCollectionReport.cshtml` (1608) · **APM** = `Views/Shared/_AddPaymentModal.cshtml` (1197) · **EPM** = `Views/Shared/_EditPaymentModal.cshtml` (1150) · **PPM** = `Views/Shared/_PostPaymentPlanningModal.cshtml` (177) · **PAV** = `Views/PaymentApproval/Index.cshtml` (4300) · **pjs** = `wwwroot/js/zt/payments/payments.js` (7645) · **cjs** = `wwwroot/js/zt/collections/collections.js`.
BR: **FC** = `BRJ/finance/web/FinanceController.java` · **FD** = `BRJ/finance/web/FinanceDtos.java` · **SS** = `BRJ/finance/service/SettlementService.java` · **PPS** = `BRJ/finance/service/PaymentPlanService.java` · **IS** = `BRJ/finance/service/InstrumentService.java`.

Karar kodları (04 §3): **UI-API** = ekran yazılır, BR ucu olduğu gibi yeterli · **UI+GEN** = BR servis/DTO/uç genişletilir · **UI+YENİ** = yeni uç (mevcut tablo) · **UI+TABLO** = yeni migration · **ÇIKAR(gerekçe)** = taşınmaz.
Bu belge MX1–MX6'da yapılmış eşlemeleri **tekrar etmez**; çek/senet/koçan/kredi/PaymentManagement (MX3), banka-kasa/transfer/döviz bozumu (MX2), iş yeri/şube seçicileri (MX5) ve cari kartı/ekstre (MX1) için yalnız referans verir. Envanter `envanter/C_odeme_cek_kredi.md` §Payments/§Collections ve `envanter/A_cari.md` §CustomerCurrentAccounts/§PaymentApproval ile çapraz kontrol edildi; farklar notlandı.

---

## 0. Kapsam ve özet bulgular

| ZTO dosyası / route | Amaç | Bu belgedeki karar |
|---|---|---|
| GET `/CustomerAccountPayment/Payments` (CAPC:26) + PAY | Ödeme listesi + ödeme ekle/düzenle/sil/detay | UI+GEN (+V2xQ1) |
| GET `/CustomerAccountPayment/DailyPaymentReport` (CAPC:3220) + DPR | Günlük ödeme raporu (ayrı sayfa, `_ExpertLayout`) | UI+GEN |
| GET `/CustomerAccountCollection/Collections` (CACC:29) + COL + CMP | Tahsilat listesi + tahsilat ekle/düzenle/sil/detay | UI+GEN (+V2xQ1, ops. V2xQ2) |
| GET `/CustomerAccountCollection/DailyCollectionReport` (CACC:4127) + DCR | Günlük tahsilat raporu | UI+GEN (DPR ile tek bileşen) |
| GET `/PaymentApproval/Index` (PAC:60) + PAV + PPH | Banka → tarih → cari hiyerarşili ödeme onay / talimat ekranı | UI+GEN + V33 (04 §4) |
| GET `/CustomerCurrentAccounts/Index` (CCAC:15) | Satış modülündeki "Müşteri Cari Hesapları" listesi | ÇIKAR (MX1 CustomerAccounts listesi `type=CUSTOMER` önayarı yeterli) |
| `SQL/KrediBankaCari_Migration.sql` (148 satır) | Kredi banka carisi kolonları + açılış borcu backfill | Tamamı MX3 V32 tasarımında karşılanıyor (§5) |
| MX2'den devredilen modallar `addPaymentModal`, `addCollectionModal`, `editCollectionModal`, `postPaymentPlanningModal` (+ `editPaymentModal`) | Ortak ödeme/tahsilat modalları | §1.3–1.6 tam döküm, §2 eşleme |

**Temel bulgular**
1. ZTO'da ödeme/tahsilat = `ZT_AccountPayments` / `ZT_AccountCollections` satırı + (Nakit/Banka/Kredi Kartı ise) statik `CreateBankTransaction` / `CreateCashTransaction` + (Çek/Senet ise) `ZT_Checks` / `ZT_Bills` + `ZT_CheckMovements` + `PaymentPlanHelper`. BR'de aynı iş **tek çağrı**: `POST /finance/payments|collections` → `SettlementService.create` (SS:86) cari (`LedgerService`) + fon (`FundLedgerService`) + çek (`InstrumentService.register/endorse`) aynı transaction'da.
2. ZTO yöntemleri 6: `Nakit`, `Banka` ("Banka Havalesi/Eft"), `Çek`, `Senet`, `Kredi Kartı`, `Diğer` (CAPC:336-341; APM:242-248; CMP:136-142). BR `SettlementMethod` 3: `CASH`, `BANK`, `CHECK` (senet = `CHECK` + `instrument.kind=NOTE`). Kredi Kartı → BANK + kanal; Diğer → ÇIKAR (fon hareketi olmayan cari ödemesi; MX1 cari belge/mahsup karşılar). Sunucudaki `Kredi` dalı (CAPC:1634, `PayWithCredit`) istemcisiz → ÇIKAR (MX3 ile aynı).
3. Çapraz kur (cari borcunu başka para birimiyle kapatma; `CrossExchangeRate`, `CrossRateOperator` `*`/`/`) BR'de yok; MX3 çatışma #8 ile ÇIKAR kararı korunur (§7-S2).
4. Tahsilatın siparişe tahsisi (`ZT_AccountCollectionOrders`, `ZT_Orders`) lojistikte "sipariş" yok → **navlun faturası / depo faturası / açılış faturası açık kalem eşleştirmesi** olarak bilgi amaçlı `settlement_allocation` (V2xQ2) **önerilir**, yaşlandırma FIFO kalır (§7-S1). Ödeme tarafındaki karşılığı ZTO'da bahçe (müstahsil) paylaştırmasıdır → ÇIKAR; BR'de aynı tablo alış faturasına eşleştirme için kullanılabilir.
5. PaymentApproval/Index **aktif** onay ekranıdır (PaymentManagement eski akış MX3'te ÇIKAR). Motoru BR `payment_plan` (DRAFT→PENDING→APPROVED/REJECTED→PAID/CANCELLED, dört göz). Ekrandaki "Talimat Verildi" = APPROVED + `ordered_at` (V33); "Tamamlandı" = PAID ve **yalnız banka/kasa seçilerek gerçek ödeme kaydıyla** (§6.1-K1).
6. Çalışma zamanı DDL: dört controller'da ve PPH'de `CREATE TABLE` / `ALTER TABLE` / `ADD COLUMN IF NOT EXISTS` / `information_schema` **yok** (grep ile doğrulandı). Tek şema betiği `SQL/KrediBankaCari_Migration.sql` (elle çalıştırılan, idempotent).
7. Belge/makbuz numarası üretimi **yok**: `PaymentDocumentNo` / `CollectionDocumentNo` kullanıcı girer; çekli kayıtta çek no atanır (CAPC:1707-1708). BR `settlement`'ta belge no kolonu yok → V2xQ1.
8. Sunucu tarafı Excel/PDF yok; DataTables Buttons + JSZip + pdfmake (CDN), PAV'de SheetJS `xlsx-0.20.1`, yazdırma `window.print()` (PAY:292, DPR:680, COL:223, DCR:637).

---

## 1. ZTO sayfa, route ve modal dökümü

### 1.1 `/CustomerAccountPayment/*` — route listesi (CAPC)

Sınıf (CAPC:15-16): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)","Satış Personeli")]`. Action bazında ek rol yok. POST'ların hepsi `[ValidateAntiForgeryToken]`.

| Action | Fiil | Satır | AF | Dönüş / not |
|---|---|---|---|---|
| `Payments(id, openModal, bankId, workPlaceId, currencyId, cashId, paymentMethod)` | GET | 26 | — | View; parametreler BankTransactions/CashTransactions'tan derin bağlantı (modalı ön dolu açma) |
| `GetSupplierGardens(customerAccountId)` | GET | 435 | — | **bahçe** (finans dışı) |
| `GetGardenPaymentHistory(expertReportId)` | GET | 631 | — | **bahçe** |
| `GetAvailableCheckBooks(bankId)` | GET | 741 | — | koçan yaprakları |
| `GetPaymentList(customerAccountId, workPlaceId, startDate, endDate, paymentMethod)` | GET | 827 | — | `LIMIT 2000`; filtre yoksa son 30 gün (:950-958) |
| `AddPayment(~40 parametre, imza :1045-1084)` | POST | 1043 | ✓ | tek transaction :1092→:1969 |
| `UpdatePayment(...)` | POST | 2120 | ✓ | **transaction yok** (§6) |
| `SaveQuickPaymentPlanning([FromBody] QuickPaymentPlanningDto)` | POST | 2620 | ✓ | `ZT_CustomerAccounts` plan alanları + `ZT_CustomerAccountPaymentPlans` INSERT |
| `GetAllBranchProvinces()` | GET | 2717 | — | PPM satır cascade'i |
| `GetWorkPlacesByBranch(branchProvinceId)` | GET | 2757 | — | 〃 |
| `GetBanksByWorkPlaceAndBranch(workPlaceId, branchProvinceId)` | GET | 2800 | — | 〃 |
| `DeletePayment(id)` | POST | 2861 | ✓ | yalnız silme öncesi bilgi |
| `ConfirmDeletePayment(id)` | POST | 2945 | ✓ | fiziksel DELETE (:3029) |
| `GetPayments(customerAccountId, startDate, endDate)` | GET | 3117 | — | eski liste ucu |
| `DailyPaymentReport(reportDate, workPlaceId, workPlaceIds, bankId, currencyId, paymentMethod, sortBy)` | GET | 3220 | — | View (DPR) |
| `GetCustomerBankAccounts(customerId, typeAccount)` | GET | 4198 | — | cari IBAN'ları (`ZT_BankAccounts`) |
| `GetPaymentDetail(id)` | GET | 4311 | — | `paymentDetailModal` |
| `GetEndorsableChecks(cashId)` | GET | 4461 | — | `Portföyde` veya (`Tahsil Edildi` + `CashID`) |
| `GetMatchingChecks(paymentId, documentNo)` | GET | 4596 | — | `checkMatchModal` |
| `MatchPaymentWithCheck(paymentId, checkId)` | POST | 4714 | ✓ | yalnız `ZT_AccountPayments.CheckID` UPDATE, transaction yok |

Private: `SaveSupplierPaymentShares` (2067, bahçe), `BuildCurrencyTotalText` (3965), `BuildPaymentReportBankBalanceSummaries` (3976), `BuildPaymentReportCashBalanceSummaries` (4046), `GetCurrencies` (4112). İç model sınıfları: `PaymentRequestModel` (1017), `QuickPaymentPlanningDto` (2848), `PaymentViewModel` (4155), `DailyPaymentReportViewModel` (4748) + alt sınıflar (4785-4904).

### 1.2 `/CustomerAccountCollection/*` — route listesi (CACC)

Sınıf (CACC:17-18): `[Authorize]` + aynı 6 rol. **Hiçbir POST'ta `[ValidateAntiForgeryToken]` yok** (grep: 0).

| Action | Fiil | Satır | Not |
|---|---|---|---|
| `Collections(...)` | GET | 29 | View |
| `GetCollectionList(customerAccountId, accountGroup, workPlaceId, startDate, endDate, collectionMethod)` | GET | 407 | + `ExchangeStatus`, `RemainingExchangeAmount` (:432-433) |
| `AddCollection(~38 parametre, imza :637-683)` | POST | 637 | tek transaction :687→:1468 |
| `GetCustomerCreditSummary(customerAccountId, currencyId)` | GET | 1563 | Payments/Checks/Bills de çağırır |
| `GetAvailableCurrenciesForCollection(customerAccountId)` | GET | 1865 | |
| `GetCustomerCurrency(customerAccountId)` | GET | 1950 | istemcide URL tanımsız (§6) |
| `GetCustomerOrders(customerAccountId)` | GET | 2024 | **sipariş** (finans dışı) |
| `GetBanksByWorkPlaceCustomer(workPlaceId, currencyId)` | (fiil yok) | 2180 | Payments/Checks/Bills de çağırır |
| `GetCashByWorkPlaceCustomer(workPlaceId, currencyId)` | (fiil yok) | 2239 | 〃 |
| `GetCustomerCreditDetails(customerAccountId)` | GET | 2316 | |
| `GetCustomerCreditSummarySimple(customerAccountId)` | GET | 2396 | |
| `UpdateCollection(...)` | POST | 2446 | transaction var (:2494) |
| `GetCollectionForUpdate(id)` | GET | 3227 | |
| `DeleteCollection(id)` | POST | 3574 | bilgi |
| `ConfirmDeleteCollection(id)` | POST | 3657 | fiziksel DELETE (:3736) |
| `GetCollections(customerAccountId, startDate, endDate)` | GET | 3827 | eski |
| `GetCustomerBankAccounts(customerId, typeAccount)` | GET | 4017 | |
| `DailyCollectionReport(...)` | GET | 4127 | View (DCR) |
| `GetCollectionDetail(id)` | GET | 4679 | `collectionDetailModal` |

İç modeller: `CollectionRequestModel` (609), `OrderAllocation` (1555), `CollectionViewModel` (3974), `DailyCollectionReportViewModel` (4874), `LegacyCheckSummary` (5028), `PaymentDateCheckRow` (5035).

### 1.3 Ödemeler sayfası (PAY) — yerleşim

- Başlık: ikon `fa-money-bill-wave`, "Ödeme Yönetimi", breadcrumb "Finans › Ödemeler" (PAY:225-237); çipler "Çoklu Yöntem", "Aktif Filtreleme".
- Üst düğmeler (PAY:256-296): **Yeni Ödeme** (`#addPaymentModal`), Çekler (`/Checks/Checks`), Senetler (`/Bills/Bills`), [Tahsilatlar — yorum satırı], **Günlük Ödeme Raporu** (`#dailyPaymentReportModal`), Excel (`exportToExcel()` — 04 §10: fonksiyon tanımı doğrulanamadı), Yazdır.
- Filtre şeridi (PAY:308-390): `#filterAccount` "Cari Hesap" (Tüm Hesaplar + `ViewBag.CustomerAccounts` "kod - ad (grup)"), `#filterWorkPlace` "İş Yeri" (Tüm İş Yerleri + şube optgroup'ları — MX5 Varyant A), `#filterDateStart`, `#filterDateEnd`, `#filterMethod` (Tümü + 6 yöntem, CAPC:336-341), Uygula / Temizle.
- Tablo `#paymentsTable` (PAY:403-414; satır üretimi pjs:3085-3157): Tarih · İş Yeri (+ şube alt satırı) · Cari Hesap (`/AccountTransaction/Transactions/{id}` yeni sekme linki) · Belge No · Tutar (kırmızı, sembol) · Ödeme Yöntemi (rozet + çek/senet no) · Muhasebe Tipi (rozet; banka/kasa hareketinin `AccountingType`'ı veya açıklamadaki `[EFT]`/`[HAVALE]`/`[VİRMAN]`/`DÖVİZ BOZUM`/`KASADAN…` etiketlerinden türetilir, CAPC:876-889) · Kaynak (banka/kasa adı) · Açıklama · İşlem.
- Satır düğmeleri (pjs:3125-3145): **Detay** (her zaman), **Düzenle** (yalnız Nakit/Banka ve özel muhasebe tipi değilse), **Sil** (Çek/Senet ve özel tiplerde gizli). Özel tipler: `EFT, Havale, Virman, Döviz Bozum, Bankadan Kasaya, Kasadan Bankaya, Kasadan Kasaya, Net Maaş, Kredi Kullanım` (pjs:3101).
- Partial'lar: `_AddPaymentModal` (PAY:425), `_EditPaymentModal` (:427), `_PostPaymentPlanningModal` (:1495). PAY:596-1491 arası eski `addPaymentModal` kopyası `@if (false)` içinde → ölü kod (aynı id).
- JS içinde üretilen: `confirmDeleteModal` (pjs:3694), `paymentDetailModal` (pjs:3805).

### 1.4 Modal `addPaymentModal` — "Yeni Ödeme Ekle" (APM:157-1123; `modal-xl modal-dialog-scrollable`, form `#paymentForm`)

Ortak kullanım: Payments (PAY:425), **BankTransactions** (`Views/BankTransactions/Index.cshtml:726`), **CashTransactions** (`Views/CashTransactions/Index.cshtml:487`); Checks/Bills'te satır içi kopya (MX3 M6). JS: pjs, `BankTransactionsPayments.js`, `cashtransactionspayments.js` (üç kopya).
Görünür bölümler sırasıyla:

| # | Alan (id) | Etiket | Tip / doğrulama | Kaynak / davranış |
|---|---|---|---|---|
| 0 | `#remainingDebtInfo` | (dinamik "Borç ve Planlama Bilgileri" paneli) | — | cari seçilince `/PaymentManagement/GetCustomerDebtSummary` (pjs:4174, 4289) + `/CustomerAccountCollection/GetCustomerCreditSummary` (pjs:1491…) |
| 1 | `CustomerAccountID` | Cari Hesap * | select2 (`zt-payment-select2`), `required` | `ViewBag.CustomerAccounts` (CAPC:225-262, grup listesi :237 üretim terimleri içerir); yanında "+" (`openAddCustomerAccountModal()` — MX1 cari ekle) ve "yenile" düğmeleri; `data-account-group` |
| 2 | `PaymentDocumentNo` | Belge / Fatura No | text, opsiyonel | ph "Fatura/Ödeme No" |
| 3 | `PaymentMethod` | Ödeme Yöntemi * | select `required` | Nakit / Banka Havalesi/Eft / Çek / Senet / Kredi Kartı / Diğer (APM:242-248) → bölüm göster/gizle (pjs:2075-2118) |
| 4 | `PaymentDate` | Ödeme Tarihi * | date `required` | bugün |
| 5 | `WorkPlaceID` | İş Yeri * | select `required`, şube optgroup | `ViewBag.WorkPlaceGroups`; alt yazı "Kasa ve banka hesapları bu iş yerine bağlıdır" |
| 6 | `CrossCurrencyPayment` | ÇAPRAZ KUR — "Farklı para birimi ile ödeme" | checkbox | açılınca `#crossCurrencyRow`, `#crossExchangeRateRow` |
| 7 | `CurrencyID` | Para Birimi * | select `required` | `ViewBag.Currencies`; ciro modunda kilitli |
| 8 | `PaymentAmountInput` | Ödeme Tutarı * | text `inputmode=decimal`, `pattern [0-9]*[.,]?[0-9]{0,2}`, `formatDecimalInput(this,2)` | sağda sembol eki; gizli `#Amount` |
| — | `ExchangeRate` | Döviz Kuru (₺) | **yorum satırında** (APM:433-459) | gönderimde yok → sunucuda `1` (§6-B2) |
| 9 | `PaymentCurrencyID` | Ödeme Para Birimi * | select (çapraz kurda) | |
| 10 | `DebtCurrencyID` | Borç Para Birimi * | select (çapraz kurda) | |
| 11 | `CrossExchangeRate` + `#btnCrossOperator` (÷/×) + gizli `CrossRateOperator` | Çapraz Kur * | text 4 hane, vars. `1.0000` | `toggleCrossOperator` |
| 12 | `AmountCross` | Cariden Düşülecek Tutar * | readonly, hesaplanır | `#calculationResult` |
| 13a | `CashID` (Nakit) | Kasa Seçiniz * | select2 | `/CustomerAccountCollection/GetCashByWorkPlaceCustomer` (iş yeri + para birimi) |
| 13b | `BankID` (Banka, Kredi Kartı) | Banka Seçiniz * | select2 | `/CustomerAccountCollection/GetBanksByWorkPlaceCustomer` |
| 13c | Diğer / Çek / Senet bilgi kartları | `#otherPaymentInfo`, `#checkPaymentInfo`, `#billPaymentInfo`, `#selectPaymentInfo` | — | yalnız açıklama |
| 14 | `checkTypeOption` (radio) | Çek Türü: "Kendi Çekimiz" / "Müşteri Çeki Ciro Et" | btn-group | |
| 15 | `EndorsableCheckID` + gizli `EndorsedCheckId` | Ciro Edilecek Çeki Seçin * | select | `GetEndorsableChecks` (pjs:7254); seçilince tutar/para birimi/vade kilitlenir, özet kart (Çek No, Banka, Tutar, Vadesi, Keşideci, Kasa) |
| 16 | `CheckBankID` | İş Yeri Bankası * | select | iş yerinin bankaları |
| 17 | `CheckBookID` | Çek Koçanı Seçiniz (Opsiyonel) | select (yeşil kullanılabilir / gri kullanılmış) | `GetAvailableCheckBooks` |
| 18 | `#toggleManualCheck` | "Manuel Çek Numarası Gir" | button | `CheckNumber` readonly'yi açar |
| 19 | `CheckNumber` | Çek Numarası | text `maxlength=7`, `pattern [0-9]{1,7}`, readonly+required | istemci: 1–7 hane (pjs:2620-2630); `_CheckLeafGuard` → `/Checks/CheckLeafLookup` |
| 20 | `BankName`, `BranchName` | Banka Adı, Şube Adı | readonly, otomatik | |
| 21 | `IssueDate`, `DueDate` | Keşide Tarihi, Vade Tarihi | date required (vade vars. +30 gün) | |
| 22 | `CheckDescription` | Çek Açıklaması | textarea | |
| 23 | `BillBankID` (+`BillBankName`, `BillBranchName` readonly) | İş Yeri Bankası (Opsiyonel) | select | |
| 24 | `BillWorkPlaceID` | Keşideci (İş Yeri) | select required, şube optgroup | "Senedi düzenleyen şirketimiz/iş yerimiz" |
| 25 | `BillNumber`, `BillIssueDate`, `BillDueDate`, `BillDescription` | Senet Numarası, Düzenlenme Tarihi, Vade Tarihi, Senet Açıklaması | text req, date req ×2, textarea | `billType='Adi Senet'` sabit (pjs submit) |
| 26 | `#supplierGardensSection` + şablon `#gardenCardTemplate` (APM:34-155) | "Tedarikçi Bahçe Ödemeleri (Hangi Bahçenin Borcuna Mahsuben)" | kart başına tutar, ödeme tipi (Satınalım/Avans/Kapora), açıklama | `GetSupplierGardens` — **bahçe**; `ZT_Setting 'Reçeteli Üretim'` açıksa CSS ile gizli (APM:1-30, view içinde Npgsql) |
| 27 | `CustomerBankAccountID` | Cari Banka Hesabı Seçiniz | select (opsiyonel; `required` niteliği var ama boş seçenekle geçiyor) | `GetCustomerBankAccounts`; seçilince açıklamaya IBAN yazılır |
| 28 | `Description` | Ödeme Açıklaması | textarea | |
| Düğmeler | İptal · **Ödemeyi Sonra Kaydet** (`#postponeInstructionPaymentBtn`, yalnız talimat modunda) · **Kaydet** (`.btn-save` → `submitPayment()` pjs:2647 → `AddPayment`) | | | talimat modu: `/BankTransactions/CheckInstructionSessionExists` (pjs:2744), `instructionPlanId` |

İstemci doğrulaması (pjs:2600-2645): tutar > 0, tarih; Çek→ciro ise çek seçili; kendi çekinde banka, numara (rakam, 1-7 hane), keşide/vade; Senet→no, tarih ×2; Nakit→kasa; Banka/Kredi Kartı→banka.

### 1.5 Modal `editPaymentModal` — "Ödeme Düzenle" (EPM:157-1150, form `#editPaymentForm`)
APM'nin `edit`-önekli kopyası (alanlar 1–28 aynı sıra; id'ler `editCustomerAccountID`, `editPaymentMethod`, `editCashID`, `editBankID`, `editCrossCurrencyPayment`, `editCurrencyID`, `editPaymentAmountInput`, `editCrossExchangeRate`, …). Farklar: Döviz Kuru alanı **açık** (`ExchangeRate` EPM:436, id öneksiz — APM ile çakışır); çek/senet bölümünde id'ler öneksiz (`CheckBankID`, `CheckNumber`, `BillNumber`… — APM ile **aynı id**, iki modal aynı sayfada → DOM çakışması). Kaydet → `UpdatePayment`. UI yalnız Nakit/Banka kayıtlarında açılır.

### 1.6 Modal `postPaymentPlanningModal` — "Ödeme Başarılı!" (PPM:4-177; `modal-xl`, `data-backdrop=static`)
Tetik: `AddPayment` yanıtı `hasRemainingDebt && remainingDebt > 0 && accountGroup !== 'Müşteri'` (pjs:5936, 5956). Kullanım: Payments, BankTransactions (`Index.cshtml:732`); `cashtransactionspayments.js:6294` da açmaya çalışır ama CashTransactions sayfası partial'ı içermez (§6-B12).
- Özet: CARİ HESAP (`#ppAccountName`, `#ppAccountCode`), YAPILAN ÖDEME (`#ppPaidAmount`), "Kalan Borç Mevcut" kartı + para birimine göre kalan borç listesi (`urls.getAccountBalancesByCurrency` → **CustomerAccounts**.`GetAccountBalancesByCurrency`).
- Bölüm A soru: "Bu borç için ödeme planlaması yapmak ister misiniz?" → düğmeler **Daha Sonra Yaparım** / **Evet, Planla**.
- Bölüm B tablo `#ppPaymentPlanRows`: # · Tarih* (date) · Tutar* (number step .01, min 0) · Para Birimi* (select, `GetAllCurrenciesForPlan`) · Açıklama · Şube* (`GetAllBranchProvinces`) · İş Yeri* (`GetWorkPlacesByBranch`) · Banka* (`GetBanksByWorkPlaceAndBranch`) · Kaynak (Manuel / çek / kredi; yalnız Manuel satırlar düzenlenebilir) · sil (mevcut planı `ppCancelledPlanIds`'e ekler); tfoot Toplam; **Satır Ekle**. Mevcut planlar `urls.getPaymentPlanningDetails` ile ön yüklenir.
- Kaydet (`savePostPaymentPlanning` pjs:6282) → **CustomerAccounts**.`SavePaymentPlanning` `{customerAccountID, plans[], cancelledPlanIds[]}`; istemci doğrulaması: tarih, tutar>0, şube, iş yeri, banka zorunlu.

### 1.7 Diğer Payments modalları
| Modal | Satır | Başlık | Alanlar / düğmeler | Uç |
|---|---|---|---|---|
| `dailyPaymentReportModal` | PAY:450-534 | Günlük Ödeme Raporu | `dailyPaymentReportDate` "Rapor Tarihi" (date, bugün); "İş Yeri (çoklu seçim)" şube gruplu liste (`dprWpSearch`, `.dpr-branch-check`, `.dpr-wp-check`, "Tümünü seç"); İptal · Raporu Aç | `openDailyPaymentReport()` → `DailyPaymentReport?reportDate&workPlaceIds=1,2` (PAY:2056-2061). **Referans markup = MX5 Varyant B** (`ZtoBranchMultiSelect variant="list"`) |
| `checkMatchModal` | PAY:538-590 | Çek İle Eşleştir (+ belge no) | benzerlik kutusu; tablo: seçim · Çek No · Tür/Durum · Tutar · Vade · Banka/Şube · Keşideci · Lehdar; Kapat · Eşleştir (`#btnConfirmCheckMatch`) | `GetMatchingChecks` / `MatchPaymentWithCheck` |
| `gardenPaymentHistoryModal` | PAY:1621-1640 | Bahçe ödeme geçmişi | tablo | `GetGardenPaymentHistory` — **bahçe** |
| `confirmDeleteModal` | pjs:3694 | Silme onayı | ödeme özeti + Sil | `DeletePayment` → `ConfirmDeletePayment` |
| `paymentDetailModal` | pjs:3805 | Ödeme Detayı | salt okunur | `GetPaymentDetail` |

### 1.8 Tahsilatlar sayfası (COL) — yerleşim
- Başlık "Tahsilat Yönetimi", breadcrumb "Finans › Tahsilatlar"; sol "Cari Listesine Dön" (COL:152).
- Üst düğmeler (COL:190-226): **Yeni Tahsilat** (`#addCollectionModal`), Ödemeler, Çekler, Senetler, **Günlük Tahsilat Raporu** (`#dailyCollectionReportModal`, COL:476 — `dcr` önekli MX5 Varyant B kopyası), Excel, Yazdır.
- Filtreler (COL:240-345): Cari Hesap, **Hesap Grubu** (`#accountGroupFilter`: Tedarikçi, Müşteri, Malzeme T., İlaç T., Kesim Çavuşu, Üretim Çavuşu, Nakliye F., Sevk Nakliye F., Analiz F., İş Yeri Firması, Personel, Masraf Hesabı), İş Yeri, Başlangıç, Bitiş, Tahsilat Yöntemi.
- Tablo `#collectionsTable` (COL:429-441; cjs:3762-3815): Tarih · İş Yeri · Cari Hesap (link) · Belge No · Tutar (yeşil + "Kur: x") · Tahsilat Yöntemi · Muhasebe Tipi · Kaynak · Açıklama · **Döviz Bozum** (durum rozeti `ExchangeStatus` + kalan + "Boz" linki `/BankStatement/Index?openTab=newTransfer&transferType=exchange`) · İşlem.
- Satır düğmeleri: Detay; **Düzenle + Sil yalnız `exchangeStatus === 'Bekliyor'` ve özel muhasebe tipi değilse** (cjs:3776-3794) — yönteme bakılmaz (çekli tahsilat da düzenlenir/silinir).
- JS modalları: `confirmDeleteModal` (cjs:6262), `collectionDetailModal` (cjs:6453).

### 1.9 Modal `addCollectionModal` — "Yeni Tahsilat Ekle" (CMP:47-850)
Kullanım: Collections (COL:453), BankTransactions (`Index.cshtml:729`), CashTransactions (`Index.cshtml:490`). Form id/akış:

| # | Alan | Etiket | Tip / doğrulama | Not |
|---|---|---|---|---|
| 1 | `CustomerAccountID` | Cari Hesap * | select required, +/yenile | |
| 2 | `CollectionMethod` | Tahsilat Yöntemi * | select (6 yöntem, CMP:136-142) | |
| 3 | `CollectionDocumentNo` | Belge No | text | |
| 4 | `CollectionDate` | Tahsilat Tarihi * | date | |
| 5 | `WorkPlaceID` | İş Yeri * ("İş Yeri Bilgisi" grubu) | select required, optgroup | |
| 6 | `CurrencyID` | Para Birimi * | select | "Seçilen banka/kasa para birimidir" |
| 7 | `CollectionCurrencyID`, `CreditCurrencyID`, `CrossExchangeRateCollection` + operatör (`CollectionCrossRateOperator`) | Tahsilat / Alacak para birimi, Çapraz Kur | çapraz kurda | `#CrossCurrencyCollection` "Farklı Para Birimi ile Tahsilat" |
| 8 | `BankID` (+ `BankIDDisplay`) | Banka Seçiniz * | Banka / Kredi Kartı | `GetBanksByWorkPlaceCustomer` |
| 9 | `CashID` | Kasa Seçiniz * | Nakit | `GetCashByWorkPlaceCustomer` |
| 10 | `CheckBankID` | Çekin Yatırıldığı Banka Hesabı * | Çek + Bankada | |
| 11 | `CheckCashID` | Çekin Tutulduğu Kasa * | Çek + Portföyde / Kasaya Al | |
| 12 | `BillBankID` | Banka (Opsiyonel) | Senet | |
| 13 | `CheckStatus` radio | Çek Durumu: **Bankaya Yatırıldı** (`Bankada`, vars.) / **Portföyde (Elde)** / **Kasaya Al (Ciro)** (`KasayaCiro`) | | açıklama metni CMP:455-462 |
| 14 | `CheckNumber` | Çek Numarası * | `maxlength 7`, `pattern [0-9]{1,7}` | |
| 15 | `BankName`, `BranchName`, `IssueDate`*, `DueDate`*, `CheckDescription` | | | müşteri çekinin bankası (serbest metin) |
| 16 | `BillBankName`, `BillBranchName`, `BillWorkPlaceID`*, `BillNumber`*, `BillIssueDate`*, `BillDueDate`*, `BillDescription` | | | |
| 17 | `CollectionAmountInput` | Tahsilat Tutarı * | decimal | |
| 18 | `ExchangeRate` | Döviz Kuru (₺) — "(Opsiyonel)" | decimal 4 | **açık** (Payments'tan farklı) |
| 19 | `Amount` | Cariden Düşülecek Tutar * | otomatik | |
| 20 | `CustomerBankAccountID` | Cari Banka Hesabı Seçiniz | opsiyonel | |
| 21 | Sipariş tahsisi (CMP:765-830) | "Sipariş Tahsisi (Opsiyonel)" — **Siparişleri Yükle**; tablo: ☐ (`#selectAllOrders`) · Sipariş No · Ürün · Toplam Tutar · Ödenen · Kalan · Tahsis Edilecek Tutar; "Toplam Tahsis:"; uyarı "Toplam tahsis, tahsilat tutarını aşıyor!" | | `GetCustomerOrders` → `orderAllocationsJson` — **sipariş** |
| 22 | `Description` | Açıklama | textarea | |
| Düğmeler | İptal · Kaydet (`.btn-save` → `AddCollection`) | | | |

### 1.10 Modal `editCollectionModal` — "Tahsilat Düzenle" (CMP:854-1530)
`Edit`-önekli kopya (`EditCollectionId` gizli; `EditCustomerAccountID`, `EditCollectionMethod`, `EditCollectionDocumentNo`, `EditCollectionDate`, `EditWorkPlaceID`, `EditCurrencyID`, …). Ek: üstte `#editRemainingCreditInfo` / `#customerCreditInfoContainer` (cari alacak kartları); `EditCheckStatus` değerleri `Bankaya Yatırıldı` / `Portföyde` / `KasayaCiro` (CMP:1163-1171 — add ile değer farkı: `Bankada` ↔ `Bankaya Yatırıldı`); sipariş tahsisi bölümü (CMP:1446-1520). Düğme **Güncelle** (`.btn-update` → `UpdateCollection`). Açılış verisi `GetCollectionForUpdate`.

### 1.11 Günlük Ödeme / Tahsilat Raporu (DPR / DCR — aynı yapı)
- Başlık "Günlük Ödeme Raporu (dd.MM.yyyy)" + "N ödeme kaydı. Sıralama, oluşturulma saatine göre yapılır."; Yazdır.
- Filtre formu (GET; DPR:690-805, DCR:640-760): Tarih, İş Yeri, Banka/Kasa, Para Birimi, Yöntem, Sıralama (`time-asc` "Saat: İlkten Sona" / `time-desc`); görünüm düğmeleri **Gruplu / Düz / Tümünü Aç / Tümünü Kapat**; "Rapor İçi Arama" (istemci süzgeci: cari, belge no, banka, açıklama).
- Özet kartları: İş Yeri Özet / Banka-Kasa Özet / Yöntem Özet / Para Birimi Özet (her biri ilk 10, tıklanınca süzgeç) + istatistik kutuları "Toplam Ödeme", "İş Yeri Sayısı", "Rapor Tarihi".
- **Gruplu görünüm**: İş Yeri (açılır başlık) → Banka veya "Kasa: X" (açılır başlık) → tablo: S. No · Oluşturma Saati · Cari Hesap · Belge No · Yöntem · Kaynak · Tutar · Açıklama (DPR:999-1008). **Düz görünüm**: + İş Yeri kolonu (DPR:1058-1068).
- "Genel Toplamlar (İş Yeri / Banka Bazlı)" paneli (DPR:1105-1340): **İş Yerleri Arası Transferler** (İş Yeri Firması carilerine ödemeler) · **Cari Ödemeler** (Banka Toplamları / her kasa / Tanımsız; para birimine göre) · **Kredi Ödemeleri** (`ZT_CustomerAccounts.IsCreditBankAccount = true`, CAPC:3273, 3410) · **Genel Toplam** (= transfer + cari [+ kredi]) · **Diğer (Yöntem)** "(Genel Toplama dahil değildir)".
- "Özet Bakiye Bilgisi" (DPR:1345-1420): Banka Hesabı / Kasa Hesabı × "{rapor günü} Gün Sonu Bakiye" × "{bugün} Güncel Bakiye" — hareketlerden `Giriş − Çıkış`, `Status=true` (CAPC:3976-4110).
- "Banka Hareketine Yansıyan Çek Özeti" (legacy; DPR:1425-1470): İş Yeri · Banka/Kasa · Adet · Toplam — yalnız `Tahsil Edildi` olup bankaya yansımış çekler, banka hareket tarihine göre (CAPC:3491-3516).
- "Ödeme Tarihine Göre Yazılan Çekler" (DPR:1475-1520): Ödeme Tarihi · İş Yeri · Cari Hesap · Çek No · Banka/Kasa · Durum · Tutar (CAPC:3642-3654).
- Tarih esası: çekli ödemelerde rapor tarihi = `'Çek Tahsil'/'Çek Ödeme'` banka hareket tarihi, aksi halde `COALESCE(PaymentDate, CreationDate)` (CAPC:3312-3340). DCR'de başlıklar "Cari Tahsilatlar", "Tahsilat Tarihine Göre Yazılan Çekler", "Banka Hareketine Yansıyan Çek Özeti"; kredi bölümü yok.

### 1.12 `/PaymentApproval/Index` (PAC + PAV)
Sınıf (PAC:13-14): `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]`; tüm POST'lar `[ValidateAntiForgeryToken]`, AJAX başlığı `RequestVerificationToken` (PAV:31). Route tablosu envanter A §PaymentApproval ile aynıdır (Index :60, GetBanksByWorkPlaceAjax :381, GetWorkPlacesByBranchProvinceAjax :401, Approve :583, SendToApproval :644, BulkSendToApproval :703, Reject :757, GiveOrder :818, BulkApprove :885, BulkReject :939, BulkGiveOrder :993, BulkGiveOrderAndStoreSession :1132, BulkReturnToPending :1199, UpdateInstructionStatusToCompleted :1251 — çağıran `Views/BankTransactions/Index.cshtml:3561`, BulkCompleteInstructions :1318, GetBankAccountsByReference :1386, GetInstructionDetails :1532).

**Ekran özellikleri (yeniden üretilecek liste):**
1. Başlık "Ödeme Onay Yönetimi", breadcrumb "Ana Sayfa › Finans › Onay Yönetimi"; "Cari Kartlara Dön".
2. **Durum sekmeleri + sayaçlar** (PAV:~800-890): Beklemede (`awaiting`) · Onay Bekliyor (`pending`, varsayılan) · Onaylandı (`approved`) · Reddedildi (`rejected`) · Talimat Verildi (`ordered`) · Tamamlandı (`completed`) · Tümü (`all`) — PAC:164-190, sayaçlar PAC:362-368.
3. **Filtreler** (PAV:900-1060, GET formu): Başlangıç / Bitiş (vars. −3 ay / +9 ay, PAC:78-82) · Şube → İş Yeri → Banka cascade (`GetWorkPlacesByBranchProvinceAjax`, `GetBanksByWorkPlaceAjax`) · Kaynak (Tümü / Manuel / Talimatlı Plan, PAC:105-109) · Cari çoklu seçim (select2, "Ctrl ile birden fazla", Temizle).
4. Listeleme kuralı: yalnız `SourceType IN ('Manuel','Talimatlı Plan')` ve `PaymentBankID IS NOT NULL` (PAC:160-162) — çek/kredi/maaş kaynaklı planlar bu ekranda yok.
5. **Hiyerarşi**: Banka kartı (☐ toplu seçim, "Banka - İş Yeri", **banka bakiyesi** `GetBankBalance` ZT_BankTransactions'tan, PAC:1635) → Tarih grubu (☐, tarih toplamı, vadesi geçmiş rengi `dateClass`) → satırlar; banka başına "daha fazla tarih yükle" (`.load-more-dates`, PAV:1426).
6. Satır kolonları (PAV:1264-1275): ☐ · Cari Bilgileri (kod/ad/grup) · Alıcı Hesap Adı · Alıcı Banka · Alıcı Şube · IBAN · Ödeme Tutarı · Açıklama · Şube · Durum · Kaynak · İşlemler (Onaya Gönder / Onayla / Reddet; duruma göre).
7. **Toplu düğmeler (sekmeye göre)**: awaiting → "Seçilenleri Onaya Gönder"; pending → Onayla / Reddet; approved → "Bankaya Talimat Ver"; rejected → "Bekleyene Al" (BulkReturnToPending) + "Onayla" (BulkApprove reddedilenden doğrudan, PAC:906); ordered → "Tamamla" (BulkCompleteInstructions) + "Ödemeyi Kaydet" (bulkSaveInstructionPayments); her sekmede Excel.
8. Modallar:
   - `notesModal` (PAV:1439-1465) başlık dinamik; gizli `actionItemId`, `actionType`; "Not (Opsiyonel)" textarea `actionNotes`; Vazgeç · Onayla (`executeAction()` → Approve / Reject / GiveOrder).
   - `orderDetailModal` "Banka Talimatı Detayları" (PAV:1468-1600): bilgi kartı (Şube, İş Yeri, Banka, **Güncel Bakiye**, **Talimat Toplamı**, **Kalan Bakiye**, kayıt sayısı) + düzenlenebilir tablo: Kayıt Tipi · Ödeme Tarihi* · Cari Hesap · Ödeme Tutarı · **Alıcı IBAN*** (cari IBAN select'i `GetBankAccountsByReference` veya "manuel giriş", temizle) · Alıcı Hesap Adı · Alıcı Banka · Alıcı Şube · Açıklama*; İptal · Onayla (`confirmBulkOrder()` → `BulkGiveOrder` veya `BulkGiveOrderAndStoreSession`).
   - `instructionProcessModal` "Banka Talimatı İşlem Türü Seçin" (PAV:1630-1705): seçenek 1 "Excel İndir → Ödeme Kayıt Ekranı" (durum Talimat Verildi, `BankTransactions/Index`'e Session `PendingInstructionData` ile yönlendirme, her satır `addPaymentModal` ile kaydedilir); seçenek 2 "Excel İndir → Sayfa Yenile" (ödeme kaydı yok, ekstre beklenir).
   - `confirmModal` (PAV:1602-1625) genel onay.
9. **Excel** (SheetJS, PAV:2612-2660): Tarih · Cari Kod · Cari Adı · Alıcı Hesap Adı · Alıcı Banka · Alıcı Şube · IBAN · Tutar · Açıklama · Şube.
10. "Ödemeyi Kaydet" yalnız **tek bankadan** seçimle (PAV:3057-3061) → `GetInstructionDetails` → Session → BankTransactions.
11. **Isı haritası / yoğunluk / yorum geçmişi yok** (grep `yoğunluk|heatmap|density` PAV: 0). Not yalnız son karar notu (`ApprovalNotes`). Isı haritası ZTO'da PaymentManagement/CustomerAccounts tarafındadır (MX1/MX3).

Tablolar: `ZT_CustomerAccountPaymentPlans` (R :153, :553, :1008, :1555; U 11 yerde :592…:1337 — `ApprovalStatus, ApprovalDate, ApprovalBy, ApprovalNotes, PaymentStatus, PaymentCompletedDate, UpdatedDate, UpdatedBy`), `ZT_BankPaymentInstructionDetails` (R :159, :1557; U :1072 `CustomerIban, Description`), `ZT_BankAccounts`, `ZT_BankIntroduction`, `ZT_BankTransactions` (R :1635), `ZT_CustomerAccounts`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince`; finans dışı yalnız `ZT_ProductionPlanning` (:74, layout). DDL yok. Log: `Methods.LogAdd` (4).

### 1.13 `Services/PaymentPlanHelper.cs`
Statik; `SyncCheckPaymentPlan` (:33; plan carisi = çekin ilk lehdarı :40-42; vade geçmişse `Gecikmiş` :106; çek tamamlanınca `Tamamlandı` :139), `CancelCheckPaymentPlan` (:173), `SyncCreditPaymentPlan` (:197), `CancelCreditPaymentPlan` (:228), `CancelAllCreditPaymentPlans` (:248), `CancelSalaryPaymentPlan` (:278, çağıranı yok). Çağıranlar bu kapsamda: CAPC:1465, :1577; CACC:939, :1069, :2702, :2745, :2763. **BR karşılığı**: çek için plan **üretilmez** (MX3 §2.7 — ısı haritası açık ISSUED instrument'ları ayrıca gösterir); kredi taksiti → `payment_plan.source_type='CREDIT_INSTALLMENT'` (V33 + V32, `CreditService` senkronu); maaş → MX6. Helper **ÇIKAR** (statik, transaction opsiyonel).

### 1.14 `/CustomerCurrentAccounts/Index` (CCAC)
Sınıf (CCAC:11-12) `[Authorize]`, `[UserRoleAuthorize("Satış Personeli","Admin","Patron","Finans(normal)","Finans(super)")]`. Route: `Index` (:15, fiil özniteliği yok → GET), `GetCustomerOrders(customerId)` (:340, GET). AF: yok (POST yok).
- View (538 satır): başlık "Sipariş ve Satış Paneli", satış menüsü (`/orderheader`, `/orders`, `/salesproduct`, `/commercialproduct`, `/readystock`, `/SalesProductLogistic`, `/orderdefinitions`); tablo: Cari Kart Adı · Cari Kodu · Borç · Tahsilat Faturası (Alacak) · Ödeme · Tahsilat · Net Bakiye · Durum (`PlanningStatus`) · İşlemler.
- Modallar: `transactionsModal` (`Views/CustomerCurrentAccounts/Index.cshtml:261`; içerik `AccountTransaction/TransactionsPartial` AJAX :398 → **MX1 ekstre bileşeni**), `salesPartiesModal` (:297; Sipariş Adı · Ürün · Satıcı · Net Miktar (Kg) · Birim Fiyat · Toplam Tutar · Para Birimi · Oluşturma Tarihi; `GetCustomerOrders` → `ZT_Orders`, `ZT_OrderHeader`, `Product`).
- Sorgu: yalnız `AccountGroup='Müşteri'`, (cari × para birimi) `CROSS JOIN Currency`, 4 tablodan alt sorgu toplamları (:200-240).
- Yan etkiler: **GET içinde UPDATE** `UpdatePlanningStatuses` (:158 → :397-430, `IntroductionAuditHelper.ExecuteSuppressed`); `GlobalVeriables.restrictionQuery + userRoleID` **string birleştirme** (:152).

### 1.15 Banka/kasa + cari + çek aynı transaction'da mı? (ödeme/tahsilat yazımı)
| Yöntem | ZTO AddPayment (CAPC:1092-1969) | ZTO AddCollection (CACC:687-1468) | BR `SettlementService.create` (SS:86-138) |
|---|---|---|---|
| Nakit | `ZT_AccountPayments` + `ZT_CashTransactions` (`Çıkış`/`Cari Ödeme`, ReferenceID=paymentId) | `ZT_AccountCollections` + `ZT_CashTransactions` (`Giriş`/`Cari Tahsilat`) | settlement + `account_transaction` (DEBIT/CREDIT) + `fund_transaction` (OUT/IN), tek tx |
| Banka | + `ZT_BankTransactions` | + `ZT_BankTransactions` | aynı, fon kind=BANK |
| Kredi Kartı | banka hareketi (BankID zorunlu) | banka hareketi | → BANK (+ kanal, V2xQ1) |
| Çek (kendi/koçan) | `ZT_Checks` `Kullanıldı` + `ZT_CheckBooks` + `ZT_CheckMovements` + plan senkronu; **banka hareketi yok** | `ZT_Checks` `Tahsil Edilen Çek`; `Bankada` → **anında banka Giriş `Çek Tahsil`** (:947-960) | settlement(CHECK) + `account_transaction` + `instrument` ISSUED/PORTFOLIO + `instrument_movement`; fon yok (SS:104, :125) |
| Çek ciro | çek `Ciro Edildi`, `CurrentHolderID`, hareket `Ciro` | — | `InstrumentService.endorse` (IS:114) — tutar eşitliği zorunlu |
| Senet | `ZT_Bills` `Ödendi` (anında!) | `ZT_Bills` `Tahsil Edildi` (anında!) | instrument kind=NOTE, ISSUED / PORTFOLIO |
| Diğer | yalnız `ZT_AccountPayments` (fon hareketi yok) | yalnız `ZT_AccountCollections` | yok → ÇIKAR |
| Çapraz kur | `PaymentType='Çapraz Kur'`, `Amount`=borç pb tutarı, `ExchangeRate=1`, fon hareketi ödeme pb'de | aynı (`CollectionType='Çapraz Kur'`) | yok (SS:265 `CURRENCY_MISMATCH`) → ÇIKAR |
| Ek | cari plan alanlarını sıfırla (:1852-1868); bahçe payları (:1924); talimat planı `Tamamlandı` (:1930-1967) | sipariş tahsisi `ZT_AccountCollectionOrders` (:1338-1466) | plan ödemesi yalnız `PPS.pay` (PPS:192) |
| FX | kur istemciden string; Payments'ta alan gizli → 1 | kur opsiyonel | `ExchangeRateService.convert` (TCMB, hareket günü, manuel kur opsiyonel) — `LedgerService.java:63` |

Cari bakiye: ZTO saklı kolon yok (`SUM(ZT_AccountDebts) − SUM(ZT_AccountPayments)`, CAPC:1803-1846 — **para birimi ayrımı yok**); BR hareketlerden, para birimi bazında (MX1).

### 1.16 Finans dışı bağımlılıklar (tam liste → hepsi ÇIKAR ya da dönüştürülür)
| Bağımlılık | Yer | BR |
|---|---|---|
| Bahçe/müstahsil ödeme paylaştırması: `ZT_ExpertReport`, `ZT_ExpertReportTruck`, `ZT_ExpertReportTruckFinance`, `Supplier`, `Product`, `SubProduct`, `ZT_CustomerAccountSupplierPaymentsShares` | CAPC:435-740, :2067-2117, :1924; APM:34-155, :1023-1082; pjs:6470-7250; `gardenPaymentHistoryModal` | ÇIKAR (tarım); ops. alış faturası eşleştirmesi V2xQ2 |
| Sipariş tahsisi: `ZT_Orders`, `Customer`, `Product`, `ZT_AccountCollectionOrders` | CACC:2024-2178, :1338-1466, :3083-3187; CMP:765-830, :1446-1520 | Dönüştür → fatura açık kalemi (V2xQ2, §7-S1) |
| Satış paneli: `ZT_Orders`, `ZT_OrderHeader`, `Product`, `ZT_SalesPerson`, `Restriction`/`UserRestriction` ("Sipariş İşlemleri") | CCAC tamamı | ÇIKAR |
| `ZT_Setting 'Reçeteli Üretim'` (view içinde Npgsql) | APM:1-30, EPM:1-30, CMP:1-14 | ÇIKAR |
| `ZT_ProductionPlanning` (layout chat) | CAPC:60, CACC:63, PAC:74, CCAC | ÇIKAR |
| Personel başlık tabloları `ZT_Boss`, `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_LogisticsPerson`, `ZT_ProductionManager` (string birleştirmeli) | CAPC:68-181, CACC:71-184 | ÇIKAR → BR oturum + `user_branch` (MX5 V22e) |
| Üretim/satış üst menü linkleri (`/specialReport`, `/Boss/LiveMonitor`, `/productioncost`, `/readystock`, `/warehousesituation`, `/expertreport`, `/expertchef`, `/productionplanning`, `/orderheader`, `/SalesProductLogistic`) | PAY:138-180, COL:76-118 | ÇIKAR (BR menüsü "ZTO Finans" grubu) |
| Cari grup listesi (Kesim/Üretim Çavuşu, İlaç, Analiz…) | CAPC:237, COL:259-275 | 04 §3.1 eşlemesi (Kesim Çavuşu ÇIKAR) |
| `IMenuDesignService` (`@inject`) | PAY:5, :192 | ÇIKAR |
| Maaş planı (`CancelSalaryPaymentPlan`), "Net Maaş" muhasebe tipi | PPH:278, pjs:3101 | MX6 |
| Kredi (`PayWithCredit`, `IsCreditBankAccount`, "Kredi Kullanım") | CAPC:1634, :3273 | MX3 V32 |

### 1.17 Çapraz controller çağrıları (taşınırken tek uca toplanacak)
Payments → **CustomerAccounts** (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`, `GetPaymentPlanningDetails`, `SavePaymentPlanning`, `GetAllCurrenciesForPlan`, `GetAccountBalancesByCurrency`; PAY:1853-1864, pjs:6341), **CustomerAccountCollection** (`GetCustomerCreditSummary`, `GetBanksByWorkPlaceCustomer`, `GetCashByWorkPlaceCustomer`), **BankTransactions** (`CheckInstructionSessionExists` pjs:2744), **PaymentManagement** (`GetCustomerDebtSummary` pjs:4174, 4289), **AccountTransaction** (`GetWorkPlaceBalances`, `GetAvailableCurrencies`, `Transactions/{id}`), **Checks** (`CheckLeafLookup`). Collections → **CustomerAccounts** (`GetBanksByWorkPlace`, `GetCashesByWorkPlace`), **AccountTransaction** (`Transactions/{id}`), **BankStatement** (bozum linki). PaymentApproval → **BankTransactions/Index** (Session `PendingInstructionData`), **CustomerAccounts/Index**. CCAC → **AccountTransaction/TransactionsPartial**.

### 1.18 Yetki ve iş yeri filtresi
- Rol listeleri yukarıda; action bazında ayrım yok — Payments/Collections sayfasına giren "Satış Personeli" ödeme/tahsilat yazabilir; PaymentApproval'a giren her rol onaylayıp talimat verebilir (dört göz yok).
- İş yeri: yalnız istek parametresi (`p."WorkPlaceID" = @WorkPlaceID`, CAPC:914-916); kullanıcıya göre zorunlu kapsam yok (MX5 §1.8). Kasa/banka select'leri iş yerine göre süzülür; sunucu ödeme kaydında fonun iş yerini **doğrulamaz**.

---

## 2. Eşleme tabloları (`ZTO öğe | Blackrose karşılığı | Karar`)

### 2.1 Ödemeler sayfası + `addPaymentModal` / `editPaymentModal`

| ZTO öğe | Blackrose karşılığı (dosya:satır) | Karar |
|---|---|---|
| Sayfa iskeleti (başlık, breadcrumb, çipler, üst düğmeler) | `BRF/pages/finance/SettlementsPage.tsx:27` (MUI) kalır; yeni `ZtoPaymentsPage` | UI-API |
| Liste `GetPaymentList` (filtre: cari, iş yeri, tarih, yöntem; 30 gün varsayılanı; LIMIT 2000) | `GET /finance/payments` FC:289 (yalnız `Pageable`) | UI+GEN: `accountId`, `branchIds`, `from`, `to`, `method`, `channel`, `fundAccountId`, `status`; yanıt `SettlementListItem` (cari kod/ad, şube + şube grubu adı, fon adı/kind, belge no, çek/senet no, kanal, planId, origin, `createdAt`, `reversible`) |
| Kolon "Muhasebe Tipi" (açıklama etiketlerinden türetme) | Kaynak türü zaten yapısal: `settlement` / `fund_transfer` / plan / kredi (`origin_type` V32) | UI+GEN (türetme yok; liste yalnız settlement gösterir; transferler MX2 ekranında) |
| "Özel tipler" (EFT/Havale/Virman/Döviz Bozum/…) satırlarında düzenle/sil gizli | BR'de bu kayıtlar settlement değil (`fund_transfer`, V29) | UI-API (listeye girmez) |
| Satır linki `/AccountTransaction/Transactions/{id}` | MX1 Transactions ekranı | UI-API |
| `#remainingDebtInfo` (borç/plan paneli) + `GetCustomerDebtSummary` + `GetCustomerCreditSummary` | `GET /finance/accounts/{id}` (FC:142; MX1 GENİŞLET: para birimi bazında borç/alacak/ödeme/tahsilat kırılımı) + `GET /payment-plans?accountId&status=open` | UI+GEN |
| 1 Cari Hesap (+ "+" yeni cari, yenile) | `GET /finance/accounts?search` FC:135; MX1 cari ekle modalı | UI-API |
| 2 Belge / Fatura No | `settlement.document_no` | **UI+TABLO (V2xQ1)** |
| 3 Ödeme Yöntemi: Nakit | `method=CASH` | UI-API |
| 3 Banka Havalesi/Eft | `method=BANK` | UI-API |
| 3 Kredi Kartı | `method=BANK` + `channel=CREDIT_CARD` (fon `account_type='CREDIT_CARD'` V23) | UI+TABLO (V2xQ1 kanal; §7-S4) |
| 3 Çek | `method=CHECK`, `instrument.kind=CHECK` | UI-API (+V24/V25 alanları) |
| 3 Senet | `method=CHECK`, `instrument.kind=NOTE` (`NewInstrument` FD:167) | UI-API (+V24 `note_type`) |
| 3 Diğer | — | ÇIKAR (fon hareketsiz cari kaydı = MX1 cari belge / mahsup V26-V28; §7-S3) |
| 4 Ödeme Tarihi | `SettlementRequest.date` FD:211 | UI-API |
| 5 İş Yeri | `SettlementRequest.branchId` FD:205; seçim `ZtoBranchSelect` (MX5 §4.4 Varyant A) | UI-API |
| 6-12 Çapraz kur (ödeme pb / borç pb / kur / operatör / cariden düşülecek) | — (SS:265 aynı para birimi kuralı) | ÇIKAR (MX3 çatışma #8; §7-S2) |
| 7 Para Birimi, 8 Ödeme Tutarı | `SettlementRequest.money` | UI-API |
| (gizli) Döviz Kuru | `SettlementRequest.exchangeRate` FD:213 (opsiyonel manuel kur; boşsa TCMB) | UI-API — alan ZTO'daki gibi gizli kalır, BR otomatik kur uygular |
| 13a Kasa, 13b Banka (iş yeri + para birimi süzgeçli; `GetCashByWorkPlaceCustomer`/`GetBanksByWorkPlaceCustomer`) | `GET /finance/funds` FC:205 | UI+GEN (`/funds?branchId&kind&currency` — MX2 ile aynı genişletme) |
| 14 Çek Türü (Kendi / Ciro) | `instrument` (yeni) vs `instrumentId` (ciro) — SS:246-255 | UI-API |
| 15 Ciro edilecek çek + özet kartı (`GetEndorsableChecks`: `Portföyde` veya `Tahsil Edildi`+kasa) | `GET /finance/instruments?status=PORTFOLIO` FC:267; `IS.endorse` IS:114 | UI+GEN (`direction=RECEIVED`, `kind`, `custodyFundId` filtresi; "kasada tutulan" = PORTFOLIO + `custody_fund_id` V24) |
| 16 İş Yeri Bankası (çekin çekildiği hesap) | `NewInstrument.fundAccountId` (ISSUED için) | UI+GEN (MX3 M6 ile aynı; V24) |
| 17-19 Koçan, manuel numara, `_CheckLeafGuard` | `check_book` / `check_leaf` | **covered by V25** (MX3 §2.3) |
| 19 Çek no 1–7 hane (APM) vs tam 7 hane (Checks) | tek kural `^\d{7}$` | UI+GEN (04 §7-3, MX3 çatışma #9) |
| 20-22 Banka/Şube adı, keşide, vade, açıklama | `instrument.bank_name`, `due_date`; `issue_date`, `bank_branch`, `description` | covered by V24 |
| 23-25 Senet bölümü (banka, keşideci iş yeri, no, düzenleme/vade, açıklama; tür sabit "Adi Senet") | instrument NOTE + V24 (`note_type`, `issue_date`, `description`); keşideci = settlement şubesinin şirketi (MX5) | covered by V24 |
| 26 Tedarikçi Bahçe Ödemeleri + `gardenPaymentHistoryModal` + `GetSupplierGardens`/`GetGardenPaymentHistory`/`SaveSupplierPaymentShares` | — | ÇIKAR (müstahsil/bahçe; tarım). İsteğe bağlı karşılık: alış faturasına eşleştirme (V2xQ2) |
| 27 Cari Banka Hesabı (açıklamaya IBAN yazar) | `account_bank_account` (V22) + `settlement.counterparty_bank_account_id` | covered by V22 + UI+TABLO (V2xQ1 kolon) |
| 28 Ödeme Açıklaması | `SettlementRequest.description` (500) | UI-API |
| Kaydet `AddPayment` | `POST /finance/payments` FC:296 + `Idempotency-Key` başlığı | UI+GEN (yeni alanlar: `documentNo`, `channel`, `counterpartyBankAccountId`, çek ek alanları, `allocations[]` ops.) |
| Talimat modu (`instructionPlanId`, "Ödemeyi Sonra Kaydet", `CheckInstructionSessionExists`) | `POST /payment-plans/{id}/pay` FC:414 (PPS:192) | UI-API (Session yerine `?planIds=` ve `GET /payment-plans?ids=`, UI+GEN); "Sonra Kaydet" = modalı kapat, plan APPROVED+ordered kalır |
| `AddPayment` içinde cari plan alanlarını sıfırlama | — (BR'de cari düzeyi plan alanı yok; plan ayrı varlık) | ÇIKAR (§3-Ç7) |
| `PaymentPlanHelper.SyncCheckPaymentPlan` (kendi çekinde plan) | — | ÇIKAR (MX3: çek için plan yok, heatmap ISSUED'ları gösterir) |
| `CreditContractsController.PayWithCredit` dalı | — | ÇIKAR (MX3 §2.6) |
| Başarı yanıtındaki `hasRemainingDebt/remainingDebt` | `GET /accounts/{id}` bakiyeleri (para birimi bazında) | UI+GEN (istemci ayrı çağırır) |
| `editPaymentModal` + `UpdatePayment` (yerinde UPDATE) | Yok; düzeltme = ters kayıt + yeni kayıt | **UI+YENİ** `POST /finance/settlements/{id}/correct` (tek tx: `reverse` + `create`, `corrects_settlement_id` V2xQ1); yalnız CASH/BANK, plana bağlı değilse |
| `confirmDeleteModal` + `DeletePayment`/`ConfirmDeletePayment` (fiziksel DELETE) | `POST /finance/settlements/{id}/reverse` FC:323 (SS:142) | UI-API (modal'a "İptal tarihi" + "Gerekçe" eklenir — `ReverseRequest` FD:64) |
| `paymentDetailModal` + `GetPaymentDetail` | — | **UI+YENİ** `GET /finance/settlements/{id}` (settlement + cari/fon hareketleri + instrument + plan + düzeltme zinciri) |
| `checkMatchModal` + `GetMatchingChecks`/`MatchPaymentWithCheck` | — (BR'de çek–ödeme bağı oluşturulurken kurulur) | ÇIKAR (veri onarım aracı; MX3 D3/D4 ile aynı gerekçe) |
| `SaveQuickPaymentPlanning` | `POST /finance/payment-plans` FC:370 (+V33 `planned_fund_account_id`, `priority`, `notes`) | UI-API + covered by V33 |
| Excel / Yazdır | `xlsx` (SheetJS) istemci; `window.print()` | UI-API |
| `Methods.LogAdd` | `audit_log` + `AuditableEntity` | UI-API |

### 2.2 `postPaymentPlanningModal`

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Tetik (kalan borç > 0, grup ≠ Müşteri) | Ödeme sonrası istemci `GET /accounts/{id}` → PAYABLE bakiye > 0 ve `account.type ≠ CUSTOMER` | UI+GEN (MX1 bakiye kırılımı) |
| Kalan borç (para birimine göre) `GetAccountBalancesByCurrency` | `GET /finance/accounts/{id}` `balances[]` | UI-API |
| Mevcut planlar `GetPaymentPlanningDetails` (Manuel + kaynaklı) | `GET /finance/payment-plans?accountId&status=DRAFT,PENDING,APPROVED,REJECTED` | UI+GEN (`accountId`, çoklu `status`) |
| Satır: Tarih*, Tutar*, Para Birimi*, Açıklama | `CreatePlanRequest` FD:262 (`dueDate`, `money`, `description`) | UI-API |
| Satır: Şube* → İş Yeri* | `branchId` (ZTO şube = BR `branch_group`, iş yeri = `branch`; MX5) | UI-API |
| Satır: Banka* | `planned_fund_account_id` | covered by V33 |
| Kaynak kolonu (Manuel/Çek/Kredi; yalnız Manuel düzenlenir) | `source_type` (null = manuel, `CREDIT_INSTALLMENT`) | covered by V33 |
| Satır silme (`cancelledPlanIds`) | `POST /payment-plans/{id}/cancel` FC:401 | UI-API |
| Kaydet `CustomerAccounts.SavePaymentPlanning` (toplu) | istemci döngüsü `POST /payment-plans` + `cancel` (PlansPage.tsx:87 deseni) | UI-API |
| "Daha Sonra Yaparım" | modal kapanır | UI-API |

### 2.3 Tahsilatlar sayfası + `addCollectionModal` / `editCollectionModal`

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Liste `GetCollectionList` (+ Hesap Grubu filtresi) | `GET /finance/collections` FC:306 | UI+GEN (Payments ile aynı filtreler + `accountType`/`subGroup` — V22 `sub_group`) |
| Kolon "Döviz Bozum" (`ExchangeStatus`, `RemainingExchangeAmount`) + "Boz" linki | hesaplanan Σ `fund_transfer_source.used_amount` | covered by V29 (MX2 C10); UI+GEN: `SettlementListItem.fxConverted/fxRemaining`; link MX2 transfer merkezi `?tab=exchange&sourceSettlementId=` |
| Düzenle/Sil yalnız `exchangeStatus='Bekliyor'` | `reverse`/`correct` bozuma kaynak olmuş tahsilatta 409 | UI+GEN (SS kuralı: `SETTLEMENT_USED_IN_FX`) |
| 1-5 Cari, Yöntem, Belge No, Tarih, İş Yeri | §2.1 ile aynı (`COLLECTION`) | UI-API / V2xQ1 |
| 6 Para Birimi ("banka/kasa para birimidir") | `money.currency` = fon para birimi (SS:265) | UI-API |
| 7 Çapraz kur tahsilat | — | ÇIKAR (§7-S2) |
| 8 Banka, 9 Kasa | `fundAccountId` | UI+GEN (`/funds` filtreleri) |
| 13 Çek Durumu **Bankaya Yatırıldı** (+ 10 Çekin Yatırıldığı Banka) | `register` PORTFOLIO → aynı tx'te `AT_BANK` geçişi (`instrument.fund_account_id` = banka); **fon hareketi yok**, para `AT_BANK→COLLECTED` geçişinde girer (IS:34-46) | UI+GEN (`NewInstrument.initialStatus`, `fundAccountId`; §3-Ç3) |
| 13 Çek Durumu **Portföyde (Elde)** (+ 11 Çekin Tutulduğu Kasa) | PORTFOLIO + `custody_fund_id` | covered by V24 |
| 13 Çek Durumu **Kasaya Al (Ciro)** (para hareketsiz "Tahsil Edildi") | PORTFOLIO + `custody_fund_id` (MX3 çatışma #5) | covered by V24 |
| 14-15 Müşteri çeki no / banka / şube / keşide / vade / açıklama | `NewInstrument` + V24 (`drawer_account_id` = tahsilat carisi) | covered by V24 |
| Lehdar = iş yerinin "İş Yeri Firması" carisi (CACC:756-780) | lehdar = firma (şirket); `instrument.branch_id` (MX5 company) | ÇIKAR (cari olarak tutulmaz) |
| 12, 16 Senet tahsilatı (`BillStatus='Tahsil Edildi'`) | NOTE RECEIVED **PORTFOLIO** | UI-API (+V24) (§3-Ç4) |
| 17-19 Tutar, Döviz Kuru (opsiyonel), Cariden düşülecek | `money`, `exchangeRate` | UI-API (çapraz kur hariç) |
| 20 Cari Banka Hesabı | `counterparty_bank_account_id` | V22 + V2xQ1 |
| 21 Sipariş Tahsisi (`GetCustomerOrders`, `orderAllocationsJson`, `ZT_AccountCollectionOrders`) | Açık kalem: `freight_invoice` (MIG/V7:126), `warehouse_invoice` (MIG/V8:159), `opening_invoice` kind=RECEIVABLE (MIG/V21:3) | **UI+TABLO (V2xQ2, opsiyonel; §7-S1)** — bölüm adı "Fatura Eşleştirme (Opsiyonel)", kolonlar: Fatura No · Tür (Navlun/Depo/Açılış) · Vade · Toplam · Eşleşen · Kalan · Eşleştirilecek Tutar; kural ZTO ile aynı (aynı para birimi, kalan ve toplam tahsilatı aşamaz) |
| Sunucudaki koçan dalı (tahsilatta `checkBookId`, CACC:783-900) | — | ÇIKAR (istemci göndermiyor; ölü kod) |
| `editCollectionModal` + `GetCollectionForUpdate` + `UpdateCollection` (çek/senet fiziksel DELETE + yeniden oluşturma, tahsis sil-yaz) | CASH/BANK: `POST /settlements/{id}/correct`; CHECK: finansal alan değişmez → instrument PATCH (MX3 V24 finansal olmayan alanlar) veya iptal + yeni tahsilat | UI+YENİ (§3-Ç5) |
| `#editRemainingCreditInfo` / `GetCustomerCreditSummary` / `GetCustomerCreditDetails` / `…Simple` / `GetAvailableCurrenciesForCollection` / `GetCustomerCurrency` | `GET /finance/accounts/{id}` (MX1 kırılım) | UI+GEN |
| `confirmDeleteModal` + `ConfirmDeleteCollection` (fiziksel DELETE, çek `Bekliyor`) | `reverse`; CHECK için: instrument hâlâ PORTFOLIO ve başka hareketi yoksa settlement reverse + instrument `CANCELLED` (V24) | UI+GEN (SS:153 kuralı gevşetilir; §3-Ç6) |
| `collectionDetailModal` + `GetCollectionDetail` | `GET /finance/settlements/{id}` | UI+YENİ (ortak) |
| `GetCustomerBankAccounts` | `GET /finance/accounts/{id}/bank-accounts` | covered by V22 (MX1/MX2 uç) |
| `PaymentPlanHelper` çağrıları (çek planı senkronu/iptali) | — | ÇIKAR |

### 2.4 Günlük raporlar (DPR + DCR + `dailyPaymentReportModal` / `dailyCollectionReportModal`)

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Modal: Rapor Tarihi + İş Yeri çoklu seçim (dpr/dcr) | `ZtoBranchMultiSelect variant="list"` (MX5 §5.2) + `GET /finance/reports/daily?type&date&branchIds` FC:330 | UI-API (bileşen MX5) |
| Rapor sayfası (iki ayrı view) | Tek `ZtoDailySettlementReportPage` (`type=PAYMENT|COLLECTION` başlık/metin farkı) | UI+GEN |
| Filtreler Banka/Kasa, Para Birimi, Yöntem, Sıralama | `fundAccountIds`, `currency`, `method`, `sort=createdAt,asc|desc` | UI+GEN (SS:173 sorgusu genişletilir) |
| Satır alanları (oluşturma saati, cari kod/ad/grup, belge no, yöntem, kaynak = banka(şube)/kasa, tutar, açıklama, iş yeri/şube adı) | `DailyReportResponse.rows` = `SettlementResponse` FD:215 (ad/saat/belge no yok) | UI+GEN: satır tipi `SettlementListItem` (createdAt, accountCode/Name/type, branchName/groupName, fundName/kind, documentNo, instrumentNumber, channel) |
| Gruplu/Düz görünüm, aç/kapa, rapor içi arama, özet kartları (iş yeri/banka-kasa/yöntem/para birimi, ilk 10), istatistik kutuları | istemcide `rows` üzerinden | UI-API |
| Rapor tarih esası: çekli kayıtta banka hareket tarihi | BR: settlement tarihi = çekin verildiği/alındığı gün; bankaya yansıma ayrı bölüm (aşağıda) | UI+GEN (ZTO'nun karışık esası taşınmaz) |
| "İş Yerleri Arası Transferler" bölümü (İş Yeri Firması carisi) | `account.represents_branch_id IS NOT NULL` (V22) → `intercompany=true` bayrağı | UI+GEN (V22'ye bağlı) |
| "Kredi Ödemeleri" (`IsCreditBankAccount`) | `account.type=BANK` veya `settlement.origin_type='CREDIT_MOVEMENT'` (V32) → `credit=true` | UI+GEN |
| "Diğer (Yöntem)" (genel toplama dahil değil) | — | ÇIKAR (yöntem yok) |
| `totals` (şube × para birimi) | `DailyTotal` FD:230 | UI-API (+ fon bazlı toplam istemcide) |
| "Özet Bakiye Bilgisi" (gün sonu vs güncel bakiye, banka + kasa) | `FundLedgerService` bakiyesi tarihe göre | UI+GEN: yanıta `fundBalances[{fundAccountId, name, kind, currency, balanceAtDate, balanceNow}]` (raporda geçen fonlar) |
| "Banka Hareketine Yansıyan Çek Özeti" | `instrument_movement` (COLLECTED/PAID, `fund_account_id` V24) o gün → `fund_transaction(source_type='INSTRUMENT')` | UI+GEN: yanıta `instrumentFundMovements[]` (iş yeri, fon, adet, toplam) |
| "Ödeme/Tahsilat Tarihine Göre Yazılan Çekler" | `rows` içinde `method=CHECK` | UI-API (istemci süzgeci) |
| Yazdır | `window.print()` + print CSS | UI-API |

### 2.5 PaymentApproval/Index ↔ BR PaymentPlan

Durum eşlemesi (MX3 §2.7 + V33):

| ZTO `ApprovalStatus` (sekme) | BR | Not |
|---|---|---|
| Beklemede / NULL / '' (`awaiting`) | DRAFT | |
| Onay Bekliyor (`pending`) | PENDING | |
| Onaylandı (`approved`) | APPROVED ∧ `ordered_at IS NULL` | |
| Reddedildi (`rejected`) | REJECTED (`reject_note` MIG/V17) | |
| Talimat Verildi (`ordered`) — `PaymentStatus='İşlemde'` | APPROVED ∧ `ordered_at IS NOT NULL` (V33) | durum makinesi değişmez |
| Tamamlandı (`completed`) | PAID (yalnız `PPS.pay` ile, settlement oluşur) | §6.1-K1 |
| (Payment `İptal`) | CANCELLED | |

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sayfa + sekmeler + sayaçlar | `GET /finance/payment-plans` FC:363 (yalnız `status`) | **UI+YENİ** `GET /finance/payment-plans/approval-board?tab&from&to&branchIds&fundAccountIds&sourceType&accountIds` → `{counts{awaiting,pending,approved,rejected,ordered,completed}, funds:[{fund, balance, dates:[{date, total, overdue, plans[]}]}]}`; tarih sayfalaması `datesOffset` |
| Varsayılan tarih −3 ay / +9 ay | istemci varsayılanı | UI-API |
| Şube → İş Yeri → Banka cascade | `ZtoBranchSelect` + `/funds?branchId` (MX5) | UI-API |
| Kaynak filtresi (Manuel / Talimatlı Plan) | `source_type` null / `PAYMENT_INSTRUCTION` | covered by V33 |
| Cari çoklu seçim | `accountIds` | UI+GEN |
| Listeleme kuralı "PaymentBankID IS NOT NULL" | `planned_fund_account_id IS NOT NULL`; fonsuz planlar "Banka atanmamış" grubunda | covered by V33 (UI+GEN: grup) |
| Banka kartı bakiyesi | fon bakiyesi (`FundLedgerService`) | UI+GEN (board yanıtında) |
| Satır kolonları: alıcı hesap adı/banka/şube/IBAN | `counterparty_bank_account_id` → `account_bank_account` | covered by V33 + V22 |
| Satır: Onaya Gönder | `POST /payment-plans/{id}/submit` FC:383 | UI-API |
| Satır: Onayla (`notesModal`, not opsiyonel) | `POST /payment-plans/{id}/approve` FC:389 (`PlanNoteRequest`) — dört göz PPS:314 | UI-API |
| Satır: Reddet (`notesModal`, not **opsiyonel**) | `POST /payment-plans/{id}/reject` FC:395 — gerekçe **zorunlu** PPS:144 | UI-API (modal reddet modunda `required`) |
| Toplu Onaya Gönder | `POST /payment-plans/submit` {ids} + `batch_code` | covered by V33 (MX3 §4 uç) |
| Toplu Onayla / Reddet | istemci döngüsü (mevcut desen `BRF/pages/finance/PlansPage.tsx:87-100`, kısmi başarı raporu) | UI-API |
| Bekleyene Al (Reddedildi → Onay Bekliyor) | `submit` (REJECTED→PENDING, PPS:121-131) | UI-API |
| Reddedilenden doğrudan Onayla (PAC:906) | Yok: `submit` + `approve` iki adım; dört göz geçerli | UI-API (§3-Ç9) |
| Bankaya Talimat Ver + `orderDetailModal` (ödeme tarihi*, alıcı IBAN* seç/manuel, alıcı ad/banka/şube, açıklama*; bakiye/talimat toplamı/kalan kartı) | `POST /payment-plans/order` {items:[{planId, payDate, counterpartyBankAccountId \| iban+receiverName+bank+branch, description}]} → `ordered_at/by`, `payment_instruction` | covered by V33 + **UI+YENİ** uç |
| `instructionProcessModal` seçenek 1 (Excel → ödeme kayıt ekranı) | Excel + `ZtoPayPlansModal` (aşağıda) | UI-API |
| `instructionProcessModal` seçenek 2 (Excel → ekstre bekle) | plan APPROVED+ordered kalır; ekstre gelince "Ödemeyi Kaydet"; mutabakat `POST /integration/bank/lines/{id}/match` (`BRJ/integration/web/IntegrationController.java:399`) | UI-API (§7-S5) |
| "Tamamla" (`BulkCompleteInstructions` — ödemesiz durum) | — | ÇIKAR (K1: ödeme kaydı olmadan PAID olmaz) |
| "Ödemeyi Kaydet" (tek banka, Session → BankTransactions → her satır `addPaymentModal`) | **`ZtoPayPlansModal`**: seçili planlar + zorunlu banka/kasa select'i (vars. `planned_fund_account_id`) + tarih → döngü `POST /payment-plans/{id}/pay` FC:414 | UI-API (§6.1-K1) |
| `UpdateInstructionStatusToCompleted` (BankTransactions'tan) | `pay` | UI-API |
| `GetBankAccountsByReference` (cari IBAN'ları) | `GET /accounts/{id}/bank-accounts` | covered by V22 |
| `GetInstructionDetails` + Session `PendingInstructionData` | `GET /payment-plans?ids=` | UI+GEN |
| Excel (10 kolon) | SheetJS istemci | UI-API |
| `confirmModal` | ortak `ZtoConfirmModal` | UI-API |
| Isı haritası / yoğunluk (bu ekranda yok) | mevcut `GET /payment-plans/heatmap` FC:420 MX3/§6.1-K4 ile ayrı ekran | — (eklenmez; birebir görünüm) |
| `PaymentPlanHelper` | — | ÇIKAR (§1.13) |

### 2.6 `/CustomerCurrentAccounts/Index`

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sayfa (Müşteri carileri × para birimi; Borç/Alacak/Ödeme/Tahsilat/Net) | MX1 `ZtoCustomerAccountsPage` liste + bakiye kolonları (`GET /accounts?type=CUSTOMER`) | ÇIKAR (satış paneli; MX1 listesinde "Müşteri" önayar filtresi yeterli) |
| "Durum" (PlanningStatus) + GET'te UPDATE | `payment_plan` dashboard / MX1 plan rozeti (hesaplanan) | ÇIKAR |
| `transactionsModal` (TransactionsPartial) | MX1 ekstre bileşeni (modal içinde) | (MX1'de) |
| `salesPartiesModal` + `GetCustomerOrders` | — (lojistikte karşılığı müşterinin seferleri/navlun faturaları — `shipment` modülü ekranı) | ÇIKAR |
| Satış menüsü, `ZT_SalesPerson`, "Sipariş İşlemleri" kısıtı | — | ÇIKAR |

---

## 3. Davranış çatışmaları ve çözüm (BR kuralı kazanır)

| # | Çatışma | ZTO kanıtı | BR kanıtı | Çözüm |
|---|---|---|---|---|
| Ç1 | Fiziksel DELETE + bağlı banka/kasa hareketini `Status=false` | CAPC:2993-3029; CACC:3695-3736 | `SS.reverse` SS:142 (ters kayıt, `REVERSED`) | BR; "Sil" düğmesi aynı, arkada `reverse` + tarih/gerekçe |
| Ç2 | Yerinde düzenleme (tutar, banka, tarih) | `UpdatePayment` CAPC:2234, :2439…; `UpdateCollection` CACC:2882 | defter satırları değişmez | `correct` = reverse + yeni (tek tx), `corrects_settlement_id` ile zincir |
| Ç3 | Tahsilat çeki "Bankaya Yatırıldı" → anında banka Girişi | CACC:947-960, :1077-1090 | AT_BANK'ta fon yok, COLLECTED'da fon IN (IS:34-46) | BR; vadede "Tahsil Edildi" geçişiyle para girer. Ekranda radio aynı, açıklama metni "tahsil anında banka hesabına GİRİŞ işlenir" zaten BR davranışını anlatıyor |
| Ç4 | Senet ödemede `Ödendi`, tahsilatta `Tahsil Edildi` başlangıç durumu | CAPC:1593; CACC:1097 | NOTE ISSUED / PORTFOLIO | BR; vadede MX3 senet geçişleri |
| Ç5 | Çekli tahsilat düzenlenebiliyor (çek sil-yeniden oluştur) | CACC:2681-2861, cjs:3776 | `SETTLEMENT_CHECK_NOT_REVERSIBLE` SS:153 | Finansal olmayan alanlar instrument PATCH (MX3); finansal değişiklik = iptal + yeni |
| Ç6 | Çekli tahsilat silinince çek `Bekliyor` | CACC:3751-3757 | çek yaşam döngüsü | Yalnız instrument PORTFOLIO ve tek hareketliyse: settlement reverse + instrument CANCELLED (V24) aynı tx; aksi halde 409 "Çek işlem görmüş" |
| Ç7 | Her ödemede cari plan alanları sıfırlanır | CAPC:1852-1868 | plan ayrı varlık, ödemeden bağımsız | BR; post-payment modal açık planları gösterir, kullanıcı iptal/öde seçer |
| Ç8 | Dört göz yok, rol ayrımı yok | PAC:583-600, :885-906 | `ensureApproverAllowed` PPS:314; `FINANCE_APPROVE` FC:90 | BR; ekranda "kendi planınızı onaylayamazsınız" mesajı (MX3 #13) |
| Ç9 | Reddedilen doğrudan onaylanır | PAC:906 | REJECTED → yalnız `submit` | İki adım (submit + approve), olay geçmişi korunur |
| Ç10 | Red notu opsiyonel | PAV:1452 | zorunlu PPS:144 | BR; `notesModal` reddet modunda `required` |
| Ç11 | Talimat "Tamamlandı" ödemesiz | PAC:1318-1345 | PAID yalnız `pay` ile | BR (K1) |
| Ç12 | Çapraz kur | CAPC:1123-1145, :1656-1700 | SS:265 | ÇIKAR (§7-S2) |
| Ç13 | "Diğer" yöntem (fon hareketsiz cari) | CAPC:1880 (koşul dışı) | SS:239-243 yalnız CASH/BANK/CHECK | ÇIKAR (§7-S3) |
| Ç14 | Ödemede FX kuru 1 | APM:433-459 yorum; pjs submit `|| 1` | `ExchangeRateService` TCMB | BR otomatik kur |
| Ç15 | Fonun iş yeri ↔ kayıt iş yeri doğrulanmaz | CAPC (istemci süzgeci) | `settlement.branch_id` ↔ fon şubesi kuralı yok (MX5 §2.6) | UI+GEN: SS.validate'e kural — fonun şirketi = settlement şubesinin şirketi (MX5 V22c'den sonra); aynı şirket içinde farklı şube serbest |
| Ç16 | Rol eşlemesi: Muhasebe (Alış) ve Satış Personeli ödeme yazabilir/onaylayabilir | CAPC:16, PAC:14 | ACCOUNTING yalnız `FINANCE_VIEW`, SALES finans yok (MIG/V2:109-122) | BR izin matrisi; ihtiyaç varsa kiracı yöneticisi rolü genişletir. Patron/Admin/Finans(super) → FINANCE_SUPER; Finans(normal) → FINANCE (onay yok) |
| Ç17 | İş yeri kapsamı yok | MX5 §1.8 | `user_branch` (MX5 V22e) | BR; liste/rapor/board uçları kapsamı sunucuda uygular |
| Ç18 | Belge no serbest metin, tekillik yok | CAPC:1707 | — | V2xQ1 `document_no` serbest (tekillik zorlanmaz, ZTO gibi); otomatik makbuz no **eklenmez** |
| Ç19 | Ciro tutarı farklıysa çek tutarına zorlanır | CAPC:1210-1211 | `INSTRUMENT_AMOUNT_MISMATCH` IS:118-123 | Aynı sonuç; UI tutarı kilitler (ZTO gibi), sunucu reddeder |
| Ç20 | Tahsilat düzenleme/silme yalnız bozum `Bekliyor` iken | cjs:3778 | — | UI+GEN: SS'de bozuma kaynak olmuş tahsilat reverse/correct 409 |
| Ç21 | Senet "keşideci iş yeri" ayrı select (`BillWorkPlaceID`) | APM:962 | instrument.branch = settlement.branch | Select kaldırılmaz (görünüm birebir) ama değeri `branchId`'ye kilitli/salt okunur gösterilir |

---

## 4. Gerekli backend eklemeleri

### 4.1 Migration'lar (numara koordinatörde; 04 §4 V22–V34 ile çakışma kontrolü)

**Zaten kapsananlar (yeni migration gerekmez):** cari IBAN `account_bank_account`, `account.represents_branch_id`, `sub_group` → **covered by V22** · fon `account_type` (CREDIT_CARD dahil) → **V23** · çek/senet ek alanları, `custody_fund_id`, CANCELLED/RETURNED → **V24** · koçan/yaprak → **V25** · cari belge/mahsup ("Diğer" yerine) → **V26** · döviz bozum kaynağı → **V29** · kredi + `settlement.origin_type/origin_id` + `credit_contract.bank_account_id` → **V32** · plan `planned_fund_account_id`, `source_type/source_id`, `priority`, `notes`, `batch_code`, `ordered_at/by`, `instruction_id`, `counterparty_bank_account_id`, `payment_instruction` → **V33** · şube kapsamı → MX5 V22e.

**V2xQ1 `settlement_details`** (V22'den sonra; V33'ten bağımsız)
```sql
ALTER TABLE settlement
  ADD COLUMN document_no                  VARCHAR(50),
  ADD COLUMN channel                      VARCHAR(20),          -- TRANSFER / CREDIT_CARD (method=BANK); null = CASH/CHECK
  ADD COLUMN counterparty_bank_account_id UUID REFERENCES account_bank_account (id),
  ADD COLUMN corrects_settlement_id       UUID REFERENCES settlement (id),
  ADD COLUMN reverse_reason               VARCHAR(500);
ALTER TABLE settlement ADD CONSTRAINT settlement_channel_chk
  CHECK (channel IS NULL OR (method = 'BANK' AND channel IN ('TRANSFER','CREDIT_CARD')));
CREATE INDEX settlement_account_date_idx ON settlement (account_id, settlement_date DESC) WHERE deleted = FALSE;
CREATE INDEX settlement_type_fund_date_idx ON settlement (type, fund_account_id, settlement_date) WHERE deleted = FALSE;
CREATE INDEX settlement_document_no_idx ON settlement (document_no) WHERE document_no IS NOT NULL;
```
Java: `Settlement` + alanlar; `SettlementRequest` + `documentNo @Size(max=50)`, `channel`, `counterpartyBankAccountId`; `SettlementResponse`/`SettlementListItem`.

**V2xQ2 `settlement_allocation`** (opsiyonel — §7-S1 kararına bağlı)
```sql
CREATE TABLE settlement_allocation (
  id            UUID PRIMARY KEY,
  settlement_id UUID           NOT NULL REFERENCES settlement (id),
  target_type   VARCHAR(30)    NOT NULL,   -- FREIGHT_INVOICE / WAREHOUSE_INVOICE / OPENING_INVOICE / PURCHASE_INVOICE
  target_id     UUID           NOT NULL,
  amount        NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
  currency      CHAR(3)        NOT NULL,
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX settlement_allocation_target_idx ON settlement_allocation (target_type, target_id) WHERE deleted = FALSE;
CREATE INDEX settlement_allocation_settlement_idx ON settlement_allocation (settlement_id);
```
Kurallar (servis, `SS.create` ile aynı tx): COLLECTION → FREIGHT/WAREHOUSE/OPENING(RECEIVABLE); PAYMENT → PURCHASE/OPENING(PAYABLE); hedefin carisi ve para birimi settlement ile aynı; Σ ≤ settlement tutarı; hedef kalanı aşılamaz (kalan = toplam − Σ aktif eşleşme); settlement `REVERSED` olunca eşleşmeler `deleted=true`. Yaşlandırma (`FinanceRepositories.java:209-242`, FIFO) **değişmez**.

Admin şeması: değişiklik yok. İzin: yeni izin yok.

### 4.2 Uçlar

| Uç | Durum | Ayrıntı |
|---|---|---|
| `GET /finance/payments`, `/collections` | GENİŞLET | filtreler `accountId, accountType, subGroup, branchIds, fundAccountId, method, channel, from, to, status`; filtre yoksa son 30 gün; yanıt `PageResponse<SettlementListItem>`; kapsam süzgeci (MX5) |
| `POST /finance/payments`, `/collections` | GENİŞLET | V2xQ1 alanları; `instrument` + V24 alanları + `initialStatus` (`PORTFOLIO`/`AT_BANK`) + `fundAccountId` (ISSUED'de çekilen hesap, AT_BANK'ta banka) + `custodyFundId`; `allocations[]` (V2xQ2) |
| `GET /finance/settlements/{id}` | YENİ | detay: settlement + cari/fon satırları + instrument + plan + eşleşmeler + düzeltme zinciri |
| `POST /finance/settlements/{id}/correct` | YENİ | `{date, reason, newRequest}`; CASH/BANK, planId null, bozuma kaynak değil; reverse + create tek tx |
| `POST /finance/settlements/{id}/reverse` | GENİŞLET | `reverse_reason`; CHECK istisnası (Ç6); bozum kontrolü (Ç20) |
| `GET /finance/reports/daily` | GENİŞLET | `fundAccountIds, currency, method, sort`; satırlar `SettlementListItem`; `+ fundBalances[]`, `+ instrumentFundMovements[]`, satır bayrakları `intercompany`, `credit` |
| `GET /finance/funds` | GENİŞLET | `branchId, kind, currency` (MX2 ile ortak) |
| `GET /finance/instruments` | GENİŞLET | `direction, kind, custodyFundId` (MX3 ile ortak) |
| `GET /finance/payment-plans` | GENİŞLET | `accountId, accountIds, status (çoklu), ids, plannedFundAccountId, sourceType, from, to, ordered` |
| `GET /finance/payment-plans/approval-board` | YENİ | §2.5 hiyerarşi + sayaçlar + fon bakiyeleri |
| `POST /finance/payment-plans/submit` | (V33/MX3) | toplu, `batch_code` |
| `POST /finance/payment-plans/order` | YENİ | toplu talimat; `ordered_at/by`, alıcı IBAN, `payment_instruction` (V33) |
| `GET /finance/open-items?accountId&currency&direction` | YENİ (V2xQ2'ye bağlı) | açık navlun/depo/açılış/alış faturaları + eşleşen/kalan |

### 4.3 React bileşenleri (`.zto-finans` kapsamında, ZTO markup'ı birebir)

| Bileşen | ZTO karşılığı | Not |
|---|---|---|
| `ZtoPaymentsPage` | PAY | DataTables HTML'i `@tanstack/react-table` ile (04 §2) |
| `ZtoCollectionsPage` | COL | + "Döviz Bozum" kolonu |
| `ZtoAddPaymentModal` (+ `mode="edit"` → `ZtoEditPaymentModal`) | APM / EPM | Ortak alt bileşenler: `ZtoCheckFields` (kendi/ciro, koçan, `useCheckLeafGuard` — MX3), `ZtoNoteFields`, `ZtoFundSelect`, `ZtoCounterpartyIbanSelect`, `ZtoRemainingDebtPanel`; bahçe ve çapraz kur bölümleri **render edilmez**; "Diğer" seçeneği listeden çıkar. Props `presetFundAccountId`, `presetMethod`, `planIds` (BankTransactions/CashTransactions/Checks/Bills/PaymentApproval'dan açılış) — **tek bileşen, üç JS kopyasının yerine** |
| `ZtoAddCollectionModal` (+ edit modu) | CMP:47 / :854 | `ZtoCheckFields variant="received"` (Bankaya Yatırıldı / Portföyde / Kasaya Al), `ZtoInvoiceAllocationTable` (V2xQ2 seçilirse; aksi halde bölüm gizli) |
| `ZtoPostPaymentPlanningModal` | PPM | satır cascade = `ZtoBranchSelect` + fon select |
| `ZtoSettlementDetailModal` | `paymentDetailModal` / `collectionDetailModal` | |
| `ZtoReverseConfirmModal` | `confirmDeleteModal` (iki kopya) | + iptal tarihi, gerekçe |
| `ZtoDailyReportModal` + `ZtoDailySettlementReportPage` | dpr/dcr modal + DPR/DCR | `ZtoBranchMultiSelect` (MX5) |
| `ZtoPaymentApprovalPage` | PAV | sekmeler, filtreler, fon→tarih→satır ağacı, üç seviyeli seçim, "daha fazla tarih" |
| `ZtoPlanNotesModal` | `notesModal` | reddet modunda gerekçe zorunlu |
| `ZtoBankOrderModal` | `orderDetailModal` | bakiye/talimat/kalan kartı, IBAN seç/manuel |
| `ZtoInstructionProcessModal` | `instructionProcessModal` | iki seçenek |
| `ZtoPayPlansModal` (yeni, ZTO stilinde) | — (K1) | zorunlu banka/kasa select'i + tarih; döngü `pay` |
| `ZtoConfirmModal` | `confirmModal` | ortak |

---

## 5. `SQL/KrediBankaCari_Migration.sql` — ne yapıyor, MX3'te karşılığı

| Betik adımı (satır) | Etki | BR karşılığı | Durum |
|---|---|---|---|
| `ZT_CustomerAccounts.IsCreditBankAccount boolean NOT NULL DEFAULT false` (:11-12) — "yalnız Masraf Hesabı grubundaki cariler için true" | Kredi banka carisi işareti | `account.type = BANK` (FinanceTypes `AccountType.BANK`; 04 §3.1 "Kredi banka hesabı → BANK") | Karşılanıyor (ek kolon yok) |
| `ZT_CreditContracts.BankCustomerAccountID integer` (:15-16) | Kredi ↔ banka carisi | `credit_contract.bank_account_id UUID REFERENCES account (id)` (MX3 V24→**04 V32**) | Karşılanıyor |
| `ZT_AccountPayments.CreditInstallmentID` (:20-21) | Taksit ödemesi bağı (açıklama etiketi yerine) | `credit_movement.installment_id` + `settlement.origin_type='CREDIT_MOVEMENT'`, `origin_id` (V32) | Karşılanıyor |
| `ZT_AccountPayments.CreditContractID` (:25-26) | Kredi ödemesi bağı (silmede temizlik) | `credit_movement.contract_id` + `origin_*`; iptal `SS.reverse` origin istisnası (MX3 §4) | Karşılanıyor |
| 4 kısmi/normal index (:29-45) | performans | `settlement_origin_idx` (V32) | Karşılanıyor |
| Açıklamadaki `[KrediID:x] [TaksitID:x]` etiketlerini kolona taşı + temizle (:49-67) | tek seferlik veri düzeltme | — | ÇIKAR (veri göçü aracı; Faz 2 göç betiğinde, BR'de etiket hiç yazılmaz) |
| Toplu backfill: aktif ve banka carisine bağlı her kredi için `ZT_AccountDebts` açılış borcu (`AccountingType='Kredi'`, `DocumentType='Kredi Sözleşmesi'`; tutar = rotatifte `UsedAmount`, diğerlerinde `Principal − Σ PaidPrincipal`; `ExchangeRate=1`; `NOT EXISTS` ile idempotent) (:86-143) | Banka carisinde kalan anapara borcu | Yeni kredi: kullandırımda COLLECTION BANK settlement (cari CREDIT = bankaya borç) (MX3 §4 defter akışı). **Mevcut krediler**: göçte `OpeningBalanceImportService` (`SOURCE_OPENING`, `BRJ/finance/service/OpeningBalanceImportService.java:48`) ile banka carisine açılış + `credit_contract.used_amount`; `ExchangeRate=1` hatası taşınmaz (açılış günü kuru) | Karşılanıyor (göç adımı olarak not edilmeli: Faz 2) |

Sonuç: betik MX3 kredi tasarımına (04 V32) **tamamen yansımış**; ek migration gerekmez. Tek eksik not: geçmiş kredilerin açılış borcu göç planına (Faz 2 / `OpeningBalanceImportService`) açıkça yazılmalı. Betikteki "yalnız Masraf Hesabı grubundaki cariler" kısıtı BR'de yok (tür BANK yeterli).

---

## 6. ZTO hataları (birebir kopyalanmaz)

| # | Hata | Kanıt |
|---|---|---|
| B1 | Ödeme sonrası "kalan borç" tüm para birimlerini toplar, alacak/tahsilatı yok sayar (`SUM(Debts) − SUM(Payments)`) → yanlış planlama modalı tetiği | CAPC:1803-1846 |
| B2 | Ödeme modalında Döviz Kuru alanı yorum satırında → döviz ödemeleri `ExchangeRate=1` ile yazılır | APM:433-459; pjs `submitPayment` `exchangeRate … || 1` |
| B3 | `UpdatePayment` transaction'sız; banka/kasa hareketleri yerinde UPDATE, kayıt yoksa yeni INSERT | CAPC:2160-2610 (BeginTransaction yok), :2425-2566 |
| B4 | `ConfirmDeletePayment` banka/kasa hareketini yalnız `ReferenceID` ile pasifler (`AccountingType` filtresi yok) → başka kaynağın aynı ReferenceID'li hareketi de kapanabilir; ödeme fiziksel DELETE; çek/senet geri alma kodu yorum satırı | CAPC:2993-3015, :3029, :3040-3080 |
| B5 | Tahsilat çeki "Bankaya Yatırıldı" seçilince vade beklenmeden banka Girişi | CACC:947-960, :1077-1090 |
| B6 | Senet ödemede `Ödendi`, tahsilatta `Tahsil Edildi` olarak doğar | CAPC:1593; CACC:1097 |
| B7 | Tahsilat silmede çek/senet `Bekliyor` durumuna alınır (durum listesinde yok) | CACC:3751-3780 |
| B8 | Tahsilat controller'ında hiçbir POST'ta antiforgery yok | CACC (grep 0) |
| B9 | "Muhasebe Tipi" açıklama metnindeki `[EFT]`, `DÖVİZ BOZUM` vb. etiketlerden `ILIKE` ile türetilir | CAPC:876-889; CACC:466 |
| B10 | Ölü kod / kırık bağlar: PAY:596 `@if (false)` içinde eski `addPaymentModal` (aynı id); tahsilatta koçan dalı istemcisiz (CACC:783-900); `Url.Action("GetAvailableCheckBooks","CustomerAccountCollection")` hedefsiz (COL:586); `urls.getCustomerCurrency` tanımsız (cjs:2082) | |
| B11 | `EPM` çek/senet alan id'leri APM ile aynı (`CheckBankID`, `CheckNumber`, `BillNumber` …) — iki modal aynı sayfada DOM çakışması; `ExchangeRate` id'si de öneksiz | EPM:436, :807-1035 |
| B12 | `cashtransactionspayments.js:6294` `#postPaymentPlanningModal` açar ama CashTransactions sayfası partial'ı içermez | `Views/CashTransactions/Index.cshtml:487-490` |
| B13 | PaymentApproval: reddedilen doğrudan onaylanır; dört göz ve rol ayrımı yok; "Tamamla" ödeme kaydı oluşturmaz | PAC:906, :583-600, :1318-1345 |
| B14 | CustomerCurrentAccounts GET içinde toplu UPDATE (denetim bastırılarak); `restrictionQuery + userRoleID` string birleştirme | CCAC:158, :397-430, :152 |
| B15 | View içinde doğrudan Npgsql (`ZT_Setting`) | APM:1-30, EPM:1-30, CMP:1-14 |
| B16 | `MatchPaymentWithCheck` doğrulamasız, transaction'sız `CheckID` UPDATE | CAPC:4714-4746 |
| B17 | Her ödeme cari plan alanlarını (onay bilgileri dahil) siler | CAPC:1852-1868 |
| B18 | Kredi Kartı ödemesi banka havalesiyle aynı kaydedilir (kart borcu izlenmez) | CAPC:1880-1900 |
| B19 | Rapor tarih esası karışık (çekte banka hareket tarihi, diğerlerinde ödeme/oluşturma tarihi) | CAPC:3312-3340 |
| B20 | `GetPaymentList` `LIMIT 2000`, sayfalama yok | CAPC:960 |

---

## 7. Kullanıcıya açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| S1 | Tahsilat modalındaki "Sipariş Tahsisi" lojistikte ne olsun? | (a) ÇIKAR — yaşlandırma FIFO, fatura bazlı eşleştirme yok · (b) "Fatura Eşleştirme (Opsiyonel)": navlun/depo/açılış faturasına bilgi amaçlı eşleştirme (V2xQ2), fatura ekranlarında "ödenen/kalan", yaşlandırma FIFO kalır | **(b)** — ZTO bölümü birebir görünümle kalır, e-fatura takibinde işe yarar; muhasebe sonucu değişmez |
| S2 | Çapraz kur ödeme/tahsilat (USD borcunu TL ile kapatma) | (a) ÇIKAR (MX3 #8): ödeme fon para biriminde yazılır, cari o para biriminde etkilenir · (b) ileride "cari döviz çevirme belgesi" (MX1 V26 türü, iki ters cari satırı) | **(a) şimdi**, (b) gerekirse sonraki faz |
| S3 | "Diğer" ödeme/tahsilat yöntemi (banka/kasa hareketi olmayan cari kaydı) | (a) Listeden çıkar; ihtiyaç MX1 "Borç/Alacak Ekle" + mahsup belgesiyle karşılanır · (b) BR'ye fon hareketsiz `OTHER` yöntemi ekle | **(a)** — tek finans motoru ve kasa/banka mutabakatı için |
| S4 | Kredi Kartı | (a) BANK + `channel=CREDIT_CARD`, kart bir `fund_account` (`account_type='CREDIT_CARD'`) · (b) ayrı `FundKind.CARD` ve kart borcu takibi | **(a)** — ZTO davranışıyla aynı sonuç, raporda ayrı görünür; (b) ayrı iş |
| S5 | Talimat sonrası "Ekstre bekle / Tamamla" (ödeme kaydı olmadan tamamlama) | (a) ÇIKAR: plan "Talimat Verildi"de kalır, ödeme `ZtoPayPlansModal` ile banka/kasa seçilerek kaydedilir (K1), ekstre satırı sonra eşleştirilir · (b) ekstre satırından doğrudan plan ödemesi oluşturan yeni uç | **(a)** şimdi; (b) MX2 ekstre içe aktarma ile birlikte değerlendirilsin |

---

## Özet (10 satır)
1. Kapsam: Payments + DailyPaymentReport (CAPC 20 action), Collections + DailyCollectionReport + `_CollectionModalsPartial` (CACC 19 action), PaymentApproval/Index (PAC 18 action, 4 modal), PaymentPlanHelper, CustomerCurrentAccounts, KrediBankaCari betiği ve MX2'den devredilen 4 (+editPayment) ortak modal alan/doğrulama/uç düzeyinde döküldü.
2. ZTO'da çalışma zamanı DDL yok; belge/makbuz no üretimi yok; Excel/PDF yalnız istemci tarafı; yetki sınıf düzeyinde 5–6 rol, iş yeri kapsamı yok, Collections POST'larında antiforgery yok.
3. Ödeme/tahsilat BR'de tek çağrı `POST /payments|collections` → `SettlementService.create` (cari + fon + çek tek tx); 6 ZTO yönteminden Nakit/Banka/Çek/Senet karşılanır, Kredi Kartı = BANK+kanal, Diğer ve çapraz kur ÇIKAR.
4. Yeni migration yalnız iki: V2xQ1 `settlement_details` (belge no, kanal, cari IBAN, düzeltme zinciri, iptal gerekçesi) ve opsiyonel V2xQ2 `settlement_allocation` (sipariş tahsisinin lojistik karşılığı: navlun/depo/açılış/alış faturası eşleştirmesi); geri kalanı V22–V33 ile kapsanıyor.
5. Düzenleme = `POST /settlements/{id}/correct` (ters kayıt + yeni), silme = `reverse` (+ untouched çekte instrument CANCELLED), detay = `GET /settlements/{id}`; liste ve günlük rapor uçları filtre/zenginleştirme ile genişler.
6. Günlük raporlar tek React sayfasında birleşir; iş yeri arası transfer (`represents_branch_id`), kredi ödemeleri (`origin`/BANK cari), gün sonu/güncel fon bakiyesi ve bankaya yansıyan çek bölümleri yanıta eklenir.
7. PaymentApproval aktif onay ekranıdır: sekmeler DRAFT/PENDING/APPROVED/REJECTED/APPROVED+ordered/PAID'e eşlenir; yeni `approval-board` ve toplu `order` uçları, dört göz ve zorunlu red gerekçesi BR'den, "Tamamla" ÇIKAR, "Ödemeyi Kaydet" zorunlu banka/kasa seçimiyle `pay` (K1).
8. Ekranda ısı haritası/yorum geçmişi yok; yeniden üretilecekler: 7 sekme+sayaç, tarih/şube-işyeri-banka/kaynak/cari filtreleri, banka→tarih→cari ağacı ve bakiye, satır/toplu işlemler, talimat modalı (IBAN), işlem türü modalı, Excel.
9. KrediBankaCari betiği (IsCreditBankAccount, BankCustomerAccountID, CreditInstallmentID/CreditContractID, açılış borcu backfill) MX3/04 V32 tasarımında tamamen karşılanıyor; geçmiş krediler için açılış kaydı Faz 2 göçüne yazılmalı.
10. 20 ZTO hatası listelendi (FX kuru 1, transaction'sız düzenleme, filtresiz hareket pasifleme, çekin vadesiz bankaya girişi, GET'te UPDATE vb.); 5 açık soru öneriyle sunuldu (fatura eşleştirme, çapraz kur, Diğer, kredi kartı, ekstre bekle).
