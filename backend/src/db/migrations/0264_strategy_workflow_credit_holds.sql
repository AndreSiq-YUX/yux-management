CREATE TABLE private.strategy_workflow_credit_holds (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  owner_token UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.ai_credit_wallets(id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits > 0),
  unlimited BOOLEAN NOT NULL,
  charged_credits INTEGER CHECK (charged_credits BETWEEN 0 AND reserved_credits),
  state TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held','executing','released','settled','uncertain')),
  attempts JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attempts) = 'array'),
  ledger_id UUID REFERENCES public.ai_usage_ledger(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, contract_id, operation_id),
  CHECK ((state IN ('released','settled')) = (charged_credits IS NOT NULL))
);

CREATE INDEX strategy_workflow_credit_holds_wallet
  ON private.strategy_workflow_credit_holds (wallet_id);

ALTER TABLE private.strategy_workflow_credit_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.strategy_workflow_credit_holds FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON private.strategy_workflow_credit_holds TO yux_runtime;
GRANT UPDATE (owner_token, unlimited, state, attempts, charged_credits, ledger_id, updated_at)
  ON private.strategy_workflow_credit_holds TO yux_runtime;
CREATE POLICY strategy_workflow_credit_holds_runtime
  ON private.strategy_workflow_credit_holds TO yux_runtime
  USING (
    organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[])
    AND contract_id = nullif(current_setting('app.current_contract_id', true), '')::uuid
    AND current_setting('app.current_profile_key', true) = 'growth_strategist'
    AND current_setting('app.current_audience', true) = 'internal_operator'
  );
