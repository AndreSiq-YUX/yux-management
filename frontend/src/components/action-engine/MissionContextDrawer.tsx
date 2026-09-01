import { BookOpen, Building2, CheckCircle2, ExternalLink, X } from 'lucide-react'
import type { MissionConversation, MissionConversationMissingContext, MissionConversationSource } from '@/types/actionEngine'

type Props = {
  conversation: MissionConversation
  open: boolean
  onClose: () => void
  correctionHref?: (missing: MissionConversationMissingContext) => string | undefined
}

export function MissionContextDrawer({ conversation, open, onClose, correctionHref }: Props) {
  if (!open) return null
  const sources = uniqueSources(conversation.messages.flatMap(message => message.sourceRefs).filter(source => source.displayMode !== 'hidden'))
  const yuxSources = sources.filter(source => source.ref.startsWith('yux:'))
  const customerSources = sources.filter(source => source.ref.startsWith('customer:'))
  const readiness = conversation.contextReadiness
  const missing = Array.isArray(readiness.missing) ? readiness.missing : []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="Contexto usado pelo agente" onMouseDown={event => { if (event.currentTarget === event.target) onClose() }}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600">Transparência</p><h2 className="mt-1 text-lg font-semibold text-slate-950">Contexto usado pelo agente</h2></div>
          <button aria-label="Fechar contexto" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button"><X className="h-4 w-4" /></button>
        </header>
        <div className="space-y-6 p-5">
          <ContextSection icon={BookOpen} title="Estratégia YUX" description="Métodos e padrões do Harness YUX usados para orientar este pedido." sources={yuxSources} empty="Nenhuma fonte metodológica foi necessária nesta resposta." />
          <ContextSection icon={Building2} title="Contexto da empresa" description="Informações da marca, oferta e operação consideradas pelo agente." sources={customerSources} empty="Ainda não há fontes suficientes do cliente para exibir." />
          {missing.length ? (
            <section>
              <h3 className="font-semibold text-slate-900">O que ainda falta</h3>
              <div className="mt-3 space-y-2">
                {missing.map(item => {
                  const href = correctionHref?.(item)
                  return <article className="rounded-lg border border-amber-200 bg-amber-50 p-3" key={item.key}><p className="text-sm font-medium text-amber-950">{item.reason}</p>{href ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline" href={href}>Corrigir informação <ExternalLink className="h-3 w-3" /></a> : null}</article>
                })}
              </div>
            </section>
          ) : <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />O contexto consultado está suficiente para esta etapa.</div>}
        </div>
      </aside>
    </div>
  )
}

function ContextSection({ icon: Icon, title, description, sources, empty }: { icon: typeof BookOpen; title: string; description: string; sources: MissionConversationSource[]; empty: string }) {
  return <section><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Icon className="h-4 w-4" /></span><div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></div><div className="mt-3 space-y-2">{sources.length ? sources.map(source => <div className="rounded-lg border border-slate-200 px-3 py-2.5" key={source.ref}><p className="text-sm font-medium text-slate-700">{source.displayMode === 'generic' ? 'Metodologia YUX' : source.title}</p><p className="mt-0.5 text-[11px] text-slate-400">Fonte verificada</p></div>) : <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">{empty}</p>}</div></section>
}

function uniqueSources(sources: MissionConversationSource[]) {
  return [...new Map(sources.map(source => [source.ref, source])).values()]
}
