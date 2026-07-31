# Email Template Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build versioned email template management for YUX system emails and client-owned organization emails, using a Tiptap visual editor with HTML mode.

**Architecture:** Add a shared backend email-template module on top of the existing VPS/Postgres/SMTP2GO email hub. Keep template scope enforcement server-side: YUX Admin can manage `system` and `blueprint` templates, while client users can manage only `organization` templates for their organization. Frontend uses a reusable template workspace and editor, rendered in separate Admin YUX and Portal Cliente pages.

**Tech Stack:** Fastify, pg, Zod, Vitest, Postgres migrations, React 18, Vite, Tiptap, Tailwind, existing `apiRequest`, existing SMTP2GO configured sender.

---

## Scope Check

This plan implements one product capability with multiple layers:

- database foundation;
- backend template CRUD, publish, render, preview and test-send;
- migration of current invitation/password-reset emails to templates with hardcoded fallback;
- Admin YUX page for system templates;
- Portal Cliente page for organization templates and blueprints;
- Tiptap visual editor with HTML mode.

The SMTP2GO infrastructure page remains separate. The first implementation should not build a marketplace, advanced drag-and-drop marketing builder, or Admin bulk editing of client templates.

## File Structure

Create:

- `backend/src/db/migrations/0106_email_template_management.sql` - production migration for template tables and send request references.
- `backend/src/modules/emailTemplates/types.ts` - backend enum/type definitions for template scopes, statuses, payloads and render output.
- `backend/src/modules/emailTemplates/templateRules.ts` - pure validation, variable extraction, permission checks and default template definitions.
- `backend/src/modules/emailTemplates/templateRenderer.ts` - HTML sanitization, variable rendering, text fallback generation.
- `backend/src/modules/emailTemplates/repository.ts` - SQL access for templates, versions and send logs.
- `backend/src/modules/emailTemplates/routes.ts` - Fastify routes for admin and portal template operations.
- `backend/tests/email-template-rules.test.ts` - pure tests for scope, variable and rendering rules.
- `backend/tests/email-template-routes.test.ts` - route/repository behavior tests with mocked pool.
- `frontend/src/types/emailTemplate.ts` - frontend DTOs matching backend responses.
- `frontend/src/services/emailTemplateService.ts` - typed API client for admin and portal template operations.
- `frontend/src/lib/email/emailTemplateRules.ts` - frontend helpers for variables, status labels and editor validation.
- `frontend/src/lib/email/emailTemplateRules.test.ts` - frontend rule tests.
- `frontend/src/components/email-templates/EmailTemplateEditor.tsx` - reusable Tiptap visual/HTML editor.
- `frontend/src/components/email-templates/EmailTemplateWorkspace.tsx` - list/editor/preview/test-send workspace.
- `frontend/src/components/email-templates/EmailTemplateWorkspace.test.tsx` - rendering and permission tests.
- `frontend/src/pages/platform/AdminSystemEmailsPage.tsx` - Admin YUX system template page.
- `frontend/src/pages/client-portal/PortalEmailTemplatesPage.tsx` - client organization template page.

Modify:

- `backend/package.json` - add backend HTML sanitizer dependency.
- `backend/src/db/migrations/0100_portal_schema.sql` - keep fresh DB schema aligned.
- `backend/src/index.ts` or route registration owner - register email template routes.
- `backend/src/auth/invitations.ts` - keep fallback builders exported.
- `backend/src/modules/workspace/clientAccessEmails.ts` - render invitation/reset through system templates first.
- `backend/src/modules/workspace/routes.ts` - pass template renderer dependencies to client access email flow if needed.
- `frontend/package.json` - add Tiptap dependencies.
- `frontend/src/App.tsx` - add Admin and Portal routes.
- `frontend/src/lib/platform/navigation.ts` - add navigation entries.
- `frontend/src/lib/platform/navigation.test.ts` - update expected navigation.
- `frontend/src/pages/platform/AdminEmailPage.tsx` - keep SMTP2GO page focused on infrastructure and link to system templates.
- `docs/implementation-status.md` - mark template management status after implementation.

## Task 1: Database Schema

**Files:**
- Create: `backend/src/db/migrations/0106_email_template_management.sql`
- Modify: `backend/src/db/migrations/0100_portal_schema.sql`
- Test: `backend/tests/schema-smoke.test.ts`

- [ ] **Step 1: Add migration for templates and send request references**

Create `backend/src/db/migrations/0106_email_template_management.sql` with:

```sql
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
```

- [ ] **Step 2: Align fresh schema**

Copy the same DDL into `backend/src/db/migrations/0100_portal_schema.sql` after the existing email hub section, preserving current migration comments. Also extend the existing `email_send_requests` definition with the new columns so a fresh database matches migrated production.

- [ ] **Step 3: Add schema smoke assertions**

In `backend/tests/schema-smoke.test.ts`, add assertions that `0100_portal_schema.sql` contains these strings:

