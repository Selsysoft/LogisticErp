# ZTO Finans — Tarayıcıda Elle Test Rehberi (Faz 12.0 – 12.2a)

> Koddan çıkarılıp koda karşı doğrulandı (2026-11-15). Ekran metinleri `frontend/src/locales/tr` ve e2e testlerinden alındı. "Doğrulanamadı" notu olan adımlarda ekran metni farklı olabilir.

İçindekiler: 0. Kurulum, giriş ve test verisi · 1. Faz 12.0 + 12.1a — ZTO kabuğu, şirket/şube/iş yeri, günlük cari işlemleri · 2. Faz 12.1 — Cari kartlar, IBAN, Borç/Alacak, devir, taşıma, ekstre · 3. Faz 12.2 — Banka/kasa, transfer merkezi, döviz bozumu, uyarılar · 4. Faz 12.2a — Ödemeler ve tahsilatlar (geliştirme bitince test edin)


---

## 0. Kurulum, giriş ve test verisi

### Başlatma adımları

- 0) ÖNCE BEKLEYİN. Arka plandaki Claude iş akışı (12.2a) bitmeden backend'i başlatmayın, çünkü iki sorun çıkar. (a) `mvn spring-boot:run` de backend/target klasörüne derler; iş akışının `mvn verify` adımıyla çakışırsa ikisi de bozulur. (b) V35__settlement_details.sql ve V36__settlement_allocation.sql henüz commit edilmedi (git status: '??') ve düzeltme adımında yeniden değişebilir. Değişmeden önce veritabanına uygulanırlarsa Flyway checksum hatası verir ve firma 'Hatalı' (FAILED) olur. İş akışının bittiğini şunlardan anlarsınız: Claude'un raporu gelmiştir; `git for-each-ref refs/checkpoints` çıktısında `refs/checkpoints/12.2a` vardır (şu an yalnız 12.1, 12.1-uygulama, 12.1a, 12.2 ve `12.2a-kismi` var); `docker ps` çıktısında testcontainers-ryuk ve rastgele adlı postgres/s3mock konteynerleri kalmamıştır (şu an 2 postgres:16-alpine, 1 adobe/s3mock ve 2 testcontainers/ryuk çalışıyor).
- 1) Ön kontrol (PowerShell). Bu makinede yerel PostgreSQL 15 servisi kurulu (C:\Program Files\PostgreSQL\15). `Get-Service postgresql-x64-15` ile bakın. Running ise 5432 portu çakışır; `Stop-Service postgresql-x64-15` ile durdurun. Portları denetlemek için: `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5432,8080,5173 }`.
- 2) Veritabanı: `cd 'f:/visual studio zto/LogisticErp'; docker compose up -d --wait`. docker-compose.yml varsayılan olarak YALNIZ `postgres` servisini açar (postgres:16-alpine, 127.0.0.1:5432; veritabanı, kullanıcı ve şifre: blackrose; birim `postgres-data`). mailpit, s3mock ve clamav `uretim` profilindedir; elle test için gerekmez. Bu makinede blackrose-backend ve blackrose-web konteyneri YOK; YEREL_CALISTIRMA.md'deki `docker stop blackrose-backend blackrose-web` notu burada geçersiz. Postgres adlı bir dev birimi de yok, yani ilk `up` boş bir veritabanı açar.
- 3) Backend, 1. PowerShell penceresi: `cd 'f:/visual studio zto/LogisticErp/backend'; mvn spring-boot:run '-Dspring-boot.run.profiles=dev' | Tee-Object -FilePath $env:TEMP/blackrose-backend.log`. Tırnak şart: Windows PowerShell 5.1 noktalı `-D...` argümanını bölebilir. JDK 21 kurulu olduğundan `-Djava.version=17` gerekmez. Tee-Object, davet bağlantısını sonradan aramak içindir. Açılışta admin şeması (admin V1–V8) ve mevcut her firmanın şeması (tenant V1–V36) Flyway ile otomatik güncellenir (TenantMigrationRunner). Uygulama hazır olunca TCMB kurları bir kez çekilir (RateRefresher, ApplicationReadyEvent; TCMB_ENABLED varsayılanı true). İnternet gerekir.
- 4) Backend hazır mı: `Invoke-RestMethod http://localhost:8080/api/v1/ping`. Hazırsa yanıt `{status: ok}` olur. Açılış adımları (SaaS yöneticisi, firma migration'ları) sürerken 503 ve `{status: starting}` döner; birkaç saniye sonra yeniden deneyin. Günlükte 'Tenant migration başarısız' satırı OLMAMALI.
- 5) Frontend, 2. PowerShell penceresi: `cd 'f:/visual studio zto/LogisticErp/frontend'; npm run dev`. node_modules mevcut; package-lock değiştiyse önce `npm ci`. Vite 5173 portunda açılır ve /api isteklerini http://localhost:8080'e yönlendirir (vite.config.ts proxy). Ayrı bir .env dosyası gerekmez.
- 6) Davet ve şifre bağlantılarını bulmak: dev profilinde e-posta gönderilmez; MailConfig bağlantıyı backend günlüğüne '[DEV] Davet bağlantısı <e-posta>: <bağlantı>' biçiminde yazar (şifre sıfırlamada '[DEV] Şifre sıfırlama bağlantısı …'). Aramak için: `Select-String -Path $env:TEMP/blackrose-backend.log -Pattern 'DEV\] Davet'`.
- 7) (İsteğe bağlı) acme firmasını tarayıcı yerine API ile açmak: `$t = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/admin/auth/login -ContentType 'application/json' -Body '{"email":"admin@blackrose.local","password":"Dev-Admin-12345"}'; Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/v1/admin/tenants -Headers @{Authorization = ('Bearer ' + $t.accessToken)} -ContentType 'application/json' -Body '{"code":"acme","name":"Acme Lojistik","defaultCurrency":"TRY","timeZone":"Europe/Istanbul","ownerEmail":"patron@acme.test","ownerFullName":"Firma Sahibi"}'`. Firma kodu küçük harfle başlamalı (desen ^[a-z][a-z0-9-]{1,30}[a-z0-9]$). Adı ASCII tutun; PS 5.1 Türkçe karakterleri bozabilir.
- 8) Sıfırdan başlamak: `docker compose down -v; docker compose up -d --wait`, ardından backend'i yeniden başlatın. -v veritabanını SİLER; acme firması ve tüm kullanıcılar yeniden açılmalıdır. Temiz başlangıç, 'Hatalı' kalan bir firmayla uğraşmaktan daha güvenlidir.
- 9) Kapatma: iki pencerede Ctrl+C, sonra `docker compose stop` (veri kalır) ya da `docker compose down` (konteyner silinir, birim kalır).
- 10) Bellek (16 GB): Docker Desktop, backend JVM, Vite, tarayıcı ve IDE birlikte çalışabilir. Ama elle test sırasında `mvn verify` veya `docker compose -f docker-compose.e2e.yml up` ÇALIŞTIRMAYIN; YEREL_CALISTIRMA.md'ye göre Testcontainers'la birlikte bellek tükenebilir.
- 11) Alternatif, ÖNERİLMEZ: `docker compose -f docker-compose.e2e.yml up -d --build` güncel kaynaktan nginx+backend imajı kurar. Ancak veritabanı kalıcı değildir ve eski imajlar 12.2a'yı içermez; --build olmadan kullanmayın.


### Ortam açılış denetimi

- **Adres:** `/api/v1/ping`
- **Menü:** Tarayıcı adres çubuğu: http://localhost:8080/api/v1/ping, ardından http://localhost:5173
- **Kullanıcı:** Oturum gerekmez

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | http://localhost:8080/api/v1/ping adresini açın | Hazırsa 200 ve {"status":"ok"} döner. Açılış sürerken 503 ve {"status":"starting"} döner. 'Bağlanılamadı' görürseniz backend açılmamıştır ya da 5432/8080 çakışması vardır. |
| 2 | http://localhost:5173 adresini açın | /login sayfasına yönlenir: başlık 'Giriş yap', alt yazı 'Nakliye ve Lojistik Yönetim Sistemi'; alanlar 'Firma kodu', 'E-posta', 'Şifre'; bağlantı 'Şifremi unuttum'. |
| 3 | Backend penceresinde 'Tenant migration başarısız' ve Flyway hata satırlarını arayın | Hiçbiri olmamalı. Varsa firma FAILED olur: SaaS konsolunda Durum 'Hatalı' görünür ve o firmaya giriş yapılamaz. |

**Kontrol edilecek kurallar:**
- İlk açılışta veritabanı boştur. Otomatik oluşan tek hesap SaaS yöneticisidir (admin@blackrose.local / Dev-Admin-12345, application-dev.yml). acme firması, patron@acme.test ve finans@acme.test bu makinede ŞU AN YOK; YEREL_CALISTIRMA.md'deki tablo eski bir veritabanına aitti. Backend kodunda dev seed/Demo sınıfı yoktur.

**Bilinen eksikler / sonraki faza kalanlar:**
- docs/YEREL_CALISTIRMA.md hesap tablosu, hesaplar otomatik oluşuyormuş gibi okunuyor. Gerçekte acme, patron ve finans hesapları elle açılmalıdır (aşağıdaki sayfalar).

**Doğrulanamadı:**
- Backend açılış süresi bu makinede ölçülmedi.

### SaaS konsolunda acme firmasını açma

- **Adres:** `/saas/login → /saas`
- **Menü:** http://localhost:5173/saas/login → 'Firmalar' sekmesi → 'Yeni firma'
- **Kullanıcı:** admin@blackrose.local / Dev-Admin-12345. Dev'de iki adımlı doğrulama kapalıdır (saas-two-factor-required=false).

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | /saas/login'de ('SaaS yönetici girişi') E-posta ve Şifre alanlarını doldurup 'Giriş yap'a tıklayın | 'Blackrose SaaS Yönetimi' konsolu açılır. Sekmeler: Firmalar, Planlar, Faturalar, Sistem sağlığı, Denetim günlüğü. Firmalar listesi boştur. |
| 2 | 'Yeni firma'ya tıklayın ve formu doldurun: Firma kodu = acme, Ad = Acme Lojistik, Yönetici e-postası = patron@acme.test, Yönetici adı = Firma Sahibi. Plan alanını boş bırakın; Deneme süresi (gün) 14 olarak gelir. 'Kaydet'e tıklayın | Listede acme satırı görünür, Durum 'Etkin'. Para birimi (TRY) ve saat dilimi (Europe/Istanbul) formda yoktur, kodda sabittir. Plan boş bırakılırsa sunucu 'Deneme' (DENEME) planını seçer. |
| 3 | Backend günlüğünde '[DEV] Davet bağlantısı patron@acme.test: …' satırını bulun | http://localhost:5173/set-password?token=… biçiminde bir bağlantı. |

**Kontrol edilecek kurallar:**
- Firma açılırken tenant şeması V1–V36 ile kurulur. Otomatik oluşanlar: varsayılan şirket (V23: kod SIRKET1, unvan ve kısa ad firma adından 'Acme Lojistik', Varsayılan), 14 cari hesap grubu (V27), Borç/Alacak belge türleri (V28), gider türleri, belge serileri, finans ayarları, roller ve izinler.
- OTOMATİK OLUŞMAYANLAR: şube, iş yeri, kasa, banka, cari ve hareket. Hepsi elle girilir.
- 'Deneme' planının sınırları: en çok 10 kullanıcı, 25 araç ve ayda 200 sefer. Şirket ve iş yeri sınırı NULL, yani sınırsız. 2–3 şirketli test buna takılmaz.

**Doğrulanamadı:**
- Plan açılır listesinin kaydedilmiş planları adıyla ('Deneme') gösterdiği koddan görülüyor, ancak ekranda denenmedi.

### Şifre belirleme ve giriş

- **Adres:** `/set-password ve /login`
- **Menü:** Davet bağlantısı → 'Şifre belirle'; ardından http://localhost:5173/login
- **Kullanıcı:** patron@acme.test (Demo-Acme-2026 şifresini ilk kurulumda siz belirlersiniz)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Günlükteki davet bağlantısını tarayıcıda açın. 'Yeni şifre' ve 'Yeni şifre (tekrar)' alanlarına Demo-Acme-2026 yazıp 'Şifreyi kaydet'e tıklayın | 'Şifreniz kaydedildi. Giriş yapabilirsiniz.' görünür. Kural: en az 10 karakter, harf ve rakam içermeli. Şifreler farklıysa 'Şifreler aynı değil.' yazar. |
| 2 | /login'de Firma kodu = acme, E-posta = patron@acme.test, Şifre = Demo-Acme-2026 girip 'Giriş yap'a tıklayın | Patron, rolünün açılış sayfası /dashboard'a ('Ana Sayfa') düşer. Sol menüde Ana Sayfa, Finans, ZTO Finans, Operasyon, Satış/CRM, Filo, Depo, Gümrük, Sürücü, Entegrasyonlar ve Raporlar; altında Kullanıcılar, Roller ve İzinler, Denetim Günlüğü ve Abonelik görünür. |

**Kontrol edilecek kurallar:**
- localhost'ta alt alan adı yoktur; firma kodu formdan alınır.
- Tek şirket varken üst çubukta 'Aktif şirket' seçicisi görünmez (e2e multi-company.spec).

### Kullanıcı daveti: finans ve isteğe bağlı finans-süper

- **Adres:** `/users`
- **Menü:** Sol menü → 'Kullanıcılar' → 'Kullanıcı davet et'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Kullanıcı davet et'e tıklayın. E-posta = finans@acme.test, Ad soyad = Finans Kullanıcısı. 'Roller' altında 'Finans' onay kutusunu işaretleyin ve 'Kaydet'e tıklayın | 'Davet gönderildi.' mesajı çıkar. Listede Durum 'Davet edildi', 'İş Yerleri' sütunu 'Tümü'. Rol seçmezseniz 'En az bir rol seçin.' yazar. |
| 2 | Günlükten '[DEV] Davet bağlantısı finans@acme.test' bağlantısını açın ve şifreyi Demo-Acme-2026 yapın | 'Şifreniz kaydedildi. Giriş yapabilirsiniz.' |
| 3 | (Önerilir) Aynı yolla finanssuper@acme.test kullanıcısını 'Finans (Süper)' rolüyle davet edin | Personel cari kuralını patron dışındaki yetkili bir finans kullanıcısıyla da sınamaya yarar. |
| 4 | (İsteğe bağlı, iş yerleri girildikten sonra) Kullanıcı satırında 'Düzenle' → 'İş Yeri Yetkisi' sekmesi → 'Seçili iş yerleri' → bir iş yeri seçip 'Kaydet'e tıklayın, ardından pencereyi 'Vazgeç' ile kapatın | 'İş yeri yetkisi kaydedildi.' mesajı çıkar ve satırda 'Sınırlı' görünür. O kullanıcı formlarda yalnız izinli iş yerini görür. |

**Kontrol edilecek kurallar:**
- FINANCE ('Finans') rolünün tohum izinleri: FINANCE_VIEW, FINANCE_MANAGE, FINANCE_PAYMENT_CREATE, BRANCH_VIEW, SHIPMENT_VIEW/INVOICE, WAREHOUSE_VIEW/INVOICE, REPORT_VIEW, INTEGRATION_VIEW. FINANCE_APPROVE, FINANCE_EMPLOYEE_VIEW, COMPANY_MANAGE ve BRANCH_MANAGE YOKTUR.
- FINANCE_SUPER ('Finans (Süper)'): yukarıdakilere ek olarak FINANCE_APPROVE, COMPANY_MANAGE (V22), FINANCE_EMPLOYEE_VIEW (V27) ve SUBSCRIPTION_VIEW (V12). BRANCH_MANAGE tohumu yalnız PATRON'da var.
- PATRON ('Patron/Yönetici') kilitli roldür ve tüm izinleri koddan alır (FINANCE_EMPLOYEE_VIEW dahil).
- Personel carileri yalnız FINANCE_EMPLOYEE_VIEW sahibine (patron, finans-süper) görünür; finans@acme.test görmemelidir (backend AccountAccess, ön yüz useCan).
- Finans ve Finans (Süper) rollerinin açılış sayfası /finance'tır (eski MUI Finans). ZTO ekranları için sol menüden 'ZTO Finans'a geçilir.

### ZTO Finans'a giriş, yan menü ve eski MUI Finans'tan farkı

- **Adres:** `/zto-finans (→ /zto-finans/cari-hareketler) ve /finance`
- **Menü:** Sol Blackrose menüsü → 'ZTO Finans' (izin FINANCE_VIEW). Sayfa içinde sol kenardaki ok (aria-label 'Finans menüsünü aç/kapat'): fareyle üzerine gelince ya da tıklayınca 'FİNANS İŞLEMLERİ' yan menüsü açılır; Esc kapatır.
- **Kullanıcı:** patron@acme.test ve finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sol menüden 'ZTO Finans'a tıklayın | /zto-finans/cari-hareketler açılır, başlık 'Günlük Tüm Cari İşlemleri'. Ekran MUI değil, ZTO görünümündedir. |
| 2 | Sol kenardaki oka gelip yan menüyü açın | Bölümler: CARİ İŞLEMLERİ, BANKA & KASA İŞLEMLERİ, ÖDEME & TAHSİLAT, ÖDEME PLANLAMA İŞLEMLERİ, FİNANSAL İŞLEMLER, KREDİ & YATIRIM, NAKLİYE MASRAF İŞLEMLERİ, İŞÇİLİK & GENEL MASRAF İŞLEMLERİ, MÜŞTERİ ALACAK İŞLEMLERİ, E-DÖNÜŞÜM, TEMEL TANIMLAR. Dev sunucusunda ayrıca GELİŞTİRME › 'Bileşen vitrini' görünür. |
| 3 | Tıklanabilir öğeleri sayın | Etkin olanlar: Günlük Cari İşlemleri, Hızlı Cari İşlemi (modal açar), Cari Kartlar, Yeni Cari Kart (FINANCE_MANAGE ister; finans kullanıcısında da var), Bankalar, Tüm Banka Hareketleri, Kasalar, Tüm Kasa Hareketleri, 'Banka & Kasa Transferi & Virman & Döviz Bozum', Ödemeler, Tahsilatlar, İş Yerleri, Şubeler, Şirketler (son üçü BRANCH_VIEW ister; finans kullanıcısında da var). |
| 4 | Pasif bir öğenin (ör. 'Çekler') üzerine gelin | Tıklanmaz; yanında 'Faz 12.3' etiketi, ipucunda 'Bu ekran Faz 12.3 ile gelecek.' yazar. |
| 5 | finans@acme.test ile /zto-finans/tanimlar/sirketler/yeni adresini doğrudan açın | 'Bu sayfaya erişim yetkiniz bulunmuyor.' yazar. Şirketler, Şubeler ve İş Yerleri listeleri açılır ama 'Yeni Kayıt' düğmesi görünmez. |
| 6 | Sol Blackrose menüsünden 'Finans'a (eski MUI, /finance) geçin ve ZTO'da girdiğiniz bir kaydı arayın (ör. /finance/settlements, /finance/funds, /finance/accounts) | Aynı veri görünür; iki arayüz tek finans motorunu ve aynı tabloları kullanır. ZTO'da yazılan ödeme MUI listesinde de çıkar. |
| 7 | Geliştirici Araçlarında (F12) Console ve Network sekmelerini (filtre /api/v1) açık tutarak gezin | Kırmızı JS hatası veya CSP ihlali olmamalı; Network'te hiç 5xx görünmemeli. Bazı 4xx yanıtları iş kuralı gereği normaldir: oturum yenilemede 401, ödeme uyarısında 409 CONFIRMATION_REQUIRED, doğrulama hatalarında 400/422, finans kullanıcısının yetkisiz uçlarında 403. |

**Kontrol edilecek kurallar:**
- Eski MUI finans ekranları (/finance/...) korunur; ZTO ekranları ek bir görünümdür (kullanıcı kararı).
- Yetkisiz ZTO rotasında 'Bu sayfaya erişim yetkiniz bulunmuyor.', MUI tarafında 'Yetkiniz yok' görünür.
- ZTO CSS'i MUI ekranlarına sızmamalı: ZTO'yu açtıktan sonra /finance veya /dashboard'a dönünce yazı tipi, düğmeler ve boşluklar değişmemeli (e2e assertNoZtoCssLeak).

**Bilinen eksikler / sonraki faza kalanlar:**
- Pasif öğeler ve gelecekleri faz: Finans Raporları (12.8), Personel Yönetimi (12.9), Çekler ve Senetler (12.3), Tüm Planlamalar ve Ödeme Onay Yönetimi (12.4), Hızlı Bakiye Özeti ve Finansal Varlıklar & Bilanço (12.8), Krediler (12.5), Vadeli Mevduatlar (12.6), Sevk İhracat Nakliye Hesapları ve Genel Masraf Hesapları (12.7), Müşteri Alacak Hesapları (12.5), Uyumsoft İşlem Takibi, Gelen e-Faturalar ve Uyumsoft Ayarları (12.10).
- 'Bileşen vitrini' yalnız `npm run dev`'de görünür; geliştirici vitrinidir ve test kapsamı dışındadır.

### Test verisi kurulumu, 1. adım: şirket, şube, iş yeri

- **Adres:** `/zto-finans/tanimlar/sirketler → /zto-finans/tanimlar/subeler → /zto-finans/tanimlar/is-yerleri`
- **Menü:** ZTO Finans yan menüsü → TEMEL TANIMLAR → Şirketler / Şubeler / İş Yerleri → 'Yeni Kayıt'
- **Kullanıcı:** patron@acme.test. Şirket eklemek COMPANY_MANAGE, şube ve iş yeri eklemek BRANCH_MANAGE ister; finans@acme.test bunları ekleyemez.

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Şirketler ('Şirket Listesi'): otomatik gelen 'Acme Lojistik' satırını (Kod SIRKET1, 'Varsayılan' rozeti) görün. 'Yeni Kayıt'a tıklayın ve Kod = BETA, Unvan = Beta Nakliyat Ltd. Şti., Kısa Ad = Beta Nakliyat girin; VKN/TCKN boş kalabilir. 'Yeni Şirket Oluştur'a tıklayın | 'Şirket oluşturuldu.' mesajı çıkar. Kod yalnız büyük harf, rakam, - ve _ alır, en çok 20 karakter ('Kod yalnız büyük harf, rakam, - ve _ içerebilir (en çok 20).'). VKN girilirse sağlama denetimi yapılır ('Vergi numarası geçersiz.'). |
| 2 | (İsteğe bağlı) Üçüncü şirketi açın: Kod = GAMA, Unvan = Gama Depo A.Ş., Kısa Ad = Gama Depo | Kullanıcı kararıyla 2–3 tüzel kişi kurulmuş olur. |
| 3 | Üst çubuğa bakın; seçici görünmezse sayfayı yenileyin (F5) | ≥2 aktif şirket olunca 'Aktif şirket' seçicisi çıkar. Seçenekler: 'Tüm şirketler (konsolide)' ve şirket kısa adları. Şirket kaydı oturum bilgisini (me) yeniden yükler, bu yüzden F5 çoğu zaman gerekmez. |
| 4 | ZTO Finans → Cari Kartlar'a gidin | İkinci şirket açılınca sistem her aktif şirket için 'Grup Şirketi' grubunda bir cari açar: GS-SIRKET1 (Acme Lojistik) ve GS-BETA (Beta Nakliyat). Bu kartlar elle değiştirilemez ve silinemez; şirketler arası virman bunlara yazar. |
| 5 | Şubeler ('Şube Listesi'): 'Yeni Kayıt' → Şirket = Acme Lojistik (alan yalnız ≥2 şirkette görünür ve zorunludur), Şube Adı = İzmir Bölge, Şube Tipi = Ana Şube → 'Yeni Şube Oluştur'. İkinci kayıt: Şirket = Beta Nakliyat, Şube Adı = İstanbul Bölge | 'Şube kaydedildi.' mesajı çıkar ve listede iki satır görünür. Şube Tipi seçenekleri: 'Ana Şube', 'Yan Şube'. |
| 6 | İş Yerleri ('İş Yerleri Listesi'): 'Yeni Kayıt' → Şirket = Acme Lojistik (yalnız ≥2 şirkette, zorunlu; değişince Şube seçimi sıfırlanır), Şube = İzmir Bölge, Ad = Alsancak Ofis, Telefon Numarası = 02321112233, Adres = Alsancak İzmir, Konum (isteğe bağlı) = 38.4237,27.1428 → 'Yeni İş Yeri Oluştur'. İkinci kayıt: Şirket = Beta Nakliyat, Şube = İstanbul Bölge, Ad = Hadımköy Depo | 'İş yeri oluşturuldu.' mesajı çıkar. Telefon en çok 11 rakam alır ('Telefon numarası en çok 11 rakam olmalıdır.'). Konum 'enlem,boylam' biçiminde olmalıdır. 'Haritada Göster' Google Haritalar'ı açar. Şube listesi boşsa 'Önce Şube tanımlayın.' ve 'Şube ekle' bağlantısı görünür. |

**Kontrol edilecek kurallar:**
- Hiyerarşi Şirket → Şube → İş Yeri'dir (MX5). İş yeri formunda Ad, Telefon, Şube ve Adres zorunludur; ≥2 şirkette Şirket de zorunludur.
- ≥2 şirket varken seçim listeleri şirketi gösterir: MUI ekranlarında 'Şirket › İş yeri', ZTO seçicilerinde 'Şirket › Şube' grup başlığı.
- Kasa/banka kaydı iş yeri ister (CreateFundRequest.branchId @NotNull); bu yüzden iş yeri kasadan ÖNCE açılmalıdır.
- Silme pasifleştirmedir: 'Sil' sonrası kayıt 'Pasifleri göster' ile görünür ve 'Aktifleştir' ile geri alınır. İş yeri bağlı şube silinirken 'Önce iş yerlerini taşıyın.' uyarısı çıkar.

**Doğrulanamadı:**
- Şirket kaydından sonra seçicinin F5'siz hemen çıktığı: kodda invalidateOrganization(reloadMe) çağrısı var, tarayıcıda denenmedi.

### Test verisi kurulumu, 2–4. adım: kur, kasa/banka, cari, borç belgesi ve ilk hareketler

