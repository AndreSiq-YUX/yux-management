import { useState, type FormEvent, type ReactNode } from 'react'
import { FlaskConical, Save } from 'lucide-react'
import type {
  AdminLlmRoute,
  AdminLlmRouteInput,
  AdminLlmRouteTestResult,
  AdminLlmUseCase,
} from '@/services/adminPlatformService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

const useCases: Array<{ key: AdminLlmUseCase; title: string; description: string }> = [
  {
    key: 'action_engine_strategist',
    title: 'Action Engine — conversa estratégica',
    description: 'Interpreta o pedido e cruza metodologia, conhecimento da YUX e contexto do cliente.',
  },
  {
    key: 'mission_supervisor',
    title: 'Action Engine — planejamento da missão',
    description: 'Converte o brief confirmado em um plano operacional governado.',
  },
]

export function LlmUseCaseRoutingPanel({
  providers,
  routes,
  onSave,
  onTest,
}: {
  providers: PlatformProviderConnection[]
  routes: AdminLlmRoute[]
  onSave: (input: AdminLlmRouteInput) => Promise<AdminLlmRoute>
  onTest: (routeId: string) => Promise<AdminLlmRouteTestResult>
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Modelos por caso de uso</h2>
        <p className="text-sm text-gray-600">
          O perfil de conhecimento permanece separado do modelo. Mudanças salvas passam a valer na próxima execução.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {useCases.map(useCase => (
          <LlmRouteEditor
            key={`${useCase.key}:${routes.find(route => route.agentType === useCase.key)?.updatedAt || 'new'}`}
            useCase={useCase}
            providers={providers}
            route={routes.find(item => item.agentType === useCase.key)}
            onSave={onSave}
            onTest={onTest}
          />
        ))}
      </div>
    </section>
  )
}

function LlmRouteEditor({
  useCase,
  providers,
  route,
  onSave,
  onTest,
}: {
  useCase: (typeof useCases)[number]
  providers: PlatformProviderConnection[]
  route?: AdminLlmRoute
  onSave: (input: AdminLlmRouteInput) => Promise<AdminLlmRoute>
  onTest: (routeId: string) => Promise<AdminLlmRouteTestResult>
}) {
  const firstProvider = providers.find(item => item.isDefault) || providers[0]
  const [form, setForm] = useState<AdminLlmRouteInput>({
    id: route?.id,
    agentType: useCase.key,
    routingTier: route?.routingTier ?? 'default',
    provider: route?.provider ?? firstProvider?.providerKey ?? 'openrouter',
    modelName: route?.modelName ?? '',
    fallbackModelName: route?.fallbackModelName ?? null,
    maxInputTokens: route?.maxInputTokens ?? 16000,
    maxOutputTokens: route?.maxOutputTokens ?? 2200,
    temperature: route?.temperature ?? 0.2,
    maxCostPerRun: route?.maxCostPerRun ?? 0,
    status: route?.status ?? 'active',
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const saved = await onSave(form)
      setForm(current => ({ ...current, ...saved }))
      setNotice({ ok: true, message: 'Roteamento salvo. A próxima execução já usará esta configuração.' })
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : 'Não foi possível salvar a rota.' })
    } finally {
      setSaving(false)
    }
  }

  async function testRoute() {
    if (!form.id) return
    setTesting(true)
    setNotice(null)
    try {
      const result = await onTest(form.id)
      setNotice({ ok: result.ok, message: result.message })
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : 'Não foi possível testar o modelo.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold text-gray-900">{useCase.title}</h3>
      <p className="mt-1 text-sm text-gray-600">{useCase.description}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Select label="Provedor" value={form.provider} onChange={provider => setForm({ ...form, provider })}>
          {providers.map(provider => <option key={provider.id} value={provider.providerKey}>{provider.displayName}</option>)}
          {!providers.length && <option value="openrouter">OpenRouter</option>}
        </Select>
        <Select label="Status" value={form.status} onChange={status => setForm({ ...form, status: status as AdminLlmRouteInput['status'] })}>
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
          <option value="archived">Arquivado</option>
        </Select>
        <Input label="Modelo principal" value={form.modelName} onChange={modelName => setForm({ ...form, modelName })} required />
        <Input label="Modelo de fallback" value={form.fallbackModelName || ''} onChange={fallbackModelName => setForm({ ...form, fallbackModelName: fallbackModelName || null })} />
        <Input label="Limite de entrada" type="number" value={String(form.maxInputTokens)} onChange={value => setForm({ ...form, maxInputTokens: Number(value) })} />
        <Input label="Limite de saída" type="number" value={String(form.maxOutputTokens)} onChange={value => setForm({ ...form, maxOutputTokens: Number(value) })} />
        <Input label="Temperatura" type="number" step="0.1" value={String(form.temperature)} onChange={value => setForm({ ...form, temperature: Number(value) })} />
        <Input label="Custo máximo por execução" type="number" step="0.0001" value={String(form.maxCostPerRun)} onChange={value => setForm({ ...form, maxCostPerRun: Number(value) })} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={testRoute} disabled={!form.id || testing || saving} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {testing ? 'Testando...' : 'Testar modelo'}
        </button>
        <button type="submit" disabled={saving || testing || !form.modelName.trim()} className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar rota'}
        </button>
      </div>

      {notice && <div role="status" className={`mt-3 rounded-md border px-3 py-2 text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.message}</div>}
    </form>
  )
}

function Input({ label, value, onChange, type = 'text', step, required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; required?: boolean }) {
  return <label className="space-y-1 text-sm"><span className="font-medium text-gray-700">{label}</span><input type={type} step={step} value={value} required={required} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2" /></label>
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="space-y-1 text-sm"><span className="font-medium text-gray-700">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">{children}</select></label>
}
