-- Firma e-belge bilgileri. Tek satırdır.
CREATE TABLE edocument_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    tax_number  VARCHAR(20),
    tax_office  VARCHAR(100),
    address     VARCHAR(500),
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE
);
INSERT INTO edocument_settings (id, created_by, created_at, updated_by, updated_at)
VALUES (1, 'system', now(), 'system', now());

CREATE TABLE edocument (
    id           UUID PRIMARY KEY,
    kind         VARCHAR(20)  NOT NULL,
    source_type  VARCHAR(20)  NOT NULL,
    source_id    UUID         NOT NULL,
    source_no    VARCHAR(30)  NOT NULL,
    ettn         UUID         NOT NULL UNIQUE,
    provider     VARCHAR(30)  NOT NULL,
    provider_ref VARCHAR(100),
    status       VARCHAR(20)  NOT NULL,
    message      VARCHAR(500),
    ubl          TEXT         NOT NULL,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);
-- Bir kaynak belge aynı anda bir kez gönderilmiş olur; reddedilen veya iptal edilen yeniden gönderilir.
CREATE UNIQUE INDEX edocument_active_uq ON edocument (source_type, source_id)
    WHERE status IN ('SENT', 'ACCEPTED');
CREATE INDEX edocument_status_idx ON edocument (status);

CREATE TABLE import_batch (
    id         UUID PRIMARY KEY,
    kind       VARCHAR(10)  NOT NULL,
    file_name  VARCHAR(200) NOT NULL,
    account_id UUID         NOT NULL REFERENCES account (id),
    branch_id  UUID         NOT NULL REFERENCES branch (id),
    duplicates INTEGER      NOT NULL,
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE import_row (
    id           UUID PRIMARY KEY,
    batch_id     UUID           NOT NULL REFERENCES import_batch (id),
    kind         VARCHAR(10)    NOT NULL,
    line_no      INTEGER        NOT NULL,
    external_key VARCHAR(100),
    plate        VARCHAR(20),
    occurred_at  TIMESTAMPTZ,
    place        VARCHAR(100),
    amount       NUMERIC(19, 4),
    currency     CHAR(3),
    liters       NUMERIC(12, 3),
    odometer_km  NUMERIC(12, 2),
    vehicle_id   UUID REFERENCES vehicle (id),
    shipment_id  UUID REFERENCES shipment (id),
    status       VARCHAR(20)    NOT NULL,
    message      VARCHAR(300),
    created_by   VARCHAR(254)   NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL,
    updated_by   VARCHAR(254)   NOT NULL,
    updated_at   TIMESTAMPTZ    NOT NULL,
    deleted      BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX import_row_batch_idx ON import_row (batch_id, line_no);
-- Aynı hareket ikinci dosyada gelirse gider iki kez yazılmaz.
CREATE UNIQUE INDEX import_row_key_uq ON import_row (kind, external_key) WHERE external_key IS NOT NULL;

CREATE TABLE vehicle_position (
    id          UUID PRIMARY KEY,
    vehicle_id  UUID           NOT NULL REFERENCES vehicle (id),
    recorded_at TIMESTAMPTZ    NOT NULL,
    latitude    NUMERIC(9, 6)  NOT NULL,
    longitude   NUMERIC(9, 6)  NOT NULL,
    speed_kmh   NUMERIC(6, 2),
    created_at  TIMESTAMPTZ    NOT NULL,
    UNIQUE (vehicle_id, recorded_at)
);
CREATE INDEX vehicle_position_latest_idx ON vehicle_position (vehicle_id, recorded_at DESC);

CREATE TABLE geofence (
    id         UUID PRIMARY KEY,
    name       VARCHAR(100)  NOT NULL,
    latitude   NUMERIC(9, 6) NOT NULL,
    longitude  NUMERIC(9, 6) NOT NULL,
    radius_m   INTEGER       NOT NULL CHECK (radius_m > 0),
    created_by VARCHAR(254)  NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL,
    updated_by VARCHAR(254)  NOT NULL,
    updated_at TIMESTAMPTZ   NOT NULL,
    deleted    BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE TABLE geofence_event (
    id          UUID PRIMARY KEY,
    geofence_id UUID         NOT NULL REFERENCES geofence (id),
    vehicle_id  UUID         NOT NULL REFERENCES vehicle (id),
    shipment_id UUID REFERENCES shipment (id),
    type        VARCHAR(10)  NOT NULL,
    occurred_at TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL
);
CREATE INDEX geofence_event_time_idx ON geofence_event (occurred_at DESC);

CREATE TABLE bank_statement_line (
    id                     UUID PRIMARY KEY,
    fund_account_id        UUID           NOT NULL REFERENCES fund_account (id),
    line_date              DATE           NOT NULL,
    amount                 NUMERIC(19, 4) NOT NULL CHECK (amount <> 0),
    description            VARCHAR(300),
    reference              VARCHAR(100),
    external_key           VARCHAR(100)   NOT NULL,
    matched_transaction_id UUID UNIQUE REFERENCES fund_transaction (id),
    status                 VARCHAR(20)    NOT NULL,
    created_by             VARCHAR(254)   NOT NULL,
    created_at             TIMESTAMPTZ    NOT NULL,
    updated_by             VARCHAR(254)   NOT NULL,
    updated_at             TIMESTAMPTZ    NOT NULL,
    deleted                BOOLEAN        NOT NULL DEFAULT FALSE,
    UNIQUE (fund_account_id, external_key)
);
CREATE INDEX bank_statement_line_idx ON bank_statement_line (fund_account_id, line_date DESC);

CREATE TABLE route_distance (
    id          UUID PRIMARY KEY,
    origin      VARCHAR(100)   NOT NULL,
    destination VARCHAR(100)   NOT NULL,
    route_key   VARCHAR(210)   NOT NULL UNIQUE,
    distance_km NUMERIC(10, 2) NOT NULL CHECK (distance_km > 0),
    minutes     INTEGER        NOT NULL CHECK (minutes > 0),
    created_by  VARCHAR(254)   NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL,
    updated_by  VARCHAR(254)   NOT NULL,
    updated_at  TIMESTAMPTZ    NOT NULL,
    deleted     BOOLEAN        NOT NULL DEFAULT FALSE
);

INSERT INTO role_permission (role_id, permission)
SELECT r.id, 'INTEGRATION_VIEW'
FROM role r
WHERE r.code IN ('FINANCE_SUPER', 'FINANCE', 'OPERATIONS', 'FLEET_MANAGER');