- **Adres:** `/finance/definitions, /zto-finans/kasalar, /zto-finans/bankalar, /zto-finans/cari-kartlar/yeni, /zto-finans/cari-kartlar/:id/hareketler, /zto-finans/odemeler, /zto-finans/tahsilatlar, /zto-finans/transfer-merkezi`
- **Menü:** Kur: sol menü 'Finans' → 'Tanımlar' sekmesi → 'Son kurlar' bölümü → 'Kurları güncelle'. Diğerleri: ZTO Finans yan menüsü.
- **Kullanıcı:** Kurulum patron@acme.test ile yapılır. Hareketleri finans@acme.test ile de deneyin; personel kuralını finans@ ve finanssuper@ ile karşılaştırın.

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Döviz kuru: /finance/definitions'ta 'Son kurlar' bölümüne bakın; boşsa 'Kurları güncelle'ye tıklayın (FINANCE_MANAGE ister) | TCMB kurları (USD, EUR…) görünür. Kurlar backend açılışında ve hafta içi 15:45, 16:45 ve 17:45'te de otomatik çekilir. İnternet yoksa kur gelmez; dev'de sahte kur tohumu yoktur. |
| 2 | Kasalar: 'Yeni Kasa' ile her şirkete en az bir kasa açın (ör. Acme TL Kasa → İş Yeri Alsancak Ofis; Beta TL Kasa → Hadımköy Depo). Para Birimi, Başlangıç Bakiyesi ve Başlangıç Tarihi girip 'Yeni Kasa Oluştur'a tıklayın | 'Kasa başarıyla oluşturuldu.' mesajı çıkar. Kasa, iş yeri üzerinden şirkete bağlanır. |
| 3 | Dövizli kasa: Acme USD Kasa açın ve başlangıç bakiyesi girin; 'Açılış Kuru (₺)' alanını önce boş bırakın | Boş bırakılırsa başlangıç tarihindeki TCMB kuru kullanılır. Kur tablosu boşsa 'Başlangıç tarihi için kur bulunamadı; açılış kurunu giriniz.' yazar; bu durumda kuru elle girin. |
| 4 | Bankalar ('Banka Hesapları'): 'Yeni Vadesiz Hesap' ile Acme için bir TL banka hesabı (İş Yeri Alsancak Ofis) ve Beta için bir TL banka hesabı (İş Yeri Hadımköy Depo) açın; 'Yeni Banka Oluştur'a tıklayın | 'Vadesiz hesap başarıyla oluşturuldu.' mesajı çıkar. IBAN girilirse TR IBAN denetlenir ('Geçerli bir TR IBAN giriniz.'). Eksi açılış bakiyesi yalnız 'Eksi bakiyeye izin ver' işaretliyse kabul edilir. |
| 5 | Şirket bazlı kasa/banka: üst çubuktaki 'Aktif şirket' seçicisinden 'Beta Nakliyat'ı seçin, sonra 'Tüm şirketler (konsolide)'ye dönün (MUI /finance/funds ve ZTO Kasalar/Bankalar ekranları) | Beta seçiliyken yalnız Beta'nın kasa ve bankaları listelenir. Konsolide seçimde hepsi görünür. Seçim F5 sonrasında da korunur. |
| 6 | Cariler: 'Yeni Cari Kart' ile en az şu kartları açın: Hesap Grubu 'Müşteri', 'Tedarikçi', 'Nakliye Firması' (taşeron nakliyeci) ve 'Personel (Ofis)'. Zorunlu alanlar Hesap Grubu, Varsayılan İş Yeri, Hesap Adı ve Para Birimi. 'Şirket' alanını 'Tüm şirketler (ortak kart)' bırakın ve 'Kaydet'e tıklayın | 'Cari kart başarıyla oluşturuldu. (Hesap Kodu: …)' mesajı çıkar. Kod gruptan önek alır (MUS, TED, NAK, OFS…). 'Yedek Parça / Servis Tedarikçisi' ve 'Akaryakıt Tedarikçisi' gruplarında Vergi No zorunludur. |
| 7 | Personel kuralı: finans@acme.test ile girip Cari Kartlar'a ve 'Yeni Cari Kart' → Hesap Grubu listesine bakın; aynısını finanssuper@acme.test veya patron ile tekrarlayın | finans@ personel carisini listede görmez; 'Personel (Sürücü)' ve 'Personel (Ofis)' gruplarını seçemez. Patron ve finans-süper görür ve seçebilir. |
| 8 | Borç belgesi: Cari Kartlar'da tedarikçi satırında 'Diğer İşlemler' → 'Cari Hareketler'e girin ('Cari Hesap Hareketleri' sayfası). 'Borç Ekle'ye tıklayın ('Yeni Borç Ekle' penceresi). Belge Türü varsayılan (Alış Faturası) kalsın; Belge No/Fatura No = FTR-001, tutar = 10000, Ödeme Yöntemi seçin, İş Yeri = Alsancak Ofis (Acme). 'Borca Yansıt' işaretli kalsın. 'Kaydet'e tıklayın | 'Borç kaydı başarıyla eklendi' mesajı çıkar; tabloda 'Borç' rozetli satır görünür. Dikkat: varsayılan KDV %20 olduğundan 10.000 tutar 12.000 net borç yazar. Belge, Acme şirketinde carinin alacağını, yani şirketin cariye borcunu artırır. |
| 9 | Ödeme uyarısı (kısa sınama): Ödemeler ('Ödeme Yönetimi') → 'Yeni Ödeme' ('Yeni Ödeme Ekle'). Aynı tedarikçiyi seçin; İş Yeri = Hadımköy Depo (Beta, borç yok) veya Alsancak Ofis'te borçtan büyük bir tutar girin; Ödeme Yöntemi = nakit, Kasa seçin ve 'Kaydet'e tıklayın | Tutarın altında kırmızı uyarı çıkar: 'Bu şirketin cariye borcu …; ödeme …, borçtan … fazla.' (diğer şirketlerde borç varsa 'Diğer şirketlerdeki borç: …'). Kaydet'te 'Uyarı' penceresi açılır: 'Yine de kaydetmek istiyor musunuz?'. Odak 'Vazgeç'tedir; 'Vazgeç' kayıt yapmaz. 'Tamam' kaydeder ve 'Ödeme başarıyla kaydedildi.' yazar. |
| 10 | Tahsilat uyarısı: Tahsilatlar ('Tahsilat Yönetimi') → 'Yeni Tahsilat' ('Yeni Tahsilat Ekle'). Borcu olmayan bir müşteriden tahsilat girip 'Kaydet'e tıklayın | Gerekirse yalnız bilgi satırı çıkar ('Bu şirketteki cari borcu …; tahsilat …, borçtan … fazla.'). Onay penceresi açılmaz; doğrudan 'Tahsilat başarıyla kaydedildi.' yazar. |
| 11 | Şirketler arası transfer: Transfer Merkezi → 'Yeni Transfer'. Tür EFT, kaynak iş yeri ve banka Acme, hedef iş yeri ve banka Beta, tutar 200. Önce neden seçmeden kaydedin, sonra Transfer nedeni seçip yeniden kaydedin | Bilgi kutusunda 'Grup şirketi carilerine otomatik kayıt oluşur.' yazar. Neden seçilmezse 'Transfer nedeni seçiniz.' çıkar. Neden seçilince 'Şirketler arası transfer başarıyla oluşturuldu.' yazar; satırda 'Şirketler Arası' rozeti var, 'Düzenle' düğmesi yoktur. Ödemeler listesinde Acme'den GS-BETA'ya ödeme, Tahsilatlar'da Beta'nın GS-SIRKET1'den tahsilatı görünür. |

**Kontrol edilecek kurallar:**
- Kasa/banka şirket bazındadır (iş yerinin şirketi).
- Şirketler arası transfer serbesttir ve grup şirketi carilerine otomatik kayıt açar: A'da GS-B'ye ödeme, B'de GS-A'dan tahsilat.
- Ödeme, carinin o şirketteki borcunu en az 0,01 aşarsa kırmızı uyarı ve 'Uyarı' onay penceresi çıkar; 'Tamam' kaydeder. Ağda önce 409 CONFIRMATION_REQUIRED, ardından aynı istek confirmWarnings ile gider.
- Tahsilatta uyarı yalnız bilgidir, onay istenmez.
- Eksik fatura uyarısı 4 yerde görünür. Koddaki metinler: cari listesinde 'Eksik Faturalı' süzgeci ve 'Eksik fatura: …' etiketi; cari hareketlerinde 'Eksik fatura' / 'Kalan … için fatura bilgisi eksik.'; ödeme/tahsilat ekranında 'Eksik fatura: …'; fatura girişinde 'kalan … için fatura bilgisi eksik.' notu.
- Cari kartı adresi herkese görünür.
- Planı açık hareket taşınamaz (Cari Taşıma).
- Silme yoktur: 'Sil' ters kayıt atar ve satır 'İptal' rozetiyle kalır. Saklı bakiye yoktur; bakiye hareketlerden hesaplanır.

**Bilinen eksikler / sonraki faza kalanlar:**
- Dev'de hazır kasa, banka, cari ve hareket yoktur; hepsi elle girilir. Kurlar yalnız TCMB'den gelir.
- Cari Kartlar'daki plan düğmeleri ('Ödeme Planlaması Yap', 'Onaya Gönder' vb.) 12.4'e kadar pasiftir; ipucu 'Faz 12.4 ile gelecek.'. Ancak ödeme penceresi 12.2a ile çalışır: kalan borç varsa 'Ödeme Başarılı!' → 'Evet, Planla' ile plan satırı yazılabilir.
- Çek/senet (12.3), Tüm Planlamalar ve Ödeme Onay Yönetimi (12.4), kredi (12.5) ve mevduat (12.6) ekranları yok; banka kartı menüsünde 'Bankadan Cari Çek Ödemesi Yap' gibi bu fazlara ait öğeler pasif ya da eksik olabilir.

**Doğrulanamadı:**
- Kasa ve banka formlarında hangi alanların zorunlu olduğu tek tek denetlenmedi; etiketler funds.ts'ten alındı (Kasa Kodu, Kasa Adı, Banka Kodu, Hesap Adı, Para Birimi, İş Yeri, Başlangıç Bakiyesi, Başlangıç Tarihi, Açılış Kuru (₺)).
- Ödeme ve tahsilat pencerelerindeki yöntem ve kasa seçimi açılır listelerinin ekrandaki etiketleri (ör. 'Nakit') bu alan için doğrulanmadı; e2e yalnız değerlerle (CASH, CHECK) seçiyor.
- Transfer nedeni açılır listesindeki seçeneklerin ekran metinleri doğrulanmadı (e2e değeri DEBT_PAID).

---

## 1. Faz 12.0 + 12.1a — ZTO kabuğu, şirket/şube/iş yeri, günlük cari işlemleri


### 12.0 — ZTO Finans kabuğu, yan menü ve yönlendirme

- **Adres:** `/zto-finans`
- **Menü:** Sol MUI menüsünde üst düzey 'ZTO Finans' öğesi ('Finans'ın hemen altında; Finans'ın alt öğesi değil)
- **Kullanıcı:** patron@acme.test; karşılaştırma için finans@acme.test ve finans izni olmayan bir rol (ör. Operasyon/Sevkiyat)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sol menüden 'ZTO Finans'a tıklayın ya da /zto-finans yazın. | Adres /zto-finans/cari-hareketler'e döner. ZTO görünümlü (Bootstrap 4, Open Sans 14px) üst panel açılır: başlık 'Finans Paneli', alt yazı 'Cari hesap işlemleri ve ödeme planlamalarını yönetin', sağda 'Tüm Şubeler' / 'Tüm İş Yerleri' ve 'Merhaba, <ad> (Finans)' / 'Tekrar hoş geldin!'. Altında 'Günlük Tüm Cari İşlemleri' başlıklı kart görünür. |
| 2 | Sayfanın sol kenarındaki mavi ok şeridinin üzerine fareyle gelin. Sonra fareyi uzaklaştırın, ardından oka tıklayıp Escape'e basın. | 'FİNANS İŞLEMLERİ' yan menüsü açılır ve fare çıkınca yaklaşık 120 ms sonra kapanır. Bölümler sırasıyla: CARİ İŞLEMLERİ, BANKA & KASA İŞLEMLERİ, ÖDEME & TAHSİLAT, ÖDEME PLANLAMA İŞLEMLERİ, FİNANSAL İŞLEMLER, KREDİ & YATIRIM, NAKLİYE MASRAF İŞLEMLERİ, İŞÇİLİK & GENEL MASRAF İŞLEMLERİ, MÜŞTERİ ALACAK İŞLEMLERİ, E-DÖNÜŞÜM, TEMEL TANIMLAR ve (yalnız npm run dev'de) GELİŞTİRME. 'EK İŞLEMLERİ' listelenmez. Tıklayınca açılır, Escape ile kapanır. |
| 3 | Menüde etkin öğeye bakın. | Vurgulu öğe 'Günlük Cari İşlemleri'dir. |
| 4 | 'Finans Raporları', 'Personel Yönetimi', 'Çekler', 'Senetler', 'Tüm Planlamalar', 'Ödeme Onay Yönetimi', 'Hızlı Bakiye Özeti', 'Krediler', 'Vadeli Mevduatlar' ve E-DÖNÜŞÜM öğelerinin üzerine gelin. | Bu öğeler tıklanamaz (pasif). Yanlarında küçük 'Faz 12.x' etiketi vardır, ipucu 'Bu ekran Faz 12.x ile gelecek.' (Çekler için 'Bu ekran Faz 12.3 ile gelecek.'). |
| 5 | Çalışan öğeleri tek tek tıklayın: Cari Kartlar, Yeni Cari Kart, Bankalar, Tüm Banka Hareketleri, Kasalar, Tüm Kasa Hareketleri, 'Banka & Kasa Transferi & Virman & Döviz Bozum', Ödemeler, Tahsilatlar, İş Yerleri, Şubeler, Şirketler. Ayrıca 'Hızlı Cari İşlemi'ne tıklayın. | Her biri /zto-finans altında kendi sayfasını açar; menü kapanır. 'Hızlı Cari İşlemi' sayfa değiştirmez, modal açar. Konsolda hata olmamalı (F12 → Console). |
| 6 | Tarayıcı penceresini telefon genişliğine (390×844) daraltıp /zto-finans/tanimlar/sirketler'i açın. Aynısını 1280×800'de tekrarlayın. | Kısa sayfada dikey kaydırma çubuğu oluşmaz. Yan menü oku üst çubuğun hemen altından (390'da 56px, 1280'de 64px) pencerenin altına kadar uzanır. Bu davranış e2e testinde de sınanıyor. |
| 7 | finans@acme.test ile girip menüyü açın. | 'Yeni Cari Kart' görünür (FINANCE_MANAGE var). TEMEL TANIMLAR bölümü ve üç öğesi görünür (BRANCH_VIEW var). |
| 8 | Finans izni olmayan bir kullanıcıyla (ör. yalnız 'Operasyon/Sevkiyat' rolü) girip /zto-finans adresini yazın. | Sol menüde 'ZTO Finans' görünmez. Adresle girilince 'Yetkiniz yok' / 'Bu ekranı görüntülemek için gerekli izne sahip değilsiniz.' sayfası çıkar. |

**Kontrol edilecek kurallar:**
- ZTO Finans rotası FINANCE_VIEW ister; Operasyon, Satış/CRM, Filo, Depo, Gümrük ve Sürücü rollerinde bu izin yoktur.
- ZTO menüsünden çıkarılan tarım/üretim öğeleri listede olmamalı: Yatırımlar, malzeme/drencher stoğu, bahçe hesapları, bahçe nakliyesi, kesim/üretim çavuşu, fabrika raporları, tanım merkezi.

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Ödeme Planlama Haritası' ve zil düğmesi (Ödeme Planı Hatırlatıcısı) pasif; 12.4'te gelecek.
- Personel Yönetimi (12.9) ve Uyumsoft öğeleri (12.10) pasif. Bunların süper kullanıcıya göre gizlenmesi ekranlar geldikçe yapılacak.
- E-DÖNÜŞÜM öğeleri 12.10'a kadar pasif.

### 12.0 — ZTO CSS'inin MUI ekranlarına sızmaması (görsel kontrol)

- **Adres:** `/finance`
- **Menü:** Sol menüde Finans, Operasyon, Filo, Kullanıcılar
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Tarayıcıyı yenileyin; ZTO henüz açılmamış olmalı. /finance, /operations, /fleet ve /users sayfalarının ekran görüntüsünü alın ya da yazı tipi, düğme ve tablo görünümünü not edin. | Normal MUI görünümü (Roboto vb.). |
| 2 | Sayfayı YENİLEMEDEN menüden 'ZTO Finans'ı açın. Sonra yine menüden /finance, /operations, /fleet ve /users'a dönün. | MUI ekranlarında yazı tipi, düğme rengi ve yuvarlaklığı, tablo kenarları ve boşluklar ZTO ziyaretinden öncekiyle birebir aynı kalır. Bootstrap mavisi (#007bff) ya da Open Sans MUI ekranında görünmemeli. |

**Kontrol edilecek kurallar:**
- ZTO CSS'i yalnız .zto-finans kökü altında geçerlidir; MUI ekranlarına sızmaz (e2e assertNoZtoCssLeak ile de sınanıyor).

### 12.0 — Bileşen vitrini (yalnız geliştirme)

- **Adres:** `/zto-finans/vitrin`
- **Menü:** ZTO yan menüsü → GELİŞTİRME → 'Bileşen vitrini' (yalnız `npm run dev`)
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Yan menüden 'Bileşen vitrini'ni açın. | Başlık 'Bileşen vitrini', alt başlık 'ZTO Finans ortak bileşenleri (yalnız geliştirme ortamında görünür).' Bölümler: Tablo ('Düğmeli liste (dom 'Bfrtip')' / 'Düğmesiz liste (dom 'lfrtip')'), İş yeri çipleri (Varyant D), Arama kutulu seçim, İş yeri seçimi ('Örnek ağaç (2 şirket)' / 'Canlı veri (useBranchTree)'), Modal, Dışa aktarım, Biçimlendirme, Grafik, İpucu ve açılır kutu, Font Awesome ikonları, Bootstrap 4 / SB Admin öğeleri. |
| 2 | Düğmeli tabloda Kopyala, Excel, PDF ve Yazdır düğmelerini deneyin. 'Modalı aç' ile modal açın, içinden 'İkinci modalı aç'ı deneyin. Arama kutulu seçimde yazarak arayın. | Kopyalayınca '{n} satır panoya kopyalandı' görünür. Excel ve PDF dosyaları iner; tutarlar tr-TR biçimindedir (1.250,50 ₺). Escape yalnız üstteki modalı kapatır. Konsolda hata olmamalı. |
| 3 | Şirket, şube ve iş yeri girdikten sonra 'Canlı veri (useBranchTree)' bölümüne bakın. | Girdiğiniz Şirket › Şube › İş Yeri ağacı görünür; şubesi olmayan iş yerleri 'Diğer' altında listelenir. |

**Kontrol edilecek kurallar:**
- Üretim paketinde (npm run build / e2e) vitrin ne menüde ne rotada bulunur (e2e: 'Bileşen vitrini' sayısı 0).

### 12.1a — Şirketler (Genel / e-Belge / Seriler)