```ts
expect(schema).toContain('CREATE TABLE IF NOT EXISTS public.email_templates')
expect(schema).toContain('CREATE TABLE IF NOT EXISTS public.email_template_versions')
expect(schema).toContain('template_version_id UUID REFERENCES public.email_template_versions')
expect(schema).toContain('system.client_invitation')
expect(schema).toContain('system.password_reset')
```

- [ ] **Step 4: Run backend schema tests**

Run:

```bash
cd backend
npm test -- tests/schema-smoke.test.ts
npm run type-check
```

Expected: schema smoke tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/0106_email_template_management.sql backend/src/db/migrations/0100_portal_schema.sql backend/tests/schema-smoke.test.ts
git commit -m "feat: add email template schema"
```

Production migration command for operator handoff:

```bash
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 node dist/scripts/apply-migrations.js
```

## Task 2: Backend Template Rules And Renderer

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/modules/emailTemplates/types.ts`
- Create: `backend/src/modules/emailTemplates/templateRules.ts`
- Create: `backend/src/modules/emailTemplates/templateRenderer.ts`
- Test: `backend/tests/email-template-rules.test.ts`

- [ ] **Step 1: Add dependencies**

Install backend sanitizer dependency:

```bash
cd backend
npm install sanitize-html
npm install -D @types/sanitize-html
```

Expected: `backend/package.json` and lockfile update with `sanitize-html`.

- [ ] **Step 2: Write failing rule and renderer tests**

Create `backend/tests/email-template-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  extractTemplateVariables,
  validateTemplateForPublish,
  canManageTemplateScope,
} from '../src/modules/emailTemplates/templateRules.js'
import { renderEmailTemplate, sanitizeEmailHtml } from '../src/modules/emailTemplates/templateRenderer.js'

describe('email template rules', () => {
  it('extracts unique template variables from subject and html', () => {
    expect(extractTemplateVariables('Ola {{name}}', '<p>{{name}} {{invite_url}}</p>')).toEqual(['invite_url', 'name'])
  })

  it('blocks publishing when required variables are missing from content', () => {
    const result = validateTemplateForPublish({
      subject: 'Acesso',
      bodyHtml: '<p>Ola {{contact_name}}</p>',
      requiredVariables: ['contact_name', 'invite_url'],
      emailKind: 'transactional',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'required_variable_missing',
      missingVariables: ['invite_url'],
    })
  })

  it('requires unsubscribe_url for marketing templates', () => {
    const result = validateTemplateForPublish({
      subject: 'Novidade',
      bodyHtml: '<p>Conteudo</p>',
      requiredVariables: [],
      emailKind: 'marketing',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'marketing_requires_unsubscribe_url',
      missingVariables: ['unsubscribe_url'],
    })
  })

  it('sanitizes scripts and renders variables', () => {
    const html = sanitizeEmailHtml('<p>Ola {{name}}</p><script>alert(1)</script>')
    const rendered = renderEmailTemplate({
      subject: 'Ola {{name}}',
      bodyHtml: html,
      bodyText: null,
      variables: { name: 'Andre' },
    })

    expect(rendered.subject).toBe('Ola Andre')
    expect(rendered.html).toBe('<p>Ola Andre</p>')
    expect(rendered.text).toContain('Ola Andre')
  })

  it('enforces scope permissions', () => {
    expect(canManageTemplateScope({ role: 'admin', mode: 'admin', scope: 'system' })).toBe(true)
    expect(canManageTemplateScope({ role: 'client', mode: 'portal', scope: 'system' })).toBe(false)
    expect(canManageTemplateScope({ role: 'client', mode: 'portal', scope: 'organization' })).toBe(true)
    expect(canManageTemplateScope({ role: 'admin', mode: 'admin', scope: 'organization' })).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
npm test -- tests/email-template-rules.test.ts
```

Expected: FAIL because `emailTemplates` module files do not exist.

- [ ] **Step 4: Add backend types**

Create `backend/src/modules/emailTemplates/types.ts`:

```ts
export type EmailTemplateScope = 'system' | 'organization' | 'blueprint'
export type EmailTemplateStatus = 'draft' | 'published' | 'paused' | 'archived'
export type EmailTemplateKind = 'transactional' | 'operational' | 'marketing'
export type EmailTemplateMode = 'admin' | 'portal'

export type EmailTemplateRow = {
  id: string
  scope: EmailTemplateScope
  organizationId: string | null
  blueprintKey: string | null
  name: string
  description: string | null
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey: string | null
  status: EmailTemplateStatus
  subject: string
  preheader: string | null
  bodyHtml: string
  bodyText: string | null
  variablesSchema: Record<string, unknown>
  requiredVariables: string[]
  editableByClient: boolean
  publishedVersionId: string | null
  createdAt: string
  updatedAt: string
}

export type PublishValidationInput = {
  subject: string
  bodyHtml: string
  requiredVariables: string[]
  emailKind: EmailTemplateKind
}

export type PublishValidationResult =
  | { ok: true }
  | { ok: false; reason: 'subject_required' | 'body_required' | 'required_variable_missing' | 'marketing_requires_unsubscribe_url'; missingVariables?: string[] }

export type RenderTemplateInput = {
  subject: string
  bodyHtml: string
  bodyText: string | null
  variables: Record<string, string | number | boolean | null | undefined>
}

export type RenderTemplateOutput = {
  subject: string
  html: string
  text: string
}
```

