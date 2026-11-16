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

Oturum gerektirmeyen uçlarda IP başına dakikalık sınır vardır: giriş 30, şifre sıfırlama 10, token yenileme 300, müşteri takip bağlantısı 60, e-posta sağlayıcısı webhook'u 600 (`RATE_LIMIT_*`, takip için `RATE_LIMIT_TRACKING`, webhook için `RATE_LIMIT_WEBHOOK`). Aşılınca 429 ve `Retry-After` döner.

Dosya yüklemesi dışındaki isteklerin gövdesi en çok 2 MB olabilir (`APP_HTTP_MAX_BODY_SIZE`, ör. `4MB`). JSON gövdesi belleğe okunduğu için, oturum veya imza denetlenmeden önce büyük gövdelerle belleğin doldurulması böyle önlenir; `Content-Length` sınırı aşan istek okunmadan 413 alır. Dosya yüklemeleri 20 MB ile sınırlıdır (`spring.servlet.multipart`, nginx'te `client_max_body_size 21m`).

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
Tümünü uygulamanın gerçek ayarlarına bakarak yazdım (application*.yml, .env.example, docs/URETIM_KURULUM.md). Kuruluma başlamadan önce okumanız gereken üç önemli nokta var:

Şifreleme anahtarı: TC kimlik no ve IBAN gibi kişisel veriler TOTP_ENCRYPTION_KEY anahtarıyla şifreleniyor. Sunucuda yeni bir anahtar kullanılacağı için bilgisayarınızdaki demo verisini sunucuya taşımayın. Sunucuda temiz kurulum yapıp firmayı orada açın.
Anahtarın yedeği: Bu anahtar kaybolur ya da değiştirilirse şifreli veriler bir daha açılamaz. Kasada ya da şifre yöneticisinde yedekleyin.
Kodun durumu: 12.3, 12.7 ve 12.8 henüz commit edilmedi; 12.8'in takip incelemesi de sürüyor. Yayın paketini inceleme bitip kod commit edildikten sonra üretin.
1. Tüm kullanıcı adları ve şifreler (yalnız bu bilgisayardaki geliştirme ortamı)
Ne	Adres	Kullanıcı	Şifre
Firma girişi (demo veri)	http://localhost:5173	Firma kodu kara, e-posta karaali@gmail.com	kara123456*
SaaS yönetici konsolu	http://localhost:5173/saas/login	admin@blackrose.local	Dev-Admin-12345 (iki adımlı doğrulama kapalı)
Firma acme	—	patron@acme.test	Şifresi yok; davet kabul edilmemiş
PostgreSQL (Docker)	localhost:5432, veritabanı blackrose	blackrose	blackrose
Şoförlerin uygulamaya giriş hesabı yok; yalnız şoför ve personel kaydı var.
Bilgisayarınızdaki ayrı PostgreSQL 15 servisi (durdurulmuş) bu projeye ait değil; şifresini bilmiyorum.
Bu şifrelerin hiçbirini sunucuda kullanmayın. Sunucudaki şifreleri aşağıda siz belirleyeceksiniz.
2. Windows Server 2022 PostgreSQL kurulumu
Lojistik başlığı: pgAdmin'de bu yalnız görsel bir klasördür (Server Group). pgAdmin'de Servers üzerinde sağ tıklayıp Register → Server Group… ile Lojistik adlı grubu açın, sunucunuzu bu grubun altına ekleyin.

Tablolar: Uygulama tabloları kendisi kurar; elle tablo açmayın. İlk açılışta Flyway admin şemasını, her firma açıldığında da tenant_<kod> şemasını kendiliğinden oluşturur. Sizin hazırlamanız gereken yalnız veritabanı ve kullanıcısı.

Önerilen PostgreSQL sürümü 16; testler bu sürümle yapıldı. Aşağıdaki sorguları postgres süper kullanıcısıyla, pgAdmin → Query Tool'da, postgres veritabanına bağlıyken çalıştırın:


-- 1) Uygulama kullanıcısı (şifreyi değiştirin; en az 20 karakter önerilir)
CREATE ROLE blackrose_app WITH LOGIN PASSWORD 'BURAYA-GUCLU-BIR-SIFRE'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- 2) Veritabanı (sahibi uygulama kullanıcısı: şemaları kendisi açabilsin)
CREATE DATABASE blackrose
  WITH OWNER = blackrose_app
       ENCODING = 'UTF8'
       TEMPLATE = template0
       LOCALE_PROVIDER = icu
       ICU_LOCALE = 'en-US'
       LC_COLLATE = 'C'
       LC_CTYPE = 'C';
