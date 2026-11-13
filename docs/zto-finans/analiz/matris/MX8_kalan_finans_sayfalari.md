# MX-8 — Kalan finans sayfaları: SalesTruckExpenses, MaterialStockAll, BankAccounts, Finance*, AmountType/TransactionType, kapsanmayan controller'lar

> Tarih: 2026-11-13 · Durum: öneri (koordinatör onayı bekliyor)
> Kaynak (salt okunur): `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` (kısaltma **ZTO**). Hedef: `F:\visual studio zto\LogisticErp` (kısaltma **BR**).
> Dayanak belgeler: `04_UYARLAMA_KARAR_MATRISI.md` (tek finans motoru, V22–V34), `MX1` (V22 `account_bank_account`), `MX4` (V34 `expense`), `MX5` (şirket→şube, `user_branch`), envanter `B_banka_kasa.md`, `D_stok_masraf_kur_sube.md`.
> Karar kodları 04 §3 ile aynı: **UI-API**, **UI+GEN**, **UI+YENİ**, **UI+TABLO**, **ÇIKAR(gerekçe)**.
> Migration adları `V2xR1…` biçimindedir; sırayı koordinatör verir. 04 §4'te zaten olanlar "Vxx kapsar" diye yazıldı.
> Bu belgede gizli değer, kişi verisi ya da bağlantı dizgisi yoktur; gerekirse `__PLACEHOLDER__` kullanılır.

