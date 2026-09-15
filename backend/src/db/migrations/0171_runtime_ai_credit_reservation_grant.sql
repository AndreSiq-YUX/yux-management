-- The agent runtime meters each conversation turn atomically. It already has
-- tenant-scoped SELECT access to wallets, but must update only the counters
-- involved in credit reservation. RLS from migration 0153 remains enforced.
GRANT UPDATE (current_balance, monthly_used, updated_at)
ON TABLE public.ai_credit_wallets
TO yux_runtime;
