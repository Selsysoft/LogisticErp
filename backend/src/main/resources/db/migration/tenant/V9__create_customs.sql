ALTER TABLE shipment
    ADD COLUMN origin_country      CHAR(2),
    ADD COLUMN destination_country CHAR(2),
    ADD COLUMN incoterm            VARCHAR(10),
    ADD COLUMN liability_policy    VARCHAR(100),
    ADD COLUMN sender_instructions VARCHAR(500),
    ADD COLUMN attached_documents  VARCHAR(500);

ALTER TABLE shipment_cargo ADD COLUMN un_number VARCHAR(10);

CREATE SEQUENCE customs_declaration_number_seq;

CREATE TABLE customs_declaration (
    id              UUID PRIMARY KEY,
    number          VARCHAR(30)  NOT NULL UNIQUE,
    shipment_id     UUID         NOT NULL REFERENCES shipment (id),
    type            VARCHAR(20)  NOT NULL,
    customs_office  VARCHAR(100) NOT NULL,
    registration_no VARCHAR(50),
    declared_on     DATE         NOT NULL,
    currency        CHAR(3)      NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX customs_declaration_shipment_idx ON customs_declaration (shipment_id);

CREATE TABLE customs_declaration_line (
    id             UUID PRIMARY KEY,
    declaration_id UUID           NOT NULL REFERENCES customs_declaration (id),
    hs_code        VARCHAR(20)    NOT NULL,
    description    VARCHAR(300)   NOT NULL,
    quantity       NUMERIC(14, 3),
    weight_kg      NUMERIC(14, 3),
    value_amount   NUMERIC(19, 4) NOT NULL CHECK (value_amount >= 0),
    created_by     VARCHAR(254)   NOT NULL,
    created_at     TIMESTAMPTZ    NOT NULL,
    updated_by     VARCHAR(254)   NOT NULL,
    updated_at     TIMESTAMPTZ    NOT NULL,
    deleted        BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX customs_line_declaration_idx ON customs_declaration_line (declaration_id);

CREATE TABLE transit_document (
    id                 UUID PRIMARY KEY,
    shipment_id        UUID           NOT NULL REFERENCES shipment (id),
    declaration_id     UUID REFERENCES customs_declaration (id),
    kind               VARCHAR(10)    NOT NULL,
    document_no        VARCHAR(50)    NOT NULL UNIQUE,
    departure_office   VARCHAR(100)   NOT NULL,
    destination_office VARCHAR(100)   NOT NULL,
    guarantee_amount   NUMERIC(19, 4) NOT NULL CHECK (guarantee_amount >= 0),
    currency           CHAR(3)        NOT NULL,
    issued_on          DATE           NOT NULL,
    deadline           DATE           NOT NULL,
    discharged_on      DATE,
    status             VARCHAR(20)    NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CHECK (deadline >= issued_on)
);
CREATE INDEX transit_document_deadline_idx ON transit_document (status, deadline);

CREATE TABLE road_permit (
    id         UUID PRIMARY KEY,
    number     VARCHAR(50)  NOT NULL UNIQUE,
    kind       VARCHAR(20)  NOT NULL,
    country    VARCHAR(50)  NOT NULL,
    valid_from DATE         NOT NULL,
    valid_to   DATE         NOT NULL,
    quota      INTEGER      NOT NULL CHECK (quota > 0),
    created_by VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(254) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE,
    CHECK (valid_to >= valid_from)
);

CREATE TABLE permit_usage (
    id          UUID PRIMARY KEY,
    permit_id   UUID         NOT NULL REFERENCES road_permit (id),
    shipment_id UUID         NOT NULL REFERENCES shipment (id),
    used_on     DATE         NOT NULL,
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE
);
-- Bir sefer aynı izni bir kez kullanır; silinen kullanım kotayı geri verir.
CREATE UNIQUE INDEX permit_usage_uq ON permit_usage (permit_id, shipment_id) WHERE deleted = FALSE;

CREATE TABLE border_crossing (
    id           UUID PRIMARY KEY,
    shipment_id  UUID         NOT NULL REFERENCES shipment (id),
    gate         VARCHAR(100) NOT NULL,
    direction    VARCHAR(10)  NOT NULL,
    crossed_on   DATE         NOT NULL,
    trip_cost_id UUID REFERENCES trip_cost (id),
    note         VARCHAR(500),
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX border_crossing_shipment_idx ON border_crossing (shipment_id);
