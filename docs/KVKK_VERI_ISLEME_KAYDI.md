# KVKK Veri İşleme Kaydı — Taslak

> **Durum:** Teknik taslaktır, hukuki metin değildir. Sistemde gerçekte tutulan veriye göre yazılmıştır. Amaç, hukuki dayanak, saklama süresi, VERBİS
> yükümlülüğü ve aktarım bilgileri hukukçu tarafından doldurulup onaylanmalıdır.

Veri sorumlusu, sistemi kullanan firmadır. Blackrose bu verileri firma adına işleyen veri işleyen konumunda varsayılmıştır; bu varsayım da hukukçuyla doğrulanmalıdır.

| Veri grubu | Tutulan veri | Kaynak | Saklama süresi |
|---|---|---|---|
| Kullanıcı | Ad, e-posta, parola özeti, 2FA gizli anahtarı | Firma yöneticisi, kullanıcı | Hukukçu belirleyecek |
| Sürücü | Ad, belge türü ve bitiş tarihleri, avans ve harcırah | Firma | Hukukçu belirleyecek |
| Müşteri ve tedarikçi kişileri | Cari, CRM ve sefer kayıtlarındaki kişi ve iletişim bilgileri | Firma | Mali mevzuata göre belirlenecek |
| Sevkiyat | Gönderici, alıcı, teslim alan kişi adı | Firma, sürücü | Mali mevzuata göre belirlenecek |
| Konum | Araç konumu ve bölge olayları (sürücüyle ilişkilendirilebilir) | GPS kaydı | Belirlenmedi, otomatik silme yok |
| Denetim günlüğü | Kullanıcı e-postası, IP adresi, işlem, zaman | Sistem | Belirlenmedi, otomatik silme yok |
| Çevrimiçi durum | Kullanıcı kimliği ve son istek zamanı (yalnız bellekte, en çok 2 saat) | Sistem | 2 saat |

## Teknik önlemler (mevcut)
- Firma verisi ayrı veritabanı şemalarındadır; firmalar arası erişim yalnız SaaS yöneticisine açıktır ve her çağrı günlüğe yazılır.
- Parolalar özetlenerek saklanır. Dışa aktarımda parola, token ve gizli anahtar alanları yer almaz.
- Yetki her istekte veritabanından okunur.

## Açık konular
- Saklama süreleri ve otomatik silme/anonimleştirme yok.
- Kişi bazında (ilgili kişi) erişim ve silme talebi akışı yok; yalnız firma bazında dışa aktarım vardır.
- Firma verisinin fiziksel silinmesi yok; yasal saklama yükümlülükleriyle uzlaştırılmalı.
- Yedeklerin ve yüklenen dosyaların saklama ve şifreleme kuralları belirlenmedi.
- Sürücü konum takibi için aydınlatma metni ve açık rıza gerekip gerekmediği hukukçuya sorulmalı.
- Yurt dışına veri aktarımı (bulut, e-posta sağlayıcısı) barındırma kararından sonra değerlendirilmeli.
