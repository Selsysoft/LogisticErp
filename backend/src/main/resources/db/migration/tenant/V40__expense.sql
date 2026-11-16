-- Z21 · Faz 12.7 · MX4 §A.4, §A.5 (V22/V34 taslağının yerine) · 12.7_TASARIM §1.2
-- Tek masraf modeli. Cari etkisi yalnız LedgerService ('EXPENSE'); nakit etkisi yalnız SettlementService
-- (PAYMENT, idempotency 'EXPENSE:{id}'). Saklı bakiye yok; iptal = ters kayıt + status REVERSED + deleted.
-- Belge: stored_file(owner_type='EXPENSE'). Şirket kapsamı bileşik FK ile (MX5).

-- 1. Masraf kalemi tanımı (ZTO ExpenseItems)
ALTER TABLE expense_item
    ADD COLUMN description  VARCHAR(500),
    ADD COLUMN default_unit VARCHAR(30),
    ADD COLUMN active       BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN is_system    BOOLEAN NOT NULL DEFAULT FALSE;

-- V3 tohumu sistem kalemidir (VehicleExpenseService FUEL/TIRE/REPAIR kodlarına bağlı).
UPDATE expense_item SET is_system = TRUE
 WHERE created_by = 'system'
   AND code IN ('FUEL', 'TOLL', 'PER_DIEM', 'REPAIR', 'FINE', 'INSURANCE', 'TIRE');

-- Dolu kiracı: büyük/küçük harf duyarsız aynı adlı etkin kalemlerde ilki dışındakilerin adına kod eklenir.
UPDATE expense_item e
   SET name = left(e.name, 100 - length(e.code) - 3) || ' (' || e.code || ')'
  FROM (SELECT id, row_number() OVER (PARTITION BY lower(name) ORDER BY created_at, id) AS rn
          FROM expense_item
         WHERE deleted = FALSE) d
 WHERE d.id = e.id AND d.rn > 1;
CREATE UNIQUE INDEX expense_item_name_active_uq ON expense_item (lower(name)) WHERE deleted = FALSE;

-- Kod girilmeyen yeni kalem: 'MK-00001' (ExpenseItemService).
CREATE SEQUENCE expense_item_code_seq;

