# FAZ 0 — Altyapı ve Çok Kiracılık (Temel)

> **Uygulama Notu (2026-11-04) — Durum: kabul kriterleri karşılandı**
>
> **Yapılanlar:** `backend/` (Spring Boot 3.5, şema-başına-tenant, Flyway, `common` katmanı, Actuator, JSON log),
> `frontend/` (Vite, React, TypeScript, MUI), `docker-compose.yml`, `backend/Dockerfile`, `.github/workflows/ci.yml`.
>
> **Doğrulama:** GitHub Actions CI (`41910682514`) yeşil: Java 21 ile 5 birim + 10 entegrasyon testi, Spotless, container
> imajı; frontend lint, format, test ve build. Gerçek uygulamada health, tenant açma, yeniden başlatma ve Vite üzerinden
> ping elle denendi. React ekranı tarayıcıda açılmadı.
>
> **Sapmalar ve eklemeler:**
> - Yalıtımı gerçek API üzerinden test etmek için en küçük `Branch` (şube) kaynağı eklendi.
> - Kimlik doğrulama Faz 1'de geldiği için şube uçları şu an korumasızdır. Faz 1 bitmeden dışa açılmamalıdır.
> - Başarısız tenant, aynı kodla yeniden oluşturma isteğiyle tekrar denenir; bu istek yalnız migration'ı yeniden çalıştırır,
>   istekteki ad, para birimi ve saat dilimi değerlerini güncellemez.
> - `PROVISIONING` durumunda kalan tenant için (işlem sırasında uygulama kapanırsa) otomatik kurtarma yoktur.
> - Tenant kaydı her istekte veritabanından okunur; önbellek ihtiyaç doğunca eklenecek.
>
> **Çalıştırma:** `docker compose up -d`, ardından `backend` içinde `SPRING_PROFILES_ACTIVE=dev` ile
> `mvn spring-boot:run` ve `frontend` içinde `npm run dev`. Testler: `mvn -f backend/pom.xml verify` (Docker gerekir).

**Amaç:** Tüm modüllerin üzerine kurulacağı iskeleti kurmak: Spring Boot + React + PostgreSQL
proje yapısı, çok kiracılık (şema-başına-tenant), Flyway göçü, ortak katmanlar (Money, audit,
hata, sayfalama), CI ve test altyapısı.

**Bağımlılık:** Yok (ilk faz). | **Çıktı:** Boş ama çalışan, tenant-farkında, dağıtılabilir iskelet.

---

## Kapsam / Görevler

1. **Repo & build:** Monorepo (`/backend` Spring Boot Maven, `/frontend` Vite+React+TS).
   Ortak kod stili (Checkstyle/Spotless, ESLint/Prettier). `.env` yönetimi, profiller (dev/stage/prod).
2. **Veritabanı:** PostgreSQL; `admin` şeması (tenant kayıt/abonelik) + "tenant şema şablonu".
   **Flyway** iki yollu: `db/migration/admin`, `db/migration/tenant`.
3. **Çok kiracılık:** İstek bağlamından tenant çözümleme (bu fazda subdomain; JWT `tenant` claim Faz 1'de aynı arayüze eklenir) →
   Hibernate multi-tenancy (SCHEMA) / `search_path`. `TenantContext` (ThreadLocal) + filtre/interceptor.
   Yeni tenant açılışında şema oluştur + tenant migration uygula servis.
   `@Async` bağlam aktarımı ve tenant durum akışı (`PROVISIONING → ACTIVE | FAILED`) 02 §2'deki kurallara uyar.
   Faz 1'e kadar tenant oluşturma ucu, ortam değişkeniyle verilen bir admin anahtarıyla korunur.
4. **Ortak katman (`common`):** `Money` değer nesnesi (BigDecimal + currency, yuvarlama), audit
   taban sınıfı (`createdBy/At`, `updatedBy/At`, `status`), standart hata gövdesi + `@ControllerAdvice`,
   sayfalama/filtre yardımcıları, `traceId` (MDC).
5. **Konfigürasyon:** Para yuvarlama kuralı, varsayılan para birimi/saat dilimi tenant bazında.
6. **CI/CD:** Derleme + test (Testcontainers/PostgreSQL) + migration doğrulama; ana dala kırık kod
   engeli. Container imajı.
7. **Sağlık/gözlemlenebilirlik:** Actuator health/metrics, yapılandırılmış log (JSON), Micrometer.
8. **Frontend iskelet:** Route yapısı, API istemci (fetch + React Query), auth yer tutucu, tema/i18n
   (TR), hata/boş durum bileşenleri.

## Kabul Kriterleri

- [x] İki farklı tenant şemasına aynı anda istek atıldığında veriler **izole** (biri diğerinin
      verisini göremez) — entegrasyon testiyle kanıtlanır.
- [x] Yeni tenant oluşturma ucu çağrıldığında şema + tüm tenant migration'ları otomatik uygulanır.
- [x] Migration hatasında tenant `FAILED` olur ve istek alamaz; bilinmeyen veya aktif olmayan tenant standart hata döner.
- [x] `@Async` işte `TenantContext` korunur; iş bitince bağlam temizlenir — testle doğrulanır.
- [x] `Money` ile 0,1 + 0,2 = 0,3 (BigDecimal) ve yapılandırılan yuvarlama kuralı testle doğrulanır.
- [x] Hatalı istek standart `{code,message,details,traceId}` döndürür.
- [x] CI yeşil: derleme + migration + testler Testcontainers üzerinde geçer.
- [x] Actuator `/health` UP; log'da `traceId` görünür.
- [x] React iskelet build olur, API istemci bir "ping" ucunu tüketir.

## ERP Referansı (incele, port etme)
Çok kiracılık ve tenant açılışı için ERP'nin `GlobalVeriables` (tenant connection string),
`AccountController` (login→tenant DB çözümleme), `AdminSystemController` + `Services/Diagnostics/*`
(admin/sağlık) desenleri. Yeni platformda bunların **şema-başına-tenant + JWT** karşılığı kurulur.

## Açık Sorular (ajan sorabilir)
- Bulut sağlayıcı / yönetilen PostgreSQL? (Flyway ve yedekleme stratejisini etkiler.)
