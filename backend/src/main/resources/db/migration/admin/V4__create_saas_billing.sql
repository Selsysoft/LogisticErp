CREATE TABLE plan (
    id                  UUID PRIMARY KEY,
    code                VARCHAR(32)    NOT NULL UNIQUE,
    name                VARCHAR(100)   NOT NULL,
    monthly_price       NUMERIC(19, 4) NOT NULL CHECK (monthly_price >= 0),
    currency            CHAR(3)        NOT NULL,
    max_users           INTEGER,
    max_vehicles        INTEGER,
    max_shipments_month INTEGER,
    active              BOOLEAN        NOT NULL DEFAULT TRUE,
    created_by          VARCHAR(254)   NOT NULL,
    created_at          TIMESTAMPTZ    NOT NULL,
    updated_by          VARCHAR(254)   NOT NULL,
    updated_at          TIMESTAMPTZ    NOT NULL,
    deleted             BOOLEAN        NOT NULL DEFAULT FALSE
);

CREATE TABLE subscription (
    id              UUID PRIMARY KEY,
    tenant_id       UUID         NOT NULL UNIQUE REFERENCES tenant (id),
    plan_id         UUID         NOT NULL REFERENCES plan (id),
    status          VARCHAR(20)  NOT NULL,
    suspend_reason  VARCHAR(20),
    trial_ends_on   DATE,
    next_billing_on DATE,
    contact_email   VARCHAR(254),
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE saas_invoice (
    id              UUID PRIMARY KEY,
    tenant_id       UUID           NOT NULL REFERENCES tenant (id),
    number          VARCHAR(80)    NOT NULL UNIQUE,
    plan_name       VARCHAR(100)   NOT NULL,
    period_start    DATE           NOT NULL,
    period_end      DATE           NOT NULL,
    amount          NUMERIC(19, 4) NOT NULL,
    currency        CHAR(3)        NOT NULL,
    status          VARCHAR(20)    NOT NULL,
    issued_on       DATE           NOT NULL,
    due_on          DATE           NOT NULL,
    paid_on         DATE,
    payment_ref     VARCHAR(200),
    failed_attempts INTEGER        NOT NULL DEFAULT 0,
    reminder_count  INTEGER        NOT NULL DEFAULT 0,
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE,
    -- Zamanlanmış iş iki kez çalışsa da aynı dönem iki kez faturalanmaz.
    UNIQUE (tenant_id, period_start)
);

CREATE INDEX saas_invoice_status_idx ON saas_invoice (status, due_on);

CREATE TABLE saas_payment_attempt (
    id         UUID PRIMARY KEY,
    invoice_id UUID        NOT NULL REFERENCES saas_invoice (id),
    success    BOOLEAN     NOT NULL,
    reference  VARCHAR(200),
    message    VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE usage_snapshot (
    tenant_id       UUID    NOT NULL REFERENCES tenant (id),
    snapshot_date   DATE    NOT NULL,
    users           INTEGER NOT NULL,
    vehicles        INTEGER NOT NULL,
    shipments_month INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, snapshot_date)
);

INSERT INTO plan (id, code, name, monthly_price, currency, max_users, max_vehicles,
                  max_shipments_month, created_by, created_at, updated_by, updated_at)
VALUES (gen_random_uuid(), 'DENEME', 'Deneme', 0, 'TRY', 10, 25, 200,
        'system', now(), 'system', now());

-- Mevcut firmalar kesintiye uğramaz: etkin abonelik açılır, ücretli plan seçilene kadar fatura kesilmez.
INSERT INTO subscription (id, tenant_id, plan_id, status, created_by, created_at, updated_by, updated_at)
SELECT gen_random_uuid(), t.id, p.id, 'ACTIVE', 'system', now(), 'system', now()
FROM tenant t
         CROSS JOIN plan p
WHERE p.code = 'DENEME'
  AND t.status = 'ACTIVE';
