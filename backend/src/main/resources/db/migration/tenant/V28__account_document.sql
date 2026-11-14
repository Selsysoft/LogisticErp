-- Z10 · Faz 12.1 · MX1 §2.2 #1-#2, §3 #2-#3, #18, #21; 04 §6.1-K2, §6.2-Y8 · 12.1_TASARIM §1.2
-- Borç/Alacak Ekle belgesi + vergi kırılımı + belge türü tohumu. Defter kaydı LedgerService'ten (source ACCOUNT_DOCUMENT).

CREATE TABLE account_document_type (
    side            VARCHAR(10)  NOT NULL,
    code            VARCHAR(40)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    audience        VARCHAR(10)  NOT NULL DEFAULT 'ALL',
    invoice_section BOOLEAN      NOT NULL DEFAULT FALSE,
    penalty         BOOLEAN      NOT NULL DEFAULT FALSE,
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
    selectable      BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order      INTEGER      NOT NULL,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(254) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    updated_by      VARCHAR(254) NOT NULL,
    updated_at      TIMESTAMPTZ  NOT NULL,
    deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (side, code),
    CONSTRAINT account_document_type_side_ck CHECK (side IN ('RECEIVABLE', 'PAYABLE')),
    CONSTRAINT account_document_type_audience_ck CHECK (audience IN ('ALL', 'CUSTOMER', 'OTHER'))
);
CREATE UNIQUE INDEX account_document_type_default_uq ON account_document_type (side, audience) WHERE is_default;

-- ZTO listeleri: Alacak Ekle TR:1361-1369 (tüm gruplar, varsayılan Satış Faturası); Borç Ekle TR:1725-1754
-- (müşteride 8 ceza/kesinti türü, varsayılan yok; diğerlerinde fatura türleri, varsayılan Alış Faturası — Müstahsil ÇIKAR).
-- invoice_section: ZTO isFaturaType (AT:2294, AT:2782). K2 türleri 'Diğer'den önce. KUR_FARKI yalnız 12.8 akışı (selectable=false).
INSERT INTO account_document_type (side, code, name, audience, invoice_section, penalty, is_default, selectable, sort_order,
                                   created_by, created_at, updated_by, updated_at)
SELECT v.side, v.code, v.name, v.audience, v.invoice_section, v.penalty, v.is_default, v.selectable, v.sort_order,
       'system', now(), 'system', now()
