# FAZ 11 — SaaS Operasyon: Admin, Tenant, Abonelik/Faturalama, İzleme

> **Uygulama Notu (2026-11-05) — Durum: Yönetici konsolu, abonelik ve deneme ödeme akışı `main` üzerinde, CI yeşil (run 42023850069). Ödeme sağlayıcısı seçilmedi; faz açık.**
>
> **Yapılanlar:** `/saas` yönetici konsolu; firma açma, deneme süresi, askıya alma, yeniden açma ve kapatma; plan ve abonelik, plan sınırları ve uyarıları; aylık abonelik
> borcu, ödeme denemesi, hatırlatma ve askıya alma akışı; günlük kullanım kaydı; firma verisini ZIP olarak dışa aktarma; sistem sağlığı ve çevrimiçi kullanım;
> her yönetici çağrısının denetim günlüğü; firmaların kendi abonelik ekranı. Veri işleme kaydı taslağı: `docs/KVKK_VERI_ISLEME_KAYDI.md`.
>
> **Doğrulama:** `mvn verify` 29 birim + 140 entegrasyon testi (CI'da Java 21, yerelde Java 17); frontend lint, 28 test ve build. Deneme bitişi, sınır aşımı, yükseltme ve düşürme,
> mükerrer fatura, ödeme hatası, hatırlatma, askıya alma, ödemeyle açılma, kapatma, dışa aktarımda gizli alan olmaması ve yetki sınırı entegrasyon testlidir. Tarayıcıda
> yönetici girişi, firma açma, askıya alma, sağlık, denetim, plan ve fatura sekmeleri ile firmanın abonelik ekranı denendi, konsolda hata yoktu. Plan formu, plan değiştirme,
> deneme uzatma, kapatma, yeniden açma, ödeme işaretleme, günlük iş düğmesi ve ZIP düğmesi tarayıcıda denenmedi; arka planları (günlük iş düğmesi hariç) entegrasyon testlidir.
>
> **Kabul kriterlerinde eksik kalanlar:**
> - Gerçek ödeme yok. Üretimde sağlayıcı tanımlı değildir: fatura açık kalır, ödeme elle işlenir. Gerçek sağlayıcı seçilince sözleşme testi ve webhook eklenecek.
> - Abonelik faturası bir borç kaydıdır: resmi e-fatura kesilmez, KDV hesaplanmaz. Satışa çıkmadan önce mali müşavirle netleştirilmeli.
> - Hatırlatmalar ancak SMTP tanımlıysa gerçekten gider; dev ortamında log'a yazılır.
> - Sağlık konsolu firma bazında hata ve yavaş istek göstermez; firma bazında yalnız kullanım ve çevrimiçi sayı vardır. İstek sayıları yeniden başlatmada sıfırlanır, geçmiş ve alarm yoktur.
> - Çevrimiçi durum son isteğe göre hesaplanır, yalnız bellektedir ve tek sunucu içindir. Birden çok sunucuda eksik sayar.
> - Self-servis kayıt, fiziksel veri silme ve canlı izleme yapılmadı (aşağıdaki kararlara bakın).
> - SaaS yöneticisinde hâlâ 2FA ve IP sınırı yok. Konsol artık bütün firmaları yönettiği için üretimden önce zorunludur.
>
> **Kararlar ve varsayımlar:**
> - Firmayı yalnız yönetici açar. Varsayılan 14 gün deneme ve `DENEME` planıdır (10 kullanıcı, 25 araç, ayda 200 sefer, ücretsiz). Bu sayılar ve bütün fiyatlar iş kararıdır, konsoldan değişir.
> - Mevcut firmalar kesintisiz sürer: `DENEME` planıyla etkin abonelik açıldı, ücretli plan seçilene kadar fatura kesilmez.
> - Sınıra ulaşınca yeni kullanıcı, araç ve sefer reddedilir, mevcut veri etkilenmez; %80'de uyarı çıkar. Eşzamanlı son kayıtlarda sınır bir iki kayıt aşılabilir. Yükseltme hemen geçerlidir; kullanım yeni sınırı aşıyorsa düşürme reddedilir. Dönem içi ücret farkı hesaplanmaz.
> - Vade 7 gündür. Ödeme en çok 3 kez denenir; vadeden sonraki 1. ve 7. günde hatırlatılır, 14. günde askıya alınır. Vadesi geçmiş fatura kapanmadan elle açılmaz. Ödeme kapanınca firma kendiliğinden açılır.
> - Erişimin kapalı olduğu dönem faturalanmaz; yeniden açılışta yeni dönem o günden başlar.
> - Kapatma veriyi silmez ve geri alınabilir; onay için firma kodu yazılır. Fiziksel silme, yasal saklama süreleriyle uzlaştırılmadan yapılmayacak: hukukçu ve mali müşavir görüşü gerekir.
> - Dışa aktarım tablo başına CSV'dir; parola, token ve gizli anahtar alanları ve oturum tabloları dahil değildir, yüklenen dosyaların içeriği de yoktur. Hem yönetici hem firma günlüğüne yazılır. Dışarı çıkan CSV'deki `=` ile başlayan metinler olduğu gibi kalır; Excel'de açarken dikkat edilmeli.
> - Konsol firma içi iş verisi ve kullanıcı adı göstermez; yalnız sayılar görünür. Yönetici token'ı yalnız bellekte tutulur, sayfa yenilenince yeniden giriş gerekir. Günlüğe sorgu metni yazılmaz.
> - Gerçek sağlayıcıda dış ödeme çağrısı veritabanı işlemi içinde kalırsa ve işlem geri dönerse tahsilat kaydı kaybolabilir; deneme anahtarı tekrarı önlese de uzlaştırma gerekecek. Günlük iş tek sunucu varsayar, aynı dönem veritabanı kısıtıyla iki kez faturalanmaz.

**Amaç:** Platformu çok kiracılı bir **ürün** yapan katman: kiracı yaşam döngüsü, abonelik planları
ve faturalama, kullanım ölçümü, sağlık/izleme konsolu, çapraz-tenant yönetim (denetimli).

**Bağımlılık:** Faz 0 (çok kiracılık), 1 (kimlik). Diğer modüllerle paralel olgunlaşır.
**Çıktı:** İşletilebilir SaaS.

---

## Kapsam / Görevler
1. **Tenant yaşam döngüsü:** kayıt/onboarding (self-servis veya admin), şema sağlama, deneme süresi,
   askıya alma/kapatma, veri dışa aktarım/silme (KVKK).
2. **Abonelik & Plan:** `Plan` (modül/limit/fiyat), `Subscription` (tenant↔plan, dönem, durum),
   yükseltme/düşürme; kullanım limitleri (kullanıcı sayısı, araç sayısı, sefer/ay vb.).
3. **Faturalama:** periyodik SaaS faturası, ödeme sağlayıcısı (ör. iyzico/Stripe) kancası, başarısız
   ödeme/askıya alma akışı.
4. **Kullanım ölçümü:** `UsageMetric` (aktif kullanıcı, kayıt sayısı) — plan limiti ve faturalama için.
5. **Sağlık & İzleme Konsolu:** sistem sağlık skoru, hata/olay, yavaş istek, DB bağlantı durumu,
   **çevrimiçi kullanıcılar** (gerçek kullanım: etkin/boşta/bağlantı kesildi), opsiyonel canlı izleme
   — ERP Sağlık ve Güvenlik Merkezi + canlı izleme karşılığı, **sıkı yetki + denetim** ile.
6. **Denetim & Güvenlik:** çapraz-tenant erişim yalnız SaaS yöneticisi; her erişim loglanır; KVKK/GDPR
   veri işleme kaydı.

## Kabul Kriterleri
- [ ] Yeni tenant self-servis/admin ile açılır, şema+migration otomatik, deneme süresi işler.
- [ ] Plan limiti aşımında uyarı/engel; yükseltmede limit güncellenir.
- [ ] SaaS faturası üretilir; ödeme başarısızsa tanımlı akış (hatırlatma→askıya) çalışır.
- [ ] Sağlık konsolu tenant bazlı metrik ve çevrimiçi kullanım durumunu doğru gösterir.
- [ ] Çapraz-tenant erişim yalnız yetkiliye açık ve loglanır.

## ERP Referansı
`AdminSystemController` + `AdminSystemPolicy` (master yetki), `Services/Diagnostics/*`
(OnlineUsers etkin/boşta/bağlantı durumu, sağlık metrikleri), çapraz-kiracı canlı izleme deseni,
tenant DB/lisans yapısı (`GlobalVeriables`, Customers tablosu). Bunların şema-başına-tenant + modern
SaaS faturalama karşılığı kurulur.

## Açık Sorular
- Ödeme sağlayıcısı (iyzico, Stripe, PayTR…) hangisi? Faturalama TL mi çok döviz mi?
- ~~Self-servis kayıt açık mı olacak, yoksa yalnız satış ekibi mi tenant açacak?~~ Karar: Şimdilik yalnız yönetici açar; açık kayıt kötüye kullanım koruması ister.
- Tenant silme talebi ile mali kayıtların yasal saklama süresi nasıl uzlaştırılacak? (Hukukçu/mali müşavir görüşü gerekir.)
- "Opsiyonel canlı izleme" kapsamı nedir? Ekran izleme, hukuki görüş alınmadan geliştirilmez.
