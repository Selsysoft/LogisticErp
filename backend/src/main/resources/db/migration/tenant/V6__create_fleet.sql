CREATE TABLE vehicle (
    id              UUID PRIMARY KEY,
    plate           VARCHAR(20)   NOT NULL,
    kind            VARCHAR(20)   NOT NULL,
    brand           VARCHAR(100),
    model           VARCHAR(100),
    model_year      INTEGER,
    capacity_ton    NUMERIC(10, 3),
    capacity_m3     NUMERIC(10, 3),
    capacity_pallet INTEGER,
    fuel_type       VARCHAR(20),
    ownership       VARCHAR(20)   NOT NULL,
    status          VARCHAR(20)   NOT NULL,
    branch_id       UUID REFERENCES branch (id),
    odometer_km     NUMERIC(12, 1),
    created_by      VARCHAR(254)  NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL,
    updated_by      VARCHAR(254)  NOT NULL,
    updated_at      TIMESTAMPTZ   NOT NULL,
    deleted         BOOLEAN       NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX vehicle_plate_active_uq ON vehicle (plate) WHERE deleted = FALSE;

CREATE TABLE driver (
    id            UUID PRIMARY KEY,
    code          VARCHAR(50)  NOT NULL,
    full_name     VARCHAR(200) NOT NULL,
    phone         VARCHAR(30),
    license_class VARCHAR(20),
    status        VARCHAR(20)  NOT NULL,
    account_id    UUID         NOT NULL REFERENCES account (id),
    branch_id     UUID REFERENCES branch (id),
    created_by    VARCHAR(254) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_by    VARCHAR(254) NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL,
    deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX driver_code_active_uq ON driver (code) WHERE deleted = FALSE;

CREATE TABLE compliance_document (
    id           UUID PRIMARY KEY,
    subject_type VARCHAR(20)  NOT NULL,
    subject_id   UUID         NOT NULL,
    doc_type     VARCHAR(30)  NOT NULL,
    number       VARCHAR(100),
    issued_on    DATE,
    expires_on   DATE         NOT NULL,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX compliance_document_subject_idx ON compliance_document (subject_type, subject_id, doc_type);
CREATE INDEX compliance_document_expiry_idx ON compliance_document (expires_on);

CREATE TABLE vehicle_expense (
    id                  UUID PRIMARY KEY,
    vehicle_id          UUID           NOT NULL REFERENCES vehicle (id),
    kind                VARCHAR(20)    NOT NULL,
    expense_date        DATE           NOT NULL,
    odometer_km         NUMERIC(12, 1),
    description         VARCHAR(500),
    amount              NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency            CHAR(3)        NOT NULL,
    tl_amount           NUMERIC(19, 4) NOT NULL,
    branch_id           UUID           NOT NULL REFERENCES branch (id),
    supplier_account_id UUID REFERENCES account (id),
    fund_account_id     UUID REFERENCES fund_account (id),
    settlement_id       UUID REFERENCES settlement (id),
    liters              NUMERIC(12, 3),
    station             VARCHAR(100),
    tire_position       VARCHAR(50),
    next_due_date       DATE,
    next_due_km         NUMERIC(12, 1),
    created_by          VARCHAR(254)   NOT NULL,
    created_at          TIMESTAMPTZ    NOT NULL,
    updated_by          VARCHAR(254)   NOT NULL,
    updated_at          TIMESTAMPTZ    NOT NULL,
    deleted             BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE INDEX vehicle_expense_vehicle_idx ON vehicle_expense (vehicle_id, kind, expense_date);

CREATE TABLE resource_block (
    id           UUID PRIMARY KEY,
    subject_type VARCHAR(20)  NOT NULL,
    subject_id   UUID         NOT NULL,
    start_date   DATE         NOT NULL,
    end_date     DATE         NOT NULL,
    reason       VARCHAR(300),
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CHECK (end_date >= start_date)
);
CREATE INDEX resource_block_subject_idx ON resource_block (subject_type, subject_id, start_date, end_date);

-- Firma başına tek satır.
CREATE TABLE fleet_settings (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    block_on_expired  BOOLEAN      NOT NULL DEFAULT TRUE,
    reminder_days     INTEGER      NOT NULL DEFAULT 30,
    created_by        VARCHAR(254) NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL,
    updated_by        VARCHAR(254) NOT NULL,
    updated_at        TIMESTAMPTZ  NOT NULL,
    deleted           BOOLEAN      NOT NULL DEFAULT FALSE
);

INSERT INTO fleet_settings (id, created_by, created_at, updated_by, updated_at)
VALUES (1, 'system', now(), 'system', now());
