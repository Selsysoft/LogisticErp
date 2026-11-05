INSERT INTO role_permission (role_id, permission)
SELECT r.id, 'REPORT_VIEW'
FROM role r
WHERE r.code IN ('FINANCE_SUPER', 'FINANCE', 'OPERATIONS', 'FLEET_MANAGER');

-- Kârlılık ve KPI raporları dönem ve şubeye göre süzülür.
CREATE INDEX IF NOT EXISTS shipment_pickup_idx ON shipment (planned_pickup, branch_id);
CREATE INDEX IF NOT EXISTS freight_invoice_shipment_idx ON freight_invoice (shipment_id, status);
