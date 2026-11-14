-- Z03 · Faz 12.1a · MX5 D2, D5, D6, D11, D12, D14 · 12.1a_TASARIM §2.3
-- Para ve yasal belge tablolarına company_id + bileşik FK (branch_id, company_id) → branch (id, company_id).
-- Kaynak sırası: şube → fon → kaynak belge → varsayılan şirket. Silinmiş satırlar da doldurulur.
-- Bileşik FK'ler ON UPDATE NO ACTION: kullanılmış şubenin/fonun şirketi değiştirilemez (servis önce 409 verir).

-- 1. Banka/kasa hesabı (fund_transaction ve company.default_fund_account_id'nin bileşik FK hedefi)
ALTER TABLE fund_account ADD COLUMN company_id UUID;
UPDATE fund_account x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE fund_account ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE fund_account
    ADD CONSTRAINT fund_account_branch_company_fk
        FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id),
    ADD CONSTRAINT fund_account_id_company_uq UNIQUE (id, company_id);
CREATE INDEX fund_account_company_idx ON fund_account (company_id);

-- Şirketin varsayılan banka hesabı yalnız kendi fonu olabilir.
ALTER TABLE company ADD CONSTRAINT company_default_fund_fk
    FOREIGN KEY (default_fund_account_id, id) REFERENCES fund_account (id, company_id);

-- 2. Fon hareketi (şirket fondan)
ALTER TABLE fund_transaction ADD COLUMN company_id UUID;
UPDATE fund_transaction x SET company_id = f.company_id FROM fund_account f WHERE f.id = x.fund_account_id;
ALTER TABLE fund_transaction ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE fund_transaction ADD CONSTRAINT fund_transaction_fund_company_fk
    FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id);
CREATE INDEX fund_transaction_company_idx ON fund_transaction (company_id, transaction_date);

-- 3. Cari hareket
ALTER TABLE account_transaction ADD COLUMN company_id UUID;
UPDATE account_transaction x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE account_transaction ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE account_transaction ADD CONSTRAINT account_transaction_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
CREATE INDEX account_transaction_company_idx
    ON account_transaction (account_id, company_id, currency, transaction_date);

-- 4. Çek/senet
ALTER TABLE instrument ADD COLUMN company_id UUID;
UPDATE instrument x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE instrument ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE instrument ADD CONSTRAINT instrument_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
-- Çekin fonu (AT_BANK/COLLECTED_TO_CASH/PAID) aynı şirkette olmalı (D9). fund_account_id NULL → denetlenmez (MATCH SIMPLE).
ALTER TABLE instrument ADD CONSTRAINT instrument_fund_company_fk
    FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id);
CREATE INDEX instrument_company_idx ON instrument (company_id, status, due_date);
-- Her şirketin kendi portföyü (D2): A'nın B'ye cirosu ENDORSED satırı silinmeden kalır; B aynı çeki
-- RECEIVED olarak alabilmeli. V3:141-142'deki kiracı geneli indeks şirket başına yapılır (tek şirketli veride güvenli).
DROP INDEX instrument_number_uq;
CREATE UNIQUE INDEX instrument_number_uq
    ON instrument (company_id, kind, direction, number, COALESCE(bank_name, '')) WHERE deleted = FALSE;

-- 5. Alış faturası (purchase_invoice_number_uq (account_id, number) korunur: tedarikçinin numarası)
ALTER TABLE purchase_invoice ADD COLUMN company_id UUID;
UPDATE purchase_invoice x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE purchase_invoice ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE purchase_invoice ADD CONSTRAINT purchase_invoice_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
CREATE INDEX purchase_invoice_company_idx ON purchase_invoice (company_id, invoice_date);

-- 6. Ödeme planı
ALTER TABLE payment_plan ADD COLUMN company_id UUID;
UPDATE payment_plan x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE payment_plan ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payment_plan ADD CONSTRAINT payment_plan_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
CREATE INDEX payment_plan_company_idx ON payment_plan (company_id, status, due_date);

-- 7. Ödeme/tahsilat
ALTER TABLE settlement ADD COLUMN company_id UUID;
UPDATE settlement x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE settlement ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE settlement ADD CONSTRAINT settlement_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
-- D9'un veritabanı güvencesi: kasa/banka hesabı settlement'ın şirketinde (servis 422'si kullanıcı mesajı için kalır).
ALTER TABLE settlement ADD CONSTRAINT settlement_fund_company_fk
    FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id);
DROP INDEX settlement_daily_idx;
CREATE INDEX settlement_daily_idx ON settlement (type, settlement_date, company_id, branch_id);

