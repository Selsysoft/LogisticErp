-- BulkMail webhook'undan gelen teslim sorunları (geri dönme, şikâyet, başarısız gönderim).
-- Aynı alıcıya sonradan teslim olursa sorun kaydı silinir; 90 günden eskiler temizlenir.
CREATE TABLE admin.mail_event (
    webhook_id  VARCHAR(100) PRIMARY KEY,   -- msg_…; yeniden gönderilen bildirimi ayıklar
    email_id    VARCHAR(100),
    type        VARCHAR(40)  NOT NULL,      -- BOUNCED, COMPLAINED, FAILED
    recipient   VARCHAR(320) NOT NULL,      -- küçük harf
    tenant_code VARCHAR(63),
    kind        VARCHAR(40),                -- invite, password_reset, notice
    subject     VARCHAR(998),
    detail      VARCHAR(500),
    occurred_at TIMESTAMPTZ  NOT NULL,
    received_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX mail_event_recipient_idx ON admin.mail_event (tenant_code, recipient, occurred_at DESC);
CREATE INDEX mail_event_occurred_idx ON admin.mail_event (occurred_at DESC);
