import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, ExternalLink, Loader2, PackagePlus, Pencil, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import { describeValue, isFlatRecord, keyLabel } from '@/lib/company-intelligence/describeValue'
import { hasValue, shouldSelectByDefault } from '@/lib/company-intelligence/websiteOnboardingRules'
import { cn } from '@/lib/utils'
import type { CompanyIntelligenceSuggestion, WebsiteOnboardingResult } from '@/types/companyIntelligence'

const REVIEWABLE_STATUSES = new Set(['ready_for_review', 'degraded', 'failed'])

export function WebsiteOnboardingCard({ organizationId, contractId, initialUrl, onApplied, target, defaultOpen = true }: {
  organizationId: string
  target?:import('@/types/companyIntelligence').WebsiteOnboardingTarget
  contractId?: string
  initialUrl?: string
  onApplied: () => Promise<void> | void
  /** Aberto de início (perfil vazio). Depois do primeiro uso, o cartão fica recolhido e pode ser expandido. */
  defaultOpen?: boolean
}) {
  const scope=useRef(organizationId);scope.current=organizationId
  useEffect(()=>{setResult(null);setSelected([]);setDrafts({});setStarting(false);setApplying(false);setWebsiteUrl(initialUrl??'')},[organizationId,target?.kind,target?.kind==='represented_business'?target.representedBusinessId:''])
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl || '')
  const [maxPages, setMaxPages] = useState(30)
  const [result, setResult] = useState<WebsiteOnboardingResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [starting, setStarting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const processing = Boolean(result && ['queued', 'running'].includes(result.run.status))
  const runId = result?.run.id
  const reviewable = Boolean(result && REVIEWABLE_STATUSES.has(result.run.status) && result.suggestions.length)
  const open = expanded ?? (defaultOpen || (result !== null && result.run.status !== 'applied'))

  useEffect(() => {
    if (!result && initialUrl) setWebsiteUrl(initialUrl)
  }, [initialUrl, result])

  useEffect(() => {
    if (!processing || !runId) return
    let cancelled = false
    let timeout: number | undefined
    const poll = async () => {
      try {
        const updated = await companyIntelligenceService.getWebsiteOnboarding(organizationId, runId)
        if (cancelled) return
        setResult(updated)
        if (!['queued', 'running'].includes(updated.run.status)) initializeReview(updated, setSelected, setDrafts)
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) timeout = window.setTimeout(poll, 3_000)
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timeout) window.clearTimeout(timeout)
    }
  }, [organizationId, processing, runId])

  const grouped = useMemo(() => {
    if (!result) return []
    return (['profile', 'brand', 'product'] as const)
      .map(kind => ({ kind, items: result.suggestions.filter(item => item.suggestionKind === kind) }))
      .filter(group => group.items.length)
  }, [result])

  const start = async () => {
    if (!websiteUrl.trim()) return toast.error('Informe o site da empresa.')
    setStarting(true)
    try {
      const created = await (target?companyIntelligenceService.startWebsiteOnboarding(organizationId, websiteUrl.trim(), contractId, maxPages,target):companyIntelligenceService.startWebsiteOnboarding(organizationId, websiteUrl.trim(), contractId, maxPages))
      if(scope.current!==organizationId)return
      setResult(created)
      if (['queued', 'running'].includes(created.run.status)) {
        setSelected([])
        setDrafts({})
      } else {
        initializeReview(created, setSelected, setDrafts)
      }
      toast.success('Leitura inteligente do site iniciada.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível iniciar a leitura do site.')
    } finally {
      setStarting(false)
    }
  }

  const apply = async () => {
    if (!result || !selected.length) return toast.error('Selecione ao menos uma sugestão.')
    let suggestionEdits: Array<{ id: string; suggestedValue: unknown }>
    try {
      suggestionEdits = selected.map(id => {
        const suggestion = result.suggestions.find(item => item.id === id)
        if (!suggestion) throw new Error('suggestion_not_found')
        return { id, suggestedValue: parseDraftValue(suggestion.suggestedValue, drafts[id] ?? editableValue(suggestion.suggestedValue)) }
      })
    } catch {
      return toast.error('Revise os campos estruturados: existe um valor com formato inválido.')
    }
    setApplying(true)
    try {
      const updated = await companyIntelligenceService.applyWebsiteSuggestions(
        organizationId,
        result.run.id,
        selected,
        suggestionEdits,
      )
      if(scope.current!==organizationId)return
      setResult(updated)
      await onApplied()
      toast.success('Informações selecionadas aplicadas à empresa.')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error && error.message.includes('confirmed_value_changed')
        ? 'Um valor foi alterado depois da análise. Ele foi preservado; revise as sugestões novamente.'
        : 'Não foi possível aplicar as sugestões.')
    } finally {
      setApplying(false)
    }
  }

  const toggleSuggestion = (id: string, checked: boolean) => {
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id))
  }

  return (
    <section aria-labelledby="website-onboarding-title" className="rounded-[10px] border border-yx-line bg-yx-surface p-[18px] text-yx-fg shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white"><Sparkles aria-hidden="true" className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="website-onboarding-title" className="font-display text-base font-semibold text-yx-fg">Preencher com o site</h2>
          <p className="mt-1 text-[13px] leading-snug text-yx-fg-3">
            {open
              ? 'Lemos as páginas mais importantes do seu site, sugerimos os dados da empresa, da marca e das ofertas e mostramos a fonte de cada informação antes de salvar.'
              : 'Leia o site de novo para atualizar os dados da empresa quando algo mudar.'}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="website-onboarding-body"
          onClick={() => setExpanded(!open)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-yx-blue hover:text-yx-blue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:min-h-8"
        >
          {open ? 'Recolher' : 'Abrir'}
          <ChevronDown aria-hidden="true" className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </div>
      {open ? (
        <div id="website-onboarding-body" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="website-onboarding-url" className="text-yx-fg">Site da empresa</Label>
              <Input id="website-onboarding-url" type="url" inputMode="url" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://suaempresa.com.br" disabled={processing} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website-onboarding-max-pages" className="text-yx-fg">Limite de páginas</Label>
              <Input id="website-onboarding-max-pages" type="number" inputMode="numeric" min={1} max={50} value={maxPages} onChange={event => setMaxPages(clampPageLimit(event.target.value))} disabled={processing} aria-describedby="website-onboarding-max-pages-hint" />
            </div>
            <Button onClick={start} disabled={starting || processing}>{starting || processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{processing ? 'Analisando...' : 'Analisar site'}</Button>
          </div>
          <p id="website-onboarding-max-pages-hint" className="text-xs text-yx-fg-3">Quantas páginas do site serão lidas (de 1 a 50). Com mais páginas a leitura é mais completa e demora mais.</p>
          {target?.kind==='represented_business'&&<p className="rounded-lg border border-yx-line p-3 text-sm">Esta análise altera apenas a representada selecionada e seu portfólio. Confirme as linhas autorizadas e condições antes de oferecer os produtos.</p>}
          {Array.isArray(result?.run.outputPayload.productReconciliation)&&result.run.outputPayload.productReconciliation.length>0&&<p role="status" className="text-sm text-yx-warn">Produtos com referência já cadastrada foram preservados. Confira as novas informações no portfólio antes de alterar seus cadastros.</p>}
          {!!result?.run.outputPayload.possibleDuplicates&&<p role="status" className="text-sm text-yx-warn">Há produtos com nomes semelhantes para conciliar no portfólio. Eles foram mantidos separados.</p>}
          {result && processing ? <div className="space-y-2"><div className="flex justify-between text-xs text-yx-fg-3"><span>{stageLabel(result.run.stage)}</span><span>{result.run.progress}%</span></div><Progress value={result.run.progress} className="h-2" /></div> : null}
          {result?.run.status === 'failed' && result.suggestions.length ? <p className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3 text-sm text-yx-warn">A leitura terminou parcialmente, mas as sugestões com evidência foram preservadas e podem ser editadas e aplicadas.</p> : null}
          {result?.run.status === 'failed' && !result.suggestions.length ? <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft p-3 text-sm text-yx-crit">A análise não foi concluída. {friendlyRunError(result.run.errorMessage)}</p> : null}
          {result?.run.outputPayload.knowledgeReused ? <p className="rounded-lg border border-yx-line bg-yx-blue-soft p-3 text-sm text-yx-blue-ink">O conteúdo deste site já existia na base e foi reutilizado sem criar uma cópia.</p> : null}
          {Array.isArray(result?.run.outputPayload.pageUrls) ? <details className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-sm"><summary className="cursor-pointer font-medium text-yx-fg">Páginas analisadas ({result.run.outputPayload.pageUrls.length})</summary><ul className="mt-2 space-y-1 text-xs text-yx-fg-2">{result.run.outputPayload.pageUrls.map(url => <li key={String(url)} className="truncate">{String(url)}</li>)}</ul></details> : null}

          {reviewable && result ? <ReviewActions selectedCount={selected.length} totalCount={result.suggestions.length} applying={applying} onApply={apply} onSelectAll={() => setSelected(result.suggestions.map(item => item.id))} onClear={() => setSelected([])} /> : null}

          {grouped.map(group => (
            <div key={group.kind} className="space-y-2">
              <h3 className="text-sm font-semibold text-yx-fg">{target?.kind==='represented_business'&&group.kind==='profile'?'Descrição da representada':groupLabel(group.kind)} <span className="font-normal text-yx-fg-3">({group.items.length})</span></h3>
              {group.items.map(item => (
                <article key={item.id} className="rounded-lg border border-yx-line bg-yx-surface p-4">
                  <div className="flex items-start gap-3">
                    <input id={`suggestion-${item.id}`} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--yx-blue)]" checked={selected.includes(item.id)} disabled={result?.run.status === 'applied'} onChange={event => toggleSuggestion(item.id, event.target.checked)} />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`suggestion-${item.id}`} className="flex cursor-pointer flex-wrap items-center gap-2"><strong className="text-sm text-yx-fg">{fieldLabel(item.fieldPath)}</strong><span className="rounded-full bg-yx-blue-soft px-2 py-0.5 font-mono text-[11px] text-yx-blue-ink">{Math.round(item.confidence * 100)}% de confiança</span></label>
                      {hasValue(item.currentValue) ? <span className="mt-1 block text-xs text-yx-fg-3">Atual: {describeValue(item.currentValue)}</span> : null}
                      <SuggestionEditor suggestion={item} draft={drafts[item.id] ?? editableValue(item.suggestedValue)} disabled={result?.run.status === 'applied'} onChange={draft => setDrafts(current => ({ ...current, [item.id]: draft }))} />
                      <span className="mt-3 block rounded bg-yx-surface-2 p-2 text-xs text-yx-fg-2">Trecho do site: “{item.evidenceExcerpt}”</span>
                      <a className="mt-2 inline-flex min-h-8 items-center text-xs font-semibold text-yx-blue hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" />Ver página de origem</a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ))}
          {result && REVIEWABLE_STATUSES.has(result.run.status) && !result.suggestions.length ? <p className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3 text-sm text-yx-warn">O site foi lido, mas não houve informações com evidência suficiente para preencher automaticamente.</p> : null}
          {reviewable && result ? <ReviewActions selectedCount={selected.length} totalCount={result.suggestions.length} applying={applying} onApply={apply} onSelectAll={() => setSelected(result.suggestions.map(item => item.id))} onClear={() => setSelected([])} compact /> : null}
          {result?.run.status === 'applied' ? <p role="status" className="flex items-center gap-2 rounded-lg border border-yx-ok-line bg-yx-ok-soft p-3 text-sm text-yx-ok"><CheckCircle2 className="h-4 w-4" />Informações aplicadas. O conteúdo do site também ficou disponível na base de conhecimento.</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function ReviewActions({ selectedCount, totalCount, applying, onApply, onSelectAll, onClear, compact = false }: {
  selectedCount: number
  totalCount: number
  applying: boolean
  onApply: () => void
  onSelectAll: () => void
  onClear: () => void
  compact?: boolean
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-yx-line bg-yx-surface-2 ${compact ? 'p-3' : 'p-4'}`}>
      <div><p className="text-sm font-medium text-yx-fg">{selectedCount} de {totalCount} sugestões selecionadas</p><p className="text-xs text-yx-fg-3">Edite os valores abaixo antes de aplicar.</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={onSelectAll}>Selecionar todas</Button><Button type="button" variant="ghost" size="sm" onClick={onClear}>Limpar</Button><Button type="button" onClick={onApply} disabled={applying || !selectedCount}>{applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aplicar selecionadas ({selectedCount})</Button></div>
    </div>
  )
}

function SuggestionEditor({ suggestion, draft, disabled, onChange }: {
  suggestion: CompanyIntelligenceSuggestion
  draft: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  if (suggestion.fieldPath === 'visualIdentity') return <VisualIdentityEditor draft={draft} disabled={disabled} onChange={onChange} />
  if (suggestion.suggestionKind === 'product' && suggestion.fieldPath === 'products') return <ProductsEditor draft={draft} disabled={disabled} onChange={onChange} />
  if (isFlatRecord(suggestion.suggestedValue)) return <FlatObjectEditor draft={draft} disabled={disabled} onChange={onChange} fieldId={suggestion.id} />
  if (isStructuredValue(suggestion.suggestedValue)) {
    // Valores aninhados não são editados aqui: mostramos em texto e o cliente ajusta depois no formulário.
    return (
      <div className="mt-3 space-y-1 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
        <p className="text-sm text-yx-fg">{describeValue(suggestion.suggestedValue)}</p>
        <p className="text-xs text-yx-fg-3">Esta sugestão entra como está. Depois de aplicar, você pode ajustá-la no formulário abaixo.</p>
      </div>
    )
  }
  return (
    <div className="mt-3 space-y-1">
      <label htmlFor={`edit-${suggestion.id}`} className="flex items-center gap-1 text-xs font-medium text-yx-fg-2"><Pencil className="h-3 w-3" />Editar sugestão</label>
      <Textarea id={`edit-${suggestion.id}`} aria-label={`Editar ${fieldLabel(suggestion.fieldPath)}`} rows={longField(suggestion.fieldPath) ? 4 : 2} value={draft} disabled={disabled} onChange={event => onChange(event.target.value)} className="bg-yx-surface text-sm" />
      {Array.isArray(suggestion.suggestedValue) ? <p className="text-[11px] text-yx-fg-3">Use uma informação por linha.</p> : null}
    </div>
  )
}

function FlatObjectEditor({ draft, disabled, onChange, fieldId }: { draft: string; disabled: boolean; onChange: (value: string) => void; fieldId: string }) {
  const value = safeObject(draft)
  const update = (key: string, next: string) => onChange(JSON.stringify({ ...value, [key]: next }, null, 2))
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {Object.entries(value).map(([key, entry]) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={`edit-${fieldId}-${key}`} className="text-xs font-medium text-yx-fg-2">{keyLabel(key)}</Label>
          <Input id={`edit-${fieldId}-${key}`} value={String(entry ?? '')} disabled={disabled} onChange={event => update(key, event.target.value)} />
        </div>
      ))}
    </div>
  )
}

function VisualIdentityEditor({ draft, disabled, onChange }: { draft: string; disabled: boolean; onChange: (value: string) => void }) {
  const value = safeObject(draft)
  const update = (key: string, next: string | string[]) => onChange(JSON.stringify({ ...value, [key]: next }, null, 2))
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
      <p className="flex items-center gap-1 text-xs font-medium text-yx-fg-2"><Pencil className="h-3 w-3" />Editar identidade visual sugerida</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Input aria-label="Editar URL do logo" value={stringValue(value.logoUrl)} disabled={disabled} onChange={event => update('logoUrl', event.target.value)} placeholder="URL do logo" />
        <Input aria-label="Editar cores da marca" value={stringList(value.colors).join(', ')} disabled={disabled} onChange={event => update('colors', splitList(event.target.value))} placeholder="#5519ff, #eef0ff" />
        <Input aria-label="Editar tipografias" value={stringList(value.typography).join(', ')} disabled={disabled} onChange={event => update('typography', splitList(event.target.value))} placeholder="Inter, Sora" />
        <Input aria-label="Editar elementos gráficos" value={stringList(value.graphicElements).join(', ')} disabled={disabled} onChange={event => update('graphicElements', splitList(event.target.value))} placeholder="gradientes, ícones lineares" />
      </div>
      <div className="grid gap-3 md:grid-cols-2"><Textarea aria-label="Editar estilo de design" rows={3} value={stringValue(value.designStyle)} disabled={disabled} onChange={event => update('designStyle', event.target.value)} placeholder="Estilo de design" /><Textarea aria-label="Editar estilo de imagens" rows={3} value={stringValue(value.imageryStyle)} disabled={disabled} onChange={event => update('imageryStyle', event.target.value)} placeholder="Estilo de imagens" /></div>
    </div>
  )
}

function ProductsEditor({ draft, disabled, onChange }: { draft: string; disabled: boolean; onChange: (value: string) => void }) {
  const products = safeProducts(draft)
  const update = (index: number, key: string, value: string) => onChange(JSON.stringify(products.map((product, productIndex) => productIndex === index ? { ...product, [key]: value } : product), null, 2))
  const remove = (index: number) => onChange(JSON.stringify(products.filter((_, productIndex) => productIndex !== index), null, 2))
  const add = () => onChange(JSON.stringify([...products, { name: '', description: '', valueProposition: '' }], null, 2))
  return (
    <div className="mt-3 space-y-3">
      {products.map((product, index) => <div key={`${index}-${product.name}`} className="space-y-2 rounded-lg border border-yx-line bg-yx-surface-2 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-yx-fg">Oferta {index + 1}</span><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => remove(index)}><Trash2 className="h-3 w-3" /><span className="sr-only">Remover oferta {index + 1}</span></Button></div><Input aria-label={`Nome da oferta ${index + 1}`} value={product.name} disabled={disabled} onChange={event => update(index, 'name', event.target.value)} placeholder="Nome do produto ou serviço" /><Textarea aria-label={`Descrição da oferta ${index + 1}`} rows={3} value={product.description} disabled={disabled} onChange={event => update(index, 'description', event.target.value)} placeholder="Descrição" /><Textarea aria-label={`Proposta de valor da oferta ${index + 1}`} rows={2} value={product.valueProposition} disabled={disabled} onChange={event => update(index, 'valueProposition', event.target.value)} placeholder="Proposta de valor" /></div>)}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}><PackagePlus className="mr-2 h-4 w-4" />Adicionar oferta</Button>
    </div>
  )
}

function initializeReview(result: WebsiteOnboardingResult, setSelected: (value: string[]) => void, setDrafts: (value: Record<string, string>) => void) {
  setSelected(result.suggestions.filter(shouldSelectByDefault).map(item => item.id))
  setDrafts(Object.fromEntries(result.suggestions.map(item => [item.id, editableValue(item.suggestedValue)])))
}

function editableValue(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value.join('\n')
  return JSON.stringify(value, null, 2)
}

function parseDraftValue(original: unknown, draft: string) {
  if (typeof original === 'string') return draft.trim()
  if (Array.isArray(original) && original.every(item => typeof item === 'string')) return draft.split(/\n|,/).map(item => item.trim()).filter(Boolean)
  return JSON.parse(draft)
}

function safeObject(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} }
}

function safeProducts(value: string) {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(item => item && typeof item === 'object').map(item => ({ name: stringValue(item.name), description: stringValue(item.description), valueProposition: stringValue(item.valueProposition) }))
  } catch { return [] }
}

function stringValue(value: unknown) { return typeof value === 'string' ? value : '' }
function stringList(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function splitList(value: string) { return value.split(/,|\n/).map(item => item.trim()).filter(Boolean) }
function clampPageLimit(value: string) { return Math.max(1, Math.min(50, Number.parseInt(value, 10) || 1)) }
function isStructuredValue(value: unknown) { return Boolean(value && typeof value === 'object' && (!Array.isArray(value) || value.some(item => typeof item === 'object'))) }
function longField(field: string) { return ['description', 'positioning', 'brandVoiceSummary', 'visualGuidelines', 'persona'].includes(field) }
function friendlyRunError(error?: string) {
  if (error === 'knowledge_file_already_exists') return 'O conteúdo já existe na base de conhecimento.'
  if (error?.startsWith('agent_runtime_')) return 'O serviço de IA não conseguiu concluir a leitura do site. Tente novamente em alguns minutos; se continuar, fale com a YUX.'
  return 'Verifique se o endereço do site está correto e tente novamente.'
}
function groupLabel(kind: 'profile' | 'brand' | 'product') { return ({ profile: 'Perfil da empresa', brand: 'Marca, público e identidade visual', product: 'Produtos e serviços' })[kind] }
function stageLabel(stage: string) { return ({ queued: 'Aguardando processamento', discovering: 'Encontrando páginas importantes', extracting: 'Lendo informações', curating: 'Organizando conhecimento', embedding: 'Preparando busca inteligente' } as Record<string, string>)[stage] || 'Processando informações' }
function fieldLabel(field: string) { return ({ legalName: 'Razão social', tradeName: 'Nome da empresa', description: 'Descrição', websiteUrl: 'Site', industry: 'Segmento', positioning: 'Posicionamento', differentiators: 'Diferenciais', emails: 'E-mails', phones: 'Telefones', address: 'Endereço', businessHours: 'Horários', serviceRegions: 'Regiões atendidas', socialLinks: 'Redes sociais', toneOfVoice: 'Tom de voz', persona: 'Público/persona', brandVoiceSummary: 'Resumo da voz', vocabularyDo: 'Vocabulário recomendado', vocabularyDont: 'Vocabulário a evitar', priorityTopics: 'Temas prioritários', visualIdentity: 'Logo, cores e identidade visual', visualGuidelines: 'Orientações visuais', products: 'Ofertas encontradas' } as Record<string, string>)[field] || field }
