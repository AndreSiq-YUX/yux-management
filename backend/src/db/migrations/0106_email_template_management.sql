CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('system', 'organization', 'blueprint')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  blueprint_key TEXT,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general' CHECK (BTRIM(category) <> ''),
  email_kind TEXT NOT NULL CHECK (email_kind IN ('transactional', 'operational', 'marketing')),
  module_key TEXT NOT NULL DEFAULT 'email',
  trigger_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  preheader TEXT,
  body_html TEXT NOT NULL CHECK (BTRIM(body_html) <> ''),
  body_text TEXT,
  variables_schema JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variables_schema) = 'object'),
  required_variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  editable_by_client BOOLEAN NOT NULL DEFAULT false,
  published_version_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope = 'organization' AND organization_id IS NOT NULL)
    OR (scope IN ('system', 'blueprint') AND organization_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  subject TEXT NOT NULL CHECK (BTRIM(subject) <> ''),
  preheader TEXT,
  body_html TEXT NOT NULL CHECK (BTRIM(body_html) <> ''),
  body_text TEXT,
  variables_schema JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variables_schema) = 'object'),
  required_variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  change_summary TEXT,
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE public.email_templates
  ADD CONSTRAINT email_templates_published_version_fk
  FOREIGN KEY (published_version_id)
  REFERENCES public.email_template_versions(id)
  ON DELETE SET NULL;

ALTER TABLE public.email_send_requests
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES public.email_template_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rendered_variables JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rendered_variables) = 'object'),
  ADD COLUMN IF NOT EXISTS sender_scope TEXT NOT NULL DEFAULT 'system' CHECK (sender_scope IN ('system', 'organization')),
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id UUID;

CREATE INDEX IF NOT EXISTS idx_email_templates_scope_status ON public.email_templates(scope, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_status ON public.email_templates(organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_templates_blueprint_key ON public.email_templates(blueprint_key) WHERE blueprint_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_global_blueprint_key
  ON public.email_templates(scope, blueprint_key)
  WHERE blueprint_key IS NOT NULL AND scope IN ('system', 'blueprint');
CREATE INDEX IF NOT EXISTS idx_email_template_versions_template ON public.email_template_versions(template_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_requests_template ON public.email_send_requests(template_id, template_version_id);

INSERT INTO public.email_templates (
  scope, blueprint_key, name, description, category, email_kind, module_key, trigger_key,
  status, subject, preheader, body_html, body_text, variables_schema, required_variables, editable_by_client
)
VALUES
  (
    'system',
    'system.client_invitation',
    'Convite inicial do cliente',
    'Email enviado quando um cliente recebe acesso ao YUX Hub pela primeira vez.',
    'access',
    'transactional',
    'auth',
    'client_invitation',
    'draft',
    'Acesso ao YUX Hub - {{company_name}}',
    'Defina sua senha para acessar o YUX Hub.',
    '<p>Ola, {{contact_name}}.</p><p>Seu acesso ao <strong>YUX Hub</strong> foi criado para <strong>{{company_name}}</strong>.</p><p>Use o botao abaixo para definir sua senha e acessar o portal.</p><p><a href="{{invite_url}}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">Definir senha</a></p><p>Este link expira em 7 dias.</p><p>Equipe YUX</p>',
    'Ola, {{contact_name}}.\n\nSeu acesso ao YUX Hub foi criado para {{company_name}}.\nUse o link abaixo para definir sua senha e acessar o portal:\n\n{{invite_url}}\n\nEste link expira em 7 dias.\n\nEquipe YUX',
    '{"contact_name":{"label":"Nome do contato"},"company_name":{"label":"Empresa"},"invite_url":{"label":"Link de convite"}}'::jsonb,
    ARRAY['contact_name', 'company_name', 'invite_url'],
    false
  ),
  (
    'system',
    'system.password_reset',
    'Redefinicao de senha',
    'Email usado para redefinir senha do YUX Hub.',
    'access',
    'transactional',
    'auth',
    'password_reset',
    'draft',
    'Redefina sua senha do YUX Hub',
    'Crie uma nova senha para acessar o YUX Hub.',
    '<p>Ola, {{contact_name}}.</p><p>Recebemos uma solicitacao para redefinir sua senha de acesso ao <strong>YUX Hub</strong>.</p><p>Use o botao abaixo para criar uma nova senha.</p><p><a href="{{reset_url}}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;">Redefinir senha</a></p><p>Este link expira em 7 dias.</p><p>Se voce nao solicitou essa alteracao, ignore este email.</p><p>Equipe YUX</p>',
    'Ola, {{contact_name}}.\n\nRecebemos uma solicitacao para redefinir sua senha de acesso ao YUX Hub.\nUse o link abaixo para criar uma nova senha:\n\n{{reset_url}}\n\nEste link expira em 7 dias.\n\nSe voce nao solicitou essa alteracao, ignore este email.\n\nEquipe YUX',
    '{"contact_name":{"label":"Nome do contato"},"reset_url":{"label":"Link de redefinicao"}}'::jsonb,
    ARRAY['contact_name', 'reset_url'],
    false
  )
ON CONFLICT DO NOTHING;
