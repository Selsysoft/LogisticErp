# MX-6 — Personel / Bordro / SGK: ZTO → Blackrose eşleme matrisi

> Tarih: 2026-11-13 · Durum: analiz (karar bekleyen sorular §7)
> Kapsam: Personnel, PersonnelSalary (+ `.Approval.cs`, `_UpdateAbsences.cs`), PersonnelAdvance, PersonnelAdditionalPayment, PersonnelAbsence, PersonnelLeave, PersonnelAsset, PersonnelDashboard, PersonnelReports, SGKDeclaration. Personelin finansa bağlandığı noktalar da kapsamdadır: personel carisi, maaş borcu, banka/kasa çıkışı ve avans.
> Kullanıcı gereksinimi (2026-11-13): Bir kiracının 2–3 tüzel kişiliği (iş yeri) olabilir. Personel bu şirketlere göre tanımlanır ve maaş şirket bazında ödenir. **MX5** bunun için `company` tablosunu ve `branch.company_id` kolonunu tasarlıyor. Bu belge o tasarımı varsayar: personel → şube → şirket, SGK işyeri sicili şirket başına tutulur.
> Migration numaraları geçici (`V2xP1…`). Kesin numaraları koordinatör verir.

Kökler:
- ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (salt okunur)
- BR-BE = `F:\visual studio zto\LogisticErp\backend\src\main\java\org\ece\blackrose`
- BR-MIG = `F:\visual studio zto\LogisticErp\backend\src\main\resources\db\migration\tenant`
- BR-FE = `F:\visual studio zto\LogisticErp\frontend\src`

Kısaltmalar:
- PSC = `ZTO\Controllers\PersonnelSalaryController.cs` (3415 satır)
- PSA = `ZTO\Controllers\PersonnelSalaryController.Approval.cs` (771)
- PSU = `ZTO\Controllers\PersonnelSalaryController_UpdateAbsences.cs` (430)
- PC = `ZTO\Controllers\PersonnelController.cs` (970)
- LS = `BR-BE\finance\service\LedgerService.java`
- FLS = `BR-BE\finance\service\FundLedgerService.java`
- SS = `BR-BE\finance\service\SettlementService.java`
- FRS = `BR-BE\fleet\service\FleetRegistryService.java`

Gizlilik: Bu belgede gerçek kişi adı, TCKN, IBAN, maaş ya da tohum/test verisi **yoktur**. Yalnız veri yapısı anlatılır. ZTO dosyaları bir kısmı Windows-1254 kodlamalıdır; satır numaraları o dosyalara göredir.

---

## 0. Blackrose tarafında elde olanlar

| Öğe | Yer | Not |
|---|---|---|
| Cari türü `EMPLOYEE` | `BR-BE\finance\domain\FinanceTypes.java:8-15` | Personel carisi için hazır. V22 (04 §4) bu cariler için `FINANCE_EMPLOYEE_VIEW` iznini ekliyor (04 §3.1). |
| Yön kuralı | `FinanceTypes.java:17-25` | Yön firmanın bakışıyla yazılır. Pozitif bakiye "cari bize borçlu" demektir. Buna göre maaş tahakkuku cariye **CREDIT**, ödeme ve avans **DEBIT** yazılır. |
| Sürücü = personel carisi | `FRS:122-126` (createDriver) | Her sürücü için `SRC-<kod>` kodlu (`FRS:37`) bir `EMPLOYEE` carisi açılır. `driver.account_id NOT NULL` (`BR-MIG\V6__create_fleet.sql:24-39`). |
| `Driver` entity | `BR-BE\fleet\domain\Driver.java:17-96` | Alanlar: `code`, `fullName`, `phone`, `licenseClass`, `status`, `accountId`, `branchId`, `userId`. TCKN, işe giriş tarihi, ücret ve SGK bilgisi **yok**. |
| Sürücü avansı | `BR-BE\fleet\service\DriverAdvanceService.java:34-67` | `SettlementService.create(PAYMENT, …)` çağrılır: fon hesabından OUT, sürücü carisine DEBIT. Taksit ya da maaştan kesinti planı **yok**. |
| Sürücü masrafı / harcırah | `BR-MIG\V13__create_driver_app.sql:30-50` (`driver_expense`), `BR-BE\shipment\service\TripFinanceService.java:52` (`TRIP_COST`) | Sefer bazlı. Bordrodan bağımsızdır, bordroya girmez. |
| Cari hareket motoru | `LS:24-34` `Posting`, `:49` `post` (idempotent: `findBySourceTypeAndSourceId`), `:81` `reverseSource`, `:88` `reverse` | `account_transaction` tablosunda `UNIQUE(source_type, source_id)` var (`BR-MIG\V3__create_finance.sql:16-36`). Bu yüzden bir kaynak belge en fazla **bir** cari hareketi üretebilir. Aynı bordro satırından birden çok hareket çıkacaksa her biri ayrı `source_type` almalıdır. |
| Banka/kasa motoru | `FLS:48` `post`, `:93` `reverseSource` | `allow_negative=false` olan hesapta bakiye yetmezse `INSUFFICIENT_FUNDS` döner (MX2 §0). |
| Ödeme/tahsilat | `SS:86-139` `create` (idempotencyKey + `SOURCE_SETTLEMENT`), `:142-166` `reverse` | Ödeme tek çağrıda cariye DEBIT ve fon hesabına OUT yazar. Maaş ödemesi bunu olduğu gibi kullanabilir. |
| İzinler | `BR-BE\identity\domain\Permission.java:4-30` | İK ve bordro izni **yok**. Yeni izinler `role_permission` tohumuyla verilir (örnek: `BR-MIG\V11__report_permission.sql`). |
| Dört göz ilkesi | `BR-MIG\V16__four_eyes_by_default.sql` (`finance_settings.allow_self_approval=false`) | Bordro onayında da aynı ayar kullanılabilir. |
| Şifreleme | `BR-BE\identity\security\CryptoConfig.java:51-52` (`TextEncryptor totpEncryptor`) | Hassas alan şifrelemesi için hazır desen var (Spring `Encryptors`). |
| Roller | `BR-MIG\V2__create_identity.sql:91-103` | PATRON, FINANCE_SUPER, FINANCE, ACCOUNTING, OPERATIONS, SALES, FLEET_MANAGER, WAREHOUSE, CUSTOMS, DRIVER. Ayrı bir İK rolü **yok**. |
| Ön yüz | `BR-FE\pages\fleet\DriversPage.tsx`, `DriverUserSection.tsx`; `BR-FE\pages\finance\*` | Personel ve bordro ekranı **yok**. |
| Personel / bordro / izin / zimmet / SGK | — | `⚠ BULUNAMADI`: Blackrose'da hiçbiri yok. |

---

## 1. ZTO sayfa envanteri, formlar, modallar, uçlar

Yetki: Tüm Personnel* controller'ları `[UserRoleAuthorize("Patron","Admin","Finans(super)")]` ile korunur. İstisnalar:
- PersonnelSalary'ye ek olarak `"Muhasebe (Alış)"` girer (PSC:15).
- PersonnelReports'a `"Muhasebe (Alış)"` girer.
- SGKDeclaration'a `"Finans(normal)"` ve `"Muhasebe (Alış)"` girer (SGKDeclarationController.cs:14).

Personel carileri CustomerAccounts listesinde yalnız süper kullanıcıya görünür (`CustomerAccountsController.cs:716-717`, `:3510`).

### 1.1 /Personnel (Personel kartı)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Views/Personnel/Index.cshtml` | GET `/Personnel/Index?statusFilter=active` (PC:27) | Personel listesi: departman, iş yeri ve şube ili join'li. **TCKN listede maskesiz okunur** (PC:80). | 855 |
| `Add.cshtml` | GET/POST `/Personnel/Add` (PC:128 / :169) | Yeni personel. INSERT `ZT_Personnel` (PC:205) + personel carisi `CreatePersonnelCustomerAccount` (PC:810-846). **Transaction yok.** | 677 |
| `Edit.cshtml` | GET `/Personnel/Edit/{id}` (PC:301), POST `Update` (PC:400) | UPDATE `ZT_Personnel` (PC:409) + cari adı/para birimi/iş yeri güncellenir (PC:848-870) | 806 |
| — | GET `Delete/{id}` (PC:506) | Personeli ve carisini pasif yapar (PC:531, :541). GET ile durum değiştirir. | — |
| — | GET `DeleteWithDebts/{id}` (PC:582) | **Fiziksel DELETE:** `ZT_AccountDebts` (`AccountingType='Personel'`, PC:631) ve `ZT_PersonnelSalaries` (PC:646). Ardından cari ve personel pasif yapılır. Transaction yok, ödenmiş borçlar da silinir. | — |
| — | GET `GetWorkPlacesByBranch?branchProvinceId` (PC:712) | Şube iline göre iş yeri listesi. Çağıranlar: Add:514, Edit:669. | — |
| — | GET `GetPersonnelStats` (PC:735) | Aktif personel, aylık bordro, ödenmemiş maaş, aktif avans toplamı | — |

**Form: Personnel/Add** (Edit aynı alanlara sahip)

| # | Alan | Etiket | Tip | Doğrulama | Kaynak / not |
|---|---|---|---|---|---|
| 1 | `Name` | Ad * | text | required, ≤50 | Add:95 |
| 2 | `Surname` | Soyad * | text | required, ≤50 | Add:102 |
| 3 | `IdentityNo` | TC Kimlik No | text | tam 11 hane (StringLength); **algoritma kontrolü yok** | Add:109 |
| 4 | `BirthDate` | Doğum Tarihi | date | — | Add:116 |
| 5 | `Gender` | Cinsiyet | select | — | Erkek/Kadın, Add:125 |
| 6 | `MaritalStatus` | Medeni Durum | select | — | Bekar/Evli, Add:135. Bordro hesabındaki 3 seçenekli medeni durumla uyuşmuyor. |
| 7 | `PhoneNumber`, `Email` | Telefon, E-posta | text | Email formatı | Add:145, :151 |
| 8 | `Address`, `City`, `District` | Adres, İl, İlçe | text | — | Add:161-173 |
| 9 | `DepartmentID` | Departman | select | — | `ZT_Departments`, Add:188 |
| 10 | `PositionTitle` | Pozisyon | text | — | Add:195 |
| 11 | `BranchProvinceID` | Şube | select | — | `ZT_BranchProvince`, Add:201 |
| 12 | `WorkPlaceID` | İş Yeri * | select (şubeye bağlı) | required | AJAX `GetWorkPlacesByBranch`, Add:209 |
| 13 | `StartDate` | İşe Başlama * | date | required | Add:222 |
| 14 | `EmploymentType` | Çalışma Şekli | select | — | Tam Zamanlı/Yarı Zamanlı/Sezonluk/Geçici, Add:229 |
| 15 | `SgkNumber`, `SgkStartDate`, `SgkStatus` | SGK Sicil No, SGK Başlangıç, SGK Durumu | text/date/checkbox | — | Add:249-262 |
| 16 | `MonthlySalary` | Aylık Maaş * | number | required, ≥0 | Add:280. Brüt kabul edilir. |
| 17 | `HandCashSalary` | Elden Ödenecek Tutar | number | — | Add:292. **Bordro dışı ödeme** (bkz. §2.6-R14). |
| 18 | `CurrencyID` | Para Birimi * | select | required | `Currency`, Add:302. Maaş dövizli olabiliyor. |
| 19 | `PaymentDay` | Ödeme Günü | number | 1–31 | Add:314 |
| 20 | `IsMinimumWage` | Asgari Ücretli | checkbox | — | Add:327 |
| 21 | `CustomSgkRate`, `SgkRate` | Özel SGK Oranı / SGK Oranı (%) | checkbox + number | 0–100 | Add:345, :354. **Hesapta kullanılmaz** (§2.6-R3). |
| 22 | `CustomTaxCalculation`, `TaxExemption` | Özel Vergi Hesaplama / Vergi İndirimi | checkbox + number | ≥0 | Add:374, :383 |
| 23 | `PaymentMethod` | Ödeme Yöntemi | select | — | Banka Transferi/Nakit/Çek, Add:440 |
| 24 | `BankName`, `BankAccountIBAN` | Banka Adı, IBAN | text | **IBAN format kontrolü yok** | Add:450, :456 |
| 25 | `Notes` | Notlar | textarea | — | Add:473 |

