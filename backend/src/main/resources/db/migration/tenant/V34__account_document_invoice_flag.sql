-- Z41 · Faz 12.2 · K-12.2-4 (eksik fatura) · 12.2_TASARIM §1.4, §3.7
-- invoice_section "vergi bölümü var" demektir, "fatura sayılır" değil (Sevk İrsaliyesi TRUE, Yurt Dışı Fatura FALSE).
-- Eksik fatura hesabı yalnız counts_as_invoice türlerini fatura sayar.
ALTER TABLE account_document_type ADD COLUMN counts_as_invoice BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE account_document_type SET counts_as_invoice = TRUE
 WHERE (side, code) IN (
    ('RECEIVABLE', 'SATIS_FATURASI'), ('RECEIVABLE', 'IADE_FATURASI'), ('RECEIVABLE', 'HIZMET_FATURASI'),
    ('RECEIVABLE', 'E_FATURA'), ('RECEIVABLE', 'E_ARSIV_FATURA'),
    ('PAYABLE', 'CEZA_FATURASI'), ('PAYABLE', 'ALIS_FATURASI'), ('PAYABLE', 'SERBEST_MESLEK_MAKBUZU'),
    ('PAYABLE', 'YURT_DISI_FATURA'), ('PAYABLE', 'HIZMET_FATURASI'), ('PAYABLE', 'E_FATURA'),
    ('PAYABLE', 'GIDER_PUSULASI'));
