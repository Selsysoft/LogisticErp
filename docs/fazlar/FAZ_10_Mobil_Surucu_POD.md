# FAZ 10 — Mobil Sürücü Uygulaması / POD

> **Uygulama Notu (2026-11-05) — Durum: Sürücü PWA'sı `main` üzerinde, CI yeşil (run 42046956197; CI'da Java 21, yerelde Java 17). Gerçek telefonda denenmedi; push bildirimi ve hukuki görüş açık.**
>
> **Yapılanlar:** `/driver` sürücü ekranları; sürücü kaydını kullanıcıya bağlama; atanan seferler, durum bildirimi; imzalı ve fotoğraflı teslim tutanağı; fişli masraf girişi ve ofis onayı
> (Operasyon > Sürücü masrafları); isteğe bağlı konum; çevrimdışı kuyruk ve tekrar gönderimde tekilleştirme; çevrimdışı açılan uygulama kabuğu.
>
> **Doğrulama:** Yerelde Java 17 ile `mvn verify` 29 birim + 146 entegrasyon testi; frontend lint, 40 test ve build. Yetki ayrımı, tekrar gönderim, imza zorunluluğu, görsel türü denetimi, masrafın onaya kadar gider olmaması ve kapanışta sürücü carisine yazılması entegrasyon testlidir.
> Tarayıcıda backend gerçekten durdurularak denendi: sayfa yenileme sonrası oturum korundu, durum, imzalı teslim ve masraf cihaza yazıldı, sunucu dönünce gönderildi ve sunucudaki kayıt kontrol edildi; teslim zamanı girildiği an olarak kaldı.
> Derlenmiş sürümde sunucu kapalıyken uygulamanın açıldığı görüldü. Bu deneme, sayfa çevrimdışı yenilenince isteklerin token'sız gidip kalıcı red sayılması hatasını yakaladı; düzeltildi ve regresyon testi eklendi.
>
> **Denenmeyenler:** Gerçek telefon, parmakla imza, kamera, ana ekrana ekleme ve HTTPS üzerinde çalışma. Pencere daraltılamadığı için telefon genişliği görsel olarak da doğrulanmadı. Fotoğraf yükleme arayüzü ve konum anahtarı tarayıcıda denenmedi; fotoğraf ve konumun sunucu tarafı testlidir. IndexedDB iOS Safari'de denenmedi.
>
> **Kabul kriterlerinde eksik kalanlar ve sınırlar:**
> - Fotoğraf zorunlu değildir, konum varsayılan kapalıdır. Bu yüzden her tutanakta imza ve zaman vardır, foto ve konum her zaman olmayabilir. Zorunlu olmaları iş ve hukuk kararıdır.
> - Bildirim yalnız uygulama açıkken 60 saniyelik yoklamayla çalışır; push bildirimi yok. Rota değişikliği ayrıca bildirilmez.
> - Konum yalnız uygulama açıkken alınır; telefon kilitliyken takip PWA ile mümkün değildir. Geciken konum kuyruğa alınmaz.
> - Manifest ikonu SVG'dir; bazı telefonlarda yüklenebilirlik için PNG ikon gerekebilir.
> - Yüklenen görsellerde virüs taraması yok; yalnız PNG/JPEG imzası denetlenir. Toplu fotoğraflar cihaz depolamasını doldurabilir, kuyruk boyutu sınırlı değildir.
> - Yerel kuyruk ve son sefer listesi şifresiz olarak cihazdadır. Çıkışta liste silinir; gönderilmemiş işlemler aynı kullanıcı dönene kadar cihazda kalır.
>
> **Kararlar ve varsayımlar:**
> - Native yerine PWA. Sürücü yalnız etabına atandığı seferi görür; başka sefer "bulunamadı" döner. Fiyat, cari ve kâr bilgisi yanıtta yoktur. Çok etaplı seferde etaptaki her sürücü durumu değiştirebilir, durum etap bazlı değildir.
> - Teslim edilen sefer 7 gün listede kalır. Reddedilen çevrimdışı işlem silinmez; sürücü nedeni görür, tekrar dener veya kaldırır. Ağ ve sunucu hataları otomatik yeniden denenir.
> - Telefon saati ileri ise zaman şimdiye çekilir; geçmiş zaman denetlenmez, yani saat geri alınarak yanlış zaman girilebilir.
> - Masrafı sefer yetkilisi onaylar ve sefer gideri olur; cariye sefer kapanışında alacak yazılır. Kapanmış sefere masraf onaylanamaz, bu durumda reddedilip elle işlenir. Masraf mutlaka bir sefere bağlıdır. Yabancı para için onay günü kuru gerekir.
> - Konum anahtarı sürücüdedir ve varsayılan kapalıdır. KVKK dayanağı, aydınlatma metni ve saklama süresi için hukukçu görüşü hâlâ gereklidir.
> - Sunucuya ulaşılamaması artık oturumu silmez; bu değişiklik bütün kullanıcıları kapsar. Son kullanıcı bilgisi bu amaçla cihazda tutulur, çıkışta silinir.

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
- ~~Native mi, PWA mı?~~ Karar: PWA ile başlandı. Kilitli ekranda konum veya push gerekirse native değerlendirilir.
- Sürücü konum takibinin KVKK dayanağı, aydınlatma metni ve saklama süresi nedir? (Hukukçu görüşü gerekir.)
