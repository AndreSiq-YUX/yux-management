import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '@/lib/apiClient'
import type { StrategyOrganization } from '@/types/strategyEngine'

type Consumer = { key: string; name: string; owner: string; audience: string; state: string; instructions: string }
type Contract = { id: string; name: string }
type Mission = { id: string; title: string }
type StagePreview = {
  stage: string
  profile: string
  route: string
  fingerprint: string
  providerFingerprint?: string
  attempts?: Array<{ provider: string; modelName: string }>
  versions: { global: number; profile: number }
  request: {
    model: string
    fallback_models?: string[] | null
    max_tokens: number
    messages: Array<{ role: string; content: string }>
  }
  coverage?: {
    companyStrategy?: { selected: number; omittedSections?: number; truncatedSections?: number } | null
    portfolio?: { selected: number; contractRequired?: boolean; hasMore?: boolean } | null
    includesOperationalContext?: boolean
  }
  selectedPacks?: string[]
  policyTools: string[]
  sources: Array<{ kind: string; id: string; version?: string | number | null }>
}
type Simulation = { requests: StagePreview[]; blockedReason?: string }
type Preview = { baseline: Simulation; candidate?: Simulation }
type Version = { version: number; instruction: string | null; reason: string; author_id: string; operation: string; created_at: string }
type AccountScope = {
  contracts: Contract[]
  versions: Version[]
  pilotEnabled: boolean
  catalog: Array<{ id: string; label: string; approved: boolean }>
}

const endpoint = '/strategy-engine/agent-prompts'

