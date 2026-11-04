CREATE TABLE account (
    id         UUID PRIMARY KEY,
    code       VARCHAR(50)  NOT NULL,
    name       VARCHAR(200) NOT NULL,
    type       VARCHAR(20)  NOT NULL,
    tax_number VARCHAR(20),
    branch_id  UUID REFERENCES branch (id),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX account_code_active_uq ON account (code) WHERE deleted = FALSE;

CREATE TABLE account_transaction (
    id               UUID PRIMARY KEY,
    account_id       UUID           NOT NULL REFERENCES account (id),
    branch_id        UUID           NOT NULL REFERENCES branch (id),
    direction        VARCHAR(10)    NOT NULL,
    amount           NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency         CHAR(3)        NOT NULL,
    exchange_rate    NUMERIC(19, 6) NOT NULL,
    rate_date        DATE           NOT NULL,
    tl_amount        NUMERIC(19, 4) NOT NULL,
    transaction_date DATE           NOT NULL,
    description      VARCHAR(500),
    source_type      VARCHAR(40)    NOT NULL,
    source_id        UUID           NOT NULL,
    created_by       VARCHAR(254)   NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_by       VARCHAR(254)   NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL,
    deleted          BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (source_type, source_id)
);
CREATE INDEX account_transaction_account_idx ON account_transaction (account_id, currency, transaction_date);

CREATE TABLE fund_account (
    id             UUID PRIMARY KEY,
    code           VARCHAR(50)  NOT NULL,
    name           VARCHAR(200) NOT NULL,
    kind           VARCHAR(10)  NOT NULL,
    currency       CHAR(3)      NOT NULL,
    branch_id      UUID         NOT NULL REFERENCES branch (id),
    bank_name      VARCHAR(100),
    iban           VARCHAR(34),
    allow_negative BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by     VARCHAR(254) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_by     VARCHAR(254) NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX fund_account_code_active_uq ON fund_account (code) WHERE deleted = FALSE;

CREATE TABLE fund_transaction (
    id               UUID PRIMARY KEY,
    fund_account_id  UUID           NOT NULL REFERENCES fund_account (id),
    direction        VARCHAR(10)    NOT NULL,
    amount           NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency         CHAR(3)        NOT NULL,
    exchange_rate    NUMERIC(19, 6) NOT NULL,
    rate_date        DATE           NOT NULL,
    tl_amount        NUMERIC(19, 4) NOT NULL,
    transaction_date DATE           NOT NULL,
    description      VARCHAR(500),
    source_type      VARCHAR(40)    NOT NULL,
    source_id        UUID           NOT NULL,
    created_by       VARCHAR(254)   NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_by       VARCHAR(254)   NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL,
    deleted          BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (source_type, source_id, fund_account_id)
);
CREATE INDEX fund_transaction_fund_idx ON fund_transaction (fund_account_id, transaction_date);

CREATE TABLE expense_type (
    id         UUID PRIMARY KEY,
    code       VARCHAR(50)  NOT NULL,
    name       VARCHAR(100) NOT NULL,
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX expense_type_code_active_uq ON expense_type (code) WHERE deleted = FALSE;

CREATE TABLE expense_item (
    id              UUID PRIMARY KEY,
    expense_type_id UUID         NOT NULL REFERENCES expense_type (id),
    code            VARCHAR(50)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX expense_item_code_active_uq ON expense_item (code) WHERE deleted = FALSE;

INSERT INTO expense_type (id, code, name, created_by, created_at, updated_by, updated_at)
VALUES (gen_random_uuid(), 'VEHICLE', 'Araç ve Sefer Giderleri', 'system', now(), 'system', now());

INSERT INTO expense_item (id, expense_type_id, code, name, created_by, created_at, updated_by, updated_at)
SELECT gen_random_uuid(), t.id, v.code, v.name, 'system', now(), 'system', now()
FROM expense_type t
CROSS JOIN (VALUES
    ('FUEL', 'Yakıt'),
    ('TOLL', 'HGS/OGS'),
    ('PER_DIEM', 'Harcırah'),
    ('REPAIR', 'Tamir'),
    ('FINE', 'Ceza'),
    ('INSURANCE', 'Sigorta'),
    ('TIRE', 'Lastik')
) AS v(code, name)
WHERE t.code = 'VEHICLE';

CREATE TABLE instrument (
    id                   UUID PRIMARY KEY,
    kind                 VARCHAR(10)    NOT NULL,
    direction            VARCHAR(10)    NOT NULL,
    number               VARCHAR(50)    NOT NULL,
    bank_name            VARCHAR(100),
    account_id           UUID           NOT NULL REFERENCES account (id),
    endorsed_account_id  UUID REFERENCES account (id),
    branch_id            UUID           NOT NULL REFERENCES branch (id),
    fund_account_id      UUID REFERENCES fund_account (id),
    amount               NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency             CHAR(3)        NOT NULL,
    due_date             DATE           NOT NULL,
    status               VARCHAR(20)    NOT NULL,
    created_by           VARCHAR(254)   NOT NULL,
    created_at           TIMESTAMPTZ    NOT NULL,
    updated_by           VARCHAR(254)   NOT NULL,
    updated_at           TIMESTAMPTZ    NOT NULL,
    deleted              BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX instrument_number_uq
    ON instrument (kind, direction, number, COALESCE(bank_name, '')) WHERE deleted = FALSE;
CREATE INDEX instrument_status_idx ON instrument (status, due_date);

CREATE TABLE instrument_movement (
    id            UUID PRIMARY KEY,
    instrument_id UUID         NOT NULL REFERENCES instrument (id),
    from_status   VARCHAR(20),
    to_status     VARCHAR(20)  NOT NULL,
    movement_date DATE         NOT NULL,
    note          VARCHAR(500),
    created_by    VARCHAR(254) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_by    VARCHAR(254) NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL,
    deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX instrument_movement_instrument_idx ON instrument_movement (instrument_id);

CREATE TABLE purchase_invoice (
    id           UUID PRIMARY KEY,
    account_id   UUID           NOT NULL REFERENCES account (id),
    branch_id    UUID           NOT NULL REFERENCES branch (id),
    number       VARCHAR(50)    NOT NULL,
    invoice_date DATE           NOT NULL,
    due_date     DATE           NOT NULL,
    net_amount   NUMERIC(19, 4) NOT NULL,
    vat_amount   NUMERIC(19, 4) NOT NULL,
    total_amount NUMERIC(19, 4) NOT NULL,
    currency     CHAR(3)        NOT NULL,
    status       VARCHAR(20)    NOT NULL,
    description  VARCHAR(500),
    created_by   VARCHAR(254)   NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL,
    updated_by   VARCHAR(254)   NOT NULL,
    updated_at   TIMESTAMPTZ    NOT NULL,
    deleted      BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX purchase_invoice_number_uq ON purchase_invoice (account_id, number) WHERE deleted = FALSE;

CREATE TABLE payment_plan (
    id                  UUID PRIMARY KEY,
    account_id          UUID           NOT NULL REFERENCES account (id),
    branch_id           UUID           NOT NULL REFERENCES branch (id),
    amount              NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency            CHAR(3)        NOT NULL,
    due_date            DATE           NOT NULL,
    status              VARCHAR(20)    NOT NULL,
    purchase_invoice_id UUID REFERENCES purchase_invoice (id),
    description         VARCHAR(500),
    created_by          VARCHAR(254)   NOT NULL,
    created_at          TIMESTAMPTZ    NOT NULL,
    updated_by          VARCHAR(254)   NOT NULL,
    updated_at          TIMESTAMPTZ    NOT NULL,
    deleted             BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX payment_plan_due_idx ON payment_plan (status, due_date, currency);

CREATE TABLE payment_plan_event (
    id         UUID PRIMARY KEY,
    plan_id    UUID         NOT NULL REFERENCES payment_plan (id),
    event_type VARCHAR(20)  NOT NULL,
    note       VARCHAR(500),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX payment_plan_event_plan_idx ON payment_plan_event (plan_id);

CREATE TABLE settlement (
    id              UUID PRIMARY KEY,
    type            VARCHAR(20)    NOT NULL,
    method          VARCHAR(10)    NOT NULL,
    account_id      UUID REFERENCES account (id),
    branch_id       UUID           NOT NULL REFERENCES branch (id),
    fund_account_id UUID REFERENCES fund_account (id),
    instrument_id   UUID REFERENCES instrument (id),
    expense_item_id UUID REFERENCES expense_item (id),
    plan_id         UUID REFERENCES payment_plan (id),
    amount          NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)        NOT NULL,
    settlement_date DATE           NOT NULL,
    description     VARCHAR(500),
    status          VARCHAR(20)    NOT NULL,
    idempotency_key VARCHAR(100)   UNIQUE,
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX settlement_daily_idx ON settlement (type, settlement_date, branch_id);

CREATE TABLE density_threshold (
    currency   CHAR(3) PRIMARY KEY,
    low        NUMERIC(19, 4) NOT NULL,
    medium     NUMERIC(19, 4) NOT NULL,
    high       NUMERIC(19, 4) NOT NULL,
    created_by VARCHAR(254)   NOT NULL,
    created_at TIMESTAMPTZ    NOT NULL,
    updated_by VARCHAR(254)   NOT NULL,
    updated_at TIMESTAMPTZ    NOT NULL,
    deleted    BOOLEAN        NOT NULL DEFAULT FALSE
);

-- FINANCE_MANAGE: cari, banka/kasa ve eşik tanımları.
INSERT INTO role_permission (role_id, permission)
SELECT id, 'FINANCE_MANAGE' FROM role WHERE code IN ('FINANCE_SUPER', 'FINANCE');
