-- Preserve ambiguous Meta sends so queue retries cannot issue a duplicate.
ALTER TABLE public.outbound_message_runs
  DROP CONSTRAINT IF EXISTS outbound_message_runs_status_check;

ALTER TABLE public.outbound_message_runs
  ADD CONSTRAINT outbound_message_runs_status_check
  CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'ambiguous'));

CREATE INDEX IF NOT EXISTS idx_channel_webhook_events_whatsapp_message_receipt
  ON public.channel_webhook_events (
    connection_id,
    ((sanitized_payload->'_yux')->>'externalMessageId')
  )
  WHERE sanitized_payload->'_yux' ? 'receipt';
