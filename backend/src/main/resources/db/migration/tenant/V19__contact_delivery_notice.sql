-- İşaretli kişilere sefer teslim edilince takip bağlantılı e-posta gider.
ALTER TABLE contact ADD COLUMN notify_deliveries BOOLEAN NOT NULL DEFAULT FALSE;