-- 8. Açılış faturası (devir şirket bazında: numara tekilliği şirket + cari)
ALTER TABLE opening_invoice ADD COLUMN company_id UUID;
UPDATE opening_invoice x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE opening_invoice ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE opening_invoice ADD CONSTRAINT opening_invoice_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
DROP INDEX opening_invoice_number_uq;
CREATE UNIQUE INDEX opening_invoice_number_uq
    ON opening_invoice (company_id, account_id, number) WHERE status = 'OPEN' AND deleted = FALSE;

-- 9. Araç gideri
ALTER TABLE vehicle_expense ADD COLUMN company_id UUID;
UPDATE vehicle_expense x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE vehicle_expense ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE vehicle_expense ADD CONSTRAINT vehicle_expense_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);
ALTER TABLE vehicle_expense ADD CONSTRAINT vehicle_expense_fund_company_fk
    FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id);
CREATE INDEX vehicle_expense_company_idx ON vehicle_expense (company_id, expense_date);

-- 10. Navlun ve depo faturası: numara şirket başına tekil
ALTER TABLE freight_invoice ADD COLUMN company_id UUID;
UPDATE freight_invoice x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE freight_invoice ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE freight_invoice ADD CONSTRAINT freight_invoice_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);

ALTER TABLE warehouse_invoice ADD COLUMN company_id UUID;
UPDATE warehouse_invoice x SET company_id = b.company_id FROM branch b WHERE b.id = x.branch_id;
ALTER TABLE warehouse_invoice ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE warehouse_invoice ADD CONSTRAINT warehouse_invoice_branch_company_fk
    FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id);

-- Sütun içi "number UNIQUE" kısıtlarının adı Postgres'in ürettiği addır (beklenen *_number_key);
-- ada güvenmeden katalogdan bulunup kaldırılır.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conrelid::regclass AS tbl, c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'u'
           AND c.conrelid IN ('freight_invoice'::regclass, 'warehouse_invoice'::regclass)
           AND array_length(c.conkey, 1) = 1
           AND a.attname = 'number'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END $$;
CREATE UNIQUE INDEX freight_invoice_company_number_uq ON freight_invoice (company_id, number);
CREATE INDEX freight_invoice_company_idx ON freight_invoice (company_id, invoice_date);
CREATE UNIQUE INDEX warehouse_invoice_company_number_uq ON warehouse_invoice (company_id, number);
CREATE INDEX warehouse_invoice_company_idx ON warehouse_invoice (company_id, invoice_date);

-- 11. Teklif ve sözleşme (şube taşımaz; mevcutlar varsayılan şirkete). Numaralar global kalır (D11).
ALTER TABLE quote ADD COLUMN company_id UUID REFERENCES company (id);
UPDATE quote SET company_id = (SELECT id FROM company WHERE is_default AND deleted = FALSE);
ALTER TABLE quote ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX quote_company_idx ON quote (company_id);

ALTER TABLE contract ADD COLUMN company_id UUID REFERENCES company (id);
UPDATE contract c SET company_id = COALESCE(
    (SELECT q.company_id FROM quote q WHERE q.id = c.quote_id),
    (SELECT id FROM company WHERE is_default AND deleted = FALSE));
ALTER TABLE contract ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX contract_company_idx ON contract (company_id, account_id);

-- 12. e-Belge (gönderen şirket = kaynak belgenin şirketi)
ALTER TABLE edocument ADD COLUMN company_id UUID REFERENCES company (id);
UPDATE edocument e SET company_id = f.company_id
  FROM freight_invoice f
 WHERE e.source_type = 'FREIGHT_INVOICE' AND f.id = e.source_id;
UPDATE edocument e SET company_id = b.company_id
  FROM shipment_document d
  JOIN shipment s ON s.id = d.shipment_id
  JOIN branch b ON b.id = s.branch_id
 WHERE e.source_type = 'WAYBILL' AND d.id = e.source_id AND e.company_id IS NULL;
UPDATE edocument SET company_id = (SELECT id FROM company WHERE is_default AND deleted = FALSE)
 WHERE company_id IS NULL;
ALTER TABLE edocument ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX edocument_company_idx ON edocument (company_id, status);

-- 13. Cari: ortak kart (Y1). company_id NULL = tüm şirketler (D6); represents_company_id = intercompany carisi (D5).
ALTER TABLE account
    ADD COLUMN company_id            UUID REFERENCES company (id),
    ADD COLUMN represents_company_id UUID REFERENCES company (id);
CREATE UNIQUE INDEX account_represents_company_uq ON account (represents_company_id)
    WHERE represents_company_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX account_company_idx ON account (company_id) WHERE company_id IS NOT NULL;
