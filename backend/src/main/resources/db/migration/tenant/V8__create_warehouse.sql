CREATE SEQUENCE warehouse_invoice_number_seq;
CREATE SEQUENCE stock_count_number_seq;

CREATE TABLE warehouse (
    id         UUID PRIMARY KEY,
    code       VARCHAR(30)  NOT NULL UNIQUE,
    name       VARCHAR(200) NOT NULL,
    branch_id  UUID         NOT NULL REFERENCES branch (id),
    address    VARCHAR(500),
    bonded     BOOLEAN      NOT NULL,
    customs_no VARCHAR(50),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE warehouse_bin (
    id           UUID PRIMARY KEY,
    warehouse_id UUID         NOT NULL REFERENCES warehouse (id),
    code         VARCHAR(30)  NOT NULL,
    description  VARCHAR(200),
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (warehouse_id, code)
);

-- Depodaki mal müşterinindir; firma stoğu değildir ve değerlenmez.
CREATE TABLE stock_item (
    id                     UUID PRIMARY KEY,
    account_id             UUID           NOT NULL REFERENCES account (id),
    sku                    VARCHAR(50)    NOT NULL,
    name                   VARCHAR(200)   NOT NULL,
    unit                   VARCHAR(20)    NOT NULL,
    units_per_billing_unit NUMERIC(14, 4) NOT NULL CHECK (units_per_billing_unit > 0),
    created_by             VARCHAR(254)   NOT NULL,
    created_at             TIMESTAMPTZ    NOT NULL,
    updated_by             VARCHAR(254)   NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL,
    deleted                BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (account_id, sku)
);

CREATE TABLE stock_balance (
    id             UUID PRIMARY KEY,
    warehouse_id   UUID           NOT NULL REFERENCES warehouse (id),
    bin_id         UUID           NOT NULL REFERENCES warehouse_bin (id),
    item_id        UUID           NOT NULL REFERENCES stock_item (id),
    account_id     UUID           NOT NULL REFERENCES account (id),
    lot_no         VARCHAR(50)    NOT NULL,
    expiry_date    DATE,
    customs_status VARCHAR(20)    NOT NULL,
    quantity       NUMERIC(14, 3) NOT NULL CHECK (quantity >= 0),
    created_by     VARCHAR(254)   NOT NULL,
    created_at     TIMESTAMPTZ    NOT NULL,
    updated_by     VARCHAR(254)   NOT NULL,
    updated_at     TIMESTAMPTZ    NOT NULL,
    deleted        BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (bin_id, item_id, lot_no, customs_status)
);
CREATE INDEX stock_balance_warehouse_idx ON stock_balance (warehouse_id);
CREATE INDEX stock_balance_account_idx ON stock_balance (account_id);

CREATE TABLE stock_count (
    id           UUID PRIMARY KEY,
    number       VARCHAR(30)  NOT NULL UNIQUE,
    warehouse_id UUID         NOT NULL REFERENCES warehouse (id),
    count_date   DATE         NOT NULL,
    status       VARCHAR(20)  NOT NULL,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);
-- Bir depoda aynı anda tek açık sayım olur.
CREATE UNIQUE INDEX stock_count_open_uq ON stock_count (warehouse_id) WHERE status = 'OPEN';

CREATE TABLE stock_count_line (
    id               UUID PRIMARY KEY,
    count_id         UUID           NOT NULL REFERENCES stock_count (id),
    bin_id           UUID           NOT NULL REFERENCES warehouse_bin (id),
    item_id          UUID           NOT NULL REFERENCES stock_item (id),
    lot_no           VARCHAR(50)    NOT NULL,
    expiry_date      DATE,
    customs_status   VARCHAR(20)    NOT NULL,
    system_quantity  NUMERIC(14, 3) NOT NULL,
    counted_quantity NUMERIC(14, 3) CHECK (counted_quantity >= 0),
    created_by       VARCHAR(254)   NOT NULL,
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_by       VARCHAR(254)   NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL,
    deleted          BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (count_id, bin_id, item_id, lot_no, customs_status)
);

-- Değişmez hareket defteri. Düzeltme ters hareketle yapılır.
CREATE TABLE stock_movement (
    id             UUID PRIMARY KEY,
    type           VARCHAR(20)    NOT NULL,
    warehouse_id   UUID           NOT NULL REFERENCES warehouse (id),
    bin_id         UUID           NOT NULL REFERENCES warehouse_bin (id),
    item_id        UUID           NOT NULL REFERENCES stock_item (id),
    account_id     UUID           NOT NULL REFERENCES account (id),
    lot_no         VARCHAR(50)    NOT NULL,
    customs_status VARCHAR(20)    NOT NULL,
    quantity       NUMERIC(14, 3) NOT NULL CHECK (quantity <> 0),
    moved_on       DATE           NOT NULL,
    shipment_id    UUID REFERENCES shipment (id),
    count_id       UUID REFERENCES stock_count (id),
    reverses_id    UUID UNIQUE REFERENCES stock_movement (id),
    reference      VARCHAR(100),
    note           VARCHAR(500),
    created_by     VARCHAR(254)   NOT NULL,
    created_at     TIMESTAMPTZ    NOT NULL,
    updated_by     VARCHAR(254)   NOT NULL,
    updated_at     TIMESTAMPTZ    NOT NULL,
    deleted        BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX stock_movement_billing_idx ON stock_movement (account_id, warehouse_id, moved_on);
CREATE INDEX stock_movement_item_idx ON stock_movement (item_id, moved_on);

CREATE TABLE warehouse_contract (
    id           UUID PRIMARY KEY,
    account_id   UUID           NOT NULL REFERENCES account (id),
    warehouse_id UUID           NOT NULL REFERENCES warehouse (id),
    start_date   DATE           NOT NULL,
    end_date     DATE           NOT NULL,
    currency     CHAR(3)        NOT NULL,
    storage_basis VARCHAR(20)   NOT NULL,
    storage_rate NUMERIC(19, 4) NOT NULL CHECK (storage_rate >= 0),
    tax_rate_id  UUID REFERENCES tax_rate (id),
    created_by   VARCHAR(254)   NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL,
    updated_by   VARCHAR(254)   NOT NULL,
    updated_at   TIMESTAMPTZ    NOT NULL,
    deleted      BOOLEAN        NOT NULL DEFAULT FALSE,
    CHECK (end_date >= start_date)
);
CREATE INDEX warehouse_contract_account_idx ON warehouse_contract (account_id, warehouse_id);

CREATE TABLE handling_rate (
    id          UUID PRIMARY KEY,
    contract_id UUID           NOT NULL REFERENCES warehouse_contract (id),
    kind        VARCHAR(20)    NOT NULL,
    unit_price  NUMERIC(19, 4) NOT NULL CHECK (unit_price >= 0),
    created_by  VARCHAR(254)   NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL,
    updated_by  VARCHAR(254)   NOT NULL,
    updated_at  TIMESTAMPTZ    NOT NULL,
    deleted     BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (contract_id, kind)
);

CREATE TABLE warehouse_invoice (
    id                 UUID PRIMARY KEY,
    number             VARCHAR(30)    NOT NULL UNIQUE,
    contract_id        UUID           NOT NULL REFERENCES warehouse_contract (id),
    account_id         UUID           NOT NULL REFERENCES account (id),
    branch_id          UUID           NOT NULL REFERENCES branch (id),
    period_from        DATE           NOT NULL,
    period_to          DATE           NOT NULL,
    invoice_date       DATE           NOT NULL,
    due_date           DATE           NOT NULL,
    currency           CHAR(3)        NOT NULL,
    storage_quantity   NUMERIC(19, 4) NOT NULL,
    storage_amount     NUMERIC(19, 4) NOT NULL,
    handling_amount    NUMERIC(19, 4) NOT NULL,
    net_amount         NUMERIC(19, 4) NOT NULL,
    vat_amount         NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL,
    total_amount       NUMERIC(19, 4) NOT NULL,
    status             VARCHAR(20)    NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CHECK (period_to >= period_from)
);
CREATE INDEX warehouse_invoice_contract_idx ON warehouse_invoice (contract_id, period_from, period_to);

CREATE TABLE handling_charge (
    id          UUID PRIMARY KEY,
    contract_id UUID           NOT NULL REFERENCES warehouse_contract (id),
    kind        VARCHAR(20)    NOT NULL,
    quantity    NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(19, 4) NOT NULL,
    amount      NUMERIC(19, 4) NOT NULL,
    charged_on  DATE           NOT NULL,
    shipment_id UUID REFERENCES shipment (id),
    invoice_id  UUID REFERENCES warehouse_invoice (id),
    note        VARCHAR(500),
    created_by  VARCHAR(254)   NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL,
    updated_by  VARCHAR(254)   NOT NULL,
    updated_at  TIMESTAMPTZ    NOT NULL,
    deleted     BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX handling_charge_contract_idx ON handling_charge (contract_id, charged_on);

-- Depo faturası finans işidir; depo rolünde yoktur.
INSERT INTO role_permission (role_id, permission)
SELECT r.id, v.permission
FROM (VALUES
    ('FINANCE_SUPER', 'WAREHOUSE_VIEW'),
    ('FINANCE_SUPER', 'WAREHOUSE_INVOICE'),
    ('FINANCE', 'WAREHOUSE_VIEW'),
    ('FINANCE', 'WAREHOUSE_INVOICE')
) AS v(role_code, permission)
JOIN role r ON r.code = v.role_code;
