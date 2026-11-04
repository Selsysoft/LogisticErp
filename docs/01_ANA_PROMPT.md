# ANA PROMPT — Nakliye & Lojistik ERP/CRM SaaS Platformu

> Bu doküman, bir **AI kodlama ajanının** (Claude Code / Cursor vb.) sıfırdan geliştireceği
> çok kiracılı (multi-tenant) bir **Nakliye & Lojistik ERP/CRM SaaS** platformunun **tek yetkili
> referansıdır**. Ajan, her fazda ilgili `fazlar/FAZ_xx_*.md` dosyasını açar, buradaki kurallara
> uyar ve **kabul kriterlerini** sağlamadan fazı kapatmaz.
>
> **Teknoloji (kesin karar):** Backend **Spring Boot (Java 21) REST API**, Frontend **React (TypeScript)**,
> Veritabanı **PostgreSQL**. Mevcut `.NET Core 8 MVC` ERP (ZTO Fabrika — yaş meyve/sebze) **işlevsel
> ve iş-kuralı referansıdır**; kod kopyalanmaz, davranış/kurgu örnek alınır ve lojistiğe uyarlanır.

---

## 0. Bu promptu nasıl kullan (AI ajanı için talimatlar)

1. **Önce oku, sonra yaz.** Bir faza başlamadan: bu dosya + `02_MIMARI_ve_VERI_MODELI.md` +
   ilgili `FAZ_xx` dosyasını oku. Mevcut ERP'de karşılığı varsa (her fazda "ERP Referansı" bölümünde
   controller/tablo adı verilir) o davranışı incele, **birebir port etme**, lojistik bağlamına uyarla.
2. **Faz sırasına uy.** §7'deki sırayı izle. Bir faz, bağımlı olduğu fazlar bitmeden başlamaz
   (bağımlılıklar her faz dosyasında yazılı).
3. **Küçük, doğrulanabilir adımlar.** Her görev için: önce veri modeli + migration, sonra servis +
   iş kuralı, sonra REST uç + validasyon, sonra React ekran, en sonunda test. Her adımda testleri
   çalıştır.
4. **Kabul kriteri olmadan kapatma.** Her fazın sonundaki "Kabul Kriterleri" maddelerinin hepsi
   otomatik test + manuel kontrol ile sağlanmadan faz "tamamlandı" sayılmaz.
5. **Karar veremediğinde dur ve sor.** Belirsizlik, iş kuralı boşluğu veya çelişki varsa varsayım
   yapıp ilerleme; kısa bir soru sor. (Örn. KDV oranı, para birimi yuvarlama, onay eşikleri.)
6. **Her fazın sonunda** `fazlar/FAZ_xx` dosyasının başına kısa bir "Uygulama Notu" (ne yapıldı,
   sapmalar, açık konular) ekle ve `03_YAPILACAKLAR_BACKLOG.md`'de ilgili görevleri işaretle.

---

## 1. Vizyon ve Hedef

Yurt içi ağırlıklı, uluslararası taşımayı ve 3PL/depo-antrepo süreçlerini de kapsayan bir
**karayolu nakliye & lojistik firması** için uçtan uca bir **ERP + CRM SaaS** platformu kurmak.
Platform; teklif/sözleşmeden sevkiyat planlamaya, araç-sürücü yönetiminden navlun faturalama ve
tam teşekküllü **finans/muhasebe (cari, banka, kasa, çek/senet, ödeme planlama, çok döviz)**
modülüne kadar tüm operasyonu tek yerde toplar ve **her müşteri firmayı ayrı kiracı (tenant)**
olarak barındırır.

**Tasarım ilkeleri**

