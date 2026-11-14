-- Z06 · Faz 12.1 · MX1 §2.0, §2.5, §3 #16-17, #20; MX8 §3.6 N1-N3; 04 §3.1 · docs/zto-finans/uygulama/12.1_TASARIM.md §1.1
-- Cari profili, hesap grupları (alt grup) + kod üretimi, şirket bazında limit, cari banka hesapları (IBAN), izin.
-- account.company_id ve represents_company_id V24'te (Z03) eklendi; burada eklenmez (12.1a §0.3 S-8).

-- 1. Hesap grubu (ZTO "Hesap Grubu"; tür + alt grup). Kod PK ve tüm kiracıda tekil; (account_type, code) FK hedefi.
CREATE TABLE account_group (
    code         VARCHAR(30)  PRIMARY KEY,
    account_type VARCHAR(20)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    report_type  VARCHAR(20),
    code_prefix  VARCHAR(5)   NOT NULL,
    next_code    BIGINT       NOT NULL DEFAULT 1,
    sort_order   INTEGER      NOT NULL,
    type_default BOOLEAN      NOT NULL DEFAULT FALSE,
    selectable   BOOLEAN      NOT NULL DEFAULT TRUE,
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by   VARCHAR(254) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL,
    updated_by   VARCHAR(254) NOT NULL,
    updated_at   TIMESTAMPTZ  NOT NULL,
    deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_group_type_code_uq UNIQUE (account_type, code),
    CONSTRAINT account_group_type_ck CHECK (account_type IN
        ('CUSTOMER', 'CARRIER', 'SUPPLIER', 'EMPLOYEE', 'BANK', 'LEAD', 'INTERCOMPANY')),
    CONSTRAINT account_group_report_type_ck CHECK (report_type IS NULL OR report_type IN
        ('SALES', 'SUPPLIERS', 'MATERIAL', 'LABOR', 'OTHER', 'PERSONNEL', 'BANK')),
    CONSTRAINT account_group_prefix_ck CHECK (code_prefix ~ '^[A-Z]{2,5}$'),
    CONSTRAINT account_group_next_code_ck CHECK (next_code >= 1)
);
CREATE UNIQUE INDEX account_group_type_default_uq ON account_group (account_type) WHERE type_default;

INSERT INTO account_group (code, account_type, name, report_type, code_prefix, sort_order, type_default, selectable,
                           created_by, created_at, updated_by, updated_at)
SELECT v.code, v.account_type, v.name, v.report_type, v.prefix, v.sort_order, v.type_default, v.selectable,
       'system', now(), 'system', now()
FROM (VALUES
    ('MUSTERI',            'CUSTOMER',     'Müşteri',                          'SALES',     'MUS', 10,  TRUE,  TRUE),
    ('ACENTE',             'CUSTOMER',     'Acente',                           'SALES',     'ACN', 20,  FALSE, TRUE),
    ('GENEL',              'SUPPLIER',     'Tedarikçi',                        'SUPPLIERS', 'TED', 30,  TRUE,  TRUE),
    ('YEDEK_PARCA_SERVIS', 'SUPPLIER',     'Yedek Parça / Servis Tedarikçisi', 'MATERIAL',  'YPS', 40,  FALSE, TRUE),
    ('AKARYAKIT',          'SUPPLIER',     'Akaryakıt Tedarikçisi',            'MATERIAL',  'AKY', 50,  FALSE, TRUE),
    ('HIZMET',             'SUPPLIER',     'Hizmet Firması',                   'OTHER',     'HZM', 60,  FALSE, TRUE),
    ('ELLECLEME_TASERON',  'SUPPLIER',     'Elleçleme Taşeronu',               'LABOR',     'ELT', 70,  FALSE, TRUE),
    ('TASERON_NAKLIYECI',  'CARRIER',      'Nakliye Firması',                  'OTHER',     'NAK', 80,  TRUE,  TRUE),
    ('SEVK_NAKLIYECI',     'CARRIER',      'Sevk Nakliye Firması',             'OTHER',     'SVN', 90,  FALSE, TRUE),
    ('SURUCU',             'EMPLOYEE',     'Personel (Sürücü)',                'PERSONNEL', 'SRC', 100, TRUE,  TRUE),
    ('OFIS',               'EMPLOYEE',     'Personel (Ofis)',                  'PERSONNEL', 'OFS', 110, FALSE, TRUE),
    ('BANKA',              'BANK',         'Banka',                            'BANK',      'BNK', 120, TRUE,  TRUE),
    ('ADAY',               'LEAD',         'Aday Müşteri',                     NULL,        'ADY', 130, TRUE,  FALSE),
    ('GRUP_SIRKETI',       'INTERCOMPANY', 'Grup Şirketi',                     NULL,        'GS',  140, TRUE,  FALSE)
) AS v(code, account_type, name, report_type, prefix, sort_order, type_default, selectable);

