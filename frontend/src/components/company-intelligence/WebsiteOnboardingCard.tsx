import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, PackagePlus, Pencil, Sparkles, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { CompanyIntelligenceSuggestion, WebsiteOnboardingResult } from '@/types/companyIntelligence'

const REVIEWABLE_STATUSES = new Set(['ready_for_review', 'degraded', 'failed'])

export function WebsiteOnboardingCard({ organizationId, contractId, initialUrl, onApplied }: {
  organizationId: string
  contractId?: string
  initialUrl?: string
  onApplied: () => Promise<void> | void
}) {
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl || '')
  const [result, setResult] = useState<WebsiteOnboardingResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [starting, setStarting] = useState(false)
  const [applying, setApplying] = useState(false)
  const processing = Boolean(result && ['queued', 'running'].includes(result.run.status))
  const runId = result?.run.id
  const reviewable = Boolean(result && REVIEWABLE_STATUSES.has(result.run.status) && result.suggestions.length)

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
      const created = await companyIntelligenceService.startWebsiteOnboarding(organizationId, websiteUrl.trim(), contractId)
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
      setResult(updated)
      await onApplied()
      toast.success('Informações selecionadas aplicadas à empresa.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível aplicar as sugestões.')
    } finally {
      setApplying(false)
    }
  }

  const toggleSuggestion = (id: string, checked: boolean) => {
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id))
  }

  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-violet-100 p-2 text-violet-700"><Sparkles className="h-5 w-5" /></span>
        <div><h2 className="font-semibold text-gray-950">Preencher com o site</h2><p className="mt-1 text-sm text-gray-600">A IA lê as páginas mais importantes, propõe dados da empresa, marca, identidade visual e ofertas, e mostra a fonte antes de salvar.</p></div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Site da empresa" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://suaempresa.com.br" disabled={processing} />
        <Button onClick={start} disabled={starting || processing}>{starting || processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{processing ? 'Analisando...' : 'Analisar site'}</Button>
      </div>
      {result && processing ? <div className="space-y-2"><div className="flex justify-between text-xs text-gray-600"><span>{stageLabel(result.run.stage)}</span><span>{result.run.progress}%</span></div><Progress value={result.run.progress} className="h-2" /></div> : null}
      {result?.run.status === 'failed' && result.suggestions.length ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">A leitura terminou parcialmente, mas as sugestões com evidência foram preservadas e podem ser editadas e aplicadas.</p> : null}
      {result?.run.status === 'failed' && !result.suggestions.length ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">A análise não foi concluída. {friendlyRunError(result.run.errorMessage)}</p> : null}
      {result?.run.outputPayload.knowledgeReused ? <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-800">O conteúdo deste site já existia na base e foi reutilizado sem criar uma cópia.</p> : null}
      {Array.isArray(result?.run.outputPayload.pageUrls) ? <details className="rounded-md border bg-white p-3 text-sm"><summary className="cursor-pointer font-medium text-gray-800">Páginas analisadas ({result.run.outputPayload.pageUrls.length})</summary><ul className="mt-2 space-y-1 text-xs text-gray-600">{result.run.outputPayload.pageUrls.map(url => <li key={String(url)} className="truncate">{String(url)}</li>)}</ul></details> : null}

      {reviewable && result ? <ReviewActions selectedCount={selected.length} totalCount={result.suggestions.length} applying={applying} onApply={apply} onSelectAll={() => setSelected(result.suggestions.map(item => item.id))} onClear={() => setSelected([])} /> : null}

      {grouped.map(group => (
        <div key={group.kind} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">{groupLabel(group.kind)} <span className="font-normal text-gray-500">({group.items.length})</span></h3>
          {group.items.map(item => (
            <article key={item.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-start gap-3">
                <input id={`suggestion-${item.id}`} type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(item.id)} disabled={result?.run.status === 'applied'} onChange={event => toggleSuggestion(item.id, event.target.checked)} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`suggestion-${item.id}`} className="flex cursor-pointer flex-wrap items-center gap-2"><strong className="text-sm text-gray-900">{fieldLabel(item.fieldPath)}</strong><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">{Math.round(item.confidence * 100)}% confiança</span></label>
                  {hasValue(item.currentValue) ? <span className="mt-1 block text-xs text-gray-500">Atual: {displayValue(item.currentValue)}</span> : null}
                  <SuggestionEditor suggestion={item} draft={drafts[item.id] ?? editableValue(item.suggestedValue)} disabled={result?.run.status === 'applied'} onChange={draft => setDrafts(current => ({ ...current, [item.id]: draft }))} />
                  <span className="mt-3 block rounded bg-gray-50 p-2 text-xs text-gray-600">Evidência: “{item.evidenceExcerpt}”</span>
                  <a className="mt-2 inline-flex items-center text-xs text-violet-700 hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" />Ver página de origem</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ))}
      {result && REVIEWABLE_STATUSES.has(result.run.status) && !result.suggestions.length ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">O site foi lido, mas não houve informações com evidência suficiente para preencher automaticamente.</p> : null}
      {reviewable && result ? <ReviewActions selectedCount={selected.length} totalCount={result.suggestions.length} applying={applying} onApply={apply} onSelectAll={() => setSelected(result.suggestions.map(item => item.id))} onClear={() => setSelected([])} compact /> : null}
      {result?.run.status === 'applied' ? <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Informações aplicadas. O conteúdo do site também ficou disponível na base de conhecimento.</p> : null}
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
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div><p className="text-sm font-medium text-gray-900">{selectedCount} de {totalCount} sugestões selecionadas</p><p className="text-xs text-gray-500">Edite os valores abaixo antes de aplicar.</p></div>
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
  const structured = isStructuredValue(suggestion.suggestedValue)
  return (
    <div className="mt-3 space-y-1">
      <label htmlFor={`edit-${suggestion.id}`} className="flex items-center gap-1 text-xs font-medium text-gray-700"><Pencil className="h-3 w-3" />Editar sugestão</label>
      <Textarea id={`edit-${suggestion.id}`} aria-label={`Editar ${fieldLabel(suggestion.fieldPath)}`} rows={structured ? 6 : longField(suggestion.fieldPath) ? 4 : 2} value={draft} disabled={disabled} onChange={event => onChange(event.target.value)} className="bg-white text-sm" />
      {structured ? <p className="text-[11px] text-gray-500">Valor estruturado em JSON. Mantenha chaves, aspas e colchetes.</p> : Array.isArray(suggestion.suggestedValue) ? <p className="text-[11px] text-gray-500">Use uma informação por linha.</p> : null}
    </div>
  )
}

function VisualIdentityEditor({ draft, disabled, onChange }: { draft: string; disabled: boolean; onChange: (value: string) => void }) {
  const value = safeObject(draft)
  const update = (key: string, next: string | string[]) => onChange(JSON.stringify({ ...value, [key]: next }, null, 2))
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
      <p className="flex items-center gap-1 text-xs font-medium text-violet-900"><Pencil className="h-3 w-3" />Editar identidade visual sugerida</p>
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
      {products.map((product, index) => <div key={`${index}-${product.name}`} className="space-y-2 rounded-lg border bg-gray-50 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-gray-800">Oferta {index + 1}</span><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => remove(index)}><Trash2 className="h-3 w-3" /><span className="sr-only">Remover oferta {index + 1}</span></Button></div><Input aria-label={`Nome da oferta ${index + 1}`} value={product.name} disabled={disabled} onChange={event => update(index, 'name', event.target.value)} placeholder="Nome do produto ou serviço" /><Textarea aria-label={`Descrição da oferta ${index + 1}`} rows={3} value={product.description} disabled={disabled} onChange={event => update(index, 'description', event.target.value)} placeholder="Descrição" /><Textarea aria-label={`Proposta de valor da oferta ${index + 1}`} rows={2} value={product.valueProposition} disabled={disabled} onChange={event => update(index, 'valueProposition', event.target.value)} placeholder="Proposta de valor" /></div>)}
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

function displayValue(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' · ')
  return JSON.stringify(value, null, 2)
}

function stringValue(value: unknown) { return typeof value === 'string' ? value : '' }
function stringList(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function splitList(value: string) { return value.split(/,|\n/).map(item => item.trim()).filter(Boolean) }
function isStructuredValue(value: unknown) { return Boolean(value && typeof value === 'object' && (!Array.isArray(value) || value.some(item => typeof item === 'object'))) }
function longField(field: string) { return ['description', 'positioning', 'brandVoiceSummary', 'visualGuidelines', 'persona'].includes(field) }
function friendlyRunError(error?: string) { return error === 'knowledge_file_already_exists' ? 'O conteúdo já existe na base de conhecimento.' : error || 'Verifique o endereço e as integrações de IA.' }
export function hasValue(value: unknown) { return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0) && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length > 0) }
export function shouldSelectByDefault(item: WebsiteOnboardingResult['suggestions'][number]) { return item.confidence >= (hasValue(item.currentValue) ? 0.9 : 0.75) }
function groupLabel(kind: 'profile' | 'brand' | 'product') { return ({ profile: 'Perfil da empresa', brand: 'Marca, público e identidade visual', product: 'Produtos e serviços' })[kind] }
function stageLabel(stage: string) { return ({ queued: 'Aguardando processamento', discovering: 'Encontrando páginas importantes', extracting: 'Lendo informações', curating: 'Organizando conhecimento', embedding: 'Preparando busca inteligente' } as Record<string, string>)[stage] || 'Processando informações' }
function fieldLabel(field: string) { return ({ legalName: 'Razão social', tradeName: 'Nome da empresa', description: 'Descrição', websiteUrl: 'Site', industry: 'Segmento', positioning: 'Posicionamento', differentiators: 'Diferenciais', emails: 'E-mails', phones: 'Telefones', address: 'Endereço', businessHours: 'Horários', serviceRegions: 'Regiões atendidas', socialLinks: 'Redes sociais', toneOfVoice: 'Tom de voz', persona: 'Público/persona', brandVoiceSummary: 'Resumo da voz', vocabularyDo: 'Vocabulário recomendado', vocabularyDont: 'Vocabulário a evitar', priorityTopics: 'Temas prioritários', visualIdentity: 'Logo, cores e identidade visual', visualGuidelines: 'Orientações visuais', products: 'Ofertas encontradas' } as Record<string, string>)[field] || field }
