-- Sector template catalog for guided intelligent automations.

CREATE TABLE IF NOT EXISTS public.automation_sector_template_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_template_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  category TEXT NOT NULL DEFAULT 'commercial',
  recommended_modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  blueprint JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(blueprint) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sector_template_key, template_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_sector_template_catalog_sector
  ON public.automation_sector_template_catalog(sector_template_key, is_active);

ALTER TABLE public.automation_sector_template_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read active automation sector templates" ON public.automation_sector_template_catalog
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Internal users manage automation sector templates" ON public.automation_sector_template_catalog
  FOR ALL TO authenticated USING (private.can_supervise_omnichannel())
  WITH CHECK (private.can_supervise_omnichannel());

REVOKE ALL ON public.automation_sector_template_catalog FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_sector_template_catalog TO authenticated, service_role;

INSERT INTO public.automation_sector_template_catalog (
  sector_template_key,
  template_key,
  name,
  description,
  recommended_modules,
  blueprint
) VALUES
  ('clinic', 'clinic_reactivation_sequence', 'Reativacao de pacientes', 'Sequencia de lembretes e recuperacao de agenda.', ARRAY['crm', 'omnichannel', 'finance'], '{"trigger":"lead.stage_changed","sequenceChannel":"mixed","goal":"appointment_booked","steps":["whatsapp_message","email_reminder","crm_task"]}'),
  ('real_estate', 'real_estate_visit_followup', 'Follow-up de visita imobiliaria', 'Nutre interessados apos visita e alerta corretor.', ARRAY['crm', 'omnichannel', 'proposals'], '{"trigger":"lead.stage_changed","sequenceChannel":"whatsapp","goal":"visit_scheduled","steps":["whatsapp_message","crm_task","proposal_link"]}'),
  ('dealer', 'dealer_quote_recovery', 'Recuperacao de proposta de veiculo', 'Reengaja lead com proposta visualizada e sem resposta.', ARRAY['crm', 'proposals', 'campaigns'], '{"trigger":"proposal.viewed","sequenceChannel":"mixed","goal":"proposal_approved","steps":["email_offer","whatsapp_message","manager_alert"]}'),
  ('workshop', 'workshop_service_reminder', 'Lembrete de manutencao', 'Dispara contato proativo por ciclo de servico.', ARRAY['crm', 'omnichannel', 'support'], '{"trigger":"ticket.overdue","sequenceChannel":"whatsapp","goal":"service_booked","steps":["whatsapp_template","support_ticket","crm_task"]}'),
  ('agency', 'agency_briefing_onboarding', 'Onboarding de briefing', 'Organiza briefing, proposta e projeto para agencias.', ARRAY['crm', 'proposals', 'projects'], '{"trigger":"landing_page.form_submitted","sequenceChannel":"mixed","goal":"proposal_sent","steps":["email_briefing","ai_summary","proposal_task"]}')
ON CONFLICT (sector_template_key, template_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  recommended_modules = EXCLUDED.recommended_modules,
  blueprint = EXCLUDED.blueprint,
  is_active = true,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
