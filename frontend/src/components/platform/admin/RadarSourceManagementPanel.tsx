import { useEffect, useState } from 'react'
import { radarService } from '@/services/radarService'
import { getRadarSourceBlockedReason } from '@/lib/radar/radarSourceRules'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

type AdminSource = Awaited<ReturnType<typeof radarService.getAdminDataSources>>[number]
const providerKeys: Partial<Record<AdminSource['sourceType'], string>> = {
  cnpja_advanced_search: 'cnpja', cnpja_office_lookup: 'cnpja', serper_places: 'serper', brave_place_search: 'brave_place', brave_web_search: 'brave_place',
}
const buttonClass = 'rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'

export function RadarSourceManagementPanel({ providers }: { providers: PlatformProviderConnection[] }) {
  const [sources, setSources] = useState<AdminSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    radarService.getAdminDataSources()
      .then(result => { if (active) setSources(result) })
      .catch(() => { if (active) setError('Não foi possível carregar as fontes do Radar. Tente atualizar.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

  return <section id="radar-sources" className="scroll-mt-4 space-y-4 rounded-lg border bg-white p-4" aria-label="Fontes do Radar Comercial">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Fontes do Radar Comercial</h2>
        <p className="mt-1 text-sm text-gray-600">Ative ou desative cada fonte e configure seu custo e limite diário por organização, sem abrir uma campanha.</p>
      </div>
      <button type="button" className={buttonClass} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Atualizar fontes</button>
    </div>
    <p className="text-sm text-gray-600">Chave e permissões de uso são configuradas nos provedores abaixo. Confirmar uma licença não ativa a fonte automaticamente. Salvar ou ativar aqui não executa consultas; buscas posteriores podem consumir créditos.</p>
    <p className="text-xs text-gray-500">Fontes globais valem para organizações com o módulo Radar liberado. Um registro específico da organização prevalece sobre a fonte global. Jina e fontes futuras não são ativadas por este painel.</p>
    {loading && <p className="text-sm text-gray-600">Carregando fontes...</p>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loading && !error && sources.length === 0 && <p className="text-sm text-gray-600">Nenhuma fonte implementada cadastrada. Confira as migrações do Radar.</p>}
    {!loading && !error && <div className="grid gap-4 lg:grid-cols-2">
      {sources.map(source => <SourceControl key={source.id}
        source={source} provider={providers.find(provider => provider.providerKey === providerKeys[source.sourceType] && provider.environment === 'production')}
        onUpdated={updated => setSources(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item))} />)}
    </div>}
  </section>
}

function SourceControl({ source, provider, onUpdated }: {
  source: AdminSource; provider?: PlatformProviderConnection; onUpdated: (source: AdminSource) => void
}) {
  const [cost, setCost] = useState(String(source.defaultCostPerUnit))
  const [limit, setLimit] = useState(String(source.rateLimitPerDay))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const costValue = Number(cost)
  const limitValue = Number(limit)
  const validCost = cost.trim() !== '' && Number.isFinite(costValue) && costValue >= 0 && (!source.isPaid || costValue > 0)
  const validLimit = limit.trim() !== '' && Number.isInteger(limitValue) && limitValue >= 1 && limitValue <= 1000
  const providerReady = (!source.requiresSecret || (provider?.status === 'active' && Boolean(provider.secretReference)))
    && (source.sourceType !== 'brave_web_search' || provider?.publicConfig.webSearchLicensed === true)
  const activationBlocked = getRadarSourceBlockedReason({ ...source, enabled: true })
  const hasUnsavedChanges = costValue !== source.defaultCostPerUnit || limitValue !== source.rateLimitPerDay
  const scope = source.organizationId ? source.organizationName || source.organizationId : 'Todas as organizações com Radar liberado'

  async function save(patch: Parameters<typeof radarService.updateDataSource>[1], success: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await radarService.updateDataSource(source.id, patch)
      setCost(String(updated.defaultCostPerUnit))
      setLimit(String(updated.rateLimitPerDay))
      setMessage(success)
      onUpdated(updated)
    } catch {
      setError('Não foi possível salvar a fonte. Confira custo e permissões e tente novamente.')
    } finally { setSaving(false) }
  }

  async function toggle() {
    if (!source.enabled && (!providerReady || activationBlocked || hasUnsavedChanges)) return
    if (!source.enabled && source.isPaid && !window.confirm('Esta fonte pode consumir créditos nas buscas posteriores. Confirma a ativação com o custo e os limites cadastrados? Nenhuma consulta será executada agora.')) return
    await save({ enabled: !source.enabled }, source.enabled
      ? 'Fonte desativada. Nenhuma consulta foi executada.' : 'Fonte ativada. Nenhuma consulta foi executada.')
  }

  return <article data-testid={`radar-source-${source.id}`} className="space-y-3 rounded-md border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold text-gray-900">{source.displayName}</h3>
      <span className={`rounded-full px-2 py-1 text-xs ${source.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>{source.enabled ? 'Ativa' : 'Desativada'}</span>
    </div>
    <p className="break-words text-xs text-gray-500">Escopo: {scope}</p>
    {source.requiresSecret && <p className="text-xs text-gray-600">{!provider ? 'Provedor não configurado; cadastre a integração abaixo.'
      : !providerReady ? 'Provedor inativo ou sem referência da credencial; confira a integração abaixo.'
      : 'Provedor ativo. Credencial cadastrada; não é necessário reenviar a chave.'}</p>}
    {source.sourceType === 'brave_place_search' && <p className="text-xs text-gray-600">
      {provider?.publicConfig.retentionLicensed === true && provider.publicConfig.credentialPurpose === 'licensed_retention'
        ? 'Retenção confirmada.' : 'Retenção não confirmada; apenas pré-visualização transitória.'}{' '}
      {provider?.publicConfig.clientDeliveryLicensed === true ? 'Entrega ao cliente confirmada.' : 'Entrega ao cliente não confirmada.'}
    </p>}
    {(source.sourceType === 'cnpja_advanced_search' || source.sourceType === 'cnpja_office_lookup') && <p className="text-xs text-gray-600">
      {provider?.publicConfig.clientDeliveryLicensed === true ? 'Entrega ao cliente confirmada.' : 'Entrega ao cliente não confirmada. Uso interno não exige essa confirmação.'}
    </p>}
    {activationBlocked && <p className="text-xs text-amber-800">{activationBlocked}</p>}
    {source.sourceType === 'brave_web_search' && <p className="text-xs text-gray-500">Busca web complementar. Usa a mesma chave Brave; confirme no provedor que o plano permite este endpoint com retenção. Não é necessário reenviar a chave.</p>}
    {source.sourceType === 'serper_places' && <p className="text-xs text-gray-500">Somente pré-visualização transitória; não grava resultados no CRM.</p>}
    {source.sourceType === 'osm_extract' && <p className="text-xs text-gray-500">Índice local de dados abertos. Exige extrato disponível; não comprova ausência de site ou contato.</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs text-gray-700">Custo estimado por consulta (R$)
        <input type="number" min={source.isPaid ? '0.000001' : '0'} step="0.000001" value={cost}
          readOnly={!source.isPaid} disabled={saving} onChange={event => setCost(event.target.value)}
          className="block w-full rounded-md border px-3 py-2 text-sm" />
      </label>
      <label className="space-y-1 text-xs text-gray-700">Máximo de consultas por dia na organização
        <input type="number" min="1" max="1000" step="1" value={limit} disabled={saving}
          onChange={event => setLimit(event.target.value)} className="block w-full rounded-md border px-3 py-2 text-sm" />
      </label>
    </div>
    {!validCost && <p className="text-xs text-amber-800">Informe um custo estimado maior que zero para fontes pagas.</p>}
    {!validLimit && <p className="text-xs text-amber-800">O limite deve ser um número inteiro de 1 a 1000.</p>}
    {!source.enabled && hasUnsavedChanges && <p className="text-xs text-gray-600">Salve as alterações de custo e limite antes de ativar.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={saving || !validCost || !validLimit}
        onClick={() => save({ defaultCostPerUnit: costValue, rateLimitPerDay: limitValue }, 'Custo e limites salvos. Nenhuma consulta foi executada.')}>Salvar custo e limites</button>
      <button type="button" className={buttonClass} disabled={saving || (!source.enabled && (!providerReady || Boolean(activationBlocked) || hasUnsavedChanges))}
        onClick={toggle}>{source.enabled ? 'Desativar fonte' : 'Ativar fonte'}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
  </article>
}
