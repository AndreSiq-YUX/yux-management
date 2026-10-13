import { useEffect,useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultRadarSearchConfiguration, defaultRadarSizePolicy, validateRadarSizePolicy, parseRadarCities, radarBrazilStates, radarExportLabels, splitRadarTerms,
  type RadarExportField, type RadarSearchConfiguration } from '@/lib/radar/radarSearchConfiguration'
import type { RadarCampaignInput } from '@/services/radarService'
import type { RadarCampaign } from '@/types/radar'
import { RadarSizeConfiguration } from './RadarSizeConfiguration'
import {radarService} from '@/services/radarService'
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select'

type Props = { organizationId: string; initialCampaign?: RadarCampaign; busy: boolean;canUseCrm?:boolean;readOnly?:boolean;
  onSubmit: (input: RadarCampaignInput) => Promise<void>; onCancel: () => void }
const selectClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">{label}</span>{children}</label>
}

export function RadarCampaignConfigurationForm({ organizationId, initialCampaign, busy,canUseCrm=false,readOnly=false, onSubmit, onCancel }: Props) {
  const local=!!initialCampaign&&initialCampaign.campaignType!=='regional_b2b'
  const [destinations,setDestinations]=useState<Awaited<ReturnType<typeof radarService.getCrmDestinations>>>([])
  const [destinationError,setDestinationError]=useState(false)
  useEffect(()=>{if(!canUseCrm)return;let active=true;radarService.getCrmDestinations(organizationId).then(value=>{if(active)setDestinations(value)}).catch(()=>{if(active)setDestinationError(true)});return()=>{active=false}},[organizationId,canUseCrm])
  const [config, setConfig] = useState<RadarSearchConfiguration>(() => initialCampaign?.searchConfiguration ?? defaultRadarSearchConfiguration())
  const [name, setName] = useState(initialCampaign?.name ?? '')
  const [segment, setSegment] = useState(initialCampaign?.targetSegment ?? '')
  const [states, setStates] = useState<string[]>(local?[initialCampaign.targetState]:initialCampaign?.targetStates ?? [])
  const [cities, setCities] = useState(() => local?`${initialCampaign.targetCity}/${initialCampaign.targetState}`:(initialCampaign?.searchConfiguration?.cities ?? []).map(item => `${item.city}/${item.state}`).join('\n'))
  const [geographicScope, setGeographicScope] = useState<'states' | 'cities'>(() =>
    local||initialCampaign?.searchConfiguration?.cities.length ? 'cities' : 'states')
  const [keywords, setKeywords] = useState(initialCampaign?.targetKeywords.join(', ') ?? '')
  const [cnaes, setCnaes] = useState(initialCampaign?.targetCnaes.join(', ') ?? '')
  const [products, setProducts] = useState(initialCampaign?.productFocus.join(', ') ?? '')
  const [excludedNames, setExcludedNames] = useState(initialCampaign?.searchConfiguration?.excludedNameTerms.join(', ') ?? '')
  const [offer, setOffer] = useState(initialCampaign?.offerType ?? '')
  const [dailyLimit, setDailyLimit] = useState(initialCampaign?.dailyLimit ?? 10)
  const [budget, setBudget] = useState(initialCampaign?.budgetLimit?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const rules = config.qualification
  const research = config.research ?? defaultRadarSearchConfiguration().research!
  const changeResearch = (patch: Partial<typeof research>) => setConfig(current => ({ ...current, research: { ...defaultRadarSearchConfiguration().research!,...current.research, ...patch } }))
  const changeRules = (patch: Partial<typeof rules>) => setConfig(current => ({ ...current, qualification: { ...current.qualification, ...patch } }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if(readOnly)return
    setError(null)
    try {
      if (!states.length) throw new Error('Selecione pelo menos uma UF.')
      if(research.sizeAssessment)validateRadarSizePolicy(research.sizeAssessment)
      if (geographicScope === 'cities' && !cities.trim()) throw new Error('Informe pelo menos uma cidade ou escolha Estados inteiros.')
      if (!config.exportFields.length) throw new Error('Selecione pelo menos um campo de entrega.')
      const codes = splitRadarTerms(cnaes).map(value => value.replace(/\D/g, ''))
      if (codes.some(value => value.length !== 7)) throw new Error('Cada CNAE deve ter sete dígitos.')
      if (rules.requireCnaeMatch && !codes.length) throw new Error('Informe os CNAEs para exigir correspondência.')
      if (!config.registrationStatusIds.length) throw new Error('Selecione uma situação cadastral.')
      if (!config.braveQueryTemplate.includes('{name}')) throw new Error('A consulta personalizada precisa conter {name}.')
      if (config.openingFrom && config.openingTo && config.openingFrom > config.openingTo) throw new Error('Revise o intervalo de abertura.')
      const parsedCities=geographicScope==='states'?[]:parseRadarCities(cities,states)
      if(local&&parsedCities.length!==1)throw new Error('Esta campanha local deve manter uma cidade. Crie uma campanha regional para pesquisar múltiplas regiões.')
      await onSubmit({ organizationId, name, campaignType: initialCampaign?.campaignType??'regional_b2b', targetSegment: segment,
        ...(local?{targetCity:parsedCities[0].city,targetState:parsedCities[0].state}:{}),
        targetStates: local?initialCampaign.targetStates:states, targetKeywords: splitRadarTerms(keywords), targetCnaes: codes,
        productFocus: splitRadarTerms(products), offerType: offer, dailyLimit,
        budgetLimit: budget === '' ? undefined : Number(budget),
        searchConfiguration: { ...config, cities: parsedCities, excludedNameTerms: splitRadarTerms(excludedNames),
          qualification: { ...rules, includeAnyTerms: splitRadarTerms(rules.includeAnyTerms.join('\n')),
            includeAllTerms: splitRadarTerms(rules.includeAllTerms.join('\n')), excludeTerms: splitRadarTerms(rules.excludeTerms.join('\n')),
            productTerms: splitRadarTerms(rules.productTerms.join('\n')) } } })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a configuração.') }
  }

  return <form onSubmit={submit} className="mt-4 space-y-5" aria-label="Configuração da pesquisa">
    <p className="text-sm text-slate-600">Os critérios pertencem a esta campanha. Nenhum segmento, cidade ou produto é imposto pelo sistema. Salvar não executa consultas.</p>
    {readOnly&&<p className="text-sm text-slate-600">Configuração disponível para consulta. Alterações são feitas pelo responsável autorizado pela campanha.</p>}
    <fieldset disabled={busy||readOnly} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome da pesquisa"><Input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Segmento ou público desejado"><Input required maxLength={160} value={segment} onChange={e => setSegment(e.target.value)} /></Field>
        <Field label="Oferta ou objetivo comercial"><Input required maxLength={160} value={offer} onChange={e => setOffer(e.target.value)} /></Field>
        <Field label="Produtos e serviços de interesse (separados por vírgula)"><Input value={products} onChange={e => setProducts(e.target.value)} /></Field>
      </div>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Regiões da pesquisa</legend>
        <div className="mb-3"><Field label="Abrangência geográfica"><select className={selectClass} value={geographicScope} disabled={local}
          onChange={e => setGeographicScope(e.target.value as typeof geographicScope)}>
          <option value="states">Estados inteiros — um ou mais</option><option value="cities">Cidades específicas — uma ou mais</option>
        </select></Field></div>
        <p className="mb-2 text-xs text-slate-500">Selecione as UFs que deseja pesquisar.</p>
        <div className="flex flex-wrap gap-3">{radarBrazilStates.map(state => <label key={state} className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={states.includes(state)} onChange={e => setStates(current => e.target.checked ? [...current, state] : current.filter(item => item !== state))} />{state}</label>)}</div>
        {geographicScope === 'cities' ? <div className="mt-3"><Field label="Cidades — uma Cidade/UF por linha">
          <textarea className="w-full rounded-md border p-2" rows={3} required value={cities} onChange={e => setCities(e.target.value)} />
        </Field><p className="text-xs text-slate-500">Pesquisa somente nas cidades listadas, dentro das UFs selecionadas.</p></div>
          : <p className="mt-3 text-xs text-slate-500">Pesquisa em todo o território das UFs selecionadas. Não é necessário informar cidade. Os lotes respeitam os limites configurados; um lote não cobre automaticamente todo o estado.</p>}
      </fieldset>
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Filtros avançados do público e do cadastro empresarial</summary>
      <fieldset className="mt-3"><legend className="px-1 text-sm font-semibold">Filtros empresariais</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Termos nos nomes (vírgula separa alternativas)"><Input value={keywords} onChange={e => setKeywords(e.target.value)} /></Field>
          <Field label="Excluir nomes contendo (separados por vírgula)"><Input value={excludedNames} onChange={e => setExcludedNames(e.target.value)} /></Field>
          <Field label="CNAEs opcionais, separados por vírgula"><Input value={cnaes} onChange={e => setCnaes(e.target.value)} /></Field>
          <Field label="Onde procurar CNAEs"><select className={selectClass} value={config.activityScope} onChange={e => setConfig(current => ({ ...current, activityScope: e.target.value as typeof current.activityScope }))}>
            <option value="main_or_secondary">Principal ou secundário</option><option value="main">Somente principal</option></select></Field>
          <Field label="Abertura a partir de"><Input type="date" value={config.openingFrom ?? ''} onChange={e => setConfig(current => ({ ...current, openingFrom: e.target.value || undefined }))} /></Field>
          <Field label="Abertura até"><Input type="date" value={config.openingTo ?? ''} onChange={e => setConfig(current => ({ ...current, openingTo: e.target.value || undefined }))} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-3" aria-label="Situações cadastrais">{[[1,'Nula'],[2,'Ativa'],[3,'Suspensa'],[4,'Inapta'],[8,'Baixada']].map(([id,label]) => <label key={id} className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={config.registrationStatusIds.includes(Number(id))} onChange={e => setConfig(current => ({ ...current,
            registrationStatusIds: e.target.checked ? [...current.registrationStatusIds, Number(id)] : current.registrationStatusIds.filter(value => value !== Number(id)) }))} />{label}</label>)}</div>
      </fieldset>
      </details>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Presença pública e dados desejados</legend>
        <p className="mb-2 text-xs text-slate-500">Complemente o cadastro empresarial com presença na internet e informações dos sites públicos. A pesquisa respeita os serviços e limites liberados pelo responsável.</p>
        <div className="flex flex-wrap gap-4">{(['enrichWithBrave','inspectWebsite'] as const).map(key => <label key={key} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={config.sources[key]}
          onChange={e => setConfig(current => ({ ...current, sources: { ...current.sources, [key]: e.target.checked } }))} />{key === 'enrichWithBrave' ? 'Descobrir presença pública e contatos locais' : 'Consultar site público'}</label>)}</div>
        <details className="mt-3"><summary className="cursor-pointer text-sm">Personalizar os termos da pesquisa</summary><Field label="Consulta de presença pública"><Input value={config.braveQueryTemplate} maxLength={160} required onChange={e => setConfig(current => ({ ...current, braveQueryTemplate: e.target.value }))} /></Field>
          <p className="text-xs text-slate-500">Use {'{name}'} para o nome da empresa; opcionalmente {'{segment}'} e {'{terms}'}. Cidade e UF são enviadas separadamente.</p></details>
      </fieldset>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Aprofundamento automático dos candidatos</legend>
        <p className="mb-3 text-xs text-slate-500">Descobre presença pública e contatos sem exigir URL manual. Salvar não consulta provedores. Fontes, custos e modelo são liberados separadamente no Admin.</p>
        <div className="space-y-2">{(['enabled','webSearchEnabled','semanticQualificationEnabled'] as const).map((key, index) => <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={research[key]} onChange={e => changeResearch({ [key]: e.target.checked })} />{['Permitir pesquisa automática nesta campanha','Aprofundar a busca na internet','Analisar adequação ao objetivo comercial'][index]}</label>)}</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{([['maxSearchQueriesPerCandidate','Consultas totais por empresa',5],['maxPagesPerCandidate','Páginas públicas por empresa',10],['freshnessDays','Validade da pesquisa (dias)',30]] as const).map(([key,label,max]) => <Field key={key} label={label}>
          <Input type="number" min={1} max={max} required value={research[key]} onChange={e => changeResearch({ [key]: Number(e.target.value) })} /></Field>)}</div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={research.profileEnabled??false} onChange={e=>changeResearch({profileEnabled:e.target.checked})}/>Gerar perfil aprofundado da empresa (incluído na análise por IA)</label>
        <div className="mt-3"><Field label="Finalidade do contato desejado"><select className={selectClass} value={research.contactPurpose??'general'} onChange={e=>changeResearch({contactPurpose:e.target.value as typeof research.contactPurpose})}>
          <option value="general">Contato geral</option><option value="suppliers">Oferecer produtos ou serviços — fornecedores/compras</option><option value="sales">Comprar da empresa — comercial/vendas</option><option value="finance">Financeiro/fiscal</option><option value="recruitment">Recrutamento</option>
        </select></Field></div>
      </fieldset>
      <RadarSizeConfiguration value={research.sizeAssessment??defaultRadarSizePolicy()} onChange={value=>changeResearch({sizeAssessment:value})}/>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Critérios de qualificação</legend>
        <p className="mb-3 text-xs text-slate-500">Expressões literais verificadas no site identificado da empresa, ignorando acentos. São critérios objetivos; a análise contextual por IA é configurada separadamente. Sem critérios positivos, a empresa vai para revisão manual.</p>
        <div className="grid gap-3 md:grid-cols-2">{([
          ['includeAnyTerms','Encontrar pelo menos uma destas expressões'], ['includeAllTerms','Exigir todas estas expressões'],
          ['excludeTerms','Excluir se encontrar qualquer destas expressões'], ['productTerms','Expressões que sinalizam aderência à oferta'],
        ] as const).map(([key,label]) => <Field key={key} label={`${label} (uma por linha)`}>
          <textarea className="w-full rounded-md border p-2" rows={3} value={rules[key].join('\n')} onChange={e => changeRules({ [key]: e.target.value.split('\n') })} />
        </Field>)}
          <Field label="Se não houver site verificado"><select className={selectClass} value={rules.missingWebsite} onChange={e => changeRules({ missingWebsite: e.target.value as typeof rules.missingWebsite })}><option value="review">Revisão manual</option><option value="insufficient">Evidência insuficiente</option></select></Field>
          <Field label="Correspondência dos termos da oferta"><select className={selectClass} value={rules.productMatch} onChange={e => changeRules({ productMatch: e.target.value as typeof rules.productMatch })}><option value="any">Pelo menos um</option><option value="all">Todos</option></select></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={rules.requireCnaeMatch} onChange={e => changeRules({ requireCnaeMatch: e.target.checked })} />Exigir correspondência com os CNAEs informados para confirmar o público</label>
      </fieldset>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Limites e controle de custo</legend>
        <div className="grid gap-3 md:grid-cols-3">{([
          ['pageSize','Empresas por página de descoberta',10], ['maxPagesPerScope','Páginas por região no lote',10],
          ['maxQueriesPerBatch','Máximo de consultas de descoberta por lote',100], ['verificationLimit','Empresas por lote de verificação',25],
        ] as const).map(([key,label,max]) => <Field key={key} label={label}><Input type="number" min={1} max={max} required value={config.batch[key]}
          onChange={e => setConfig(current => ({ ...current, batch: { ...current.batch, [key]: Number(e.target.value) } }))} /></Field>)}
          <Field label="Limite diário da campanha"><Input type="number" min={1} max={1000} required value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} /></Field>
          <Field label="Orçamento máximo (R$), opcional"><Input type="number" min={0} step="0.01" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
        </div>
      </fieldset>
      {canUseCrm&&<fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Destino padrão no CRM</legend>
        <p className="mb-3 text-xs text-slate-500">O destino será revisado antes do envio. Salvar a campanha não cria leads nem inicia contatos.</p>
        <Select value={config.crmDestination?.stageId??'none'} onValueChange={value=>{const option=destinations.find(item=>item.stageId===value);setConfig(current=>({...current,crmDestination:option?{crmInstanceId:option.crmInstanceId,pipelineId:option.pipelineId,stageId:option.stageId}:undefined}))}}><SelectTrigger aria-label="Destino padrão no CRM"><SelectValue placeholder="Escolher depois"/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">Escolher no momento do envio</SelectItem>{destinations.map(item=><SelectItem key={item.stageId} value={item.stageId}>{item.pipelineName} — {item.stageName}</SelectItem>)}</SelectGroup></SelectContent></Select>
        {destinationError&&<p className="mt-2 text-sm text-amber-800">Não foi possível consultar os destinos. Você poderá escolher depois, quando o CRM e seu acesso estiverem disponíveis.</p>}
      </fieldset>}
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Personalizar campos da lista de entrega</summary><fieldset className="mt-3"><legend className="sr-only">Campos da lista de entrega</legend>
        <p className="mb-2 text-xs text-slate-500">Campos sem informação comprovada ficam vazios; não são inventados. A seleção define as colunas do CSV.</p>
        <div className="grid gap-2 md:grid-cols-3">{(Object.entries(radarExportLabels) as Array<[RadarExportField,string]>).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.exportFields.includes(key)}
          onChange={e => setConfig(current => ({ ...current, exportFields: e.target.checked ? [...current.exportFields, key] : current.exportFields.filter(value => value !== key) }))} />{label}</label>)}</div>
      </fieldset></details>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {initialCampaign&&!readOnly && <p className="text-sm text-amber-800">Alterar critérios exige nova verificação das empresas e remove as aprovações anteriores. Os dados coletados são preservados.</p>}
    {!readOnly&&<div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : initialCampaign ? 'Salvar configuração' : 'Criar pesquisa'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button></div>}
  </form>
}
