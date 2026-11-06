-- Günlük hatırlatma e-postası: firma ayarıyla kapatılabilir; aynı gün ikinci kez gönderilmez.
ALTER TABLE fleet_settings
    ADD COLUMN reminder_email        BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN reminder_mail_sent_on DATE;