-- Not: Bu satır hata verirse LOCALE_PROVIDER, ICU_LOCALE, LC_COLLATE ve LC_CTYPE
-- satırlarını silip yalnız ENCODING ve TEMPLATE ile tekrar çalıştırın.
-- (Geliştirme ortamı en_US.utf8 ile test edildi; ICU en-US buna en yakın seçenek.)

-- 3) Başka kullanıcıların bu veritabanına bağlanmasını kapat
REVOKE ALL ON DATABASE blackrose FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE blackrose TO blackrose_app;
Ardından blackrose veritabanına bağlanıp şunu çalıştırın:


-- 4) public şemasını kilitle (uygulama public kullanmaz)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO blackrose_app;
İlk açılıştan sonra kontrol sorgusu:


SELECT schema_name FROM information_schema.schemata
WHERE schema_name = 'admin' OR schema_name LIKE 'tenant_%';

SELECT version, description, success
FROM admin.flyway_schema_history
ORDER BY installed_rank DESC LIMIT 3;
Ayarlar:

Backend aynı sunucuda çalışacak. postgresql.conf içindeki listen_addresses = 'localhost' ayarı kalabilir.
5432 portunu dışarıya açmayın.
pg_hba.conf dosyasındaki varsayılan 127.0.0.1/32 scram-sha-256 satırı yeterli.
Günlük yedek için Görev Zamanlayıcı'da her gece şu komutu çalıştırın:


"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h localhost -U blackrose_app -d blackrose -Fc -f "D:\Yedek\blackrose_%DATE:~-4%%DATE:~3,2%%DATE:~0,2%.dump"
Şifreyi %APPDATA%\postgresql\pgpass.conf dosyasına yazın. Ayrıca D:\Blackrose\files klasörünü de (yüklenen belgeler) yedekleyin.

3. Standart Plesk ile yayın (uygulama desteği olmadan)
Mantık: Plesk Java çalıştıramaz, buna gerek de yok. İş üçe bölünüyor:

Backend: Java uygulaması Windows servisi olarak çalışır ve yalnız 127.0.0.1:8080 adresini dinler.
Ön yüz: Plesk'teki site yalnız derlenmiş dosyaları (dist) sunar.
Yönlendirme: IIS, /api/... isteklerini arka plandaki backend'e iletir (ters vekil). Uygulama, site ile API'nin aynı alan adında ve HTTPS üzerinde olmasını zorunlu tutuyor (oturum çerezi bu yüzden).
Varsayım: Plesk bu Windows Server 2022 üzerinde ve sunucuya Uzak Masaüstü (RDP) ile yönetici olarak girebiliyorsunuz. Yalnız paylaşımlı Plesk hesabınız varsa (RDP yok) Java çalıştırılamaz; o durumda VPS gerekir.

Adım 1: Paketleri kendi bilgisayarınızda hazırlayın

cd "f:\visual studio zto\LogisticErp\backend"
mvn -B -DskipTests package
# Çıktı: backend\target\blackrose-backend-1.0-SNAPSHOT.jar

cd "f:\visual studio zto\LogisticErp\frontend"
npm ci
npm run build
# Çıktı: frontend\dist\ klasörü
Adım 2: Sunucuda Java 21
Eclipse Temurin JDK 21 (Windows x64 MSI) kurun; kurulumda "Set JAVA_HOME" seçeneğini işaretleyin.
Kontrol: java -version komutu 21 göstermeli.
Adım 3: Klasörler ve gizli anahtarlar
Klasörler:

D:\Blackrose\app: jar ve servis dosyaları buraya.
D:\Blackrose\files: yüklenen belgeler.
D:\Blackrose\logs: günlükler.
Gizli anahtarlar: iki ayrı değer üretin; PowerShell'de aşağıdaki komutu iki kez çalıştırın:


