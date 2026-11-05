# 03 — Yapılacaklar / Backlog (Epik → Görev)

Öncelik: **P0** = MVP zorunlu, **P1** = MVP sonrası yakın, **P2** = sonraki. Durum: ⬜ açık /
🟦 devam / ✅ bitti. Ajan ilerledikçe işaretler.

Uygulama sırası: 0 → 1 → 2 → 3 → 5A → 4 + 5B → 6 → 7 → 8 → 9 → 11 → 10.

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
- ⬜ C12 (P1) ERP'den açılış bakiyesi import aracı
- ✅ C13 PurchaseInvoice (tedarikçi/taşeron faturası) → cari + ödeme planı
- ⬜ C14 (P2) Kredi/finansman modülü (faz ataması bekliyor)

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
- ⬜ G1 Depo/antrepo/raf-göz
- ⬜ G2 Stok (müşteri sahipli, lot/seri) + giriş/çıkış
- ⬜ G3 Elleçleme + 3PL faturalama
- ⬜ G4 Sayım/envanter

## EPİK H — Uluslararası/Gümrük/ADR (Faz 7) — P1
- ⬜ H1 Gümrük beyanı
- ⬜ H2 Transit (T1/T2)/TIR + süre/teminat
- ⬜ H3 ADR uygunluk kontrolü
- ⬜ H4 Sınır/geçiş ücretleri + izin belgeleri
- ⬜ H5 Uluslararası CMR (çok dilli)

## EPİK I — Entegrasyonlar (Faz 8) — P1
- ⬜ I1 GİB e-Fatura/e-Arşiv/e-İrsaliye (entegratör adaptörü + mock)
- ⬜ I2 HGS/OGS içe aktarım + eşleme
- ⬜ I3 Yakıt kartı içe aktarım + eşleme
- ⬜ I4 GPS/telematik canlı konum + geofence
- ⬜ I5 Banka ekstre + mutabakat
- ⬜ I6 Harita/mesafe + ETA

## EPİK J — Raporlama/BI (Faz 9) — P1
- ⬜ J1 Sefer/araç/müşteri/güzergâh kârlılığı
- ⬜ J2 Operasyon KPI (OTIF, boş km, doluluk)
- ⬜ J3 Finans analitik (nakit akış, yaşlandırma, döviz pozisyonu)
- ⬜ J4 Rol-bazlı dashboard + dışa aktarım

## EPİK K — Mobil/POD (Faz 10) — P2
- ⬜ K1 Sürücü PWA + sınırlı giriş
- ⬜ K2 Durum güncelleme + konum
- ⬜ K3 POD (imza/foto/offline senkron)
- ⬜ K4 Masraf/harcırah mobil giriş

## EPİK L — SaaS Operasyon (Faz 11) — P1
- ⬜ L1 Tenant yaşam döngüsü + onboarding + KVKK dışa aktar/sil
- ⬜ L2 Plan/abonelik + limit
- ⬜ L3 SaaS faturalama + ödeme sağlayıcı
- ⬜ L4 Kullanım ölçümü
- ⬜ L5 Sağlık & izleme konsolu + çevrimiçi kullanım
- ⬜ L6 Çapraz-tenant denetimli erişim + log

---

## Çapraz kesen (tüm fazlar) — P0/P1
- 🟦 X1 Belge/dosya yönetimi (yükleme, saklama, virüs tarama, erişim izni) — Faz 3 başlamadan; yerel disk ve izinler hazır, S3 ve virüs tarama açık
- 🟦 X2 Bildirim altyapısı (e-posta/SMS/uygulama içi) + belge süresi hatırlatmaları — Faz 5A; uygulama içi liste hazır, e-posta/SMS açık
- ⬜ X3 i18n (TR birincil; EN altyapısı)
- ⬜ X4 Audit/aktivite günlüğü standardı
- ⬜ X5 Test kapsama hedefleri + sözleşme testleri
- ⬜ X6 Güvenlik gözden geçirme (OWASP, yetki, kiracı sızıntısı)
