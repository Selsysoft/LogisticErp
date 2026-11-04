# FAZ 8 — Entegrasyonlar (GİB, HGS/OGS, Yakıt Kartı, GPS, Banka, Harita)

**Amaç:** Dış sistem entegrasyonları. Her entegrasyon ayrı adaptör (`integration` modülü), arayüz
arkasına gizli, test için sahte (mock) sağlayıcı.

**Bağımlılık:** İlgili iş fazları (2,4,5). **Çıktı:** Gerçek dünya veri akışı ve e-belge.

---

## Kapsam / Görevler
1. **GİB e-Fatura / e-Arşiv / e-İrsaliye:** navlun faturası ve taşıma irsaliyesinin resmi gönderimi;
   özel entegratör (ör. bir e-dönüşüm sağlayıcısı) API'si; durum/iptal/itiraz; UBL üretimi.
2. **HGS/OGS Geçiş:** otoyol/köprü geçiş verisi içe aktarımı → araç/sefer giderine eşleme
   (plaka+zaman ile otomatik eşleştirme).
3. **Yakıt Kartı:** istasyon/kart hareketleri içe aktarımı → `FuelLog` + gider eşleme.
4. **GPS / Telematik:** araç canlı konum, geçmiş rota, geofence, hız/rölanti; sefer takibine bağlama.
   (Yüksek frekanslı veri → asenkron akış/kuyruk.)
5. **Banka:** hesap hareketleri (ekstre/API) içe aktarımı → banka hareketi eşleştirme/mutabakat.
6. **Harita/Mesafe:** güzergâh mesafe-süre (fiyat ve ETA için) — bir harita sağlayıcısı.
7. **TCMB kur** (Faz 2'de başladıysa burada sağlamlaştır).

## Kabul Kriterleri
- [ ] Navlun faturası e-Fatura/e-Arşiv olarak gönderilir, durum izlenir (mock + en az bir gerçek
      sağlayıcı sözleşme testi).
- [ ] e-İrsaliye taşıma için üretilir ve gönderilir.
- [ ] HGS/OGS ve yakıt kartı hareketleri doğru araç/sefere eşleşir, gidere yazılır.
- [ ] GPS konumu sefer takibinde gösterilir; geofence olayı üretilir.
- [ ] Banka ekstresi içe aktarılıp hareketlerle mutabakat yapılabilir.

## ERP Referansı
ERP'de dış entegrasyon sınırlı; TCMB kur çekme ve HKS/QR gibi örnekler var. Entegrasyonlar büyük
ölçüde yeni; her biri adaptör + mock ile sözleşme-testli kurulur.

## Açık Sorular
- Hangi e-dönüşüm entegratörü/özel sağlayıcı? Hangi GPS/telematik sağlayıcıları? (Müşteri/pazara göre
  listelenmeli — ajan, soyut adaptör + en az bir somut sağlayıcı ile başlar.)
