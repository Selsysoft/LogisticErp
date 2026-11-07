-- Ödeme planında dört göz ilkesi varsayılandır: planı oluşturan onaylayamaz. Tek kişilik firmalar
-- Finans > Tanımlar'dan açabilir. Ayarı hiç değiştirmemiş firmalar da yeni varsayılana geçer.
ALTER TABLE finance_settings ALTER COLUMN allow_self_approval SET DEFAULT FALSE;

UPDATE finance_settings SET allow_self_approval = FALSE WHERE updated_by = 'system';
