-- Z20 · Faz 12.7 · MX8 §1.7, §1.9 (V2xR1 taslağının yerine) · 12.7_TASARIM §1.1
-- Taşeron (SUBCONTRACTOR) sefer gideri: KDV, tevkifat, kesinti, belge, durum ve düzeltme zinciri.
-- amount/tl_amount NET kalır (kârlılık değişmez); cariye yazılan = amount + vat − withholding − deduction.
-- company_id eklenmez: şirket seferden türetilir (12.1a §2.3).

ALTER TABLE trip_cost
    ADD COLUMN vat_amount         NUMERIC(19, 4) NOT NULL DEFAULT 0,
    ADD COLUMN withholding_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    ADD COLUMN deduction_amount   NUMERIC(19, 4) NOT NULL DEFAULT 0,
    ADD COLUMN document_no        VARCHAR(50),
    ADD COLUMN document_type      VARCHAR(40),
    ADD COLUMN cost_date          DATE,
    ADD COLUMN exchange_rate      NUMERIC(19, 6),
    ADD COLUMN status             VARCHAR(20)    NOT NULL DEFAULT 'OPEN',
    ADD COLUMN replaced_by_id     UUID REFERENCES trip_cost (id),
    ADD COLUMN reversed_on        DATE,
    ADD COLUMN reverse_reason     VARCHAR(500);

-- Dolu kiracı: kapanışta yazılmış satırlar POSTED; belge tarihi kayıt gününden.
UPDATE trip_cost SET status = 'POSTED' WHERE posted_at IS NOT NULL;
UPDATE trip_cost SET cost_date = created_at::date WHERE cost_date IS NULL;

ALTER TABLE trip_cost
    ADD CONSTRAINT trip_cost_vat_ck CHECK (vat_amount >= 0),
    ADD CONSTRAINT trip_cost_withholding_ck CHECK (withholding_amount >= 0 AND withholding_amount <= vat_amount),
    ADD CONSTRAINT trip_cost_deduction_ck CHECK (deduction_amount >= 0),
    ADD CONSTRAINT trip_cost_payable_ck CHECK (amount + vat_amount - withholding_amount - deduction_amount > 0),
    ADD CONSTRAINT trip_cost_status_ck CHECK (status IN ('OPEN', 'POSTED', 'REVERSED')),
    ADD CONSTRAINT trip_cost_reversed_ck CHECK ((status = 'REVERSED') = (reversed_on IS NOT NULL)),
    ADD CONSTRAINT trip_cost_rate_ck CHECK (exchange_rate IS NULL OR exchange_rate > 0);

CREATE INDEX trip_cost_account_idx ON trip_cost (account_id) WHERE deleted = FALSE;
CREATE INDEX trip_cost_leg_kind_idx ON trip_cost (leg_id, kind) WHERE deleted = FALSE;

-- Nakliye türü (ZTO "Sevk Nakliye" / "Gemi Nakliye").
ALTER TABLE shipment_leg
    ADD COLUMN transport_mode VARCHAR(10) NOT NULL DEFAULT 'ROAD',
    ADD CONSTRAINT shipment_leg_transport_mode_ck CHECK (transport_mode IN ('ROAD', 'SEA', 'RAIL', 'AIR'));
