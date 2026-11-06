# Güvenlik Gözden Geçirmesi (2026-11-06)

Kod okuması ve mevcut testlerle yapıldı. Sızma testi, otomatik tarayıcı (DAST) ve backend bağımlılık taraması yapılmadı.

## Kontrol edilenler ve sonuç

| Konu | Sonuç |
|---|---|
| Uç yetkileri | Firma uçlarının hepsinde `@PreAuthorize` var. İstisnalar bilerek: oturum uçları, kullanıcının kendi tercihleri, ana sayfa (yetkiye göre bölüm döner) ve dosya uçları (yetki iş katmanında, kayıt türüne göre). `/api/v1/admin/**` yalnız SaaS yöneticisine açık. |
| Firma yalıtımı | Token'daki firma istekteki firmayla eşleşmezse istek reddedilir; SaaS token'ı firma uçlarında, firma token'ı yönetim uçlarında geçmez. Yetkiler her istekte veritabanından okunur. Eşzamanlı istekte yalıtım testi var. |
| SQL enjeksiyonu | Sorgular parametreli. Biçimlendirilen tek değer şema adıdır; firma kodundan üretilir ve `^[a-z][a-z0-9-]{1,30}[a-z0-9]$` ile doğrulanır. |
| Dosyalar | İndirme her zaman ek olarak yapılır, silinen dosya açılmaz, yükleme sınırı 20 MB, ClamAV taraması var. |
| Kimlik | Şifre en az 10 karakter, 5 hatada 15 dk kilit, IP sınırı, 2FA, yenileme token'ı tekrar kullanılırsa oturum ailesi iptal edilir. |
| Hata yanıtları | Beklenmeyen hatada iç ayrıntı dönmez, yalnız iz kimliği döner. |
| Günlükler | Bağlantı ve şifre günlüğe yazılmaz; yalnız `dev`/`test` profilindeki sahte e-posta göndericisi bağlantıyı yazar. |
| Yanıt başlıkları | API: `nosniff`, `X-Frame-Options: DENY`, `no-store`. |
| Üretim ayarları | Swagger kapalı, actuator yalnız `health` ve `prometheus`. |

## Bu turda düzeltilenler

- **SaaS yöneticisi çıkışı token'ı geçersiz kılmıyordu.** Çıkıştan sonra token 1 saat daha geçerliydi. Artık çıkış token'ı sunucuda iptal eder (`admin.saas_revoked_token`), denetim günlüğüne `SAAS_LOGOUT` yazılır.
- **Rol açılış sayfası `//alan.adi` biçimine izin veriyordu.** Tarayıcı bunu başka siteye giden adres olarak yorumlayabilir. Artık yalnız uygulama içi yol kabul edilir.

## Açık kalanlar (önem sırasıyla)

1. **Yenileme token'ı `localStorage`'da.** Sayfada bir XSS açığı olursa token çalınabilir ve 30 gün kullanılabilir. Kodda `dangerouslySetInnerHTML`/`eval` yok, React içeriği kaçışlar. Öneri: üretimde sıkı CSP; orta vadede yenileme token'ını `HttpOnly` çereze taşımak (CSRF koruması ile birlikte).
2. **Frontend bağımlılıkları** (`npm audit`): `react-router` 6.x için açık yönlendirme ve SSR uyarıları (uygulama SSR kullanmıyor; kullanıcı girdisiyle yönlendirme yok), `zod` 3.x için büyük girdide bellek tüketimi (yalnız tarayıcıda form doğrulaması). Düzeltmeler ana sürüm yükseltmesi gerektiriyor (React Router 7, Zod 4); ayrı iş olarak planlanmalı.
3. **Backend bağımlılık taraması yapılmadı.** CI'a OWASP Dependency-Check veya benzeri eklenmeli.
4. **Frontend sunumu ve CSP.** Depoda üretim web sunucusu yapılandırması yok. Ters vekilde `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy` ve `Permissions-Policy` tanımlanmalı.
5. **Şube bazlı veri kısıtı yok.** Yetkili kullanıcı firmadaki bütün şubelerin verisini görür. İş kuralı olarak istenirse ayrı geliştirme gerekir.
6. **Prometheus ucu** SaaS yöneticisi token'ı ister; izleme sistemi için ayrı kimlik veya iç ağ erişimi düşünülmeli.
