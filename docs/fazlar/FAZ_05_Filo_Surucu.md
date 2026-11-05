# FAZ 5 — Filo ve Sürücü Yönetimi

> **Uygulama Notu (2026-11-05) — Durum: Faz 5A kriterleri yerelde karşılandı, CI bekliyor. Faz 5B açık.**
>
> **Yapılanlar (5A):** Araç ve dorse kütüğü, sürücü kütüğü ve personel carisi, belgeler, hatırlatmalar, takvim kapatmaları,
> bakım/onarım/lastik/yakıt giderinin finansa yazılması, yakıt tüketimi ve anomali, araç maliyet raporu, uygun kaynak sorgusu,
> filo ayarları ve bunların React ekranları.
>
> **Doğrulama:** `mvn verify` 14 birim + 87 entegrasyon testiyle geçti (yerelde Java 17). Java 21 ile yalnız derleme
> doğrulandı. Frontend lint, 14 test ve build geçti. Tarayıcıda hatırlatmalar, uygunluk, yakıt gideri girişi ve tedarikçi
> carisine yansıması denendi. Araç/sürücü formları, belge ve kapatma ekleme, dosya yükleme, tüketim ve rapor ekranları
> tarayıcıda denenmedi; arka planları entegrasyon testlidir.
>
> **Kararlar:** Tahograf ve sürüş-dinlenme mevzuat denetimi bu fazda yok. Belgesi dolmuş kaynak varsayılan olarak engellenir,
> firma ayarıyla uyarıya çevrilir. Hatırlatmalar şimdilik uygulama içi listedir; e-posta/SMS sağlayıcı seçilince eklenecek.
>
> **Sapmalar ve varsayımlar:**
> - Çekici, kamyon, kamyonet ve dorse tek tabloda (`Vehicle`); bakım, onarım, lastik ve yakıt tek tabloda (`VehicleExpense`).
> - Periyodik bakım planı, son bakım kaydındaki sonraki tarih ve km'den ibarettir; km hatırlatması son 1.000 km'de başlar.
> - Atama için zorunlu belgeler varsayımdır: araçta muayene ve trafik sigortası, sürücüde ehliyet, SRC ve psikoteknik. Eksik
>   belge de süresi dolmuş gibi işlem görür.
> - Tüketim, her alımda depo doldurulduğu varsayımıyla hesaplanır; ortalamanın %25 üstü olağan dışı sayılır.
> - Gider ya tedarikçi carisine ya banka/kasaya yazılır. Maliyet raporu kayıtta sabitlenen TL karşılığını toplar.
> - Kişisel veri olarak T.C. kimlik no tutulmaz. Sürücü verisinin saklama süresi ve aydınlatma metni KVKK kapsamında belirlenmeli.
>
> **Faz 5B ile gelecek:** Sefer ataması, çakışma kontrolü, harcırah/avans ve dispatch entegrasyonu.

**Amaç:** Araç/çekici/dorse envanteri, bakım-muayene-sigorta-lastik-yakıt takibi; sürücü ve
belgeleri; atama ve harcırah. Giderler finansa, müsaitlik/belge dispatch'e beslenir.

**Bağımlılık:** Faz 2 (gider→finans), Faz 1, X2 (hatırlatma). **Faz 5A** (görev 1–6, 8) Faz 4'ten önce; **Faz 5B**
(görev 7 ve dispatch entegrasyonu) Faz 4 ile birlikte yapılır. | **Çıktı:** Filo+sürücü kütüğü ve
operasyona hazır müsaitlik/belge verisi.

---

## Kapsam / Görevler

1. **Araç/Çekici & Dorse:** `Vehicle`, `Trailer` — plaka, tip, kapasite (ton/m³/palet), yakıt tipi,
   sahiplik (öz mal/kiralık/taşeron), durum (aktif/bakımda/hariç).
2. **Belge & Hatırlatma:** muayene, zorunlu/kasko sigorta, K/U-ETT belgesi, egzoz, ADR; bitiş
   tarihleri + **otomatik hatırlatma/uyarı** (süresi dolan belge → uyarı + atama engeli opsiyonu).
3. **Bakım/Onarım:** periyodik bakım planı, arıza/onarım kaydı, maliyet → gider/finans.
4. **Lastik:** takım/konum, km, değişim; maliyet.
5. **Yakıt:** `FuelLog` (litre, tutar, km, istasyon/kart) → tüketim (L/100km) + gider. Yakıt kartı
   entegrasyon kancası (Faz 8).
6. **Sürücü:** `Driver` — kişi, ehliyet sınıfı/bitiş, SRC, psikoteknik, ADR sertifikası, sağlık,
   durum; belge hatırlatma.
7. **Atama & Harcırah:** `DriverAssignment` (sürücü↔araç↔sefer), çalışma/dinlenme süresi (tahograf
   opsiyonel), **harcırah/avans** hesabı → finansa (sürücü carisi/masraf).
8. **Müsaitlik:** araç/sürücü takvimi; dispatch'e "uygun kaynak" sorgusu.

## İş Kuralları
- Belgesi dolmuş araç/sürücü için atama uyarısı/engeli (tenant ayarı).
- Yakıt tüketim anomali uyarısı (ortalamanın çok üstü).
- Harcırah onay akışı (opsiyonel, finans onayına bağlanabilir).

## Kabul Kriterleri
- [x] Araç/dorse/sürücü CRUD + belge bitiş tarihleri ve hatırlatma listesi çalışır.
- [ ] (5B) Belgesi geçersiz kaynak dispatch'te uyarı/engel üretir (Faz 4 ile entegre).
- [x] Bakım/lastik/yakıt kaydı ilgili gideri finansa (araç maliyetine) yazar.
- [x] Yakıt tüketimi (L/100km) ve araç başına maliyet raporlanır.
- [ ] (5B) Sürücü ataması çakışma kontrollü; harcırah sürücü carisine ALACAK olarak düşer.

## ERP Referansı
Araç/tedarikçi/şoför kütükleri: `SupplierTruckController`, `SupplierChauffeurController`,
`ExpertReportTruck*` modelleri (araç + barkod + masraf + finans). Bakım/gider deseni için
`ProductionExpenses`/`ExpenseTypes`.

## Açık Sorular
- ~~Tahograf/sürüş-dinlenme mevzuat takibi MVP'de mi?~~ Karar: Mevzuat denetimi sonraki fazda.
- Araç kiralama/taşeron araç maliyet modeli (günlük/km/sefer) nasıl? (Faz 3 tarife ile hizalanır.)
