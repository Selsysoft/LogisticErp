# FAZ 4 — Sevkiyat / Yük / Sefer + CMR + e-İrsaliye + POD (Operasyonun Kalbi)

> **Uygulama Notu (2026-11-05) — Durum: Kriterler yerelde karşılandı, CI bekliyor.**
>
> **Yapılanlar:** Taşıma emri ve durum makinesi, etap, öz filo ve taşeron ataması, çakışma ve belge kontrolü, uygun kaynak listesi,
> sevkiyat panosu, CMR ve irsaliye (numara, durum, PDF), teslim kanıtı, navlun faturası, sefer gideri, kapanış, kârlılık raporu,
> zaman çizelgesi, istisna kaydı ve bunların React ekranları.
>
> **Doğrulama:** `mvn verify` birim ve entegrasyon testleriyle (yerelde Java 17). Tarayıcıda şu akış denendi: sefer açma, belge
> engeli, belge uyarısı, araç ve sürücü atama, çakışan atama engeli, pano, CMR taslağı, teslim kanıtı olmadan teslim engeli, teslim,
> gider, fatura, kapanış, kârlılık ve cari bakiyeler. Taşeron atama, çok etap, irsaliye, fatura iptali, araç gideri bağlama
> ekranları tarayıcıda denenmedi, PDF indirme yalnız API testinde doğrulandı; arka planları entegrasyon testlidir.
>
> **Kararlar:** Mesafe elle girilir, harita servisi Faz 8'de. Yalnız karayolu. İrsaliye taslak, numara ve durumla sınırlıdır; GİB'e
> gönderilmez. Fatura numarası ve PDF uygulamada üretilir, yasal e-Fatura değildir; belge üzerinde bu yazar.
>
> **Sapmalar ve varsayımlar:**
> - Fatura taslak aşaması olmadan doğrudan kesilir. Düzeltme, iptal edip yeniden kesmekle yapılır; numara yeniden kullanılmaz.
> - Fatura iptali yalnız kapanış öncesi mümkündür. Kapanmış sefer geri açılmaz.
> - Sefer fiyatı oluşturulurken sabitlenir; ekranda sonradan değiştirilemez.
> - Sefer ekranı tek yük kalemi girer. API çok kalem kabul eder.
> - CMR yalnız temel alanları içerir; uluslararası ek alanlar (gümrük, talimat, ücret kutuları) henüz yok.
> - Cariye bağlı giderin finans kaydı kapanış gününün kuruyla, kârlılıktaki TL karşılığı giriş gününün kuruyla hesaplanır; dövizli
>   giderde ikisi farklı olabilir.
> - Araç gideri sefere bağlanırsa yalnız kârlılıkta sayılır, zaten finansa yazıldığı için yeniden yazılmaz. Gider ters kayıtla iptal
>   edilirse kârlılıktan düşer.
> - Teslim kanıtında imza ve fotoğraf sefere dosya olarak eklenir. Konum yalnız API ile girilir; mobil Faz 10'da.
> - Müşteri bilgilendirme yok; e-posta/SMS sağlayıcı seçilince eklenecek.
> - Fatura ve kapanış için `SHIPMENT_INVOICE` izni eklendi. Operasyon rolünde yoktur; finans rollerinde vardır. Rol dağılımı varsayımdır.

**Amaç:** Taşıma emrinden teslimata uçtan uca operasyon: yük/sefer, araç-sürücü-taşeron atama
(dispatch), rota/bacaklar, CMR, e-İrsaliye, teslim kanıtı (POD) ve **sefer gelir/gider → finansa
otomatik akış**.

**Bağımlılık:** Faz 2 (finans), 3 (müşteri/fiyat), 5A (filo/sürücü kütüğü). Faz 5B ile birlikte yürür. | **Çıktı:** Demo edilebilir tam taşıma döngüsü.

---

## Kapsam / Görevler

1. **Taşıma Emri (Shipment/Order):** müşteri, yükleme/boşaltma noktaları+tarih, yük kalemleri
   (cins, ağırlık, hacim, kap/palet, ADR sınıfı), fiyat (tarifeden/teklif/el ile), durum makinesi:
   `teklif → planlandı → yüklendi → yolda → teslim edildi → faturalandı → kapandı` (+ iptal).
2. **Bacak/Etap (Leg):** çok duraklı/aktarmalı/uluslararası taşımada her etap; etaba araç+sürücü
   veya **taşeron/spot taşıyıcı** atanır; etap maliyeti ayrı.
