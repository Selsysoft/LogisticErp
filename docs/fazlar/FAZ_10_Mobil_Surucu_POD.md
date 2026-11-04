# FAZ 10 — Mobil Sürücü Uygulaması / POD

**Amaç:** Sürücüler için mobil (veya PWA) uygulama: sefer görevleri, durum güncelleme, teslim
kanıtı (POD), belge/foto yükleme, konum paylaşımı, harcırah/masraf girişi.

**Bağımlılık:** Faz 4 (sevkiyat), 5 (sürücü), 1 (sınırlı sürücü kullanıcı). **Çıktı:** Sahadan canlı
veri + dijital POD.

---

## Kapsam / Görevler
1. **Sürücü girişi** (sınırlı rol), bugünkü/atanan seferler listesi.
2. **Durum güncelleme:** yüklendi/yolda/molada/boşaltıldı/teslim; zaman+konum damgası.
3. **POD:** alıcı adı, imza (ekranda), teslim fotoğrafı, not; offline yakala → senkron.
4. **Belge/masraf:** yakıt fişi, geçiş, harcırah fotoğrafı; finansa taslak gider.
5. **Konum:** periyodik konum (izinli) → sefer takibi/geofence.
6. **Bildirim:** yeni görev, rota değişikliği.

## Kabul Kriterleri
- [ ] Sürücü yalnız kendi seferlerini görür; başka veriye erişemez.
- [ ] POD (imza+foto+zaman+konum) kaydı sefere bağlanır; sefer "teslim"e geçer.
- [ ] Offline girilen POD/masraf çevrimiçi olunca senkronlanır, çift kayıt olmaz (idempotent).
- [ ] Masraf girişi finansa taslak olarak düşer (onaya bağlı).

## ERP Referansı
ERP'de QR/mobil tarama ve canlı izleme desenleri (ForkliftPanel/Scan, canlı ekran izleme) mobil
akış ve offline senkron için ilham; POD yeni.

## Açık Sorular
- Native mi, PWA mı? (Öneri: PWA ile başla; gerekirse native.)
- Sürücü konum takibinin KVKK dayanağı, aydınlatma metni ve saklama süresi nedir? (Hukukçu görüşü gerekir.)
