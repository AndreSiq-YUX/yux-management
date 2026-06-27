import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { StrategyAgentProfile, StrategyLlmProvider, StrategyModelRoute, StrategyModelRouteInput } from '@/types/strategyEngine'

export function StrategyModelRoutingPanel({
  profiles,
  providers,
  modelRoutes,
  onSave,
}: {
  profiles: StrategyAgentProfile[]
  providers: StrategyLlmProvider[]
  modelRoutes: StrategyModelRoute[]
  onSave: (input: StrategyModelRouteInput) => Promise<void>
}) {
  const [profileKey, setProfileKey] = useState(profiles[0]?.profileKey || '')
  const route = useMemo(() => modelRoutes.find(item => item.agentType === profileKey && item.routingTier === 'default'), [modelRoutes, profileKey])
  const defaultProvider = providers.find(provider => provider.is_default) || providers[0]
  const providerKeys = providers.map(provider => provider.provider_key || provider.providerKey).filter(Boolean)
  const [form, setForm] = useState({
    provider: defaultProvider?.provider_key || defaultProvider?.providerKey || 'openrouter',
    modelName: 'openai/gpt-4.1-mini',
    fallbackModelName: '',
    routingTier: 'default',
    maxInputTokens: 8000,
    maxOutputTokens: 1200,
    temperature: 0.4,
    maxCostPerRun: 0,
    status: 'active',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSaved(false)
    setForm({
      provider: route?.provider || defaultProvider?.provider_key || defaultProvider?.providerKey || 'openrouter',
      modelName: route?.modelName || 'openai/gpt-4.1-mini',
      fallbackModelName: route?.fallbackModelName || '',
      routingTier: route?.routingTier || 'default',
      maxInputTokens: route?.maxInputTokens || 8000,
      maxOutputTokens: route?.maxOutputTokens || 1200,
      temperature: route?.temperature ?? 0.4,
      maxCostPerRun: route?.maxCostPerRun || 0,
      status: route?.status || 'active',
    })
  }, [route, profileKey, defaultProvider])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    await onSave({
      id: route?.id,
      agentType: profileKey,
      ...form,
      maxInputTokens: Number(form.maxInputTokens),
      maxOutputTokens: Number(form.maxOutputTokens),
      temperature: Number(form.temperature),
      maxCostPerRun: Number(form.maxCostPerRun),
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(260px,360px)_1fr]">
      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Rotas por agente</h2>
        <p className="mt-1 text-sm text-gray-600">Cada Strategy Profile pode ter modelo e fallback explicitos.</p>
        <div className="mt-4 space-y-2">
          {profiles.map(profile => {
            const hasRoute = modelRoutes.some(route => route.agentType === profile.profileKey)
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => setProfileKey(profile.profileKey)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${profile.profileKey === profileKey ? 'border-yux-600 bg-yux-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <span className="block font-semibold text-gray-900">{profile.profileKey}</span>
                <span className={`text-xs ${hasRoute ? 'text-emerald-700' : 'text-amber-700'}`}>{hasRoute ? 'rota configurada' : 'sem rota explicita'}</span>
              </button>
            )
          })}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{profileKey}</h2>
          <p className="text-sm text-gray-600">Rota default usada pelo harness quando este profile executar uma acao.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Provider</span>
            <select value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              {providerKeys.length === 0 && <option value="openrouter">openrouter</option>}
              {providerKeys.map(key => <option key={key} value={key}>{key}</option>)}
            </select>
          </label>
          <Input label="Modelo principal" value={form.modelName} onChange={value => setForm({ ...form, modelName: value })} />
          <Input label="Modelo fallback" value={form.fallbackModelName} onChange={value => setForm({ ...form, fallbackModelName: value })} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Tier</span>
            <select value={form.routingTier} onChange={event => setForm({ ...form, routingTier: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              <option value="cheap">cheap</option>
              <option value="default">default</option>
              <option value="premium">premium</option>
              <option value="fallback">fallback</option>
            </select>
          </label>
          <Input label="Input tokens" type="number" value={String(form.maxInputTokens)} onChange={value => setForm({ ...form, maxInputTokens: Number(value) })} />
          <Input label="Output tokens" type="number" value={String(form.maxOutputTokens)} onChange={value => setForm({ ...form, maxOutputTokens: Number(value) })} />
          <Input label="Temperatura" type="number" step="0.1" value={String(form.temperature)} onChange={value => setForm({ ...form, temperature: Number(value) })} />
          <Input label="Custo max/run" type="number" step="0.0001" value={String(form.maxCostPerRun)} onChange={value => setForm({ ...form, maxCostPerRun: Number(value) })} />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Status</span>
            <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">A chave real do provider continua em secrets server-side; aqui fica apenas governanca de roteamento.</p>
          <button type="submit" disabled={saving || !profileKey} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar rota'}
          </button>
        </div>
        {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Rota salva.</div>}
      </form>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text', step }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input type={type} step={step} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" />
    </label>
  )
}
