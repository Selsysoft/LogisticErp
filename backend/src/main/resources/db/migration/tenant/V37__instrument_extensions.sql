-- Z08 · Faz 12.3 · MX3 §2.1-§2.2, §4 (V22 taslağının yerine) · 12.3_TASARIM §1.1
-- Çek/senet ek alanları, emanet kasası, hareket fonu. Yeni durumlar (CANCELLED, RETURNED, COLLATERAL,
-- PROTESTED) yalnız Java'da: status VARCHAR(20), DB CHECK yok (V3).

-- 1. Bileşik FK hedefi (V38 check_leaf ve ileride kredi teminatı için)
ALTER TABLE instrument ADD CONSTRAINT instrument_id_company_uq UNIQUE (id, company_id);

-- 2. Ek alanlar
ALTER TABLE instrument
    ADD COLUMN issue_date      DATE,
    ADD COLUMN bank_branch     VARCHAR(100),
    ADD COLUMN drawer_name     VARCHAR(200),
    ADD COLUMN description     VARCHAR(500),
    ADD COLUMN custody_fund_id UUID,
    ADD COLUMN note_type       VARCHAR(20),
    ADD COLUMN is_collateral   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN settled_date    DATE,
    -- Emanet kasası çekin şirketinde olmalı (MX5 D9 deseni; NULL → denetlenmez, MATCH SIMPLE)
    ADD CONSTRAINT instrument_custody_company_fk
        FOREIGN KEY (custody_fund_id, company_id) REFERENCES fund_account (id, company_id),
    ADD CONSTRAINT instrument_note_type_ck CHECK (
        note_type IS NULL OR (kind = 'NOTE' AND note_type IN ('PLAIN', 'ORDER', 'BOND'))),
    ADD CONSTRAINT instrument_collateral_ck CHECK (is_collateral = FALSE OR kind = 'NOTE'),
    ADD CONSTRAINT instrument_dates_ck CHECK (issue_date IS NULL OR issue_date <= due_date);

-- 3. Hareket satırının fonu: AT_BANK/COLLECTED/PAID'de banka, COLLECTED_TO_CASH'te kasa,
--    PORTFOLIO'da (emanet) kasa. Mevcut satırlar NULL kalır.
ALTER TABLE instrument_movement
    ADD COLUMN fund_account_id UUID REFERENCES fund_account (id);

-- 4. Numara tekilliği: iptal/iade edilen çekin numarası yeniden kullanılabilir (düzeltme; OK-12.3-5).
--    Koşul daraldığı için dolu veride ihlal oluşmaz. Kolon sırası korunur (CompanyMigrationIT G-9).
DROP INDEX instrument_number_uq;
CREATE UNIQUE INDEX instrument_number_uq
    ON instrument (company_id, kind, direction, number, COALESCE(bank_name, ''))
    WHERE deleted = FALSE AND status NOT IN ('CANCELLED', 'RETURNED');

-- 5. Liste/rapor indeksleri (vade aralığı + cari süzgeci)
CREATE INDEX instrument_due_idx ON instrument (company_id, direction, kind, due_date) WHERE deleted = FALSE;
CREATE INDEX instrument_account_idx ON instrument (account_id) WHERE deleted = FALSE;
CREATE INDEX instrument_movement_fund_idx ON instrument_movement (fund_account_id)
    WHERE fund_account_id IS NOT NULL;
