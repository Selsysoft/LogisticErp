# MX-9 — ZTO Fabrika ↔ Blackrose canlı entegrasyon (K5), Uyumsoft e-Dönüşüm, lokalizasyon, arka plan işleri

> Tarih: 2026-11-13 · Durum: **tasarım önerisi, kullanıcı kararı bekliyor** (her bölümün sonunda en çok 4 soru)
> Kaynaklar (salt okunur): ZTO Fabrika `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (aşağıda **ZTO:** öneki) · Blackrose `F:\visual studio zto\LogisticErp` (aşağıda **BR:** öneki; Java yolları `backend/src/main/java/org/ece/blackrose/` altına, migration yolları `backend/src/main/resources/db/migration/` altına görelidir).
> Bağlam: [04 §0–§4](../04_UYARLAMA_KARAR_MATRISI.md) (tek finans motoru, ZTO görünümü, tenant V22–V34) · [MX5](MX5_isyeri_sube_coklu_sirket.md) (company → branch_group → branch; şirket başına `company_edocument_settings` ve `document_series`) · [FAZ_08](../../../fazlar/FAZ_08_Entegrasyonlar.md) · [envanter F](../envanter/F_arac_cmr_takip_entegrasyon.md) · [envanter E §9–§10](../envanter/E_ortak_altyapi.md).
> Eski prompttan geçerli olanlar: **K5** (canlı API entegrasyonu), **K6** (02 §4 kuralları yalnız dış entegrasyon API'sine uygulanır), **FAZ 4** iş gereksinimleri ve **A4** (kimlik doğrulama + konum aktarım modeli). K1/K2 iptal; lojistik ürünü Blackrose'dur.
> **Migration adları:** `V2xS1…V2xS9` (tenant) ve `A-xS1` (admin) yer tutucudur; numarayı koordinatör 04 §4 (V22–V34) ve MX5 (V22a–f) sonrasına verir. Gizli değerler `__PLACEHOLDER__`.

---

## 0. Özet bulgular

| # | Bulgu | Kanıt |
|---|---|---|
| 1 | ZTO'nun dış sisteme yük/sevk iten tek örneği ZtoHal'dir: statik `X-Factory-ApiKey`, HTTPS zorunlu, `externalRef = "ZTF:{db}:{truckId}"` ile upsert, **kuyruk/retry yok**, gelen (inbound) uç yok. | ZTO: `Services/ZtoHalIntegrationService.cs:170-178, 238-289, ~585, 588-594`; `Controllers/SalesProductLogisticController.cs:5179-5237` |
| 2 | ZTO'da kuyruk + worker + retry + iyimser kilit deseni HKS'de tam vardır; ZTO tarafındaki giden kuyruk bu desenle kurulmalı. | ZTO: `SQL_Migrations/2026_07_08_ZT_HksBildirim.sql:9-39`; `Services/Hks/HksBildirimQueueWorker.cs:7-47` |
| 3 | ZTO'da GPS/filo takibi yok; Frigga casus cihazı yük başına, veri ekran açılınca çekiliyor ve saklanmıyor. Teslim durumu elle giriliyor. | envanter F §5.1–5.5 |
| 4 | Blackrose'da sefer, etap ataması, POD, CMR/irsaliye belgesi, navlun faturası, konum alma ve Standard Webhooks HMAC doğrulayıcı **zaten var**; eksik olan dış ortak (partner) kimliği, makine kimlik doğrulaması, giden outbox/webhook göndericisi ve talep kabul kuyruğu. | BR: `shipment/…`, `integration/…`, `notification/mail/WebhookSignature.java:20-80` |
| 5 | ZTO'nun Uyumsoft entegrasyonu commit edilmiş ve ekranları hazır, ama SOAP katmanı **iskelet**: operasyon adları, namespace ve SOAPAction `TODO(WSDL)` ile işaretli; yanıtlar etiket taramasıyla "best-effort" ayrıştırılıyor. Uyumsoft test hesabıyla doğrulandığına dair kanıt yok. | ZTO: `Services/Uyumsoft/UyumsoftEInvoiceService.cs:11-31, 54, 87, 244, 292, 335`; `Docs/Uyumsoft/Uyumsoft_Istenecek_Bilgiler.txt` Bölüm 3 |
| 6 | Blackrose'un e-belge portu tek global bean'dir (özellik değeriyle seçilir); şirket/kiracı başına sağlayıcı ve kimlik bilgisi yok; gönderim veritabanı işlemi içinde; gelen kutusu yok; irsaliye UBL'inde plaka/şoför GİB yapısında değil. | BR: `integration/service/EDocumentProvider.java:8-24`, `MockEDocumentProvider.java:38-41`, `UnconfiguredEDocumentProvider.java:91-93`, `EDocumentService.java:103-125, 193-207`, `UblWriter.java:94-100` |
| 7 | ZTO'nun Uyumsoft ekranları ve partial'ları **hiç `Localizer` kullanmıyor** (0 çağrı), `.resx`'i yok. Blackrose yalnız TR, tek dosya `i18n.ts`. | ZTO: `Views/Uyumsoft/*.cshtml`, `Views/Shared/_Uyumsoft*.cshtml`; BR: `frontend/src/i18n.ts:4-8` |
| 8 | ZTO `NotificationBackgroundService`'in döngü gövdesi tamamen yorum satırında (fiilen boş); finansla ilgili zamanlanmış hatırlatma worker'ı görülmedi. Blackrose'da zamanlayıcı havuzu varsayılan (tek iş parçacığı), dağıtık kilit yok. | ZTO: `NotificationBackgroundService.cs:28-48`; BR: `tenant/AsyncConfig.java:9`, `application.yml` (`spring.task.scheduling` yok) |

---

# BÖLÜM A — ZTO Fabrika ↔ Blackrose canlı entegrasyonu (K5)

## A.1 Roller ve kapsam

- **Fabrika** = ZTO Fabrika kiracısı (yükün sahibi, gönderici). Nakliye firmasını ZTO'da `TransportCompany` (TransportType `'Sevk İhracat Nakliye'`) olarak tutar ve navlunu `'Sevk Nakliye Firması'` carisine borç yazar (ZTO: `Controllers/TransportCompanyController.cs:290-345`, `Controllers/SalesProductController.cs:2418-2490`).
- **Lojistik firması** = Blackrose kiracısı (taşıyıcı). Fabrikayı CUSTOMER türünde cari (`account`) olarak tutar, seferi (`shipment`) açar, araç/sürücü atar, POD alır, navlun faturası keser.
- Bir fabrika birden çok Blackrose kiracısıyla, bir Blackrose kiracısı birden çok fabrikayla bağlanabilir → bağ **kiracı çifti** düzeyinde: Blackrose'da `zto_partner` satırı, ZTO'da `TransportCompany` satırına bağlı bağlantı kaydı.

## A.2 Kullanım senaryoları

| # | Senaryo | Yön | Tetik | Blackrose sonucu | ZTO sonucu |
|---|---|---|---|---|---|
| U1 | Bağlantı kurma | BR yönetici → ZTO yönetici (elle) | BR'de ortak tanımı + kimlik bilgisi üretimi; ZTO'da bağlantı formu + "Bağlantıyı Sına" | `zto_partner`, `integration_client` | Bağlantı kaydı, `TransportCompany` bağı |
| U2 | Taşıma talebi oluştur/güncelle | ZTO → BR | Sevk aracı (ZT_SalesTruck) veya reçeteli sevk (ZT_RecipeShipment) kaydı, nakliyeci bağlı firma ise | `zto_transport_request` (RECEIVED) → kabul edilince `shipment` (QUOTED/PLANNED) | `ZtoLogisticStatus='Gönderildi'` |
| U3 | Talep iptali | ZTO → BR | Sevk aracı silme/iptal | Talep CANCELLED; sefer QUOTED/PLANNED/LOADED ise CANCELLED (`ShipmentService.java:53-58` geçişleri) | — |
| U4 | Talep kabul/red | BR → ZTO (webhook) | BR operasyon kullanıcısı kabul/red eder (ya da ortak için otomatik kabul) | `shipment` oluşur | Rozet: Kabul / Red + gerekçe |
| U5 | Araç/dorse/sürücü ataması | BR → ZTO | `DispatchService.assign` (`shipment/service/DispatchService.java:139`) | — | `Plate`, `DorsePlate`, `ChauffeurID`/`ChauffeurNameOther`, `ChauffeurPhone` doldurulur; `TransportTruck`/`TransportChauffeur` upsert |
| U6 | Yükleme tamamlandı | ZTO → BR | ZTO `TruckStatus='Sevk işlemi tamamlandı'` (tartım bitti) | Olay + (ortak ayarına göre) PLANNED→LOADED; brüt/net kg, palet sayısı | — |
| U7 | Durum değişimi | BR → ZTO | `ShipmentService.changeStatus` (`shipment/service/ShipmentService.java:170-196`) | — | IN_TRANSIT → `DepartureDate`; DELIVERED → `DeliveryStatus='Teslim Edildi'` + `DeliveryDate`; CANCELLED → `'İptal'` |
| U8 | Teslim kanıtı (POD) | BR → ZTO | POD kaydı (`ShipmentController.java:229`) | — | Teslim açıklaması + POD dosya bağlantısı |
| U9 | Konum / ETA | ZTO ← BR (pull) + BR → ZTO (seyrek ETA olayı) | ZTO "Araç Takip" modalı açılınca; ETA değişince | `vehicle_position` (V10:80-90) | Leaflet haritasında Frigga rotasıyla birlikte |
| U10 | Müşteriye tanımlı araçlar | ZTO ← BR | Günlük + değişince olay | `partner_vehicle` | `TransportTruck`/`TransportChauffeur` "ZTO LOGISTIC" rozetli, ayrı filtre (FAZ 4 madde 3) |
| U11 | Navlun faturası | BR → ZTO | `POST /shipment/shipments/{id}/invoice` (`ShipmentController.java:271`), e-belge gönderimi | `freight_invoice` | `TransportCompanyInvoiceNumber/Date`, borç tutarı mutabakatı; e-Fatura ETTN ile Uyumsoft gelen kutusunda çift kayıt engeli |
| U12 | Belgeler | ZTO ← BR | CMR/irsaliye PDF, e-İrsaliye ETTN | `shipment_document` (V7:111-123) | Sevk evrakına bağlantı |
| U13 | e-İrsaliye ETTN geri bildirimi | ZTO → BR | ZTO Uyumsoft e-İrsaliye gönderimi (`UyumsoftController.cs:380-475`) | Sefer belgelerine "fabrika e-İrsaliyesi" referansı | — |
| U14 | Mutabakat (kurtarma) | ZTO ← BR (pull) | ZTO worker, webhook kaçırıldığında | `GET /events?after=` | Eksik olaylar işlenir |

Kapsam dışı (ilk sürüm): bahçe nakliyesi (`ZT_ExpertReportTruck*`, alım tarafı; envanter F §1), gemi nakliyesi (`ShipTransportCompany*`), iş emri aracı (`WorkOrderTruck`, yalnız Admin). Gerekçe ve karar §A.3'te.

## A.3 Eşleme tablosu — `ZTO öğe | Blackrose karşılığı (file:line) | Karar`

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| `ZT_SalesTruck` (sevk aracı; ZTO: `SalesProductController.cs:2310-2320`) | `shipment` (BR: `tenant/V7__create_shipment.sql:6-35`) + yeni `zto_transport_request` | **YENİ** — talep kuyruğu; kabulde sefer. `recordType=SALES_TRUCK` |
| `ZT_RecipeShipment` (ZTO: `RecipeSalesController.cs:3100-3104`) | aynı | **YENİ** — `recordType=RECIPE_SHIPMENT`; varış `DestLat/DestLng`, `RouteDistanceKm` doğrudan taşınır |
| `ZT_SalesTruckBatchNumbers`, palet/koli sayıları | `shipment_cargo` (V7:40-55) | **EŞLE** — parti/konteyner no `cargo.description` + ek alanlar (V2xS2 `external_meta`) |
| `TransportCompany` + cari `ReferenceID/AccountGroup` (ZTO: `TransportCompanyController.cs:290-345`) | yeni `zto_partner` → `account` CUSTOMER (V3:1-13) | **YENİ** — eşleşme anahtarı VKN (`TransportCompany.IdentityNo` ↔ BR `company.tax_number`; fabrika VKN'si ↔ `account.tax_number`) |
| `TransportTruck` (plaka, marka, tip; normalizasyon yok) | `vehicle` (V6:1-22), `normalizePlate` (BR: `fleet/service/FleetRegistryService.java:245-246`) | **EŞLE** — sözleşmede plaka normalize (boşluksuz, TR büyük harf); BR → ZTO tek yönlü upsert |
| `TransportChauffeur` (`IdentityNo`, `Nationality`, `DrivingLicense`) | `driver` (V6:24-38) — **kimlik no ve uyruk kolonu yok** | **GENİŞLET** — V2xS5; TCKN yalnız ortak onayıyla gönderilir (KVKK) |
| `SupplierTruck`/`SupplierChauffeur` | — | **ÇIKAR** — tedarikçinin kendi aracıdır (envanter F §3.1); FAZ 4 madde 3'teki "müşteriye tanımlı araç" Transport\* ailesine eşlenir, Supplier\*'a değil |
| `ZT_Chauffeur`/`ZT_UsedPlate` (bahçe şoförü) | — | **ÇIKAR** (ilk sürüm) |
| `TruckStatus` (yükleme/tartım, serbest metin) | `ShipmentStatus.LOADED` (BR: `shipment/domain/ShipmentTypes.java:7-16`) | **EŞLE** — fabrikaya ait; U6 ile BR'ye bildirilir, BR yazmaz |
| `DeliveryStatus` `'Bekliyor'/'Teslim Edildi'/'İptal'` (ZTO: `SalesProductLogisticController.cs:6116, 6276, 6768`) | `DELIVERED`, `CANCELLED` | **EŞLE** — BR yazar (webhook); ZTO yalnız durum + tarih doldurur; `DeliveryRate/TotalPrice` elle kalır |
| `CompleteDelivery` açıklaması | `proof_of_delivery` (V7:96-109), `ShipmentController.java:220, 229` | **EŞLE** — POD olayı |
| `TransportCompanyPrice` + `CurrencyID` | `shipment.net_amount/currency` (`manualNet`, BR: `shipment/web/ShipmentDtos.java:52-74`) | **EŞLE** — `agreedFreight {amount,currency}`; yoksa BR tarifesi |
| `TransportCompanyInvoiceNumber/Date` | `freight_invoice` (V7:126-148) | **EŞLE** — BR → ZTO olayı |
| `ZT_AccountDebts` `'Sevk Nakliye Firması'`, `ReferenceID=ZT_SalesTruck.ID` | BR'de alacak `LedgerService` (fatura kesilince) | **ZTO'DA KALIR** — ZTO borcu ZTO'da; BR alacağı BR'de; ortak anahtar `externalRef` + fatura no + ETTN |
| `SecondTransportCompany` (metin) | `shipment_leg.carrier_account_id` (V7:57-73) | **BİLGİ** — taşeron varsa atama olayında `subcontractor {title, taxNumber}` |
| `ShipTransportCompany*` (gemi) | — | **ÇIKAR** |
| `HighwayCmr3/13`, `HighwayCmrSpecialNotes`, `BillOfLadingType`, `InsuranceType`, `TransitDocumentType`, gümrük müdürlükleri, `IncotermID` | `shipment.consignee*`, `sender_instructions`, `attached_documents`, `incoterm` (BR: `shipment/domain/Shipment.java:33-56`) | **EŞLE** — `documents` bloğu |
| CMR basımı yok; CMR dosya yükleme (ZTO: `RecipeSalesController.cs:5126-5131`) | `shipment_document` CMR (V7:111-123), `ShipmentController.java:241-253` | **BR SAHİBİ** — PDF pull ucu |
| `SpyTruckNo/SpyTruckName/SpyTruckLink` (Frigga) | — | **BİLGİ** — talepte taşınır; BR Frigga'yı çağırmaz |
| `FriggatechController` (pull, saklamaz) | `GpsService.ingest` (BR: `integration/service/GpsService.java:58`), `GET /integration/gps/shipments/{id}` (BR: `integration/web/IntegrationController.java:283`) | **YENİ UÇ** — ortak için konum pull |
| ZtoHal `X-Factory-ApiKey` (statik) | `TokenService` + `JwtClaimTenantResolver` (BR: `identity/security/JwtClaimTenantResolver.java:33`) | **DEĞİŞTİR** — OAuth2 client credentials (§A.6) |
| ZtoHal `externalRef` upsert | yok | **YENİ** — `UNIQUE(partner_id, external_ref)` |
| ZtoHal senkron toggle, retry yok | yok | **YENİ** — iki tarafta outbox |
| HKS kuyruğu (`ZT_HksBildirim`) | yok | **DESEN** — BR `integration_outbox`, ZTO `ZT_ZtoLogisticOutbox` |
| `tests/ZtoHalIntegrationChecks` altın JSON | BR entegrasyon testleri (Testcontainers) | **DESEN** — iki repoda aynı `golden/*.json` |
| `ShipmentLedger`, Tır Takip Raporu | — | **ÇIKAR** (ZTO'da kalır) |

## A.4 Uç listesi — Blackrose (dış API, 02 §4 kuralları; K6)

Taban: `/api/v1/integrations/zto`. Kimlik: `Authorization: Bearer <erişim jetonu>` (client credentials). Tarih ISO-8601 UTC; para `{ "amount": "1234.56", "currency": "EUR" }`; hata gövdesi `{ code, message, details[], traceId }`; sayfalama `{ content, page, size, totalElements, totalPages }` (BR: `docs/02_MIMARI_ve_VERI_MODELI.md` §4).

| # | Yön | Metot | URL | Kapsam (scope) | Açıklama |
|---|---|---|---|---|---|
| B1 | ZTO → BR | POST | `/api/v1/integrations/oauth/token` | — | `grant_type=client_credentials`, `client_id`, `client_secret` (form). Yanıt `{access_token, token_type:"Bearer", expires_in:900, scope}`. Kiracı JWT `tenant` claim'ine yazılır. **TenantFilter dışı** (BR: `tenant/TenantFilter.java:41-44`'e eklenir) |
| B2 | ZTO → BR | GET | `/ping` | `zto.read` | Bağlantı testi: ortak kodu, taşıyıcı şirket unvanı/VKN (MX5 `company`), izinli kapsamlar, sunucu saati |
| B3 | ZTO → BR | PUT | `/transport-requests/{externalRef}` | `zto.requests.write` | Oluştur veya güncelle (idempotent). İlk çağrı 201, sonraki 200. `requestVersion` eskiyse 409 |
| B4 | ZTO → BR | GET | `/transport-requests/{externalRef}` | `zto.read` | Talep + sefer durumu, atama, son olay sürümü (ZtoHal `truck-status` karşılığı) |
| B5 | ZTO → BR | POST | `/transport-requests/{externalRef}/cancel` | `zto.requests.write` | `{reason}`; IN_TRANSIT ve sonrası 409 |
| B6 | ZTO → BR | POST | `/transport-requests/{externalRef}/loading-completed` | `zto.requests.write` | U6; `Idempotency-Key` başlığı zorunlu (BR deseni: `finance/web/FinanceController.java:91`) |
| B7 | ZTO → BR | POST | `/transport-requests/{externalRef}/documents/edespatch` | `zto.requests.write` | U13; `{ettn, number, issuedAt}` |
| B8 | ZTO → BR | GET | `/transport-requests?updatedSince=&status=&page=&size=` | `zto.read` | Mutabakat listesi |
| B9 | ZTO → BR | GET | `/transport-requests/{externalRef}/positions?since=&limit=` | `zto.positions.read` | Son konum + iz + ETA (U9) |
| B10 | ZTO → BR | GET | `/transport-requests/{externalRef}/pod` · `/pod/files/{fileId}` | `zto.read` | POD ve dosyası (dosya akışı, `ShipmentFilePolicy` kuralları) |
| B11 | ZTO → BR | GET | `/transport-requests/{externalRef}/documents` · `/documents/{id}/pdf` | `zto.read` | CMR / irsaliye PDF, e-belge ETTN'leri |
| B12 | ZTO → BR | GET | `/freight-invoices?updatedSince=` · `/freight-invoices/{number}` · `/{number}/pdf` · `/{number}/ubl` | `zto.invoices.read` | U11 |
| B13 | ZTO → BR | GET | `/vehicles?updatedSince=` | `zto.read` | Müşteriye tanımlı araç/dorse/sürücü (U10) |
| B14 | ZTO → BR | GET | `/events?after={eventId}&limit=100` | `zto.read` | Webhook olaylarının aynısı, sıralı akış (U14) |

**Blackrose iç uçları (oturumlu kullanıcı, `/api/v1/integration` altında; mevcut modül adı korunur):**

| Metot | URL | İzin | Açıklama |
|---|---|---|---|
| GET/POST/PUT | `/integration/zto-partners` · `/{id}` | `INTEGRATION_PARTNER_MANAGE` (yeni) | Ortak tanımı: cari, şirket (MX5), varsayılan şube, otomatik kabul, kapsamlar, KVKK paylaşım bayrakları |
| POST | `/integration/zto-partners/{id}/credentials` · `/credentials/rotate` · `/credentials/revoke` | aynı | İstemci sırrı yalnız bir kez gösterilir |
| PUT | `/integration/zto-partners/{id}/webhook` · POST `/webhook/rotate-secret` · POST `/webhook/test` | aynı | Webhook adresi ve sırrı |
| GET/PUT | `/integration/zto-partners/{id}/vehicles` | `FLEET_EDIT` | Müşteriye tanımlı araçlar |
| GET | `/integration/zto-requests?status=` | `SHIPMENT_VIEW` | Gelen talep kuyruğu |
| POST | `/integration/zto-requests/{id}/accept` `{branchId, tariffId?, manualNet?}` · `/reject` `{reason}` | `DISPATCH` | Kabul → `ShipmentService.create` |
| GET · POST | `/integration/outbox?status=` · `/integration/outbox/{id}/retry` | `INTEGRATION_VIEW` / `INTEGRATION_PARTNER_MANAGE` | Giden olay izleme, DEAD olayı yeniden kuyruğa alma |

## A.5 Uç listesi — ZTO Fabrika tarafı (yalnız listelenir, ZTO değiştirilmez)

| # | Yön | Metot | URL (öneri) | Kimlik | Açıklama |
|---|---|---|---|---|---|
| Z1 | BR → ZTO | POST | `{ZTO kökü}/api/ztologistic/webhook?db={DatabaseName}` | Standard Webhooks HMAC (`webhook-id`, `webhook-timestamp`, `webhook-signature`) | Tek uç, tüm olay türleri. `[AllowAnonymous]`; sır boş/kısa ise **404** (ZTO `AdminPanelApiController.cs:21-36` deseni); `FixedTimeEquals`; 5 dk zaman toleransı; `webhook-id` ile tekilleştirme; her durumda hızlı 2xx (işleme kuyrukta) |
| Z2 | ZTO iç | GET | `/SalesProductLogistic/ZtoLogisticStatus?truckId=` | çerez oturumu | Rozet/durum (ZtoHal `GetZtoHalTruckStatus` 5247 karşılığı) |
| Z3 | ZTO iç | POST | `/SalesProductLogistic/ZtoLogisticResend?truckId=` | çerez + rol Lojistik/Admin | Elle yeniden kuyruğa alma |
| Z4 | ZTO iç | GET | `/SalesProductLogistic/ZtoLogisticPositions?truckId=` | çerez | B9'u sunucu tarafında çağırır (jeton tarayıcıya inmez) |

**Webhook olay türleri (BR → ZTO, Z1):**

| `type` | Tetik (BR) | `data` |
|---|---|---|
| `transport_request.accepted` / `.rejected` | kabul/red | `{shipmentNumber, status, reason?}` |
| `transport_request.assignment_changed` | etap ataması | `{legs:[{seq, vehicle{plate,kind,brand}, trailer{plate}?, driver{fullName,phone,nationality?,nationalId?}, subcontractor{title,taxNumber}?}]}` |
| `transport_request.status_changed` | `ShipmentService.move` (`ShipmentService.java:206-211`) | `{from, to, at, message?}` |
| `transport_request.eta_changed` | GPS/geofence (en sık 15 dk) | `{etaAt, distanceKmRemaining?, lastPosition{lat,lng,at}}` |
| `transport_request.pod_recorded` | POD kaydı | `{recipientName, deliveredAt, lat?, lng?, note?, files:[{id,name,contentType}]}` |
| `transport_request.document_issued` | CMR/irsaliye yayımı, e-belge | `{type:"CMR"\|"WAYBILL", number, edocument{kind,ettn,status}?}` |
| `freight_invoice.issued` / `.cancelled` / `.edocument_status` | fatura kesme/iptal, e-belge durumu | §A.7 |
| `partner.vehicles_changed` | ortak araç listesi değişimi | `{updatedSince}` → ZTO B13'ü çeker |

## A.6 Kimlik doğrulama modeli (A4 — gerekçeli öneri)

| Seçenek | Artı | Eksi | Karar |
|---|---|---|---|
| (a) Statik API anahtarı başlığı (ZtoHal `X-Factory-ApiKey`) | ZTO'da hazır desen, en basit | Süresi yok, kapsam yok, her istekte sır gider, kiracı çözümü için alt alan adı ya da ek başlık gerekir; BR'de karşılığı yok | Reddedildi |
| **(b) OAuth2 client credentials → kısa ömürlü JWT** (ZTO → BR) + **Standard Webhooks HMAC** (BR → ZTO) | BR'de JWT altyapısı ve `tenant` claim çözümü hazır (`JwtClaimTenantResolver.java:33`); kapsam (scope) ve 15 dk ömür; sır yalnız jeton alırken gider; HMAC doğrulayıcı ve `signatureOf` hazır (`WebhookSignature.java:32-68`, "gelecekte gönderen tarafta kullanılır"); döndürmede çift imza zaten destekleniyor (`:47-60`) | ZTO'da jeton önbelleği + HMAC doğrulayıcı yazılmalı (.NET'te ~100 satır) | **Öneri** |
| (c) mTLS | En güçlü | Sertifika yönetimi; IIS ve SaaS barındırmada işletme yükü | Ertelendi |

Uygulama ayrıntıları:
- **İstemci kaydı admin şemasında** (`A-xS1 integration_client`): jeton ucu kiracı bağlamı olmadan çalışır; `client_id` → `tenant_id` + `partner_id`. Sır BCrypt ile saklanır (BR: `identity/security/CryptoConfig.java:47-48`).
- **Döndürme:** `rotate` yeni sır üretir; eski sır `secret_next_expires_at`'e kadar (varsayılan 7 gün) geçerli kalır; `revoke` ikisini de düşürür ve ortağın açık jetonlarını engeller (BR `saas_revoked_token` deseni, admin V6).
- **Webhook sırrı** ortak başına `whsec_` biçiminde, şifreli saklanır (BR `Encryptors.delux` deseni: `CryptoConfig.java:51-53`); döndürmede gönderen iki imzayı birlikte yollar, ZTO biri doğruysa kabul eder.
- **Makine kimliği:** denetim alanlarına (`created_by`) `integration:{partnerCode}` yazılır; `JwtPrincipalConverter` makine jetonunu kullanıcısız kabul edecek şekilde genişletilir.
- **Hız sınırı:** `AuthRateLimitFilter` (BR: `identity/security/AuthRateLimitFilter.java:83-97`) iki yeni grup alır: `integration-token` (IP başına dakikada 10) ve `integration` (istemci başına dakikada 120; anahtar IP değil `client_id`). `RateLimitProperties` (`:7-12`) genişletilir. Aşımda mevcut `TOO_MANY_REQUESTS` gövdesi.
- **HTTPS zorunlu:** ZTO'nun `NormalizeWebUrl` kuralı (ZTO: `ZtoHalIntegrationService.cs:170-178`) BR webhook adresi doğrulamasında da uygulanır (yalnız `https`; dev'de loopback `http`).

## A.7 İstek/yanıt DTO'ları

**B3 — `PUT /transport-requests/{externalRef}` gövdesi (`TransportRequestUpsert`):**
```json
{
  "requestVersion": 3,
  "source": { "system": "ZTO_FABRIKA", "tenantRef": "__DB_NAME__", "recordType": "SALES_TRUCK", "recordId": 12345, "workPlaceId": 4, "workPlaceName": "Merkez Paketleme" },
  "factory": { "taxNumber": "1234567890", "title": "Örnek Gıda A.Ş." },
  "loading": { "plannedAt": "2026-11-20T06:00:00Z", "address": "…", "city": "Antalya", "country": "TR", "lat": 36.9, "lng": 30.7, "warehouseName": "Soğuk Depo 2" },
  "delivery": { "plannedAt": "2026-11-24T08:00:00Z", "customerName": "…", "address": "…", "city": "München", "district": null, "country": "DE", "lat": 48.13, "lng": 11.57 },
  "transport": { "type": "SEVK_IHRACAT", "vehicleType": "FRIGO", "reefer": { "required": true, "setTempC": 4.0 }, "requestedPlate": null },
  "cargo": [ { "description": "Mandalina", "packaging": "PALET", "quantity": 33, "grossWeightKg": 22000, "netWeightKg": 20500, "batchNo": "P-2026-118", "containerNo": null } ],
  "documents": { "billOfLadingType": "Karayolu-CMR", "insuranceType": "CMR Sigorta", "transitDocumentType": "T1", "customsDirectorate": "…", "exitGateCustomsDirectorate": "…", "incoterm": "FCA", "cmrBox3": "…", "cmrBox13": "…", "specialNotes": "…" },
  "agreedFreight": { "amount": "45000.00", "currency": "EUR" },
  "spyDevice": { "provider": "Frigga", "deviceNo": "ABC123" },
  "orderRefs": [ "SIP-2026-0412" ],
  "contact": { "name": "…", "phone": "…" }
}
```
Kurallar: `requestVersion` ZTO'da her değişiklikte artar; BR yalnız büyük sürümü uygular. Talep `ACCEPTED` olduktan sonra yalnız `loading/delivery.plannedAt`, `cargo`, `documents`, `contact` değişebilir; sefer `LOADED` ve sonrasında güncelleme 409 `TRANSPORT_REQUEST_LOCKED`. Koordinatlar ZTO'daki `"lat,lng"` metninden (ZTO: `ZT_SalesTruck.Location`) ZTO tarafında ayrıştırılıp sayı olarak gönderilir.

**B3/B4 yanıtı (`TransportRequestView`):**
```json
{
  "externalRef": "ZTF:__DB_NAME__:ST:12345",
  "requestVersion": 3,
  "requestStatus": "ACCEPTED",
  "rejectReason": null,
  "shipment": { "number": "SF-2026-000123", "status": "PLANNED", "eventVersion": 7, "plannedPickup": "…", "plannedDelivery": "…" },
  "assignment": { "legs": [ { "seq": 1, "vehicle": { "plate": "07ABC123", "kind": "TRACTOR" }, "trailer": { "plate": "07DEF45" }, "driver": { "fullName": "…", "phone": "…" } } ] },
  "freight": { "amount": "45000.00", "currency": "EUR" },
  "receivedAt": "…", "updatedAt": "…"
}
```

**B6 — `loading-completed`:** `{ "completedAt": "…", "emptyWeightKg": 15200, "fullWeightKg": 37400, "palletCount": 33, "sealNo": "…", "plate": "07ABC123", "trailerPlate": "07DEF45" }` → BR olay kaydı (`shipment_event` NOTE) + ortak ayarı `auto_load` açıksa PLANNED→LOADED; plaka atamayla uyuşmazsa 409 `PLATE_MISMATCH` (kayıt yine olay olarak yazılır).

**B9 — konum yanıtı:** `{ "vehicle": { "plate": "…" }, "last": { "at": "…", "lat": 41.0, "lng": 28.9, "speedKmh": 72.5 }, "track": [ { "at": "…", "lat": …, "lng": … } ], "etaAt": "…", "destination": { "lat": …, "lng": … } }` (en çok 500 nokta; `since` en çok 7 gün geri).

**Webhook zarfı (Z1 gövdesi):**
```json
{ "id": "6f1c…(uuid = webhook-id)", "type": "transport_request.status_changed", "occurredAt": "…", "partner": "ORNEK-GIDA", "externalRef": "ZTF:__DB_NAME__:ST:12345", "shipmentNumber": "SF-2026-000123", "eventVersion": 8, "data": { "from": "LOADED", "to": "IN_TRANSIT", "at": "…" } }
```

**`freight_invoice.issued` `data`:** `{ "number": "B-NF-2026-000041", "invoiceDate": "2026-11-25", "dueDate": "2026-12-25", "net": {…}, "vat": {…}, "withholding": {…}, "total": {…}, "netTl": "…", "shipmentNumbers": ["SF-2026-000123"], "externalRefs": ["ZTF:…:ST:12345"], "edocument": { "kind": "EFATURA", "ettn": "…", "status": "SENT" } }` — `edocument` boş olabilir; e-belge gönderilince ayrı `freight_invoice.edocument_status` olayı gelir.

## A.8 Idempotency, sıralama, güvenilirlik

| Konu | Kural |
|---|---|
| Talep anahtarı | `externalRef = "ZTF:{DatabaseName}:{ST\|RS}:{kayıtId}"` — ZtoHal biçimine (`ZTF:{db}:{truckId}`) tür kesimi eklenir, çünkü `ZT_SalesTruck.ID` ile `ZT_RecipeShipment.ID` çakışabilir. BR: `UNIQUE (partner_id, external_ref)`. |
| Yeniden deneme | B3 aynı `externalRef` + aynı/eski `requestVersion` → 200 ve mevcut görünüm (yan etki yok). B5/B6/B7 → `Idempotency-Key` (BR deseni: `finance/service/SettlementService.java:88-89`); aynı anahtar farklı gövde → 422 `IDEMPOTENCY_KEY_REUSED`. |
| Giden olaylar (BR) | Olay, iş kaydıyla **aynı veritabanı işleminde** `integration_outbox`'a yazılır (transactional outbox). Gönderici iş ayrı çalışır (§D). `webhook-id` = outbox satır kimliği. |
| Sıralama | Sefer başına artan `eventVersion` (`shipment_event` sayacı). ZTO, kayıtlı sürümden küçük olayı yalnız günlüğe yazar, uygulamaz. Sıra dışı gelişte B14 ile boşluk doldurulur. |
| Retry/backoff | BR gönderici: 2xx dışı veya zaman aşımı (10 sn) → 1 dk, 5 dk, 15 dk, 1 sa, 6 sa … en çok 12 deneme → `DEAD`; ekrandan elle yeniden kuyruğa alma. 410 yanıtı ortak webhook'unu kapatır. |
| ZTO tarafı | `ZT_ZtoLogisticOutbox` (HKS deseni: `UniqueId`, `SendStatus` 0–4, `RetryCount`, iyimser kilit) + `ZT_ZtoLogisticInbox` (`webhook-id` UNIQUE). |
| Saat | ZTO `DateTime.Now` (yerel, saat dilimsiz) kullanıyor; sözleşmede tüm zamanlar UTC `Z` ya da ofsetli; ZTO tarafında `IDateTimeProvider` ile dönüştürülür. |

## A.9 Hata kodları (dış API)

| HTTP | `code` | Ne zaman |
|---|---|---|
| 400 | `VALIDATION_ERROR` (mevcut gövde) | Alan doğrulaması; `details[]` alan bazında |
| 400 | `PLATE_INVALID` | Normalize edilmiş plaka TR/yabancı biçim dışı |
| 400 | `CURRENCY_UNSUPPORTED` | Kiracının kur tablosunda olmayan para birimi |
| 401 | `INTEGRATION_UNAUTHORIZED` | Jeton yok/geçersiz/süresi dolmuş; jeton ucunda `invalid_client` (OAuth gövdesi) |
| 403 | `INTEGRATION_SCOPE_DENIED` | Kapsam yetersiz |
| 403 | `PARTNER_INACTIVE` | Ortak pasif veya kiracı etkin değil (`TENANT_NOT_ACTIVE` ile birlikte) |
| 404 | `TRANSPORT_REQUEST_NOT_FOUND` · `FREIGHT_INVOICE_NOT_FOUND` | Başka ortağın kaydı da 404 (varlık sızdırılmaz) |
| 409 | `STALE_REQUEST_VERSION` | `requestVersion` mevcuttan küçük |
| 409 | `TRANSPORT_REQUEST_LOCKED` | LOADED sonrası güncelleme |
| 409 | `CANCEL_NOT_ALLOWED` | IN_TRANSIT veya sonrası iptal |
| 409 | `SHIPMENT_INVALID_TRANSITION` (mevcut, `ShipmentService.java:173-177`) | B6 otomatik yükleme geçişi uygun değil |
| 409 | `PLATE_MISMATCH` | B6 plakası atamayla uyuşmuyor |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Aynı anahtar, farklı gövde |
| 429 | `TOO_MANY_REQUESTS` (mevcut) | Hız sınırı; `Retry-After` |
| 503 | `INTEGRATION_DISABLED` | Ortak için entegrasyon kapalı (bakım) |

ZTO tarafı sınıflaması ZtoHal'deki gibi: 401/403 → "Bağlantı yetkisi yok" (yeniden deneme yok, yöneticiye uyarı), 404/409/422 → kalıcı hata (kuyrukta `Hatalı`), 429/5xx/ağ → `Retry`.

## A.10 Kiracı / şirket eşlemesi (MX5)

| Katman | Blackrose | ZTO | Kural |
|---|---|---|---|
| Kiracı | `admin.tenant` (admin V1) ↔ `integration_client.tenant_id` | `ZTO_ADMIN.Customers.DatabaseName` | Jeton kiracıyı taşır; `externalRef` ZTO veritabanı adını taşır |
| Tüzel kişi (taşıyıcı) | `zto_partner.company_id` → `company` (MX5 V22a) | `TransportCompany.IdentityNo` | Ortak kurulurken eşitlik denetlenir; uyuşmazsa uyarı |
| Tüzel kişi (fabrika) | `zto_partner.account_id` → `account` (CUSTOMER, `tax_number`) | `ZT_UyumsoftSetting.SenderVkn` (ZTO'da kiracı başına tek tüzel kişi; MX5 §0) | Talepteki `factory.taxNumber` ≠ `account.tax_number` → 409 `PARTNER_TAX_MISMATCH` |
| İşletim şubesi | `zto_partner.default_branch_id` (şirketin şubesi; bileşik FK MX5 V22c) + isteğe bağlı `zto_partner_workplace (partner_id, zto_workplace_id, branch_id)` | `ZT_SalesTruck.WorkPlaceID` | Talep kabulünde şube = eşlemeden, yoksa varsayılan |
| Belge serisi | `document_series` (company başına; MX5 V22a) | — | Navlun faturası numarası ortağın şirketinin serisinden |
| e-Belge göndericisi | `company_edocument_settings` (MX5 V22a) | ZTO kendi Uyumsoft ayarı | Navlun e-Faturası taşıyıcı şirketinden çıkar; ZTO bunu gelen kutusunda görür (§B) |

## A.11 Blackrose migration'ları

| Ad | Şema | İçerik |
|---|---|---|
| `A-xS1__integration_client` | admin | `integration_client (id, client_id UNIQUE, tenant_id FK tenant, partner_id UUID, secret_hash, secret_next_hash, secret_next_expires_at, scopes VARCHAR(300), status, last_used_at, created_*/updated_*)` |
| `V2xS1__zto_partner` | tenant | `zto_partner (id, code UNIQUE, name, account_id FK account, company_id FK company, default_branch_id, (default_branch_id, company_id) bileşik FK, factory_tax_number, factory_tenant_ref, status, auto_accept, auto_load, share_driver_identity, share_positions, webhook_url, webhook_secret_enc, webhook_secret_next_enc, webhook_enabled, last_delivery_at, audit)`; `zto_partner_workplace`; izin `INTEGRATION_PARTNER_MANAGE` tohumu (PATRON, FINANCE_SUPER, OPERATIONS) |
| `V2xS2__zto_transport_request` | tenant | `zto_transport_request (id, partner_id, external_ref, request_version, record_type, status RECEIVED/ACCEPTED/REJECTED/CANCELLED, payload JSONB, shipment_id UUID UNIQUE FK shipment, reject_reason, received_at, decided_by/at, audit, UNIQUE(partner_id, external_ref))`; `zto_idempotency (partner_id, key, request_hash, response JSONB, created_at, UNIQUE(partner_id, key))` |
| `V2xS3__integration_outbox` | tenant | `integration_outbox (id UUID = webhook-id, partner_id, event_type, aggregate_type, aggregate_id, event_version, payload JSONB, status PENDING/SENDING/SENT/DEAD, attempts, next_attempt_at, last_http_status, last_error VARCHAR(500), created_at, sent_at)`; indeks `(status, next_attempt_at)`; `(partner_id, created_at)` (B14 akışı) |
| `V2xS4__partner_vehicle` | tenant | `partner_vehicle (id, partner_id, vehicle_id FK vehicle, trailer_id FK vehicle NULL, driver_id FK driver NULL, valid_from, valid_to, note, audit)` — FAZ 4 madde 3 |
| `V2xS5__driver_identity` | tenant | `driver.national_id_enc VARCHAR(200)`, `driver.nationality CHAR(2)`; yalnız `share_driver_identity` açık ortaklara ve e-İrsaliye UBL'ine gider |

## A.12 ZTO Fabrika'da yapılacak değişiklikler — UYGULANMAYACAK (yalnız liste)

1. **Bağlantı tablosu** `ZT_ZtoLogisticConnection` (kiracı DB): `BaseUrl`, `ClientId`, `ClientSecretEnc`, `WebhookSecretEnc` (şifreleme anahtarı `appsettings.json` → `ZtoLogistic:CryptoKey` = `__PLACEHOLDER__`; Uyumsoft'taki sabit varsayılan anahtar düşüşü tekrarlanmamalı, bkz. §B.6), `Status`, `LastSuccessAt`, `LastError`. Admin/Patron ekranı + "Bağlantıyı Sına" (B2).
2. `TransportCompany.ZtoLogisticConnectionID` (int, NULL) + liste ve `SalesTruckAdd` firma dropdown'unda "ZTO LOGISTIC" rozeti (ZTO: `Views/SalesProduct/SalesTruckAdd.cshtml:798`).
3. `ZT_SalesTruck` ve `ZT_RecipeShipment`: `ZtoLogisticExternalRef varchar(80)`, `ZtoLogisticRequestVersion int`, `ZtoLogisticStatus varchar(30)`, `ZtoLogisticShipmentNo varchar(30)`, `ZtoLogisticEventVersion int`, `ZtoLogisticSyncedAt timestamptz`, `TransportCompanyInvoiceEttn varchar(60)`.
4. Giden kuyruk `ZT_ZtoLogisticOutbox` + `ZtoLogisticQueueWorker` (HKS deseni; `Program.cs:200` yanına kayıt). Tetikler: sevk aracı ekle/düzenle/sil (`SalesProductController.cs:2238`, `SalesProductLogisticController.cs:2264`), reçeteli sevk ekle/düzenle, tartım tamamlandı, e-İrsaliye gönderildi.
5. Gelen uç `ApiController/ZtoLogisticWebhookController.cs` (Z1) + `ZT_ZtoLogisticInbox` (tekilleştirme ve işlem durumu) + işleyici (atama → `Plate/DorsePlate/ChauffeurID/ChauffeurPhone`; durum → `DepartureDate`/`DeliveryStatus`/`DeliveryDate`; fatura → `TransportCompanyInvoiceNumber/Date/Ettn` ve `UpdateAccountDebts` ile tutar düzeltme).
6. Ortak plaka normalizasyonu `Methods.NormalizePlate` (boşluk silme + `ToUpper(tr-TR)`); `ZT_SalesTruck.Plate/DorsePlate`, `TransportTruck.Plate` için tek seferlik düzeltme betiği (`2026_09_09_SpyTruckNo_Normalize.sql` deseni).
7. `TransportTruck.ExternalRef`, `TransportChauffeur.ExternalRef`, `IsZtoLogistic` + rozet/filtre; B13'ten upsert. Şoför dropdown'u firmaya göre filtrelensin (bugün tüm şoförler: `SalesProductController.cs:~1971`).
8. Bağlı firmada sevk aracı formunda plaka/şoför alanları "Nakliyeci atayacak" durumunda salt okunur; elle değişiklik B3 ile `requestedPlate` olarak gider.
9. Uyumsoft e-İrsaliye gönderimi (`UyumsoftController.cs:380`) bağlı firmada atama gelmeden engellenir; gönderim sonrası B7.
10. Uyumsoft gelen kutusu içe alımı (`UyumsoftController.cs:738`) ETTN `ZT_SalesTruck.TransportCompanyInvoiceEttn` ile eşleşirse "Nakliye faturası — sevk aracına bağlı" diye işaretlenir, ikinci borç yazılmaz.
11. "Araç Takip" modalı (`Views/SalesProductLogistic/Index.cshtml:11526-11613`) ve "Yaklaşan Araçlar / ETA" (`:~12480-12600`): Frigga rotasına ek olarak Z4'ten gelen araç izi (ayrı renk); ETA'da BR `etaAt` varsa istemci hesabı yerine o kullanılır.
12. ZtoHal'deki gibi sözleşme testi projesi `tests/ZtoLogisticIntegrationChecks` (altın JSON, HMAC doğrulama, URL politikası, durum eşlemesi).

## A.13 Aşamalı plan

| Aşama | Blackrose işi | ZTO işi (ayrı karar) | Çıkış ölçütü |
|---|---|---|---|
| E0 | Önkoşul: MX5 V22a–c (company) ve A4 kararı | — | `company` tablosu ve ortak şirket seçimi var |
| E1 | `A-xS1`, `V2xS1`; jeton ucu, B2, ortak yönetim ekranı, kimlik döndürme, hız sınırı grupları | Madde 1–2 | ZTO "Bağlantıyı Sına" BR'den şirket unvanını okur |
| E2 | `V2xS2`; B3–B5, B8; talep kuyruğu ekranı (kabul/red) | Madde 3–4, 6, 8 | Sevk aracı → BR talebi → kabul → sefer; tekrar gönderim yan etkisiz |
| E3 | `V2xS3`; outbox göndericisi, olaylar, B14, outbox izleme ekranı | Madde 5 | Atama/durum/POD ZTO'da 1 dk içinde görünür; ZTO kapalıyken olay kaybolmaz |
| E4 | `V2xS4`, `V2xS5`; B9, B13, ETA olayı | Madde 7, 11 | Müşteriye tanımlı araçlar rozetli; harita iki kaynağı gösterir |
| E5 | B6, B7, B10–B12; navlun faturası olayları | Madde 9–10 | Navlun faturası iki tarafta tek kez; ETTN eşleşir |
| E6 | Sözleşme testleri (altın JSON iki repoda), yük testi (dakikada 120 istek), güvenlik testi (imza, tekrar, zaman toleransı) | Madde 12 | CI eşikleri (satır %93, dal %76) korunur |

Kaba efor (tahmin): Blackrose E1–E6 ≈ 25–30 iş günü; ZTO tarafı ≈ 15–20 iş günü.

## A.14 Riskler

1. **Çift navlun kaydı:** ZTO borcu araç oluşturulurken yazıyor (`SalesProductController.cs:2418-2490`); aynı fatura Uyumsoft gelen kutusundan alış faturası olarak da içe alınabilir → madde 10 ve ETTN eşleşmesi zorunlu.
2. **Plaka metin eşitliği:** ZTO'da normalizasyon yok, iş mantığı plaka eşitliğine dayanıyor (envanter F §3.7) → normalizasyon iki tarafta ve sözleşmede.
3. **KVKK:** sürücü TCKN'si, telefon ve konum kişisel veridir; paylaşım ortak bayrağına bağlı, konum geçmişi saklama süresi belirlenmedi (FAZ_08 uygulama notu).
4. **ZTO kiracı kimliği DB adına bağlı:** veritabanı yeniden adlandırılırsa `externalRef`'ler kopar → `tenantRef` değişimi için BR'de ortak düzeyinde "eski ön ek" alanı gerekebilir.
5. **Durum sahipliği çatışması:** yükleme (tartım) fabrikada, LOADED BR'de; otomatik geçiş yanlış plakada çalışırsa sefer bozulur → `PLATE_MISMATCH` ve ortak bazında `auto_load`.
6. **Tek iş parçacıklı zamanlayıcı ve dağıtık kilit yokluğu** (§D) outbox gecikmesine ve çok örnekli kurulumda çift gönderime yol açar.

## A.15 Açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| A-S1 | Entegrasyon kimlik doğrulaması (A4) | (a) statik anahtar · (b) client credentials + HMAC webhook · (c) mTLS | **(b)** — BR'nin JWT/kiracı claim'i ve `WebhookSignature` hazır; süre, kapsam, döndürme var |
| A-S2 | Gelen talep doğrudan sefer mi olsun? | (a) her zaman otomatik sefer · (b) talep kuyruğu + operasyon onayı, ortak bazında otomatik kabul | **(b)** — fiyat/şube/kapasite kararı taşıyıcıda kalır; güvenilen ortakta otomatik |
| A-S3 | ZTO'da navlun borcu ne zaman yazılsın? | (a) bugünkü gibi araç oluşturulurken (tahmini) + faturayla düzeltme · (b) yalnız fatura gelince | **(a)** — ZTO akışı bozulmaz; fatura olayı tutarı ve no'yu günceller, ETTN çift kaydı keser |
| A-S4 | Konum aktarım modeli (A4) | (a) BR periyodik push · (b) ZTO ekranında pull + seyrek ETA webhook'u | **(b)** — ZTO konumu bugün de saklamıyor (Frigga pull); veri yükü ve KVKK yüzeyi küçük |

---

# BÖLÜM B — Uyumsoft e-Dönüşüm

## B.1 ZTO'daki Uyumsoft entegrasyonu (commit `0b542182`)

| Parça | Dosya:satır | Ne yapar |
|---|---|---|
| Controller | ZTO: `Controllers/UyumsoftController.cs` (1199 satır) | Sınıf rolleri `:18`; ince yetki `CanManageSettings/CanSend/CanDespatch/CanInbox` `:30-33`; ana bayrak `ZT_Setting 'E-Fatura İşlemleri (Uyumsoft)'` `:79-99`; çalışma anında DDL `Ensure` `:39-77`; ayar okuma `LoadConfig` `:101-127` |
| Ayar uçları | `:130` `Settings`, `:138` `GetSettings` (şifre dönmez, `hasPassword`), `:158` `SaveSettings` (şifre boşsa korunur), `:196` `TestConnection`, `:209` `CheckGibUser` | |
| Giden e-Fatura/e-Arşiv | `:221` `SendSalesInvoice` (kaynak `ZT_MaterialSalesInvoice` / `ZT_PesticideSalesInvoice`), `:357` `QueryStatus`, `:1040` `SalesInvoiceStatusMap` | Mükerrer gönderim ETTN kontrolüyle engellenir (`:232-234`); **iptal ucu yok** |
| e-İrsaliye | `:380` `SendDespatch` (`ZT_SalesTruck`'tan; plaka, dorse, şoför `TransportChauffeur`/`ChauffeurNameOther`, kalemler `:877 BuildDespatchLines`), `:478` `QueryDespatchStatus`, `:501` `DespatchStatuses` | Taşıyıcı yalnız unvan metni (`CarrierTitle = TransportCompany`), VKN gitmiyor |
| Dashboard | `:526` `Dashboard`, `:537` `DashboardData` | Giden/irsaliye/gelen sayaçları, hazırlık eksikleri, son işlemler (`ZT_UyumsoftLog`) |
| Gelen kutusu | `:629` `Inbox`, `:638` `InboxData`, `:671` `SyncInbox`, `:685` `InboxSuppliers`, `:702` `MatchInboxSupplier`, `:719` `SetInboxStatus`, `:738` `ImportInboxToInvoice`, `:898` `TransferInvoiceLines` | İçe alım `ZT_MaterialInvoice`'a kolon farkında dinamik INSERT (`:756-790`), `PaymentStatus='Ödenmedi'` |
| Fatura eşleştirme | `:956` `TransferInvoices`, `:1008` `InvoiceStatusMap`, `:1070` `SuggestMatch`, `:1102` `MatchInvoice`, `:1123` `BulkMatchList`, `:1164` `ApplyBulkMatch` | Anahtar: ETTN, yoksa `InvoiceNumber + SupplierVkn` (`Docs/Uyumsoft/Faz_UY4_Aktar_Eslestir.sql`) |
| Servis arayüzü | ZTO: `Services/Uyumsoft/IUyumsoftEInvoiceService.cs:6-33` | Bağlantı testi, mükellef sorgusu, fatura gönder/durum, irsaliye gönder/durum, gelen liste, gelen UBL indir |
| SOAP istemcisi | `Services/Uyumsoft/UyumsoftEInvoiceService.cs:314-341` | WS-Security UsernameToken başlığı; operasyon adları `:23-31` **`TODO(WSDL)`**; yanıt `ScanTag` ile etiket taraması |
| UBL üretimi | fatura `:359-405` (satır, KDV toplamı, birim kodu); irsaliye `:162-225` (`ShipmentStage/TransportMeans/RoadTransport/LicensePlateID`, `DriverPerson`) | e-Fatura/e-Arşiv kararı mükellef sorgusuna göre otomatik (`:70-79`) |
| Gelen kutusu senkronu | `Services/Uyumsoft/UyumsoftInboxService.cs:79-150` | Tekilleştirme ETTN, yoksa no+VKN (`:107-112`); `InboxLastSyncDate` güncellenir |
| Worker | `Services/Uyumsoft/UyumsoftInboxWorker.cs:17, 25, 42-52` | 2 dk ilk gecikme, 30 dk periyot, tüm aktif kiracılar, kiracı başına try/catch |
| Şifreleme | `Services/Uyumsoft/UyumsoftCrypto.cs:10-45` | AES, anahtar SHA-256'dan türetilir; anahtar `Uyumsoft:CryptoKey` = `__PLACEHOLDER__` |
| Tablolar | `ZT_UyumsoftSetting` (`Enabled, TestMode, ServiceUrl, Username, PasswordEnc, SenderVkn, SenderTitle, DefaultProfileId, DefaultInvoiceSeries, DespatchEnabled, DespatchSeries, InboxEnabled, InboxLastSyncDate`), `ZT_EInvoice` (`ReferenceTable/ReferenceID`, `Ettn, Uuid, GibStatus, InvoiceType, ProfileId, EnvironmentMode, ResponseJson`), `ZT_EDespatch` (+ `Plate, DorsePlate, DriverName, DriverTckn, CarrierTitle`), `ZT_EInboxInvoice` (`ProcessStatus` Yeni→Eşleşti→İçeAlındı / Reddedildi, `MatchedSupplierID`, `MaterialInvoiceID`, `PesticideInvoiceID`, `MatchedAuto`, `UblXml`), `ZT_UyumsoftLog` | DDL: `Docs/Uyumsoft/Faz_UY1..UY4*.sql` ve `UyumsoftController.cs:39-77` |
| Ekranlar | `Views/Uyumsoft/Settings.cshtml` (225), `Dashboard.cshtml` (135), `Inbox.cshtml` (178); partial'lar `_UyumsoftTransferModal` (156, "Uyumsoft'tan Aktar"), `_UyumsoftInvoiceListTools` (131, alış listesinde rozet + eşleştir), `_UyumsoftSalesListTools` (58, satış listesinde gönder); sevk listesi e-İrsaliye düğmesi `Views/SalesProductLogistic/Index.cshtml:4103-4104, 6632-6660`; menü `_SideMenu_FinanceItems.cshtml:303-330` | Tümü `UyumsoftMenuHelper.IsModuleEnabled` bayrağına bağlı |

## B.2 Eşleme tablosu — `ZTO öğe | Blackrose karşılığı (file:line) | Karar`

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| `IUyumsoftEInvoiceService` | `EDocumentProvider` (BR: `integration/service/EDocumentProvider.java:8-24`: `send/status/cancel`) | **GENİŞLET** — `testConnection`, `checkTaxpayer`, `inbox(since)`, `downloadInbox(ettn)` eklenir; `Outgoing`'e şirket kimlik bilgisi bağlamı |
| `UyumsoftEInvoiceService` (SOAP iskeleti) | yok (`MockEDocumentProvider.java:38-41`, `UnconfiguredEDocumentProvider.java:91-93`) | **YENİ** `UyumsoftEDocumentProvider` — WSDL'den üretilen istemci (JAX-WS/Spring-WS); ZTO'nun doğrulanmamış operasyon adları kopyalanmaz |
| Sağlayıcı seçimi: kiracı başına tek ayar satırı | Global bean, `app.integration.edocument.provider` (BR: `application-dev.yml:10-12`) | **DEĞİŞTİR** — `EDocumentProviderRegistry.forCompany(companyId)`; `company_edocument_settings.provider` (MX5 V22a) değerine göre |
| `ZT_UyumsoftSetting` | `edocument_settings` id=1 (BR: `tenant/V10__create_integration.sql:2-14`) → MX5 `company_edocument_settings` | **MX5'E BAĞLI** — alanlar birebir karşılanıyor (`service_url, username, password_enc, test_mode, default_profile, efatura/earsiv/eirsaliye_series, despatch_enabled, inbox_enabled, inbox_last_sync`) |
| `UyumsoftCrypto` + `Uyumsoft:CryptoKey` | `Encryptors.delux` deseni (BR: `identity/security/CryptoConfig.java:51-53`) | **DESEN** — ayrı anahtar `EDOCUMENT_CRYPTO_KEY` = `__PLACEHOLDER__`; tanımsızsa uygulama açılmaz (sabit düşüş yok) |
| `ZT_EInvoice` + `ZT_EDespatch` | `edocument` (V10:16-37) | **GENİŞLET** — `company_id` (MX5 V22c), `profile`, `gib_status`, `attempts`, `last_polled_at`, durum `PENDING`/`FAILED` |
| `ZT_UyumsoftLog` | yok | **YENİ** `edocument_log` (istek gövdesi saklanmaz; özet + yanıt kodu) |
| `ZT_EInboxInvoice` | yok | **YENİ** `edocument_inbox` |
| `ImportInboxToInvoice` → `ZT_MaterialInvoice` | `purchase_invoice` (V3:160-179), `PurchaseInvoiceService.create` (BR: `finance/service/PurchaseInvoiceService.java:50`), `POST /finance/purchase-invoices` (`FinanceController.java:347`) | **EŞLE** — içe alım `PurchaseInvoiceService` üzerinden (tek finans motoru); `purchase_invoice.edocument_inbox_id UNIQUE` |
| Tedarikçi eşleme (`SupplierVkn` → `IndustrialSupplierID`) | `account.tax_number` (V3:6) | **EŞLE** — VKN eşitse otomatik öneri; `MatchedAuto` karşılığı `matched_auto` |
| `SuggestMatch`/`MatchInvoice`/`BulkMatch*` | yok | **YENİ UÇLAR** (elle girilmiş alış faturasını gelen e-faturaya bağlama) |
| `CheckGibUser` (otomatik e-Fatura/e-Arşiv) | Kullanıcı seçer (FAZ_08 kararı) | **GENİŞLET** — `kind=AUTO` seçeneği; kullanıcı ezebilir |
| `SendSalesInvoice` (malzeme/ilaç satış faturası) | `FREIGHT_INVOICE` kaynağı (`IntegrationTypes.java:13-16`, `EDocumentService.java:127-157`) | **EŞLE** — kaynak türü navlun faturası; depo faturası sonra (`WAREHOUSE_INVOICE`) |
| `SendDespatch` (`ZT_SalesTruck`) | `WAYBILL` kaynağı (`EDocumentService.java:159-191`) | **EŞLE + DÜZELT** — UBL'de plaka/şoför `UblWriter.java:94-100`'deki `TransportHandlingUnit/Note` yerine ZTO'daki `ShipmentStage/TransportMeans` + `DriverPerson` yapısı; `CarrierParty` (taşıyıcı VKN) eklenir |
| İptal (ZTO'da yok) | `cancel` (`EDocumentService.java:220-229`) | **BR KURALI KALIR** — gönderilmiş fatura önce e-belgesi iptal edilmeden iptal edilemez (`:244-252`) |
| `UyumsoftInboxWorker` (30 dk) | `EDocumentStatusJob` yalnız durum sorgusu (BR: `integration/service/EDocumentStatusJob.java:19`, 15 dk) | **YENİ** `EDocumentInboxJob` (§D) |
| Ana bayrak `ZT_Setting` | `company_edocument_settings.enabled` | **EŞLE** — menü görünürlüğü şirket ayarından |
| Rol kontrolleri `CanSend/CanDespatch/CanInbox` | `INVOICE`, `SHIPMENT_VIEW` (`IntegrationController.java:160-208`) | **GENİŞLET** — yeni izin `EDOCUMENT_INBOX` (Muhasebe/Finans), `COMPANY_MANAGE` (ayar; MX5) |

## B.3 `UyumsoftEDocumentProvider` adaptörünün ihtiyaçları

1. **Port genişletmesi** (`EDocumentProvider`):
   - `record Credentials(String serviceUrl, String username, String password, boolean testMode, String senderAlias, String receiverAlias)`; tüm çağrılar `Credentials` alır (şirket başına).
   - `Result send(Credentials c, Outgoing d)`, `status`, `cancel` + `ConnectionCheck testConnection(c)`, `Taxpayer checkTaxpayer(c, vkn)` (`{isEInvoiceUser, alias, title}`), `List<InboxItem> inbox(c, Instant since)`, `String downloadInbox(c, String ettn)`.
   - `EDocumentStatus`'a `PENDING` (gönderim sırada) ve `FAILED` (taşıma hatası, yeniden denenebilir) eklenir; `edocument_active_uq` (V10:35-36) yalnız SENT/ACCEPTED'i kapsamaya devam eder.
2. **Gönderim işlem dışında:** bugün sağlayıcı `@Transactional` içinde çağrılıyor (`EDocumentService.java:193-207`; FAZ_08 uyarısı). Yeni akış: (1) `edocument` PENDING yazılır ve commit edilir, (2) SOAP çağrısı işlem dışında, (3) sonuç ayrı işlemle yazılır; yarıda kalan PENDING kayıtlar iş tarafından ETTN ile sorgulanıp uzlaştırılır.
3. **UBL:** `UblWriter` sadeleştirilmiş (FAZ_08: GİB şeması/şematron doğrulanmadı). Gerekenler: `InvoiceLine` kırılımı, KDV ve tevkifat alt toplamları, GİB numara biçimi (seri 3 karakter + yıl + 9 hane; seri `company_edocument_settings`), irsaliyede `CarrierParty` + `ShipmentStage`, `DriverPerson.NationalityID` (V2xS5). Testte GİB XSD + şematron ile doğrulama.
4. **Hata eşlemesi:** SOAP Fault → `EDOCUMENT_PROVIDER_ERROR` (409, mesaj kullanıcıya), ağ/zaman aşımı → `FAILED` + iş tarafından yeniden deneme, kimlik hatası → `EDOCUMENT_AUTH_FAILED` ve şirket ayar ekranında uyarı.
5. **Gizlilik:** istek/yanıt günlüğünde UBL saklanır (yasal belge) ama SOAP başlığı (kullanıcı/şifre) asla yazılmaz; ZTO `ZT_UyumsoftLog.RequestBody` bu ayrımı yapmıyor (`UyumsoftController.cs:1188`).
6. **Sözleşme testi:** gerçek WSDL gelene kadar WireMock ile kaydedilmiş SOAP yanıtları; FAZ_08 kabul kriteri "en az bir gerçek sağlayıcı sözleşme testi" Uyumsoft test hesabıyla kapanır.

## B.4 Gelen kutusu → alış faturası akışı

```
EDocumentInboxJob (30 dk, şirket başına, inbox_enabled) ──inbox(since)──▶ Uyumsoft
   │  edocument_inbox UPSERT (company_id, ettn) — yoksa (supplier_tax_number, invoice_number)
   ▼