- **Adres:** `/zto-finans/tanimlar/sirketler`
- **Menü:** ZTO yan menüsü → TEMEL TANIMLAR → 'Şirketler'
- **Kullanıcı:** patron@acme.test (yönetim); finans@acme.test (yalnız görüntüleme)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Şirketler'i açın. | 'Şirket Listesi' kartı açılır; varsayılan şirket satırında mavi 'Varsayılan' rozeti bulunur. Kolonlar: 'Unvan / Kısa Ad / Durum', 'VKN-TCKN / Vergi Dairesi', 'Telefon Numarası / E-posta', 'Adres', 'e-Belge' (Kapalı / Test), 'Kayıt Bilgileri', 'İşlemler'. Üstte 'Yeni Kayıt' bağlantısı, 'Pasifleri göster' onay kutusu ve 'Listede ara...' kutusu vardır. |
| 2 | Varsayılan satırda 'Düzenle'ye basın. | Başlık 'Şirket Düzenle' olur ve Genel, e-Belge, Seriler sekmeleri görünür. Kod = SIRKET1. Düzenlemede 'Logo' alanı da vardır; kasa/banka açıldıysa 'Varsayılan Banka Hesabı' alanı da görünür. 'Güncelle'ye basınca listeye 'Şirket güncellendi.' iletisiyle dönülür. |
| 3 | 'Yeni Kayıt'a basın; başlık 'Yeni Şirket' olur. Kod = beta (otomatik BETA olur), Unvan = Beta Nakliyat Ltd. Şti., Kısa Ad = Beta Nakliyat, Kimlik Türü = VKN, VKN/TCKN = 1234567891 girip 'Yeni Şirket Oluştur'a basın. | Alan altında 'Vergi numarası geçersiz.' çıkar (istemci kontrol hanesi). VKN/TCKN alanı rakam dışını kabul etmez, en çok 11 hane alır. Eklemede e-Belge ve Seriler sekmeleri pasiftir. |
| 4 | VKN'yi 1234567890 yapıp 'Yeni Şirket Oluştur'a basın. | 'Şirket oluşturuldu.' iletisi çıkar ve listede iki şirket görünür. Üst MUI çubuğunda 'Aktif şirket' seçicisi belirir; değeri 'Tüm şirketler (konsolide)' olur. |
| 5 | Aynı şekilde GAMA / Gama Depoculuk A.Ş. / Gama Depoculuk / VKN 4840847211 ile bir şirket açın. Sonra aynı VKN ile bir şirket daha açmayı deneyin (ör. Kod DELTA). | Gama oluşur. İkinci denemede formun üstünde kırmızı 'Bu vergi numarası zaten kayıtlı.' çıkar (COMPANY_TAX_TAKEN). Aynı kodla denenirse 'Bu şirket kodu zaten kayıtlı.' çıkar. |
| 6 | Beta'da 'Düzenle'ye basıp 'Seriler' sekmesine geçin (adres ?sekme=seriler). | 4 satır görünür: Navlun Faturası, Depo Faturası, Banka/Kasa Transferi, Şirketler Arası Virman. Önekler BETA-NF, BETA-DF, BETA-VRM, BETA-SVR (kodun ilk 4 harfi). Varsayılan şirkette önekler NF, DF, VRM, SVR'dir. |
| 7 | Bir satırdaki 'Seri Düzenle' (kalem) düğmesine basın. 'Sıradaki No'yu mevcut değerden küçük yapıp 'Kaydet'e basın; sonra büyütüp tekrar kaydedin. Önek alanına küçük harf ve Türkçe karakter yazın. | 'Seri Düzenle' başlıklı modal açılır ('Vazgeç' / 'Kaydet'); altında sürekli bir 'Sıradaki numara yalnız ileri alınabilir.' uyarısı vardır. Küçültmede alan altında aynı hata çıkar ve kaydedilmez. Büyütmede 'Seri güncellendi.' çıkar. Önek otomatik büyük harfe döner; yalnız A–Z, 0–9 ve - kalır, en çok 10 karakter. 'Örnek: BETA-NF-2026-000001' biçimli önizleme görünür. |
| 8 | 'e-Belge' sekmesine geçin (?sekme=e-belge). | 'Uyumsoft e-Dönüşüm' başlığı görünür. 'Bağlantıyı Test Et' ve 'GİB Mükellef Sorgula' pasiftir (ipucu 'Faz 12.10'); yanlarında 'Faz 12.10 ile gelecek.' yazar. 'Fatura Seri (opsiyonel)' alanına e2e yazınca E2E olur (en çok 3 karakter). 'Kaydet' sonrası 'Uyumsoft ayarları kaydedildi.' çıkar. Gönderen VKN/TCKN ve Gönderen Ünvan salt okunurdur; not: 'Genel sekmesinden düzenlenir.' |
| 9 | Beta'da 'Düzenle' → Genel sekmesinde Logo'ya önce GIF ya da 1 MB'tan büyük bir dosya, sonra küçük bir PNG yükleyin. Ardından 'Logoyu Kaldır'a basın. | Geçersiz dosyada 'Logo PNG veya JPEG ve en çok 1 MB olmalı.' çıkar. PNG'de 'Logo güncellendi.' çıkar ve önizleme görünür. Kaldırınca 'Logo kaldırıldı.' çıkar. |
| 10 | Varsayılan şirket satırında 'Sil'e basın. | 'Silme Onayı' modalı açılır; metin 'Silmek istediğinize emin misiniz?', düğmeler 'İptal' / 'Sil'. 'Geri alınamaz' notu yoktur. Onaylayınca kırmızı bildirim çıkar: 'Varsayılan şirket pasifleştirilemez; önce başka bir şirketi varsayılan yapın.' |
| 11 | (Gama'ya henüz iş yeri eklenmemişken) Gama satırında 'Sil' → 'Sil'e basın. Sonra 'Pasifleri göster'i işaretleyip Gama satırında 'Aktifleştir'e basın. | 'Şirket pasifleştirildi.' çıkar ve satır listeden kalkar. Pasifler gösterilince Gama soluk satır olarak görünür; aktifleştirince 'Şirket aktifleştirildi.' çıkar. Aktif iş yeri olan bir şirkette 'Sil' denerseniz: 'Önce iş yerlerini pasifleştirin veya taşıyın.' |
| 12 | Satırda 'Kayıt bilgilerini görüntüle' ve 'Detay' (ipucu 'Kayıt detayını görüntüle') düğmelerine basın. | 'Kayıt Geçmişi' açılır kutusu görünür (Esc ile kapanır). 'Şirket' başlıklı detay modalı açılır, 'Kapat' ile kapanır. |
| 13 | İkinci şirket açıldıktan sonra Cari Kartlar listesine (/zto-finans/cari-kartlar) bakın. Sonra Beta'nın Kısa Ad'ını değiştirip listeye dönün. | Her aktif şirket için 'Grup Şirketi' grubunda otomatik bir cari vardır: GS-SIRKET1, GS-BETA, GS-GAMA. Carinin adı şirketin kısa adıdır. Kısa ad değişince GS-BETA carisinin adı da değişir. Bu kartlar elle düzenlenemez/silinemez (sunucu 409 INTERCOMPANY_ACCOUNT_LOCKED). |
| 14 | finans@acme.test ile Şirketler'i açın, sonra adres çubuğuna /zto-finans/tanimlar/sirketler/yeni yazın. | Liste görünür ama 'Yeni Kayıt', 'Düzenle' ve 'Sil' yoktur, yalnız 'Detay' vardır. /yeni adresinde 'Bu sayfaya erişim yetkiniz bulunmuyor.' çıkar. Finans (Süper) kullanıcısında ise yönetim düğmeleri görünür (COMPANY_MANAGE). |

**Kontrol edilecek kurallar:**
- Çoklu şirket: kiracı 2–3 tüzel kişi açar; her yeni şirketin kendi 4 serisi oluşur ({KOD4}-NF/DF/VRM/SVR).
- 'Sil' aslında pasifleştirir. Varsayılan şirket ve aktif iş yeri olan şirket pasifleştirilemez.
- Grup şirketi (GS-) carisi yalnız en az 2 aktif şirket varken açılır. 12.2'de şirketler arası virman bu cariye otomatik hareket yazar (transfer serbesttir).
- Şirket yönetimi COMPANY_MANAGE ister (Patron ve Finans (Süper)); Finans rolü yalnız görür.
- Vergi numarası kiracıda tekildir (silinmemiş şirketler arasında).

**Bilinen eksikler / sonraki faza kalanlar:**
- e-Belge'de mükellef sorgusu, bağlantı testi ve ayarın gönderimde kullanılması 12.10'da gelecek.
- 'Varsayılan Banka Hesabı' yalnız düzenlemede görünür ve şirketin kasa/banka hesabı varsa dolar (12.2 verisi gerekir). Yeni şirkete varsayılan hesap verilemez.
- FUND_IS_COMPANY_DEFAULT hatasının ön yüz çevirisi yok; sunucunun Türkçe iletisi görünür.

### 12.1a — Şubeler (şube grubu)

- **Adres:** `/zto-finans/tanimlar/subeler`
- **Menü:** ZTO yan menüsü → TEMEL TANIMLAR → 'Şubeler'
- **Kullanıcı:** patron@acme.test (BRANCH_MANAGE yalnız Patron'da)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Şubeler'i açın ('Şube Listesi'), ardından 'Yeni Kayıt'a basın. | Adres /subeler/yeni olur, başlık 'Yeni Şube'. En az 2 aktif şirket varken en üstte zorunlu 'Şirket' seçimi çıkar; tek şirkette bu alan yoktur. 'Oluşturma Tarihi' alanı açılış anıyla dolu ve salt okunur gelir. |
| 2 | Şirket = Acme Lojistik, Şube Adı = İzmir Bölge, Şube Tipi = 'Ana Şube', Telefon Numarası = 0232 111 22 33 girip 'Yeni Şube Oluştur'a basın. | Telefon yalnız rakam kabul eder (02321112233, en çok 11). Listeye 'Şube kaydedildi.' iletisiyle dönülür; şube 'Listede ara...' ile bulunur. |
| 3 | Acme altında 'İstanbul Bölge'yi (Şube Tipi 'Yan Şube'), Beta altında 'Beta Mersin'i, Gama altında 'Gama Kocaeli'yi ekleyin. E-posta alanına geçersiz bir değer yazmayı deneyin. Aynı adla ikinci bir şube açmayı deneyin. | Listedeki 'Şube Adı / Şube Tipi / Durum' kolonunda yan şube 'Şube' olarak görünür (ZTO ham değeri). Geçersiz e-postada 'Geçerli bir e-posta adresi girin.' çıkar. Aynı adda 'Bu adla bir şube zaten var.' çıkar. |
| 4 | İş yerleri girildikten sonra, içinde aktif iş yeri olan bir şubede 'Sil' → 'Sil'e basın. | 'Önce iş yerlerini taşıyın.' hatası çıkar; şube pasifleşmez. |
| 5 | Boş bir şubede 'Sil'e basın, sonra 'Pasifleri göster' → 'Aktifleştir'. Ardından 'Düzenle' → 'Şube Düzenle' → 'Güncelle'. | Sırasıyla 'Şube pasifleştirildi.', 'Şube aktifleştirildi.' ve 'Şube güncellendi.' iletileri çıkar. |
| 6 | finans@acme.test ile Şubeler'i açın. | Liste görünür ama 'Yeni Kayıt', 'Düzenle' ve 'Sil' yoktur. /subeler/yeni adresinde 'Bu sayfaya erişim yetkiniz bulunmuyor.' çıkar. |

**Kontrol edilecek kurallar:**
- Şirket → Şube → İş Yeri hiyerarşisi: şube tek bir şirkete aittir. İş yeri bağlı şubenin şirketi değiştirilemez ('Bu şubeye bağlı iş yerleri var; şirketi değiştirilemez.').
- İş yeri barındıran şube pasifleştirilemez.

**Bilinen eksikler / sonraki faza kalanlar:**
- MUI tarafında grup 'Şube Grubu' olarak adlandırılır (K-4); MUI'deki 'Şube' etiketleri iş yeri anlamındadır.

### 12.1a — İş Yerleri

- **Adres:** `/zto-finans/tanimlar/is-yerleri`
- **Menü:** ZTO yan menüsü → TEMEL TANIMLAR → 'İş Yerleri'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'İş Yerleri'ni açın ('İş Yerleri Listesi'), ardından 'Yeni Kayıt'a basın. | Başlık 'Yeni İş Yeri' olur. Alanlar: (en az 2 şirkette) 'Şirket: *', 'Şube: *', 'Ad: *', 'Telefon Numarası: *', 'Adres:', 'Konum:', 'Oluşturma Tarihi: *'. Hiç şube yoksa 'Önce Şube tanımlayın.' yazısı ve 'Şube ekle' bağlantısı görünür. |
| 2 | Şirket = Beta Nakliyat seçin, sonra 'Şube' listesini açın. | Yalnız Beta'nın şubesi (Beta Mersin) listelenir; Acme'nin şubeleri görünmez. |
| 3 | Şirket = Acme, Şube = İzmir Bölge, Ad = Alsancak Ofis, Telefon = 0232 111 22 33, Adres = Alsancak, İzmir, Konum = 38.4237,27.1428 girin. | Telefon 02321112233'e dönüşür. 'Haritada Göster' bağlantısı google.com/maps/search/?api=1&query=38.4237,27.1428 adresine gider. Konuma 'abc' yazılırsa 'Konum "enlem,boylam" biçiminde olmalıdır.' çıkar. |
| 4 | 'Yeni İş Yeri Oluştur'a basın. | 'İş yeri oluşturuldu.' çıkar. Satırda Şube = İzmir Bölge, Ad = Alsancak Ofis görünür. Kolonlar: Ad, Telefon Numarası, Adres, Lokasyon, Şube, (çok şirkette) Şirket, Oluşturma Tarihi, Kayıt Bilgileri, İşlemler. Otomatik IY-… kodu verilir; listede görünmez, düzenleme formunda salt okunur 'Kod' alanında görünür. |
| 5 | Kalan iş yerlerini girin: Kemalpaşa Depo, Hadımköy Depo, Mersin Liman Ofisi, Gebze Depo. | Her biri kendi şirketinin şubesi altında görünür. |
| 6 | Bir satırda 'Kayıt bilgilerini görüntüle' ve 'Kayıt detayını görüntüle' düğmelerine basın. | 'Kayıt Geçmişi' kutusu açılır. 'İş Yeri' başlıklı detay modalı açılır; üst bölümde iş yerinin adı yazar; 'Kapat' ile kapanır. |
| 7 | Bir iş yerinde 'Sil' → 'Sil'e basın, sonra 'Pasifleri göster' → 'Aktifleştir'. | Onay modalında 'geri alınamaz' notu yoktur. 'İş yeri pasifleştirildi.' çıkar ve satır kalkar. Pasifler gösterilince soluk satır görünür; aktifleştirince 'İş yeri aktifleştirildi.' çıkar. |
| 8 | 'Düzenle'ye basın ('İş Yeri Düzenle'). Ad'ı değiştirip 'Güncelle'ye basın. | Yan menüde 'İş Yerleri' etkin kalır. 'İş yeri güncellendi.' çıkar. |
| 9 | Üzerinde cari hareketi ya da kasa/banka bulunan bir iş yerini (hareketler girildikten sonra) düzenleyin: Şirket'i değiştirip o şirketin bir şubesini seçin ve 'Güncelle'ye basın. | Formun üstünde 'Bu iş yerinde kayıt var; şirketi değiştirilemez.' çıkar ve formdan çıkılmaz. |

**Kontrol edilecek kurallar:**
- İş yeri seçilen şirketin şubesine bağlanmalıdır (bileşik FK). Başka şirketin şubesi seçilirse sunucu 'Seçilen şube başka şirkete ait.' der.
- 'Sil' pasifleştirir; pasif iş yerleri finans formlarındaki iş yeri seçimlerinde çıkmaz.
- Kayıtlı iş yerinin şirketi değiştirilemez (BRANCH_COMPANY_LOCKED).

**Bilinen eksikler / sonraki faza kalanlar:**
- ZTO'daki gömülü Google haritası yerine elle konum girişi ve 'Haritada Göster' bağlantısı var (bilinçli sapma).

### 12.1a — Aktif şirket seçici ve İş Yeri Yetkisi (şube kapsamı)

- **Adres:** `/users`
- **Menü:** Üst MUI çubuğunda 'Aktif şirket' seçicisi; sol menüde 'Kullanıcılar'
- **Kullanıcı:** patron@acme.test; sınırlı test için finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | İki ya da daha fazla şirket açıldıktan sonra /zto-finans/cari-hareketler ya da /finance/funds'ta üst MUI çubuğundaki 'Aktif şirket' seçicisini açıp 'Beta Nakliyat'ı seçin. | Listeler yalnız Beta'nın verisiyle süzülür; ZTO iş yeri seçimleri yalnız Beta iş yerlerini gösterir. Sayfa yenilenince seçim korunur (tarayıcıda kiracı ve kullanıcıya özgü saklanır). |
| 2 | Seçiciyi 'Tüm şirketler (konsolide)' yapın. | Tüm şirketlerin verisi birlikte görünür. |
| 3 | /users sayfasında finans@acme.test satırında 'Düzenle'ye basın. Dialogda 'İş Yeri Yetkisi' sekmesi → 'Seçili iş yerleri' → yalnız 'Alsancak Ofis'i işaretleyin → 'Kaydet'. Sonra 'Vazgeç' ile dialogu kapatın. | 'İş yeri yetkisi kaydedildi.' çıkar; listede İş Yerleri kolonu 'Sınırlı' olur. Arama kutusunda ('İş yeri / şube ara...') Enter formu göndermez. Hiç iş yeri seçmeden kaydederseniz 'En az bir iş yeri seçin.' çıkar. 'Varsayılan iş yeri' seçimi de yapılabilir. |
| 4 | finans@acme.test ile girin. /zto-finans/cari-hareketler'i, Ödemeler'deki iş yeri seçimini ve ana sayfayı açın. | Yalnız Alsancak Ofis görünür; diğer iş yerlerinin hareketleri ve kart öğeleri listelenmez. Ana sayfa çökmez ve 'Net pozisyon (…)' kutuları çizilmez. |
| 5 | Patron kullanıcısında 'İş Yeri Yetkisi' → 'Seçili iş yerleri' → 'Kaydet'i deneyin. | Reddedilir; sunucu iletisi 'Patron kullanıcı tüm iş yerlerini görür.' (OWNER_SCOPE_ALL). |
| 6 | Testten sonra finans@acme.test'i yeniden 'Tüm iş yerleri' yapın. | Sonraki sayfa testleri için tam görünürlük sağlanır. |

**Kontrol edilecek kurallar:**
- Tek şirketli kiracıda seçici hiç görünmez; en az 2 aktif şirkette görünür (e2e multi-company.spec).
- Kasa/banka şirket bazındadır: seçili şirketin fonları listelenir, konsolidede hepsi.
- LIMITED kullanıcı yalnız izinli iş yerlerini (ve onların şirketlerini) görür; kiracı geneli pozisyon verisi gelmez.

**Bilinen eksikler / sonraki faza kalanlar:**
- K-1: depo stok, filo belge/hatırlatma, gümrük, GPS ve teklif/sözleşme dışı CRM uçlarında LIMITED kapsam henüz uygulanmıyor (kiracı geneli görünür).
- Ödeme, tahsilat ve çekte seçilen fonun iş yeri kapsamı denetlenmiyor; yalnız şirket uyumu denetleniyor.
- Filo ve entegrasyon formlarında fonlar şirkete göre süzülmüyor; yanlış şirketin fonu seçilirse sunucu 422 verir.

**Doğrulanamadı:**
- Patron'a LIMITED verme denemesinde iletinin dialogun neresinde gösterildiği (sunucu metni doğrulandı).

### Günlük Tüm Cari İşlemleri

- **Adres:** `/zto-finans/cari-hareketler`
- **Menü:** ZTO yan menüsü → CARİ İŞLEMLERİ → 'Günlük Cari İşlemleri' (ZTO Finans'ın varsayılan sayfası)
- **Kullanıcı:** patron@acme.test; personel kontrolü için finans@acme.test ve Finans (Süper) kullanıcısı

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Ön koşul: bir carinin 'Cari Hareketler' sayfasında 'Borç Ekle' / 'Alacak Ekle' ile bugün tarihli 4–6 kayıt girin; farklı iş yerleri kullanın (Alsancak Ofis, Hadımköy Depo, Mersin Liman Ofisi) ve biri USD olsun. 'Personel (Sürücü)' carisine de bir kayıt girin. Bir kayıt 3 gün önceye tarihli olsun. | Kayıtlar carinin hareket listesinde görünür ('Borç kaydı başarıyla eklendi' / 'Alacak (…) kaydı başarıyla eklendi'). |
| 2 | Sayfayı açın. | Kart başlığı 'Günlük Tüm Cari İşlemleri', yol 'Cari Kartlar' › 'Günlük Cari İşlemleri'. Hızlı aralık 'Bugün' etkindir ve tabloda bugünkü kayıtlar listelenir. Kolonlar: Tarih, İş Yeri, Cari Kodu, Cari Adı, Hesap Grubu, İşlem Türü, Belge No, Tutar, Açıklama, Oluşturan, İşlem. Tutarlar '1.250,50 ₺' biçimindedir. Sayfa başına 25 kayıt gösterilir (seçenekler 10/25/50/100). |
| 3 | Hızlı aralık düğmelerini sırayla deneyin: Bugün, Dün, 7 Gün, 2 Hafta, 1 Ay, 3 Ay, 6 Ay. | Basılı düğme etkin görünür; 'Başlangıç Tarihi' ve 'Bitiş Tarihi' güncellenir. '7 Gün'de 3 gün önceki kayıt da gelir. |
| 4 | Başlangıç Tarihi'ni Bitiş Tarihi'nden sonraya alın; sonra aralığı 1 yıldan uzun yapın. | Tabloda sırasıyla 'Bitiş tarihi başlangıç tarihinden önce olamaz.' ve 'Tarih aralığı en çok 1 yıl olabilir.' çıkar; sorgu çalışmaz. |
| 5 | 'Birim:' grubunda 'Tümü', ₺, $, € ve £ düğmelerini deneyin. | Tablo seçilen para birimine göre süzülür; USD kaydı yalnız $ ve Tümü'de görünür. |
| 6 | 'İş Yerleri' kartında bir iş yerine, 'Hesap Grupları' ve 'İşlem Türleri' kartlarında birer öğeye tıklayın. | Kart öğesi seçili olur ve tablo süzülür. Altta 'İş Yeri: Alsancak Ofis' gibi çipler belirir; çipteki kaldır düğmesi süzgeci kaldırır. Kartlardaki sayılar seçimden etkilenmez. |
| 7 | Filtre satırındaki 'Cari ara...' kutusuyla bir cari seçin, sonra 'Sıfırla' (döngü oku) düğmesine basın. | Önce yalnız o carinin hareketleri görünür. Sıfırla tüm süzgeçleri, para birimini ve aralığı ('Bugün') başa döndürür. |
| 8 | Tablonun 'Ara:' kutusuna bir cari adı yazın. Sonra satırdaki cari adı bağlantısına ya da İşlem kolonundaki düğmeye ('Cari hareketlerini aç') tıklayın. | İstemci araması satırları daraltır. Bağlantı /zto-finans/cari-kartlar/{id}/hareketler'i YENİ SEKMEDE açar. |
| 9 | Başlıktaki 'Cari ara (ad / hesap grubu) ve hareketlere git...' kutusunda arama yapın. Sonuçta 'Hareketler', 'Ekstre' ve kalem ('Cari kartı düzenle') düğmelerini deneyin. Sonra kutunun yanındaki '+' ('Yeni Cari Kart Oluştur') düğmesine basın. | Sonuç satırının kendisi ve 'Hareketler' aynı sekmede hareketlere gider; 'Ekstre' ve kalem yeni sekmede açılır. '+' yeni sekmede /zto-finans/cari-kartlar/yeni'yi açar. Kalem ve '+' yalnız FINANCE_MANAGE olan kullanıcıda görünür. |
| 10 | Üst MUI çubuğundaki 'Aktif şirket' seçicisini 'Beta Nakliyat' yapın, sonra 'Tüm şirketler (konsolide)'. | Beta'da yalnız Beta iş yerlerindeki hareketler ve kartlarda yalnız Beta iş yerleri görünür; konsolidede hepsi görünür. |
| 11 | Personel carisi kontrolü: aynı aralığı patron, Finans (Süper) ve finans@acme.test ile açın. | 'Personel (Sürücü)' carisinin hareketi patron ve Finans (Süper)'de görünür. FINANCE_EMPLOYEE_VIEW izni olmayan finans@acme.test'te HİÇ görünmez; 'Hesap Grupları' kartında da yoktur. |
| 12 | Silinmiş hareket süzgeci: bir carinin Cari Hareketler sayfasında bir kaydı 'Sil'e basın; 'Silme Onayı' ('İşlemi Silmek İstediğinize Emin Misiniz?') çıkınca 'Evet, Sil'e basın. Sonra bu sayfaya dönün. | Silinen kayıt Günlük Tüm Cari İşlemleri'nde, cari bakiyesinde ve ekstrede artık yer almaz. |
| 13 | Başlangıç ve Bitiş Tarihi'ni 2001-01-01 yapın (hareketsiz bir gün). | Boş durum görünür: 'Bugün henüz bir cari işlemi yapılmadı', 'Carileri incelemek veya cari işlemi yapmak için tıklayınız.' ve 'Hızlı Cari İşlemi' düğmesi. Düğme modalı açar. |
| 14 | Başlıktaki 'Ödeme Planlama Haritası' ve zil (Ödeme Planı Hatırlatıcısı) düğmelerinin üzerine gelin. | İkisi de pasiftir; ipucu 'Bu ekran Faz 12.4 ile gelecek.' |

**Kontrol edilecek kurallar:**
- Personel carileri yalnız FINANCE_EMPLOYEE_VIEW ile görünür (sunucu sorgularında employeeVisible süzgeci).
- Silinmiş (iptal edilmiş) hareketler listede ve bakiyede sayılmaz; silme yerine ters kayıt mantığı geçerlidir.
- Hareketler aktif şirkete göre süzülür.
- Ekran tarih aralığını her durumda en çok 366 gün kabul eder. Sunucu cari seçili değilken aynı sınırı uygular (400 DATE_RANGE_TOO_LARGE); cari seçiliyken sunucuda sınır yoktur.
- LIMITED kullanıcıda yalnız izinli iş yerlerinin hareketleri ve kart öğeleri görünür.

**Bilinen eksikler / sonraki faza kalanlar:**
- Ödeme Planlama Isı Haritası ve Hatırlatıcı pasif (12.4).
- Bu tabloda Kopyala/Excel/PDF/Yazdır düğmesi yok (koddaki ZtoDataTable'a buttons verilmemiş).
- 10.000 kayıt sınırı: aralıkta 10.000'den fazla kayıt varsa tablo yerine 'Seçilen aralıkta {n} kayıt var; lütfen tarih aralığını daraltın.' çıkar. Bunu elle sınamak pratik değil.

**Doğrulanamadı:**
- Satış/İade rozetlerinin ('Satış', 'İade') hangi belge türünde göründüğü; satış/iade faturası verisi gerekir.

### Hızlı Cari İşlemi modalı

- **Adres:** `/zto-finans/cari-hareketler`
- **Menü:** ZTO yan menüsü → CARİ İŞLEMLERİ → 'Hızlı Cari İşlemi' (her ZTO sayfasından; ya da boş durumdaki 'Hızlı Cari İşlemi' düğmesi; ya da adrese ?quickcari=1)
- **Kullanıcı:** patron@acme.test; yetki farkı için finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Yan menüden 'Hızlı Cari İşlemi'ne tıklayın. | 'Hızlı Cari İşlemi' modalı açılır. Arama boşken 'Bir cari arayın ve seçin' / 'Ardından işlem kartlarına tıklayarak ilgili sayfaya gidin.' yazar. |
| 2 | 'Cari ara — ad veya kod yazın...' kutusuna 'Tedarikçi' carinin adını yazıp sonuçtan seçin. | Seçili cari üstte görünür. Kartlar sırasıyla: Cari Hareketler, Ekstre Al, Banka Hesapları, Ödeme Ekle, Düzenle. Eşleşme yoksa 'Sonuç bulunamadı' çıkar. |
| 3 | 'Cari Hareketler' kartına tıklayın. | /zto-finans/cari-kartlar/{id}/hareketler aynı sekmede açılır ve modal kapanır. 'Ekstre Al', 'Ödeme Ekle' ve 'Düzenle' yeni sekmede açılır. |
| 4 | 'Müşteri' grubundaki bir cariyi seçin. | 'Ödeme Ekle' kartı gösterilmez (ZTO kuralı: müşteri olmayan cariler için). |
| 5 | 'Nakliye Firması' ya da 'Sevk Nakliye Firması' grubundaki bir cariyi seçin; sonra 'Personel (Sürücü)' grubundaki cariyi seçin. | Nakliye carisinde 'Sefer Maliyetleri' kartı çıkar ve yeni sekmede /operations'ı açar (SHIPMENT_VIEW gerekir). Sürücü carisinde 'Sürücü Kartı' kartı çıkar ve yeni sekmede /fleet/drivers'ı açar (FLEET_VIEW gerekir). Patron'da ikisi de görünür. |
| 6 | finans@acme.test ile aynı carileri arayın. | Finans rolünde SHIPMENT_VIEW ve FLEET_VIEW olmadığı için 'Sefer Maliyetleri' ve 'Sürücü Kartı' çizilmez. 'Personel (Sürücü)' carisi aramada hiç çıkmaz (FINANCE_EMPLOYEE_VIEW yok). |
| 7 | Tedarikçi carisinde 'Ödeme Ekle' kartına basın (12.2a tamamlandıktan sonra). | Yeni sekmede /zto-finans/odemeler?id=…&openModal=true açılır ve Yeni Ödeme modalı o cari seçili gelir. |

**Kontrol edilecek kurallar:**
- Yetki gerektiren kartlar yalnız yetkili kullanıcıda görünür: Düzenle = FINANCE_MANAGE, Ödeme Ekle = FINANCE_PAYMENT_CREATE (ve cari müşteri değilse), Sürücü Kartı = FLEET_VIEW, Sefer Maliyetleri = SHIPMENT_VIEW.
- Personel carisi, FINANCE_EMPLOYEE_VIEW yoksa aramada çıkmaz (GET /finance/accounts employeeVisible süzgeci).

**Bilinen eksikler / sonraki faza kalanlar:**
- ZTO'nun tarım kartları (hammadde, ilaç faturası, çavuş gideri) Blackrose'ta yok; yerlerine Sefer Maliyetleri ve Sürücü Kartı var.

**Doğrulanamadı:**
- 'Ödeme Ekle' kartının açtığı Ödemeler modalı 12.2a'da yazılıyor; davranış iş akışı bitince doğrulanmalı.

---

## 2. Faz 12.1 — Cari kartlar, IBAN, Borç/Alacak, devir, taşıma, ekstre


### Cari Kartlar listesi

- **Adres:** `/zto-finans/cari-kartlar`
- **Menü:** ZTO Finans > yan menü CARİ İŞLEMLERİ > Cari Kartlar
- **Kullanıcı:** patron@acme.test; karşılaştırma için finans@acme.test ve muhasebe@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı açın | 'Cari Hesaplar Paneli' başlığı görünür. Tablonun ilk sütunu 'PLAN TARİHİ'; diğer başlıklar: HESAP KODU, CARİ HESAP & İŞ YERİ/ŞUBE, HESAP GRUBU, TOPLAM BORÇ / TOPLAM ÖDENEN gibi çiftler, BAKİYE, PLANLANAN, DURUM, İŞLEMLER |
| 2 | 'Hesap Grubu' süzgecinde 'Tedarikçi'yi seçip 'Filtrele'ye basın | Yalnız TED- kodlu cariler kalır |
| 3 | HIZLI FİLTRELER'de 'Borçsuzlar', 'Müşteriler' ve 'Eksik Faturalı' düğmelerine sırayla basın (düğme metinleri yalnız geniş ekranda görünür) | 'Borçsuzlar' kalan borcu 0 olanları gizler ya da gösterir; 'Müşteriler' müşteri hesaplarını gizler ya da gösterir; 'Eksik Faturalı' yalnız eksik faturalı carileri bırakır. Düğmenin üzerine gelince ipucu durumu yazar (ör. 'Kalan borcu 0 olanlar gizleniyor - Göstermek için tıklayın') |
| 4 | Toplam kiplerini deneyin: 'Genel Toplam', 'İş Yeri Bazlı', ≥2 şirkette 'Şirket Bazlı' | Toplamlar para birimi, iş yeri × para birimi ya da şirket × para birimi kırılımıyla gösterilir |
| 5 | Bir satırda 'Detay'a basın; sonra ⋮ menüsünde 'Düzenleme Geçmişi'ni açın | 'Cari Kart' detay penceresi açılır (Cari Adı, Cari Kodu, Cari Grubu, Vergi No, Telefon, Durum). Geçmişte 'Cari kart oluşturuldu' ve 'Cari kart güncellendi' olayları listelenir |
| 6 | Tedarikçi satırının ⋮ menüsünü açın | Menüde Detay İncele, Düzenleme Geçmişi, Ödeme Planlaması Yap (pasif, Faz 12.4), Cari Hareketler, Banka Hesapları, Ödeme Ekle, Ekstre Al, Düzenle ve Sil bulunur. Müşteri satırında plan öğeleri ve 'Ödeme Ekle' yoktur. Nakliye Firması / Sevk Nakliye Firması satırlarında ek olarak 'Sefer Maliyetleri' çıkar |
| 7 | ⋮ > 'Sil' > onay penceresinde 'Sil' | Pencere metni 'Cari kartı silmek istediğinizde emin misiniz?', odak 'İptal' düğmesindedir. Sonra 'Cari kart pasifleştirildi.' iletisi çıkar ve satır listeden kaybolur |
| 8 | 'Pasifleri göster' kutusunu işaretleyip satırda ⋮ > 'Aktifleştir'e basın | Pasif satır gri görünür; işlemden sonra 'Cari kart aktifleştirildi.' iletisi çıkar |
| 9 | finans@acme.test ile aynı sayfayı açın | 'Personel Yönetimi' düğmesi görünmez; Personel (Sürücü/Ofis) carileri listede ve Hesap Grubu süzgecinde yoktur |
| 10 | muhasebe@acme.test ile açın | 'Yeni Cari Kart' bağlantısı ile ⋮ menüdeki 'Düzenle', 'Sil' ve 'Ödeme Ekle' görünmez |

**Kontrol edilecek kurallar:**
- Silme yoktur: 'Sil' kartı pasifleştirir ve geri alınabilir (OK-15)
- Personel carileri yalnız FINANCE_EMPLOYEE_VIEW ile görünür (patron görür, finans görmez; sunucu bu carilere 404 döner)
- Eksik fatura uyarısı 1. yer: satırdaki kırmızı ünlem simgesi (ipucu 'Eksik fatura: {tutar}') ve 'Eksik Faturalı' süzgeci
- Şirket kırılımlı bakiye: 'Şirket Bazlı' kipi yalnız ≥2 aktif şirkette görünür; bakiyeler üst çubuktaki aktif şirkete göre hesaplanır

**Bilinen eksikler / sonraki faza kalanlar:**
- Ödeme Planlaması Yap, Planlamayı Düzenle, Onaya Gönder, Planlamayı Sil, 'Tüm Planlamalar', 'Ödeme Onay Yönetimi', 'Ödeme Planlama Haritası' ve hatırlatıcı Faz 12.4 olarak pasif
- 'Personel Yönetimi' düğmesi Faz 12.9 olarak pasif
- Çekler, Senetler, Krediler, Vadeli Mevduatlar gibi menü öğeleri sonraki fazlara ait
- 'Ödeme Ekle' yeni sekmede ZTO Ödemeler sayfasını Yeni Ödeme penceresiyle açar; bu pencere 12.2a'dadır ve şu an yapım aşamasında

### Yeni Cari Kart / Cari Kart Düzenle

- **Adres:** `/zto-finans/cari-kartlar/yeni, /zto-finans/cari-kartlar/:id/duzenle`
- **Menü:** ZTO Finans > CARİ İŞLEMLERİ > Yeni Cari Kart, ya da Cari Kartlar > 'Yeni Cari Kart'. Düzenleme için satır ⋮ > Düzenle
- **Kullanıcı:** patron@acme.test ya da finans@acme.test (FINANCE_MANAGE gerekir)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı açın | Odak 'Hesap Adı' alanındadır |
| 2 | Hesap Grubu='Tedarikçi', Varsayılan İş Yeri seçin; Hesap Adı='Test Kaynak Tedarikçi' girin; Hesap Kodu'nu boş bırakın. 'Banka Ekle' ile Banka Adı='Ziraat Bankası' ve geçerli bir TR IBAN'ı küçük harfle girin > 'Kaydet' | Listeye dönülür; 'Cari kart başarıyla oluşturuldu. (Hesap Kodu: TED-000001)' iletisi çıkar. Kod, grup öneki ve 6 haneli sayaçtan üretilir |
| 3 | Aynı yolla 'Test Hedef Tedarikçi' (Tedarikçi), 'Test Müşteri' (Müşteri) ve 'Test Sürücü' (Personel (Sürücü)) carilerini açın | Kodlar sırasıyla TED-000002, MUS-000001 ve SRC-000001 olur |
| 4 | Bireysel cari: Şirket Türü='Bireysel', Vergi No=10000000146, Adres/İl/İlçe doldurup kaydedin | Kayıt başarılı olur. Vergi No alanı yalnız rakam kabul eder (harf yazılamaz) |
| 5 | Hesap Grubu='Akaryakıt Tedarikçisi' (ya da 'Yedek Parça / Servis Tedarikçisi') seçip Vergi No'yu boş bırakarak kaydetmeyi deneyin | 'TC/Vergi No alanı boş geçilemez. Lütfen TC/Vergi No bilgisini giriniz.' hatası çıkar |
| 6 | Hesap Adı'na var olan bir carinin adından en az 3 harf yazın | Kısa bir beklemeden sonra 'Bu cari hesabı daha önce tanımlamış olabilirsiniz:' uyarısı ve en çok 5 cari bağlantısı görünür (yeni sekmede açılır) |
| 7 | Satır ⋮ > Düzenle'de Telefon'u değiştirip 'Güncelle'ye basın | 'Cari kart başarıyla güncellendi.' iletisi çıkar. Düzenleme ekranında 'Kayıt Bilgileri' ve 'Değişiklik Geçmişi' bölümleri vardır; banka satırı tam IBAN ile yüklenir |
| 8 | Hareketi olan Tedarikçi kartında Hesap Grubu'nu 'Hizmet Firması' yapın (aynı tür), sonra 'Müşteri' yapmayı deneyin (farklı tür) | Aynı tür içinde 'Hesap grubu değişti:' notu çıkar ve kayıt kabul edilir; farklı türe geçiş sunucu tarafından reddedilir |
| 9 | ≥2 şirkette 'Şirket' alanında 'Tüm şirketler (ortak kart)' ile belirli bir şirketi karşılaştırın | Ortak kart her iki şirketin iş yerinde kullanılabilir; şirkete bağlı kart yalnız kendi şirketinde kullanılabilir |
| 10 | Klavye testi: Shift+Tab ile Hesap Grubu'na gidip 'Ted' yazın; Tab ile İş Yeri'ne geçip Enter, ↓, Enter; Tab ile Hesap Adı'na geçip ad yazın; Telefon girip Enter'a basın | Form fare kullanmadan doldurulup gönderilir ve 'Cari kart başarıyla oluşturuldu' iletisi çıkar |
| 11 | finans@acme.test ile yeni kart açıp Hesap Grubu listesine bakın | 'Personel (Sürücü)' ve 'Personel (Ofis)' seçenekleri listede yoktur |
| 12 | muhasebe@acme.test ile /zto-finans/cari-kartlar/yeni adresine doğrudan gidin | 'Bu sayfaya erişim yetkiniz bulunmuyor.' iletisi görünür |
| 13 | (≥2 şirket) Bir GS- Grup Şirketi carisini Düzenle'de kaydetmeyi deneyin | Sunucu reddeder: 'Grup şirketi carisi şirket kartından yönetilir.' |

**Kontrol edilecek kurallar:**
- Hareketi olan carinin hesap türü değiştirilemez; aynı tür içinde grup değişebilir
- Başka şirkette hareketi olan kart bir şirkete bağlanamaz: 'Carinin başka şirkette hareketi var; şirkete bağlanamaz.'
- Kredi/Risk limiti yalnız gösterim içindir, işlemi engellemez
- Cari kartı adresi herkese görünür (K-12.2-5): bunu Cari Hareketler > Cari Bilgileri panelinde muhasebe kullanıcısıyla kontrol edin

### Cari Banka Hesapları (IBAN)

- **Adres:** `/zto-finans/cari-kartlar/:id/banka-hesaplari, …/banka-hesaplari/yeni, /zto-finans/banka-hesaplari/:bankAccountId/duzenle`
- **Menü:** Cari Kartlar > satır ⋮ > Banka Hesapları
- **Kullanıcı:** patron@acme.test; maskeleme karşılaştırması için muhasebe@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Banka hesabı olan carinin Banka Hesapları sayfasını açın | 'Banka Hesapları' sayfası açılır. IBAN sütunu '****' ile maskelidir, tam IBAN görünmez. Ekran okuyucu metni 'IBAN, son dört hane XXXX' |
| 2 | Satır menüsünden 'Hesap Detayları'nı açın | 'Banka Hesabı Detayları' paneli açılır. FINANCE_MANAGE sahibi tam IBAN'ı, tam hesap numarasını ve 'Kopyala' düğmesini görür |
| 3 | Satır menüsünden 'Hesap İşlemleri'ni açın | 'Banka Hesabı İşlemleri' paneli açılır; ödeme/tahsilat yoksa 'Bu hesaba ait ödeme/tahsilat bulunamadı.' yazar |
| 4 | Başka bir caride 'Yeni Banka Hesabı'na basın, aynı IBAN'ı girip 'Yeni Banka Hesabı Oluştur'a basın | IBAN altında 'Bu IBAN bilgisi kayıtlıdır, lütfen kontrol ediniz.' hatası çıkar |
| 5 | IBAN ve Hesap Numarası'nı boş bırakarak kaydetmeyi deneyin | 'IBAN veya hesap numarası girilmelidir.' hatası çıkar |
| 6 | Satır menüsünden 'Sil' > onay | 'Bu banka hesabını silmek istediğinize emin misiniz?' sorusu çıkar, ardından 'Banka hesabı başarıyla silindi.' (kayıt pasifleşir) |
| 7 | muhasebe@acme.test ile 'Hesap Detayları'nı açın | IBAN ve hesap numarası maskeli kalır; 'Kopyala', 'Yeni Banka Hesabı', Düzenle ve Sil görünmez |

**Kontrol edilecek kurallar:**
- KVKK: cari IBAN'ı ve hesap numarası şifreli saklanır, listede maskeli gösterilir; açık değer yalnız FINANCE_MANAGE detayında
- IBAN, aktif ve silinmemiş kayıtlar arasında kiracı genelinde tekildir (her cari için ayrı değil)

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Hesap İşlemleri' paneli 12.2a ile dolar; 12.2a bitmeden boş görünebilir

### Cari Hareketler: Borç/Alacak belgesi, iptal (ters kayıt), detay, limit, faturalar

- **Adres:** `/zto-finans/cari-kartlar/:id/hareketler`
- **Menü:** Cari Kartlar > satır ⋮ > Cari Hareketler (ya da cari adına tıklayın; yeni sekmede açılır)
- **Kullanıcı:** patron@acme.test ya da finans@acme.test. Borç/Alacak/Ödeme/Tahsilat Ekle ve satır Sil/Düzenle FINANCE_PAYMENT_CREATE ister; Cari Devir, Cari Taşıma, Limitleri Düzenle ve kenar paneldeki Düzenle FINANCE_MANAGE ister

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Test Kaynak Tedarikçi'nin hareketlerini açın | 'Cari Hesap Hareketleri' başlığı ve özet kartları görünür. Boş caride 'Bu caride herhangi bir hareket yapılmadı.' yazar |
| 2 | 'Borç Ekle'ye basın. 'Yeni Borç Ekle' penceresinde Belge Türü 'Alış Faturası' (varsayılan), Belge No/Fatura No=FTR-1, Mal Hizmet Toplam Tutar=1000, Ödeme Yöntemi='Banka Havalesi/Eft', İş Yeri seçili, KDV Oranı (%) 20 > 'Kaydet' | 'Borç kaydı başarıyla eklendi' iletisi çıkar. Tabloda 'Borç' rozetli FTR-1 satırı görünür; özet 'Borç' kartında 1.200 yazar |
| 3 | 'Borca Yansıt' işaretini kaldırarak ikinci bir Alış Faturası girin | Belge yalnız fatura bilgisi olarak kaydedilir ve bakiye değişmez. 'Detay' penceresinde 'Yalnız fatura bilgisi (cari hesaba yansımadı)' yazar |
| 4 | FTR-1 satırında 'Sil'e basın; 'Silme Onayı' penceresinde 'Evet, Sil'e basın | Pencere metni '<tür> kaydı iptal edilecek (ters kayıt oluşturulur).' ve odak 'İptal'dedir. Sonra '<tür> kaydı iptal edildi.' iletisi çıkar; satır silinmez, 'İptal' rozetli ters kayıt eklenir ve bakiye geri döner |
| 5 | 'Alacak Ekle'ye basın. Belge Türü 'Ceza / Kesinti (karşı tarafa kesilen)', Belge No=CZ-1, Tutar=250 > Kaydet | 'Alacak (Ceza / Kesinti (karşı tarafa kesilen)) kaydı başarıyla eklendi' iletisi çıkar; satır 'Alacaklar' sekmesinde görünür |
| 6 | 'Borç Ekle' penceresinde Belge Türü listesine bakın | 'Ceza (bize kesilen)' ve 'Kasa Fişi' listededir; 'Kur Farkı' listede yoktur (seçilemez) |
| 7 | Bir belge satırında 'Düzenle'ye basıp tutarı değiştirerek kaydedin | 'Güncelle' başlıklı pencere açılır. Kayıttan sonra eski belge iptal edilir (ters kayıt) ve yeni belge oluşur |
| 8 | İptal edilmiş satırda ve ters kayıt satırında 'Detay'a basın | 'İşlem Detayları' penceresi açılır. Orijinalde 'Bu hareket iptal edilmiş (ters kayıt oluşturuldu).', ters kayıtta 'Bu kayıt bir ters kayıttır.' yazar |
| 9 | Limit kartında 'Limitleri Düzenle'ye basıp Kredi Limiti=500 girin > Kaydet | 'Kredi & Risk Limiti Düzenle' penceresi açılır; kayıttan sonra 'Limitler güncellendi.' ve limit kartında 'Kredi Limiti:' görünür. Bakiye limiti aşınca kart 'Kredi limiti aşıldı' der ama yeni belge girişi engellenmez |
| 10 | 'Alış Faturaları' ve 'Satış Faturaları' düğmelerine basın | 'Alış Fatura Listesi' penceresinde 'Manuel Fatura Kayıtları' ve 'Referanslı Faturalar'; 'Satış Fatura Listesi' penceresinde 'Manuel Satış Faturaları' ve 'Referanslı Faturalar' bölümleri görünür |
| 11 | Araç çubuğundaki 'İş Yeri' süzgecinden bir iş yeri seçin; Tüm Hareketler, Borçlar, Ödemeler, Alacaklar ve Tahsilatlar sekmelerini gezin | Tablo süzgece göre değişir; 'İş Yeri Borç/Alacak Dağılımı' kartı iş yeri kırılımını gösterir |
| 12 | Sol kenardaki 'Cari Bilgileri' tutamağını açın | Panelde Temel Bilgiler, Vergi ve finans, İletişim ve yetkili, 'Adres ve konum', Ödeme ve notlar, Kayıt Bilgileri ve Değişiklik Geçmişi bölümleri görünür |
| 13 | muhasebe@acme.test ile aynı sayfayı açın | Borç Ekle, Alacak Ekle, Ödeme Ekle, Tahsilat Ekle, satır Sil/Düzenle, 'Cari Devir', 'Cari Taşıma' ve 'Limitleri Düzenle' görünmez; 'Ekstre Al' görünür. Panelde adres açık görünür; Bireysel carinin Vergi No'su (TCKN) maskelidir |
| 14 | (patron) Bir cariyi pasifleştirin, ardından /zto-finans/cari-kartlar/{id}/hareketler adresinden Borç Ekle ile kaydetmeyi deneyin | Pencerede 'Borç kaydı eklenirken bir hata oluştu! Pasif cariye yeni işlem girilemez.' iletisi görünür |

**Kontrol edilecek kurallar:**
- Silme yok: iptal her zaman ters kayıttır; orijinal satır 'İptal edildi' olarak kalır
- Tek finans motoru: belge LedgerService üzerinden deftere yazılır; saklı bakiye yoktur, özet hareketlerden hesaplanır
- Adres detayda herkese görünür (FINANCE_VIEW, K-12.2-5); TCKN maskelenir, açık TCKN yalnız FINANCE_MANAGE detayında (OK-14)
- Şirket kırılımlı bakiye: ≥2 şirkette İş Yeri Dağılımı şirket başlıklarıyla gruplanır. Üst çubukta belirli bir şirket seçiliyken limit penceresinde 'Şirket: X — bu şirketin limiti' yazar

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Ödeme Ekle' ve 'Tahsilat Ekle' yeni sekmede ZTO Ödemeler/Tahsilatlar sayfasını açar; bu pencereler 12.2a'dadır ve şu an yapım aşamasında
- ZTO'daki 'Son 30 Hareket' grafiği birebir yapılmadı (Faz 12 uygulama notu); limit kartındaki dönem seçmeli grafik farklı bir bileşendir
- Ödeme planı pencereleri 12.4'te gelecek

### Eksik fatura uyarısı (cari listesi, cari kartı, ekstre, belge penceresi, MUI fatura girişi)

- **Adres:** `/zto-finans/cari-kartlar, /zto-finans/cari-kartlar/:id/hareketler, /zto-finans-yazdir/cari-ekstre/:id, /finance/invoices`
- **Menü:** Cari Kartlar, Cari Hareketler, Ekstre Al, MUI Finans > Faturalar
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Yeni bir tedarikçide 'Borç Ekle' > Belge Türü 'Kasa Fişi' (fatura sayılmaz), Tutar=1000 > Kaydet | Cari Hareketler özetinde 'Kalan 1.000,00 ₺ için fatura bilgisi eksik.' satırı ve başlıkta 'Eksik fatura' rozeti çıkar |
| 2 | Cari Kartlar'a dönüp 'Eksik Faturalı' süzgecine basın | Cari listede kalır. Ad yanındaki kırmızı ünlemin ipucu (üzerine gelince ya da odakta) 'Eksik fatura: 1.000,00 ₺' der |
| 3 | Cari Hareketler > 'Borç Ekle'de Belge Türü 'Alış Faturası' seçin. 'Borca Yansıt' işaretini kaldırın; KDV Oranı (%)=0 ve Mal Hizmet Toplam Tutar=1000 girin | Pencerede 'Kalan 1.000,00 ₺ için fatura bilgisi eksik.' ve 'Bu belge kaydedilince kalan: 0,00 ₺' satırları görünür. Kayıttan sonra rozet ve uyarı kalkar (tolerans 1) |
| 4 | Eksik varken 'Ekstre Al'a basıp 'TÜM İŞYERLERİ VE PARA BİRİMLERİ ÖZET TABLOSU'na bakın | 'Fatura bilgisi eksik' ve tarafa göre 'CARİ ALACAĞI' ya da 'CARİ BORCU' satırı görünür |
| 5 | Eksik faturası olan tedarikçi için MUI Finans > Faturalar > 'Fatura ekle' formunda Cari'yi seçin | Uyarı kutusu çıkar: 'Cari alacağı …, girilen fatura …: kalan … için fatura bilgisi eksik. Bu fatura kaydedildiğinde cari alacağına da eklenir; …'. Eksiği olmayan caride bu kutu görünmez |

**Kontrol edilecek kurallar:**
- Eksik tutar = defter toplamı − fatura toplamı (şirket × para birimi × taraf). Açılış bakiyesi hesaba girmez; açılış faturası fatura sayılır
- Kullanıcı kararı, uyarının 4 yeri: cari listesi, cari kartı/ekstre, ödeme/tahsilat ekranı (12.2a), fatura girişi (MUI Faturalar)

**Doğrulanamadı:**
- Ödeme/tahsilat ekranındaki eksik fatura uyarısı 12.2a kapsamındadır ve bu alanda doğrulanmadı

### Cari Devir / Sezon

- **Adres:** `/zto-finans/cari-kartlar/:id/hareketler (pencere #cariDevirModal)`
- **Menü:** Cari Hareketler > tablo üstündeki 'Cari Devir' düğmesi
- **Kullanıcı:** patron@acme.test ya da finans@acme.test (FINANCE_MANAGE)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Cari Devir'e basın. Devir Tarihi seçin, Sezon Adı='2026 Sezonu' girin > 'Devir Oluştur' | 'Cari Devir / Sezon' penceresinde 'Devir tarihi ileriye dönüktür: …' bilgisi yazar; sezon 'Önceki Devirler / Sezonlar' listesinde 'Aktif' rozetiyle görünür |
| 2 | Pencereyi 'Kapat' ile kapatın; başlıktaki 'Devir Sezonları' seçicisini açın | Seçenekler: 'Tüm Sezonlar', 'Açılış (devir öncesi)', '2026 Sezonu'. Sezon seçilince 'Devir Kırılımı' kartında 'Devir Öncesi' ve 'Devir Sonrası' görünür |
| 3 | İkinci bir sezon açıp 'Aktif Yap' deyin; sonra aktif sezonu 'Sil'meyi deneyin | Her an tek aktif sezon olur. Aktif sezon silinirken 'Aktif Sezon Siliniyor' penceresi 'Yeni Aktif Sezon' seçimi ister ('Sil ve Aktif Yap') |
| 4 | 'Silinenler' > 'Geri Getir' | 'Bu kaydı geri getirmek istiyor musunuz?' onayından sonra silinen sezon geri gelir |
| 5 | Devir öncesi ve sonrası genel bakiyeyi karşılaştırın | Genel bakiye değişmez |

**Kontrol edilecek kurallar:**
- Sezon devri deftere kayıt yazmaz; genel bakiye değişmez, yalnız devir öncesi/sonrası kırılımı oluşur
- Tek aktif sezon kuralı (OK-40)

### Cari Taşıma (açık planlı hareket taşınamaz, geri alma)

- **Adres:** `/zto-finans/cari-kartlar/:id/hareketler (pencereler #cariTasimaModal, #ctConfirmModal, #cariTasimaHistoryModal)`
- **Menü:** Cari Hareketler > 'Cari Taşıma'
- **Kullanıcı:** patron@acme.test ya da finans@acme.test (FINANCE_MANAGE)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Hazırlık: 'Test Kaynak Tedarikçi'ye Borç Ekle ile FTR-2 (100) ve FTR-3 (200) girin. MUI Finans > Faturalar > 'Fatura ekle' ile aynı cariye bir alış faturası girin (Cari, Şube, Numara, Fatura tarihi, Vade, Net, KDV, Para birimi) | Alış faturası cariye yazılır ve taslak ödeme planı kendiliğinden açılır (MUI Finans > Ödeme Planı) |
| 2 | 'Cari Taşıma'ya basın; Hedef Cari'ye 'Test Hedef' yazıp sonuçtan seçin | Hedef etiketinin yanında '(yalnız aynı hesap grubu: Tedarikçi)' yazar; başka gruptaki cariler ve kaynak carinin kendisi aramada çıkmaz |
| 3 | 'Taşınacak Hareketler' listesinde alış faturası satırına bakın | Satırın kutusu pasiftir; üzerine gelince 'Açık ödeme planı var; önce planı ödeyin ya da iptal edin.' ipucu çıkar |
| 4 | FTR-2 ve FTR-3 kutularını işaretleyin | '2 seçili' yazar |
| 5 | 'Taşı'ya basın; 'Cari Taşıma Onayı' penceresinde 'Evet, Taşı'ya basın | Onay metni '2 hareket <hedef> cariye taşınacak.' der. Ardından '2 hareket taşındı.' iletisi çıkar. Kaynakta satırlar 'Taşındı', hedefte 'Taşıma' rozetiyle görünür; bakiye kaynaktan hedefe geçer |
| 6 | Kaynakta taşınmış bir satırı 'Sil' ile iptal etmeyi deneyin | Hata metninde 'Bu hareket başka cariye taşınmış; önce cari taşımayı geri alın.' yazar |
| 7 | 'Cari Taşıma' > 'Geçmiş Taşımalar'da satırdaki 'Geri Al'a basın; onayda 'Geri Al' | 'Taşıma geri alındı.' iletisi çıkar; Durum 'Geri alındı' olur ve hareketler kaynağa döner |
| 8 | Planı MUI Finans > Ödeme Planı'nda 'İptal et' ile iptal edin (ya da ödeyin), sonra Cari Taşıma'yı yeniden açın | Alış faturası satırı taşınabilir olur |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: planı açık (DRAFT/PENDING/APPROVED/REJECTED) hareket taşınamaz (OK-36; sunucu 409 TRANSACTION_HAS_OPEN_PLAN 'Hareketin açık ödeme planı var; önce planı ödeyin ya da iptal edin.')
- Taşıma orijinal satırı değiştirmez; taşıma tarihli virman çifti yazar (ACCOUNT_TRANSFER_OUT/IN)
- Seçili hareketlere bağlı tüm çek/senetler hedef cariye geçer (12.3 öncesinde çek verisi olmayabilir)
- ≥2 şirkette hedef kart başka şirkete bağlıysa taşıma reddedilir (COMPANY_MISMATCH)

**Bilinen eksikler / sonraki faza kalanlar:**
- Geri alma tarihinin taşıma tarihinden önce olmasını engelleyen doğrulama yok
- Taşımayla gelen satırda kaynak cari kodu yazılmıyor

**Doğrulanamadı:**
- Borç Ekle (ACCOUNT_DOCUMENT) satırları plan engeline girmez; engel yalnız PURCHASE_INVOICE, OPENING_INVOICE ve TRIP_COST kaynaklı satırlarda (FinanceRepositories OPEN_PLAN SQL'inden doğrulandı, ekranda denenmedi)

### Cari Ekstre yazdırma

- **Adres:** `/zto-finans-yazdir/cari-ekstre/:id`
- **Menü:** Cari Hareketler > 'Ekstre Al' (yeni sekme); ya da Cari Kartlar satır ⋮ > Ekstre Al; ya da Hızlı Cari İşlemi > Ekstre Al
- **Kullanıcı:** FINANCE_VIEW sahibi herkes (muhasebe dahil)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Ekstre Al'a basın | Uygulama kabuğu (MUI menü) olmadan yeni sekme açılır; başlık 'EKSTRE', sekme adı 'Hesap Ekstresi - {cari adı}'. Yazı tipi Courier New'dur |
| 2 | Şirket başlığını kontrol edin | Şirket adı görünür (logo yüklüyse logo da); 'ZTO FABRİKA' yazısı hiçbir yerde geçmez. Altbilgide '{şirket} - Cari Hesap Yönetim Sistemi' yazar |
| 3 | 'Tarih Aralığı' girip 'Uygula'ya basın; sonra 'Tüm Zamanlar'ı deneyin | İlk satır 'DEVREDEN BAKİYE'dir; her para birimi için '{PB} Ekstresi' bölümü ve 'Genel Toplam ({PB})' çıkar |
| 4 | 'Bakiye Hesaplaması'nı 'İşlem Tarihi'nden 'Fatura Tarihi'ne çevirin. 'İşyeri' süzgecini, ≥2 şirkette 'Şirket' süzgecini ve tedarikçi carisinde 'Detaysız'/'Detaylı' anahtarını deneyin | Detaylı kipte 'Fatura Detayları' (KDV Hariç, KDV, Stopaj, Net) görünür. Müşteri carisinde Detaysız/Detaylı anahtarı yoktur (yalnız Tedarikçi, YPS, AKY, HZM, NAK, SVN gruplarında) |
| 5 | İptal edilmiş bir belgenin ekstredeki görünümüne bakın | Orijinal belge ve ters kaydı ikisi de ekstrede yer alır; net etkileri sıfırdır |
| 6 | 'Yazdır'a basın | Tarayıcının yazdırma penceresi açılır |

**Kontrol edilecek kurallar:**
- Şirket kırılımlı ekstre: Şirket süzgeci yalnız ≥2 aktif şirkette görünür
- Eksik fatura özet satırı için yukarıdaki eksik fatura testine bakın

**Bilinen eksikler / sonraki faza kalanlar:**
- Detaylı kipte İndirim ve Diğer vergiler sütunları yok

### Günlük Tüm Cari İşlemleri ve Hızlı Cari İşlemi

- **Adres:** `/zto-finans/cari-hareketler (/zto-finans buraya yönlenir)`
- **Menü:** Sol menü 'ZTO Finans' (doğrudan açılır) ya da yan menü CARİ İŞLEMLERİ > Günlük Cari İşlemleri. 'Hızlı Cari İşlemi' aynı bölümdeki bir düğmedir ve pencere açar
- **Kullanıcı:** patron@acme.test; karşılaştırma için finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | /zto-finans adresini açın | /zto-finans/cari-hareketler'e yönlenir; 'Günlük Tüm Cari İşlemleri' başlığı görünür ve günün hareketleri listelenir |
| 2 | '7 Gün' düğmesine basın; tablo arama kutusuna cari adını yazın | Tarih aralığı değişir; girdiğiniz hareketler tutarlarıyla (ör. '1.250,50 ₺') görünür |
| 3 | 'İş Yerleri' kartında bir iş yerine tıklayın | 'İş Yeri: {ad}' çipi eklenir; çipteki kaldırma düğmesi süzgeci kaldırır |
| 4 | Başlangıç Tarihi ve Bitiş Tarihi'ne 2001-01-01 girin | 'Bugün henüz bir cari işlemi yapılmadı' boş durum metni görünür |
| 5 | 1 yıldan uzun bir aralık girin; sonra bitişi başlangıçtan önceye alın | Sırasıyla 'Tarih aralığı en çok 1 yıl olabilir.' ve 'Bitiş tarihi başlangıç tarihinden önce olamaz.' iletileri çıkar |
| 6 | 'Hızlı Cari İşlemi'ne basın; 'Cari ara — ad veya kod yazın...' kutusuna cari adını yazıp seçin | Seçmeden önce 'Bir cari arayın ve seçin' yazar. Seçimden sonra işlem kartları görünür (Cari Hareketler, Ekstre Al, Banka Hesapları, Ödeme Ekle, Düzenle ve gruba göre Sefer Maliyetleri / Sürücü Kartı). 'Cari Hareketler' carinin hareket sayfasını açar |
| 7 | finans@acme.test ile aynı aralıkta personel carisinin hareketini arayın | Personel hareketi listede görünmez |

**Kontrol edilecek kurallar:**
- İptal (ters kayıt) satırları silinmiş gibi kaybolmaz; listede görünür
- Personel carisi hareketleri yalnız FINANCE_EMPLOYEE_VIEW ile görünür

### Personel carisi görünürlüğü ve KVKK maskeleme (çapraz kullanıcı testi)

- **Adres:** `/zto-finans/cari-kartlar, /zto-finans/cari-kartlar/:id/hareketler, /finance/accounts`
- **Menü:** ZTO Finans > Cari Kartlar; MUI Finans > Cari
- **Kullanıcı:** patron@acme.test, finans@acme.test, muhasebe@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Patron ile 'Test Sürücü' (Personel (Sürücü)) carisini açın, Borç Ekle ile bir hareket girin ve URL'deki kimliği not edin | Patron personel carisini listede ve hareketlerde görür |
| 2 | finans@acme.test ile Cari Kartlar'ı açın; sonra not ettiğiniz /zto-finans/cari-kartlar/{id}/hareketler adresine doğrudan gidin | Cari listede yoktur. Doğrudan adreste 'Cari bulunamadı.' ya da 'Cari bilgileri yüklenemedi.' görünür (sunucu 404 ACCOUNT_NOT_FOUND; carinin varlığı sızdırılmaz) |
| 3 | finans ile Günlük Tüm Cari İşlemleri'nde personel hareketini arayın | Personel hareketi görünmez |
| 4 | finans ile MUI Finans > Cari > 'Cari ekle' formunda Tür seçeneklerine bakın | 'Personel/Sürücü' seçeneği listede yoktur |
| 5 | muhasebe@acme.test ile bireysel carinin Cari Hareketler > 'Cari Bilgileri' paneline bakın | Vergi No (TCKN) maskelidir; adres satırı açık görünür |
| 6 | Patron ile aynı carinin Düzenle formunu ve Cari Bilgileri panelini açın | TCKN açık görünür (FINANCE_MANAGE + detay) |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: personel carileri yalnız FINANCE_EMPLOYEE_VIEW ile görünür (Patron/Yönetici ve Finans (Süper)); Finans ve Muhasebe rolüne 404
- Kullanıcı kararı: kart adresi detayda herkese görünür; liste yanıtında adres yoktur
- TCKN ve cari IBAN'ı şifreli saklanır ve maskeli gösterilir; VKN ve grup carisinin vergi numarası düz metindir

### Çoklu şirket: şirket kırılımlı bakiye ve kart-şirket kuralı

- **Adres:** `/zto-finans/cari-kartlar, /zto-finans/cari-kartlar/:id/hareketler`
- **Menü:** Üst çubuktaki 'Aktif şirket' seçicisi + ZTO Finans > Cari Kartlar
- **Kullanıcı:** patron@acme.test (≥2 aktif şirket gerekir)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Ortak Tedarikçi' adında, Şirket='Tüm şirketler (ortak kart)' olan bir tedarikçi açın. Varsayılan şirketin iş yerinde 1000, Beta'nın iş yerinde 500 borç girin | 'İş Yeri Borç/Alacak Dağılımı' iki şirket başlığı altında ayrı görünür |
| 2 | Cari Kartlar'da 'Şirket Bazlı' toplam kipine geçin | Toplamlar şirket × para birimi kırılımıyla görünür |
| 3 | Üst çubuktaki 'Aktif şirket'te 'Beta Nakliyat'ı, sonra 'Tüm şirketler (konsolide)'yi seçin | Bakiyeler ve limit kartı seçili şirkete göre değişir; konsolidede iki şirketin toplamı görünür |
| 4 | Ortak kartı Düzenle'de yalnız 'Beta Nakliyat'a bağlamayı deneyin | 'Carinin başka şirkette hareketi var; şirkete bağlanamaz.' hatası çıkar |
| 5 | Beta'ya bağlı yeni bir kart açın; varsayılan şirketin iş yerini seçip Borç Ekle ile kaydetmeyi deneyin | Pencerede 'Borç kaydı eklenirken bir hata oluştu! Cari bu şirkete ait değil.' iletisi görünür (422 COMPANY_MISMATCH) |
| 6 | Cari Kartlar'da Hesap Grubu='Grup Şirketi' süzgeciyle GS- carilerini listeleyin. Varsayılan şirketi temsil eden GS- carisine, varsayılan şirketin iş yerinden Borç Ekle girmeyi deneyin | Her aktif şirket için bir GS- carisi vardır. Kayıt reddedilir: 'Şirket kendi grup carisine hareket yazamaz.' |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: cari kart ortaktır; bakiye, ekstre ve limit şirket kırılımlıdır (04 §6.2-Y1)
- Kart-şirket kuralı yalnız kullanıcı girişli yollarda uygulanır; türetilmiş akışlar (sefer, fatura, plan ödemesi) engellenmez (OK-28)
- Grup Şirketi carileri yalnız şirketler arası virmanla (12.2 Transfer Merkezi) hareket alır; kasa/banka şirket bazındadır ve şirketler arası transfer GS carilerine otomatik kayıt yazar (12.2 rehberinde test edilir)

**Doğrulanamadı:**
- Borç Ekle penceresindeki İş Yeri listesinin tüm şirketlerin iş yerlerini mi, yoksa yalnız aktif şirketinkileri mi gösterdiği kodda tek tek doğrulanmadı; konsolide görünümde deneyin

### Faaliyet raporu yazdırma (12.2 fon raporu, bağlantı için)

- **Adres:** `/zto-finans-yazdir/faaliyet-raporu/:id?from=…&to=…`
- **Menü:** ZTO Finans > BANKA & KASA İŞLEMLERİ > Tüm Banka Hareketleri (ya da Tüm Kasa Hareketleri) > 'Faaliyet Raporu'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Bankalar > 'Yeni Banka' ile bir banka açın (Başlangıç Bakiyesi girin); sonra transferle bir çıkış hareketi oluşturun | Bankada en az bir giriş ve bir çıkış hareketi bulunur |
| 2 | Banka Hareketleri > 'Faaliyet Raporu' > 'Banka Seçin', tarih aralığı > 'Raporu Göster' | Yeni sekmede 'Banka Faaliyet Raporu' açılır (sekme adı 'Banka Faaliyet Raporu - FIFO Analizi'); 'FIFO Giriş-Çıkış Eşleştirme' tablosu girişlerin hangi çıkışlarla eşleştiğini gösterir |
| 3 | Banka seçmeden deneyin; sonra ters tarih aralığıyla deneyin | Sırasıyla 'Lütfen bir banka seçin.' ve 'Başlangıç tarihi bitiş tarihinden sonra olamaz.' iletileri çıkar |

**Kontrol edilecek kurallar:**
- Kasa/banka şirket bazındadır; rapor tek fonun hareketlerini kullanır

**Bilinen eksikler / sonraki faza kalanlar:**
- Bu rapor cari değil fon (banka/kasa) raporudur ve 12.2'ye aittir; cari tarafında ayrı bir faaliyet raporu yoktur

---

## 3. Faz 12.2 — Banka/kasa, transfer merkezi, döviz bozumu, uyarılar


### Bankalar listesi (Banka Hesapları)

- **Adres:** `/zto-finans/bankalar`
- **Menü:** ZTO yan menü → BANKA & KASA İŞLEMLERİ → Bankalar
- **Kullanıcı:** patron@acme.test ve finans@acme.test. Liste FINANCE_VIEW ister. 'Yeni Vadesiz Hesap', Düzenle ve Sil FINANCE_MANAGE ister. Kart ve menüdeki Ödeme/Tahsilat FINANCE_PAYMENT_CREATE ister

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı açın | 'Banka Hesapları' başlığı. Stat kartları: 'Vadesİz Hesaplar', 'Kredİ Hesapları', 'Vadelİ Mevduatlar', 'Yatırımlar' (ZTO'daki büyük İ yazımı birebir). Sekmeler: Tümü / Vadesiz / Kredi / Vadeli Mevduat / Yatırım |
| 2 | Hiç hesap yokken bakın | 'Henüz banka hesabı bulunmuyor' boş durumu ve 'Yeni Vadesiz Hesap' düğmesi |
| 3 | Hesaplar girildikten sonra bir kartı inceleyin | Kartta hesap adı ve bakiye (ör. '5.000,00 ₺'), 'Son 20 hareketin bakiye değişimi' sparkline'ı ve 'Dönem Başı Bakiyesi:' görünür. İleri tarihli hareket varsa '{n} ileri tarihli hareket' ve 'Net:'. Kart düğmeleri: Hareketler, Plan (pasif), Ödeme, Tahsilat, Detay |
| 4 | Arama kutusuna ('Banka, şube, IBAN, kod veya iş yeri ara...') en az 2 karakter yazın | Liste canlı süzülür. Sonuç yoksa '"…" için eşleşen banka hesabı bulunamadı.' |
| 5 | Vadesiz bir kartın ⋮ menüsünü açın (erişilebilir adı '{ad} işlemleri') | Sırasıyla: Detay, Banka Hareketleri, Ödeme Planı Oluştur (pasif, Faz 12.4), 'Virman (Aynı banka & para birimi)', EFT Gönder, Havale Gönder, EFT Al, Havale Al, 'Döviz Bozum / Döviz Alım Yap', 'Bankadan Kasaya Transfer', 'Kasadan Bu Bankaya Transfer', 'Bankadan Cari Ödemesi Yap', 'Bankadan Cari Tahsilatı Yap', 'Bankadan Cari Çek Ödemesi Yap' (pasif, Faz 12.3), 'Banka Ekstre Al', Düzenle, Sil. Transfer bağlantıları Transfer Merkezi'ni YENİ SEKMEDE ön seçimli açar. Menü, kartın hover efektiyle ekran dışına kaymamalı |
| 6 | ⋮ → 'Bankadan Cari Ödemesi Yap' | Yeni sekmede Banka Hareketleri bu hesap seçili açılır (?openModal=true). 12.2a çalışma ağacında sayfa içi ZTO ödeme modalı kendiliğinden açılır |
| 7 | Hareketi olan bir hesapta ⋮ → Sil | 'Hesap Silme' modalı: 'Bu hesap silinemez!' ve 'Bu hesaba bağlı işlemler var: N adet banka işlemi…'. İlk odak 'İptal'te. 'Pasifleştir' düğmesi var |
| 8 | 'Pasifleştir'e basın | 'Hesap pasifleştirildi.' Kart gri ve 'Pasif' etiketli. Pasif hesap Transfer Merkezi kaynak/hedef listelerinde görünmez (aktif fonlar süzülür) |
| 9 | Hareketsiz yeni bir hesapta Sil | '… hesabı silinebilir.', 'Bu işlem geri alınamaz. Devam etmek istiyor musunuz?' ve 'Evet, Sil'. Silince 'Hesap başarıyla silindi.' |
| 10 | 2 şirket varken (konsolide görünümde) sayfayı yenileyin | 'Şirketler' çip kartı görünür. 'Beta Nakliyat' çipine basınca yalnız B'nin hesapları kalır. Tek şirkette bu kart hiç görünmez |

**Kontrol edilecek kurallar:**
- K-12.2-1: kasa/banka şirket bazındadır. Şirket çipi süzgeci ve gruplar şirkete göre ayrı olmalı
- Silinemeyen hesap pasifleştirilebilir (OK-12.2-9). Pasif hesaba kullanıcı girişli yeni hareket 'Pasif banka/kasa hesabıyla işlem yapılamaz.' (FUND_INACTIVE) hatası verir
- Yalnız FINANCE_VIEW sahibi (Muhasebe) kullanıcıda 'Yeni Vadesiz Hesap', Düzenle/Sil ve Ödeme/Tahsilat öğeleri olmamalı

**Bilinen eksikler / sonraki faza kalanlar:**
- Kredi (12.5), Vadeli Mevduat (12.6) ve Yatırım (kapsam dışı) sekmeleri 0 veriyle gelir; düğmeleri pasiftir ('Faz 12.x ile gelecek.' / 'Kapsam dışı')
- Ödeme Planı Oluştur 12.4'te, Bankadan Cari Çek Ödemesi 12.3'te gelecek
- Kullanıcı yolunda yalnız Vadesiz hesap açılabilir (OK-12.2-17)

### Yeni Banka / Banka Düzenle

- **Adres:** `/zto-finans/bankalar/yeni, /zto-finans/bankalar/:id/duzenle`
- **Menü:** Bankalar → 'Yeni Vadesiz Hesap'; kart ⋮ → Düzenle
- **Kullanıcı:** patron@acme.test veya finans@acme.test (FINANCE_MANAGE)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Yeni Banka' formunda 'Banka' listesinden 'Akbank T.A.Ş.'yi seçin. 'Banka Kodu' girin, 'Hesap Adı'na 'A Bankası TL' yazın, Para Birimi TRY | Banka seçimi select2 görünümündedir ve aranabilir |
| 2 | IBAN alanına küçük harfli ve boşluklu yazın: tr33 0006 1005 1978 6457 8413 26 | Değer TR330006100519786457841326 olur. Geçersiz IBAN'da 'Geçerli bir TR IBAN giriniz.' |
| 3 | 'İş Yeri'nde A İş Yeri'ni seçin, 'Başlangıç Bakiyesi'ne 5000 yazın, 'Yeni Banka Oluştur'a basın | 2 şirkette İş Yeri altında 'Şirket: {ad}' bilgisi görünür. 'Şube İli' salt okunurdur ve İş Yeri'nin şubesini gösterir. Kayıttan sonra /zto-finans/bankalar'a dönülür, 'Vadesiz hesap başarıyla oluşturuldu.' çıkar ve kartta '5.000,00 ₺' görünür |
| 4 | Başlangıç Bakiyesi'ne -100 yazın, 'Eksi bakiyeye izin ver' kapalıyken kaydetmeyi deneyin | 'Eksi açılış için 'Eksi bakiyeye izin ver' seçilmelidir.' |
| 5 | Para Birimi USD ve 0'dan farklı açılış bakiyesiyle hesap açın | 'Açılış Kuru (₺)' alanı ve 'Boş bırakılırsa başlangıç tarihindeki TCMB kuru kullanılır.' ipucu görünür. Kur yoksa ve alan boşsa 'Başlangıç tarihi için kur bulunamadı; açılış kurunu giriniz.' |
| 6 | Aynı Banka Kodu ile ikinci hesap açmayı deneyin | 'Bu kod başka bir hesapta kullanılıyor.' Fon kodu kiracı genelinde tekildir (OK-12.2-23) |
| 7 | Kart ⋮ → Düzenle | 'Banka Düzenle' başlığı. Hesap adı etiketi 'Banka Adı' olur. 'Banka Kodu' salt okunur, 'Para Birimi' kilitli, 'Güncel Bakiye' salt okunur (ör. 5.000,00). Kayıtta 'Hesap başarıyla güncellendi.' |
| 8 | Düzenlemede 'Başlangıç Bakiyesi'ni değiştirip kaydedin, sonra bu hesabın Banka Hareketleri'ne bakın | Yeni bir 'Başlangıç Bakiyesi' hareketi oluşur. Eskisi kendi tarihiyle ters kayda alınır, silinmez (OK-12.2-28) |
| 9 | Düzenlemede 'Durum'u 'Pasif' yapıp kaydedin | Hesap pasifleşir. Bu, listede 'Pasifleştir'e alternatif yoldur |

**Kontrol edilecek kurallar:**
- Hesap numarası şifreli saklanır. Düz numara yalnız FINANCE_MANAGE sahibine görünür, diğer kullanıcılara maskelidir
- Açılış bakiyesi saklı bakiye değildir; FUND_OPENING hareketiyle yazılır

### Banka Hesap Detayı

- **Adres:** `/zto-finans/bankalar/:id`
- **Menü:** Bankalar → kartta 'Detay' ya da ⋮ → Detay
- **Kullanıcı:** patron@acme.test, finans@acme.test; maske ve düğme kontrolü için Muhasebe rolü

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Bir vadesiz hesabın detayını açın | 'Banka Hesap Detayı' başlığı. 'Genel Bilgiler'de Banka Kodu:, Banka Adı:, Şube Adı:, Hesap Türü:, Hesap Numarası:, IBAN:, Para Birimi:, İş Yeri:, Şube İli:, Şirket:, Oluşturma Tarihi:, Durum:. Ayrıca 'İlişkili Modüller', 'Son İşlemler' ve 'Tümünü Gör' |
| 2 | 'İlişkili Modüller'de 'Banka Hareketleri', 'Banka Transfer & Döviz Bozum' ve 'Banka Ekstre Al' bağlantılarına basın | İlgili sayfalar bu hesap ön seçili açılır |
| 3 | Muhasebe kullanıcısıyla (yalnız FINANCE_VIEW) aynı sayfayı açın | Hesap Numarası maskeli görünür, 'Düzenle' ve 'Sil' düğmeleri yoktur. 'Sil' FINANCE_MANAGE sahibinde de yalnız hesap silinebilirse görünür |

**Kontrol edilecek kurallar:**
- Hesap numarasının düz metni yalnız FINANCE_MANAGE sahibine gösterilir (OK-12.2-18)

**Bilinen eksikler / sonraki faza kalanlar:**
- Fon IBAN'ı (eski V3 alanı) düz metin saklanıyor. Bu kabul edilmiş bir risk; şifreleme kullanıcı kararına bağlı

### Kasalar, Yeni Kasa / Kasa Düzenle, Kasa Detayları modalı

- **Adres:** `/zto-finans/kasalar, /zto-finans/kasalar/yeni, /zto-finans/kasalar/:id/duzenle`
- **Menü:** ZTO yan menü → Kasalar
- **Kullanıcı:** patron@acme.test veya finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Kasalar'da 'Yeni Kasa'ya basın. Kasa Kodu'na odaklanın; yalnız klavyeyle kodu yazın, Tab, 'Kasa Adı' (A Kasası), Tab, Para Birimi TRY, İş Yeri A İş Yeri, 'Başlangıç Bakiyesi' 1000, sonra Enter | /zto-finans/kasalar'a döner ve kasa kartı görünür. Form klavyeyle doldurulup kaydedilebilmeli |
| 2 | Aynısını B İş Yeri'nde 'B Kasası' için yapın | Kasa kartları oluşur |
| 3 | Stat kartlarına ve sekmelere bakın | Kartlar: 'Toplam Bakiye', 'Ortalama Bakiye', 'Başlangıç Bakiyesi', 'Şubeler'. Sekmeler: Tümü / İş Yeri / Şube / Para Birimi; 2 şirkette ayrıca 'Şirket' |
| 4 | Kart ⋮ menüsünü açın | Detay, Kasa Hareketleri, Kasadan Bankaya Transfer, Kasadan Kasaya Transfer, Bankadan Bu Kasaya Transfer, Kasadan Bu Kasaya Transfer, Kasadan Cari Ödemesi Yap, Kasadan Cari Tahsilatı Yap, Kasa Ekstre Al, Düzenle, Sil |
| 5 | Kartta 'Detay'a basın | 'Kasa Detayları' modalı: 'Genel Bilgiler', 'Kayıt ve Erişim Bilgileri' (Oluşturan, Son Güncelleyen, Güncelleme Sayısı), 'Son Finansal Hareket', 'Son İşlemler', 'Tüm İşlemleri Görüntüle', 'Kapat' |
| 6 | Hareketli bir kasada ⋮ → Sil | 'Kasa Silme' modalı: 'Bu kasa silinemez!' ve 'Bu kasaya bağlı işlemler var: …'. İlk odak 'İptal'te. 'Pasifleştir'e basınca 'Kasa pasifleştirildi.' ve kartta 'Pasif' etiketi |

**Kontrol edilecek kurallar:**
- Kasa da İş Yeri üzerinden şirkete bağlıdır ve şirket bazında ayrı izlenir (K-12.2-1)
- Döviz kasada da 0'dan farklı açılışta 'Açılış Kuru (₺)' alanı çıkar

### Banka Hareketleri / Kasa Hareketleri (detay, faaliyet raporu, Excel)

- **Adres:** `/zto-finans/banka-hareketleri, /zto-finans/kasa-hareketleri`
- **Menü:** ZTO yan menü → Tüm Banka Hareketleri / Tüm Kasa Hareketleri; kart ⋮ → Banka/Kasa Hareketleri
- **Kullanıcı:** patron@acme.test, finans@acme.test; personel maskesi için FINANCE_EMPLOYEE_VIEW'i olmayan finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Banka Hareketleri'nde 'Banka' süzgecine tıklayın | Varsayılan değer 'Tüm Bankalar'. Aranabilir liste açılır; 'Banka ara...' kutusuna yazınca eşleşen kısım vurgulanır. Seçeneklerde hesap adı görünür |
| 2 | A Bankası TL'yi seçin | Seçili hesap özeti ('GÜNCEL BAKİYE'; Başlangıç / Giriş / Çıkış / Net) çıkar. Tablo tarihe göre azalan sıradadır ve 'BAKİYE' sütununda sunucuda hesaplanmış yürüyen bakiye vardır |
| 3 | 'İşlem Türü'nü 'Giriş (Havale/EFT Geldi)' yapıp 'Filtrele'ye basın | Yalnız giriş satırları kalır. 'MUHASEBE TİPİ' süzgecinde Cari Ödeme, Cari Tahsilat, EFT, Havale, Virman (Transfer), Döviz Bozum, Bankadan Kasaya, Transfer Masrafı, Başlangıç Bakiyesi, Şirketler Arası Virman vb. seçenekler var |
| 4 | Bir satırda 'Detay'a basın | 'İşlem Detayı' modalında 'Banka Bilgileri' bölümü var; altbilgide yalnız 'Kapat'. Kasada başlık 'Kasa İşlem Detayı'dır |
| 5 | 'Faaliyet Raporu' → hesap seçin → 'Raporu Göster' | Yeni sekmede 'Banka Faaliyet Raporu' (FIFO) açılır |
| 6 | 'Excel'e basın | CSV iner (noktalı virgül ayraçlı); 2 şirkette 'Şirket' sütunu da vardır. 10.000 kaydı aşınca 'Dışa aktarılacak kayıt sayısı 10.000'i aşıyor; tarih aralığını daraltın.' |
| 7 | 'Yeni Ödeme' / 'Yeni Tahsilat'a basın | 12.2a çalışma ağacında sayfa içi ZTO ödeme/tahsilat modalı açılır ve süzgeçteki fon ön seçilidir. 12.2 commit'inde (cab8e5d) bu düğme MUI penceresini yeni sekmede açıyordu (OK-12.2-22) |
| 8 | 2 şirketli kiracıda (konsolide) sayfaya bakın | 'ŞİRKET' süzgeci ('Tüm Şirketler') ve tabloda 'Şirket' sütunu görünür. Tek şirkette ikisi de yoktur |
| 9 | Kasa Hareketleri'nde aynı akışı tekrarlayın | Başlık 'Kasa Hareketleri'. İşlem Türü seçenekleri 'Giriş (Tahsilat)' / 'Çıkış (Ödeme)'. Bitiş etiketi 'BİTİŞ'; bankada 'Bİtİş' yazılır (ZTO'daki farklı yazım birebir) |
| 10 | Patronla bir personel carisine kasadan ödeme yapın, sonra finans@acme.test ile Kasa Hareketleri'ne bakın ve tablo aramasına personelin adını yazın | Satır görünür ama 'CARİ HESAP' hücresi BOŞ kalır (sunucu cari kimliğini ve adını null döner). Personel adıyla arama sonuç vermez (SEC-12.2-06) |

**Kontrol edilecek kurallar:**
- Tarih aralığı en çok 366 gün ('Tarih aralığı en çok 1 yıl olabilir.'); sayfa boyutu en çok 500
- İptal edilen hareket silinmez; ters kayıtla görünür kalır ve tabloda 'İptal/Ters kayıt' olarak işaretlenir
- Personel carileri FINANCE_EMPLOYEE_VIEW olmadan görünmemeli

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Yeni Ödeme/Tahsilat' ZTO modalları 12.2a kapsamındadır ve iş akışı sürüyor

**Doğrulanamadı:**
- 'Personel (gizli)' metni (common.a11y.maskedEmployee) yalnız 12.2a Ödemeler/Tahsilatlar listesi, günlük rapor ve detay modallarında kullanılıyor; banka/kasa hareket tablosunda kullanılmıyor. 'İptal/Ters kayıt' işaretinin satırdaki tam görünümü doğrulanamadı

### Banka / Kasa Ekstresi ve Faaliyet Raporu yazdırma sayfaları

- **Adres:** `/zto-finans-yazdir/banka-ekstre/:id, /zto-finans-yazdir/kasa-ekstre/:id, /zto-finans-yazdir/faaliyet-raporu/:id`
- **Menü:** Banka kartı ⋮ → 'Banka Ekstre Al' (yeni sekme); kasa kartı ⋮ → 'Kasa Ekstre Al'
- **Kullanıcı:** FINANCE_VIEW sahibi herhangi bir kullanıcı

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | A Bankası TL kartında 'Banka Ekstre Al'a basın | Yeni sekmede uygulama kabuğu olmadan 'BANKA EKSTRESİ' başlığı açılır. Başlıkta şirket adı (.company-name) ve ilk satırda 'DEVİR' görünür |
| 2 | A Bankası USD hesabının ekstresini açın | Satırlarda para birimi ve kur/TL bilgisi vardır. İptal satırları işaretlidir (F-12.2-2). Sayfa çökmemeli |
| 3 | '🖶 Yazdır'a basın | Tarayıcının yazdırma penceresi açılır |
| 4 | B Kasası'nın ekstresini açın | 'KASA EKSTRESİ' başlığı. Şirket adı Beta Nakliyat olmalı, çünkü fonun şirketinden okunur |

**Kontrol edilecek kurallar:**
- Ekstre başlığı fonun bağlı olduğu şirketin adını göstermeli (FundExtractPage, fund.companyId)

### Transfer Merkezi: Virman / EFT / Havale

- **Adres:** `/zto-finans/transfer-merkezi`
- **Menü:** ZTO yan menü → 'Banka & Kasa Transferi & Virman & Döviz Bozum'
- **Kullanıcı:** patron@acme.test veya finans@acme.test (FINANCE_PAYMENT_CREATE). İzni olmayan kullanıcı 'Yeni Transfer' sekmesinde 'Bu sayfaya erişim yetkiniz bulunmuyor.' görür

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı açın | Başlık 'Virman / EFT / Havale / Döviz Bozum / Banka & Kasa Transferi İşlemleri'. Sekmeler: Yeni Transfer / Transferler / Tüm Banka Ekstreleri / Tüm Kasa Ekstreleri. Tür kartları: 'Virman / EFT / Havale', 'Döviz Bozum / Döviz Alım', 'Banka & Kasa Transferi'. Bilgi kutusu: 'Virman / EFT / Havale tiplerinden birini seçin, kurala göre iş yeri ve banka filtreleri otomatik uygulanır.' |
| 2 | DİKKAT: banka seçeneklerinin biçimine bakın | Seçenekler hesap adıyla değil, banka adıyla listelenir: '{Banka} - (₺) [İş Yeri - Şube]', ör. 'Akbank T.A.Ş. - (₺) [A İş Yeri - Merkez]' (ZTO birebir). Aynı bankadaki iki hesap aynı metinle görünür. Ayırt etmek için 'Bakiye:' bilgisine ve sağ paneldeki 'Bankalar' tablosuna bakın |
| 3 | 'Transfer Tipi'ni Virman yapın; Kaynak İş Yeri A, Kaynak Banka A Bankası TL | 'Hedef İş Yeri' kaynak iş yerine kilitlenir. Uyarıda 'Virman için farklı bankalar pasif.' ve 'Aynı hesap pasif.' görünür. Yalnız aynı bankanın aynı para birimli diğer hesabı (A Bankası Yan) seçilebilir |
| 4 | Hedef Banka A Bankası Yan, 'Virman Tutarı' 100 → 'Kaydet' | Sağ panel 'Hesaplama' bölümünde 'Kaynak Tutar: 100,00 ₺'. Sonuç modalında 'İşlem Başarılı', 'Virman başarıyla oluşturuldu.' ve 'Kod:' (VRM serisinden). 'Tamam'dan sonra Transferler sekmesinde 'Virman' rozetli satır görünür |
| 5 | EFT'de kaynak ve hedef için aynı iş yerinde aynı bankayı seçmeyi deneyin | Hedef seçenek pasiftir; neden 'Aynı iş yerinde aynı bankaya EFT/Havale yapılamaz.', özet ipucu 'Aynı iş yeri + aynı banka EFT/Havale için pasif.' |
| 6 | Bir banka kartında ⋮ → 'EFT Al'a basın (hedef kart) | Yeni sekmede Transfer Merkezi Transfer Tipi=EFT ile açılır. Hedef İş Yeri ve Hedef Banka ön seçilidir, tutar etiketi 'EFT Tutarı' |
| 7 | 'Eksi bakiyeye izin ver' açık, bakiyesi 10 olan bir hesaptan 50 EFT kaydedin | 'Bakiye Bilgilendirmesi' modalında 'İşlem Öncesi Güncel Tutar', 'İşlem Tutarı (Çıkış)' ve 'İşlem Sonrası Güncel Bakiye' ('-40,00 ₺') görünür. İlk odak 'Vazgeç'te; 'Evet, Devam Et' kaydeder. İzin kapalı hesapta bu modal çıkmaz |
| 8 | Komisyon / Masraf girin, 'Masraf Bank.' seçip EFT kaydedin | Sağ panelde 'Maliyet' dolar. Transferler satırında 'Maliyet' sütunu görünür. Masraf bankasının hareketlerinde 'Transfer Masrafı' muhasebe tipli çıkış satırı olur |

**Kontrol edilecek kurallar:**
- ZTO hedef kuralları sunucuda da uygulanır: kural dışı istek 422 vermeli
- Düzenleme ve silme ters kayıtla yapılır; hareket fiziksel olarak silinmez

**Doğrulanamadı:**
- İzin kapalı hesapta bakiyeyi aşan transferde sunucunun döndürdüğü hata metni doğrulanamadı

### Transfer Merkezi: Banka & Kasa Transferi

- **Adres:** `/zto-finans/transfer-merkezi`
- **Menü:** Transfer Merkezi → 'Banka & Kasa Transferi' kartı; ya da kasa kartı ⋮ → 'Kasadan Bankaya Transfer' vb. (yeni sekme)
- **Kullanıcı:** patron@acme.test veya finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Banka & Kasa Transferi' kartına basın; 'Transfer Yönü' Bankadan Kasaya, kaynak ve hedef İş Yeri A, Kaynak Banka A Bankası TL | Bilgi metni 'Bankadan Kasaya farklı iş yeri, banka ve aynı para birimi transfer işlemidir.' Uyarı 'Sadece aynı para birimine sahip hedef hesaplar seçilebilir.' 2 şirkette iş yeri seçenekleri 'Şirket › İş yeri' biçimindedir |
| 2 | Hedef Kasa 'A Kasası - (₺)', 'Transfer Tutarı' 25 → 'Kaydet' | 'Bankadan Kasaya transfer başarıyla oluşturuldu.' A Kasası 25 artar, banka 25 azalır |
| 3 | Kasadan Kasaya yönünde hedef listesine bakın | 'Sadece aynı para birimindeki ve kaynak kasadan farklı hedef kasalar seçilebilir.' |
| 4 | Kasa Hareketleri'nde A Kasası'nı süzün | MUHASEBE TİPİ 'Bankadan Kasaya' olan bir giriş satırı görünür |

**Kontrol edilecek kurallar:**
- Aynı para birimi zorunludur
- Pasif fon kaynak/hedef listelerinde görünmez
- Kaynak İş Yeri listesi üst çubuktaki aktif şirkete göre süzülür, hedef listesi süzülmez

### Transfer Merkezi: Şirketler arası transfer (grup şirketi carisi otomatik)

- **Adres:** `/zto-finans/transfer-merkezi`
- **Menü:** Transfer Merkezi → Virman / EFT / Havale (EFT ya da Havale) veya Banka & Kasa Transferi; kaynak ve hedef farklı şirketlerin iş yerlerinden
- **Kullanıcı:** patron@acme.test (iki fon ve masraf fonları kullanıcının İş Yeri kapsamında olmalı, OK-12.2-11). Üst çubukta konsolide görünüm

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Transfer Tipi EFT; Kaynak A İş Yeri / A Bankası TL, Hedef B İş Yeri / B Bankası | Bilgi kutusunda 'Şirketler arası transfer: {A kısa adı} → Beta Nakliyat. Grup şirketi carilerine otomatik kayıt oluşur.' ve 'Transfer Nedeni' alanı |
| 2 | Tutar 200 girip neden seçmeden 'Kaydet' | 'Transfer nedeni seçiniz.' |
| 3 | 'Transfer Nedeni'nde "{A} - Beta Nakliyat 'YE BORCUNU ÖDÜYOR / Beta Nakliyat - {A} 'TAN ALACAĞINI TAHSİL EDİYOR" seçip kaydedin. Diğer seçenek "… 'YE BORÇ VERİYOR / … 'TAN BORÇ ALIYOR" | 'Şirketler arası transfer başarıyla oluşturuldu.' Kod SVR serisinden gelir. Transferler'de satır 'Şirketler Arası' rozetlidir; 'Düzenle' düğmesi yok, yalnız 'Sil' var |
| 4 | Cari Kartlar'da GS-BETA ve GS-SIRKET1 carilerinin hareketlerine bakın | A şirketinde GS-BETA carisine 200 ödeme, Beta'da GS-SIRKET1 carisinden 200 tahsilat görünür (açıklamada 'BORCUNU ÖDÜYOR…'). İkisi tek işlemde oluşur |
| 5 | Banka & Kasa Transferi'nde Bankadan Kasaya: A Bankası TL → B Kasası (nedenli) | Bu da şirketler arası kayıttır. İzinli türler: EFT, Havale, Bankadan Kasaya, Kasadan Bankaya, Kasadan Kasaya |
| 6 | Transfer Tipi Virman ile B şirketinin hesabını seçmeyi deneyin | Ekranda yapılamaz: Virman'da Hedef İş Yeri kaynak iş yerine kilitlidir, B'nin hesapları listelenmez. Sunucu kuralı ('Şirketler arası aktarım 'Şirketler Arası Virman' ile yapılır.', COMPANY_MISMATCH) yalnız API'den sınanabilir (OK-12.2-13) |
| 7 | EFT'de kaynak TRY, hedef B'de USD bir hesap seçmeyi deneyin | Hedef pasiftir, ipucu 'Farklı para birimine sahip bankalar pasif.' Şirketler arası döviz yoktur (OK-12.2-12) |
| 8 | Şirketler arası transferi Transferler sekmesinde 'Sil' ile iptal edin | Ters kayıt oluşur ve iki cari bacağı birlikte geri alınır. Bacaklar ödeme/tahsilat ekranından tek başına geri alınamaz |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: şirketler arası transfer serbesttir, grup şirketi cari kaydı otomatik açılır
- Banka bakiyeleri şirket bazında ayrıdır: Bankalar'da A şirketi toplamı 200 azalır, Beta'nınki 200 artar

**Bilinen eksikler / sonraki faza kalanlar:**
- Şirketler arası transferde döviz desteklenmez

### Transfer Merkezi: Döviz Bozum / Döviz Alım ve kur hesaplama kipleri

- **Adres:** `/zto-finans/transfer-merkezi`
- **Menü:** Transfer Merkezi → 'Döviz Bozum / Döviz Alım' kartı; ya da banka kartı ⋮ → 'Döviz Bozum / Döviz Alım Yap'
- **Kullanıcı:** patron@acme.test veya finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Ön koşul: Test Müşteri'den A Bankası USD'ye 100 USD tahsilat girin. MUI: Finans → 'Ödeme ve Tahsilat' → 'Tahsilat' anahtarı → 'Tahsilat · Banka'; para birimi USD, kur alanına ör. 34. Ya da 12.2a bitince ZTO Tahsilatlar'dan | A Bankası USD bakiyesi 100,00 $ olur |
| 2 | 'Döviz Bozum / Döviz Alım' kartına basın; Kaynak İş Yeri A, Kaynak Banka İş Bankası (USD) hesabı | Bilgi metni '…farklı para birimi transfer işlemidir. Kur fiyatına göre hesaplanır.' Hedef uyarısı 'Önce hedef iş yeri seçiniz.' |
| 3 | Hedef İş Yeri A, hedef olarak Akbank TL hesabı | Aynı para birimli hedefler pasiftir ('Aynı para birimine sahip hedef bankalar pasif.'). Hedef İş Yeri B seçilirse B'nin hesapları da pasiftir ('Başka şirketin hesapları pasif.') |
| 4 | 'Tahsilat Seçimi'nde 'Cari Hesap (Kaynak bankaya daha önce tahsilatı yapılan cariler)' = Test Müşteri, 'Tahsilatlar'dan '100,00 $' satırını seçin | Kalan '100,00 $' görünür; Kaynak Tutar 100.00 kendiliğinden dolar |
| 5 | 'Hesaplama Seç' = 'Kaynak + Kur => Hedef'. Kurun yanındaki 'Çarpım/Bölüm kuru değiştir' düğmesine basıp çarpma yapın, 'Kur Fiyatı'na 34 yazın | 'Hedef Tutar' 3.400,00 olur. Düğmeye basılmazsa işlem bölmedir |
| 6 | 'KMV (%)' alanına 0.2 yazın | Sağ panel 'Maliyet' → 'KMV: 6,80 ₺' |
| 7 | 'Kaydet' | 'Döviz bozum başarıyla oluşturuldu.' Transferler'de 'Döviz Bozum' rozeti, Maliyet 6,80 ₺, tahsilat durumu 'Tamamlandı' |
| 8 | Yeni bozumda 'Kur + Hedef => Kaynak' seçin: kur 34, hedef 1700 | Kaynak 50,00 hesaplanır. Kayıt 'Kaynak tutar, kur ve hedef tutar uyuşmuyor.' (FX_AMOUNT_MISMATCH) VERMEMELİ (12.2 düzeltmesi) |
| 9 | 'Kaynak + Hedef => Kur' seçin: kaynak 10, hedef 345 | Kur 34,5 hesaplanır (6 hane) ve kayıt başarılıdır |
| 10 | Tahsilat seçtikten sonra 'Kaynak Tutar'ı elle değiştirin | Alan 'Manuel' etiketini alır ve 'İzlenebilirlik Uyarısı:' kutusu çıkar. 'Seçim moduna geç' ile geri dönülür. Kayıt yine yapılabilir |
| 11 | Hiç tahsilat seçmeden bozum kaydedin | Kayıt yapılır. Döviz Bozum raporunda 'Tahsilata bağlı olmayan döviz bozumlar' grubunda 'Tahsilatsız' etiketiyle görünür |
| 12 | 'Önceki Döviz Bozum Kaynakları' tablosunda bir satırı işaretleyip 'Kullanılacak' alanına 'Kalan'dan büyük değer yazın | Kısa süreli kırmızı 'En fazla {kalan}' ipucu çıkar ve değer sınırlanır |

**Kontrol edilecek kurallar:**
- Döviz bozumu yalnız aynı şirketin hesapları arasında yapılır; iş yeri kısıtı yoktur (OK-12.2-30)
- Kur farkı otomatik olarak fin_income_expense'e FX_DIFF bilgi kaydı olarak yazılır (OK-12.2-16). Ekranda görünmez, DB'den kontrol edin
- TCMB kuru yoksa TRY'li bozumda işlem kuru kullanılır ve FX_DIFF yazılmaz; iki taraf da dövizse RATE_MISSING
- KMV için TL hesabı gerekir: 'KMV için TL hesabı bulunamadı.'

**Bilinen eksikler / sonraki faza kalanlar:**
- Cari tarafındaki kur farkı ayrı bir karar (rapor + elle onaylı belge, 12.8); burada yok

**Doğrulanamadı:**
- Yeni transfer formunda seçili tahsilatın kalanından büyük Kaynak Tutar girildiğinde ne olduğu doğrulanamadı. Düzenleme modalında 'Girilen bozum tutarı tahsilat limitini aşıyor. En fazla … girebilirsiniz.' iletisi var
- 'Hesaplama Seç'in varsayılan değeri doğrulanamadı

### Transfer Merkezi: Transferler sekmesi (düzenle/sil) ve ekstre sekmeleri

- **Adres:** `/zto-finans/transfer-merkezi (sekmeler: Transferler, Tüm Banka Ekstreleri, Tüm Kasa Ekstreleri)`
- **Menü:** Transfer Merkezi → 'Transferler' sekmesi
- **Kullanıcı:** patron@acme.test veya finans@acme.test (düzenle/sil FINANCE_PAYMENT_CREATE ister)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Transferler' sekmesinde özet kartlara ve süzgeçlere bakın | Özet: Virman / EFT / Havale, Döviz Bozum, Bankadan Kasaya, Kasadan Bankaya, Kasadan Kasaya, Şirketler Arası, Toplam. Süzgeçler: İş Yeri, Şirket (2 şirkette), Transfer Tipi, Başlangıç / Bitiş, 'Ara' düğmesi. Tablo başlığı 'Transferler Listesi' |
| 2 | Virman satırında 'İşlemler' sütunundaki 'Düzenle' simgesine basın, tutarı 120 yapıp 'Kaydet' | 'Virman Düzenle' modalında 'Düzenleme eski transferi iptal eder (ters kayıt) ve yeni kodla yeni transfer oluşturur.' notu. Eski satırda 'İptal' rozeti kalır, yeni kodlu satır eklenir (OK-12.2-7) |
| 3 | EFT satırında 'Sil' simgesi → 'Silme Nedeni' → 'Sil' | 'Transfer Sil' modalı: bilgi '{kod} | EFT', ilk odak 'İptal'te, 'Silme işlemi ters kayıt oluşturur; hareketler ekstrede görünür kalır.' Kayıttan sonra satır 'İptal' rozetli olur |
| 4 | 'Tüm Banka Ekstreleri' sekmesini açın | 'İptal: {kod}' açıklamalı ters kayıt satırı görünür. Sayfalama 100 satırlıktır (OK-12.2-24) |
| 5 | Önce A Bankası TL'den A Bankası USD'ye bir döviz alımı (bozum) yapın. Sonra USD'den TL'ye yeni bir bozumda 'Önceki Döviz Bozum Kaynakları'ndan bu alımı seçip kaydedin. Ardından ilk alımı silmeyi deneyin | 'Bu döviz bozum silinemez!' ve 'Bu bozumu kaynak olarak kullanan transferler:' tablosu, ardından 'Önce yukarıdaki bağımlı döviz bozumları silmeniz gerekmektedir.' |

**Kontrol edilecek kurallar:**
- Silme yerine ters kayıt (tek finans motoru kuralı)
- İptal tarihi transfer_date ile max(bugün, transfer_date) arasında olmalı. Düzenlemede eski transfer kendi tarihiyle ters kayda alınır (OK-12.2-26)

### Döviz Bozum & Tahsilat İzlenebilirliği raporu

- **Adres:** `/zto-finans/transfer-merkezi/doviz-bozum-raporu?from=…&to=…`
- **Menü:** Transfer Merkezi → 'Döviz Bozum & Tahsilat İzlenebilirliği' düğmesi → modal → 'Raporu Görüntüle'
- **Kullanıcı:** FINANCE_VIEW sahibi

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Düğmeye basın | Modal: 'Başlangıç Tarihi', 'Bitiş Tarihi', 'İptal', 'Raporu Görüntüle' |
| 2 | Tarih seçmeden 'Raporu Görüntüle'ye basın | 'Lütfen tarih aralığı seçiniz.' |
| 3 | Bu ayı seçip 'Raporu Görüntüle'ye basın | Rapor sayfası 'Tablo Görünümü' ile açılır. Stat kartları: Tahsilat, Döviz Bozum, Tahsilatsız Bozum, Bozulmayan Tahsilat, Toplam Bozulan. Sütunlar: Tahsilat Tarihi, Tahsilat Evrak No, Cari Hesap, Tahsilat Tutarı, Bozum Adedi, Bozulan Miktar, Kalan Miktar, İlerleme. Alt satırda 'Kur Farkı (₺)' |
| 4 | 'Grafik görünümü' düğmesine bakın | Pasiftir (Faz 12.2b) |
| 5 | 'Tabloyu Yazdır' ve 'Geri'ye basın | Yazdırma penceresi açılır; 'Geri' önceki sayfaya döner |

**Kontrol edilecek kurallar:**
- Tahsilata bağlı olmayan bozumlar 'Tahsilata bağlı olmayan döviz bozumlar' grubunda, 'Tahsilatsız' etiketiyle görünür

**Bilinen eksikler / sonraki faza kalanlar:**
- 12.2b: ExchangeBreakReport SVG ağaç görünümü yok (OK-12.2-20)
- ZTO'daki 'Siparişler' sütunu yok (S-6)

**Doğrulanamadı:**
- Modalın Esc ile kapandığı doğrulanamadı

### Ödeme şirket dağılımı uyarısı (kırmızı + onay) ve tahsilat bilgi uyarısı

- **Adres:** `/finance/settlements (MUI). 12.2a ile ayrıca ZTO 'Yeni Ödeme' modalı (/zto-finans/banka-hareketleri, kasa-hareketleri, odemeler)`
- **Menü:** Üst gezinme 'Finans' → 'Ödeme ve Tahsilat' sekmesi → 'Ödeme · Nakit' / 'Ödeme · Banka' / 'Ödeme · Çek/Senet'
- **Kullanıcı:** patron@acme.test veya finans@acme.test (FINANCE_PAYMENT_CREATE). Üst çubukta konsolide görünüm

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Ön koşul: 'Test verisi: cariler ve cari hareketleri' adımları yapılmış olsun | Test Tedarikçi'nin A şirketinde 100, Beta'da 50 alacağı vardır |
| 2 | 'Ödeme · Nakit': Cari Test Tedarikçi, Şube B İş Yeri, 'Banka/kasa hesabı' B Kasası, Tutar 150 | Kırmızı kenarlıklı küçük uyarı: 'Bu şirketin cariye borcu 50,00 TRY; ödeme 150,00 TRY, borçtan 100,00 TRY fazla.' ve 'Diğer şirketlerdeki borç: … 100,00 TRY.' Ayrıca eksik fatura satırı: '… kalan 50,00 TRY için fatura bilgisi eksik.' |
| 3 | 'Kaydet'e basın | 'Uyarı' başlıklı onay penceresi: 'Yine de kaydetmek istiyor musunuz?' İlk odak 'Vazgeç'te |
| 4 | 'Vazgeç'e basın | Pencere kapanır, form açık kalır, ödeme KAYDEDİLMEZ |
| 5 | Tekrar 'Kaydet' → 'Tamam' | Ödeme bir kez kaydedilir (aynı Idempotency-Key ile confirmWarnings) ve form kapanır |
| 6 | Hiç hareketi olmayan yeni bir tedarikçiye 'Ödeme · Banka' ile A İş Yeri / A Bankası TL'den 10 TL ödeyin | 'Bu şirketin cariye borcu 0,00 TRY; ödeme 10,00 TRY, borçtan 10,00 TRY fazla.' Kayıt için onay gerekir (OK-12.2-4) |
| 7 | 'Tahsilat' anahtarına geçin. 'Tahsilat · Nakit': Test Müşteri, Şube A İş Yeri, A Kasası, Tutar 150 | Yalnız bilgi uyarısı: 'Bu şirketteki cari borcu 100,00 TRY; tahsilat 150,00 TRY, borçtan 50,00 TRY fazla.' Onay penceresi ÇIKMAZ, 'Kaydet' doğrudan kaydeder |
| 8 | 'Ödeme · Çek/Senet' ile Test Tedarikçi'ye borcunu aşan ödeme deneyin | Uyarı önizlemesi çek/senet ödemesinde de çalışır |
| 9 | İsteğe bağlı: finans@acme.test'in 'İş Yeri Yetkisi'ni 'Seçili iş yerleri' = yalnız B İş Yeri yapın, aynı ödemeyi deneyin | Gösterilen tutarlar kapsamlıdır. 'Diğer şirketlerde/iş yerlerinde de borç var.' ya da 'Yetkili olmadığınız iş yerlerindeki bakiye nedeniyle onay gerekiyor.' iletisi çıkar (OK-12.2-31) |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı K-12.2-3: ödeme carinin o şirketteki borcunu aşınca küçük kırmızı uyarı ve onay penceresi çıkar; 'Tamam'da kaydeder, engellemez
- Tahsilatta yalnız bilgi verilir (OK-12.2-5)
- 'Borç', şirketin cariye borcudur: max(0, alacak − borç) (OK-12.2-1)

**Bilinen eksikler / sonraki faza kalanlar:**
- ZTO Ödemeler/Tahsilatlar ekranları ve modalları 12.2a'da yazılıyor; aynı uyarı kuralını ve 'Uyarı' onayını kullanıyor (useSettlementModal)
- Aynı anda iki onaysız ödeme uyarıyı birlikte geçebilir (R-6, kabul edildi)

**Doğrulanamadı:**
- MUI formundaki 'Şube' alanı aslında İş Yeri'dir (e2e etiketi /^Şube/). 'Ödeme · Çek/Senet' formunun çek alanlarının tam doldurulma şekli doğrulanamadı

### Eksik fatura uyarısı (4 yer)

- **Adres:** `/zto-finans/cari-kartlar; /zto-finans/cari-kartlar/:id/hareketler; /zto-finans-yazdir/cari-ekstre/:id; /finance/settlements; /finance/invoices; /finance/accounts ve /finance/accounts/:id`
- **Menü:** ZTO → Cari Kartlar; cari satırı → hareketler; MUI Finans → 'Ödeme ve Tahsilat' / 'Faturalar' → 'Fatura ekle' / 'Cari'
- **Kullanıcı:** patron@acme.test veya finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Ön koşul: 'Test verisi: cariler ve cari hareketleri' adımları (A'da KDV 0 ile Alış Faturası 100, B'de Kasa Fişi 50) | A'da eksik yok, B'de 50 eksik |
| 2 | 1) ZTO Cari Kartlar listesine bakın | Tedarikçi satırında 'Eksik fatura: 50,00 ₺' ikonu var. 'Eksik Faturalı' anahtarı açılınca yalnız eksik faturalı cariler kalır. Düğme yandaki sütunun üstüne taşmamalı |
| 3 | 2) Cari kartı/ekstre: carinin hareketler sayfası | Özet kartının altında tam genişlikte 'Kalan 50,00 ₺ için fatura bilgisi eksik.' şeridi ve 'Eksik fatura' rozeti. Metin harf harf kırılmamalı |
| 4 | Aynı carinin yazdırma ekstresi (/zto-finans-yazdir/cari-ekstre/:id) | Genel Özet'te 'Fatura bilgisi eksik' satırı ve 50,00 ₺ |
| 5 | 3) Fatura girişi (ZTO): cari hareketlerde 'Borç Ekle' | 'Yeni Borç Ekle' modalında 'Kalan 50,00 ₺ için fatura bilgisi eksik.' ve 'Bu belge kaydedilince kalan: 50,00 ₺'. 'Alış Faturası' seçilip tutar girilince kalan azalır |
| 6 | 3b) Fatura girişi (MUI): Finans → Faturalar → 'Fatura ekle'; Test Tedarikçi ve B İş Yeri, TRY | Turuncu not: 'Cari alacağı …, girilen fatura …: kalan 50,00 TRY için fatura bilgisi eksik. Bu fatura kaydedildiğinde cari alacağına da eklenir; …' |
| 7 | 4) Ödeme/tahsilat ekranı: 'Ödeme · Nakit' formunda bu cari ve B İş Yeri | '… kalan 50,00 TRY için fatura bilgisi eksik.' satırı |
| 8 | MUI Finans → Cari listesi ve cari detayı (/finance/accounts/:id) | Şirket bazında 'Eksik fatura: …' çipleri |
| 9 | Test Müşteri'ye 'Alacak Ekle' ile 'Diğer' türünde 30 TL girin, sonra listeye ve 'Alacak Ekle' modalına bakın | RECEIVABLE tarafında da eksik fatura hesaplanır: listede ikon görünür, modalda kalan bilgisi çıkar |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı K-12.2-4: eksik fatura dört yerde bildirilir: cari listesi, cari kartı/ekstre, ödeme/tahsilat ekranı ve fatura girişi
- Eksik fatura iki tarafta (PAYABLE ve RECEIVABLE), şirket × para birimi bazında hesaplanır. Tolerans 1'dir; açılış bakiyesi hariçtir, açılış faturası fatura sayılır
- Fatura sayılan türler (V34). PAYABLE: Alış Faturası, Hizmet Faturası, E-Fatura, Gider Pusulası, Serbest Meslek Makbuzu, Yurt Dışı Fatura, Ceza Faturası. RECEIVABLE: Satış, İade, Hizmet Faturası, E-Fatura, E-Arşiv Fatura. Sevk İrsaliyesi, Kasa Fişi, Proforma ve Diğer fatura sayılmaz

