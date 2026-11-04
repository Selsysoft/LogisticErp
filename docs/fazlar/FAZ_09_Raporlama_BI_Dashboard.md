# FAZ 9 — Raporlama / BI / Dashboard

**Amaç:** Yönetim ve operasyon için analitik: sefer/araç/müşteri/güzergâh kârlılığı, nakit akış,
operasyon KPI'ları, rol-bazlı dashboard'lar.

**Bağımlılık:** Faz 2,4,5 (veri kaynağı). **Çıktı:** Karar-destek panoları ve dışa aktarım.

---

## Kapsam / Görevler
1. **Kârlılık:** sefer başına gelir-gider-marj; araç başına; müşteri/güzergâh başına; taşeron vs öz
   filo karşılaştırma.
2. **Operasyon KPI:** zamanında teslim (OTIF), araç doluluk/boş km oranı, sefer sayısı, ortalama
   navlun, bekleme süreleri.
3. **Finans:** nakit akış öngörüsü, vade/yaşlandırma, tahsilat/ödeme performansı, döviz pozisyonu.
4. **Filo/Sürücü:** yakıt tüketimi, bakım maliyeti, belge uyumu, sürücü performansı.
5. **Dashboard:** rol-bazlı (Patron/Finans/Operasyon/Filo); özelleştirilebilir widget; tarih/şube
   filtreleri. Dışa aktarım (Excel/PDF). Zamanlı e-posta özetleri (opsiyonel).

## Kabul Kriterleri
- [ ] Sefer kârlılığı gelir-gider kırılımıyla doğru hesaplanır (finans verisiyle tutarlı — test).
- [ ] Rol-bazlı dashboard yalnız yetkili veriyi gösterir.
- [ ] Ağır raporlar sayfalama/önbellek ile kabul edilebilir sürede döner.
- [ ] Excel/PDF dışa aktarım çalışır.

## ERP Referansı
`CustomerAccountReportController`, `FinanceReportController`, `SupplierReportController`,
ödeme planlama ısı haritası ve dashboard desenleri; CustomerAccounts performans dersleri (büyük
veri raporu optimizasyonu).

## Açık Sorular
- Gömülü BI (Metabase/Superset) mı, uygulama içi özel raporlar mı? (Öneri: kritik panolar uygulama
  içi; serbest analiz için opsiyonel gömülü BI.)