- [ ] **Step 5: Add rules implementation**

Create `backend/src/modules/emailTemplates/templateRules.ts`:

```ts
import type { EmailTemplateKind, EmailTemplateMode, EmailTemplateScope, PublishValidationInput, PublishValidationResult } from './types.js'

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function extractTemplateVariables(subject: string, bodyHtml: string) {
  const values = new Set<string>()
  for (const source of [subject, bodyHtml]) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      values.add(match[1])
    }
  }
  return Array.from(values).sort()
}

export function validateTemplateForPublish(input: PublishValidationInput): PublishValidationResult {
  if (!input.subject.trim()) return { ok: false, reason: 'subject_required' }
  if (!input.bodyHtml.trim()) return { ok: false, reason: 'body_required' }

  const variables = extractTemplateVariables(input.subject, input.bodyHtml)
  const missingVariables = input.requiredVariables.filter(variable => !variables.includes(variable))
  if (missingVariables.length > 0) {
    return { ok: false, reason: 'required_variable_missing', missingVariables }
  }

  if (input.emailKind === 'marketing' && !variables.includes('unsubscribe_url')) {
    return { ok: false, reason: 'marketing_requires_unsubscribe_url', missingVariables: ['unsubscribe_url'] }
  }

  return { ok: true }
}

export function canManageTemplateScope(input: { role: string; mode: EmailTemplateMode; scope: EmailTemplateScope }) {
  if (input.mode === 'admin') return input.role !== 'client' && input.scope !== 'organization'
  if (input.mode === 'portal') return input.role === 'client' && input.scope === 'organization'
  return false
}
```

- [ ] **Step 6: Add renderer implementation**

Create `backend/src/modules/emailTemplates/templateRenderer.ts`:

```ts
import sanitizeHtml from 'sanitize-html'
import type { RenderTemplateInput, RenderTemplateOutput } from './types.js'

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
      'blockquote', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'style'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      p: ['style'],
      span: ['style'],
      div: ['style'],
      table: ['style', 'width'],
      td: ['style', 'width', 'align'],
      th: ['style', 'width', 'align'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  }).trim()
}

export function renderEmailTemplate(input: RenderTemplateInput): RenderTemplateOutput {
  const render = (value: string) => value.replace(VARIABLE_PATTERN, (_, key: string) => {
    const replacement = input.variables[key]
    return replacement === null || replacement === undefined ? '' : String(replacement)
  })

  const html = sanitizeEmailHtml(render(input.bodyHtml))
  const text = input.bodyText?.trim()
    ? render(input.bodyText)
    : html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim()

  return {
    subject: render(input.subject).trim(),
    html,
    text,
  }
}
```

- [ ] **Step 7: Run tests**

```bash
cd backend
npm test -- tests/email-template-rules.test.ts
npm run type-check
```

Expected: tests pass and TypeScript passes.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/modules/emailTemplates backend/tests/email-template-rules.test.ts
git commit -m "feat: add email template rendering rules"
```

## Task 3: Backend Repository And Routes

**Files:**
- Create: `backend/src/modules/emailTemplates/repository.ts`
- Create: `backend/src/modules/emailTemplates/routes.ts`
- Modify: route registration file that registers existing platform/workspace routes
- Test: `backend/tests/email-template-routes.test.ts`

- [ ] **Step 1: Write route tests**

Create `backend/tests/email-template-routes.test.ts` with tests for these behaviors:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  buildTemplateListWhere,
  mapEmailTemplateRow,
} from '../src/modules/emailTemplates/repository.js'

describe('email template repository helpers', () => {
  it('filters admin lists to system and blueprint scopes', () => {
    expect(buildTemplateListWhere({ mode: 'admin' })).toEqual({
      sql: 'WHERE scope = ANY($1)',
      values: [['system', 'blueprint']],
    })
  })

  it('filters portal lists to the selected organization', () => {
    expect(buildTemplateListWhere({ mode: 'portal', organizationId: 'org-1' })).toEqual({
      sql: 'WHERE scope = $1 AND organization_id = $2',
      values: ['organization', 'org-1'],
    })
  })

  it('maps snake_case rows to camelCase DTOs', () => {
    expect(mapEmailTemplateRow({
      id: 'template-1',
      scope: 'system',
      organization_id: null,
      blueprint_key: 'system.client_invitation',
      name: 'Convite',
      description: null,
      category: 'access',
      email_kind: 'transactional',
      module_key: 'auth',
      trigger_key: 'client_invitation',
      status: 'draft',
      subject: 'Acesso',
      preheader: null,
      body_html: '<p>Oi</p>',
      body_text: null,
      variables_schema: {},
      required_variables: ['invite_url'],
      editable_by_client: false,
      published_version_id: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })).toMatchObject({
      id: 'template-1',
      scope: 'system',
      organizationId: null,
      blueprintKey: 'system.client_invitation',
      requiredVariables: ['invite_url'],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npm test -- tests/email-template-routes.test.ts
```

