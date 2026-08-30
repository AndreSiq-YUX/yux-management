ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.automation_flow_versions
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_run_id UUID REFERENCES public.action_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE public.automation_actions DROP CONSTRAINT IF EXISTS automation_actions_action_type_check;
ALTER TABLE public.automation_actions ADD CONSTRAINT automation_actions_action_type_check CHECK (
  action_type IN (
    'create_task','change_stage','move_to_pipeline','assign_owner','send_whatsapp','send_email',
    'create_ticket','update_field','register_activity','webhook','call_api','convert_proposal',
    'create_project','create_invoice','ai_classify_lead','ai_generate_message','ai_generate_proposal',
    'enroll_sequence','pause_sequence','add_tag','adjust_score'
  )
);

CREATE INDEX IF NOT EXISTS idx_automation_flows_mission ON public.automation_flows(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_automation_flow_versions_mission ON public.automation_flow_versions(mission_id, status);
