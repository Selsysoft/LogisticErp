-- Z16 · Faz 12.2a · MX7 V2xQ2 + §7-S1 · 04 §6.2-Y5 · 12.2a_TASARIM §1.2
-- Ödeme/tahsilatın açık fatura kalemleriyle BİLGİ AMAÇLI eşleşmesi. Defteri, yaşlandırmayı (FIFO) ve
-- eksik fatura hesabını değiştirmez. Satırlar değişmez; geçerlilik sorguda türetilir
-- (settlement POSTED + deleted=false + hedef iptal değil). Tür başına hedef kolonu + bileşik FK (MX5).

-- 1. Bileşik FK hedefleri
ALTER TABLE purchase_invoice  ADD CONSTRAINT purchase_invoice_id_company_uq  UNIQUE (id, company_id);
ALTER TABLE freight_invoice   ADD CONSTRAINT freight_invoice_id_company_uq   UNIQUE (id, company_id);
ALTER TABLE warehouse_invoice ADD CONSTRAINT warehouse_invoice_id_company_uq UNIQUE (id, company_id);
ALTER TABLE opening_invoice   ADD CONSTRAINT opening_invoice_id_company_uq   UNIQUE (id, company_id);
ALTER TABLE account_document  ADD CONSTRAINT account_document_id_company_uq  UNIQUE (id, company_id);

-- 2. Tablo
CREATE TABLE settlement_allocation (
    id                   UUID PRIMARY KEY,
    settlement_id        UUID           NOT NULL,
    company_id           UUID           NOT NULL REFERENCES company (id),
    target_type          VARCHAR(30)    NOT NULL,
    purchase_invoice_id  UUID,
    freight_invoice_id   UUID,
    warehouse_invoice_id UUID,
    opening_invoice_id   UUID,
    account_document_id  UUID,
    amount               NUMERIC(19, 4) NOT NULL,
    currency             CHAR(3)        NOT NULL,
    created_by           VARCHAR(254)   NOT NULL,
    created_at           TIMESTAMPTZ    NOT NULL,
    updated_by           VARCHAR(254)   NOT NULL,
    updated_at           TIMESTAMPTZ    NOT NULL,
    deleted              BOOLEAN        NOT NULL DEFAULT FALSE,
    CONSTRAINT settlement_allocation_settlement_fk
        FOREIGN KEY (settlement_id, company_id) REFERENCES settlement (id, company_id),
    CONSTRAINT settlement_allocation_purchase_fk
        FOREIGN KEY (purchase_invoice_id, company_id) REFERENCES purchase_invoice (id, company_id),
    CONSTRAINT settlement_allocation_freight_fk
        FOREIGN KEY (freight_invoice_id, company_id) REFERENCES freight_invoice (id, company_id),
    CONSTRAINT settlement_allocation_warehouse_fk
        FOREIGN KEY (warehouse_invoice_id, company_id) REFERENCES warehouse_invoice (id, company_id),
    CONSTRAINT settlement_allocation_opening_fk
        FOREIGN KEY (opening_invoice_id, company_id) REFERENCES opening_invoice (id, company_id),
    CONSTRAINT settlement_allocation_document_fk
        FOREIGN KEY (account_document_id, company_id) REFERENCES account_document (id, company_id),
    CONSTRAINT settlement_allocation_amount_ck CHECK (amount > 0),
    CONSTRAINT settlement_allocation_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT settlement_allocation_type_ck CHECK (target_type IN
        ('PURCHASE_INVOICE', 'FREIGHT_INVOICE', 'WAREHOUSE_INVOICE', 'OPENING_INVOICE', 'ACCOUNT_DOCUMENT')),
    CONSTRAINT settlement_allocation_one_target_ck CHECK (num_nonnulls(
        purchase_invoice_id, freight_invoice_id, warehouse_invoice_id, opening_invoice_id,
        account_document_id) = 1),
    CONSTRAINT settlement_allocation_target_match_ck CHECK (
            (target_type = 'PURCHASE_INVOICE')  = (purchase_invoice_id IS NOT NULL)
        AND (target_type = 'FREIGHT_INVOICE')   = (freight_invoice_id IS NOT NULL)
        AND (target_type = 'WAREHOUSE_INVOICE') = (warehouse_invoice_id IS NOT NULL)
        AND (target_type = 'OPENING_INVOICE')   = (opening_invoice_id IS NOT NULL)
        AND (target_type = 'ACCOUNT_DOCUMENT')  = (account_document_id IS NOT NULL))
);

-- 3. İndeksler: aynı settlement'ta aynı hedef bir kez; hedef başına "eşleşen" toplamı.
CREATE UNIQUE INDEX settlement_allocation_target_uq ON settlement_allocation (settlement_id,
    COALESCE(purchase_invoice_id, freight_invoice_id, warehouse_invoice_id, opening_invoice_id,
             account_document_id)) WHERE deleted = FALSE;
CREATE INDEX settlement_allocation_settlement_idx ON settlement_allocation (settlement_id) WHERE deleted = FALSE;
CREATE INDEX settlement_allocation_purchase_idx
    ON settlement_allocation (purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX settlement_allocation_freight_idx
    ON settlement_allocation (freight_invoice_id) WHERE freight_invoice_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX settlement_allocation_warehouse_idx
    ON settlement_allocation (warehouse_invoice_id) WHERE warehouse_invoice_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX settlement_allocation_opening_idx
    ON settlement_allocation (opening_invoice_id) WHERE opening_invoice_id IS NOT NULL AND deleted = FALSE;
CREATE INDEX settlement_allocation_document_idx
    ON settlement_allocation (account_document_id) WHERE account_document_id IS NOT NULL AND deleted = FALSE;