Modelde olup formda olmayan alanlar: `HourlyRate`, `SalaryInputType` (Brüt/Net), `ChildCount`, `DisabilityStatus`, `DisabilityRate`, `SgkDetailType` (4/a Normal, Çırak, Stajyer, Emekli-SGDP, Yabancı), `AnnualLeaveEntitlement` (varsayılan 14), `NationalityCode`, `WorkingDaysPerMonth` (varsayılan 30), `EndDate`, `PhotoPath` (`Models/ZT/Personnel.cs:82-179`).

Yazılan tablolar:
- `ZT_Personnel`
- `ZT_CustomerAccounts`: `AccountGroup='Personel'`, `ReferenceID=personnelId`, `AccountCode=PER-nnnn`

Kod üretimi `MAX(ID)+1` ile yapılıyor (PC:801-806). Eşzamanlı kayıtta yarış durumu oluşur.

### 1.2 /PersonnelSalary (Maaşlar)

| View | Route | Amaç | Satır |
|---|---|---|---|
| `Index.cshtml` | GET `/PersonnelSalary/Index?year&month&statusFilter` (PSC:29) | Dönem bordro listesi, durum sekmeleri (tümü/ödendi/ödenmedi/kısmi), toplu seçim, toplu ödeme, Excel | 1399 |
| `Details.cshtml` | GET `Details/{id}` (PSC:293) | Bordro detayı (kesinti kırılımı, eksik gün, ek ödemeler) | 1114 |
| `CreateBulk.cshtml` | GET/POST `CreateBulk` (PSC:559 / :1187) | Dönem için toplu maaş oluşturma ve önizleme | 822 |
| `CreateBulk_UpdateSalariesPartial.cshtml` | POST `UpdateExistingSalariesWithNewAbsences` (PSU:23) | Oluşmuş maaşlara sonradan girilen eksik günleri ekleme | 336 |
| `MakePayment.cshtml` | GET/POST `MakePayment` (PSC:2106 / :2278) | Tek maaş ödemesi (çapraz kur dahil) | 888 |

**Form: CreateBulk (CreateBulk.cshtml:345)**

| Alan | Tip | Not |
|---|---|---|
| `year`, `month`, `allowRecreate` | hidden | `allowRecreate` POST'ta **hiç kullanılmıyor** (PSC:1188) |
| `createNetSalary` | checkbox | "Net Maaş" cari borcu oluşturulsun mu (:357) |
| `createHandCash` | checkbox | "Elden Maaş" cari borcu (:364) |
| `enablePaymentPlan` | checkbox | Ödeme planı da oluşturulsun mu (:380) |
| `paymentPlanDate` | date | Planlanan ödeme tarihi (:395) |
| `paymentPlanBankID` | select | Ödeme bankası (:402) |
| `personnelIds[]` | checkbox (satır başına) | Seçili personeller (:480) |
| submit | "Maaşları Oluştur" | POST PSC:1187 |

Yazılan tablolar (tek transaction, PSC:1229-1662):
- `ZT_PersonnelSalaries` INSERT (PSC:1429)
- `ZT_AccountDebts`: "Net Maaş" ve "Elden Maaş" borçları (`CreateDebtRecord`, PSC:2018-2057, `AccountingType='Personel'`)
- `ZT_CustomerAccountPaymentPlans` (`SourceType='Maaş'`, PSC:1517)
- `ZT_PersonnelAbsence` ve `ZT_PersonnelLeaves` → `IsDeducted=true` (PSC:1935-1989)
- `ZT_PersonnelAdditionalPayments` → `IsRecorded=true` (PSC:1562)
- `ZT_PersonnelAdvances` UPDATE ve `ZT_PersonnelAdvanceDeductions` INSERT (PSC:1136-1175)
- İş yeri bazında yasal kesinti borçları "Masraf Hesabı" carilerine (`CreateExpenseDebtRecord`, PSC:2062-2099):
  - "SGK + İşsizlik Sigortası" (PSC:1636)
  - "Damga Vergisi" (PSC:1646)
  - "Gelir Vergisi" (PSC:1656)

Transaction dışında, gerekirse `ZT_ExpenseTypes` / `ZT_ExpenseItems` / `ZT_CustomerAccounts` kayıtları açılır (`GetOrCreateExpenseAccount`, PSC:2763-2899, `MAS-SGK` vb.).

**Partial: CreateBulk_UpdateSalariesPartial.** Satır seçimi `updateSalaryIds` (:64). Seçenekler: `updateNetSalaryCheck` (:184), `updateHandCashCheck` (:194). Buton `updateExistingSalaries()` (:210) → AJAX `/PersonnelSalary/UpdateExistingSalariesWithNewAbsences` (:310 → PSU:23).

Bu uç `ZT_PersonnelSalaries` ve `ZT_AccountDebts` kayıtlarını **yerinde UPDATE eder** (PSU:170-196, :322-420). Ters kayıt yazılmaz.

**Modal PS-1: `bulkPaymentModal` — Index.cshtml:920**

| Alan | Etiket | Tip | Doğrulama | Kaynak |
|---|---|---|---|---|
| `#bulkPaymentDate` | Ödeme Tarihi * | date | required | :942 |
| `#bulkPaymentMethod` | Ödeme Yöntemi * | select (Banka/Nakit) | required, `toggleBankCash()` | :949 |
| `#bulkPaymentDescription` | Açıklama | textarea | — | :958 |
| `#bulkPaymentBankId` | Banka * | select | Banka seçiliyse zorunlu | AJAX `/CustomerAccounts/GetBanksByWorkPlace` (:1213) |
| `#bulkPaymentCashId` | Kasa * | select | Nakit seçiliyse zorunlu | AJAX `/CustomerAccounts/GetCashesByWorkPlace` (:1244) |
| özet | "Seçili Maaşlar (Para Birimi Bazlı)" | salt okunur | — | :988 |

- Butonlar: İptal; `#btnSaveBulkPayment` → `saveBulkPayment()` (:999, :1293).
- AJAX `/PersonnelSalary/BulkPayment` (:1353 → PSC:3086), JSON `BulkPaymentRequest` (PSC:3391-3414).
- Yazılan tablolar:
  - `ZT_AccountPayments` (PSC:3180)
  - `ZT_AccountDebts` UPDATE (PSC:3217)
  - `ZT_BankTransactions` ya da `ZT_CashTransactions` (statik `CreateBankTransaction` / `CreateCashTransaction`, PSC:3237 / :3252)
  - `ZT_CustomerAccountPaymentPlans` UPDATE (PSC:3273)

**Form: MakePayment (MakePayment.cshtml:154)**

| Alan | Etiket | Tip | Not |
|---|---|---|---|
| hidden `salaryId`, `personnelId`, `customerAccountId`, `workPlaceId`, `debtId`, `debtCurrencyId`, `paymentAmountInput` | — | hidden | `debtCurrencyId` iki kez tanımlı: **aynı name ve id** (:160 ve :164) |
| borç kartı | "Net Maaş" / "Elden Maaş" | tıklanır liste | `selectDebt(id, type, kalan, para birimi)` (:192) |
| `crossCurrencyPayment` | Çapraz kur | checkbox | :254 |
| `paymentMethod` | Ödeme Yöntemi * | select | :270 |
| `paymentAmount` | Ödeme Tutarı * | number | :283 |
| `paymentCurrencyId` / `debtCurrencyIdDisplay` / `crossExchangeRate` | Ödeme para birimi / borç para birimi / kur | select/select/text | Çapraz kur modu, :299-353 |
| `bankId` / `cashId` | Banka * / Kasa * | select | İş yerine göre süzülür (`GetBanksByWorkPlace`, PSC:2691) |
| `personnelBankAccountId` | Personel Banka Hesabı (Opsiyonel) | select | `ZT_BankAccounts` (`TypeAccount='Personel'`). IBAN maskeli gösterilir (PSC:2722-2758). |
| `notes` | Açıklama / Notlar | textarea | :462 |

- POST PSC:2278.
- Ödeme tarihi kullanıcıdan alınmaz, **`Now` yazılır** (PSC:2512, :2568).
- `ZT_AccountPayments.ExchangeRate` çapraz kurda bile 1 yazılır (PSC:2522).

**Details.cshtml AJAX:** `GetAdditionalPaymentsBySalary` (:1060 → PSC:490).

**Onay uçları (PSA): hiçbir view çağırmıyor (ölü kod).**

Arama sonucu: `ApproveSalary|BulkApproveSalaries|RejectSalary|CalculateNetToBrut|GetCalculationParams|GetSalaryForApproval` yalnız PSA'da geçiyor. Uçlar:

