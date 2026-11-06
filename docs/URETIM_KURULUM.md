# Üretim Kurulumu

Bu belge, uygulamanın üretim profilinde çalışması için gerekenleri anlatır. Gerçek sağlayıcılarla (AWS S3, kurumsal SMTP) ve üretim sunucusunda henüz denenmemiştir; yerel deneme kapsamı aşağıdadır.

## Zorunlu ayarlar

`SPRING_PROFILES_ACTIVE=prod` ile çalışır. Örnek değerler `.env.example` içindedir.

| Ayar | Not |
|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | PostgreSQL 16 |
| `JWT_SECRET`, `TOTP_ENCRYPTION_KEY` | En az 32 bayt. Eksikse uygulama açılmaz. `TOTP_ENCRYPTION_KEY` değişirse kayıtlı 2FA anahtarları çözülemez. |
| `TENANCY_BASE_DOMAIN`, `FRONTEND_BASE_URL` | Firma alt alan adları ve e-posta bağlantıları |
| `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` | İlk SaaS yöneticisi |
| `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, `MAIL_FROM` | Host boşsa uygulama açılmaz. STARTTLS varsayılan olarak zorunludur. |
| `FILE_STORAGE=s3`, `S3_BUCKET`, `S3_REGION` | Bucket yoksa uygulama açılmaz. `S3_ACCESS_KEY` boşsa AWS varsayılan kimlik zinciri kullanılır. Uyumlu sağlayıcıda `S3_ENDPOINT` verilir. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | `prod`/`stage` varsayılanı `FILE_SCAN_MODE=clamav`'dır. Tarayıcıya ulaşılamazsa dosya yüklemeleri 503 döner, dosya kabul edilmez. |
| `FORWARD_HEADERS_STRATEGY=native` | **Ters vekil arkasında zorunludur.** Yapılmazsa bütün kullanıcılar vekilin IP'sinden gelmiş sayılır ve IP sınırı herkesi birlikte kilitler; denetim günlüğündeki IP de yanlış olur. |

## SaaS yöneticisi 2FA

`prod` ve `stage`'de zorunludur (`SAAS_2FA_REQUIRED`). İlk girişte konsol anahtarı gösterir; yönetici doğrulayıcı uygulamaya ekleyip ürettiği kodla kurulumu tamamlar.

Telefon kaybında konsoldan sıfırlama yoktur. Yetkili kişi veritabanında sıfırlar ve yönetici yeniden kurar:

```sql
UPDATE admin.saas_admin
SET totp_enabled = FALSE, totp_secret = NULL, totp_last_step = NULL
WHERE email = '<yönetici e-postası>';
```

Bu işlem denetim günlüğüne yazılmaz; kim ne zaman yaptığı ayrıca kaydedilmelidir.

## IP sınırı

Oturum gerektirmeyen uçlarda IP başına dakikalık sınır vardır: giriş 30, şifre sıfırlama 10, token yenileme 300 (`RATE_LIMIT_*`). Aşılınca 429 ve `Retry-After` döner.

- Sayaçlar bellektedir ve örnek başınadır: 3 örnekte fiili sınır 3 katıdır, yeniden başlatmada sıfırlanır.
- Tek IP arkasındaki kalabalık bir ofis için sınırlar gerekirse yükseltilmelidir.
- Daha güçlü koruma (WAF, CDN) bu sınırın yerine geçmez, önüne konur.

## Dosyalar

Yerel diskten S3'e geçişte anahtar düzeni aynıdır (`tenant_<kod>/<uuid>`), `FILES_ROOT` içeriği bucket köküne olduğu gibi kopyalanır. Şifreleme ve yaşam döngüsü bucket tarafında ayarlanmalıdır. clamd varsayılan `StreamMaxLength` değeri 25 MB'tır, yükleme sınırı 20 MB olduğu için yeterlidir. Mevcut dosyalar geriye dönük taranmaz.

## Bellek

Container imajı belleğin %70'ini kullanır ve bellek biterse kapanır (`ExitOnOutOfMemoryError`). Otomatik yeniden başlatma tanımlanmalıdır.

## Yerel deneme

```
docker compose --profile uretim up -d
```
Mailpit (http://localhost:8025), S3 taklidi ve ClamAV açılır. ClamAV ilk açılışta imza veritabanını indirir ve yaklaşık 2 GB bellek ister.

2026-11-05 tarihinde `prod` profiliyle bu servislerle denendi: 2FA kurulumu ve kod tekrarı reddi, e-postanın SMTP sunucusuna ulaşması, dosyanın S3 taklidine yazılıp aynen okunması, EICAR test dosyasının ClamAV tarafından reddedilip denetim günlüğüne yazılması, 429 yanıtı, SMTP host'u boşken uygulamanın açılmaması.

2026-11-06'da SaaS konsolunun 2FA ekranı tarayıcıda denendi: ilk girişte anahtar ve kod alanı, kodla kurulum ve konsola giriş, sonraki girişte anahtar gösterilmeden kod istenmesi, yanlış kodun reddi.

S3 taklidi kimlik bilgisi denetlemez. Gerçek AWS'de yetki ve bölge ayarları, gerçek SMTP'de STARTTLS ve kimlik doğrulama, ters vekil arkasında IP algılama denenmedi.

## Performans ölçümü (2026-11-05)

**Veri:** 150 bin sefer, 5.300 cari, 991 bin cari hareket, 300 bin sefer gideri, 450 bin sefer olayı, 50 bin ödeme planı (742 MB).
**Ortam:** Geliştirici dizüstü bilgisayarı, Docker, PostgreSQL varsayılan ayarları (`shared_buffers` 128 MB). İstemci aynı makinede. Sonuçlar üretim kapasitesi sözü değildir; aynı betik üretim benzeri ortamda tekrarlanmalıdır.

| Uç | Süre (tek kullanıcı) |
|---|---|
| Liste, arama, detay, ekstre, pano | 80–340 ms |
| Sürücü performansı, döviz pozisyonu | 230–400 ms |
| Kârlılık ve KPI, 1 yıl | 0,7–0,9 sn |
| KPI, 3 yıl | 2,1 sn |
| Nakit öngörüsü | 1,6 sn |
| Ana sayfa | ilk açılış 3,6 sn, önbellekten 77 ms |
| Yaşlandırma | 2,8–3,7 sn |
| Excel/PDF kârlılık, 1 yıl | 4,4 / 3,8 sn |
| Firma veri dışa aktarımı | 99 sn, 148 MB |

**Eşzamanlı yük** (aynı firma, karışık liste/detay/pano/ana sayfa istekleri, istemciler beklemeden istek atar, 30 sn):

| İstemci | Önbelleksiz | Önbellekle (2026-11-06) |
|---|---|---|
| 10 | — | 27 istek/sn, p95 0,8 sn, hata yok |
| 25 | 11 istek/sn, p95 5,5 sn | 24 istek/sn, p95 2,2 sn, hata yok |

25 istemcide kapasite artmıyor, yalnız bekleme süresi uzuyor; bu makinede tavan yaklaşık 25 istek/sn'dir. Beklemesiz istemci gerçek kullanıcıdan çok daha yoğundur, kullanıcı sayısına doğrudan çevrilmemelidir.

**Ölçümün bulduğu ve düzeltilen sorunlar:**
- Yaşlandırma raporu bütün hareketleri belleğe alıyordu; 70 saniye sonra `OutOfMemoryError` veriyordu, bu da aynı örnekteki bütün firmaları etkiliyordu. Hesap SQL'e taşındı. Sorguda eksik `deleted = false` filtresi de eklendi.
- PostgreSQL JIT derlemesi rapor sorgularına sorgu başına 0,7–1 sn ekliyordu. Bağlantıda kapatıldı (`SET jit = off`).
- Ana sayfa her açılışta bütün cari hareketleri topluyor ve kapasiteyi yarıdan fazla düşürüyordu. Firma ve yetki bazında 30 saniyelik önbellek eklendi (`DASHBOARD_CACHE_TTL`). Ana sayfa rakamları bu kadar eski olabilir; rapor ekranları önbellek kullanmaz.

**Bilinen sınırlar:** Önbellek örnek başınadır. Uzun dönemli raporlar veri büyüdükçe yavaşlar; özet tablo yok. Yaşlandırma ve dışa aktarımlar arka plan işi değildir, istek süresince çalışır. Ters vekilde zaman aşımı firma veri dışa aktarımına göre ayarlanmalıdır.
