# Blackrose (LogisticErp) — çalışma notları

Nakliye/lojistik ERP + CRM SaaS. Backend Spring Boot 3.5 / Java 21 (`backend/`, paket `org.ece.blackrose`), frontend React 18 + MUI + Vite (`frontend/`), PostgreSQL 16, şema-başına-tenant, Flyway (`backend/src/main/resources/db/migration/{admin,tenant}`).

## Belgeler
- `docs/01_ANA_PROMPT.md` — projenin anayasası; `docs/02_MIMARI_ve_VERI_MODELI.md`; `docs/03_YAPILACAKLAR_BACKLOG.md` (durum işaretleri).
- Faz dosyaları `docs/fazlar/`. Her fazın başındaki "Uygulama Notu" o fazın gerçek durumudur.
- **Devam eden iş: Faz 12 — ZTO Fabrika finans eklemeleri.** Başlangıç: `docs/zto-finans/00_README.md`, yetkili karar belgesi `docs/zto-finans/analiz/04_UYARLAMA_KARAR_MATRISI.md`, plan `docs/fazlar/FAZ_12_ZTO_Finans_Eklemeleri.md`.

## Faz 12 kuralları (kullanıcı kararları, 2026-11-12)
- ZTO Fabrika (`f:\visual studio zto\ZtoFabrika2026\ZtoFabrika`, .NET 8 MVC) **salt okunur referanstır**; C#/Razor/jQuery kodu taşınmaz, yeniden yazılır. Yalnız ZTO CSS'i `.zto-finans` kapsamında olduğu gibi kopyalanır.
- ZTO finans ekranları ve modalları React'te **birebir görünüm ve akışla** yazılır; mevcut MUI finans ekranları kalır.
- **Tek finans motoru:** cari hareketi yalnız `LedgerService`, banka/kasa hareketi yalnız `FundLedgerService` yazar; `source_type/source_id` idempotency; silme yerine ters kayıt; saklı bakiye yok.
- **Çoklu şirket (2026-11-13):** bir kiracı 2–3 tüzel kişi adına alış, satış, nakliye, personel ve maaş işlemi yapar. Şirket → Şube → İş Yeri; para/yasal belge tablolarında `company_id` + bileşik FK (MX5).
- Kapsam Faz 12.0–12.11: ön yüz altyapısı, iş yeri/şirket, cari, banka/kasa, ödeme/tahsilat, çek, plan/onay, kredi, mevduat, masraf/taşeron, raporlar, personel/bordro, Uyumsoft, ZTO Fabrika entegrasyonu.
- Migration sırası 04 §4 **Z-kimlikleri** (Z01–Z39 tenant, ZA1–ZA3 admin); gerçek `V` numarası yazıldığı anda sıradaki boş numara. MX eklerindeki numaralar geçersiz.
- 04 §6.1 ve §6.2 kararları alındı (2026-11-13): cari ortak + şirket kırılımlı bakiye, bordro yasal kurallara göre yeniden, kur farkı = rapor + elle onaylı belge, diğer öneriler kabul.

## Git
- Çalışma dalı: `zto-finans-eklemeleri`. **Push yapılmaz**; commit yalnız kullanıcı isteyince. Remote: `github.com/Selsysoft/LogisticErp`.

## Komutlar
- Yerel ortam: `docker compose up -d --wait`; backend `cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev`; frontend `cd frontend && npm run dev` (http://localhost:5173). Ayrıntı: `docs/YEREL_CALISTIRMA.md`.
- Doğrulama: `mvn -B -f backend/pom.xml verify` (Docker gerekli, ~9–15 dk); frontend `npm run lint && npm run format:check && npm test && npm run build`.
- CI eşikleri: JaCoCo satır %93, dal %76.
- Bu makine: JDK 21 (Temurin, winget), Maven 3.9.16 (`%USERPROFILE%\tools\apache-maven-3.9.16`, kullanıcı PATH'inde), Docker Desktop, Node 24 (CI Node 22).