FROM (VALUES
    ('RECEIVABLE', 'SATIS_FATURASI',         'Satış Faturası',                         'ALL',      TRUE,  FALSE, TRUE,  TRUE,  10),
    ('RECEIVABLE', 'IADE_FATURASI',          'İade Faturası',                          'ALL',      TRUE,  FALSE, FALSE, TRUE,  20),
    ('RECEIVABLE', 'SEVK_IRSALIYESI',        'Sevk İrsaliyesi',                        'ALL',      TRUE,  FALSE, FALSE, TRUE,  30),
    ('RECEIVABLE', 'HIZMET_FATURASI',        'Hizmet Faturası',                        'ALL',      TRUE,  FALSE, FALSE, TRUE,  40),
    ('RECEIVABLE', 'E_FATURA',               'E-Fatura',                               'ALL',      TRUE,  FALSE, FALSE, TRUE,  50),
    ('RECEIVABLE', 'E_ARSIV_FATURA',         'E-Arşiv Fatura',                         'ALL',      TRUE,  FALSE, FALSE, TRUE,  60),
    ('RECEIVABLE', 'PROFORMA_FATURA',        'Proforma Fatura',                        'ALL',      FALSE, FALSE, FALSE, TRUE,  70),
    ('RECEIVABLE', 'ON_TAHSILAT_FISI',       'Ön Tahsilat Fişi',                       'ALL',      FALSE, FALSE, FALSE, TRUE,  80),
    ('RECEIVABLE', 'CEZA_KARSI_TARAF',       'Ceza / Kesinti (karşı tarafa kesilen)',  'ALL',      FALSE, TRUE,  FALSE, TRUE,  95),
    ('RECEIVABLE', 'DIGER',                  'Diğer',                                  'ALL',      FALSE, FALSE, FALSE, TRUE,  100),
    ('RECEIVABLE', 'KUR_FARKI',              'Kur Farkı',                              'ALL',      FALSE, FALSE, FALSE, FALSE, 900),
    ('PAYABLE',    'CEZA_FATURASI',          'Ceza Faturası',                          'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  10),
    ('PAYABLE',    'KALITE_KESINTISI',       'Kalite Kesintisi',                       'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  20),
    ('PAYABLE',    'FIRE_KESINTISI',         'Fire Kesintisi',                         'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  30),
    ('PAYABLE',    'GEC_TESLIMAT_CEZASI',    'Geç Teslimat Cezası',                    'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  40),
    ('PAYABLE',    'EKSIK_TESLIMAT_CEZASI',  'Eksik Teslimat Cezası',                  'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  50),
    ('PAYABLE',    'HASAR_BEDELI',           'Hasar Bedeli',                           'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  60),
    ('PAYABLE',    'MASRAF_YANSITMASI',      'Masraf Yansıtması',                      'CUSTOMER', FALSE, FALSE, FALSE, TRUE,  70),
    ('PAYABLE',    'DIGER_KESINTILER',       'Diğer Kesintiler',                       'CUSTOMER', FALSE, TRUE,  FALSE, TRUE,  80),
    ('PAYABLE',    'ALIS_FATURASI',          'Alış Faturası',                          'OTHER',    TRUE,  FALSE, TRUE,  TRUE,  110),
    ('PAYABLE',    'KASA_FISI',              'Kasa Fişi',                              'OTHER',    FALSE, FALSE, FALSE, TRUE,  120),
    ('PAYABLE',    'SERBEST_MESLEK_MAKBUZU', 'Serbest Meslek Makbuzu',                 'OTHER',    FALSE, FALSE, FALSE, TRUE,  130),
    ('PAYABLE',    'YURT_DISI_FATURA',       'Yurt Dışı Fatura',                       'OTHER',    FALSE, FALSE, FALSE, TRUE,  140),
    ('PAYABLE',    'PROFORMA_FATURA',        'Proforma Fatura',                        'OTHER',    FALSE, FALSE, FALSE, TRUE,  150),
    ('PAYABLE',    'SEVK_IRSALIYESI',        'Sevk İrsaliyesi',                        'OTHER',    FALSE, FALSE, FALSE, TRUE,  160),
    ('PAYABLE',    'HIZMET_FATURASI',        'Hizmet Faturası',                        'OTHER',    TRUE,  FALSE, FALSE, TRUE,  170),
    ('PAYABLE',    'E_FATURA',               'E-Fatura',                               'OTHER',    TRUE,  FALSE, FALSE, TRUE,  180),
    ('PAYABLE',    'GIDER_PUSULASI',         'Gider Pusulası',                         'OTHER',    FALSE, FALSE, FALSE, TRUE,  190),
    ('PAYABLE',    'CEZA_BIZE',              'Ceza (bize kesilen)',                    'ALL',      FALSE, TRUE,  FALSE, TRUE,  195),
    ('PAYABLE',    'DIGER',                  'Diğer',                                  'OTHER',    FALSE, FALSE, FALSE, TRUE,  200),
    ('PAYABLE',    'KUR_FARKI',              'Kur Farkı',                              'ALL',      FALSE, FALSE, FALSE, FALSE, 900)
) AS v(side, code, name, audience, invoice_section, penalty, is_default, selectable, sort_order);

CREATE TABLE account_document (
    id                       UUID PRIMARY KEY,
    account_id               UUID           NOT NULL REFERENCES account (id),
    branch_id                UUID           NOT NULL,
    company_id               UUID           NOT NULL,
    side                     VARCHAR(10)    NOT NULL,
    document_type            VARCHAR(40)    NOT NULL,
    document_no              VARCHAR(50)    NOT NULL,
    document_date            DATE           NOT NULL,
    due_date                 DATE,
    amount                   NUMERIC(19, 4) NOT NULL CHECK (amount > 0),
    currency                 CHAR(3)        NOT NULL,
    exchange_rate            NUMERIC(19, 6),
    payment_method           VARCHAR(15)    NOT NULL,
    description              VARCHAR(500),
    reflect_to_ledger        BOOLEAN        NOT NULL DEFAULT TRUE,
    ledger_amount            NUMERIC(19, 4),
    status                   VARCHAR(10)    NOT NULL DEFAULT 'OPEN',
    cancel_date              DATE,
    cancel_reason            VARCHAR(500),
    revised_from_id          UUID REFERENCES account_document (id),
    fx_source_transaction_id UUID REFERENCES account_transaction (id),
    idempotency_key          VARCHAR(100),
    created_by               VARCHAR(254)   NOT NULL,
    created_at               TIMESTAMPTZ    NOT NULL,
    updated_by               VARCHAR(254)   NOT NULL,
    updated_at               TIMESTAMPTZ    NOT NULL,
    deleted                  BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT account_document_branch_company_fk FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id),
    CONSTRAINT account_document_type_fk FOREIGN KEY (side, document_type) REFERENCES account_document_type (side, code),
    CONSTRAINT account_document_side_ck CHECK (side IN ('RECEIVABLE', 'PAYABLE')),
    CONSTRAINT account_document_status_ck CHECK (status IN ('OPEN', 'CANCELLED')),
    CONSTRAINT account_document_method_ck CHECK (payment_method IN ('CASH', 'BANK', 'CHECK', 'NOTE', 'CREDIT_CARD', 'OTHER')),
    CONSTRAINT account_document_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT account_document_rate_ck CHECK (exchange_rate IS NULL OR exchange_rate > 0),
    CONSTRAINT account_document_ledger_ck CHECK (
        (reflect_to_ledger AND ledger_amount IS NOT NULL AND ledger_amount > 0)
        OR (NOT reflect_to_ledger AND ledger_amount IS NULL)),
    CONSTRAINT account_document_cancel_ck CHECK ((status = 'CANCELLED') = (cancel_date IS NOT NULL))
);
CREATE UNIQUE INDEX account_document_idempotency_uq ON account_document (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX account_document_account_idx ON account_document (account_id, company_id, side, document_date) WHERE deleted = FALSE;
-- Bir belge en çok bir kez revize edilir (revize zinciri doğrusal).
CREATE UNIQUE INDEX account_document_revised_from_uq ON account_document (revised_from_id)
    WHERE revised_from_id IS NOT NULL AND deleted = FALSE;
-- Y8: kaynak hareket başına tek (iptal edilmemiş) kur farkı belgesi; akış 12.8.
CREATE UNIQUE INDEX account_document_fx_source_uq ON account_document (fx_source_transaction_id)
    WHERE fx_source_transaction_id IS NOT NULL AND status = 'OPEN' AND deleted = FALSE;

-- Fatura bölümü (invoice_section türleri). Tutarlar sunucuda yeniden hesaplanır (§3.4).
CREATE TABLE account_document_tax (
    document_id        UUID PRIMARY KEY REFERENCES account_document (id),
    gross_amount       NUMERIC(19, 4) NOT NULL,
    discount_rate      NUMERIC(7, 4)  NOT NULL DEFAULT 0,
    discount_amount    NUMERIC(19, 4) NOT NULL DEFAULT 0,
    net_excl_vat       NUMERIC(19, 4) NOT NULL,
    vat_rate           NUMERIC(7, 4)  NOT NULL DEFAULT 0,
    vat_amount         NUMERIC(19, 4) NOT NULL DEFAULT 0,
    total_incl_vat     NUMERIC(19, 4) NOT NULL,
    withholding_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    other_taxes_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    net_payable        NUMERIC(19, 4) NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT account_document_tax_rates_ck CHECK (discount_rate BETWEEN 0 AND 100 AND vat_rate BETWEEN 0 AND 100),
    CONSTRAINT account_document_tax_amounts_ck CHECK (withholding_amount >= 0 AND other_taxes_amount >= 0)
);

-- Çapraz cari hareket listesi (Günlük Tüm Cari İşlemleri) tarih aralığıyla başlar; mevcut indeks cari başlıyor.
CREATE INDEX account_transaction_date_company_idx ON account_transaction (transaction_date, company_id) WHERE deleted = FALSE;
