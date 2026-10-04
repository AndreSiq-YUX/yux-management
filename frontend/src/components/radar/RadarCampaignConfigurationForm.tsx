import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultRadarSearchConfiguration, parseRadarCities, radarBrazilStates, radarExportLabels, splitRadarTerms,
  type RadarExportField, type RadarSearchConfiguration } from '@/lib/radar/radarSearchConfiguration'
import type { RadarCampaignInput } from '@/services/radarService'
import type { RadarCampaign } from '@/types/radar'

type Props = { organizationId: string; initialCampaign?: RadarCampaign; busy: boolean;
  onSubmit: (input: RadarCampaignInput) => Promise<void>; onCancel: () => void }
const selectClass = 'h-10 w-full rounded-md border bg-white px-3 text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">{label}</span>{children}</label>
}

export function RadarCampaignConfigurationForm({ organizationId, initialCampaign, busy, onSubmit, onCancel }: Props) {
  const [config, setConfig] = useState<RadarSearchConfiguration>(() => initialCampaign?.searchConfiguration ?? defaultRadarSearchConfiguration())
  const [name, setName] = useState(initialCampaign?.name ?? '')
  const [segment, setSegment] = useState(initialCampaign?.targetSegment ?? '')
  const [states, setStates] = useState<string[]>(initialCampaign?.targetStates ?? [])
  const [cities, setCities] = useState(() => (initialCampaign?.searchConfiguration?.cities ?? []).map(item => `${item.city}/${item.state}`).join('\n'))
  const [geographicScope, setGeographicScope] = useState<'states' | 'cities'>(() =>
    initialCampaign?.searchConfiguration?.cities.length ? 'cities' : 'states')
  const [keywords, setKeywords] = useState(initialCampaign?.targetKeywords.join(', ') ?? '')
  const [cnaes, setCnaes] = useState(initialCampaign?.targetCnaes.join(', ') ?? '')
  const [products, setProducts] = useState(initialCampaign?.productFocus.join(', ') ?? '')
  const [excludedNames, setExcludedNames] = useState(initialCampaign?.searchConfiguration?.excludedNameTerms.join(', ') ?? '')
  const [offer, setOffer] = useState(initialCampaign?.offerType ?? '')
  const [dailyLimit, setDailyLimit] = useState(initialCampaign?.dailyLimit ?? 10)
  const [budget, setBudget] = useState(initialCampaign?.budgetLimit?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const rules = config.qualification
  const changeRules = (patch: Partial<typeof rules>) => setConfig(current => ({ ...current, qualification: { ...current.qualification, ...patch } }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      if (!states.length) throw new Error('Selecione pelo menos uma UF.')
      if (geographicScope === 'cities' && !cities.trim()) throw new Error('Informe pelo menos uma cidade ou escolha Estados inteiros.')
      if (!config.exportFields.length) throw new Error('Selecione pelo menos um campo de entrega.')
      const codes = splitRadarTerms(cnaes).map(value => value.replace(/\D/g, ''))
      if (codes.some(value => value.length !== 7)) throw new Error('Cada CNAE deve ter sete dígitos.')
      if (rules.requireCnaeMatch && !codes.length) throw new Error('Informe os CNAEs para exigir correspondência.')
      if (!config.registrationStatusIds.length) throw new Error('Selecione uma situação cadastral.')
      if (!config.braveQueryTemplate.includes('{name}')) throw new Error('A consulta Brave precisa conter {name}.')
      if (config.openingFrom && config.openingTo && config.openingFrom > config.openingTo) throw new Error('Revise o intervalo de abertura.')
      await onSubmit({ organizationId, name, campaignType: 'regional_b2b', targetSegment: segment,
        targetStates: states, targetKeywords: splitRadarTerms(keywords), targetCnaes: codes,
        productFocus: splitRadarTerms(products), offerType: offer, dailyLimit,
        budgetLimit: budget === '' ? undefined : Number(budget),
        searchConfiguration: { ...config, cities: geographicScope === 'states' ? [] : parseRadarCities(cities, states), excludedNameTerms: splitRadarTerms(excludedNames),
          qualification: { ...rules, includeAnyTerms: splitRadarTerms(rules.includeAnyTerms.join('\n')),
            includeAllTerms: splitRadarTerms(rules.includeAllTerms.join('\n')), excludeTerms: splitRadarTerms(rules.excludeTerms.join('\n')),
            productTerms: splitRadarTerms(rules.productTerms.join('\n')) } } })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a configuração.') }
  }

  return <form onSubmit={submit} className="mt-4 space-y-5" aria-label="Configuração da pesquisa">
    <p className="text-sm text-slate-600">Os critérios pertencem a esta campanha. Nenhum segmento, cidade ou produto é imposto pelo sistema. Salvar não executa consultas.</p>
    <fieldset disabled={busy} className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome da pesquisa"><Input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Segmento ou público desejado"><Input required maxLength={160} value={segment} onChange={e => setSegment(e.target.value)} /></Field>
        <Field label="Oferta ou objetivo comercial"><Input required maxLength={160} value={offer} onChange={e => setOffer(e.target.value)} /></Field>
        <Field label="Produtos e serviços de interesse (separados por vírgula)"><Input value={products} onChange={e => setProducts(e.target.value)} /></Field>
      </div>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Regiões da pesquisa</legend>
        <div className="mb-3"><Field label="Abrangência geográfica"><select className={selectClass} value={geographicScope}
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
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Filtros de descoberta CNPJá</legend>
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
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Fontes e aprofundamento</legend>
        <p className="mb-2 text-xs text-slate-500">Descoberta pela CNPJá. Aprofundamento opcional pela Brave licenciada e inspeção do site público. Habilitação, chaves, orçamento e licença do Admin continuam obrigatórios.</p>
        <div className="flex flex-wrap gap-4">{(['enrichWithBrave','inspectWebsite'] as const).map(key => <label key={key} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={config.sources[key]}
          onChange={e => setConfig(current => ({ ...current, sources: { ...current.sources, [key]: e.target.checked } }))} />{key === 'enrichWithBrave' ? 'Buscar dados com Brave licenciada' : 'Inspecionar site público'}</label>)}</div>
        <div className="mt-3"><Field label="Modelo da consulta Brave"><Input value={config.braveQueryTemplate} maxLength={160} required onChange={e => setConfig(current => ({ ...current, braveQueryTemplate: e.target.value }))} /></Field>
          <p className="text-xs text-slate-500">Use {'{name}'} para o nome da empresa; opcionalmente {'{segment}'} e {'{terms}'}. Cidade e UF são enviadas separadamente.</p></div>
      </fieldset>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Critérios de qualificação</legend>
        <p className="mb-3 text-xs text-slate-500">Expressões literais verificadas no site identificado da empresa, ignorando acentos. Não é uma análise semântica por LLM. Sem critérios positivos, a empresa vai para revisão manual.</p>
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
          ['pageSize','Estabelecimentos por página CNPJá',10], ['maxPagesPerScope','Páginas por região no lote',10],
          ['maxQueriesPerBatch','Máximo de consultas CNPJá por lote',100], ['verificationLimit','Empresas por lote de verificação',25],
        ] as const).map(([key,label,max]) => <Field key={key} label={label}><Input type="number" min={1} max={max} required value={config.batch[key]}
          onChange={e => setConfig(current => ({ ...current, batch: { ...current.batch, [key]: Number(e.target.value) } }))} /></Field>)}
          <Field label="Limite diário da campanha"><Input type="number" min={1} max={1000} required value={dailyLimit} onChange={e => setDailyLimit(Number(e.target.value))} /></Field>
          <Field label="Orçamento máximo (R$), opcional"><Input type="number" min={0} step="0.01" value={budget} onChange={e => setBudget(e.target.value)} /></Field>
        </div>
      </fieldset>
      <fieldset className="rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Campos da lista de entrega</legend>
        <p className="mb-2 text-xs text-slate-500">Campos sem informação comprovada ficam vazios; não são inventados. A seleção define as colunas do CSV.</p>
        <div className="grid gap-2 md:grid-cols-3">{(Object.entries(radarExportLabels) as Array<[RadarExportField,string]>).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.exportFields.includes(key)}
          onChange={e => setConfig(current => ({ ...current, exportFields: e.target.checked ? [...current.exportFields, key] : current.exportFields.filter(value => value !== key) }))} />{label}</label>)}</div>
      </fieldset>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {initialCampaign && <p className="text-sm text-amber-800">Alterar critérios exige nova verificação das empresas e remove as aprovações anteriores. Os dados coletados são preservados.</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Salvando...' : initialCampaign ? 'Salvar configuração' : 'Criar pesquisa'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
  </form>
}
