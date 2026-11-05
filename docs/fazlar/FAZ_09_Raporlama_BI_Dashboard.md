# FAZ 9 — Raporlama / BI / Dashboard

> **Uygulama Notu (2026-11-05) — Durum: Uygulama içi raporlar ve rol bazlı ana sayfa `main` üzerinde, CI yeşil (run 42016597239). Performans ölçümü ve opsiyonlar açık.**
>
> **Yapılanlar:** Sefer, müşteri, güzergâh, araç ve öz filo/taşeron kârlılığı; operasyon göstergeleri; döviz pozisyonu, 12 haftalık nakit
> öngörüsü, tahsilat ve ödeme toplamları; sürücü performansı; yetkiye göre dolan ana sayfa bölümleri; Excel ve PDF dışa aktarım; `REPORT_VIEW` izni.
> Yaşlandırma, yakıt ve bakım maliyeti ile belge uyumu için mevcut finans ve filo ekranları kullanılır.
>
> **Doğrulama:** `mvn verify` 27 birim + 131 entegrasyon testi (CI'da Java 21, yerelde Java 17); frontend lint, 23 test ve build. Kârlılığın cari bakiyelerle
> tutarlılığı, bütün kırılımlarda aynı toplam, iptal edilen gider, yetki ayrımı, Excel ve PDF içeriği entegrasyon testlidir. Tarayıcıda patron
> hesabıyla ana sayfa ve dört sekme demo verisiyle görüldü, konsolda hata yoktu. Kırılım, tarih ve şube filtreleri ile sayfalama tarayıcıda değiştirilmedi.
> Excel ve PDF API üzerinden indirildi, ekrandaki düğmelere basılmadı. Sefer yetkisi olmayan kullanıcının başka sekmeye yönlendirilmesi tarayıcıda denenmedi.
>
> **Kabul kriterlerinde eksik kalanlar:**
> - Performans ölçülmedi. Sorgular veritabanında çalışır, kârlılık sayfalıdır ve dönem için indeks eklendi; önbellek yok, büyük veriyle yük testi yapılmadı.
>   Nakit öngörüsü, pozisyon ve sürücü raporu sayfasızdır. Faz 2'den gelen yaşlandırma hâlâ hareketleri bellekte işler.
> - Eksiksiz teslim (OTIF'in "in full" kısmı), boş km ve bekleme süresi gösterilmez, çünkü bu veriler tutulmuyor. Uydurma oran üretilmedi.
> - Özelleştirilebilir widget, zamanlı e-posta özeti ve gömülü BI yapılmadı. Araç başına litre/100 km ayrı bir rapor olarak eklenmedi.
>
> **Kararlar ve varsayımlar:**
> - Kârlılık yalnız faturası kesilmiş ve kapanmış seferleri sayar; dönem planlanan yükleme tarihine göredir. Tutarlar faturanın net TL'si ve giderin TL karşılığıdır.
> - Araç ve öz filo/taşeron kırılımında çok etaplı seferin geliri ve gideri etaplara eşit bölünür; km'ye veya gidere göre dağıtılmaz. Bu varsayım kullanıcıyla doğrulanmalı.
> - Doluluk yalnız ağırlığa ve ilk etap aracına bakar. Zamanında teslim, tutanak tarihi ile planlanan teslim tarihinin karşılaştırılmasıdır.
> - Nakit öngörüsünde tahsilat faturaya bağlanmadığından müşteri bakiyesi en yeni faturadan geriye dağıtılır. Çıkış yalnız ödeme planlarıdır; plana bağlanmamış borç, çek, senet ve maaş girmez.
> - Pozisyonda bakiye işareti esastır: sürücü avansı gibi her borçlu bakiye alacak görünür. Para birimleri birbirine çevrilmez.
> - Ana sayfa bölümleri modül izniyle, Raporlar ekranı `REPORT_VIEW` ile açılır. İzin Finans Süper, Finans, Operasyon ve Filo Yöneticisi rollerine verildi.
> - Excel'de metin hücreleri metin yazılır, formül çalışmaz. Dışa aktarım en çok 10.000 satırdır; Excel ve PDF rol izinlerini ayrıca denetler.

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
- ~~Gömülü BI (Metabase/Superset) mı, uygulama içi özel raporlar mı?~~ Karar: Kritik panolar uygulama
  içi. Serbest analiz için gömülü BI ihtiyaç doğarsa ayrıca değerlendirilir.
