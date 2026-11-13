# MX-2 — Banka / Kasa / Vadeli Mevduat / Alış Carisi: ZTO → Blackrose eşleme matrisi

Kapsam: BankIntroduction, BankTransactions, BankStatement, CashIntroduction, CashTransactions, TimeDeposits, PurchaseCurrentAccount.
Kökler:
- ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`
- BR-BE = `F:\visual studio zto\LogisticErp\backend\src\main\java\org\ece\blackrose`
- BR-MIG = `F:\visual studio zto\LogisticErp\backend\src\main\resources\db\migration\tenant`
- BR-FE = `F:\visual studio zto\LogisticErp\frontend\src`

Yöntem: Bu belge, mevcut envanteri esas alır ve yalnızca eksik kısımları tamamlar. Eksikler şunlardır: modal alanları, PurchaseCurrentAccount ve Blackrose eşlemesi. Envanter dosyası: `NakliyeLojistik_SaaS_Promptlar\analiz\envanter\B_banka_kasa.md`.

Modal alanları Razor dosyalarından regex ile çıkarıldı, kritik bölümler elle okundu. Satır numaraları ZTO view ve controller dosyalarına aittir.

Kısaltmalar:
- FC = `BR-BE\finance\web\FinanceController.java`
- FS = `BR-BE\finance\service\FundService.java`
- FLS = `BR-BE\finance\service\FundLedgerService.java`
- FA = `BR-BE\finance\domain\FundAccount.java`
- V3 = `BR-MIG\V3__create_finance.sql`

---

## 0. Blackrose tarafında elde olanlar (eşlemenin dayanağı)

| Öğe | Yer | Not |
|---|---|---|
| `fund_account` | V3:39-55; entity FA:15-48 | Alanlar: `code`, `name`, `kind` (BANK/CASH), `currency` CHAR(3), `branch_id` (zorunlu), `bank_name`, `iban`, `allow_negative`, `deleted`. **Olmayan alanlar:** hesap no, banka şube adı, hesap türü (Vadesiz/Kredi/Mevduat/Yatırım), açıklama, aktif/pasif, başlangıç bakiyesi. `code`, `kind` ve `currency` sonradan değiştirilemez (FA:34-50) |
| `fund_transaction` | V3:57-77 | Değişmez kayıttır. `UNIQUE(source_type, source_id, fund_account_id)`. `exchange_rate`, `rate_date` ve `tl_amount` kayıt anında dondurulur |
| Bakiye | `BR-BE\finance\repository\FinanceRepositories.java:288-332` | Her zaman hesaplanır (Σ IN − Σ OUT). Saklanan bakiye kolonu yok |
| FundLedgerService | FLS:48 `post`, :93 `reverseSource`, :100 `reverse` | `fund_transaction` tablosuna tek yazan yer. OUT kaydında `allow_negative` false ise `INSUFFICIENT_FUNDS` (:129-139) |
| FundService | FS:53 `list`, :62 `create`, :83 `update`, :95 `delete`, :105 `postManual`, :119 `reverseManual`, :146 `transfer`, :179 `statement` | `delete` hareketi olan hesapta 409 döner. `transfer` yalnızca aynı para birimiyle çalışır; masraf ve kur farkı desteği yok |
| REST | FC:205 GET `/funds`, :211 POST, :218 PUT, :224 DELETE, :231 POST `/funds/{id}/transactions`, :239 POST `/funds/transactions/{id}/reverse`, :246 POST `/funds/transfers`, :255 GET `/funds/{id}/statement` | Ödemeler: :289/:296 `/payments`, :306/:313 `/collections`, :323 `/settlements/{id}/reverse`. Ödeme planları: :363-420 `/payment-plans` (submit, approve, reject, cancel, postpone, pay). Kurlar: :501 `/currencies`, :508 `/exchange-rates` |
| Banka ekstresi | `BR-BE\integration\service\BankStatementService.java:48` (CSV upload), :89-110 (otomatik eşleşme ±3 gün); tablo `BR-MIG\V10__create_integration.sql:116-133` | Uçlar `/api/v1/integration/bank/...` (`IntegrationController.java:357-412`). Kayıt **üretmez**, yalnızca mutabakat yapar |
| `payment_plan`, `settlement` | V3:181-197, V3:212-234 | `settlement.fund_account_id`, `method` CASH/BANK/CHECK, `plan_id` |
| Kur | `BR-BE\finance\service\ExchangeRateService.java:35`; `admin.exchange_rate` | Sıra: TRY=1 → manuel kur → tarihteki ya da önceki son kur → yoksa 422 `RATE_MISSING` |
| FE | `BR-FE\pages\finance\FundsPage.tsx` (351 satır; liste + yeni hesap/transfer/manuel hareket diyalogları), `FundDetailPage` (:266, ekstre), `BR-FE\pages\integrations\BankPage.tsx` (217), `BR-FE\pages\finance\common.tsx` (`useFunds` :91, `FormDialog` :146, `DataTable` :278) | FE'de düzenle/sil/ters kayıt butonu yok |
| Vadeli mevduat / faiz / talimat | — | `⚠ BULUNAMADI` (Blackrose'da hiç yok) |
| `branch` | `BR-MIG\V1__create_branch.sql` | Yalnızca `code` ve `name` var. ZTO'daki iki seviyeli **İş Yeri (WorkPlace) + Şube İli (BranchProvince)** yapısının karşılığı yalnızca `branch` (≈ WorkPlace). Şube İli için `⚠ BULUNAMADI` (ortak/şube matrisinde karara bağlanmalı) |

---

## 1. View envanteri ve modal dökümü

### 1.1 /BankIntroduction (Banka Tanımları)

| View | Route | Amaç | Satır | Layout |
|---|---|---|---|---|
| `Views/BankIntroduction/Index.cshtml` | GET `/BankIntroduction/Index?type=` (ctrl :31) | Banka hesap kartları (Vadesiz/Kredi/Mevduat/Yatırım), para birimi istatistikleri, sparkline'lar, silme, banka ödeme talimatı | 3347 | `_ProductionLayout`/`_Layout` |
| `_AccountCardsListPartial.cshtml` | GET `GetAccountCards` (ctrl :270) | Kart listesi partial'ı, IntroductionAudit ViewComponent ile | 366 | — |
| `Add.cshtml` | GET/POST `/BankIntroduction/Add` (ctrl :495/:515) | Yeni vadesiz hesap formu | 253 | `_ExpertLayout` |
| `Edit.cshtml` | GET `Edit/{id}` (:588), POST `Update` (:629) | Düzenleme formu | 334 | `_ExpertLayout` |
| `Details.cshtml` | GET `Details/{id}` (:910) | Hesap detayı, audit, silme | 537 | `_ExpertLayout` |

**Sayfa formu: Add (Add.cshtml).** Edit aynı alanlara sahiptir; satır numaraları +1 kayar.

| # | Alan (asp-for) | Etiket | Tip | Doğrulama | Veri kaynağı |
|---|---|---|---|---|---|
| 1 | `Bank` | Banka * | select | required | `Models/BankInstitutionList.All` (25 TR bankası) — Add:62 |
| 2 | `BankCode` | Banka Kodu * | text | required | Add:100 |
| 3 | `BankName` | Hesap Adı * (Edit'te "Banka Adı") | text | required | Add:104 / Edit:105 |
| 4 | `BranchName` | Şube Adı | text | — | Add:108 |
| 5 | `CurrencyID` | Para Birimi * | select | required, ilk anda disabled (JS açar) | `Currency` tablosu — Add:112 |
| 6 | `AccountNumber` | Hesap Numarası | text | — | Add:128 |
| 7 | `Iban` | IBAN | text | — (sunucuda format kontrolü yok `⚠`) | Add:132 |
| 8 | `WorkPlaceID` | İş Yeri * | select | required, disabled | `ZT_WorkPlace` — Add:136 |
| 9 | `BranchProvinceID` | Şube İli * | select | required, disabled | `ZT_BranchProvince` — Add:149 |
| 10 | `InitialBalance` | Başlangıç Bakiyesi * | number step .01 | required, varsayılan 0 | Add:165 |
| 11 | `Balance` | Güncel Bakiye * | number step .01 | required, varsayılan 0 | Add:169 |
| 12 | `Status` | Durum * | select (true/false) | required | Add:173 |
| 13 | `Description` | Açıklama | textarea (+ temizle butonu :185) | — | Add:184 |
| 14 | `CreationDate` | Oluşturma Tarihi | datetime-local (Edit'te readonly) | — | Add:198 |
| — | submit | "Yeni Banka Oluştur" / "Banka Güncelle" | | | Add:205 / Edit:200 |

- Yazılan tablo: `ZT_BankIntroduction`. INSERT ctrl :527, UPDATE :655. Kayıt yalnızca `AccountType='Vadesiz'` ile yapılır (:515-668).
- Log tablosuna da yazılır (`Methods.LogAdd`).

**Modal BI-1: `deleteModal` — Index.cshtml:1208 (Details.cshtml:509'da da aynısı var)**
- Başlık: "Hesap Silme". Girdi alanı yok.
- Durum blokları: `#deleteCheckLoading`, `#deleteAllowed` (`#deleteAccountName`), `#deleteNotAllowed` (`#deleteNotAllowedReason`).
- Butonlar: İptal; `a#deleteConfirmBtn` "Evet, Sil". Bu bir link: `href='/BankIntroduction/Delete/{id}'` (Index:2501).
- AJAX:
  - `CheckCanDelete?id=` (Index:2491 → ctrl :781). 6 bağımlılık kontrolü yapar (:814-902): banka hareketi, ödeme, tahsilat, kredi sözleşmesi, vadeli mevduat, yatırım.
  - Ardından `Delete` GET (ctrl :720) çalışır: `ZT_BankIntroduction.Status=false` (:747).

**Modal BI-2: `bankInstructionModal` — Index.cshtml:1244 (modal-xl, data-backdrop=static)**
- Başlık: "Banka Ödeme Planı Oluştur" (:1248).
- Bilgi paneli (salt okunur): `#instructionBankName`, `#instructionBankIban`, `#instructionBankBalance` (Güncel Bakiye), `#instructionRemainingBalance` (Plan Sonrası).
- Hidden alanlar: `#instructionBankID`, `#instructionBankCurrencyID`, `#instructionBankCurrencySymbol`, `#instructionWorkPlaceID`, `#instructionBranchProvinceID` (:1284-1288).
- Dinamik satır tablosu `#instructionPaymentTable`. Satır şablonu `addInstructionPaymentRow()` (Index ~:2620-2720) ile üretilir. Sütunlar:
  1. **Cari Hesap *** → `select.instr-customer-sel`, `onRowCustomerChange`. Kaynak: `GetCustomerAccountsForInstruction` (Index:2597 → ctrl :1246).
  2. **IBAN *** → `select.instr-iban-sel` (cari seçilene kadar disabled). Kaynak: `GetCustomerIbans?customerAccountId&currencyId` (Index:2802 → ctrl :1283), `ZT_BankAccounts` tablosundan. Seçeneklerden biri "MANUEL"dir ve şu tooltip formunu açar:
     - `.instr-manual-accountholder`: Hesap sahibi *
     - `.instr-manual-iban`: IBAN * (`TR` ile başlamalı ve 26 karakter olmalı, Index:3079)
     - `.instr-manual-desc`: Hesap açıklaması *
     - `.instr-manual-bank`: Banka adı
     - `.instr-manual-branch`: Şube adı
     - Hidden `.instr-is-manual`
  3. **Ödeme Tarihi *** (date)
  4. **Tutar *** (sayı, > 0, Index:3084)
  5. **Açıklama**
  6. Satır silme butonu
- Altbilgi: `#instructionTotalAmount`. Genel açıklama `#instructionDescription` textarea (:1329).
- Doğrulamalar (`saveBankInstruction`, Index:3046-3109):
  - Cari zorunlu, IBAN zorunlu
  - Manuel IBAN girişinde hesap sahibi ve açıklama zorunlu
  - Tarih zorunlu, tutar > 0
  - En az bir satır gerekli
  - Kalan bakiye < 0 ise `confirm()` ile onay istenir
- Butonlar: İptal; `#saveInstructionBtn` "Ödeme Planı Oluştur (Onay Bekleyecek)".
- AJAX:
  - Açılışta `GetBankInstructionData?bankId` (Index:2560 → ctrl :1199)
  - Kayıtta `SaveBankInstruction` POST JSON (Index:3115 → ctrl :1342)