Expected: FAIL because repository helpers do not exist.

- [ ] **Step 3: Implement repository helpers and SQL access**

Create `backend/src/modules/emailTemplates/repository.ts` with:

```ts
import type pg from 'pg'
import type { EmailTemplateRow, EmailTemplateScope, EmailTemplateStatus } from './types.js'

export type TemplateListMode = 'admin' | 'portal'

export type TemplateListInput = {
  mode: TemplateListMode
  organizationId?: string
  status?: EmailTemplateStatus
}

export function buildTemplateListWhere(input: TemplateListInput) {
  const values: unknown[] = []
  const where: string[] = []

  if (input.mode === 'admin') {
    values.push(['system', 'blueprint'])
    where.push(`scope = ANY($${values.length})`)
  } else {
    values.push('organization')
    where.push(`scope = $${values.length}`)
    values.push(input.organizationId)
    where.push(`organization_id = $${values.length}`)
  }

  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }

  return { sql: `WHERE ${where.join(' AND ')}`, values }
}

export function mapEmailTemplateRow(row: any): EmailTemplateRow {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    blueprintKey: row.blueprint_key,
    name: row.name,
    description: row.description,
    category: row.category,
    emailKind: row.email_kind,
    moduleKey: row.module_key,
    triggerKey: row.trigger_key,
    status: row.status,
    subject: row.subject,
    preheader: row.preheader,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variablesSchema: row.variables_schema || {},
    requiredVariables: row.required_variables || [],
    editableByClient: Boolean(row.editable_by_client),
    publishedVersionId: row.published_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listEmailTemplates(pool: pg.Pool, input: TemplateListInput) {
  const filter = buildTemplateListWhere(input)
  const result = await pool.query(
    `SELECT * FROM public.email_templates ${filter.sql} ORDER BY updated_at DESC`,
    filter.values,
  )
  return result.rows.map(mapEmailTemplateRow)
}

export async function getEmailTemplateById(pool: pg.Pool, id: string) {
  const result = await pool.query('SELECT * FROM public.email_templates WHERE id = $1', [id])
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}

export async function getPublishedSystemTemplateByTrigger(pool: pg.Pool, triggerKey: string) {
  const result = await pool.query(
    `SELECT * FROM public.email_templates
     WHERE scope = 'system' AND trigger_key = $1 AND status = 'published'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [triggerKey],
  )
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}
```

Then add upsert, publish, clone blueprint and send-log functions in the same file using parameterized SQL. The route layer must not build SQL strings directly.

- [ ] **Step 4: Implement routes**

Create `backend/src/modules/emailTemplates/routes.ts` with endpoints:

```txt
GET    /email-templates/admin/templates
POST   /email-templates/admin/templates
POST   /email-templates/admin/templates/:id/publish
POST   /email-templates/admin/templates/:id/test-send
GET    /email-templates/portal/templates
POST   /email-templates/portal/templates
POST   /email-templates/portal/templates/:id/publish
POST   /email-templates/portal/templates/:id/test-send
POST   /email-templates/portal/blueprints/:id/clone
GET    /email-templates/portal/send-requests
```

Implementation constraints:

- reuse cookie auth with `hashSessionToken`;
- admin routes reject `user.role === 'client'`;
- portal routes require `user.role === 'client'`;
- portal routes resolve organization from current user memberships, using existing platform repository helpers when possible;
- admin routes allow only `system` and `blueprint`;
- portal routes force `scope = 'organization'` and current `organization_id`;
- publish uses `validateTemplateForPublish`;
- test-send uses `renderEmailTemplate` and `sendConfiguredSmtp2GoEmail`;
- never return SMTP2GO credentials.

- [ ] **Step 5: Register routes**

In the backend route registration owner, import and call:

```ts
import { registerEmailTemplateRoutes } from './modules/emailTemplates/routes.js'

await app.register(registerEmailTemplateRoutes, { prefix: '/api/email-templates' })
```

Use the same registration style already used for `/api/platform` and `/api/workspace`.

- [ ] **Step 6: Run tests**

```bash
cd backend
npm test -- tests/email-template-routes.test.ts tests/email-template-rules.test.ts
npm run type-check
```

Expected: tests pass and TypeScript passes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/emailTemplates backend/tests/email-template-routes.test.ts backend/src/index.ts
git commit -m "feat: add email template backend routes"
```

## Task 4: Use Templates For Client Invitation And Password Reset

**Files:**
- Modify: `backend/src/modules/workspace/clientAccessEmails.ts`
- Modify: `backend/src/auth/routes.ts`
- Modify: `backend/src/auth/invitations.ts`
- Test: `backend/tests/auth.test.ts`

