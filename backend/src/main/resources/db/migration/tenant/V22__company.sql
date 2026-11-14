-- Z01 · Faz 12.1a · MX5 D1, D12 · docs/zto-finans/uygulama/12.1a_TASARIM.md §2.1
-- Tüzel kişi (şirket) ve şirket başına e-belge ayarı. Varsayılan şirket V23'te oluşturulur.

CREATE TABLE company (
    id                      UUID PRIMARY KEY,
    code                    VARCHAR(20)  NOT NULL,
    title                   VARCHAR(300) NOT NULL,
    short_name              VARCHAR(100) NOT NULL,
    tax_id_type             VARCHAR(4)   NOT NULL DEFAULT 'VKN',
    tax_number              VARCHAR(11),
    tax_office              VARCHAR(100),
    mersis_no               VARCHAR(16),
    trade_registry_no       VARCHAR(50),
    sgk_workplace_no        VARCHAR(26),
    address                 VARCHAR(500),
    city                    VARCHAR(100),
    district                VARCHAR(100),
    postal_code             VARCHAR(10),
    country                 CHAR(2)      NOT NULL DEFAULT 'TR',
    phone                   VARCHAR(30),
    email                   VARCHAR(254),
    kep_address             VARCHAR(254),
    website                 VARCHAR(200),
    logo_file_id            UUID REFERENCES stored_file (id),
    default_fund_account_id UUID,                      -- bileşik FK V24'te (fund_account.company_id sonrası)
    is_default              BOOLEAN      NOT NULL DEFAULT FALSE,
    active                  BOOLEAN      NOT NULL DEFAULT TRUE,
    update_count            INTEGER      NOT NULL DEFAULT 0,
    created_by              VARCHAR(254) NOT NULL,
    created_at              TIMESTAMPTZ  NOT NULL,
    updated_by              VARCHAR(254) NOT NULL,
    updated_at              TIMESTAMPTZ  NOT NULL,
    deleted                 BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT company_code_ck CHECK (code ~ '^[A-Z0-9_-]{1,20}$'),
    CONSTRAINT company_tax_id_type_ck CHECK (tax_id_type IN ('VKN', 'TCKN')),
    CONSTRAINT company_tax_number_ck CHECK (
        tax_number IS NULL
        OR (tax_id_type = 'VKN' AND tax_number ~ '^[0-9]{10}$')
        OR (tax_id_type = 'TCKN' AND tax_number ~ '^[1-9][0-9]{10}$')),
    CONSTRAINT company_mersis_ck CHECK (mersis_no IS NULL OR mersis_no ~ '^[0-9]{16}$'),
    CONSTRAINT company_default_active_ck CHECK (NOT is_default OR active)
);
CREATE UNIQUE INDEX company_code_uq ON company (code) WHERE deleted = FALSE;
CREATE UNIQUE INDEX company_tax_number_uq ON company (tax_number)
    WHERE deleted = FALSE AND tax_number IS NOT NULL;
-- Kiracıda en çok bir varsayılan şirket.
CREATE UNIQUE INDEX company_default_uq ON company (is_default) WHERE is_default AND deleted = FALSE;

-- ZTO ZT_UyumsoftSetting karşılığı (Views/Uyumsoft/Settings.cshtml:50-156). 12.1a'da yalnız saklanır;
-- gönderimde kullanılması 12.10'da. Gönderen VKN/unvan company'den okunur (çift kaynak yok).
CREATE TABLE company_edocument_settings (
    company_id       UUID PRIMARY KEY REFERENCES company (id),
    provider         VARCHAR(30)  NOT NULL DEFAULT 'TEST',
    enabled          BOOLEAN      NOT NULL DEFAULT FALSE,
    test_mode        BOOLEAN      NOT NULL DEFAULT TRUE,
    service_url      VARCHAR(300),
    username         VARCHAR(100),
    password_enc     VARCHAR(500),
    default_profile  VARCHAR(20)  NOT NULL DEFAULT 'TICARIFATURA',
    invoice_series   VARCHAR(3),
    despatch_series  VARCHAR(3),
    despatch_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
    inbox_enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
    inbox_last_sync  TIMESTAMPTZ,
    created_by       VARCHAR(254) NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL,
    updated_by       VARCHAR(254) NOT NULL,
    updated_at       TIMESTAMPTZ  NOT NULL,
    CONSTRAINT company_edocument_profile_ck
        CHECK (default_profile IN ('TICARIFATURA', 'TEMELFATURA', 'EARSIVFATURA')),
    CONSTRAINT company_edocument_invoice_series_ck
        CHECK (invoice_series IS NULL OR invoice_series ~ '^[A-Z0-9]{3}$'),
    CONSTRAINT company_edocument_despatch_series_ck
        CHECK (despatch_series IS NULL OR despatch_series ~ '^[A-Z0-9]{3}$')
);

-- COMPANY_MANAGE: PATRON koddan otomatik alır (Role.getEffectivePermissions); FINANCE_SUPER tohumlanır.
INSERT INTO role_permission (role_id, permission)
SELECT r.id, 'COMPANY_MANAGE' FROM role r WHERE r.code = 'FINANCE_SUPER';