**Bilinen eksikler / sonraki faza kalanlar:**
- InvoiceCoverageService.gaps(...) ucu bağlı değil (iç kullanım)

**Doğrulanamadı:**
- 'Alacak Ekle' (RECEIVABLE) modalındaki kalan bilgisi e2e'de sınanmamış

### Cari kartı adresi herkese görünür

- **Adres:** `/zto-finans/cari-kartlar/:id/hareketler`
- **Menü:** Cari Kartlar → cari → hareketler → 'Cari Bilgileri' kayar paneli
- **Kullanıcı:** finans@acme.test ve yalnız FINANCE_VIEW'i olan Muhasebe kullanıcısı

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Adresi dolu bir carinin hareketler sayfasında 'Cari Bilgileri' panelini açın | 'Adres ve konum' bölümünde 'Adres' satırında açık adres görünür; FINANCE_VIEW yeterlidir |
| 2 | Cari Kartlar listesine bakın | Listede adres sütunu yoktur, adres yalnız detayda görünür |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: cari açık adresi FINANCE_VIEW sahibi herkese görünür

### Personel carisi görünürlüğü (FINANCE_EMPLOYEE_VIEW)

- **Adres:** `/finance/accounts, /zto-finans/cari-kartlar, /zto-finans/kasa-hareketleri`
- **Menü:** MUI Finans → Cari → 'Cari ekle' (Tür 'Personel/Sürücü'); ZTO Cari Kartlar
- **Kullanıcı:** patron@acme.test (kodda tüm izinler) ile oluşturun; finans@acme.test (Finans rolünde FINANCE_EMPLOYEE_VIEW yok) ile kontrol edin

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Patronla 'Cari ekle' formunda Tür 'Personel/Sürücü' olan bir cari açın ve A Kasası'ndan ona küçük bir ödeme yapın | Patron bu cariyi listelerde ve hareketlerde adıyla görür |
| 2 | finans@acme.test ile MUI 'Cari ekle' tür listesine bakın | 'Personel/Sürücü' seçeneği yoktur. API'den denenirse 403 ACCOUNT_EMPLOYEE_FORBIDDEN döner |
| 3 | finans@acme.test ile ZTO Cari Kartlar ve Kasa Hareketleri'ne bakın | Personel carisi listede yoktur. Kasa hareketinde 'CARİ HESAP' hücresi boştur ve personel adıyla arama sonuç vermez |

