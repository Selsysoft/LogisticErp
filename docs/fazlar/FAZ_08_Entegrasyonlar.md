# FAZ 8 — Entegrasyonlar (GİB, HGS/OGS, Yakıt Kartı, GPS, Banka, Harita)

> **Uygulama Notu (2026-11-05) — Durum: Adaptör katmanı ve dosya akışları `main` üzerinde, CI yeşil (run 42011323557). Gerçek sağlayıcılar seçilmedi; faz açık.**
>
> **Yapılanlar:** e-Fatura, e-Arşiv ve e-İrsaliye gönderim akışı ve UBL üretimi (deneme sağlayıcısıyla), HGS/OGS ve yakıt kartı CSV içe aktarımı
> ve eşleme, banka ekstresi CSV içe aktarımı ve mutabakat, GPS konum alma, bölge olayları, güzergâh mesafe tablosu ve bunların React ekranları.
>
> **Doğrulama:** `mvn verify` 23 birim + 124 entegrasyon testiyle (CI'da Java 21, yerelde Java 17); frontend lint, 20 test ve build. Tarayıcıda deneme
> sağlayıcısı uyarısı, vergi numarası engeli, firma bilgisi girişi, e-Arşiv gönderimi, durum sorgusu, HGS satır durumları, GPS ve banka
> ekranı denendi. Dosyalar API ile yüklendi; dosya seçme düğmeleri, sefer seçme, gidere yazma, banka eşleştirme formu, e-belge iptali,
> yakıt kartı ve mesafe ekranı tarayıcıda denenmedi, arka planları entegrasyon testlidir.
>
> **Kabul kriterlerinde eksik kalanlar:**
> - Gerçek e-belge gönderimi yok. Üretimde deneme sağlayıcısı oluşmaz, entegratör tanımlanana kadar gönderim reddedilir. "En az bir gerçek
>   sağlayıcı sözleşme testi" kriteri entegratör seçilince karşılanacak.
> - UBL, GİB şemasıyla ve şematronla doğrulanmadı. Fatura numarası GİB biçiminde değil, satır ve KDV kırılımı sadeleştirilmiştir. Gerçek
>   gönderimden önce bunlar düzeltilmeli; belge türü ve tevkifat kodları mali müşavirle doğrulanmalı.
> - GPS sağlayıcısı yok. Konum yetkili kullanıcı API'siyle alınır; cihaz kimlik doğrulaması, kuyruk, geçmiş rota ekranı, hız/rölanti raporu ve harita yok.
> - Harita servisi yok. Mesafe ve süre firmanın tablosundan gelir; ETA sefere yazılmaz.
> - Banka ve HGS/OGS için sağlayıcı API'si yok. Dosya biçimi bizim tanımladığımız CSV'dir; gerçek sağlayıcı dosyasına göre uyarlanacak.
>
> **Kararlar ve varsayımlar:**
> - e-Fatura mı e-Arşiv mi olduğunu kullanıcı seçer; GİB mükellef sorgusu yok. e-Fatura için müşteri vergi numarası zorunludur.
> - Gönderilmiş fatura, e-belgesi iptal edilmeden iptal edilemez. Reddedilen veya iptal edilen belge yeniden gönderilir. Depo faturası henüz e-belge olarak gönderilmez.
> - Gönderim veritabanı işlemi içinde yapılır; gerçek entegratörde, belge gidip kayıt yazılamazsa uzlaştırma gerekecek.
> - HGS eşlemesi plaka ve planlanan etap zamanına göredir; gecikmeli sefer eşleşmezse elle seçilir. Yakıt sefersiz de araç gideri olur; sefer bulunursa
>   kârlılığa bağlanır. Tekrar yüklenen hareket referansla veya satır içeriğiyle atlanır; içe aktarım geri alınamaz, yanlış gider ayrıca düzeltilir.
> - Banka ekstresi finans kaydı üretmez, yalnız karşılaştırılır. Otomatik eşleme aynı yön ve tutar, en çok 3 gün farkla yapılır; eşit adaylarda kullanıcıya bırakılır.
> - Konum verisi kişisel veri sayılabilir; sürücü aydınlatması ve saklama süresi KVKK kapsamında belirlenmeli. Otomatik silme yok.
> - Harici sağlayıcılar için tenant başına kimlik bilgisi saklama henüz yok.

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
