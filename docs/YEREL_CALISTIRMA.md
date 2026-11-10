# Yerelde Çalıştırma

Bu dosyadaki bilgiler yalnız yerel geliştirme içindir. Gerçek ortamda kullanılmaz.

## Başlatma
```
docker compose up -d --wait
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev -Djava.version=17
cd frontend && npm run dev
```
Uygulama: http://localhost:5173. `-Djava.version=17` yalnız JDK 21 kurulu değilse gerekir.

## Deneme hesapları
`docker compose down -v` veritabanını siler; bu hesaplar da silinir.

| Kullanım | Firma kodu | E-posta | Şifre |
|---|---|---|---|
| SaaS yöneticisi (konsol: http://localhost:5173/saas/login) | — | `admin@blackrose.local` | `Dev-Admin-12345` |
| Patron/Yönetici | `acme` | `patron@acme.test` | `Demo-Acme-2026` |
| Finans | `acme` | `finans@acme.test` | `Demo-Acme-2026` |
| Sürücü (http://localhost:5173/driver) | `acme` | `surucu@acme.test` | `Demo-Acme-2026` |

## Yüklenen dosyalar
`FILES_ROOT` klasöründe tutulur (varsayılan `./data/files`). Container'da kalıcı olması için `/app/data/files` yoluna birim bağlanmalıdır.

## Davet ve şifre bağlantıları
`dev` profilinde e-posta gönderilmez; bağlantı backend günlüğüne `[DEV]` önekiyle yazılır.

## Yeni firma açma
`POST /api/v1/admin/auth/login` ile SaaS token'ı alın, ardından `POST /api/v1/admin/tenants` çağırın:
```json
{"code":"acme","name":"Acme Lojistik","defaultCurrency":"TRY","timeZone":"Europe/Istanbul",
 "ownerEmail":"patron@acme.test","ownerFullName":"Firma Sahibi"}
```

## Test kapsamı

`mvn -f backend/pom.xml verify` birim ve entegrasyon testlerinin kapsamını JaCoCo ile ölçer; rapor `backend/target/site/jacoco/index.html`'dedir. Alt sınır (satır %93, dal %76) yalnız `-Pcoverage` ile uygulanır; CI bu profille çalışır. Yerelde yalnız bazı testler çalıştırıldığında (`-Dit.test=...`) kapsam doğal olarak düşük çıkar, bu yüzden varsayılan derlemede uygulanmaz. Yeni kod eklerken sınırı korumak için tam takımı `-Pcoverage` ile çalıştırın.

## Bellek

Backend testleri (`mvn verify`) ve uçtan uca yığın aynı anda Docker, tarayıcı ve IDE ile çalışınca 16 GB'lık makinede bellek tükenebilir. Bu yüzden sınırlar konmuştur: test JVM'i en çok 1 GB heap kullanır (`argLine`, `-DargLine=...` ile değiştirilebilir), test profilinde her Spring bağlamı en çok 5 veritabanı bağlantısı açar, uçtan uca yığında backend 1 GB, PostgreSQL 768 MB ile sınırlıdır. Ölçümde tam backend doğrulaması sırasında Java süreçleri en çok yaklaşık 1,25 GB kullandı. Testlerden önce kullanılmayan geliştirme konteynerlerini durdurmak (`docker stop blackrose-backend blackrose-web`, geri açmak için `docker start ...`) ve backend testleriyle uçtan uca yığını aynı anda çalıştırmamak önerilir.

## Uçtan uca testler
Üretim web sunucusu imajı (nginx, CSP), backend, boş bir PostgreSQL ve e-postaları yakalayan Mailpit ile tam yığın açılır; testler Playwright ile gerçek tarayıcıda çalışır.
```
docker compose -f docker-compose.e2e.yml up -d --build
cd frontend
npx playwright install chromium   # ilk seferde
npm run e2e
docker compose -f docker-compose.e2e.yml down
```
Uygulama http://localhost:8090, Mailpit http://localhost:8026. Kurulum adımı SaaS yöneticisiyle yeni bir firma açar ve sahibinin şifresini davet e-postasındaki bağlantıyla belirler; diğer testler bu firmayı kullanır. Testler giriş/çıkış ve çerezle oturum, güvenlik başlıkları, bütün modüllerin menüden açılması, cari ekleme, şifre sıfırlama, seferin atamadan faturaya kadar ekrandan yürütülmesi (fatura sonrası cari bakiyesi dahil), telefon boyutunda sürücü ekranını (yükleme, yola çıkış, masraf, imzalı teslim, masrafın ofiste onaylanması), teklifin hazırlanıp kabul edilmesi ve kabul edilen satırdan fiyatıyla sefer açılması ile ödeme planının finans rolünce girilip patronca onaylanması ve bankadan ödenmesini (banka bakiyesi dahil), gerekçeyle reddedilen planın gerekçesinin listede ve geçmişte görülüp planın yeniden onaya gönderilmesini, planı oluşturanın kendi planını onaylayamamasını seçilen planların topluca onaylanmasını (kendi planı onaylanmaz, nedeni yazılır), SaaS konsolunda dış bağlantıların gerçek SMTP ile denetlenmesini ve müşteri takip bağlantısını (oturumsuz telefon görünümü, fiyatın gizlenmesi, iptal) ve yola çıkışta ve teslimde işaretli müşteri kişisine Mailpit üzerinden giden takip e-postalarını kapsar. Kurulum adımı backend açılana kadar bekler. Ön veriler (araç, sürücü, sefer, banka hesabı) API ile hazırlanır, adlar her çalıştırmada benzersizdir. Herhangi bir testte CSP ihlali veya tarayıcı hatası olursa test düşer. CI'da `e2e` işi olarak her çalıştırmada koşar; hata olursa ekran görüntüsü ve iz dosyası rapor olarak yüklenir.
