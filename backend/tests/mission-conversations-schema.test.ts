import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0148_mission_conversations.sql')

describe('Mission conversation schema', () => {
  it('creates tenant-scoped conversations and append-only messages', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.action_mission_conversations')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.action_mission_conversation_messages')
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql.match(/private\.rls_can_access_organization\(organization_id\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.action_mission_conversation_messages')
    expect(sql).toContain('action_mission_conversation_message_append_only')
  })

  it('pins states, JSON shapes, ordering and retry constraints', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    for (const state of [
      'collecting_context', 'awaiting_user', 'brief_confirmation', 'planning',
      'awaiting_plan_approval', 'converted', 'blocked', 'cancelled',
    ]) expect(sql).toContain(`'${state}'`)
    expect(sql).toContain("jsonb_typeof(current_brief) = 'object'")
    expect(sql).toContain("jsonb_typeof(context_readiness) = 'object'")
    expect(sql).toContain("jsonb_typeof(source_refs) = 'array'")
    expect(sql).toContain('UNIQUE (conversation_id, sequence)')
    expect(sql).toContain('ON public.action_mission_conversation_messages(conversation_id, client_message_id)')
    expect(sql).toContain('UNIQUE (organization_id, create_idempotency_key)')
    expect(sql).toContain('ON public.action_mission_conversations(organization_id, status, updated_at DESC)')
  })

  it('keeps the audit conversation when a Mission is removed', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('mission_id UUID REFERENCES public.action_missions(id) ON DELETE SET NULL')
    expect(sql).not.toMatch(/mission_id UUID REFERENCES public\.action_missions\(id\) ON DELETE CASCADE/)
  })
})
