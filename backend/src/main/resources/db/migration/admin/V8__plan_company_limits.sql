-- ZA1 · Faz 12.1a · MX5 D20, S6 · 12.1a_TASARIM §2.6. NULL = sınırsız; mevcut planlar NULL kalır.
ALTER TABLE plan
    ADD COLUMN max_companies INTEGER,
    ADD COLUMN max_branches  INTEGER,
    ADD CONSTRAINT plan_max_companies_ck CHECK (max_companies IS NULL OR max_companies >= 1),
    ADD CONSTRAINT plan_max_branches_ck CHECK (max_branches IS NULL OR max_branches >= 1);
