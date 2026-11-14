-- Z13 · Faz 12.2 · MX2 §2.4, §3 C4/C6/C8/C10; MX5 D5/D8; 04 §6.2-Y4, Y9 · 12.2_TASARIM §1.2
-- Transfer merkezi (aynı şirket; iki fon FK'si de transferin şirketine bağlı), masraflar, döviz bozum
-- kaynakları; şirketler arası virman (intercompany_transfer: A'da PAYMENT GS-B + B'de COLLECTION GS-A).

-- Bileşik FK hedefleri
ALTER TABLE settlement ADD CONSTRAINT settlement_id_company_uq UNIQUE (id, company_id);

CREATE TABLE fund_transfer (
    id                   UUID PRIMARY KEY,
    company_id           UUID           NOT NULL REFERENCES company (id),
    code                 VARCHAR(30)    NOT NULL,
    transfer_type        VARCHAR(20)    NOT NULL,
    transfer_date        DATE           NOT NULL,
    source_fund_id       UUID           NOT NULL,
    source_amount        NUMERIC(19, 4) NOT NULL CHECK (source_amount > 0),
    source_currency      CHAR(3)        NOT NULL,
    target_fund_id       UUID           NOT NULL,
    target_amount        NUMERIC(19, 4) NOT NULL CHECK (target_amount > 0),
    target_currency      CHAR(3)        NOT NULL,
    rate                 NUMERIC(19, 6),
    rate_operation       VARCHAR(10),
    calc_mode            VARCHAR(20),
    fx_diff_tl           NUMERIC(19, 4),
    document_no          VARCHAR(50),
    description          VARCHAR(500),
    rules_checked        BOOLEAN        NOT NULL DEFAULT TRUE,
    status               VARCHAR(10)    NOT NULL DEFAULT 'POSTED',
    reversed_at          DATE,
    reversal_reason      VARCHAR(500),
    replaces_transfer_id UUID REFERENCES fund_transfer (id),
    idempotency_key      VARCHAR(100),
    created_by           VARCHAR(254)   NOT NULL,
    created_at           TIMESTAMPTZ    NOT NULL,
    updated_by           VARCHAR(254)   NOT NULL,
    updated_at           TIMESTAMPTZ    NOT NULL,
    deleted              BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT fund_transfer_id_company_uq UNIQUE (id, company_id),
    CONSTRAINT fund_transfer_source_company_fk FOREIGN KEY (source_fund_id, company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT fund_transfer_target_company_fk FOREIGN KEY (target_fund_id, company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT fund_transfer_funds_ck CHECK (source_fund_id <> target_fund_id),
    CONSTRAINT fund_transfer_type_ck CHECK (transfer_type IN
        ('VIREMENT', 'EFT', 'WIRE', 'FX_EXCHANGE', 'BANK_TO_CASH', 'CASH_TO_BANK', 'CASH_TO_CASH')),
    CONSTRAINT fund_transfer_currency_ck CHECK (
        source_currency ~ '^[A-Z]{3}$' AND target_currency ~ '^[A-Z]{3}$'
        AND (transfer_type = 'FX_EXCHANGE') = (source_currency <> target_currency)),
    CONSTRAINT fund_transfer_amount_ck CHECK (transfer_type = 'FX_EXCHANGE' OR source_amount = target_amount),
    CONSTRAINT fund_transfer_fx_ck CHECK (
        transfer_type <> 'FX_EXCHANGE'
        OR (rate IS NOT NULL AND rate > 0 AND rate_operation IN ('MULTIPLY', 'DIVIDE'))),
    CONSTRAINT fund_transfer_calc_mode_ck CHECK (
        calc_mode IS NULL OR calc_mode IN ('SOURCE_RATE', 'RATE_TARGET', 'SOURCE_TARGET')),
    CONSTRAINT fund_transfer_status_ck CHECK (status IN ('POSTED', 'REVERSED')),
    CONSTRAINT fund_transfer_reverse_ck CHECK ((status = 'REVERSED') = (reversed_at IS NOT NULL))
);
CREATE UNIQUE INDEX fund_transfer_code_uq ON fund_transfer (company_id, code) WHERE deleted = FALSE;
CREATE UNIQUE INDEX fund_transfer_idempotency_uq ON fund_transfer (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX fund_transfer_replaces_uq ON fund_transfer (replaces_transfer_id)
    WHERE replaces_transfer_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX fund_transfer_list_idx ON fund_transfer (company_id, transfer_date, transfer_type) WHERE deleted = FALSE;
CREATE INDEX fund_transfer_source_fund_idx ON fund_transfer (source_fund_id);
CREATE INDEX fund_transfer_target_fund_idx ON fund_transfer (target_fund_id);

CREATE TABLE fund_transfer_cost (
    id              UUID PRIMARY KEY,
    transfer_id     UUID           NOT NULL,
    company_id      UUID           NOT NULL,
    cost_kind       VARCHAR(20)    NOT NULL,
    fund_account_id UUID           NOT NULL,
    rate_percent    NUMERIC(9, 6),
    base_amount     NUMERIC(19, 4),
    amount          NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)        NOT NULL,
    expense_item_id UUID REFERENCES expense_item (id),
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT fund_transfer_cost_transfer_fk FOREIGN KEY (transfer_id, company_id)
        REFERENCES fund_transfer (id, company_id),
    CONSTRAINT fund_transfer_cost_fund_company_fk FOREIGN KEY (fund_account_id, company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT fund_transfer_cost_kind_ck CHECK (cost_kind IN ('COMMISSION', 'FEE', 'KMV')),
    CONSTRAINT fund_transfer_cost_kmv_ck CHECK (
        (cost_kind = 'KMV') = (rate_percent IS NOT NULL AND base_amount IS NOT NULL)),
    CONSTRAINT fund_transfer_cost_currency_ck CHECK (currency ~ '^[A-Z]{3}$')
);
-- Transfer başına her masraf türünden bir satır.
CREATE UNIQUE INDEX fund_transfer_cost_kind_uq ON fund_transfer_cost (transfer_id, cost_kind) WHERE deleted = FALSE;

CREATE TABLE fund_transfer_source (
    id                 UUID PRIMARY KEY,
    transfer_id        UUID           NOT NULL,
    company_id         UUID           NOT NULL,
    source_kind        VARCHAR(20)    NOT NULL,
    settlement_id      UUID,
    source_transfer_id UUID,
    used_amount        NUMERIC(19, 4) NOT NULL CHECK (used_amount > 0),
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT fund_transfer_source_transfer_fk FOREIGN KEY (transfer_id, company_id)
        REFERENCES fund_transfer (id, company_id),
    CONSTRAINT fund_transfer_source_settlement_fk FOREIGN KEY (settlement_id, company_id)
        REFERENCES settlement (id, company_id),
    CONSTRAINT fund_transfer_source_prev_fk FOREIGN KEY (source_transfer_id, company_id)
        REFERENCES fund_transfer (id, company_id),
    CONSTRAINT fund_transfer_source_kind_ck CHECK (
        (source_kind = 'SETTLEMENT' AND settlement_id IS NOT NULL AND source_transfer_id IS NULL)
        OR (source_kind = 'TRANSFER' AND source_transfer_id IS NOT NULL AND settlement_id IS NULL)),
    CONSTRAINT fund_transfer_source_self_ck CHECK (source_transfer_id IS NULL OR source_transfer_id <> transfer_id)
);
CREATE UNIQUE INDEX fund_transfer_source_uq
    ON fund_transfer_source (transfer_id, COALESCE(settlement_id, source_transfer_id)) WHERE deleted = FALSE;
CREATE INDEX fund_transfer_source_settlement_idx ON fund_transfer_source (settlement_id) WHERE settlement_id IS NOT NULL;
CREATE INDEX fund_transfer_source_prev_idx ON fund_transfer_source (source_transfer_id) WHERE source_transfer_id IS NOT NULL;

CREATE TABLE intercompany_transfer (
    id                       UUID PRIMARY KEY,
    code                     VARCHAR(30)    NOT NULL,
    transfer_type            VARCHAR(20)    NOT NULL,
    reason_type              VARCHAR(20)    NOT NULL,
    transfer_date            DATE           NOT NULL,
    from_company_id          UUID           NOT NULL REFERENCES company (id),
    to_company_id            UUID           NOT NULL REFERENCES company (id),
    from_branch_id           UUID           NOT NULL,
    to_branch_id             UUID           NOT NULL,
    from_fund_id             UUID           NOT NULL,
    to_fund_id               UUID           NOT NULL,
    amount                   NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency                 CHAR(3)        NOT NULL,
    payment_settlement_id    UUID           NOT NULL,
    collection_settlement_id UUID           NOT NULL,
    document_no              VARCHAR(50),
    description              VARCHAR(500),
    status                   VARCHAR(10)    NOT NULL DEFAULT 'POSTED',
    reversed_at              DATE,
    reversal_reason          VARCHAR(500),
    idempotency_key          VARCHAR(100),
    created_by               VARCHAR(254)   NOT NULL,
    created_at               TIMESTAMPTZ    NOT NULL,
    updated_by               VARCHAR(254)   NOT NULL,
    updated_at               TIMESTAMPTZ    NOT NULL,
    deleted                  BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT intercompany_transfer_companies_ck CHECK (from_company_id <> to_company_id),
    CONSTRAINT intercompany_transfer_from_branch_fk FOREIGN KEY (from_branch_id, from_company_id)
        REFERENCES branch (id, company_id),
    CONSTRAINT intercompany_transfer_to_branch_fk FOREIGN KEY (to_branch_id, to_company_id)
        REFERENCES branch (id, company_id),
    CONSTRAINT intercompany_transfer_from_fund_fk FOREIGN KEY (from_fund_id, from_company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT intercompany_transfer_to_fund_fk FOREIGN KEY (to_fund_id, to_company_id)
        REFERENCES fund_account (id, company_id),
    CONSTRAINT intercompany_transfer_payment_fk FOREIGN KEY (payment_settlement_id, from_company_id)
        REFERENCES settlement (id, company_id),
    CONSTRAINT intercompany_transfer_collection_fk FOREIGN KEY (collection_settlement_id, to_company_id)
        REFERENCES settlement (id, company_id),
    CONSTRAINT intercompany_transfer_type_ck CHECK (transfer_type IN
        ('EFT', 'WIRE', 'BANK_TO_CASH', 'CASH_TO_BANK', 'CASH_TO_CASH')),
    CONSTRAINT intercompany_transfer_reason_ck CHECK (reason_type IN ('DEBT_PAID', 'LOAN_GIVEN')),
    CONSTRAINT intercompany_transfer_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT intercompany_transfer_status_ck CHECK (status IN ('POSTED', 'REVERSED')),
    CONSTRAINT intercompany_transfer_reverse_ck CHECK ((status = 'REVERSED') = (reversed_at IS NOT NULL))
);
CREATE UNIQUE INDEX intercompany_transfer_code_uq ON intercompany_transfer (from_company_id, code) WHERE deleted = FALSE;
CREATE UNIQUE INDEX intercompany_transfer_payment_uq ON intercompany_transfer (payment_settlement_id);
CREATE UNIQUE INDEX intercompany_transfer_collection_uq ON intercompany_transfer (collection_settlement_id);
CREATE UNIQUE INDEX intercompany_transfer_idempotency_uq ON intercompany_transfer (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX intercompany_transfer_from_idx ON intercompany_transfer (from_company_id, transfer_date) WHERE deleted = FALSE;
CREATE INDEX intercompany_transfer_to_idx ON intercompany_transfer (to_company_id, transfer_date) WHERE deleted = FALSE;

-- Şirket başına seri tohumu (CompanyService.seriesPrefix ile aynı kural: varsayılan şirkette sonek,
-- diğerinde ilk 4 harf/rakam + '-' + sonek; kod harf/rakam içermiyorsa sonek). doc_type yorumu V25'te
-- iki tür sayar; DocumentType enum'u FUND_TRANSFER ve INTERCOMPANY_TRANSFER ile genişler (CHECK yok).
INSERT INTO document_series (id, company_id, doc_type, year, prefix, next_value, padding,
                             created_by, created_at, updated_by, updated_at)
SELECT gen_random_uuid(), c.id, s.doc_type, NULL,
       CASE WHEN c.is_default OR regexp_replace(upper(c.code), '[^A-Z0-9]', '', 'g') = ''
            THEN s.suffix
            ELSE left(regexp_replace(upper(c.code), '[^A-Z0-9]', '', 'g'), 4) || '-' || s.suffix END,
       1, 6, 'system', now(), 'system', now()
FROM company c
CROSS JOIN (VALUES ('FUND_TRANSFER', 'VRM'), ('INTERCOMPANY_TRANSFER', 'SVR')) AS s(doc_type, suffix)
WHERE c.deleted = FALSE
ON CONFLICT DO NOTHING;