**Kontrol edilecek kurallar:**
- Kullanıcı kararı: personel carileri yalnız FINANCE_EMPLOYEE_VIEW ile görünür (V27'de yalnız 'Finans (Süper)' rolüne tohumlandı; patron kodda alır)

**Bilinen eksikler / sonraki faza kalanlar:**
- Personel modülü 12.9'da; asıl kural 12.1 Cari Kartlar'a aittir

**Doğrulanamadı:**
- ZTO 'Yeni Cari Kart' formunda personel Hesap Grubu'nun adı doğrulanamadı (EMPLOYEE grupları yalnız izinle listelenir)

### MUI Banka ve Kasa (eşlik eden ekran)

- **Adres:** `/finance/funds, /finance/funds/:id`
- **Menü:** Üst gezinme 'Finans' → 'Banka ve Kasa'
- **Kullanıcı:** patron@acme.test veya finans@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Listeyi 2 şirketle (konsolide) açın | 'Şirket' sütunu ve '{şirket} toplamı' satırları görünür |
| 2 | Bir hesapta 'Pasifleştir'e, sonra 'Aktifleştir'e basın | Durum değişir; ZTO Bankalar'da da aynı durum görünür |
| 3 | 'Transfer' penceresini açın | 'Şirketler arası aktarım için ZTO Transfer Merkezi'ni kullanın.' notu ve 'Transfer Merkezi' bağlantısı |

**Kontrol edilecek kurallar:**
- Aynı veri MUI ve ZTO ekranlarında aynı bakiyeyle görünmeli (saklı bakiye yok)

### Gelir/gider (fin_income_expense) kontrolü — ekranı yok

- **Adres:** `(ekran yok; psql)`
- **Menü:** —
- **Kullanıcı:** geliştirici

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Masraflı EFT ve KMV'li döviz bozumundan sonra psql'de çalıştırın: SELECT category, direction, amount, currency, tl_amount, source_type, description, deleted FROM tenant_acme.fin_income_expense ORDER BY created_at DESC; | Komisyon/Masraf/KMV için BANK_CHARGE / EXPENSE satırları (source_type FUND_TRANSFER_COST). Kur farkı varsa FX_DIFF / INCOME ya da EXPENSE satırı ('Döviz bozum kur farkı {kod}', source_type FUND_TRANSFER) |
| 2 | Transferi silip sorguyu tekrarlayın | Her satır için source_type 'REVERSAL', yönü ters yeni bir satır eklenir. Asıl satır silinmez (V33 yorumu, IncomeExpenseService.reverseSource) |

**Kontrol edilecek kurallar:**
- İşlem kuruyla yapılan bozumda (TCMB kuru yok) FX_DIFF yazılmaz

**Bilinen eksikler / sonraki faza kalanlar:**
- fin_income_expense için arayüz ve uç nokta yok; raporlar 12.8'de

### Yetki kontrolü: yalnız FINANCE_VIEW (Muhasebe) kullanıcısı

- **Adres:** `/zto-finans/bankalar, /zto-finans/bankalar/yeni, /zto-finans/kasalar/yeni, /zto-finans/transfer-merkezi, /zto-finans/tanimlar/sirketler/yeni`
- **Menü:** Muhasebe kullanıcısıyla giriş → ZTO Finans
- **Kullanıcı:** Muhasebe rolünde kullanıcı (FINANCE_VIEW + BRANCH_VIEW)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Adres çubuğuna /zto-finans/bankalar/yeni yazın | 'Bu sayfaya erişim yetkiniz bulunmuyor.' (ZtoRequirePermission FINANCE_MANAGE); form açılmaz. /zto-finans/kasalar/yeni ve /zto-finans/tanimlar/sirketler/yeni için de aynısı |
| 2 | Bankalar ve Kasalar listelerine bakın | Listeler açılır. 'Yeni Vadesiz Hesap'/'Yeni Kasa', Düzenle/Sil, kart üstündeki Ödeme/Tahsilat ve ⋮'deki 'Bankadan Cari Ödemesi Yap'/'Bankadan Cari Tahsilatı Yap' görünmez |
| 3 | Transfer Merkezi'ni açın | Sayfa açılır, çünkü rota yalnız FINANCE_VIEW ister. 'Yeni Transfer' sekmesinde 'Bu sayfaya erişim yetkiniz bulunmuyor.' görünür. Transferler'de 'İşlemler' sütunu boştur (Düzenle/Sil yok) |
| 4 | Banka/Kasa Hareketleri'ne bakın | 'Yeni Ödeme'/'Yeni Tahsilat' düğmeleri görünmez |
| 5 | TEMEL TANIMLAR → İş Yerleri | Liste açılır (BRANCH_VIEW) ama 'Yeni Kayıt' düğmesi yoktur |

**Kontrol edilecek kurallar:**
- Yazma işlemleri FINANCE_MANAGE (tanım) ve FINANCE_PAYMENT_CREATE (hareket/transfer) ister

---

## 4. Faz 12.2a — Ödemeler ve tahsilatlar (geliştirme bitince test edin)


### 4. Yeni Ödeme: alanlar, doğrulama, eksik fatura satırı, fatura eşleştirme

- **Adres:** `/zto-finans/odemeler (modal #addPaymentModal)`
- **Menü:** ZTO Finans > ÖDEME & TAHSİLAT > Ödemeler > 'Yeni Ödeme'
- **Kullanıcı:** patron@acme.test (FINANCE_PAYMENT_CREATE)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Yeni Ödeme'ye bas | 'Yeni Ödeme Ekle' modalı açılır. Alanlar: 'Cari Hesap' (yanında 'Yeni cari kart ekle' ve 'Listeyi yenile'), 'Belge / Fatura No', 'Ödeme Yöntemi', 'Ödeme Tarihi' (bugün), 'İş Yeri Bilgisi' / 'İş Yeri Seçiniz', 'Ödenecek Tutar ve Para Birimi', sağda 'Ödeme Yöntemi Seçimi' kutusu, 'Fatura Eşleştirme (Opsiyonel)', 'Ödeme Açıklaması'. 'Ödemeyi Sonra Kaydet' ve çapraz kur YOK. İlk odak Cari Hesap'ta |
| 2 | Hiçbir şey seçmeden 'Kaydet'e bas | Uyarı kutusunda tam olarak dört satır çıkar: 'Cari hesap seçiniz.', 'İş yeri seçiniz.', 'Ödeme yöntemi seçiniz.', 'Geçerli bir tutar giriniz.' Odak ilk hatalı alana (Cari Hesap) gider |
| 3 | Cari = T1 seç | Üstte kalan borç paneli açılır: 'İş Yeri Bazlı Borç / Alacak Durumu' ve 'Ödeme Planlaması' bölümleri |
| 4 | İş Yeri = İstanbul Merkez, Ödeme Yöntemi = Nakit, Kasa = İstanbul kasası, Tutar = 100 | Ancak bu dört alan dolunca tutarın altında sarı satır çıkar: 'Cari alacağı …, girilen fatura …: kalan 1.000,00 ₺ için fatura bilgisi eksik.' Borç aşılmadığı için kırmızı satır yok |
| 5 | 'Faturaları Yükle'ye bas | Yalnız aynı şirket (SIRKET1), aynı para birimi ve fatura sayılan belgeler listelenir: FTR-A ve FTR-B (Kasa Fişi listelenmez). Üstte 'Kalan Fatura Borçları:'. Sütunlar: 'Fatura No', 'Tür', 'Vade', 'Toplam Tutar', 'Eşleşen', 'Kalan', 'Eşleştirilecek Tutar' |
| 6 | İlk faturayı işaretle, sonra ikinciyi işaretle | İlk satırda 'Eşleştirilecek Tutar' 100.00 olur. İkincide 'Bu fatura için tahsis edilebilecek tutar kalmadı.' |
| 7 | Tutarları 50 ve 80 yap (alandan çık) | 'Toplam tahsis tutarı aşıldı!' iletisi çıkar, ikinci tutar 50.00'a kırpılır, 'Toplam Eşleştirme:' 100,00 |
| 8 | 'Kaydet' | Uyarı penceresi çıkmaz. Modal kapanır, ardından 'Ödeme başarıyla kaydedildi.' bildirimi gelir. T1 tedarikçi ve SIRKET1'de borcu kaldığı için yaklaşık 1 sn sonra 'Ödeme Başarılı!' modalı açılır: 'Daha Sonra Yaparım' de (plan testi sayfa 5'te T2 ile) |
| 9 | Listede bu satırın 'Detay' (göz) düğmesine bas | 'Fatura Eşleştirmeleri' tablosunda iki satır ('Fatura No', 'Tür', 'Tutar') |
| 10 | Yeni Ödeme'de cari seçmeden 'Faturaları Yükle'ye bas; ayrıca cari seçip iş yeri seçmeden dene | Cari yokken 'Önce cari hesap seçiniz.' çıkar. İş yeri yokken liste yüklenmez |
| 11 | Önce eşleştirme yap, sonra iş yerini, cariyi ya da kasa seçimiyle para birimini değiştir | Eşleştirmeler sıfırlanır; tablo yeniden 'Faturaları Yükle' ister. İş yeri değişince Kasa/Banka seçimi de sıfırlanır |