export function AgentPromptsPanel({ organizations }: { organizations: StrategyOrganization[] }) {
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [inventoryError, setInventoryError] = useState(false)
  const [organizationId, setOrganizationId] = useState('')
  const [scope, setScope] = useState<(AccountScope & { organizationId: string }) | null>(null)
  const [scopeError, setScopeError] = useState(false)
  const [contractId, setContractId] = useState('')
  const [flow, setFlow] = useState('strategist')
  const [availableMissions, setAvailableMissions] = useState<{ scope: string; items: Mission[] } | null>(null)
  const [missionId, setMissionId] = useState('')
  const [missionError, setMissionError] = useState(false)
  const missionScope = `${organizationId}/${contractId}`
  const inspectingSupervisor = flow === 'mission-supervisor'
  const [mode, setMode] = useState('diagnostic_48h')
  const [audience, setAudience] = useState('client_user')
  const [message, setMessage] = useState('')
  const [candidateInstruction, setCandidateInstruction] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [restoreVersion, setRestoreVersion] = useState('0')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [scopeRevision, setScopeRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<{ consumers: Consumer[] }>(endpoint, { signal: controller.signal })
      .then(data => setConsumers(data.consumers))
      .catch(() => { if (!controller.signal.aborted) setInventoryError(true) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!organizationId) return
    const controller = new AbortController()
    apiRequest<AccountScope>(`${endpoint}/scope?organizationId=${encodeURIComponent(organizationId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setScope({ organizationId, ...data }) })
      .catch(() => { if (!controller.signal.aborted) setScopeError(true) })
    return () => controller.abort()
  }, [organizationId, scopeRevision])

  useEffect(() => {
    if (!inspectingSupervisor || !organizationId) return
    const controller = new AbortController()
    const params = new URLSearchParams({ organizationId })
    if (contractId) params.set('contractId', contractId)
    apiRequest<{ missions: Mission[] }>(`${endpoint}/missions?${params}`, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setAvailableMissions({ scope: missionScope, items: data.missions })
      })
      .catch(() => { if (!controller.signal.aborted) setMissionError(true) })
    return () => controller.abort()
  }, [inspectingSupervisor, organizationId, contractId, missionScope])

  async function simulate(event: FormEvent) {
    event.preventDefault()
    setRunning(true)
    setError('')
    setPreview(null)
    try {
      setPreview(await apiRequest<Preview>(`${endpoint}/preview`, {
        method: 'POST',
        body: {
          flow, organizationId, contractId: contractId || undefined,
          ...(inspectingSupervisor ? { missionId } : { message: message.trim() }),
          ...(flow === 'strategist' ? { mode, candidateInstruction: candidateInstruction.trim() || undefined } : {}),
          ...(flow === 'mission-intake' ? { audience } : {}),
        },
      }))
    } catch {
      setError('Não foi possível montar a prévia. Confira a conta, o contrato e a configuração dos modelos.')
    } finally {
      setRunning(false)
    }
  }

  async function updateVersion(operation: 'publish' | 'restore') {
    setSaving(true)
    setFeedback('')
    try {
      const version = await apiRequest<Version>(`${endpoint}/versions`, {
        method: 'POST',
        body: {
          operation, organizationId, reason: reason.trim(), expectedVersion: scope?.versions[0]?.version ?? 0,
          ...(operation === 'publish'
            ? { instruction: candidateInstruction.trim(), mode, message: message.trim(), contractId: contractId || undefined }
            : { restoreVersion: Number(restoreVersion) }),
        },
      })
      setScope(current => current && ({ ...current, versions: [version, ...current.versions] }))
      setReason('')
      setPreview(null)
      setFeedback(`Versão ${version.version} registrada para esta subconta.`)
    } catch {
      setFeedback('A versão não foi registrada. Confira os dados ou tente novamente após recarregar as versões.')
      setScopeRevision(value => value + 1)
    } finally {
      setSaving(false)
    }
  }

  async function changeCatalog(templateId: string, approved: boolean) {
    setSaving(true)
    setFeedback('')
    try {
      await apiRequest(`${endpoint}/catalog`, { method: 'PUT', body: { organizationId, templateId, approved } })
      setScope(current => current && ({
        ...current,
        catalog: current.catalog.map(item => item.id === templateId ? { ...item, approved } : item),
      }))
      setPreview(null)
      setFeedback(approved ? 'Oferta aprovada para o estrategista.' : 'Oferta retirada do catálogo do estrategista.')
    } catch {
      setFeedback('Não foi possível atualizar a oferta. Verifique se já existe um modelo aprovado para esse pacote.')
    } finally {
      setSaving(false)
    }
  }

  const control = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2'
  const scopeReady = scope?.organizationId === organizationId
  const scopedMissions = availableMissions?.scope === missionScope ? availableMissions.items : []
  const hasPreviewInput = inspectingSupervisor ? scopedMissions.some(mission => mission.id === missionId) : Boolean(message.trim())
  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">Inventário de agentes e prompts</h2>
        {inventoryError && <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível carregar o inventário.</p>}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-gray-600">
              <tr>{['Fluxo', 'Instruções', 'Público', 'Área responsável', 'Estado'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {consumers.map(consumer => (
                <tr key={consumer.key}>
                  <th scope="row" className="p-2 font-medium">{consumer.name}</th>
                  <td className="p-2">{consumer.instructions}</td><td className="p-2">{consumer.audience}</td>
                  <td className="p-2">{consumer.owner}</td><td className="p-2">{consumer.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form onSubmit={simulate} onChange={() => setPreview(null)} className="space-y-4 rounded-lg border bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold">Prévia efetiva</h2>
          <p className="text-sm text-gray-600">{inspectingSupervisor
            ? 'Selecione uma missão para inspecionar a primeira requisição do planejador com as fontes autorizadas no momento da consulta.'
            : 'A simulação usa busca textual e respostas fictícias dos especialistas. Use uma mensagem de teste sem dados pessoais.'}</p>
        </div>
        <fieldset disabled={running || saving} className="grid gap-4 text-sm md:grid-cols-2">
          <label>Fluxo
            <select aria-label="Fluxo" value={flow} onChange={event => {
              setFlow(event.target.value)
              setMissionId('')
              setMissionError(false)
            }} className={control}>
              <option value="strategist">Estrategista YUX</option>
              <option value="mission-intake">Action Engine · conversa da missão</option>
              <option value="mission-supervisor">Action Engine · planejamento da missão</option>
            </select>
          </label>
          <label>Subconta
            <select aria-label="Subconta" required value={organizationId} onChange={event => {
              setOrganizationId(event.target.value)
              setContractId('')
              setMissionId('')
              setMissionError(false)
              setScope(null)
              setScopeError(false)
              setFeedback('')
              setRestoreVersion('0')
            }} className={control}>
              <option value="">Selecione uma subconta</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label>Contrato
            <select aria-label="Contrato" disabled={!scopeReady} value={contractId} onChange={event => {
              setContractId(event.target.value)
              setMissionId('')
              setMissionError(false)
            }} className={control}>
              <option value="">Escopo da organização</option>
              {scopeReady && scope.contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.name}</option>)}
            </select>
          </label>
          {flow === 'strategist' ? (
            <label>Tarefa
              <select aria-label="Tarefa" value={mode} onChange={event => setMode(event.target.value)} className={control}>
                <option value="diagnostic_48h">Diagnóstico 48h</option>
                <option value="proposal">Proposta consultiva</option>
                <option value="service_plan">Plano de serviços</option>
              </select>
            </label>
          ) : inspectingSupervisor ? (
            <label>Missão
              <select aria-label="Missão" value={missionId} onChange={event => setMissionId(event.target.value)} className={control} required>
                <option value="">{scopeReady && availableMissions?.scope === missionScope && !scopedMissions.length
                  ? 'Nenhuma missão neste escopo' : 'Selecione uma missão'}</option>
                {scopedMissions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}</option>)}
              </select>
            </label>
          ) : (
            <label>Público
              <select aria-label="Público" value={audience} onChange={event => setAudience(event.target.value)} className={control}>
                <option value="client_user">Usuário do portal</option>
                <option value="internal_operator">Operador interno</option>
              </select>
            </label>
          )}
          {!inspectingSupervisor && <label className="md:col-span-2">Mensagem de teste
            <textarea aria-label="Mensagem de teste" required value={message} maxLength={8_000} onChange={event => setMessage(event.target.value)} rows={3} className={control} />
          </label>}
          {flow === 'strategist' && (
            <label className="md:col-span-2">Instrução candidata da síntese (opcional)
              <textarea aria-label="Instrução candidata da síntese (opcional)" value={candidateInstruction} maxLength={4_000} onChange={event => setCandidateInstruction(event.target.value)} rows={3} className={control} />
            </label>
          )}
        </fieldset>
        {scopeError && <p role="alert" className="text-sm text-red-700">Não foi possível consultar os contratos da subconta.</p>}
        {inspectingSupervisor && missionError && <p role="alert" className="text-sm text-red-700">Não foi possível consultar as missões deste escopo.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={!scopeReady || !hasPreviewInput || running || saving} className="rounded-md bg-yux-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {running ? 'Montando prévia…' : 'Simular sem custo'}
        </button>
      </form>

      {preview && (
        <div className={`grid gap-4 ${preview.candidate ? 'lg:grid-cols-2' : ''}`}>
          <SimulationResult title={inspectingSupervisor ? "Requisição do supervisor" : "Configuração herdada"} simulation={preview.baseline} />
          {preview.candidate && <SimulationResult title="Configuração candidata" simulation={preview.candidate} />}
        </div>
      )}

      {flow === 'strategist' && scopeReady && (
        <section className="space-y-4 rounded-lg border bg-white p-5 text-sm">
          <div>
            <h2 className="text-lg font-semibold">Publicação do estrategista</h2>
            <p className="text-gray-600">
              {scope.pilotEnabled ? 'Conta habilitada para o piloto.' : 'Execução do piloto desativada para esta subconta.'}
              {' '}{scope.versions[0]?.instruction ? `Versão publicada ${scope.versions[0].version}.` : 'Configuração herdada selecionada.'}
            </p>
          </div>
          <fieldset disabled={saving || running} className="space-y-3">
            <label className="block">Justificativa
              <input value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className={control} />
            </label>
            <button type="button" disabled={!reason.trim() || !preview?.candidate || !candidateInstruction.trim()} onClick={() => updateVersion('publish')} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
              Publicar instrução para esta subconta
            </button>
            {scope.versions.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label>Versão a restaurar
                  <select aria-label="Versão a restaurar" value={restoreVersion} onChange={event => setRestoreVersion(event.target.value)} className={control}>
                    <option value="0">Configuração herdada</option>
                    {scope.versions.slice(1).map(version => <option key={version.version} value={version.version}>Versão {version.version}</option>)}
                  </select>
                </label>
                <button type="button" disabled={!reason.trim()} onClick={() => updateVersion('restore')} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">Restaurar versão</button>
              </div>
            )}
          </fieldset>
          {feedback && <p role="status">{feedback}</p>}
          {scope.versions.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Histórico de publicação</summary>
              <ul className="mt-2 space-y-2">
                {scope.versions.map(version => (
                  <li key={version.version} className="rounded-md border p-2">
                    <p>Versão {version.version} · {new Date(version.created_at).toLocaleString('pt-BR')} · {version.author_id}</p>
                    <p>{version.reason}</p>
                    {version.instruction && <p className="mt-1 whitespace-pre-wrap text-gray-600">{version.instruction}</p>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">Catálogo comercial do CRM</h3>
            {!scope.catalog.some(item => item.approved) && <p className="text-amber-800">Esta subconta não tem oferta aprovada para o estrategista.</p>}
            {scope.catalog.map(item => (
              <label key={item.id} className="flex items-center gap-2">
                <input type="checkbox" checked={item.approved} disabled={saving || running} onChange={event => changeCatalog(item.id, event.target.checked)} />
                {item.label}
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SimulationResult({ title, simulation }: { title: string; simulation: Simulation }) {
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-white p-5">
      <h3 className="font-semibold">{title}</h3>
      {simulation.blockedReason && <p role="status" className="text-sm text-amber-800">O orçamento de planejamento impede a requisição neste cenário.</p>}
      {simulation.requests.map(stage => (
        <details key={stage.stage} className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-semibold">{stage.stage} · {stage.request.model}</summary>
          <div className="mt-3 space-y-3 text-sm">
            <p>Perfil {stage.profile} · rota {stage.route} · versão global {stage.versions.global} · perfil {stage.versions.profile}</p>
            <p>Saída de até {stage.request.max_tokens} tokens · contingência {stage.attempts?.slice(1).map(item => item.modelName).join(', ') || stage.request.fallback_models?.join(', ') || 'indisponível'}</p>
            <p className="break-all text-xs text-gray-600">Impressão digital {stage.providerFingerprint || stage.fingerprint}</p>
            {stage.selectedPacks?.length ? <p>Pacotes selecionados {stage.selectedPacks.join(', ')}</p> : null}
            <p>Ferramentas da política {stage.policyTools.join(', ') || 'nenhuma'}</p>
            {stage.coverage?.includesOperationalContext && (
              <div className="space-y-1">
                {stage.coverage.companyStrategy?.selected === 0 && <p className="text-amber-800">Nenhuma estratégia publicada selecionada.</p>}
                {stage.coverage.portfolio?.contractRequired
                  ? <p className="text-amber-800">Selecione o contrato para consultar o portfólio.</p>
                  : stage.coverage.portfolio?.selected === 0 && <p className="text-amber-800">Nenhum produto ativo localizado no contrato.</p>}
              </div>
            )}
            <h4 className="font-medium">Fontes recuperadas</h4>
            {stage.sources.length ? (
              <ul className="space-y-1 break-all text-xs text-gray-600">
                {stage.sources.map((source, index) => <li key={`${source.id}-${index}`}>{source.kind} · {source.id}{source.version && ` · ${source.version}`}</li>)}
              </ul>
            ) : <p className="text-gray-600">Nenhuma fonte recuperada neste cenário.</p>}
            {stage.request.messages.map((message, index) => (
              <div key={index}>
                <h4 className="font-medium">{message.role === 'system' ? 'Instruções de sistema' : 'Entrada e contexto'} · {message.content.length.toLocaleString('pt-BR')} caracteres</h4>
                <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs">{message.content}</pre>
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  )
}
