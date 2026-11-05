ALTER TABLE driver ADD COLUMN user_id UUID REFERENCES app_user (id);
CREATE UNIQUE INDEX driver_user_uq ON driver (user_id) WHERE deleted = FALSE AND user_id IS NOT NULL;

-- Çevrimdışı kuyruk aynı işlemi tekrar gönderebilir; ikinci gönderim yeni kayıt üretmez.
CREATE TABLE driver_client_op (
    client_id  UUID PRIMARY KEY,
    driver_id  UUID        NOT NULL REFERENCES driver (id),
    kind       VARCHAR(20) NOT NULL,
    result_id  UUID,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE driver_event (
    id          UUID PRIMARY KEY,
    shipment_id UUID         NOT NULL REFERENCES shipment (id),
    driver_id   UUID         NOT NULL REFERENCES driver (id),
    kind        VARCHAR(20)  NOT NULL,
    occurred_at TIMESTAMPTZ  NOT NULL,
    latitude    NUMERIC(9, 6),
    longitude   NUMERIC(9, 6),
    note        VARCHAR(500),
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX driver_event_shipment_idx ON driver_event (shipment_id, occurred_at);

CREATE TABLE driver_expense (
    id              UUID PRIMARY KEY,
    driver_id       UUID           NOT NULL REFERENCES driver (id),
    shipment_id     UUID           NOT NULL REFERENCES shipment (id),
    kind            VARCHAR(20)    NOT NULL,
    amount          NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)        NOT NULL,
    expense_date    DATE           NOT NULL,
    description     VARCHAR(500),
    status          VARCHAR(20)    NOT NULL,
    review_note     VARCHAR(500),
    receipt_file_id UUID,
    trip_cost_id    UUID,
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX driver_expense_status_idx ON driver_expense (status, created_at);
CREATE INDEX driver_expense_driver_idx ON driver_expense (driver_id, created_at);
