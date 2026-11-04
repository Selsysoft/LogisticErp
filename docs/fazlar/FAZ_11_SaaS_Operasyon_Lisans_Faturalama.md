# FAZ 11 — SaaS Operasyon: Admin, Tenant, Abonelik/Faturalama, İzleme

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
- Self-servis kayıt açık mı olacak, yoksa yalnız satış ekibi mi tenant açacak?
- Tenant silme talebi ile mali kayıtların yasal saklama süresi nasıl uzlaştırılacak? (Hukukçu/mali müşavir görüşü gerekir.)
- "Opsiyonel canlı izleme" kapsamı nedir? Ekran izleme, hukuki görüş alınmadan geliştirilmez.
