# Analiz 03 — Mevcut Doküman Boşluk Analizi

> **LogisticErp notu (2026-11-13):** Bu dosya ZTO Fabrika reposunda, `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` için yazıldı ve buraya kopyalandı. O prompttaki K1 (.NET 8 MVC) ve K2 (kodu kopyala) kararları **geçersizdir**; geçerli yön `../00_README.md` ve `04_UYARLAMA_KARAR_MATRISI.md` §0. ZTO bulguları (tablolar, ekranlar, iş kuralları, satır referansları) geçerlidir; `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` kaynağına göredir.

> **Kapsam:** `NakliyeLojistik_SaaS_Promptlar/` altındaki 16 dosyanın, `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` Bölüm 2'deki **K1–K7** kararlarına ve Faz 0 finans envanterine göre incelenmesi.
> **Durum:** Faz 0 çıktısı. Bu dosya yalnızca tespit ve öneri içerir; düzeltmeler Faz 5'te uygulanır.
> **Satır numaraları** dosyaların Faz 0 anındaki hâline göredir.

## 0. Yapı kontrolü

Klasörün güncel içeriği, promptun Bölüm 3'ünde verilen yapıyla **birebir aynıdır** (4 kök dosya + 12 faz dosyası, toplam 1.057 satır). Eksik ya da fazla dosya yoktur.

İki konum notu:

| Konu | Promptta yazan | Gerçek durum |
|---|---|---|
| Doküman klasörünün yeri | "Repo kökündeki `NakliyeLojistik_SaaS_Promptlar/`" | Klasör git kökünde değil, **proje klasöründe**: `ZtoFabrika2026/ZtoFabrika/NakliyeLojistik_SaaS_Promptlar/`. Git kökü `ZtoFabrika2026/`. |
| `ZtoLogistic/` klasörünün yeri | Belirtilmemiş | `ZtoFabrika.csproj` varsayılan `Compile` glob'unu kullanıyor. `ZtoLogistic/` proje klasörünün içine açılırsa içindeki `.cs` dosyaları **ZTO Fabrika derlemesine dahil olur** ve kural 1 (kaynak salt okunur) ile K3 (bağımsız proje) ihlal edilir. **Kullanıcı kararı (Faz 0):** `ZtoLogistic/` ZTO Fabrika reposunun dışında, **ayrı bir klasör ve ayrı bir git reposu** olarak açılır. Tüm fazlar bitene kadar uzak depoya gönderilmez (push/paylaşım yok). |
| Gizli bilgiler (kural 4) | "Gizli bilgi kopyalanmaz, `__PLACEHOLDER__` yazılır" | **Kullanıcı kararı (Faz 0):** `appsettings.json` gerçek değerleriyle `ZtoLogistic/` altına **kopyalanır**. Kural 4 ve Faz 3 madde 6 bu dosya için geçersizdir. `.md` dokümanlarına ve SQL script'lerine gizli değer yazılmaması kuralı sürer. |

### Faz 0 sonunda verilen kullanıcı kararları (2026-11-12)

Bu dosyada "A1'e bağlı", "A2'ye bağlı" ve "A3'e bağlı" diye işaretlenen satırlar Faz 5'te aşağıdaki yanıtlara göre düzeltilir.

| # | Soru | Karar | Etkisi |
|---|---|---|---|
| A1 | Kiracı modeli | **Kiracı başına ayrı veritabanı + merkezi admin veritabanı** (ZTO Fabrika ile aynı model) | Kopyalanan kodun Session `userDatabase` üzerinden bağlantı deseni korunur; tablolara kiracı kolonu eklenmez. Şema-başına-tenant ve subdomain ifadeleri dokümanlardan çıkar. Yeni kiracı açma aracı ZTO Fabrika reposunda olmadığı için `YENI` iştir (FAZ_11). |
| A2 | `MaterialStockAll` kullanımı | **3PL müşteri malı stoğu (FAZ_06)** | `MaterialStockAll` sahiplik kavramı içermediği ve her hareketi faturaya bağladığı için 3PL stoğu büyük ölçüde yeni tasarlanır; yalnızca `ZT_Warehouse`, `ZT_WarehouseLocation`, `ZT_WarehouseLocationTransfer` ve lot satırı deseni yeniden kullanılır. FAZ_05'teki yakıt, yedek parça ve lastik sarf deposu bu kararın kapsamı dışında kalır (Faz 1 matrisinde ayrıca ele alınır). |
| A3 | Kimlik doğrulama | **Web'de cookie + Session (ZTO Fabrika modeli); sürücü mobil uygulaması ve dış API için ayrıca JWT; şifre özetleme eklenir** | FAZ_00/FAZ_01'deki JWT ifadeleri yalnızca mobil ve dış API kapsamına daralır. Düz metin şifre karşılaştırması kopyalanmaz. |
| — | Canlı şema dökümü | **Demo kiracıdan `pg_dump --schema-only` alınabilir** (yalnızca okuma) | Faz 2 önkoşulu; veritabanı adı kullanıcıdan alınacak. |
| — | `ZtoLogistic/` konumu | Ayrı klasör ve ayrı git reposu; tüm fazlar bitene kadar uzak depoya gönderilmez | Faz 3. |
| — | `appsettings.json` | Gerçek değerleriyle kopyalanır | Kural 4 bu dosya için geçersiz; `.md` ve `.sql` dosyalarına gizli değer yazılmaz. |

---

## 1. K1–K7 ile çelişen ifadeler

Karar kısaltmaları: **K1** yığın (.NET 8 MVC), **K2** finans kopyalanır, **K3** bağımsız `ZtoLogistic/` projesi, **K4** ayrı PostgreSQL veritabanı, **K5** canlı API entegrasyonu, **K6** REST kuralları yalnızca dış API için, **K7** tek masraf modeli.
**A1/A2/A3**, kullanıcının Faz 0 sonunda vereceği açık kararlardır; bunlara bağlı satırlar "A1'e bağlı" diye işaretlenmiştir.

### 1.1 `00_README.md`

