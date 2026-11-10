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
| `BULKMAIL_API_KEY` veya `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`; ayrıca `MAIL_FROM` | İkisi de boşsa uygulama açılmaz. BulkMail anahtarı verilirse SMTP ayarları kullanılmaz (bkz. [E-posta](#e-posta)). SMTP'de STARTTLS varsayılan olarak zorunludur. |
| `FILE_STORAGE=s3`, `S3_BUCKET`, `S3_REGION` | Bucket yoksa uygulama açılmaz. `S3_ACCESS_KEY` boşsa AWS varsayılan kimlik zinciri kullanılır. Uyumlu sağlayıcıda `S3_ENDPOINT` verilir. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | `prod`/`stage` varsayılanı `FILE_SCAN_MODE=clamav`'dır. Tarayıcıya ulaşılamazsa dosya yüklemeleri 503 döner, dosya kabul edilmez. |
| `FORWARD_HEADERS_STRATEGY=native` | **Ters vekil arkasında zorunludur.** Yapılmazsa bütün kullanıcılar vekilin IP'sinden gelmiş sayılır ve IP sınırı herkesi birlikte kilitler; denetim günlüğündeki IP de yanlış olur. |
| `METRICS_TOKEN` | İsteğe bağlı, en az 32 bayt. Prometheus `/actuator/prometheus` ucunu `Authorization: Bearer <token>` ile okur (`authorization.credentials`). Boşsa uç kapalıdır. Uç web sunucusu imajından geçmez; Prometheus backend'e iç ağdan bağlanır. |
| HTTPS ve aynı alan adı | Yenileme token'ı `HttpOnly`, `Secure`, `SameSite=Strict` çerezle verilir (`/api/v1/auth` yolu). Frontend ve API aynı alan adından (ters vekil üzerinden) sunulmalı, site HTTPS olmalıdır. `REFRESH_COOKIE_SECURE=false` yalnız HTTPS'siz yerel denemede kullanılır. |

## Web sunucusu (frontend)

`frontend/Dockerfile` uygulamayı derler ve nginx ile sunar (port 8080, root olmayan kullanıcı). `/api/` istekleri `BACKEND_URL` adresine (varsayılan `http://backend:8080`) iletilir; böylece frontend ile API aynı alan adındadır.

```
docker build -t blackrose-web frontend
docker run -d -p 8080:8080 -e BACKEND_URL=http://<backend>:8080 blackrose-web
```

- **TLS** bu imajın önünde (yük dengeleyici, CDN) sonlandırılır. Öndeki vekilin gönderdiği `X-Forwarded-Proto` backend'e aktarılır; backend'de `FORWARD_HEADERS_STRATEGY=native` olmalıdır.
- **Alan adları:** Firma alt alan adları (`<kod>.<TENANCY_BASE_DOMAIN>`) aynı imaja yönlendirilir; sertifika joker (`*.alan.adi`) olmalıdır.
- **Güvenlik başlıkları** `frontend/nginx/security-headers.conf` içindedir: `Content-Security-Policy` (betikler yalnız kendi alan adından, satır içi betik ve `eval` yok, çerçeve içine alınamaz, istekler yalnız kendi alan adına), `Strict-Transport-Security` (1 yıl, alt alan adları dahil), `Referrer-Policy: same-origin`, `Permissions-Policy` (yalnız kamera ve konum, sürücü ekranı için). Stiller için `'unsafe-inline'` gereklidir: MUI stilleri çalışma anında ekler.
- **Yazı tipleri** pakete gömülüdür; Google Fonts'a istek gitmez (kullanıcı IP'si üçüncü tarafa aktarılmaz).
- **Önbellek:** `/assets/` altındaki dosyaların adı içeriğe göre değişir, 1 yıl önbelleklenir; sayfa ve `sw.js` her açılışta doğrulanır.
- **Sayfa dosyaları** ilk açıldıklarında ayrı yüklenir (ilk yükleme gzip ile 294 KB'tan 241 KB'a indi). Yeni sürüm yayımlandıktan sonra açık kalan sekme eski bir sayfa dosyasını bulamazsa sayfa bir kez kendiliğinden yenilenir; yine bulamazsa menü yerinde kalır ve "Sayfayı yenile" uyarısı gösterilir. Bu yüzden yayında eski `/assets/` dosyalarını bir süre tutmak (ör. bucket/CDN'de) zorunlu değildir ama kullanıcıya daha az kesinti yaşatır.
- **Zaman aşımı** API için 300 sn (firma veri dışa aktarımı); yükleme sınırı 21 MB. Öndeki vekilde de en az bu değerler olmalıdır.
- Yeni bir dış kaynak (harita, analitik, ödeme sayfası) eklenirse CSP'ye ayrıca eklenmelidir; yoksa tarayıcı engeller.

2026-11-06'da yerelde denendi: başlıklar, `/api` yönlendirmesi, giriş, sayfa yenilemede çerezle oturumun sürmesi, rapor/filo/hesap ekranlarında CSP ihlali olmaması. Gerçek TLS ve yük dengeleyici arkasında denenmedi.

## E-posta

E-posta iki yoldan gider; `BULKMAIL_API_KEY` verilirse BulkMail, verilmezse SMTP.

**BulkMail** ([belgeler](https://docs.qrestos.com)) HTTPS üzerinden JSON ile gönderir; SMTP portu gerekmez.

1. Hesap açılır, e-posta doğrulanır, panelden **test** anahtarı (`sk_test_…`) alınır ve `BULKMAIL_API_KEY` olarak verilir. Test anahtarı yalnız panelde doğrulanmış en çok 5 sandbox alıcısına, günde 100 e-posta gönderir; gönderen adres her zaman `onboarding@sandbox.qrestos.com` olur. Uygulama bunu kendisi ayarlar, `MAIL_FROM`'daki görünen ad (`Firma <noreply@…>` biçiminde) korunur. SaaS konsolunun "Dış bağlantılar" tablosu test anahtarını uyarı olarak gösterir.
2. Canlıya geçmek için gönderen alan adı (tercihen `mail.firma.com` gibi bir alt alan adı) BulkMail'e eklenir, verdiği DKIM CNAME, MAIL FROM MX/SPF ve DMARC kayıtları DNS'e girilir ve alan adı doğrulanır. Hesap onayı, fiziksel adres ve ödeme tamamlanınca **canlı** anahtar (`sk_live_…`) alınır; `MAIL_FROM` doğrulanmış alan adında bir adres olmalıdır, değilse gönderim `domain_not_verified` ile reddedilir.
3. Yeni hesapların günlük sınırı ilk haftalarda kademeli artar (500, 2000, 5000, sonra 10000).

Her e-posta tek bir `Idempotency-Key` ile gönderilir; ağ hatası, 429 ve 5xx aynı anahtarla en çok iki kez yeniden denenir (bekleme en çok 5 sn), böylece tekrar deneme ikinci e-posta üretmez. Diğer hatalar (daha önce geri dönen veya şikâyet eden alıcı `recipient_suppressed`, doğrulanmamış alan adı, yetersiz kredi) yeniden denenmez; SMTP'de olduğu gibi hata kodu ve BulkMail istek numarasıyla günlüğe yazılır, iş akışı durmaz. Açılma ve tıklama izleme her e-postada kapalıdır; davet ve şifre bağlantıları yeniden yazılmaz. Gönderilen e-postalar BulkMail'de `kind` (`invite`, `password_reset`, `notice`) ve firma içinden gidenler `tenant` (firma kodu) etiketiyle ayrılır.

**Teslim bildirimleri (webhook).** BulkMail panelinde (veya `POST /v1/webhooks`) adresi `https://<alan adınız>/api/v1/webhooks/bulkmail`, olayları `email.delivered`, `email.bounced`, `email.complained`, `email.failed` olan bir uç oluşturulur; bir kez gösterilen `whsec_…` değeri `BULKMAIL_WEBHOOK_SECRET` olarak verilir. Boşsa uç 404 döner. Test ve canlı anahtarın uçları ayrıdır; canlıya geçince uç canlı anahtarla yeniden oluşturulur. Adres herkese açık HTTPS (443) olmalıdır; ters vekil `/api/` yolunu backend'e iletiyorsa ek ayar gerekmez. İstersen gelen istekler BulkMail'in sabit çıkış IP'siyle (webhook nesnesindeki `egress_ip`) sınırlanabilir.

- Her istek Standard Webhooks imzasıyla doğrulanır (HMAC-SHA256, `webhook-id`, `webhook-timestamp`, `webhook-signature`); imzasız, değiştirilmiş veya 5 dakikadan eski istek 401 alır. Anahtar döndürülürken gelen iki imzadan biri yeterlidir.
- Aynı bildirim birden çok gelebilir; `webhook-id` ile ayıklanır.
- Geri dönen (`email.bounced`), şikâyet edilen (`email.complained`) ve gönderilemeyen (`email.failed`) e-postalar kaydedilir. Firma kullanıcısının adresine giden son e-posta teslim edilemediyse **Kullanıcılar** listesinde adresin yanında uyarı görünür (ör. davet yanlış adrese gitti). Aynı adrese sonradan teslim olursa (`email.delivered`) uyarı kalkar. Bildirimler sırasız gelebildiği için eski bir e-postanın geç gelen geri dönme bildirimi, daha yeni bir teslimden sonra yine uyarı gösterebilir.
- SaaS konsolu **Sistem sağlığı** sekmesinde son 30 günün teslim sorunları firma, alıcı ve nedenle listelenir. Kayıtlar 90 gün tutulur.
- Her olay türü `blackrose_mail_events_total{type="email.bounced"}` gibi sayaçlara yazılır; geri dönme oranı Prometheus'tan izlenebilir.
- Geri dönen veya şikâyet eden adres BulkMail'in bastırma listesine girer; o adrese yeni gönderim `recipient_suppressed` ile reddedilir ve günlüğe yazılır. Adres düzeltilmeden yeniden davet gitmez.

BulkMail'de SPF kaydı gönderen adresin alan adına değil, MAIL FROM alt alan adına girilir; DMARC uyumu DKIM ile sağlanır. Bu yüzden "Gönderen alan adı" satırı gönderen alan adında SPF eksik uyarısı gösterebilir; BulkMail panelinde alan adı doğrulanmışsa bu uyarı beklenen durumdur.

E-posta şu durumlarda gider: kullanıcı daveti, şifre sıfırlama, SaaS faturası ve günlük özet. Günlük özet saatlik iş ile firmanın saat dilimine göre 07:00'den sonra, her etkin kullanıcıya yetkili olduğu konulardan tek e-posta olarak gider: filo hatırlatmaları (`FLEET_EDIT`), onay bekleyen sürücü masrafları (`SHIPMENT_DISPATCH`), onay bekleyen ödeme planları (`FINANCE_APPROVE`), 3 gün içinde vadesi gelen veya geciken onaylı ödemeler (`FINANCE_PAYMENT_CREATE`). Kullanıcı konuları Hesabım ekranından kapatır; firma filo hatırlatmalarını filo ayarlarından kapatabilir. Gün veritabanında üstlenilir, birden çok örnekte bir kez gönderilir. Gönderim hatası günlüğe yazılır, aynı gün tekrar denenmez. Her bölümde en çok 20 satır gösterilir. Ödeme planı akışında ayrıca anlık e-posta gider: plan onaya gönderilince onay yetkisi olanlara (`PAYMENT_APPROVAL` konusu), onaylanınca veya reddedilince planı girene, ret gerekçesiyle (`PLAN_DECISION`). Sürücü masrafında da aynısı: masraf girilince sevkiyat yetkisi olanlara (`DRIVER_EXPENSE_APPROVAL`), onaylanınca veya reddedilince sürücünün bağlı hesabına (`EXPENSE_DECISION`; sürücü adına dokunarak Hesabım'dan kapatabilir). İşlemi yapan kişiye gitmez; kullanıcı konuları Hesabım'dan kapatabilir. E-posta işlem kaydedildikten sonra arka planda gider.

## E-posta teslim edilebilirliği

Müşteriye giden sefer e-postalarının istenmeyen postaya düşmemesi için `MAIL_FROM` adresinin alan adında şu DNS kayıtları tanımlanmalıdır (değerleri e-posta sağlayıcısı verir):

| Kayıt | Ad | Örnek değer |
|---|---|---|
| SPF (TXT) | `firma.com` | `v=spf1 include:<sağlayıcının SPF alanı> ~all` |
| DKIM (TXT veya CNAME) | `<seçici>._domainkey.firma.com` | sağlayıcının verdiği açık anahtar |
| DMARC (TXT) | `_dmarc.firma.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@firma.com` |

SaaS konsolunun "Dış bağlantılar" tablosundaki "Gönderen alan adı" satırı SPF ve DMARC'ı, `MAIL_DKIM_SELECTOR` verilirse DKIM'i de DNS'ten okur. Eksik kayıt veya DNS'e ulaşılamaması uyarı olarak gösterilir, genel durumu düşürmez. Alan adında zaten SPF kaydı varsa yenisi eklenmez, sağlayıcının `include:` ifadesi mevcut kayda eklenir (bir alan adında yalnız bir SPF kaydı olabilir). DMARC'a `p=none` ile başlayıp raporlar temiz gelince `quarantine` veya `reject`'e geçmek güvenli yoldur.

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

Oturum gerektirmeyen uçlarda IP başına dakikalık sınır vardır: giriş 30, şifre sıfırlama 10, token yenileme 300, müşteri takip bağlantısı 60 (`RATE_LIMIT_*`, takip için `RATE_LIMIT_TRACKING`). Aşılınca 429 ve `Retry-After` döner.

- Sayaçlar bellektedir ve örnek başınadır: 3 örnekte fiili sınır 3 katıdır, yeniden başlatmada sıfırlanır.
- Tek IP arkasındaki kalabalık bir ofis için sınırlar gerekirse yükseltilmelidir.
- Daha güçlü koruma (WAF, CDN) bu sınırın yerine geçmez, önüne konur.

## Müşteri takip bağlantısı

Sefer detayındaki "Müşteri takibi" ile müşteriye giriş gerektirmeyen bir bağlantı verilir (`/track/<firma>/<anahtar>`). Bağlantı durum adımlarını, şehirleri, planlanan tarihleri, teslim zamanını ve teslim alanın baş harflerini gösterir; fiyat, sürücü, araç, konum ve notlar gösterilmez. Anahtar 256 bit rastgeledir, veritabanında yalnız SHA-256 özeti tutulur ve tam bağlantı yalnız oluşturulurken bir kez gösterilir. Bağlantı 60 gün geçerlidir; yenisi eskisini geçersiz kılar, iptal edilebilir. Geçersiz, süresi dolmuş ve iptal edilmiş bağlantı aynı yanıtı alır. Yanıt önbelleğe alınmaz (`Cache-Control: no-store`) ve arama motorlarına kapalıdır (`X-Robots-Tag`). Oluşturma ve iptal denetim günlüğüne yazılır; görüntülenme sayısı ofiste görünür.

Müşteri kişilerinde iki seçenek vardır: "Sefer yola çıkınca …" ve "Sefer teslim edilince takip bağlantılı e-posta alsın". İşaretli kişilere sefer yola çıktığında (planlanan teslim zamanıyla, firmanın saat diliminde) ve teslim edildiğinde (ofisten veya sürücü uygulamasından) takip bağlantısı içeren e-posta gider. E-posta teslim işlemi kaydedildikten sonra arka planda gönderilir; her alıcıya ayrı gider, adresler birbirine görünmez. Kimlere gönderildiği sefer geçmişine not düşülür. Bu bağlantı ofisin daha önce verdiği bağlantıyı bozmaz; ofis yeni bağlantı oluşturur veya iptal ederse e-postadaki de geçersiz olur. Fatura iptaliyle sefer teslim durumuna döndüğünde e-posta yeniden gönderilmez. Bağlantıdaki adres `FRONTEND_BASE_URL`'den gelir. E-posta düz metin ve HTML olarak birlikte gider: HTML firma adıyla başlıklı, sefer bilgisi tablosu ve "Gönderiyi izle" düğmesi içerir; yalnız satır içi stil kullanır, dış görsel ve betik içermez, değişken alanlar kaçışlanır. HTML göstermeyen istemci düz metni okur.

## Dosyalar

Yerel diskten S3'e geçişte anahtar düzeni aynıdır (`tenant_<kod>/<uuid>`), `FILES_ROOT` içeriği bucket köküne olduğu gibi kopyalanır. Şifreleme ve yaşam döngüsü bucket tarafında ayarlanmalıdır. clamd varsayılan `StreamMaxLength` değeri 25 MB'tır, yükleme sınırı 20 MB olduğu için yeterlidir. Mevcut dosyalar geriye dönük taranmaz.

## Hazır olma denetimi

Yük dengeleyici ve dağıtım betikleri `/api/v1/ping`'i kullanmalıdır: sunucu, açılış adımları (ilk SaaS yöneticisi, firma şemalarının migration'ı) bitene kadar 503 döner, sonra 200. Böylece trafik hazır olmayan örneğe gönderilmez.

## Dış bağlantıların denetimi

SaaS konsolunun Sistem sağlığı sekmesindeki "Dış bağlantılar" tablosu e-posta (SMTP bağlantısı ve kimlik doğrulaması), dosya deposu (yerel klasöre yazma veya S3 bucket erişimi), virüs tarama (clamd `PING`) ve ödeme sağlayıcısının durumunu gösterir. E-posta gönderim hataları yalnız günlüğe yazıldığından yanlış SMTP ayarı ilk burada görünür; kurulumdan sonra bu tablo kontrol edilmelidir. Erişilemeyen bağlantı genel durumu "Dikkat gerekiyor"a, dosya deposu ise "Kritik"e çeker. Her bağlantı en çok 8 sn beklenir, sonuç 60 sn saklanır; "Yeniden denetle" beklemeden yeniler. Deneme ödeme sağlayıcısı uyarı olarak gösterilir.

Aynı denetim konsol açılmasa da açılıştan 10 sn sonra ve dakikada bir arka planda çalışır. İlk sonuç ve her durum değişimi günlüğe yazılır (`Dış bağlantı ulaşılamıyor: …` WARN, `Dış bağlantı düzeldi: …` INFO); aynı uyarı her dakika tekrarlanmaz. Sonuç Prometheus'ta `blackrose_dependency_up{dependency="mail|storage|scanner|payment"}` göstergesiyle yayımlanır: 1 çalışıyor veya uyarı, 0 ulaşılamıyor, -1 tanımlı değil. Örnek alarm:

```yaml
- alert: DisBaglantiUlasilamiyor
  expr: blackrose_dependency_up == 0
  for: 5m
  annotations:
    summary: "{{ $labels.dependency }} 5 dakikadır ulaşılamıyor"
```

## Saat dilimi

Sunucunun saat dilimi önemli değildir, UTC bırakılabilir. "Bugün" her yerde firmanın kayıtlı saat dilimiyle hesaplanır: vadeler, deneme süresi, faturalama, günlük özet, SaaS konsolundaki gecikmiş fatura sayısı. TCMB kur çekimi İstanbul saatine göre zamanlanır. Kaynakta sunucu saat dilimine bağlı tarih çağrısı (`LocalDate.now()` vb.) bulunmasını `TimeZoneUsageTest` engeller.

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