- [ ] **Step 1: Add fallback-aware tests**

In `backend/tests/auth.test.ts`, add coverage that:

```ts
it('falls back to hardcoded password reset email when no published system template exists', async () => {
  const email = buildPasswordResetEmail({ contactName: 'Andre', resetUrl: 'https://hub.yux.com.br/auth/set-password?token=abc' })
  expect(email.subject).toBe('Redefina sua senha do YUX Hub')
  expect(email.html).toContain('Redefinir senha')
})
```

In the client access test area, add a test that stubs a published template and expects rendered content to include the template subject and `invite_url`.

- [ ] **Step 2: Run tests to verify current fallback passes and template path fails**

```bash
cd backend
npm test -- tests/auth.test.ts
```

Expected: fallback test passes; new template-path test fails until integration is implemented.

- [ ] **Step 3: Implement template-first rendering**

Update `createClientAccessEmailToken` so it:

1. creates token as it does today;
2. builds variables:

```ts
const variables = {
  contact_name: input.contactName,
  company_name: input.companyName,
  invite_url: accessUrl,
  reset_url: accessUrl,
}
```

3. loads `system` template by trigger `client_invitation` or `password_reset`;
4. if found and published, renders with `renderEmailTemplate`;
5. if missing, uses `buildClientInvitationEmail` or `buildPasswordResetEmail`.

Return shape remains:

```ts
{
  action,
  tokenId,
  accessUrl,
  subject,
  text,
  html,
}
```

- [ ] **Step 4: Keep forgot-password compatible**

Update `backend/src/auth/routes.ts` password reset flow to use the same template rendering helper. If the helper cannot load a template, it must continue using `buildPasswordResetEmail`.

- [ ] **Step 5: Run tests**

```bash
cd backend
npm test -- tests/auth.test.ts tests/email-template-rules.test.ts
npm run type-check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/workspace/clientAccessEmails.ts backend/src/auth/routes.ts backend/src/auth/invitations.ts backend/tests/auth.test.ts
git commit -m "feat: render access emails from templates"
```

## Task 5: Frontend Types, Service And Rules

**Files:**
- Create: `frontend/src/types/emailTemplate.ts`
- Create: `frontend/src/services/emailTemplateService.ts`
- Create: `frontend/src/lib/email/emailTemplateRules.ts`
- Test: `frontend/src/lib/email/emailTemplateRules.test.ts`

- [ ] **Step 1: Write frontend rule tests**

Create `frontend/src/lib/email/emailTemplateRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  extractEmailTemplateVariables,
  getEmailTemplateStatusLabel,
  validateEmailTemplateDraft,
} from './emailTemplateRules'

describe('emailTemplateRules', () => {
  it('extracts variables from subject and html', () => {
    expect(extractEmailTemplateVariables('Oi {{lead_name}}', '<p>{{proposal_url}}</p>')).toEqual(['lead_name', 'proposal_url'])
  })

  it('labels statuses', () => {
    expect(getEmailTemplateStatusLabel('published')).toBe('Publicado')
  })

  it('blocks marketing templates without unsubscribe_url', () => {
    expect(validateEmailTemplateDraft({
      subject: 'Oferta',
      bodyHtml: '<p>Conteudo</p>',
      emailKind: 'marketing',
      requiredVariables: [],
    })).toEqual({
      ok: false,
      reason: 'marketing_requires_unsubscribe_url',
      missingVariables: ['unsubscribe_url'],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npm test -- src/lib/email/emailTemplateRules.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Add frontend DTOs**

Create `frontend/src/types/emailTemplate.ts` with:

```ts
export type EmailTemplateScope = 'system' | 'organization' | 'blueprint'
export type EmailTemplateStatus = 'draft' | 'published' | 'paused' | 'archived'
export type EmailTemplateKind = 'transactional' | 'operational' | 'marketing'

export interface EmailTemplate {
  id: string
  scope: EmailTemplateScope
  organizationId?: string | null
  blueprintKey?: string | null
  name: string
  description?: string | null
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey?: string | null
  status: EmailTemplateStatus
  subject: string
  preheader?: string | null
  bodyHtml: string
  bodyText?: string | null
  variablesSchema: Record<string, unknown>
  requiredVariables: string[]
  editableByClient: boolean
  publishedVersionId?: string | null
  createdAt: string
  updatedAt: string
}

export interface EmailTemplateInput {
  id?: string
  name: string
  description?: string | null
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey?: string | null
  subject: string
  preheader?: string | null
  bodyHtml: string
  bodyText?: string | null
  variablesSchema?: Record<string, unknown>
  requiredVariables?: string[]
  editableByClient?: boolean
}

export interface EmailTemplateTestSendInput {
  to: string
  variables: Record<string, string>
}
```

- [ ] **Step 4: Add rules implementation**

Create `frontend/src/lib/email/emailTemplateRules.ts` with variable extraction, status labels and validation matching backend reasons.

- [ ] **Step 5: Add service implementation**

Create `frontend/src/services/emailTemplateService.ts`:

```ts
import { apiRequest } from '@/lib/apiClient'
import type { EmailTemplate, EmailTemplateInput, EmailTemplateTestSendInput } from '@/types/emailTemplate'