3. **Dispatch (Planlama/Atama):** uygun araç/sürücü/dorse önerisi (müsaitlik, kapasite, belge
   geçerliliği), çakışma kontrolü, atama takvimi/board görünümü.
4. **CMR:** gönderici/alıcı/taşıyıcı, araç plaka, mal bilgisi, teslim; PDF; uluslararası alanlar.
   (ERP CMR3/13 genişletilir.)
5. **e-İrsaliye:** taşıma irsaliyesi oluşturma; GİB e-İrsaliye entegrasyon kancası (gerçek gönderim
   Faz 8). Taslak+numara+durum.
6. **POD (Teslim Kanıtı):** imza/foto/zaman/konum (mobil Faz 10 ile tam; bu fazda web yükleme).
7. **Navlun Faturası:** teslim edilen seferden `Invoice` taslağı; fiyat kırılımı, KDV/tevkifat, para birimi, numara,
   PDF. Fatura kesilince sefer `faturalandı`ya geçer. İptal ters hareket üretir. GİB gönderim kancası burada, gerçek
   gönderim Faz 8'de.
7a. **Sefer Maliyet/Gelir:** navlun **geliri** fatura kesilince (müşteri carisine BORÇ → tahsilata hazır); **giderler**
   sefer kapanınca (yakıt, HGS/OGS, harcırah, taşeron → ilgili carilere ALACAK + ödeme planına) otomatik oluşur.
   Yön kuralları `01_ANA_PROMPT.md` §4.5'e uyar. **Çift veri girişi yok.** (ERP: ExpertReportTruck finans/gider
   deseninin lojistik karşılığı.)
8. **Takip:** sefer durum zaman çizelgesi, gecikme/istisna yönetimi, müşteri bilgilendirme.

## İş Kuralları
- Durum makinesi: yalnız izinli geçişler; her geçiş audit + zaman damgası.
- Atama çakışması (aynı araç/sürücü aynı anda iki sefer) engellenir.
- Belge geçersiz araç/sürücü (muayene/sigorta/ehliyet bitmiş) atanamaz (uyarı/engel — ayarlanabilir).
- Gelir yalnız fatura kesilince, giderler yalnız sefer kapanınca finansa yazılır; ikisi de idempotenttir
  (tekrar deneme veya tekrar kapanışta çift kayıt olmaz).
- Taşeronlu etapta: müşteriye gelir, taşerona gider; marj raporlanır.

## Kabul Kriterleri
- [x] Taşıma emri oluştur→planla→yükle→yolda→teslim→faturala durum akışı uçtan uca çalışır.
- [x] Çok bacaklı sefer: her bacağa farklı araç/taşeron atanır, maliyetler ayrışır.
- [x] Araç/sürücü çakışması ve belgesi geçersiz atama engellenir.
- [x] CMR ve e-İrsaliye taslağı doğru alanlarla üretilir (PDF/numara/durum).
- [x] POD yüklenince sefer "teslim edildi"ye geçebilir.
- [x] Teklif kazanınca sefer oluşturulabilir; sözleşmeli müşterinin sefer fiyatı tarifeden otomatik gelir.
- [x] Teslim edilen seferden fatura kesilir; aynı sefer için ikinci fatura ve teslim edilmemiş sefere fatura engellenir;
      iptal ters hareket üretir.
- [x] **Uçtan uca senaryo:** Fatura kesilince müşteri carisi navlun kadar BORÇ alır. Sefer kapanınca yakıt+HGS+taşeron
      giderleri ilgili carilere ALACAK + ödeme planına düşer. Aynı işlem tekrarlanınca kayıt çoğalmaz; sefer kâr/zarar
      doğru raporlanır — test.

## ERP Referansı
`AccountingPurchasesController` (ExpertReportTruck, GetTruckFinance/UpdateTruckFinance,
ExpertReportTruckExpenses, GetTruckPallets) — araç bazlı gelir/gider/finans kurgusu doğrudan ilham.
`CustomerCMR3Controller`, `CustomerCMR13Controller`. Sipariş/operasyon akışı için `OrderHeader`,
`Orders`, `SalesProductLogisticController` desenleri.

## Açık Sorular
- ~~Rota/harita MVP kapsamı?~~ Karar: Mesafe elle girilir; harita servisi Faz 8.
- ~~Konteyner/intermodal?~~ Karar: Şimdilik yalnız karayolu.
- "Taşıma irsaliyesi" ile e-İrsaliye aynı belge olarak ele alınabilir mi? Belge türü mali müşavirle doğrulanacak.
