CREATE TABLE tenant (
    id               UUID PRIMARY KEY,
    code             VARCHAR(32)  NOT NULL UNIQUE,
    name             VARCHAR(200) NOT NULL,
    schema_name      VARCHAR(63)  NOT NULL UNIQUE,
    status           VARCHAR(20)  NOT NULL,
    default_currency CHAR(3)      NOT NULL,
    time_zone        VARCHAR(64)  NOT NULL,
    money_scale      INTEGER      NOT NULL,
    rounding_mode    VARCHAR(20)  NOT NULL,
    created_by       VARCHAR(100) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL,
    updated_by       VARCHAR(100) NOT NULL,
    updated_at       TIMESTAMPTZ  NOT NULL,
    deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);
