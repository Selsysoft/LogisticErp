-- Önceki sistemden açık (ödenmemiş) faturalar. Kendi fatura numaralandırmamıza ve gelir
-- raporlarına girmez; alacak vadeleri nakit öngörüsüne, borçlar ödeme planına taşınır.
CREATE TABLE opening_invoice (
    id              UUID PRIMARY KEY,
    account_id      UUID           NOT NULL REFERENCES account (id),
    branch_id       UUID           NOT NULL REFERENCES branch (id),
    kind            VARCHAR(20)    NOT NULL,
    number          VARCHAR(50)    NOT NULL,
    invoice_date    DATE           NOT NULL,
    due_date        DATE           NOT NULL,
    currency        CHAR(3)        NOT NULL,
    total_amount    NUMERIC(19, 4) NOT NULL CHECK (total_amount > 0),
    status          VARCHAR(20)    NOT NULL,
    payment_plan_id UUID REFERENCES payment_plan (id),
    created_by      VARCHAR(254)   NOT NULL,
    created_at      TIMESTAMPTZ    NOT NULL,
    updated_by      VARCHAR(254)   NOT NULL,
    updated_at      TIMESTAMPTZ    NOT NULL,
    deleted         BOOLEAN        NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX opening_invoice_number_uq
    ON opening_invoice (account_id, number) WHERE status = 'OPEN' AND deleted = FALSE;
CREATE INDEX opening_invoice_open_idx ON opening_invoice (kind, status);
