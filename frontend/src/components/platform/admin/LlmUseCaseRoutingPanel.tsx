import { useEffect,useRef,useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, FlaskConical, Plus, Save, Trash2 } from 'lucide-react'
import type { AdminLlmRoute, AdminLlmRouteInput, AdminLlmRouteTestResult, AdminLlmUseCaseDefinition,AdminDecisionTestInput,AdminDecisionRouteStatus,RadarDecisionRoutingConfig } from '@/services/adminPlatformService'
import type { PlatformProviderConnection } from '@/types/adminPlatform'

type Props = {
  providers: PlatformProviderConnection[]
  routes: AdminLlmRoute[]
  useCases: AdminLlmUseCaseDefinition[]
  legacyStatus?: 'available' | 'unavailable'
  onSave: (input: AdminLlmRouteInput) => Promise<AdminLlmRoute>
  onTest: (routeId: string,input?:AdminDecisionTestInput) => Promise<AdminLlmRouteTestResult>
  onDecisionStatus?:(routeId:string,task?:string)=>Promise<AdminDecisionRouteStatus>
  onApproveCalibration?:(input:Record<string,unknown>)=>Promise<unknown>
}

function isGeneral(route: AdminLlmRoute) {
  return !route.organizationId && !route.clientId && !route.contractId && !route.agentId && route.routingTier === 'default'
}
function scopeLabel(route: AdminLlmRoute) {
  return [route.routingTier, route.organizationId && `organização ${route.organizationId}`, route.clientId && `cliente ${route.clientId}`,
    route.contractId && `contrato ${route.contractId}`, route.agentId && `agente ${route.agentId}`, route.status].filter(Boolean).join(' · ')
}

