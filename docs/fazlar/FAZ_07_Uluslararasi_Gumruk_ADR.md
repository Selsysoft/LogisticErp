# FAZ 7 — Uluslararası Taşıma: Gümrük / Transit / ADR

> **Uygulama Notu (2026-11-05) — Durum: Kriterler karşılandı.**
>
> **Yapılanlar:** Gümrük beyanı ve satırları, T1/T2/TIR takibi, ADR belge kontrolü, UN numarası, geçiş izinleri ve kotası, sınır geçişleri,
> üç dilli CMR ve bunların React ekranları.
>
> **Doğrulama:** GitHub Actions CI (`42001950924`) yeşil: Java 21 ile 18 birim + 116 entegrasyon testi, Spotless, container imajı; frontend lint, format, 19 test ve build. Tarayıcıda
> ADR uyarısının atama listesinde görünmesi, uluslararası bilgi özeti, beyan açma, satır ekleme, tescil, süresi geçmiş transit,
> izin kotası ve sınır geçişi listeleri denendi. Transit, izin ve geçiş kayıtları API ile girildi; bunların formları, uluslararası
> bilgi formu, taşeron uyarısı ve CMR PDF indirme tarayıcıda denenmedi. CMR PDF içeriği entegrasyon testinde doğrulandı.
>
> **Kararlar:** Gümrük kayıtları belge kaydıdır; BİLGE ve NCTS bağlantısı Faz 8'de.
>
> **Sapmalar ve varsayımlar:**
> - ADR: Yükte ADR sınıfı varsa araç, dorse ve sürücüde geçerli ADR belgesi aranır. Eksikse firma ayarına göre engeller veya uyarır.
>   Taşeron için belge tutulmadığından yalnız uyarı verilir. Sınıfa veya miktara göre muafiyet ve araç tipi kuralı yoktur.
> - Güvenlik bilgi formu ayrı alan değildir; sefere dosya olarak eklenir.
> - Transit süresi yalnız ekranda "süresi geçti" olarak işaretlenir; e-posta/SMS hatırlatması yok. Açık transit seferin kapanmasını
>   engellemez. Teminat tutarı finansa yazılmaz.
> - Beyan kıymeti gümrük vergisi hesaplamaz; vergi ve masraf yok. Depodaki antrepo çıkışı beyana bağlanmaz, numara olarak girilir.
> - İzin kotası sefer başınadır; iptal edilen seferin kullanımı kotadan düşer. Tek izin birden çok ülke için tutulmaz.
> - Sınır ücreti sefer gideridir ve kapanışta cariye yazılır. Kapanmış seferin geçişi silinemez.
> - CMR, ülkeler farklıysa Türkçe, İngilizce ve Almanca üretilir. Kutu numaraları yalnız dolu alanlar için vardır, resmi matbu formun
>   yerine geçmez; Konvansiyon metni ve form hukukçu veya gümrük müşaviri tarafından doğrulanmalıdır. Yayımlanmış CMR değişmez.
> - GTİP biçimi, ülke kodu listesi ve gümrük idaresi kodu doğrulanmaz.

**Amaç:** Uluslararası karayolu taşımacılığı belge ve süreçleri: gümrük beyanı, transit (T1/T2),
sınır/geçiş belgeleri, ADR (tehlikeli madde) ve uluslararası CMR genişletmeleri.

**Bağımlılık:** Faz 4 (sevkiyat/CMR). **Çıktı:** Uluslararası sefer uyumluluğu.

---

## Kapsam / Görevler
1. **Gümrük Beyanı (CustomsDeclaration):** ihracat/ithalat/transit; GTIP, kıymet, gümrük idaresi,
   durum; belge ekleri.
2. **Transit (T1/T2) & TIR Karnesi:** transit belge numarası, teminat, varış gümrüğü, süre takibi.
3. **ADR:** yük ADR sınıfı/UN no, araç/sürücü ADR uygunluğu kontrolü, güvenlik bilgi formu.
4. **Sınır/Geçiş & Ücretler:** sınır kapıları, geçiş ücretleri, uluslararası izin belgeleri (ikili/çok
   taraflı kota), dolum/geçiş kaydı → gidere.
5. **Uluslararası CMR:** çok dilli alanlar, konvansiyon maddeleri, sorumluluk sigortası bağı.

## Kabul Kriterleri
- [x] Uluslararası sefere gümrük beyanı + transit belgesi bağlanır, süre/teminat takip edilir.
- [x] ADR'li yükte araç/sürücü ADR uygunluğu kontrol edilir (uygunsuzda uyarı/engel).
- [x] Sınır geçiş ücretleri sefer giderine ve finansa yansır.
- [x] Uluslararası CMR doğru alanlarla (çok dilli) üretilir.

## ERP Referansı
`CustomerCMR3Controller`, `CustomerCMR13Controller` (uluslararası belge temeli). Gümrük/transit yeni
alan; ERP'de doğrudan karşılığı yok, sıfırdan tasarlanır.

## Açık Sorular
- ~~BİLGE/NCTS entegrasyonu MVP hedefinde mi?~~ Karar: Belge kaydı önce; entegrasyon Faz 8.