- Yazılan tablolar (tek transaction, ctrl :1379-1529):
  - `ZT_BankAccounts` (manuel IBAN, :1405)
  - `ZT_BankPaymentInstructions` (:1440, `'Onay Bekliyor'`)
  - `ZT_BankPaymentInstructionDetails` (:1467, `'Beklemede'`)
  - `ZT_CustomerAccountPaymentPlans` (:1478, `SourceType='Talimatlı Plan'`)

**Diğer AJAX:** `/BankIntroduction/Sparklines?ids=` (Index:3308 → ctrl :986), Index yenileme (Index:1901).

### 1.2 /CashIntroduction (Kasa Tanımları)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/CashIntroduction/Index` (ctrl :27) | Kasa kartları, sparkline, detay ve silme | 2131 |
| `_CashCardsListPartial.cshtml` | GET `GetCashCards` (:324) | Kart listesi | 221 |
| `_CashDetailPartial.cshtml` | GET `GetCashDetails?id` (:921) | `cashDetailModal` gövdesi (`CashDetailViewModel`) | 223 |
| `Add.cshtml` | GET/POST `Add` (:432/:491) | Yeni kasa | 195 |
| `Edit.cshtml` | `Edit` (:570), `Update` (:657) | Düzenle | 274 |

**Form: Add.** Edit'te de aynı alanlar var; ek olarak 2 hidden alan (:59-60) bulunur.

| Alan | Etiket | Tip / doğrulama | Satır |
|---|---|---|---|
| `CashCode` | Kasa Kodu * | text, required | Add:62 |
| `CashName` | Kasa Adı * | text, required | Add:66 |
| `CurrencyID` | Para Birimi * | select, required (disabled → JS) | Add:70 |
| `WorkPlaceID` | İş Yeri * | select, required | Add:83 |
| `BranchProvinceID` | Şube İli * | select, required | Add:99 |
| `InitialBalance` | Başlangıç Bakiyesi * | number .01, required | Add:112 |
| `Balance` | Güncel Bakiye * | number .01, required | Add:116 |
| `Status` | Durum * | select, required | Add:120 |
| `Description` | Açıklama | textarea | Add:131 |
| `CreationDate` | Oluşturma Tarihi | datetime-local | Add:145 |
| submit | Yeni Kasa Oluştur / Kasa Güncelle | | Add:152 / Edit:154 |

- Yazılan tablo: `ZT_CashIntroduction` (INSERT ctrl :505, UPDATE :671).

**Modal CI-1: `cashDetailModal` — Index:1357.** Başlık "Kasa Detayları" (:1364). Girdi alanı yok. Gövde `fetch GetCashDetails?id` (Index:1473 → ctrl :921) ile `_CashDetailPartial` olarak gelir. Audit bilgisi `DefinitionAuditService("cash")` üzerinden okunur. Okunan tablolar: `ZT_CashIntroduction`, `ZT_CashTransactions`, `ZT_IntroductionAccessSummary`.

**Modal CI-2: `deleteModal` — Index:1378.** Başlık "Kasa Silme" (:1382). Yapısı BI-1 ile aynı. AJAX `CheckCanDelete` (Index:1496 → ctrl :791) 3 kontrol yapar: kasa işlemi, ödeme, tahsilat. Ardından `Delete` GET (:731) → `Status=false` (:757).

### 1.3 /BankTransactions (Banka Hareketleri)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/BankTransactions/Index?bankId&workPlaceId&currencyId&openModal&fromInstruction` (ctrl :31) | Banka hareket listesi, bakiye kartları, ödeme ve tahsilat ekleme, talimattan ödeme | 5679 |
| `ActivityReport.cshtml` | GET `ActivityReport?bankId&startDate&endDate` (:464) | FIFO eşleşmeli faaliyet raporu (yazdırılabilir) | 942 |

**Sayfa filtreleri** (modal değil; hepsi `GetTransactions` (ctrl :990) çağrısına parametre olur):

| id | Satır | Kaynak / not |
|---|---|---|
| `filterAccountType` | :325 | Vadesiz/Kredi/Mevduat/Yatırım; `GetBanksByAccountType` (:402) |
| `filterWorkPlace` | :338 | |
| `filterBank` | :355 | |
| `filterTransactionType` | :392 | Giriş/Çıkış |
| `filterAccountingType` | :405 | Sabit liste, ctrl :216-234: Cari Ödeme, Cari Tahsilat, EFT, Havale, Virman, Döviz Bozum, Bankadan Kasaya, Kasadan Bankaya, Net Maaş, Kredi Kullanım, Çek Tahsil, Senet Tahsil, Masraf, Gelir, Diğer |
| `filterStartDate` | :419 | varsayılan −7 gün |
| `filterEndDate` | :428 | varsayılan +1 gün |

- Butonlar:
  - `loadTransactions` (:435), `clearFilters` (:438), `refreshTransactions` (:441)
  - `#btnNewPayment` (:212 → `addPaymentModal`), `#btnNewCollection` (:216 → `addCollectionModal`)
  - Faaliyet raporu (:236), `exportToExcel` (CSV, :240), `window.print` (:244)
- Bakiye kartları: `GetBankBalances` (:1232), `GetBankDetailInfo` (:1352), `GetSingleBankBalance` (:1846).

**Modal BT-1: `allPaymentsCompletedModal` — :487** (backdrop static).
- Başlık yok; gövdede "Tüm Ödemeler Kaydedildi!" yazar. Girdi alanı yok.
- Butonlar: "Sayfayı Yenile" `refreshPageToIndex()` (:503), "Şimdi Değil" (:507).
- Talimat akışının sonunda açılır. Çağrılan uçlar: `ClearInstructionSession` (ctrl :2178), `CheckInstructionSessionExists` (:2197).

**Modal BT-2: `transactionDetailModal` — :532.** Başlık "İşlem Detayı" (:543).
- İçerik `GetTransactionDetail?id` (ctrl :1140) ile dinamik doldurulur. Maaş satırlarında süper olmayan kullanıcıya `***` gösterilir (:1182-1198).
- Butonlar:
  - Kapat (:562)
  - `#btnEditCollectionFromDetail` "Tahsilatı Düzenle" (:565 → `editCollectionModal`, CustomerAccountCollection)
  - `#btnDeleteTransactionFromDetail` "İşlemi Sil" (:568) → `DeleteTransactionCascade` POST + antiforgery (ctrl :1571):
    - `ZT_BankTransactions` soft delete
    - "Cari Tahsilat" ise `ZT_AccountCollectionOrders` ve `ZT_AccountCollections` **hard delete** (:1608-1637)

**Modal BT-3: `activityReportModal` — :576.** Başlık "Faaliyet Raporu" (:587).
- Girdiler: `#activityReportBank` select (:609, sayfa banka listesi), `#activityReportStartDate` date (:634, −1 ay), `#activityReportEndDate` date (:639, bugün). Zorunluluk JS tarafında kontrol edilir.
- Butonlar: İptal; "Raporu Göster" `openActivityReport()` (:652). Yeni sekmede `ActivityReport` açılır (ctrl :464, FIFO :747-945).

**Modal BT-4: `instructionPaymentSelectionModal` — :661.**
- Başlık dinamik: `#customerCardModalTitle` (Cari Adı), alt başlık "Ödeme Planlarını Yönet". Rozetler `#modalStatsArea`'da.
- Gövde `#paymentSelectionContent` JS ile oluşturulur: talimattaki ödeme satırları, onay kutuları. Veri `Session["PendingInstructionData"]`'dan gelir (PaymentApprovalController yazar).
- Butonlar: Kapat; `#postponeSelectedPaymentsBtn` "Ödemeyi Sonra Kaydet" (:714); `#saveSelectedPaymentsBtn` "Kaydet" (:717).
- AJAX:
  - `PostponeInstructionPayment` (ctrl :1987)
  - `PostponeMultipleInstructionPayments` (:2044): `ZT_CustomerAccountPaymentPlans.ApprovalStatus='Talimat Verildi'`
  - Kaydetme `addPaymentModal` / CustomerAccountPayment.`AddPayment` ve PaymentApproval.`UpdateInstructionStatusToCompleted` üzerinden yapılır

**Partial modallar** (alanları başka matrisin, yani ödeme/tahsilat matrisinin kapsamındadır; burada yalnızca kimlikleri verilir):

| Modal | Dosya:satır | Satır sayısı |
|---|---|---|
| `addPaymentModal` | `Views/Shared/_AddPaymentModal.cshtml:157` | 1196 |
| `addCollectionModal` | `Views/CustomerAccountCollection/_CollectionModalsPartial.cshtml:47` | 1532 |
| `editCollectionModal` | aynı dosya :854 | |
| `postPaymentPlanningModal` | `Views/Shared/_PostPaymentPlanningModal.cshtml:4` | 176 |

Bu modallar banka/kasa sayfasından açıldığında banka veya kasa ön-seçili gelir. Bu durumlarda `BankTransactionsController.CreateBankTransaction` statik metodu (:1740) çağrılır.

### 1.4 /CashTransactions (Kasa Hareketleri)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/CashTransactions/Index?cashId&workPlaceId&currencyId&openModal` (ctrl :28) | Kasa hareketleri, ödeme ve tahsilat | 2206 |
| `ActivityReport.cshtml` | GET `ActivityReport` (:1129) | FIFO faaliyet raporu | 946 |
| `CashExtract.cshtml` | GET `CashExtract?cashId&startDate&endDate` (:947) | Yazdırılabilir kasa ekstresi (`Layout=null`) | 622 |

**Filtreler:** `filterWorkPlace` (:324), `filterCash` (:339), `filterTransactionType` (:362), `filterAccountingType` (:373), `filterStartDate` (:384), `filterEndDate` (:391). Bunlar `GetTransactions` (ctrl :527) çağrısına gider.

**Butonlar:** `#btnNewPayment` → `openCashPaymentModal` (:200), `#btnNewCollection` (:204), rapor (:223), CSV (:227), yazdır (:231).

**Modal CT-1: `transactionDetailModal` — :448.** Başlık "Kasa İşlem Detayı" (:459). `GetTransactionDetail` (ctrl :445). Yalnızca Kapat butonu var (:478); silme butonu yok. `DeleteTransaction` (:794) view'dan çağrılmıyor `⚠`.

**Modal CT-2: `cashActivityReportModal` — :534.** Başlık "Kasa Faaliyet Raporu" (:543).
- Girdiler: `#activityReportCash` select (:556), `#activityReportStartDate` (:572), `#activityReportEndDate` (:582).
- Butonlar: İptal; "Raporu Aç" `openCashActivityReport()` (:597) → `Url.Action("ActivityReport","CashTransactions")` (:1991).

**Partial modallar:** `addPaymentModal` (:487), `addCollectionModal` / `editCollectionModal` (:490). Bunlar CustomerAccountPayment / CustomerAccountCollection uçlarını kullanır (Index:924-993).

### 1.5 /BankStatement (Transfer Merkezi + Ekstre)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/BankStatement/Index` (ctrl :27) | 4 sekme: Yeni Transfer, Transferler, Banka Ekstresi, Kasa Ekstresi (:895-912). Bütün JS `wwwroot/js/zt/bankstatement/index.js` (4659 satır) içinde | 2843 |
| `BankExtract.cshtml` | GET `BankExtract?bankId&startDate&endDate` (:5407) | Yazdırılabilir banka ekstresi (`Layout=null`, son 7 gün) | 781 |
| `ExchangeBreakReport.cshtml` | GET `ExchangeBreakReport` (:5657) + `fetch GetExchangeBreakData` (view :1487 → ctrl :5676) | Döviz bozum izlenebilirlik raporu (90 gün) | 1577 |

**Sekme 1 — Yeni Transfer formu** (`#newTransferPanel`, :1280-1765; modal değil, sayfa formu)

Tip kartları (`selectTransferType`): **Virman** (Virman/EFT/Havale), **Döviz Bozum**, **BankCash** (Banka↔Kasa, Kasa↔Kasa).