-- 2. Cari profili (MX1 §4.1'in 17 kolonu; address şifreli; yetkili kişi kolonları; güncelleme sayacı).
ALTER TABLE account
    ADD COLUMN sub_group        VARCHAR(30),
    ADD COLUMN default_currency CHAR(3),
    ADD COLUMN credit_limit     NUMERIC(19, 4),
    ADD COLUMN risk_limit       NUMERIC(19, 4),
    ADD COLUMN tax_office       VARCHAR(100),
    ADD COLUMN company_type     VARCHAR(12),
    ADD COLUMN phone            VARCHAR(30),
    ADD COLUMN email            VARCHAR(254),
    ADD COLUMN website          VARCHAR(200),
    ADD COLUMN contact_name     VARCHAR(200),
    ADD COLUMN contact_title    VARCHAR(100),
    ADD COLUMN contact_mobile   VARCHAR(30),
    ADD COLUMN address_enc      TEXT,                -- AES-GCM hex: 2 × (32 + UTF-8 bayt); 1000 Türkçe karakter ≈ 4064
    ADD COLUMN tax_number_enc   TEXT,                -- yalnız 11 haneli (TCKN) değer; uygulama doldurur (§2.4 geri doldurma)
    ADD COLUMN tax_number_hash  CHAR(64),
    ADD COLUMN tax_number_masked VARCHAR(20),
    ADD COLUMN city             VARCHAR(100),
    ADD COLUMN district         VARCHAR(100),
    ADD COLUMN country          VARCHAR(100),
    ADD COLUMN postal_code      VARCHAR(20),
    ADD COLUMN payment_terms    VARCHAR(1000),
    ADD COLUMN notes            VARCHAR(2000),
    ADD COLUMN active           BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN update_count     INTEGER NOT NULL DEFAULT 0;

-- Mevcut kartlar (silinmişler dahil) türünün varsayılan grubuna. account.type yalnız Java enum değerlerini taşır
-- (V3'ten beri @Enumerated STRING; 7 değerin hepsinin varsayılan grubu var) — satır kalmaz.
UPDATE account a SET sub_group = g.code
  FROM account_group g
 WHERE g.account_type = a.type AND g.type_default;
ALTER TABLE account ALTER COLUMN sub_group SET NOT NULL;

ALTER TABLE account
    ADD CONSTRAINT account_sub_group_fk FOREIGN KEY (type, sub_group) REFERENCES account_group (account_type, code),
    ADD CONSTRAINT account_company_type_ck CHECK (company_type IS NULL OR company_type IN ('INDIVIDUAL', 'CORPORATE')),
    ADD CONSTRAINT account_default_currency_ck CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT account_credit_limit_ck CHECK (credit_limit IS NULL OR credit_limit >= 0),
    ADD CONSTRAINT account_risk_limit_ck CHECK (risk_limit IS NULL OR risk_limit >= 0),
    ADD CONSTRAINT account_tax_number_hash_ck CHECK ((tax_number_enc IS NULL) = (tax_number_hash IS NULL));
CREATE INDEX account_type_sub_group_idx ON account (type, sub_group) WHERE deleted = FALSE;
CREATE INDEX account_tax_number_hash_idx ON account (tax_number_hash) WHERE tax_number_hash IS NOT NULL;
-- Mevcut 11 haneli tax_number değerleri SQL'de şifrelenemez (anahtar uygulamada): B1 AccountTaxNumberBackfill
-- (§2.4) Flyway'den sonra uygulama içinde taşır; göç veriye bağlı hata üretmez.

-- 3. Şirket bazında limit (isteğe bağlı satır; yoksa kart limiti geçerli). Limit para birimi = account.default_currency
-- (NULL → TRY). Yalnız gösterim/uyarı; işlem engellemez (MX1 §3 #20, §9 OK-10).
CREATE TABLE account_company_limit (
    id           UUID PRIMARY KEY,
    account_id   UUID           NOT NULL REFERENCES account (id),
    company_id   UUID           NOT NULL REFERENCES company (id),
    credit_limit NUMERIC(19, 4),
    risk_limit   NUMERIC(19, 4),
    created_by   VARCHAR(254)   NOT NULL,
    created_at   TIMESTAMPTZ    NOT NULL,
    updated_by   VARCHAR(254)   NOT NULL,
    updated_at   TIMESTAMPTZ    NOT NULL,
    deleted      BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT account_company_limit_uq UNIQUE (account_id, company_id),
    CONSTRAINT account_company_limit_credit_ck CHECK (credit_limit IS NULL OR credit_limit >= 0),
    CONSTRAINT account_company_limit_risk_ck CHECK (risk_limit IS NULL OR risk_limit >= 0)
);

-- 4. Cari banka hesapları (ZTO ZT_BankAccounts; MX8 §3). IBAN ve hesap no şifreli; IBAN tekilliği hash ile (N2).
CREATE TABLE account_bank_account (
    id                    UUID PRIMARY KEY,
    account_id            UUID         NOT NULL REFERENCES account (id),
    bank_name             VARCHAR(100) NOT NULL,
    branch_name           VARCHAR(100),
    account_number_enc    VARCHAR(500),
    account_number_masked VARCHAR(40),
    iban_enc              VARCHAR(500),
    iban_hash             CHAR(64),
    iban_masked           VARCHAR(50),
    holder_name           VARCHAR(200),
    currency              CHAR(3)      NOT NULL,
    account_kind          VARCHAR(10)  NOT NULL DEFAULT 'DEMAND',
    category              VARCHAR(5)   NOT NULL DEFAULT 'SUB',
    opened_on             DATE,
    last_transaction_on   DATE,
    description           VARCHAR(500),
    active                BOOLEAN      NOT NULL DEFAULT TRUE,
    update_count          INTEGER      NOT NULL DEFAULT 0,
    created_by            VARCHAR(254) NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL,
    updated_by            VARCHAR(254) NOT NULL,
    updated_at            TIMESTAMPTZ  NOT NULL,
    deleted               BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_bank_account_iban_or_number_ck CHECK (iban_enc IS NOT NULL OR account_number_enc IS NOT NULL),
    CONSTRAINT account_bank_account_iban_hash_ck CHECK ((iban_enc IS NULL) = (iban_hash IS NULL)),
    CONSTRAINT account_bank_account_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT account_bank_account_kind_ck CHECK (account_kind IN ('TIME', 'DEMAND', 'SAVINGS', 'CORPORATE')),
    CONSTRAINT account_bank_account_category_ck CHECK (category IN ('MAIN', 'SUB'))
);
CREATE UNIQUE INDEX account_bank_account_iban_uq ON account_bank_account (iban_hash)
    WHERE iban_hash IS NOT NULL AND active AND deleted = FALSE;
CREATE INDEX account_bank_account_account_idx ON account_bank_account (account_id) WHERE deleted = FALSE;

-- 5. Cari değişiklik geçmişi (ZTO Edit "Değişiklik Geçmişi"): audit_log.target = 'ACCOUNT:<uuid>'.
CREATE INDEX audit_log_target_idx ON audit_log (target, created_at DESC);

-- 6. Personel carilerini görme izni (ZTO: Personel yalnız Finans(süper)). PATRON koddan otomatik alır.
INSERT INTO role_permission (role_id, permission)
SELECT r.id, 'FINANCE_EMPLOYEE_VIEW' FROM role r WHERE r.code = 'FINANCE_SUPER'
ON CONFLICT DO NOTHING;
