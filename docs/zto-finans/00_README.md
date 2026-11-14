# ZTO Fabrika Finans → Blackrose: Devir Notu

Bu klasör, ZTO Fabrika (`.NET 8 MVC` ERP) finans modülünün Blackrose'a eklenmesi için yapılan analizi ve kararları içerir. Uygulama planı: [`../fazlar/FAZ_12_ZTO_Finans_Eklemeleri.md`](../fazlar/FAZ_12_ZTO_Finans_Eklemeleri.md).

## Kısa geçmiş

| Tarih | Olay |
|---|---|
| 2026-11-04 | `NakliyeLojistik_SaaS_Promptlar` dokümanları yazıldı (Spring Boot + React, "ZTO referanstır, kod kopyalanmaz"). Blackrose bu dokümanlarla Faz 0–7'yi bitirdi. |
| 2026-11-11 | ZTO Fabrika reposunda ayrı bir prompt (`ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md`) hazırlandı: K1 ".NET 8 MVC", K2 "finans kodunu kopyala". Faz 0 analizi (envanter, bağımlılık grafiği, boşluk analizi) bu prompta göre yapıldı. |
| 2026-11-12 | Hedefin bu repo (Java/React) olduğu anlaşıldı. Kullanıcı kararları: **Java'da kalınır, eksikler eklenir; ZTO ekranları birebir görünümle React'te yazılır; ZTO CSS kapsamlı kopyalanır; tek finans motoru Blackrose.** K1/K2 iptal. Faz 1 karar matrisi yazıldı, iş kuralı kararları alındı. |
| 2026-11-13 | Kapsam taraması (Faz 0 envanter promptları A/B/C + ana prompt §4.1): eşlenmemiş sayfalar ve yeni gereksinim (2–3 şirket adına işlem, personel/maaş) için MX5–MX9 yazıldı; Faz 12'ye 12.1a, 12.2a, 12.9, 12.10, 12.11 eklendi. |
| 2026-11-13 | Analiz bu repoya aktarıldı; Faz 12 açıldı. JDK 21, Maven 3.9.16, Docker Desktop kuruldu (Docker için yeniden başlatma bekleniyor). |
| 2026-11-13 | 12.0 (ön yüz altyapısı) ve **12.1a (iş yeri / şube / çoklu şirket)** tamamlandı. 12.1a uygulama belgesi [`uygulama/12.1a_TASARIM.md`](uygulama/12.1a_TASARIM.md) (MX5'i düzelten tek yetkili belge); kullanıcı kararları K-1…K-5; durum ve kalanlar FAZ_12 "Uygulama Notu 12.1a". Sırada 12.1 (cari). |
| 2026-11-14 | **12.1 (cari)** tamamlandı: cari profili/limit/alt grup, cari IBAN'ları, Borç/Alacak belgesi, sezon devri, cari taşıma (bağlı tüm çek/senetlerle), şirket kırılımlı bakiye/ekstre; ZTO Cari Kartlar, Cari Hareketler, Günlük Tüm Cari İşlemleri, Ekstre, Banka Hesapları ekranları ve Hızlı Cari İşlemi; 12.1a K-1 LIMITED kapsam sertleştirmesi. Uygulama belgesi [`uygulama/12.1_TASARIM.md`](uygulama/12.1_TASARIM.md) (MX1, MX8 §3'ü düzeltir); otonom kararlar (kullanıcı onayına açık) belge §9; durum FAZ_12 "Uygulama Notu 12.1". Sırada 12.2 (banka/kasa). |

## Okuma sırası

1. [`analiz/04_UYARLAMA_KARAR_MATRISI.md`](analiz/04_UYARLAMA_KARAR_MATRISI.md) — **yetkili belge.** §0 kararlar, §1 tek motor ilkesi, §2 ön yüz mimarisi, §3 sayfa kararları (§3.3 2026-11-13 eklemeleri), §4 migration sırası (Z-kimlikleri), §6.1 iş kuralı kararları, §6.2 bekleyen kararlar, §7 taşınmayacak ZTO hataları, §9 adımlar.
2. [`analiz/matris/`](analiz/matris/) — uygularken açılacak ayrıntı: her modalın alanları, doğrulamaları, ZTO uçları (dosya:satır), Blackrose eşlemesi.
   - `MX1_cari_rapor_bilanco.md` — CustomerAccounts, AccountTransaction, raporlar, bilanço (46 modal)
   - `MX2_banka_kasa_mevduat.md` — banka/kasa tanımı ve hareketleri, transfer merkezi, vadeli mevduat, alış carisi (36 modal)
   - `MX3_cek_senet_kredi_odeme_onayi.md` — çek, senet, koçan, kredi sözleşmeleri, ödeme onayı (~52 modal)
   - `MX4_masraf_ve_ui_kabugu.md` — masraf ekranları + **ZTO CSS/JS kabuğu ve kapsamlama tekniği** (12.0'dan önce okunmalı)
   - `MX5_isyeri_sube_coklu_sirket.md` — il/şube, iş yeri, şube gruplu seçim, **çoklu şirket tasarımı** (12.1a)
   - `MX6_personel_bordro.md` — personel modülü (11 ekran), bordro hesabının hataları ve yasal yeniden tasarımı, KVKK (12.9)
   - `MX7_odeme_tahsilat_onay.md` — Ödemeler, Tahsilatlar, günlük raporlar, ortak modallar, PaymentApproval/Index, KrediBankaCari betiği (12.2a, 12.4)
   - `MX8_kalan_finans_sayfalari.md` — SalesTruckExpenses, MaterialStockAll, BankAccounts, Finance*, AmountType, kapsanmayan controller listesi
   - `MX9_entegrasyon_edonusum_dil.md` — ZTO Fabrika ↔ Blackrose entegrasyonu, Uyumsoft e-Dönüşüm, lokalizasyon, arka plan işleri (12.10, 12.11)
3. [`analiz/01_FINANS_ENVANTER.md`](analiz/01_FINANS_ENVANTER.md) — ZTO finansının tablo/sayfa/servis envanteri; §8 ZTO'nun kendi içindeki 9 tutarsızlık.
4. [`analiz/02_BAGIMLILIK_GRAFIGI.md`](analiz/02_BAGIMLILIK_GRAFIGI.md) — Mermaid diyagramları.
5. [`analiz/03_MEVCUT_DOKUMAN_BOSLUK_ANALIZI.md`](analiz/03_MEVCUT_DOKUMAN_BOSLUK_ANALIZI.md) — planlama dokümanlarının ZTO ile karşılaştırması (K1/K2'ye dayalı bölümleri geçersiz; ZTO bulguları geçerli).
6. [`analiz/envanter/`](analiz/envanter/) — 01'in ham parçaları (A–F).

01–03'ün başındaki "LogisticErp notu" hangi kısımların geçersiz olduğunu söyler.

## ZTO kaynağı

- Yol: `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` — **salt okunur**, bu çalışmada değiştirilmez.
- Tüm `Controllers/…:satır`, `Views/…:satır` referansları bu kaynağa göredir.
- Gizli değer yok: ZTO bağlantı dizgileri belgelerde `__PLACEHOLDER__` olarak geçer.

## Kalan işler

`docs/03_YAPILACAKLAR_BACKLOG.md` → **EPİK M** (M0–M8) ve `FAZ_12` kabul kriterleri.