export class EmailTemplateService {
  async listAdminTemplates(): Promise<EmailTemplate[]> {
    return apiRequest<EmailTemplate[]>('/email-templates/admin/templates')
  }

  async saveAdminTemplate(input: EmailTemplateInput): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>('/email-templates/admin/templates', { method: 'POST', body: input })
  }

  async publishAdminTemplate(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/admin/templates/${id}/publish`, { method: 'POST' })
  }

  async testAdminTemplate(id: string, input: EmailTemplateTestSendInput): Promise<{ sent: boolean; message?: string }> {
    return apiRequest(`/email-templates/admin/templates/${id}/test-send`, { method: 'POST', body: input })
  }

  async listPortalTemplates(): Promise<EmailTemplate[]> {
    return apiRequest<EmailTemplate[]>('/email-templates/portal/templates')
  }

  async savePortalTemplate(input: EmailTemplateInput): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>('/email-templates/portal/templates', { method: 'POST', body: input })
  }

  async publishPortalTemplate(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/templates/${id}/publish`, { method: 'POST' })
  }

  async testPortalTemplate(id: string, input: EmailTemplateTestSendInput): Promise<{ sent: boolean; message?: string }> {
    return apiRequest(`/email-templates/portal/templates/${id}/test-send`, { method: 'POST', body: input })
  }

  async cloneBlueprint(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/blueprints/${id}/clone`, { method: 'POST' })
  }
}

export const emailTemplateService = new EmailTemplateService()
```

- [ ] **Step 6: Run tests**

```bash
cd frontend
npm test -- src/lib/email/emailTemplateRules.test.ts
npm run type-check
```

Expected: tests and type-check pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/emailTemplate.ts frontend/src/services/emailTemplateService.ts frontend/src/lib/email/emailTemplateRules.ts frontend/src/lib/email/emailTemplateRules.test.ts
git commit -m "feat: add email template frontend service"
```

## Task 6: Tiptap Visual Editor With HTML Mode

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/email-templates/EmailTemplateEditor.tsx`
- Test: `frontend/src/components/email-templates/EmailTemplateEditor.test.tsx`

- [ ] **Step 1: Add Tiptap dependencies**

```bash
cd frontend
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-text-style
```

Expected: `frontend/package.json` and lockfile update.

- [ ] **Step 2: Write editor tests**

Create `frontend/src/components/email-templates/EmailTemplateEditor.test.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { EmailTemplateEditor } from './EmailTemplateEditor'

describe('EmailTemplateEditor', () => {
  it('renders visual and html mode controls', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(
        <EmailTemplateEditor
          value="<p>Ola {{name}}</p>"
          variables={['name', 'unsubscribe_url']}
          onChange={() => undefined}
        />,
      )
    })

    expect(container.textContent).toContain('Visual')
    expect(container.textContent).toContain('HTML')
    expect(container.textContent).toContain('{{name}}')
    act(() => root.unmount())
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend
npm test -- src/components/email-templates/EmailTemplateEditor.test.tsx
```

Expected: FAIL because editor component does not exist.

- [ ] **Step 4: Implement editor**

Create `frontend/src/components/email-templates/EmailTemplateEditor.tsx` with:

- segmented controls for `Visual` and `HTML`;
- Tiptap toolbar buttons for bold, italic, bullet list, ordered list and link;
- variable chips rendered as buttons;
- HTML textarea mode;
- `onChange(html)` callback;
- no email sending logic inside this component.

The component props must be:

```ts
interface EmailTemplateEditorProps {
  value: string
  variables: string[]
  onChange: (html: string) => void
  disabled?: boolean
}
```

- [ ] **Step 5: Run tests and type-check**

```bash
cd frontend
npm test -- src/components/email-templates/EmailTemplateEditor.test.tsx
npm run type-check
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/email-templates/EmailTemplateEditor.tsx frontend/src/components/email-templates/EmailTemplateEditor.test.tsx
git commit -m "feat: add email template editor"
```

## Task 7: Shared Email Template Workspace

**Files:**
- Create: `frontend/src/components/email-templates/EmailTemplateWorkspace.tsx`
- Test: `frontend/src/components/email-templates/EmailTemplateWorkspace.test.tsx`

- [ ] **Step 1: Write workspace tests**

Create `frontend/src/components/email-templates/EmailTemplateWorkspace.test.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { EmailTemplateWorkspace } from './EmailTemplateWorkspace'

describe('EmailTemplateWorkspace', () => {
  it('renders system mode without client blueprint actions', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(<EmailTemplateWorkspace mode="admin" templates={[]} onReload={() => Promise.resolve()} />)
    })

    expect(container.textContent).toContain('Modelos de email do sistema')
    expect(container.textContent).not.toContain('Clonar blueprint')
    act(() => root.unmount())
  })

  it('renders portal mode for client-owned templates', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => {
      root.render(<EmailTemplateWorkspace mode="portal" templates={[]} onReload={() => Promise.resolve()} />)
    })

    expect(container.textContent).toContain('Meus modelos de email')
    act(() => root.unmount())
  })
})
```

- [ ] **Step 2: Implement workspace**

Create `frontend/src/components/email-templates/EmailTemplateWorkspace.tsx` with:

- compact list/table of templates;
- filters by category, status and kind;
- side-by-side editor and preview on desktop;
- stacked layout on mobile;
- buttons for Save, Publish and Send test;
- portal mode labels focused on client templates;
- admin mode labels focused on system templates;
- visible errors from backend.

Props:

```ts
interface EmailTemplateWorkspaceProps {
  mode: 'admin' | 'portal'
  templates: EmailTemplate[]
  onReload: () => Promise<void>
}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend
npm test -- src/components/email-templates/EmailTemplateWorkspace.test.tsx
npm run type-check
```

Expected: tests and type-check pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/email-templates/EmailTemplateWorkspace.tsx frontend/src/components/email-templates/EmailTemplateWorkspace.test.tsx
git commit -m "feat: add email template workspace"
```

## Task 8: Admin YUX System Email Page

**Files:**
- Create: `frontend/src/pages/platform/AdminSystemEmailsPage.tsx`
- Modify: `frontend/src/pages/platform/AdminEmailPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Test: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Add navigation test**

In `frontend/src/lib/platform/navigation.test.ts`, update internal navigation expectations to include:

```ts
expect(labels).toContain('Emails do Sistema')
```

And ensure the route is:

```ts
expect(items).toContainEqual({ label: 'Emails do Sistema', href: '/admin/system-emails' })
```

- [ ] **Step 2: Implement Admin page**

Create `frontend/src/pages/platform/AdminSystemEmailsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { EmailTemplateWorkspace } from '@/components/email-templates/EmailTemplateWorkspace'
import { emailTemplateService } from '@/services/emailTemplateService'
import type { EmailTemplate } from '@/types/emailTemplate'

export function AdminSystemEmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadTemplates() {
    setLoading(true)
    setError(null)
    try {
      setTemplates(await emailTemplateService.listAdminTemplates())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Nao foi possivel carregar os emails do sistema.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

  if (loading) return <p className="text-sm text-gray-600">Carregando emails do sistema...</p>
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>

  return <EmailTemplateWorkspace mode="admin" templates={templates} onReload={loadTemplates} />
}
```

- [ ] **Step 3: Register Admin route and navigation**

Add import and route in `frontend/src/App.tsx`:

```tsx
import { AdminSystemEmailsPage } from '@/pages/platform/AdminSystemEmailsPage'

<Route path="admin/system-emails" element={<AdminSystemEmailsPage />} />
```

Add navigation item in `frontend/src/lib/platform/navigation.ts` under Administracao da Plataforma:

```ts
{ label: 'Emails do Sistema', href: '/admin/system-emails' },
```

In `AdminEmailPage`, add a link to `/admin/system-emails` named `Gerenciar emails do sistema`.

- [ ] **Step 4: Run tests**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/email-templates/EmailTemplateWorkspace.test.tsx
npm run type-check
```

Expected: tests and type-check pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/platform/AdminSystemEmailsPage.tsx frontend/src/pages/platform/AdminEmailPage.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: add admin system email templates page"
```

## Task 9: Portal Cliente Email Templates Page

**Files:**
- Create: `frontend/src/pages/client-portal/PortalEmailTemplatesPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/platform/navigation.ts`
- Test: `frontend/src/lib/platform/navigation.test.ts`

- [ ] **Step 1: Add portal navigation expectations**

In `frontend/src/lib/platform/navigation.test.ts`, update portal navigation expectations:

```ts
expect(labels).toContain('Modelos de Email')
```

Route:

```ts
expect(items).toContainEqual({ label: 'Modelos de Email', href: '/portal/automacoes/emails', moduleKey: 'automations' })
```

- [ ] **Step 2: Implement Portal page**

Create `frontend/src/pages/client-portal/PortalEmailTemplatesPage.tsx` with the same loading pattern as Admin page, but calling:

```ts
emailTemplateService.listPortalTemplates()
```

Render:

```tsx
<EmailTemplateWorkspace mode="portal" templates={templates} onReload={loadTemplates} />
```

- [ ] **Step 3: Register portal routes**

In `frontend/src/App.tsx`, import:

```tsx
import { PortalEmailTemplatesPage } from '@/pages/client-portal/PortalEmailTemplatesPage'
```

Replace the current safe-state template routes:

```tsx
<Route path="automacoes/templates" element={<PortalEmailTemplatesPage />} />
<Route path="portal/automacoes/templates" element={<PortalEmailTemplatesPage />} />
```

Add compatibility routes:

```tsx
<Route path="automacoes/emails" element={<PortalEmailTemplatesPage />} />
<Route path="portal/automacoes/emails" element={<PortalEmailTemplatesPage />} />
```

- [ ] **Step 4: Update portal navigation**

In `frontend/src/lib/platform/navigation.ts`, change the Automacoes item label:

```ts
moduleItem(context, { label: 'Modelos de Email', href: href('/automacoes/templates'), moduleKey: 'automations' })
```

- [ ] **Step 5: Run tests**

```bash
cd frontend
npm test -- src/lib/platform/navigation.test.ts src/components/email-templates/EmailTemplateWorkspace.test.tsx
npm run type-check
```

Expected: tests and type-check pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/client-portal/PortalEmailTemplatesPage.tsx frontend/src/App.tsx frontend/src/lib/platform/navigation.ts frontend/src/lib/platform/navigation.test.ts
git commit -m "feat: add portal email templates page"
```

## Task 10: Send Logs, Suppressions And Final Validation

**Files:**
- Modify: `backend/src/modules/emailTemplates/repository.ts`
- Modify: `backend/src/modules/emailTemplates/routes.ts`
- Modify: `frontend/src/types/emailTemplate.ts`
- Modify: `frontend/src/services/emailTemplateService.ts`
- Modify: `frontend/src/components/email-templates/EmailTemplateWorkspace.tsx`
- Modify: `docs/implementation-status.md`

- [ ] **Step 1: Add send log DTOs and backend query**

Add frontend DTO:

```ts
export interface EmailTemplateSendRequest {
  id: string
  templateId?: string | null
  templateVersionId?: string | null
  recipientEmail: string
  emailKind: EmailTemplateKind
  moduleKey: string
  subject: string
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'rejected' | 'suppressed'
  protectedError?: string | null
  createdAt: string
  updatedAt: string
}
```

Backend query must select from `email_send_requests` filtered by:

- Admin: only `sender_scope = 'system'`;
- Portal: `organization_id = current organization`.

- [ ] **Step 2: Add service method**

In `EmailTemplateService`:

```ts
async listPortalSendRequests(): Promise<EmailTemplateSendRequest[]> {
  return apiRequest<EmailTemplateSendRequest[]>('/email-templates/portal/send-requests')
}
```

Add admin equivalent:

```ts
async listAdminSendRequests(): Promise<EmailTemplateSendRequest[]> {
  return apiRequest<EmailTemplateSendRequest[]>('/email-templates/admin/send-requests')
}
```

- [ ] **Step 3: Show send history in workspace**

Add a `Historico` tab to `EmailTemplateWorkspace` that displays:

- recipient;
- subject;
- status;
- created date;
- protected error when present.

Do not display API keys, SMTP2GO secret references or raw provider payloads.

- [ ] **Step 4: Update implementation status**

Add or update row in `docs/implementation-status.md`:

```markdown
| Email template management | Implemented in repo | `/admin/system-emails`, `/portal/automacoes/templates` | `docs/superpowers/specs/2026-07-01-email-template-management-design.md`, `docs/superpowers/plans/2026-07-01-email-template-management.md` | System templates and organization templates use a shared backend layer, Tiptap editor, SMTP2GO test sends, versioning and send history. |
```

- [ ] **Step 5: Run final validation**

```bash
cd backend
npm test -- tests/email-template-rules.test.ts tests/email-template-routes.test.ts tests/auth.test.ts tests/schema-smoke.test.ts
npm run type-check
npm run build
cd ../frontend
npm test -- src/lib/email/emailTemplateRules.test.ts src/components/email-templates/EmailTemplateEditor.test.tsx src/components/email-templates/EmailTemplateWorkspace.test.tsx src/lib/platform/navigation.test.ts
npm run type-check
npm run build
```

Expected:

- backend tests pass;
- backend type-check passes;
- backend build passes;
- frontend tests pass;
- frontend type-check passes;
- frontend build passes with only existing non-blocking browser/chunk warnings if they still exist.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/emailTemplates frontend/src/types/emailTemplate.ts frontend/src/services/emailTemplateService.ts frontend/src/components/email-templates/EmailTemplateWorkspace.tsx docs/implementation-status.md
git commit -m "feat: add email template send history"
```

## Execution Notes

After implementation is merged and deployed, apply migrations in production with:

```bash
docker exec -it yuxportalprod-yuxportalstack-isvyu1-yux-backend-api-1 node dist/scripts/apply-migrations.js
```

Then validate in production:

```bash
curl -i https://hub.yux.com.br/api/health
```

Manual smoke checks:

- Admin YUX opens `/admin/system-emails`.
- Admin YUX can edit, send test and publish the invitation template.
- Client opens `/portal/automacoes/templates`.
- Client can create an organization template and cannot see system templates.
- Client cannot open `/admin/system-emails`.
- Invitation email still sends if no template is published.
- Invitation email uses template content when a matching published system template exists.
- Marketing template cannot publish without `{{unsubscribe_url}}`.
