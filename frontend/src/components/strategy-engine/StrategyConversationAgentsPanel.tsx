import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type {
  StrategyAgentProfile,
  StrategyAssistantRoutingRuleInput,
  StrategyConversationAssistant,
  StrategyConversationAssistantInput,
  StrategyOrganization,
} from '@/types/strategyEngine'

const roleOptions = [
  { role: 'sdr', profileKey: 'ai_sdr_comercial_1', label: 'IA SDR' },
  { role: 'closer', profileKey: 'ai_closer', label: 'IA Closer' },
  { role: 'support', profileKey: 'support_assistant', label: 'IA Suporte' },
  { role: 'retention', profileKey: 'customer_growth_comercial_2', label: 'IA Retencao' },
  { role: 'custom', profileKey: 'growth_strategist', label: 'IA Customizada' },
]

export function StrategyConversationAgentsPanel({
  organizations,
  profiles,
  assistants,
  onSaveAssistant,
  onSaveRule,
}: {
  organizations: StrategyOrganization[]
  profiles: StrategyAgentProfile[]
  assistants: StrategyConversationAssistant[]
  onSaveAssistant: (input: StrategyConversationAssistantInput) => Promise<StrategyConversationAssistant>
  onSaveRule: (input: StrategyAssistantRoutingRuleInput) => Promise<void>
}) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id || '')
  const scopedAssistants = assistants.filter(assistant => assistant.organizationId === organizationId)
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const selectedAssistant = useMemo(() => scopedAssistants.find(item => item.id === selectedAssistantId), [scopedAssistants, selectedAssistantId])
  const [form, setForm] = useState({
    name: 'IA SDR',
    tone: 'consultivo, objetivo e diagnostico',
    status: 'draft',
    assistantRole: 'sdr',
    strategyProfileId: profiles.find(profile => profile.profileKey === 'ai_sdr_comercial_1')?.id || '',
    routingPriority: 100,
    defaultRule: true,
    channel: 'whatsapp',
    stageKeys: 'lead_warm\nraised_hand',
    intentKeys: 'sales\nqualification',
    keywordPatterns: 'preco\norcamento\nreuniao\nproposta',
    lockRoleMinutes: 30,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!organizationId && organizations[0]?.id) setOrganizationId(organizations[0].id)
  }, [organizations, organizationId])

  useEffect(() => {
    if (!selectedAssistant) return
    const firstRule = selectedAssistant.rules?.[0]
    const metadataLockMinutes = Number(selectedAssistant.routingMetadata.lockRoleMinutes)
    setForm({
      name: selectedAssistant.name || '',
      tone: selectedAssistant.tone || '',
      status: selectedAssistant.status || 'draft',
      assistantRole: selectedAssistant.assistantRole || 'sdr',
      strategyProfileId: selectedAssistant.strategyProfileId || '',
      routingPriority: selectedAssistant.routingPriority || 100,
      defaultRule: Boolean(firstRule?.default_rule ?? true),
      channel: firstRule?.channel || 'whatsapp',
      stageKeys: (firstRule?.stage_keys || []).join('\n'),
      intentKeys: (firstRule?.intent_keys || []).join('\n'),
      keywordPatterns: (firstRule?.keyword_patterns || []).join('\n'),
      lockRoleMinutes: firstRule?.lock_role_minutes || (Number.isFinite(metadataLockMinutes) ? metadataLockMinutes : 30),
    })
    setSaved(false)
  }, [selectedAssistant])

  function applyRolePreset(role: string) {
    const preset = roleOptions.find(item => item.role === role)
    const profile = profiles.find(profile => profile.profileKey === preset?.profileKey)
    setForm({
      ...form,
      assistantRole: role,
      name: preset?.label || form.name,
      strategyProfileId: profile?.id || form.strategyProfileId,
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    const assistant = await onSaveAssistant({
      id: selectedAssistant?.id,
      organizationId,
      name: form.name,
      tone: form.tone,
      status: form.status,
      assistantRole: form.assistantRole,
      strategyProfileId: form.strategyProfileId,
      routingPriority: Number(form.routingPriority),
      routingMetadata: { lockRoleMinutes: Number(form.lockRoleMinutes) },
      summaryEnabled: true,
      classificationEnabled: true,
    })
    await onSaveRule({
      id: selectedAssistant?.rules?.[0]?.id,
      assistantId: assistant.id,
      channel: form.channel,
      requiredRole: form.assistantRole,
      stageKeys: splitLines(form.stageKeys),
      intentKeys: splitLines(form.intentKeys),
      keywordPatterns: splitLines(form.keywordPatterns),
      defaultRule: form.defaultRule,
      scoreWeight: 10,
      lockRoleMinutes: Number(form.lockRoleMinutes),
      status: 'active',
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,380px)_1fr]">
      <section className="space-y-4 rounded-lg border bg-white p-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-gray-700">Organizacao cliente</span>
          <select value={organizationId} onChange={event => { setOrganizationId(event.target.value); setSelectedAssistantId('') }} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
            <option value="">Selecionar organizacao</option>
            {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>

        <div>
          <h2 className="text-base font-semibold text-gray-900">Assistentes configurados</h2>
          <div className="mt-3 space-y-2">
            {scopedAssistants.map(assistant => (
              <button
                key={assistant.id}
                type="button"
                onClick={() => setSelectedAssistantId(assistant.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${assistant.id === selectedAssistantId ? 'border-yux-600 bg-yux-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <span className="block font-semibold text-gray-900">{assistant.name}</span>
                <span className="text-xs text-gray-600">{assistant.assistantRole || 'sem papel'} / {assistant.status}</span>
              </button>
            ))}
            {scopedAssistants.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-gray-500">Nenhuma IA conversacional nesta organizacao.</p>}
            <button type="button" onClick={() => setSelectedAssistantId('')} className="w-full rounded-md border border-yux-200 px-3 py-2 text-sm font-medium text-yux-700 hover:bg-yux-50">Criar novo assistente</button>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{selectedAssistant ? 'Editar assistente' : 'Novo assistente conversacional'}</h2>
          <p className="text-sm text-gray-600">Configure a IA externa que conversa com leads/clientes e a vincule a um Strategy Profile.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Input label="Nome" value={form.name} onChange={value => setForm({ ...form, name: value })} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Papel</span>
            <select value={form.assistantRole} onChange={event => applyRolePreset(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              {roleOptions.map(option => <option key={option.role} value={option.role}>{option.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Strategy Profile</span>
            <select value={form.strategyProfileId} onChange={event => setForm({ ...form, strategyProfileId: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              <option value="">Sem profile</option>
              {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.profileKey}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-gray-700">Tom</span>
            <input value={form.tone} onChange={event => setForm({ ...form, tone: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Status</span>
            <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <Input label="Prioridade" type="number" value={String(form.routingPriority)} onChange={value => setForm({ ...form, routingPriority: Number(value) })} />
          <Input label="Canal" value={form.channel} onChange={value => setForm({ ...form, channel: value })} />
          <Input label="Lock de papel (min)" type="number" value={String(form.lockRoleMinutes)} onChange={value => setForm({ ...form, lockRoleMinutes: Number(value) })} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TextArea label="Etapas comerciais" value={form.stageKeys} onChange={value => setForm({ ...form, stageKeys: value })} />
          <TextArea label="Intencoes" value={form.intentKeys} onChange={value => setForm({ ...form, intentKeys: value })} />
          <TextArea label="Palavras-chave" value={form.keywordPatterns} onChange={value => setForm({ ...form, keywordPatterns: value })} />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.defaultRule} onChange={event => setForm({ ...form, defaultRule: event.target.checked })} />
            Regra default para este papel
          </label>
          <button type="submit" disabled={saving || !organizationId} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar assistente'}
          </button>
        </div>
        {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Assistente salvo.</div>}
      </form>
    </div>
  )
}

function splitLines(value: string) {
  return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} className="min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs" spellCheck={false} />
    </label>
  )
}
