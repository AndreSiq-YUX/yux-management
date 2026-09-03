BEGIN;

ALTER TABLE public.ai_credit_wallets
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.ai_credit_wallets.is_unlimited IS
  'When true, AI usage is metered in the ledger and monthly_used, but never blocked or deducted from current_balance.';

COMMIT;
