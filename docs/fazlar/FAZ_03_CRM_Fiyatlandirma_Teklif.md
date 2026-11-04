# FAZ 3 — CRM + Fiyatlandırma / Teklif / Sözleşme

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
- [ ] Aday→fırsat→teklif→sözleşme hunisi uçtan uca ilerler, aşama geçişleri loglanır.
- [ ] Fiyat motoru aynı girdiye hep aynı fiyatı ve açıklamalı kırılımı döner (test).
- [ ] Yakıt eki ve KDV/tevkifat fiyata doğru yansır.
- [ ] Teklif PDF üretir; kazanınca sözleşme oluşturulur. (Tekliften sefer oluşturma Faz 4'te doğrulanır.)
- [ ] Sözleşmeli müşteri ve verilen sefer girdisi için fiyat motoru tarifeden fiyat döner. (Sefere yansıması Faz 4'te doğrulanır.)

## ERP Referansı
Müşteri/tedarikçi CRM tohumu: `CustomerController`, `SupplierController`, `SupplierTrader/Chauffeur/Truck`,
`Models/ZT/Customer*.cs`, `Supplier*.cs`. Fiyat/sipariş kurgusu için `OrderHeaderController`/`Orders`
desenleri (yaş meyve siparişi → navlun teklifi mantığına uyarlanır).

## Açık Sorular
- Tarife birincil boyutu km mi, güzergâh (il/ülke çifti) mi, ikisi birden mi? (Öneri: ikisi; güzergâh
  tablosu + km fallback.)
- Teklif onay/imza süreci (e-imza) MVP'de mi?