**Kontrol edilecek kurallar:**
- Eksik fatura uyarısı 3. yer: ödeme/tahsilat modalı (tutar altındaki sarı satır)
- Eşleştirme yalnız bilgi amaçlıdır: cari bakiyesini, FIFO yaşlandırmayı ve eksik fatura tutarını DEĞİŞTİRMEZ. Eşleştirmeden önce ve sonra Cari Hareketler bakiyesini ve 'Kalan … fatura bilgisi eksik' tutarını karşılaştır
- Eşleşen tutar yalnız POSTED ödemelerden hesaplanır: ödeme iptal edilirse 'Faturaları Yükle'de faturanın 'Kalan' tutarı geri artar

**Bilinen eksikler / sonraki faza kalanlar:**
- Çapraz kur bölümü ve 'Diğer' yöntemi yok (bilinçli)
- 'Ödemeyi Sonra Kaydet' / talimat kipi Faz 12.4'te

### 5. Plan sonrası modal: 'Ödeme Başarılı!' (DRAFT plan)

- **Adres:** `/zto-finans/odemeler (modal #postPaymentPlanningModal)`
- **Menü:** Ödemeler > 'Yeni Ödeme' > borcun bir kısmını kapatan kayıt
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | T2'ye (SIRKET1 borcu 500) İstanbul Merkez'den 200 TL Nakit ödeme yap | Ödeme modalı kapanır, yaklaşık 1 sn sonra 'Ödeme Başarılı!' açılır. İçinde 'CARİ HESAP', 'YAPILAN ÖDEME', 'Kalan Borç Mevcut' ve 'KALAN BORÇ (Para Birimine Göre)' = 300,00. Dışarı tıklayınca ya da Esc ile kapanmaz. İlk odak 'Evet, Planla'da |
| 2 | 'Daha Sonra Yaparım' | Modal kapanır, plan oluşmaz |
| 3 | T2'ye yine kalan borç bırakan bir ödeme yap (ör. 50) ve 'Evet, Planla'ya bas | 'Ödeme Planları' tablosu açılır. Sütunlar: 'Tarih *', 'Tutar *', 'Para Birimi *', 'Açıklama', 'Şube *', 'İş Yeri *', 'Banka *', 'Kaynak' (yeni satırda 'Manuel'), 'Sil'. Bir boş satır eklenir (tarih bugün) |
| 4 | Boş satırla 'Kaydet' | Satır başına yalnız İLK hata gösterilir. Tutar boş olduğu için 'Tutar sıfırdan büyük olmalıdır.' çıkar. Tutarı girince 'Şube seçiniz.', şubeyi seçince 'İş yeri seçiniz.' gelir |
| 5 | Tutar 250 gir. 'Şube' seç, ardından 'İş Yeri' seç (şube seçilmeden İş Yeri devre dışı). Banka sütununa bak | Banka ('-- Banka --') devre dışıdır, üzerine gelince 'Faz 12.4'te' yazar. Banka zorunluluğu denetlenmez |
| 6 | 'Kaydet' | 'Ödeme planlaması başarıyla kaydedildi.' Plan DRAFT olarak oluşur |
| 7 | T2'ye tekrar kalan borç bırakan bir ödeme yap | Açık plan olduğu için modal doğrudan tabloyla açılır. Mevcut plan salt okunur bir satırdır; DRAFT/REJECTED planda 'Satırı kaldır' (x), diğerlerinde kilit simgesi bulunur. Kaldırılıp kaydedilen plan 'Ödeme sonrası planlamada kaldırıldı' notuyla iptal edilir |
| 8 | M1'e (Müşteri) bir ödeme yap; ayrıca bir tedarikçinin borcunu tam kapatan bir ödeme yap | İki durumda da plan modalı AÇILMAZ. M1'in borcu olmadığı için ödemede 'Uyarı' onayı çıkar (sayfa 6) |