| id | Etiket | Tip / doğrulama | Satır | Veri kaynağı |
|---|---|---|---|---|
| `newTransferDate` | Tarih * | date (bugün) | :1296 | |
| `newSourceWorkPlace` | Kaynak İş Yeri * | select (optgroup = Şube İli) | :1302 | `ViewBag.WorkPlaces` |
| `newTransferWorkPlace` | İş Yeri * | select | :1324 | |
| `newTargetWorkPlace` | Hedef İş Yeri * | select | :1342 | |
| `virmanTransferType` | Transfer Tipi * | select: Virman/EFT/Havale | :1362 | sabit |
| (isimsiz) | Transfer Tipi * | sabit "Döviz Bozum / Döviz Alım" | :1371 | |
| `newSourceBank` | Kaynak Banka * | select (disabled → iş yeri seçilince) | :1378 | `GetBanksByWorkPlace` (js:1140 → ctrl :188; yalnızca `AccountType='Vadesiz'`, :224) |
| `newTargetBank` | Hedef Banka * | select | :1400 | aynı |
| `transferReasonType` | Transfer Nedeni | select, JS ile üretilir. Seçenekler `DebtPaid` / `LoanGiven` (js:842-868); yalnızca Virman modunda ve iş yerleri farklıyken görünür (js:836-839) | `#transferReasonRow` | ctrl :6001-6022 → iş yeri carilerine yansıtma |
| `bankCashTransferDate` | Tarih * | date | :1430 | |
| `bankCashSourceWorkPlace` / `bankCashTargetWorkPlace` | Kaynak / Hedef İş Yeri * | select | :1435 / :1450 | |
| `bankCashDirection` | Transfer Yönü * | select: BankToCash / CashToBank / CashToCash | :1463 | |
| `bankCashSourceBank` / `bankCashSourceCash` | Kaynak Banka/Kasa * | select | :1473 / :1476 | `GetBanksByWorkPlace`, `GetCashesByWorkPlace` (ctrl :329) |
| `bankCashTargetBank` / `bankCashTargetCash` | Hedef Banka/Kasa * | select | :1493 / :1496 | |
| `exchangeCustomerAccount` | Cari Hesap (kaynak bankaya tahsilatı yapılan) | select | :1522 | `GetCustomerAccountsWithForeignCollections` (js:1998 → ctrl :5082) |
| `exchangeCollection` | Tahsilatlar | select (disabled) | :1529 | `GetCollectionsForExchange` (js:2098 → ctrl :4767), detayı `GetCollectionDetailForExchange` (js:2147 → :4997) |
| `selectAllCollectionOrders` + satır checkbox'ları ve "Bozulacak" tutarları | Sipariş dağılımı tablosu | checkbox + number | :1577 | `ZT_AccountCollectionOrders` → `ZT_Orders` |
| `selectAllBreakSources` + satırlar | Önceki Döviz Bozum Kaynakları | checkbox + "Kullanılacak" | :1620 | `GetPreviousBreaksForSource` (js:1880 → ctrl :5574) |
| `exchangeCalcMode` | Hesaplama Seç * | select: `source-rate` / `rate-target` / `source-target` | :1651 | sabit |
| `newSourceAmount` | Kaynak Tutar * | text (TR sayı biçimi) | :1663 | Kaynak tutar seçimin üstüne yazılırsa "Manuel" etiketi ve izlenebilirlik uyarısı çıkar (`#manualSourceAmountWarning`). `#btnResetToSelectionMode` (:1668) |
| `rateCalcSymbolBtn` | ÷ / × | button | :1674 | `CalculationOperation` |
| `newRate1` | Kur Fiyatı * | number min 0 step .0001 | :1691 | |
| `newIsCross` | Çapraz kur | checkbox | :1697 | |
| `newTargetAmount` | Hedef Tutar * | text | :1707 | |
| `newRate2` | Kur 2 | number | :1718 | çapraz kurda |
| `newKmvRate` | KMV (%) | number | :1727 | KMV yalnızca TL tarafı olan işlemde; varsayılan 0.002 (DTO :6414) |
| `newCommission` | Komisyon | number | :1731 | |
| `newTransferFee` | Masraf | number | :1735 | |
| `newCostBank` | Masraf Bank. | select | :1739 | masraf bankası |
| `newDescription` | Açıklama | text | :1749 | |
| `newDocumentNo` | Belge No | text | :1753 | |
| butonlar | Temizle `resetTransferForm()` (:1760), `#btnSaveTransfer` Kaydet (:1763) | | | `CreateTransfer` POST JSON (js:3090 → ctrl :392; DTO `BankTransferDto` :6396-6440) |

- Kaydetmeden önce negatif bakiye kontrolü yapılır → `negativeBalanceConfirmModal`. Sonuç `transferResultModal` ile gösterilir.
- Yazılan tablolar:
  - `ZT_BankTransfers` (INSERT :3721)
  - `ZT_BankTransactions` ve `ZT_CashTransactions` (private `InsertBankTransaction` :4158 / `InsertCashTransaction` :4131)
  - `ZT_ExchangeBreakSource`
  - `ZT_AccountCollections` (ExchangedAmount, RemainingExchangeAmount, ExchangeStatus; :1196-1201)
  - `ZT_AccountCollectionOrders` (IsExchanged...)
  - İş yeri carileri için `ZT_AccountPayments` ve `ZT_AccountCollections` (:5961-6391)
- Kod biçimi `{VRM|EFT|HVL|DBZ|BKY|KBY|KKY}-{yıl}-{COUNT+1}` (:3692-3715).

**Sekme 2 — Transferler.**
- Filtreler: `transferFilterWorkPlace` (:1092), `transferFilterType` (:1102), `transferFilterStartDate` / `EndDate` (:1113/:1117), `transferFilterText` (:1120).
- Tablo `#transfersTable`, 13 sütun (:1181-1199). `GetTransfers` (ctrl :1329), özet `GetTransferSummary` (:1592).
- Butonlar:
  - `#btnCleanupCariDuplicates` (:1174 → `CleanupDuplicateCariRecords` :2773)
  - `#btnBulkSyncCari` (:1177 → `bulkSyncCariModal` + `SyncTransferToCari` :2927, transfer başına döngü js:3528-3578)

**Sekme 3 — Banka Ekstresi.**
- Filtreler: `filterWorkPlace` (:927), `filterBank` (:937), `filterCurrency` (:949), `filterStartDate` / `EndDate` (:959/:963), `filterText` (:967); `btnFilter` / `btnClear`.
- Uçlar: `GetStatement` (:3252), `GetStatementCount` (:3188), `GetSummaryCards` (:3496), `GetBankBalances` (:3575). Döviz kısayol butonları :841.

**Sekme 4 — Kasa Ekstresi.**
- Filtreler: `filterCashWorkPlace` (:1009), `filterCash` (:1019), `filterCashCurrency` (:1031), tarih alanları (:1041/:1045), `filterCashText` (:1049).
- Uçlar: `GetCashStatement` (:3430), `GetCashStatementCount` (:3220).

**Modaller:**

| # | id (satır) | Başlık | Girdiler | Butonlar | AJAX → ctrl | Tablolar |
|---|---|---|---|---|---|---|
| BS-1 | `exchangeBreakReportModal` (:855) | Döviz Bozum & Tahsilat İzlenebilirliği | `ebStartDate` date (:867, −7 gün), `ebEndDate` date (:873, +1) | İptal; `#btnGoToExchangeBreakReport` "Raporu Görüntüle" (:879) | → `ExchangeBreakReport` view (:5657) | R: `ZT_BankTransfers`, `ZT_ExchangeBreakSource`, `ZT_AccountCollections`, `ZT_Orders` |
| BS-2 | `bulkSyncCariModal` (:1211) | Tüm Transferleri İş Yeri Carilerine Yansıt | yok (ilerleme çubuğu, `#bulkSyncStatusText`, `#bulkSyncDetailText`) | `#bulkSyncCloseBtn` Kapat (bitene kadar disabled) | `GetTransfers` + her transfer için `SyncTransferToCari` (js:3578 → :2927) | W: `ZT_AccountPayments`, `ZT_AccountCollections` |
| BS-3 | `editDovizBozumModal` (:1869) | Döviz Bozum Düzenle | hidden: `.edit-transfer-id`, `.edit-max-source-amount`, `.edit-source-bank-id`, `.edit-source-currency-id` (:1877-1880), `.edit-this-transfer-col-amount` (:2022). Görsel yön kartı. `.edit-exchange-customer-account` select (:1926), `.edit-exchange-collection` select (:1932). Tahsilat özeti (Toplam/Bozulan/Kalan/en yüksek bozum). Sipariş tablosu (`.edit-select-all-collection-orders` :1997, "Bozulacak" satır girdileri). Önceki bozum kaynakları tablosu (:2023-2057). `.edit-source-amount` number min .01 (:2071), `.edit-target-amount` disabled (:2080), `.edit-rate1` number min .000001 (:2089), `.edit-operation` select `*` / `/` (:2093), `.edit-transfer-date` (:2101), `.edit-document-no` (:2105), `.edit-description` (:2109) | İptal; Kaydet `submitTransferEdit('Döviz Bozum')` (:2114) | Açılış `GetTransferForEdit` (js:3644 → :1798) + yukarıdaki tahsilat uçları (js:2422-2646). Kayıt `UpdateTransfer` (js:3878 → :1985) | W: `ZT_BankTransfers` UPDATE (:2225), `ZT_BankTransactions` UPDATE (:2285/:2296), `ZT_ExchangeBreakSource` DELETE+INSERT (:2471), `ZT_AccountCollections`, `ZT_AccountCollectionOrders` |
| BS-4 | `editVirmanModal` (:2120) | Virman Düzenle | `.edit-transfer-id`. Yeniden yönlendirme: `.edit-source-workplace-select`, `.edit-source-bank-select`, `.edit-target-workplace-select`, `.edit-target-bank-select` (:2137-2145). Yön kartı. `.edit-source-amount` (min .01, :2194), `.edit-transfer-date` (:2202), `.edit-document-no` (:2206), `.edit-description` (:2210) | İptal; Kaydet `submitTransferEdit('Virman')` | `GetTransferForEdit` → `UpdateTransfer` | `ZT_BankTransfers`, `ZT_BankTransactions`, cari yansımaları |
| BS-5 | `editEftModal` (:2221) | EFT Düzenle | BS-4 ile aynı (:2229-2311) | `submitTransferEdit('EFT')` | aynı | aynı |
| BS-6 | `editHavaleModal` (:2322) | Havale Düzenle | BS-4 ile aynı (:2330-2412) | `submitTransferEdit('Havale')` | aynı | aynı |
| BS-7 | `editBankToCashModal` (:2423) | Bankadan Kasaya Düzenle | Kaynak İş Yeri / Kaynak Banka / Hedef İş Yeri / **Hedef Kasa** (:2440-2448), tutar (:2497), tarih, belge no, açıklama | `submitTransferEdit('Bankadan Kasaya')` | aynı | + `ZT_CashTransactions` UPDATE (:2312/:2326) |
| BS-8 | `editCashToBankModal` (:2524) | Kasadan Bankaya Düzenle | **Kaynak Kasa** / Hedef Banka (:2541-2549) + ortak alanlar | `submitTransferEdit('Kasadan Bankaya')` | aynı | aynı |
| BS-9 | `editCashToCashModal` (:2625) | Kasadan Kasaya Düzenle | Kaynak Kasa / Hedef Kasa (:2642-2650) + ortak alanlar (:2695-2711) | `submitTransferEdit('Kasadan Kasaya')` | aynı | `ZT_CashTransactions` |
| BS-10 | `deleteTransferModal` (:2722) | Transfer Sil | hidden `#deleteTransferId` (:2730). Bağımlı bozum varsa `#deleteBlockedSection` görünür (tablo: Bozum Kodu / Tarih / Kaynak / Hedef / Kullanılan). `#deleteTransferReason` textarea, opsiyonel (:2763) | İptal; `#btnConfirmDelete` "Sil" (:2769) | `CheckExchangeBreakDependencies` (js:3910 → :2548), `DeleteTransfer` POST (js:3945 → :2608) | `ZT_BankTransfers.Status=false` (:2722-2726); bağlı banka/kasa hareketleri soft delete + "[Transfer silindi]" (:3880-3890); cari yansımalar silinir; `RollbackCollectionExchange` (:3978); `ZT_ExchangeBreakSource` DELETE (:2708) |
| BS-11 | `transferResultModal` (:2777) | Transfer Sonucu | yok (`#transferResultDetails`, `#transferResultTarget`) | `#transferResultOkBtn` Tamam | — | — |
| BS-12 | `negativeBalanceConfirmModal` (:2800) | Bakiye Bilgilendirmesi | yok. Gösterilenler: `#negativeBalanceAccountName`, `#negativeBalanceBefore`, `#negativeBalanceAmount`, `#negativeBalanceAfter` | Vazgeç; `#btnConfirmNegativeBalance` "Evet, Devam Et" | Bakiye istemcide `GetBankBalances` verisinden hesaplanır | — |