$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
Birincisi JWT_SECRET, ikincisi TOTP_ENCRYPTION_KEY olacak.
TOTP_ENCRYPTION_KEY'i mutlaka yedekleyin. Kişisel veriler bu anahtarla şifreleniyor; kaybolursa bu veriler açılamaz.
Adım 4: Backend'i Windows servisi yapın (WinSW)
GitHub'dan WinSW v2.12.0 WinSW-x64.exe dosyasını indirin.
Dosyayı D:\Blackrose\app\blackrose-backend.exe olarak kaydedin.
Jar'ı D:\Blackrose\app\blackrose-backend.jar adıyla kopyalayın.
Aynı klasöre aşağıdaki blackrose-backend.xml dosyasını koyun:

<service>
  <id>BlackroseBackend</id>
  <name>Blackrose Backend</name>
  <description>Blackrose ERP API (Spring Boot)</description>
  <executable>%JAVA_HOME%\bin\java.exe</executable>
  <arguments>-Xms512m -Xmx2g -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8 -jar "D:\Blackrose\app\blackrose-backend.jar" --server.address=127.0.0.1 --server.port=8080</arguments>
  <workingdirectory>D:\Blackrose\app</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <depend>postgresql-x64-16</depend>
  <onfailure action="restart" delay="10 sec"/>
  <logpath>D:\Blackrose\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>10</keepFiles></log>

  <env name="SPRING_PROFILES_ACTIVE" value="prod"/>
  <env name="DB_URL" value="jdbc:postgresql://localhost:5432/blackrose"/>
  <env name="DB_USERNAME" value="blackrose_app"/>
  <env name="DB_PASSWORD" value="BURAYA-VERITABANI-SIFRESI"/>
  <env name="JWT_SECRET" value="BURAYA-1.-URETILEN-ANAHTAR"/>
  <env name="TOTP_ENCRYPTION_KEY" value="BURAYA-2.-URETILEN-ANAHTAR"/>

  <env name="FRONTEND_BASE_URL" value="https://erp.firmaniz.com"/>
  <env name="TENANCY_BASE_DOMAIN" value="erp.firmaniz.com"/>
  <env name="FORWARD_HEADERS_STRATEGY" value="native"/>
  <env name="REFRESH_COOKIE_SECURE" value="true"/>

  <env name="ADMIN_BOOTSTRAP_EMAIL" value="yonetici@firmaniz.com"/>
  <env name="ADMIN_BOOTSTRAP_PASSWORD" value="BURAYA-YONETICI-SIFRESI"/>

  <env name="SPRING_MAIL_HOST" value="mail.firmaniz.com"/>
  <env name="SPRING_MAIL_PORT" value="587"/>
  <env name="SPRING_MAIL_USERNAME" value="noreply@firmaniz.com"/>
  <env name="SPRING_MAIL_PASSWORD" value="BURAYA-EPOSTA-SIFRESI"/>
  <env name="MAIL_FROM" value="Blackrose &lt;noreply@firmaniz.com&gt;"/>

  <env name="FILE_STORAGE" value="local"/>
  <env name="FILES_ROOT" value="D:\Blackrose\files"/>
  <env name="FILE_SCAN_MODE" value="none"/>
</service>
Ayarlarla ilgili notlar:

