-- Z14 · Faz 12.2 · MX2 §4 V26; 04 §6.2-Y8 notu · 12.2_TASARIM §1.3
-- Bilgi amaçlı gelir/gider defteri (nakit DEĞİL; nakit fund_transaction'dadır). Tek yazıcı IncomeExpenseService.
-- 12.2 yazar: FX_DIFF (döviz bozumu kur farkı), BANK_CHARGE (transfer masrafları). INTEREST 12.6'da.
-- Y8 (kur farkı = rapor + elle belge) cari kur farkı içindir; fon bozumunun kur farkı burada otomatik bilgi kaydıdır.
-- Ters kayıt: source_type = 'REVERSAL', source_id = asıl satır id, yön ters.

CREATE TABLE fin_income_expense (
    id               UUID PRIMARY KEY,
    company_id       UUID           NOT NULL,
    branch_id        UUID           NOT NULL,
    direction        VARCHAR(10)    NOT NULL,
    category         VARCHAR(20)    NOT NULL,
    source_type      VARCHAR(40)    NOT NULL,
    source_id        UUID           NOT NULL,
    transaction_date DATE           NOT NULL,
    amount           NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency         CHAR(3)        NOT NULL,
    exchange_rate    NUMERIC(19, 6) NOT NULL,
    rate_date        DATE           NOT NULL,
    tl_amount        NUMERIC(19, 4) NOT NULL,
    fund_account_id  UUID,
    description      VARCHAR(500),
    created_by       VARCHAR(254)   NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_by       VARCHAR(254)   NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL,
    deleted          BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT fin_income_expense_branch_company_fk FOREIGN KEY (branch_id, company_id)
        REFERENCES branch (id, company_id),
    CONSTRAINT fin_income_expense_fund_company_fk FOREIGN KEY (fund_account_id, company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT fin_income_expense_direction_ck CHECK (direction IN ('INCOME', 'EXPENSE')),
    CONSTRAINT fin_income_expense_category_ck CHECK (category IN ('INTEREST', 'FX_DIFF', 'BANK_CHARGE')),
    CONSTRAINT fin_income_expense_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT fin_income_expense_source_uq UNIQUE (source_type, source_id, category)
);
CREATE INDEX fin_income_expense_company_idx ON fin_income_expense (company_id, transaction_date) WHERE deleted = FALSE;