-- Genel masraf türleri (VEHICLE V3'te var).
INSERT INTO expense_type (id, code, name, created_by, created_at, updated_by, updated_at)
SELECT gen_random_uuid(), v.code, v.name, 'system', now(), 'system', now()
FROM (VALUES
    ('GENERAL',   'Genel Yönetim Masrafları'),
    ('OPERATION', 'Operasyon Masrafları')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM expense_type t WHERE t.code = v.code AND t.deleted = FALSE);

-- 2. Masraf başlığı
CREATE TABLE expense (
    id                  UUID PRIMARY KEY,
    company_id          UUID           NOT NULL REFERENCES company (id),
    branch_id           UUID           NOT NULL,
    expense_item_id     UUID           NOT NULL REFERENCES expense_item (id),
    context_type        VARCHAR(20)    NOT NULL DEFAULT 'GENERAL',
    vehicle_id          UUID REFERENCES vehicle (id),
    shipment_id         UUID REFERENCES shipment (id),
    warehouse_id        UUID REFERENCES warehouse (id),
    driver_id           UUID REFERENCES driver (id),
    payment_method      VARCHAR(10)    NOT NULL,
    supplier_account_id UUID REFERENCES account (id),
    settlement_id       UUID,
    invoice_number      VARCHAR(50),
    invoice_date        DATE           NOT NULL,
    due_date            DATE,
    document_type       VARCHAR(40)    NOT NULL,
    department          VARCHAR(30)    NOT NULL,
    description         VARCHAR(500),
    currency            CHAR(3)        NOT NULL,
    exchange_rate       NUMERIC(19, 6) NOT NULL,
    rate_date           DATE           NOT NULL,
    sub_total           NUMERIC(19, 4) NOT NULL,
    discount_amount     NUMERIC(19, 4) NOT NULL DEFAULT 0,
    net_amount          NUMERIC(19, 4) NOT NULL,
    vat_amount          NUMERIC(19, 4) NOT NULL DEFAULT 0,
    withholding_amount  NUMERIC(19, 4) NOT NULL DEFAULT 0,
    other_tax_amount    NUMERIC(19, 4) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(19, 4) NOT NULL,
    tl_amount           NUMERIC(19, 4) NOT NULL,
    status              VARCHAR(20)    NOT NULL DEFAULT 'POSTED',
    replaces_expense_id UUID REFERENCES expense (id),
    reversed_on         DATE,
    reverse_reason      VARCHAR(500),
    source_type         VARCHAR(40),
    source_id           UUID,
    idempotency_key     VARCHAR(100),
    created_by          VARCHAR(254)   NOT NULL,
    created_at          TIMESTAMPTZ    NOT NULL,
    updated_by          VARCHAR(254)   NOT NULL,
    updated_at          TIMESTAMPTZ    NOT NULL,
    deleted             BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT expense_id_company_uq UNIQUE (id, company_id),
    CONSTRAINT expense_branch_company_fk FOREIGN KEY (branch_id, company_id) REFERENCES branch (id, company_id),
    CONSTRAINT expense_settlement_company_fk FOREIGN KEY (settlement_id, company_id)
        REFERENCES settlement (id, company_id),
    CONSTRAINT expense_context_type_ck CHECK (context_type IN ('GENERAL', 'VEHICLE', 'SHIPMENT', 'WAREHOUSE', 'DRIVER')),
    CONSTRAINT expense_context_ck CHECK (
        num_nonnulls(vehicle_id, shipment_id, warehouse_id, driver_id) = CASE WHEN context_type = 'GENERAL' THEN 0 ELSE 1 END
        AND (context_type <> 'VEHICLE'   OR vehicle_id   IS NOT NULL)
        AND (context_type <> 'SHIPMENT'  OR shipment_id  IS NOT NULL)
        AND (context_type <> 'WAREHOUSE' OR warehouse_id IS NOT NULL)
        AND (context_type <> 'DRIVER'    OR driver_id    IS NOT NULL)),
    CONSTRAINT expense_payment_method_ck CHECK (payment_method IN ('ACCOUNT', 'CASH', 'BANK')),
    CONSTRAINT expense_supplier_ck CHECK ((payment_method = 'ACCOUNT') = (supplier_account_id IS NOT NULL)),
    CONSTRAINT expense_settlement_ck CHECK (payment_method <> 'ACCOUNT' OR settlement_id IS NULL),
    CONSTRAINT expense_department_ck CHECK (department IN
        ('OPERATION', 'FLEET', 'WAREHOUSE', 'CUSTOMS', 'ADMIN', 'ACCOUNTING', 'SALES', 'IT', 'HR', 'OTHER')),
    CONSTRAINT expense_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT expense_amounts_ck CHECK (
        sub_total >= 0 AND discount_amount >= 0 AND net_amount >= 0 AND vat_amount >= 0
        AND withholding_amount >= 0 AND withholding_amount <= vat_amount
        AND other_tax_amount >= 0 AND total_amount > 0 AND tl_amount > 0 AND exchange_rate > 0),
    CONSTRAINT expense_due_ck CHECK (due_date IS NULL OR due_date >= invoice_date),
    CONSTRAINT expense_status_ck CHECK (status IN ('POSTED', 'REVERSED')),
    CONSTRAINT expense_reversed_ck CHECK ((status = 'REVERSED') = (reversed_on IS NOT NULL)),
    CONSTRAINT expense_source_ck CHECK ((source_type IS NULL) = (source_id IS NULL))
);
CREATE INDEX expense_company_date_idx ON expense (company_id, invoice_date) WHERE deleted = FALSE;
CREATE INDEX expense_item_date_idx ON expense (expense_item_id, invoice_date) WHERE deleted = FALSE;
CREATE INDEX expense_supplier_idx ON expense (supplier_account_id) WHERE supplier_account_id IS NOT NULL;
CREATE INDEX expense_replaces_idx ON expense (replaces_expense_id) WHERE replaces_expense_id IS NOT NULL;
CREATE UNIQUE INDEX expense_source_uq ON expense (source_type, source_id) WHERE source_type IS NOT NULL AND deleted = FALSE;
CREATE UNIQUE INDEX expense_idempotency_uq ON expense (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3. Masraf satırları (ZTO ZT_ProductionExpensesDetail). Değişmez; düzeltme yeni başlıkla.
CREATE TABLE expense_line (
    id                 UUID PRIMARY KEY,
    expense_id         UUID           NOT NULL REFERENCES expense (id),
    line_no            INTEGER        NOT NULL CHECK (line_no >= 1),
    description        VARCHAR(300),
    quantity           NUMERIC(19, 4) NOT NULL CHECK (quantity > 0),
    unit               VARCHAR(20),
    unit_price         NUMERIC(19, 4) NOT NULL CHECK (unit_price >= 0),
    sub_total          NUMERIC(19, 4) NOT NULL,
    discount_rate      NUMERIC(7, 4)  NOT NULL DEFAULT 0 CHECK (discount_rate >= 0 AND discount_rate <= 100),
    discount_amount    NUMERIC(19, 4) NOT NULL DEFAULT 0,
    net_amount         NUMERIC(19, 4) NOT NULL,
    vat_rate           NUMERIC(7, 4)  NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 100),
    vat_amount         NUMERIC(19, 4) NOT NULL DEFAULT 0,
    withholding_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    other_tax_amount   NUMERIC(19, 4) NOT NULL DEFAULT 0,
    total_amount       NUMERIC(19, 4) NOT NULL,
    created_by         VARCHAR(254)   NOT NULL,
    created_at         TIMESTAMPTZ    NOT NULL,
    updated_by         VARCHAR(254)   NOT NULL,
    updated_at         TIMESTAMPTZ    NOT NULL,
    deleted            BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT expense_line_no_uq UNIQUE (expense_id, line_no),
    CONSTRAINT expense_line_amounts_ck CHECK (
        withholding_amount >= 0 AND withholding_amount <= vat_amount AND other_tax_amount >= 0 AND total_amount >= 0)
);