| Satır | Mevcut ifade | Çelişki | Önerilen düzeltme |
|---|---|---|---|
| 3–6 | "…sıfırdan bir ERP + CRM SaaS platformuna dönüştürülmesi" | K2 | Finans çekirdeği ZTO Fabrika'dan kopyalanıp uyarlanır; yalnızca finans dışı modüller sıfırdan yazılır. |
| 8–9 | "Bu klasörde kod yoktur ve mevcut projede değişiklik yapılmamıştır." | K2, K3 | Bu klasörde hâlâ uygulama kodu yoktur (yalnızca doküman ve `sql/`); kod `ZtoLogistic/` altındadır. ZTO Fabrika kaynağı değiştirilmemiştir. |
| 12 | "Teknoloji: Spring Boot (Java) REST API + React (TypeScript) + PostgreSQL" | K1 | .NET 8 ASP.NET Core MVC + Razor + jQuery/AJAX + Bootstrap + DataTables + PostgreSQL/Npgsql. |
| 11–16 | "Kesinleşen kararlar" listesi | K2–K7 eksik | K1–K7'nin tamamı ve A1–A3 yanıtları listeye eklenir. |
| 19–38 | Klasör yapısı | Eksik | `04`–`07` dosyaları, `analiz/`, `sql/`, `FAZ_12` eklenir. |
| 44 | "Sırayla `fazlar/FAZ_00 → FAZ_11` uygula" | K5 | `FAZ_12` eklenir. |
| 46 | "MVP = **Faz 0–5**. Sonrası 6–11." | K5 | FAZ_12'nin yeri belirtilir. |
| 49–62 | Yol haritası tablosu | K5 | "12 — ZTO Fabrika Entegrasyonu" satırı eklenir. |
| 64–68 | Açık kararlar: "çok kiracılık erişim biçimi (subdomain/JWT)… GPS sağlayıcı seçimi" | K4, K5 | Subdomain/JWT sorusu A1 + A3 ile yeniden yazılır; GPS sağlayıcısı sorusu FAZ_12 (ZTO Fabrika araç takibi) ile ilişkilendirilir. |
| — | Değişiklik günlüğü yok | Kural 5 | "Değişiklik günlüğü" bölümü eklenir (tarih, dosya, karar referansı). |

### 1.2 `01_ANA_PROMPT.md`

| Satır | Mevcut ifade | Çelişki | Önerilen düzeltme |
|---|---|---|---|
| 3–4 | "…sıfırdan geliştireceği… platformunun tek yetkili referansı" | K2 | Finans çekirdeği kopyalanmış hazır gelir; referans zinciri 01 → 04/05/06'ya genişler. |
| 8–10 | "Backend Spring Boot (Java 21) REST API, Frontend React (TypeScript)… kod kopyalanmaz" | K1, K2 | .NET 8 MVC yığını; finans kopyalanır ve uyarlanır. |
| 17–18 | "birebir port etme, lojistik bağlamına uyarla" | K2 | Finans için "kopyalandı, uyarlandı" (bkz. 04); diğer modüller ZTO Fabrika desenleriyle sıfırdan. |
| 21–23 | "önce veri modeli + migration, sonra servis…, sonra REST uç + validasyon, sonra React ekran" | K1, K6 | SQL script → Warehouse → Service → Controller/Action (AJAX ucu) → Razor View + JS → test. |
| 53–54 | "API-first: Her yetenek önce REST uç olarak; React yalnız tüketici" | K1, K6 | Uygulama içi uçlar MVC/AJAX konvansiyonundadır; REST yalnızca dış entegrasyon API'sidir (FAZ_08, FAZ_12). |
| 60–75 | §2 tablosu "Yeni platformda karşılığı" | K2, K7 | "Durum" sütunu eklenir: *kopyalandı-uyarlandı* / *referans*. Satır 70 ("Masraf/Gider tipleri + üretim masrafı") tek masraf modeline bağlanır. Satır 69 ("Krediler… opsiyonel faz") kopyalama kapsamına alınır. |
| 62 | "Çok kiracılık (strateji 02'de) + merkezi admin/abonelik DB" | K4, A1'e bağlı | A1 yanıtına göre yazılır. |
| 77–81 | "kaynak kod referansıdır, yeni platforma Java/React olarak yeniden tasarlanır" | K1, K2 | Finans dosyaları kopyalanmıştır; liste 04'teki kataloğa bağlanır. |
| 87–105 | §3 Modül haritası (MVP 1–6, sonraki 7–12) | K5 | "ZTO Fabrika Entegrasyonu (Faz 12)" maddesi eklenir. |
| 111–125 | §4.1 Backend (Spring Data JPA, `@Transactional`, MapStruct, `jakarta.validation`, `BigDecimal`, `Instant`/`OffsetDateTime`, `@ControllerAdvice`, Flyway) | K1, K6 | .NET karşılıkları: Controller → Service → Warehouse, `decimal`, ZTO Fabrika'nın validasyon ve hata yönetimi deseni, ZTO Fabrika'nın migration yöntemi. Satır 121 (standart hata gövdesi) ve 122 (idempotency-key) yalnızca dış API için geçerli olur (K6). |
| 127–133 | §4.2 Frontend (Vite, React Query, Zustand, React Hook Form, Zod, MUI/shadcn) | K1 | Razor View + partial + modal, jQuery/AJAX, Bootstrap, DataTables, select2; ZTO Fabrika'nın ortak JS yardımcıları. |
| 136 | "Kimlik: OAuth2/OIDC + JWT (erişim+yenileme)" | K1, A3'e bağlı | ZTO Fabrika'nın kimlik doğrulama mekanizması (cookie + session); JWT yalnızca A3 yanıtı gerektirirse mobil için eklenir. |
| 139–140 | "strateji 02'de: şema-başına-tenant önerilir" | K4, A1'e bağlı | A1 yanıtına göre yazılır. |
| 146–148 | "Micrometer/Prometheus… JUnit… Testcontainers" | K1 | ZTO Fabrika'nın teşhis/izleme ve test yaklaşımının .NET karşılıkları. |
| 174 | "MVP = Faz 0–5. Sonra 6–11." | K5 | FAZ_12 eklenir. |

### 1.3 `02_MIMARI_ve_VERI_MODELI.md`