| Uç | Satır | Ne yapar |
|---|---|---|
| GET `GetCalculationParams` | PSA:22 | `ZT_SalaryCalculationParams` tablosunu `information_schema` ile arar. Tablo yoksa ya da satır yoksa **sabit kodlanmış 2025 değerleri** döner (PSA:46-75, :125-152). Bu tabloyu oluşturan kod ya da migration repoda yok. |
| POST `ApproveSalary` | PSA:164 | Şu kolonları yazar: `SalaryStatus='Onaylandı'`, `ApprovalStatus`, `ApprovedBy`, `ApprovalDate`, `ApprovalNotes`, `PaymentPlanDate`, `PaymentBranchProvinceID`, `PaymentWorkPlaceID`, `PaymentBankID` (PSA:213). Ayrıca **ayrı ve eski** `ZT_PaymentPlanning` tablosuna plan ekler (PSA:265) ve `ZT_CustomerAccounts.PlanningStatus='Planlandı'` yapar (PSA:307). |
| POST `RejectSalary` | PSA:355 | `SalaryStatus='Hesaplandı'`, `ApprovalStatus='Reddedildi'`, not başına "Red: " eklenir |
| GET `GetSalaryForApproval` | PSA:407 | Onay modalı için veri (modal yok) |
| POST `BulkApproveSalaries` | PSA:490 | `SalaryStatus='Hesaplandı' AND ApprovalStatus='Onay Bekliyor'` olanları onaylar. Transaction yok. |
| POST `CalculateNetToBrut` | PSA:550 | Newton-Raphson ile netten brüte hesap (PSA:571-640). Brütten nete iç fonksiyonu (PSA:645-720) **ayrı bir hesap motorudur** (§2.2). |

Model `CanBePaid => SalaryStatus=="Onaylandı" && ApprovalStatus=="Onaylandı"` diyor (`Models/ZT/PersonnelSalary.cs:384`). Ancak **MakePayment ve BulkPayment bu kontrolü yapmıyor.** Sonuç: ZTO'da maaş onaysız ödenir.

### 1.3 /PersonnelAdvance (Avans)

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&statusFilter` (ctrl :27); `advanceDetailModal` (:204) içine `_AdvanceDetails` partial'ı yüklenir | 245 + 163 |
| `Add.cshtml` | GET/POST `Add` (:127 / :162) | 287 |
| — | GET `Details/{id}` (:413) | — |

**Form: Add**

| Alan | Etiket | Tip | Doğrulama | Not |
|---|---|---|---|---|
| `PersonnelID` | Personel * | select | required | :50 |
| `AdvanceDate` | Avans Tarihi * | date | required | :72 |
| `Amount` | Tutar * | number | required | :79 |
| `CurrencyID` | Para Birimi * | select | required | :88 |
| `PaymentMethod` | Ödeme Yöntemi * | select (Nakit/Banka Havalesi/Çek) | required | :99. Aynı select :128'de **ikinci kez** var. |
| `BankID` / `CashID` | Banka / Kasa | select | yönteme göre zorunlu | :140 / :155 |
| `DeductionType` | Kesinti Şekli * | select (Tek Seferde/Taksitli) | required | :179 |
| `InstallmentCount` | Taksit Sayısı | number | — | :189 |
| `DeductionStartYear`, `DeductionStartMonth` | Kesinti başlangıcı * | number/select | required | :198 / :205 |
| `Reason` | Açıklama | textarea | — | :225 |

Yazılan tablolar (transaction var, ctrl :170):
- `ZT_PersonnelAdvances` (:248). `MonthlyDeduction = Amount / InstallmentCount`, yuvarlama yok (:244).
- `ZT_AccountPayments` (`IsAdvancePayment=true`, `ExchangeRate=1`, :285)
- `ZT_BankTransactions` ya da `ZT_CashTransactions` (:325 / :348)

"Çek" seçilirse fon hareketi **hiç oluşmaz**, kayıt yine de "Tamamlandı" olur.

### 1.4 /PersonnelAdditionalPayment (Ek ödeme: prim, ikramiye, yol, yemek…)

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&categoryFilter&year&month` (ctrl :27); `paymentDetailModal` (:456) | 552 |
| `Add.cshtml` | GET/POST `Add` (:182 / :223) | 407 |
| `Reports.cshtml` | GET `Reports?year&personnelId` (:504) | 362 |

**Form: Add.** Alanlar:
- `PersonnelID` * (:28)
- `PaymentTypeID` * (`ZT_AdditionalPaymentTypes`: `TaxExempt`, `SgkExempt` bayraklı, :48)
- `Amount` * (:76)
- `CurrencyID` (:87)
- `PaymentDate` * (:107)
- `PeriodMonth`, `PeriodYear` (:115 / :135)
- `PaymentMethod` * (:168)
- `CashID` / `BankID` (:179 / :199)
- `WorkPlaceID` (:217)
- `DocumentNo` (:238)
- `Reason` (:244)

Yazılan tablolar (transaction var, ctrl :231):
- `ZT_PersonnelAdditionalPayments`: doğrudan `'Onaylandı'` durumuyla yazılır (:335)
- Kasa/banka çıkışı **net tutarla** (:379 / :402)

Vergi ve SGK burada **ayrı bir motorla** hesaplanır (bkz. §2.2 ve R7).

### 1.5 /PersonnelAbsence (Eksik gün/saat)

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&year&month&statusFilter` (ctrl :28) | 785 |

**Modal PA-1: `addAbsenceModal` (Index:262).** `editAbsenceModal` (:376) aynı alanlara sahip.

| Alan | Etiket | Tip | Doğrulama | Kaynak |
|---|---|---|---|---|
| `#absencePersonnelID` | Personel * | select | required | ViewBag |
| `#absenceDate` | Tarih * | date | required | — |
| `#absenceType` | Eksik Tipi | select | — | Eksik Gün / Eksik Saat / Mazeret / Devamsızlık (`Models/ZT/PersonnelAbsence.cs:150`) |
| `#absenceUnit` | Birim | select | — | Gün / Saat |
| `#absenceValue` | Değer * | number step 0.5, 0.5–31 | required | — |
| `#deductionSource` | Kesinti Kaynağı | select | — | Maaş / Avans / Elden Ödeme / Yıllık İzin / Kesinti Yok |
| bilgi | Günlük / saatlik ücret, tahmini kesinti | salt okunur | — | `GetPersonnelDailyRate` (ctrl :241), `CalculateDeductions` (ctrl :150) |
| `#absenceReason`, `#absenceNotes` | Açıklama, Notlar | text | — | Serbest metin. Sağlık bilgisi içerebilir (§6). |

AJAX uçları:

| Çağrı yeri | Uç | Controller satırı |
|---|---|---|
| :644 | `/PersonnelAbsence/Add` (JSON) | :68. INSERT doğrudan `'Onaylandı'` yazar (ctrl :89-117). Modelin varsayılanı "Beklemede" olsa da **onay adımı fiilen yok**. |
| :741 | `Update` | :346 |
| :770 | `Delete?id` | :416 (soft) |
| :530 / :563 | `BulkAction` (approve/reject/delete) | :449 |

Ayrıca `Approve` (:179), `Reject` (:208), `GetById` (:288) ve `GetPeriodSummary` (:130) uçları var.

### 1.6 /PersonnelLeave (İzin)

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&statusFilter&year` (ctrl :27); onay ve red formları → POST `Approve` (:304), `Reject` (:411) | 249 |
| `Add.cshtml` | GET/POST `Add` (:131 / :161, `IFormFile documentFile`) | 451 |
| `Balances.cshtml` | GET `Balances?personnelId&year` (:466) | 150 |
| — | GET `GetBalance` (:689) | — |

**Form: Add.** Alanlar:
- `PersonnelID` * (:58)
- `LeaveTypeID` * (`ZT_LeaveTypes`: `IsPaid`, :71)
- `LeaveUnit` (Gün/Saat, :83)
- `StartDate` * ve `StartTime` (:96 / :102)
- `EndDate` * ve `EndTime` (:114 / :120)
- `TotalDays` (:131), `TotalHours` (:138)
- `HalfDayType` (Tam/Sabah/Öğleden Sonra, :146)
- `Reason` (:168)
- `DeductionSource` (Yıllık İzinden Düş / Maaştan Kes / Elden Ödemeden Kes / Kesinti Yapma, :177)
- `documentFile` (:197). Rapor belgesi gibi sağlık verisi içerebilir.
- `Notes` (:206)

Yazılan tablolar:
- `ZT_PersonnelLeaves` (`'Beklemede'`, :236)
- Onayda `ZT_PersonnelLeaveBalances` güncellenir ya da eklenir (:603 / :627). Transaction yok.

### 1.7 /PersonnelAsset (Zimmet)

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&statusFilter&categoryFilter` (ctrl :28) | 561 |
| `Add.cshtml` | GET `Add` (:62) | 163 |

Modaller:

**AS-1 `addAssetModal` (Index:272).** AJAX `/PersonnelAsset/Add` (:495 → ctrl :82). Alanlar:
- Personel *
- Zimmet Adı *
- Kategori
- Seri No
- Zimmet Tarihi *
- Beklenen İade Tarihi
- Zimmet Değeri
- Kondisyon
- Notlar

**AS-2 `returnAssetModal` (Index:372).** AJAX `/PersonnelAsset/Return` (:522 → ctrl :206). Alanlar: İade Durumu (Kondisyon), Not.

**AS-3 `chargeAssetModal` (Index:407).** AJAX `/PersonnelAsset/ChargeToAccount` (:547 → ctrl :240). Alanlar: Borçlandırılacak Tutar, Sebep.
- `ZT_AccountDebts`'e "Zimmet Borcu" yazar (ctrl :284). Bu, maaş borcunun tutulduğu tablodur ve kayıtta `AccountingType` yok.
- Sonuç: Kaydın yönü şüpheli. Personelin şirkete borcu yerine şirketin personele borcu gibi görünüyor (R16).

Diğer uçlar: `GetByPersonnel` (:137), `GetAssetSummary` (:157), `GetById` (:348), `Update` (:409), `Delete` (:470, soft).

### 1.8 /PersonnelDashboard, /PersonnelReports

| View | Route | Amaç | Satır |
|---|---|---|---|
| `PersonnelDashboard/Index.cshtml` | GET (ctrl :24); AJAX `GetLeaveBalanceSummary` (:343) | KPI'lar: aktif personel, izindekiler, avans, ek ödeme, departman dağılımı, doğum günü/yıl dönümü, onboarding (`ZT_OnboardingChecklist`), son SGK bildirimleri, bordro özeti | 459 |
| `PersonnelReports/Index.cshtml` | GET `Index?year&month` (ctrl :27) | Aylık maliyet, ödeme durumu, departman kırılımı, masraf kalemi (SGK/GV/DV carileri) | 539 |
| — | GET `ExportMonthlyCost` (:208), `ExportYearlyTrend` (:314) | **CSV** dosya (`text/csv`, :299 / :376) | — |

### 1.9 /SGKDeclaration

| View | Route | Satır |
|---|---|---|
| `Index.cshtml` | GET `Index?personnelId&year&month&statusFilter&typeFilter` (ctrl :28); satır formları → POST `Submit` (:329), `Approve` (:366) | 239 |
| `Add.cshtml` | GET/POST `Add` (:173 / :219) | 154 |