NEW ──(VKN = account.tax_number tek eşleşme)──▶ MATCHED (matched_auto=true)
NEW ──(kullanıcı tedarikçi seçer)───────────────▶ MATCHED
MATCHED ──(İçe Al: şube, vade, açıklama; satırlar downloadInbox ile önizlenir)──▶ PurchaseInvoiceService.create → IMPORTED (purchase_invoice_id)
MATCHED/NEW ──(mevcut elle girilmiş alış faturasına bağla: SuggestMatch/MatchInvoice)──▶ IMPORTED (bağ, yeni kayıt yok)
NEW ──(Reddet + not)──▶ REJECTED (ticari faturada GİB yanıtı ayrı karar; ilk sürümde yalnız iç durum)
```
Kurallar: cari hareketi yalnız `LedgerService` yazar (04 §1); `purchase_invoice` `(account_id, number)` tekilliği (V3:179) ikinci güvenlik ağıdır; ZTO entegrasyonundan gelen navlun faturası ETTN'si (§A) ve gelen kutusu ETTN'si aynı `ettn` kolonunda buluşur.

## B.5 Sefer için e-İrsaliye

| Durum | Kim düzenler | Blackrose davranışı |
|---|---|---|
| Blackrose kiracısı yükün sahibi değil (ZTO fabrikasının sevkiyatı) | Fabrika (ZTO Uyumsoft, `SendDespatch`) | e-İrsaliye **kesmez**; B7 ile gelen ETTN'yi sefer belgelerine "fabrika e-İrsaliyesi" olarak bağlar, CMR'de referans gösterir |
| Blackrose kiracısı malın sahibi/gönderen (ör. 3PL depodan sevk, FAZ_06) | Blackrose | `WAYBILL` → `EIRSALIYE` (mevcut akış, düzeltilmiş UBL) |
| Taşıyıcının kendi taşıma belgesi | — | CMR / taşıma irsaliyesi PDF (mevcut `shipment_document`); e-İrsaliye kapsamı mali müşavirle doğrulanacak |

## B.6 Gerekli eklemeler (migration ve uçlar)

| Ad | İçerik |
|---|---|
| `V2xS6__edocument_extensions` | `edocument`: `profile VARCHAR(30)`, `gib_status VARCHAR(60)`, `attempts INTEGER NOT NULL DEFAULT 0`, `last_polled_at TIMESTAMPTZ`, `error_detail VARCHAR(1000)`; `kind` CHECK'e `AUTO` çözümlemesi servis tarafında; `edocument_log (id, company_id, edocument_id NULL, operation, success, http_status, message, response_excerpt TEXT, created_by, created_at)` |
| `V2xS7__edocument_inbox` | `edocument_inbox (id, company_id FK company, ettn UUID, uuid, invoice_number, issue_date, supplier_tax_number, supplier_title, profile, invoice_type, currency CHAR(3), net_amount, vat_amount, total_amount NUMERIC(19,4), gib_status, ubl TEXT, process_status NEW/MATCHED/IMPORTED/REJECTED, matched_account_id FK account, matched_auto, purchase_invoice_id FK purchase_invoice UNIQUE, note, processed_by/at, audit, UNIQUE(company_id, ettn))`; indeks `(company_id, process_status, issue_date DESC)`; izin `EDOCUMENT_INBOX` tohumu |
| `V2xS8__purchase_invoice_edocument` | `purchase_invoice.ettn UUID` (UNIQUE WHERE NOT NULL), `purchase_invoice.edocument_inbox_id UUID UNIQUE` |
| (MX5 V22a'ya not) | `company_edocument_settings`: `auto_kind BOOLEAN DEFAULT TRUE` (mükellef sorgusuyla otomatik tür) — MX5 tablosuna eklenmesi önerilir, ayrı migration gerekmez |

**Uçlar (`/api/v1`, oturumlu):**

| Metot | URL | İzin | ZTO karşılığı |
|---|---|---|---|
| GET/PUT | `/organization/companies/{id}/edocument-settings` (MX5 §5.1) | `COMPANY_MANAGE` | `GetSettings`/`SaveSettings` |
| POST | `/organization/companies/{id}/edocument-settings/test` | `COMPANY_MANAGE` | `TestConnection` |
| GET | `/integration/e-documents/taxpayers/{vkn}?companyId=` | `INVOICE` | `CheckGibUser` |
| POST | `/integration/e-documents` (GENİŞLET: `kind=AUTO`, gönderici = kaynağın şirketi) | `INVOICE` | `SendSalesInvoice`, `SendDespatch` |
| GET | `/integration/e-documents/dashboard?companyId=` | `INTEGRATION_VIEW` | `DashboardData` |
| GET | `/integration/e-inbox?companyId=&status=&page=&size=` | `EDOCUMENT_INBOX` | `InboxData` |
| POST | `/integration/e-inbox/sync?companyId=` | `EDOCUMENT_INBOX` | `SyncInbox` |
| GET | `/integration/e-inbox/{id}` · `/{id}/ubl` · `/{id}/lines` | `EDOCUMENT_INBOX` | `TransferInvoiceLines` |
| POST | `/integration/e-inbox/{id}/match` `{accountId}` · `/{id}/status` `{status, note}` · `/{id}/import` `{branchId, dueDate, description}` | `EDOCUMENT_INBOX` + `FINANCE_MANAGE` (import) | `MatchInboxSupplier`, `SetInboxStatus`, `ImportInboxToInvoice` |
| GET · POST | `/integration/e-inbox/suggestions?purchaseInvoiceId=` · `/integration/e-inbox/{id}/link` `{purchaseInvoiceId}` | `EDOCUMENT_INBOX` | `SuggestMatch`, `MatchInvoice` |
| GET · POST | `/integration/e-inbox/bulk-match?accountId=` · `/integration/e-inbox/bulk-match` `{pairs[]}` | `EDOCUMENT_INBOX` | `BulkMatchList`, `ApplyBulkMatch` |
| GET | `/finance/purchase-invoices/edocument-status?ids=` | `FINANCE_VIEW` | `InvoiceStatusMap` |

**Ekranlar (ZTO görünümü, `.zto-finans` kapsamı; 04 §2):**

| ZTO ekranı | Yeniden yazılsın mı | Blackrose yeri |
|---|---|---|
| `Views/Uyumsoft/Settings.cshtml` (Durum, Bağlantı & Kimlik, Mükellef Sorgusu) | Evet | MX5 Şirket formu → "e-Belge" sekmesi (şifre yazılır, okunmaz; "kayıtlı" rozeti) |
| `Views/Uyumsoft/Dashboard.cshtml` (İşlem Takibi: sayaçlar, hazırlık eksikleri, son işlemler) | Evet | ZTO Finans menüsü → "e-Dönüşüm İşlem Takibi" (şirket seçicili) |
| `Views/Uyumsoft/Inbox.cshtml` (Gelen e-Faturalar; filtre Tümü/Yeni/Eşleşti/İçe Alındı/Reddedildi) | Evet | ZTO Finans → "Gelen e-Faturalar" |
| `_UyumsoftTransferModal` ("Uyumsoft'tan Aktar") | Evet | ZTO görünümlü alış faturası ekleme modalında (MX1 alış faturası) |
| `_UyumsoftInvoiceListTools` (rozet + eşleştir + toplu eşleştir) | Evet | Alış faturası listesi |
| `_UyumsoftSalesListTools` (gönder + durum) | Evet (uyarlanarak) | Navlun faturası listesi (satış faturası yerine); mevcut MUI `EDocumentsPage` (BR: `frontend/src/pages/integrations/EDocumentsPage.tsx`) korunur |
| Sevk listesi e-İrsaliye düğmesi | Evet (uyarlanarak) | Sefer → Belgeler (WAYBILL) |
| Ekranlardaki "Uyumsoft" adı | Hayır | "e-Dönüşüm" — sağlayıcı adı yalnız ayar ve rozet metninde |

## B.7 Riskler

1. **ZTO'nun SOAP katmanı doğrulanmamış iskelet** (`TODO(WSDL)` 16 yerde, yanıtlar etiket taramasıyla, mükellef kararı `"true"`+`"alias"` metin aramasıyla `UyumsoftEInvoiceService.cs:54-57`). Blackrose adaptörü bunu örnek almamalı; WSDL ve test hesabı gelmeden "canlı" sayılmamalı.
2. **Sabit varsayılan şifreleme anahtarı:** ZTO `CryptoKey()` yapılandırma yoksa koddaki sabit bir değere düşüyor (`UyumsoftController.cs:36`; değer yazılmadı). Blackrose'da anahtar yoksa açılış hatası.
3. **İşlem içi gönderim** belge GİB'e gidip kayıt yazılamazsa uzlaştırmasız kalır (FAZ_08 notu) → B.3 madde 2.
4. **Çoklu şirket:** ZTO tek gönderici VKN'si varsayar; Blackrose'da her şirket ayrı Uyumsoft hesabı/etiketi ister → MX5 V22a olmadan adaptör devreye alınmamalı.
5. **e-İrsaliye sorumluluğu** (B.5) yanlış kurgulanırsa aynı sevk için iki e-İrsaliye düzenlenir.

## B.8 Açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| B-S1 | ZTO'ya bağlı sevkiyatlarda e-İrsaliyeyi kim düzenler? | (a) Fabrika (ZTO), BR yalnız ETTN saklar · (b) BR taşıyıcı adına | **(a)** — sevk irsaliyesi malın sahibinin belgesi; ZTO'da akış hazır |
| B-S2 | Adaptöre ne zaman başlanır? | (a) ZTO'daki operasyon adlarıyla hemen · (b) Uyumsoft WSDL + test hesabı alınınca; o zamana kadar port genişletmesi + WireMock | **(b)** |
| B-S3 | e-Fatura/e-Arşiv seçimi | (a) kullanıcı seçer (BR bugünkü) · (b) mükellef sorgusuyla otomatik, kullanıcı ezebilir | **(b)** — ZTO davranışı, hata riskini azaltır |
| B-S4 | Gelen fatura hangi kayda dönüşür? | (a) yalnız `purchase_invoice` · (b) türüne göre `purchase_invoice` veya V34 `expense` (yakıt/servis faturası → araç masrafı) | **(a)** ilk sürüm; (b) V34 sonrası ayrı adım |

---

# BÖLÜM C — Lokalizasyon

## C.1 Mevcut durum

| Konu | ZTO | Blackrose |
|---|---|---|
| Diller | `tr`, `en`, `fr`, `ar` (`Services/AdminSystem/LocalizationCoverage.cs:21`); `ar` RTL | Yalnız `tr` (`frontend/src/i18n.ts:4-8`, `lng/fallbackLng: "tr"`) |
| Kaynak yapısı | View başına, kültür başına `.resx` (3482 dosya; ortak sözlük yok) | Tek dosya `i18n.ts` (1497 satır), modül anahtarları (`common`, `finance` `:246`, `integrations` `:1109`, `fleet` `:1374` …) |
| Anahtar deseni | Türkçe metnin kendisi (`Localizer["Banka Hareketleri"]`) | Anlamsal anahtar (`common.save`) |
| Finans ekranları | 33 finans controller klasöründe 395 `.resx` (envanter E §9) | `finance.*` anahtarları (MUI ekranları) |
| Entegrasyon/lojistik ekranları | `TransportCompany`, `TransportTruck`, `TransportChauffeur`, `SalesProductLogistic` resx'leri var; **Uyumsoft ekranları ve partial'ları 0 `Localizer` çağrısı, resx yok** (sabit Türkçe) | `integrations.*`, `operations.*` |
| Sunucu mesajları | Controller JSON mesajları sabit Türkçe | `BusinessException` mesajları sabit Türkçe (ör. `EDocumentService.java:107-108`); istemci `message`'ı doğrudan gösterir (`frontend/src/api/client.ts:15`) |
| Kullanım | 93 dosya `useTranslation` kullanıyor | — |
| Backlog | — | `X3 i18n (TR birincil; EN altyapısı)` açık (`docs/03_YAPILACAKLAR_BACKLOG.md:133`) |

## C.2 Eşleme tablosu — `ZTO öğe | Blackrose karşılığı (file:line) | Karar`

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| `Resources/Views/<Controller>/<View>.<kültür>.resx` | `i18n.ts` modül anahtarları (`:9-1491`) | **DÖNÜŞTÜR** — ZTO görünümlü ekranlar `ztoFinans.<ekran>.*`, `ztoEdoc.*`, `ztoIntegration.*` ad alanlarında; Türkçe metin değer olur, anahtar olmaz |
| `LanguageController.ChangeLanguage` (çerez) | yok | **ERTELE** — EN eklenince dil seçici + `users.preferred_language` |
| `LocalizationCoverage` + `tests/localizer-missing` | yok | **YENİ** — eksik anahtar testi (vitest: TR'deki her anahtar EN'de var mı) EN aşamasında |
| `_ReportLayout`/`PrintCulture` RTL | MUI tema | **ERTELE** — AR talep gelirse |
| Uyumsoft ekranlarındaki sabit metinler | — | **TR anahtarla yaz** — ZTO'da çeviri olmadığı için kaynak Türkçe metin |
| Sunucu hata mesajları | `ApiError.code` | **GENİŞLET** — istemcide `errors.<CODE>` anahtarı varsa onu, yoksa sunucu mesajını göster (sunucu TR kalır) |

## C.3 Öneri

1. **TR önce, anahtarlı:** ZTO görünümlü her ekran yazılırken metinler doğrudan `t("ztoFinans.bankIntroduction.title")` ile girilir; değerler ZTO'nun `tr` resx'inden (yoksa view'daki Türkçe metinden) alınır. Ek maliyet ekran başına yaklaşık %5–10.
2. **Altyapı adımı (X3'ün ilk yarısı):** `i18n.ts` → `src/locales/tr/{common,finance,ztoFinans,ztoEdoc,ztoIntegration,…}.json` (i18next ad alanları; tembel yükleme), eksik anahtar testi, `errors.<CODE>` eşlemesi. ≈ 2–3 iş günü.
3. **İkinci dil EN:** ZTO'nun `en` resx'leri finans ekranlarının çoğu için hazır kaynak (finans `.resx` 395 dosyanın yaklaşık dörtte biri `en`). Dışa dönük ekranlar önce: takip sayfası (`TrackingPage`), e-posta şablonları, PDF (CMR/fatura). Tahmin: ZTO finans + e-dönüşüm + entegrasyon ekranları için ≈ 6–8 iş günü (çeviri + gözden geçirme), MUI mevcut ekranlar ≈ 4–5 iş günü.
4. **FR/AR:** yalnız müşteri talebinde. AR için RTL (MUI `direction: rtl` + stylis RTL eklentisi) ve ZTO'nun Bootstrap 4 CSS'inin RTL karşılığı gerekir; ≈ 10–15 iş günü. ZTO'nun `fr` kapsamı `en`'den düşük (808/814).

## C.4 Riskler

1. ZTO'da anahtar = Türkçe metin olduğundan aynı metin farklı bağlamda farklı çevrilemez; doğrudan kopyalama EN'de tutarsızlık yaratır.
2. Sunucu mesajları TR sabit kaldıkça EN arayüzde karışık dil görünür (`errors.<CODE>` eşlemesi bunu kısmen çözer).
3. Tek dosya `i18n.ts` büyüdükçe birleştirme çakışması artar; ZTO ekranları eklenmeden bölünmeli.

## C.5 Açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| C-S1 | İkinci dil | EN · FR · AR | **EN** — ihracat müşterileri ve dışa dönük belgeler; ZTO kaynağı en dolu |
| C-S2 | Anahtar biçimi | (a) ZTO gibi Türkçe metin · (b) anlamsal anahtar | **(b)** — Blackrose deseni, bağlama göre çeviri |
| C-S3 | `i18n.ts` bölünmesi ne zaman? | (a) 12.0 ön yüz altyapısıyla birlikte · (b) EN eklenirken | **(a)** — ZTO ekranları eklenmeden, çakışmaları önler |
| C-S4 | Sunucu mesajları | (a) sunucuda çok dilli · (b) istemcide `errors.<CODE>` | **(b)** — sunucu değişmez, kodlar zaten standart |

---

# BÖLÜM D — Arka plan işleri

## D.1 Eşleme tablosu — `ZTO öğe | Blackrose karşılığı (file:line) | Karar`

| ZTO öğe (kayıt `Program.cs`) | İşlev | Blackrose karşılığı (file:line) | Karar |
|---|---|---|---|
| `UyumsoftInboxWorker` (`:116`; 30 dk) | Gelen e-fatura çekimi, tüm kiracılar | yok | **YENİ** `EDocumentInboxJob` — `@Scheduled(fixedDelay=PT30M)`, `TenantJobs.forEachActiveTenant` (BR: `tenant/TenantJobs.java:22-33`) içinde `inbox_enabled` şirketleri dolaşır; şirket başına ayrı işlem ve hata yakalama |
| (ZTO'da yok) e-belge durum sorgusu | — | `EDocumentStatusJob` (BR: `integration/service/EDocumentStatusJob.java:19`, 15 dk) | **DÜZELT** — `refreshPending` tüm SENT belgeleri tek işlemde sorguluyor (`EDocumentService.java:232-241`); bir sağlayıcı hatası kiracının tüm güncellemelerini geri alır → belge başına işlem, `last_polled_at` ile sayfalı |
| `HksBildirimQueueWorker` (`:200`) | HKS kuyruğu, retry | — | **ÇIKAR** (tarım); **DESEN** → `IntegrationOutboxDispatcher` |
| ZtoHal push (worker yok, kullanıcı tetikli) | Hal'e sevk itme | yok | **YENİ** `IntegrationOutboxDispatcher` — `fixedDelay=PT30S`; `SELECT … FOR UPDATE SKIP LOCKED LIMIT 50`; HTTP çağrısı işlem dışında; backoff §A.8 |
| (yok) | — | — | **YENİ** `PartnerVehicleSyncJob` gerekmez — araç listesi değişince olay (`partner.vehicles_changed`) |
| TCMB (`ITCMBExchangeRateService`, `:106`; worker yok, istekte çekip 1 sa önbellek) | Kur | `RateRefresher` (BR: `finance/service/RateRefresher.java:53, 59`; açılışta + iş günü 15:45/16:45/17:45) | **BR YETERLİ** — ZTO deseni taşınmaz |
| `NotificationBackgroundService` (`:75`; gövde yorumda — `NotificationBackgroundService.cs:28-48`) | Sevk/cihaz/iş emri bildirimleri (kapalı) | `DailyDigestMailer` (BR: `notification/DailyDigestMailer.java:67`) + `PaymentDigestSections`, `FleetDigestSection`, `DriverExpenseDigestSection`; anlık `DeliveryNotifier` (`shipment/service/DeliveryNotifier.java:109-110`, AFTER_COMMIT) | **BR YETERLİ** |
| Finans hatırlatmaları (vade, çek, kredi taksiti) | ZTO'da worker görülmedi | `PaymentDigestSections` | **GENİŞLET** — V24/V32 sonrası çek vadesi ve kredi taksiti bölümleri (MX3 ile birlikte) |
| Frigga (worker yok, istekte) | Casus cihaz verisi | `GpsService.ingest` (BR: `integration/service/GpsService.java:58`) — sağlayıcı yok, push API | **AÇIK** — GPS sağlayıcısı seçilince `GpsPollJob` veya sağlayıcı webhook'u (FAZ_08) |
| `SystemMonitorWorker` (`:32`), `DbSaturationDiagnosticsWorker` (`:33`) | Sağlık, DB teşhisi | `DependencyHealth` (BR: `saas/service/DependencyHealth.java:149`, 60 sn) + actuator | **ÇIKAR** |
| `RestartService` (`:53`), `ApplicationPoolKeepAliveService` (`:56`) | IIS'e özgü | — | **ÇIKAR** |
| `AppUpdateStatusWorker` (`:77`) | Sürüm duyurusu | — | **ÇIKAR** (gerekirse SaaS konsolu) |
| `AIDailyTrainingHostedService` (`:137`) | AI eğitimi | — | **ÇIKAR** |
| — | — | `IdentityCleanupJob` (`identity/service/IdentityCleanupJob.java:34`), `MailEventService` (`notification/mail/MailEventService.java:113`), `BillingService` (`saas/service/BillingService.java:88`) | Değişmez |

## D.2 Boşluklar ve gerekli eklemeler

1. **Zamanlayıcı havuzu tek iş parçacığı:** `@EnableScheduling` (`tenant/AsyncConfig.java:9`) var, `spring.task.scheduling.pool.size` tanımlı değil → uzun SOAP/HTTP çağrıları (gelen kutusu, outbox) TCMB ve özet e-postalarını geciktirir. Öneri: havuz 4 + dış çağrılar için ayrı sınırlı `ThreadPoolTaskExecutor`.
2. **Dağıtık kilit yok:** çok örnekli kurulumda her iş her örnekte çalışır (gelen kutusu çift çekim, durum sorgusu çift çağrı, outbox çift gönderim). Öneri: ShedLock (JDBC, admin şeması) zamanlanmış işler için; outbox satırları ayrıca `SKIP LOCKED` ile.
3. **Kiracı döngüsü sıralı** (`TenantJobs.java:23`): kiracı sayısı arttıkça 30 dk'lık gelen kutusu turu uzar → iş başına süre ölçümü (Micrometer) ve kiracı başına zaman aşımı.
4. **Gözlemlenebilirlik:** ZTO `ZT_UyumsoftLog` / `Log` tablosu karşılığı olarak `edocument_log` ve `integration_outbox` durum sayaçları `/actuator/prometheus`'a; Dashboard ekranları bu tablolardan okur.

## D.3 Riskler

1. Outbox göndericisi tek iş parçacıklı zamanlayıcıda kalırsa ZTO'ya durum olayları dakikalarca gecikir.
2. Gelen kutusu ilk çalıştırmada geçmiş tüm faturaları çekebilir → ilk senkron başlangıç tarihi şirket ayarında zorunlu (`inbox_last_sync` boşsa son 30 gün).
3. ZTO'da kuyruk yokken (bugünkü ZtoHal gibi) talepler kullanıcı ekranı kapanınca kaybolur; ZTO tarafı outbox'ı E2'nin önkoşuludur.

## D.4 Açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| D-S1 | Çok örnekli kurulumda iş kilidi | (a) ShedLock · (b) yalnız satır kilidi (`SKIP LOCKED`) · (c) tek örnek varsayımı | **(a) + (b)** — zamanlanmış işler ShedLock, outbox satırları SKIP LOCKED |
| D-S2 | Zamanlayıcı havuzu | (a) varsayılan 1 · (b) 4 + ayrı G/Ç yürütücüsü | **(b)** |
| D-S3 | Gelen kutusu periyodu | 15 dk · 30 dk (ZTO) · 60 dk | **30 dk** + ekranda "Şimdi Senkronize Et" |
| D-S4 | Outbox deneme politikası | (a) 1 dk → 6 sa, 12 deneme, sonra DEAD · (b) sınırsız | **(a)** — DEAD olay ekrandan elle yeniden kuyruğa alınır, ortak webhook'u 410'da kapanır |

---

## 10 satırlık özet

1. K5 için Blackrose'a dış API `/api/v1/integrations/zto/...` (14 uç) ve ZTO'ya tek HMAC'li webhook ucu tasarlandı; ZTO Fabrika kodu değiştirilmedi, ZTO tarafı 12 maddelik liste.
2. Kimlik: ZTO → BR OAuth2 client credentials (admin `integration_client`, kısa ömürlü JWT, kapsam, 7 günlük döndürme örtüşmesi); BR → ZTO Standard Webhooks HMAC (`WebhookSignature` yeniden kullanılır).
3. Idempotency `externalRef = ZTF:{db}:{ST|RS}:{id}` + `requestVersion`; giden olaylar transactional outbox, sefer başına `eventVersion`, `/events` ile kurtarma.
4. Gelen talep önce `zto_transport_request` kuyruğuna düşer, operasyon onayıyla (ya da ortak bazında otomatik) sefere döner; şirket/şube/seri MX5 `company` üzerinden.
5. Blackrose migration'ları: `A-xS1` + `V2xS1–V2xS5` (A), `V2xS6–V2xS8` (B); aşamalar E0–E6, Blackrose ≈ 25–30, ZTO ≈ 15–20 iş günü.
6. ZTO Uyumsoft'u ekran ve tablo olarak eksiksiz, ama SOAP katmanı `TODO(WSDL)` iskeleti; Blackrose adaptörü WSDL ve test hesabı gelince yazılmalı.
7. Blackrose e-belge portu şirket başına sağlayıcı/kimlik, gelen kutusu, işlem dışı gönderim ve GİB uyumlu irsaliye UBL'i için genişletilmeli; gelen fatura `PurchaseInvoiceService` ile alış faturasına döner.
8. Fabrika sevkiyatında e-İrsaliyeyi fabrika düzenler, Blackrose ETTN'yi saklar; çift navlun kaydı ETTN eşleşmesiyle önlenir.
9. Lokalizasyon: ZTO ekranları TR ve anlamsal anahtarla yazılır, `i18n.ts` 12.0'da ad alanlarına bölünür, ikinci dil EN (≈ 10–13 iş günü), AR/FR talebe bağlı.
10. Arka plan: yeni `EDocumentInboxJob` ve `IntegrationOutboxDispatcher`; zamanlayıcı havuzu ve ShedLock eksik; TCMB ve bildirimlerde Blackrose yeterli; 16 açık soru öneriyle işaretli.