### 1.6 /TimeDeposits (Vadeli Mevduat)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/TimeDeposits/Index?status=` (ctrl :26) | Mevduat listesi, istatistik, faiz tahsil, erken bozma | 665 |
| `Add.cshtml` | GET/POST `Add` (:197/:229) | Mevduat açma formu | 559 |
| `Details.cshtml` | GET `Details/{id}` (:369) | Detay, satır içi kısmi faiz tahsilatı, modallar | 1009 |

**Form: Add.cshtml**

| id / asp-for | Etiket | Tip / doğrulama | Satır | Kaynak |
|---|---|---|---|---|
| `branchProvinceId` | Şube İli | select | :140 | `GetWorkPlacesByProvince` (:399 → ctrl :929) |
| `workPlaceId` | İş Yeri | select | :155 | |
| `currencyId` | Para Birimi | select, required | :172 | |
| `sourceBankId` | Kaynak Hesap (Para Çekilecek) | select, required | :189 | `GetFilteredBanks` (:438 → ctrl :962) |
| `principal` | Anapara Tutarı | number min 0, required | :217 | |
| `annualRate` | Yıllık Faiz Oranı (%) | number 0-100, required | :229 | |
| `withholdingRate` | Stopaj Oranı (%) | number, varsayılan 15 | :241 | |
| `DepositType` | Mevduat Tipi | select: Standart / Birikim / Kademeli | :255 | |
| `MaturityAction` | Vade Sonu İşlemi | select: Manual / AutoRenew / AutoTransfer | :265 | |
| süre butonları | 7, 14, 32, 61 gün; 3 ay, 6 ay, 1 yıl (`setDuration`) | button | :285-291 | |
| `startDate` | Başlangıç Tarihi | date | :299 | |
| `maturityDate` | Vade Tarihi | date | :306 | |
| `durationDays` | Vade (Gün) | number, readonly | :313 | |
| `Description` | (açıklama) | textarea | :325 | |
| submit | Vadeli Mevduat Aç | | :373 | |

- POST `Add` (ctrl :229-326) yapılanlar:
  - Kaynak hesapta yeterli bakiye kontrolü **saklı `Balance` kolonundan** yapılır (:1262)
  - Mevduat hesabı yoksa `ZT_BankIntroduction`'a `AccountType='Mevduat'` kaydı açılır (:1292)
  - Kaynakta "Çıkış", mevduat hesabında "Giriş" hareketi oluşturulur (`AccountingType='Vadeli Mevduat'`)
  - `ZT_TimeDeposits` INSERT (:265)
  - `Balance ± Amount` UPDATE (:1361)

**Modal TD-1: `collectModal`.** Index.cshtml:316'da başlık dinamik ("Faiz Tahsilatı"); Details.cshtml:678'de "Vade Sonu Tahsilat".
- Hidden: `#collectDepositId`, `#collectType` (`Faiz` | `VadeSonu`).
- `#collectTargetBank` select, required (Index:344, "Hedef Hesap (Faiz Aktarılacak)"). Kaynağı aynı para birimindeki hesaplardır (`GetDepositInfo` Index:520 → ctrl :888; ctrl tarafında `ValidateTargetBankCurrency` :1098).
- `#collectDate` date.
- Yalnızca Index'te bulunanlar: `#collectGrossAmount` (Brüt Faiz, :365), `#collectWithholding` (Stopaj %15, :371), `#collectNetAmount` (Net Faiz, :378); üçü de readonly.
- Butonlar: İptal; "Tahsil Et" `submitCollect()`.
- AJAX: `CollectInterest` POST JSON (Index:568 / Details:934 → ctrl :526). DTO `CollectInterestDto` (:1470): DepositID, TargetBankID, CollectionType, CollectionDate, GrossAmount, WithholdingTax, Commission, NetAmount, Description.
- Yazılan tablolar:
  - `ZT_InterestCollections` (INSERT :560, kod `FTH-yıl-NNNN`)
  - `ZT_TimeDeposits` UPDATE (:614/:643; VadeSonu ise `'Kapatildi'`)
  - `ZT_BankTransactions` (+ `Balance` güncellemesi)
  - `ZT_FinIncomeExpense` (Gelir/Faiz, :1380)

**Details satır içi kısmi faiz tahsilatı** (modal değil, Details:360-470):
- `#inlineCollectAmount` (number, kalan faize kadar)
- `#inlineTargetBank` select
- Butonlar: "Vade Sonu" ve "Kısmi faiz"
- `submitInlineCollect(type)` (Details:826) → `CollectInterest` (Details:892). Brüt ve stopaj tutarı orantılı yeniden hesaplanır (:866-877).

