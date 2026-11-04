# FAZ 6 — Depo / 3PL / Antrepo

**Amaç:** Depolama ve üçüncü parti lojistik (3PL) süreçleri: depo/antrepo, raf/göz, stok sahipliği
(müşteri malı), mal kabul/sevk, elleçleme ve depo faturalaması.

**Bağımlılık:** Faz 2 (finans/faturalama), Faz 3 (müşteri/tarife), Faz 4 (sevkiyat bağı).
**Çıktı:** Depolu lojistik ve 3PL gelir akışı.

---

## Kapsam / Görevler
1. **Depo/Antrepo:** `Warehouse`, `Bin/Location` (raf/göz), antrepo rejimi (gümrüklü antrepo bilgisi).
2. **Stok:** `StockItem` (müşteri sahipli — 3PL), parti/lot, seri, son kullanım; giriş/çıkış hareketi.
3. **Mal Kabul / Sevk:** depoya giriş (sevkiyattan veya harici), çıkış (sefere veya müşteriye).
4. **Elleçleme (Handling):** yükleme/boşaltma/etiketleme vb. hizmet kalemleri → ücretlendirme.
5. **3PL Sözleşme & Faturalama:** depolama (gün/palet/m²) + elleçleme ücretleri → periyodik
   fatura → finans/cari.
6. **Sayım/Envanter:** stok sayımı, fark yönetimi.

## Kabul Kriterleri
- [ ] Müşteri malı depoya giriş/çıkış ile stok doğru değişir (parti/lot izlenir).
- [ ] Depolama + elleçleme ücretleri dönemsel faturaya ve cariye doğru yansır.
- [ ] Antrepo rejimli stok gümrük durumu ile işaretlenir (Faz 7 ile bağ).
- [ ] Stok sayımı farkı raporlanır ve düzeltme hareketi oluşturur.

## ERP Referansı
Stok/depo ve mal kabul desenleri: `MaterialStockAll*`, `AcceptanceOfGood`, depo/ambar controller'ları;
iş yeri/şube yapısı. (Üretim stoğu → 3PL müşteri stoğu mantığına uyarlanır.)

## Açık Sorular
- Barkod/el terminali (WMS) MVP kapsamında mı? (Öneri: temel giriş/çıkış MVP; WMS sonraki.)
