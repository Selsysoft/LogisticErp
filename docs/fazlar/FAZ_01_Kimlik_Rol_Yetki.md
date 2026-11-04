# FAZ 1 — Kimlik, Rol ve Yetki (RBAC)

> **Uygulama Notu (2026-11-05) — Durum: kabul kriterleri karşılandı**
>
> **Yapılanlar:** Tenant kullanıcıları, roller ve izinler; davetle hesap açma; JWT + dönen refresh token; çıkış ve iptal;
> TOTP 2FA; hesap kilitleme; AuditLog; ayrı SaaS yöneticisi girişi. Ekranlar: giriş, şifre belirleme/sıfırlama, role göre
> açılış ve menü, kullanıcı yönetimi, izin matrisi, denetim günlüğü, hesabım.
>
> **Doğrulama:** GitHub Actions CI (`41919783388`) yeşil: Java 21 ile 9 birim + 32 entegrasyon testi, Spotless, container
> imajı; frontend lint, format, 11 test ve build. Tarayıcıda davet kabulü, giriş, rol bazlı açılış, menü filtreleme, yetkisiz
> ekran, kullanıcı daveti, çıkış ve sayfa yenilemede oturum korunması denendi. 2FA ekranı, rol düzenleme ekranı ve şifre
> sıfırlama ekranı tarayıcıda denenmedi; 2FA ve sıfırlama API tarafında testlidir. Gerçek SMTP gönderimi denenmedi.
>
> **Kararlar:** SSO (OIDC) MVP dışında. Sürücü rolü ve izni tohum veride var; taşeron portalı ve sürücü ekranları sonraki
> fazlarda (sürücü: Faz 10).
>
> **Sapmalar ve eklemeler:**
> - Kullanıcı ve izinler her istekte veritabanından okunur, önbellek yoktur; "anında etkili" kriterini çok sunuculu
>   kurulumda da güvenle sağlar.
> - Faz 0'daki admin API anahtarı kaldırıldı. Yerine `ADMIN_BOOTSTRAP_EMAIL/PASSWORD` ile oluşan SaaS yöneticisi geldi.
> - Yeni tenant açılırken yönetici e-postası zorunludur; yönetici davetle şifresini belirler.
> - Kullanıcı sahip olmadığı izni veremez, kendinden yetkiliyi değiştiremez; son aktif yönetici kaldırılamaz.
> - Tohum rol-izin eşlemesi varsayımdır, tenant içinde ekrandan değiştirilebilir (Patron kilitli).
> - `X-Tenant-Code` başlığı yalnız `/api/v1/auth/` uçlarında geçerlidir.
>
> **Açık konular:** SaaS yöneticisinde 2FA ve refresh token yok. IP bazlı istek sınırı yok, bu yüzden hesap kilitleme
> bilinen bir e-postaya karşı kötüye kullanılabilir. Yenileme token'ı localStorage'dadır. Yönetici davet e-postası
> gönderilemezse yeniden gönderme yolu yoktur (Faz 11). Prometheus ucu artık SaaS yetkisi istiyor; izleme kurulurken
> ele alınmalı. Vekil sunucu arkasında gerçek istemci IP'si için ayar gerekecek.

**Amaç:** Kullanıcı yönetimi, kimlik doğrulama (JWT/OIDC), rol/izin modeli ve modül bazlı
yetkilendirme; rol-bazlı açılış ekranı ve menü.

**Bağımlılık:** Faz 0. | **Çıktı:** Güvenli giriş, roller, izinle korunan uçlar, React auth akışı.

---

## Kapsam / Görevler

1. **Kullanıcı & kimlik:** `User` (tenant'a bağlı), parola (BCrypt), e-posta doğrulama, parola
   sıfırlama; SaaS yöneticisi (admin şeması) ayrı kullanıcı havuzu.
2. **Oturum:** JWT erişim (kısa) + yenileme (refresh) token; token iptali/çıkış; opsiyonel 2FA (TOTP).
   İzinler token'a gömülmez; refresh token veritabanında tutulur; çıkışta `jti` iptal listesine girer.
   JWT `tenant` claim çözümleyicisi burada eklenir (öncelik subdomain'de).
3. **RBAC:** `Permission` (sabit kod listesi, örn. `FINANCE_PAYMENT_CREATE`, `SHIPMENT_DISPATCH`),
   `Role` (izin kümesi, tenant'a özel düzenlenebilir), `User`↔`Role`. Uçlarda `@PreAuthorize`.
4. **Önerilen roller (tohum veri):** Patron/Yönetici, Finans (Süper), Finans, Muhasebe,
   Operasyon/Sevkiyat, Satış/CRM, Filo Yöneticisi, Depo Sorumlusu, Gümrük/Dış Ticaret, Sürücü.
5. **Rol-bazlı yönlendirme:** Giriş sonrası role göre açılış ekranı + izne göre menü (React route guard).
6. **Denetim:** Giriş/çıkış, yetki reddi, hassas işlem logu (AuditLog).
7. **Kullanıcı yönetimi UI:** Kullanıcı CRUD, rol atama, izin matrisi görünümü (yalnız yetkili).

## Kabul Kriterleri

- [x] İzni olmayan kullanıcı korumalı uca 403 alır; izni olan 200.
- [x] JWT süresi dolunca refresh ile yenilenir; çıkışta token geçersizleşir.
- [x] Rol-izin değişikliği anında yeni isteklerde etkili.
- [x] Subdomain ile JWT `tenant` claim farklıysa istek 403 alır — testle doğrulanır.
- [x] Rol-bazlı açılış: Finans kullanıcısı finans ekranına, Operasyon sevkiyat ekranına düşer.
- [x] Yetki reddi ve giriş olayları AuditLog'a yazılır.
- [x] 2FA açık kullanıcı ikinci faktör olmadan giriş yapamaz (etkinse).

## ERP Referansı
`AccountController` (login, rol çözümleme, claim set — NameIdentifier/account-kind master/sub-user),
`LanguageController`/`HomeController` rol switch yönlendirmeleri, `AdminSystemPolicy` (master yetki
deseni). Yeni platformda bunların JWT + `@PreAuthorize` karşılığı.

## Açık Sorular
- ~~SSO/kurumsal kimlik MVP'de gerekli mi?~~ Karar: MVP dışında.
- ~~Taşeron/sürücü portal kullanıcısı MVP'de mi?~~ Karar: Sürücü rolü hazır, ekranlar sonraki fazlarda.
