# 03 — Yapılacaklar / Backlog (Epik → Görev)

Öncelik: **P0** = MVP zorunlu, **P1** = MVP sonrası yakın, **P2** = sonraki. Durum: ⬜ açık /
🟦 devam / ✅ bitti. Ajan ilerledikçe işaretler.

Uygulama sırası: 0 → 1 → 2 → 3 → 5A → 4 + 5B → 6 → 7 → 8 → 9 → 11 → 10. Faz 12 (ZTO finans eklemeleri, 2026-11-12'de eklendi) Faz 0–7 tamam olduğu için bağımsız ilerler.

---

## EPİK A — Altyapı & Çok Kiracılık (Faz 0) — P0
- ✅ A1 Monorepo + Spring Boot + React iskelet, kod stili/CI
- ✅ A2 PostgreSQL + Flyway (admin + tenant şema yolları)
- ✅ A3 Şema-başına-tenant çözümleme (subdomain; JWT claim Faz 1'de) + TenantContext
- ✅ A4 Yeni tenant sağlama servisi (şema + migration)
- ✅ A5 `common`: Money, audit tabanı, hata gövdesi, sayfalama, traceId
- ✅ A6 Actuator health/metrics, JSON log, Testcontainers test altyapısı

## EPİK B — Kimlik & Yetki (Faz 1) — P0
- ✅ B1 User/Role/Permission modeli + tohum roller
- ✅ B2 JWT erişim+refresh, parola, (ops.) 2FA + JWT tenant claim ve subdomain çakışma kontrolü
- ✅ B3 `@PreAuthorize` izin koruması + izin matrisi
- ✅ B4 Rol-bazlı açılış + React route guard
- ✅ B5 AuditLog (giriş/çıkış/yetki reddi)
- ✅ B6 Kullanıcı yönetimi UI

## EPİK C — Finans Çekirdeği (Faz 2) — P0
- ✅ C1 Currency + ExchangeRate + TCMB kur servisi
- ✅ C2 Cari hesap + hareket + bakiye (çok döviz, şube kırılımı) + ekstre
- ✅ C3 Banka/BankAccount/BankTransaction + transfer + ekstre
- ✅ C4 Kasa/CashTransaction
- ✅ C5 Çek/Senet + durum makinesi + hareket + eşleştirme
- ✅ C6 Ödeme + günlük ödeme raporu (şube-gruplu çoklu seçim)
- ✅ C7 Tahsilat + günlük tahsilat raporu + müşteri kredi özeti
- ✅ C8 Ödeme planlama + onay akışı + ısı haritası + döviz yoğunluk eşikleri + dashboard
- ✅ C9 ExpenseType/ExpenseItem
- ✅ C10 Finans raporları (ekstre, yaşlandırma, günlük)
- ✅ C11 **Uçtan uca finans senaryo testi**
- ✅ C12 (P1) ERP'den açılış bakiyesi import aracı — Finans > Cari'de CSV ile önizleme ve ya-hep-ya-hiç içe aktarma; yeni cari açar, mevcut cariyle kodla eşleşir, dövizli satırda kur, mükerrer açılışı engeller, belirsiz tutarı (1.500) reddeder; açılış hareketi ekstreden ters çevrilir
- ✅ C12b Önceki sistemden açık faturaları içe aktarma — müşteri faturası nakit öngörüsüne vadesiyle, tedarikçi/taşeron faturası taslak ödeme planına girer; cariye belge tarihiyle yazılır (yaşlandırma doğru); kendi numaralandırmamıza ve gelir raporlarına girmez; aynı caride açılış bakiyesiyle birlikte yüklenemez; ekstreden geri alınır (ödenmiş plan hariç). Varsayım: muhasebe görüşüyle doğrulanmalı
- ✅ C13 PurchaseInvoice (tedarikçi/taşeron faturası) → cari + ödeme planı
- ⬜ C14 (P2) Kredi/finansman modülü — Faz 12'ye atandı (M5)

## EPİK D — CRM + Fiyatlandırma (Faz 3) — P0
- ✅ D1 Account (CRM görünümü) + Contact + segment/etiket
- ✅ D2 Fırsat/huni + aktivite/hatırlatma
- ✅ D3 Teklif (versiyon, PDF, gönderim, dönüşüm)
- ✅ D4 Sözleşme
- ✅ D5 Tarife + fiyat motoru (güzergâh/km/ton/araç + yakıt ek + KDV/tevkifat)
- ✅ D6 CRM dashboard

## EPİK E — Sevkiyat/Sefer + CMR + İrsaliye + POD (Faz 4) — P0
- ✅ E1 Taşıma emri + durum makinesi
- ✅ E2 Bacak/etap + taşeron atama
- ✅ E3 Dispatch (atama, çakışma, müsaitlik, belge kontrolü, board)
- ✅ E4 CMR üretimi (PDF, uluslararası alanlar)
- ✅ E5 e-İrsaliye taslak + numara + durum (gönderim Faz 8)
- ✅ E6 POD (web yükleme)
- ✅ E7 **Fatura → gelir, sefer kapanışı → gider finans akışı (idempotent)**
- ✅ E8 Sefer takip zaman çizelgesi + istisna yönetimi
- ✅ E9 **Uçtan uca operasyon→finans senaryo testi**
- ✅ E10 Navlun faturası (taslak, kesme, KDV/tevkifat, iptal, PDF)

## EPİK F — Filo & Sürücü (Faz 5A: F1–F4, F6 / Faz 5B: F5) — P0
- ✅ F1 Araç/çekici/dorse + belge bitiş + hatırlatma
- ✅ F2 Bakım/onarım + lastik → gider
- ✅ F3 Yakıt log + tüketim + gider
- ✅ F4 Sürücü + belgeler + hatırlatma
- ✅ F5 Atama + müsaitlik + harcırah → finans
- ✅ F6 Filo/sürücü raporu

## EPİK G — Depo/3PL (Faz 6) — P1
- ✅ G1 Depo/antrepo/raf-göz
- ✅ G2 Stok (müşteri sahipli, lot/seri) + giriş/çıkış
- ✅ G3 Elleçleme + 3PL faturalama
- ✅ G4 Sayım/envanter
- ✅ G5 Önceki sistemden açılış stoğu içe aktarma — Depo > Stok'ta CSV ile önizleme ve ya-hep-ya-hiç içe aktarma; her satır "Açılış stoğu" referanslı mal kabulü, ürün ve göz yoksa açılır, dolu göz/ürün/lot ve belirsiz miktar reddedilir

## EPİK H — Uluslararası/Gümrük/ADR (Faz 7) — P1
- ✅ H1 Gümrük beyanı
- ✅ H2 Transit (T1/T2)/TIR + süre/teminat
- ✅ H3 ADR uygunluk kontrolü
- ✅ H4 Sınır/geçiş ücretleri + izin belgeleri
- ✅ H5 Uluslararası CMR (çok dilli)

## EPİK I — Entegrasyonlar (Faz 8) — P1
- 🟦 I1 GİB e-Fatura/e-Arşiv/e-İrsaliye (entegratör adaptörü + mock) — adaptör ve mock hazır, gerçek entegratör bekliyor
- 🟦 I2 HGS/OGS içe aktarım + eşleme
- 🟦 I3 Yakıt kartı içe aktarım + eşleme
- 🟦 I4 GPS/telematik canlı konum + geofence
- 🟦 I5 Banka ekstre + mutabakat
- 🟦 I6 Harita/mesafe + ETA

## EPİK J — Raporlama/BI (Faz 9) — P1
- ✅ J1 Sefer/araç/müşteri/güzergâh kârlılığı
- 🟦 J2 Operasyon KPI (OTIF, boş km, doluluk) — zamanında teslim ve doluluk var; eksiksiz teslim, boş km ve bekleme için veri yok
- ✅ J3 Finans analitik (nakit akış, yaşlandırma, döviz pozisyonu)
- 🟦 J4 Rol-bazlı dashboard + dışa aktarım — özelleştirilebilir widget ve e-posta özeti yok

## EPİK K — Mobil/POD (Faz 10) — P2
- 🟦 K1 Sürücü PWA + sınırlı giriş — çalışıyor; gerçek telefonda denenmedi
- 🟦 K2 Durum güncelleme + konum — konum yalnız uygulama açıkken; KVKK görüşü bekliyor
- ✅ K3 POD (imza/foto/offline senkron)
- ✅ K4 Masraf/harcırah mobil giriş

## EPİK L — SaaS Operasyon (Faz 11) — P1
- 🟦 L1 Tenant yaşam döngüsü + onboarding + KVKK dışa aktar/sil — açma, deneme, askı, kapatma, dışa aktarım var; fiziksel silme hukuki görüş bekliyor
- ✅ L2 Plan/abonelik + limit
- 🟦 L3 SaaS faturalama + ödeme sağlayıcı — borç kaydı, deneme sağlayıcısı ve gecikme akışı var; gerçek sağlayıcı ve resmi fatura bekliyor
- ✅ L4 Kullanım ölçümü
- 🟦 L5 Sağlık & izleme konsolu + çevrimiçi kullanım — tek sunucu, bellek içi; firma bazlı hata ve alarm yok
- ✅ L6 Çapraz-tenant denetimli erişim + log

## EPİK M — ZTO Fabrika Finans Eklemeleri (Faz 12) — P1
Plan: `fazlar/FAZ_12_ZTO_Finans_Eklemeleri.md` · Kararlar: `zto-finans/analiz/04_UYARLAMA_KARAR_MATRISI.md` (migration sırası §4, Z-kimlikleri) · Dal `zto-finans-eklemeleri` (push yok)
- ✅ M-A Analiz: ZTO finans envanteri, bağımlılık grafiği, ~175 modalın alan düzeyinde eşleme matrisi (MX1–MX9), iş kuralı kararları §6.1 (2026-11-12); kapsam taraması ve MX5–MX9 (2026-11-13)
- ✅ M-K Kullanıcı kararları 04 §6.2 (Y1–Y9) — 2026-11-13, hepsi önerildiği gibi
- ✅ M0 Ön yüz altyapısı: kapsamlı ZTO CSS (`.zto-finans`), BS4 modal, DataTables görünümlü tablo, select2 görünümlü select, ortak şube seçim bileşeni, FA5 webfont, Excel/PDF/grafik, i18n ad alanları, "ZTO Finans" menüsü + açılış sayfası; bakiye/ekstre sorgularında `deleted=false` düzeltmesi — 2026-11-13; Excel için exceljs, `@layer zto` uygulanmadı (gerekçe FAZ_12 Uygulama Notu 12.0); CSS sızması Playwright ve `check:zto-css` (CI) ile denetlenir
- ✅ M1a İş yeri / şube / çoklu şirket (Z01–Z05, ZA1): Şirket → Şube → İş Yeri; şirket başına unvan, VKN, SGK sicili, logo, belge serisi; kullanıcı iş yeri kısıtı; şirket seçici + konsolide; BranchProvince, WorkPlace, Şirketler ekranı (MX5) — 2026-11-13; tenant V22–V26 + admin V8, varsayılan şirket göçü, 14 tabloda `company_id` + bileşik FK, şirket serisinden fatura numarası, `COMPANY_MISMATCH`, kullanıcı iş yeri kapsamı (ALL/LIMITED), ZTO İş Yerleri/Şubeler/Şirketler ekranları, MUI aktif şirket seçici. Uygulama belgesi `docs/zto-finans/uygulama/12.1a_TASARIM.md`; kalan LIMITED kapsam uçları (K-1) 12.1 sonuna (FAZ_12 Uygulama Notu 12.1a)
- ✅ M1 Cari (Z06, Z10–Z12): profil/limit/alt grup, cari IBAN (BankAccounts ekranları), Borç/Alacak Ekle + vergi, sezon devri, cari transfer + çek/senet taşıma; CustomerAccounts, Transactions, AllTransactions, Statement (MX1, MX8) — 2026-11-14; tenant V27–V30, TCKN/adres/IBAN şifreli + hash + maskeli, şirket kırılımlı bakiye ve ekstre, cari taşıma virman çifti + bağlı tüm çek/senetler (`TRANSFERRED`), `FINANCE_EMPLOYEE_VIEW`, Hızlı Cari İşlemi; 12.1a K-1 LIMITED kapsam sertleştirmesi (depo, filo, gümrük, GPS, dosyalar, fon, günlük özet) ve 12.1a küçük açık kalanları kapandı. Uygulama belgesi `docs/zto-finans/uygulama/12.1_TASARIM.md`; otonom kararlar (kullanıcı onayına açık) belge §9 ve FAZ_12 Uygulama Notu 12.1
- ✅ M2 Banka/kasa (Z07, Z13, Z14 + Z41): fon ek alanları + açılış hareketi, transfer merkezi + döviz bozumu + masraf, gelir/gider defteri; tanım, hareket, BankStatement ekranları (MX2) — 2026-11-14; tenant V31–V34, kasa/banka şirket bazında ayrı (şirket süzgeci + kırılımlı özet), şifreli + maskeli fon hesap no, şirket başına VRM/SVR serisi, şirketler arası virman (grup şirketi carisine otomatik ödeme/tahsilat), ödemede şirket dağılımı uyarısı (409 `CONFIRMATION_REQUIRED` + onay) ve eksik fatura uyarısı (cari listesi, cari kartı/ekstre, ödeme ve fatura ekranları), ZTO Bankalar/Kasalar/Hareketler/Transfer Merkezi/Döviz Bozum Raporu; Vadeli Mevduat M6'ya, ExchangeBreakReport ağaç görünümü 12.2b'ye. Uygulama belgesi `docs/zto-finans/uygulama/12.2_TASARIM.md`; otonom kararlar (kullanıcı onayına açık) belge §9 ve FAZ_12 Uygulama Notu 12.2
- ✅ M2a Ödemeler ve tahsilatlar (Z15, Z16): Payments, Collections, günlük ödeme/tahsilat raporları, ortak ödeme/tahsilat modalları, düzeltme = ters + yeni, faturayla eşleştirme (MX7) — 2026-11-15; tenant V35–V36, yöntemler Nakit/Banka/Çek/Senet/Kredi Kartı (BANK + kanal), `POST /settlements/{id}/correct`, iptalde tarih + gerekçe, zengin süzgeçli liste/detay/açık fatura uçları, günlük raporda o tarihteki durum + fon gün sonu bakiyesi, 12.2 uyarıları ZTO modallarında, ZTO'daki tüm Ödeme/Tahsilat Ekle bağlantıları ZTO modallarına; çekli kaydın düzenlenmesi/iptali 12.3'e, plan bankası/talimat 12.4'e. Uygulama belgesi `docs/zto-finans/uygulama/12.2a_TASARIM.md`; otonom kararlar (kullanıcı onayına açık) belge §9 ve FAZ_12 Uygulama Notu 12.2a
- ✅ M3 Çek/senet (Z08, Z09): ek alanlar + 4 yeni durum, çek koçanı; Checks, Bills, CheckBooks (MX3) — 2026-11-16; tenant V37–V38, Çekler/Senetler/Çek Koçanları/Düzenle/Çek Belgeleri/Detaylı Çek Raporu, yaşam döngüsü (CANCELLED/RETURNED/COLLATERAL/PROTESTED), çekli/senetli kaydın düzeltmesi ve iptali, sunucuda `^\d{7}$`; teminat senedi UI'da devre dışı. Uygulama belgesi `docs/zto-finans/uygulama/12.3_TASARIM.md`; otonom kararlar (kullanıcı onayına açık) belge §9 ve FAZ_12 Uygulama Notu 12.3
- ⬜ M4 Ödeme planı/onay (Z19): plan genişletme + banka talimatı + 5 seviyeli yoğunluk; PaymentApproval/Index, PaymentManagement, "Ödendi" banka/kasa seçimli (MX3, MX7)
- ⬜ M5 Kredi sözleşmeleri (Z18): sözleşme, taksit, hareket; gün sayımı/BSMV/KKDF parametrik; geçmiş kredi açılış borcu; CreditContracts, AccountCredits (MX3, MX7 §5) — C14'ü kapatır
- ⬜ M6 Vadeli mevduat (Z17): açılış, faiz tahsili, vade sonu, erken bozma; TimeDeposits (MX2)
- ✅ M7 Masraf + taşeron gideri (Z20, Z21): tek masraf modeli (genel/araç/sefer/depo/sürücü), SalesTruckExpenses → `trip_cost` SUBCONTRACTOR; ExpenseItems, ProductionExpenses (MX4, MX8) — 2026-11-16; tenant V39–V40, Masraf Kalemleri/Genel Masraf (liste, takvim, kalem faturaları, form)/Sevk Nakliye Masrafları; taşeron gideri ZTO ekranından hemen cariye (ödenecek = net + KDV − tevkifat − kesinti), Cari/Nakit/Banka masraf, düzeltme = ters + yeni; uygulama belgesi `docs/zto-finans/uygulama/12.7_TASARIM.md`
- ✅ M8 Raporlar: yaşlandırma/performans, FinanceReport, bilanço, kur farkı raporu/kaydı (Y8), 8 haftalık nakit akışı, kur ekranı (MX1, MX8) — 2026-11-16; tenant V41 (kesim kuru/tarihi + kaynak bileşik FK), `/finance/reports/*` (FINANCE_VIEW, LIMITED kendi kapsamında), ZTO Cari Hesap Raporları/Finans Raporları/Finansal Bilanço/Kur Farkı Raporu (+ onaylı "Kes")/Nakit Akış/Para Birimleri/Hızlı Bakiye Özeti; `ReportService` şirket kırılımı; masraf sefer/araç maliyetine okunarak (ayna yok). Uygulama belgesi `docs/zto-finans/uygulama/12.8_TASARIM.md`; otonom kararlar (kullanıcı onayına açık) belge §9 ve FAZ_12 Uygulama Notu 12.8
- ⬜ M9 Personel ve bordro (Z22–Z30, ZA2): şirket bazında personel ve istihdam, yasal bordro motoru + yıllık parametreler, dört göz onay, toplu ödeme, avans, ek ödeme, devamsızlık, izin, zimmet, raporlar, SGK takibi; sürücü = personel (MX6)
- ⬜ M10 Uyumsoft e-Dönüşüm (Z31–Z34): sağlayıcı adaptörü (WSDL + test hesabı gerekli), şirket başına ayar, gelen kutusu → alış faturası, GİB uyumlu e-İrsaliye, ShedLock (MX9 B, D) — I1'i ilerletir
- ⬜ M11 ZTO Fabrika ↔ Blackrose canlı entegrasyon (Z35–Z39, ZA3): 14 dış uç, OAuth2 client credentials, HMAC webhook, outbox, E0–E6 (MX9 A)

---

## Çapraz kesen (tüm fazlar) — P0/P1
- 🟦 X1 Belge/dosya yönetimi (yükleme, saklama, virüs tarama, erişim izni) — Faz 3 başlamadan; yerel disk/S3 ve ClamAV taraması hazır (S3 taklidiyle denendi), gerçek AWS ve mevcut dosyaların geriye dönük taranması açık
- 🟦 X2 Bildirim altyapısı (e-posta/SMS/uygulama içi) + belge süresi hatırlatmaları — Faz 5A; uygulama içi liste ve günlük özet e-postası hazır (filo hatırlatmaları, onay bekleyen sürücü masrafı ve ödeme planı, vadesi gelen ödeme; kullanıcı bazlı tercih, filo için firma ayarı); müşteri kişisine yola çıkış ve teslim e-postası (takip bağlantılı, metin+HTML) hazır; ödeme planı ve sürücü masrafında anlık e-posta hazır (girilince onaylayacaklara, onay/ret kararı girene, gerekçesiyle); diğer akışlarda anlık e-posta, SMS ve push açık
- ⬜ X3 i18n (TR birincil; EN altyapısı)
- ⬜ X4 Audit/aktivite günlüğü standardı
- ✅ X5 Test kapsama hedefleri + sözleşme testleri — JaCoCo ile birim+entegrasyon kapsamı ölçülür (2026-11-10: satır %93,3, dal %78,0); CI `coverage` profiliyle satır %93 / dal %76 altına düşüşte durur, rapor CI çıktısı olarak yüklenir ve özet çalıştırma sayfasında görünür. Sefer, depo ve rapor uçlarının eksik testleri eklendi; kimlik servisine şifre değiştirme, 2FA kapatma, kullanıcı/rol yaşam döngüsü testleri eklendi (%80 → %87). Gümrüğe satır silme, transit iptali, izin iadesi ve kayıt kuralı testleri eklendi (%80 → %98). Finans uçlarına fon güncelleme/silme, elle ve virman hareketi ters çevirme, gider tanımı testleri eklendi (%79 → %97). Kalan zayıflar küçük paketler (filo uçları %80, SaaS servisi %88). Sözleşme testleri: OpenAPI şeması `docs/api/openapi.json`'da tutulur, backend testi şemanın değişmediğini, frontend testi elle yazılmış 120'yi aşkın tipin her alanının şemada bulunduğunu ve tipinin uyduğunu denetler (tip denetimi 122 yanlış tanımı ve bunların gizlediği iki hatayı buldu: depo sayımında sayılmış satırdan çıkınca hata, SaaS planı düzenlenirken fiyat yeniden yazılmadan kaydedilememesi); aynı adlı DTO'ların şemada birbirini ezdiği (13 tip şemada hiç görünmüyordu) bulundu ve ayrıldı (`docs/YEREL_CALISTIRMA.md` "API sözleşmesi"). Frontend birim kapsamı mantık dosyalarında ölçülür (2026-11-10: satır %79, dal %90; sınır %75/%85); çevrimdışı sürücü kuyruğu, oturum durumu ve SaaS yönetici istemcisi testlendi
- 🟦 X6 Güvenlik gözden geçirme (OWASP, yetki, kiracı sızıntısı) — kod gözden geçirmesi yapıldı (`docs/GUVENLIK_GOZDEN_GECIRME.md`), iki bulgu düzeltildi; bağımlılık taraması (Trivy, npm audit), yenileme token'ı HttpOnly çerezde, CSP'li nginx imajı ve frontend ana sürüm yükseltmeleri tamam; sızma testi açık
- 🟦 X7 Üretim hazırlığı — SMTP, S3, ClamAV, IP sınırı, SaaS 2FA, büyük veri ölçümü ve düzeltmeleri, frontend nginx imajı, SaaS konsolunda dış bağlantı denetimi ve `blackrose_dependency_up` metriği, gönderen alan adının SPF/DMARC/DKIM denetimi, e-posta sağlayıcısı olarak BulkMail (qrestos) HTTP API'si (`BULKMAIL_API_KEY`; aynı anahtarla yeniden deneme, test anahtarında sandbox göndereni, sağlık tablosunda anahtar denetimi) (`docs/URETIM_KURULUM.md`); teslim bildirimi webhook'u (imzalı; geri dönen/şikâyet edilen adres kullanıcı listesinde ve SaaS konsolunda görünür); BulkMail'in gerçek anahtar ve gerçek webhook'la denenmesi, diğer gerçek sağlayıcılar, DNS kayıtları, TLS/yük dengeleyici ve üretim benzeri ortamda ölçüm açık
- 🟦 X8 Backend test süresi — tam doğrulama yerelde ~15 dk, CI'da ~5 dk; entegrasyon testleri ~545 sn. Testler ~157 firma şeması kurar, her biri ~1,0–1,3 sn (toplam ~200 sn). Ölçüm: aynı 20 migration Flyway ve ağ olmadan doğrudan PostgreSQL içinde de ~1,25 sn sürüyor; süre 90 tablo/indeks/kısıtın DDL'inden geliyor. Bu yüzden şablon şemayı kopyalamak (aynı DDL'i çalıştırır) ve test veritabanında fsync kapatmak (~%8) kazandırmaz. Belirgin kazanç yalnız kurulan firma sayısını azaltmakla (test sınıfı başına paylaşılan firma; testler birbirinden yalıtılmış olmaz, sayım yapan testler düzenlenmeli) veya test sınıflarını paralel koşturmakla gelir. 2026-11-10: test sınıfları ayrı JVM'lere dağıtıldı (`it.forkCount`); her JVM kendi Spring bağlamını ve PostgreSQL konteynerini kurduğu için testler durum paylaşmaz, kod değişikliği gerekmedi. İki JVM ile yerelde tam doğrulama ~15 dk → ~9 dk; test sayısı ve kapsam birebir aynı. CI iki JVM'le çalışır, yerelde varsayılan bir (bellek). Firma paylaşımı yapılmadı