| Satır | Mevcut ifade | Çelişki | Önerilen düzeltme |
|---|---|---|---|
| 10–17 | Mimari diyagram "[React SPA] → [Spring Boot REST API]" | K1, K3, K5 | "[Razor + jQuery] → [ASP.NET Core MVC: Controller → Service → Warehouse] → [PostgreSQL (ZTO LOGISTIC)]" ve yanına "⇄ ZTO Fabrika (dış API)" kutusu. |
| 21–22 | "Spring `@Async`/scheduler… RabbitMQ/Kafka" | K1 | `BackgroundService`/`IHostedService` (ZTO Fabrika'daki desen) + outbox tablosu (FAZ_12). |
| 24–40 | Backend paket yapısı `com.firma.lojistik.*` | K1, K3 | `ZtoLogistic.*` namespace/klasör yapısı (ZTO Fabrika proje bölünmesini taklit eder). |
| 44–62 | §2 Çok kiracılık: "Karar: şema-başına-tenant… JWT claim `tenant`… Hibernate multi-tenancy… Flyway" | K1, K4, A1'e bağlı | A1 yanıtına göre yeniden yazılır; ZTO Fabrika'nın mevcut mekanizması 04'te referanslanır. |
| 68–71 | "JWT… BCrypt… `@PreAuthorize`" | K1, A3'e bağlı | ZTO Fabrika'nın rol/yetki mekanizmasının karşılığı. Rol listesi (satır 72–75) korunur. |
| 82–87 | §4 API sözleşmesi tüm uygulama için | K6 | Başlık "Dış Entegrasyon API'si Sözleşme Kuralları" olur; uygulama içi AJAX uçları için ZTO Fabrika konvansiyonu ayrı alt başlıkta yazılır. |
| 97 | "**Tenant** (admin): id, ad, subdomain, abonelik/plan…" | K4, A1'e bağlı | `subdomain` alanı ve "admin" konumu A1 yanıtına göre yazılır. |
| 103–104 | "Account: müşteri \| taşıyıcı \| tedarikçi \| banka tipi (tek tablo, tip alanı)" | — (Faz 1 kararı) | ERP'nin gerçek cari yapısıyla karşılaştırma Faz 1 matrisinde yapılır; sonuç buraya işlenir. |
| 115–116 | "TripCost/TripRevenue: sefer gelir/gider satırları" | K7 | Gider tarafı tek masraf modelinin (`ExpenseItem` + bağlam referansı) görünümüdür; ayrı gider tablosu açılmaz. |
| 121–122 | "Maintenance / … / FuelLog… gider olarak finansa bağlanabilir" | K7 | Operasyonel kayıt ayrı kalır, gider satırı tek masraf modeline yazılır. |
| 126–141 | §5.5 Finance | K2 | 04 (finans altyapı referansı) ve 05'e (veritabanı şeması) referans verilir. |
| 138 | "ExpenseType / ExpenseItem" | K7 | Tek masraf modelinin tanımı burada yapılır; bağlam alanı (araç, sefer, sürücü, genel) belirtilir. |
| 140–141 | "Credit (Kredi/Finansman — opsiyonel faz)" | K2 | Kredi sayfaları (CreditContracts, AccountCredits) kopyalama kapsamındadır; "opsiyonel" ifadesi kalkar. |
| 148 | "(admin şeması)" | K4, A1'e bağlı | A1 yanıtına göre. |
| 156 | Eşleme tablosu başlığı "(incele, port etme)" | K2 | "Durum" sütunu eklenir: *kopyalandı* / *referans*. |
| 156–172 | Eşleme tablosunda ZTO Fabrika entegrasyonu satırı yok | K5 | Tablonun sonuna "ZTO Fabrika ↔ ZTO LOGISTIC entegrasyonu" satırı eklenir (06 ve FAZ_12'ye referans). |

### 1.4 `03_YAPILACAKLAR_BACKLOG.md`

| Satır | Mevcut ifade | Çelişki | Önerilen düzeltme |
|---|---|---|---|
| 8–14 | EPİK A (A1 "Monorepo + Spring Boot + React", A2 "Flyway", A3 "Şema-başına-tenant (subdomain/JWT) + TenantContext", A4 "Yeni tenant sağlama servisi (şema + migration)", A5 "`common`: Money…", A6 "Actuator… Testcontainers") | K1, K3, K4 | EPİK A baştan yazılır: bağımsız `ZtoLogistic/` projesi, ZTO Fabrika'nın migration yöntemi, A1'e göre kiracı çözümleme, ortak yardımcılar. |
| 18–20 | B2 "JWT erişim+refresh", B3 "`@PreAuthorize`", B4 "React route guard" | K1, A3'e bağlı | ZTO Fabrika auth mekanizmasına göre yeniden yazılır. |
| 24–36 | EPİK C tamamı ⬜ | K2 | Bu promptla kopyalanan görevler 🟦/✅ işaretlenir. Eksik görevler eklenir (bkz. §2). |
| 33 | C9 "ExpenseType/ExpenseItem" | K7 | "Tek masraf modeli (araç/sefer/sürücü/genel bağlamı)" olarak genişler. |
| 53, 59–60, 62, 81, 96 | E7, F2, F3, F5, I3 (yakıt kartı), K4 (mobil masraf/harcırah) gider akışları | K7 | Tek masraf modeline referans verir. |
| 79 | I1 "GİB e-Fatura/e-Arşiv/e-İrsaliye (entegratör adaptörü + mock)" | — (eksik bağlam) | ERP'deki Uyumsoft entegrasyonu referans alınır (bkz. §4 #9). |
| 82 | I4 "GPS/telematik canlı konum + geofence" | K5 | FAZ_12 konum aktarımıyla ilişkilendirilir. |
| 93 | K1 "Sürücü PWA + sınırlı giriş" | A3'e bağlı | A3 yanıtına göre. |
| — | EPİK M yok | K5 | "EPİK M — ZTO Fabrika Entegrasyonu (Faz 12)" eklenir. |

### 1.5 `fazlar/FAZ_00_Altyapi_ve_CokKiracilik.md` — tamamı yeniden yazılacak

| Satır | Mevcut ifade | Çelişki |
|---|---|---|
| 3–5 | "Spring Boot + React + PostgreSQL… şema-başına-tenant, Flyway" | K1, K4 |
| 13–14 | "Monorepo (`/backend` Spring Boot Gradle/Maven, `/frontend` Vite+React+TS)… Checkstyle/Spotless, ESLint/Prettier" | K1, K3 |
| 15–16 | "`admin` şeması + tenant şema şablonu. Flyway iki yollu" | K1, K4, A1'e bağlı |
| 17–19 | "subdomain veya JWT `tenant` claim → Hibernate multi-tenancy (SCHEMA)… `TenantContext` (ThreadLocal)" | K1, K4, A1/A3'e bağlı |
| 20–22 | "`Money` (BigDecimal)… `@ControllerAdvice`… `traceId` (MDC)" | K1, K6 |
| 24–28 | "Testcontainers… Actuator… Micrometer… React Query" | K1 |
| 32–39 | Kabul kriterleri: "tenant şeması", "`Money`… (BigDecimal)", "`{code,message,details,traceId}`", "Testcontainers", "Actuator `/health`", "React iskelet build olur" | K1, K4, K6 |
| 41–44 | "şema-başına-tenant + JWT karşılığı kurulur" | K4, A1/A3'e bağlı |

Kabul kriterleri yeniden yazılırken ölçülebilir kalmalıdır (örn. "`dotnet build` 0 hata", "iki kiracı izolasyon testi", "`decimal` ile 0,1 + 0,2 = 0,3").

### 1.6 `fazlar/FAZ_01_Kimlik_Rol_Yetki.md` — yeniden yazılacak

| Satır | Mevcut ifade | Çelişki |
|---|---|---|
| 3–4, 6 | "kimlik doğrulama (JWT/OIDC)… React auth akışı" | K1, A3'e bağlı |
| 12–13 | "parola (BCrypt)… SaaS yöneticisi (admin şeması)" | K1, A1'e bağlı |
| 14 | "JWT erişim (kısa) + yenileme (refresh) token" | A3'e bağlı |
| 15–16 | "Uçlarda `@PreAuthorize`" | K1 |
| 19 | "React route guard" | K1 |
| 25 | Kabul kriteri: "İzni olmayan kullanıcı korumalı uca 403 alır; izni olan 200." | K1, K6 — ERP yetkisiz sayfa isteğini `/Auth/Permission`'a yönlendirir, yalnızca AJAX isteğine 403 döner. Kriter iki durum için ayrı yazılır. |
| 26 | Kabul kriteri: "JWT süresi dolunca refresh ile yenilenir" | A3'e bağlı |
| 35 | "JWT + `@PreAuthorize` karşılığı" | K1 |

### 1.7 `fazlar/FAZ_02_Finans_Cekirdek.md` — yeniden yazılacak

| Satır | Mevcut ifade | Çelişki | Not |
|---|---|---|---|
| 1 | "ERP'den en yoğun devralınan modül" | K2 | "ERP'den kopyalanan ve uyarlanan modül" olur. |
| 13–14 | "Tüm tutarlar `Money`" | K1 | C# `decimal` + ayrı döviz alanı (ZTO Fabrika deseni). |
| 17 | "`Account` (müşteri/taşeron/tedarikçi/banka tipi)" | — | Faz 1'de ERP cari yapısıyla karşılaştırılacak. |
| 29 | "çek koçanı görünümü (ERP 3B koçan deseni UI'da opsiyonel)" | K2 | Kopyalama kapsamında (Bölüm 4.2); "opsiyonel" kalkar. |
| 43–45 | §2.7 Masraf/Gider tipleri | K7 | Tek masraf modelinin ana tanımı burada olur. |
| 56–66 | Kabul kriterleri | — | **Düzeltme:** Promptun 0.3 maddesi burada "Java terimleri" olduğunu varsayıyor; kabul kriterlerinde Java'ya özgü terim **yoktur**. Tek yığın bağımlı ifade satır 14'teki `Money`'dir. Kriterler korunur; "tek testte doğrulanır" ifadesinin test aracı .NET'e göre belirtilir. |
| 68–73 | ERP Referansı | K2 | "Kopyalandı" işaretiyle 04'e bağlanır. |

### 1.8 Diğer faz dosyaları

| Dosya | Satır | Mevcut ifade | Çelişki | Önerilen düzeltme |
|---|---|---|---|---|
| FAZ_03 | 39–41 | ERP Referansı "CRM tohumu" | K2 (dolaylı) | Cari kökü kopyalanan finans carisidir; CRM onu genişletir. |
| FAZ_04 | 26–29 | §7 Sefer Maliyet/Gelir — giderler ayrı tanımlı | K7 | Tek masraf modeline (sefer bağlamı) referans. |
| FAZ_04 | 45–46 | Kabul kriteri: "yakıt+HGS+taşeron giderleri ilgili carilere borç + ödeme planına düşer" | K7 | Giderlerin tek masraf modeli üzerinden düştüğü belirtilir. |
| FAZ_04 | 14–16 | Taşıma emri kaynağı: tarife/teklif/el ile | K5 | Yeni kaynak: ZTO Fabrika'dan API ile gelen sevkiyat talebi (FAZ_12). |
| FAZ_04 | 49–52 | ERP Referansı | K5 | Faz 0 envanterindeki referans-yalnız parçalarına bağlanır. |
| FAZ_05 | 13–14, 21–22 | `Vehicle`, `Trailer`, `Driver` | K5 (mükerrer) | ZTO Fabrika araç/şoför kütüğüyle (`TransportTruck`, `TransportChauffeur`) eşleme alanları (FAZ_12). |
| FAZ_05 | 17–20, 24 | Bakım, lastik, yakıt, harcırah giderleri ayrı ayrı | K7 | Tek masraf modeline (araç/sürücü bağlamı) referans. |
| FAZ_05 | 41–42 | "Bakım/gider deseni için `ProductionExpenses`/`ExpenseTypes`" | K7 | Tek masraf modeli. |
| FAZ_06 | 13, 27–28 | `StockItem`… "`MaterialStockAll*`… 3PL müşteri stoğu mantığına uyarlanır" | A2'ye bağlı | A2 yanıtına göre. |
| FAZ_07 | 15–16 | "geçiş kaydı → gidere" | K7 | Tek masraf modeli. |
| FAZ_08 | 3–4 | "`integration` modülü" | K1 | .NET adaptör yapısı. |
| FAZ_08 | 13–15 | HGS/OGS, yakıt kartı → gider | K7 | Tek masraf modeli. |
| FAZ_08 | 16–17 | GPS/Telematik | K5 (mükerrer) | ZTO Fabrika araç takibi ve FAZ_12 konum aktarımıyla hizalanır. |
| FAZ_08 | 31–32 | "ERP'de dış entegrasyon sınırlı; TCMB kur çekme ve HKS/QR gibi örnekler var" | Güncel değil | Bkz. §2 #19 ve §4 #9 (Uyumsoft, HKS kuyruk deseni, ZTO Hal). |
| FAZ_10 | 12, 16 | Sürücü girişi; konum | A3'e bağlı, K5 | A3 yanıtı; konum FAZ_12 ile aynı kanaldan. |
| FAZ_10 | 15, 23 | Mobil masraf girişi; "Masraf girişi finansa taslak olarak düşer" | K7 | Tek masraf modeline taslak kayıt. |
| FAZ_11 | 12, 26, 35–36 | "şema sağlama… şema+migration otomatik… şema-başına-tenant" (satır 35'te doğrudan geçer) | K4, A1'e bağlı | A1 yanıtına göre. |
| FAZ_09 | — | Yığın bağımsız | — | Değişiklik gerekmez; yalnızca 04'e referans eklenir. |

**Yasaklı terim sayımı (Faz 6 kontrolünün başlangıç değeri):**

- Yığına bağlı terimler (`Spring Boot`, `Java`, `React`, `TypeScript`, `JPA`, `Hibernate`, `Flyway`, `MapStruct`, `@PreAuthorize`, `@ControllerAdvice`, `@Transactional`, `@Async`, `BigDecimal`, `Instant`, `OffsetDateTime`, `JUnit`, `Testcontainers`, `Actuator`, `Micrometer`, `Prometheus`, `JWT`, `OIDC`, `Vite`, `Zod`, `Zustand`, `MUI`, `shadcn`, `Checkstyle`, `ESLint`, `Gradle`, `Maven`, `RabbitMQ`, `Kafka`) yalnızca **00, 01, 02, 03, FAZ_00 ve FAZ_01**'de geçer.
- **FAZ_02**'de bu terimlerin hiçbiri yoktur; yığına bağlı tek ifade satır 14'teki `Money`'dir (bkz. §1.7).
- `subdomain` / `şema-başına-tenant`: 00, 01, 02, FAZ_00 ve **FAZ_11:35** (doğrudan).
- FAZ_08'de yalnızca `integration` modülü ifadesi; FAZ_03–FAZ_07, FAZ_09 ve FAZ_10'da yığın terimi yoktur.

---

## 2. Finans envanterinde olup dokümanlarda olmayanlar

Kaynak: `analiz/01_FINANS_ENVANTER.md` ve `analiz/envanter/*`. "Hedef" sütunu, Faz 5'te tanımın yazılacağı yeri gösterir.

| # | ERP'de var olan | Dokümanlardaki durum | Hedef |
|---|---|---|---|
| 1 | **Vadeli mevduat** (`/TimeDeposits/Index`; `ZT_TimeDeposits`, `ZT_InterestCollections`) | Hiç geçmiyor | FAZ_02 yeni alt bölüm, EPİK C yeni görev |
| 2 | **Finansal bilanço** (`/FinancialBalanceSheet/Index`) | Hiç geçmiyor | FAZ_02 §2.8 Raporlar. Stok değerlemesi ve iş yerleri arası ticari borç hesabı tümüyle stok ve üretim tablolarına dayanır (finans dışı bağımlılığı "yüksek" olan sayfalardan biri); uyarlama kapsamı Faz 1'de belirlenir. |
| 3 | **Senet ayrı sayfa** (`/Bills/Bills`, `BillsController`) | "Çek/Senet" tek başlıkta; ayrı ekran ve controller referansı yok | FAZ_02 §2.4, 02 §6 |
| 4 | **Çek koçanı tanımı** (`CheckBooksController`) | Yalnızca "koçan görünümü" olarak geçiyor | FAZ_02 §2.4 |
| 5 | **Transfer merkezi** (`/BankStatement/Index`): virman, EFT, havale, döviz bozum, banka↔kasa, kasa↔kasa (`ZT_BankTransfers`, `ZT_ExchangeBreakSource`) | "Ekstre" olarak geçiyor; ekranın asıl işlevi dokümanlarda yok | FAZ_02 §2.3 |
| 6 | **Ödeme onay sayfası ve talimat akışı** (`/PaymentApproval/Index`; `ZT_CustomerAccountPaymentPlans`, `ZT_BankPaymentInstructions*`). Onay durumu (`ApprovalStatus`) ve ödeme durumu (`PaymentStatus`) iki ayrı alandır: plan onaya gönderilir, onaylanır ya da reddedilir; onaylanan plan için banka talimatı verilir ve ödeme tamamlanır (değer listeleri: [envanter/A_cari.md](envanter/A_cari.md)). Kaynak türleri: Manuel, Çek, Kredi, Maaş, Talimatlı Plan. | Onay yalnızca `CustomerAccounts` içi akış olarak anlatılıyor; ayrı sayfa, talimat adımı ve kaynak türleri yok | FAZ_02 §2.6 |
| 7 | **Eski ödeme yönetimi** (`PaymentManagementController`; `ZT_PaymentPlans`, `ZT_PaymentApprovals`) — menüde yok ama `GetCustomerDebtSummary` ucu çek, senet, banka ve kasa sayfalarından çağrılıyor | Hiç geçmiyor | Faz 1 kararı (kopyala / yalnızca kullanılan ucu taşı) |
| 8 | **Kredi sözleşmeleri sayfası** (`/CreditContracts/Index`): sözleşme, kullandırım, taksit, PMT, ACT/365 faiz, BSMV | Yalnızca model adları ve "opsiyonel faz" | FAZ_02 yeni alt bölüm |
| 9 | **Cari alacak kayıtları sayfası** (`/AccountCredits/Index`; `ZT_AccountCredits`) | "Krediler" sanılarak yanlış eşlenmiş (bkz. §3) | 02 §6 düzeltme |
| 10 | **Cari devir ve aktarma** (`ZT_AccountRollover`, `ZT_AccountTransferHistory`) | Hiç geçmiyor | FAZ_02 §2.2 |
| 11 | **Fatura ayrıntı tabloları** (`ZT_AccountDebtsInvoice`, `ZT_AccountCreditsInvoice`) — borç tarafı müstahsil makbuzu kesintilerini taşıyor | Hiç geçmiyor | Faz 1: navlun faturası (`YENI`) ile ilişkisi |
| 12 | **Masraf kalemi ve iş yeri birer cari hesaptır** (`Masraf Hesabı` / `MSR-{ID}`, `İş Yeri Firması` / `ISY-{ID}`); iş yerleri arası borç hesabı var | Hiç geçmiyor | 02 §5.5, FAZ_02 §2.2 ve §2.7 |
| 13 | **Sevk aracı masrafları** (`/SalesTruckExpenses/Index`) ve **üretim masrafları** (`/ProductionExpenses/IndexExpenses`) ekranları | Yalnızca `ProductionExpensesController` adı geçiyor | FAZ_02 §2.7 (K7) |
| 14 | **Malzeme stoğu** (`/MaterialStockAll/Index`): kart, alış faturası, lot/FIFO, kritik stok, kayıp | Yalnızca FAZ_06 ERP Referansı'nda ad olarak | A2 yanıtına göre FAZ_05 veya FAZ_06 |
| 15 | **Sipariş bazlı tahsilat tahsisi** (`ZT_AccountCollectionOrders`) ve **tedarikçi ödeme payları** (`ZT_CustomerAccountSupplierPaymentsShares`) | Hiç geçmiyor | Faz 1: sefer/navlun faturası bazlı tahsise dönüştürme adayı |
| 16 | **Finans kullanıcısı süper/normal ayrımı** (`ZT_FinancePerson.SuperStatus`), Patron süper durumu, iki adımlı doğrulama (TOTP), işletim sistemi giriş kısıtı | Rol listesinde "Finans (Süper)" var; mekanizma yok | FAZ_01 |
| 17 | **Tanım kayıt geçmişi tetikleyicisi** (`trg_IntroductionAudit`, `fn_IntroductionAudit`) ve işlem logu (`Methods.LogAdd`) | "AuditLog" genel ifadesi | FAZ_00, 05 |
| 18 | **Dört dil** (tr, en, fr, ar); view başına `.resx`; anahtar Türkçe metnin kendisi | "TR birincil, EN altyapısı" | FAZ_00, 03 X3 |
| 19 | **Mevcut e-dönüşüm entegrasyonu** (Uyumsoft e-Fatura, e-Arşiv, e-İrsaliye) ve **kuyruk + worker + yeniden deneme deseni** (HKS) | FAZ_08 "ERP'de dış entegrasyon sınırlı" diyor | FAZ_08, FAZ_12 |
| 20 | **Finans raporu servisi** (`Services/FinanceReport/*`, 7 rapor türü) — finansta katmanlı tek yapı | FAZ_09'da yalnızca controller adı | FAZ_02 §2.8, FAZ_09 |
| 21 | **Cari raporları** (`CustomerAccountReportController`): açık bakiye **yaşlandırma** (`GetAgingReport`, `CustomerAccountReportController.cs:63`) dahil cari rapor ekranı. Promptun Bölüm 4.2'sine göre kopyalama kapsamında. Sınıfta yetki özniteliği yok; sayfaya menüden bağlantı bulunamadı. | FAZ_02:48 ve 03:34 "yaşlandırma" istiyor ama ERP karşılığı gösterilmemiş; FAZ_09'da yalnızca controller adı | FAZ_02 §2.8 (`UYARLA`) |

---

## 3. Dokümanlarda olup ERP'de karşılığı bulunamayanlar

Dokümanlar bu başlıkları "ERP'de var, oradan uyarla" diye anlatıyor; kodda karşılığı ya yok ya da anlatılandan farklı.

| # | Dokümandaki ifade | Yer | Kodda bulunan | Sonuç |
|---|---|---|---|---|
| 1 | "CMR modülü… ERP CMR3/13 genişletilir" | 01:72, 02:113, 02:168, FAZ_04:21–22, FAZ_07:26 | `ZT_CustomerCMR3/13` yalnızca müşteriye bağlı **adres kütüğü**. CMR formu basan ya da PDF üreten kod yok. | CMR modülü `YENI`; ERP referansı "adres alanı" düzeyine indirilir. |
| 2 | "`ChecksController` (UpdateCheckStatus, GetCheckMovements, CheckLeaf)… 3B koçan" | 02:164, FAZ_02:29; prompt Bölüm 4.2 | `CheckLeaf` adında action **yok** (yalnızca `CheckLeafLookup`). Koçan görünümü view içinde CSS 3D + satır içi JavaScript; 3B kütüphanesi yok. | Referans "`Checks.cshtml` koçan görünümü" olarak düzeltilir. |
| 3 | "Çek durum geçişleri yalnız izinli yönlerde" | FAZ_02:52, FAZ_02:60 | `UpdateCheckStatus` her hedef durumu kabul ediyor; geçiş matrisi yok; `ZT_CheckMovements`'a yazmıyor. Aynı durum iki farklı metinle yazılıyor (`Bankada` / `Bankaya Yatırıldı`). | Durum makinesi kopyayla gelmez; uyarlamada eklenmesi gereken iş (`UYARLA`). |
| 4 | "Krediler: `AccountCreditsController`" | 02:165, 02:141 | `AccountCredits` müşteri **cari alacak** kayıtlarıdır. Banka kredisi `CreditContractsController`'dadır. | Eşleme tablosu düzeltilir. |
| 5 | "Banka… ekstre" / "`BankStatementController`" | 01:67, 02:129–130, 02:162, FAZ_02:23 | `BankStatement` transfer merkezidir. Ekstre içe aktarma ve mutabakat yok. | Ekstre içe aktarma FAZ_08 §5'te `YENI` kalır; `BankStatement` tanımı düzeltilir. |
| 6 | "`ExpertReportTruck`… sefer/araç maliyet-gelir çekirdeği (lojistiğin kalbi)" | 01:71, 02:115–116, 02:167, FAZ_04:28–29, FAZ_04:49–50 | `ExpertReportTruck` **alım tarafıdır** (bahçeden gelen hasat aracı). `AccountingPurchasesController`'da `ExpertReportTruckExpenses` adında action yok; ekran ayrı controller'da. Satış sevkiyatının navlunu `ZT_SalesTruck` kolonlarındadır. | Sefer maliyeti için asıl referans `ZT_SalesTruck` + `ZT_RecipeShipment` navlun alanlarıdır; `ExpertReportTruck` ikincil örnek olur. |
| 7 | "Araç/tedarikçi/şoför kütükleri: `SupplierTruckController`, `SupplierChauffeurController`" | FAZ_05:40, FAZ_03:39; prompt Bölüm 4.2 | Bunlar tedarikçi mal kabul araçlarıdır. Nakliye firması, aracı ve şoförü `TransportCompany` / `TransportTruck` / `TransportChauffeur` tablolarındadır. | Entegrasyon ve FAZ_05 referansı `Transport*` ailesine çevrilir. |
| 8 | "GPS/telematik"; "ZTO Fabrika'nın mevcut araç takip sistemi" | FAZ_08:16; prompt Bölüm 4.2 ve Faz 4 madde 4 | Konum saklayan tablo, konum toplayan servis ve geofence **yok**. Tek kaynak sevkiyata takılan Frigga veri kaydedicisi; veri anlık çekilir, saklanmaz. | "Mevcut sistemle eşleşme" yerine konum altyapısı ZTO LOGISTIC'te `YENI` tasarlanır; A4'te ele alınır. |
| 9 | "TCMB kur: ERP `GetExchangeRates` tek-uçuş + negatif önbellek deseni" | 02:171, FAZ_02:13–14, FAZ_02:73 | Desen servis sınıfında değil, tek bir action'a gömülü (`CustomerAccountsController`). `TCMBExchangeRateService` hata durumunda sessizce sabit kurlara dönüyor. Kur çekmenin 8 ayrı kopyası var. | Kopyalarken tek servise toplanır (`UYARLA`). |
| 10 | "Controller → Service → Warehouse" katmanları | Prompt K1; 01 §4.1 karşılığı | Finans sayfalarında Service ve Warehouse **yok**; SQL controller action'larının içinde. Tek istisna `Services/FinanceReport/`. | Faz 1'de karar gerekir: aynen kopyala mı, katmanlara ayır mı (bkz. Faz 0 raporu, soru S1). |
| 11 | "Audit: her tabloda `createdBy, createdAt, updatedBy, updatedAt`; soft-delete" | 01:123–124, 02:93–94 | Her tabloda yalnızca `CreationDate` ortak. `CreatedBy/UpdatedDate/UpdatedBy` yeni tablolarda ve kayıt geçmişi tetikleyicisi bağlı tanım tablolarında var; işlem tablolarının çoğunda yok. Borç, alacak, ödeme ve tahsilat **fiziksel** siliniyor; banka/kasa hareketi genelde `Status=false`, ancak banka/kasa tarafında da zincirleme fiziksel silme yapan uçlar var. | Faz 2 DDL'inde audit kolonları tamamlanır; silme davranışı Faz 1 kararı. |
| 12 | "Rol → izin matrisi; her uç izinle korunur" | 01:137, 02:70–71 | İzin tablosu yok; yetki tek rol metniyle (`[UserRoleAuthorize]`). Buna ek olarak ekran bazlı kısıt tabloları (`Restriction`, `UserRestriction`) var. Üç finans controller'ında **sınıf düzeyinde** yetki özniteliği yok. | FAZ_01'de izin matrisi `YENI`; `Restriction` deseni değerlendirilir; kopyalanan kodda rol özniteliği kalır. |
| 13 | "Parola BCrypt" | 02:69, FAZ_01:12 | Şifreler düz metin karşılaştırılıyor. | A3 ile birlikte karar: kimlik katmanı kopyalanırken şifre özetleme eklenir mi. |
| 14 | "Yeni tenant açılışında şema + migration otomatik" | 02:61–62, FAZ_00:34, FAZ_11:26 | Kiracı açan kod bu repoda yok (ayrı yönetim panelinde olduğu anlaşılıyor). Migration script'leri elle uygulanıyor. | A1 yanıtına göre `YENI`. |
| 15 | "Migration: versiyonlu… Çalışma zamanı DDL YOK" | 01:125 | Otomatik migration aracı yok; 17 dosyada çalışma zamanı DDL var (finansta 2). | K1 gereği "hiçbir yöntem yoksa sürümlü .sql script'leri" seçeneği uygulanır. |

---

## 4. Mükerrer kavramlar

| # | Kavram | Dokümanlardaki tanımlar | ERP'deki karşılıklar | Öneri |
|---|---|---|---|---|
| 1 | **Masraf / gider** (K7) | FAZ_02 §2.7; FAZ_04 §7 (TripCost); FAZ_05 §3 bakım, §4 lastik, §5 yakıt, §7 harcırah; FAZ_07 §4 geçiş; FAZ_08 §2 HGS, §3 yakıt kartı; FAZ_10 §4 mobil masraf | `ZT_ProductionExpenses` + `Detail` (başlık + satır, `ZT_ExpenseTypes/Items`); `ZT_SalesTruck` kolonları; `ZT_ExpertReportTruckExpenses`; sipariş, kesim çavuşu ve üretim çavuşu masrafları (ayrı tablolar). Ortak nokta yalnızca `ZT_AccountDebts`. | Tek masraf modeli `ZT_ProductionExpenses` yapısı temel alınarak kurulur; bağlam referansı (araç, sefer, sürücü, genel) eklenir. Diğer beş ERP masraf ekranı (sevk aracı, sipariş, kesim çavuşu, üretim çavuşu, bahçe aracı masrafları) kopyalanmaz. |
| 2 | **Araç ve sürücü** | FAZ_05 `Vehicle`, `Trailer`, `Driver`; 02 §5.4 | `TransportTruck` / `TransportChauffeur`; `SupplierTruck` / `SupplierChauffeur`; `ZT_Chauffeur` + `ZT_UsedPlate`; sevk kaydında serbest metin plaka | ZTO LOGISTIC'te tek kütük (FAZ_05). ZTO Fabrika ile eşleme FAZ_12'de: normalize plaka + kimlik numarası. |
| 3 | **Nakliye firması / taşıyıcı** | 02 §5.2 `Account` (taşıyıcı tipi); FAZ_04 taşeron | `TransportCompany` + iki ayrı cari grubu (`Nakliye Firması`, `Sevk Nakliye Firması`) | ZTO LOGISTIC'te firma kiracının kendisidir; taşeron ise cari hesap türüdür. Fabrika tarafındaki `TransportCompany` ile bağ FAZ_12'de kurulur. |
| 4 | **Taşıma emri / sevkiyat** | FAZ_04 `Shipment`, `Leg` | `ZT_SalesTruck` (yaş meyve) ve `ZT_RecipeShipment` (reçeteli) — iki ayrı sevk modeli | ZTO LOGISTIC'te tek model. FAZ_12 sözleşmesi iki ERP modelini de aynı yük talebine eşler. |
| 5 | **Konum / GPS** | FAZ_08 §4; FAZ_10 §5; 03 I4, K2 | Frigga veri kaydedicisi (sevkiyat bazlı, saklanmaz) | Tek konum kanalı ZTO LOGISTIC'te; FAZ_08, FAZ_10 ve FAZ_12 aynı tabloya yazar. |
| 6 | **Cari hesap** | 02 §5.2 `Account`; 02 §5.5 `CurrentAccount`; FAZ_02 §2.2; FAZ_03 §1 | Tek tablo `ZT_CustomerAccounts` (`AccountGroup` + `ReferenceID` ile 12 gruba ayrılıyor) | ERP zaten "tek tablo + tür alanı" kullanıyor; dokümandaki üç tanım tek köke indirilir. |
| 7 | **Ödeme planı ve onay** | FAZ_02 §2.6 | İki paralel sistem: `ZT_CustomerAccountPaymentPlans` (aktif) ve `ZT_PaymentPlans` / `ZT_PaymentApprovals` (eski); ayrıca cari kartta düz plan kolonları | Yalnızca aktif sistem taşınır (Faz 1 kararı). |
| 8 | **Kur servisi** | FAZ_02 §2.1; FAZ_08 §7 | 8 ayrı kur çekme kopyası; biri üçüncü taraf bir adrese gidiyor | Tek servis. |
| 9 | **e-Fatura / e-İrsaliye** | FAZ_04 §5; FAZ_08 §1 | Uyumsoft entegrasyonu (`ZT_EInvoice`, `ZT_EDespatch`) | FAZ_08'deki "entegratör adaptörü" tanımı mevcut Uyumsoft desenini referans alır. |
| 10 | **Stok** | FAZ_05 (sarf); FAZ_06 `StockItem` (3PL) | `ZT_MaterialStockAll` + `ZT_MaterialPurchases` (sarf ve ambalaj; sahiplik yok) | A2 yanıtına göre. |
| 11 | **Depo ve konum** | FAZ_06 `Warehouse`, `Bin` | `ZT_Warehouse`, `ZT_WarehouseLocation`, `ZT_WarehouseLocationTransfer` | 3PL seçilirse bu üç tablo yeniden kullanılabilir. |
| 12 | **Banka bakiyesi** | FAZ_02 §2.3 | İki yöntem: hareketlerden hesaplama (çoğu sayfa) ve saklı `Balance` kolonu (vadeli mevduat, kredi) | Faz 2'de tek yöntem seçilir. |

---

## 5. "Açık Sorular" maddelerinin durumu

| Dosya | Soru | Durum | Açıklama |
|---|---|---|---|
| FAZ_00:47 | Subdomain-başına-tenant mı, tek domain + JWT claim mi? | **Yeniden şekillenir** | K1 + K4 ile soru geçersiz kaldı; yerini A1 (kiracı modeli) ve A3 (kimlik doğrulama) alır. |
| FAZ_00:48 | Bulut sağlayıcı / yönetilen PostgreSQL? | Açık | "Flyway" ifadesi düşer; soru yedekleme ve barındırma için geçerliliğini korur. |
| FAZ_01:38 | SSO/kurumsal kimlik MVP'de gerekli mi? | Açık | A3 yanıtından etkilenir. |
| FAZ_01:39 | Taşeron/sürücü için ayrı sınırlı portal kullanıcısı MVP'de mi? | Açık | A3 (mobil sürücü) ile birlikte ele alınmalı. |
| FAZ_02:76 | Muhasebe fişi / çift taraflı kayıt MVP'de mi? | Açık | Kopyalanan finans çekirdeğinde defter-i kebir yoksa öneri ("hayır") fiilen geçerli olur; Faz 1'de teyit edilir. |
| FAZ_02:78 | KDV/tevkifat navlun faturasında nasıl? | Açık | Navlun faturası `YENI` kalemdir (Faz 1). |
| FAZ_03:44 | Tarife birincil boyutu km mi güzergâh mı? | Açık | Bu promptun kapsamı dışında. |
| FAZ_03:46 | Teklif onay/imza (e-imza) MVP'de mi? | Açık | Kapsam dışı. |
| FAZ_04:55 | Rota optimizasyonu / harita MVP'de basit mi? | Açık | Kapsam dışı. |
| FAZ_04:57 | Konteyner/intermodal kapsama girecek mi? | Açık | Kapsam dışı. |
| FAZ_05:45 | Tahograf/sürüş-dinlenme takibi MVP'de mi? | Açık | Kapsam dışı. |
| FAZ_05:47 | Araç kiralama/taşeron araç maliyet modeli? | **Kısmen kapanır** | K7 tek masraf modeli + Faz 1'deki "taşeron hakedişi" kalemi çerçeveyi verir; birim (gün/km/sefer) sorusu açık kalır. |
| FAZ_06:31 | Barkod/el terminali (WMS) MVP'de mi? | Açık | A2 yanıtından etkilenir. |
| FAZ_07:30 | BİLGE/NCTS entegrasyonu MVP'de mi? | Açık | Kapsam dışı. |
| FAZ_08:35 | Hangi e-dönüşüm entegratörü? Hangi GPS sağlayıcıları? | **Kısmen kapanır** | GPS kısmı K5 ve A4 (konum aktarım modeli) ile FAZ_12'ye bağlanır; ZTO Fabrika'da gerçek GPS takibi olmadığından (§3 #8) konum altyapısı ZTO LOGISTIC'te kurulur. E-dönüşüm kısmı için bkz. §2 #19 ve §4 #9 (Uyumsoft). |
| FAZ_09:32 | Gömülü BI mı, uygulama içi rapor mu? | Açık | Kapsam dışı. |
| FAZ_10:30 | Native mi, PWA mı? | Açık | A3 yanıtından etkilenir. |
| FAZ_11:39 | Ödeme sağlayıcısı? Faturalama TL mi çok döviz mi? | Açık | Kapsam dışı. |
| FAZ_11:40 | Self-servis kayıt açık mı? | Açık | A1 yanıtından etkilenir (kiracı açılış mekanizması). |