**Form: Add.** Alanlar:
- `PersonnelID` * (:30)
- `DeclarationType` * (İşe Giriş / İşten Çıkış / Ücret Değişikliği, :43)
- `DeclarationDate` * (:56)
- `DeclarationMonth`, `DeclarationYear` (:64 / :76)
- `SgkNumber` (:98, DB'de kolon yok)
- `DeclaredSalary` * (:107)
- `WorkDays` * (:120)
- `DocumentNo` (:126)
- `Notes` (:132)

Model, view adlarını eski kolonlara takma ad özelliklerle eşler (`Models/ZT/SGKDeclaration.cs:59-86`). Yazılan tablo: `ZT_SGKDeclarations` (ctrl :270).

---

## 2. Bordro hesabı (ZTO) — ayrıntı

### 2.1 Sabitler nerede, yıla göre mi?

| Kaynak | İçerik | Kullanan | Yıl |
|---|---|---|---|
| `Models/ZT/SalaryCalculationConstants.cs:13-52` | SGK işçi 14, işsizlik işçi 1, damga 0,00759, 30 gün, 8 saat; `IncomeTaxBrackets2026` 5 dilim (yıllık) | **Toplu maaş oluşturma** (PSC:1380-1394, :2968-3013) | Kodda sabit, "2026" adıyla |
| `PSC:3018-3047` `CalculateTaxDeduction` | "2024 dilimleri" (aylık matraha göre artan tutarlı formül) | Ana akışta çağrılmıyor (ölü) | 2024, kodda sabit |
| `PersonnelAdditionalPaymentController.cs:466-500` `CalculateTaxDeduction` | Aynı 2024 dilimleri + **gelir vergisinin içine eklenmiş damga vergisi** | Ek ödeme girişi | 2024, kodda sabit |
| `PSA:684-711` `CalculateIncomeTaxMonthly` | "2025 yıllık" dilimler | Netten brüte hesap (ölü uç) | 2025, kodda sabit |
| `PSA:645-660` | Varsayılanlar: SGK işveren 20,5, işsizlik işveren 2, asgari ücret 22.104 | Netten brüte hesap | 2025, kodda sabit |
| `Models/ZT/SalaryCalculationParams.cs:9-130` | Yıllık parametre modeli: asgari ücret, SGK/işsizlik işçi ve işveren oranı, 4 dilim sınırı + 5 oran, damga, AGİ oranları, engellilik oranları, `ValidFrom/To` | Yalnız `GetCalculationParams` (ölü). **Tablo oluşturulmamış.** | Tabloya taşınmak istenmiş, yarım kalmış |

Sonuç: ZTO'da **birbirinden farklı üç vergi tarifesi** var (2024, 2025, "2026"). Gerçek bordroyu kullanılmayan tablo değil, sabit kod hesaplıyor. "2026" dilim sınırlarının kaynağı belirsiz. Resmî tarifeyle (ücret gelirleri için ayrı 3. dilim sınırı dahil) **doğrulanmalı**.

Asgari ücret değeri olarak kullanılan 22.104 TL, 2025 **net** asgari ücretine karşılık geliyor. Kod ise bu değeri brüt gibi kullanıyor.

### 2.2 Toplu maaş oluşturma formülü (PSC:1242-1422) — gerçek bordroyu üreten akış

Personel başına aşağıdaki adımlar uygulanır:

```
grossSalary      = MonthlySalary + Σ(vergiye tabi ek ödemeler: TaxExempt=false, Amount)        (1372)
isHandCashOnly   = MonthlySalary==0 && HandCashSalary>0                                        (1376)
sgk              = gross × 14%                       (SABİT; personelin SgkRate'i okunur ama kullanılmaz)   (1380)
issizlik         = gross × 1%                                                                   (1383)
damga            = (gross × 12 × 0,00759) / 12  = gross × 0,00759   (istisnasız)               (1384)
matrah           = gross − sgk − issizlik − damga   (damga matrahtan DÜŞÜLÜYOR)                (1387)
  CustomTaxCalculation ise matrah = max(0, matrah − TaxExemption)                               (1388-1391)
gelirVergisi     = (tarife(matrah × 12)) / 12, 2 haneye yuvarlanır   (kümülatif değil)          (2968-3012)
toplamKesinti    = sgk + issizlik + damga + GV + avans + eksikGün(maaş) + izinKesintisi        (1397)
net              = isHandCashOnly ? 0
                 : IsMinimumWage ? gross − sgk − issizlik          (avans ve eksik gün DÜŞÜLMEZ!)   (1410-1414)
                 : gross − toplamKesinti                                                        (1418)
eldenMaaş        = max(0, HandCashSalary − eksikGün(elden))                                     (1422)
```

Kesintiler:
- **Eksik gün (PSC:1769-1930):**
  - Günlük brüt = `MonthlySalary / WorkingDaysPerMonth`.
  - Saatlik = `HourlyRate`, yoksa günlük / 8.
  - "Maaş" kaynaklı eksik, **brüt** günlük ücret × gün kadar **netten** düşülür. SGK ve GV ise düşülmemiş tam brüt üzerinden hesaplanır.
  - "Elden Ödeme" kaynaklı eksik, elden maaştan düşülür.
  - "Yıllık İzin" kaynaklı eksik para kesintisi yaratmaz.
  - "Avans" kaynaklı eksik için **case yok**. Tutar hiç kesilmez, buna rağmen kayıt "kesildi" işaretlenir (PSC:1941-1951).
- **Ücretsiz izin:** `ZT_LeaveTypes.IsPaid=false` ve kaynağı Maaş/Elden olan izinler, başlangıç ayına göre kesilir. Ay sınırını aşan izin bölünmez (PSC:1879-1921).
- **Avans:** Aktif ve başlangıç dönemi gelmiş avanslarda `min(MonthlyDeduction, RemainingAmount)` toplamı alınır (PSC:1713-1764). Hata olursa sessizce 0 döner (:1760-1763).
- **Ek ödeme (vergiden muaf):** `NetAmount` `HandCashTotal` kolonuna yazılır, ama hiçbir borca eklenmez.

Bordroda olmayan kalemler:

| Kalem | ZTO'daki durum |
|---|---|
| Fazla mesai | `Overtime` kolonu var (`PersonnelSalary.cs:52`), yazan kod yok |
| Prim, yemek, yol | `Bonus`, `FoodAllowance`, `TransportAllowance` kolonları var, yazan kod yok |
| İşveren SGK ve işsizlik payı | Hiçbir yerde tahakkuk etmez. Yalnız ölü netten brüte hesapta gösterilir. |
| SGK prim gün sayısı, SGK tavanı ve tabanı, 5 puanlık teşvik | Yok |
| Kümülatif GV matrahı | Yok |
| Asgari ücret GV ve DV istisnası | Yok. Tek ikili bayrak var (`IsMinimumWage` → GV ve DV hiç kesilmez). Asgari ücretin üstünde kazananlara istisna **uygulanmaz**. |
| AGİ | Toplu akışta yok. Ölü netten brüte hesapta **hâlâ AGİ ekleniyor** (PSA:668, :740-760). AGİ 2022'den beri yürürlükte değil. |
| Engellilik indirimi | Ölü hesapta GV'yi oranla azaltıyor (PSA:672-683). Gerçek kural sabit aylık indirim tutarıdır. Toplu akışta engellilik yok. |
| BES ve icra kesintisi | Yok |

### 2.3 Onay akışı (PSA)

Tasarlanan durumlar:
- `SalaryStatus`: Taslak → Hesaplandı → Onaylandı → Ödendi / İptal
- `ApprovalStatus`: Onay Bekliyor → Onaylandı / Reddedildi (`PersonnelSalary.cs:104-120`, `:456-476`)

Fiili durum:
- Toplu oluşturma INSERT'ünde bu iki kolon yazılmaz (PSC:1429-1445); DB varsayılanına kalır.
- Onay uçlarının hiçbiri ekrandan çağrılmaz.
- Ödeme uçları onayı kontrol etmez.

**Sonuç: ZTO'da bordro onay akışı fiilen yok.** Onay uçları çalışsaydı bile eski `ZT_PaymentPlanning` tablosuna plan açacaktı. Toplu oluşturma ise `ZT_CustomerAccountPaymentPlans` kullanıyor. İki ayrı plan tablosu var.

### 2.4 Ödeme nasıl yapılıyor

1. **Tahakkuk (CreateBulk):**
   - Personel carisine `ZT_AccountDebts` "Net Maaş" ve, varsa, "Elden Maaş" (`AccountingType='Personel'`, vade = ayın 1'i + 30 gün, PSC:2018-2057) yazılır.
   - İş yeri bazında "Masraf Hesabı" carilerine SGK+İşsizlik (işçi payı), Damga ve GV borçları yazılır.
   - Dikkat: İşçi payları **gider** carisi gibi kaydediliyor. Doğrusu, bunlar devlete olan borçtur.
2. **Tek ödeme (MakePayment):**
   - `ZT_AccountPayments` kaydı ve borç UPDATE (`RemainingAmount`, `PaidAmount`, `PaymentStatus`).
   - Statik `CreateBankTransaction` / `CreateCashTransaction` çağrısı. Bu çağrılar transaction parametresi almaz (`BankTransactionsController.cs:1740`). Hata olursa false döner ve rollback yapılır (PSC:2590-2598).
3. **Toplu ödeme (BulkPayment, PSC:3086-3380):**
   - Seçili her (maaş, belge tipi) için aynı adımlar uygulanır.
   - Satır hatası `catch`'te yakalanıp `continue` edilir (PSC:3266-3270, :3302-3306). Döngü sonunda tüm transaction **commit edilir**.
   - Postgres'te ilk SQL hatası transaction'ı "aborted" yapar. Sonraki satırlar da hata alır ve commit fiilen rollback olur. Kullanıcıya ise "N başarılı" mesajı döner (R10).
4. **Avans:** Ödendiği an `ZT_AccountPayments` (`IsAdvancePayment=true`) ve fon çıkışı yazılır. Maaşta ise net tutardan ayrıca düşülür. `IsAdvancePayment` ödemeleri cari bakiyesinden hariç tutulmuyorsa avans cari bakiyede **iki kez** düşmüş olur (`⚠ doğrulanmalı`, R8).
5. **Ödeme planı:** İki yerde güncellenir:
   - `ZT_CustomerAccountPaymentPlans` (`SourceType='Maaş'`) ödeme sonrasında güncellenir (PSC:2601-2619).
   - CustomerAccounts plan ekranında Maaş planlarına özel `canDelete`, `canPostpone`, `canMarkPaid` bayrakları var (`CustomerAccountsController.cs:2832-2834`). "Ödendi işaretle" düğmesi ödeme kaydı üretmez; bu, 04 §6-K1 sorunudur.
6. Banka ve kasa ekranlarında "Net Maaş" bir hareket tipidir (`BankTransactionsController.cs:227`, `CashTransactionsController.cs:171`). Maaş ödemesi `AccountingType = DocumentType` ("Net Maaş" / "Elden Maaş") ve `ReferenceID = paymentId` ile bağlanır.

### 2.5 Net → brüt (ölü uç) ve parametre tablosu

Netten brüte hesap Newton-Raphson yöntemiyle yapılır:
- Başlangıç tahmini: net × 1,4
- Tolerans: 0,01
- En fazla 100 iterasyon
- Gradyan için delta = 1 (PSA:571-640)

İçteki brütten nete hesap (PSA:645-720), toplu akıştan farklıdır:
- Damga matrahtan düşülmez.
- AGİ eklenir.
- 2025 dilimleri kullanılır.
- İşveren maliyeti hesaplanır.

İki ekran aynı brüt için **farklı net** verir.

### 2.6 ZTO hata ve risk listesi (taşınmaz)

| # | Bulgu | Yer | Etki |
|---|---|---|---|
| R1 | Vergi tarifesi kodda sabit; üç farklı tarife var | §2.1 | Yıl değişince yanlış bordro; ekranlar arası tutarsızlık |
| R2 | GV kümülatif matrahla değil, "aylık × 12 / 12" ile hesaplanıyor | PSC:2968-3012 | Ücret değişikliği ya da tek seferlik ek ödeme olan aylarda yanlış dilim ve yanlış vergi |
| R3 | Personelin `SgkRate` / `CustomSgkRate` değeri okunuyor ama kullanılmıyor (sabit %14) | PSC:1282-1283, :1380 | Emekli (SGDP), çırak ve stajyer için yanlış prim |
| R4 | Asgari ücret istisnası yok; tek bayrak var (`IsMinimumWage` → GV/DV = 0) | PSC:1410-1419, :1603-1617 | Asgari ücretin üstünde kazanan herkes fazla vergilendirilir; bayrak yanlış işaretlenirse vergi hiç kesilmez |
| R5 | `IsMinimumWage` personelde avans ve eksik gün **netten düşülmüyor**, ama avans "kesildi" işaretleniyor | PSC:1410-1414, :1582-1585 | Avans kaybolur, personele fazla ödenir |
| R6 | Eksik gün, vergiler hesaplandıktan sonra netten brüt günlük ücretle düşülüyor; SGK prim günü tutulmuyor | PSC:1366-1399 | SGK ve GV fazla hesaplanır, APHB gün sayısı yok |
| R7 | Ek ödeme girişte net tutarla **hemen** kasadan ödeniyor; vergiye tabi ise aynı tutar o ayın brütüne de ekleniyor | AdditionalPayment ctrl :379-424 + PSC:1329-1372 | **Çift ödeme**; ayrıca girişteki vergi 2024 tarifesi + damga ile hesaplanıyor |
| R8 | Avans hem `AccountPayments` ile ödeniyor hem net borçtan düşülüyor | PersonnelAdvance ctrl :285; PSC:1362 | Cari bakiyede çift sayım riski (`⚠ doğrulanmalı`) |
| R9 | Onay akışı ölü; ödeme onay kontrolü yapmıyor | §2.3 | Dört göz ilkesi yok |
| R10 | BulkPayment satır hatasında `continue` ediyor ve aborted transaction'ı commit ediyor | PSC:3266-3309 | Kullanıcı "başarılı" görür, kayıtlar oluşmamıştır; ya da kısmi tutarsızlık oluşur |
| R11 | `UpdateExistingSalariesWithNewAbsences` maaşı ve borcu yerinde UPDATE ediyor. "Ödendi mi" kontrolü `ZT_PersonnelSalaries.PaidAmount` kolonuna bakıyor, ancak ödemeler yalnız `ZT_AccountDebts.PaidAmount` kolonunu güncelliyor. | PSU:270-280, :322-420 | Ödenmiş maaş değiştirilebilir; ters kayıt yok |
| R12 | `DeleteWithDebts` GET ile maaşları ve borçları fiziksel siliyor, transaction yok | PC:582-700 | Ödenmiş maaşların ödemeleri ve fon hareketleri sahipsiz kalır; denetim izi kaybolur |
| R13 | Yuvarlama yalnız GV'de (2 hane). SGK, damga, avans taksiti (`Amount/InstallmentCount`) ve eksik gün yuvarlanmıyor | PSC:1380-1418; Advance ctrl :244 | Kuruş farkları; taksit toplamı avansı tutmaz |
| R14 | "Elden Maaş" (`HandCashSalary`): bordro dışı, SGK ve vergi dışı ödeme | PSC:1259-1422 | **Yasal risk (kayıt dışı ücret).** Kullanıcı kararı gerekli (§7-S3) |
| R15 | Maaş dövizli olabiliyor (`CurrencyID`); SGK ve GV ise TL'ye çevrilmeden hesaplanıyor; `ExchangeRate=1` | PSC:1260, :2522 | Dövizli personelde yanlış vergi |
| R16 | Zimmet borçlandırma `ZT_AccountDebts`'e `AccountingType`'sız yazılıyor | PersonnelAsset ctrl :284 | Yön şüpheli; personel filtreli sorgularda görünmez |
| R17 | Eksik gün girişi doğrudan "Onaylandı" yazılıyor | PersonnelAbsence ctrl :89-117 | Onay adımı fiilen yok |
| R18 | Personel ekleme + cari açma transaction'sız; kod `MAX(ID)+1` ile üretiliyor | PC:169-260, :801 | Carisiz personel; yarış durumunda çift kod |
| R19 | İşveren SGK ve işsizlik payı hiç tahakkuk etmiyor; işçi payları "Masraf Hesabı" carisine yazılıyor | PSC:1624-1659 | SGK borcu eksik; gider ile borç karışık |
| R20 | `allowRecreate` parametresi yok sayılıyor; aynı dönemi yeniden hesaplamanın yolu yok (yalnız eksik gün güncellemesi var) | PSC:1188, :1318 | Hatalı bordro düzeltilemez |
| R21 | Damga vergisi GV matrahından düşülüyor | PSC:1387 | Mevzuata aykırı (GV matrahı = brüt − SGK işçi − işsizlik işçi) — `⚠ mali müşavirle doğrulanmalı` |
| R22 | MakePayment'ta ödeme tarihi kullanıcıdan alınmıyor (`Now`) | PSC:2512 | Geriye dönük ödeme girilemez |
| R23 | Personel listesi TCKN'yi maskesiz gösteriyor; "Muhasebe (Alış)" rolü maaşları görüyor | PC:80; PSC:15 | KVKK (§6) |

---

## 3. SGK bildirimi — ne üretiyor?

**Dosya üretmiyor.** `SGKDeclarationController` yalnız bir kayıt ve durum takibi yapar:
1. `Add`, `ZT_SGKDeclarations` tablosuna şu alanları yazar: tür (İşe Giriş / İşten Çıkış / Ücret Değişikliği), tarih, dönem, `BaseWage` (boşsa `MonthlySalary`), `WorkedDays`, `DocumentNo`, not (ctrl :219-300).
2. `Submit`, durumu "Gönderildi" yapar ve `SubmissionDate` yazar (:329-360).
3. `Approve`, durumu "Onaylandı" yapar (:366-400).

Olmayanlar:
- XML, TXT ya da Excel çıktısı yok.
- e-Bildirge ve SGK web servis entegrasyonu yok.
- APHB (aylık prim ve hizmet belgesi) yok.
- Eksik gün nedeni kodu, meslek kodu, çıkış nedeni kodu yok.

Kullanıcı bildirimi SGK sisteminde elle yapar, ZTO'da yalnız "yapıldı" işaretler. Muhtasar ve prim hizmet beyannamesi de üretilmez. Raporlar yalnız CSV maliyet dökümüdür (§1.8).

---

## 4. Eşleme tablosu

Karar kodları (04 §3): **UI-API** = ekran yazılır, mevcut API yeterli · **UI+GEN** = API genişletilir · **UI+YENİ** = yeni uç · **UI+TABLO** = yeni migration · **ÇIKAR** = taşınmaz.

| ZTO öğe | Blackrose karşılığı (dosya:satır) | Karar |
|---|---|---|
| Personnel liste/ekle/düzenle | Yok. En yakın karşılık `driver` (`Driver.java:17`, `FRS:112-148`) | **UI+TABLO**: `personnel`, `personnel_employment`, `personnel_wage` (V2xP1-P2). Ekran ZTO görünümünde, `/hr/personnel` uçları. |
| Personel carisi (`AccountGroup='Personel'`, `PER-nnnn`) | `AccountType.EMPLOYEE` (`FinanceTypes.java:12`); sürücü carisi deseni `FRS:122-126` | **UI-API**: personel oluşturulurken aynı transaction'da `EMPLOYEE` carisi açılır, kod `PER-<kod>`. Sürücüye bağlı personelde mevcut `SRC-` carisi kullanılır (§4.1). |
| Departman (`ZT_Departments`) | Yok | **UI+TABLO**: `department` (V2xP1) |
| İş Yeri + Şube İli | `branch` (V1); MX5 `company` + `branch.company_id` | **UI-API** (MX5'e bağlı): personel istihdamı `company_id` + `branch_id` taşır |
| Delete (pasif) | — | **UI+YENİ**: `personnel_employment.end_date` + çıkış kodu; personel soft delete yalnız hareketsizse |
| DeleteWithDebts | — | **ÇIKAR**: fiziksel silme yasak. Yerine bordro iptali (ters kayıt) + istihdam sonlandırma. |
| PersonnelSalary CreateBulk | — | **UI+TABLO**: `payroll_run`, `payroll_line`, `payroll_line_item` (V2xP4); hesap motoru `PayrollCalculator` (Java, parametreler tablodan) |
| SalaryCalculationConstants / Params | — | **UI+TABLO**: yıllık parametre seti ve dilim tablosu (V2xP3; §5.3). Kodda sabit **olmaz**. |
| Net → brüt hesaplayıcı (ölü uç) | — | **UI+YENİ**: `POST /hr/payroll/calculator` (brüt↔net, aynı motor). Ölü olduğu için ZTO'da ekranı yok; ekranı Blackrose tasarlar ve ZTO kartlarıyla aynı görünümde olur. |
| Onay (PSA) | Dört göz ayarı `finance_settings.allow_self_approval` (V16) | **UI+TABLO**: `payroll_event` (V2xP4), `PAYROLL_APPROVE` izni. Durumlar: DRAFT → CALCULATED → SUBMITTED → APPROVED → POSTED → (PARTIALLY_)PAID / CANCELLED. Ödeme yalnız POSTED sonrası yapılır. |
| UpdateExistingSalariesWithNewAbsences | — | **UI+GEN**: POSTED öncesi satır yeniden hesaplanır; POSTED sonrası "fark bordrosu" (ek satır, `run_type=CORRECTION`). Yerinde UPDATE **yok**. |
| Net Maaş borcu (`ZT_AccountDebts`) | `LS:49` `post` | **UI-API**: `PAYROLL_NET` CREDIT → personel carisi (§5.6) |
| Elden Maaş borcu | — | **ÇIKAR (önerilen)**, kullanıcı kararı §7-S3 |
| SGK, Damga, GV "Masraf Hesabı" borçları | `LS:49`; cari türü `SUPPLIER` + V22 `sub_group` | **UI+GEN**: şirket başına "SGK Müdürlüğü" ve "Vergi Dairesi (muhtasar)" carileri (`sub_group=KAMU`); `PAYROLL_SGK`, `PAYROLL_GV`, `PAYROLL_DV` CREDIT |
| MakePayment (tek) | `SS:86` `create(PAYMENT, …)`, `FinanceController` `/payments` (MX2 §0) | **UI+GEN**: ödeme `settlement.origin_type='PAYROLL_LINE'` ile bağlanır (V32'deki `origin_type/origin_id` kolonu yeniden kullanılır). Çapraz kur yok: bordro TL'dir. |
| BulkPayment | `SS:86` (satır başına) | **UI+YENİ**: `POST /hr/payroll/runs/{id}/payments` (satır başına `idempotencyKey = PAYROLL_PAY:<line_id>:<n>`, tek transaction, hata olursa tamamı geri alınır) |
| Ödeme planı (`SourceType='Maaş'`) | `payment_plan` + V33 `source_type/source_id` | **UI+GEN**: POSTED bordro, şirketin ayarına göre `payment_plan` (`source_type='PAYROLL_RUN'`) üretir |
| PersonnelAdvance | `DriverAdvanceService.java:34` → `SS:86` | **UI+TABLO**: `personnel_advance` (+ `settlement_id`), `personnel_advance_deduction` (V2xP5). `DriverAdvanceService` bu servise devreder. |
| PersonnelAdditionalPayment | — | **UI+TABLO**: `additional_payment_type`, `personnel_additional_payment` (V2xP6). **Girişte kasa çıkışı yok**, ödeme bordroyla yapılır (R7). Bordro dışı peşin ödeme istenirse avans olarak girilir. |
| Ek ödeme raporu | — | **UI+YENİ**: `/hr/additional-payments/report` |
| PersonnelAbsence | — | **UI+TABLO**: `personnel_absence` (V2xP7), onay zorunlu, SGK eksik gün nedeni kodu |
| PersonnelLeave + Balances | — | **UI+TABLO**: `leave_type`, `personnel_leave`, `personnel_leave_entitlement` (V2xP7). Bakiye hesaplanır, saklanmaz. Belge `files` modülüne gider. |
| PersonnelAsset | — | **UI+TABLO**: `personnel_asset` (V2xP8). Borçlandırma `LS:49` `PERSONNEL_ASSET_CHARGE` **DEBIT** (personel bize borçlu); bordroda kesinti olarak düşülebilir. |
| PersonnelDashboard | — | **UI+YENİ**: `/hr/dashboard`. Onboarding (`ZT_OnboardingChecklist`) **ÇIKAR**; ileride ayrı iş. |
| PersonnelReports + CSV | `reporting` modülü | **UI+YENİ**: aylık maliyet ve yıllık trend. Dışa aktarım `xlsx` (04 §2). |
| SGKDeclaration | — | **UI+TABLO**: `sgk_notification` (V2xP9), durum takibi (ZTO ile aynı). APHB dosyası faz 2 (§7-S2). |
| CustomerAccounts'ta personel gizleme (süper kullanıcı) | V22 `FINANCE_EMPLOYEE_VIEW` | **UI-API**: `EMPLOYEE` cariler bu izin olmadan listelenmez |
| Banka/Kasa "Net Maaş" hareket tipi | `fund_transaction` (`SOURCE_SETTLEMENT`) | **UI-API**: hareket listesinde `source_type=SETTLEMENT` + `settlement.origin_type=PAYROLL_LINE` ise "Net Maaş" etiketi gösterilir |
| `Overtime`, `Bonus`, `FoodAllowance`… boş kolonlar | — | **UI+TABLO**: `payroll_line_item` satırları (kod listesiyle). Boş kolon taşınmaz. |
| AGİ alanları | — | **ÇIKAR** (2022'den beri yürürlükte değil) |

### 4.1 Personel ↔ Sürücü ilişkisi — öneri

| Seçenek | Artı | Eksi |
|---|---|---|
| A. `personnel` İK ana kaydıdır; `driver.personnel_id` (UNIQUE, nullable) ile sürücü bir personele bağlanır. Cari tektir: `personnel.account_id`. | Filo modülü bozulmaz. Sürücü olmayan personel de olur. Taşeron ya da kiralık sürücü (`personnel_id` NULL) desteklenir. Bordro, avans, harcırah ve masraf **tek EMPLOYEE carisinde** toplanır. | Ad ve telefon iki yerde tutulur; senkron gerekir (sürücü adı personelden okunur) |
| B. Tek `person` tablosu + rol tablosu | Tek kaynak | Büyük refaktör; `driver` FK'leri (V6, V7, V13) değişir. CI eşikleri riske girer. |
| C. Sürücü ayrı kalır, personel ayrı | Basit | Aynı kişi için iki cari olur; avans ile maaş birbirinden kopar |

**Öneri: A.**

Uygulama adımları:
1. V2xP10, her mevcut `driver` için bir `personnel` satırı oluşturur: `full_name`, `phone`, `branch_id`, `account_id` = sürücünün mevcut carisi, `code` = sürücü kodu. Ardından `driver.personnel_id` doldurulur.
2. Bu personellerin `personnel_employment` kaydı açılmaz. Ücret ve SGK bilgileri İK tarafından tamamlanana kadar bordroya girmezler.
3. `FleetRegistryService.createDriver` iki şekilde çalışır:
   - İsteğe `personnelId` verilirse, o personelin carisi kullanılır.
   - Verilmezse, eski davranış sürer: `SRC-` carisi açılır, ardından personel kaydı otomatik oluşturulur.
4. `driver.full_name` geçiş süresince kalır, ama personelden güncellenir.

---

## 5. Önerilen migration'lar ve defter kayıtları

Genel kurallar:
- Tüm tablolarda `AuditableEntity` kolonları (`created_by/at`, `updated_by/at`, `deleted`) bulunur.
- Para tutarları `NUMERIC(19,4)`, oranlar `NUMERIC(9,6)` olur.
- Bordro tutarları **TL** olur (§7-S5).
- Hesaplanmış bileşenler satırda dondurulur (parametre değişse de geçmiş bordro değişmez).

### 5.1 V2xP1 — `personnel_core`

- `department` (`id`, `code`, `name`, `active`)
- `personnel`:
  - kimlik: `id`, `code` UNIQUE (aktif), `first_name`, `last_name`
  - TCKN: `tckn_enc` (şifreli), `tckn_hash` (HMAC, UNIQUE aktif), `tckn_last4`
  - kişisel: `birth_date`, `gender`, `marital_status` (SINGLE/MARRIED), `spouse_working` bool, `child_count`
  - engellilik: `disability_degree` (0–3, **özel nitelikli veri**)
  - iletişim: `phone`, `email`, `address_enc`, `city`, `district`
  - diğer: `nationality` CHAR(2)
  - ödeme bilgisi: `iban_enc`, `iban_last4`, `bank_name`
  - bağlantılar: `account_id` (FK `account`, `EMPLOYEE`, NOT NULL), `photo_file_id`
  - durum: `status` (ACTIVE/PASSIVE), `notes`
- İzin tohumu: §6.2.

### 5.2 V2xP2 — `personnel_employment`

- `personnel_employment`:
  - bağlantılar: `id`, `personnel_id`, `company_id` (MX5), `branch_id`, `department_id`, `position_title`
  - dönem: `start_date`, `end_date`, `exit_reason_code` (SGK çıkış kodu)
  - çalışma şekli: `employment_type` (FULL_TIME/PART_TIME/SEASONAL/TEMPORARY)
  - SGK: `sgk_status` (NORMAL_4A/APPRENTICE/INTERN/RETIRED_SGDP/FOREIGN), `sgk_registry_no` (işyeri sicili şirketten gelir; burada sigortalı bilgisi), `occupation_code`
  - süre: `working_days_per_month` (30), `weekly_hours`
  - ödeme: `payment_day`, `payment_method` (BANK/CASH), `default_fund_account_id`
  - izin: `annual_leave_entitlement_override`
  - vergi: `tax_exemption_monthly` (engellilik dışı özel indirim; gerekçe zorunlu)
- Kısıtlar:
  - `EXCLUDE` ya da uygulama kuralı: aynı personelin aynı şirkette çakışan dönemi olmaz.
  - Farklı şirkette eşzamanlı istihdam mümkündür.
- `personnel_wage`:
  - `employment_id`, `effective_from`, `wage_type` (GROSS/NET), `amount`, `hourly_rate`
  - `UNIQUE(employment_id, effective_from)`
  - Ücret değişikliği geçmişi tutulur ve `sgk_notification` tetikler.

### 5.3 V2xP3 — `payroll_parameters`

Öneri: Yasal parametreler ülke genelidir. Bu yüzden **admin şemasında** tutulur (`admin.exchange_rate` gibi; SaaS yöneticisi günceller). Kiracı ancak gerekçeyle geçersiz kılabilir (§7-S6).

- `admin.payroll_parameter_set`:
  - dönem: `id`, `valid_from`, `valid_to`, `year`
  - asgari ücret: `min_wage_gross`, `min_wage_net`
  - SGK sınırları: `sgk_floor`, `sgk_ceiling` (ya da `sgk_ceiling_multiplier`)
  - işçi payları: `sgk_employee_rate`, `unemp_employee_rate`
  - işveren payları: `sgk_employer_rate`, `unemp_employer_rate`, `sgk_incentive_points`
  - damga: `stamp_rate`
  - engellilik: `disability_deduction_1/2/3` (aylık tutar)
  - fazla mesai: `overtime_multiplier` (1,5)
  - tatil mesaisi: `holiday_multiplier`
  - durum: `status` (DRAFT/PUBLISHED), `published_by/at`
- `admin.payroll_tax_bracket`: `parameter_set_id`, `income_kind` (WAGE/NON_WAGE), `seq`, `upper_limit` (NULL = son dilim), `rate`.
- `admin.payroll_exempt_limit`: yemek ve yol gibi istisna günlük limitleri (`code`, `daily_limit`, `parameter_set_id`).
- Kiracı tarafı:
  - `payroll_settings`: şirket başına `sgk_workplace_no_enc`, `sgk_account_id`, `tax_office_account_id`, `incentive_code`, `auto_payment_plan` bool, `default_fund_account_id`.
  - `payroll_parameter_override` (opsiyonel).

### 5.4 V2xP4 — `payroll_run`

- `payroll_run`:
  - kapsam: `id`, `company_id`, `period_year`, `period_month`, `run_type` (REGULAR/CORRECTION/EXIT)
  - durum: `status` (DRAFT/CALCULATED/SUBMITTED/APPROVED/POSTED/PARTIALLY_PAID/PAID/CANCELLED)
  - parametre: `parameter_set_id`
  - akış izleri: `calculated_at`, `submitted_by/at`, `approved_by/at`, `posted_at`, `cancelled_by/at`, `cancel_reason`
  - toplamlar (önbellek; doğruluk kaynağı satırlardır)
  - Kısıt: `UNIQUE(company_id, period_year, period_month, run_type) WHERE status <> 'CANCELLED' AND run_type='REGULAR'`
- `payroll_line`. Tüm bileşenler dondurulur:
  - bağlam: `id`, `run_id`, `personnel_id`, `employment_id`, `branch_id`, `account_id`
  - günler: `calendar_days`, `sgk_days`, `absence_days`, `absence_reason_code`, `paid_leave_days`, `unpaid_leave_days`
  - brüt bileşenler: `base_gross`, `overtime_hours`, `overtime_amount`, `additional_taxable`, `additional_exempt`, `gross_total`
  - SGK: `sgk_base`, `sgk_employee`, `unemp_employee`
  - GV: `gv_base`, `cumulative_gv_base_before`, `gv_calculated`, `gv_min_wage_exemption`, `disability_deduction`, `gv_payable`
  - DV: `dv_calculated`, `dv_min_wage_exemption`, `dv_payable`
  - net ve kesintiler: `net_wage`, `advance_deduction`, `garnishment_deduction` (icra), `bes_deduction`, `asset_deduction`, `other_deduction`, `net_payable`
  - işveren: `sgk_employer`, `unemp_employer`, `incentive_amount`, `employer_cost`
  - ödeme izi: `paid_amount` (önbellek; doğruluk kaynağı `settlement`)
  - iz: `calc_source` (CALCULATED/IMPORTED/MANUAL), `calc_snapshot` JSONB (girdi + parametre özeti)
  - Kısıt: `UNIQUE(run_id, personnel_id, employment_id)`
- `payroll_line_item`:
  - `line_id`, `kind` (EARNING/DEDUCTION/EMPLOYER), `code` (OVERTIME, BONUS, FOOD, TRANSPORT, GARNISHMENT, BES, ASSET…)
  - `quantity`, `rate`, `amount`
  - bayraklar: `subject_sgk`, `subject_gv`, `subject_dv`
  - kaynak: `source_type`, `source_id`
  - Ek ödeme, icra ve zimmet satırlarının kaynağı buradan izlenir.
- `payroll_event`: `run_id`, `line_id` NULL, `action` (CALCULATE/SUBMIT/APPROVE/REJECT/POST/CANCEL/RECALC), `actor`, `note`, `at`.
  - Dört göz: SUBMIT eden APPROVE edemez (`allow_self_approval` ayarına bağlı).
- `garnishment` (icra): `personnel_id`, `file_no`, `creditor_account_id` (icra dairesi carisi), `total_amount`, `monthly_rate` (net ücretin 1/4'ü vb.), `priority`, `status`. Kesilen tutar hesaplanır.
- `bes_enrollment`: `personnel_id`, `company_id`, `rate`, `provider_account_id`, `start_date`, `opt_out_date`.

**Hesap sırası (motor; her bileşen 2 haneye half-up yuvarlanır):**
1. Gün hesabı: `sgk_days = 30 − ücretsiz eksik gün` (ay kesirli değil, 30 gün esası).
2. Brüt: `base_gross = ücret × sgk_days / 30`. Netten tanımlı ücret iteratif çözülür. Üstüne fazla mesai ve vergiye tabi ek ödemeler eklenir.
3. SGK matrahı = brüt − SGK'dan muaf ek ödemeler. Matrah, taban ve tavanla (parametre) sınırlanır. İşçi SGK ve işsizlik payları bu matrahtan hesaplanır.
4. GV matrahı = brüt (GV'ye tabi kısım) − SGK işçi − işsizlik işçi − engellilik indirimi. Damga matrahtan **düşülmez**.
5. GV = tarife(`kümülatif_önce + gv_base`) − tarife(`kümülatif_önce`). Kümülatif matrah **aynı şirket, aynı yıl** satırlarından gelir.
6. Asgari ücret GV istisnası: aynı formül, asgari ücretin GV matrahı ve kümülatifiyle hesaplanır; GV'yi aşamaz. DV istisnası = asgari ücret brütü × damga oranı.
7. Net ücret = brüt − SGK − işsizlik − GV ödenecek − DV ödenecek.
8. Netten kesintiler, öncelik sırasıyla: icra → BES → avans → zimmet → diğer. Hiçbir kesinti net ücreti negatif yapamaz.
9. İşveren payı: SGK işveren + işsizlik işveren − teşvik.

Motor `@Service PayrollCalculator` içinde saf fonksiyon olarak yazılır. Testleri, parametre setine bağlı ve resmî örnek bordrolarla yapılır.

### 5.5 V2xP5–P10

| Ad | İçerik |
|---|---|
| V2xP5 `personnel_advance` | `personnel_advance` (`personnel_id`, `company_id`, `settlement_id` FK UNIQUE, `amount`, `currency`='TRY', `installment_count`, `monthly_deduction` (son taksit farkı kapatır), `start_year/month`, `status` ACTIVE/CLOSED/CANCELLED). `personnel_advance_deduction` (`advance_id`, `payroll_line_id`, `amount`, `UNIQUE(advance_id, payroll_line_id)`). Kalan tutar **hesaplanır**. |
| V2xP6 `additional_payment` | `additional_payment_type` (`code`, `name`, `subject_sgk`, `subject_gv`, `subject_dv`, `exempt_limit_code`); `personnel_additional_payment` (`personnel_id`, `employment_id`, `type_id`, `period_year/month`, `amount`, `amount_kind` GROSS/NET, `status` DRAFT/APPROVED/IN_PAYROLL/CANCELLED, `payroll_line_item_id`, `approved_by/at`) |
| V2xP7 `absence_leave` | `leave_type` (`code`, `name`, `paid`, `deducts_annual`, `sgk_absence_reason_code`, `requires_document`); `personnel_absence` (`date`, `unit`, `value`, `type`, `deduction_source` SALARY/ANNUAL_LEAVE/NONE, `reason_category` (kod; serbest sağlık metni yok), `document_file_id`, `status`, `payroll_line_id`); `personnel_leave` (`start/end` tarih-saat, `days`, `hours`, `half_day`, `leave_type_id`, `status`, `document_file_id`, `payroll_line_id`; ay sınırını aşan izin günlere bölünerek bordroya girer); `personnel_leave_entitlement` (`personnel_id`, `year`, `leave_type_id`, `entitled_days`, `carried_over_days`). Kullanılan ve kalan gün **hesaplanır**. |
| V2xP8 `personnel_asset` | `personnel_asset` (`code`, `name`, `category`, `serial_no`, `assign_date`, `expected_return_date`, `return_date`, `value`, `currency`, `condition`, `status`, `charged_amount`, `document_file_id`). Borçlandırma: `asset_charge` (`asset_id`, `amount`, `reason`) → defter kaydı. |
| V2xP9 `sgk_notification` | `sgk_notification` (`personnel_id`, `employment_id`, `company_id`, `type` HIRE/EXIT/WAGE_CHANGE, `event_date`, `period_year/month`, `base_wage`, `worked_days`, `document_no`, `status` PENDING/SUBMITTED/CONFIRMED, `submitted_by/at`, `file_id`). İşe giriş ve çıkışta otomatik PENDING kayıt açılır. |
| V2xP10 `driver_personnel_link` + izinler | `ALTER TABLE driver ADD personnel_id UUID UNIQUE REFERENCES personnel(id)`; backfill (§4.1); `role_permission` tohumu (§6.2) |

### 5.6 Defter kayıtları (tek finans motoru)

Yön (`FinanceTypes.java:17`): CREDIT = bizim cariye borcumuz artar, DEBIT = cari bize borçlanır / ödedik.

| Olay | Servis | Cari / hesap | Yön | `source_type` | `source_id` |
|---|---|---|---|---|---|
| Bordro POST: net ücret tahakkuku | `LS.post` | personel `EMPLOYEE` | CREDIT | `PAYROLL_NET` | `payroll_line.id` |
| Bordro POST: icra kesintisi (personelden düş) | `LS.post` | personel | DEBIT | `PAYROLL_GARNISH_EMP` | `payroll_line.id` |
| Bordro POST: icra dairesine borç | `LS.post` | icra dairesi carisi (`SUPPLIER/KAMU`) | CREDIT | `PAYROLL_GARNISH` | `payroll_line.id` |
| Bordro POST: BES (personelden düş + şirkete borç) | `LS.post` ×2 | personel / BES şirketi | DEBIT / CREDIT | `PAYROLL_BES_EMP` / `PAYROLL_BES` | `payroll_line.id` |
| Bordro POST: zimmet kesintisi | `LS.post` | personel | — (zimmet zaten DEBIT yazıldı; kesinti yalnız nettenin düşük ödenmesiyle kapanır) | — | — |
| Bordro POST: avans kesintisi | — | — | Ayrı kayıt **yok**. Avans ödendiğinde personele DEBIT yazıldı (`SETTLEMENT`); net tahakkuk CREDIT olduğu için kalan bakiye = net − avans. Eşleşme `personnel_advance_deduction` ile izlenir. | — | — |
| Bordro POST: SGK borcu (işçi + işveren + işsizlik − teşvik, şirket toplamı) | `LS.post` | şirketin SGK carisi | CREDIT | `PAYROLL_SGK` | `payroll_run.id` |
| Bordro POST: GV (muhtasar) | `LS.post` | şirketin vergi dairesi carisi | CREDIT | `PAYROLL_GV` | `payroll_run.id` |
| Bordro POST: DV | `LS.post` | vergi dairesi carisi | CREDIT | `PAYROLL_DV` | `payroll_run.id` |
| Maaş ödemesi (tek/toplu) | `SS.create(PAYMENT)` → `LS` + `FLS` | personel / fon | DEBIT / OUT | `SETTLEMENT` | `settlement.id` (`origin_type=PAYROLL_LINE`) |
| SGK, muhtasar ve icra ödemeleri | `SS.create(PAYMENT)` | ilgili kamu carisi / fon | DEBIT / OUT | `SETTLEMENT` | `settlement.id` (`origin_type=PAYROLL_RUN`) |
| Avans | `SS.create(PAYMENT)` (`DriverAdvanceService` deseni) | personel / fon | DEBIT / OUT | `SETTLEMENT` | `settlement.id`; `personnel_advance.settlement_id` |
| Zimmet borçlandırma | `LS.post` | personel | DEBIT | `PERSONNEL_ASSET_CHARGE` | `asset_charge.id` |
| Bordro iptali | `LS.reverseSource` (her `PAYROLL_*` için) | — | ters | `REVERSAL` | orijinal hareket |

Kurallar:
- POSTED bordro iptal edilecekse önce ödemeleri ters çevrilmelidir. `SS.reverse` mevcut. Plana bağlı ödemelerde kısıt `SS:162`.
- Avans kesintileri iptalde serbest bırakılır.
- Personel carisinin `branch_id` alanı istihdam şubesinden gelir. Bu sayede şirket bazında bakiye `account_transaction.branch_id → branch.company_id` ile alınabilir.
- Kamu carileri şirket başına açılır. MX5'te `account.company_id` yoksa şirketin merkez şubesine bağlanır.
- Brüt ücret ve işveren payı (gider) cari hareketi değildir. Maliyet raporu bordro tablolarından okunur. İstenirse V34 `expense` modeline `context_type='PAYROLL_RUN'` ile bilgi amaçlı gider satırı yazılır.
- Hiçbir `PAYROLL_*` kaydı fiziksel silinmez. Düzeltme, iptal + yeni bordro ya da CORRECTION bordrosuyla yapılır.

---

## 6. KVKK

### 6.1 Hassas alanlar ve önlem

| Alan | Sınıf | Saklama | Gösterim | Erişim |
|---|---|---|---|---|
| TCKN | Kimlik | `tckn_enc` (AES-GCM, ayrı anahtar: `CryptoConfig` desenine `personnelEncryptor`), `tckn_hash` (HMAC-SHA256, tekillik ve arama), `tckn_last4` | `*******1234` | Açık hali yalnız `HR_SENSITIVE_VIEW`; her açma denetim günlüğüne yazılır |
| IBAN | Finansal | `iban_enc`, `iban_last4` (personelde ya da V22 `account_bank_account` + şifreleme) | `TR** … 1234` (ZTO maskesi PSC:2451 gibi) | Ödeme talimatı üretimi servis içinde açar; ekrana yalnız `HR_SENSITIVE_VIEW` ile |
| Adres, doğum tarihi | Kişisel | `address_enc`; doğum tarihi düz | Listede yok | `HR_VIEW` |
| Engellilik derecesi | **Özel nitelikli (sağlık, KVKK m.6)** | Ayrı kolon, şifreli değil ama yalnız bordro motoru okur | Yalnız `HR_SENSITIVE_VIEW` | Aydınlatma metni + hukukçu değerlendirmesi |
| Rapor, hastalık izni, eksik gün nedeni | **Özel nitelikli (sağlık)** | Serbest metin yerine `reason_category` kodu; belge `files` modülünde, `HR_SENSITIVE_VIEW` erişimli klasörde | Listede yalnız izin türü adı | Belgeyi indirme denetime yazılır |
| Medeni durum, çocuk sayısı | Kişisel | Düz | `HR_VIEW` | — |
| Ücret, bordro satırları | Finansal | Düz | `PAYROLL_VIEW` | Personel carileri V22 `FINANCE_EMPLOYEE_VIEW` olmadan cari listesinde görünmez |
| SGK işyeri sicil no | Şirket | `sgk_workplace_no_enc` | Maskeli | `PAYROLL_PREPARE` |

Ek önlemler:
- Firma dışa aktarımında personel hassas alanları şifreli haliyle çıkar, ya da hiç çıkmaz (kullanıcı ve parola alanlarıyla aynı kural).
- `docs/KVKK_VERI_ISLEME_KAYDI.md` tablosuna şu satırlar eklenmeli:
  - **Personel**: kimlik, iletişim, ücret, SGK, IBAN, aile bilgisi
  - **Personel sağlık verisi**: engellilik, rapor
  - **Bordro**: saklama süresi mevzuata göre, hukukçu belirleyecek
- Sürücüde konum verisi zaten var. Personel kaydıyla birleşince kişi profili zenginleşir; bu, aydınlatma metnine yansıtılmalı.
- ZTO hatası (R23) taşınmaz:
  - TCKN listede yok, yalnız maskeli.
  - Muhasebe rolü bordroyu yalnız `PAYROLL_VIEW` verilirse görür.

### 6.2 Yeni izinler (`Permission.java` + `role_permission` tohumu)

| İzin | Modül | Kapsam | Varsayılan rol |
|---|---|---|---|
| `HR_VIEW` | hr | Personel kartı (maskeli), izin, eksik gün, zimmet listeleri | PATRON, FINANCE_SUPER |
| `HR_MANAGE` | hr | Personel, istihdam, ücret, izin, eksik gün, zimmet CRUD ve onayı | PATRON, FINANCE_SUPER |
| `HR_SENSITIVE_VIEW` | hr | TCKN, IBAN ve sağlık belgelerinin açık hali | PATRON |
| `PAYROLL_VIEW` | hr | Bordro ve maliyet raporları | PATRON, FINANCE_SUPER |
| `PAYROLL_PREPARE` | hr | Bordro hesapla, ek ödeme ve avans gir, SUBMIT | FINANCE_SUPER, ACCOUNTING |
| `PAYROLL_APPROVE` | hr | APPROVE/REJECT/POST/CANCEL (dört göz) | PATRON |
| (mevcut) `FINANCE_PAYMENT_CREATE` | finance | Maaş, SGK ve muhtasar ödemesi | mevcut |
| (V22) `FINANCE_EMPLOYEE_VIEW` | finance | `EMPLOYEE` carilerin cari ekranında görünmesi | PATRON, FINANCE_SUPER |

İzin anlamı (ZTO'ya göre fark):
- ZTO'da "Finans(normal)" SGK bildirimlerini görür, "Muhasebe (Alış)" maaşları görür.
- Blackrose'da bu, rol değil izin ataması ile yapılır. Tohum en dar haliyle başlar.

---

## 7. Kullanıcıya açık sorular (önerili)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| S1 | Bordro motorunun yasal bağlayıcılığı | (a) Tam yasal bordro (kümülatif GV, istisnalar, teşvik), sistem resmî bordrodur. (b) Yönetim bordrosu: mali müşavirin bordrosu Excel ile içe aktarılır, sistem yalnız tahakkuk ve ödeme yapar. (c) Karma: motor hesaplar, satırlar müşavir verisiyle içe aktarılabilir ve düzeltilebilir (`calc_source`). | **(c)**. Motor §5.4 kurallarıyla yazılır ama resmî bordro müşavirde kalır. İlk ay paralel çalıştırılıp farklar karşılaştırılır. |
| S2 | e-Bildirge / APHB / muhtasar entegrasyonu | (a) Yok, ZTO gibi yalnız durum takibi. (b) SGK'ya yüklenebilir APHB ve işe giriş/çıkış dosyası üretimi. (c) SGK web servis entegrasyonu. | **Faz 1: (a)**, ZTO ile aynı. **Faz 2: (b)**. (c) şirket başına kullanıcı kodu ve şifre gerektirir; güvenlik ve KVKK yükü yüksek. |
| S3 | "Elden Maaş" (bordro dışı ödeme) taşınsın mı? | (a) ÇIKAR. (b) "Bordro dışı ödeme" türü olarak ayrı izinle (`PAYROLL_OFFBOOK`) ve ayrı raporla. | **(a) ÇIKAR**. Kayıt dışı ücret yasal risk taşır. Gerçekten gerekiyorsa vergiye tabi ek ödeme ya da avans olarak girilir. |
| S4 | Personel ↔ sürücü modeli | §4.1 A/B/C | **A**: `driver.personnel_id`, tek EMPLOYEE carisi, mevcut sürücülerden personel backfill'i |
| S5 | Döviz cinsinden maaş (ZTO'da var) | (a) Bordro yalnız TL. (b) Ücret dövizle tanımlanır, dönem kuruyla TL'ye çevrilip hesaplanır. | **(b)**: `personnel_wage.currency` + `ExchangeRateService`, satıra kur dondurulur. Tahakkuk ve ödeme TL. |
| S6 | Yasal parametrelerin yeri | (a) Kiracı tablosu, her firma girer. (b) Admin şeması, SaaS yöneticisi yayınlar; kiracı gerekçeyle geçersiz kılar. | **(b)**: tek doğru kaynak. Yeni yıl parametresi yayınlanmadan o yılın bordrosu POST edilemez. |

---

## Özet (10 satır)

1. ZTO'da 10 personel controller'ı (2 partial dosyası dahil 12 dosya, ~10,3 bin satır C#) ve 24 view (~12,7 bin satır Razor) incelendi. Blackrose'da personel, bordro, izin, zimmet ve SGK yok; yalnız `EMPLOYEE` cari türü ve sürücü carisi var (`FRS:122-126`).
2. ZTO bordrosu kodda sabit "2026" dilimleriyle aylık×12/12 yöntemiyle hesaplıyor. Kümülatif matrah, asgari ücret istisnası, işveren payı, SGK tavanı ve teşvik yok; üç ayrı vergi tarifesi var.
3. Onay uçları (PSA) ekrandan hiç çağrılmıyor ve ödeme onay kontrolü yok. Fiilen onaysız bordro ödeniyor.
4. Ciddi hatalar: ek ödemede çift ödeme (R7), asgari ücretlide avansın düşülmemesi (R5), "Avans" kaynaklı eksik günün kaybolması, toplu ödemede aborted transaction'ı commit etme (R10), fiziksel borç ve maaş silme (R12).
5. SGK bildirimi dosya üretmiyor; yalnız durum takibi yapıyor. Raporlar CSV.
6. Öneri: `personnel` + `personnel_employment` (şirket/şube/SGK) + `personnel_wage`; sürücü `driver.personnel_id` ile bağlanır, tek EMPLOYEE carisi kullanılır.
7. Yasal parametreler admin şemasında yıllık tablo olur; bordro `payroll_run` / `payroll_line` / `payroll_line_item` tablolarında, bileşenler dondurulmuş, `payroll_event` ile dört gözlü onay.
8. Defter: `PAYROLL_NET` (personel CREDIT), `PAYROLL_SGK` / `PAYROLL_GV` / `PAYROLL_DV` (şirket başına kamu carileri), icra ve BES ayrı kaynak tipleri. Ödemeler `SettlementService` ile; avans ayrı kayıt gerektirmez.
9. KVKK: TCKN, IBAN ve adres şifreli + hash + maskeli; sağlık verisi kodlu ve izinli belge. Yeni izinler: `HR_VIEW`, `HR_MANAGE`, `HR_SENSITIVE_VIEW`, `PAYROLL_VIEW`, `PAYROLL_PREPARE`, `PAYROLL_APPROVE`.
10. Açık sorular: motorun yasal bağlayıcılığı (öneri karma), e-Bildirge (önce yok, sonra dosya), Elden Maaş (öneri ÇIKAR), sürücü modeli (A), dövizli ücret (TL'ye çevrilerek), parametre yeri (admin).