**Modal TD-2: `breakModal`** (Index:399, Details:733 — "Erken Bozma").
- Hidden `#breakDepositId`.
- `#breakTargetBank` select, required.
- `#breakDate` date (Details'ta `calculateBreak`).
- `#breakRate` number (Erken Bozma Faiz Oranı %, varsayılan 1).
- `#breakPenalty` number (Ceza Tutarı, varsayılan 0; Index:447; Details'ta `⚠` alan regex taramasında görülmedi).
- Butonlar: İptal; "Erken Boz" `submitBreak()`.
- AJAX: `BreakDeposit` POST (Index:645 / Details:990 → ctrl :707). DTO (:1483): DepositID, TargetBankID, BreakDate, EarlyBreakRate, Penalty.
- Yazılanlar:
  - `ZT_InterestCollections` (:750)
  - `ZT_TimeDeposits` (`'Bozuldu'`, :796)
  - `ZT_BankTransactions`
  - `ZT_FinIncomeExpense` (net − ceza > 0 ise)
- Hesap: `actualDays` ile faiz; Toplam = Anapara + Net − Ceza (:736-817).

**Index filtreleri:** `filterStatus` (Aktif / Kapatildi / Bozuldu, :150), `filterSearch` (:160); butonlar `applyFilter` / `clearFilter`.

**View'dan çağrılmayan uçlar:** `CalculateInterestPreview` (:858), `GetMaturedDeposits` (:1027) → `⚠`. Önizleme istemcide yapılıyor (`calculatePreview`).

### 1.7 /PurchaseCurrentAccount (Alış Carileri — bahçe/hasat/nakliye/malzeme ödemeleri)

Envanterde yer almıyordu; burada yeni çıkarıldı.
- Controller: `Controllers/PurchaseCurrentAccountController.cs` (2562 satır).
- Yetki: `[Authorize]`, `UserRoleAuthorize("Patron","Admin","Muhasebe (Alış)","Finans(normal)","Finans(super)")`.

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/PurchaseCurrentAccount/Index?cariAdi&cariTuru&durum&plaka` (ctrl :27) | Tedarikçi (bahçe), kesim çavuşu, nakliye firması, malzeme/ilaç tedarikçisi borç listeleri ve ödeme | 3577 |

**Filtre formu** (GET, :633):

| Alan | Etiket | Satır |
|---|---|---|
| `cariTuru` | Cari Türü | :636 |
| `cariAdi` | Cari Adı | :650 |
| `plaka` | Araç Plaka | :662 |
| `durum` | Durum | :673 |

Butonlar: "Ara"; `#toggleBalanceBtn` / `#toggleDistributionBalanceBtn` "Bakiyeleri Göster" (:686/:1190). Bu butonlar `Get/UpdateBakiyeGosterSetting` uçlarını (:985/:1012) çağırır ve `ZT_Setting` tablosuna yazar.

| # | Modal (satır) | Başlık | Girdiler | Butonlar | AJAX → ctrl | Tablolar |
|---|---|---|---|---|---|---|
| PCA-1 | `odemelerModal` (:1351) | Ödeme Geçmişi | hidden `#modalCariTuru`, `#modalKayitId`; liste + satır silme (→ PCA-7) | Kapat | `GetOdemeGecmisi` (view:3381 → :1871) | R: `ZT_InstallmentPayments`, `ZT_ExpertReportTruckExpenses` vb. |
| PCA-2 | `odemeModal` (:1400) | Ödeme Yap (bahçe/eksper raporu) | hidden `#expertReportId`; `#odemeTutari` number, required (:1414); `#odemeTarihi` date, required (:1418); `#odemeYontemi` select: Nakit / Banka Transferi / Kredi Kartı / Çek / Senet (:1422); `#referansNo` (:1434); `#faturaDosya` file (:1439); hesap seçimi dropdown `#hesapDropdownBtn` + hidden `#selectedHesapId`, `Bakiye`, `Ad`, `Tur` (:1459-1471; banka/kasa listesi saklı `Balance` ile, ctrl :880-920); `#islemTuru` select ×2 (:1482/:1519, banka ve kasa için); `#odemeAciklama` (:1538) | İptal; "Ödemeyi Kaydet" `odemeyiKaydet()` | `OdemeKaydet` multipart (view:3294 → :1192) | W: `ZT_InstallmentPayments`; **`"BankTransactions"` / `"CashTransactions"` (ZT_ öneki YOK, :1251/:1297 — `⚠` muhtemelen hatalı veya eski tablo)**; `ZT_BankIntroduction.Balance -=` (:1284), `ZT_CashIntroduction.Balance -=` (:1329); dosya diske yazılır |
| PCA-3 | `kesimCavusuOdemeModal` (:1553) | Kesim Çavuşu Ödeme Yap | hidden `#kesimCavusuId`; readonly: `#kesimCavusuAdi`, `#uretici`, `#bahceId`, `#plakalar`, `#kesimCavusuToplamBorc`; `#kesimCavusuOdemeTarihi`, required; `#kesimCavusuOdemeYontemi`; `#kesimCavusuReferansNo`; `#kesimCavusuOdemeTutari` (required, readonly); `#kesimCavusuFaturaDosya`; `#kesimCavusuOdemeAciklama` | İptal; Kaydet | `KesimCavusuOdemeYap` (view:2178 → :1366) | `ZT_UsedHarvestManager` UPDATE |
| PCA-4 | `nakliyeOdemeModal` (:1643) | Nakliye Ödeme Yap - Plaka Seçimi | hidden `#nakliyeTransportCompanyId`; `#nakliyeCariAdi`, `#nakliyeToplamBorc` (readonly); plaka tablosu + `#selectAllPlates`; `#nakliyeOdemeTarihi`, required; `#nakliyeOdemeYontemi`; `#nakliyeOdemeTutari` (required, readonly = seçili plakaların toplamı); `#nakliyeReferansNo`; `#nakliyeFaturaDosya`; `#nakliyeOdemeAciklama` | İptal; Kaydet | `GetNakliyeDetails` (view:2613 → :1747), `NakliyeOdemeYap` (view:2779 → :1539, `selectedTruckIds` CSV) | `ZT_ExpertReportTruckExpenses` UPDATE, `TransportTruck` |
| PCA-5 | `malzemeOdemeModal` (:1777) | Malzeme Ödeme Yap | hidden `#malzemeInvoiceId`; `#malzemeCariAdi`, `#malzemeFaturaNo`, `#malzemeToplamBorc` (readonly); `#malzemeOdemeTarihi`, required; `#malzemeOdemeYontemi`; `#malzemeOdemeTutari` (required, readonly); `#malzemeReferansNo`; `#malzemeFaturaDosya`; `#malzemeOdemeAciklama` | İptal; Kaydet | `MalzemeOdemeYap` (:2212) veya `PesticideOdemeYap` (:2385), değişken url ile (view:2891) | `ZT_MaterialInvoice` / `ZT_PesticideInvoice` UPDATE |
| PCA-6 | `firmaModal` (:1860) | (Nakliye) Firma Tanımla | `#plate` readonly (:1875); `#transportCompanyId` select, required (:1879) | İptal; "Firma Tanımla" `firmaTanimlaAjax()` | `FirmaTanimla` (view:1992 → :938) | `TransportTruck` INSERT |
| PCA-7 | `silmeOnayModal` (:1900) | Silme Onayı | yok | İptal; `#onaylaSilBtn` "Evet, Sil" | `OdemeSil` (view:3503 → :2111) | `ZT_InstallmentPayments` vb. |

Ek uçlar:
- `/Payment/SavePayment` (view:2558, başka controller `⚠`)
- `DownloadFile` (:1041), `GetFile` (:1085)

---

## 2. Eşleme tabloları (`ZTO öğe | Blackrose karşılığı | Karar`)

Karar türleri:
- **UI-mevcut-API**: arayüz ZTO görünümüyle yeniden yazılır, mevcut Blackrose uç noktası kullanılır.
- **UI+API-genişlet**: mevcut uç noktaya alan veya parametre eklenir.
- **UI+yeni-API**: yeni uç nokta yazılır, mevcut tablolar kullanılır.
- **UI+yeni-tablo (V22+)**: yeni migration gerekir.
- **ÇIKAR**: taşınmaz.

### 2.1 BankIntroduction

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Kart listesi + istatistik (Index, `GetAccountCards`) | GET `/funds` FC:205 (`kind` + `balance`). Para birimi bazlı toplam ve hesap türü süzgeci yok | UI+API-genişlet (`?kind=BANK&accountType=` filtresi + `/funds/summary` para birimi toplamları) |
| `type` süzgeci (Vadesiz/Kredi/Mevduat/Yatirim) | `fund_account`'ta hesap türü yok | UI+yeni-tablo: V22 `fund_account.account_type` |
| Sparklines (son 20 hareket delta) | `fund_transaction` (V3:57) | UI+yeni-API: GET `/funds/sparklines?ids=` |
| Alan `Bank` (kurum listesi) | `bank_name` (FA, V3) | UI-mevcut-API. Sabit 25 bankalık liste FE'ye sabit olarak taşınır |
| `BankCode` | `code` (FA, değiştirilemez) | UI-mevcut-API. Not: ZTO'da Edit'te değişebiliyor, Blackrose'da değişemez → Edit formunda readonly yapılır |
| `BankName` (Hesap Adı) | `name` | UI-mevcut-API |
| `BranchName` (banka şube adı) | yok | UI+yeni-tablo: V22 `bank_branch_name` |
| `AccountNumber` | yok | UI+yeni-tablo: V22 `account_no` |
| `Iban` | `iban` VARCHAR(34) | UI-mevcut-API (+ FE'de TR/26 karakter doğrulaması) |
| `CurrencyID` (int, `Currency` tablosu) | `currency` CHAR(3), `/currencies` FC:501, değiştirilemez | UI-mevcut-API (ID → ISO kod eşlemesi; Edit'te disabled) |
| `WorkPlaceID` | `branch_id` (zorunlu) | UI-mevcut-API (İş Yeri = branch) |
| `BranchProvinceID` (Şube İli) | yok | `⚠ BULUNAMADI` — ortak şube matrisine bağlı. Önerilen karar: branch üzerinden türetilir. Branch'a `province` eklenmezse ÇIKAR |
| `InitialBalance` | Kolon yok. Kural: bakiye saklanmaz | UI+API-genişlet: `CreateFundRequest`'e `openingBalance` + `openingDate` eklenir → FLS.post `source_type='OPENING'`, `source_id=fund.id`. Edit'te değişiklik = OPENING kaydını ters çevir + yenisini yaz (ayrı `source_id`; bkz. §3) |
| `Balance` (Güncel Bakiye girişi) | hesaplanan `balance` (FinanceRepositories:288) | **ÇIKAR** (giriş alanı). Alan readonly gösterim olarak kalır, değer GET `/funds`'tan gelir |
| `Status` (Aktif/Pasif) | yalnızca `deleted` var | UI+yeni-tablo: V22 `active BOOLEAN` (pasif = seçim listelerinde gizli, hareket yine görünür) |
| `Description` | yok | UI+yeni-tablo: V22 `description` |
| `CreationDate` (kullanıcı girişi) | `created_at` (audit, otomatik) | ÇIKAR (giriş olarak). Readonly gösterim kalır |
| `LinkedCreditID`, `CreditLimit`, `UsedCredit` (Kredi tipi) | yok | Kredi sözleşmesi matrisine bırakılır. Burada ÇIKAR, sadece gösterim alanı ⚠ |
| `allow_negative` | ZTO'da yok (istemci onayı var) | Blackrose alanı korunur. FE'de ekstra checkbox (ZTO formunda yok → **ek alan** olarak en sona konur) |
| BI-1 `deleteModal` + `CheckCanDelete` | DELETE `/funds/{id}` FC:224 (hareket varsa 409 `FUND_HAS_TRANSACTIONS`, FS:95) | UI+API-genişlet: GET `/funds/{id}/can-delete` → `{allowed, reasons[]}` (hareket, settlement, instrument, time_deposit, payment_plan sayıları). Silme: soft delete (Blackrose kuralı) |
| `Delete` GET | DELETE FC:224 | UI-mevcut-API (GET ile silme ÇIKAR) |
| Details sayfası + IntroductionAudit | audit kolonları (`AuditableEntity`) + `audit_log` (V2) | UI+yeni-API: GET `/funds/{id}` (tekil uç yok) + audit özeti |
| BI-2 `bankInstructionModal` | `payment_plan` (V3:181) + `/payment-plans` FC:363-420; `settlement.plan_id` | UI+API-genişlet + V24 (aşağıda). Satır başına bir `payment_plan`: `account_id`=cari, `due_date`, `amount`, `currency`=banka para birimi, `description`. Eklenecekler: `fund_account_id`, `counterparty_iban`, `instruction_id`. Toplu istek: POST `/payment-instructions` → plan satırları + `submit`. Onay akışı mevcut (submit/approve) |
| Manuel IBAN → `ZT_BankAccounts` | cari IBAN tablosu yok `⚠` | UI+yeni-tablo: V24 `account_bank_account` (cari banka hesapları) — cari matrisiyle ortak |
| `GetCustomerAccountsForInstruction` | GET `/accounts` FC:135 | UI-mevcut-API |
| `GetCustomerIbans` | — | UI+yeni-API: GET `/accounts/{id}/bank-accounts?currency=` |

### 2.2 CashIntroduction

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Kart listesi / `GetCashCards` | GET `/funds` (`kind=CASH`) | UI+API-genişlet (`kind` filtresi) |
| `CashCode` / `CashName` / `CurrencyID` / `WorkPlaceID` | `code` / `name` / `currency` / `branch_id` | UI-mevcut-API |
| `BranchProvinceID` | — | ⚠ (bkz. 2.1) |
| `InitialBalance` | OPENING kaydı | UI+API-genişlet (2.1 ile aynı) |
| `Balance` | hesaplanır | ÇIKAR (giriş) |
| `Status`, `Description` | V22 `active`, `description` | UI+yeni-tablo |
| CI-1 `cashDetailModal` (`GetCashDetails`) | GET `/funds/{id}/statement` FC:255 + yeni GET `/funds/{id}` | UI+yeni-API |
| CI-2 `deleteModal` + `CheckCanDelete` | DELETE FC:224 + yeni `can-delete` | UI+API-genişlet |
| Sparklines | yeni `/funds/sparklines` | UI+yeni-API |

### 2.3 BankTransactions / CashTransactions

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Hareket listesi `GetTransactions` (banka, iş yeri, tür, muhasebe tipi, tarih) | GET `/funds/{id}/statement` FC:255 (tek hesap, from/to, sayfalama). Çok hesaplı arama, tür ve kaynak filtresi yok | UI+yeni-API: GET `/funds/transactions?kind&fundId&branchId&direction&sourceType&from&to&page` |
| `TransactionType` Giriş/Çıkış | `direction` IN/OUT | UI-mevcut-API |
| `AccountingType` (15 sabit değer) | `source_type` (MANUAL, TRANSFER, SETTLEMENT, INSTRUMENT, REVERSAL, OPENING*) | UI+API-genişlet: eşleme tablosu FE'de tutulur. Cari Ödeme/Tahsilat→SETTLEMENT; Virman/EFT/Havale/Döviz Bozum/Bankadan Kasaya/Kasadan Bankaya→TRANSFER (alt tür `fund_transfer.transfer_type`'tan); Çek/Senet Tahsil→INSTRUMENT; Masraf/Gelir/Diğer→MANUAL (+ V22 `fund_transaction.category`). Net Maaş / Kredi Kullanım → ilgili modüller yoksa ÇIKAR |
| Bakiye kartları `GetBankBalances` / `GetCashBalances` / `GetSingleBankBalance` / `GetBankDetailInfo` | `/funds` balance (yalnızca toplam). İleri tarihli ayrımı ve tarih aralığı yok | UI+API-genişlet: `/funds?asOf=` + `futureCount` / `futureNet` |
| `filterAccountType` / `GetBanksByAccountType` | V22 `account_type` | UI+API-genişlet |
| BT-2 / CT-1 `transactionDetailModal` (`GetTransactionDetail`) | `FundTransactionResponse` (`FinanceDtos.java:154`). Tekil GET yok | UI+yeni-API: GET `/funds/transactions/{id}` (kaynak belge bağlantısı dahil) |
| "İşlemi Sil" → `DeleteTransactionCascade` (soft delete + tahsilat hard delete) | POST `/funds/transactions/{id}/reverse` FC:239 (yalnızca MANUAL/TRANSFER, FS:119); tahsilat için POST `/settlements/{id}/reverse` FC:323 | UI-mevcut-API. Buton "Ters Kayıt" anlamına gelir: `source_type=SETTLEMENT` ise settlement reverse çağrılır, TRANSFER ise transfer reverse. Hard delete **ÇIKAR** |
| "Tahsilatı Düzenle" | Settlement'ta güncelleme yok | Reverse + yeniden oluşturma (UI ZTO'daki gibi; arka planda iki çağrı) — UI+API-genişlet (POST `/settlements/{id}/replace` atomik) |
| BT-1 `allPaymentsCompletedModal` | — | UI-mevcut-API (saf UI) |
| BT-3 / CT-2 faaliyet raporu modalı + `ActivityReport` (FIFO eşleşme) | `/funds/{id}/statement` (yürüyen bakiye) | UI+yeni-API: GET `/funds/{id}/activity-report?from&to` (FIFO hesabı sunucuda, salt okuma) |
| BT-4 `instructionPaymentSelectionModal` + Session `PendingInstructionData` | `payment_plan` pay FC:414 (`/payment-plans/{id}/pay` → settlement), postpone FC:407 | UI-mevcut-API (Session yerine `?planIds=` query + GET `/payment-plans?status=APPROVED&fundAccountId=`) |
| `PostponeInstructionPayment(s)` | POST `/payment-plans/{id}/postpone` FC:407 | UI-mevcut-API (çoklu çağrı veya yeni toplu uç) |
| `addPaymentModal` / `addCollectionModal` / `editCollectionModal` / `postPaymentPlanningModal` | POST `/payments` FC:296, `/collections` FC:313 (`fundAccountId`, `method`) | Ödeme/tahsilat matrisinde ele alınır. Burada yalnızca ön-seçili `fundAccountId` ile açılır |
| `CalculateFilteredSummary` | — | UI+yeni-API (liste ucuna `summary=true`) |
| `exportToExcel` (CSV) / print | — | UI (istemci tarafı; SheetJS veya CSV) |
| Maaş maskeleme `***` | yetki `FINANCE_VIEW` | ÇIKAR (personel/maaş modülü yok) ⚠ |
| `CashExtract` / `BankExtract` (yazdırılabilir ekstre) | `/funds/{id}/statement` (`openingBalance` + lines) | UI-mevcut-API (yazdırma sayfası, ZTO HTML'i) |
| `AddTransaction` / `DeleteTransaction` (çağrılmayan uçlar) | POST `/funds/{id}/transactions` FC:231 | ÇIKAR (ölü kod). Manuel hareket gerekiyorsa FundsPage diyaloğu kullanılır |
| Statik `CreateBankTransaction` / `CreateCashTransaction` (11 + 8 dış çağıran) | `FundLedgerService.post` (FLS:48) | Blackrose kuralı uygulanır: her modül kendi servisinde FLS.post çağırır (bkz. §3) |

### 2.4 BankStatement (transfer merkezi)

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sekme "Yeni Transfer" — Virman/EFT/Havale (aynı para birimi) | POST `/funds/transfers` FC:246 (`TransferRequest`: from, to, money, date, description, exchangeRate; `Idempotency-Key`) | UI+API-genişlet: `transferType`, `documentNo`, `reasonType`, masraf alanları ve `fund_transfer` başlık kaydı eklenir (V23) |
| Banka↔Kasa, Kasa↔Kasa | aynı uç (kind kontrolü yok) | UI+API-genişlet (`transferType` BANK_TO_CASH / CASH_TO_BANK / CASH_TO_CASH) |
| `GetBanksByWorkPlace` / `GetCashesByWorkPlace` | GET `/funds` (istemci süzer) | UI+API-genişlet (`?branchId&kind&accountType=DEMAND`) |
| **Döviz Bozum** (farklı para birimi; kur1, kur2, çapraz kur, `*` / `/`, 3 hesaplama modu) | FS:141 yalnızca aynı para birimi; FLS `CURRENCY_MISMATCH` | UI+yeni-tablo (V23) + API genişletme. `FundService.fxTransfer`: OUT kaynak `Money(src, srcCur)`, IN hedef `Money(tgt, tgtCur)`. Her bacağın `tl_amount`'u kendi kuruyla (TCMB veya manuel) dondurulur. TL farkı = kur farkı → `fund_transfer.fx_diff_tl` saklanır (rapor). İsteğe bağlı olarak kur farkı gelir/gider kaydı (V26 `fin_income_expense`). Hesaplama modu yalnızca UI'dır, sunucu `sourceAmount`, `targetAmount` ve `rate`'i doğrular (\|src×rate − tgt\| ≤ yuvarlama) |
| KMV %, Komisyon, Masraf, Masraf Bankası, BankCharges | yok | UI+yeni-tablo: V23 `fund_transfer_cost`. Her masraf kalemi ayrı bir `fund_transaction` olur (OUT, `source_type='TRANSFER_COST'`, `source_id=cost.id`). Böylece unique kısıt aynı hesapta birden çok masrafa izin verir |
| Tahsilat kaynaklı bozum (`exchangeCustomerAccount`, `exchangeCollection`, `CollectionId`) | `settlement` (type=COLLECTION, `fund_account_id`) | UI+yeni-tablo: V23 `fund_transfer_source(kind='SETTLEMENT')`. Bozulan ve kalan tutar **hesaplanır** (Σ used_amount); ZTO'daki gibi `ExchangedAmount` / `RemainingExchangeAmount` saklanmaz |
| Sipariş dağılımı (`ZT_AccountCollectionOrders` → `ZT_Orders`, ürün) | Lojistikte sipariş yok (karşılığı sefer/shipment) | **ÇIKAR** (sipariş bazlı tahsis). ⚠ İstenirse V23'te `fund_transfer_source.shipment_id` ile sefer bazlı tahsis eklenebilir; varsayılan önerilen karar ÇIKAR. Tablo UI'da gizlenir |
| Önceki bozum kaynakları (`ZT_ExchangeBreakSource`, `GetPreviousBreaksForSource`) | — | UI+yeni-tablo: V23 `fund_transfer_source(kind='TRANSFER')` + GET `/funds/transfers/fx-sources?fundId&currency` |
| `GetCustomerAccountsWithForeignCollections` / `GetCollectionsForExchange` / `GetCollectionDetailForExchange` | GET `/collections` FC:306 (süzgeç kısıtlı) | UI+yeni-API: GET `/funds/transfers/fx-collection-candidates?fundId&currency` |
| `transferReasonType` (DebtPaid / LoanGiven) + iş yerleri arası cari yansıtma (İş Yeri Firması carisi) | `LedgerService.post` (`account_transaction`), `account.branch_id` | UI+API-genişlet + V25: `account.represents_branch_id`. Transfer kaydında aynı transaction içinde kaynak ve hedef iş yeri carilerine `LedgerService` kaydı (`source_type='TRANSFER_INTERBRANCH'`, `source_id=transfer.id`). Transfer ters çevrilince `reverseSource` |
| `CleanupDuplicateCariRecords`, `SyncTransferToCari`, BS-2 `bulkSyncCariModal` | idempotency (`UNIQUE(source_type, source_id)`) mükerrer kaydı imkânsız kılar | **ÇIKAR** (bakım uçlarına gerek yok) |
| Transfer kodu `VRM-2026-000123` (COUNT+1) | `code` üretici yok | UI+yeni-tablo: V23 `fund_transfer.code` + sequence (`fund_transfer_code_seq` veya tür+yıl sayaç tablosu). Yarış koşulu sequence ile giderilir |
| Sekme "Transferler" (`GetTransfers`, `GetTransferSummary`) | — | UI+yeni-API: GET `/funds/transfers?branchId&type&from&to&q&page`, GET `/funds/transfers/summary` |
| BS-4…9 edit modalları (`GetTransferForEdit`, `UpdateTransfer`) | Yerinde güncelleme yasak | UI+yeni-API: GET `/funds/transfers/{id}`, POST `/funds/transfers/{id}/replace` → atomik olarak eski transferin `reverseSource('TRANSFER', id)` çağrısı + yeni transfer (`replaces_transfer_id`). Modallar ZTO'daki alanlarla aynen kalır |
| BS-3 `editDovizBozumModal` | aynı `replace` + kaynak listesi yeniden yazılır | UI+yeni-API |
| BS-10 `deleteTransferModal` (+ bağımlılık kontrolü, silme nedeni) | FS:119 `reverseManual` (TRANSFER iki bacağı da ters çevirir) | UI+API-genişlet: POST `/funds/transfers/{id}/reverse` (`reason`; masraf ve cari yansıma da ters çevrilir). GET `/funds/transfers/{id}/dependents` (bu transferi kaynak alan bozumlar → engel) |
| BS-11 `transferResultModal` | `TransferResponse` | UI-mevcut-API (yanıta code, legs, costs eklenir → genişlet) |
| BS-12 `negativeBalanceConfirmModal` | `allow_negative` + `INSUFFICIENT_FUNDS` (FLS:129) | UI+API-genişlet. Kural: sunucu `allow_negative=false` iken reddeder. Modal yalnızca `allow_negative=true` hesaplarda uyarı olarak gösterilir; aksi halde hata mesajı. "Evet, Devam Et" ile sunucu kuralı aşılamaz |
| Sekme "Banka Ekstresi" (`GetStatement`, `GetStatementCount`, `GetSummaryCards`, `GetBankBalances`) | `/funds/{id}/statement` (tek hesap) | UI+API-genişlet: statement'a `q` (metin), çok hesap / para birimi filtresi, özet kartları ucu |
| Sekme "Kasa Ekstresi" | aynı (`kind=CASH`) | UI+API-genişlet |
| `BankExtract.cshtml` | statement | UI-mevcut-API |
| BS-1 `exchangeBreakReportModal` + `ExchangeBreakReport` + `GetExchangeBreakData` | — | UI+yeni-API: GET `/funds/transfers/fx-report?from&to` (V23 tablolarından) |
| Banka ekstresi dosya içe aktarma (ZTO'da YOK) | `BankStatementService` CSV + eşleşme, `/integration/bank/*` | Blackrose özelliği olarak kalır. ZTO görünümlü sayfada "Ekstre Mutabakatı" bağlantısı verilir (ek, ZTO'da yok) |

### 2.5 TimeDeposits

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Index listesi, istatistik (`TimeDepositStatsDto`), durum filtresi | — | UI+yeni-tablo (V24 `time_deposit`) + GET `/finance/time-deposits?status&q`, GET `/finance/time-deposits/stats` |
| Add formu (tüm alanlar) | — | UI+yeni-tablo + POST `/finance/time-deposits` |
| Kaynak hesap (`sourceBankId`, `GetFilteredBanks`) | GET `/funds?kind=BANK&accountType=DEMAND&currency&branchId` | UI+API-genişlet |
| Mevduat hesabı otomatik açma (`AccountType='Mevduat'`) | `fund_account` (V22 `account_type='DEPOSIT'`) | UI+API-genişlet: servis `FundService.create` çağırır (kod `VMD-…`) |
| Açılış hareketleri (Çıkış kaynak / Giriş mevduat) | FLS.post ×2 `source_type='TIME_DEPOSIT_OPEN'`, `source_id=deposit.id` | UI+yeni-API |
| Bakiye kontrolü (saklı `Balance`) | FLS `ensureSufficient` (hesaplanan) | Blackrose kuralı uygulanır |
| TD-1 `collectModal` (Faiz / VadeSonu) + satır içi kısmi tahsilat | — | UI+yeni-tablo: V24 `time_deposit_event` + POST `/finance/time-deposits/{id}/collect` |
| TD-2 `breakModal` (erken bozma) | — | UI+yeni-tablo + POST `/finance/time-deposits/{id}/break` |
| `CalculateInterestPreview` | — | UI+yeni-API: GET `/finance/time-deposits/preview` (FE de hesaplar; sunucu doğrular) |
| `GetMaturedDeposits` | — | UI+yeni-API (`status=ACTIVE&maturedBy=today`); vadesi gelen mevduat bildirimi isteğe bağlı |
| `ZT_FinIncomeExpense` faiz geliri | yok | UI+yeni-tablo: V26 `fin_income_expense` |
| `MaturityAction` AutoRenew / AutoTransfer | — | V24 alanı saklanır. Zamanlanmış iş (scheduler) ilk sürümde yok → yalnızca Manual çalışır ⚠ (UI seçenekleri gösterilir, "yakında" notu) |

### 2.6 PurchaseCurrentAccount

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Bahçe/eksper raporu borçları, `odemeModal` (`OdemeKaydet`) | — | **ÇIKAR**: tarım (ZT_ExpertReport, bahçe, hasat) lojistikte yok |
| `kesimCavusuOdemeModal` | — | **ÇIKAR** (hasat/kesim çavuşu) |
| `nakliyeOdemeModal` (nakliye firmasına plaka bazlı ödeme) | Taşeron nakliyeci karşılığı: `account` (tedarikçi) + `trip_cost` / `freight_invoice` (V7) + POST `/payments` FC:296 | UI-mevcut-API (önerilir): "Taşeron Nakliye Ödemesi" olarak tutulur; plaka listesi → taşeron sefer maliyetleri; ödeme → settlement (`fundAccountId`, `method`). ⚠ `trip_cost` ↔ settlement eşleştirmesi için ödeme/cari matrisinde karar verilmeli |
| `malzemeOdemeModal` (malzeme/ilaç faturası) | `purchase_invoice` (V3) + `/payment-plans/{id}/pay` veya `/payments` | UI-mevcut-API (Alış faturası ödemesi). İlaç (pesticide) **ÇIKAR** |
| `firmaModal` (plaka → nakliye firması) | `vehicle` (V6) / taşeron araç | ÇIKAR (filo matrisinde) |
| `odemelerModal`, `silmeOnayModal` (`OdemeSil`) | GET `/payments`; silme yerine POST `/settlements/{id}/reverse` | UI-mevcut-API (silme = ters kayıt) |
| Ödeme yöntemleri Nakit / Banka Transferi / Kredi Kartı / Çek / Senet | `settlement.method` CASH / BANK / CHECK | UI+API-genişlet (Kredi Kartı → BANK + alt tip veya ÇIKAR; Senet → instrument). ⚠ |
| Fatura/doküman yükleme | `stored_file` (V5) | UI+API-genişlet (settlement'a `file_id`) |
| `BakiyeGosterSetting` (`ZT_Setting`) | `finance_settings` (V4) | UI+API-genişlet (`show_balances` alanı) veya localStorage ile kullanıcı tercihi. Önerilen karar: kullanıcı tercihi (FE) |
| `"BankTransactions"` / `"CashTransactions"` öneksiz INSERT + `Balance -=` | FLS.post | Blackrose kuralı: ÇIKAR (bkz. §3) |

---

## 3. Davranış çatışmaları ve çözüm (Blackrose kuralı geçerlidir)

| # | Çatışma | ZTO davranışı (kanıt) | Çözüm |
|---|---|---|---|
| C1 | **Saklı `Balance` / hesaplanan bakiye** | `ZT_BankIntroduction.Balance` / `ZT_CashIntroduction.Balance` formda kullanıcıdan alınır (Add:169, CashAdd:116). Yalnızca TimeDeposits (ctrl :1359-1368) ve PurchaseCurrentAccount (:1284, :1329) günceller. Liste ise `InitialBalance + Σ` ile hesaplar (BI ctrl :393-398). TimeDeposits yeterlilik kontrolünü saklı `Balance` ile yapar (:1262) → tutarsız | Blackrose: bakiye yalnızca `fund_transaction`'dan hesaplanır (FinanceRepositories:288-332). "Güncel Bakiye" alanı readonly gösterime dönüşür. Kolon taşınmaz; göç sırasında ZTO `Balance` değeri yok sayılır |
| C2 | **InitialBalance kolonu** | Hesap kaydında saklanır ve bakiyeye eklenir | Açılış bakiyesi bir harekettir: FLS.post (IN veya OUT, `source_type='OPENING'`, `source_id`=fund id veya opening id, tarih=açılış tarihi). Düzenleme: eski OPENING ters çevrilir + yeni OPENING yazılır. Unique kısıt nedeniyle `source_id` her düzenlemede yeni bir `fund_opening.id` olmalıdır → V22 `fund_opening` tablosu (id, fund_account_id, amount, direction, opening_date, status) |
| C3 | **Status=false soft delete / hard delete / ters kayıt** | Tanım silme `Status=false` (BI :747, CI :757). Hareket silme soft delete (BT :1696, CT :819). `DeleteTransactionCascade` tahsilatı **hard delete** eder (:1608-1637). BankStatement `CleanupDuplicateCariRecords` hard delete yapar (:2833-2880). Transfer silme: hareketler `Status=false` + açıklama eki (:3880-3890) | Tanım: `deleted=true` (Blackrose soft delete; hareket varsa 409). Pasifleştirme: V22 `active=false`. Hareket ve belge: **asla silinmez veya güncellenmez**; `reverse` / `reverseSource` ile ters kayıt (FLS:93-127). UI'daki "Sil" butonları "Ters Kaydet/İptal" etiketini korur ama ZTO metni ("İşlemi Sil") istenirse aynı bırakılır, alt metinde "ters kayıt oluşturulur" yazar. Ekstrede ters kayıt satırları görünür; ZTO'da silinen satır kayboluyordu → davranış farkı kullanıcıya bildirilmeli |
| C4 | **Transfer düzenleme (UpdateTransfer)** | `ZT_BankTransfers` ve bağlı hareketler yerinde UPDATE edilir (:2225, :2285, :2296, :2312) | Yerinde güncelleme yok: `replace` = ters kayıt + yeni transfer, aynı DB transaction'ında. Yeni transfer `replaces_transfer_id` ile bağlanır. UI modalları aynı kalır |
| C5 | **Statik `CreateBankTransaction` / `CreateCashTransaction`** (BT :1740, 11 controller; CT :863, 8 controller); BankStatement private `InsertBankTransaction` (:4158); TimeDeposits private `CreateBankTransaction` (:1321); PurchaseCurrentAccount ham INSERT | Transaction parametresi almaz, `bool` döner, idempotent değildir. ReferenceID rastgele 6 hane (:4186-4203) | Tek yazıcı **FLS.post** (FLS:48). Her modül kendi belge kimliğini `source_type` / `source_id` olarak verir: SETTLEMENT, TRANSFER, TRANSFER_COST, TIME_DEPOSIT_*, OPENING, INSTRUMENT. Çağrı aynı Spring `@Transactional` içinde yapılır. ZTO'daki `AccountingType` metni `description` / `category` alanına düşer |
| C6 | **Döviz bozum = farklı para birimi** | Tek `ZT_BankTransfers` satırı + iki hareket. `IsTryCurrency` CurrencyID=1 varsayımı (:4640) | ISO kod (`TRY`). Her bacak kendi para biriminde, `tl_amount` kendi kuruyla dondurulur. Kur farkı TL olarak saklanır. FLS para birimi kontrolü korunur (her bacak kendi hesabının para biriminde olduğu için geçer) |
| C7 | **Negatif bakiye** | İstemci tarafı onay modalı (BS-12) ile eksiye düşmeye izin verir; talimatta `confirm()` | Sunucu `allow_negative` (FA). `false` ise `INSUFFICIENT_FUNDS` (422). Modal yalnızca `allow_negative=true` hesaplarda gösterilir. Talimat (ödeme planı) bakiye düşürmez → uyarı olarak kalır |
| C8 | **Transfer kodu COUNT+1** | Yarış koşulu (:3692-3715); TimeDeposits `MAX+1`, transaction dışında (:1207-1240) | Sequence veya kilitli sayaç (V23 / V24) |
| C9 | **İş yerleri arası cari yansıtma ve onarım uçları** | Transfer kodu ile eşleştirme, eksik veya mükerrer kayıt için bakım uçları | Aynı transaction içinde `LedgerService.post` (idempotent) → bakım uçları gereksiz (ÇIKAR) |
| C10 | **Tahsilat bozum durumu saklanır** | `ZT_AccountCollections.ExchangedAmount` / `RemainingExchangeAmount` / `ExchangeStatus`; silmede geri alma (:3978) | Hesaplanan değer: Σ `fund_transfer_source.used_amount` (yalnızca POSTED transferler). Ters kayıtta otomatik düşer |
| C11 | **İleri tarihli hareketler bakiye dışı** | BI :336-356, CI :232-250 | Blackrose `/funds` tüm hareketleri toplar → `asOf` parametresi + `futureNet` (2.3) |
| C12 | **Antiforgery / GET ile silme** | `Delete` GET, çoğu POST'ta token yok | REST + JWT + izinler: FINANCE_MANAGE (tanım), FINANCE_PAYMENT_CREATE (hareket), FINANCE_APPROVE (talimat onayı) |
| C13 | **İş yeri filtresi zorlanmıyor** | Parametre isteğe bağlı | Blackrose branch kapsamı ⚠ (ortak altyapı matrisi). Bu sayfalarda `branchId` filtresi verilir |
| C14 | **Bakiye işaret kuralı** | Banka: `Çek Tahsil` / `Çek Ödeme` + "tür boş ise işarete bak" (BI :314-335); kasa: yalnızca `Giriş` / `Çıkış` | `direction` IN/OUT tek kural. Göçte (migrasyon) ZTO kuralı uygulanarak direction türetilir |

---

## 4. Gerekli backend eklemeleri (önerilen migration'lar)

> Numaralar **öneridir**. Diğer matrisler (mx_1, mx_3…) de V22+ önerecek; birleştirmede sıralama koordine edilmelidir. Tüm tablolar Blackrose standardına uyar: UUID PK, `NUMERIC(19,4)` tutar, `CHAR(3)` para birimi, audit kolonları (`created_by`, `created_at`, `updated_by`, `updated_at`), `deleted BOOLEAN DEFAULT FALSE`.

### V22__fund_account_details.sql
```
ALTER TABLE fund_account
  ADD COLUMN account_type     VARCHAR(20)  NOT NULL DEFAULT 'DEMAND',  -- DEMAND(Vadesiz)/CREDIT/DEPOSIT/INVESTMENT (CASH için DEMAND)
  ADD COLUMN account_no       VARCHAR(40),
  ADD COLUMN bank_branch_name VARCHAR(100),
  ADD COLUMN description      VARCHAR(500),
  ADD COLUMN active           BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE fund_transaction ADD COLUMN category VARCHAR(40);       -- ZTO AccountingType (Masraf/Gelir/Diğer...) — yalnız bilgi
CREATE TABLE fund_opening (
  id UUID PK, fund_account_id UUID NOT NULL REFERENCES fund_account(id),
  direction VARCHAR(10) NOT NULL, amount NUMERIC(19,4) NOT NULL CHECK (amount>0),
  opening_date DATE NOT NULL, status VARCHAR(20) NOT NULL,          -- POSTED/REVERSED
  audit..., deleted);
```
- Servis: `CreateFundRequest` ve `UpdateFundRequest` DTO'larına `accountType`, `accountNo`, `bankBranchName`, `description`, `active`, `openingBalance`, `openingDate` eklenir. Açılış kaydı FLS.post ile yazılır (`source_type='OPENING'`, `source_id=fund_opening.id`).
- Yeni uçlar:
  - GET `/funds/{id}`
  - GET `/funds/{id}/can-delete`
  - GET `/funds/sparklines`
  - GET `/funds/summary`
  - GET `/funds/transactions` (çok hesaplı arama)
  - GET `/funds/transactions/{id}`
  - GET `/funds/{id}/activity-report`
  - GET `/funds` için `kind`, `accountType`, `branchId`, `currency`, `active`, `asOf` filtreleri

### V23__create_fund_transfer.sql
```
CREATE SEQUENCE fund_transfer_code_seq;
CREATE TABLE fund_transfer (
  id UUID PK, code VARCHAR(30) NOT NULL UNIQUE,
  transfer_type VARCHAR(20) NOT NULL,      -- VIREMENT/EFT/WIRE/FX_EXCHANGE/BANK_TO_CASH/CASH_TO_BANK/CASH_TO_CASH
  transfer_date DATE NOT NULL,
  source_fund_id UUID NOT NULL REFERENCES fund_account(id), source_amount NUMERIC(19,4) NOT NULL, source_currency CHAR(3) NOT NULL,
  target_fund_id UUID NOT NULL REFERENCES fund_account(id), target_amount NUMERIC(19,4) NOT NULL, target_currency CHAR(3) NOT NULL,
  rate1 NUMERIC(19,6), rate2 NUMERIC(19,6), is_cross_rate BOOLEAN NOT NULL DEFAULT FALSE,
  effective_rate NUMERIC(19,6), calc_operation CHAR(1), calc_mode VARCHAR(20),
  fx_diff_tl NUMERIC(19,4),               -- TL(IN) − TL(OUT)
  reason_type VARCHAR(20),                -- DEBT_PAID / LOAN_GIVEN (iş yerleri arası)
  document_no VARCHAR(50), description VARCHAR(500),
  status VARCHAR(20) NOT NULL,            -- POSTED/REVERSED
  replaces_transfer_id UUID REFERENCES fund_transfer(id),
  reversal_reason VARCHAR(500), idempotency_key VARCHAR(100) UNIQUE,
  audit..., deleted);
CREATE TABLE fund_transfer_cost (
  id UUID PK, transfer_id UUID NOT NULL REFERENCES fund_transfer(id),
  cost_kind VARCHAR(20) NOT NULL,         -- COMMISSION/FEE/KMV/BANK_CHARGE
  fund_account_id UUID NOT NULL REFERENCES fund_account(id),
  rate NUMERIC(19,6), base_amount NUMERIC(19,4),
  amount NUMERIC(19,4) NOT NULL CHECK (amount>0), currency CHAR(3) NOT NULL,
  expense_item_id UUID REFERENCES expense_item(id), audit..., deleted);
CREATE TABLE fund_transfer_source (       -- döviz bozum izlenebilirliği (ZT_ExchangeBreakSource karşılığı)
  id UUID PK, transfer_id UUID NOT NULL REFERENCES fund_transfer(id),
  source_kind VARCHAR(20) NOT NULL,       -- SETTLEMENT / TRANSFER
  settlement_id UUID REFERENCES settlement(id), source_transfer_id UUID REFERENCES fund_transfer(id),
  used_amount NUMERIC(19,4) NOT NULL CHECK (used_amount>0), audit..., deleted,
  CHECK ((source_kind='SETTLEMENT' AND settlement_id IS NOT NULL) OR (source_kind='TRANSFER' AND source_transfer_id IS NOT NULL)));
CREATE INDEX ON fund_transfer (transfer_date, transfer_type);
```
- Kayıtlar:
  - Bacaklar: `source_type='TRANSFER'`, `source_id=transfer.id` (mevcut FS davranışıyla uyumlu)
  - Masraflar: `source_type='TRANSFER_COST'`, `source_id=cost.id`
  - İş yerleri arası cari yansıma: `LedgerService` `source_type='TRANSFER_INTERBRANCH'`
- Uçlar:
  - POST `/funds/transfers` (genişletilmiş istek)
  - GET `/funds/transfers`, GET `/funds/transfers/summary`, GET `/funds/transfers/{id}`
  - POST `/funds/transfers/{id}/replace`
  - POST `/funds/transfers/{id}/reverse`
  - GET `/funds/transfers/{id}/dependents`
  - GET `/funds/transfers/fx-sources`, GET `/funds/transfers/fx-collection-candidates`
  - GET `/funds/transfers/fx-report`
- `FS.reverseManual` TRANSFER bacaklarını zaten ters çeviriyor (FS:119). Masraf ve cari yansımaları da `reverseSource` ile ters çevrilecek şekilde genişletilir.

### V24__create_time_deposit_and_instruction.sql
```
CREATE SEQUENCE time_deposit_code_seq; CREATE SEQUENCE time_deposit_event_code_seq;
CREATE TABLE time_deposit (
  id UUID PK, code VARCHAR(30) NOT NULL UNIQUE,             -- VMD-yyyy-NNNN
  deposit_fund_id UUID NOT NULL REFERENCES fund_account(id), -- account_type='DEPOSIT'
  source_fund_id UUID NOT NULL REFERENCES fund_account(id),
  branch_id UUID NOT NULL REFERENCES branch(id), currency CHAR(3) NOT NULL,
  deposit_type VARCHAR(20) NOT NULL,                         -- STANDARD/ACCUMULATION/TIERED
  principal NUMERIC(19,4) NOT NULL CHECK (principal>0),
  annual_rate NUMERIC(9,4) NOT NULL, withholding_rate NUMERIC(9,4) NOT NULL DEFAULT 15, net_rate NUMERIC(9,4),
  start_date DATE NOT NULL, maturity_date DATE NOT NULL, duration_days INT NOT NULL,
  gross_interest NUMERIC(19,4) NOT NULL, withholding_tax NUMERIC(19,4) NOT NULL,
  net_interest NUMERIC(19,4) NOT NULL, maturity_amount NUMERIC(19,4) NOT NULL,   -- açılışta hesaplanan beklenti (sözleşme değeri)
  maturity_action VARCHAR(20) NOT NULL DEFAULT 'MANUAL',    -- MANUAL/AUTO_RENEW/AUTO_TRANSFER
  auto_renewal_days INT, status VARCHAR(20) NOT NULL,       -- ACTIVE/CLOSED/BROKEN/CANCELLED
  closed_date DATE, description VARCHAR(500), notes VARCHAR(1000), audit..., deleted);
CREATE TABLE time_deposit_event (                           -- ZT_InterestCollections karşılığı
  id UUID PK, code VARCHAR(30) NOT NULL UNIQUE,             -- FTH-yyyy-NNNN
  deposit_id UUID NOT NULL REFERENCES time_deposit(id),
  event_type VARCHAR(20) NOT NULL,                          -- INTEREST/MATURITY/EARLY_BREAK
  event_date DATE NOT NULL, target_fund_id UUID NOT NULL REFERENCES fund_account(id),
  gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0, withholding_tax NUMERIC(19,4) NOT NULL DEFAULT 0,
  commission NUMERIC(19,4) NOT NULL DEFAULT 0, penalty NUMERIC(19,4) NOT NULL DEFAULT 0,
  early_break_rate NUMERIC(9,4), actual_days INT,
  net_interest NUMERIC(19,4) NOT NULL DEFAULT 0, principal_returned NUMERIC(19,4) NOT NULL DEFAULT 0,
  description VARCHAR(500), status VARCHAR(20) NOT NULL,    -- POSTED/REVERSED
  audit..., deleted);
-- Banka ödeme talimatı (BI-2)
CREATE TABLE payment_instruction (
  id UUID PK, code VARCHAR(30) UNIQUE, fund_account_id UUID NOT NULL REFERENCES fund_account(id),
  branch_id UUID NOT NULL REFERENCES branch(id), currency CHAR(3) NOT NULL,
  instruction_date DATE NOT NULL, description VARCHAR(500), status VARCHAR(20) NOT NULL, audit..., deleted);
ALTER TABLE payment_plan
  ADD COLUMN fund_account_id UUID REFERENCES fund_account(id),
  ADD COLUMN instruction_id  UUID REFERENCES payment_instruction(id),
  ADD COLUMN counterparty_bank_account_id UUID;              -- account_bank_account FK (aşağıda)
CREATE TABLE account_bank_account (                         -- ZT_BankAccounts (cari IBAN) karşılığı — cari matrisiyle ortak
  id UUID PK, account_id UUID NOT NULL REFERENCES account(id),
  holder_name VARCHAR(200) NOT NULL, iban VARCHAR(34) NOT NULL, bank_name VARCHAR(100), branch_name VARCHAR(100),
  currency CHAR(3), description VARCHAR(500), active BOOLEAN NOT NULL DEFAULT TRUE, audit..., deleted);
CREATE UNIQUE INDEX account_bank_account_iban_uq ON account_bank_account(iban) WHERE deleted=FALSE;
```
- Vadeli mevduat yaşam döngüsü (tüm `fund_transaction` kayıtları FLS ile yazılır):
  1. **Açılış**:
     - OUT `source_fund`, IN `deposit_fund` (`source_type='TIME_DEPOSIT_OPEN'`, `source_id=deposit.id`). Aynı `source_id` iki farklı hesapta kullanılır; unique kısıt fund bazında olduğu için sorun yok.
     - Vadesiz/mevduat hesabı yoksa servis `FundService.create(kind=BANK, account_type=DEPOSIT)` ile açar.
  2. **Faiz tahsilatı** (kısmi olabilir):
     - Event INTEREST → IN `target_fund` net faiz (`source_type='TIME_DEPOSIT_EVENT'`, `source_id=event.id`).
     - Gelir kaydı `fin_income_expense` (V26).
     - Tahsil edilen ve kalan faiz event'lerden **hesaplanır**.
  3. **Vade sonu**:
     - Event MATURITY → OUT `deposit_fund` anapara; IN `target_fund` anapara + kalan net faiz.
     - Mevduat durumu CLOSED.
  4. **Erken bozma**:
     - Event EARLY_BREAK → faiz = anapara × oran × gün / 365, stopaj düşülür, ceza çıkarılır.
     - OUT `deposit_fund` anapara; IN `target_fund` (anapara + net − ceza).
     - Gelir: net − ceza > 0 ise gelir, < 0 ise gider.
     - Mevduat durumu BROKEN.
  5. **İptal / düzeltme**: Event REVERSED → `reverseSource('TIME_DEPOSIT_EVENT', event.id)`. Mevduat durumu yeniden hesaplanır.
  6. Hedef hesabın para birimi mevduatla aynı olmalı (ZTO `ValidateTargetBankCurrency` :1098 kuralı korunur; FLS `CURRENCY_MISMATCH` zaten zorlar).
  7. AUTO_RENEW / AUTO_TRANSFER: `RateRefresher` benzeri zamanlanmış bir iş (`@Scheduled`) ile çalışır. İlk sürümde ⚠ ertelenebilir.
- Uçlar (`/api/v1/finance/time-deposits`):
  - GET liste, GET `/stats`, GET `/{id}`, GET `/preview`, POST oluşturma
  - POST `/{id}/collect`, POST `/{id}/break`
  - POST `/events/{id}/reverse`
- Talimat ucu: POST `/payment-instructions` → plan satırları + submit; GET `/payment-instructions/{id}`.
- Cari IBAN uçları: GET/POST `/accounts/{id}/bank-accounts`.

### V25__account_branch_link.sql
```
ALTER TABLE account ADD COLUMN represents_branch_id UUID REFERENCES branch(id);  -- "İş Yeri Firması" carisi
CREATE UNIQUE INDEX account_represents_branch_uq ON account(represents_branch_id) WHERE deleted=FALSE AND represents_branch_id IS NOT NULL;
```
İş yerleri arası transferde cari yansıtma için kullanılır (2.4).

### V26__create_fin_income_expense.sql
```
CREATE TABLE fin_income_expense (
  id UUID PK, branch_id UUID NOT NULL REFERENCES branch(id),
  direction VARCHAR(10) NOT NULL,          -- INCOME/EXPENSE
  category VARCHAR(40) NOT NULL,           -- INTEREST/FX_DIFF/BANK_CHARGE/PENALTY...
  source_type VARCHAR(40) NOT NULL, source_id UUID NOT NULL,
  transaction_date DATE NOT NULL, amount NUMERIC(19,4) NOT NULL CHECK (amount>0), currency CHAR(3) NOT NULL,
  exchange_rate NUMERIC(19,6) NOT NULL, rate_date DATE NOT NULL, tl_amount NUMERIC(19,4) NOT NULL,
  fund_account_id UUID REFERENCES fund_account(id), description VARCHAR(500),
  audit..., deleted, UNIQUE (source_type, source_id, category));
```
Bu tablo nakit hareketi değildir, bilgi amaçlı gelir/gider defteridir. Nakit kaydı `fund_transaction`'da tutulur. Gelir/gider tablosunun tek yazıcısı ayrı bir `IncomeExpenseService` olmalıdır.

### İzin (permission)
- Yeni izin gerekmez: `FINANCE_VIEW`, `FINANCE_MANAGE`, `FINANCE_PAYMENT_CREATE` ve `FINANCE_APPROVE` yeterli.
- ⚠ Vadeli mevduat için ayrı bir `FINANCE_DEPOSIT_MANAGE` izni isteğe bağlı olarak eklenebilir.

---

## 5. JS kütüphaneleri → React karşılıkları

Blackrose `package.json` içeriği: MUI 6, react-query 5, react-hook-form, zod, i18next. **Olmayanlar:** MUI X DataGrid, date picker, chart, dayjs, axios.

| ZTO kütüphanesi | Kullanıldığı yer | React karşılığı (öneri) |
|---|---|---|
| jQuery 3.6.0 (`$.ajax`, `$.get`, DOM) | tüm view'lar | `fetch` istemcisi `BR-FE\api\client.ts` (`apiRequest` :155) + react-query |
| Bootstrap 4 modal (`data-dismiss`, `.modal('show')`) | tüm modallar | ZTO Bootstrap CSS'i kapsayıcı (`.zto-scope`) altında kopyalanır. Davranış için kendi `ZtoModal` bileşeni (portal + backdrop + `show`) veya `react-bootstrap` 2.x (BS5). ZTO BS4 sınıfları (`data-dismiss`, `close`) kullandığı için CSS uyumu açısından basit bir kendi bileşeni önerilir |
| select2 4.1.0-rc.0 + select2-bootstrap-5-theme (BankIntroduction, BankStatement'ta yoğun) | arama yapılabilir select, optgroup | MUI `Autocomplete` (`groupBy` ile optgroup karşılanır) veya `react-select` 5. ZTO görünümü için `react-select` + ZTO stilleri önerilir |
| `searchable-select.js` (payments/collections) | ödeme/tahsilat modalları | aynı (`react-select`) |
| DataTables 1.13.7 + responsive + buttons (html5) + JSZip | BankTransactions, CashTransactions listeleri | Blackrose `DataTable` (`common.tsx:278`) veya TanStack Table v8. Excel çıktısı için SheetJS (`xlsx`) veya CSV üretici (ZTO zaten CSV üretiyor) |
| Font Awesome 5/6 ikonları (`fas fa-*`) | her yerde | `@fortawesome/fontawesome-free` CSS (ZTO HTML'i birebir kalsın diye) veya MUI icons |
| Chart.js (Finance/Index; bu kapsamda yok) / sparkline'lar (inline SVG, BI Index:3308) | kartlar | Inline SVG bileşeni (bağımlılık gerekmez) |
| `window.print()` + `Layout=null` ekstre sayfaları | BankExtract, CashExtract, ActivityReport, ExchangeBreakReport | Ayrı route + `@media print` CSS (ZTO CSS kopyası) |
| `toLocaleString('tr-TR')`, TR sayı parse (`0,00`) | tutar alanları | `Intl.NumberFormat` + kendi `parseTrNumber` yardımcısı |
| `confirm()` / `alert()` | TimeDeposits, talimat | `ZtoModal` onay diyaloğu (aynı metinlerle) |
| Tarih (`input type=date`, `DateTime.Today.AddDays`) | filtreler | native `<input type="date">` (Blackrose ile aynı); tarih aritmetiği için dayjs isteğe bağlı |
| Localizer (`@Localizer["..."]`) | tüm metinler | i18next (tr anahtarları ZTO metinleriyle aynı) |
| `FormData` multipart dosya yükleme (PCA) | ödeme dekontu | `apiUpload` (`client.ts:170`) + `stored_file` |

---

## 6. Bulunamayan / doğrulanamayan noktalar
- `⚠ BULUNAMADI` Blackrose'da vadeli mevduat, faiz, talimat, cari IBAN, döviz transferi, transfer masrafı, hesap no, banka şube adı, açılış bakiyesi ve aktif/pasif alanları.
- `⚠` ZTO `BranchProvince` (Şube İli) için Blackrose karşılığı yok (yalnızca `branch`).
- `⚠` PurchaseCurrentAccount `"BankTransactions"` / `"CashTransactions"` (ZT_ öneki yok) tabloları (ctrl :1251, :1297) — canlı DB'de var mı doğrulanamadı.
- `⚠` `transferReasonType` select'inin HTML'i cshtml'de görülmedi; JS ile üretildiği görülüyor (js:845, :3153).
- `⚠` TimeDeposits Details `breakModal` içinde `#breakPenalty` regex taramasında görülmedi (Index:447'de var).
- `⚠` `/Payment/SavePayment` (PCA view:2558) başka controller'a gidiyor; incelenmedi.
- `⚠` `ZT_*` ana tablolarının DDL'i repo'da yok (envanterde not edildi).
