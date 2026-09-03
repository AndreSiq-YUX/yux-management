BEGIN;

ALTER TABLE public.agent_execution_runs
  DROP CONSTRAINT IF EXISTS agent_execution_runs_run_source_check;

ALTER TABLE public.agent_execution_runs
  ADD CONSTRAINT agent_execution_runs_run_source_check
  CHECK (run_source IN (
    'whatsapp', 'strategy_admin', 'marketing_studio', 'scheduled',
    'runtime', 'test', 'radar', 'prospecting', 'mission_intake'
  ));

COMMIT;
