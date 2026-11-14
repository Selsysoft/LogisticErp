-- Z11 · Faz 12.1 · MX1 #27-#31, §3 #15 · ZTO AT:6162-6500 · 12.1_TASARIM §1.3
-- Cari devir / sezon: yalnız tarih sınırı; defter kaydı üretmez, para belgesi değildir (company_id yok, kart ortaktır Y1).

CREATE TABLE account_rollover (
    id            UUID PRIMARY KEY,
    account_id    UUID         NOT NULL REFERENCES account (id),
    rollover_date DATE         NOT NULL,
    season_name   VARCHAR(200) NOT NULL,
    active        BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_by    VARCHAR(254),
    deleted_at    TIMESTAMPTZ,
    update_count  INTEGER      NOT NULL DEFAULT 0,
    created_by    VARCHAR(254) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL,
    updated_by    VARCHAR(254) NOT NULL,
    updated_at    TIMESTAMPTZ  NOT NULL,
    deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_rollover_season_ck CHECK (length(trim(season_name)) > 0),
    CONSTRAINT account_rollover_deleted_ck CHECK (NOT (active AND deleted)),
    CONSTRAINT account_rollover_deleted_by_ck CHECK (deleted = (deleted_at IS NOT NULL))
);
-- ZTO AT:6172-6178 aynı cari + tarih mükerrer devri engeller; AT:6188 tek aktif sezon.
CREATE UNIQUE INDEX account_rollover_date_uq ON account_rollover (account_id, rollover_date) WHERE deleted = FALSE;
CREATE UNIQUE INDEX account_rollover_active_uq ON account_rollover (account_id) WHERE active AND deleted = FALSE;
