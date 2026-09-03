BEGIN;

ALTER TABLE public.agent_execution_runs
  ADD COLUMN IF NOT EXISTS mission_conversation_id UUID
    REFERENCES public.action_mission_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_execution_runs_mission_conversation
  ON public.agent_execution_runs(mission_conversation_id, created_at DESC)
  WHERE mission_conversation_id IS NOT NULL;

COMMIT;
