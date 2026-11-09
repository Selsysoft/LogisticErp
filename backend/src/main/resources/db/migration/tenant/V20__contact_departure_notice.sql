-- İşaretli kişilere sefer yola çıkınca takip bağlantılı e-posta gider.
ALTER TABLE contact ADD COLUMN notify_departures BOOLEAN NOT NULL DEFAULT FALSE;