export function LlmUseCaseRoutingPanel({ providers, routes, useCases, legacyStatus, onSave, onTest,onDecisionStatus,onApproveCalibration }: Props) {
  const [selectedKey, setSelectedKey] = useState('global_llm')
  const [selectedRouteId, setSelectedRouteId] = useState('auto')
  const [filter, setFilter] = useState('')
  const agentOnly = routes.filter(route => !route.agentType && route.agentId).map(route => ({ key: `agent:${route.agentId}`,
    title: `Agente ${route.agentId}`, description: 'Rota existente vinculada diretamente a um agente.', kind: 'chat' as const, group: 'Rotas por agente' }))
  const catalogue = [...new Map([...useCases, ...agentOnly].map(item => [item.key, item])).values()]
  const selected = catalogue.find(item => item.key === selectedKey) || catalogue[0]
  const matching = routes.filter(route => selected?.key.startsWith('agent:') ? route.agentId === selected.key.slice(6) && !route.agentType : route.agentType === selected?.key)
  const route = selectedRouteId === 'new' ? undefined : selectedRouteId === 'auto'
    ? matching.find(isGeneral) || (selected?.key.startsWith('agent:') ? matching[0] : undefined)
    : matching.find(item => item.id === selectedRouteId)
  const inherited = !route && selected && !selected.key.startsWith('global_')
    ? matching.find(isGeneral)
      || (['campaign_launch_specialist', 'funnel_nurture_specialist'].includes(selected.key)
        ? routes.find(item => item.agentType === 'mission_supervisor' && isGeneral(item)) : undefined)
      || (selected.kind==='decision'?routes.find(item=>item.agentType==='radar_decision_default'&&isGeneral(item)):selected.kind==='research'||selected.kind===null?undefined:routes.find(item => item.agentType === (selected.kind === 'embedding' ? 'global_embeddings' : 'global_llm') && isGeneral(item)))
    : undefined
  const groups = [...new Set(catalogue.map(item => item.group))]
  const filtered = catalogue.filter(item => `${item.title} ${item.key} ${item.group}`.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')))

  return <section className="space-y-3">
    <div>
      <h2 className="text-lg font-semibold text-gray-900">Roteamento central de modelos</h2>
      <p className="text-sm text-gray-600">Todas as funções, perfis e provedores em um só lugar. Ordem: principal → fallbacks da função → fallback global.</p>
      <p className="mt-1 text-xs text-gray-500">As configurações legadas do ambiente são exibidas quando o runtime está acessível. Salvar uma rota passa o controle ao Admin. Sem rota explícita, a função herda o global ou o legado ainda vigente.</p>
    </div>
    {legacyStatus === 'unavailable' && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Não foi possível consultar as configurações legadas do runtime. As rotas salvas continuam disponíveis; campos sem rota não confirmam qual modelo legado está ativo. Salve uma configuração explícita ou restabeleça o runtime para conferir.</p>}
    <div className="grid gap-4 xl:grid-cols-[minmax(250px,340px)_1fr]">
      <aside className="rounded-lg border bg-white p-4">
        <Input label="Buscar função ou agente" value={filter} onChange={setFilter} />
        <div className="mt-3 max-h-[680px] space-y-4 overflow-y-auto">
          {groups.map(group => <div key={group}>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">{group}</h3>
            <div className="space-y-1">{filtered.filter(item => item.group === group).map(item => {
              const configured = routes.find(route => route.agentType === item.key && isGeneral(route))
              return <button key={item.key} type="button" aria-pressed={item.key === selected?.key} onClick={() => { setSelectedKey(item.key); setSelectedRouteId('auto') }}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${item.key === selected?.key ? 'border-yux-600 bg-yux-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <span className="block font-medium text-gray-900">{item.title}</span>
                <span className="text-xs text-gray-500">{configured ? configured.origin === 'environment' ? 'Legado do ambiente' : `Configurado · ${configured.status}` : 'Sem rota geral explícita'}</span>
              </button>
            })}</div>
          </div>)}
          {!filtered.length && <p className="text-sm text-gray-500">Nenhuma função encontrada.</p>}
        </div>
      </aside>
      <div className="space-y-3">
        {selected && <>
          <Select label="Rota e escopo" value={selectedRouteId} onChange={setSelectedRouteId}>
            <option value="auto">Rota geral padrão / herança</option>
            {matching.filter(item => item.id).map(item => <option key={item.id} value={item.id}>{scopeLabel(item)}</option>)}
            {!selected.key.startsWith('global_') && <option value="new">Nova rota / exceção por cliente ou agente</option>}
          </Select>
          {inherited && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Sem configuração própria neste escopo. Rota geral disponível: {inherited.agentType} · {inherited.provider} · {inherited.modelName} · {inherited.status}. Para automações sem rota própria, o perfil escolhido na automação tem precedência sobre o global.</p>}
          <LlmRouteEditor key={`${selected.key}:${selectedRouteId}:${route?.id || 'legacy'}`}
            useCase={selected} providers={providers} route={route} onSave={onSave} onTest={onTest} onDecisionStatus={onDecisionStatus} onApproveCalibration={onApproveCalibration}/>
        </>}
      </div>
    </div>
  </section>
}

function initialForm(useCase: AdminLlmUseCaseDefinition, route?: AdminLlmRoute): AdminLlmRouteInput {
  const fallbackRoutes = [...(route?.fallbackRoutes || [])]
  if (route?.fallbackModelName && !fallbackRoutes.some(item => item.provider === route.provider && item.modelName === route.fallbackModelName)) {
    fallbackRoutes.push({ provider: route.provider, modelName: route.fallbackModelName })
  }
  return { id: route?.id,...(useCase.kind?{kind:useCase.kind,protocol:useCase.kind==='decision'?'openrouter-decisions-alpha-v1':useCase.kind==='research'?'perplexity-agent-v1':'openai-compatible-v1'}:{}),...(useCase.kind==='research'?{researchConfig:route?.researchConfig??{enabled:false,maxSteps:3,maxAttempts:1,timeoutSeconds:45}}:{}),...(useCase.kind==='decision'?{decisionConfig:route?.decisionConfig??{enabled:false,mode:'observe',maxAttempts:1,modelPolicies:{}}}:{}),agentType: route ? route.agentType : useCase.key.startsWith('agent:') ? null : useCase.key,
    organizationId: route?.organizationId || null, clientId: route?.clientId || null,
    contractId: route?.contractId || null, agentId: route?.agentId || (useCase.key.startsWith('agent:') ? useCase.key.slice(6) : null),
    routingTier: route?.routingTier || 'default', provider: route?.provider || (useCase.kind==='research'?'perplexity':'openrouter'), modelName: route?.modelName || '',
    fallbackModelName: null, fallbackRoutes, maxInputTokens: route?.maxInputTokens || 16000, maxOutputTokens: route?.maxOutputTokens || 2200,
    temperature: route?.temperature ?? 0.2, maxCostPerRun: route?.maxCostPerRun ?? 0, status: route?.status || 'active' }
}

function LlmRouteEditor({ useCase, providers, route, onSave, onTest,onDecisionStatus,onApproveCalibration }: Omit<Props, 'routes' | 'useCases'> & { useCase: AdminLlmUseCaseDefinition; route?: AdminLlmRoute }) {
  const [form, setForm] = useState(() => initialForm(useCase, route))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const [decisionStatus,setDecisionStatus]=useState<AdminDecisionRouteStatus|null>(null)
  const [testResult,setTestResult]=useState<AdminLlmRouteTestResult|null>(null)
  const [calibrationJson,setCalibrationJson]=useState('')
  const [decisionTask,setDecisionTask]=useState(useCase.key==='radar_decision_default'?'radar_initial_triage':useCase.key)
  const decisionStatusForRoute=(id:string)=>onDecisionStatus!(id,decisionTask)
  const decision=useCase.kind==='decision',research=useCase.kind==='research',unsupported=useCase.kind===null
  const config={enabled:false,mode:'observe',maxAttempts:1,modelPolicies:{},...form.decisionConfig} as RadarDecisionRoutingConfig
  const active=useRef(true)
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  const setConfig=(patch:Partial<RadarDecisionRoutingConfig>)=>{setForm(current=>({...current,decisionConfig:{enabled:false,mode:'observe',maxAttempts:1,modelPolicies:{},...current.decisionConfig,...patch}}));setDecisionStatus(null);setTestResult(null)}
  const global = useCase.key === 'global_llm' || useCase.key === 'global_embeddings'
  const providerOptions = [...new Map([{ providerKey: 'openrouter', displayName: 'OpenRouter' }, { providerKey: 'openai_direct', displayName: 'OpenAI direta' },{providerKey:'perplexity',displayName:'Perplexity'},
    ...providers.filter(item => ['openrouter', 'openai_direct','perplexity'].includes(item.providerKey))].filter(item=>research?item.providerKey==='perplexity':item.providerKey!=='perplexity'&&(!decision||item.providerKey==='openrouter')).map(item => [item.providerKey, item])).values()]
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm(useCase, route))
  const fallbacks = form.fallbackRoutes || []

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice(null)
    try {
      const saved = await onSave(form)
      setForm(initialForm(useCase, saved))
      setNotice({ ok: true, message: 'Rota salva. A configuração vale na próxima execução.' })
    } catch (error) { setNotice({ ok: false, message: error instanceof Error ? error.message : 'Não foi possível salvar a rota.' }) }
    finally { setSaving(false) }
  }
  async function testRoute() {
    if (!form.id || dirty || unsupported) return
    setTesting(true); setNotice(null)
    try {
      let input:AdminDecisionTestInput|undefined
      if(research){
        const result=await onTest(form.id);setTestResult(result);setNotice({ok:result.ok,message:result.message});return
      }else if(decision){
        if(!onDecisionStatus)throw Error('A consulta de custo da decisão não está disponível.')
        const status=await decisionStatusForRoute(form.id);setDecisionStatus(status)
        if(!active.current)return
        if(status.price.amountBrl===null)throw Error('Informe o custo estimado dos modelos e a cotação no Admin de Integrações antes do teste.')
        if(!window.confirm(`Teste sintético de decisão: estimativa de R$ ${status.price.amountBrl}, até ${status.maxAttempts} tentativa(s). Não calibra nem altera empresas. Autoriza o consumo?`))return
        input={task:status.task,confirmPaid:true,requestId:crypto.randomUUID(),expectedFingerprint:status.route.fingerprint,expectedPolicyVersion:status.policyVersion,approvedPriceBrl:status.price.amountBrl}
      }else if(!window.confirm('Este teste chama o provedor e pode consumir créditos do modelo selecionado. Deseja executar?'))return
      const result = input?await onTest(form.id,input):await onTest(form.id);setTestResult(result);setNotice({ ok: result.ok, message: result.message })
    }
    catch (error) { setNotice({ ok: false, message: error instanceof Error ? error.message : 'Não foi possível testar o modelo.' }) }
    finally { setTesting(false) }
  }
  function moveFallback(index: number, direction: number) {
    const reordered = [...fallbacks]
    ;[reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]]
    setForm({ ...form, fallbackRoutes: reordered })
  }

  return <form onSubmit={submit} className="rounded-lg border bg-white p-4">
    <h3 className="font-semibold text-gray-900">{useCase.title}</h3>
    <p className="mt-1 text-sm text-gray-600">{useCase.description}</p>
    <p className="mt-1 text-xs text-gray-500">Identificador: {form.agentType || form.agentId}</p>
    {unsupported&&<p role="status" className="mt-3 rounded-md bg-amber-50 p-3 text-sm">{useCase.kind===null?'Rota legada sem classificação. Não será executada como chat silenciosamente; revise sua função antes de editar.':'Capacidade reservada para integração futura. Não autoriza chamadas.'}</p>}
    {decision&&<p role="status" className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Protocolo alpha: /api/alpha/decisions · adaptador openrouter-decisions-alpha-v1. Sem calibração aprovada para modelo, snapshot, tarefa e contexto, o modo efetivo é observação. Trocar o modelo ou salvar uma revisão exige nova correspondência. Não herda texto ou embeddings.</p>}
    {research&&<fieldset className="mt-3 flex flex-col gap-3 rounded-md border p-3"><legend>Investigação Perplexity Agent</legend>
      <p role="status" className="text-sm text-muted-foreground">Orçamento estimado com acompanhamento. Uma chamada em andamento pode superar a estimativa; o sistema impede novas chamadas quando o orçamento é atingido. max_steps limita passos, não dinheiro. Sem fallback de chat nem troca automática de modelo pelo provedor.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.researchConfig?.allowEstimatedBudget===true} onChange={event=>setForm(current=>({...current,researchConfig:{...current.researchConfig,allowEstimatedBudget:event.target.checked,...(!event.target.checked?{enabled:false}:{})}}))}/>Aceito orçamento estimado, sem teto financeiro garantido pelo provedor</label>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={form.researchConfig?.allowEstimatedBudget!==true} checked={form.researchConfig?.enabled===true} onChange={event=>setForm(current=>({...current,researchConfig:{...current.researchConfig,enabled:event.target.checked}}))}/>Permitir investigação seletiva nesta rota</label>
      <Input label="Máximo de passos por investigação" type="number" min="1" max="10" value={String(form.researchConfig?.maxSteps??3)} onChange={value=>setForm(current=>({...current,researchConfig:{...current.researchConfig,maxSteps:Number(value)}}))}/>
      <Input label="Máximo de tentativas por investigação" type="number" min="1" max="10" value={String(form.researchConfig?.maxAttempts??1)} onChange={value=>setForm(current=>({...current,researchConfig:{...current.researchConfig,maxAttempts:Number(value)}}))}/>
      <Input label="Estimativa por tentativa de investigação (USD)" type="number" min="0.000001" step="0.000001" value={String(form.researchConfig?.estimatedUsdPerAttempt??'')} onChange={value=>setForm(current=>({...current,researchConfig:{...current.researchConfig,estimatedUsdPerAttempt:value===''?undefined:Number(value)}}))}/>
      <Input label="Orçamento estimado por investigação (USD)" type="number" min="0.000001" step="0.000001" value={String(form.researchConfig?.budgetUsdPerResearch??'')} onChange={value=>setForm(current=>({...current,researchConfig:{...current.researchConfig,budgetUsdPerResearch:value===''?undefined:Number(value)}}))}/>
      <Input label="Orçamento estimado do Agent por campanha (USD)" type="number" min="0.000001" step="0.000001" value={String(form.researchConfig?.budgetUsdPerCampaign??'')} onChange={value=>setForm(current=>({...current,researchConfig:{...current.researchConfig,budgetUsdPerCampaign:value===''?undefined:Number(value)}}))}/>
      <p className="text-xs text-muted-foreground">O orçamento do Agent é separado do orçamento de buscas da campanha. Ambos acompanham reservas, custos conhecidos e incertezas; não há reinício diário oculto do orçamento do Agent.</p>
      <p className="text-xs text-muted-foreground">A estimativa não é teto remoto. Conversão em reais usa a cotação, data e margem do Admin → Integrações → Radar; custos desconhecidos nunca são tratados como zero.</p>
    </fieldset>}
    {route?.origin === 'environment' && <p role="status" className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{route.originDetail || 'Configuração legada do ambiente. Salve para gerenciar aqui.'}</p>}
    {useCase.kind === 'embedding' && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Use apenas modelos de embeddings compatíveis com 1024 dimensões. Trocar de modelo exige reindexação para manter a cobertura da busca. Índices antigos não são apagados e modelos diferentes não são comparados no mesmo espaço vetorial. O fallback de texto não se aplica.</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <Select label="Provedor principal" value={form.provider} onChange={provider => setForm({ ...form, provider })}>{providerOptions.map(item => <option key={item.providerKey} value={item.providerKey}>{item.displayName}</option>)}</Select>
      <Input label="Modelo principal" value={form.modelName} onChange={modelName => {setForm(current=>({ ...current, modelName }));setDecisionStatus(null);setTestResult(null)}} required />
      <Select label="Status" value={form.status} onChange={status => setForm({ ...form, status: status as AdminLlmRouteInput['status'] })}><option value="active">Ativo</option><option value="paused">Pausado</option><option value="archived">Arquivado</option></Select>
      <Select label="Faixa de roteamento" value={form.routingTier} disabled={global || Boolean(form.id)} onChange={routingTier => setForm({ ...form, routingTier: routingTier as AdminLlmRouteInput['routingTier'] })}><option value="default">Padrão</option><option value="cheap">Econômico</option><option value="premium">Premium</option><option value="fallback">Reserva</option></Select>
      {!global && <>{(['organizationId', 'clientId', 'contractId', 'agentId'] as const).map((key, index) => <Input key={key} label={['Organização (ID opcional)', 'Cliente (ID opcional)', 'Contrato (ID opcional)', 'Agente (ID opcional)'][index]} value={form[key] || ''} disabled={Boolean(form.id)} onChange={value => setForm({ ...form, [key]: value.trim() || null })} />)}</>}
      <Input label="Limite de entrada" type="number" min="1" value={String(form.maxInputTokens)} onChange={value => setForm({ ...form, maxInputTokens: Number(value) })} />
      {!decision&&<><Input label="Limite de saída" type="number" min="1" value={String(form.maxOutputTokens)} onChange={value => setForm({ ...form, maxOutputTokens: Number(value) })} />
      <Input label="Temperatura" type="number" min="0" max="2" step="0.1" value={String(form.temperature)} onChange={value => setForm({ ...form, temperature: Number(value) })} />
      <Input label="Limite de custo estimado (0 = sem teto)" type="number" min="0" step="0.0001" value={String(form.maxCostPerRun)} onChange={value => setForm({ ...form, maxCostPerRun: Number(value) })} /></>}
    </div>
    {decision&&<fieldset className="mt-4 space-y-3 rounded-md border border-blue-200 p-3">
      <legend className="px-1 text-sm font-semibold">Decisões do Radar</legend>
      {useCase.key==='radar_decision_default'&&<Select label="Etapa para conferir, testar e calibrar" value={decisionTask} onChange={task=>{setDecisionTask(task);setDecisionStatus(null);setTestResult(null)}}><option value="radar_initial_triage">Triagem inicial</option><option value="radar_next_action">Próxima ação</option><option value="radar_quality_gate">Qualidade final</option></Select>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={event=>setConfig({enabled:event.target.checked})}/>Autorizar uso desta rota no Radar (pode consumir créditos)</label>
      <div className="grid gap-3 md:grid-cols-2"><Select label="Modo solicitado" value={config.mode} onChange={mode=>setConfig({mode:mode as RadarDecisionRoutingConfig['mode']})}><option value="observe">Observação</option><option value="route">Selecionar ações calibradas</option><option value="auto_exclude">Seleção e exclusão reversível calibrada</option></Select>
      <Input label="Máximo de tentativas por decisão" type="number" min="1" max="10" value={String(config.maxAttempts)} onChange={value=>setConfig({maxAttempts:Number(value)})}/></div>
      <div className="grid gap-3 md:grid-cols-2"><Input label="Tempo por tentativa (segundos)" type="number" min="1" max="45" value={String(config.timeoutSeconds??15)} onChange={value=>setConfig({timeoutSeconds:Number(value)})}/><Input label="Tempo total por decisão (segundos)" type="number" min="1" max="120" value={String(config.deadlineSeconds??45)} onChange={value=>setConfig({deadlineSeconds:Number(value)})}/></div>
      <p className="text-xs text-gray-600">O teto de fallbacks e de decisões por empresa continua editável em Admin → Integrações → Radar. Contexto somente textual; até 24.000 bytes por requisição e 16.000 bytes de estado. Valores abaixo podem ser reduzidos por modelo. O limite de entrada também é aplicado conservadoramente em bytes.</p>
      {[...new Set([form.modelName,...fallbacks.map(item=>item.modelName),...(decisionStatus?.route.attempts.map(item=>item.modelName)??[])].filter(Boolean))].map(model=>{
        const modelPolicy=config.modelPolicies[model]??{}
        const update=(patch:typeof modelPolicy)=>setConfig({modelPolicies:{...config.modelPolicies,[model]:{...modelPolicy,...patch}}})
        return <div key={model} className="space-y-2 rounded-md border bg-gray-50 p-3"><p className="break-all text-sm font-medium">{model}</p><div className="grid gap-3 md:grid-cols-2">
          <Input label={`Custo estimado por tentativa (USD) — ${model}`} type="number" min="0" step="0.000001" value={modelPolicy.estimatedUsdPerAttempt===undefined?'':String(modelPolicy.estimatedUsdPerAttempt)} onChange={value=>update({estimatedUsdPerAttempt:value===''?undefined:Number(value)})}/>
          <Input label={`Referência do preço — ${model}`} value={modelPolicy.priceReference??''} onChange={priceReference=>update({priceReference})}/>
          {(['requestBytes','stateBytes','evidenceCount','excerptBytes'] as const).map((field,index)=><Input key={field} label={`${['Requisição (bytes)','Estado (bytes)','Máximo de trechos','Bytes por trecho'][index]} — ${model}`} type="number" min={String([1000,500,1,200][index])} max={String([24000,16000,6,1500][index])} value={String(modelPolicy[field]??[24000,16000,6,1500][index])} onChange={value=>update({[field]:Number(value)})}/>)}</div></div>
      })}
      <button type="button" disabled={!form.id||dirty||testing||saving||!onDecisionStatus} onClick={async()=>{try{setDecisionStatus(await decisionStatusForRoute(form.id!));setNotice(null)}catch(error){setNotice({ok:false,message:error instanceof Error?error.message:'Não foi possível consultar a configuração.'})}}} className="rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-50">Conferir cadeia, calibração e estimativa (sem chamada paga)</button>
      {decisionStatus&&<div role="status" className="space-y-1 text-sm"><p>Estimativa do teste em reais: {decisionStatus.price.amountBrl===null?'Pendente de preço ou cotação':`R$ ${decisionStatus.price.amountBrl}`} · até {decisionStatus.maxAttempts} tentativa(s)</p><p className="break-all">Cadeia: {decisionStatus.route.attempts.map(item=>item.modelName).join(' → ')}</p><p>Calibrações desta revisão: {decisionStatus.calibrations.length}. A correspondência exata do snapshot é conferida em cada resposta.</p>{decisionStatus.calibrations.map((item,index)=><p key={index} className="break-all">{item.requestedModel} · {item.resolvedModelSnapshot} · {item.task} · {item.datasetVersion} · {item.metric}: {JSON.stringify(item.thresholds)}</p>)}</div>}
      {testResult?.kind==='decision'&&<div role="status" className="rounded border bg-white p-3 text-sm"><p>Opção: {testResult.selectedOption??'Sem decisão'} · Contrato: {testResult.contractValid?'Válido':'Não validado'}</p><p className="break-all">Modelo efetivo: {testResult.resolvedModel??'Não identificado'}</p><p>Tempo: {testResult.latencyMs} ms · Tentativas: {testResult.attempts?.length??0} · Custo informado: {testResult.usage?.costUsd===null?'Não informado':`USD ${testResult.usage?.costUsd}`}</p></div>}
      {onApproveCalibration&&<details><summary className="cursor-pointer text-sm">Aprovar calibração após benchmark humano</summary><p className="my-2 text-xs text-gray-600">Informe o registro validado conforme o runbook: modelo e snapshot exatos, tarefa, versões, dataset, métrica, limiares, revisores e referência do benchmark. Um teste sintético não é calibração. A aprovação não ativa a rota nem altera o modo solicitado.</p><label className="block text-sm">Registro de calibração (JSON)<textarea className="mt-1 min-h-36 w-full rounded-md border p-2 font-mono text-xs" value={calibrationJson} onChange={event=>setCalibrationJson(event.target.value)}/></label><button type="button" className="mt-2 rounded border px-3 py-2 text-sm" disabled={!decisionStatus||!calibrationJson||dirty} onClick={async()=>{try{const record=JSON.parse(calibrationJson);if(!window.confirm('Confirma que os resultados e revisores do benchmark foram conferidos?'))return;await onApproveCalibration({...record,routeId:form.id,routeFingerprint:decisionStatus!.route.fingerprint,confirmApproval:true});setDecisionStatus(await decisionStatusForRoute(form.id!));setNotice({ok:true,message:'Calibração aprovada para esta revisão; o snapshot ainda deve corresponder.'})}catch(error){setNotice({ok:false,message:error instanceof Error?error.message:'Registro inválido.'})}}}>Aprovar calibração</button></details>}
    </fieldset>}
    <fieldset className="mt-4 space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-semibold">Fallbacks manuais, em ordem</legend>
      {fallbacks.map((fallback, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <Select label={`Provedor do fallback ${index + 1}`} value={fallback.provider} onChange={provider => setForm({ ...form, fallbackRoutes: fallbacks.map((item, position) => position === index ? { ...item, provider } : item) })}>{providerOptions.map(item => <option key={item.providerKey} value={item.providerKey}>{item.displayName}</option>)}</Select>
        <Input label={`Modelo do fallback ${index + 1}`} value={fallback.modelName} required onChange={modelName => setForm({ ...form, fallbackRoutes: fallbacks.map((item, position) => position === index ? { ...item, modelName } : item) })} />
        <div className="flex items-end gap-1 pb-1">
          <button type="button" aria-label={`Subir fallback ${index + 1}`} disabled={index === 0} onClick={() => moveFallback(index, -1)} className="rounded border p-2 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label={`Descer fallback ${index + 1}`} disabled={index === fallbacks.length - 1} onClick={() => moveFallback(index, 1)} className="rounded border p-2 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" aria-label={`Remover fallback ${index + 1}`} onClick={() => setForm({ ...form, fallbackRoutes: fallbacks.filter((_, position) => position !== index) })} className="rounded border p-2"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>)}
      {!fallbacks.length && <p className="text-sm text-gray-500">Nenhum fallback próprio. Após a falha do principal, será utilizada a reserva global compatível, se configurada.</p>}
      <button type="button" disabled={fallbacks.length >= 10} onClick={() => setForm({ ...form, fallbackRoutes: [...fallbacks, { provider: form.provider, modelName: '' }] })} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"><Plus className="h-4 w-4" />Adicionar fallback</button>
    </fieldset>
    <p className="mt-3 text-xs text-gray-500">{decision?'A operação comercial exige rota ativa e decisões habilitadas. Salvar não faz chamada; o teste exige confirmação separada.':'Salvar uma rota ativa autoriza o sistema a usar os modelos informados.'} Rotas pausadas não autorizam chamadas. Chaves de API permanecem no servidor.</p>
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={testRoute} disabled={!form.id || dirty || form.status !== 'active' || testing || saving} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><FlaskConical className="h-4 w-4" />{testing ? 'Conferindo...' : research?'Conferir configuração (sem consumo)':'Testar modelo (pode consumir créditos)'}</button>
      <button type="submit" disabled={unsupported || saving || testing || !form.modelName.trim() || fallbacks.some(item => !item.modelName.trim())} className="inline-flex items-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar rota'}</button>
    </div>
    {notice && <div role="status" className={`mt-3 rounded-md border p-3 text-sm ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.message}</div>}
  </form>
}

function Input({ label, value, onChange, type = 'text', step, min, max, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; step?: string; min?: string; max?: string; required?: boolean; disabled?: boolean }) {
  return <label className="block space-y-1 text-sm"><span className="font-medium text-gray-700">{label}</span><input type={type} step={step} min={min} max={max} value={value} required={required} disabled={disabled} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 disabled:bg-gray-50" /></label>
}
function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; disabled?: boolean }) {
  return <label className="block space-y-1 text-sm"><span className="font-medium text-gray-700">{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-50">{children}</select></label>
}
