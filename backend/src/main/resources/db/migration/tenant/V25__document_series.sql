-- Z04 · Faz 12.1a · MX5 D11, Y4 · 12.1a_TASARIM §2.4
-- Şirket başına belge serisi. year NULL = sayaç yıllara bölünmez (bugünkü davranış); numara biçimi
-- "{prefix}-{belge yılı}-{sıra, padding hane}". Eski sequence'ler bir sürüm daha durur; B1'den itibaren
-- numara yalnız buradan alınır (DocumentNumberService, B1), sequence ilerlemez.
-- Sürüm kolonu yok: satır yazımları her zaman SELECT … FOR UPDATE altında yapılır (§4.6).
CREATE TABLE document_series (
    id          UUID PRIMARY KEY,
    company_id  UUID         NOT NULL REFERENCES company (id),
    doc_type    VARCHAR(30)  NOT NULL,                -- DocumentType enum: FREIGHT_INVOICE, WAREHOUSE_INVOICE
    year        INTEGER,
    prefix      VARCHAR(10)  NOT NULL,
    next_value  BIGINT       NOT NULL DEFAULT 1,
    padding     INTEGER      NOT NULL DEFAULT 6,
    created_by  VARCHAR(254) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_by  VARCHAR(254) NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT document_series_year_ck CHECK (year IS NULL OR year BETWEEN 2000 AND 2100),
    CONSTRAINT document_series_prefix_ck CHECK (prefix ~ '^[A-Z0-9-]{1,10}$'),
    CONSTRAINT document_series_next_ck CHECK (next_value > 0),
    CONSTRAINT document_series_padding_ck CHECK (padding BETWEEN 1 AND 12),
    CONSTRAINT document_series_uq UNIQUE NULLS NOT DISTINCT (company_id, doc_type, year)
);

-- Varsayılan şirket bugünkü global sayaçları devralır: next = sequence'in sıradaki değeri; güvenlik için
-- mevcut numaraların en büyük sıra kısmından da büyük olur.
DO $$
DECLARE
    v_company UUID;
    v_last    BIGINT;
    v_called  BOOLEAN;
    v_max     BIGINT;
BEGIN
    SELECT id INTO v_company FROM company WHERE is_default AND deleted = FALSE;

    SELECT last_value, is_called INTO v_last, v_called FROM freight_invoice_number_seq;
    SELECT COALESCE(MAX((substring(number FROM '([0-9]+)$'))::BIGINT), 0) INTO v_max FROM freight_invoice;
    INSERT INTO document_series (id, company_id, doc_type, year, prefix, next_value, padding,
                                 created_by, created_at, updated_by, updated_at)
    VALUES (gen_random_uuid(), v_company, 'FREIGHT_INVOICE', NULL, 'NF',
            GREATEST(CASE WHEN v_called THEN v_last + 1 ELSE v_last END, v_max + 1), 6,
            'system', now(), 'system', now());

    SELECT last_value, is_called INTO v_last, v_called FROM warehouse_invoice_number_seq;
    SELECT COALESCE(MAX((substring(number FROM '([0-9]+)$'))::BIGINT), 0) INTO v_max FROM warehouse_invoice;
    INSERT INTO document_series (id, company_id, doc_type, year, prefix, next_value, padding,
                                 created_by, created_at, updated_by, updated_at)
    VALUES (gen_random_uuid(), v_company, 'WAREHOUSE_INVOICE', NULL, 'DF',
            GREATEST(CASE WHEN v_called THEN v_last + 1 ELSE v_last END, v_max + 1), 6,
            'system', now(), 'system', now());
END $$;
