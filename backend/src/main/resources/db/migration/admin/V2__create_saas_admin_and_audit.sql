CREATE TABLE saas_admin (
    id                 UUID PRIMARY KEY,
    email              VARCHAR(254) NOT NULL UNIQUE,
    password_hash      VARCHAR(100) NOT NULL,
    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_login_count INTEGER      NOT NULL DEFAULT 0,
    locked_until       TIMESTAMPTZ,
    created_by         VARCHAR(254) NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL,
    updated_by         VARCHAR(254) NOT NULL,
    updated_at         TIMESTAMPTZ  NOT NULL,
    deleted            BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY,
    event_type  VARCHAR(50)  NOT NULL,
    actor_id    UUID,
    actor_email VARCHAR(254),
    target      VARCHAR(300),
    details     VARCHAR(1000),
    ip_address  VARCHAR(64),
    trace_id    VARCHAR(64),
    created_at  TIMESTAMPTZ  NOT NULL
);

CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
