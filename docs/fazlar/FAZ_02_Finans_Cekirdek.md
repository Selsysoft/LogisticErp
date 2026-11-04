# FAZ 2 — Finans Çekirdeği (ERP'den en yoğun devralınan modül)

> **Uygulama Notu (2026-11-05) — Durum: kabul kriterleri karşılandı**
>
> **Yapılanlar:** Cari (çok döviz, TL karşılığı, ekstre), banka ve kasa (hareket, transfer, ekstre), çek/senet yaşam döngüsü,
> ödeme ve tahsilat, tedarikçi faturası, ödeme planı ve onayı, ısı haritası, yoğunluk eşikleri, özet ekranı, günlük rapor,
> yaşlandırma, gider tanımları, TCMB kuru ve bunların React ekranları.
>
> **Doğrulama:** GitHub Actions CI (`41927991632`) yeşil: Java 21 ile 13 birim + 58 entegrasyon testi, Spotless, container imajı;
> frontend lint, format, 14 test ve build. Tarayıcıda fatura → onaya gönderme → onay → banka ödemesi akışı,
> onay yetkisi farkı, bakiyeler, ısı haritası ve kur listesi denendi; TCMB'den gerçek kur çekildi. Çek/senet, transfer,
> tahsilat ve rapor ekranları tarayıcıda denenmedi; arka planları entegrasyon testlidir.
>
> **Kararlar:** Muhasebe fişi yok. Kur farkı kaydı yok; hareketin TL karşılığı işlem gününde sabitlenir.
>
> **Sapmalar ve varsayımlar:**
> - Banka ve kasa tek modelde (`FundAccount`), ödeme ve tahsilat tek modelde (`Settlement`) tutulur; kuralları aynıdır.
> - Kur olarak TCMB döviz alış kullanılır (varsayım, mali müşavirle doğrulanmalı). Kur yoksa son bilinen kur, hiç yoksa elle kur istenir.
> - Transfer yalnız aynı para birimli hesaplar arasındadır.
> - Çekli ödeme/tahsilat ve plana bağlı ödeme ters çevrilemez. Çek, kendi durumuyla (ör. karşılıksız) yönetilir.
> - Plan dışı doğrudan ödeme mümkündür; onay zorunluluğu yalnız plan üzerinden ödemeler içindir.
> - Kullanıcının kendi planını onaylaması firma ayarıdır (Tanımlar sekmesi); varsayılan açık, çünkü küçük firmada tek yönetici olabilir.
> - Karşılıksız çekin cari hareketi, karşılıksız gününün kuruyla yazılır.
> - Yaşlandırma işlem tarihine göredir ve en eski açık kalemden kapatır; hareketler bellekte işlendiği için büyük veride Faz 9'da iyileştirilmeli.
> - 3B çek koçanı görünümü (opsiyonel) yapılmadı.

**Amaç:** Cari hesap, banka, kasa, çek/senet, ödeme/tahsilat, ödeme planlama + onay, çok döviz ve
temel finans raporları. Bu modül platformun **finans belkemiği**; operasyon (sefer) buraya akar.

**Bağımlılık:** Faz 0, 1. | **Çıktı:** Tam işlevli finans modülü; operasyonsuz bile tek başına değerli.

---

## Kapsam / Görevler

### 2.1 Para birimi & kur
- `Currency`, `ExchangeRate` (tarih bazlı). **TCMB kur** çekme servisi (günlük, önbellekli,
  başarısızlıkta negatif önbellek — ERP dersi). Tüm tutarlar `Money`.

### 2.2 Cari Hesap (Current Account)
- `Account` (müşteri/taşeron/tedarikçi/personel-sürücü/banka tipi), `AccountTransaction` (borç/alacak, döviz, şube).
- Yön ve TL karşılığı kuralları `01_ANA_PROMPT.md` §4.5'e uyar. Bakiye hesaplama (döviz bazlı + TL karşılığı), hareket listesi, şube/iş yeri kırılımı.
- Hesap ekstresi, dönem bakiyesi. **Performans:** sayfalama + sunucu-taraflı filtre; ağır listede
  tek-sorgu-tarama ve önbellek (ERP CustomerAccounts perf dersleri).

### 2.3 Banka & Kasa
- `Bank`, `BankAccount` (şube, döviz, IBAN), `BankTransaction` (giriş/çıkış, bakiye, ekstre, aktivite
  raporu). `Cash`, `CashTransaction` (aynı mantık).
- Banka→kasa, kasa→banka, hesaplar arası transfer.

### 2.4 Çek / Senet
- `Check`/`PromissoryNote` izinli geçişleri (tablo dışındaki her geçiş reddedilir):

  | Tür | Durumdan | Duruma |
  |---|---|---|
  | Alınan | Portföy | Tahsilde, Ciro edildi, Kasaya tahsil |
  | Alınan | Tahsilde | Tahsil edildi, Karşılıksız, Portföy (iade) |
  | Alınan | Ciro edildi | Karşılıksız |
  | Verilen (kendi çekimiz) | Verildi | Ödendi, Karşılıksız |

