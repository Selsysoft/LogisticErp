# FAZ 1 — Kimlik, Rol ve Yetki (RBAC)

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

- [ ] İzni olmayan kullanıcı korumalı uca 403 alır; izni olan 200.
- [ ] JWT süresi dolunca refresh ile yenilenir; çıkışta token geçersizleşir.
- [ ] Rol-izin değişikliği anında yeni isteklerde etkili.
- [ ] Subdomain ile JWT `tenant` claim farklıysa istek 403 alır — testle doğrulanır.
- [ ] Rol-bazlı açılış: Finans kullanıcısı finans ekranına, Operasyon sevkiyat ekranına düşer.
- [ ] Yetki reddi ve giriş olayları AuditLog'a yazılır.
- [ ] 2FA açık kullanıcı ikinci faktör olmadan giriş yapamaz (etkinse).

## ERP Referansı
`AccountController` (login, rol çözümleme, claim set — NameIdentifier/account-kind master/sub-user),
`LanguageController`/`HomeController` rol switch yönlendirmeleri, `AdminSystemPolicy` (master yetki
deseni). Yeni platformda bunların JWT + `@PreAuthorize` karşılığı.

## Açık Sorular
- SSO/kurumsal kimlik (Google/Microsoft OIDC) MVP'de gerekli mi?
- Taşeron/sürücü için ayrı sınırlı portal kullanıcısı tipi MVP'de mi, sonraki fazda mı?
