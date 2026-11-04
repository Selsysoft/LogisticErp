# FAZ 4 — Sevkiyat / Yük / Sefer + CMR + e-İrsaliye + POD (Operasyonun Kalbi)

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
- [ ] Taşıma emri oluştur→planla→yükle→yolda→teslim→faturala durum akışı uçtan uca çalışır.
- [ ] Çok bacaklı sefer: her bacağa farklı araç/taşeron atanır, maliyetler ayrışır.
- [ ] Araç/sürücü çakışması ve belgesi geçersiz atama engellenir.
- [ ] CMR ve e-İrsaliye taslağı doğru alanlarla üretilir (PDF/numara/durum).
- [ ] POD yüklenince sefer "teslim edildi"ye geçebilir.
- [ ] Teklif kazanınca sefer oluşturulabilir; sözleşmeli müşterinin sefer fiyatı tarifeden otomatik gelir.
- [ ] Teslim edilen seferden fatura kesilir; aynı sefer için ikinci fatura ve teslim edilmemiş sefere fatura engellenir;
      iptal ters hareket üretir.
- [ ] **Uçtan uca senaryo:** Fatura kesilince müşteri carisi navlun kadar BORÇ alır. Sefer kapanınca yakıt+HGS+taşeron
      giderleri ilgili carilere ALACAK + ödeme planına düşer. Aynı işlem tekrarlanınca kayıt çoğalmaz; sefer kâr/zarar
      doğru raporlanır — test.

## ERP Referansı
`AccountingPurchasesController` (ExpertReportTruck, GetTruckFinance/UpdateTruckFinance,
ExpertReportTruckExpenses, GetTruckPallets) — araç bazlı gelir/gider/finans kurgusu doğrudan ilham.
`CustomerCMR3Controller`, `CustomerCMR13Controller`. Sipariş/operasyon akışı için `OrderHeader`,
`Orders`, `SalesProductLogisticController` desenleri.

## Açık Sorular
- Rota optimizasyonu / harita (mesafe-süre) MVP'de basit mi (il-il mesafe tablosu) yoksa harita
  servisi entegrasyonu mu? (Öneri: MVP'de mesafe tablosu + manuel; harita Faz 8.)
- Konteyner/intermodal (deniz-demir) kapsama girecek mi, yoksa yalnız karayolu mu?
- "Taşıma irsaliyesi" ile e-İrsaliye aynı belge olarak ele alınabilir mi? Belge türü mali müşavirle doğrulanacak.