- Hareket geçmişi, çek koçanı görünümü (ERP 3B koçan deseni UI'da opsiyonel).
- Çek-ödeme eşleştirme (bir ödeme/tahsilat ile çeki ilişkilendir).

### 2.5 Ödeme / Tahsilat
- **Ödeme** (tedarikçi/taşeron/masraf): nakit/banka/çek; şube+döviz; günlük ödeme raporu
  (şube bazlı çoklu iş yeri seçimi — ERP'deki olgun UX).
- **Tahsilat** (müşteri navlun): nakit/banka/çek; müşteri bakiye/kredi özeti; günlük tahsilat raporu.

### 2.5.1 Tedarikçi/Taşeron Faturası
- `PurchaseInvoice`: gelen fatura kaydı (cari, şube, tutar, KDV, döviz, vade). Kayıt, tedarikçi carisine ALACAK yazar
  ve ödeme planı taslağı oluşturur. Resmi e-belge alımı Faz 8'dedir.

### 2.6 Ödeme Planlama + Onay + Nakit Akış
- `PaymentPlan` (vade, tutar, döviz, cari, şube), onay akışı (taslak→onaya gönder→onay/ret→öde),
  erteleme, **nakit akış ısı haritası** (dönem/ay bazlı yoğunluk), döviz **yoğunluk eşikleri**
  (az/orta/yoğun/çok yoğun) — ERP birebir karşılığı.
- Dashboard: yaklaşan ödemeler, vadesi geçen, günlük/haftalık nakit ihtiyacı.

### 2.7 Masraf/Gider tipleri
- `ExpenseType`/`ExpenseItem` (yakıt, HGS/OGS, harcırah, tamir, ceza, sigorta, lastik…) — sefer/araç
  giderlerinde ve finans ödemelerinde kullanılır.

### 2.8 Raporlar
- Cari ekstre, banka/kasa ekstre, çek/senet durum, ödeme/tahsilat günlük, açık bakiye yaşlandırma.

## İş Kuralları (örnek — ERP'den uyarlanmış)
- Negatif/çift kayıt koruması; silme yerine soft-delete + ters hareket.
- Çek durum geçişleri yalnız izinli yönlerde (portföyden ödendiye doğrudan geçilemez vb.).
- Ödeme planı onaysız ödenemez; onay eşikleri role/izne bağlı.
- Kur yoksa işlem o günün son bilinen kuruyla, eksikse uyarı.

## Kabul Kriterleri

- [x] Cari hesaba borç + alacak işlendiğinde bakiye doğru (çok döviz + TL karşılığı) hesaplanır.
- [x] Banka ve kasa transferi iki hesapta tutarlı (toplam korunur) — test.
- [x] Çek/senet yalnız §2.4 tablosundaki geçişlerle ilerler; `Tahsil edildi → Ciro edildi` gibi geçişler reddedilir — test.
- [x] Ödeme/tahsilat kaydı ilgili cari + banka/kasa bakiyesini günceller.
- [x] Ödeme planı onay akışı: onaysız ödeme engellenir; onaylıda ödeme cariyi ve planı kapatır.
- [x] Nakit akış ısı haritası ve yoğunluk eşikleri doğru gruplar.
- [x] Günlük ödeme/tahsilat raporu şube-bazlı çoklu seçimle filtrelenir.
- [x] **Uçtan uca senaryo:** Tedarikçi faturası → ödeme planı → onay → banka ödemesi → cari kapandı →
      bakiye 0, banka bakiyesi düştü — tek testte doğrulanır.

## ERP Referansı
`CustomerAccountsController` (cari + ödeme planlama + heatmap + approval + density), `AccountTransactionController`,
`CustomerAccountPaymentController`, `CustomerAccountCollectionController`, `BankTransactionsController`,
`BankAccountsController`, `CashTransactionsController`, `ChecksController`, `Models/ZT/*`
(CustomerAccount, AccountDebts, AccountCredits, BankTransactions, CashTransactions, PaymentPlan,
PaymentDensityCurrencies). TCMB kur: ERP `GetExchangeRates` tek-uçuş + negatif önbellek deseni.

## Açık Sorular
- ~~Muhasebe fişi/çift taraflı kayıt MVP'de mi?~~ Karar: Hayır; resmi muhasebe entegrasyonu Faz 8.
- KDV/tevkifat oranları ve hesapları: oranlar kodda sabit tutulmaz, tenant ayar tablosundan gelir. Değerler mali
  müşavirle doğrulanacak.
- Kur farkı nasıl işlenecek? (Hareketin TL karşılığı sabit; kur farkı kaydı için mali müşavir görüşü gerekir.)
