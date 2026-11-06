ALTER TABLE saas_admin
    ADD COLUMN totp_secret    VARCHAR(512),
    ADD COLUMN totp_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_last_step BIGINT;
