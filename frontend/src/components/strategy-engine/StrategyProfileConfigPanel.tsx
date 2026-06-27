import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { StrategyAgentProfile, StrategyAgentProfileUpdateInput } from '@/types/strategyEngine'

const joinLines = (items: string[] = []) => items.join('\n')
const splitLines = (value: string) => value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)

export function StrategyProfileConfigPanel({
  profiles,
  onSave,
}: {
  profiles: StrategyAgentProfile[]
  onSave: (input: StrategyAgentProfileUpdateInput) => Promise<void>
}) {
  const [selectedId, setSelectedId] = useState(profiles[0]?.id || '')
  const selected = useMemo(() => profiles.find(profile => profile.id === selectedId) || profiles[0], [profiles, selectedId])
  const [form, setForm] = useState({
    status: 'active',
    maxContextChars: 5000,
    maxCards: 8,
    maxChunks: 4,
    allowedModules: '',
    allowedTools: '',
    forbiddenActions: '',
    requiresHumanApprovalFor: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!selected) return
    setSelectedId(selected.id)
    setForm({
      status: selected.status || 'active',
      maxContextChars: selected.maxContextChars || 5000,
      maxCards: selected.maxCards || 8,
      maxChunks: selected.maxChunks || 4,
      allowedModules: joinLines(selected.allowedModules),
      allowedTools: joinLines(selected.allowedTools),
      forbiddenActions: joinLines(selected.forbiddenActions),
      requiresHumanApprovalFor: joinLines(selected.requiresHumanApprovalFor),
    })
    setSaved(false)
  }, [selected])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setSaved(false)
    await onSave({
      id: selected.id,
      status: form.status,
      maxContextChars: Number(form.maxContextChars),
      maxCards: Number(form.maxCards),
      maxChunks: Number(form.maxChunks),
      allowedModules: splitLines(form.allowedModules),
      allowedTools: splitLines(form.allowedTools),
      forbiddenActions: splitLines(form.forbiddenActions),
      requiresHumanApprovalFor: splitLines(form.requiresHumanApprovalFor),
    })
    setSaving(false)
    setSaved(true)
  }

  if (profiles.length === 0) return <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-500">Nenhum perfil estrategico encontrado.</div>

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,320px)_1fr]">
        <aside className="space-y-2">
          {profiles.map(profile => (
            <button
              key={profile.id}
              type="button"
              onClick={() => setSelectedId(profile.id)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${profile.id === selected?.id ? 'border-yux-600 bg-yux-50 text-yux-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <span className="block font-semibold">{profile.profileKey}</span>
              <span className="line-clamp-2 text-xs">{profile.description || profile.purpose}</span>
            </button>
          ))}
        </aside>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{selected?.name || selected?.profileKey}</h2>
            <p className="text-sm text-gray-600">{selected?.purpose || selected?.description}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-gray-700">Status</span>
              <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="draft">draft</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-gray-700">Contexto</span>
              <input type="number" value={form.maxContextChars} onChange={event => setForm({ ...form, maxContextChars: Number(event.target.value) })} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-gray-700">Cards</span>
              <input type="number" value={form.maxCards} onChange={event => setForm({ ...form, maxCards: Number(event.target.value) })} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-gray-700">Chunks</span>
              <input type="number" value={form.maxChunks} onChange={event => setForm({ ...form, maxChunks: Number(event.target.value) })} className="w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <TextArea label="Modulos permitidos" value={form.allowedModules} onChange={value => setForm({ ...form, allowedModules: value })} />
            <TextArea label="Ferramentas permitidas" value={form.allowedTools} onChange={value => setForm({ ...form, allowedTools: value })} />
            <TextArea label="Acoes proibidas" value={form.forbiddenActions} onChange={value => setForm({ ...form, forbiddenActions: value })} />
            <TextArea label="Exigem aprovacao humana" value={form.requiresHumanApprovalFor} onChange={value => setForm({ ...form, requiresHumanApprovalFor: value })} />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Use uma linha por item. Essas listas guiam guardrails e contexto dos agentes.</p>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </div>
          {saved && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Perfil atualizado.</div>}
        </section>
      </div>
    </form>
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
