# MX-3 — Çek / Senet / Çek Koçanı / Cari Alacak / Kredi / Ödeme Onayı: ZTO → Blackrose eşleme matrisi

Kökler: ZTO = `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` · BR = `F:\visual studio zto\LogisticErp` (backend `backend/src/main/java/org/ece/blackrose/`, kısaltma `BRJ/`; frontend `frontend/src/`, kısaltma `BRF/`; migration `backend/src/main/resources/db/migration/tenant/`).
Salt-okunur analiz. ZTO satır numaraları bugünkü dosya hâlidir (controller action satırları yeniden tarandı). Envanter `analiz/envanter/C_odeme_cek_kredi.md` ile çapraz kontrol edildi; farklar notlandı. Bulunamayanlar `⚠ BULUNAMADI`.

Karar kodları: **UI-mevcut-API** (BR ucu yeterli) · **UI+API-genişlet** (mevcut BR servis/DTO'ya alan/uç eklenir) · **UI+yeni-API** (yeni uç, mevcut tablo) · **UI+yeni-tablo (V22+)** · **ÇIKAR** (gerekçeli).

> **12.3 uygulandı (2026-11-16); uygulama belgesi [`docs/zto-finans/uygulama/12.3_TASARIM.md`](../../uygulama/12.3_TASARIM.md)** (bu matrisin §2.1–§2.4 ve §4 V22/V23 kısmını düzeltir; sapmalar belge §0.4, otonom kararlar §9 OK-12.3-1…25). Uygulanan: tenant `V37__instrument_extensions` (Z08), `V38__check_book` (Z09); Çekler, Senetler, Çek Koçanları, Çek/Senet Düzenle, Çek Belgeleri, Detaylı Çek Raporu; çek/senet yaşam döngüsü (CANCELLED/RETURNED/COLLATERAL/PROTESTED), çekli/senetli ödeme-tahsilatın düzeltmesi ve iptali, "Bankadan Cari Çek Ödemesi". Bu matristen kalanlar: §2.6 kredi → 12.5; §2.7 plan/onay → 12.4; teminat senedi (`is_collateral`) UI'da devre dışı (OK-12.3-7).

---

## 0. Kapsam ve dosya listesi

| ZTO dosyası | Route (controller:satır) | Amaç | Satır |
|---|---|---|---|
| `Views/Checks/Checks.cshtml` | GET `/Checks/Checks` (`ChecksController.cs:26`) | Çek listesi, durum yönetimi, ödeme çeki ekleme, ciro | 5533 |
| `Views/Checks/EditCheck.cshtml` | GET/POST `/Checks/EditCheck` (`:2125`, `:2263`) | Çek düzenleme formu (modal değil) | 576 |
| `Views/Checks/CheckDetailedReport.cshtml` | GET `/Checks/CheckDetailedReport` (`:562`) | İş yeri → banka gruplu vade raporu | 994 |
| `Views/Checks/CheckDocuments.cshtml` | GET `/Checks/CheckDocuments?id=` (`:3378`) | Çek belge yükleme/indirme | 827 |
| `Views/Checks/Checks.cshtml.bak2` | — | Yedek dosya → **ÇIKAR** (taşınmaz) | 4870 |
| `Views/CheckBooks/Index.cshtml` | GET `/CheckBooks/Index` (`CheckBooksController.cs:23`) | Çek koçanı / yaprak yönetimi | 1073 |
| `Views/AccountCredits/Index.cshtml` | GET `/AccountCredits/Index` (`AccountCreditsController.cs:11`) | Müşteri bazlı alacak özeti (banka kredisi DEĞİL) | 608 |
| `Views/AccountCredits/Detail.cshtml` | GET `/AccountCredits/Detail/{customerAccountId}` (`:203`) | Bir carinin alacak satırları + düzenleme | 626 |
| `Views/CreditContracts/Index.cshtml` | GET `/CreditContracts/Index` (`CreditContractsController.cs:28`) | Kredi listesi (aktif + kapanmış), hızlı işlemler | 1758 |
| `Views/CreditContracts/Add.cshtml` | GET/POST `/CreditContracts/Add` (`:488`, `:522`) | Yeni kredi sözleşmesi formu | 1147 |
| `Views/CreditContracts/Details.cshtml` | GET `/CreditContracts/Details/{id}` (`:1715`) | Kredi detayı, taksit tablosu, kullanım/geri ödeme | 2774 |
| `Views/CreditContracts/Dashboard.cshtml` | GET `/CreditContracts/Dashboard` (`:322`) | Kredi & analiz panosu (Chart.js) | 479 |
| `Views/CreditContracts/CreditDocuments.cshtml` | GET `/CreditContracts/CreditDocuments?id=` (`:6464`) | Kredi belgeleri | 827 |
| `Views/PaymentManagement/PaymentPlanning.cshtml` | GET `/PaymentManagement/PaymentPlanning` (`PaymentManagementController.cs:34`) | Eski akış: borç bazlı ödeme planı | 300 |
| `Views/PaymentManagement/PaymentApprovalRequest.cshtml` | GET `/PaymentManagement/PaymentApprovalRequest` (`:492`) | Eski akış: onaya gönder | 205 |
| `Views/PaymentManagement/PaymentApprovals.cshtml` | GET `/PaymentManagement/PaymentApprovals` (`:794`) | Eski akış: onay/red/talimat | 254 |
| `Views/PaymentManagement/ProcessPaymentOrders.cshtml` | GET `/PaymentManagement/ProcessPaymentOrders` (`:1182`) | Eski akış: talimatlı ödemeyi gerçekleştir | 439 |
| `ApiController/PaymentApprovalApiController.cs` | POST `/Api/PaymentApprovalApi/CheckCompletedInstructions` (`:21-22`) | Talimat tamamlanma sorgusu | 72 |

**PromissoryNotes**: `PromissoryNotes` controller/view **yok** (`⚠ BULUNAMADI`). Senet `BillsController.cs` (1485 satır) + `Views/Bills/Bills.cshtml` (3724) + `EditBill.cshtml` (331) içinde; ayrıca ödeme/tahsilat modallarının "Senet" bölümleri `ZT_Bills`'e yazar. Bills bu raporda yalnız durum eşlemesi ve modal özetiyle ele alındı (§2.4); tam modal dökümü Bills'in sahibi olan parçaya aittir.

Çapraz kontrol: Checks modal sayısı ≈18 = `Checks.cshtml` 8 statik + `CheckDocuments` 3 + `CheckBooks` 1 + native `confirm()` 4 (`Checks.cshtml:3972`, `CheckBooks/Index.cshtml:929, 956`, `EditCheck` silme) + `payments.js` üretimli 2 (`confirmDeleteModal`, `paymentDetailModal`; sayfaya `Checks.cshtml:5477` ile yüklenir). CreditContracts statik modal sayısı = Index 8 + Details 12 + CreditDocuments 3 = **23** ✓.

---

## 1. Sayfa ve modal dökümü (ZTO)

Gösterim: `id` · etiket · tür · zorunluluk/doğrulama · kaynak. AJAX satırları view dosyasının satırıdır; hedef action satırı controller'dır.

### 1.1 `Checks.cshtml` — sayfa gövdesi

- Üst çubuk: `openAddCheckPaymentModal()` (:240 → `addCheckModal`), Detaylı Rapor (:262), Excel `exportToExcel()` (:268, DataTables Buttons), Yazdır (:274), linkler CustomerAccounts/CheckBooks/Payments/Bills (:196, :245, :250, :256).
- Filtre (:289-366): `filterStatus` (ViewBag `statusOptions`), `filterCustomer` (ViewBag.Customers, `ZT_CustomerAccounts`), `filterCheckBook` (ViewBag.CheckBookSerialNos), `filterDateStart` (vars. bugün−7), `filterDateEnd` (vars. bugün+30), Filtrele/Temizle, `ciroEdilebilirBtn` (:360 → `ciroChecksModal`, rozet `ciroCountBadge`). Filtre GET yeniden yükleme ile (:4720-4743).
- Özet kartları (:370+) **Razor yorumunda** (`@*`), görünmüyor → ÇIKAR.
- Tablo kolonları (:490-506): Çek Koçanı, Çek No (tıklanınca `showCheckLeaf`, :550), Çek Bankası, Keşideci, İlk Lehdar, Çek Sahibi, Tutar, Tutulma Yeri, Muhasebe Durumu, Keşide Tarihi, Vade Tarihi, Kalan Gün, Durum, Hareket (rozet → `showCheckMovements`, :819/:831), Açıklama, İşlem.
- Satır menüsü (:877-1081) = **ZTO'nun fiilî geçiş matrisi** (§2.2). Ortak işlemler: Çek Dokümanları (`/checks/CheckDocuments?id=`, :1043), Hareket Geçmişi (:1050), Çek Detayları (3B, :1061), Düzenle (:1069; yalnız Ciro Edildi/Tahsil Edildi/Karşılıksız/İptal değilse), "Ciro Edildi – İşlem Yapılamaz" (:1075).
- Okunan tablolar (GET): `ZT_Checks`, `ZT_CheckMovements` (sayım), `ZT_CheckBooks`, `ZT_CustomerAccounts`, `ZT_BankIntroduction`, `ZT_CashIntroduction`, `Currency`, `ZT_WorkPlace`, `ZT_BranchProvince`, personel tabloları, `ZT_ProductionPlanning` (layout).

### 1.2 `Checks.cshtml` — modallar

**M1 `ciroChecksModal`** (:1140-1176) "Ciro Edilebilir Çekler"
- Girdi yok. Tablo `ciroChecksTable`: Çek No, Banka, Keşideci, Lehdar, Tutar, Keşide T., Vade T., Tutulma Yeri, Durum, İşlem ("Ciro Et").
- AJAX: GET `/CustomerAccountPayment/GetEndorsableChecks` (:4502, :4516 → `CustomerAccountPaymentController.cs:4461`). Kural: `Portföyde` veya (`Tahsil Edildi` ve `CashID` dolu), müşteri çeki, `CurrentHolderID` boş.
- "Ciro Et" → `addPaymentModal` çek seçili açılır (:4614). Butonlar: ×, Kapat.
- DB: R `ZT_Checks`, `ZT_CustomerAccounts`, `ZT_CashIntroduction`.

**M2 `checkMovementsModal`** (:1179-1220) "Çek Hareket Geçmişi"
- Girdi yok. `movementCheckInfo` bilgi kutusu; tablo: Tarih, İşlem Tipi, Kimden, (ok), Kime, Açıklama, İşlem Tarihi.
- AJAX: GET `Checks/GetCheckMovements` (:5258 → `ChecksController.cs:875`). DB: R `ZT_CheckMovements` (`Status=true`), `ZT_CustomerAccounts`.
- Not: `UpdateCheckStatus` hareket yazmaz; hareketler yalnız ödeme/tahsilat akışında oluşur (envanter §Checks).

**M3 `updateStatusModal`** (:1225-1315) "Çek Durumu Güncelle"
| Alan | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `updateCheckId` | — | hidden | — | satır |
| `updChkInfo` | (çek kimlik kartı) | div | — | `_updChkCtx` |
| `updateCheckStatus` | Yeni Durum * | select, `onchange=toggleBankSelection()` | zorunlu | sabit: `Bekliyor`, `Kullanıldı`, `Portföyde`, `Bankada`, `Tahsil Edildi` ("Bankaya Tahsil Et (Banka Hareketi)"), `TahsilKasa` ("Kasaya Tahsil Et (Kasa Hareketi)"), `TahsilKasaCiro` ("Kasaya Al (Ciro - Tahsil)"), `Karşılıksız`, `İptal` (:1249-1258) |
| `updateBankId` | Banka Hesabı * | select (`bankSelectionDiv`) | `Bankada`/`Tahsil Edildi` ise zorunlu (:4164) | GET `BankTransactions/GetBankList` (:3996) |
| `updateDepositDate` | Bankaya Yatırma Tarihi | date, vars. bugün | — | — |
| `updateCashId` | Kasa (* koşullu) | select (`cashSelectionDiv`) | bankadaki müşteri çeki → Portföyde ise zorunlu (:4171); `TahsilKasaCiro`/`TahsilKasa` ise zorunlu (:4178, :4183) | GET `/checks/GetAllCashes` (:4132 → `ChecksController.cs:933`) |
- Butonlar: İptal, Güncelle (`confirmUpdateStatus()` :4156) → **M8 `confirmModal`** (İptal/Karşılıksız'da "banka işlemlerini iptal edecektir" uyarısı, :4207) → `performStatusUpdate` → POST `UpdateCheckStatus` {id, status, bankId, cashId, depositDate, cashEndorse, cashCollect} (:4242 → `ChecksController.cs:975`). `TahsilKasa*` istemcide `Tahsil Edildi`'ye çevrilir (:4192).
- DB: U `ZT_Checks`; U `ZT_CheckBooks`; I/U/**D** `ZT_CashTransactions`; I/U/**D** `ZT_BankTransactions`; I/U/**D** `ZT_AccountPayments`; `ZT_CustomerAccountPaymentPlans` (`PaymentPlanHelper.SyncCheckPaymentPlan`). Antiforgery yok.

**M4 `checkLeafModal`** (:1366-1397) "Çek Detayları" (3B yaprak)
- Girdi yok; `c3dFront`/`c3dBack` yüzleri, `c3dDetails` iki sütunlu detay tabloları. Buton: "Çevir (Ön / Arka Yüz)" `c3dFlip()` (:1386), Kapat.
- Veri: AJAX yok; sunucuda gömülü `CHK3D` JSON (envanter: :4308), JS `showCheckLeaf` (:4273-4490). Saf CSS 3D (:1318-1365).

**M5 `addCheckModal`** (:1400-1733) "Yeni Çek Ekle" — fiilen **kendi çekimizle ödeme**
| Alan | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `CheckCustomerAccountID` | Cari Hesap (Lehdar) | select, `onCheckCustomerAccountChange` | required; JS: >0 (:5063) | Razor `@row["AccountName"]` |
| `CheckPaymentDate` | Ödeme Tarihi | date | required, vars. bugün | — |
| `CheckWorkPlaceID` | İş Yeri Seçiniz | select | required; JS >0 | Razor `ZT_WorkPlace` |
| `CheckBankIDModal` | İş Yeri Bankası | select | required; JS zorunlu (:5069) | GET `CustomerAccounts/GetBanksByWorkPlace` (:4839) |
| `CheckBookIDModal` | Çek Koçanı Seçiniz (Opsiyonel) | select | — | GET `CustomerAccountPayment/GetAvailableCheckBooks` (:4924 → `CustomerAccountPaymentController.cs:741`) |
| `toggleManualCheckModal` | Manuel Çek Numarası Gir | button | — | — |
| `CheckNumberModal` | Çek Numarası | text, readonly (koçandan) | required, `maxlength=7`, `pattern=[0-9]{7}`; JS `/^\d{7}$/` (:5076); `_CheckLeafGuard` manuel girişte koçan yaprağı çakışmasını engeller (`/Checks/CheckLeafLookup`, `_CheckLeafGuard.cshtml:97` → `ChecksController.cs:2777`) | — |
| `CheckBankNameModal` | Banka Adı | text readonly | — | bankadan dolar |
| `CheckBranchNameModal` | Şube Adı | text readonly | — | bankadan dolar |
| `CheckIssueDateModal` | Keşide Tarihi | date | required, vars. bugün | — |
| `CheckDueDateModal` | Vade Tarihi | date | required, vars. bugün+30 | — |
| `CheckAmount` | Tutar | number | required, min 0.01, step 0.01 | — |
| `CheckCurrencyID` | Para Birimi | select | — | Razor `Currency` |
| `CheckExchangeRate` | Döviz Kuru | number | min 0.0001, step 0.0001, vars. 1.0000 | — |
| `CheckDescriptionModal` | Çek Açıklaması | textarea | — | — |
| `CheckPaymentDocumentNo` | Belge No | text | — | — |
- Butonlar: İptal, Kaydet `saveCheckBtn` (:5033 → `saveNewCheck` :5038). AJAX: POST `CustomerAccountPayment/AddPayment` (`paymentMethod='Çek'`, :5099 → `CustomerAccountPaymentController.cs:1043`), antiforgery header gönderilir (:5101).
- DB: I `ZT_Checks` (`CheckStatus='Kullanıldı'`, `CheckType/Ownership='Kendi Çekimiz'`), U `ZT_CheckBooks` (`Kullanıldı`), I `ZT_CheckMovements` (`'Ödeme'`), I `ZT_AccountPayments`, `ZT_CustomerAccountPaymentPlans` (helper).

**M6 `addPaymentModal`** (:1736-2645) "Yeni Ödeme Çeki Ekle" — `_AddPaymentModal` kopyası (payments.js ile çalışır, URL'ler :5420-5435)
| Alan | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `CustomerAccountID` | Cari Hesap | select | required | Razor; değişince `GetCustomerDebtSummary` (:2902 → `PaymentManagementController.cs:1726`) + `GetCustomerCreditSummary` |
| `PaymentDocumentNo` | Belge / Fatura No | text | — | — |
| `PaymentMethod` | Ödeme Yöntemi | select **disabled** + hidden kopya (:1813) | required | sabit: Nakit, Banka Havalesi/Eft, Çek, Senet, Kredi Kartı, Diğer |
| `PaymentDate` | Ödeme Tarihi | date | required | — |
| `WorkPlaceID` | İş Yeri Seçiniz | select | required | Razor |
| `CashID` | Kasa Seçiniz | select | yönteme göre | `GetCashesByWorkPlace` / `GetCashByWorkPlaceCustomer` |
| `BankID` | Banka Seçiniz | select | yönteme göre | `GetBanksByWorkPlace` / `GetBanksByWorkPlaceCustomer` (:3564) |
| (bakiye kutusu) | iş yeri bakiyeleri | display | — | `/AccountTransaction/GetWorkPlaceBalances` (:3463) |
| `CrossCurrencyPayment` | Çapraz kur | checkbox | — | — |
| `PaymentAmountInput` | Ödeme Tutarı | text | required, `pattern=[0-9]*[.,]?[0-9]{0,2}`, `formatDecimalInput(…,2)` | — |
| `CurrencyID` | Para Birimi | select | required | Razor |
| `ExchangeRate` | Döviz Kuru (₺) | text | 4 ondalık | — |
| `PaymentCurrencyID` / `DebtCurrencyID` | Ödeme / Borç Para Birimi | select | çapraz kurda | Razor |
| `CrossExchangeRate` | Çapraz Kur | text | 4 ondalık, `calculateCrossCurrency()` | — |
| `Amount` (+hidden) | Cariden Düşülecek Tutar | text readonly | required | hesaplanır |
| `EndorsableCheckID` / `EndorsedCheckId` | Ciro Edilecek Çeki Seçin | select + hidden | ciro bölümünde | `GetEndorsableChecks` |
| `CheckBankID` | İş Yeri Bankası | select | required (çek) | `GetBanksByWorkPlace` |
| `CheckBookID` | Çek Koçanı (Opsiyonel) | select | — | `GetAvailableCheckBooks` |
| `toggleManualCheck` | Manuel Çek Numarası Gir | button | — | — |
| `CheckNumber` | Çek Numarası | text readonly | required, maxlength 7, `pattern=[0-9]{1,7}` (**M5 ile tutarsız: 1-7 hane**) | — |
| `BankName`, `BranchName` | Banka/Şube Adı | readonly | — | — |
| `IssueDate`, `DueDate` | Keşide / Vade Tarihi | date | required | — |
| `CheckDescription` | Çek Açıklaması | textarea | — | — |
| `BillBankID` | İş Yeri Bankası (Opsiyonel) | select | — | senet bölümü |
| `BillBankName`, `BillBranchName` | Banka/Şube Adı | readonly | — | — |
| `BillWorkPlaceID` | Keşideci (İş Yeri) | select | required (senet) | Razor |
| `BillNumber` | Senet Numarası | text | required | — |
| `BillIssueDate`, `BillDueDate` | Düzenlenme / Vade Tarihi | date | required | — |
| `BillDescription` | Senet Açıklaması | textarea | — | — |
| `CustomerBankAccountID` | Cari Banka Hesabı Seçiniz | select, `updatePaymentDescription` | required işaretli ama "(Opsiyonel)" seçeneği | `GetCustomerBankAccounts` (`ZT_BankAccounts`) |
| `Description` | Ödeme Açıklaması | textarea | — | — |
- Ek: bahçe/müstahsil pay bölümü (`garden-card` şablonu, :2709; `GetSupplierGardens`) — finans dışı.
- Butonlar: İptal, Kaydet → POST `AddPayment` (payments.js; `CustomerAccountPaymentController.cs:1043`, tek transaction). DB: §envanter Payments (`ZT_AccountPayments`, `ZT_Checks`, `ZT_CheckMovements`, `ZT_CheckBooks`, `ZT_Bills`, `ZT_BankTransactions`, `ZT_CashTransactions`, `ZT_CustomerAccounts`, `ZT_CustomerAccountPaymentPlans`, `ZT_CustomerAccountSupplierPaymentsShares`).

**M7 `checkDetailedReportModal`** (:2648-2680) "Detaylı Çek Raporu"
- `reportStartDate` (Vade Başlangıç Tarihi, date), `reportEndDate` (Vade Bitiş Tarihi, date). Butonlar: İptal, Raporu Görüntüle `viewCheckDetailedReport()` → yeni sekme `Checks/CheckDetailedReport?startDate&endDate` (:5515 → `ChecksController.cs:562`). DB: R `ZT_Checks`, `ZT_BankIntroduction`, `ZT_WorkPlace`, `Currency`.

**M8 `confirmModal`** (:2682-2706) "İşlemi Onaylayın" — gövde `confirmModalBody` dinamik; İptal, `confirmActionBtn` "Onayla ve Devam Et". Yalnız M3 tarafından kullanılır.

**M9 native `confirm()`** (:3972) "Bu çeki silmek istediğinize emin misiniz?" → POST `Checks/DeleteCheck` (:3975 → `ChecksController.cs:2883`): soft delete (`Status=false`), koçan yaprağı serbest, banka hareketleri pasif, `CancelCheckPaymentPlan`.

**M10-M11 `payments.js` üretimli** `confirmDeleteModal` (payments.js:3694), `paymentDetailModal` (:3805) — ödeme listesi için; Checks sayfasında tetikleyici `⚠ BULUNAMADI` (yalnız script yüklü) → Payments parçasına bırakılır.

### 1.3 `EditCheck.cshtml` (form sayfası)
| Alan (`asp-for`) | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `ID` | — | hidden | — | — |
| `CheckNumber` (`checkNumberInput`) | Çek Numarası * | text | required, maxlength 7, `pattern=[0-9]{7}`; tekillik GET `CheckDuplicateCheckNumber` (:381 → `ChecksController.cs:2831`) | — |
| (disabled) + hidden `CheckType` | Çek Türü * | select disabled | değiştirilemez (sunucu :2512-2516 envanter) | ViewBag |
| `CheckStatus` | Durum * | select | required; sunucu Tahsil Edildi/Bankada/Bankaya Yatırıldı/İptal/Karşılıksız giriş-çıkışını engeller | ViewBag |
| `BankName` | Banka Adı * | text | required | — |
| `BranchName` | Şube | text | — | — |
| `Amount` (`amountInput`) | Tutar * | number | required, min 0.01 | — |
| `CurrencyID` | Para Birimi * | select | required | ViewBag |
| `IssueDate` / `DueDate` | Keşide / Vade Tarihi * | date | required; sunucu vade ≥ keşide | — |
| `daysRemaining` | Vadeye Kalan Gün | readonly | hesaplanır | — |
| `DrawerCustomerID` | Keşideci (Çeki Düzenleyen) * | select | required | `ZT_CustomerAccounts` |
| `PayeeCustomerID` | Lehdar (Alacaklı) * | select | required | `ZT_CustomerAccounts` |
| `Description` | Açıklama | textarea | — | — |
- Butonlar: Değişiklikleri Kaydet (form POST :47 → `:2263`), Çeki Sil (`deleteCheck` → POST `DeleteCheck` :517). POST tutar değişirse bağlı `ZT_AccountPayments` ve `ZT_BankTransactions` tutarlarını günceller; **transaction yok**.

### 1.4 `CheckDetailedReport.cshtml`
GET form (:545) filtreleri: startDate, endDate, workPlaceId, bankId, currencyId, sortBy (`ChecksController.cs:562`); iş yeri → banka grupları, toplamlar; `window.print()`; geri linki (:538), sıfırla (:646).

### 1.5 `CheckDocuments.cshtml` (aynı kalıp `CreditDocuments.cshtml`)
- Klasör ağacı + yükleme alanı; AJAX: POST `/Checks/CheckDosyaYukle` (:752 → `:3460`), POST `/Checks/DeleteCheckFile` (:684 → `:3597`), GET `GetCheckFile`/`DownloadCheckFile` (→ `:3513`, `:3554`), `fetch('/Checks/HealthCheck')` (:817 → `:3335`). Depolama: ağ paylaşımı `<QrKey>\Check\Check\<id>\<klasör>` (admin DB `Customers.QrKey`).
- **M12 `deleteConfirmModal`** (:457-482) "Dosya Silme": İptal, `confirmDeleteBtn` "Evet, Sil".
- **M13 `deleteSuccessModal`** (:485-506) "Başarılı": Tamam.
- **M14 `deleteErrorModal`** (:509-531) "Hata": Kapat.

### 1.6 `CheckBooks/Index.cshtml`
- Üst: "Yeni Çek Defteri" `data-target="#addCheckBookModal"` (:92), Excel (:98), linkler Checks (:38, :86).
- Filtre: `filterBankAccount` (ViewBag.Banks), `filterSerialNo` (text), `filterStatus` (Tümü/`Kullanılmadı`/`Kullanıldı`/`İptal`, :144-148); `filterCheckBooks()` GET (:982-997).
- Tablo (:170-180): Defter Seri No, Yaprak No, Çek Numarası, Banka, Şube, IBAN, İş Yeri, Banka Seri Kodu, Durum, Kullanım Tarihi, İşlemler (İptal Et :228, Sil :231).
- **M15 `addCheckBookModal`** (:254-412) "Yeni Çek Defteri Ekle"
| Alan | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `BankIntroductionID` | Banka Hesabı * | select | required | ViewBag (`ZT_BankIntroduction`) |
| `CheckBookSerialNo` | Defter Seri No * | text | required, maxlength 50 | — |
| `StartCheckNumber` | Başlangıç Çek No * | text | required, `[0-9]{7}`; `validateStartCheckNumber` (:581) | — |
| `EndCheckNumber` | Bitiş Çek No * | text | required, `[0-9]{7}`, ≥ başlangıç; `validateEndCheckNumber` (:610); adet `calculateCheckCount` (:716) | — |
| `BankCode` | Banka Kodu | text | maxlength 4, `[0-9]{4}` (:658) | — |
| `BranchCode` | Şube Kodu | text | maxlength 4, `[0-9]{4}` (:687) | — |
  Butonlar: İptal, Kaydet `saveCheckBookBtn` → POST `AddCheckBook` (:845 → `CheckBooksController.cs:169`, `[IgnoreAntiforgeryToken]`). Sunucu: ≤1000 yaprak, aynı banka+numara atlanır, MICR `c{BankCode}{BranchCode}{8 hane}` (:232), `Status='Kullanılmadı'`. DB: I `ZT_CheckBooks`, `Log`.
- **M16 native `confirm()`** (:929) silme → POST `DeleteCheck` (:934 → `:313`, **fiziksel DELETE**).
- **M17 native `confirm()`** (:956) "…İptal durumuna almak" → POST `UpdateCheckStatus` (:961 → `:388`; `Kullanıldı` yaprak yalnız `İptal`'e çevrilebilir).
- `GetAvailableChecksByBank` (`:469`) çağıranı bu view'da yok (`⚠ BULUNAMADI`).
- Yetki: **sınıfta `[Authorize]`/rol yok** (`CheckBooksController.cs:10`).

### 1.7 `AccountCredits/Index.cshtml` + `Detail.cshtml`
- Index: müşteri carisi başına Kayıt Sayısı, Toplam Tutar (`ZT_AccountCredits`), Tahsilatlar (`ZT_AccountCollections` `Tamamlandı`), Net Alacak, İlk/Son Tarih (:302-309); Detay linki (:363), Tahsilatlar linki (:291). DataTables + para birimi bazlı footer toplamları (:478-564).
- **M18 `deleteModal`** (Index :380-405) "Silme Onayı": İptal, `confirmDelete` "Sil" — **sunucuda silme action'ı yok** (`⚠ BULUNAMADI`, ölü modal).
- Detail: carinin alacak satırları; **M19 `editCreditModal`** (Detail :282-353) "Alacak Kaydını Düzenle"
| Alan | Etiket | Tür | Doğrulama |
|---|---|---|---|
| `editCreditID` (name `id`) | — | hidden | — |
| `editDocumentNo` | Belge No | text | — |
| `editAmount` | Tutar | number | required, min 0, step 0.01 |
| `editPaymentMethod` | Ödeme Yöntemi | select | Seçiniz/Nakit/Banka Havalesi/Eft/Çek/Senet/Kredi Kartı/Diğer |
| `editDueDate` | Vade Tarihi (Opsiyonel) | date | — |
| `editDescription` | Açıklama (Opsiyonel) | textarea **readonly** | — |
  Butonlar: İptal, `btnSaveCredit`. AJAX: GET `/AccountCredits/GetCreditDetails/{id}` (:404 → `AccountCreditsController.cs:318`), POST `/AccountCredits/UpdateCredit` (:448 → `:365`, `[ValidateAntiForgeryToken]`). DB: U `ZT_AccountCredits` (5 alan; transaction/log/yansıma yok). R `Customer`, `ZT_Orders` (satış).
- Yetki: sınıfta öznitelik yok (`AccountCreditsController.cs:8`).

### 1.8 `CreditContracts/Index.cshtml`
- Üst: Cari Kartlara Dön (:39), Rotatif (:81), Taksitli (:87), Dashboard (:93), Yeni Kredi (:99), Excel (:105), Yazdır (:111).
- Filtre: `filterStatus` (:129), `filterBank` (:140), `filterCreditType` (:157), Uygula/Temizle.
- Aktif tablo (:250-259): Sözleşme No, Banka (→ `/BankTransactions/Index?bankId=` :272), Kredi Tipi, Anapara, Kalan, Faiz, Başlangıç, Sonraki Ödeme, Durum, İşlem. Menü (:378-433): Detay, Cari Ata (:387), Cari Ekstresi (:393), Cari Değiştir (:398), Rotatif Kullan (:408), Rotatif Geri Öde (:411), Taksit Öde (:417), Kredi Kullanımı (:424), Banka Hareketleri (:430), Belgeler (:433).
- Kapanmış tablo (:506-514) + "Tamamen Sil" (:579). Grafik "Kredi Dağılımı" `creditDistributionChart` (:452-455, `createCreditDistributionChart` :1053). Yaklaşan taksitler GET `GetUpcomingInstallments` (:1644 → `:5859`).

| # | Modal (satır) | Başlık | Girdiler | Butonlar → AJAX (view:satır → controller:satır) | DB |
|---|---|---|---|---|---|
| C1 | `forceDeleteCreditModal` (600-636) | Krediyi Tamamen Sil | `forceDeleteReason` Silme Sebebi (textarea) | Vazgeç; `btnConfirmForceDelete` → POST `ForceDeleteCreditContract` (:1121 → `:3463`) | D `ZT_CreditInstallments`, `ZT_CreditDrawdowns`, `ZT_CustomerAccountPaymentPlans`; U/D `ZT_BankTransactions`, `ZT_AccountDebts`, `ZT_AccountPayments` (`CleanupCreditCariRecords`); U `ZT_CreditContracts`, `ZT_BankIntroduction` |
| C2 | `assignCariModal` (681-718) | Kredi Banka Cari Hesabı Ata / (Değiştir modu, :1187) | hidden `assignCariCreditId`, `assignCariSelectedId`; `assignCariSearch` Kredi Banka Cari Hesap * (istemci arama listesi `acsrRenderResults`, :1205; liste kaynağı sayfaya gömülü `IsCreditBankAccount` cariler); `assignCariClear` | Vazgeç; `btnConfirmAssignCari` → POST `AssignBankCari` veya `ChangeBankCari` (:1243-1248 → `:761` / `:934`); JS zorunlu seçim (:1236) | U `ZT_CreditContracts.BankCustomerAccountID`; I `ZT_AccountDebts` (açılış borcu, idempotent); Change'de U `ZT_AccountDebts`/`ZT_AccountPayments` taşıma |
| C3 | `payInstallmentModal` (722-772) | Taksit Ödeme | hidden `installmentId`, `creditContractId`; `paymentAmount` Ödeme Tutarı (number, required, min 0.01); `paymentDate` (date, required); `paymentDescription` (textarea) | İptal; Ödemeyi Kaydet `processInstallmentPayment()` → GET `GetInstallmentPaymentInfo` (:1375 → `:5684`) ön bilgi, POST `PayInstallment` (:1422 → `:3831`) | U `ZT_CreditInstallments`, `ZT_CreditContracts`; I `ZT_BankTransactions` ×2 (vadesiz `Kredi Taksit Ödeme`, kredi hesabı `Kredi Anapara Ödeme`), U `ZT_BankIntroduction.Balance/UsedCredit`; I `ZT_AccountPayments` (anapara); I `ZT_FinIncomeExpense` (Faiz, BSMV); U `ZT_CustomerAccountPaymentPlans` |
| C4 | `useInstallmentCreditModal` (775-805) | Kredi Kullanımı | hidden `installmentUseCreditId`; `installmentUseDate` Kullanım Tarihi (date, required) | İptal; Kullanımı Kaydet `processInstallmentCreditUse()` → GET `GetCreditInfo` (:1307 → `:5642`), POST `UseInstallmentCredit` (:1341 → `:5204`) | I `ZT_BankTransactions` ×2 (`Kredi Kullanım`), U `ZT_CreditContracts`, `ZT_BankIntroduction` |
| C5 | `useRevolvingModal` (808-852) | Rotatif Kredi Kullanımı | hidden `revolvingCreditId`; `revolvingAmount` Kullanım Tutarı (number, required, min 0.01; ≤ limit−kullanılan sunucuda); `revolvingDate` (date, required); `revolvingDescription` (textarea) | İptal; Kullanımı Kaydet `processRevolvingUse()` → GET `GetCreditInfo` (:1451), POST `UseRevolvingCredit` (:1481 → `:4753`) | I `ZT_CreditDrawdowns` (`Kullanim`), U `ZT_CreditContracts.UsedAmount/RemainingPrincipal`, I `ZT_BankTransactions` ×2, I `ZT_AccountDebts` |
| C6 | `repayRevolvingModal` (855-952) | Rotatif Kredi Geri Ödeme | hidden `repayCreditId`; `repayAmount` Anapara Geri Ödeme (required, min 0.01); `repayInterestFromDate`, `repayInterestToDate` Faiz Başlangıç/Bitiş (date, `estimateInterestIndex()`); `repayInterest` Faiz Tutarı (min 0, vars. 0); `repayBsmv` BSMV (%5) (min 0); `repayTotalAmount` Toplam (readonly); `repayDate` Ödeme Tarihi (required); `repayDescription` | İptal; Geri Ödemeyi Kaydet `processRevolvingRepayment()` → GET `GetCreditInfo` (:1522), GET `GetRevolvingInterestEstimate` (:1558 → `:5986`), POST `RepayRevolvingCredit` (:1614 → `:4943`); sunucu: faiz/BSMV negatif olamaz, kullanılandan fazla ödenemez | I `ZT_CreditDrawdowns` (`GeriOdeme`), I `ZT_BankTransactions` (anapara, `Kredi Faiz Ödeme`, `Kredi BSMV Ödeme`), I `ZT_FinIncomeExpense`, I `ZT_AccountPayments` |
| C7 | `ccConfirmModal` (956-972) | Onay | — | `ccConfirmCancelBtn` Vazgeç, `ccConfirmOkBtn` Onayla (genel onay) | — |
| C8 | `ccNoticeModal` (973-988) | Bilgi | — | Tamam (`ccShowNotice`) | — |

### 1.9 `CreditContracts/Add.cshtml` (form; `<form asp-action="add">` :176)
| Alan | Etiket | Tür | Doğrulama | Kaynak |
|---|---|---|---|---|
| `ContractCode` | Sözleşme No (Opsiyonel) | text | maxlength 50; boşsa `KRD-{yıl}-{4 hane}` (`GenerateContractCode`), doluysa tekillik (`:536`) | — |
| `CreditType` (hidden) + 4 kart | Kredi tipi kartları | `selectCreditType` (:758) | `EsitTaksit`/`EsitAnapara`/`Bullet`/`Revolving` (`:545`) | sabit (:200-221) |
| `UseImmediately` | radio Evet/Hayır "Krediyi oluşturunca hemen kullan" | radio | — | — |
| `BankCustomerAccountID` | Kredi Banka Cari Hesap * | select | required (`:553`) | ViewBag `IsCreditBankAccount` cariler |
| `BranchProvinceID` | Şube | select | — | `ZT_BranchProvince` |
| `WorkPlaceID` | İş Yeri | select | — | `ZT_WorkPlace` |
| `BankID` | Banka / Şube * | select, `onBankChange` | required | `ZT_BankIntroduction` (+ para birimi sembolü) |
| `CurrencyID` | Para Birimi | select, `updateCurrencySymbol` | — | `Currency` |
| `CreditPurpose` | Kredi Amacı | select | İşletme Sermayesi/Yatırım/İhracat/İthalat/Refinansman/Diğer | sabit |
| `Principal` | Kredi Tutarı (Anapara) * | number | required, min 0; taksitlide >0 (`:589`) | — |
| `CreditLimit` | Kredi Limiti * | number | rotatifte zorunlu >0 (`:575`) | — |
| `AnnualRate` | Yıllık Faiz Oranı (%) * | number | required, 0-100 | — |
| `RateType` | Faiz Tipi | select | Sabit Faiz/Değişken Faiz | sabit |
| `StartDate` | Başlangıç Tarihi * | date | required | — |
| `FirstPaymentDate` | İlk Ödeme Tarihi | date | — | — |
| `TotalInstallments` | Taksit Sayısı * | number | 1-360; taksitlide zorunlu (`:595`) | — |
| `PaymentFrequency` | Ödeme Periyodu | select | Aylık/3 Aylık/6 Aylık/Yıllık | sabit |
| `RevolvingStartDate` | Başlangıç Tarihi * (rotatif) | date | — | — |
| `EndDate` | Bitiş Tarihi | date | — | — |
| `DayCount` | Faiz Hesaplama | select | ACT/365, ACT/360, 30/360 (**hesapta kullanılmıyor; plan ACT/365 sabit**) | sabit |
| `Commission`, `CommissionRate`, `InsuranceFee`, `OtherFees` | Komisyon Tutarı/Oranı (%)/Sigorta Ücreti/Diğer Masraflar | number | ≥0, oran ≤100 | — (**kaydediliyor, hiçbir hareket/gider yazılmıyor**) |
| `CollateralType` | Teminat Tipi | select | Teminat Yok/İpotek/Kefil/Menkul Rehni/Nakit Blokaj/Teminat Mektubu | sabit |
| `CollateralAmount`, `CollateralDescription` | Teminat Tutarı / Açıklaması | number / text (≤500) | — | — |
| `Description` (≤1000), `Notes` (≤2000) | Açıklama / Notlar | textarea | — | — |
| hidden `ContractStatus`, `PaidInstallments`, `UsedAmount` | — | — | — | (:706-708) |
- İstemci önizleme: `calculateInstallment` (:854), `buildInstallmentDetailRows` (:969) — taksit tablosu önizlemesi. Kaydet (:698) → POST `Add` (`:522`, **transaction yok**): sözleşme INSERT → kredi banka hesabı (`ZT_BankIntroduction`, `AccountType='Kredi'`) → taksit planı (`ZT_CreditInstallments`) + plan kayıtları (`ZT_CustomerAccountPaymentPlans`, `SourceType='Kredi'`) → `UseImmediately` ise 2 banka hareketi → açılış borcu `ZT_AccountDebts`.

### 1.10 `CreditContracts/Details.cshtml`
- Üst butonlar: Kredi Kullanımı (:81), Geri Ödeme (:85), Taksit Öde (:92), Oto Eşleştir (:101), Krediyi Sil (Pasife Al) (:105 → aslında ForceDelete), Yazdır (:111). Kart düzenleme kalemleri: Genel bilgiler (:265), Vade bilgileri (:371), Notlar (:419).
- Taksit tablosu satır içi düzenleme (`toggleEditMode` :546, `edit-duedate/principal/interest/tax/total` :604-645) → POST `UpdateInstallments` (:2027 → `:2448`); Yeniden Hesapla `confirmRecalcInstallments` (:550) → `ccConfirmModal` → POST `RecalculateInstallments` (:2593 → `:2774`). Satır: Öde (:702), Eşleştir (:709), Cariye Aktar (:727 → POST `TransferInstallmentToCari` :2118 → `:1070`).
- Paneller: kullanım hareketleri (`ZT_CreditDrawdowns`, :811-859), finansman giderleri (`ZT_FinIncomeExpense`, :921-962), banka son hareketleri GET `GetBankRecentTransactions` (:1759 → `:3751`).

| # | Modal (satır) | Başlık | Girdiler | Butonlar → AJAX | DB |
|---|---|---|---|---|---|
| D1 | `editContractModal` (1020-1105) | Genel Bilgileri Düzenle | hidden `editCreditContractId`; `editContractCode` Sözleşme No (≤50); `editCreditType` Kredi Tipi (Eşit Taksitli/Eşit Anapara/Tek Ödemeli (Bullet)/Rotatif); `editCreditPurpose` Kredi Amacı; `editRateType` Faiz Tipi (Sabit/Değişken); `editAnnualRate` Yıllık Faiz (%) (0-100); `editDayCount` Faiz Hesaplama | Vazgeç; `btnSaveContractEdit` `saveContractInfo()` → POST `UpdateContractInfo` (:1850 → `:2042`) | U `ZT_CreditContracts`; oran değişince ödenmemiş taksitler yeniden hesaplanır (`:2223-2379`) |
| D2 | `paymentModal` (1109-1155) | Taksit Ödemesi | hidden `paymentInstallmentId`; `paymentAmount` (required, min 0.01); `paymentDate` (required); `paymentDescription` (text) | İptal; `submitPayment()` → POST `PayInstallment` (:2341 → `:3831`) | C3 ile aynı |
| D3 | `reconcileModal` (1158-1223) | Taksiti Ödeme ile Eşleştir | hidden `reconcileInstallmentId`; `reconcileCariSelect` Kredi Banka Cari Hesabı (cari atanmamışsa); aday ödemeler tablosu | "Cariyi Ata ve Ödemeleri Tara" `reconcileAssignCari()` → POST `AssignBankCari` (:2208); satır seç → POST `ReconcileInstallmentPayment` (:2225 → `:4154`); aday listesi GET `GetReconcileCandidates` (:2158 → `:4061`); Kapat | U `ZT_AccountPayments.CreditInstallmentID`, U `ZT_CreditInstallments`; tolerans %1 veya 10 birim |
| D4 | `autoMatchModal` (1226-1278) | Ödemeleri Otomatik Eşleştir | `autoMatchSelectAll` (checkbox) + satır checkbox'ları | İptal; `autoMatchApplyBtn` `applyAutoMatch()` → GET `AutoMatchCreditPayments` (:2255 → `:4179`), POST `ApplyAutoMatchCreditPayments` (:2307 → `:4277`) | D3 ile aynı, toplu |
| D5 | `drawdownModal` (1281-1329) | Kredi Kullanımı | `drawdownAmount` (required, min 0.01, **max=`Model.AvailableCredit`**); `drawdownDate` (required); `drawdownDescription` | İptal; `submitDrawdown()` → POST `UseRevolvingCredit` (:2378 → `:4753`) | C5 ile aynı |
| D6 | `repaymentModal` (1332-1431) | Geri Ödeme | `repaymentAmount` (required, min 0.01, **max=`Model.UsedAmount`**); `interestFromDate`/`interestToDate` (`estimateInterest()`); `repaymentInterest`, `repaymentBsmv` (min 0); `repaymentTotal` (readonly); `repaymentDate` (required); `repaymentDescription` | İptal; `submitRepayment()` → GET `GetRevolvingInterestEstimate` (:2430), POST `RepayRevolvingCredit` (:2479 → `:4943`) | C6 ile aynı |
| D7 | `editScheduleModal` (1434-1497) | Vade Bilgilerini Düzenle | hidden `schCreditId`; `schStartDate` (required); `schFirstPaymentDate`; `schPaymentFrequency` (required; Aylık/3 Aylık/6 Aylık/Yıllık/Haftalık — **Add'de Haftalık yok**); `schTotalInstallments` (required, 1-600 — **Add'de 1-360**) | Vazgeç; `btnSaveSchedule` "Kaydet ve Yeniden Oluştur" `saveScheduleInfo()` → POST `UpdateScheduleInfo` (:2662 → `:3012`) | U `ZT_CreditContracts`; D/I `ZT_CreditInstallments`; D/I `ZT_CustomerAccountPaymentPlans`; U `ZT_AccountDebts` (envanter :3077-3136) |
| D8 | `editNotesModal` (1500-1527) | Açıklama ve Notları Düzenle | `notesDescription` Açıklama, `notesNotes` Notlar (textarea) | Vazgeç; `btnSaveNotes` → POST `UpdateNotes` (:2705 → `:3214`) | U `ZT_CreditContracts` |
| D9 | `ccConfirmModal` (1530-1546) | Onay | — | Vazgeç / Onayla | — |
| D10 | `ccNoticeModal` (1549-1564) | Bilgi | — | Tamam | — |
| D11 | `deleteWithInstallmentsModal` (1567-1599) | Aktif Taksitler Bulundu | `deleteWithInstReason` Silme Sebebi (Opsiyonel) | Vazgeç; `btnConfirmDeleteWithInst` "Taksitlerle Birlikte Sil" → POST `DeleteCreditWithInstallments` (:2749 → `:3273`; kapanmış kredi silinmez) | D `ZT_CreditInstallments`, `ZT_CustomerAccountPaymentPlans`; U `ZT_CreditContracts` |
| D12 | `deleteCreditModal` (1602-1640) | Krediyi Tamamen Sil | `deleteReason` Silme Sebebi | Vazgeç; `btnConfirmDeleteCredit` → POST `ForceDeleteCreditContract` (:2508 → `:3463`) | C1 ile aynı |

### 1.11 `CreditContracts/Dashboard.cshtml` ve `CreditDocuments.cshtml`
- Dashboard: 6 stat kartı (:86-116), banka bazlı kartlar (:260), `interestChart` doughnut (Chart.js, :165, :423). Chart.js sürümsüz CDN (:19).
- CreditDocuments: **D13-D15** `deleteConfirmModal` (457-482), `deleteSuccessModal` (485-506), `deleteErrorModal` (509-531) — Checks belge sayfasıyla birebir. AJAX: `DeleteCreditFile` (:684 → `:6683`), `CreditDosyaYukle` (:752 → `:6546`), `HealthCheck` (:817 → `:6421`), `GetCreditFile`/`DownloadCreditFile` (`:6599`, `:6640`).
- Çağıranı bulunmayan uçlar: `GetActiveCreditsForPayment` (`:5783`), `GetCreditSummary` (`:5935`), `DeleteCreditContract` (`:6044`), `GetDashboardWidgetData` (`:5334`; `_CreditDashboardWidget.cshtml` hiçbir view'da include edilmiyor), `PayWithCredit` (`:5485`, statik; `AddPayment` Kredi dalını tetikleyen istemci kodu yok) — hepsi `⚠ BULUNAMADI` çağıran.

### 1.12 PaymentManagement (eski borç-bazlı akış)
JS: `wwwroot/js/zt/paymentmanagement/{payment-planning,payment-approval-request,payment-approvals,process-payment-orders}.js`. Sınıf: `[Authorize]` + `[UserRoleAuthorize(… "Satış Personeli")]` (`PaymentManagementController.cs:18-19`), action'larda Satış Personeli'siz liste (`:32` vb.). POST'larda `[ValidateAntiForgeryToken]` var.

| # | Modal (dosya:satır) | Başlık | Girdiler | Butonlar → AJAX (js:satır → controller:satır) | DB |
|---|---|---|---|---|---|
| P1 | `planModal` (PaymentPlanning:175-284) | Ödeme Planı Oluştur | `plannedPaymentDate` Planlanan Ödeme Tarihi (date, required); `plannedPaymentMethod` (Seçiniz/Nakit/Banka Havalesi/EFT/Çek/Senet, `togglePlanPaymentFields`); `plannedCashID` Kasa (Razor `CashName`); `plannedBankID` Banka (Razor `BankName - BranchName`); `plannedPriority` Öncelik (Düşük/Normal/Yüksek/Acil); `plannedAmount` Planlanan Tutar (step 0.01, boş = tam tutar); `plannedNotes` | İptal; Planı Kaydet `savePlan()` → POST `CreatePaymentPlan` (payment-planning.js:237 → `:188`). Liste: `GetUnpaidDebts` (:45 → `:83`), `GetPaymentPlans` (:301 → `:333`), sil `DeletePaymentPlan` (:370 → `:410`) | I `ZT_PaymentPlans` (`Status='Planlandı'`, :258-281); U `ZT_AccountDebts.PlannedAmount` (:292) |
| P2 | `approvalModal` (PaymentApprovalRequest:133-191) | Ödeme Onayı Talebi | özet (cari, toplam, borç sayısı); `approvalPriority` Öncelik; `approvalNotes` Notlar | İptal; Onaya Gönder `confirmSendForApproval()` → POST `SendForApproval` (payment-approval-request.js:229 → `:614`); liste `GetDebtsForApproval` (:36 → `:527`) | I `ZT_PaymentApprovals` (`'Onay Bekliyor'`, kod `ZT_PaymentApprovalCode_seq` :781); I `ZT_PaymentApprovalDetails` (`'Bekliyor'`); U `ZT_AccountDebts.IsInApproval/ApprovalPendingAmount` (:726) |
| P3 | `detailModal` (PaymentApprovals:119-174) | Onay Detayları | — (tablo) | Kapat; GET `GetApprovalDetails` (payment-approvals.js:117 → `:880`) | R |
| P4 | `approveModal` (PaymentApprovals:177-205) | Ödeme Onayı | `approveNotes` Onay Notu (opsiyonel) | İptal; Onayla `confirmApprove()` → POST `ApprovePayment` (:185 → `:941`) | U `ZT_PaymentApprovals` `'Onaylandı'`, `ApprovedBy` (:955-966) — **talep eden = onaylayan kontrolü yok** |
| P5 | `rejectModal` (PaymentApprovals:208-236) | Ödeme Reddi | `rejectReason` Red Sebebi (textarea, **required**) | İptal; Reddet `confirmReject()` → POST `RejectPayment` (:227 → `:1015`) | U `ZT_PaymentApprovals` `'Reddedildi'`; U `ZT_AccountDebts` (onay bayrakları geri) |
| (buton) | "Talimat Ver" (PaymentApprovals listesi) | — | — | POST `GivePaymentOrder` (:259 → `:1106`; yalnız Onaylandı) | U `ZT_PaymentApprovals` `'Ödeme Talimatı Verildi'` (:1132) |
| P6 | `processPaymentModal` **#1** (ProcessPaymentOrders:83-187) | Ödeme İşlemi | hidden `processApprovalID`, `processApprovalCode`; `processPaymentDate` (required); `processPaymentMethod` (required; Nakit/Banka Havalesi/EFT/Çek/Senet); `processCashID`, `processBankID`; `processPaymentDocumentNo`; `processExchangeRate` (vars. 1.0000); `processDescription` (textarea) | İptal; Ödeme Yap `confirmProcessPayment()` | — |
| P7 | `paymentOrderDetailsModal` (190-247) | Ödeme Talimatı Detayları | — | Kapat; GET `GetApprovalDetails` (process-payment-orders.js:229, :563) | R |
| P8 | `processPaymentModal` **#2** (250-424) | Onaylı Ödeme İşlemi | P6 ile aynı alanlar (aynı id'ler!) + "Borç Detaylarını Göster" `viewOrderDetailsInline()`; `processDescription` burada `input text` | İptal; Ödemeyi Tamamla → POST `ProcessPaymentOrder` (process-payment-orders.js:500 → `:1222`); liste `GetPaymentOrders` (:89 → `:1613`) | I `ZT_AccountPayments` (`'Tamamlandı'`, `ApprovalID`, :1339); `CreateBankTransaction`/`CreateCashTransaction` (:1381, :1390); U `ZT_AccountDebts` FIFO (:1443); U `ZT_PaymentApprovalDetails` (:1473); U `ZT_PaymentApprovals` `'Kısmi Ödendi'`/`'Ödendi'` (:1517-1530). Tutar > talimat tutarı reddedilir (:1294) |
- **Hata**: ProcessPaymentOrders.cshtml'de `processPaymentModal` ve tüm alan id'leri **iki kez** tanımlı (:83 ve :250) → jQuery ilk eşleşmeyi alır; React'te tek modal yapılmalı (§3).

### 1.13 `PaymentApprovalApiController`
`[Route("Api/[controller]")]`, `[ApiController]`, **`[Authorize]` (:14)** ve **`[UserRoleAuthorize("Admin", "Finans(normal)", "Finans(super)", "Muhasebe (Alış)", "Satış Personeli", "Patron")]` (:15)**. Tek uç `POST CheckCompletedInstructions([FromBody] List<int> planIds)` (:21-22): `ZT_CustomerAccountPaymentPlans` içinde `InstructionStatus IN ('Ödendi','Tamamlandı')` olan ID'leri döner (:36-41); antiforgery yok (API). Çağıran: `Views/` ve `wwwroot/js/` altında **`⚠ BULUNAMADI`** (ölü uç).

---

## 2. Eşleme tabloları (ZTO öğe → Blackrose)

BR referansları: Controller `BRJ/finance/web/FinanceController.java`, DTO `BRJ/finance/web/FinanceDtos.java`, servis `BRJ/finance/service/*.java`, şema `V3__create_finance.sql`, UI `BRF/pages/finance/*.tsx`.

### 2.1 Checks sayfası ve modalları
| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| Liste + filtre (durum) | GET `/finance/instruments?status=` (`FinanceController.java:267-272`), `InstrumentService.list` (`InstrumentService.java:72`); UI `InstrumentsPage.tsx:65` | UI+API-genişlet — `kind`, `direction`, `accountId`, `dueFrom/dueTo`, `checkBookSerial`, `branchId`, `endorsable` filtreleri yok |
| Kolonlar Keşideci / İlk Lehdar / Çek Sahibi / Tutulma Yeri / Keşide T. / Şube | `Instrument` alanları: `accountId`, `endorsedAccountId`, `fundAccountId`, `dueDate` (`Instrument.java:24-43`) | UI+yeni-tablo (V22) — `issue_date`, `bank_branch`, `drawer_account_id`, `custody_fund_id`, `description`, `check_leaf_id` |
| Muhasebe Durumu kolonu | settlement durumu (`Settlement` POSTED/REVERSED) | UI+API-genişlet (InstrumentResponse'a settlement durumu) |
| Excel / Yazdır | — | UI (istemci tarafı, §5) |
| M1 `ciroChecksModal` | `listInstruments(status=PORTFOLIO)` + RECEIVED filtresi | UI+API-genişlet (`direction`, `kind=CHECK`, custody bilgisi) |
| M1 "Ciro Et" | POST `/finance/payments` `method=CHECK, instrumentId` → `InstrumentService.endorse` (`SettlementService.java:199-202`, `InstrumentService.java:114`) | UI-mevcut-API |
| M2 `checkMovementsModal` | GET `/finance/instruments/{id}/movements` (`FinanceController.java:274`), UI `InstrumentsPage.tsx:206` | UI+API-genişlet — "Kimden/Kime" için `instrument_movement.counterparty_account_id`, `fund_account_id` (V22) |
| M3 `updateStatusModal` | POST `/finance/instruments/{id}/transition` {toStatus, fundAccountId, date, note, exchangeRate} (`FinanceController.java:280`; `InstrumentService.java:129`); UI `InstrumentsPage.tsx:151-193` | UI+API-genişlet (yeni durumlar + custody + PORTFOLIO→COLLECTED; §2.2) |
| M3 banka/kasa listesi | GET `/finance/funds` (`FinanceController.java:205`), istemcide `kind` filtresi | UI-mevcut-API |
| M3 `updateDepositDate` | `InstrumentTransitionRequest.date` (`FinanceDtos.java:187-192`) | UI-mevcut-API |
| M4 `checkLeafModal` (3B) | Tekil instrument GET **yok** | UI+yeni-API — GET `/finance/instruments/{id}` (detay + movements + settlement özeti); 3B CSS birebir kopya |
| M5 `addCheckModal` | POST `/finance/payments` `method=CHECK, instrument{kind,number,bankName,dueDate}` (`FinanceController.java:296`; `SettlementService.java:195-216`; `NewInstrument` `FinanceDtos.java:167-171`) | UI+API-genişlet — `NewInstrument`'e `issueDate`, `bankBranch`, `checkLeafId`, `description`, `documentNo`; banka seçimi = `fundAccountId` (çekin çekileceği hesap) |
| M5 koçan seçimi / CheckLeafLookup | — | UI+yeni-tablo (V23 `check_book`, `check_leaf`) |
| M5 `CheckExchangeRate` | `SettlementRequest.exchangeRate` (`FinanceDtos.java:213`) | UI-mevcut-API |
| M6 `addPaymentModal` (nakit/banka/çek/ciro) | POST `/finance/payments` (`SettlementService.create` :86) | UI+API-genişlet (çek alanları M5 ile aynı) |
| M6 Senet bölümü | `instrument.kind=NOTE` (`FinanceTypes.java:41-44`) | UI+API-genişlet (NOTE için `bankName` opsiyonel; keşideci iş yeri = `branchId`) |
| M6 Kredi Kartı / Diğer | `SettlementMethod` = CASH/BANK/CHECK (`FinanceTypes.java:67-71`) | Kredi Kartı → BANK (fund) olarak eşle; Diğer → **ÇIKAR** (karşılığı olmayan ödeme türü defter tutarlılığını bozar) |
| M6 Çapraz kur bölümü | Settlement tek `money` + TL kuru; fon para birimi = tutar para birimi zorunlu (`SettlementService.java:265`) | **ÇIKAR** (BR tek para birimi kuralı kazanır; borç para biriminde ödeme kaydı + ayrı virman `POST /funds/transfers` `FinanceController.java:246`) |
| M6 Cari Banka Hesabı (IBAN seçimi) | BR'de cari banka hesabı tablosu `⚠ BULUNAMADI` (finans modülünde yok; CRM tarafı doğrulanmadı) | UI+yeni-tablo (V22 `account_bank_account`) veya açıklamaya yazma — öneri: ertele, alan yalnız açıklamayı doldurduğu için ilk fazda ÇIKAR |
| M6 Bahçe pay bölümü | — | **ÇIKAR** (finans dışı, üretim) |
| M6 Hızlı ödeme planı | POST `/finance/payment-plans` (`FinanceController.java:370`) | UI-mevcut-API |
| M7 rapor modali + `CheckDetailedReport` sayfası | — | UI+yeni-API — GET `/finance/reports/instruments?from&to&branchId&fundAccountId&currency&sort` (şube→banka gruplu) |
| M8 `confirmModal` | — | UI (React onay bileşeni) |
| M9 Çeki Sil | Settlement CHECK ters çevrilemez (`SettlementService.java:153-158`) | UI+API-genişlet — "Sil" yerine `CANCELLED` (ISSUED) / `RETURNED` (RECEIVED) geçişi; fiziksel/soft silme ÇIKAR |
| `EditCheck` sayfası | instrument güncelleme ucu yok | UI+yeni-API — PATCH `/finance/instruments/{id}` yalnız finansal olmayan alanlar (numara, banka/şube adı, keşide tarihi, açıklama, keşideci adı); tutar/para birimi/cari/durum **ÇIKAR** (ters kayıt + yeni kayıt) |
| EditCheck tekillik kontrolü | DB `instrument_number_uq` (`V3__create_finance.sql:141-142`) | UI+API-genişlet (GET `/finance/instruments/check-number?number=` ön kontrol) |
| `CheckDocuments` sayfası + M12-M14 | `/api/v1/files` (`BRJ/files/FileController.java:58-80`), owner politikası (`FileService.java:188-192`) | UI+API-genişlet — `FileOwnerPolicy` `INSTRUMENT`; ağ paylaşımı/klasör ağacı (İzlenebilirlik/Özel/Diğer) **ÇIKAR** (düz liste) |

### 2.2 Çek durum eşlemesi (ZTO → `InstrumentStatus`)
BR: `PORTFOLIO, AT_BANK, COLLECTED, ENDORSED, COLLECTED_TO_CASH, BOUNCED, ISSUED, PAID` (`FinanceTypes.java:51-60`); geçiş tablosu `InstrumentService.java:34-47`.

| ZTO durum (yön) | Anlam | BR durum | Not |
|---|---|---|---|
| `Portföyde` (alınan) | elde / kasada | `PORTFOLIO` | ZTO `CashID` = tutulduğu kasa → V22 `custody_fund_id` |
| `Bankada` / `Bankaya Yatırıldı` (alınan) | tahsile verildi | `AT_BANK` (BANK fon zorunlu, `InstrumentService.java:148`) | ZTO'da iki yazım DB'de birlikte (`ChecksController.cs:979-984`, `CustomerAccountCollectionController.cs:829,844`) → migrasyonda tekleştir |
| `Tahsil Edildi` (alınan, banka yolu) | tahsil | `COLLECTED` (fon IN, `:162-163`) | |
| `TahsilKasa` → `Tahsil Edildi`+`cashCollect` | kasaya tahsil, kasa GİRİŞ | `COLLECTED_TO_CASH` (CASH fon, `:149-150`) | |
| `TahsilKasaCiro` → `Tahsil Edildi`+`cashEndorse` | kasaya alındı, para hareketi yok, ciro edilebilir | `PORTFOLIO` + `custody_fund_id` | ZTO'da "tahsil edildi" görünmesine rağmen para girişi yok → BR'de PORTFOLIO doğru durum |
| `Ciro Edildi` (alınan) | tedarikçiye ciro | `ENDORSED` (yalnız ödeme ile, `InstrumentService.java:133-137`) | |
| `Kullanıldı` (verilen / Kendi Çekimiz) | ödeme için verildi | `ISSUED` | |
| `Tahsil Edildi` (Kendi Çekimiz, "Çek Ödendi") | bankadan ödendi | `PAID` (BANK fon OUT) | |
| `Karşılıksız` | karşılıksız | `BOUNCED` | |
| `Bekliyor` | belirsiz/beklemede; tahsilat silinince dönülen durum | — | **ÇIKAR** (BR'de kayıt hep bir settlement ile doğar; "askıda çek" kavramı yok) |
| `İptal` | iptal | — | **UI+yeni (V22)**: `CANCELLED` (ISSUED→CANCELLED: ödeme settlement'ının cari/fon kaydı `reverseSource`) ve `RETURNED` (RECEIVED PORTFOLIO→RETURNED: keşideciye iade, cari DEBIT) |
| Senet `Teminata Verildi` | teminat | — | V22 `COLLATERAL` (NOTE, RECEIVED PORTFOLIO↔COLLATERAL, defter etkisi yok) |
| Senet `Protestolu` | protesto | — | V22 `PROTESTED` (BOUNCED ile aynı etki; NOTE'a özgü etiket) |
| Senet `Ödendi` | verilen senet ödendi / alınan senet tahsil | `PAID` (ISSUED) / `COLLECTED` (RECEIVED) | |

**ZTO'da olup BR geçiş tablosunda olmayan geçişler** (kaynak: satır menüsü `Checks.cshtml:886-1033` + `UpdateCheckStatus` serbest kabul):
| ZTO geçişi | BR | Karar |
|---|---|---|
| Portföyde → Tahsil Edildi (bankaya, tek adım) (:953) | PORTFOLIO→COLLECTED yok | UI+API-genişlet: tabloya ekle, BANK fon zorunlu (tek movement, tek fon IN) |
| Portföyde → Bekliyor (:959), Kullanıldı → Bekliyor/Portföyde (:921, :926), İptal → Bekliyor "Yeniden Aktif Et" (:1028) | — | ÇIKAR (geri alma = ters kayıt; durum geri sarma yok) |
| Bekliyor → Kullanıldı / Portföyde / İptal (:886-902) | — | ÇIKAR (Bekliyor yok) |
| Kullanıldı → İptal (:931) | ISSUED→CANCELLED | UI+yeni (V22) |
| Kullanıldı → Tahsil Edildi (kendi çekimiz ödendi, :908) | ISSUED→PAID ✓ | UI-mevcut-API |
| Kendi Çekimiz → Bankaya Yatırıldı (:940, kendi çekte de görünür) | ISSUED'de AT_BANK yok | ÇIKAR (anlamsız; verilen çek bankaya yatırılmaz) |
| Tahsil Edildi → Karşılıksız (:1020) | COLLECTED→BOUNCED yok | ÇIKAR (tahsil olmuş çek karşılıksız olamaz; hata düzeltmesi ise fon `reverse`) |
| Bankada → Portföye Geri Al (kasa zorunlu, KURAL 2) | AT_BANK→PORTFOLIO ✓ | UI+API-genişlet (custody kasa parametresi) |
| Ciro Edildi → (işlem yok) | ENDORSED→BOUNCED ✓ | BR daha zengin: cirolu çek karşılıksız → keşideci + ciro edilen cari kaydı (`InstrumentService.java:175-206`). UI'ya "Karşılıksız" eklenir |
| Kasada tutulan çeki kasalar arası taşıma | — | UI+yeni-API: PUT `/finance/instruments/{id}/custody` (yalnız PORTFOLIO) |
| Koçan yaprağı durumu (`Kullanılmadı/Kullanıldı/İptal`) çek durumuna bağlı güncellenir (`ChecksController.cs` ~1366-1392) | — | V23: `check_leaf.status` (UNUSED/USED/VOID), ISSUED kaydında USED, CANCELLED'da VOID (yeniden kullanılmaz) |
| Bordro (çek giriş/çıkış bordrosu) | — | ZTO'da da **yok** (`⚠ BULUNAMADI`) → kapsam dışı |

### 2.3 CheckBooks
| ZTO öğe | Blackrose | Karar |
|---|---|---|
| Liste/filtre (banka, seri no, durum) | — | UI+yeni-tablo (V23) — GET `/finance/check-books`, GET `/finance/check-leaves?fundAccountId&status&serial` |
| M15 `addCheckBookModal` | — | UI+yeni-tablo (V23) — POST `/finance/check-books` {fundAccountId, serialNo, startNumber, endNumber, bankCode, branchCode}; ≤1000 yaprak, MICR üretimi aynen |
| M16 Sil (fiziksel DELETE) | soft delete kuralı | UI+yeni-API — DELETE `/finance/check-leaves/{id}` yalnız UNUSED, `deleted=true` |
| M17 İptal | — | UI+yeni-API — POST `/finance/check-leaves/{id}/void` (UNUSED/USED→VOID; USED ise bağlı instrument CANCELLED olmalı) |
| `CheckLeafLookup` (`_CheckLeafGuard`) | — | UI+yeni-API — GET `/finance/check-leaves/lookup?number=` (baştaki sıfırsız, ≤5 sonuç) |
| `GetAvailableCheckBooks` | — | GET `/finance/check-leaves?fundAccountId&status=UNUSED` |

### 2.4 Senet (Bills) — durum ve modal özeti
| ZTO | BR | Karar |
|---|---|---|
| `addBillModal` (Bills.cshtml:488-767): `BillCustomerAccountID`, `BillPaymentDate`, `BillWorkPlaceID`, `BillNumberModal`, `BillTypeModal` (Adi Senet/Emre Yazılı Senet/Bono), `BillIsCollateralModal`, tarih/tutar/döviz/açıklama/belge no | POST `/finance/payments` `method=CHECK, instrument.kind=NOTE` | UI+API-genişlet — `note_type`, `is_collateral` (V22). ZTO `AddBill` cari/defter yazmıyor (yalnız `ZT_Bills`) → BR'de settlement zorunlu (BR kazanır) |
| `updateStatusModal` (Bills:1669-1732) Portföyde/Teminata Verildi/Ödendi/Protestolu/İptal | §2.2 | UI+API-genişlet |
| `MarkBillAsPaid` (çağıransız) | — | ÇIKAR |

### 2.5 AccountCredits
| ZTO öğe | Blackrose | Karar |
|---|---|---|
| Index (müşteri bazlı alacak/tahsilat/net) | GET `/finance/accounts` + bakiye (`FinanceController.java:135`), GET `/finance/reports/aging?type=RECEIVABLE` (`:195`); UI `AccountsPage.tsx` | UI-mevcut-API (ZTO görünümü; "Kayıt Sayısı/İlk-Son Tarih" için UI+API-genişlet: aging yanıtına ekle) |
| M18 `deleteModal` | — | ÇIKAR (ZTO'da backend yok; ölü) |
| Detail satır listesi | GET `/finance/accounts/{id}/statement` (`:184`) | UI-mevcut-API |
| M19 `editCreditModal` (tutar/belge/yöntem/vade değiştirme) | `account_transaction` değişmez; ters kayıt `POST /accounts/transactions/{id}/reverse` (`:177`) + yeni `POST /accounts/{id}/transactions` (`:169`) | ÇIKAR (doğrudan düzenleme defter tekyazarlık kuralını ihlal eder); yerine "Ters Kayıt + Yeni Kayıt" iki adımlı modal |
| `OrdersID` (sipariş bağı), `Customer` INNER JOIN | — | ÇIKAR (satış modülü) |

### 2.6 CreditContracts — sayfa ve modallar
BR'de kredi modülü **yok**; tüm satırlar V24 tablolarına + yeni `CreditService`'e dayanır. Defter kuralı: kredi servisi `account_transaction`/`fund_transaction`'a **doğrudan yazmaz**, `SettlementService.create` üzerinden yazar (LedgerService/FundLedgerService tek yazar kalır).

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Index liste/filtre/tablolar | — | UI+yeni-tablo (V24) — GET `/finance/credits?status&fundAccountId&type` |
| Index "Kredi Dağılımı" grafiği, Dashboard sayfası | — | UI+yeni-API — GET `/finance/credits/dashboard` |
| `_CreditDashboardWidget`, `GetDashboardWidgetData` | — | ÇIKAR (hiçbir view include etmiyor) |
| Add formu | — | UI+yeni-tablo — POST `/finance/credits` (tek `@Transactional`; ZTO'da transaction yok) |
| Add: kredi banka hesabı `ZT_BankIntroduction AccountType='Kredi'` (gölge fon) | `account` type `BANK` (`FinanceTypes.java:13`) borç defteri olarak | ÇIKAR (gölge fon); kredi borcu = BANK tipli carinin bakiyesi |
| Add: `UseImmediately` iki banka hareketi | Settlement COLLECTION `method=BANK`, `accountId=bank cari`, `fundAccountId=vadesiz` (`SettlementService.java:112-136`: cari CREDIT + fon IN) | UI+yeni-API (CreditService içinden settlement) |
| Add: açılış borcu `ZT_AccountDebts` | aynı COLLECTION'ın cari CREDIT kaydı | ÇIKAR (ayrı borç kaydı gereksiz; çift kayıt olur) |
| Add: Komisyon/Sigorta/Diğer masraf | Settlement PAYMENT `expenseItemId` (doğrudan gider, `SettlementService.java:229-232`) | UI+API-genişlet — ZTO yazmıyordu; BR'de kullandırım anında gider settlement'ı (opsiyonel bayrak) |
| C1/D12 ForceDelete, D11 DeleteWithInstallments | ters kayıt kuralı | UI+yeni-API — POST `/finance/credits/{id}/cancel {reason}`: tüm kredi settlement'ları `reverse`, planlar CANCELLED, sözleşme CANCELLED; hareketi olmayan kredi için DELETE (soft) |
| C2 `assignCariModal` (Ata) | `credit_contract.bank_account_id` | UI+yeni-API — PUT `/finance/credits/{id}/bank-account` yalnız settlement yoksa |
| C2 (Değiştir) borç/ödeme taşıma | defter satırı taşınamaz | ÇIKAR (settlement varsa); yoksa Ata ile aynı uç |
| C3/D2 Taksit ödeme | — | UI+yeni-API — POST `/finance/credits/installments/{id}/pay {amount, date, fundAccountId, description}`; dağıtım sırası ZTO ile aynı (gecikme → BSMV → faiz → anapara) |
| C3 ön bilgi `GetInstallmentPaymentInfo` | — | UI+yeni-API — GET `/finance/credits/installments/{id}` |
| C4 Taksitli kredi sonradan kullandırım | Settlement COLLECTION | UI+yeni-API — POST `/finance/credits/{id}/disburse {date}` |
| C5/D5 Rotatif kullanım | Settlement COLLECTION + `credit_drawdown` | UI+yeni-API — POST `/finance/credits/{id}/drawdowns` |
| C6/D6 Rotatif geri ödeme (faiz/BSMV elle) | 3 settlement (anapara PAYMENT cari; faiz & BSMV PAYMENT gider kalemi) | UI+yeni-API — POST `/finance/credits/{id}/repayments` |
| C6/D6 faiz tahmini | — | UI+yeni-API — GET `/finance/credits/{id}/interest-estimate?from&to&base` |
| C7-C8, D9-D10 onay/bilgi | — | UI |
| D1 Genel bilgiler | — | UI+yeni-API — PUT `/finance/credits/{id}` (oran değişirse yalnız ödenmemiş taksitler yeniden hesaplanır) |
| D3 Eşleştir, D4 Oto eşleştir, "Cariye Aktar" (`TransferInstallmentToCari`) | BR'de tüm kredi kayıtları kredi servisinden geçer; bağsız elle ödeme oluşmaz | ÇIKAR (ZTO'nun veri tutarsızlığını onaran araçlar). Geçmiş veri aktarımı açılış kaydı ile çözülür |
| D7 Vade bilgileri + yeniden oluştur, Yeniden Hesapla, satır içi taksit düzenleme | — | UI+yeni-API — PUT `/finance/credits/{id}/schedule`, POST `/finance/credits/{id}/recalculate`, PUT `/finance/credits/{id}/installments` (yalnız PENDING taksitler; bağlı planlar senkron) |
| D8 Notlar | — | UI+yeni-API — PATCH `/finance/credits/{id}/notes` |
| Paneller: kullanım hareketleri / finansman giderleri / banka son hareketleri | `credit_drawdown`; settlement (gider kalemi); GET `/finance/funds/{id}/statement` (`FinanceController.java:255`) | UI+yeni-API / UI-mevcut-API |
| CreditDocuments + D13-D15 | `/api/v1/files` | UI+API-genişlet (`FileOwnerPolicy` `CREDIT_CONTRACT`) |
| `PayWithCredit` (cari ödemesini krediyle) | — | ÇIKAR (istemcisi yok; banka/cari kaydı yazmıyordu) |
| `ZT_FinIncomeExpense` (Faiz/BSMV gider tablosu) | gider kalemi settlement'ları | ÇIKAR (tablo); raporlama settlement + expense_item'dan |

**Kredi yaşam döngüsü (ZTO, kod incelemesiyle)**
- Tipler `EsitTaksit`/`EsitAnapara`/`Bullet`/`Revolving` (`:545`); durum `Aktif`/`Kapatildi`/`Iptal`; taksit `Bekliyor`/`Kismi`/`Odendi`/`Gecikti` (`Gecikti` yalnız okunuyor — yazan kod `⚠ BULUNAMADI`; plan tarafında `'Gecikmiş'` `PaymentPlanHelper.cs:205`).
- PMT aylık oranla (`:565-568`, r = yıllık/100/12) — **ödeme periyodu 3/6/12 ay olsa da aylık oran kullanılıyor** (hata); taksit faizi ACT/365 gün sayısıyla; `DayCount` seçimi kaydediliyor ama hesapta kullanılmıyor.
- **BSMV = faiz × %5 sabit** (`:1533-1534`, `:2877`, `:6018`). **KKDF yok** (`⚠ BULUNAMADI` — kodda hiç geçmiyor).
- Gecikme faizi: `LateFee`/`PaidLateFee` kolonları ve ödeme dağıtımında öncelik var (`:3866`, `:4340`) ama `LateFee`'yi hesaplayan/yazan kod `⚠ BULUNAMADI` (yalnız elle taksit düzenlemede değişebilir).
- Tüm taksitler ödenince `Kapatildi`; kalan anapara ve ödenen taksit sayısı sözleşmede tutulur.

### 2.7 Ödeme onayı — ZTO iki akış vs BR PaymentPlan
| Özellik | ZTO eski (`ZT_PaymentPlans` + `ZT_PaymentApprovals`, PaymentManagement) | ZTO yeni (`ZT_CustomerAccountPaymentPlans`, PaymentApproval + PaymentPlanHelper) | BR `payment_plan` (`PaymentPlanService.java`) |
|---|---|---|---|
| Birim | borç satırı (`DebtID`) + onay paketi (`ApprovalCode` sequence) | cari/kaynak bazlı plan (`SourceType`: Çek/Kredi/Maaş/Talimatlı Plan) | cari + şube + tutar + vade (+ ops. alış faturası) |
| Durumlar | plan `Planlandı`; onay `Onay Bekliyor → Onaylandı/Reddedildi → Ödeme Talimatı Verildi → Kısmi Ödendi/Ödendi` | `ApprovalStatus: Beklemede → Onay Bekliyor → Onaylandı/Reddedildi(→Onay Bekliyor, BulkReturnToPending :1199) → Talimat Verildi → Tamamlandı`; `PaymentStatus: Beklemede/İşlemde/Tamamlandı/İptal/Gecikmiş`; `PlanningStatus`, `InstructionStatus` | `DRAFT → PENDING → APPROVED/REJECTED(→PENDING) → PAID`, her yerden `CANCELLED`; `postpone` (`:174`) |
| Dört göz | yok (`ApprovePayment` `:941-970`) | yok (`Approve` `PaymentApprovalController.cs:583-600`) | var (`ensureApproverAllowed` `:314-323`, V16 varsayılan kapalı) |
| Red gerekçesi | UI'da zorunlu (`rejectModal` required) | notlar opsiyonel | zorunlu (`:144-147`), V17 `reject_note` |
| Kısmi ödeme | var (FIFO, `:1299-1530`) | yok (talimat bütün) | yok (plan tam tutar, `:192-224`) |
| Ödeme yöntemi | Nakit/Banka/Çek/Senet | banka talimatı | yalnız BANK/CASH (`:198-203`) |
| Öncelik / planlanan banka-kasa / not | var | banka/şube/iş yeri alanları | yok |
| Talimat (banka talimat dosyası) | `GivePaymentOrder` durum değişimi | `BulkGiveOrderAndStoreSession` + BankTransactions talimat ekranı | yok |
| Kaynak senkronu | yok | çek/kredi/maaş ile otomatik (`PaymentPlanHelper.cs:33, 197, 278`) | yalnız `purchase_invoice_id` |

**Öneri**: Tek motor = BR `payment_plan`. Eski akışın dört sayfası ZTO görünümüyle yeniden yapılır ama BR plan uçlarına bağlanır:
- P1 `planModal` → POST `/finance/payment-plans` (UI+API-genişlet: `priority`, `plannedMethod`, `plannedFundAccountId`, `notes`, `purchaseInvoiceId`); "ödenmemiş borçlar" listesi → açık alış faturaları + `aging(PAYABLE)` (UI+API-genişlet).
- P2 `approvalModal` → toplu `submit` (UI+yeni-API: POST `/finance/payment-plans/submit` {ids, priority, notes} + `batch_code`).
- P3/P7 detay → GET `/payment-plans/{id}/events` (`FinanceController.java:377`) + batch listesi (UI+API-genişlet).
- P4 `approveModal` → POST `/payment-plans/{id}/approve` (`:389`) — UI-mevcut-API; dört göz BR kuralı geçerli.
- P5 `rejectModal` → POST `/payment-plans/{id}/reject` (`:395`) — UI-mevcut-API.
- "Talimat Ver" → UI+API-genişlet: `ordered_at/ordered_by` (durum makinesi değişmez; APPROVED içinde işaret).
- P6/P8 `processPaymentModal` → POST `/payment-plans/{id}/pay` (`:414`) — UI-mevcut-API; Çek/Senet seçenekleri ve kısmi tutar **ÇIKAR** (BR kuralı); tek modal (çift id hatası giderilir).
- `ZT_PaymentPlans`/`ZT_PaymentApprovals`/`ZT_PaymentApprovalDetails` tabloları, `ZT_PaymentApprovalCode_seq` → **ÇIKAR** (taşınmaz).
- Kaynaklı planlar: kredi taksitleri `payment_plan.source_type='CREDIT_INSTALLMENT'`; çekler için plan **oluşturulmaz** — heatmap/dashboard açık ISSUED instrument'ları da gösterir (UI+API-genişlet `heatmap` `PaymentPlanService.java:227`).
- `PaymentApprovalApiController.CheckCompletedInstructions` → **ÇIKAR** (çağıranı yok; BR'de plan durumu `GET /payment-plans?status=PAID` ile okunur).

---

## 3. Davranış çatışmaları ve çözüm (varsayılan: BR kuralı kazanır)

| # | Çatışma | ZTO kanıtı | BR kanıtı | Çözüm |
|---|---|---|---|---|
| 1 | Serbest durum geçişi vs geçiş tablosu | `UpdateCheckStatus` her hedefi kabul eder (`ChecksController.cs:975`) | `ensureAllowed` 409 (`InstrumentService.java:274-285`) | BR; UI menüsü yalnız tabloda olan hedefleri gösterir; eksik iş geçişleri §2.2'deki eklemelerle |
| 2 | Fiziksel DELETE (ödeme, koçan yaprağı, taksit, banka/kasa hareketi) | `ChecksController` kasa/banka DELETE; `CheckBooksController.cs:313`; Credit DELETE'ler | soft delete + `reverseSource` (`LedgerService.java:81`, `FundLedgerService.java:93`) | BR; tüm "Sil" eylemleri iptal/ters kayıt |
| 3 | Çek tutar düzenleme bağlı ödeme/banka tutarını değiştirir, transaction yok | `EditCheck` POST (`:2263`) | defter kayıtları değişmez | BR; PATCH yalnız finansal olmayan alanlar |
| 4 | `Bankada`/`Bankaya Yatırıldı` çift yazım | `ChecksController.cs:979-984` | tek `AT_BANK` | veri göçünde normalize |
| 5 | Kasada tutma (para hareketsiz) "Tahsil Edildi" olarak işaretleniyor | `TahsilKasaCiro` `Checks.cshtml:1256, 4190-4192` | PORTFOLIO = eldeki çek | PORTFOLIO + `custody_fund_id` |
| 6 | Çek cari kaydı durum değişiminde sonradan oluşturuluyor | `UpdateCheckStatus` Kendi Çekimiz için ödeme INSERT (envanter :1692-1855) | cari kaydı settlement anında (`SettlementService.java:112-124`) | BR; durum geçişi yalnız karşılıksız/iptal ters kaydı yazar |
| 7 | Karşılıksızda bağlı ödeme silinir | `ZT_AccountPayments` DELETE | BOUNCED: karşı kayıt (`InstrumentService.java:175-206`) | BR |
| 8 | Çapraz kur ödemesi | `CrossExchangeRate` | fon/para birimi eşitliği (`SettlementService.java:265`) | ÇIKAR |
| 9 | Çek no doğrulaması 7 hane (M5) vs 1-7 hane (M6) vs BR ≤50 | `Checks.cshtml:1603, 2369` | `NewInstrument.number @Size(max=50)` | Tek kural: CHECK için `^\d{7}$` (UI zod + BR servis doğrulaması; NOTE serbest) |
| 10 | Tekillik: ZTO aktif çeklerde numara; BR (kind, direction, number, bank_name) | `CheckDuplicateCheckNumber` | `V3:141-142` | BR indeksi + koçan yaprağı tekilliği (V23) |
| 11 | Kredi Add transaction'sız | `CreditContractsController.cs:522-757` | `@Transactional` | BR |
| 12 | Bakiye kolonu güncelleme (`ZT_BankIntroduction.Balance/UsedCredit`) | envanter :1420-1432, :4498-4522 | bakiye hareketlerden hesaplanır | BR; gölge kredi fonu ÇIKAR |
| 13 | Dört göz yok | `PaymentManagementController.cs:941-970`; `PaymentApprovalController.cs:583-600` | `PaymentPlanService.java:314-323` | BR; ZTO ekranlarında "kendi planınızı onaylayamazsınız" mesajı gösterilir |
| 14 | Kısmi talimat ödemesi | `ProcessPaymentOrder` FIFO (`:1299-1530`) | plan tam ödenir | BR; gerekiyorsa planı iptal edip yeni tutarla plan (ileride "split" ucu) |
| 15 | Planı çek/senetle ödeme | `processPaymentMethod` Çek/Senet | `PLAN_METHOD_INVALID` (`:198-203`) | BR; seçenekler kaldırılır |
| 16 | Kredi taksiti planı onaysız ödenir | `PayInstallment` plan durumuna bakmaz | "Onaysız plan ödenemez" (`PaymentPlanService.java:47, 194`) | BR: taksit planı APPROVED değilse `CreditService.payInstallment` 409; plan otomatik PENDING'e gönderilir (sözleşme kaydında) |
| 17 | Kredi taksiti çoklu defter kaydı | tek ödeme → 2 banka hareketi + cari + gider | `account_transaction UNIQUE(source_type, source_id)` (`V3:35`) | Her bileşen ayrı settlement (ayrı source_id) → kısıt korunur |
| 18 | Yetki: CheckBooks/AccountCredits özniteliksiz; Satış Personeli çeklerde yetkili, kredide değil | `CheckBooksController.cs:10`, `AccountCreditsController.cs:8`, `ChecksController.cs:15-16`, `CreditContractsController.cs:14-15` | `FINANCE_VIEW/MANAGE/PAYMENT_CREATE/APPROVE` (`FinanceController.java:87-90`) | BR izinleri; kredi yazma = `FINANCE_PAYMENT_CREATE`, sözleşme tanımı = `FINANCE_MANAGE` |
| 19 | Antiforgery eksik (Checks/CheckBooks POST) | envanter | SPA + token/JWT | sorun taşınmaz |
| 20 | Aynı id'li iki modal | `ProcessPaymentOrders.cshtml:83, 250` | — | React'te tek bileşen |
| 21 | Kredi PMT periyot hatası; DayCount kullanılmıyor | `:565-568`; `:504` | — | BR'de doğru hesap: periyot oranı = yıllık × periyot gün/`DayCount` paydası; ZTO sonuçlarıyla farklılık beklenir → göçte mevcut taksitler olduğu gibi aktarılır, yeniden hesaplanmaz |

**Açık envanter sorusu — çözüldü**: `PaymentApprovalApiController` **hem `[Authorize]` hem `[UserRoleAuthorize]`** taşır:
```
ApiController/PaymentApprovalApiController.cs:14    [Authorize]
ApiController/PaymentApprovalApiController.cs:15    [UserRoleAuthorize("Admin", "Finans(normal)", "Finans(super)", "Muhasebe (Alış)", "Satış Personeli", "Patron")]
```
(Not: rol listesi `PaymentApprovalController.cs:14`'tekinden farklı olarak `Satış Personeli` içerir.)

---

## 4. Gerekli backend eklemeleri (tenant V22+)

### V22__instrument_extensions.sql
```
ALTER TABLE instrument
  ADD COLUMN issue_date        DATE,
  ADD COLUMN bank_branch       VARCHAR(100),
  ADD COLUMN drawer_account_id UUID REFERENCES account (id),
  ADD COLUMN drawer_name       VARCHAR(200),
  ADD COLUMN description       VARCHAR(500),
  ADD COLUMN document_no       VARCHAR(50),
  ADD COLUMN custody_fund_id   UUID REFERENCES fund_account (id),
  ADD COLUMN check_leaf_id     UUID,            -- FK V23'te eklenir
  ADD COLUMN note_type         VARCHAR(20),     -- PLAIN / ORDER / BOND (Adi / Emre Yazılı / Bono)
  ADD COLUMN is_collateral     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN settled_date      DATE;            -- tahsil/ödeme tarihi (rapor)
ALTER TABLE instrument_movement
  ADD COLUMN fund_account_id         UUID REFERENCES fund_account (id),
  ADD COLUMN counterparty_account_id UUID REFERENCES account (id);
-- status değer kümesi (VARCHAR(20), enum Java'da): + CANCELLED, RETURNED, COLLATERAL, PROTESTED
CREATE INDEX instrument_due_idx ON instrument (direction, kind, due_date) WHERE deleted = FALSE;
```
Java: `InstrumentStatus` + 4 değer; geçiş tablosu eklemeleri: RECEIVED `PORTFOLIO→{COLLECTED(BANK fon), RETURNED, COLLATERAL}`, `COLLATERAL→{PORTFOLIO}`, `BOUNCED(NOTE)≈PROTESTED`; ISSUED `ISSUED→CANCELLED`. `NewInstrument` + alanlar; `InstrumentResponse` + alanlar; yeni uçlar GET `/instruments/{id}`, PATCH `/instruments/{id}`, PUT `/instruments/{id}/custody`, GET `/reports/instruments`, list filtreleri. `FileOwnerPolicy` `INSTRUMENT`.

### V23__check_book.sql
```
CREATE TABLE check_book (
  id UUID PRIMARY KEY,
  fund_account_id UUID NOT NULL REFERENCES fund_account (id),   -- yalnız kind=BANK
  serial_no   VARCHAR(50) NOT NULL,
  bank_code   CHAR(4), branch_code CHAR(4),
  start_number VARCHAR(7) NOT NULL, end_number VARCHAR(7) NOT NULL,
  leaf_count  INT NOT NULL CHECK (leaf_count BETWEEN 1 AND 1000),
  created_by VARCHAR(254) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  updated_by VARCHAR(254) NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE check_leaf (
  id UUID PRIMARY KEY,
  check_book_id UUID NOT NULL REFERENCES check_book (id),
  leaf_no INT NOT NULL,
  number VARCHAR(7) NOT NULL,
  micr_code VARCHAR(30),
  status VARCHAR(10) NOT NULL,           -- UNUSED / USED / VOID
  instrument_id UUID REFERENCES instrument (id),
  used_date DATE,
  <audit kolonları>, deleted BOOLEAN NOT NULL DEFAULT FALSE);
CREATE UNIQUE INDEX check_leaf_number_uq ON check_leaf (check_book_id, number) WHERE deleted = FALSE;
-- aynı banka hesabında numara tekilliği servis katmanında (fund_account_id üzerinden join) + kısmi indeks için fund_account_id kopyası önerilir
ALTER TABLE instrument ADD CONSTRAINT instrument_check_leaf_fk FOREIGN KEY (check_leaf_id) REFERENCES check_leaf (id);
```
Servis: `CheckBookService` (yaprak üretimi, MICR), `SettlementService.registerInstrument` yaprak varsa USED işaretler (aynı transaction), CANCELLED'da VOID.

### V24__credit.sql
```
CREATE TABLE credit_contract (
  id UUID PRIMARY KEY, code VARCHAR(50) NOT NULL,
  branch_id UUID NOT NULL REFERENCES branch (id),
  bank_account_id UUID REFERENCES account (id),          -- type=BANK, borç defteri
  disbursement_fund_id UUID NOT NULL REFERENCES fund_account (id),
  currency CHAR(3) NOT NULL,
  credit_type VARCHAR(20) NOT NULL,      -- EQUAL_INSTALLMENT / EQUAL_PRINCIPAL / BULLET / REVOLVING
  purpose VARCHAR(30), rate_type VARCHAR(10) NOT NULL,   -- FIXED / VARIABLE
  annual_rate NUMERIC(9,4) NOT NULL, spread_rate NUMERIC(9,4),
  day_count VARCHAR(10) NOT NULL DEFAULT 'ACT_365',      -- ACT_365 / ACT_360 / D30_360
  bsmv_rate NUMERIC(6,4) NOT NULL DEFAULT 0.05,
  kkdf_rate NUMERIC(6,4) NOT NULL DEFAULT 0,             -- ZTO'da yok; parametrik
  application_date DATE, approval_date DATE,
  start_date DATE NOT NULL, first_payment_date DATE, end_date DATE,
  principal NUMERIC(19,4) NOT NULL DEFAULT 0, credit_limit NUMERIC(19,4),
  used_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  payment_frequency VARCHAR(12),        -- MONTHLY / QUARTERLY / SEMIANNUAL / ANNUAL / WEEKLY / DAILY
  total_installments INT,
  commission_amount NUMERIC(19,4), commission_rate NUMERIC(9,4),
  insurance_fee NUMERIC(19,4), other_fees NUMERIC(19,4),
  collateral_type VARCHAR(30), collateral_amount NUMERIC(19,4), collateral_description VARCHAR(500),
  status VARCHAR(12) NOT NULL,          -- ACTIVE / CLOSED / CANCELLED
  disbursed_on DATE,                    -- null = henüz kullandırılmadı
  description VARCHAR(1000), notes VARCHAR(2000),
  <audit>, deleted BOOLEAN NOT NULL DEFAULT FALSE);
CREATE UNIQUE INDEX credit_contract_code_uq ON credit_contract (code) WHERE deleted = FALSE;
CREATE SEQUENCE credit_contract_code_seq;  -- KRD-{yıl}-{4 hane}, ZTO'daki MAX+1 yarışını giderir

CREATE TABLE credit_installment (
  id UUID PRIMARY KEY, contract_id UUID NOT NULL REFERENCES credit_contract (id),
  installment_no INT NOT NULL, due_date DATE NOT NULL,
  principal NUMERIC(19,4) NOT NULL, interest NUMERIC(19,4) NOT NULL,
  bsmv NUMERIC(19,4) NOT NULL DEFAULT 0, kkdf NUMERIC(19,4) NOT NULL DEFAULT 0,
  late_fee NUMERIC(19,4) NOT NULL DEFAULT 0, total NUMERIC(19,4) NOT NULL,
  remaining_principal NUMERIC(19,4) NOT NULL,
  paid_principal, paid_interest, paid_bsmv, paid_kkdf, paid_late_fee, paid_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL,          -- PENDING / PARTIAL / PAID (OVERDUE sorguda türetilir)
  paid_date DATE, <audit>, deleted BOOLEAN NOT NULL DEFAULT FALSE);
CREATE UNIQUE INDEX credit_installment_no_uq ON credit_installment (contract_id, installment_no) WHERE deleted = FALSE;

CREATE TABLE credit_movement (          -- taksit ödemesi, kullandırım, rotatif kullanım/geri ödeme
  id UUID PRIMARY KEY, contract_id UUID NOT NULL REFERENCES credit_contract (id),
  installment_id UUID REFERENCES credit_installment (id),
  type VARCHAR(20) NOT NULL,            -- DISBURSEMENT / DRAWDOWN / REPAYMENT / INSTALLMENT_PAYMENT
  movement_date DATE NOT NULL, fund_account_id UUID NOT NULL REFERENCES fund_account (id),
  principal, interest, bsmv, kkdf, late_fee, fees NUMERIC(19,4) NOT NULL DEFAULT 0,
  total NUMERIC(19,4) NOT NULL, used_after NUMERIC(19,4), available_after NUMERIC(19,4),
  reference_no VARCHAR(50), description VARCHAR(500),
  status VARCHAR(10) NOT NULL,          -- POSTED / REVERSED
  idempotency_key VARCHAR(100) UNIQUE, <audit>, deleted BOOLEAN NOT NULL DEFAULT FALSE);

ALTER TABLE settlement ADD COLUMN origin_type VARCHAR(40), ADD COLUMN origin_id UUID;   -- 'CREDIT_MOVEMENT'
CREATE INDEX settlement_origin_idx ON settlement (origin_type, origin_id);

-- gider kalemleri (seed): expense_type FINANCE → INTEREST 'Kredi Faizi', BSMV, KKDF, COMMISSION 'Kredi Komisyonu', LATE_FEE 'Gecikme Faizi'
```
Defter akışı (CreditService → SettlementService, tek transaction): kullandırım = COLLECTION BANK (cari CREDIT + fon IN); anapara = PAYMENT BANK cari (DEBIT + fon OUT); faiz/BSMV/KKDF/gecikme/komisyon = PAYMENT BANK `expenseItemId` (yalnız fon OUT). İptal = kredinin settlement'larını `reverse` (`SettlementService.reverse` iç kullanım için `origin_type='CREDIT_MOVEMENT'` istisnası; plan bağlı kayıt yasağı korunur). `FileOwnerPolicy` `CREDIT_CONTRACT`. Uçlar §2.6.

### V25__payment_plan_extensions.sql
```
ALTER TABLE payment_plan
  ADD COLUMN source_type VARCHAR(40),            -- CREDIT_INSTALLMENT
  ADD COLUMN source_id UUID,
  ADD COLUMN priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL',   -- LOW / NORMAL / HIGH / URGENT
  ADD COLUMN planned_method VARCHAR(10),          -- CASH / BANK
  ADD COLUMN planned_fund_account_id UUID REFERENCES fund_account (id),
  ADD COLUMN notes VARCHAR(1000),
  ADD COLUMN batch_code VARCHAR(30),              -- onay talebi paketi (ZTO ApprovalCode)
  ADD COLUMN ordered_at TIMESTAMPTZ, ADD COLUMN ordered_by VARCHAR(254);
CREATE UNIQUE INDEX payment_plan_source_uq ON payment_plan (source_type, source_id)
  WHERE deleted = FALSE AND status <> 'CANCELLED';
CREATE SEQUENCE payment_plan_batch_seq;
```
Uçlar: POST `/payment-plans/submit` (toplu, batch_code), POST `/payment-plans/{id}/order`, GET `/payment-plans?batchCode=`; `CreatePlanRequest` + priority/plannedMethod/plannedFundAccountId/notes/purchaseInvoiceId; `pay` kaynaklı planlarda (`source_type` dolu) 409 → ödeme kaynağın servisinden (CreditService) yapılır ve planı PAID işaretler; heatmap/dashboard'a açık ISSUED instrument'lar eklenir.

### Admin tarafı
Yeni izin gerekmiyor (FINANCE_* yeterli). İsteğe bağlı `FINANCE_CREDIT_MANAGE` ayrımı istenirse admin migration'ında izin seed'i (`⚠` mevcut admin izin seed dosyası incelenmedi).

---

## 5. React karşılığı gereken JS kütüphaneleri

| ZTO kütüphane | Kullanım yeri | React/BR karşılığı |
|---|---|---|
| jQuery 3.6.0 **ve** 3.6.4 (aynı sayfada iki kez, `Checks.cshtml:66, 69`) | tüm sayfalar | React state; kaldırılır |
| Bootstrap 4.6.2 bundle (modal, dropdown, alert; iki kez yükleniyor `:67, :72`) | tüm modallar, satır menüleri | ZTO markup + kapsamlı (scoped) Bootstrap CSS; davranış için kendi `ZtoModal`/`ZtoDropdown` bileşeni (portal + `.modal.show`, odak tuzağı) — `react-bootstrap` eklenmeden (bağımlılık listesinde yok, `frontend/package.json`) |
| DataTables 1.13.7 + Responsive 2.5.0 + Buttons 2.4.2 + i18n | Checks, CheckBooks, CreditContracts, AccountCredits listeleri; footer toplamları | `@tanstack/react-table` (yeni bağımlılık) + ZTO tablo sınıfları; sunucu sayfalaması (`PageResponse`) |
| JSZip 3.10.1 + Buttons html5 Excel | Excel'e Aktar | `xlsx` (SheetJS) veya `exceljs` (yeni bağımlılık) |
| pdfmake 0.2.7 + vfs_fonts | CreditContracts Index PDF | `pdfmake` npm veya yalnız `window.print()` + print CSS (öneri: print) |
| Chart.js (sürümsüz CDN, `Dashboard.cshtml:19`; Index `:1053`) | kredi dağılımı / faiz doughnut | `chart.js@4` + `react-chartjs-2` (görsel birebirlik için) |
| Select2 (layout'tan; ZTO çoğu select'te `no-select2`) | cari/banka seçimleri | MUI `Autocomplete` ZTO input görünümüyle ya da yerel `<select>` |
| `searchable-select.js` (yerel) | ödeme modalı cari arama | aynı davranışlı React `SearchableSelect` |
| Kredi cari arama (`acsrRenderResults`, `Index.cshtml:1205`) | assignCariModal | `SearchableSelect` |
| Font Awesome 5.15.1 | tüm ikonlar | `@fortawesome/fontawesome-free` CSS (wrapper içinde) |
| animate.css 4.1.1 | AccountCredits | CSS kopya (scoped) |
| CSS 3D çek yaprağı (`Checks.cshtml:1318-1365`, JS `:4273-4490`) | checkLeafModal | CSS birebir + React mouse-tilt hook |
| `formatDecimalInput`, `ztEscapeHtml`, `showLoader/showSuccessMessage/showErrorMessage` (inline) | formlar, bildirimler | React yardımcıları; `Intl.NumberFormat('tr-TR')`; bildirim için mevcut BR snackbar |
| `_CheckLeafGuard.cshtml` (debounce + `CheckLeafLookup`) | manuel çek no | `useCheckLeafGuard` hook + `@tanstack/react-query` |
| `window.print()` | rapor/liste | aynen + print stylesheet |

---

## Özet (10 satır)
1. Kapsam: 18 view (+1 .bak2 hariç) ve 1 API controller tarandı; Checks ≈18 (8 statik + belge 3 + koçan 1 + confirm 4 + payments.js 2), CreditContracts 23 statik modal; tümü alan/doğrulama/uç/tablo düzeyinde listelendi.
2. PromissoryNotes yok; senet `BillsController`/`Bills.cshtml`'de, BR'de `instrument.kind=NOTE` olarak eşlendi.
3. `PaymentApprovalApiController` hem `[Authorize]` (:14) hem `[UserRoleAuthorize(...)]` (:15) taşır; tek ucunun çağıranı yok → ÇIKAR.
4. ZTO çek durumları BR `InstrumentStatus`'a eşlendi; `Bekliyor` ÇIKAR, `İptal` için CANCELLED/RETURNED, senet için COLLATERAL/PROTESTED, PORTFOLIO→COLLECTED ve kasada tutma (custody) eklenmeli.
5. "Kasaya Al (Ciro)" ZTO'da para hareketsiz "Tahsil Edildi" — BR'de doğru karşılığı PORTFOLIO + `custody_fund_id`.
6. Çek koçanı BR'de yok → V23 `check_book`/`check_leaf`; çek ek alanları (keşide tarihi, şube, keşideci, açıklama, yaprak) → V22.
7. Kredi modülü BR'de yok → V24 `credit_contract`/`credit_installment`/`credit_movement` + `settlement.origin_*`; defter kayıtları yalnız SettlementService üzerinden; BSMV %5 parametrik, KKDF ZTO'da yok (parametrik eklendi), gecikme faizi hesaplayan kod yok.
8. ZTO kredi hataları (aylık PMT oranı her periyotta, DayCount kullanılmıyor, Add transaction'sız, gölge kredi fonu, masraflar hiç işlenmiyor) BR'de düzeltilir; eşleştirme/oto-eşleştirme/cariye aktar araçları ÇIKAR.
9. Ödeme onayı: tek motor BR `payment_plan`; eski ZT_PaymentPlans/ZT_PaymentApprovals akışı tabloları ÇIKAR, ekranları V25 (öncelik, planlanan fon, batch_code, talimat işareti, source_type) ile BR uçlarına bağlanır; dört göz, zorunlu red gerekçesi, tam tutar ödeme BR kuralı kalır.
10. React için jQuery/Bootstrap JS/DataTables/JSZip/Chart.js/Select2 yerine kendi Bootstrap-markup modal bileşeni, @tanstack/react-table, xlsx, react-chartjs-2, SearchableSelect; ZTO CSS wrapper kapsamında kopyalanır.
