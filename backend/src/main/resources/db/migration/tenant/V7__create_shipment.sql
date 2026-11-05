CREATE SEQUENCE shipment_number_seq;
CREATE SEQUENCE cmr_number_seq;
CREATE SEQUENCE waybill_number_seq;
CREATE SEQUENCE freight_invoice_number_seq;

CREATE TABLE shipment (
    id                 UUID PRIMARY KEY,
    number             VARCHAR(30)    NOT NULL UNIQUE,
    account_id         UUID           NOT NULL REFERENCES account (id),
    branch_id          UUID           NOT NULL REFERENCES branch (id),
    status             VARCHAR(20)    NOT NULL,
    shipper_name       VARCHAR(200),
    shipper_address    VARCHAR(500),
    consignee_name     VARCHAR(200),
    consignee_address  VARCHAR(500),
    origin             VARCHAR(100)   NOT NULL,
    destination        VARCHAR(100)   NOT NULL,
    planned_pickup     TIMESTAMPTZ    NOT NULL,
    planned_delivery   TIMESTAMPTZ    NOT NULL,
    vehicle_type       VARCHAR(50),
    distance_km        NUMERIC(12, 2),
    quote_line_id      UUID REFERENCES quote_line (id),
    currency           CHAR(3)        NOT NULL,
    net_amount         NUMERIC(19, 4) NOT NULL,
    vat_amount         NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL,
    total_amount       NUMERIC(19, 4) NOT NULL,
    breakdown          TEXT           NOT NULL,
    notes              VARCHAR(1000),
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CHECK (planned_delivery >= planned_pickup)
);
CREATE INDEX shipment_status_idx ON shipment (status, planned_pickup);
CREATE INDEX shipment_account_idx ON shipment (account_id);

CREATE TABLE shipment_cargo (
    id          UUID PRIMARY KEY,
    shipment_id UUID         NOT NULL REFERENCES shipment (id),
    description VARCHAR(300) NOT NULL,
    quantity    NUMERIC(12, 3),
    packaging   VARCHAR(50),
    weight_kg   NUMERIC(14, 3),
    volume_m3   NUMERIC(12, 3),
    adr_class   VARCHAR(20),
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX shipment_cargo_shipment_idx ON shipment_cargo (shipment_id);

CREATE TABLE shipment_leg (
    id                 UUID PRIMARY KEY,
    shipment_id        UUID         NOT NULL REFERENCES shipment (id),
    sequence_no        INTEGER      NOT NULL,
    origin             VARCHAR(100) NOT NULL,
    destination        VARCHAR(100) NOT NULL,
    planned_start      TIMESTAMPTZ  NOT NULL,
    planned_end        TIMESTAMPTZ  NOT NULL,
    vehicle_id         UUID REFERENCES vehicle (id),
    trailer_id         UUID REFERENCES vehicle (id),
    driver_id          UUID REFERENCES driver (id),
    carrier_account_id UUID REFERENCES account (id),
    created_by         VARCHAR(254) NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL,
    updated_by         VARCHAR(254) NOT NULL,
    updated_at         TIMESTAMPTZ  NOT NULL,
    deleted            BOOLEAN      NOT NULL DEFAULT FALSE,
    CHECK (planned_end >= planned_start)
);
CREATE INDEX shipment_leg_shipment_idx ON shipment_leg (shipment_id, sequence_no);
CREATE INDEX shipment_leg_vehicle_idx ON shipment_leg (vehicle_id, planned_start, planned_end);
CREATE INDEX shipment_leg_trailer_idx ON shipment_leg (trailer_id, planned_start, planned_end);
CREATE INDEX shipment_leg_driver_idx ON shipment_leg (driver_id, planned_start, planned_end);

CREATE TABLE shipment_event (
    id          UUID PRIMARY KEY,
    shipment_id UUID         NOT NULL REFERENCES shipment (id),
    type        VARCHAR(20)  NOT NULL,
    from_status VARCHAR(20),
    to_status   VARCHAR(20),
    message     VARCHAR(500),
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX shipment_event_shipment_idx ON shipment_event (shipment_id, created_at);

CREATE TABLE proof_of_delivery (
    id             UUID PRIMARY KEY,
    shipment_id    UUID         NOT NULL UNIQUE REFERENCES shipment (id),
    recipient_name VARCHAR(200) NOT NULL,
    delivered_at   TIMESTAMPTZ  NOT NULL,
    latitude       NUMERIC(9, 6),
    longitude      NUMERIC(9, 6),
    note           VARCHAR(500),
    created_by     VARCHAR(254) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_by     VARCHAR(254) NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE shipment_document (
    id          UUID PRIMARY KEY,
    shipment_id UUID         NOT NULL REFERENCES shipment (id),
    type        VARCHAR(20)  NOT NULL,
    number      VARCHAR(30)  NOT NULL UNIQUE,
    status      VARCHAR(20)  NOT NULL,
    content     TEXT         NOT NULL,
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (shipment_id, type)
);

CREATE TABLE freight_invoice (
    id                 UUID PRIMARY KEY,
    number             VARCHAR(30)    NOT NULL UNIQUE,
    shipment_id        UUID           NOT NULL REFERENCES shipment (id),
    account_id         UUID           NOT NULL REFERENCES account (id),
    branch_id          UUID           NOT NULL REFERENCES branch (id),
    invoice_date       DATE           NOT NULL,
    due_date           DATE           NOT NULL,
    currency           CHAR(3)        NOT NULL,
    net_amount         NUMERIC(19, 4) NOT NULL,
    vat_amount         NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL,
    total_amount       NUMERIC(19, 4) NOT NULL,
    net_tl             NUMERIC(19, 4) NOT NULL,
    status             VARCHAR(20)    NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE
);
-- Bir seferin aynı anda tek geçerli faturası olur; iptal edilen yeniden kesilebilir.
CREATE UNIQUE INDEX freight_invoice_active_uq ON freight_invoice (shipment_id) WHERE status = 'ISSUED';

CREATE TABLE trip_cost (
    id                 UUID PRIMARY KEY,
    shipment_id        UUID           NOT NULL REFERENCES shipment (id),
    leg_id             UUID REFERENCES shipment_leg (id),
    kind               VARCHAR(20)    NOT NULL,
    account_id         UUID REFERENCES account (id),
    vehicle_expense_id UUID REFERENCES vehicle_expense (id),
    amount             NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency           CHAR(3)        NOT NULL,
    tl_amount          NUMERIC(19, 4) NOT NULL,
    description        VARCHAR(500),
    posted_at          TIMESTAMPTZ,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX trip_cost_shipment_idx ON trip_cost (shipment_id);
-- Bir araç gideri yalnız bir sefere bağlanır; aynı gider iki kez sayılmaz.
CREATE UNIQUE INDEX trip_cost_expense_uq ON trip_cost (vehicle_expense_id)
    WHERE vehicle_expense_id IS NOT NULL AND deleted = FALSE;

-- Fatura ve kapanış finans işidir; operasyon rolünde yoktur.
INSERT INTO role_permission (role_id, permission)
SELECT r.id, v.permission
FROM (VALUES
    ('FINANCE_SUPER', 'SHIPMENT_VIEW'),
    ('FINANCE_SUPER', 'SHIPMENT_INVOICE'),
    ('FINANCE', 'SHIPMENT_VIEW'),
    ('FINANCE', 'SHIPMENT_INVOICE')
) AS v(role_code, permission)
JOIN role r ON r.code = v.role_code;
