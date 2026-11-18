import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '@/lib/apiClient'
import type { StrategyOrganization } from '@/types/strategyEngine'
import { PlanningUsageHistory } from './PlanningUsageHistory'
import { MissionTurnUsageHistory } from './MissionTurnUsageHistory'

type Consumer = { key: string; name: string; owner: string; audience: string; state: string; instructions: string }
type Contract = { id: string; name: string }
type Mission = { id: string; title: string }
const sourceLabels = {
  methodology: 'Metodologia publicada',
  company_strategy: 'Estratégia publicada da subconta',
  company_documents: 'Documentos da empresa',
  portfolio: 'Portfólio de produtos',
}
type Source = keyof typeof sourceLabels
type SourceUse = 'optional' | 'required' | 'forbidden'
type SourceRules = Record<Source, SourceUse>
const sources = Object.keys(sourceLabels) as Source[]
const useLabels = { optional: 'Opcional', required: 'Obrigatória', forbidden: 'Vedada' }
const inheritedSourceRules: SourceRules = {
  methodology: 'optional', company_strategy: 'optional', company_documents: 'optional', portfolio: 'optional',
}
type StagePreview = {
  stage: string
  profile: string
  route: string
  fingerprint: string
  providerFingerprint?: string
  providerPayload?: { model?: string; max_completion_tokens?: number }
  attempts?: Array<{ provider: string; modelName: string }>
  versions: { global: number; profile: number; organization?: number | null }
  stageInstructionApplied?: boolean
  editable?: boolean
  request: {
    model: string
    fallback_models?: string[] | null
    max_tokens: number
    messages: Array<{ role: string; content: string }>
  }
  coverage?: {
    companyStrategy?: { selected: number; omittedSections?: number; truncatedSections?: number } | null
    portfolio?: { selected: number; contractRequired?: boolean; hasMore?: boolean } | null
    knowledge?: { selected: number; contractRequired?: boolean }
  }
  selectedPacks?: string[]
  conditional?: boolean
  unavailableRoute?: boolean
  policyTools: string[]
  sources: Array<{ kind: string; id: string; version?: string | number | null; scope?: 'contract' | 'organization' | 'methodology' }>
}
type Simulation = {
  requests: StagePreview[]
  blockedReason?: string
  sourcePolicy?: { rules: SourceRules; counts: Record<Source, number>; missing: Source[] }
  missingSpecialistInputs?: { workflow: string; fields: string[] }
}
type Preview = { baseline: Simulation; candidate?: Simulation; publishedVersion?: number; sourcePolicyProtected?: boolean }
type StageInstruction = { mode: string; stage: string; instruction: string }
type Version = {
  version: number; instruction?: string | null; reason: string; author_id: string; operation: string; created_at: string
  stage_instructions?: StageInstruction[]
  instructions?: Record<string, string>
  source_rules?: SourceRules | null
}
type AccountScope = {
  contracts: Contract[]
  versions: Version[]
  pilotEnabled: boolean
  pilotContractIds?: string[]
  catalog: Array<{ id: string; label: string; approved: boolean }>
}

const endpoint = '/strategy-engine/agent-prompts'
const sourceScopeLabels = { contract: 'Contrato', organization: 'Subconta', methodology: 'Metodologia' }

