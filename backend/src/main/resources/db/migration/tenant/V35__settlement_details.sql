-- Z15 · Faz 12.2a · MX7 V2xQ1 (gerçek adlarla) · 04 §6.2-Y9 · 12.2a_TASARIM §1.1
-- Ödeme/tahsilat ayrıntıları: belge no (serbest metin, tekil değil — MX7 Ç18), banka kanalı (kredi
-- kartı = BANK + CREDIT_CARD), karşı tarafın banka hesabı (yalnız FK; IBAN kopyalanmaz — KVKK),
-- düzeltme zinciri (düzeltme aynı şirkette), iptal tarihi ve gerekçesi.

-- 1. Karşı taraf banka hesabının settlement carisine ait olmasının veritabanı güvencesi.
ALTER TABLE account_bank_account
    ADD CONSTRAINT account_bank_account_id_account_uq UNIQUE (id, account_id);

-- 2. Kolonlar
ALTER TABLE settlement
    ADD COLUMN document_no                  VARCHAR(50),
    ADD COLUMN channel                      VARCHAR(20),
    ADD COLUMN counterparty_bank_account_id UUID,
    ADD COLUMN corrects_settlement_id       UUID,
    ADD COLUMN reverse_reason               VARCHAR(500),
    ADD COLUMN reversed_on                  DATE;

-- 3. Mevcut iptal edilmiş kayıtların iptal tarihi: cari ters satırı, yoksa fon ters satırı, o da
--    yoksa son güncelleme günü (İstanbul). Ters satır: source_type='REVERSAL', source_id = orijinal satır.
UPDATE settlement s
   SET reversed_on = COALESCE(
           (SELECT min(r.transaction_date)
              FROM account_transaction o
              JOIN account_transaction r ON r.source_type = 'REVERSAL' AND r.source_id = o.id
             WHERE o.source_type = 'SETTLEMENT' AND o.source_id = s.id),
           (SELECT min(r.transaction_date)
              FROM fund_transaction o
              JOIN fund_transaction r ON r.source_type = 'REVERSAL' AND r.source_id = o.id
             WHERE o.source_type = 'SETTLEMENT' AND o.source_id = s.id),
           (s.updated_at AT TIME ZONE 'Europe/Istanbul')::date)
 WHERE s.status = 'REVERSED';

-- 4. Kısıtlar
ALTER TABLE settlement
    ADD CONSTRAINT settlement_channel_ck
        CHECK (channel IS NULL OR (method = 'BANK' AND channel IN ('TRANSFER', 'CREDIT_CARD'))),
    ADD CONSTRAINT settlement_counterparty_account_ck
        CHECK (counterparty_bank_account_id IS NULL OR account_id IS NOT NULL),
    ADD CONSTRAINT settlement_counterparty_bank_fk
        FOREIGN KEY (counterparty_bank_account_id, account_id)
        REFERENCES account_bank_account (id, account_id),
    -- settlement_id_company_uq (V32:6) hedefi: düzeltme kaydı eskisiyle aynı şirkette.
    ADD CONSTRAINT settlement_corrects_fk
        FOREIGN KEY (corrects_settlement_id, company_id) REFERENCES settlement (id, company_id),
    ADD CONSTRAINT settlement_corrects_self_ck
        CHECK (corrects_settlement_id IS NULL OR corrects_settlement_id <> id),
    ADD CONSTRAINT settlement_reversed_on_ck
        CHECK ((status = 'REVERSED') = (reversed_on IS NOT NULL));

-- 5. İndeksler
-- Bir kayıt en çok bir kez düzeltilir (account_document_revised_from deseni).
CREATE UNIQUE INDEX settlement_corrects_uq
    ON settlement (corrects_settlement_id) WHERE corrects_settlement_id IS NOT NULL AND deleted = FALSE;
-- Ödeme/tahsilat listesi (tür + şirket + tarih) ve cari süzgeci.
CREATE INDEX settlement_list_idx ON settlement (type, company_id, settlement_date DESC) WHERE deleted = FALSE;
CREATE INDEX settlement_account_date_idx
    ON settlement (account_id, settlement_date DESC) WHERE deleted = FALSE AND account_id IS NOT NULL;
CREATE INDEX settlement_document_no_idx
    ON settlement (lower(document_no)) WHERE document_no IS NOT NULL AND deleted = FALSE;
CREATE INDEX settlement_counterparty_bank_idx
    ON settlement (counterparty_bank_account_id) WHERE counterparty_bank_account_id IS NOT NULL;
-- Araç gideri bağı denetimi (§3.5, SETTLEMENT_SOURCE_MANAGED).
CREATE INDEX vehicle_expense_settlement_idx
    ON vehicle_expense (settlement_id) WHERE settlement_id IS NOT NULL;
