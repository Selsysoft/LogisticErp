# 02 — Mimari, Çok Kiracılık, Veri Modeli ve ERP Eşleme

Bu doküman, platformun teknik iskeletini ve ana veri modelini tanımlar. Faz dosyaları buradaki
sözleşmelere uyar.

---

## 1. Yüksek Seviye Mimari

```
[ React (TS) SPA ]  ──HTTPS/JSON──►  [ Spring Boot REST API (modüler monolit) ]
                                           │
             ┌─────────────────────────────┼───────────────────────────────┐
             ▼                             ▼                               ▼
   [ PostgreSQL (tenant verisi) ]  [ Admin/Abonelik DB ]        [ Entegrasyonlar ]
                                                                 GİB, HGS, GPS, Banka, TCMB
```

- **Modüler monolit** ile başla (tek deploy, modül paketleri net sınırlı). İleride yoğun modüller
  (ör. GPS/telematik akışı) servise ayrılabilir. Erken mikroservis **yapma**.
- **Asenkron işler:** e-belge gönderimi, GPS konum akışı, rapor üretimi için kuyruk
  (önce Spring `@Async`/scheduler, ölçek gerekince RabbitMQ/Kafka).

### Backend paket yapısı (öneri)
```
org.ece.blackrose
 ├─ common        (Money, hata, audit, sayfalama, güvenlik yardımcıları)
 ├─ tenant        (kiracı çözümleme, bağlam, veri kaynağı yönlendirme)
 ├─ identity      (kullanıcı, rol, izin, oturum, 2FA)
 ├─ finance       (cari, banka, kasa, çek/senet, ödeme, tahsilat, planlama, döviz)
 ├─ crm           (müşteri/aday, kişi, fırsat, teklif, sözleşme, tarife)
 ├─ shipment      (sevkiyat/sefer, yük, rota/bacak, CMR, irsaliye, POD)
 ├─ fleet         (araç, çekici, dorse, bakım, muayene, sigorta, lastik, yakıt)
 ├─ driver        (sürücü, belge, atama, harcırah, çalışma süresi)
 ├─ warehouse     (depo, antrepo, stok, elleçleme, 3PL)
 ├─ customs       (gümrük, transit, ADR, uluslararası belge)
 ├─ billing       (navlun faturalama, e-Fatura/e-Arşiv, SaaS abonelik faturalama)
 ├─ reporting     (dashboard, KPI, kârlılık)
 └─ integration   (gib, hgs, gps, bank, tcmb adaptörleri)
```

---

## 2. Çok Kiracılık Stratejisi (ÖNERİ + karar notu)

Üç seçenek değerlendirildi:

