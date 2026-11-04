-- Firma başına tek satır.
CREATE TABLE finance_settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    allow_self_approval BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by          VARCHAR(254) NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL,
    updated_by          VARCHAR(254) NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL,
    deleted             BOOLEAN      NOT NULL DEFAULT FALSE
);

INSERT INTO finance_settings (id, created_by, created_at, updated_by, updated_at)
VALUES (1, 'system', now(), 'system', now());
