import { useEffect,useRef,useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultRadarSearchConfiguration, defaultRadarSizePolicy, defaultRadarCompletionPolicy, validateRadarSizePolicy, parseRadarCities, radarBrazilStates, radarExportLabels, splitRadarTerms,
  type RadarExportField, type RadarSearchConfiguration } from '@/lib/radar/radarSearchConfiguration'
import type { RadarCampaignInput } from '@/services/radarService'
import type { RadarCampaign } from '@/types/radar'
import { RadarSizeConfiguration } from './RadarSizeConfiguration'
import {radarService} from '@/services/radarService'
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select'

type Props = { organizationId: string; initialCampaign?: RadarCampaign; busy: boolean;canUseCrm?:boolean;readOnly?:boolean;draftKey?:string;canConfigureProviders?:boolean;
  onSubmit: (input: RadarCampaignInput) => Promise<void>; onCancel: () => void }
const selectClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">{label}</span>{children}</label>
}

export function RadarCampaignConfigurationForm({ organizationId, initialCampaign, busy,canUseCrm=false,readOnly=false,draftKey,canConfigureProviders=false, onSubmit, onCancel }: Props) {
  const local=!!initialCampaign&&initialCampaign.campaignType!=='regional_b2b'
  const [destinations,setDestinations]=useState<Awaited<ReturnType<typeof radarService.getCrmDestinations>>>([])
  const [destinationError,setDestinationError]=useState(false)
  useEffect(()=>{if(!canUseCrm)return;let active=true;radarService.getCrmDestinations(organizationId).then(value=>{if(active)setDestinations(value)}).catch(()=>{if(active)setDestinationError(true)});return()=>{active=false}},[organizationId,canUseCrm])
  const defaults={config:initialCampaign?.searchConfiguration??defaultRadarSearchConfiguration(),name:initialCampaign?.name??'',
    segment:initialCampaign?.targetSegment??'',states:local?[initialCampaign.targetState]:initialCampaign?.targetStates??[],
    cities:local?`${initialCampaign.targetCity}/${initialCampaign.targetState}`:(initialCampaign?.searchConfiguration?.cities??[]).map(item=>`${item.city}/${item.state}`).join('\n'),
    geographicScope:(local||initialCampaign?.searchConfiguration?.cities.length?'cities':'states') as 'states'|'cities',
    keywords:initialCampaign?.targetKeywords.join(', ')??'',cnaes:initialCampaign?.targetCnaes.join(', ')??'',products:initialCampaign?.productFocus.join(', ')??'',
    excludedNames:initialCampaign?.searchConfiguration?.excludedNameTerms.join(', ')??'',offer:initialCampaign?.offerType??'',
    dailyLimit:initialCampaign?.dailyLimit??10,budget:initialCampaign?.budgetLimit?.toString()??''}
  const original=useRef(JSON.stringify(defaults))
  const storageKey=draftKey&&!readOnly?`yux-radar-draft:${draftKey}`:undefined
  const [restored]=useState<typeof defaults|undefined>(()=>{
    if(!storageKey)return
    try{
      const stored=JSON.parse(sessionStorage.getItem(storageKey)??'null')
      if(stored?.original===original.current&&Date.now()-stored.savedAt<86400000&&stored.value
        &&Object.keys(defaults).every(key=>typeof stored.value[key]===typeof defaults[key as keyof typeof defaults]))return stored.value
    }catch{/* An unavailable/corrupt local draft must not prevent opening the saved configuration. */}
  })
  const initial=restored??defaults
  const [config,setConfig]=useState(initial.config),[name,setName]=useState(initial.name),[segment,setSegment]=useState(initial.segment)
  const [states,setStates]=useState(initial.states),[cities,setCities]=useState(initial.cities),[geographicScope,setGeographicScope]=useState(initial.geographicScope)
  const [keywords,setKeywords]=useState(initial.keywords),[cnaes,setCnaes]=useState(initial.cnaes),[products,setProducts]=useState(initial.products)
  const [excludedNames,setExcludedNames]=useState(initial.excludedNames),[offer,setOffer]=useState(initial.offer)
  const [dailyLimit,setDailyLimit]=useState(initial.dailyLimit),[budget,setBudget]=useState(initial.budget)
  const [draftNotice,setDraftNotice]=useState(!!restored),[draftError,setDraftError]=useState(false)
  useEffect(()=>{
    if(!storageKey)return
    const value={config,name,segment,states,cities,geographicScope,keywords,cnaes,products,excludedNames,offer,dailyLimit,budget}
    try{
      if(JSON.stringify(value)!==original.current)sessionStorage.setItem(storageKey,JSON.stringify({original:original.current,value,savedAt:Date.now()}))
      else sessionStorage.removeItem(storageKey)
    }catch{setDraftError(true)}
  },[storageKey,config,name,segment,states,cities,geographicScope,keywords,cnaes,products,excludedNames,offer,dailyLimit,budget])
  const discardDraft=()=>{
    setConfig(defaults.config);setName(defaults.name);setSegment(defaults.segment);setStates(defaults.states);setCities(defaults.cities)
    setGeographicScope(defaults.geographicScope);setKeywords(defaults.keywords);setCnaes(defaults.cnaes);setProducts(defaults.products)
    setExcludedNames(defaults.excludedNames);setOffer(defaults.offer);setDailyLimit(defaults.dailyLimit);setBudget(defaults.budget);setDraftNotice(false)
  }
  const [error, setError] = useState<string | null>(null)
  const rules = config.qualification
  const research = config.research ?? defaultRadarSearchConfiguration().research!
  const completion=research.completion??defaultRadarCompletionPolicy()
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
      if(storageKey)try{sessionStorage.removeItem(storageKey)}catch{/* Saved remotely; no draft is required. */}
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a configuração.') }
  }

  return <form onSubmit={submit} className="mt-4 space-y-5" aria-label="Configuração da pesquisa">
    <p className="text-sm text-slate-600">Os critérios pertencem a esta campanha. Nenhum segmento, cidade ou produto é imposto pelo sistema. Salvar não executa consultas.</p>
    {storageKey&&<p className="text-xs text-slate-600">As edições ficam como rascunho nesta aba por até 24 horas. Sair não altera a campanha salva nem inicia buscas.</p>}
    {draftNotice&&<div role="status" className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">Rascunho recuperado — revise e salve para aplicar.<Button type="button" variant="ghost" onClick={discardDraft}>Descartar rascunho</Button></div>}
    {draftError&&<p role="alert" className="text-sm text-amber-800">Não foi possível preservar o rascunho nesta aba. Salve antes de sair.</p>}
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
        {canConfigureProviders&&!readOnly&&<details className="mb-3"><summary className="cursor-pointer text-sm">Admin — fonte e fallback da pesquisa web</summary>
          <Field label="Fonte principal da pesquisa web"><select aria-label="Fonte principal da pesquisa web" className={selectClass} value={research.webSearchProviders?.[0]??'brave_web_search'}
            onChange={event=>changeResearch({webSearchProviders:[event.target.value as 'brave_web_search'|'serper_web_search']})}>
            <option value="brave_web_search">Brave Web Search</option><option value="serper_web_search">Google via Serper</option></select></Field>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={(research.webSearchProviders?.length??1)>1} onChange={event=>{const primary=research.webSearchProviders?.[0]??'brave_web_search';changeResearch({webSearchProviders:event.target.checked?[primary,primary==='serper_web_search'?'brave_web_search':'serper_web_search']:[primary]})}}/>Autorizar a outra fonte como fallback</label>
          <p className="mt-2 text-xs text-muted-foreground">A fonte precisa estar liberada em Admin → Integrações. Fallback compartilha o limite total e pode complementar resultados que não ajudam a identificar a empresa. Salvar não pesquisa.</p>
        </details>}
        <p className="mb-3 text-xs text-slate-500">Descobre presença pública e contatos sem exigir URL manual. Salvar não consulta provedores. Fontes, custos e modelo são liberados separadamente no Admin.</p>
        <Field label="Quando complementar com busca local"><select aria-label="Quando complementar com busca local" className={selectClass} value={research.localSearchOrder??'before_web'}
          onChange={event=>changeResearch({localSearchOrder:event.target.value as 'before_web'|'after_web_if_needed'|'disabled'})}>
          <option value="before_web">Antes da busca na internet (padrão atual)</option><option value="after_web_if_needed">Depois, somente se necessário</option><option value="disabled">Não usar busca local no aprofundamento</option>
        </select></Field>
        <div className="space-y-2">{(['enabled','webSearchEnabled','presenceResolutionEnabled','semanticQualificationEnabled'] as const).map((key, index) => <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={research[key]??false} onChange={e => changeResearch({ [key]: e.target.checked })} />{['Permitir pesquisa automática nesta campanha','Aprofundar a busca na internet','Identificar site e canais oficiais por IA','Analisar adequação ao objetivo comercial'][index]}</label>)}</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{([['maxSearchQueriesPerCandidate','Consultas totais por empresa',5],['maxPagesPerCandidate','Páginas públicas por empresa',10],['freshnessDays','Validade da pesquisa (dias)',30]] as const).map(([key,label,max]) => <Field key={key} label={label}>
          <Input type="number" min={1} max={max} required value={research[key]} onChange={e => changeResearch({ [key]: Number(e.target.value) })} /></Field>)}</div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={research.profileEnabled??false} onChange={e=>changeResearch({profileEnabled:e.target.checked})}/>Gerar perfil aprofundado da empresa (incluído na análise por IA)</label>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={research.inspectLinkedSocialProfiles??false} onChange={e=>changeResearch({inspectLinkedSocialProfiles:e.target.checked})}/>Consultar informações públicas dos perfis vinculados pelo site</label>
        <p className="text-xs text-muted-foreground">Usa o mesmo limite de páginas da empresa. Não acessa contas privadas, não faz login nem envia mensagens.</p>
        <div className="mt-3"><Field label="Finalidade do contato desejado"><select className={selectClass} value={research.contactPurpose??'general'} onChange={e=>changeResearch({contactPurpose:e.target.value as typeof research.contactPurpose})}>
          <option value="general">Contato geral</option><option value="suppliers">Oferecer produtos ou serviços — fornecedores/compras</option><option value="sales">Comprar da empresa — comercial/vendas</option><option value="finance">Financeiro/fiscal</option><option value="recruitment">Recrutamento</option>
        </select></Field></div>
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Quando a pesquisa está suficiente</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Definir quando a pesquisa está suficiente" checked={completion.enabled} onChange={e=>changeResearch({completion:{...completion,enabled:e.target.checked}})}/>Definir quando a pesquisa está suficiente</label>
        <p className="text-xs text-muted-foreground">Indica que os dados estão prontos para revisão humana. Não aprova empresas nem dispara contatos. Novas exigências também são verificadas antes da entrega ao CRM.</p>
        <fieldset disabled={!completion.enabled} className="flex flex-col gap-3">
          {([['requireIdentity','Exigir identidade associada'],['requireSegment','Exigir segmento confirmado'],['requireWebsite','Exigir site associado']] as const).map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completion[key]} onChange={e=>changeResearch({completion:{...completion,[key]:e.target.checked}})}/>{label}</label>)}
          <Field label="Quantidade mínima de canais úteis"><Input type="number" min={0} max={20} value={completion.minimumUsefulContacts} onChange={e=>changeResearch({completion:{...completion,minimumUsefulContacts:Number(e.target.value)}})}/></Field>
          <fieldset className="flex flex-wrap gap-3"><legend className="text-sm">Tipos de contato aceitos</legend>{([['phone','Telefone'],['email','E-mail'],['whatsapp','WhatsApp publicado'],['contact_form','Formulário público']] as const).map(([kind,label])=><label key={kind} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completion.contactTypes.includes(kind)} onChange={e=>changeResearch({completion:{...completion,contactTypes:e.target.checked?[...completion.contactTypes,kind]:completion.contactTypes.filter(value=>value!==kind)}})}/>{label}</label>)}</fieldset>
          <fieldset className="flex flex-wrap gap-3"><legend className="text-sm">Finalidades aceitas (nenhuma seleção permite alternativas úteis)</legend>{([['general','Geral'],['suppliers','Fornecedores/compras'],['sales','Comercial/vendas'],['finance','Financeiro'],['recruitment','Recrutamento']] as const).map(([purpose,label])=><label key={purpose} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completion.contactPurposes.includes(purpose)} onChange={e=>changeResearch({completion:{...completion,contactPurposes:e.target.checked?[...completion.contactPurposes,purpose]:completion.contactPurposes.filter(value=>value!==purpose)}})}/>{label}</label>)}</fieldset>
        </fieldset>
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
