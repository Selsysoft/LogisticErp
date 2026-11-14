-- Z07 · Faz 12.2 · MX2 §2.1–§2.3, §3 C1–C3, C11 · 12.2_TASARIM §1.1
-- Banka/kasa tanımı ek alanları, hareket kategorisi, açılış bakiyesi belgesi.
-- Bakiye saklanmaz (C1); açılış bir harekettir (FUND_OPENING, source_id = fund_opening.id) (C2).

ALTER TABLE fund_account
    ADD COLUMN account_type      VARCHAR(20)  NOT NULL DEFAULT 'DEMAND',
    -- Hesap no kişisel veri olabilir (şahıs şirketi): şifreli + maskeli (V27 account_bank_account deseni,
    -- PersonalDataProtector; SEC-12.2-07). Düz kolon yok. Eski fund_account.iban (V3) düz kalır (§9 OK-12.2-18).
    ADD COLUMN account_no_enc    VARCHAR(500),
    ADD COLUMN account_no_masked VARCHAR(50),
    ADD COLUMN bank_branch_name  VARCHAR(100),
    ADD COLUMN description       VARCHAR(500),
    ADD COLUMN active            BOOLEAN      NOT NULL DEFAULT TRUE,
    ADD COLUMN update_count      INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE fund_account
    ADD CONSTRAINT fund_account_type_ck
        CHECK (account_type IN ('DEMAND', 'CREDIT', 'DEPOSIT', 'INVESTMENT')),
    -- Kasa yalnız vadesiz olur (ZTO CashIntroduction'da hesap türü yok).
    ADD CONSTRAINT fund_account_cash_type_ck CHECK (kind = 'BANK' OR account_type = 'DEMAND'),
    ADD CONSTRAINT fund_account_account_no_ck CHECK ((account_no_enc IS NULL) = (account_no_masked IS NULL));
CREATE INDEX fund_account_list_idx ON fund_account (company_id, kind, account_type) WHERE deleted = FALSE;

-- ZTO AccountingType'ın kaynak türünden türetilemeyen kısmı (manuel Masraf/Gelir/Diğer, masraf bacağı,
-- açılış). Diğer hareketlerde NULL; muhasebe tipi sorguda türetilir (§3.2.6).
ALTER TABLE fund_transaction ADD COLUMN category VARCHAR(20);
ALTER TABLE fund_transaction ADD CONSTRAINT fund_transaction_category_ck CHECK (
    category IS NULL OR category IN ('EXPENSE', 'INCOME', 'OTHER', 'OPENING', 'COMMISSION', 'FEE', 'KMV'));
-- Çok hesaplı hareket araması (tarih aralığıyla başlar).
CREATE INDEX fund_transaction_date_idx ON fund_transaction (transaction_date, fund_account_id) WHERE deleted = FALSE;

CREATE TABLE fund_opening (
    id              UUID PRIMARY KEY,
    fund_account_id UUID           NOT NULL,
    company_id      UUID           NOT NULL,
    direction       VARCHAR(3)     NOT NULL,
    amount          NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)        NOT NULL,
    opening_date    DATE           NOT NULL,
    status          VARCHAR(10)    NOT NULL DEFAULT 'POSTED',
    reversed_at     DATE,
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT fund_opening_fund_company_fk FOREIGN KEY (fund_account_id, company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT fund_opening_direction_ck CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT fund_opening_status_ck CHECK (status IN ('POSTED', 'REVERSED')),
    CONSTRAINT fund_opening_reverse_ck CHECK ((status = 'REVERSED') = (reversed_at IS NOT NULL)),
    CONSTRAINT fund_opening_currency_ck CHECK (currency ~ '^[A-Z]{3}$')
);
-- Hesap başına en çok bir geçerli açılış.
CREATE UNIQUE INDEX fund_opening_active_uq ON fund_opening (fund_account_id) WHERE status = 'POSTED' AND deleted = FALSE;