Kısaltmalar: STE = `Controllers/SalesTruckExpensesController.cs` · CSD = `Views/SalesTruckExpenses/CompanySalesDetails.cshtml` · STI = `Views/SalesTruckExpenses/Index.cshtml` · MSA = `Controllers/MaterialStockAllController.cs` · BAC = `Controllers/BankAccountsController.cs` · TFS = BR `shipment/service/TripFinanceService.java` · SC = BR `shipment/web/ShipmentController.java` · VES = BR `fleet/service/VehicleExpenseService.java` · FC = BR `finance/web/FinanceController.java` · V7 = BR `db/migration/tenant/V7__create_shipment.sql` (diğer V'ler de aynı klasörde).

---

## 0. Özet karar tablosu

| # | ZTO öğesi | Karar | BR dayanağı | Migration |
|---|---|---|---|---|
| 1 | `/SalesTruckExpenses/Index` + `CompanySalesDetails` | **UI+TABLO** — "Taşeron Nakliye Giderleri": taşeron cari bazlı özet + sefer listesi; kayıt `trip_cost (kind=SUBCONTRACTOR)` | `trip_cost` V7:150-171, TFS:191-313, SC:295-334, `shipment_leg.carrier_account_id` V7:68 | **V2xR1** `trip_cost_subcontract` |
| 2 | `/MaterialStockAll/Index`, `/MaterialStockProduction/Index` | **ÇIKAR** (üretim ambalaj/hammadde stoğu). Yakıt/lastik/parça → `vehicle_expense` + V34 `expense`. Sarf deposu ileride ayrı faz | `vehicle_expense` V6:58-83 (`liters`, `tire_position`), `stock_item.account_id NOT NULL` V8:33-45 | yok |
| 3 | `BankAccountsController` (Index/Add/Edit/Delete) | **UI+TABLO** — cari IBAN kartları | V22 `account_bank_account` (MX1 §4.1, MX2:710-714) | **V22 kapsar** (+ §3.6'daki 3 kolon notu) |
| 4a | `FinanceController` (`/Finance/Index`) | **ÇIKAR** (eski ikincil sayfa; finans menüsünde yok, girişte açılmıyor) | `FinanceDashboardPage.tsx`, FC:205, :429 | yok |
| 4b | `FinanceMaintenanceController` (`OrphanDebts`) | **ÇIKAR** (BR'de sahipsiz borç oluşamaz: `UNIQUE(source_type, source_id)` V3:35 + ters kayıt) | `LedgerService.reverseSource` | yok |
| 4c | `FinancePersonController` | **ÇIKAR** (ekran) → kullanıcı + rol + şube kapsamı | Rol `FINANCE`/`FINANCE_SUPER` V2:95-116; MX5 `user_branch` | **MX5 `user_branch` kapsar** |
| 5a | `AmountType` (+ `AmountTypeApiController`) | **ÇIKAR** (üretim/reçete birimi; finans okumuyor) | `stock_item.unit` V8:38, V34 `expense_line.unit` | yok |
| 5b | `TransactionType` (+ `TransactionApiController`) | **ÇIKAR** (tabloyu yalnız silo emri kullanıyor; finansta aynı adlı **kolon** var) | `FundDirection IN/OUT` `FinanceTypes.java:32` | yok |
| 6 | Kapsanmayan finans adlı controller'lar | §6 tablosu — 1 tanesi yeni MX gerektiriyor (`RecipeFinance`), 1 tanesi küçük UI-API (`Currency`), kalanı ÇIKAR | — | — |

---

## 1. `/SalesTruckExpenses/Index` — satış sevk aracı nakliye giderleri

### 1.1 Ne yapıyor

ZTO'da kendi masraf tablosu yok. Ekran, satış sevk aracının (`ZT_SalesTruck`) nakliye kolonlarını düzenler ve nakliye firmasının carisine borç (`ZT_AccountDebts`) yazar. Bir araçta en çok iki gider olur: **Sevk Nakliye** (kara) ve **Gemi Nakliye** (deniz). Envanter D §2 ve "özel soru (b)" ayrıntıyı verir; burada yalnız eşleme için gerekenler var.

Lojistik firması açısından karşılığı: **taşerona verilen taşıma işinin gideri ve taşeronun alacağı.** Kendi aracımızla yapılan taşımada bu ekranın karşılığı yoktur; o gider `vehicle_expense` / `trip_cost` (yakıt, otoyol) ile girilir.

### 1.2 Route / action

| Satır | Action | Fiil | Öznitelik | BR karşılığı |
|---|---|---|---|---|
| STE:11-12 | `Index(branchId, workPlaceId, days=150)` | GET | `[Authorize]` (yalnız bu action) | **YENİ** `GET /api/v1/shipment/subcontract-costs/summary?branchIds&days` |
| STE:291 | `CompanySalesDetails(transportCompanyId, companyName, days, branchId, workPlaceId)` | GET | **yok** | **YENİ** `GET /api/v1/shipment/subcontract-costs?carrierAccountId&branchIds&days` |
| STE:659 | `GetTransportCompanies()` | GET | yok | **UI-API** `GET /api/v1/finance/accounts?types=CARRIER` (tür filtresi MX1 §4.2 GEN; bugün FC:135-140 yalnız `search`) |
| STE:694 | `GetCurrencies()` | GET | yok | **UI-API** `GET /api/v1/finance/currencies` FC:501 |
| STE:731 | `UpdateSalesTruck([FromBody])` | POST | yok | **GEN** `POST /shipment/shipments/{id}/costs` SC:308 (kayıt yoksa) / **YENİ** `PUT /shipment/costs/{id}` (kayıt varsa) |
| STE:1075 | `DeleteSalesTruckExpense([FromBody])` | POST | yok | **GEN** `DELETE /shipment/costs/{id}` SC:323 (finansa yazılmamışsa) / **YENİ** `POST /shipment/costs/{id}/reverse` (yazılmışsa) |
| STE:1144 | `UpdateTransportInfo([FromBody])` | POST | yok | **ÇIKAR** — çağıran view yok (envanter D §2.3) |

### 1.3 Görünümler, modallar, AJAX

**STI (Index, 736 satır, `_ProductionLayout`)**
- Filtre: Şube select → İş Yeri select → sayfa yeniden yüklenir (`STI:615`). BR'de tek `branch` (MX5'teki şube gruplu seçim bileşeni).
- Tablo: Sıra · Nakliye Firması · Şirket Adı · İletişim · Adres · Nakliye Sayısı · Toplam Nakliye Fiyatı (`STI:353-359`). Satır tıklaması → `CompanySalesDetails` (`STI:640`). Cari ekstre linki `/AccountTransaction/Transactions/{caId}` → BR cari ekstre (MX1).
- `detailModal` (`STI:495`) ve `companyInfoModal` (`STI:519`): `/SalesTruck/GetCompanySalesDetails`, `/SalesTruck/GetCompanyInfo` çağırır (`STI:662`, `:694`). **Bu controller ZTO'da yok** → iki modal da çalışmıyor. Karar: `companyInfoModal` → **UI-API** (`GET /finance/accounts/{id}`, cari kartı bilgisi); `detailModal` → **ÇIKAR** (aynı veriyi `CompanySalesDetails` sayfası zaten gösteriyor).

**CSD (CompanySalesDetails, 2107 satır)**
- Filtre: `branchFilterCSD`, `workPlaceFilterCSD`, `daysFilter` (gün, varsayılan 150) (`CSD:496-527`).
- Tablo `salesDetailsTable` (`CSD:544-557`): Araç No · Müşteri · Parti No · Fatura No · Plaka · Dorse Plaka · İş Yeri(Şube) · Şoför · Telefon · Yükleme Tarihi · Nakliye Türü · Nakliye · Finansal Bilgiler · İşlem. Butonlar: `fin-info-btn` (finansal bilgi açılır kutusu, `CSD:686`), `show-shipping-detail-btn` (`CSD:695`), `delete-sales-expense-button` (`CSD:708`, native `confirm()` `CSD:1450-1455`).
- **`salesModal`** (`CSD:762-965`) — "Nakliye bilgisi düzenle":

| Alan (id) | Etiket | Tür / doğrulama | Kaynak | BR alanı |
|---|---|---|---|---|
| `salesId`, `SalesTruckID` | — | hidden | satır | `shipment.id` (+ `trip_cost.id` varsa) |
| `TransportType` | Nakliye Türü | readonly metin ("Sevk Nakliye"/"Gemi Nakliye") | satır | `shipment_leg.transport_mode` (**V2xR1**) — ROAD→"Sevk Nakliye", SEA→"Gemi Nakliye" |
| `TransportCompany` | Nakliye Firması | select, zorunlu (`≠0`, CSD JS) | `GetTransportCompanies` (`TransportType='Sevk İhracat Nakliye'` STE:231) | `trip_cost.account_id` (CARRIER cari); varsayılan `shipment_leg.carrier_account_id` |
| `TransportCompanyPrice` | Nakliye Tutarı | number step 0.01, `>0` zorunlu | — | `trip_cost.amount` (net) |
| `CurrencyID` | Para Birimi | select, zorunlu | `GetCurrencies` | `trip_cost.currency` (ISO) |
| `KDVAmount` | Fatura KDV | number step 1 | — | `trip_cost.vat_amount` (**V2xR1**) |
| `WithholdingTax` | Tevkifat | number step 1 | — | `trip_cost.withholding_amount` (**V2xR1**) |
| `TotalAmount` | Toplam Tutar | number step 1, **elle** | — | hesaplanır: net + KDV (readonly; §1.7-Ç2) |
| `AdvanceAmount` | Avans(Yakıt) | number step 1, **elle** | — | hesaplanır: bu gidere bağlı ödemeler (`settlement.origin_type='TRIP_COST'`, **V32 kapsar**) |
| `RemainingAmount` | Kalan Tutar | elle | — | hesaplanır |
| `DeductionAmount` | İndirim | elle | — | `trip_cost.deduction_amount` (**V2xR1**) |
| `BalanceAmount` | Bakiye | elle | — | hesaplanır: net + KDV − tevkifat − kesinti − avans |
| `PaidAmount` | — | hidden 0 | — | hesaplanır (ödemeler) |
| `WorkPlaceID` | İş Yeri * | select, zorunlu | Razor `ViewBag` | `shipment.branch_id` (readonly; gider seferin şubesine yazılır) |
| `debtDocumentNo` | Belge No / Fatura No | metin | — | `trip_cost.document_no` (**V2xR1**) |
| `debtDocumentType` | Belge Türü | select (Alış Faturası [varsayılan], Kasa Fişi, Serbest Meslek Makbuzu, Yurt Dışı Fatura, Proforma Fatura, Sevk İrsaliyesi, Hizmet Faturası, E-Fatura, Gider Pusulası, Diğer) | sabit | `trip_cost.document_type` (**V2xR1**; değer listesi V26 `account_document.document_type` tohumuyla ortak) |
| `Description` | Açıklama | textarea | — | `trip_cost.description` (≤500) |
| Butonlar | İptal · **Kaydet** (`saveSales` → `UpdateSalesTruck`, CSD:1407) | | | |

- `shippingDetailModal` (`CSD:971`): salt okunur; `/AccountTransaction/GetTransactionDetails` (`CSD:1557`) → BR `GET /finance/accounts/transactions/{id}/source` (MX1 §4.2, YENİ).

### 1.4 Okunan / yazılan tablolar

| ZTO tablo | R/W | Satır | BR karşılığı |
|---|---|---|---|
| `ZT_SalesTruck` (yalnız nakliye kolonları) | R/W | STE:143-166, UPDATE :779, :831, :1105, :1152 | `shipment` + `shipment_leg` (okuma) + `trip_cost` (yazma) |
| `ZT_AccountDebts` (`AccountingType='Sevk Nakliye Firması'`, `ReferenceID=SalesTruck.ID`, `TransportType`) | R/W | INSERT :959, UPDATE :925, DELETE :1093 | `account_transaction` — yalnız `LedgerService.post` ile, `source_type='TRIP_COST'`, `source_id=trip_cost.id` (TFS:52, :290-300) |
| `ZT_CustomerAccounts` (`AccountGroup='Sevk Nakliye Firması'`) | R | :202, :308, :890 | `account (type=CARRIER)` |
| `TransportCompany`, `TransportChauffeur` | R | | `account (CARRIER)`, `driver` |
| `ZT_SalesTruckBatchNumbers` | R | :442, :514 | ÇIKAR (parti no üretime ait; "Parti No" sütunu → `shipment_cargo` referansı ya da boş) |
| `ZT_LocationPricing` | R | :613 | ÇIKAR (§6; fiyat tarifesi BR CRM `tariff` V5:98) |
| `Customer`, `Factory`, `ZT_WorkPlace`, `ZT_BranchProvince` | R | | `account (CUSTOMER)`, `branch` |
| Rol tabloları `ZT_AccountingPurchases`, `ZT_FinancePerson`, `ZT_Boss` | R | :26-106 | `@PreAuthorize` + MX5 şube kapsamı |

### 1.5 Finans dışı bağımlılıklar

- `ZT_SalesTruck` kaydını oluşturan asıl modül `SalesProduct` / `SalesProductLogistic`; aynı borcu **üç ayrı yer** yazıyor: `SalesProductController.cs:2426-2487`, `SalesProductLogisticController.cs:2452-2469` (silme :2826), STE. BR'de tek yazıcı `TripFinanceService` olur.
- Sevk / gemi ayrımı, şoför, plaka, dorse, müşteri, parti → BR `shipment`, `shipment_leg` (`vehicle_id`, `trailer_id`, `driver_id`, `carrier_account_id` V7:57-75).
- Lokasyon fiyatlandırma (`ZT_LocationPricing`) — BR CRM tarifesi; bu ekranda yalnız okunuyor, UPDATE'e girmiyor.

### 1.6 ZTO hataları (kopyalanmaz)

| # | Hata | Yer |
|---|---|---|
| H1 | `Index` dışındaki tüm action'larda `[Authorize]` yok; `UpdateSalesTruck` ve `DeleteSalesTruckExpense` yetkisiz çağrılabilir (global fallback politikası bulunamadı) | STE:9-11 |
| H2 | Cariye yazılan tutar `TransportCompanyPrice` (net); modaldaki KDV, tevkifat, toplam, kesinti cariye **yansımıyor** | STE:886, :941, :971 |
| H3 | Borcun para birimi carinin para birimi, tutar modelin para birimi → para birimi karışır; kur sabit `1.0000` | STE:900, :936, :965 |
| H4 | Cari bulunamazsa borç yazılmaz, kullanıcıya yine "başarılı" döner | STE:~985 |
| H5 | Her güncellemede borç tarihi `DateTime.Now` yapılır (belge tarihi kayar) | STE:940 |
| H6 | `UpdateSalesTruck` iki ayrı komut, transaction yok | STE:731-1038 |
| H7 | `TransportType` SQL'e string birleştirme ile giriyor (enjeksiyon) | STE:907 |
| H8 | Silme = borç **hard DELETE** + sevk alanlarını NULL/0 (iz kalmaz) | STE:1093-1106 |
| H9 | İş yeri filtresi borç üzerinden → borcu olmayan sevk filtreli listede görünmez | STE:116-131 |
| H10 | `TotalAmount`, `BalanceAmount` vb. elle girilir, hesaplanmaz; `step=1` tamsayı (kuruş girilemez) | CSD:844-888 |
| H11 | `detailModal` / `companyInfoModal` var olmayan `/SalesTruck/*` uçlarına gidiyor | STI:662, :694 |
| H12 | `SalesProductController` borç arama sorgusu `TransportType` süzmüyor → sevk ve gemi borcu karışabilir (bu kapsamda çalıştırılarak doğrulanmadı) | `SalesProductController.cs:2438-2440` |

### 1.7 BR davranışıyla çakışmalar ve çözüm

| # | ZTO | BR | Öneri |
|---|---|---|---|
| Ç1 | Kaydet → borç **hemen** cariye yazılır | `trip_cost` ancak sefer **kapanınca** (INVOICED→CLOSED) cariye yazılır + taslak ödeme planı açılır (TFS:270-313) | Bu ekrandan girilen `SUBCONTRACTOR` gideri için **YENİ** `POST /shipment/costs/{id}/post`: aynı `ledger.post` + `plans.create` mantığı, `markPosted`. `close()` zaten `postedAt != null` satırı atlıyor (TFS:286) → çift kayıt olmaz. Kaydet butonu "kaydet + cariye işle" olarak çalışır (ZTO akışı). Bkz. açık soru S1 |
| Ç2 | Toplam, kalan, bakiye elle | Tutarlar hesaplanır | Alanlar aynı yerde kalır, **readonly** ve otomatik hesaplanır (ekranda tek görünür fark). Cariye yazılan tutar = net + KDV − tevkifat − kesinti (H2 düzeltmesi). `amount`/`tl_amount` net kalır → sefer kârlılığı (TFS:328) bozulmaz |
| Ç3 | Avans(Yakıt) elle sayı | Ödeme yalnız banka/kasa seçimiyle gerçek kayıt (04 §6.1-K1) | Avans alanı readonly; yanına "Avans Öde" düğmesi → standart ödeme modalı (`POST /finance/payments` FC:296), `settlement.origin_type='TRIP_COST'`, `origin_id=trip_cost.id` (**V32 kapsar**). Bkz. S2 |
| Ç4 | Düzenle = yerinde UPDATE | `UNIQUE(source_type, source_id)` V3:35; finansa yazılmış gider silinemez (TFS:263-266) | Yazılmış gider düzenlenirse: `reverseSource('TRIP_COST', eskiId)` + eski satır `REVERSED` + yeni `trip_cost` satırı + yeni posting. Yazılmamışsa yerinde güncelleme |
| Ç5 | Sil = hard DELETE | Ters kayıt | Sil düğmesi aynı; arkada yazılmışsa `POST /shipment/costs/{id}/reverse`, değilse `DELETE /shipment/costs/{id}` (SC:323) |
| Ç6 | Sevk başına en çok 2 gider (sevk + gemi) | Seferde N gider, ayak (`leg_id`) bazında | Ekran satırı = (sefer, taşeron ayağı). Gemi/kara ayrımı ayağın taşıma şeklinden gelir |
| Ç7 | İş yeri select'i modalda değiştirilebilir | Gider seferin şubesine yazılır (`shipment.branch_id`, TFS:293) | İş Yeri alanı readonly gösterilir |

### 1.8 Eşleme tablosu

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| Index özet tablosu (firma, nakliye sayısı, toplam) | yok — `trip_cost` yalnız sefer bazında okunuyor (SC:295) | **UI+YENİ** `GET /shipment/subcontract-costs/summary` (`account_id` bazında `count`, `sum(tl_amount)`, para birimi kırılımlı) |
| Index şube/iş yeri/gün filtresi | `shipment.branch_id`, `planned_pickup` (V7:10, :18) | **UI+YENİ** (aynı uçta parametre) |
| `companyInfoModal` | `GET /finance/accounts/{id}` FC:142 | **UI-API** (ZTO'daki kırık çağrı düzeltilmiş olur) |
| `detailModal` | — | **ÇIKAR** (kırık; `CompanySalesDetails` aynı veriyi veriyor) |
| CompanySalesDetails tablosu | `shipment` + `shipment_leg` + `trip_cost` + `freight_invoice.number` (V7:126) + `vehicle.plate` + `driver` | **UI+YENİ** `GET /shipment/subcontract-costs?carrierAccountId` |
| "Parti No" sütunu | yok (üretim partisi) | **ÇIKAR** — sütun yerinde müşteri referans no / yük açıklaması gösterilir (S5) |
| "Finansal Bilgiler" açılır kutusu | `CostResponse` SC:267-277 (+ V2xR1 alanları) | **UI+GEN** |
| `salesModal` kaydet (yeni) | `POST /shipment/shipments/{id}/costs` SC:308, `SaveCostRequest` `ShipmentDtos.java:257-265` | **UI+GEN** — DTO'ya `vatAmount`, `withholdingAmount`, `deductionAmount`, `documentNo`, `documentType` eklenir; `kind=SUBCONTRACTOR` |
| `salesModal` kaydet (var olan) | yok | **UI+YENİ** `PUT /shipment/costs/{id}` (Ç4) |
| Cariye yazma | `LedgerService.post` TFS:290-300 | **UI+YENİ** `POST /shipment/costs/{id}/post` (Ç1) |
| Sil | `DELETE /shipment/costs/{id}` SC:323, TFS:255-268 | **UI+GEN** + **UI+YENİ** `POST /shipment/costs/{id}/reverse` |
| Avans(Yakıt) | `POST /finance/payments` FC:296; `settlement` V3:212 | **UI+GEN** (V32 `origin_type/origin_id`) |
| Belge No / Belge Türü | yok | **UI+TABLO** (V2xR1) |
| Nakliye Türü (Sevk/Gemi) | yok | **UI+TABLO** (V2xR1 `shipment_leg.transport_mode`) |
| `GetTransportCompanies` | FC:135 (`type` filtresi yok) | **UI+GEN** (MX1 §4.2 `types=CARRIER`) |
| `GetCurrencies` | FC:501 | **UI-API** |
| `shippingDetailModal` → `GetTransactionDetails` | MX1 §4.2 `/accounts/transactions/{id}/source` | **UI+YENİ** (MX1 kapsar) |
| V34 `expense` aynası | MX4 A.5: `trip_cost` kaydında `expense(context_type='SHIPMENT', source_type='TRIP_COST')` | **V34 kapsar** — `expense.vat_amount`/`withholding_amount` V2xR1 alanlarından doldurulur |
| `UpdateTransportInfo` | — | **ÇIKAR** (çağıran yok) |
| Menü "Sevk Nakliye Masrafları" (`_SideMenu_FinanceItems`) | "ZTO Finans" menüsü (04 §2) | **UI** — etiket: S5 |

### 1.9 Migration

**V2xR1 `trip_cost_subcontract`** (V34'ten önce; V32'den sonra çünkü avans bağı `settlement.origin_*` kullanır)
```
ALTER TABLE trip_cost
  ADD COLUMN vat_amount         NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
  ADD COLUMN withholding_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0),
  ADD COLUMN deduction_amount   NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  ADD COLUMN document_no        VARCHAR(50),
  ADD COLUMN document_type      VARCHAR(40),
  ADD COLUMN cost_date          DATE,              -- ZTO H5: belge tarihi sabit kalır
  ADD COLUMN status             VARCHAR(20) NOT NULL DEFAULT 'OPEN',   -- OPEN | POSTED | REVERSED
  ADD COLUMN replaced_by_id     UUID REFERENCES trip_cost(id);        -- Ç4 düzenleme zinciri
ALTER TABLE shipment_leg
  ADD COLUMN transport_mode VARCHAR(10) NOT NULL DEFAULT 'ROAD';      -- ROAD | SEA | RAIL | AIR
CREATE INDEX trip_cost_account_idx ON trip_cost (account_id) WHERE deleted = FALSE;
```
`posted_at` (V7:161) korunur; `status` ondan türetilmiş bir kolon değil, ters kayıt durumunu da tutar. İzin: yeni izin gerekmez (`SHIPMENT_VIEW` / `SHIPMENT_DISPATCH` / `SHIPMENT_INVOICE`, SC:84-86); "cariye işle" ve "ters kayıt" `SHIPMENT_INVOICE` ister.

---

## 2. `/MaterialStockAll/Index` + `/MaterialStockProduction/Index`

### 2.1 Ne yapıyor (kısa)

- MSA (8018 satır, 30+ action; envanter D §1.1): `ContainerType` kartlarının (ambalaj, kasa, palet, sarf, gıda hammaddesi) iş yeri + şube bazlı **sayaç tablosu** `ZT_MaterialStockAll` (`RemainingAmount`, `UsedAmount`, `SalesAmount`, `LossesAmount`). Girişi alış faturası (`ZT_MaterialInvoice` + `ZT_MaterialPurchases`), çıkışı üretim tüketimi, malzeme satış faturası ve kayıp. Her alış/satış faturası `ZT_AccountDebts` / `ZT_AccountCredits` yazar (MSA:1684-1800, :6886-6957).
- Index (2017 satır): tablo Sıra No · Şube · İş Yeri · Malzeme Türü · Malzeme Adı · Kalan · Kullanılan · (Satılan+İade) · Kayıp · Stok Durumu · İşlemler (`Views/MaterialStockAll/Index.cshtml:1024-1034`); `purchasesModal` (Fatura No, Tarih, Tedarikçi, Parti No, Üretim Adedi, Fatura Miktarı, Birim Fiyat — :1159-1165) ← `GetPurchasesByContainerType`, `GetPurchaseCountsByContainerTypes`; `_CriticalStockModal` ← `CriticalStocksJson`. Diğer 13 view (Add/Edit/AddSales/EditSales/Losses/…) ~17.000 satır.
- MaterialStockProduction (169 satır, `Index(int wp)`): aynı tablonun salt-okunur görünümü (Malzeme · İş Yeri · Şube · Stok · Min/Max · Durum — view :232-237). Yazma yok.
- Finans menüsünde link var (`_SideMenu_FinanceItems`: `/materialstockall/index`).

### 2.2 Seçenekler

| Seçenek | Artı | Eksi |
|---|---|---|
| (A) **ÇIKAR** | ZTO tablosu üretim kavramlarıyla iç içe (üretim konveyörü, reçete, PO, kalite kontrol, Uyumsoft — envanter D §1.10); finansal kısmı (alış faturası → cari borç) BR'de `purchase_invoice` (V3:160) ve V34 `expense` ile zaten karşılanıyor | Kendi akaryakıt tankı / lastik deposu olan firma için stok izi yok |
| (B) BR `warehouse` modülüne bağlamak | Lot, göz, sayım, hareket defteri hazır (V8) | `stock_item.account_id NOT NULL` + `UNIQUE(account_id, sku)` (V8:33-45) ve `stock_movement` faturalama indeksi (V8:124) **müşteri malı** için kurulu; firmanın kendi sarfını buraya koymak depolama faturasını ve müşteri raporlarını kirletir |
| (C) Yeni küçük "sarf deposu" (`consumable_item`, `consumable_movement`: giriş = alış faturası/`expense`, çıkış = araca/sefere/iş emrine verme) | Nakliye firmasının gerçek ihtiyacı (envanter D özel soru a-(i): araca çıkış, ondalık litre, lastik seri no **eksik**) | ZTO'da karşılığı **olmayan** yeni işlev; ZTO ekranı birebir taşınamaz (alan seti farklı) → Y3 "birebir görünüm" kuralına uymaz |

### 2.3 Öneri: **ÇIKAR** (bu fazda); yakıt/lastik/parça mevcut modellerle

Gerekçe:
1. ZTO ekranı üretim stoğudur; lojistik karşılığı olan alanların çoğu (araca çıkış, km, lastik pozisyonu, litre) ZTO'da **yok**, BR'de **var**: `vehicle_expense` FUEL (`liters`, `station`), TIRE (`tire_position`), MAINTENANCE/REPAIR (`next_due_date`, `next_due_km`) — V6:58-83, `ExpenseKind` `FleetTypes.java:61-66`.
2. Finansal etki (alış faturası → tedarikçi borcu, KDV) BR'de `purchase_invoice` + `LedgerService`; gider sınıflaması V34 `expense(context_type='VEHICLE')`. Stok sayacı finans motorunun parçası değil.
3. 3PL deposuna karıştırmak (B) faturalama ve müşteri sahipliği kurallarını bozar.
4. Toplu yakıt tankı / lastik deposu gerçek ihtiyaçsa (S3) ayrı faz olarak (C) tasarlanır; o zaman ZTO ekranı değil, BR filo modülünün MUI ekranı kullanılır.

### 2.4 Eşleme tablosu

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| `/MaterialStockAll/Index` stok özeti | — | **ÇIKAR** (üretim ambalaj/hammadde stoğu) |
| `purchasesModal` (fatura kırılımı) | `GET /finance/purchase-invoices` FC:341 | **ÇIKAR** (ekran); alış faturaları MX1 §4.2 `invoicesModal` ile görülür |
| `_CriticalStockModal` / `CriticalStocksJson` | — | **ÇIKAR** (filo hatırlatmaları `V14__fleet_reminder_mail.sql` farklı işlev) |
| Add/Edit alış faturası (+ cari borç) | `POST /finance/purchase-invoices` FC:347 | **ÇIKAR** (ekran) — finansal kısmı `purchase_invoice`; malzeme satırı ÇIKAR |
| AddSales/EditSales (malzeme satış faturası → `ZT_AccountCredits`) | — | **ÇIKAR** (lojistik firması malzeme satmaz; satış = `freight_invoice` / `warehouse_invoice`) |
| Losses/AddLosses/RestoreMaterialLoss | — | **ÇIKAR** |
| SupplierAdd (hızlı tedarikçi + cari) | `POST /finance/accounts` FC:148 | **ÇIKAR** (ekran) |
| `GetFile` (doküman) | `stored_file` V5:1 | MX4 A.4'te zaten eşlendi |
| `/MaterialStockProduction/Index` | — | **ÇIKAR** (üretim menüsü) |
| Yakıt (litre) | `vehicle_expense.liters` V6:73 | mevcut — UI-API (filo ekranı, ZTO karşılığı yok) |
| Lastik | `vehicle_expense.tire_position` V6:75 | mevcut |
| Menü linki `/materialstockall/index` | — | "ZTO Finans" menüsüne **konmaz** |

Migration: yok. Yan not: `AccountTransactionController.cs:7006` cari ekstreden fatura silerken `ZT_MaterialStockAll` güncelliyor → MX1'deki "fatura sil" yönlendiricisinde bu dal **ÇIKAR**.

---

## 3. `BankAccountsController` — cari banka hesapları (IBAN)

### 3.1 Ne yapıyor

Karşı taraf (cari, tedarikçi, nakliyeci, personel, masraf hesabı) banka hesap kartları; firmanın kendi banka hesabı **değil** (o `ZT_BankIntroduction`, MX2). Kart, cariye `TypeAccount + ReferenceID` çiftiyle bağlanır (FK yok). Okuyanlar: BankIntroduction ödeme talimatı (`GetCustomerIbans`, manuel IBAN yazma — MX2:91-114), ödeme modalı `CustomerBankAccountID` (MX3:135), personel maaş ödemesi (`TypeAccount='Personel'`, MX6:180).

### 3.2 Route / action (BAC; sınıf `[Authorize]`, `[UserRoleAuthorize("Patron","Admin","Finans(normal)","Finans(super)","Muhasebe (Alış)")]` :12-13)

| Satır | Action | Fiil | BR karşılığı |
|---|---|---|---|
| 23 | `Index(referenceID=0, typeAccount="", supplierName="")` | GET | `GET /finance/accounts/{id}/bank-accounts` (MX1 §4.2) + **YENİ** çapraz liste `GET /finance/bank-accounts?accountId&q&currency&active` (referenceID=0 iken tüm kartlar) |
| 241 / 286 | `Add` GET / POST | GET/POST | `POST /finance/accounts/{id}/bank-accounts` |
| 406 | `Edit(id, …)` | öznitelik yok | `GET /finance/bank-accounts/{id}` |
| 488 | `Update(BankAccounts, …)` | öznitelik yok | `PUT /finance/bank-accounts/{id}` |
| 568 | `Delete(id, …)` | GET — aslında aktif/pasif değiştirir (:582-596) | **YENİ** `PATCH /finance/bank-accounts/{id}/active` (fiziksel silme yok) |

### 3.3 Görünümler

- **Index** (707 satır): başlıkta "Geri" (`_baParentUrl`, :456) + "Yeni Hesap" (:460). Tablo (:470-482): Sıra No · Hesap Sahibi · Banka Adı · Şube Adı · Hesap No · IBAN · Hesap Türü · Para Birimi · Hesap Tipi · Açıklama · Açılış Tarihi · Son İşlem · İşlemler. İşlemler açılır menüsü (:529-550): Hesap Detayları (`openBankAccountDetailsPanel`), Hesap İşlemleri (`openBankAccountTransactions`), Düzenle, Sil (`confirmationModal` :604 → AJAX `/BankAccounts/Delete` :675). Yan paneller :586, :596. DataTables dili CDN'den (:634).
- **Add** (308) / **Edit** (295), `_ExpertLayout`, form (modal değil):

| Alan | Etiket | Tür / doğrulama | BR `account_bank_account` |
|---|---|---|---|
| `ReferenceID`, `TypeAccount` | — | hidden | `account_id` (UUID FK) |
| `BankName` | Banka Adı * | metin, required | `bank_name` |
| `BranchName` | Şube Adı | metin | `branch_name` |
| `AccountNumber` | Hesap Numarası | metin | `account_number` |
| `IBAN` | IBAN | metin, `maxlength=26`, biçim kontrolü yok | `iban` VARCHAR(34) — sunucuda biçim + mod-97 doğrulaması |
| `AccountHolderName` | Hesap Sahibi Adı | metin | `holder_name` (boşsa cari adı) |
| `AccountType` | Hesap Türü | select: Vadeli / **Vadesiz** (varsayılan) / Birikim / Kurumsal | `account_kind` TIME / DEMAND / SAVINGS / CORPORATE |
| `CurrencyID` | Para Birimi * | select, required, `Symbol - Name` (kaynak `ZT_Currency` :251, :431) | `currency` CHAR(3) ← `GET /finance/currencies` FC:501 |
| `AccountCategory` | Hesap Kategorisi * | select: Ana Hesap / **Yan Hesap** (varsayılan) | `category` MAIN / SUB |
| — | Referans Bilgisi | readonly (cari adı, `GetReferenceName` :648-697) | cari adı (`account.name`) |
| `AccountOpenDate` | Hesap Açılış Tarihi | date | `opened_on` |
| `LastTransactionDate` | Son İşlem Tarihi | date (elle) | `last_transaction_on` — §3.6-N3 |
| `Notes` | Notlar | **yorum satırı** (Add.cshtml:200-212, gönderilmiyor) | ÇIKAR |
| `Description` | Açıklama | textarea + bilgi ipucu | `description` (≤500) |
| `CreationDate` | — | gizli `datetime-local` (istemci saatini sunucuya yollar) | ÇIKAR (`created_at` sunucuda) |
| Buton | Kaydet (`submitButton`) | | |

### 3.4 Tablolar

| ZTO | R/W | BR |
|---|---|---|
| `ZT_BankAccounts` | R/W (BAC:180, INSERT :329, UPDATE :502, durum :589/:596) | `account_bank_account` (V22) |
| `Currency` (:213) ve **`ZT_Currency`** (:251, :431) — iki ayrı tablo adı | R | `GET /finance/currencies` |
| `ZT_Boss`, `ZT_FinancePerson`, `ZT_AccountingPurchases`, `ZT_WorkPlace`, `ZT_BranchProvince`; admin `Users`/`UserRoles` | R (rol başlığı) | `@PreAuthorize` |
| Dinamik `ZT_Supplier` / `ZT_Customer` / `ZT_Transport` / `ZT_CuttingChief` / `ZT_TransportCompany` | R (`GetReferenceName`) | `account` (tek tablo) |
| `Log` | W | BR denetim kaydı |

### 3.5 ZTO hataları

| # | Hata | Yer |
|---|---|---|
| B1 | IBAN tekilliği yalnız `Add`'de; `Update` aynı IBAN'ı başka karta yazabilir. Kontrol pasif kartları da sayar | BAC:310-326, :502 |
| B2 | `maxlength=26` yalnız TR IBAN'ı alır; yabancı IBAN (34'e kadar) girilemez; mod-97 yok | Add.cshtml:141 |
| B3 | "Hesap Detayları" ve "Hesap İşlemleri" menü öğeleri tanımsız JS fonksiyonlarını çağırıyor (proje genelinde tanım bulunamadı) | Index.cshtml:534, :539 |
| B4 | `[ValidateAntiForgeryToken]` yok (view token gönderiyor) | BAC tümü |
| B5 | `Delete` GET ile durum değiştirir; id SQL'e string birleştirilir | BAC:582-596 |
| B6 | `ZT_Currency` / `Currency` tablo adı tutarsızlığı | BAC:213, :251 |
| B7 | `Notes` alanı formda yorum satırı, modelde yok | Add.cshtml:200-212 |
| B8 | İş yeri / kapsam filtresi yok | envanter B:316 |

### 3.6 Eşleme tablosu ve V22 notları

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| Index (cari bazlı) | yok (`fund_account` yalnız firmanın kendi hesabı) | **UI+TABLO** V22 + **UI+YENİ** `GET /finance/accounts/{id}/bank-accounts` (MX1 §4.2) |
| Index (referenceID=0, tüm kartlar) | yok | **UI+YENİ** `GET /finance/bank-accounts` |
| Add / Edit / Update | yok | **UI+YENİ** `POST /finance/accounts/{id}/bank-accounts`, `PUT /finance/bank-accounts/{id}` |
| Delete (durum değiştir) + `confirmationModal` | yok | **UI+YENİ** `PATCH /finance/bank-accounts/{id}/active` |
| "Hesap Detayları" paneli | — | **UI-API** (aynı GET; ZTO'da kırık olan panel çalışır hale gelir) |
| "Hesap İşlemleri" paneli | V33 `payment_plan.counterparty_bank_account_id` | **UI+YENİ** `GET /finance/bank-accounts/{id}/payments` (bu IBAN'a yapılan ödemeler) |
| Referans Bilgisi (`GetReferenceName`) | `account.name` | **UI-API** |
| Para birimi select | FC:501 | **UI-API** |
| CustomerAccounts satırındaki "Banka Hesapları" linki, ExpenseItems "Masraf Hesapları" düğmesi | MX1:217; MX4:49/168 (masraf kalemi = cari deseni ÇIKAR) | MX1 kapsar; masraf kalemi düğmesi ÇIKAR (MX4) |
| Personel IBAN'ı | MX6:747 (şifreli/maskeli) | `account.type=EMPLOYEE` kartlarında IBAN `HR_SENSITIVE_VIEW` yoksa maskeli döner (MX6 kapsar) |

**V22 kapsar**, ancak MX1 (V22) ve MX2 (V24) önerilerinin birleşiminde şu üç nokta netleşmeli (koordinatör V22'ye işler):
- N1: `iban` **NULL olabilir** (ZTO'da IBAN zorunlu değil, yalnız Banka Adı, Para Birimi, Kategori zorunlu) + `CHECK (iban IS NOT NULL OR account_number IS NOT NULL)`. MX2:712'deki `iban NOT NULL` ve `holder_name NOT NULL` gevşetilir.
- N2: Tekillik `UNIQUE (iban) WHERE deleted=FALSE AND active=TRUE` (MX2:714 + `active`), hem ekleme hem güncellemede (B1 düzeltmesi). Aynı IBAN iki cariye ait olamaz.
- N3: `last_transaction_on` elle girilmez; V33'teki `counterparty_bank_account_id` üzerinden son ödeme tarihi hesaplanır. Kolon kalırsa yalnız "geçmişten aktarılan değer" olarak, ekranda readonly.

İzinler: liste `FINANCE_VIEW`, yazma `FINANCE_MANAGE` (V3:248-250) — ZTO rolleri Patron/Admin/Finans/Muhasebe(Alış) bunlara denk.

---

## 4. `FinanceController`, `FinanceMaintenanceController`, `FinancePersonController`

### 4.1 `FinanceController` — `/Finance/Index` (211 satır)

- Ne: eski "Finans ana sayfası". Kasa ve banka tanım listeleri + para birimi + iş yeri/şube ham `select *` ile; Chart.js grafiği (CDN). Bakiye hesaplamaz. Sınıf `[UserRoleAuthorize("Finans(normal)","Finans(super)")]` (:11-12), tek action `Index()` (:25). View 768 satır, modal yok.
- Ulaşım: girişte finans rolü `/accounttransaction/alltransactions`'a gider (`AccountController.cs:257-258, 320-327`); `/finance/index` finans menüsünde (`_SideMenu_FinanceItems`) **yok**, yalnız `_NavMenu_Finance_Financial.cshtml:7` ve `PurchaseCurrentAccount/Index.cshtml:516` link veriyor.
- Hatalar: Admin/Patron giremez ama link görür; FA 5.15.4 ve 6.0.0-beta3 birlikte; sürümsüz Chart.js CDN.

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| `/Finance/Index` (kasa/banka listesi + grafik) | `FinanceDashboardPage.tsx`, `GET /finance/funds` FC:205, `GET /finance/dashboard` FC:429; ZTO görünümlü karşılıkları BankIntroduction/CashIntroduction (MX2) | **ÇIKAR** (yinelenen, menüde olmayan ikincil sayfa; içerik MX2 ekranlarında var) |
| İçindeki linkler (bankaccounts, bankintroduction, …, `salesproduct/salesindex`) | — | ÇIKAR (`salesproduct` üretim) |

### 4.2 `FinanceMaintenanceController` — `/FinanceMaintenance/OrphanDebts` (645 satır)

- Ne: menüde olmayan, URL ile açılan bakım ekranı. Referansı boş ya da kopuk `ZT_AccountDebts` kayıtlarını cari bazında listeler (`OrphanDebts` GET :227) ve toplu siler (`DeleteOrphanDebts` POST :463, antiforgery yok). Silmeden önce **çalışma zamanında** `ZT_AccountDebtsDeleteLog` tablosunu yaratır (`CREATE TABLE IF NOT EXISTS` :574-585) ve yedekler, sonra **hard DELETE**. `Sevk Nakliye Firması` borcu silinirken `ZT_SalesTruck` nakliye alanlarını temizler (:515-570). Kilit kontrolü: `ZT_AccountDebtsInvoice`, `ZT_PaymentPlans`, `ZT_PaymentApprovalDetails` (:119-128). `RefMappings` (:35-47) 10 üretim/satış tablosunu tanır.
- View `OrphanDebts.cshtml` (470): tablo (seçim · Durum · Tarih · Belge No · Muhasebe Türü · Bağlı Tablo · Ref. ID · Hedef · İş Yeri · Oluşturan · Kayıt Tarihi · Tutar, :192-204); `odcConfirmModal` (:312); AJAX `AccountTransaction/GetDebtRedirectInfo`.

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Sahipsiz borç listesi | `account_transaction.source_type/source_id` NOT NULL + `UNIQUE` (V3:28-35); kaynak iptali `reverseSource` | **ÇIKAR** — BR'de kaynağı silinmiş borç oluşamaz (kaynak silinmez, ters kayıtla kapanır) |
| Toplu sil + log tablosu | ters kayıt + denetim kaydı | **ÇIKAR** (hard delete ve çalışma zamanı DDL BR kurallarına aykırı) |
| Kilit kontrolü (fatura/plan/onay bağlı mı) | `InvoiceCancelGuard.java`, plan durum makinesi | gerek yok |

Not: BR için benzer bir **salt-okunur** "tutarlılık denetimi" (ör. 04 §8'deki `deleted=false` sorunu) gerekiyorsa bu bir yönetici raporu olarak ayrıca istenir; ZTO ekranı taşınmaz.

### 4.3 `FinancePersonController` — `/FinancePerson/Index` (555 satır)

- Ne: Admin ekranı; finans personeli kartı `ZT_FinancePerson` (Ad, Telefon, Adres, İş Yeri, Şube, Durum; `SuperStatus` ve `Key` bu controller'da **yazılmıyor**). Bu tablo üç şeyi belirler: (1) kullanıcının tek iş yeri/şube kapsamı, (2) `Finans` rolünün girişte `Finans(super)`/`Finans(normal)`'a çevrilmesi (`AccountController.cs:1417-1432`), (3) tabloda hiç satır yoksa Patron finans sayfalarına giremez (`FinanceAccess.HasFinancePersonnel`, `RequireFinancePersonnelAttribute`).
- Action'lar: `Index` GET :23, `Add` GET :100 / POST :176, `Edit` :274, `Update` POST :379, `Delete` GET (durum) :469. View'lar Index/Add/Edit (modal yok); AJAX `/Expert/GetAllWorkPlaces`, `/Expert/GetBranchProvincesByWorkPlace` (başka controller).
- Hatalar: id/userkey SQL'e birleştiriliyor (:483-508); `SuperStatus` yazan ekran yok; "personel tablosunda kayıt yoksa Patron giremez" kuralı sezgisel değil.

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| Finans personeli kartı (ad, telefon, adres) | `app_user` (identity) | **ÇIKAR** (ekran) — kullanıcı yönetimi BR identity ekranında |
| `SuperStatus` (süper/normal) | rol `FINANCE_SUPER` / `FINANCE` (V2:95-116) | **ÇIKAR** — rol ataması |
| İş yeri / şube kapsamı | MX5 D17: `app_user.branch_scope`, `user_branch`, `default_branch_id`, `BranchScopeService` | **MX5 `user_branch` kapsar** (04 §4'e henüz girmedi; koordinatör V22–V34 dizisine ekler) |
| `HasFinancePersonnel` Patron kapısı | izin matrisi | **ÇIKAR** |
| Admin menüsü linki (`_Layout.cshtml:922, 2326`) | — | ÇIKAR |

---

## 5. `AmountType` ve `TransactionType`

### 5.1 `AmountType` (`AmountTypeController` 339 satır + `ApiController/AmountTypeApiController.cs` 445 satır)

- Ekran: Index / Add / Edit (`Views/AmountType/*`, `_ExpertLayout`, `_DefinitionNav`), `Delete` GET durum değiştirir. Tablo `AmountType(Name, Status, CreationDate)`; INSERT string birleştirme (:87). Mobil API aynı CRUD'u `database + token` ile açar.
- Kullananlar: reçete, üretim planı, konveyör, kantar, kalite, satış sevk — **finans sayfalarının hiçbiri okumuyor** (envanter D §7.1). Malzeme ve masrafta birim zaten metin (`QuantityType`, `ContainerType.UnitName`, `ZT_ExpenseItems.DefaultUnit`).

| ZTO öğe | Blackrose karşılığı | Karar |
|---|---|---|
| AmountType tanım ekranı + API | birim BR'de metin alan: `stock_item.unit` V8:38, V34 `expense_line.unit`, MX4 `expense_item.default_unit` | **ÇIKAR** (üretim/reçete birimi; finans bağımlılığı yok) |

### 5.2 `TransactionType` (`TransactionTypeController` 228 satır + `ApiController/TransactionApiController.cs` 183 satır)

- Ekran: Index / Add / Edit, `Delete` GET durum; sınıf `[UserRoleAuthorize("Admin")]`; Index kısıt adı `'Silo İşlemleri'` (:39). Tablo `TransactionType(Name, Status, CreationDate)`, tüm SQL'ler string birleştirme (:95, :124, :165, :196-211).
- **Envanter D §7.2 düzeltmesi:** `public."TransactionType"` **tablosunu** okuyan tek finans-dışı kullanıcı `SiloOrderController.cs:45, :94, :379` (silo doldur/boşalt emri). Finans controller'larındaki `"TransactionType"` geçişleri aynı adlı **kolondur**: `ZT_BankTransactions.TransactionType` ve `ZT_CashTransactions.TransactionType` (`BankTransactionsController.cs:1046, :1680`; `CashTransactionsController.cs:569, :803`), değerleri `'Giriş'` / `'Çıkış'`. Yani finans sayfaları bu tanım tablosuna bağlı **değil**.
- `TransactionApiController` (`api/TransactionApi`): `add` POST :15, `{update}` POST :56, `delete` **GET** :90, `getsuppliers` GET :142 — mobil silo uygulaması için.

| ZTO öğe | Blackrose karşılığı (file:line) | Karar |
|---|---|---|
| TransactionType tanım ekranı + API | — | **ÇIKAR** (silo/üretim tanımı) |
| Banka/kasa hareketindeki `TransactionType` kolonu `'Giriş'`/`'Çıkış'` | `FundDirection IN / OUT` `finance/domain/FinanceTypes.java:32-38` | eşleme MX2'de (UI-API); yeni tanım tablosu gerekmez |
| Cari hareket yönü (Borç/Alacak) | `Direction DEBIT / CREDIT` `FinanceTypes.java:18-25` | MX1 kapsar |

Migration: yok.

---

## 6. Finans adlı / finansa yazan diğer ZTO controller'ları

Yöntem: `Controllers/` (221 dosya) ve `ApiController/` içinde adı finance/account/bank/cash/pay/collect/check/bill/credit/expense/invoice/currency/exchange/report/cost/pricing/deposit/invest/sales/purchase geçenler + `ZT_AccountDebts`, `ZT_AccountCredits`, `ZT_BankTransactions`, `ZT_CashTransactions` tablolarına INSERT/UPDATE/DELETE yapan tüm controller'lar (grep). Satır sayısı `wc -l`.

### 6.1 Kapsananlar

| MX | Controller (satır) |
|---|---|
| MX1 | CustomerAccounts (6753), AccountTransaction (9420), CustomerAccountReport (527), FinanceReport (61), FinancialBalanceSheet (1776) |
| MX2 | BankIntroduction (1604), BankTransactions (2214), CashIntroduction (1161), CashTransactions (1536), BankStatement (6484), TimeDeposits (1492), PurchaseCurrentAccount (2562) |
| MX3 | Checks (3725), Bills (1485), CheckBooks (550), AccountCredits (430), CreditContracts (7018), PaymentManagement (2059), PaymentApprovalApi (72) |
| MX4 | ExpenseItems (656), ExpenseTypes (501), ProductionExpenses (3150), Investments (1464) |
| MX5 | WorkPlace (535), BranchProvince (397), Uyumsoft **yalnız ayarlar** (1199) |
| MX6 | Personnel, PersonnelSalary (3414 + 771 + 430), PersonnelAdditionalPayment (822), PersonnelAsset (617), PersonnelReports (386), SGKDeclaration, PersonnelAdvance/Absence/Leave/Dashboard |
| MX7 (sürüyor) | CustomerAccountPayment (4913), CustomerAccountCollection (5046), PaymentApproval (1653), CustomerCurrentAccounts (490), KrediBankaCari |
| **MX8** | SalesTruckExpenses (1199), MaterialStockAll (8018), MaterialStockProduction (169), BankAccounts (718), Finance (211), FinanceMaintenance (645), FinancePerson (555), AmountType (339) + AmountTypeApi (445), TransactionType (228) + TransactionApi (183) |

### 6.2 Kapsanmayanlar

"Menü" = `_SideMenu_FinanceItems.cshtml`'de linki var mı.

| Controller | Satır | Menü | Ne yapıyor (tek satır) | Finansa yazdığı | Öneri |
|---|---|---|---|---|---|
| **RecipeFinance** | 970 | hayır | "Reçeteli masraflar": nakliye/analiz/fumigasyon/**gümrük** masrafı → tedarikçi borcu (`DocumentType='Reçeteli Masraf'`), sevk bağlantısı (`GetShipmentLinks` :404); **kur farkı raporu** (`FxReport` :665, `CreateFxRecord` :726); **yaşlandırma** (`Aging` :809); **nakit akışı** (`CashFlow` :868: cari vadeleri + alınan/verilen çekler) | `ZT_AccountDebts` | **Yeni MX gerekli (MX9 önerisi).** Masraf kısmı → V34 `expense(context SHIPMENT)` (MX4 kapsar, ekran ayrı); `FxReport` → **UI+YENİ** kur farkı raporu (V30 `fin_income_expense` ile ilişkili); `Aging` → MX1 `/reports/aging` ile yinelenen; `CashFlow` → **UI+YENİ** nakit akış projeksiyonu (plan + çek/senet + vadeler). Rol listesinde "Lojistik" var (`:18`) — lojistiğe en yakın kapsanmamış ekran |
| **Currency** + CurrencyApi | 538 + 251 | hayır (Admin tanım) | Para birimi tanımı (ad, sembol) + TCMB kur çekme; CurrencyApi mobil | `Currency` | **UI-API** (salt okunur kur ekranı: FC:501 `currencies`, :508 `exchange-rates`, :515 `refresh`); para birimi ekleme **ÇIKAR** (BR ISO kodu). Kur altyapısı 8 kopyası envanter D §5'te |
| ExpertReportTruckExpenses | 2223 | **evet** (`expensesummarybytransportcompany`) | Alım aracı (bahçeden gelen kamyon) nakliye + kesim çavuşu gideri; firma bazlı özet — SalesTruckExpenses'in **giriş yönlü ikizi** | `ZT_AccountDebts` ('Nakliye Firması', 'Kesim Çavuşu') | **ÇIKAR** (ayrı sayfa olarak). Lojistikte giriş/çıkış yönü ayrımı yok; tüm taşeron giderleri §1'deki tek ekranda |
| AccountingPurchases | 2245 | **evet** (`/accountingpurchases/alltruck`) | Alış muhasebesi: gelen kamyonun fiyat/finans bilgisi (`UpdateTruckFinance` :1553), tedarikçi + nakliye + kesim çavuşu borçları | `ZT_AccountDebts` | **ÇIKAR** (yaş meyve alım akışı); nakliye kısmı §1 deseniyle karşılanır |
| HarvestManagerExpenses | 904 | **evet** | Kesim çavuşu hizmet bedeli; sınıfta `[Authorize]` yok | `ZT_AccountDebts` ('Kesim Çavuşu') | **ÇIKAR** (04 §3.1: Kesim Çavuşu ÇIKAR) |
| ProductionSergeantsExpenses | 1775 | **evet** | Üretim çavuşu (taşeron işçi) bedeli, parti bazlı dağıtım; sınıfta `[Authorize]` yok | `ZT_AccountDebts` ('Üretim Çavuşu') | **ÇIKAR** (ekran); 04 §3.1'e göre cari `SUPPLIER/ELLECLEME_TASERON`, gideri V34 `expense(context WAREHOUSE)` |
| OrderExpenses | 615 | hayır | Sipariş bazlı masraf → müşteri carisine borç (`DueDate, PaymentMethod, CashID, BankID` ile) | `ZT_AccountDebts` ('Müşteri') | **ÇIKAR** — lojistik karşılığı sefer ek ücreti: `freight_invoice` / MX1 V26 `account_document` |
| OrderClaims | 608 | hayır | Müşteri talep/ceza kaydı (sipariş + sevk aracı) | `ZT_AccountDebts` | **ÇIKAR** (ekran) → V26 `account_document` "Ceza / Kesinti" (04 §6.1-K2) |
| OrderCollection | 353 | hayır | Sipariş bazlı tahsilat notu (`ZT_OrderCollection`) | — (cari hareketi yok) | **ÇIKAR** (tahsilat MX7) |
| SalesProduct | 7115 | hayır | Satış sevk aracı oluşturma/düzenleme; 'Müşteri', 'Sevk Nakliye Firması', 'Analiz Firması' borç/alacağı | `ZT_AccountDebts`, `ZT_AccountCredits` | **ÇIKAR** (üretici satış sevki; BR `shipment`) — §1.5 çoklu yazıcı notu |
| SalesProductLogistic | 6871 | hayır | Sevkiyat lojistik kartı: gümrük beyanı, fatura, incoterm, konteyner, nakliye borcu (`SaveSalesInfo` :2264, `DeleteLogisticsTransport` :2813, `GetTcmbRates` :5366) | `ZT_AccountDebts` ('Sevk Nakliye Firması', 'Müşteri', 'Masraf Hesabı'), `ZT_AccountCredits` | **ÇIKAR** (ekran) — lojistik içerikli ama karşılığı BR `shipment` + `customs` (V9); finans kısmı §1 + `freight_invoice` |
| RawMaterialSales | 2511 | hayır | Hammadde satışı | (cari yazımı grep'te yok) | **ÇIKAR** |
| RecipeSales / RecipeGoods / RecipePurchasing / RecipeProduction | 6454 / 2583 / 4516 / 15197 | hayır | Reçeteli üretim satış, malzeme kabul, satınalma, üretim | `ZT_AccountDebts` / `ZT_AccountCredits` | **ÇIKAR** (üretim) |
| PesticideStockAll | 6160 | **evet** | Zirai ilaç stoğu + alış/satış faturası (MaterialStockAll ikizi) | `ZT_AccountDebts` ('İlaç Tedarikçisi'), `ZT_AccountCredits` ('İlaç Satışı') | **ÇIKAR** (§2 ile aynı gerekçe) |
| Purchases | 2513 | hayır | Yaş meyve-sebze alımı | — | **ÇIKAR** |
| Report | 6392 | **evet** (`/Report/index`) | Fabrika raporları: sevk fişi, depo, üretim yükleme, alış, genel özet | — | **ÇIKAR** (BR `reporting` modülü ayrı) |
| SpecialReport | 2503 | hayır | Özel raporlar (üretim/alış) | — | **ÇIKAR** |
| ProductionCost / ProductionMaterialCost | 116 / 599 | hayır | Üretim planı / parti maliyeti | — | **ÇIKAR** (lojistik karşılığı sefer kârlılığı TFS:328 mevcut) |
| ShipmentLedger | 55 | hayır | Sevk aracı paletlerinin üretim hareket defteri | — | **ÇIKAR** (izlenebilirlik, finans değil) |
| ProductionLedger | 1077 | hayır | Döküm/üretim parti notları | — | **ÇIKAR** |
| ShipmentAnalysisReport | 343 | hayır | Sevkiyat kalite kontrol raporu | — | **ÇIKAR** |
| CustomerReport / SupplierReport / ProductReport / IncomingMaterialsReport / NonconformityReport / PackagingControlReport / OperatorReport / ProductionReport | 15 / 93 / 86 / 60 / 109 / 76 / 15 / 60 | hayır | Üretim/kalite rapor kabukları | — | **ÇIKAR** |
| LocationPricing | 395 | hayır (Admin) | Lokasyon nakliye fiyat tanımı (ad, fiyat, para birimi, adres) | — | **ÇIKAR** (BR CRM `tariff`/`tariff_line` V5:98-141) |
| HarvestAndProductionWorkersPricing | 430 | hayır | Kesim/üretim işçi birim fiyatı | — | **ÇIKAR** |
| ProductionQualityPrice | 173 | hayır | Kaliteye göre fiyat | — | **ÇIKAR** |
| Uyumsoft (Dashboard, Inbox) | 1199 | **evet** (3 link) | e-Fatura/e-Arşiv/e-İrsaliye panosu ve gelen kutusu | — | MX5 yalnız ayarları kapsar. Pano/gelen kutusu → BR `integration` `edocument` (V10:16) — **entegrasyon matrisinin işi**, finans değil |
| OrderDefinitions | 370 | **evet** | Tanım ekranları merkezi (hub) | — | **ÇIKAR** (BR'de her modülün kendi tanım ekranı) |
| SalesPerson | 561 | hayır | Satış personeli kartı (FinancePerson'un ikizi) | — | **ÇIKAR** (§4.3 ile aynı) |
| AccountApi / SalesApi / SalesProductApi / PurchasesApi / ExpertReportApi / ExpertReportTruckApi / ProductReportApi / SupplierReportApi | 304 / 208 / 173 / 1243 / 907 / 912 / 249 / 204 | — | Mobil uygulama API'leri (giriş, satış, alım, eksper) | — | **ÇIKAR** (BR driver app ayrı, V13) |

Sonuç: finans motoruna dokunan ve lojistiğe yakın tek kapsanmamış ekran **RecipeFinance** (kur farkı raporu + nakit akışı + gümrük/nakliye masrafı). Diğerleri tarım/üretim akışıdır ya da başka MX'in kurduğu modelle karşılanır.

---

## 7. Gerekli migration'lar (bu ek)

| Ad | İçerik | Bağımlılık |
|---|---|---|
| **V2xR1** `trip_cost_subcontract` | §1.9: `trip_cost` +`vat_amount`, `withholding_amount`, `deduction_amount`, `document_no`, `document_type`, `cost_date`, `status`, `replaced_by_id`; `shipment_leg.transport_mode`; `trip_cost_account_idx` | V32'den sonra (avans bağı `settlement.origin_*`), V34'ten önce (V34 `expense` bu alanları okur) |
| — | `account_bank_account` | **V22 kapsar** — §3.6 N1–N3 notları V22'ye işlenir |
| — | Kullanıcı şube kapsamı (`user_branch`) | **MX5 kapsar** (04 §4'e eklenmeli) |
| — | `settlement.origin_type/origin_id` | **V32 kapsar** |
| — | Masraf aynası (`expense`, context SHIPMENT/VEHICLE) | **V34 kapsar** |

Yeni uçlar: `GET /shipment/subcontract-costs/summary`, `GET /shipment/subcontract-costs`, `PUT /shipment/costs/{id}`, `POST /shipment/costs/{id}/post`, `POST /shipment/costs/{id}/reverse`, `GET /finance/bank-accounts`, `GET|PUT /finance/bank-accounts/{id}`, `PATCH /finance/bank-accounts/{id}/active`, `GET /finance/bank-accounts/{id}/payments` (+ MX1'deki `/accounts/{id}/bank-accounts`).

Test (04 §9 kuralı): `TripFinanceService` için "post-now sonra close çift kayıt yazmaz", "yazılmış gider düzenlenince ters kayıt + yeni satır", "cariye yazılan tutar = net + KDV − tevkifat − kesinti"; `account_bank_account` için IBAN mod-97, aktif kartlarda tekillik (ekleme + güncelleme).

---

## 8. Açık sorular (öneri işaretli)

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| S1 | Taşeron gideri cariye **ne zaman** yazılsın? | (a) ZTO gibi kaydedince hemen; (b) BR gibi sefer kapanınca; (c) kaydet = taslak, ayrı "Cariye İşle" düğmesi | **(a)** — bu ekrandan girilen `SUBCONTRACTOR` gideri kaydedilince yazılır ve taslak ödeme planı açılır; diğer `trip_cost` türleri BR kuralında (kapanışta) kalır. Taşeron ekstresi ZTO'daki gibi hemen borç gösterir |
| S2 | "Avans(Yakıt)" alanı | (a) readonly + "Avans Öde" düğmesi (gerçek ödeme, banka/kasa seçimli); (b) yalnız bilgi amaçlı sayı (ZTO) | **(a)** — 04 §6.1-K1 ile aynı ilke; aksi halde nakit bakiyesi tutmaz |
| S3 | Firmada kendi akaryakıt tankı / lastik-parça deposu var mı? | (a) yok → MaterialStockAll ÇIKAR, yakıt `vehicle_expense`; (b) var → ayrı faz "sarf deposu" (`consumable_item`, `consumable_movement`, araca çıkış) | **(a)** bu faz için; (b) ihtiyaç doğrulanırsa ZTO ekranından bağımsız MUI ekranıyla ayrı fazda |
| S4 | "İndirim" (kesinti) nasıl tutulsun? | (a) `trip_cost.deduction_amount`, cariye yazılan tutardan düşülür; (b) ayrı V26 belgesi "Ceza / Kesinti (karşı tarafa kesilen)" | **(a)** — ZTO alanı gider satırının parçası; ceza ayrı bir olaysa kullanıcı V26 belgesini ayrıca keser |
| S5 | Menü etiketi ve "Parti No" sütunu | (a) "Sevk Nakliye Masrafları" etiketi ve sütun başlıkları aynı kalır, Parti No yerine müşteri referansı; (b) "Taşeron Nakliye Giderleri" etiketi, Parti No sütunu kaldırılır | **(a)** — Y3 (birebir görünüm); yalnız veri kaynağı değişir |

---

## 9. 10 satır özet

1. SalesTruckExpenses ZTO'da tablosuz; sevk aracının nakliye kolonlarını düzenleyip taşeron carisine borç yazıyor. BR karşılığı `trip_cost (kind=SUBCONTRACTOR)` + `shipment_leg.carrier_account_id` → **UI+TABLO**, V2xR1 (KDV, tevkifat, kesinti, belge no/türü, durum, `transport_mode`).
2. ZTO'nun 12 hatası taşınmaz: yetkisiz uçlar, cariye yalnız net tutarın yazılması, kur 1, para birimi karışması, borç tarihinin kayması, transaction yokluğu, SQL birleştirme, hard delete, kırık `/SalesTruck/*` modalları.
3. Çakışma: BR gideri sefer kapanınca yazıyor; öneri: bu ekrandaki taşeron gideri hemen yazılsın (`POST /costs/{id}/post`). `close()` yazılmış satırı zaten atladığı için çift kayıt olmaz.
4. Toplam, kalan ve bakiye hesaplanan readonly alanlar olur. Avans gerçek ödemeye bağlanır (V32 `origin_*`). Düzenleme ve silme ters kayıtla yapılır.
5. MaterialStockAll/Production **ÇIKAR**: üretim ambalaj/hammadde stoğu. 3PL deposu müşteri malına göre kurulu. Yakıt ve lastik `vehicle_expense` + V34'te var. Sarf deposu gerekirse ayrı faz (S3).
6. BankAccounts → **UI+TABLO, V22 kapsar**. V22'ye üç not: IBAN boş olabilsin ama IBAN ya da hesap no zorunlu olsun; aktif kartlarda IBAN tekilliği eklemede ve güncellemede kontrol edilsin; son işlem tarihi hesaplansın. Çapraz liste ve aktif/pasif için yeni uçlar.
7. Finance/Index (eski ikincil sayfa) ve FinanceMaintenance (sahipsiz borç temizliği, çalışma zamanında DDL, hard delete) **ÇIKAR**. FinancePerson **ÇIKAR**; yerini roller (`FINANCE`/`FINANCE_SUPER`) ve MX5 `user_branch` alır.
8. AmountType ve TransactionType **ÇIKAR**. Envanter D §7.2 düzeltmesi: TransactionType tablosunu yalnız SiloOrder kullanıyor. Finanstaki aynı adlı kolon (`'Giriş'`/`'Çıkış'`) `FundDirection IN/OUT`'a eşlenir.
9. Kapsanmayan ~35 controller incelendi. Lojistiğe yakın ve finansa dokunan tek ekran **RecipeFinance** (kur farkı raporu, nakit akışı, gümrük/nakliye masrafı) → MX9 önerisi. Currency → salt okunur kur ekranı (UI-API). Uyumsoft panosu entegrasyon işi. Kalanlar tarım/üretim → ÇIKAR.
10. Yeni migration yalnız **V2xR1**. Diğerleri V22, V32, V34 ve MX5'e bağlanır. 5 açık soru (S1–S5) var; her birinde önerilen seçenek işaretli.
