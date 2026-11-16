-- Z09 · Faz 12.3 · MX3 §2.3, §4 (V23 taslağının yerine) · 12.3_TASARIM §1.2
-- Çek koçanı ve yaprakları. Şirket kapsamı bileşik FK ile (MX5). Yaprak → çek bağı yalnız
-- instrument.check_leaf_id üzerinden (döngüsel FK yok).

CREATE TABLE check_book (
    id              UUID PRIMARY KEY,
    company_id      UUID         NOT NULL REFERENCES company (id),
    branch_id       UUID         NOT NULL,
    fund_account_id UUID         NOT NULL,
    serial_no       VARCHAR(50)  NOT NULL,
    bank_code       CHAR(4),
    branch_code     CHAR(4),
    start_number    VARCHAR(7)   NOT NULL,
    end_number      VARCHAR(7)   NOT NULL,
    leaf_count      INTEGER      NOT NULL,
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT check_book_id_company_uq UNIQUE (id, company_id),
    CONSTRAINT check_book_branch_company_fk
        FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id),
    CONSTRAINT check_book_fund_company_fk
        FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id),
    CONSTRAINT check_book_numbers_ck CHECK (
        start_number ~ '^[0-9]{7}$' AND end_number ~ '^[0-9]{7}$' AND start_number <= end_number),
    CONSTRAINT check_book_codes_ck CHECK (
        (bank_code IS NULL OR bank_code ~ '^[0-9]{4}$')
        AND (branch_code IS NULL OR branch_code ~ '^[0-9]{4}$')),
    CONSTRAINT check_book_leaf_count_ck CHECK (leaf_count BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX check_book_serial_uq ON check_book (fund_account_id, serial_no) WHERE deleted = FALSE;
CREATE INDEX check_book_company_idx ON check_book (company_id, branch_id) WHERE deleted = FALSE;

CREATE TABLE check_leaf (
    id              UUID PRIMARY KEY,
    company_id      UUID         NOT NULL,
    check_book_id   UUID         NOT NULL,
    fund_account_id UUID         NOT NULL,
    leaf_no         INTEGER      NOT NULL,
    number          VARCHAR(7)   NOT NULL,
    micr_code       VARCHAR(30),
    status          VARCHAR(10)  NOT NULL DEFAULT 'UNUSED',
    used_date       DATE,
    void_reason     VARCHAR(500),
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT check_leaf_id_company_uq UNIQUE (id, company_id),
    CONSTRAINT check_leaf_book_company_fk
        FOREIGN KEY (check_book_id, company_id) REFERENCES check_book (id, company_id),
    CONSTRAINT check_leaf_fund_company_fk
        FOREIGN KEY (fund_account_id, company_id) REFERENCES fund_account (id, company_id),
    CONSTRAINT check_leaf_number_ck CHECK (number ~ '^[0-9]{7}$'),
    CONSTRAINT check_leaf_leaf_no_ck CHECK (leaf_no >= 1),
    CONSTRAINT check_leaf_status_ck CHECK (status IN ('UNUSED', 'USED', 'VOID')),
    CONSTRAINT check_leaf_used_ck CHECK (status <> 'USED' OR used_date IS NOT NULL)
);
-- Aynı banka hesabında bir numara tek yaprak (ZTO CBC:208-224 denetimi)
CREATE UNIQUE INDEX check_leaf_number_uq ON check_leaf (fund_account_id, number) WHERE deleted = FALSE;
CREATE INDEX check_leaf_book_idx ON check_leaf (check_book_id, leaf_no);
CREATE INDEX check_leaf_status_idx ON check_leaf (fund_account_id, status) WHERE deleted = FALSE;

-- Çek → yaprak (tek yönlü). Bir yaprak en çok bir etkin (iptal edilmemiş) çekte.
ALTER TABLE instrument
    ADD COLUMN check_leaf_id UUID,
    ADD CONSTRAINT instrument_check_leaf_fk
        FOREIGN KEY (check_leaf_id, company_id) REFERENCES check_leaf (id, company_id);
CREATE UNIQUE INDEX instrument_check_leaf_uq ON instrument (check_leaf_id)
    WHERE check_leaf_id IS NOT NULL AND deleted = FALSE AND status <> 'CANCELLED';