| Strateji | Artı | Eksi |
|---|---|---|
| **Şema-başına-tenant** (ÖNERİLEN) | Güçlü izolasyon, tek DB yönetimi, tenant başına yedek/geri yükleme kolay, şema göçü tek migration ile tüm tenantlara uygulanır | Çok sayıda tenant'ta şema sayısı yönetimi; bağlantı yönlendirme gerekir |
| DB-başına-tenant (ERP'nin mevcut yolu) | En güçlü izolasyon | Operasyon/maliyet ağır, yüzlerce DB |
| Tek şema + tenant_id (row-level) | En basit altyapı | İzolasyon zayıf, her sorguda tenant filtresi riski, veri sızıntısı riski |

**Karar:** Başlangıçta **şema-başına-tenant** (PostgreSQL schema). `public`/`admin` şeması merkezi
(tenant kayıt, abonelik, lisans, SaaS kullanıcıları); her kiracı kendi şemasında. İstek bağlamından
tenant çözülür (subdomain öncelikli, yoksa JWT claim `tenant`) ve Hibernate multi-tenancy (SCHEMA) kullanılır. **Admin/SaaS yöneticisi** çapraz-tenant yetkiye
sahiptir (mevcut ERP'deki ztodemo master + Sağlık Merkezi mantığının karşılığı — ancak çapraz erişim
sıkı denetlenir ve loglanır).

> Ajan: Flyway'i hem `admin` şeması hem de "tenant şema şablonu" için ayrı migration yollarıyla kur.
> Yeni tenant açılışında şema + Flyway göçü otomatik uygulanır.

**Çözümleme ve işletme kuralları**

- **Çakışma:** Subdomain ve JWT claim farklı tenant gösteriyorsa istek 403 ile reddedilir.
- **Giriş:** Tenant, subdomain'den veya tek domain kullanımında giriş formundaki firma kodundan çözülür.
  E-posta yalnız tenant içinde tekildir.
- **Asenkron işler:** `TenantContext` `@Async` işlere `TaskDecorator` ile aktarılır. Zamanlanmış işler aktif
  tenantları tek tek gezer ve her tenant için bağlamı kurup temizler.
- **Sağlama:** Tenant durumu `PROVISIONING → ACTIVE` şeklinde ilerler; migration hatasında `FAILED` olur.
  `ACTIVE` olmayan tenant istek alamaz. Uygulama açılışında aktif tenantların migration'ları da çalıştırılır;
  hata alan tenant loglanır ve diğerleri etkilenmez.
- **Veri yeri:** `Currency` ve `ExchangeRate` tüm tenantlar için ortaktır ve `admin` şemasındadır.

---

## 3. Kimlik, Rol, Yetki (RBAC)

- **Kimlik:** Kullanıcı (tenant'a bağlı) + SaaS yöneticisi (admin şeması). JWT (erişim kısa ömürlü +
  yenileme). Parola BCrypt; 2FA (TOTP) opsiyonel.
  İzinler JWT'ye gömülmez, her istekte sunucudan okunur; refresh token veritabanında tutulur, çıkışta
  erişim token'ı `jti` iptal listesine girer.
- **İzin modeli:** `Permission` (örn. `FINANCE_PAYMENT_CREATE`, `SHIPMENT_DISPATCH`, `FLEET_EDIT`),
  `Role` (izin kümesi), `User` ↔ `Role` (çoklu). Uçlar `@PreAuthorize` ile izin kontrollü.
- **Önerilen roller (lojistiğe uyarlanmış — ERP rollerinden türetildi):**
  `Patron/Yönetici`, `Finans (Süper)`, `Finans`, `Muhasebe`, `Operasyon/Sevkiyat (Dispatcher)`,
  `Satış/CRM`, `Filo Yöneticisi`, `Depo Sorumlusu`, `Gümrük/Dış Ticaret`, `Sürücü (mobil)`,
  `Taşeron Portal (opsiyonel)`.
- Her rolün açılış ekranı/menüsü izinlere göre. (ERP'deki rol-bazlı yönlendirme karşılığı.)

---

## 4. API Sözleşmesi Kuralları

- REST, kaynak-merkezli: `/api/v1/{modul}/{kaynak}`. Çoğul kaynak adı. Filtre query ile.
- Sayfalama: `?page=&size=&sort=`. Yanıt zarfı: `{ content, page, size, totalElements, totalPages }`.
- Standart hata: HTTP durum + gövde `{ code, message, details[], traceId }`.
- Tarih ISO-8601 (UTC); para `{ amount: "1234.56", currency: "TRY" }`.
- OpenAPI/Swagger otomatik üretilir; sözleşme testleriyle korunur.
- Yetki: Authorization: Bearer JWT; tenant JWT claim veya subdomain.

---

## 5. Ana Veri Modeli (çekirdek entity'ler — özet)

> Alanlar örnektir; her faz kendi entity'lerini detaylandırır. Tüm tablolarda ortak audit alanları
> (`createdBy, createdAt, updatedBy, updatedAt, deleted`) vardır. `status` yalnız iş durumu için kullanılır.

### 5.1 Ortak / Organizasyon
- **Tenant** (admin): id, ad, subdomain, abonelik/plan, durum, saat dilimi, para birimi varsayılanı.
- **Branch (Şube)** / **Location (Lokasyon)**: şube il/merkez, adres, tip (ofis/depo/antrepo/park).
- **Currency / ExchangeRate** (admin): para birimleri + TCMB kur (tarih bazlı). (ERP: TCMB kur çekme.)
- **User / Role / Permission**.

### 5.2 CRM
- **Account (Cari/Firma)**: müşteri | taşıyıcı(taşeron) | tedarikçi | personel/sürücü | banka tipi (tek tablo, tip
  alanı). Vergi no, adres, şube bağı. (ERP: `Customer`, `Supplier`, `CustomerAccount`.)
- **Contact (Kişi)**, **Lead/Opportunity (Aday/Fırsat)**, **Quote (Teklif)**, **Contract (Sözleşme)**,
  **Tariff (Tarife)** + **TariffLine** (rota/km/ton/araç tipi/yakıt ek bazlı fiyat).

### 5.3 Shipment (Operasyon çekirdeği)
- **Shipment/Order (Taşıma Emri)**: müşteri, yükleme/boşaltma noktaları, tarih, yük bilgisi, fiyat
  (tarife veya el ile), durum (teklif→planlandı→yüklendi→yolda→teslim edildi→faturalandı→kapandı; + iptal).
- **Leg (Bacak/Etap)**: çok duraklı/aktarmalı taşımada her etap; araç/sürücü/taşeron atanır.
- **Consignment/CargoItem (Yük kalemi)**: cins, miktar, ağırlık, hacim, palet/kap, ADR sınıfı.
- **CMR**: taşıma senedi (gönderici/alıcı/taşıyıcı, araç plaka, mal, teslim). (ERP: `CustomerCMR3/13`.)
- **Waybill/İrsaliye (e-İrsaliye)**, **POD (Teslim Kanıtı)**: imza/foto/zaman/konum.
- **TripCost/TripRevenue**: sefer gelir/gider satırları → finansa akar. (ERP: `ExpertReportTruckFinance/Expenses`
  deseninin lojistik karşılığı — "araç bazlı rapor + finans".)

### 5.4 Fleet & Driver
- **Vehicle (Araç/Çekici)**, **Trailer (Dorse)**: plaka, tip, kapasite, muayene/sigorta/K belgesi
  bitiş tarihleri, durum.
- **Maintenance / Inspection / Insurance / Tire / FuelLog**: bakım, muayene, sigorta poliçeleri,
  lastik, yakıt tüketimi kayıtları (gider olarak finansa bağlanabilir).
- **Driver (Sürücü)**: kişi, ehliyet sınıfı/bitiş, SRC/psikoteknik, ADR sertifikası, durum.
- **DriverAssignment**: sürücü ↔ araç ↔ sefer; çalışma süresi, harcırah.

### 5.5 Finance (Finans Çekirdeği — ERP'den en yoğun devralınan)
- **CurrentAccount (Cari Hesap)** + **AccountTransaction (Hareket)**: borç/alacak, çok döviz, şube
  kırılımı, bakiye. (ERP: `CustomerAccountsController`, `AccountTransaction`, `AccountDebts/Credits`.)
- **Bank / BankAccount / BankTransaction**: banka tanıt + hareket + bakiye + ekstre.
  (ERP: `BankAccounts`, `BankTransactions`, `BankIntroduction`, `BankStatement`.)
- **Cash / CashTransaction (Kasa)**: (ERP: `CashIntroduction`, `CashTransactions`.)
- **Check/PromissoryNote (Çek/Senet)**: durum ve izinli geçişler Faz 2 §2.4 tablosundadır,
  hareket geçmişi. (ERP: `Checks` + çek koçanı/3B + `UpdateCheckStatus`.)
- **Payment / Collection (Ödeme / Tahsilat)**: tedarikçi/taşeron ödemesi, müşteri navlun tahsilatı,
  çek eşleştirme, günlük rapor. (ERP: `CustomerAccountPayment`, `CustomerAccountCollection`.)
- **PaymentPlan + Approval (Ödeme Planlama + Onay)**: plan, onaya gönder, onayla, ertele, nakit akış
  ısı haritası, döviz yoğunluk eşikleri. (ERP: `CustomerAccounts` PaymentPlanning + heatmap + approval.)
- **ExpenseType / ExpenseItem**: gider tipleri (yakıt, HGS, harcırah, tamir, ceza…).
- **Invoice (Navlun Faturası)** + e-Fatura/e-Arşiv bağı (Faz 4; gönderim Faz 8).
- **PurchaseInvoice (Tedarikçi/Taşeron Faturası)**: gelen fatura kaydı; ödeme planına bağlanır (Faz 2).
- **Credit (Kredi/Finansman — opsiyonel faz):** sözleşme, kullandırım, taksit, faiz.
  (ERP: `AccountCredits`, `CreditContract/Drawdown/Installment`.)

### 5.6 Warehouse / Customs
- **Warehouse / Bin / StockItem / Handling (Elleçleme) / StorageContract (3PL)**.
- **CustomsDeclaration / TransitDoc (T1/T2) / ADRDoc**.

### 5.7 Billing / SaaS
- **Subscription / Plan / SaasInvoice / UsageMetric** (admin şeması): kiracı abonelik ve faturalama.
- **AuditLog / HealthMetric / OnlineUser / LiveSession**: SaaS operasyon konsolu (ERP Sağlık Merkezi
  + canlı izleme karşılığı).
- **AuditLog yeri:** Tenant içi olaylar tenant şemasına, SaaS yöneticisi ve çapraz-tenant erişimleri `admin` şemasına yazılır.

---

## 6. ERP → Yeni Platform Eşleme Tablosu (ajan için referans dizini)

| Yeni modül / yetenek | Mevcut ERP referansı (incele, port etme) |
|---|---|
| Cari hesap + hareket + bakiye + şube/döviz kırılımı | `CustomerAccountsController`, `CustomerCurrentAccountsController`, `AccountTransactionController`, `Models/ZT/CustomerAccount.cs`, `AccountDebts.cs`, `AccountCredits.cs` |
| Ödeme (tedarikçi/taşeron) + günlük rapor + çek eşleştirme | `CustomerAccountPaymentController`, `Views/CustomerAccountPayment/*` |
| Tahsilat (müşteri navlun) + günlük rapor | `CustomerAccountCollectionController`, `Views/CustomerAccountCollection/*` |
| Ödeme planlama + onay + ısı haritası + yoğunluk eşikleri | `CustomerAccountsController` (PaymentPlanning, GetPaymentHeatmapData, SendToApproval, ApprovePaymentPlanning, PaymentDensity) |
| Banka tanıt/hareket/bakiye/ekstre | `BankAccountsController`, `BankTransactionsController`, `BankIntroductionController`, `BankStatementController` |
| Kasa tanıt/hareket/bakiye/ekstre | `CashIntroductionController`, `CashTransactionsController` |
| Çek/Senet durum + hareket + koçan | `ChecksController` (UpdateCheckStatus, GetCheckMovements, CheckLeaf), `Views/Checks/*` |
| Krediler | `AccountCreditsController`, `Models/ZT/CreditContract.cs`, `CreditDrawdown.cs`, `CreditInstallment.cs` |
| Masraf/Gider tipleri | `ExpenseTypes.cs`, `ExpenseItems.cs`, `ProductionExpensesController` |
| Araç bazlı gelir/gider/finans (→ Sefer maliyeti) | `AccountingPurchasesController` (ExpertReportTruck, GetTruckFinance, UpdateTruckFinance, ExpertReportTruckExpenses), `Models/ZT/ExpertReportTruck*.cs` |
| CMR | `CustomerCMR3Controller`, `CustomerCMR13Controller`, `Models/ZT/CustomerCMR3.cs`, `CustomerCMR13.cs` |
| Şube/İş yeri + şube-gruplu çoklu seçim UX | `Models/ZT/BranchProvince.cs`, `WorkPlace.cs`, `WorkPlaceGroups` deseni |
| Çok kiracılık + admin + sağlık izleme + canlı kullanıcı | `GlobalVeriables` (tenant DB), `AdminSystemController`, `Services/Diagnostics/*`, ChatHub canlı izleme |
| TCMB kur + çok döviz + yoğunluk | `GetExchangeRates`/TCMB çekimi, `PaymentDensityCurrencies.cs` |
| Rol/yetki + rol-bazlı yönlendirme | `AccountController`, `LanguageController` rol switch'leri |

---

## 7. Geçiş / Veri Göçü Notu

İlk müşteri mevcut ERP'den geliyorsa, finans açılış bakiyeleri (cari, banka, kasa, çek) için bir
**import** aracı planlanmalı (CSV/doğrudan DB okuma). Bu, Faz 2 sonrası opsiyonel bir görev olarak
`03_YAPILACAKLAR_BACKLOG.md`'de yer alır.
