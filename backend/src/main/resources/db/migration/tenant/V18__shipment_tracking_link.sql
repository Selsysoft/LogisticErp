-- Müşterinin giriş yapmadan seferi izlediği bağlantı. Anahtarın yalnız SHA-256 özeti saklanır.
CREATE TABLE shipment_tracking_link (
    id             UUID PRIMARY KEY,
    shipment_id    UUID         NOT NULL REFERENCES shipment (id),
    token_hash     CHAR(64)     NOT NULL UNIQUE,
    expires_at     TIMESTAMPTZ  NOT NULL,
    revoked_at     TIMESTAMPTZ,
    view_count     INTEGER      NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    created_by     VARCHAR(254) NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL,
    updated_by     VARCHAR(254) NOT NULL,
    updated_at     TIMESTAMPTZ  NOT NULL,
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX shipment_tracking_link_shipment_idx ON shipment_tracking_link (shipment_id);
