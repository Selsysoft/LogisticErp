# KVKK Veri İşleme Kaydı — Taslak

> **Durum:** Teknik taslaktır, hukuki metin değildir. Sistemde gerçekte tutulan veriye göre yazılmıştır. Amaç, hukuki dayanak, saklama süresi, VERBİS
> yükümlülüğü ve aktarım bilgileri hukukçu tarafından doldurulup onaylanmalıdır.

Veri sorumlusu, sistemi kullanan firmadır. Blackrose bu verileri firma adına işleyen veri işleyen konumunda varsayılmıştır; bu varsayım da hukukçuyla doğrulanmalıdır.

| Veri grubu | Tutulan veri | Kaynak | Saklama süresi |
|---|---|---|---|
| Kullanıcı | Ad, e-posta, parola özeti, 2FA gizli anahtarı | Firma yöneticisi, kullanıcı | Hukukçu belirleyecek |
| Kullanıcı iş yeri kapsamı (Faz 12.1a) | Kullanıcının erişebildiği iş yerleri (`app_user.branch_scope` ALL/LIMITED, `user_branch`), varsayılan iş yeri; değişiklikler denetim günlüğüne yazılır (`USER_BRANCH_SCOPE_CHANGED`) | Firma yöneticisi | Kullanıcı kaydıyla birlikte |
| Şirket kartı (Faz 12.1a) | Firmanın fatura kestiği tüzel kişilerin unvanı, kısa adı, VKN **veya TCKN** (şahıs şirketi), vergi dairesi, MERSİS no, SGK iş yeri sicil no, adres, telefon, e-posta, web adresi, logo, varsayılan banka/kasa hesabı; şirket başına e-belge ayarı (sağlayıcı kullanıcı adı; şifre şifreli saklanır, yanıtta dönmez) | Firma yöneticisi | Mali mevzuata göre belirlenecek |
| Cari kartı (Faz 12.1) | Cari adı, vergi dairesi, VKN (düz) ya da bireysel carinin **TCKN'si (şifreli + hash + maskeli)**, açık adres (**şifreli**), il/ilçe/ülke/posta kodu (düz), telefon, e-posta, web adresi, yetkili kişi adı/unvanı/cep telefonu (düz, ticari iletişim), ödeme koşulları, notlar, kredi/risk limiti; değişiklikler denetim günlüğüne yalnız alan adlarıyla yazılır (`ACCOUNT_*`, değerler yazılmaz) | Firma | Mali mevzuata göre belirlenecek |
| Cari banka hesapları (Faz 12.1) | Banka adı, şube adı, IBAN ve hesap numarası (**şifreli**; IBAN ayrıca tekillik için HMAC hash'li; yanıtlarda maskeli), hesap sahibi adı, para birimi, açılış tarihi, açıklama | Firma | Mali mevzuata göre belirlenecek |
| Sürücü | Ad, belge türü ve bitiş tarihleri, avans ve harcırah | Firma | Hukukçu belirleyecek |
| Müşteri ve tedarikçi kişileri | Cari, CRM ve sefer kayıtlarındaki kişi ve iletişim bilgileri | Firma | Mali mevzuata göre belirlenecek |
| Sevkiyat | Gönderici, alıcı, teslim alan kişi adı | Firma, sürücü | Mali mevzuata göre belirlenecek |
| Konum | Araç konumu, bölge olayları ve sürücü işlemlerindeki konum damgası. Sürücü uygulamasında varsayılan kapalıdır, sürücü açar | GPS kaydı, sürücü | Belirlenmedi, otomatik silme yok |
| Teslim kanıtı | Teslim alanın adı, imzası ve teslim fotoğrafı | Sürücü | Mali mevzuata göre belirlenecek |
| Sürücü masrafı | Tutar, açıklama, fiş fotoğrafı | Sürücü | Mali mevzuata göre belirlenecek |
| Denetim günlüğü | Kullanıcı e-postası, IP adresi, işlem, zaman | Sistem | Belirlenmedi, otomatik silme yok |
| Çevrimiçi durum | Kullanıcı kimliği ve son istek zamanı (yalnız bellekte, en çok 2 saat) | Sistem | 2 saat |

## Teknik önlemler (mevcut)
- Firma verisi ayrı veritabanı şemalarındadır; firmalar arası erişim yalnız SaaS yöneticisine açıktır ve her çağrı günlüğe yazılır.
- Parolalar özetlenerek saklanır. Dışa aktarımda parola, token ve gizli anahtar alanları yer almaz.
- Yetki her istekte veritabanından okunur. İş yeri kapsamı (ALL/LIMITED) da her istekte okunur ve sunucuda uygulanır; LIMITED kullanıcı yalnız izinli iş yerlerinin kayıtlarını ve görünür şirketlerin kartlarını görür.
- **Şirket TCKN'si düz metin saklanır (kullanıcı kararı K-3, 2026-11-13).** Şahıs şirketinde `company.tax_number` bir TCKN'dir, yani kişisel veridir. Faz 12 kural 8 TCKN'nin şifreli + hash + maskeli tutulmasını ister; şirket kartı bu kuralın bilinçli istisnasıdır: numara navlun/depo faturası, teklif PDF'i ve e-belge (UBL göndericisi) üzerinde açık basılması yasal zorunluluk olan şirket kimliğidir ve kiracı içinde tekillik indeksi gerektirir. Erişim `BRANCH_VIEW` (görme) ve `COMPANY_MANAGE` (yönetim) izinleriyle sınırlıdır; eski e-Belgeler ayar ucu (`SHIPMENT_INVOICE`, kullanıcı kararı K-5) yalnız varsayılan şirketin vergi kimliği, vergi dairesi ve adresini okur/yazar. Değişiklikler denetim günlüğüne yazılır (`COMPANY_UPDATED`). Personel TCKN'si (Faz 12.9) bu istisnaya girmez.
- Şirket logosu yalnız PNG/JPEG (≤ 1 MB, içerik imzası denetlenir) kabul edilir ve yalnız şirket kartından yönetilir.
- **Cari kişisel verileri (Faz 12.1).** Cari adresi, cari banka hesabının IBAN'ı ve hesap numarası ile bireysel carinin TCKN'si (11 hane, `account.tax_number_enc`) AES-GCM ile şifreli saklanır (`PersonalDataProtector`, `Encryptors.delux`; anahtar mevcut `totpKey`, PII'ye özel ayrı tuz). IBAN ve TCKN için ayrıca tekillik/arama amaçlı HmacSHA256 hash (64 hex) tutulur; yanıtlarda maskeli değer döner (`TR33 **** 1326`, `****5678`, `*******0146`). Açık değer yalnız şu yerlerde çözülür: cari detayında ve banka hesabı düzenleme formunda `FINANCE_MANAGE` sahibine; CRM müşteri detayında `CRM_EDIT` sahibine (TCKN); e-belge (UBL) alıcı kimliği basımında. Listelerde adres hiç dönmez, TCKN maskelidir. Mevcut düz TCKN'ler uygulama açılışında idempotent olarak şifreli kolonlara taşınır (`AccountTaxNumberBackfill`).
- **VKN ve grup carisi düz kalır.** 10 haneli VKN tüzel kişi kimliğidir, kişisel veri değildir. Grup şirketi carisi (`INTERCOMPANY`) şirket kartının kopyasıdır ve K-3 istisnası kapsamında düz kalır.
- **Personel carileri** (sürücü/ofis) yalnız `FINANCE_EMPLOYEE_VIEW` iznine sahip kullanıcıya (Finans Süper, Patron) görünür; diğer finans ve CRM kullanıcılarına sunucuda 404 döner (varlığı sızdırılmaz). Personel adı e-postalarda da gizlenir: günlük özetin ödeme planı bölümleri ve ödeme planı onay/ret e-postaları personel carisinin adını yalnız bu izne sahip alıcıya yazar, diğerlerine genel "Cari" (tür de belirtilmez; 12.1 SEC-12.1-03). Eski ters kayıt ucu (`POST /finance/accounts/transactions/{id}/reverse`) da personel carisinin hareketi için izinsiz kullanıcıya 404 döner (SEC-12.1-06).
- **Kabul edilmiş risk — `IBAN_TAKEN` yan kanalı (SEC-12).** Aynı IBAN'ın iki aktif cari kartında bulunması engellenir; çakışmada yanıt her durumda aynı genel iletidir ve çakışan cari adı/kodu/kimliği dönmez. Kartı yazma yetkisi olan bir kullanıcının bir IBAN'ın sistemde kayıtlı olduğunu öğrenebilmesi kabul edilmiş kalan risktir (iş kuralı: mükerrer IBAN'ı önlemek).
- **Anahtar döndürme.** `totpKey` değişirse şifreli adres/IBAN/hesap no/TCKN ve hash'ler okunamaz/eşleşmez; anahtar değişikliği öncesinde tüm şifreli alanların eski anahtarla çözülüp yeni anahtarla yeniden yazılması (geçiş betiği) gerekir. Anahtar ortam değişkeninde tutulur, kaynakta yoktur.

## Açık konular
- Saklama süreleri ve otomatik silme/anonimleştirme yok.
- Kişi bazında (ilgili kişi) erişim ve silme talebi akışı yok; yalnız firma bazında dışa aktarım vardır.
- Firma verisinin fiziksel silinmesi yok; yasal saklama yükümlülükleriyle uzlaştırılmalı.
- Yedeklerin ve yüklenen dosyaların saklama ve şifreleme kuralları belirlenmedi.
- Sürücü konum takibi için aydınlatma metni ve açık rıza gerekip gerekmediği hukukçuya sorulmalı.
- Yurt dışına veri aktarımı (bulut, e-posta sağlayıcısı) barındırma kararından sonra değerlendirilmeli.
