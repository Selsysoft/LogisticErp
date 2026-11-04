CREATE TABLE role (
    id           UUID PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL UNIQUE,
    name         VARCHAR(100) NOT NULL,
    locked       BOOLEAN      NOT NULL DEFAULT FALSE,
    priority     INTEGER      NOT NULL DEFAULT 0,
    landing_path VARCHAR(100) NOT NULL DEFAULT '/dashboard',
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE role_permission (
    role_id    UUID        NOT NULL REFERENCES role (id) ON DELETE CASCADE,
    permission VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE app_user (
    id                 UUID PRIMARY KEY,
    email              VARCHAR(254) NOT NULL,
    full_name          VARCHAR(200) NOT NULL,
    password_hash      VARCHAR(100),
    status             VARCHAR(20)  NOT NULL,
    email_verified_at  TIMESTAMPTZ,
    token_version      INTEGER      NOT NULL DEFAULT 0,
    failed_login_count INTEGER      NOT NULL DEFAULT 0,
    locked_until       TIMESTAMPTZ,
    totp_secret        VARCHAR(300),
    totp_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
    totp_last_step     BIGINT,
    created_by         VARCHAR(254) NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL,
    updated_by         VARCHAR(254) NOT NULL,
    updated_at         TIMESTAMPTZ  NOT NULL,
    deleted            BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX app_user_email_active_uq ON app_user (email) WHERE deleted = FALSE;

CREATE TABLE user_role (
    user_id UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES role (id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_token (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    family_id  UUID        NOT NULL,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX refresh_token_family_idx ON refresh_token (family_id);
CREATE INDEX refresh_token_user_idx ON refresh_token (user_id);

CREATE TABLE revoked_access_token (
    jti        UUID PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE user_token (
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

CREATE INDEX user_token_user_idx ON user_token (user_id);

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

-- Tohum roller. PATRON kilitlidir ve koddan tüm izinleri alır, bu yüzden izin satırı yoktur.
INSERT INTO role (id, code, name, locked, priority, landing_path, created_by, created_at, updated_by, updated_at)
SELECT gen_random_uuid(), v.code, v.name, v.locked, v.priority, v.landing, 'system', now(), 'system', now()
FROM (VALUES
    ('PATRON',        'Patron/Yönetici',    TRUE,  100, '/dashboard'),
    ('FINANCE_SUPER', 'Finans (Süper)',     FALSE,  90, '/finance'),
    ('FINANCE',       'Finans',             FALSE,  80, '/finance'),
    ('ACCOUNTING',    'Muhasebe',           FALSE,  70, '/finance'),
    ('OPERATIONS',    'Operasyon/Sevkiyat', FALSE,  60, '/operations'),
    ('SALES',         'Satış/CRM',          FALSE,  50, '/crm'),
    ('FLEET_MANAGER', 'Filo Yöneticisi',    FALSE,  40, '/fleet'),
    ('WAREHOUSE',     'Depo Sorumlusu',     FALSE,  30, '/warehouse'),
    ('CUSTOMS',       'Gümrük/Dış Ticaret', FALSE,  20, '/customs'),
    ('DRIVER',        'Sürücü',             FALSE,  10, '/driver')
) AS v(code, name, locked, priority, landing);

INSERT INTO role_permission (role_id, permission)
SELECT r.id, v.permission
FROM (VALUES
    ('FINANCE_SUPER', 'FINANCE_VIEW'),
    ('FINANCE_SUPER', 'FINANCE_PAYMENT_CREATE'),
    ('FINANCE_SUPER', 'FINANCE_APPROVE'),
    ('FINANCE_SUPER', 'BRANCH_VIEW'),
    ('FINANCE',       'FINANCE_VIEW'),
    ('FINANCE',       'FINANCE_PAYMENT_CREATE'),
    ('FINANCE',       'BRANCH_VIEW'),
    ('ACCOUNTING',    'FINANCE_VIEW'),
    ('ACCOUNTING',    'BRANCH_VIEW'),
    ('OPERATIONS',    'SHIPMENT_VIEW'),
    ('OPERATIONS',    'SHIPMENT_DISPATCH'),
    ('OPERATIONS',    'FLEET_VIEW'),
    ('OPERATIONS',    'BRANCH_VIEW'),
    ('SALES',         'CRM_VIEW'),
    ('SALES',         'CRM_EDIT'),
    ('SALES',         'BRANCH_VIEW'),
    ('FLEET_MANAGER', 'FLEET_VIEW'),
    ('FLEET_MANAGER', 'FLEET_EDIT'),
    ('FLEET_MANAGER', 'BRANCH_VIEW'),
    ('WAREHOUSE',     'WAREHOUSE_VIEW'),
    ('WAREHOUSE',     'WAREHOUSE_EDIT'),
    ('WAREHOUSE',     'BRANCH_VIEW'),
    ('CUSTOMS',       'CUSTOMS_VIEW'),
    ('CUSTOMS',       'CUSTOMS_EDIT'),
    ('CUSTOMS',       'SHIPMENT_VIEW'),
    ('DRIVER',        'DRIVER_APP')
) AS v(role_code, permission)
JOIN role r ON r.code = v.role_code;
