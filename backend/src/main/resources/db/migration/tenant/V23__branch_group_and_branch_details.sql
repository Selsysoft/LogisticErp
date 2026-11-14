-- Z02 · Faz 12.1a · MX5 D3, D4, D18, D19 · 12.1a_TASARIM §2.2
-- ZTO Şube (ZT_BranchProvince) = branch_group; ZTO İş Yeri (ZT_WorkPlace) = branch. Varsayılan şirket göçü.

-- V1'de 100 olan denetim kolonları diğer tablolarla aynı genişliğe (AuditConfig e-posta yazıyor).
ALTER TABLE branch
    ALTER COLUMN created_by TYPE VARCHAR(254),
    ALTER COLUMN updated_by TYPE VARCHAR(254);

CREATE TABLE branch_group (
    id           UUID PRIMARY KEY,
    company_id   UUID         NOT NULL REFERENCES company (id),
    name         VARCHAR(50)  NOT NULL,
    group_type   VARCHAR(4),                       -- MAIN = Ana Şube, SUB = Yan Şube
    phone        VARCHAR(30),
    email        VARCHAR(254),
    address      VARCHAR(500),
    manager_name VARCHAR(200),                     -- ZTO'da yalnız SELECT'te; formda yok
    tax_number   VARCHAR(11),                      -- bilgi amaçlı (D4), hiçbir belgeye yazılmaz
    tax_office   VARCHAR(100),
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    update_count INTEGER      NOT NULL DEFAULT 0,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT branch_group_type_ck CHECK (group_type IS NULL OR group_type IN ('MAIN', 'SUB')),
    CONSTRAINT branch_group_tax_number_ck CHECK (tax_number IS NULL OR tax_number ~ '^[0-9]{1,11}$'),
    CONSTRAINT branch_group_id_company_uq UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX branch_group_name_uq ON branch_group (company_id, lower(name)) WHERE deleted = FALSE;

ALTER TABLE branch
    ADD COLUMN company_id       UUID REFERENCES company (id),
    ADD COLUMN branch_group_id  UUID,
    ADD COLUMN phone            VARCHAR(30),
    ADD COLUMN address          VARCHAR(500),
    ADD COLUMN city             VARCHAR(100),
    ADD COLUMN district         VARCHAR(100),
    ADD COLUMN latitude         NUMERIC(9, 6),
    ADD COLUMN longitude        NUMERIC(9, 6),
    ADD COLUMN sgk_workplace_no VARCHAR(26),
    ADD COLUMN active           BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN update_count     INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT branch_latitude_ck CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT branch_longitude_ck CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT branch_location_pair_ck CHECK ((latitude IS NULL) = (longitude IS NULL));

-- Varsayılan şirket. Boş kiracıda (şube yok) ve edocument_settings satırı olmayan şemada da oluşur.
DO $$
DECLARE
    v_id      UUID := gen_random_uuid();
    v_name    TEXT;
    v_tax     TEXT;
    v_office  TEXT;
    v_address TEXT;
BEGIN
    IF to_regclass('admin.tenant') IS NOT NULL THEN
        EXECUTE 'SELECT name FROM admin.tenant WHERE schema_name = current_schema() AND deleted = FALSE'
            INTO v_name;
    END IF;
    v_name := COALESCE(NULLIF(btrim(v_name), ''), 'Şirket');

    -- SELECT … INTO satır bulamazsa değişkenler NULL kalır (STRICT değil).
    SELECT NULLIF(regexp_replace(COALESCE(e.tax_number, ''), '[^0-9]', '', 'g'), ''),
           NULLIF(btrim(e.tax_office), ''),
           NULLIF(btrim(e.address), '')
      INTO v_tax, v_office, v_address
      FROM edocument_settings e
     WHERE e.id = 1 AND e.deleted = FALSE;

    -- company_tax_number_ck'yi bozacak değerler atılır (10 hane = VKN, 11 hane ve 0 ile başlamayan = TCKN).
    IF v_tax IS NOT NULL AND NOT (v_tax ~ '^[0-9]{10}$' OR v_tax ~ '^[1-9][0-9]{10}$') THEN
        v_tax := NULL;
    END IF;

    INSERT INTO company (id, code, title, short_name, tax_id_type, tax_number, tax_office, address,
                         is_default, active, created_by, created_at, updated_by, updated_at)
    VALUES (v_id, 'SIRKET1', LEFT(v_name, 300), LEFT(v_name, 100),
            CASE WHEN length(v_tax) = 11 THEN 'TCKN' ELSE 'VKN' END,
            v_tax, LEFT(v_office, 100), LEFT(v_address, 500),
            TRUE, TRUE, 'system', now(), 'system', now());

    INSERT INTO company_edocument_settings (company_id, created_by, created_at, updated_by, updated_at)
    VALUES (v_id, 'system', now(), 'system', now());

    UPDATE branch SET company_id = v_id;              -- silinmiş şubeler dahil (FK tüm satırlara uygulanır)
END $$;

ALTER TABLE branch ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE branch ADD CONSTRAINT branch_id_company_uq UNIQUE (id, company_id);
-- Grup aynı şirkette olmalı (katı ağaç, Y3). branch_group_id NULL ise denetlenmez (MATCH SIMPLE) = "Diğer".
ALTER TABLE branch ADD CONSTRAINT branch_group_company_fk
    FOREIGN KEY (branch_group_id, company_id) REFERENCES branch_group (id, company_id);
CREATE INDEX branch_company_idx ON branch (company_id);
CREATE INDEX branch_group_idx ON branch (branch_group_id) WHERE branch_group_id IS NOT NULL;