--server.address=127.0.0.1: 8080 portu dışarıya kapalı kalır; güvenlik duvarında açmayın.
TENANCY_BASE_DOMAIN'e sitenin tam adını yazın (ör. erp.firmaniz.com). Yalnız firmaniz.com yazarsanız uygulama erp'yi firma kodu sanar ve "Firma bulunamadı" hatası verir.
E-posta zorunlu: e-posta ayarı yoksa uygulama açılmaz. Plesk'te oluşturacağınız noreply@ kutusunun SMTP bilgilerini kullanabilirsiniz.
Virüs taraması: FILE_SCAN_MODE=none yüklenen dosyaları taramaz. ClamAV kurulumunu ertelediğimiz güvenlik maddelerine ekledim. Bu satırı yazmazsanız üretim profili ClamAV ister ve dosya yükleme çalışmaz.
Servis adı: <depend> satırındaki ad, PostgreSQL servisinizin adı olmalı (services.msc'den bakın).
Dosya izni: XML dosyası şifre içerdiği için klasörü yalnız Administrators ve servis hesabı okuyabilmeli.
Kurulum ve kontrol (yönetici olarak açılmış PowerShell'de):


cd D:\Blackrose\app
.\blackrose-backend.exe install
.\blackrose-backend.exe start
Invoke-RestMethod http://127.0.0.1:8080/api/v1/ping   # açılış bitince {"status":"ok"}
İlk açılışta migration'lar çalıştığı için yanıt bir süre 503 döner; bu normal. Hata olursa D:\Blackrose\logs klasörüne bakın.

Adım 5: IIS'e ters vekil desteği (bir kez, RDP ile)
Plesk standart kurulumunda URL Rewrite modülü genelde vardır, ancak ARR (Application Request Routing 3.0) ayrıca kurulmalı.

Microsoft IIS sitesinden ARR 3.0 (x64) kurulum dosyasını indirip kurun.
IIS Manager'da sunucu düğümüne gelin → Application Request Routing Cache → sağdaki Server Proxy Settings ekranında:
Enable proxy seçeneğini işaretleyin.
Time-out değerini 300 saniye yapın; firma verisi dışa aktarımı uzun sürebiliyor.
Preserve client IP in the following header: X-Forwarded-For seçeneğini işaretleyin ve kaydedin.
Yönetici olarak açılmış komut isteminde (cmd) şunları çalıştırın:

%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /preserveHostHeader:"True" /commit:apphost
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
Adım 6: Plesk'te site
Plesk'te alan adını ya da alt alan adını ekleyin (ör. erp.firmaniz.com); barındırma türü "Web sitesi".
SSL/TLS → Let's Encrypt sertifikası alın.
Barındırma Ayarları'nda "HTTP'den HTTPS'ye kalıcı 301 yönlendirme" seçeneğini açın.
Dosya Yöneticisi ya da FTP ile frontend\dist klasörünün içindekileri httpdocs klasörüne yükleyin: index.html, assets\, sw.js, manifest.webmanifest ve diğerleri.
Aynı httpdocs klasörüne aşağıdaki web.config dosyasını koyun:

<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="API ters vekil" stopProcessing="true">
          <match url="^api/(.*)" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
          <action type="Rewrite" url="http://127.0.0.1:8080/api/{R:1}" />
        </rule>
        <rule name="SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="22020096" />
      </requestFiltering>
    </security>

    <staticContent>
      <remove fileExtension=".webmanifest" />
      <mimeMap fileExtension=".webmanifest" mimeType="application/manifest+json" />
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    </staticContent>

    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
        <add name="Content-Security-Policy" value="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" />
        <add name="Strict-Transport-Security" value="max-age=31536000; includeSubDomains" />
        <add name="Referrer-Policy" value="same-origin" />
        <add name="Permissions-Policy" value="camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>

  <!-- Dosya adları içerikle değişir: 1 yıl önbellek -->
  <location path="assets">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" />
      </staticContent>
    </system.webServer>
  </location>
  <!-- Sayfa ve service worker her açılışta doğrulanır -->
  <location path="index.html">
    <system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer>
  </location>
  <location path="sw.js">
    <system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer>
  </location>
</configuration>
Tarayıcıda https://erp.firmaniz.com/api/v1/ping adresini açın; {"status":"ok"} görmelisiniz.
Adım 7: İlk kullanım
https://erp.firmaniz.com/saas/login adresinden ADMIN_BOOTSTRAP_EMAIL ve şifresiyle girin.
Üretimde iki adımlı doğrulama zorunlu: ekrandaki anahtarı Google/Microsoft Authenticator'a ekleyip kodla kurulumu tamamlayın.
Konsoldan firmayı oluşturun: firma kodu (ör. kara), adı ve sahip e-postası.
Sahibe davet e-postası gider. Bağlantıdan şifresini belirledikten sonra ana sayfadan firma kodu, e-posta ve şifreyle giriş yapılır.
Konsoldaki Sistem sağlığı → Dış bağlantılar tablosunda e-posta ve dosya deposunun yeşil olduğunu kontrol edin.
Güncelleme yaparken
Backend:
.\blackrose-backend.exe stop
Jar'ı değiştirin.
.\blackrose-backend.exe start
Yeni migration'lar kendiliğinden uygulanır; güncellemeden önce veritabanı yedeği alın.
Ön yüz: httpdocs içindekileri yeni dist ile değiştirin; web.config dosyasını silmeyin.
Plesk'iniz Windows değil de Linux üzerindeyse 5. ve 6. adımlar farklıdır (IIS yerine nginx "ek yönergeleri"); söylerseniz onu da yazarım.

İsterseniz bu rehberi docs/URETIM_KURULUM_WINDOWS_PLESK.md olarak projeye ekleyebilirim. 12.8 takip incelemesi arka planda sürüyor; bitince sonucunu yazacağım.