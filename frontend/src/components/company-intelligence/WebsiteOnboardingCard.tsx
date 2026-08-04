import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { companyIntelligenceService } from '@/services/companyIntelligenceService'
import type { WebsiteOnboardingResult } from '@/types/companyIntelligence'

export function WebsiteOnboardingCard({ organizationId, contractId, initialUrl, onApplied }: {
  organizationId: string
  contractId?: string
  initialUrl?: string
  onApplied: () => Promise<void> | void
}) {
  const [websiteUrl, setWebsiteUrl] = useState(initialUrl || '')
  const [result, setResult] = useState<WebsiteOnboardingResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [applying, setApplying] = useState(false)
  const processing = Boolean(result && ['queued', 'running'].includes(result.run.status))
  const runId = result?.run.id

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
        if (['ready_for_review', 'degraded'].includes(updated.run.status)) setSelected(updated.suggestions.filter(shouldSelectByDefault).map(item => item.id))
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
    return (['profile', 'brand', 'product'] as const).map(kind => ({ kind, items: result.suggestions.filter(item => item.suggestionKind === kind) })).filter(group => group.items.length)
  }, [result])

  const start = async () => {
    if (!websiteUrl.trim()) return toast.error('Informe o site da empresa.')
    setStarting(true)
    try {
      const created = await companyIntelligenceService.startWebsiteOnboarding(organizationId, websiteUrl.trim(), contractId)
      setResult(created)
      setSelected([])
      toast.success('Leitura inteligente do site iniciada.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível iniciar a leitura do site.')
    } finally { setStarting(false) }
  }

  const apply = async () => {
    if (!result || !selected.length) return toast.error('Selecione ao menos uma sugestão.')
    setApplying(true)
    try {
      const updated = await companyIntelligenceService.applyWebsiteSuggestions(organizationId, result.run.id, selected)
      setResult(updated)
      await onApplied()
      toast.success('Informações selecionadas aplicadas à empresa.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível aplicar as sugestões.')
    } finally { setApplying(false) }
  }

  return (
    <section className="space-y-4 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
      <div className="flex items-start gap-3"><span className="rounded-lg bg-violet-100 p-2 text-violet-700"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-950">Preencher com o site</h2><p className="mt-1 text-sm text-gray-600">A IA lê as páginas mais importantes, propõe dados da empresa, marca e ofertas, e mostra a fonte de cada informação antes de salvar.</p></div></div>
      <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Site da empresa" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://suaempresa.com.br" disabled={Boolean(processing)} /><Button onClick={start} disabled={starting || Boolean(processing)}>{starting || processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{processing ? 'Analisando...' : 'Analisar site'}</Button></div>
      {result && processing && <div className="space-y-2"><div className="flex justify-between text-xs text-gray-600"><span>{stageLabel(result.run.stage)}</span><span>{result.run.progress}%</span></div><Progress value={result.run.progress} className="h-2" /></div>}
      {result?.run.status === 'failed' && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">A análise não foi concluída. {result.run.errorMessage || 'Verifique o endereço e as integrações de IA.'}</p>}
      {Array.isArray(result?.run.outputPayload.pageUrls) && <details className="rounded-md border bg-white p-3 text-sm"><summary className="cursor-pointer font-medium text-gray-800">Páginas analisadas ({result.run.outputPayload.pageUrls.length})</summary><ul className="mt-2 space-y-1 text-xs text-gray-600">{result.run.outputPayload.pageUrls.map(url => <li key={String(url)} className="truncate">{String(url)}</li>)}</ul></details>}
      {grouped.map(group => <div key={group.kind} className="space-y-2"><h3 className="text-sm font-semibold text-gray-900">{groupLabel(group.kind)}</h3>{group.items.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={selected.includes(item.id)} disabled={result?.run.status === 'applied'} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900">{fieldLabel(item.fieldPath)}</strong><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">{Math.round(item.confidence * 100)}% confiança</span></span>{hasValue(item.currentValue) && <span className="mt-1 block text-xs text-gray-500">Atual: {displayValue(item.currentValue)}</span>}<span className="mt-1 block whitespace-pre-wrap text-sm text-gray-800">Sugestão: {displayValue(item.suggestedValue)}</span><span className="mt-2 block rounded bg-gray-50 p-2 text-xs text-gray-600">Evidência: “{item.evidenceExcerpt}”</span><a className="mt-1 inline-flex items-center text-xs text-violet-700 hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" />Ver página de origem</a></span></label>)}</div>)}
      {result && ['ready_for_review', 'degraded'].includes(result.run.status) && !result.suggestions.length && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">O site foi lido, mas não houve informações com evidência suficiente para preencher automaticamente.</p>}
      {result && ['ready_for_review', 'degraded'].includes(result.run.status) && result.suggestions.length > 0 && <div className="flex justify-end"><Button onClick={apply} disabled={applying || !selected.length}>{applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Aplicar selecionadas ({selected.length})</Button></div>}
      {result?.run.status === 'applied' && <p className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Informações aplicadas. O conteúdo do site também foi criado como conhecimento em revisão.</p>}
    </section>
  )
}

function displayValue(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  return JSON.stringify(value, null, 2)
}
export function hasValue(value: unknown) { return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0) && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).length > 0) }
export function shouldSelectByDefault(item: WebsiteOnboardingResult['suggestions'][number]) { return item.confidence >= (hasValue(item.currentValue) ? 0.9 : 0.75) }
function groupLabel(kind: 'profile' | 'brand' | 'product') { return ({ profile: 'Perfil da empresa', brand: 'Marca e comunicação', product: 'Produtos e serviços' })[kind] }
function stageLabel(stage: string) { return ({ queued: 'Aguardando processamento', discovering: 'Encontrando páginas importantes', extracting: 'Lendo informações', curating: 'Organizando conhecimento', embedding: 'Preparando busca inteligente' } as Record<string, string>)[stage] || 'Processando informações' }
function fieldLabel(field: string) { return ({ legalName: 'Razão social', tradeName: 'Nome da empresa', description: 'Descrição', websiteUrl: 'Site', industry: 'Segmento', positioning: 'Posicionamento', differentiators: 'Diferenciais', emails: 'E-mails', phones: 'Telefones', address: 'Endereço', businessHours: 'Horários', serviceRegions: 'Regiões atendidas', socialLinks: 'Redes sociais', toneOfVoice: 'Tom de voz', persona: 'Público/persona', brandVoiceSummary: 'Resumo da voz', vocabularyDo: 'Vocabulário recomendado', vocabularyDont: 'Vocabulário a evitar', priorityTopics: 'Temas prioritários', visualGuidelines: 'Orientações visuais', products: 'Ofertas encontradas' } as Record<string, string>)[field] || field }
