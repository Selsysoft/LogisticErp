# FAZ 7 — Uluslararası Taşıma: Gümrük / Transit / ADR

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
- [ ] Uluslararası sefere gümrük beyanı + transit belgesi bağlanır, süre/teminat takip edilir.
- [ ] ADR'li yükte araç/sürücü ADR uygunluğu kontrol edilir (uygunsuzda uyarı/engel).
- [ ] Sınır geçiş ücretleri sefer giderine ve finansa yansır.
- [ ] Uluslararası CMR doğru alanlarla (çok dilli) üretilir.

## ERP Referansı
`CustomerCMR3Controller`, `CustomerCMR13Controller` (uluslararası belge temeli). Gümrük/transit yeni
alan; ERP'de doğrudan karşılığı yok, sıfırdan tasarlanır.

## Açık Sorular
- Gümrük sistemleri (BİLGE/NCTS) ile otomatik entegrasyon MVP hedefinde mi, yoksa belge kaydı +
  manuel mi? (Öneri: belge kaydı önce; entegrasyon Faz 8.)
