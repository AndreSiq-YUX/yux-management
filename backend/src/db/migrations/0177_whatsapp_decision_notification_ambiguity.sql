-- Ambiguous provider results are terminal for automatic retries: retrying may
-- duplicate a WhatsApp notification already accepted by Meta.
ALTER TABLE public.action_decision_notifications
  DROP CONSTRAINT IF EXISTS action_decision_notifications_status_check;

ALTER TABLE public.action_decision_notifications
  ADD CONSTRAINT action_decision_notifications_status_check
  CHECK (status IN ('sending', 'queued', 'delivered', 'failed', 'skipped', 'ambiguous'));
