-- Reddedilen planın gerekçesi listede görünsün; plan yeniden gönderilince temizlenir.
ALTER TABLE payment_plan ADD COLUMN reject_note VARCHAR(500);

UPDATE payment_plan p
SET reject_note = (
    SELECT e.note
    FROM payment_plan_event e
    WHERE e.plan_id = p.id AND e.event_type = 'REJECTED'
    ORDER BY e.created_at DESC
    LIMIT 1)
WHERE p.status = 'REJECTED';
