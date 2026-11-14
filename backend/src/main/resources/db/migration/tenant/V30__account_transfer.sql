-- Z12 · Faz 12.1 · MX1 #24-#26, §3 #14; 04 §6.1-K3 · ZTO AT:5826-6100 · 12.1_TASARIM §1.4
-- Cari taşıma: başlık + hareket satırları (virman çifti ACCOUNT_TRANSFER_OUT/IN, source_id = satır id) + taşınan
-- çek/senetler. instrument_movement'a TRANSFERRED hareket türü (durum DEĞİL; InstrumentStatus değişmez).

CREATE TABLE account_transfer (
    id              UUID PRIMARY KEY,
    from_account_id UUID         NOT NULL REFERENCES account (id),
    to_account_id   UUID         NOT NULL REFERENCES account (id),
    transfer_date   DATE         NOT NULL,
    description     VARCHAR(500),
    status          VARCHAR(10)  NOT NULL DEFAULT 'POSTED',
    reverse_date    DATE,
    idempotency_key VARCHAR(100),
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_transfer_accounts_ck CHECK (from_account_id <> to_account_id),
    CONSTRAINT account_transfer_status_ck CHECK (status IN ('POSTED', 'REVERSED')),
    CONSTRAINT account_transfer_reverse_ck CHECK ((status = 'REVERSED') = (reverse_date IS NOT NULL))
);
CREATE UNIQUE INDEX account_transfer_idempotency_uq ON account_transfer (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX account_transfer_from_idx ON account_transfer (from_account_id, transfer_date);
CREATE INDEX account_transfer_to_idx ON account_transfer (to_account_id, transfer_date);

CREATE TABLE account_transfer_line (
    id                     UUID PRIMARY KEY,
    account_transfer_id    UUID           NOT NULL REFERENCES account_transfer (id),
    account_transaction_id UUID           NOT NULL REFERENCES account_transaction (id),
    branch_id              UUID           NOT NULL,
    company_id             UUID           NOT NULL,
    direction              VARCHAR(10)    NOT NULL,
    amount                 NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency               CHAR(3)        NOT NULL,
    active                 BOOLEAN        NOT NULL DEFAULT TRUE,
    created_by             VARCHAR(254)   NOT NULL,
    created_at             TIMESTAMPTZ    NOT NULL,
    updated_by             VARCHAR(254)   NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL,
    deleted                BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT account_transfer_line_branch_company_fk FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id),
    CONSTRAINT account_transfer_line_direction_ck CHECK (direction IN ('DEBIT', 'CREDIT')),
    CONSTRAINT account_transfer_line_currency_ck CHECK (currency ~ '^[A-Z]{3}$')
);
-- Bir hareket aynı anda yalnız bir (geri alınmamış) taşımada olabilir.
CREATE UNIQUE INDEX account_transfer_line_tx_uq ON account_transfer_line (account_transaction_id) WHERE active AND deleted = FALSE;
CREATE INDEX account_transfer_line_transfer_idx ON account_transfer_line (account_transfer_id);

CREATE TABLE account_transfer_instrument (
    id                  UUID PRIMARY KEY,
    account_transfer_id UUID         NOT NULL REFERENCES account_transfer (id),
    instrument_id       UUID         NOT NULL REFERENCES instrument (id),
    moved_drawer        BOOLEAN      NOT NULL,
    moved_endorsee      BOOLEAN      NOT NULL,
    reverted            BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by          VARCHAR(254) NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL,
    updated_by          VARCHAR(254) NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL,
    deleted             BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_transfer_instrument_uq UNIQUE (account_transfer_id, instrument_id),
    CONSTRAINT account_transfer_instrument_moved_ck CHECK (moved_drawer OR moved_endorsee)
);
CREATE INDEX account_transfer_instrument_instrument_idx ON account_transfer_instrument (instrument_id);

-- Mevcut hareketler STATUS olur (DEFAULT). TRANSFERRED satırında from_status = to_status = çekin o anki durumu.
ALTER TABLE instrument_movement
    ADD COLUMN movement_type       VARCHAR(12) NOT NULL DEFAULT 'STATUS',
    ADD COLUMN from_account_id     UUID REFERENCES account (id),
    ADD COLUMN to_account_id       UUID REFERENCES account (id),
    ADD COLUMN account_transfer_id UUID REFERENCES account_transfer (id),
    ADD CONSTRAINT instrument_movement_type_ck CHECK (movement_type IN ('STATUS', 'TRANSFERRED')),
    ADD CONSTRAINT instrument_movement_transfer_ck CHECK (
        movement_type = 'STATUS'
        OR (from_account_id IS NOT NULL AND to_account_id IS NOT NULL AND account_transfer_id IS NOT NULL
            AND from_status IS NOT NULL AND from_status = to_status));
CREATE INDEX instrument_movement_transfer_idx ON instrument_movement (account_transfer_id) WHERE account_transfer_id IS NOT NULL;