**Kontrol edilecek kurallar:**
- Plan modalı yalnız ekleme kipinde açılır; düzenlemede açılmaz. Koşul: cari türü Müşteri değil ve ödemenin şirketinde, ödemenin para biriminde kalan borç > 0
- Tahsilatta plan modalı açılmaz
- Plan DRAFT oluşur; onay akışı 12.4'te

**Bilinen eksikler / sonraki faza kalanlar:**
- Banka sütunu (planlanan ödeme bankası) Faz 12.4'e kadar devre dışı
- 'Tüm Planlamalar' ve 'Ödeme Onay Yönetimi' menüleri pasif (12.4)

### 6. Şirket dağılımı uyarısı (borcu aşan ödeme) ve Kredi Kartı

- **Adres:** `/zto-finans/odemeler (modal #addPaymentModal)`
- **Menü:** Ödemeler > 'Yeni Ödeme'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Cari T1, İş Yeri İstanbul Merkez (SIRKET1), Nakit, SIRKET1 kasası. Tutarı T1'in SIRKET1 borcundan fazla gir (sayfa 4'ten sonra borç 1.500; ör. 2.000) | Tutarın altında kırmızı satır çıkar: 'Bu şirketin cariye borcu 1.500,00 ₺; ödeme 2.000,00 ₺, borçtan 500,00 ₺ fazla.' SIRKET2'de borç olduğu için ek olarak 'Diğer şirketlerdeki borç: …' satırı gelir. Sarı eksik fatura satırı da görünür |
| 2 | 'Kaydet' | 'Uyarı' başlıklı pencere açılır: kırmızı uyarı metni ve 'Yine de kaydetmek istiyor musunuz?'. İlk odak 'Vazgeç'te. Network'te ilk POST 409 CONFIRMATION_REQUIRED döner |
| 3 | 'Vazgeç' | Ödeme modalı açık kalır, kayıt oluşmaz |
| 4 | Tekrar 'Kaydet', sonra 'Tamam' | İkinci POST aynı Idempotency-Key ve confirmWarnings:true ile gider. Modal kapanır, 'Ödeme başarıyla kaydedildi.' Liste tazelenir. T1'in SIRKET1 borcu kalmadığı için plan modalı açılmaz |
| 5 | T1'in yalnız SIRKET2'de borcu olduğu durumda (şimdi) Gebze Depo yerine yine İstanbul Merkez'den küçük bir ödeme dene | SIRKET1 borcu 0'ın altında olduğundan küçük ödeme de onay ister. Diğer şirkette borç olmasa da aşan ödeme onay ister (OK-12.2-4) |
| 6 | Yöntem = Kredi Kartı; bir SIRKET1 bankası seç; tutar 10; 'Kaydet' > 'Tamam' | Network gövdesinde method:'BANK', channel:'CREDIT_CARD'. Listede 'Kredi Kartı' rozeti (kırmızı). Satırda 'Düzenle' yok |
| 7 | Yöntem = Banka Havalesi/Eft; banka seç; 'Ödeme Yapılan Cari Banka Hesabı' bölümünde 'Cari Banka Hesabı Seçiniz' listesinden T1'in hesabını seç | Para birimi hesaba kilitlenir ('Seçilen banka/kasa para birimidir'). 'Ödeme Açıklaması'na '[Banka - Şube] - gg/aa/yyyy - TR…(maskeli) iban bilgisine sahip hesaba yatırılmıştır.' yazılır; hesap sahibi adı yazılmaz. Bu bölüm yalnız Banka ve Kredi Kartı yönteminde görünür |

**Kontrol edilecek kurallar:**
- Ödeme, carinin O ŞİRKETTEKİ borcunu aşınca kırmızı uyarı + 'Uyarı' onay penceresi çıkar; 'Tamam' ile kaydedilir
- Karar şirket bazında verilir: T1'in SIRKET2 borcu SIRKET1 ödemesini 'onaysız' yapmaz
- Cari banka hesabı cümlesinde IBAN maskeli, hesap sahibi yok (KVKK)

**Bilinen eksikler / sonraki faza kalanlar:**
- Ödemede Döviz Kuru alanı yok; kur TCMB'den alınır

### 7. Yeni Ödeme: Çek ve Senet (12.3'e kadar kısmi)

- **Adres:** `/zto-finans/odemeler (modal #addPaymentModal)`
- **Menü:** Ödemeler > 'Yeni Ödeme' > Ödeme Yöntemi = Çek / Senet
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Yöntem = Çek seç; 'Çek Türü' = 'Kendi Çekimiz' olsun. 'İş Yeri Bankası'nı seç, 'Çek Numarası' alanına 123 yaz, 'Kaydet' | 'Çek numarası 7 haneli olmalıdır.' Harf girilirse ek olarak 'Çek numarası sadece rakamlardan oluşmalıdır.' Boş bırakılırsa 'Çek numarası giriniz veya koçandan seçiniz.' |
| 2 | Çek Numarası 1234567 yaz; 'Vade Tarihi' (bugün + 30 gün hazır gelir) kalsın; 'Kaydet' (gerekirse 'Tamam') | Kayıt oluşur. Listede 'Çek' rozeti ve altında 'Çek: 1234567', Muhasebe Tipi 'Çek Ödeme'. Satırda Düzenle ve Sil yok |
| 3 | Devre dışı alanları kontrol et | 'Çek Koçanı Seçiniz (Opsiyonel)', 'Manuel Çek Numarası Gir', 'Keşide Tarihi' ve 'Çek Açıklaması' devre dışı; üzerine gelince 'Faz 12.3'te'. 'Banka Adı' ve 'Şube Adı' seçilen bankadan otomatik dolar (salt okunur) |
| 4 | Önce sayfa 10'da aynı şirkette 'Portföyde (Elde)' bir müşteri çeki tahsil et. Sonra Yeni Ödeme > Çek > 'Müşteri Çeki Ciro Et' | 'Ciro Edilecek Çeki Seçin' listesinde portföydeki çek görünür ('Çek No: … | …'). Seçilince 'Seçilen Çek Bilgileri' kartı çıkar; tutar ve para birimi kilitlenir ('Ciro modunda değiştirilemez') |
| 5 | Yöntem = Senet: 'Senet Numarası' ve 'Vade Tarihi' gir, kaydet | 'Senet' rozeti ve 'Senet: {no}', Muhasebe Tipi 'Senet Ödeme'. 'Keşideci (İş Yeri)', 'Düzenlenme Tarihi' ve 'Senet Açıklaması' devre dışı. 'İş Yeri Bankası (Opsiyonel)' seçilebilir |

