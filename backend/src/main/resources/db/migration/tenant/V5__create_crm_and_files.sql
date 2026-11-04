CREATE TABLE stored_file (
    id           UUID PRIMARY KEY,
    owner_type   VARCHAR(30)  NOT NULL,
    owner_id     UUID         NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes   BIGINT       NOT NULL,
    storage_key  VARCHAR(200) NOT NULL,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX stored_file_owner_idx ON stored_file (owner_type, owner_id);

CREATE TABLE crm_profile (
    account_id UUID PRIMARY KEY REFERENCES account (id),
    segment    VARCHAR(50),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE crm_profile_tag (
    account_id UUID        NOT NULL REFERENCES crm_profile (account_id) ON DELETE CASCADE,
    tag        VARCHAR(50) NOT NULL,
    PRIMARY KEY (account_id, tag)
);

CREATE TABLE contact (
    id         UUID PRIMARY KEY,
    account_id UUID         NOT NULL REFERENCES account (id),
    full_name  VARCHAR(200) NOT NULL,
    title      VARCHAR(100),
    email      VARCHAR(254),
    phone      VARCHAR(30),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX contact_account_idx ON contact (account_id);

CREATE TABLE opportunity (
    id                  UUID PRIMARY KEY,
    account_id          UUID           NOT NULL REFERENCES account (id),
    title               VARCHAR(200)   NOT NULL,
    stage               VARCHAR(20)    NOT NULL,
    amount              NUMERIC(19, 4) NOT NULL,
    currency            CHAR(3)        NOT NULL,
    owner_email         VARCHAR(254)   NOT NULL,
    expected_close_date DATE,
    lost_reason         VARCHAR(500),
    created_by          VARCHAR(254)   NOT NULL,
    created_at          TIMESTAMPTZ    NOT NULL,
    updated_by          VARCHAR(254)   NOT NULL,
    updated_at          TIMESTAMPTZ    NOT NULL,
    deleted             BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX opportunity_stage_idx ON opportunity (stage);

CREATE TABLE crm_activity (
    id             UUID PRIMARY KEY,
    account_id     UUID         NOT NULL REFERENCES account (id),
    opportunity_id UUID REFERENCES opportunity (id),
    type           VARCHAR(20)  NOT NULL,
    subject        VARCHAR(300) NOT NULL,
    due_date       DATE,
    completed_at   TIMESTAMPTZ,
    created_by     VARCHAR(254) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_by     VARCHAR(254) NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX crm_activity_due_idx ON crm_activity (due_date) WHERE completed_at IS NULL;
CREATE INDEX crm_activity_opportunity_idx ON crm_activity (opportunity_id);

CREATE TABLE tax_rate (
    id                      UUID PRIMARY KEY,
    code                    VARCHAR(50)   NOT NULL,
    name                    VARCHAR(100)  NOT NULL,
    vat_percent             NUMERIC(7, 4) NOT NULL,
    withholding_numerator   INTEGER       NOT NULL DEFAULT 0,
    withholding_denominator INTEGER       NOT NULL DEFAULT 1,
    created_by              VARCHAR(254)  NOT NULL,
    created_at              TIMESTAMPTZ   NOT NULL,
    updated_by              VARCHAR(254)  NOT NULL,
    updated_at              TIMESTAMPTZ   NOT NULL,
    deleted                 BOOLEAN       NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX tax_rate_code_active_uq ON tax_rate (code) WHERE deleted = FALSE;

CREATE TABLE tariff (
    id                     UUID PRIMARY KEY,
    code                   VARCHAR(50)    NOT NULL,
    name                   VARCHAR(200)   NOT NULL,
    currency               CHAR(3)        NOT NULL,
    account_id             UUID REFERENCES account (id),
    valid_from             DATE           NOT NULL,
    valid_to               DATE,
    active                 BOOLEAN        NOT NULL DEFAULT TRUE,
    fuel_surcharge_percent NUMERIC(7, 4),
    waiting_hourly_fee     NUMERIC(19, 4),
    extra_stop_fee         NUMERIC(19, 4),
    adr_percent            NUMERIC(7, 4),
    insurance_percent      NUMERIC(7, 4),
    tax_rate_id            UUID REFERENCES tax_rate (id),
    created_by             VARCHAR(254)   NOT NULL,
    created_at             TIMESTAMPTZ    NOT NULL,
    updated_by             VARCHAR(254)   NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL,
    deleted                BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX tariff_code_active_uq ON tariff (code) WHERE deleted = FALSE;

CREATE TABLE tariff_line (
    id           UUID PRIMARY KEY,
    tariff_id    UUID           NOT NULL REFERENCES tariff (id),
    kind         VARCHAR(20)    NOT NULL,
    origin       VARCHAR(100),
    destination  VARCHAR(100),
    vehicle_type VARCHAR(50),
    unit         VARCHAR(20)    NOT NULL,
    unit_price   NUMERIC(19, 4) NOT NULL,
    min_amount   NUMERIC(19, 4),
    created_by   VARCHAR(254)   NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL,
    updated_by   VARCHAR(254)   NOT NULL,
    updated_at   TIMESTAMPTZ    NOT NULL,
    deleted      BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX tariff_line_tariff_idx ON tariff_line (tariff_id);

CREATE SEQUENCE quote_number_seq;
CREATE SEQUENCE contract_number_seq;

CREATE TABLE quote (
    id                UUID PRIMARY KEY,
    number            VARCHAR(30)    NOT NULL,
    version           INTEGER        NOT NULL,
    account_id        UUID           NOT NULL REFERENCES account (id),
    opportunity_id    UUID REFERENCES opportunity (id),
    tariff_id         UUID REFERENCES tariff (id),
    tax_rate_id       UUID REFERENCES tax_rate (id),
    currency          CHAR(3)        NOT NULL,
    valid_until       DATE           NOT NULL,
    status            VARCHAR(20)    NOT NULL,
    net_amount        NUMERIC(19, 4) NOT NULL,
    vat_amount        NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL,
    total_amount      NUMERIC(19, 4) NOT NULL,
    notes             VARCHAR(1000),
    pdf_file_id       UUID REFERENCES stored_file (id),
    created_by        VARCHAR(254)   NOT NULL,
    created_at        TIMESTAMPTZ    NOT NULL,
    updated_by        VARCHAR(254)   NOT NULL,
    updated_at        TIMESTAMPTZ    NOT NULL,
    deleted           BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (number, version)
);
CREATE INDEX quote_account_idx ON quote (account_id);

CREATE TABLE quote_line (
    id                 UUID PRIMARY KEY,
    quote_id           UUID           NOT NULL REFERENCES quote (id),
    origin             VARCHAR(100)   NOT NULL,
    destination        VARCHAR(100)   NOT NULL,
    vehicle_type       VARCHAR(50),
    weight_ton         NUMERIC(12, 3),
    pallets            INTEGER,
    distance_km        NUMERIC(12, 2),
    description        VARCHAR(300),
    net_amount         NUMERIC(19, 4) NOT NULL,
    vat_amount         NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL,
    total_amount       NUMERIC(19, 4) NOT NULL,
    breakdown          TEXT           NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX quote_line_quote_idx ON quote_line (quote_id);

CREATE TABLE contract (
    id                     UUID PRIMARY KEY,
    number                 VARCHAR(30)  NOT NULL UNIQUE,
    account_id             UUID         NOT NULL REFERENCES account (id),
    quote_id               UUID REFERENCES quote (id),
    tariff_id              UUID REFERENCES tariff (id),
    start_date             DATE         NOT NULL,
    end_date               DATE         NOT NULL,
    status                 VARCHAR(20)  NOT NULL,
    payment_term_days      INTEGER,
    fuel_surcharge_percent NUMERIC(7, 4),
    waiting_hourly_fee     NUMERIC(19, 4),
    special_terms          VARCHAR(2000),
    created_by             VARCHAR(254) NOT NULL,
    created_at             TIMESTAMPTZ  NOT NULL,
    updated_by             VARCHAR(254) NOT NULL,
    updated_at             TIMESTAMPTZ  NOT NULL,
    deleted                BOOLEAN      NOT NULL DEFAULT FALSE,
    CHECK (end_date >= start_date)
);
CREATE INDEX contract_account_idx ON contract (account_id, status);
