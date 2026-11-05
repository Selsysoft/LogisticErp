INSERT INTO role_permission (role_id, permission)
SELECT r.id, 'SUBSCRIPTION_VIEW'
FROM role r
WHERE r.code = 'FINANCE_SUPER';