export function AgentPromptsPanel({ organizations }: { organizations: StrategyOrganization[] }) {
  const [consumers, setConsumers] = useState<Consumer[]>([])
  const [inventoryError, setInventoryError] = useState(false)
  const [organizationId, setOrganizationId] = useState('')
  const [scope, setScope] = useState<(AccountScope & { key: string }) | null>(null)
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
  const isStrategist = flow === 'strategist'
  const promptScope = isStrategist ? undefined : inspectingSupervisor ? 'mission-planning'
    : audience === 'internal_operator' ? 'mission-intake-internal' : 'mission-intake-client'
  const scopeKey = `${organizationId}/${promptScope ?? 'strategist'}`
  const [message, setMessage] = useState('')
  const [candidateInstruction, setCandidateInstruction] = useState('')
  const [candidateStage, setCandidateStage] = useState('')
  const [sourceDraft, setSourceDraft] = useState<SourceRules | null>(null)
  const [editableStages, setEditableStages] = useState<Array<{ stage: string; profile: string }>>([])
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
    const params = new URLSearchParams({ organizationId })
    if (promptScope) params.set('promptScope', promptScope)
    apiRequest<AccountScope>(`${endpoint}/scope?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setScope({ key: scopeKey, ...data }) })
      .catch(() => { if (!controller.signal.aborted) setScopeError(true) })
    return () => controller.abort()
  }, [organizationId, promptScope, scopeKey, scopeRevision])

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

  const scenario = {
    flow, organizationId, contractId: contractId || undefined,
    ...(inspectingSupervisor ? { missionId } : { message: message.trim() }),
    ...(isStrategist ? { mode } : flow === 'mission-intake' ? { audience } : {}),
  }

  async function simulate(event: FormEvent) {
    event.preventDefault()
    setRunning(true)
    setError('')
    setPreview(null)
    try {
      const result = await apiRequest<Preview>(`${endpoint}/preview`, {
        method: 'POST',
        body: {
          ...scenario,
          ...(sourceRulesChanged ? { candidateSourceRules: sourceDraft } : {
            candidateInstruction: candidateInstruction.trim() || undefined, candidateStage: candidateStage || undefined,
          }),
        },
      })
      setPreview(result)
      setEditableStages(result.baseline.requests.filter(stage => stage.editable !== false && !stage.unavailableRoute)
        .map(({ stage, profile }) => ({ stage, profile })))
    } catch {
      setError('Não foi possível montar a prévia. Confira a conta, o contrato e a configuração dos modelos.')
    } finally {
      setRunning(false)
    }
  }

  async function updateVersion(operation: 'publish' | 'publish_sources' | 'restore') {
    setSaving(true)
    setFeedback('')
    try {
      const version = await apiRequest<Version>(`${endpoint}/versions`, {
        method: 'POST',
        body: {
          operation, reason: reason.trim(),
          expectedVersion: operation === 'restore' ? scope?.versions[0]?.version ?? 0 : preview?.publishedVersion,
          ...(operation === 'restore' ? { organizationId, promptScope, restoreVersion: Number(restoreVersion) }
            : operation === 'publish_sources' ? { ...scenario, sourceRules: sourceDraft }
              : { ...scenario, instruction: candidateInstruction.trim(), stage: candidateStage || undefined }),
        },
      })
      setScope(current => current && ({ ...current, versions: [version, ...current.versions] }))
      setReason('')
      setSourceDraft(null)
      setPreview(null)
      setFeedback(`Versão ${version.version} registrada para esta subconta.`)
    } catch {
      setPreview(null)
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

  function clearStageEditor() {
    setCandidateStage('')
    setCandidateInstruction('')
    setEditableStages([])
    setSourceDraft(null)
    setRestoreVersion('0')
    setFeedback('')
    setScopeError(false)
  }

  const control = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2'
  const scopeReady = scope?.key === scopeKey
  const pilotEnabled = scopeReady && (contractId && scope.pilotContractIds
    ? scope.pilotContractIds.includes(contractId) : scope.pilotEnabled)
  const scopedMissions = availableMissions?.scope === missionScope ? availableMissions.items : []
  const hasPreviewInput = inspectingSupervisor ? scopedMissions.some(mission => mission.id === missionId) : Boolean(message.trim())
  const appliedCandidate = preview?.candidate?.requests.length && preview.publishedVersion !== undefined && ((!candidateStage && isStrategist) || preview.candidate.requests.some(
    stage => stage.stage === candidateStage && stage.stageInstructionApplied,
  ))
  const currentVersion = scope?.versions[0]
  const publishedRules = currentVersion?.source_rules ?? inheritedSourceRules
  const sourceRulesChanged = sourceDraft != null && sources.some(source => sourceDraft[source] !== publishedRules[source])
  const simulatedRules = preview?.candidate?.sourcePolicy?.rules
  const canPublishSourceRules = sourceRulesChanged && preview?.publishedVersion !== undefined && simulatedRules
    && sources.every(source => simulatedRules[source] === sourceDraft[source])
  const currentStageInstruction = isStrategist
    ? currentVersion?.stage_instructions?.find(entry => entry.mode === mode && entry.stage === candidateStage)?.instruction
    : currentVersion?.instructions?.[candidateStage]
  const usesPilotReference = flow === 'strategist' && candidateStage
    && !preview?.baseline.requests.some(stage => stage.versions.organization)
  const baselineTitle = inspectingSupervisor ? 'Requisições do planejamento' : usesPilotReference ? 'Referência do piloto' : 'Configuração vigente'
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Prévia efetiva</h2>
            <p className="text-sm text-gray-600">{inspectingSupervisor
              ? 'Selecione uma missão para inspecionar as requisições do planejamento com as fontes atualmente autorizadas.'
              : 'A simulação usa busca textual e respostas fictícias dos especialistas. Use uma mensagem de teste sem dados pessoais.'}</p>
          </div>
          <Link to="?tab=packs" className="text-sm font-medium text-yux-700 underline">Gerenciar vínculos da metodologia</Link>
        </div>
        <fieldset disabled={running || saving} className="grid gap-4 text-sm md:grid-cols-2">
          <label>Fluxo
            <select aria-label="Fluxo" value={flow} onChange={event => {
              setFlow(event.target.value)
              clearStageEditor()
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
              clearStageEditor()
              setContractId('')
              setMissionId('')
              setMissionError(false)
              setScope(null)
            }} className={control}>
              <option value="">Selecione uma subconta</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label>Contrato
            <select aria-label="Contrato" disabled={!scopeReady} value={contractId} onChange={event => {
              setContractId(event.target.value)
              clearStageEditor()
              setMissionId('')
              setMissionError(false)
            }} className={control}>
              <option value="">Escopo da organização</option>
              {scopeReady && scope.contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.name}</option>)}
            </select>
          </label>
          {flow === 'strategist' ? (
            <label>Tarefa
              <select aria-label="Tarefa" value={mode} onChange={event => {
                setMode(event.target.value)
                clearStageEditor()
              }} className={control}>
                <option value="diagnostic_48h">Diagnóstico 48h</option>
                <option value="proposal">Proposta consultiva</option>
                <option value="service_plan">Plano de serviços</option>
                <option value="initial_analysis">Análise inicial</option>
                <option value="general">Conversa estratégica geral</option>
                <option value="roadmap_30_60_90">Roadmap 30/60/90</option>
                <option value="do_not_do">O que não fazer agora</option>
              </select>
            </label>
          ) : inspectingSupervisor ? (
            <label>Missão
              <select aria-label="Missão" value={missionId} onChange={event => {
                setMissionId(event.target.value)
                clearStageEditor()
              }} className={control} required>
                <option value="">{scopeReady && availableMissions?.scope === missionScope && !scopedMissions.length
                  ? 'Nenhuma missão neste escopo' : 'Selecione uma missão'}</option>
                {scopedMissions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}</option>)}
              </select>
            </label>
          ) : (
            <label>Público
              <select aria-label="Público" value={audience} onChange={event => {
                setAudience(event.target.value)
                clearStageEditor()
              }} className={control}>
                <option value="client_user">Usuário do portal</option>
                <option value="internal_operator">Operador interno</option>
              </select>
            </label>
          )}
          {!inspectingSupervisor && <label className="md:col-span-2">Mensagem de teste
            <textarea aria-label="Mensagem de teste" required value={message} maxLength={8_000} onChange={event => setMessage(event.target.value)} rows={3} className={control} />
          </label>}
          <div className="md:col-span-2">
            <label>Etapa da instrução
              <select value={candidateStage} disabled={!isStrategist && !editableStages.length} onChange={event => {
                setCandidateStage(event.target.value)
                setCandidateInstruction('')
              }} className={control}>
                <option value="">{isStrategist ? 'Instrução-base da síntese de pré-venda' : 'Selecione uma etapa'}</option>
                {editableStages.map(stage => <option key={stage.stage} value={stage.stage}>{stage.stage} · {stage.profile}</option>)}
              </select>
            </label>
            {!editableStages.length && !preview && <p className="mt-1 text-gray-600">Simule o cenário para listar as etapas editáveis.</p>}
          </div>
          {(isStrategist || candidateStage) && <label className="md:col-span-2">Instrução candidata (opcional)
            <textarea value={candidateInstruction} maxLength={4_000} onChange={event => setCandidateInstruction(event.target.value)} rows={3} className={control} />
          </label>}
          {candidateStage && (
            <p className="md:col-span-2 whitespace-pre-wrap text-gray-600">
              {currentStageInstruction ? `Ajuste vigente desta etapa: ${currentStageInstruction}` : 'Esta etapa usa as instruções herdadas.'}
              {' '}{isStrategist ? 'A publicação vale para esta etapa da tarefa selecionada.'
                : inspectingSupervisor ? 'A missão serve de cenário. A publicação vale para esta etapa no planejamento da subconta.'
                  : 'A publicação vale para este público nas conversas de missão da subconta.'}
            </p>
          )}
        </fieldset>
        {scopeReady && (
          <fieldset disabled={running || saving || preview?.sourcePolicyProtected} className="space-y-2 border-t pt-4 text-sm">
            <legend className="mb-1 px-1 font-medium">Regras de fontes deste fluxo</legend>
            <p className="text-gray-600">Uma fonte obrigatória precisa estar disponível no cenário. Uma fonte vedada fica fora do contexto enviado ao agente.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {sources.map(source => (
                <label key={source}>{sourceLabels[source]}
                  <select value={(sourceDraft ?? publishedRules)[source]} className={control}
                    onChange={event => setSourceDraft({ ...(sourceDraft ?? publishedRules), [source]: event.target.value as SourceUse })}>
                    {Object.entries(useLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {preview?.sourcePolicyProtected && <p role="status">As regras de fontes do Radar são protegidas neste cenário.</p>}
          </fieldset>
        )}
        {scopeError && <p role="alert" className="text-sm text-red-700">Não foi possível consultar os contratos da subconta.</p>}
        {inspectingSupervisor && missionError && <p role="alert" className="text-sm text-red-700">Não foi possível consultar as missões deste escopo.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={!scopeReady || !hasPreviewInput || running || saving} className="rounded-md bg-yux-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {running ? 'Montando prévia…' : sourceRulesChanged ? 'Simular regras de fontes' : 'Simular sem custo'}
        </button>
      </form>

      {scopeReady && inspectingSupervisor && hasPreviewInput && <PlanningUsageHistory key={`${missionScope}/${missionId}`}
        organizationId={organizationId} contractId={contractId} missionId={missionId} />}
      {scopeReady && flow === 'mission-intake' && <MissionTurnUsageHistory key={`${missionScope}/${audience}`}
        organizationId={organizationId} contractId={contractId} audience={audience} />}

      {preview && (
        <div className={`grid gap-4 ${preview.candidate ? 'lg:grid-cols-2' : ''}`}>
          <SimulationResult title={baselineTitle} simulation={preview.baseline} />
          {preview.candidate && <SimulationResult title="Configuração candidata" simulation={preview.candidate} />}
        </div>
      )}

      {scopeReady && (
        <section className="space-y-4 rounded-lg border bg-white p-5 text-sm">
          <div>
            <h2 className="text-lg font-semibold">{isStrategist ? 'Publicação do estrategista'
              : inspectingSupervisor ? 'Publicação do planejamento' : 'Publicação da conversa de missão'}</h2>
            <p className="text-gray-600">
              {pilotEnabled ? 'Piloto habilitado para a seleção atual.' : 'Piloto desativado para a seleção atual.'}
              {' '}{currentVersion && (currentVersion.instruction || currentVersion.stage_instructions?.length
                || Object.keys(currentVersion.instructions ?? {}).length || currentVersion.source_rules)
                ? `Versão publicada ${currentVersion.version}.` : 'Configuração herdada selecionada.'}
            </p>
          </div>
          <fieldset disabled={saving || running} className="space-y-3">
            <label className="block">Justificativa
              <input value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} className={control} />
            </label>
            <button type="button" disabled={sourceRulesChanged || !reason.trim() || !appliedCandidate || !candidateInstruction.trim()} onClick={() => updateVersion('publish')} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
              Publicar instrução para esta subconta
            </button>
            {sourceRulesChanged && <button type="button" disabled={!reason.trim() || !canPublishSourceRules}
              onClick={() => updateVersion('publish_sources')} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
              Publicar regras de fontes
            </button>}
            {scope.versions.length > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <label>{isStrategist ? 'Versão da subconta a restaurar' : 'Versão deste fluxo a restaurar'}
                  <select value={restoreVersion} onChange={event => setRestoreVersion(event.target.value)} className={control}>
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
                    {version.source_rules && <p className="mt-1 text-gray-600">
                      {sources.map(source => `${sourceLabels[source]} · ${useLabels[version.source_rules![source]]}`).join(' | ')}
                    </p>}
                    {version.instruction && <p className="mt-1 whitespace-pre-wrap text-gray-600">{version.instruction}</p>}
                    {version.stage_instructions?.map(entry => (
                      <p key={`${entry.mode}/${entry.stage}`} className="mt-1 whitespace-pre-wrap text-gray-600">
                        <strong>{entry.mode} · {entry.stage}</strong>{' '}{entry.instruction}
                      </p>
                    ))}
                    {Object.entries(version.instructions ?? {}).map(([stage, instruction]) => (
                      <p key={stage} className="mt-1 whitespace-pre-wrap text-gray-600"><strong>{stage}</strong>{' '}{instruction}</p>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {isStrategist && <div className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">Catálogo comercial do CRM</h3>
            {!scope.catalog.some(item => item.approved) && <p className="text-amber-800">Esta subconta não tem oferta aprovada para o estrategista.</p>}
            {scope.catalog.map(item => (
              <label key={item.id} className="flex items-center gap-2">
                <input type="checkbox" checked={item.approved} disabled={saving || running} onChange={event => changeCatalog(item.id, event.target.checked)} />
                {item.label}
              </label>
            ))}
          </div>}
        </section>
      )}
    </div>
  )
}

function SimulationResult({ title, simulation }: { title: string; simulation: Simulation }) {
  const missing = simulation.missingSpecialistInputs
  const policy = simulation.sourcePolicy
  return (
    <section className="min-w-0 space-y-3 rounded-lg border bg-white p-5">
      <h3 className="font-semibold">{title}</h3>
      {policy && (
        <div className="space-y-2 text-sm">
          {policy.missing.length > 0 && <p role="status" className="text-amber-800">
            Fontes obrigatórias ausentes. A execução aguarda {policy.missing.map(source => sourceLabels[source].toLowerCase()).join(', ')}.
          </p>}
          <ul className="space-y-1 text-gray-600">
            {sources.map(source => <li key={source}>
              {sourceLabels[source]} · {useLabels[policy.rules[source]]}
              {policy.rules[source] !== 'forbidden' && ` · ${policy.counts[source]} recuperadas`}
            </li>)}
          </ul>
        </div>
      )}
      {simulation.blockedReason && <p role="status" className="text-sm text-amber-800">O orçamento de planejamento impede a requisição neste cenário.</p>}
      {missing && (
        <p role="status" className="text-sm text-amber-800">
          {missing.workflow === 'campaign_launch' ? 'Campanha' : 'Funil e nutrição'} requer {missing.fields
            .map(field => field === 'icp' ? 'perfil do cliente ideal' : 'oferta').join(' e ')}.
        </p>
      )}
      {simulation.requests.map(stage => (
        <details key={stage.stage} className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-semibold">{stage.stage} · {stage.providerPayload?.model ?? stage.request.model}</summary>
          <div className="mt-3 space-y-3 text-sm">
            {stage.conditional && <p>Esta etapa depende de um plano válido do supervisor.</p>}
            {stage.unavailableRoute && <p role="status" className="text-amber-800">Rota indisponível nesta configuração.</p>}
            <p>Perfil {stage.profile} · rota {stage.route} · versão global {stage.versions.global} · perfil {stage.versions.profile}</p>
            {stage.versions.organization && <p>Versão da subconta {stage.versions.organization}</p>}
            {stage.stageInstructionApplied && <p>Esta etapa inclui um ajuste da subconta.</p>}
            {stage.editable === false && <p>Etapa protegida neste cenário.</p>}
            <p>Saída de até {stage.providerPayload?.max_completion_tokens ?? stage.request.max_tokens} tokens · contingência {stage.attempts?.slice(1).map(item => item.modelName).join(', ') || stage.request.fallback_models?.join(', ') || 'indisponível'}</p>
            <p className="break-all text-xs text-gray-600">Impressão digital {stage.providerFingerprint || stage.fingerprint}</p>
            {stage.selectedPacks?.length ? <p>Pacotes selecionados {stage.selectedPacks.join(', ')}</p> : null}
            <p>Ferramentas da política {stage.policyTools.join(', ') || 'nenhuma'}</p>
            {stage.coverage && (
              <div className="space-y-1">
                {stage.coverage.companyStrategy?.selected === 0 && <p className="text-amber-800">Nenhuma estratégia publicada selecionada.</p>}
                {stage.coverage.portfolio?.contractRequired
                  ? <p className="text-amber-800">Selecione o contrato para consultar o portfólio.</p>
                  : stage.coverage.portfolio?.selected === 0 && <p className="text-amber-800">Nenhum produto ativo localizado no contrato.</p>}
                {stage.coverage.knowledge?.contractRequired
                  ? <p className="text-amber-800">Selecione o contrato para consultar seus documentos publicados.</p>
                  : stage.coverage.knowledge?.selected === 0 && <p className="text-gray-600">Nenhum documento da empresa recuperado neste cenário.</p>}
              </div>
            )}
            <h4 className="font-medium">Fontes recuperadas</h4>
            {stage.sources.length ? (
              <ul className="space-y-1 break-all text-xs text-gray-600">
                {stage.sources.map((source, index) => <li key={`${source.id}-${index}`}>
                  {source.scope && `${sourceScopeLabels[source.scope]} · `}{source.kind} · {source.id}{source.version && ` · ${source.version}`}
                </li>)}
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
