# FAZ 6 — Depo / 3PL / Antrepo

> **Uygulama Notu (2026-11-05) — Durum: Kriterler yerelde karşılandı, CI bekliyor.**
>
> **Yapılanlar:** Depo ve antrepo, raf-göz, müşteriye ait ürün, lot ve son kullanma takibi, mal kabul, çıkış, ters kayıt, gümrük
> durumu, sayım ve fark düzeltmesi, 3PL sözleşmesi, elleçleme, dönemsel fatura, iptal, PDF ve bunların React ekranları.
>
> **Doğrulama:** `mvn verify` birim ve entegrasyon testleriyle (yerelde Java 17). Tarayıcıda depo tanımı, çıkış, stok yetersiz engeli,
> fatura önizleme, fatura kesme ve iptal, sayım açma, fark girme ve kapatma, hareket listesi denendi; cari kayıtları veritabanından
> doğrulandı. Mal kabul, gümrük işlemi, ters kayıt, elleçleme girişi, sayıma satır ekleme ve PDF indirme ekranları tarayıcıda
> denenmedi; arka planları entegrasyon testlidir.
>
> **Kararlar:** Barkod ve el terminali (WMS) sonraya bırakıldı.
>
> **Sapmalar ve varsayımlar:**
> - Depodaki mal müşterinindir; değerlenmez, firma stoğu sayılmaz. Faz 2 finansına yalnız hizmet faturası yazılır.
> - Depolama ücreti gün sonu stoğundan hesaplanır: giriş günü ücrete dahildir, çıkan mal çıkış gününde dahil değildir. Ürün başına
>   "faturalama birimindeki miktar" palet veya m²'ye çevirir. Bu hesap sözleşme kuralıdır, müşteriye göre değişebilir.
> - Seri takibi ayrı alan değildir; seri numarası lot alanına girilir.
> - Gözler arası transfer yok; çıkış ve giriş olarak yapılır.
> - Fatura taslaksız kesilir ve elle başlatılır; otomatik aylık çalıştırma yok.
> - Faturalanmış döneme hareket yazılamaz; fatura iptal edilirse dönem yeniden açılır. Fatura bugünü de kapsıyorsa bugünkü hareketler
>   ve sayım farkı da engellenir.
> - Sayım açıkken o depoda hareket yapılamaz. Geriye dönük çıkış stoğu geçmişte eksiye düşürürse o günler ücretlendirilmez.
> - Antrepo deposuna giren mal "antrepo rejiminde" işaretlenir ve gümrük işlemi girilmeden çıkamaz. Beyanname yalnız numara olarak
>   tutulur; gerçek gümrük akışı Faz 7'de bağlanacak. Antrepo kuralları gümrük müşaviriyle doğrulanmalıdır.
> - Depo faturası yasal e-Fatura değildir. `WAREHOUSE_INVOICE` izni finans rollerindedir, depo rolünde yoktur; rol dağılımı varsayımdır.

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
- [x] Müşteri malı depoya giriş/çıkış ile stok doğru değişir (parti/lot izlenir).
- [x] Depolama + elleçleme ücretleri dönemsel faturaya ve cariye doğru yansır.
- [x] Antrepo rejimli stok gümrük durumu ile işaretlenir (Faz 7 ile bağ).
- [x] Stok sayımı farkı raporlanır ve düzeltme hareketi oluşturur.

## ERP Referansı
Stok/depo ve mal kabul desenleri: `MaterialStockAll*`, `AcceptanceOfGood`, depo/ambar controller'ları;
iş yeri/şube yapısı. (Üretim stoğu → 3PL müşteri stoğu mantığına uyarlanır.)

## Açık Sorular
- ~~Barkod/el terminali (WMS) MVP kapsamında mı?~~ Karar: Temel giriş/çıkış var; WMS sonraya kaldı.
