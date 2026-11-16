-- Z42 · Faz 12.8 · 04 §6.2-Y8 (Z10 akışı), MX1 §2.6–2.8, MX8 §6.2 · 12.8_TASARIM §1.1
-- Kur farkı belgesinin kesim kuru ve kur tarihi (belge kendini açıklar; kaynak hareketin TL karşılığı değişmez)
-- + kur farkı belgesi ↔ kaynak hareket şirket eşitliği (MX5 bileşik FK; V36 deseni)
-- + 12.8 rapor sorgularının indeksleri. Yeni tablo yok; izin tohumu yok.
-- Dolu kiracı: V28'den beri KUR_FARKI seçilemez ve fx_source_transaction_id hiç yazılmadı → CHECK ve FK mevcut satırlarda doğru.

ALTER TABLE account_document
    ADD COLUMN fx_rate      NUMERIC(19, 6),
    ADD COLUMN fx_rate_date DATE;

-- Bileşik FK hedefi: id zaten PK olduğundan (id, company_id) her satırda tekildir (dolu kiracıda ihlal olamaz).
ALTER TABLE account_transaction ADD CONSTRAINT account_transaction_id_company_uq UNIQUE (id, company_id);
-- Kur farkı belgesi kaynağıyla aynı şirkette (V28 tek kolonlu FK kalır; MATCH SIMPLE: kaynaksız belgede denetim yok).
ALTER TABLE account_document ADD CONSTRAINT account_document_fx_source_company_fk
    FOREIGN KEY (fx_source_transaction_id, company_id) REFERENCES account_transaction (id, company_id);

-- KUR_FARKI ⇔ kaynak bağı; kaynaklı belge TRY, deftere yansır ve kur/kur tarihi taşır.
ALTER TABLE account_document ADD CONSTRAINT account_document_fx_ck CHECK (
        (document_type = 'KUR_FARKI') = (fx_source_transaction_id IS NOT NULL)
    AND (fx_source_transaction_id IS NULL) = (fx_rate IS NULL)
    AND (fx_rate IS NULL) = (fx_rate_date IS NULL)
    AND (fx_rate IS NULL OR fx_rate > 0)
    AND (fx_source_transaction_id IS NULL OR (currency = 'TRY' AND reflect_to_ledger AND exchange_rate IS NULL)));

-- Kur farkı geçmişi (iptal edilenler dahil) ve rapor birleşimi; açık belge için V28 account_document_fx_source_uq.
CREATE INDEX account_document_fx_source_idx ON account_document (fx_source_transaction_id)
    WHERE fx_source_transaction_id IS NOT NULL AND deleted = FALSE;

-- Kur farkı raporu adayları (yalnız dövizli hareketler).
CREATE INDEX account_transaction_fx_idx ON account_transaction (company_id, transaction_date)
    WHERE currency <> 'TRY' AND deleted = FALSE;

-- OK-12.7-8 / OK-12.8-12: bağlamlı masrafın kârlılık ve araç maliyeti okuması.
CREATE INDEX expense_shipment_idx ON expense (shipment_id)
    WHERE shipment_id IS NOT NULL AND status = 'POSTED' AND deleted = FALSE;
CREATE INDEX expense_vehicle_idx ON expense (vehicle_id, invoice_date)
    WHERE vehicle_id IS NOT NULL AND status = 'POSTED' AND deleted = FALSE;
