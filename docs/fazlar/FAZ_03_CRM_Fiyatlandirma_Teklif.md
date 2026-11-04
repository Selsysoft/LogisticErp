# FAZ 3 — CRM + Fiyatlandırma / Teklif / Sözleşme

> **Uygulama Notu (2026-11-05) — Durum: kabul kriterleri karşılandı**
>
> **Yapılanlar:** Dosya yönetimi (X1), müşteri/aday, kişi, segment/etiket, fırsat hunisi, aktivite ve hatırlatma, vergi oranı,
> tarife ve fiyat motoru, sürümlü teklif, PDF, sözleşme, CRM özeti ve bunların React ekranları.
>
> **Doğrulama:** GitHub Actions CI (`41936089815`) yeşil: Java 21 ile 14 birim + 73 entegrasyon testi, Spotless, container imajı;
> frontend lint, format, 14 test ve build. Tarayıcıda teklif oluşturma, tarifeden fiyat, gönderme, kabul, sözleşme
> ve özet ekranı denendi. Müşteri, kişi, aktivite, dosya yükleme, tarife formu ve fiyat hesaplama ekranları tarayıcıda
> denenmedi; arka planları entegrasyon testlidir. PDF içeriği metin olarak doğrulandı, görünümüne elle bakılmadı.
>
> **Kararlar:** Tarife önceliği güzergâh, sonra km. E-imza yok; kabul elle işlenir. Virüs taraması yok.
>
> **Sapmalar ve varsayımlar:**
> - Yalnız yerel disk depolaması var; `FileStorage` arayüzü S3 için hazır, S3 uyarlayıcısı yazılmadı.
> - Virüs taraması olmadığı için izinli türler dar tutuldu (pdf, png, jpg, xlsx, docx, txt) ve dosyalar yalnız indirilir.
> - "Gönderildi" düğmesi teklifi işaretler ve PDF'i arşivler; e-posta göndermez (bildirim altyapısı X2'de).
> - KDV ve tevkifat oranları kodda yoktur; firma ekrandan tanımlar. Doğru oranlar mali müşavirle belirlenmeli.
> - Tevkifat KDV üzerinden hesaplanır; ödenecek = net + KDV − tevkifat.
> - Sözleşme yakıt eki ve bekleme ücretini geçersiz kılar; diğer ekler tarifeden gelir.
> - Bir müşterinin aynı dönemde tek aktif sözleşmesi olabilir.
> - Teklif satırı fiyatı eklendiği anda dondurulur; tarife değişse satır değişmez.
> - Tekliften sefer oluşturma ve sefer fiyatı Faz 4'te doğrulanacak.
>
> **Bulunan hata:** Sunucu tarihi UTC'den aldığı için İstanbul'da gece yarısından sonra "bugün" başlayan tarife geçersiz
> sayılıyordu. İş kurallarındaki "bugün" artık firmanın saat diliminden gelir (`TenantClock`).

**Amaç:** Müşteri/aday yönetimi, fırsat→teklif→sözleşme hunisi, tarife/fiyat motoru ve navlun
fiyatlandırması. Operasyon (Faz 4) buradan fiyat ve müşteri bilgisini alır.

**Bağımlılık:** Faz 1, 2 (cari hesap), X1 (belge/dosya). | **Çıktı:** Satış hunisi + fiyatlandırılabilir teklif/sözleşme.

---

## Kapsam / Görevler

1. **Hesap & Kişi:** `Account` (CRM müşteri/aday görünümü; finans `Account` ile aynı kök),
   `Contact` (kişiler, roller, iletişim). Segment/etiket.
2. **Fırsat (Opportunity):** aşama (lead→nitelikli→teklif→kazanıldı/kaybedildi), değer, sorumlu,
   aktivite/notlar, hatırlatma.
3. **Teklif (Quote):** müşteri, güzergâh(lar), araç tipi, yük, fiyat satırları, geçerlilik, versiyon,
   PDF üretimi; onay/gönderim; kazanınca sözleşmeye/sefere dönüşüm.
4. **Sözleşme (Contract):** dönem, fiyat/tarife bağı, özel koşullar (vade, yakıt eki, bekleme ücreti).
5. **Tarife / Fiyat Motoru (Tariff):**
   - `Tariff` + `TariffLine`: güzergâh (çıkış-varış il/ülke) | km | ton/palet | araç tipi | müşteri özel.
   - Ek bileşenler: **yakıt ek ücreti (fuel surcharge)**, bekleme/demuraj, geçiş (HGS/OGS), sigorta,
     çoklu durak, ADR ek. Para birimi ve KDV/tevkifat kuralı.
   - Fiyat hesaplama servisi: girdi (güzergâh, araç tipi, yük, müşteri) → fiyat kırılımı.
6. **CRM Dashboard:** huni, kazanç oranı, sorumlu bazlı performans, yaklaşan aktiviteler.

## İş Kuralları
- Teklif versiyonlanır; gönderilmiş teklif değişmez, yeni versiyon açılır.
- Fiyat motoru deterministik ve açıklanabilir (hangi satır/ek ne kattı — kırılım döner).
- Sözleşmeli müşteride sefer fiyatı otomatik tarifeden; sözleşmesizde el ile/teklif bazlı.

## Kabul Kriterleri
- [x] Aday→fırsat→teklif→sözleşme hunisi uçtan uca ilerler, aşama geçişleri loglanır.
- [x] Fiyat motoru aynı girdiye hep aynı fiyatı ve açıklamalı kırılımı döner (test).
- [x] Yakıt eki ve KDV/tevkifat fiyata doğru yansır.
- [x] Teklif PDF üretir; kazanınca sözleşme oluşturulur. (Tekliften sefer oluşturma Faz 4'te doğrulanır.)
- [x] Sözleşmeli müşteri ve verilen sefer girdisi için fiyat motoru tarifeden fiyat döner. (Sefere yansıması Faz 4'te doğrulanır.)

## ERP Referansı
Müşteri/tedarikçi CRM tohumu: `CustomerController`, `SupplierController`, `SupplierTrader/Chauffeur/Truck`,
`Models/ZT/Customer*.cs`, `Supplier*.cs`. Fiyat/sipariş kurgusu için `OrderHeaderController`/`Orders`
desenleri (yaş meyve siparişi → navlun teklifi mantığına uyarlanır).

## Açık Sorular
- ~~Tarife birincil boyutu?~~ Karar: Güzergâh tablosu, bulunamazsa km.
- ~~Teklif e-imza MVP'de mi?~~ Karar: Hayır; kabul elle işlenir.