**Kontrol edilecek kurallar:**
- Çek numarası yalnız 7 rakamdan oluşur
- Çekli/senetli kayıt listeden düzenlenemez ve silinemez (12.3'e kadar)

**Bilinen eksikler / sonraki faza kalanlar:**
- Koçan, manuel çek no düğmesi, keşide/düzenlenme tarihi, çek/senet açıklaması 12.3'te
- Çek/senet kaydının düzeltilmesi ve iptali 12.3'te

### 8. Ödemeler listesi

- **Adres:** `/zto-finans/odemeler`
- **Menü:** ZTO Finans > ÖDEME & TAHSİLAT > Ödemeler
- **Kullanıcı:** patron@acme.test (görüntüleme FINANCE_VIEW; yazma düğmeleri FINANCE_PAYMENT_CREATE)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı aç | Başlık 'Ödeme Yönetimi', kırıntı 'Finans › Ödemeler', solda 'Geri', geniş ekranda 'Çoklu Yöntem' ve 'Aktif Filtreleme' çipleri. Sağdaki düğmeler: 'Yeni Ödeme', 'Çekler' ve 'Senetler' (Faz 12.3, pasif), 'Günlük Ödeme Raporu', 'Excel', 'Yazdır'. Süzgeçler: [≥2 şirkette 'Şirket' ('Tüm Şirketler')], 'Cari Hesap' ('Tüm Hesaplar'), 'İş Yeri' ('Tüm İş Yerleri'), 'Başlangıç' = bugün−7, 'Bitiş' = bugün, 'Ödeme' ('Tümü' / Nakit / Banka Havalesi/Eft / Çek / Senet / Kredi Kartı), 'Filtrele', 'Temizle' |
| 2 | 'Cari Hesap'ta T1'i seç ve 'Filtrele'ye bas. Sonra 'Ödeme' = Nakit seçip alanda Enter'a bas | Önce yalnız T1 satırları, sonra yalnız Nakit satırları kalır. Nakit rozeti yeşil; tutar kırmızı ve kalın, '150,00 ₺' biçiminde |
| 3 | 'Temizle'ye bas | Yöntem boşalır, tarih aralığı yeniden bugün−7…bugün olur (ZTO hatası (g) düzeltmesi) |
| 4 | Sütunları ve sayfa boyutunu incele | Sütunlar: 'Tarih', 'İş Yeri' (altında şube), [≥2 şirkette 'Şirket'], 'Cari Hesap' (yeni sekmede Cari Hareketler'i açan bağlantı), 'Belge No', 'Tutar', 'Ödeme Yöntemi', 'Muhasebe Tipi' ('Cari Ödeme' / 'Şirketler Arası Virman' / 'Çek Ödeme' / 'Senet Ödeme'; plana bağlıysa altında 'Plan'), 'Kaynak', 'Açıklama', 'İşlem' (Detay / Düzenle / Sil). Varsayılan 25 satır; seçenekler 10/25/50/100, 'Tümü' yok. Network'te size=25 |
| 5 | 'Tarih' ya da 'Tutar' başlığına tıkla; Shift ile 4 sütun seçmeyi dene | Sıralama sunucuda yapılır (sort=…). Sıralanabilir sütunlar: Tarih, İş Yeri, Cari Hesap, Belge No, Tutar. En çok 3 anahtar gider; 400 SORT_INVALID oluşmaz |
| 6 | 'Excel' düğmesine bas | Süzülmüş sonuç indirilir (dosya adı Odemeler_tarih). Network'te size=500 ile en çok 4 sayfa istenir |

**Kontrol edilecek kurallar:**
- Liste yalnız POSTED ve carili kayıtları gösterir (status=POSTED&hasAccount=true); iptal edilen satır listeden kalkar
- Sayfa boyutu sunucuda en çok 500; dışındaki değer 400 PAGE_SIZE_INVALID döner
- Yazma düğmeleri yalnız FINANCE_PAYMENT_CREATE ile görünür
- ≥2 şirkette 'Şirket' sütunu ve süzgeci görünür; tek şirkette görünmez
- Ödemeler tablosu dar ekranda kart görünümüne geçer

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Çekler' ve 'Senetler' düğmeleri Faz 12.3'e kadar pasif
- Kredi Kartı, Çek ve Senet satırlarında 'Düzenle' yok (Kredi Kartı ZTO ile birebir; Çek/Senet 12.3)
- ZTO'daki 'Tümü' sayfa boyutu bilinçli olarak çıkarıldı

**Doğrulanamadı:**
- Excel'de 2.000 kaydı aşınca çıkan 'İlk {count} kayıt aktarıldı (toplam {total}).' iletisi; elle üretmek için çok veri gerekir, yalnız kodla doğrulandı

### 9. Ödeme Detay, Düzenle (düzeltme = ters kayıt + yeni kayıt) ve Sil (iptal)

- **Adres:** `/zto-finans/odemeler, /zto-finans/odemeler?openEditPayment=true&paymentId={id}, /zto-finans/odemeler?settlementId={id}`
- **Menü:** Ödemeler > satırdaki 'İşlem' düğmeleri: Detay (göz) / Düzenle (kalem) / Sil (çöp)
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Bir Nakit satırında 'Detay' | 'Ödeme Detayı' modalı: 'Temel Bilgiler' ('Tarih:', 'Cari Hesap:', 'Belge No:', 'Tutar:') ve 'Ödeme Bilgileri' ('Yöntem:', 'Durum:' 'Tamamlandı', 'Kaynak:', 'İş Yeri:', bankalı kayıtta 'Cari Banka Hesabı:' maskeli). Altta 'Oluşturan:' / 'Oluşturma:'. 'Kapat' |
| 2 | Aynı satırda 'Düzenle' | 'Ödeme Düzenle' (#editPaymentModal). 'Ödeme Yöntemi' seçenekleri yalnız 'Seçiniz', 'Nakit', 'Banka Havalesi/Eft', 'Kredi Kartı'. Altta 'Düzeltme gerekçesi'. İş yeri listesi yalnız kaydın şirketine aittir |
| 3 | Tutarı değiştir, gerekçe yaz, 'Kaydet' | 'Ödeme başarıyla güncellendi.' Network'te POST /settlements/{eskiId}/correct. Listede yeni tutarla tek POSTED satır kalır |
| 4 | Eski kaydın kimliğini Network'teki correct isteğinden al; /zto-finans/odemeler?settlementId={eskiId} adresini aç | 'Ödeme Detayı' açılır: 'Durum:' 'İptal' + 'Düzeltildi' rozeti ve 'Güncel kaydı aç' bağlantısı; 'İptal Tarihi:' eski kaydın tarihi. URL'den settlementId silinir |
| 5 | Cari Hareketler ve Kasa Hareketleri ekranlarına bak | Eski kaydın ters satırı ve yeni kayıt görünür. Bakiye yalnız yeni tutarı yansıtır (saklı bakiye yok) |
| 6 | /zto-finans/odemeler?openEditPayment=true&paymentId={eskiId} adresini aç | Modal açılmaz; 'Bu kayıt zaten düzenlenmiş; güncel kaydı açın.' uyarısı çıkar |
| 7 | Başka bir Nakit satırında 'Sil' | 'Ödeme Silme Onayı' (#confirmDeleteModal), 'Bu işlem geri alınamaz!', '{tutar} {sembol} tutarındaki ödemeyi silmek istediğinize emin misiniz?' (ZTO'daki sabit TL yerine para birimi sembolü). İlk odak 'İptal'de. 'İptal Tarihi' (varsayılan bugün; yardım 'Kayıt tarihi ile bugün arasında bir tarih seçiniz.') ve 'Gerekçe' alanları |
| 8 | 'İptal Tarihi'ni kayıt tarihinden önceye ayarla | 'İptal tarihi kayıt tarihinden önce ya da bugünden sonra olamaz.' |
| 9 | Gerekçe yaz, 'Onayla ve Sil' | 'Ödeme başarıyla silindi.' Satır listeden kalkar. Kayıt fiziksel olarak silinmez; ?settlementId= ile açılan detayda 'Durum:' 'İptal' ve 'Gerekçe:' görünür |
| 10 | Kilitli bir kaydı derin bağlantıyla düzenlemeyi dene (ör. Çek ödemesi, şirketler arası virman bacağı ya da iptal edilmiş kayıt) | Modal açılmaz, uyarı çıkar. Örnekler: 'Çekli kayıt ters çevrilemez; çekin durumunu güncelleyin.', 'Şirketler arası virmana bağlı kayıt transfer merkezinden iptal edilir.', 'İptal edilmiş kayıt düzenlenemez.' Plana bağlı ödemede 'Ödeme planına bağlı kayıt ters çevrilemez.', taşınmış satırda 'Cari taşıma geri alınmadan düzenlenemez/silinemez.' |

**Kontrol edilecek kurallar:**
- Silme yerine ters kayıt; düzeltme = ters kayıt + yeni kayıt, tek işlemde ve aynı şirkette (başka şirkete taşıma 'COMPANY_MISMATCH')
- Ters kayıt ESKİ kaydın tarihiyle atılır
- Döviz ödemesi düzeltmesinde 'Tarih veya para birimi değişirse kur TCMB'den yeniden alınır' notu görünür
- Düzeltmede de şirket dağılımı onayı çalışır (eski ödeme geri alınmış sayılarak hesaplanır)
- İptal edilen ödemenin fatura eşleştirmeleri 'Eşleşen' toplamından düşer (sayfa 4 son kural)

**Bilinen eksikler / sonraki faza kalanlar:**
- Ekstreyle eşleşmiş banka hareketinin iptali engellenmez; yalnız uyarı çıkar: 'Bu kaydın banka hareketi ekstreyle eşleşmiş; iptal sonrası mutabakatı kontrol ediniz.'

**Doğrulanamadı:**
- Düzeltmede kurun sunucu tarafında korunmasının ayrı bir entegrasyon testi yok (Revizyon 2'de açık). Döviz düzeltmesinde TL karşılığını elle özellikle kontrol et

### 10. Yeni Tahsilat / Tahsilat Düzenle

- **Adres:** `/zto-finans/tahsilatlar (modal #addCollectionModal / #editCollectionModal)`
- **Menü:** ZTO Finans > ÖDEME & TAHSİLAT > Tahsilatlar > 'Yeni Tahsilat'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Yeni Tahsilat' | 'Yeni Tahsilat Ekle' modalı. Cari seçilince üstte 'CARİ ALACAK BİLGİLERİ' paneli çıkar. Alanlar: 'Cari Hesap', 'Tahsilat Yöntemi', 'Belge / Fiş No', 'Tahsilat Tarihi', İş Yeri, 'Tahsilat Para Birimi ve Çapraz Kur' (yalnız Para Birimi), 'Tahsilat Tutarı ve Cariden Düşülecek Tutar' ('Tahsilat Tutarı', 'Döviz Kuru (₺)' (TRY'de devre dışı), salt okunur 'Cariden Düşülecek Tutar', 'Hesaplama:') |
| 2 | M1, İstanbul Merkez, Nakit, SIRKET1 kasası, tutar 3.000 (M1'in SIRKET1 borcu 2.500'den fazla) | Tutarın altında yalnız SARI bilgi satırı çıkar: 'Bu şirketteki cari borcu 2.500,00 ₺; tahsilat 3.000,00 ₺, borçtan 500,00 ₺ fazla.' Ayrıca eksik fatura satırı: 'Cari borcu …, kesilen fatura …: kalan 500,00 ₺ için fatura bilgisi eksik.' 'Kaydet' onay penceresi AÇMADAN kaydeder: 'Tahsilat başarıyla kaydedildi.' Plan modalı açılmaz |
| 3 | Yöntem = Çek → 'Bankaya Yatırıldı' (varsayılan): 'Çekin Yatırıldığı Banka Hesabı', 'Çek Numarası' 1234567, 'Çekin Bankası' (ör. Ziraat Bankası), tutar 750 | 'Cariden Düşülecek Tutar' 750.00 olur. 'Keşide Tarihi' ve 'Şube Adı' devre dışı. Kayıttan sonra çek AT_BANK durumunda olur (Network: GET /finance/instruments). Bu aşamada banka hareketi yazılmaz; para çek tahsil edilince girer (12.3) |
| 4 | Yöntem = Çek → 'Portföyde (Elde)' | Banka seçimi istenmez, çek portföye girer. Aynı şirkette ödemede ciro edilebilir (sayfa 7) |
| 5 | Yöntem = Çek → 'Kasaya Al (Ciro)' | 'Çekin Tutulduğu Kasa' devre dışı ('Faz 12.3'te'). Çek PORTFOLIO olarak kaydedilir |
| 6 | Nakit tahsilat satırında 'Düzenle' | Başlık sarı zeminde 'Tahsilat Düzenle'. Alan 'Belge / Fiş / Dekont No' olur; 'Cari Banka Hesabı (Tahsilat Yapılan)' bölümü yok; 'Düzeltme gerekçesi' alanı var; düğme 'Güncelle'. Kayıtta 'Tahsilat başarıyla güncellendi.' |

**Kontrol edilecek kurallar:**
- Tahsilatta şirket dağılımı uyarısı yalnız bilgi (INFO) amaçlıdır; onay penceresi çıkmaz (OK-12.2-5, kullanıcı onaylı)
- Eksik fatura uyarısı tahsilat modalında da görünür
- Döviz tahsilatında 'Döviz Kuru (₺)' boş bırakılırsa TCMB kuru kullanılır

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Çekin Tutulduğu Kasa', senette 'Banka (Opsiyonel)', çek 'Şube Adı', keşide/düzenlenme tarihi ve açıklamalar 12.3'te
- 'Farklı Para Birimi ile Tahsilat' ve çapraz kur yok; 'Sipariş Tahsisi' yerine Fatura Eşleştirme var ('Kalan Fatura Alacakları:', boşsa 'Bekleyen fatura alacağı bulunamadı.')

### 11. Tahsilatlar listesi ve Döviz Bozum hücresi

- **Adres:** `/zto-finans/tahsilatlar`
- **Menü:** ZTO Finans > ÖDEME & TAHSİLAT > Tahsilatlar
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Sayfayı aç | 'Tahsilat Yönetimi', kırıntı 'Finans › Tahsilatlar'. Düğmeler: 'Yeni Tahsilat', 'Ödemeler', 'Çekler', 'Senetler' (pasif), 'Günlük Tahsilat Raporu', 'Excel', 'Yazdır'. Süzgeçler: 'CARİ HESAP', 'Hesap Grubu' ('Tüm Hesap Grupları'), 'İŞ YERİ' ('Tüm İş Yerleri'), 'Başlangıç', 'BİTİŞ', 'TAHSİLAT YÖNTEMİ' ('Tüm Yöntemler'). Büyük/küçük harf karışıklığı ZTO'daki gibi. Muhasebe Tipi metinleri: 'Cari Tahsilat' / 'Çek Tahsil' / 'Senet Tahsil' |
| 2 | SIRKET1 EUR bankasına M1'den 100 EUR 'Banka Havalesi/Eft' tahsilatı yap ('Döviz Kuru (₺)' 35) | Satırda '100,00 €' ve altında 'Kur: 35,0000'. Döviz Bozum sütununda 'Bekliyor' (sarı), '%0 • 100,00 €', ilerleme çubuğu ve 'Boz' bağlantısı. 'Boz' yeni sekmede Transfer Merkezi'nin döviz bozumu formunu açar |
| 3 | Bir TRY tahsilat satırına bak | Döviz Bozum'da 'Döviz Değil' rozeti; Tutar altında 'Kur: 1,0000' |
| 4 | Transfer Merkezi'nde bu EUR'nun bir kısmını aynı şirketin TRY bankasına boz, sonra listeyi tazele | 'Kısmi Bozum' ve '%oran • bozulan / toplam €'. Tamamı bozulunca 'Tamamlandı' ve 'Transferler' bağlantısı. Bozumda kullanılan satırda Düzenle ve Sil kaybolur |
| 5 | 'Ödemeler' düğmesi | /zto-finans/odemeler açılır |

**Kontrol edilecek kurallar:**
- Tahsilatta Düzenle/Sil yalnız döviz bozumunda hiç kullanılmamış ve Çek/Senet olmayan satırda görünür
- Tahsilat tablosu dar ekranda yatay kayar (Ödemeler ise kart görünümüne geçer)

### 12. Günlük Ödeme Raporu (modal + yeni sekme)

- **Adres:** `/zto-finans/odemeler/gunluk-rapor?reportDate=YYYY-MM-DD&workPlaceIds=a,b`
- **Menü:** Ödemeler > 'Günlük Ödeme Raporu' (menüde ayrı öğe yok)
- **Kullanıcı:** patron@acme.test (FINANCE_VIEW yeterli)

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Günlük Ödeme Raporu' düğmesi | Modal açılır: 'Rapor Tarihi' (bugün), 'Seçtiğiniz güne ait ödemeler, oluşturulma saatine göre listelenir.', arama kutulu iş yeri çoklu seçimi. Düğmeler 'Vazgeç' ve 'Günlük Ödeme Raporu Al' |
| 2 | İki iş yeri işaretle, 'Günlük Ödeme Raporu Al' | Yeni sekmede '…/odemeler/gunluk-rapor?reportDate=…&workPlaceIds=…' açılır. Başlık 'Günlük Ödeme Raporu (gg.aa.yyyy)', alt başlık '{N} ödeme kaydı. Sıralama, oluşturulma saatine göre yapılır.' İki iş yeri bloğu görünür |
| 3 | Rapor sayfasında 'Filtrele'ye bas | Çoklu iş yeri seçimi korunur (ZTO hatası (f) düzeltmesi) |
| 4 | Sırayla 'Gruplamayı Kaldır', 'Grupla', 'Tümünü Kapat', 'Tümünü Aç' | Düz tabloda 'İş Yeri' sütunu eklenir. Gruplu görünümde satırlar iş yeri → banka/kasa bloklarına ayrılır |
| 5 | 'Rapor İçi Arama'ya cari adı yaz; özet kartlarından ('İş Yeri Özet', 'Banka/Kasa Özet', 'Yöntem Özet', 'Para Birimi Özet') öğe seç | Satırlar ve gruplar süzülür. Bir kart içinde VEYA, kartlar arasında VE uygulanır |
| 6 | Alt bölümleri incele | 'Genel Toplamlar (İş Yeri / Banka Bazlı)': 'İş Yerleri Arası Transferler', 'Cari Ödemeler', 'Genel Toplam'. 'Özet Bakiye Bilgisi': Bankalar/Kasalar için gün sonu ve güncel bakiye. 'Banka Hareketine Yansıyan Çek Özeti' ve 'Ödeme Tarihine Göre Yazılan Çekler' (sayfa 7'deki 1234567 çeki burada) |
| 7 | O gün girilip sonra silinen (sayfa 9) ödemeye bak | Tutar altında 'Sonradan iptal: gg.aa.yyyy' rozeti. Toplamlar o günkü durumu yansıtır (iptal edilen dahil) |
| 8 | 'Gruplamayı Kaldır' açıkken 'Yazdır' (baskı önizlemesi) | Baskıda gruplu görünüm basılır, ekran düğmeleri gizlenir |
| 9 | 'Ödeme Listesine Dön' | /zto-finans/odemeler |

**Kontrol edilecek kurallar:**
- Satırlar settlement_date gününe göre seçilir; oluşturulma saatine göre sıralanır
- Şirketler arası virman satırları 'İş Yerleri Arası Transferler' bloğunda ayrı toplanır
- Personel maskesi: yetkisiz kullanıcıda cari adı 'Personel (gizli)', cari kodu ve açıklama boş (sayfa 15)

**Bilinen eksikler / sonraki faza kalanlar:**
- 'Kredi Ödemeleri' bölümü yalnız Banka türü cariye ödeme varsa görünür (12.5'e kadar veri yok)
- 'Diğer (Yöntem)' bölümü yok

### 13. Günlük Tahsilat Raporu

- **Adres:** `/zto-finans/tahsilatlar/gunluk-rapor?reportDate=…&workPlaceIds=…`
- **Menü:** Tahsilatlar > 'Günlük Tahsilat Raporu'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Modalda tarih ve iş yeri seç, 'Günlük Tahsilat Raporu Al' | Yeni sekmede 'Günlük Tahsilat Raporu (gg.aa.yyyy)', 'Toplam Tahsilat', 'Cari Tahsilatlar', 'Tahsilat Tarihine Göre Yazılan Çekler'. Kredi bölümü yok. 'Tahsilat Listesine Dön' |
| 2 | Sayfa 10'daki 'Bankaya Yatırıldı' çekinin gününü seç | Çek 'Tahsilat Tarihine Göre Yazılan Çekler' bölümünde görünür. 'Banka Hareketine Yansıyan Çek Özeti' bu çek için BOŞ kalır ('Banka hareketine yansıyan çek bulunamadı.'), çünkü AT_BANK durumunda banka hareketi yazılmaz (tahsil 12.3'te) |

**Kontrol edilecek kurallar:**
- Para birimleri karışık grup başlığında toplam rozeti çizilmez (ZTO hatası düzeltmesi)

### 14. Banka/Kasa Hareketlerinden ödeme ve tahsilata geçiş

- **Adres:** `/zto-finans/banka-hareketleri, /zto-finans/kasa-hareketleri → /zto-finans/odemeler?settlementId={id}`
- **Menü:** ZTO Finans > BANKA & KASA İŞLEMLERİ > Tüm Banka Hareketleri / Tüm Kasa Hareketleri; ayrıca Bankalar/Kasalar kartlarındaki 'Bankadan Cari Ödemesi Yap' / 'Bankadan Cari Tahsilatı Yap' / 'Kasadan Cari Ödemesi Yap' / 'Kasadan Cari Tahsilatı Yap'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Banka Hareketleri'nde bir banka süz ve 'Yeni Ödeme' / 'Yeni Tahsilat' düğmesine bas | Aynı sayfada ZTO modalı açılır; süzgeçteki banka, onun iş yeri ve para birimi ön seçili gelir. Tahsilatta banka salt okunur (gri) gösterilir. MUI /finance/settlements ekranına GİDİLMEZ |
| 2 | Bankalar/Kasalar kartındaki ödeme ya da tahsilat bağlantısına tıkla | Banka/Kasa Hareketleri sayfası openModal=true ya da openCollection=true ile açılır ve modal gelir; bu parametreler URL'den silinir |
| 3 | Bir ödeme hareketinde 'Detay' (göz), sonra 'Belge:' satırındaki 'Görüntüle' | Yeni sekmede /zto-finans/odemeler?settlementId=… açılır, 'Ödeme Detayı' gelir, URL /zto-finans/odemeler olarak temizlenir. Tahsilat hareketinde /tahsilatlar ve 'Tahsilat Detayı' |
| 4 | Düzeltilebilir bir ödeme hareketi satırında 'Ödemeyi Düzenle' (kalem) | Yeni sekmede /zto-finans/odemeler?openEditPayment=true&paymentId=… açılır ve 'Ödeme Düzenle' gelir |

**Kontrol edilecek kurallar:**
- Banka/kasa hareketi yalnız FundLedgerService ile yazılır; düzeltmeden sonra hesap ekstresinde ters satır ve yeni satır görünür

### 15. Cari ekranlarından bağlantılar ve personel maskeleme

- **Adres:** `/zto-finans/cari-kartlar, /zto-finans/cari-kartlar/:id/hareketler, /zto-finans/cari-kartlar/:id/banka-hesaplari, /zto-finans/odemeler, …/gunluk-rapor`
- **Menü:** Cari Kartlar / Cari Hareketler; Ödemeler / Tahsilatlar
- **Kullanıcı:** Önce patron@acme.test, sonra finans@acme.test ('Finans' rolü: FINANCE_EMPLOYEE_VIEW yok; açılış /finance, oradan 'ZTO Finans')

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | Cari Kartlar'da 'Ödeme & Tahsilat' menüsünden 'Ödemeler' / 'Tahsilatlar' | ZTO sayfası aynı sekmede açılır |
| 2 | Tedarikçi satırının menüsünde 'Ödeme Ekle' | Yeni sekmede /zto-finans/odemeler?id=…&openModal=true açılır; Yeni Ödeme modalı cari ön seçili gelir. Müşteri satırında bu öğe yok |
| 3 | Cari Hareketler'de 'Ödeme Ekle' / 'Tahsilat Ekle' | Yeni sekmede ZTO modalı cari ön seçili açılır |
| 4 | Cari Hareketler'de bir ödeme satırının detayını aç ('Düzenle' ve 'Kaynağa Git') | Kayıt düzeltilebiliyorsa 'Düzenle' yeni sekmede 'Ödeme Düzenle'yi açar; düzeltilemiyorsa pasiftir ve üzerine gelince nedeni yazar. 'Kaynağa Git' ZTO ödeme detayına gider |
| 5 | T1 > Banka Hesapları > hesap menüsünde 'Hesap İşlemleri' | 'Banka Hesabı İşlemleri' paneli bu IBAN'a yapılan ödeme ve tahsilatları gösterir (Tarih, Tür, İş Yeri, Tutar, Belge No). Kayıt yoksa 'Bu hesaba ait ödeme/tahsilat bulunamadı.'; çok kayıtta 'Son {count} kayıt gösteriliyor.' |
| 6 | Patron olarak P1'e 'Banka Havalesi/Eft' ödemesi yap ve 'Ödeme Yapılan Cari Banka Hesabı'nda P1'in hesabını seç | Kayıt oluşur. Personel carisi olduğu için IBAN cümlesi açıklamaya YAZILMAZ |
| 7 | Çıkış yap, finans@acme.test ile gir ve Ödemeler'i aç | P1 satırında Cari Hesap yerine 'Personel (gizli)' yazar; açıklama '-'. Bu satırda Detay, Düzenle ve Sil düğmesi YOK (sunucu reversible/correctable=false döner). 'Cari Hesap' süzgecinde P1 listelenmez |
| 8 | finans olarak /zto-finans/odemeler?settlementId={P1 ödeme id} adresini aç | Detay modalında 'Ödeme bilgileri alınamadı.' (sunucu 404 SETTLEMENT_NOT_FOUND) |
| 9 | finans olarak Günlük Ödeme Raporu'nda o günü aç | P1 satırında cari adı 'Personel (gizli)', cari kodu ve açıklama boş |
| 10 | finans olarak bir müşteri cari kartının adresine bak | Adres görünür (cari kartı adresi herkese açık) |

**Kontrol edilecek kurallar:**
- Personel carileri yalnız FINANCE_EMPLOYEE_VIEW ile görünür (PATRON ve Finans (Süper)'de var, Finans'ta yok)
- FINANCE_PAYMENT_CREATE yetkisi olmayan kullanıcıda 'Yeni Ödeme' / 'Ödeme Ekle' düğmeleri gizlidir ve ?openModal=true yok sayılır

**Doğrulanamadı:**
- finans@acme.test'in gerçekten 'Finans' rolünde olduğu. 'Finans (Süper)' ise maskeleme görünmez; o durumda patron ile 'Kullanıcılar' (/users) ekranından rolü değiştir
- FINANCE_PAYMENT_CREATE'siz kullanıcı testi için hazır bir dev kullanıcı yok; FINANCE_VIEW'e sahip ama ödeme yetkisi olmayan bir rol elle kurulmalı (hangi tohum rolün uygun olduğu doğrulanmadı)
- Adresin cari kartında tam olarak hangi ekranda gösterildiği (form 'Adres ve konum' bölümü mü, liste mi)

### 16. Çoklu şirket: şirketler arası transfer ve Şirket sütunu

- **Adres:** `/zto-finans/transfer-merkezi → /zto-finans/odemeler, /zto-finans/tahsilatlar`
- **Menü:** BANKA & KASA İŞLEMLERİ > 'Banka & Kasa Transferi & Virman & Döviz Bozum' > 'Yeni Transfer'
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | 'Yeni Transfer' > 'Virman / EFT / Havale' bölümünde tip olarak EFT ya da Havale seç; kaynak SIRKET1 TRY bankası, hedef SIRKET2 TRY bankası | Kaynak ve hedef şirket farklı olunca 'Şirketler arası transfer: SIRKET1 → SIRKET2. Grup şirketi carilerine otomatik kayıt oluşur.' bilgisi ve zorunlu 'Transfer Nedeni' alanı çıkar (seçenekler '… 'YE BORCUNU ÖDÜYOR / …' ve '… 'YE BORÇ VERİYOR / …'). Neden seçilmezse 'Transfer nedeni seçiniz.' |
| 2 | Tutar ve neden gir, kaydet | 'Şirketler arası transfer başarıyla oluşturuldu.' Transfer serbesttir; grup şirketi carileri (INTERCOMPANY) otomatik açılır ya da kullanılır |
| 3 | Ödemeler ve Tahsilatlar'ı aç ('Şirket' süzgeci 'Tüm Şirketler') | Virman bacakları SIRKET1 ödemesi ve SIRKET2 tahsilatı olarak, Muhasebe Tipi 'Şirketler Arası Virman' ile listelenir. Düzenle/Sil yok. 'Şirket' sütunu görünür |
| 4 | Üst çubuktan aktif şirketi SIRKET2 yap, Ödemeler sayfasını yeniden aç (ya da 'Temizle'ye bas) | 'Şirket' süzgeci SIRKET2 ile gelir; liste yalnız SIRKET2 kayıtlarını gösterir. 'Yeni Ödeme'de iş yeri listesi yalnız SIRKET2 iş yerleridir |
| 5 | Aktif şirket SIRKET2 iken bir SIRKET1 nakit ödemesini derin bağlantıyla aç (?openEditPayment=true&paymentId=…) | Modal kaydın kendi iş yeriyle açılır; iş yeri listesi SIRKET1'e aittir (düzeltme kaydın kendi şirketinde) |
| 6 | Günlük Ödeme Raporu | 'İş Yerleri Arası Transferler' bölümünde virman toplamı görünür |
| 7 | Transfer Merkezi'nde 'Virman' alt tipiyle ya da döviz bozumunda farklı şirket hesabı seçmeyi dene | Şirketler arası seçim yapılamaz: başka şirketin hesapları pasiftir ('Başka şirketin hesapları pasif.' / 'Döviz bozumu yalnız aynı şirketin hesapları arasında yapılır.') |

**Kontrol edilecek kurallar:**
- Şirketler arası transfer serbesttir ve grup şirketi carisini otomatik açar
- Şirketler arası transfer yalnız EFT, Havale ve banka/kasa transferlerinde yapılabilir; Virman ve dövizli transferde yapılamaz (OK-12.2-12/13)
- Şirketler arası virman bacağı ödeme ekranından düzeltilemez ve iptal edilemez ('Şirketler arası virmana bağlı kayıt transfer merkezinden iptal edilir.')

**Doğrulanamadı:**
- Aktif şirket değişince açık olan Ödemeler sayfasının listesinin kendiliğinden yenilenip yenilenmediği. Süzgeç ilk açılışta aktif şirketten alınıyor; bu yüzden sayfayı yeniden açmak öneriliyor
- Transfer Merkezi formundaki tip seçicinin ekrandaki tam metni ve adım sırası (yalnız locale ve mantık dosyasından doğrulandı)

### 17. MUI finans ekranları regresyonu

- **Adres:** `/finance/settlements, /finance/reports, /finance/plans, /finance/accounts`
- **Menü:** Ana menü > Finans
- **Kullanıcı:** patron@acme.test

| # | Yapılacak | Beklenen |
|---|---|---|
| 1 | /finance/settlements: listeyi aç, bir kayıtta 'Ters çevir' | MUI ekranı çalışmaya devam eder. İptal tarihi varsayılanı max(bugün, kayıt tarihi). Yeni kayıtta yöntemler yalnız Banka / Nakit / Çek |
| 2 | /finance/reports günlük rapor ('Günlük ödeme/tahsilat') | Sonradan iptal edilen satırda 'Sonradan iptal: gg.aa.yyyy' çipi ve toplam tablosunun altında 'Toplamlara rapor gününden sonra iptal edilen kayıtlar dahildir (o tarihteki durum).' notu |
| 3 | /finance/plans | Sayfa 5'te plan sonrası modalda oluşturulan DRAFT plan listede |
| 4 | /finance/accounts | Eksik faturalı carilerde 'Eksik fatura: {tutar}' çipi |

**Kontrol edilecek kurallar:**
- Mevcut MUI finans ekranları korunur; POST /payments ve /collections eski gövdeyle çalışmaya devam eder
