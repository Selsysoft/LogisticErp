# Önceki sistemden geçiş rehberi

Bu rehber, başka bir ERP veya muhasebe programından gelen bir firmanın Blackrose'a nasıl taşınacağını anlatır. Adımlar bu sırayla yapılmalıdır; her adım bir öncekinin verisine dayanır.

## Geçiş günü

Önce bir **geçiş tarihi** seçin (ör. ay sonu). Eski sistemde o güne kadar olan her şey kapatılır; bakiyeler, açık faturalar ve depo stoğu o tarihteki haliyle taşınır. Geçiş tarihinden sonraki işlemler yalnız Blackrose'a girilir. Taşınan verilerin eski sistemle tuttuğu, geçiş günü iki sistemden alınan raporlar karşılaştırılarak doğrulanır (bkz. [Kontrol listesi](#kontrol-listesi)).

## 1. Firma, şubeler, kullanıcılar

1. Firma, SaaS yöneticisi tarafından açılır; firma sahibine davet e-postası gider.
2. **Finans > Tanımlar > Şubeler**: şubeleri ekleyin. Bütün içe aktarmalar bir şubeye yazılır.
3. **Kullanıcılar**: çalışanları davet edin, rollerini seçin (**Roller ve İzinler**'den izinler değiştirilebilir).
4. Ödeme planları varsayılan olarak "dört göz" ilkesiyle çalışır: planı giren kişi onaylayamaz. Tek kişilik firmada **Finans > Tanımlar > Onay ayarları**'ndan kapatılabilir.

## 2. Cariler ve bakiyeler

Her cari için iki yoldan biri seçilir; **aynı cari ve para biriminde ikisi birlikte kullanılamaz** (bakiye iki kez sayılır, sistem buna izin vermez):

| Yol | Ne zaman | Sonuç |
|---|---|---|
| **Açılış bakiyesi** | Carinin tek toplam bakiyesi yeterli (ör. personel, banka, vade takibi gerekmeyen cariler) | Cariye geçiş tarihli tek hareket. Vade bilgisi yoktur. |
| **Açık faturalar** | Vadesi takip edilecek alacak ve borçlar | Her açık fatura cariye belge tarihiyle yazılır; müşteri faturası nakit öngörüsüne vadesiyle girer, tedarikçi/taşeron faturası taslak ödeme planı olur. Yaşlandırma raporu doğru dilimleri gösterir. |

### 2a. Açılış bakiyesi — carileri de açar

**Finans > Cari > Açılış bakiyesi içe aktar**. Örnek: [`ornekler/acilis-bakiyesi.csv`](ornekler/acilis-bakiyesi.csv)

| Sütun | Zorunlu | Açıklama |
|---|---|---|
| Kod | evet | Cari kodu; varsa mevcut cariyle eşleşir |
| Ad | yeni cari için | Mevcut caride değişmez |
| Tür | evet | Müşteri, Tedarikçi, Taşeron, Personel, Banka |
| Bakiye | evet | Pozitif: cari bize borçlu. Negatif: biz cariye borçluyuz. **0: cari hareketsiz açılır** |
| Para birimi | hayır | Varsayılan TRY |
| Kur | dövizde | Geçiş tarihinde sistemde kur yoksa gerekir |
| Vergi no | hayır | |

Açık faturaları yüklenecek carileri de bu dosyayla, **bakiyeyi 0 yazarak** açın; böylece yüzlerce cariyi elle girmeniz gerekmez.

### 2b. Açık faturalar

**Finans > Cari > Açık faturaları içe aktar**. Cariler önceden açılmış olmalıdır (2a). Örnek: [`ornekler/acik-faturalar.csv`](ornekler/acik-faturalar.csv)

| Sütun | Zorunlu | Açıklama |
|---|---|---|
| Cari kodu | evet | Müşteri faturası alacak, tedarikçi/taşeron faturası borç olarak yazılır |
| Belge no | evet | Eski sistemdeki fatura numarası; aynı caride iki kez yüklenemez |
| Belge tarihi | evet | Yaşlandırma buna göre hesaplanır |
| Vade | evet | Belge tarihinden önce olamaz |
| Tutar | evet | Faturanın **açık kalan** tutarı (kısmen tahsil edildiyse kalan) |
| Para birimi, Kur | hayır | Kur, belge tarihinde sistemde kur yoksa gerekir |

Açık faturalar kendi fatura numaralarınıza (NF-, DF-), Faturalar sayfasına ve gelir/kârlılık raporlarına girmez; yalnız açık tutarı ve vadesi taşınır. KDV'nin eski sistemde beyan edildiği varsayılır — **bu varsayımı mali müşavirinizle doğrulayın.**

## 3. Banka, kasa, çek ve senet

1. **Finans > Banka ve Kasa > Hesap ekle**: her banka hesabı ve kasa için.
2. Her hesabın geçiş günü bakiyesini **Hareket ekle** ile, geçiş tarihli **Giriş** olarak girin. (Bu adımın içe aktarması yoktur; hesap sayısı genelde azdır.)
3. **Çek ve Senet**: portföydeki ve verilmiş çek/senetler tek tek girilir.

## 4. Filo ve operasyon

Araçlar, sürücüler ve belgeleri (muayene, sigorta, ehliyet, SRC, psikoteknik) **Filo** modülünden girilir. Belgesi süresi dolmuş araç veya sürücü sefere atanamaz; geçişte bitiş tarihlerinin doğru girilmesi önemlidir. Tarifeler ve sözleşmeler **Satış/CRM**'den girilir. Geçiş günü yolda olan seferler yeni sefer olarak açılır.

## 5. Depo

1. **Depo > Tanımlar**: depoları ekleyin. Gözleri önceden girmeniz gerekmez; açılış stoğundaki göz kodları yoksa açılır.
2. **Depo > Stok > Açılış stoğu içe aktar**. Mal sahibi müşterilerin carisi önceden açılmış olmalıdır (2a). Örnek: [`ornekler/acilis-stogu.csv`](ornekler/acilis-stogu.csv)

| Sütun | Zorunlu | Açıklama |
|---|---|---|
| Müşteri kodu | evet | Mal sahibinin cari kodu |
| Ürün kodu | evet | Yoksa müşteri adına açılır |
| Ürün adı, Birim | yeni ürün için | |
| Göz | evet | Yoksa depoda açılır |
| Lot, Son kullanma | hayır | Aynı lotun son kullanma tarihi tek olmalıdır |
| Miktar | evet | En çok üç ondalık |

Her satır "Açılış stoğu" referanslı bir mal kabulüdür; depolama ücreti açılış tarihinden işler. Açılış boş depoya yapılır: aynı göz, ürün ve lotta stok varsa satır reddedilir. Depoda açık sayım varken yüklenemez.

## Dosyaları hazırlama

- Excel'de **Farklı Kaydet > CSV UTF-8** veya **CSV (noktalı virgülle ayrılmış)** seçin; ikisi de okunur. Türkçe karakterler korunur.
- İlk satır başlıktır; sütunlar **başlık adıyla** bulunur, sıraları önemli değildir. Fazla sütunlar yok sayılır.
- Tarih: `31.12.2026` veya `2026-12-31`.
- Tutar ve miktar: `1500`, `1500,00` veya `1.500,00`. **`1.500` gibi yalnız binlik noktası olan yazım reddedilir** (1,5 mi 1500 mü belirsizdir).
- Her içe aktarma önce **Önizle** ile denetlenir. Tek bir hatalı satır varsa **hiçbir şey yazılmaz**; hatalar satır satır gösterilir, dosyayı düzeltip yeniden yükleyin.
- Aynı dosyayı yanlışlıkla iki kez yüklemek zararsızdır: ikinci yüklemede satırlar "zaten var" diye reddedilir.

## Yanlış yüklenen satırı düzeltme

| Ne | Nasıl |
|---|---|
| Açılış bakiyesi | Cari ekstresinde satırın **Ters çevir** düğmesi; sonra doğru tutarla yeniden yüklenebilir |
| Açık fatura | Cari ekstresinde **Ters çevir**; bağlı ödeme planı da iptal olur. Plan ödenmişse önce ödeme ters çevrilir |
| Açılış stoğu | **Depo > Hareketler**'de girişi ters çevirin |

## Kontrol listesi

Geçiş günü eski sistemle karşılaştırın:

- [ ] **Finans > Raporlar > Yaşlandırma**: müşteri ve tedarikçi toplamları eski sistemin cari bakiye raporuyla aynı.
- [ ] Döviz carilerinde döviz bakiyeleri aynı (TL karşılığı kur farkıyla değişebilir).
- [ ] **Raporlar > Nakit öngörüsü**: tahsilat vadeleri eski sistemdeki vade listesiyle uyumlu.
- [ ] **Finans > Ödeme Planı**: açık tedarikçi faturaları taslak plan olarak listede; onaya gönderilebilir.
- [ ] **Banka ve Kasa**: hesap bakiyeleri banka ekstreleriyle aynı.
- [ ] **Depo > Stok**: müşteri bazında miktarlar eski sistemin stok raporuyla aynı.
- [ ] Filoda belge bitiş tarihleri doğru; süresi geçmiş belge uyarısı beklenenlerle sınırlı.
