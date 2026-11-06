-- Kullanıcı bazlı e-posta tercihi. Satır yoksa konu açıktır.
CREATE TABLE notification_preference (
    user_id UUID        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    topic   VARCHAR(40) NOT NULL,
    email   BOOLEAN     NOT NULL,
    PRIMARY KEY (user_id, topic)
);

-- Günlük özetin gönderildiği gün. Birden çok örnek aynı günü bir kez üstlenir.
CREATE TABLE notification_digest_run (
    day        DATE        PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notification_digest_run (day)
SELECT reminder_mail_sent_on FROM fleet_settings WHERE reminder_mail_sent_on IS NOT NULL;

ALTER TABLE fleet_settings DROP COLUMN reminder_mail_sent_on;
