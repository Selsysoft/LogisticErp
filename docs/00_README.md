# Nakliye & Lojistik ERP/CRM SaaS — Prompt & Yol Haritası Dokümanları

Bu klasör, mevcut **ZTO Fabrika** (.NET Core 8 MVC, yaş meyve/sebze ERP) projesindeki **finans ve
"Muhasebe (Alış)" rolüne ait işlevlerin**, bir **nakliye & lojistik firması** için özelleştirilerek
sıfırdan bir **ERP + CRM SaaS platformuna** dönüştürülmesi için hazırlanmış **prompt, yapılacaklar
listesi ve faz dokümanlarını** içerir.

> **Bu klasörde kod yoktur ve mevcut projede değişiklik yapılmamıştır.** Yalnızca bir AI kodlama
> ajanının adım adım uygulayacağı dokümanlar vardır.

## Kesinleşen kararlar (kullanıcı onaylı)
- **Teknoloji:** Spring Boot (Java) REST API + React (TypeScript) + PostgreSQL.
- **MVP kapsamı:** Finans çekirdeği (uyarlama) + Sevkiyat/Yük + CMR/İrsaliye + Filo/Sürücü +
  CRM/Fiyatlandırma-Teklif.
- **Faaliyet:** Yurt içi ağırlıklı + Uluslararası taşıma + 3PL/depo-antrepo.
- **Doküman:** Türkçe, AI kodlama ajanı için (faz faz, net kabul kriterli).
- **Navlun faturası:** Faz 4 kapsamında; gelir, fatura kesilince cariye yazılır.
- **Tenant çözümleme:** Subdomain ve JWT claim desteklenir, subdomain önceliklidir.
- **Uygulama sırası:** 0 → 1 → 2 → 3 → 5A → 4 + 5B → 6 → 7 → 8 → 9 → 11 → 10 (ayrıntı: `01_ANA_PROMPT.md` §7).

## İşletim belgeleri
- `GECIS_REHBERI.md` — önceki sistemden geçiş: sıra, içe aktarma dosyaları (`ornekler/`), kontrol listesi.
- `URETIM_KURULUM.md` — üretim ayarları, e-posta/dosya/tarama, izleme, hazır olma denetimi.
- `YEREL_CALISTIRMA.md` — geliştirme ortamı ve testler.
- `GUVENLIK_GOZDEN_GECIRME.md`, `KVKK_VERI_ISLEME_KAYDI.md` — güvenlik ve kişisel veri kayıtları.

## Klasör yapısı
```
NakliyeLojistik_SaaS_Promptlar/
├─ 00_README.md                     ← bu dosya (genel bakış, nasıl kullanılır)
├─ 01_ANA_PROMPT.md                 ← tek yetkili referans: vizyon, mimari, kurallar, AI talimatları
├─ 02_MIMARI_ve_VERI_MODELI.md      ← mimari, çok kiracılık, veri modeli, ERP→yeni eşleme tablosu
├─ 03_YAPILACAKLAR_BACKLOG.md       ← epik→görev, öncelik (P0/P1/P2), ilerleme işaretleri
└─ fazlar/
   ├─ FAZ_00_Altyapi_ve_CokKiracilik.md
   ├─ FAZ_01_Kimlik_Rol_Yetki.md
   ├─ FAZ_02_Finans_Cekirdek.md
   ├─ FAZ_03_CRM_Fiyatlandirma_Teklif.md
   ├─ FAZ_04_Sevkiyat_Yuk_CMR_Irsaliye.md
   ├─ FAZ_05_Filo_Surucu.md
   ├─ FAZ_06_Depo_3PL_Antrepo.md
   ├─ FAZ_07_Uluslararasi_Gumruk_ADR.md
   ├─ FAZ_08_Entegrasyonlar.md
   ├─ FAZ_09_Raporlama_BI_Dashboard.md
   ├─ FAZ_10_Mobil_Surucu_POD.md
   └─ FAZ_11_SaaS_Operasyon_Lisans_Faturalama.md
```

## Nasıl kullanılır (önerilen akış)
1. **01_ANA_PROMPT.md**'yi oku — tüm projenin anayasası. (AI ajanına ilk bunu ver.)
2. **02_MIMARI_ve_VERI_MODELI.md** ile teknik iskeleti ve ERP eşlemesini kavra.
3. **03_YAPILACAKLAR_BACKLOG.md**'den fazların kapsamını gör.
4. `01_ANA_PROMPT.md` §7'deki sırayı izle. Her faz: Amaç, Kapsam/Görevler, İş Kuralları,
   **Kabul Kriterleri**, ERP Referansı, Açık Sorular içerir. Kabul kriterleri sağlanmadan faz kapanmaz.
5. MVP = **Faz 0–5**. Sonrası 6–11.

## Yol haritası (özet)
| Faz | Modül | Öncelik |
|---|---|---|
| 0 | Altyapı & Çok Kiracılık | P0 (MVP) |
| 1 | Kimlik, Rol, Yetki | P0 (MVP) |
| 2 | Finans Çekirdeği | P0 (MVP) |
| 3 | CRM + Fiyatlandırma/Teklif | P0 (MVP) |
| 4 | Sevkiyat/Sefer + CMR + İrsaliye + POD | P0 (MVP) |
| 5 | Filo + Sürücü | P0 (MVP) |
| 6 | Depo / 3PL / Antrepo | P1 |
| 7 | Uluslararası / Gümrük / ADR | P1 |
| 8 | Entegrasyonlar (GİB, HGS, GPS, Banka…) | P1 |
| 9 | Raporlama / BI / Dashboard | P1 |
| 10 | Mobil Sürücü / POD | P2 |
| 11 | SaaS Operasyon / Abonelik / İzleme | P1 |

## Açık karar bekleyen başlıklar (dokümanlarda "Açık Sorular" olarak işaretli)
Fazlar boyunca kararını beklediğim konular (özet):
e-dönüşüm entegratörü ve GPS sağlayıcı seçimi, ödeme sağlayıcısı (SaaS faturalama), tarife birincil
boyutu (km/güzergâh), muhasebe fişi/çift kayıt kapsamı, mobil native/PWA, self-servis kayıt. Bunlar
geldikçe ilgili faz dosyaları güncellenecek.

---
*Hazırlayan: mevcut ERP'nin tam analizi üzerinden türetilmiştir. Mevcut projede hiçbir kod
değiştirilmemiştir.*