- **Operasyon → Finans otomatik akışı:** Navlun faturası kesildiğinde gelir, sefer kapandığında araç/sefer
  maliyetleri (yakıt, HGS/OGS, harcırah, taşeron) ve cari hareketler kendiliğinden oluşmalı; çift
  veri girişi olmamalı. (ERP'de "üretim → cari → ödeme planlama" zincirinin lojistik karşılığı.)
- **Çok kiracılı SaaS:** Kiracı izolasyonu, abonelik/lisans, rol/yetki, sağlık/izleme, canlı kullanıcı
  takibi — mevcut ERP'nin ZTO_ADMIN + Sağlık Merkezi mimarisinin modern karşılığı.
- **Çok para birimli ve çok iş yeri/şube:** Tüm finans ve operasyon şube/iş yeri ve döviz bazında
  çalışmalı (TCMB kuru entegrasyonu dahil).
- **Belge merkezli:** CMR, e-İrsaliye, e-Fatura, sigorta, gümrük/transit, ADR, POD — hepsi kayıt ve
  süreçlere bağlı belgeler olarak yönetilmeli.
- **API-first:** Her yetenek önce REST uç olarak; React yalnız tüketici. Üçüncü taraf
  entegrasyonları (GİB, HGS, GPS, banka) aynı API katmanından.

---

## 2. Mevcut ERP'den devralınan güçlü yönler (yeniden kullanılacak kurgular)

| Mevcut ERP yapısı | Yeni platformda karşılığı |
|---|---|
| Çok kiracılık: tenant-başına DB + ZTO_ADMIN admin DB | Çok kiracılık (strateji 02'de) + merkezi admin/abonelik DB |
| Rol tabanlı yönlendirme (Finans, Muhasebe (Alış), Patron…) | Rol/yetki (RBAC) + modül bazlı izin |
| Cari hesaplar (çok döviz, şube/iş yeri kırılımı, bakiye, hareket) | Cari hesap modülü (müşteri + taşıyıcı/tedarikçi + banka) |
| Ödeme / Tahsilat + günlük rapor + çek eşleştirme | Ödeme/Tahsilat + navlun tahsilatı + çek/senet |
| Ödeme Planlama + onay akışı + ısı haritası + yoğunluk eşikleri | Ödeme planlama + onay + nakit akış öngörüsü |
| Banka / Kasa tanıt + hareket + bakiye + ekstre | Banka/Kasa modülü (aynen) |
| Çek/Senet: durum (tahsil/ciro/ödendi/kasaya), 3B koçan | Çek/Senet modülü (aynen) |
| Krediler: sözleşme/kullandırım/taksit/faiz | Finansman/kredi modülü (opsiyonel faz) |
| Masraf/Gider tipleri + üretim masrafı | Sefer/araç gider yönetimi |
| ExpertReportTruck (araç bazlı rapor + finans + masraf + palet) | **Sefer/Araç maliyet-gelir çekirdeği** (lojistiğin kalbi) |
| CustomerCMR3 / CustomerCMR13 | **CMR modülü** (uluslararası taşıma belgesi) — genişletilir |
| İş Yeri / Şube (BranchProvince + WorkPlace), şube-gruplu çoklu seçim | Şube/lokasyon + depo yapısı |
| Sağlık ve Güvenlik Merkezi, canlı izleme, online kullanıcı | SaaS operasyon konsolu (admin) |
| TCMB kur çekme + çok döviz + yoğunluk eşikleri | Kur servisi + çok döviz |

> **Not:** Mevcut ERP'de bu yapıların davranışını incelemek için her faz dosyasındaki "ERP Referansı"
> bölümünde controller/servis/tablo adları verilir (örn. `CustomerAccountsController`,
> `CustomerAccountPaymentController`, `AccountingPurchasesController`, `Checks`, `BankTransactions`,
> `CashTransactions`, `CustomerCMR3`, `ExpertReportTruck*`). Bunlar **kaynak kod referansıdır**,
> yeni platforma Java/React olarak yeniden tasarlanır.

---

## 3. Modül Haritası (MVP + sonraki)

**MVP (ilk sürüm — kullanıcı önceliği):**

1. **Altyapı & Çok Kiracılık** (Faz 0) — zorunlu temel.
2. **Kimlik, Rol, Yetki** (Faz 1).
3. **Finans Çekirdeği** (Faz 2) — cari, banka, kasa, çek/senet, ödeme/tahsilat, ödeme planlama+onay,
   çok döviz, temel rapor.
4. **CRM + Fiyatlandırma/Teklif** (Faz 3) — müşteri/aday, teklif, sözleşme, tarife/fiyat motoru.
5. **Sevkiyat / Yük / Sefer + CMR + e-İrsaliye + Navlun Faturası** (Faz 4) — operasyonun kalbi + POD.
6. **Filo + Sürücü** (Faz 5) — araç/çekici/dorse, bakım/muayene/sigorta/lastik/yakıt; sürücü
   ehliyet/SRC/psikoteknik/atama/harcırah.

**Sonraki fazlar:**

7. **Depo / 3PL / Antrepo** (Faz 6).
8. **Uluslararası: Gümrük / Transit / ADR** (Faz 7).
9. **Entegrasyonlar** (Faz 8) — GİB e-Fatura/e-İrsaliye, HGS/OGS, yakıt kartı, GPS/telematik, banka.
10. **Raporlama / BI / Dashboard** (Faz 9) — sefer/araç/müşteri kârlılığı, KPI.
11. **Mobil Sürücü Uygulaması / POD** (Faz 10).
12. **SaaS Operasyon: Admin, Tenant, Abonelik/Faturalama, İzleme** (Faz 11).

---

## 4. Genel Teknik Kurallar (tüm fazlarda geçerli)

### 4.1 Backend (Spring Boot, Java 21)
- Katmanlı + modüler monolit: `domain` (entity, enum, değer nesnesi), `repository` (Spring Data JPA),
  `service` (iş kuralı, `@Transactional`), `web` (REST controller, DTO, validation), `integration`
  (3. taraf). Modül paketleri: `finance`, `crm`, `shipment`, `fleet`, `driver`, `warehouse`,
  `customs`, `billing`, `tenant`, `identity`, `reporting`, `integration`.
- **DTO zorunlu:** Entity asla doğrudan API'ye sızmaz. Giriş/çıkış DTO + MapStruct.
- **Validasyon:** `jakarta.validation` (Bean Validation) + servis seviyesinde iş-kuralı doğrulaması.
- **Para/miktar:** `BigDecimal` (asla double/float). Para birimi her tutarla birlikte taşınır
  (`Money {amount, currency}` değer nesnesi). Yuvarlama kuralı tek yerden (yapılandırılabilir).
- **Tarih/saat:** `Instant`/`OffsetDateTime` (UTC saklama) + tenant saat dilimi görünümde.
- **Hata yönetimi:** `@ControllerAdvice` ile standart hata gövdesi `{code, message, details, traceId}`.
- **Idempotent dış etki:** Ödeme, fatura, e-belge gönderimi gibi uçlarda idempotency-key.
- **Audit:** Her tabloda `createdBy, createdAt, updatedBy, updatedAt`; soft-delete yalnız `deleted` alanıyla yapılır; `status` yalnız iş durumu içindir.
  (ERP'deki CreatedBy/UpdatedBy ve "Status soft-silme" deseninin karşılığı.)
- **Migration:** **Flyway** (versiyonlu, idempotent). Çalışma zamanı DDL YOK.

### 4.2 Frontend (React + TypeScript)
- Vite + React + TypeScript; durum yönetimi (React Query/TanStack Query sunucu durumu için,
  hafif global için Zustand). Form: React Hook Form + Zod. UI: bir bileşen kütüphanesi
  (**MUI**). i18n: **Türkçe birincil**, altyapı çok dilli.
- Modüler sayfa yapısı; rol/izin bazlı menü ve route guard.
- Para, tarih, döviz biçimlendirme merkezi yardımcı; Türkçe yerelleştirme (binlik/ondalık).
- Çok para birimli ve şube-gruplu çoklu seçim gibi ERP'de olgunlaşmış UX kalıpları yeniden kullanılır.

### 4.3 Güvenlik & Çok Kiracılık (özet — detay Faz 0/1 ve 02'de)
- Kimlik: Platformun kendi girişi (BCrypt) + JWT (erişim+yenileme). Parola politikası, 2FA opsiyonel.
  Harici SSO (OIDC) MVP dışıdır; Faz 1'de açık soru olarak durur.
- **RBAC + modül izni:** Rol → izin matrisi; her uç izinle korunur. (Mevcut ERP rolleri:
  Finans(super/normal), Muhasebe (Alış), Patron, Lojistik, Satış, Mal Kabul… lojistiğe uyarlanır.)
- **Kiracı izolasyonu:** Her istek tenant bağlamı taşır; veri erişimi tenant ile filtrelenir
  (şema-başına-tenant; detay 02'de). Çapraz kiracı erişimi yalnız yetkili SaaS yönetici.
- KVKK/GDPR: kişisel veri (sürücü, müşteri kişi) işleme kaydı, saklama/silme politikası.

### 4.4 Non-functional
- Performans: liste uçlarında sayfalama + sunucu-taraflı filtre/sıralama; ağır raporlarda önbellek
  (ERP'de CustomerAccounts perf dersleri: tek sorgu tarama, sıkıştırma, indeks). 
- Gözlemlenebilirlik: yapılandırılmış log + metrik (Micrometer/Prometheus) + sağlık uçları.
- Test: birim (JUnit) + servis/entegrasyon (Testcontainers + PostgreSQL) + API sözleşme testi;
  kritik finans hesapları için **yüksek kapsama** ve örnek senaryo testleri zorunlu.
- CI: derleme + test + migration kontrolü; ana dala kırık kod girmez.

---

### 4.5 Finans kayıt kuralları (tüm fazlarda geçerli)
Yön her zaman **firmanın bakışıyla** yazılır. Bakiye = borç − alacak; pozitif bakiye "cari bize borçlu" demektir.

| Olay | Cari | Yön |
|---|---|---|
| Müşteriye navlun faturası | Müşteri | BORÇ |
| Müşteriden tahsilat | Müşteri | ALACAK |
| Tedarikçi/taşeron gideri veya faturası | Tedarikçi/taşeron | ALACAK |
| Tedarikçi/taşerona ödeme | Tedarikçi/taşeron | BORÇ |
| Sürücüye avans | Personel/sürücü | BORÇ |
| Sürücü harcırah hakedişi | Personel/sürücü | ALACAK |

- **Tek kayıt noktası:** Navlun geliri yalnız fatura kesilince, sefer giderleri yalnız sefer kapanınca yazılır.
  Her kayıt kaynak belge anahtarıyla (`sourceType + sourceId`) idempotenttir.
- **Düzeltme:** Kesilmiş fatura veya işlenmiş hareket değiştirilmez; ters hareket üretilir.
- **TL karşılığı:** İşlem tarihinde hesaplanır, kullanılan kur ile birlikte harekete yazılır ve sonradan değişmez.

---

## 5. Kabul Kriteri Yazım Kuralı (her fazda)

Her faz dosyasında kabul kriterleri **ölçülebilir** yazılır: "X uç çağrıldığında Y koşulunda Z döner",
"şu iş kuralı şu testle doğrulanır". Finansal fazlarda en az bir **uçtan uca senaryo testi**
(örn. "sefer oluştur → navlun geliri + yakıt gideri + cari hareket oluşur → ödeme planına düşer →
onaylanır → banka ödemesi ile kapanır → bakiye doğrular") bulunmak zorundadır.

---

## 6. Sözlük (ortak terimler)

Kiracı (tenant), Cari hesap (current account), Navlun (freight), Sefer/Sevkiyat (trip/shipment),
Yük (load/consignment), Çekici (tractor), Dorse/Römork (trailer), CMR (uluslararası karayolu taşıma
senedi), e-İrsaliye / e-Fatura (GİB), HGS/OGS (geçiş), POD (teslim kanıtı), ADR (tehlikeli madde),
Taşeron/Spot taşıyıcı (subcontractor/spot carrier), Tarife (tariff), 3PL (üçüncü parti lojistik),
Transit (T1/T2), Harcırah (per diem).

---

## 7. Yol Haritası Özeti

**Uygulama sırası:** 0 → 1 → 2 → 3 → 5A → 4 + 5B → 6 → 7 → 8 → 9 → 11 → 10.
MVP = Faz 0–5. Faz numaraları dosya adlarıyla uyum için korunur. Her faz bağımsız teslim
edilebilir dikey dilim (vertical slice) hedefler; yani kendi başına demo edilebilir değer üretir.
